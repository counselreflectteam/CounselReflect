import { LiteratureMetric } from '@shared/services/literatureMetricsService';
import { METRIC_ALIASES } from '../data/Metric_Alias';

// ============================================================================
// Types
// ============================================================================

export type MatchField = 'name' | 'alias' | 'category' | 'definition' | 'why';

export interface MatchReason {
  field: MatchField;
  matchedToken: string;
  typoCorrect: boolean;
}

export type PinStatus = 'EXACT_NAME' | 'EXACT_ALIAS' | null;

export interface SearchResult {
  metric: LiteratureMetric;
  score: number;
  pinStatus: PinStatus;
  matchReasons: MatchReason[];
  /** Total edit-distance operations across all fuzzy matches (lower = more confident). */
  totalEditDist: number;
  /** True when this result is part of the no-results fallback set. */
  isFallback: boolean;
}

export interface IndexedMetric {
  metric: LiteratureMetric;
  metricName: string;
  category: string;
  definition: string;
  whyThisMatters: string;
  aliases: string[];

  normalizedName: string;
  normalizedCategory: string;
  normalizedDefinition: string;
  normalizedWhy: string;
  normalizedAliases: string[];
  normalizedAllText: string;

  nameTokens: string[];
  aliasTokens: string[];
  categoryTokens: string[];
  definitionTokens: string[];
  whyTokens: string[];
}

export interface SearchIndex {
  metrics: IndexedMetric[];
}

export interface NormalizedQuery {
  phrase: string;
  tokens: string[];
}

// ============================================================================
// Field weight constants
// ============================================================================

const W = {
  NAME_EXACT: 20,
  NAME_FUZZY: 14,
  ALIAS_EXACT: 16,
  ALIAS_FUZZY: 12,
  CATEGORY_EXACT: 8,
  CATEGORY_FUZZY: 5,
  DEFINITION_EXACT: 4,
  DEFINITION_FUZZY: 2,
  WHY_EXACT: 3,
  WHY_FUZZY: 1,
  PHRASE_BONUS: 6,
} as const;

const FALLBACK_COUNT = 3;

// ============================================================================
// Text normalization & tokenization
// ============================================================================

function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .replace(/[-_]/g, ' ')          // hyphens/underscores → spaces
    .replace(/[^\w\s]/g, ' ')       // strip remaining punctuation
    .replace(/\s+/g, ' ')           // collapse whitespace
    .trim();
}

function tokenize(s: string): string[] {
  if (s.length === 0) return [];
  return s.split(' ');
}

function normalizeQuery(raw: string): NormalizedQuery {
  const phrase = normalizeText(raw);
  const tokens = tokenize(phrase);
  return { phrase, tokens };
}

// ============================================================================
// Edit-distance helpers
// ============================================================================

function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }
  return dp[m][n];
}

function maxEditDistance(len: number): number {
  if (len <= 3) return 0;
  if (len <= 6) return 1;
  if (len <= 10) return 2;
  return 3;
}

interface TokenMatchResult {
  match: boolean;
  editDist: number;
}

function fuzzyTokenMatch(queryToken: string, targetToken: string): TokenMatchResult {
  if (queryToken === targetToken) return { match: true, editDist: 0 };
  // Forward prefix only (typeahead). The reverse direction (query starts with
  // target) is intentionally NOT a match: short stopword tokens in definitions
  // ('the', 'of', 'an', ...) would otherwise absorb arbitrary queries and flood
  // results. Legitimate near-misses (e.g. 'reflections' vs 'reflection') are
  // handled by the Levenshtein branch below at fuzzy weight.
  if (targetToken.startsWith(queryToken)) {
    return { match: true, editDist: 0 };
  }

  const limit = maxEditDistance(queryToken.length);
  if (limit === 0) return { match: false, editDist: Infinity };

  const dist = levenshteinDistance(queryToken, targetToken);
  if (dist <= limit) return { match: true, editDist: dist };

  return { match: false, editDist: Infinity };
}

// ============================================================================
// Step 1: Build search index (precompute once)
// ============================================================================

export function buildSearchIndex(metrics: LiteratureMetric[]): SearchIndex {
  const indexed: IndexedMetric[] = metrics.map((metric) => {
    const metricName = metric.metricName ?? '';
    const category = metric.category ?? '';
    const definition = metric.definition ?? '';
    const whyThisMatters = metric.whyThisMatters ?? '';
    const aliases = METRIC_ALIASES[metricName] ?? [];

    const normalizedName = normalizeText(metricName);
    const normalizedCategory = normalizeText(category);
    const normalizedDefinition = normalizeText(definition);
    const normalizedWhy = normalizeText(whyThisMatters);
    const normalizedAliases = aliases.map(normalizeText);

    const normalizedAllText = [
      normalizedName,
      ...normalizedAliases,
      normalizedCategory,
      normalizedDefinition,
      normalizedWhy,
    ].join(' ');

    return {
      metric,
      metricName,
      category,
      definition,
      whyThisMatters,
      aliases,

      normalizedName,
      normalizedCategory,
      normalizedDefinition,
      normalizedWhy,
      normalizedAliases,
      normalizedAllText,

      nameTokens: tokenize(normalizedName),
      aliasTokens: normalizedAliases.flatMap(tokenize),
      categoryTokens: tokenize(normalizedCategory),
      definitionTokens: tokenize(normalizedDefinition),
      whyTokens: tokenize(normalizedWhy),
    };
  });

  return { metrics: indexed };
}

// ============================================================================
// Step 3: Score a single metric against a query
// ============================================================================

/** Best fuzzy match of queryToken against a set of target tokens. */
function bestTokenMatch(queryToken: string, targetTokens: string[]): TokenMatchResult {
  let best: TokenMatchResult = { match: false, editDist: Infinity };
  for (const tt of targetTokens) {
    const res = fuzzyTokenMatch(queryToken, tt);
    if (res.match && res.editDist < best.editDist) {
      best = res;
      if (best.editDist === 0) break;
    }
  }
  return best;
}

interface ScoreResult {
  score: number;
  pinStatus: PinStatus;
  reasons: MatchReason[];
  totalEditDist: number;
}

/**
 * Structural subset of IndexedMetric consumed by the scorer, so the SAME
 * normalize/score internals and weights power both the literature index and
 * the source-agnostic doc index below. IndexedMetric satisfies this shape —
 * literature scoring behavior is unchanged.
 */
interface ScorableFields {
  normalizedName: string;
  normalizedAliases: string[];
  normalizedDefinition: string;
  normalizedWhy: string;
  nameTokens: string[];
  aliasTokens: string[];
  categoryTokens: string[];
  definitionTokens: string[];
  whyTokens: string[];
}

function scoreMetric(indexed: ScorableFields, query: NormalizedQuery): ScoreResult {
  const reasons: MatchReason[] = [];
  let score = 0;
  let totalEditDist = 0;

  // --- Pin detection (phrase-level, takes priority) ---
  let pinStatus: PinStatus = null;

  if (query.phrase.length > 0) {
    if (indexed.normalizedName.includes(query.phrase)) {
      pinStatus = 'EXACT_NAME';
    } else {
      for (const na of indexed.normalizedAliases) {
        if (na.includes(query.phrase)) {
          pinStatus = 'EXACT_ALIAS';
          break;
        }
      }
    }
  }

  // --- Phrase bonus: entire query phrase in definition or why ---
  if (query.phrase.length > 0 && query.tokens.length > 1) {
    if (indexed.normalizedDefinition.includes(query.phrase) ||
        indexed.normalizedWhy.includes(query.phrase)) {
      score += W.PHRASE_BONUS;
    }
  }

  // --- Per-token field scoring ---
  type FieldEntry = { field: MatchField; tokens: string[]; exactW: number; fuzzyW: number };
  const fields: FieldEntry[] = [
    { field: 'name',       tokens: indexed.nameTokens,       exactW: W.NAME_EXACT,       fuzzyW: W.NAME_FUZZY },
    { field: 'alias',      tokens: indexed.aliasTokens,      exactW: W.ALIAS_EXACT,      fuzzyW: W.ALIAS_FUZZY },
    { field: 'category',   tokens: indexed.categoryTokens,   exactW: W.CATEGORY_EXACT,   fuzzyW: W.CATEGORY_FUZZY },
    { field: 'definition', tokens: indexed.definitionTokens,  exactW: W.DEFINITION_EXACT, fuzzyW: W.DEFINITION_FUZZY },
    { field: 'why',        tokens: indexed.whyTokens,        exactW: W.WHY_EXACT,        fuzzyW: W.WHY_FUZZY },
  ];

  for (const qt of query.tokens) {
    for (const { field, tokens, exactW, fuzzyW } of fields) {
      const result = bestTokenMatch(qt, tokens);
      if (!result.match) continue;

      const isExact = result.editDist === 0;
      score += isExact ? exactW : fuzzyW;
      totalEditDist += result.editDist;

      reasons.push({
        field,
        matchedToken: qt,
        typoCorrect: result.editDist > 0,
      });
      break; // each query token only matches the highest-priority field
    }
  }

  return { score, pinStatus, reasons, totalEditDist };
}

// ============================================================================
// Step 4: Ranking comparator
// ============================================================================

const PIN_ORDER: Record<string, number> = {
  EXACT_NAME: 0,
  EXACT_ALIAS: 1,
};

function compareResults(a: SearchResult, b: SearchResult): number {
  const aPinned = a.pinStatus !== null;
  const bPinned = b.pinStatus !== null;

  // Pinned before non-pinned
  if (aPinned !== bPinned) return aPinned ? -1 : 1;

  // Within pinned: EXACT_NAME before EXACT_ALIAS
  if (aPinned && bPinned) {
    const aOrd = PIN_ORDER[a.pinStatus!];
    const bOrd = PIN_ORDER[b.pinStatus!];
    if (aOrd !== bOrd) return aOrd - bOrd;
  }

  // Higher score first
  if (a.score !== b.score) return b.score - a.score;

  // Fewer edit-distance operations first (more confident match)
  if (a.totalEditDist !== b.totalEditDist) return a.totalEditDist - b.totalEditDist;

  // Alphabetical name tie-break
  return a.metric.metricName.localeCompare(b.metric.metricName);
}

// ============================================================================
// Main search entry point
// ============================================================================

export function searchAndFilterMetrics(
  index: SearchIndex,
  searchQuery: string,
  selectedCategories: Set<string>
): SearchResult[] {
  const query = normalizeQuery(searchQuery);

  // When the query yields no tokens (empty, whitespace, or punctuation-only
  // input that normalization strips entirely), return all metrics (unscored)
  // respecting the category filter — never the 'closest matches' fallback.
  if (query.tokens.length === 0) {
    let results = index.metrics.map((im): SearchResult => ({
      metric: im.metric,
      score: 0,
      pinStatus: null,
      matchReasons: [],
      totalEditDist: 0,
      isFallback: false,
    }));

    if (selectedCategories.size > 0) {
      results = results.filter(r =>
        selectedCategories.has(r.metric.category || 'Other')
      );
    }
    return results;
  }

  // Score every indexed metric
  const scored: SearchResult[] = index.metrics.map((im) => {
    const { score, pinStatus, reasons, totalEditDist } = scoreMetric(im, query);
    return {
      metric: im.metric,
      score,
      pinStatus,
      matchReasons: reasons,
      totalEditDist,
      isFallback: false,
    };
  });

  // Apply category filter
  let filtered = scored;
  if (selectedCategories.size > 0) {
    filtered = filtered.filter(r =>
      selectedCategories.has(r.metric.category || 'Other')
    );
  }

  // Separate passing results from zeroes
  const passing = filtered.filter(r => r.score > 0);

  if (passing.length > 0) {
    passing.sort(compareResults);
    return passing;
  }

  // No-results fallback: return top-3 closest (by score desc) with isFallback flag
  const fallback = [...filtered]
    .sort((a, b) => b.score - a.score || a.metric.metricName.localeCompare(b.metric.metricName))
    .slice(0, FALLBACK_COUNT)
    .map(r => ({ ...r, isFallback: true }));

  return fallback;
}

// ============================================================================
// Source-agnostic document search (Guided Library spec §5.1)
//
// A generalized SearchDoc API over the SAME normalize/score/compare internals
// and weights as the literature search above, so any metric source (e.g. the
// predefined/model-scored tab) gets identical alias-aware, typo-tolerant
// ranking. Existing literature exports and behavior are unchanged.
// ============================================================================

export interface SearchDoc {
  id: string;
  name: string;
  category: string;
  definition: string;
  why: string;
  aliases: string[];
}

export interface DocSearchResult {
  id: string;
  score: number;
  pinStatus: PinStatus;
  matchReasons: MatchReason[];
  /** Total edit-distance operations across all fuzzy matches (lower = more confident). */
  totalEditDist: number;
  /** True when this result is part of the no-results fallback set. */
  isFallback: boolean;
}

interface IndexedDoc extends ScorableFields {
  id: string;
  name: string;
}

/** Opaque index type — build once per doc set via buildDocIndex. */
export interface DocSearchIndex {
  docs: IndexedDoc[];
}

export function buildDocIndex(docs: SearchDoc[]): DocSearchIndex {
  const indexed: IndexedDoc[] = docs.map((doc) => {
    const normalizedName = normalizeText(doc.name ?? '');
    const normalizedCategory = normalizeText(doc.category ?? '');
    const normalizedDefinition = normalizeText(doc.definition ?? '');
    const normalizedWhy = normalizeText(doc.why ?? '');
    const normalizedAliases = (doc.aliases ?? []).map(normalizeText);

    return {
      id: doc.id,
      name: doc.name ?? '',

      normalizedName,
      normalizedAliases,
      normalizedDefinition,
      normalizedWhy,

      nameTokens: tokenize(normalizedName),
      aliasTokens: normalizedAliases.flatMap(tokenize),
      categoryTokens: tokenize(normalizedCategory),
      definitionTokens: tokenize(normalizedDefinition),
      whyTokens: tokenize(normalizedWhy),
    };
  });

  return { docs: indexed };
}

interface ScoredDoc {
  name: string;
  result: DocSearchResult;
}

// Same ranking rules as compareResults: pinned first (EXACT_NAME before
// EXACT_ALIAS), then score desc, then edit distance asc, then name A→Z.
function compareDocResults(a: ScoredDoc, b: ScoredDoc): number {
  const aPinned = a.result.pinStatus !== null;
  const bPinned = b.result.pinStatus !== null;

  if (aPinned !== bPinned) return aPinned ? -1 : 1;

  if (aPinned && bPinned) {
    const aOrd = PIN_ORDER[a.result.pinStatus!];
    const bOrd = PIN_ORDER[b.result.pinStatus!];
    if (aOrd !== bOrd) return aOrd - bOrd;
  }

  if (a.result.score !== b.result.score) return b.result.score - a.result.score;

  if (a.result.totalEditDist !== b.result.totalEditDist) {
    return a.result.totalEditDist - b.result.totalEditDist;
  }

  return a.name.localeCompare(b.name);
}

/**
 * - Query with no tokens after normalization (empty, whitespace, or
 *   punctuation-only) → all docs in input order, score 0, isFallback false.
 * - No positive scores → top-3 closest with isFallback true (same fallback
 *   rule as the literature search).
 */
export function searchDocs(index: DocSearchIndex, query: string): DocSearchResult[] {
  const normalizedQuery = normalizeQuery(query);

  if (normalizedQuery.tokens.length === 0) {
    return index.docs.map((doc): DocSearchResult => ({
      id: doc.id,
      score: 0,
      pinStatus: null,
      matchReasons: [],
      totalEditDist: 0,
      isFallback: false,
    }));
  }

  const scored: ScoredDoc[] = index.docs.map((doc) => {
    const { score, pinStatus, reasons, totalEditDist } = scoreMetric(doc, normalizedQuery);
    return {
      name: doc.name,
      result: {
        id: doc.id,
        score,
        pinStatus,
        matchReasons: reasons,
        totalEditDist,
        isFallback: false,
      },
    };
  });

  const passing = scored.filter((entry) => entry.result.score > 0);

  if (passing.length > 0) {
    passing.sort(compareDocResults);
    return passing.map((entry) => entry.result);
  }

  // No-results fallback: top-3 closest (by score desc, then name) flagged isFallback.
  return [...scored]
    .sort((a, b) => b.result.score - a.result.score || a.name.localeCompare(b.name))
    .slice(0, FALLBACK_COUNT)
    .map((entry) => ({ ...entry.result, isFallback: true }));
}
