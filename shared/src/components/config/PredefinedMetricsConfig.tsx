import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock,
  ExternalLink,
  Loader2,
  RefreshCw,
  Search,
  X
} from 'lucide-react';
import { MetricReference, PredefinedMetric } from '../../types';
import {
  getPretrainedMetricsCached,
  clearMetricInventoryCache
} from '../../services/metricInventory';
import { buildDocIndex, searchDocs, DocSearchResult, SearchDoc } from '../../utils/searchUtils';
import { PREDEFINED_METRIC_ALIASES } from '../../data/Metric_Alias';
import { PREDEFINED_METRIC_GLOSSES } from '../../data/metricGlosses';
import { MetricListRow } from './MetricListRow';
import { MetricPrimer } from './MetricPrimer';
import { ModelOutputPreview } from './ModelOutputPreview';
import { useMetrics } from '../../context/MetricsContext';
import { useAuth } from '../../context/AuthContext';

interface CategoryGroup {
  category: string;
  metrics: PredefinedMetric[];
}

const LLM_REQUIRED_METRICS = new Set(['fact_score', 'medscore']);
const SERVER_CONFIGURED_METRICS = new Set(['perspective']);

const normalizeReference = (reference?: MetricReference | string): MetricReference | null => {
  if (!reference) return null;
  if (typeof reference === 'string') {
    return {
      shortApa: reference,
      citation: reference
    };
  }
  return reference;
};

const getShortCitation = (reference: MetricReference | null): string => {
  if (!reference) return 'Not provided yet.';
  return reference.shortApa || reference.citation || reference.title || 'Not provided yet.';
};

const isMetricUnavailable = (metric: PredefinedMetric) => metric.serverAvailable === false;

interface MetricReadiness {
  label: string;
  title: string;
  explanation: string;
  owner: string;
  nextStep: string;
  technicalRequirement?: string;
}

// Readiness renders only when something blocks the metric; steady states stay silent.
const getMetricReadiness = (
  metric: PredefinedMetric,
  hasHfKey: boolean,
  hasProviderKey: boolean
): MetricReadiness | null => {
  if (metric.serverAvailable === false) {
    if (metric.name === 'perspective') {
      return {
        label: 'Perspective server key missing',
        title: 'Perspective API is not configured on the analysis server',
        explanation: 'The evaluator code is present, but the server does not have the credential required to call Perspective API. This is a workspace deployment issue, not a problem with your transcript or browser settings.',
        owner: 'You for a local installation; the workspace administrator for a hosted deployment',
        nextStep: 'Local: set PERSPECTIVE_API_KEY in the analysis-server environment and restart the server. Hosted: ask the workspace administrator to configure the server credential.',
        technicalRequirement: metric.availabilityNote || 'Requires PERSPECTIVE_API_KEY on the backend.'
      };
    }

    if (metric.name === 'medscore') {
      return {
        label: 'MedRAG corpus missing',
        title: 'The medical reference corpus is not configured',
        explanation: 'The MedScore evaluator code is present, but its textbook corpus is not available at the location configured on the analysis server. This is a workspace deployment issue, not a problem with your transcript.',
        owner: 'You for a local installation; the workspace administrator for a hosted deployment',
        nextStep: 'Local: set MEDRAG_CORPUS to a populated corpus directory and restart the analysis server. Hosted: ask the workspace administrator to configure the corpus.',
        technicalRequirement: metric.availabilityNote || 'Requires a MedRAG corpus on the backend.'
      };
    }

    return {
      label: 'Server setup required',
      title: 'A server-side requirement is not configured',
      explanation: 'The analysis server reports that this metric is unavailable. This is a workspace deployment issue, not a problem with your transcript or browser settings.',
      owner: 'You for a local installation; the workspace administrator for a hosted deployment',
      nextStep: 'Local: configure the technical requirement below and restart the analysis server. Hosted: ask the workspace administrator to configure it.',
      technicalRequirement: metric.availabilityNote || undefined
    };
  }

  if (metric.requiresHf && !hasHfKey) {
    return {
      label: 'Hugging Face key required',
      title: 'This metric needs a Hugging Face credential',
      explanation: 'The metric uses a hosted Hugging Face model endpoint. Its implementation is available, but the request cannot be authorized without a valid Hugging Face API key.',
      owner: 'You or your workspace administrator',
      nextStep: 'Add a valid Hugging Face API key under Add transcript → Analysis provider, then return to this metric.'
    };
  }

  if (LLM_REQUIRED_METRICS.has(metric.name) && !hasProviderKey) {
    return {
      label: 'Analysis provider key required',
      title: 'This metric needs the selected analysis provider',
      explanation: 'Part of this evaluation is performed by the language model selected in Setup. The metric cannot run until that provider has a valid credential.',
      owner: 'You or your workspace administrator',
      nextStep: 'Add or verify the selected provider credential under Add transcript → Analysis provider.'
    };
  }

  if (metric.name === 'medscore' && metric.serverAvailable !== true) {
    return {
      label: 'MedRAG corpus status unavailable',
      title: 'The analysis server did not confirm the medical corpus',
      explanation: 'CounselReflect could not confirm that the reference corpus required by MedScore is ready on the analysis server.',
      owner: 'You for a local installation; the workspace administrator for a hosted deployment',
      nextStep: 'Local: verify MEDRAG_CORPUS and restart the analysis server. Hosted: ask the workspace administrator to verify the corpus configuration.',
      technicalRequirement: metric.availabilityNote || undefined
    };
  }

  if (SERVER_CONFIGURED_METRICS.has(metric.name) && metric.serverAvailable !== true) {
    return {
      label: 'Server setup status unavailable',
      title: 'The analysis server did not confirm this metric is ready',
      explanation: 'CounselReflect could not verify the server-side configuration required by this metric.',
      owner: 'You for a local installation; the workspace administrator for a hosted deployment',
      nextStep: 'Local: verify the metric configuration and restart the analysis server. Hosted: ask the workspace administrator to verify it.',
      technicalRequirement: metric.availabilityNote || undefined
    };
  }

  return null;
};

const ModelMetricDetails: React.FC<{
  metric: PredefinedMetric;
  readiness: MetricReadiness | null;
}> = ({ metric, readiness }) => {
  const reference = normalizeReference(metric.reference);

  return (
    <div className="space-y-5">
      <MetricPrimer metric={metric} />

      {readiness && (
        <section
          aria-label="Metric availability"
          className="border-l-[3px] border-amber-400 bg-[#FFF9E8] px-4 py-3.5 dark:border-amber-500 dark:bg-amber-500/10"
        >
          <div className="flex items-start gap-3">
            <CircleHelp className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" aria-hidden />
            <div className="min-w-0">
              <p className="text-sm font-bold text-[var(--cr-ink)]">{readiness.title}</p>
              <p className="mt-1 text-sm leading-6 text-[var(--cr-ink-2)]">{readiness.explanation}</p>
              <dl className="mt-3 grid gap-2 text-xs leading-5 sm:grid-cols-[150px_minmax(0,1fr)]">
                <dt className="font-semibold text-[var(--cr-ink)]">Who can resolve this</dt>
                <dd className="text-[var(--cr-ink-2)]">{readiness.owner}</dd>
                <dt className="font-semibold text-[var(--cr-ink)]">Next step</dt>
                <dd className="text-[var(--cr-ink-2)]">{readiness.nextStep}</dd>
              </dl>
              {readiness.technicalRequirement && (
                <details className="mt-3 border-t border-amber-300/70 pt-2 dark:border-amber-600/40">
                  <summary className="cr-focus cursor-pointer text-xs font-semibold text-amber-800 dark:text-amber-300">
                    Technical requirement
                  </summary>
                  <p className="mt-2 break-words font-mono text-xs leading-5 text-[var(--cr-ink-2)]">
                    {readiness.technicalRequirement}
                  </p>
                </details>
              )}
            </div>
          </div>
        </section>
      )}

      <section>
        <p className="cr-meta font-semibold">Technical definition</p>
        <p className="mt-1.5 max-w-3xl text-sm leading-6 text-[var(--cr-ink)]">{metric.description}</p>
      </section>

      <ModelOutputPreview metric={metric} />

      <section className="grid gap-4 border-t border-[var(--cr-card-border)] pt-4 sm:grid-cols-[150px_minmax(0,1fr)]">
        <p className="cr-meta font-semibold">{reference?.modelName ? 'Sources' : 'Source'}</p>
        <div className="min-w-0">
          {reference?.modelName && <p className="cr-meta mb-1 font-semibold">Research source</p>}
          <p className="text-sm font-semibold text-[var(--cr-ink)]">{getShortCitation(reference)}</p>
          {reference?.title && <p className="mt-1 text-sm leading-6 text-[var(--cr-ink-2)]">{reference.title}</p>}
          {reference?.url && (
            <a href={reference.url} target="_blank" rel="noopener noreferrer" className="cr-link cr-focus mt-2 inline-flex max-w-full items-center gap-1.5 text-sm">
              <span className="truncate">{reference.modelName ? 'Open research paper' : 'Open source'}</span>
              <ExternalLink className="h-4 w-4 shrink-0" />
            </a>
          )}
          {reference?.modelName && (
            <div className="mt-4 border-t border-[var(--cr-card-border)] pt-3">
              <p className="cr-meta font-semibold">Deployed model</p>
              <p className="mt-1 break-all text-sm font-semibold text-[var(--cr-ink)]">{reference.modelName}</p>
              {reference.modelUrl && (
                <a href={reference.modelUrl} target="_blank" rel="noopener noreferrer" className="cr-link cr-focus mt-2 inline-flex max-w-full items-center gap-1.5 text-sm">
                  <span>Open model card</span>
                  <ExternalLink className="h-4 w-4 shrink-0" />
                </a>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

export const PredefinedMetricsConfig: React.FC = () => {
  const { selectedPredefinedMetrics, togglePredefinedMetric } = useMetrics();
  const {
    apiKeys,
    selectedProvider,
    hasValidatedApiKey,
    hfValidationStatus,
    serverKeyStatus
  } = useAuth();

  const [predefinedMetrics, setPredefinedMetrics] = useState<PredefinedMetric[]>([]);
  const [categories, setCategories] = useState<Record<string, string[]>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedMetricName, setExpandedMetricName] = useState<string | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadMetrics();
  }, []);

  const loadMetrics = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getPretrainedMetricsCached();
      setPredefinedMetrics(data.metrics);
      setCategories(data.by_category);
    } catch (err) {
      setError('Failed to load metrics. Please check if the backend is running.');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const retryLoadMetrics = () => {
    // Only this picker's slot — the literature slot may be healthy/in flight.
    clearMetricInventoryCache('predefined');
    loadMetrics();
  };

  const metricsByName = useMemo(() => {
    return new Map(predefinedMetrics.map((metric) => [metric.name, metric]));
  }, [predefinedMetrics]);

  const categoryGroups = useMemo<CategoryGroup[]>(() => {
    const groups = Object.entries(categories)
      .map(([category, ids]) => ({
        category,
        metrics: ids
          .map((id) => metricsByName.get(id))
          .filter((metric): metric is PredefinedMetric => Boolean(metric))
          .sort((a, b) => (a.label || a.name).localeCompare(b.label || b.name))
      }))
      .filter((group) => group.metrics.length > 0)
      .sort((a, b) => a.category.localeCompare(b.category));

    if (groups.length > 0) return groups;

    const fallbackGroups = new Map<string, PredefinedMetric[]>();
    predefinedMetrics.forEach((metric) => {
      const category = metric.category || 'Other';
      fallbackGroups.set(category, [...(fallbackGroups.get(category) || []), metric]);
    });

    return Array.from(fallbackGroups.entries())
      .map(([category, metrics]) => ({
        category,
        metrics: [...metrics].sort((a, b) => (a.label || a.name).localeCompare(b.label || b.name))
      }))
      .sort((a, b) => a.category.localeCompare(b.category));
  }, [categories, metricsByName, predefinedMetrics]);

  const selectedNames = useMemo(
    () => new Set(selectedPredefinedMetrics.map((metric) => metric.name)),
    [selectedPredefinedMetrics]
  );

  const hasHfKey = Boolean(
    serverKeyStatus.hf ||
    (apiKeys.hf?.trim() && hfValidationStatus === 'valid')
  );
  const hasProviderKey = Boolean(
    serverKeyStatus[selectedProvider] ||
    (apiKeys[selectedProvider]?.trim() && hasValidatedApiKey)
  );
  const selectedHfCount = selectedPredefinedMetrics.filter((metric) => metric.requiresHf).length;

  // Alias-aware, typo-tolerant search over the predefined inventory (shared engine).
  const searchIndex = useMemo(() => {
    const docs: SearchDoc[] = predefinedMetrics.map((metric) => ({
      id: metric.name,
      name: metric.label,
      category: metric.category || 'Other',
      definition: metric.description,
      why: '',
      aliases: PREDEFINED_METRIC_ALIASES[metric.name] ?? []
    }));
    return buildDocIndex(docs);
  }, [predefinedMetrics]);

  const trimmedQuery = searchQuery.trim();
  const isSearching = trimmedQuery.length > 0;

  const searchRows = useMemo(() => {
    if (!isSearching) return [];
    return searchDocs(searchIndex, searchQuery)
      .map((result) => {
        const metric = metricsByName.get(result.id);
        return metric ? { metric, result } : null;
      })
      .filter((row): row is { metric: PredefinedMetric; result: DocSearchResult } => row !== null);
  }, [isSearching, metricsByName, searchIndex, searchQuery]);

  const allFallback = searchRows.length > 0 && searchRows.every(({ result }) => result.isFallback);

  // Screen-reader feedback for search: same string as the visible meta line,
  // debounced so polite announcements settle once per pause in typing.
  const resultsStatus = isSearching
    ? allFallback
      ? 'No exact matches — showing closest'
      : `${searchRows.length} result${searchRows.length === 1 ? '' : 's'}`
    : '';
  const [announcedStatus, setAnnouncedStatus] = useState('');
  useEffect(() => {
    if (resultsStatus === '') {
      setAnnouncedStatus('');
      return;
    }
    const timer = window.setTimeout(() => setAnnouncedStatus(resultsStatus), 350);
    return () => window.clearTimeout(timer);
  }, [resultsStatus]);

  // Match transparency: surface why an alias hit pinned/ranked a row.
  const getMatchNote = (result: DocSearchResult): string | undefined => {
    const aliasReason = result.matchReasons.find((reason) => reason.field === 'alias');
    if (result.pinStatus === 'EXACT_ALIAS') {
      return `matches "${aliasReason?.matchedToken ?? trimmedQuery}"`;
    }
    if (result.matchReasons[0]?.field === 'alias') {
      return `matches "${result.matchReasons[0].matchedToken}"`;
    }
    return undefined;
  };

  // Group button toggles: "Select all" flips to "Deselect all" once the whole
  // group is selected. Bulk clearing beyond the group lives in the review tray.
  const toggleAllInCategory = (metrics: PredefinedMetric[]) => {
    const selectableMetrics = metrics.filter((metric) => !isMetricUnavailable(metric));
    const allSelected =
      selectableMetrics.length > 0 && selectableMetrics.every((metric) => selectedNames.has(metric.name));
    selectableMetrics
      .filter((metric) => selectedNames.has(metric.name) === allSelected)
      .forEach((metric) => togglePredefinedMetric(metric));
  };

  const toggleCategoryExpanded = (category: string) => {
    setExpandedCategories((previous) => {
      const next = new Set(previous);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  };

  const blockerMessage = !hasProviderKey && selectedHfCount > 0 && !hasHfKey
    ? 'Verify an analysis-provider credential and a Hugging Face credential in Setup to run the selected metrics.'
    : !hasProviderKey
      ? 'Verify the selected analysis-provider credential in Setup to run evaluations.'
      : selectedHfCount > 0 && !hasHfKey
        ? 'Verify a Hugging Face credential in Setup to run the selected HF metrics.'
        : null;

  const renderMetricRow = (metric: PredefinedMetric, result?: DocSearchResult) => {
    const readiness = getMetricReadiness(metric, hasHfKey, hasProviderKey);
    return (
      <MetricListRow
        key={metric.name}
        name={metric.label}
        gloss={PREDEFINED_METRIC_GLOSSES[metric.name] ?? metric.description}
        selected={selectedNames.has(metric.name)}
        onToggle={() => togglePredefinedMetric(metric)}
        target={metric.target || 'therapist'}
        highlightTarget
        requiresHf={metric.requiresHf}
        unavailable={isMetricUnavailable(metric)}
        readinessLabel={readiness?.label}
        matchNote={result ? getMatchNote(result) : undefined}
        metaSuffix={
          (result || metric.name === 'medscore') ? (
            <>
              {result && <span className="cr-meta mt-0.5 block">{metric.category || 'Other'}</span>}
              {metric.name === 'medscore' && (
                <span className="mt-1 flex w-fit items-center gap-1.5 text-xs font-semibold text-[#176BFF] dark:text-[#78A8F8]">
                  <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span>Takes longer to run</span>
                </span>
              )}
            </>
          ) : undefined
        }
        detailsExpanded={expandedMetricName === metric.name}
        onOpenDetails={() => setExpandedMetricName((current) => current === metric.name ? null : metric.name)}
        detailsContent={<ModelMetricDetails metric={metric} readiness={readiness} />}
      />
    );
  };

  if (isLoading) {
    return (
      <div className="flex h-64 flex-col items-center justify-center">
        <Loader2 className="mb-3 h-5 w-5 animate-spin text-brand-600 dark:text-brand-400" aria-hidden />
        <p className="text-sm text-[var(--cr-ink-2)]">Loading metrics…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-64 flex-col items-center justify-center text-center">
        <AlertCircle className="mb-3 h-5 w-5 text-rose-600 dark:text-rose-400" aria-hidden />
        <p className="mb-4 text-sm text-[var(--cr-ink-2)]">{error}</p>
        <button
          onClick={retryLoadMetrics}
          className="cr-btn cr-btn-secondary cr-focus h-9 px-4"
        >
          <RefreshCw className="h-4 w-4" />
          <span>Retry</span>
        </button>
      </div>
    );
  }

  return (
    <div className="cr-enter space-y-4">
      {blockerMessage && (
        <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>{blockerMessage}</span>
        </p>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--cr-ink-3)]" aria-hidden />
        <input
          type="text"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          aria-label="Search metrics"
          placeholder="Search by metric name, construct, or definition"
          className="cr-well cr-focus h-10 w-full pl-9 pr-9 text-[0.9375rem] text-[var(--cr-ink)] placeholder:text-[var(--cr-ink-3)] focus:outline-none"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="cr-focus absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-[var(--cr-ink-3)] transition-colors hover:text-[var(--cr-ink)]"
            aria-label="Clear search"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Persistently mounted polite live region so AT announces result counts
          as the user types; the visible meta copy below is aria-hidden. */}
      <p role="status" className="sr-only">
        {announcedStatus}
      </p>

      {isSearching ? (
        <div className="space-y-3">
          {/* aria-hidden: the sr-only role="status" region above owns this text for AT. */}
          <p className="cr-meta" aria-hidden="true">
            {resultsStatus}
          </p>

          {searchRows.length === 0 ? (
            <div className="py-12 text-center">
              <Search className="mx-auto mb-3 h-5 w-5 text-[var(--cr-ink-3)]" aria-hidden />
              <p className="text-sm font-semibold text-[var(--cr-ink)]">No matching metrics</p>
              <p className="mt-1 text-sm text-[var(--cr-ink-2)]">
                Search by another name, construct, or definition.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[var(--cr-card-border)] [.cr-module_&]:divide-[var(--cr-rule-on-muted)]">
              {searchRows.map(({ metric, result }) => renderMetricRow(metric, result))}
            </div>
          )}
        </div>
      ) : (
        <div className="border-b border-[var(--cr-card-border)]">
          {categoryGroups.map((group) => {
            const selectedCount = group.metrics.filter((metric) => selectedNames.has(metric.name)).length;
            const selectableGroupMetrics = group.metrics.filter((metric) => !isMetricUnavailable(metric));
            const isExpanded = expandedCategories.has(group.category);
            const allSelected =
              selectableGroupMetrics.length > 0 &&
              selectableGroupMetrics.every((metric) => selectedNames.has(metric.name));

            return (
              <section key={group.category}>
                <div className="flex items-center gap-3 border-t border-[var(--cr-card-border)] py-3">
                  <button
                    type="button"
                    onClick={() => toggleCategoryExpanded(group.category)}
                    aria-expanded={isExpanded}
                    className="cr-focus flex min-w-0 flex-1 items-start gap-3 text-left"
                  >
                    {isExpanded ? (
                      <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-[var(--cr-brand-primary)]" aria-hidden />
                    ) : (
                      <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-[var(--cr-ink-3)]" aria-hidden />
                    )}
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-[var(--cr-ink)]">{group.category}</span>
                      <span className="mt-0.5 block text-xs text-[var(--cr-ink-2)]">
                        {group.metrics.length} metric{group.metrics.length === 1 ? '' : 's'} · {selectedCount} selected
                      </span>
                    </span>
                  </button>
                  {isExpanded && (
                    <button
                      type="button"
                      onClick={() => toggleAllInCategory(group.metrics)}
                      disabled={selectableGroupMetrics.length === 0}
                      className="cr-btn cr-btn-ghost cr-focus h-8 shrink-0 px-3 text-xs"
                    >
                      {allSelected ? 'Deselect all' : 'Select all'}
                    </button>
                  )}
                </div>

                {isExpanded && (
                  <div className="divide-y divide-[var(--cr-card-border)] border-t border-[var(--cr-card-border)] pl-7 [.cr-module_&]:divide-[var(--cr-rule-on-muted)]">
                    {group.metrics.map((metric) => renderMetricRow(metric))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
};
