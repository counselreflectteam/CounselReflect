import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Loader2,
  Search,
  X
} from 'lucide-react';
import { LiteratureMetric } from '../../services/literatureMetricsService';
import {
  getLiteratureMetricsCached,
  clearMetricInventoryCache
} from '../../services/metricInventory';
import { useMetrics } from '../../context/MetricsContext';
import { buildSearchIndex, searchAndFilterMetrics, SearchResult } from '../../utils/searchUtils';
import { MetricListRow } from './MetricListRow';
import { useAuth } from '../../context/AuthContext';
import {
  getRubricCategoryDescription,
  getRubricCategoryNote
} from '../../data/rubricCategoryDescriptions';
import { getTargetMarkerTone, MarkerHighlight } from '../design/MarkerHighlight';
import { RubricCategoryDoodle } from './RubricCategoryDoodle';

interface LiteratureGroup {
  category: string;
  metrics: LiteratureMetric[];
}

interface LiteratureBenchmarksConfigProps {
  density?: 'comfortable' | 'compact';
}

// Category chips were removed with the filter deck; the search engine's
// signature keeps the category filter argument, so pass an always-empty set.
const NO_CATEGORY_FILTER = new Set<string>();

const TARGET_LABELS = {
  therapist: 'Chatbot turns',
  patient: 'Client turns',
  both: 'All turns'
} as const;

const getSourceHost = (reference: string) => {
  try {
    return new URL(reference).hostname.replace(/^www\./, '');
  } catch {
    return 'External source';
  }
};

const RubricMetricDetails: React.FC<{
  metric: LiteratureMetric;
  showTarget: boolean;
  compact: boolean;
}> = ({ metric, showTarget, compact }) => {
  const [showAllSources, setShowAllSources] = useState(false);
  const anchors = [
    ['Level 1', metric.level1Description],
    ['Level 3', metric.level3Description],
    ['Level 5', metric.level5Description]
  ].filter((entry): entry is [string, string] => Boolean(entry[1]));
  const target = metric.target || 'therapist';
  const metadataRows = [
    ...(showTarget ? [['Applies to', TARGET_LABELS[target]]] : []),
    ...(anchors.length === 0 ? [['Output', 'Rubric-defined rating']] : [])
  ];

  const visibleReferences = compact && !showAllSources
    ? metric.references.slice(0, 2)
    : metric.references;
  const hiddenSourceCount = metric.references.length - visibleReferences.length;

  const sourceList = (
    <div>
      <ol className="divide-y divide-[var(--cr-card-border)]">
      {visibleReferences.map((reference, index) => (
        <li key={reference} className="grid grid-cols-[24px_minmax(0,1fr)] gap-2 py-2 first:pt-0">
          <span className="cr-meta">{index + 1}</span>
          <a href={reference} target="_blank" rel="noopener noreferrer" className="cr-link cr-focus min-w-0 text-sm">
            <span className="cr-source-title block font-medium leading-5">
              {metric.referenceTitles?.[index] || `Article at ${getSourceHost(reference)}`}
            </span>
            <span className="cr-meta mt-0.5 inline-flex items-center gap-1 no-underline">
              {getSourceHost(reference)}
              <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
            </span>
          </a>
        </li>
      ))}
      </ol>
      {compact && metric.references.length > 2 && (
        <button
          type="button"
          onClick={() => setShowAllSources((current) => !current)}
          className="cr-link cr-focus mt-2 min-h-11 text-sm"
          aria-expanded={showAllSources}
        >
          {showAllSources ? 'Show fewer sources' : `Show ${hiddenSourceCount} more sources`}
        </button>
      )}
    </div>
  );

  return (
    <div className="space-y-5">
      <section>
        <p className="cr-meta font-semibold">Why it matters</p>
        <p className="mt-1.5 max-w-4xl text-sm leading-6 text-[var(--cr-ink-2)]">{metric.whyThisMatters}</p>
      </section>

      {metadataRows.length > 0 && (
        <dl className="divide-y divide-[var(--cr-card-border)] border-y border-[var(--cr-card-border)]">
          {metadataRows.map(([label, value]) => (
            <div key={label} className="grid gap-1 py-2.5 sm:grid-cols-[150px_minmax(0,1fr)] sm:gap-4">
              <dt className="cr-meta font-semibold">{label}</dt>
              <dd className="text-sm text-[var(--cr-ink)]">{value}</dd>
            </div>
          ))}
        </dl>
      )}

      {anchors.length > 0 && (
        <section>
          <p className="cr-meta font-semibold">Scoring anchors</p>
          <div className="mt-2 grid border-y border-[var(--cr-card-border)] md:grid-cols-3">
            {anchors.map(([label, description]) => (
              <div key={label} className="grid grid-cols-[64px_minmax(0,1fr)] gap-3 border-b border-[var(--cr-card-border)] py-3 last:border-b-0 md:block md:border-b-0 md:border-r md:px-4 md:first:pl-0 md:last:border-r-0">
                <p className="text-xs font-semibold text-[var(--cr-ink)]">{label}</p>
                <p className="text-sm leading-6 text-[var(--cr-ink-2)] md:mt-1.5">{description}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {metric.references.length === 0 ? (
        <section className="grid gap-4 border-t border-[var(--cr-card-border)] pt-4 sm:grid-cols-[150px_minmax(0,1fr)]">
          <p className="cr-meta font-semibold">Sources</p>
          <p className="text-sm text-[var(--cr-ink-2)]">No source link is available in the catalogue record.</p>
        </section>
      ) : compact ? (
        <details className="border-t border-[var(--cr-card-border)] pt-4">
          <summary className="cr-focus flex min-h-11 cursor-pointer items-center text-sm font-semibold text-[var(--cr-ink)]">
            Sources ({metric.references.length})
          </summary>
          <div className="mt-3">{sourceList}</div>
        </details>
      ) : (
        <section className="grid gap-4 border-t border-[var(--cr-card-border)] pt-4 sm:grid-cols-[150px_minmax(0,1fr)]">
          <p className="cr-meta font-semibold">Sources</p>
          {sourceList}
        </section>
      )}
    </div>
  );
};

export const LiteratureBenchmarksConfig: React.FC<LiteratureBenchmarksConfigProps> = ({
  density = 'comfortable'
}) => {
  const { selectedLiteratureMetrics, toggleLiteratureMetric } = useMetrics();
  const {
    apiKeys,
    selectedProvider,
    hasValidatedApiKey,
    serverKeyStatus
  } = useAuth();
  const [metrics, setMetrics] = useState<LiteratureMetric[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedMetricName, setExpandedMetricName] = useState<string | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  useEffect(() => {
    loadLiteratureMetrics();
  }, []);

  const loadLiteratureMetrics = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await getLiteratureMetricsCached();
      setMetrics(data.metrics);
    } catch (err: any) {
      console.error('Error fetching literature metrics:', err);
      setError(err.message || 'Failed to load literature metrics');
    } finally {
      setIsLoading(false);
    }
  };

  const retryLoadMetrics = () => {
    // Only this picker's slot — the predefined slot may be healthy/in flight.
    clearMetricInventoryCache('literature');
    loadLiteratureMetrics();
  };

  const categories = useMemo(() => {
    return Array.from(new Set(metrics.map((metric) => metric.category || 'Other').filter(Boolean))).sort();
  }, [metrics]);

  const searchIndex = useMemo(() => buildSearchIndex(metrics), [metrics]);

  const searchResults = useMemo(
    () => searchAndFilterMetrics(searchIndex, searchQuery, NO_CATEGORY_FILTER),
    [searchIndex, searchQuery]
  );

  const selectedNames = useMemo(
    () => new Set(selectedLiteratureMetrics.map((metric) => metric.metricName)),
    [selectedLiteratureMetrics]
  );

  const uniformTarget = useMemo(() => {
    const targets = new Set(metrics.map((metric) => metric.target || 'therapist'));
    return targets.size === 1 ? Array.from(targets)[0] : null;
  }, [metrics]);

  const groupedMetrics = useMemo<LiteratureGroup[]>(() => {
    const order = new Map(categories.map((category, index) => [category, index]));
    const groups = new Map<string, LiteratureMetric[]>();

    metrics.forEach((metric) => {
      const category = metric.category || 'Other';
      groups.set(category, [...(groups.get(category) || []), metric]);
    });

    return Array.from(groups.entries())
      .sort(([a], [b]) => (order.get(a) ?? Number.MAX_SAFE_INTEGER) - (order.get(b) ?? Number.MAX_SAFE_INTEGER))
      .map(([category, groupMetrics]) => ({
        category,
        metrics: [...groupMetrics].sort((a, b) => a.metricName.localeCompare(b.metricName))
      }));
  }, [categories, metrics]);

  const activeGroup = useMemo(
    () => groupedMetrics.find((group) => group.category === activeCategory) || groupedMetrics[0],
    [activeCategory, groupedMetrics]
  );

  const trimmedQuery = searchQuery.trim();
  const isSearching = trimmedQuery.length > 0;
  const allFallback = searchResults.length > 0 && searchResults.every((result) => result.isFallback);
  const hasProviderKey = Boolean(
    serverKeyStatus[selectedProvider] ||
    (apiKeys[selectedProvider]?.trim() && hasValidatedApiKey)
  );

  // Screen-reader feedback for search: same string as the visible meta line,
  // debounced so polite announcements settle once per pause in typing.
  const resultsStatus = isSearching
    ? allFallback
      ? 'No exact matches — showing closest'
      : `${searchResults.length} result${searchResults.length === 1 ? '' : 's'}`
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

  const blockerMessage = !hasProviderKey
    ? 'Verify the selected analysis-provider credential in Setup to run evaluations.'
    : null;

  const toggleCategoryExpanded = (category: string) => {
    setExpandedCategories((previous) => {
      const next = new Set(previous);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  };

  const showDesktopCategory = (category: string) => {
    setActiveCategory(category);
    setExpandedMetricName(null);
  };

  // Group button toggles: "Select all" flips to "Deselect all" once the whole
  // group is selected. Bulk clearing beyond the group lives in the review tray.
  const toggleAllInCategory = (groupMetrics: LiteratureMetric[]) => {
    const allSelected =
      groupMetrics.length > 0 && groupMetrics.every((metric) => selectedNames.has(metric.metricName));
    groupMetrics
      .filter((metric) => selectedNames.has(metric.metricName) === allSelected)
      .forEach((metric) => toggleLiteratureMetric(metric));
  };


  // Match transparency: surface why an alias hit pinned/ranked a row.
  const getMatchNote = (result: SearchResult): string | undefined => {
    const aliasReason = result.matchReasons.find((reason) => reason.field === 'alias');
    if (result.pinStatus === 'EXACT_ALIAS') {
      return `matches "${aliasReason?.matchedToken ?? trimmedQuery}"`;
    }
    if (result.matchReasons[0]?.field === 'alias') {
      return `matches "${result.matchReasons[0].matchedToken}"`;
    }
    return undefined;
  };

  const renderMetricRow = (metric: LiteratureMetric, result?: SearchResult) => (
    <MetricListRow
      key={metric.metricName}
      name={metric.metricName}
      gloss={metric.definition}
      selected={selectedNames.has(metric.metricName)}
      onToggle={() => toggleLiteratureMetric(metric)}
      target={uniformTarget ? undefined : metric.target}
      matchNote={result ? getMatchNote(result) : undefined}
      metaSuffix={result ? <span className="cr-meta">{metric.category || 'Other'}</span> : undefined}
      detailsExpanded={expandedMetricName === metric.metricName}
      expandGlossWithDetails
      onOpenDetails={() => setExpandedMetricName((current) => current === metric.metricName ? null : metric.metricName)}
      detailsContent={(
        <RubricMetricDetails
          metric={metric}
          showTarget={!uniformTarget}
          compact={density === 'compact'}
        />
      )}
    />
  );

  const renderGroupActions = (group: LiteratureGroup) => {
    const allSelected =
      group.metrics.length > 0 && group.metrics.every((metric) => selectedNames.has(metric.metricName));
    return (
      <button
        type="button"
        onClick={() => toggleAllInCategory(group.metrics)}
        className="cr-btn cr-btn-ghost cr-focus h-8 shrink-0 px-3 text-xs"
      >
        {allSelected ? 'Deselect all' : 'Select all'}
      </button>
    );
  };

  if (isLoading) {
    return (
      <div className="flex h-64 flex-col items-center justify-center">
        <Loader2 className="mb-3 h-5 w-5 animate-spin text-brand-600 dark:text-brand-400" aria-hidden />
        <p className="text-sm text-[var(--cr-ink-2)]">Loading literature metrics…</p>
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
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="cr-enter space-y-4">
      {uniformTarget && (
        <p className="text-sm leading-6 text-[var(--cr-ink-2)]">
          <span className="font-semibold text-[var(--cr-ink)]">Applies to:</span>{' '}
          <MarkerHighlight tone={getTargetMarkerTone(uniformTarget)} className="font-semibold text-[var(--cr-ink)]">
            {TARGET_LABELS[uniformTarget]}
          </MarkerHighlight>
        </p>
      )}

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

          {searchResults.length === 0 ? (
            <div className="py-12 text-center">
              <Search className="mx-auto mb-3 h-5 w-5 text-[var(--cr-ink-3)]" aria-hidden />
              <p className="text-sm font-semibold text-[var(--cr-ink)]">No matching metrics</p>
              <p className="mt-1 text-sm text-[var(--cr-ink-2)]">
                Search by another name, construct, or definition.
              </p>
            </div>
          ) : (
            <div className="cr-well overflow-hidden">
              <div className="divide-y divide-[var(--cr-card-border)]">
                {searchResults.map((result) => renderMetricRow(result.metric, result))}
              </div>
            </div>
          )}
        </div>
      ) : groupedMetrics.length === 0 ? (
        <div className="py-12 text-center">
          <Search className="mx-auto mb-3 h-5 w-5 text-[var(--cr-ink-3)]" aria-hidden />
          <p className="text-sm font-semibold text-[var(--cr-ink)]">No metrics available</p>
          <p className="mt-1 text-sm text-[var(--cr-ink-2)]">Check that the backend is running.</p>
        </div>
      ) : (
        <>
          <div className="hidden border-y border-[var(--cr-card-border)] lg:grid lg:grid-cols-[210px_minmax(0,1fr)]">
            <nav aria-label="Rubric categories" className="border-r border-[var(--cr-card-border)] py-3 pr-5">
              <p className="cr-meta mb-2 px-3 font-semibold">Categories</p>
              {groupedMetrics.map((group) => {
                const selectedCount = group.metrics.filter((metric) => selectedNames.has(metric.metricName)).length;
                const isActive = activeGroup?.category === group.category;

                return (
                  <button
                    key={group.category}
                    type="button"
                    onClick={() => showDesktopCategory(group.category)}
                    aria-current={isActive ? 'page' : undefined}
                    className={`cr-focus block w-full border-l-2 px-3 py-2.5 text-left transition-colors ${
                      isActive
                        ? 'border-[var(--cr-brand-primary)] text-[var(--cr-ink)]'
                        : 'border-transparent text-[var(--cr-ink-2)] hover:border-[var(--cr-card-border)] hover:text-[var(--cr-ink)]'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span className="min-w-0 flex-1">
                        <span className={`cr-category-title block text-sm ${isActive ? 'font-bold' : 'font-medium'}`}>{group.category}</span>
                        <span className="cr-meta mt-0.5 block">
                          {group.metrics.length} metric{group.metrics.length === 1 ? '' : 's'} · {selectedCount} selected
                        </span>
                      </span>
                      <RubricCategoryDoodle category={group.category} className="h-6 w-9" />
                    </span>
                  </button>
                );
              })}
            </nav>

            {activeGroup && (
              <section aria-labelledby="active-rubric-category" className="min-w-0 pl-7">
                <div className="flex items-center justify-between gap-4 border-b border-[var(--cr-card-border)] py-3">
                  <div className="min-w-0 flex-1">
                    <p className="cr-meta font-semibold text-[var(--cr-brand-primary)]">Category focus</p>
                    <div className="mt-0.5 inline-flex max-w-full items-center gap-2">
                      <h3 id="active-rubric-category" className="cr-category-title text-[1.0625rem] font-bold text-[var(--cr-ink)]">
                        {activeGroup.category}
                      </h3>
                    </div>
                    <p className="cr-meta mt-1 font-semibold text-[var(--cr-brand-primary)]">What it reviews</p>
                    <p className="cr-hand-note mt-0.5">{getRubricCategoryNote(activeGroup.category)}</p>
                    <p className="mt-1 max-w-3xl text-[0.8125rem] leading-5 text-[var(--cr-ink-2)]">
                      <span className="font-semibold text-[var(--cr-ink)]">Examples: </span>
                      {getRubricCategoryDescription(activeGroup.category)}
                    </p>
                    <p className="cr-meta mt-1">
                      {activeGroup.metrics.length} metric{activeGroup.metrics.length === 1 ? '' : 's'} in this category
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-4">
                    <RubricCategoryDoodle
                      key={activeGroup.category}
                      category={activeGroup.category}
                      animated
                      className="h-14 w-20"
                    />
                    {renderGroupActions(activeGroup)}
                  </div>
                </div>
                {/* Same surface split as the narrow accordion: the category
                    banner stays on the module tint, its metrics sit in a
                    canvas well. */}
                <div className="cr-well mb-4 mt-4 overflow-hidden">
                  <div className="divide-y divide-[var(--cr-card-border)]">
                    {activeGroup.metrics.map((metric) => renderMetricRow(metric))}
                  </div>
                </div>
              </section>
            )}
          </div>

          <div className="border-b border-[var(--cr-card-border)] lg:hidden">
            {groupedMetrics.map((group) => {
              const isExpanded = expandedCategories.has(group.category);
              const selectedCount = group.metrics.filter((metric) => selectedNames.has(metric.metricName)).length;

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
                      <span className="min-w-0 flex-1">
                        <span className="cr-category-title block text-[0.9375rem] font-semibold text-[var(--cr-ink)]">{group.category}</span>
                        <span className="cr-meta mt-1 block font-semibold text-[var(--cr-brand-primary)]">What it reviews</span>
                        <span className="cr-hand-note mt-0.5 block">{getRubricCategoryNote(group.category)}</span>
                        <span className={`mt-1 block text-[0.8125rem] leading-5 text-[var(--cr-ink-2)] ${
                          density === 'compact' && !isExpanded ? 'hidden' : ''
                        }`}>
                            <span className="font-semibold text-[var(--cr-ink)]">Examples: </span>
                            {getRubricCategoryDescription(group.category)}
                        </span>
                        <span className="cr-meta mt-1 block">
                          {group.metrics.length} metric{group.metrics.length === 1 ? '' : 's'} · {selectedCount} selected
                        </span>
                      </span>
                      <RubricCategoryDoodle
                        category={group.category}
                        animated={isExpanded}
                        className="h-9 w-14"
                      />
                    </button>
                    {isExpanded && density !== 'compact' && renderGroupActions(group)}
                  </div>

                  {isExpanded && density === 'compact' && (
                    <div className="flex justify-end pb-2">
                      {renderGroupActions(group)}
                    </div>
                  )}

                  {/* The metric list punches back to the canvas (.cr-well) so
                      the two levels never share a surface: category headers
                      live on the muted module tint, metrics on white/black. */}
                  {isExpanded && (
                    <div className={`cr-well mb-4 overflow-hidden ${density === 'compact' ? '' : 'ml-7'}`}>
                      <div className="divide-y divide-[var(--cr-card-border)]">
                        {group.metrics.map((metric) => renderMetricRow(metric))}
                      </div>
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};
