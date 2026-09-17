import React, { useState } from 'react';
import { useEvaluationState } from '@shared/context';
import { useMetricCompletion } from '@shared/hooks';
import { Check, ChevronDown, ChevronRight, Info, X } from 'lucide-react';
import {
  getEvaluationErrorPresentation,
  type EvaluationErrorPresentation
} from '@shared/utils/evaluationErrorUtils';

export const EvaluatedMetricsSummary: React.FC<{
  /** Suppress the cr-opener band when a collapsible zone header owns the threshold. */
  hideOpener?: boolean;
}> = ({ hideOpener = false }) => {
  const { results } = useEvaluationState();
  const {
    predefinedMetrics,
    literatureMetrics,
    customizedMetrics,
    totalSuccessCount,
    totalMetricCount,
    hasFailures
  } = useMetricCompletion();

  if (!results) return null;

  const predefinedSuccessCount = predefinedMetrics.filter(m => m.isSuccessful).length;
  const literatureSuccessCount = literatureMetrics.filter(m => m.isSuccessful).length;
  const customizedSuccessCount = customizedMetrics.filter(m => m.isSuccessful).length;

  return (
    <div>
      {!hideOpener && (
      <header className="cr-opener">
        <span className="cr-eyebrow">Run information</span>
        <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
          <h2 className="cr-section-title min-w-0 text-lg md:text-xl">Report details</h2>
          {totalMetricCount === 0 ? (
            <span className="cr-meta ml-auto shrink-0">Previous selection unavailable</span>
          ) : hasFailures ? (
            <span className="ml-auto shrink-0 whitespace-nowrap text-xs font-medium tabular-nums text-rose-700 dark:text-rose-300">
              {totalSuccessCount} of {totalMetricCount} completed
            </span>
          ) : (
            <span className="ml-auto inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-xs font-medium tabular-nums text-emerald-700 dark:text-emerald-400">
              <Check className="h-3 w-3" aria-hidden />
              {totalSuccessCount} of {totalMetricCount} completed
            </span>
          )}
        </div>
      </header>
      )}
      <div className={`grid grid-cols-1 gap-6 lg:grid-cols-3 lg:gap-10 ${hideOpener ? '' : 'pt-5'}`}>
        <MetricSummaryList
          title="Model-scored metrics"
          metrics={predefinedMetrics}
          successCount={predefinedSuccessCount}
          metricErrors={results.metricErrors}
        />

        <MetricSummaryList
          title="Rubric-scored metrics"
          metrics={literatureMetrics}
          successCount={literatureSuccessCount}
          metricErrors={results.metricErrors}
        />

        <MetricSummaryList
          title="Custom metrics"
          metrics={customizedMetrics}
          successCount={customizedSuccessCount}
          metricErrors={results.metricErrors}
        />
      </div>
    </div>
  );
};

const MetricSummaryList: React.FC<{
  title: string;
  metrics: Array<{ id: string; label: string; isSuccessful: boolean; definition?: string }>;
  successCount: number;
  metricErrors?: Record<string, string>;
}> = ({ title, metrics, successCount, metricErrors }) => {
  const [active, setActive] = useState<
    | { kind: 'definition'; label: string; definition: string }
    | { kind: 'error'; presentation: EvaluationErrorPresentation }
    | null
  >(null);

  return (
    <div className="min-w-0 border-t border-[var(--cr-card-border)] pt-3">
      <h4 className="flex flex-wrap items-baseline gap-2 text-[0.8125rem] font-bold text-[var(--cr-ink)]">
        <span>{title}</span>
        {metrics.length > 0 && (
          <span className="cr-meta">
            {successCount} of {metrics.length}
          </span>
        )}
      </h4>
      <ul className="mt-2 max-h-60 divide-y divide-[var(--cr-card-border)] overflow-y-auto pr-1 text-[0.8125rem] text-[var(--cr-ink-2)]">
        {metrics.map(m => {
          const reason = !m.isSuccessful
            ? metricErrors?.[m.id] || 'No scores were returned. The metric ran but produced no usable result.'
            : undefined;
          const errorPresentation = reason
            ? getEvaluationErrorPresentation(reason, m.label)
            : null;

          if (errorPresentation) {
            return (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => setActive({ kind: 'error', presentation: errorPresentation })}
                  aria-label={`View error details for ${m.label}`}
                  className="cr-focus group/error flex w-full cursor-pointer items-center justify-between gap-3 py-2 text-left"
                >
                  <span className="min-w-0 truncate font-bold text-rose-700 dark:text-rose-300">
                    {m.label}
                  </span>
                  <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-rose-700 group-hover/error:underline dark:text-rose-300">
                    Could not score
                    <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                  </span>
                </button>
              </li>
            );
          }

          return (
            <li key={m.id} className="flex items-start justify-between gap-3 py-2">
              <div className="min-w-0 flex-1">
                {m.definition ? (
                  <button
                    type="button"
                    onClick={() => setActive({ kind: 'definition', label: m.label, definition: m.definition! })}
                    title="Show definition"
                    className="cr-focus group/def flex w-full items-center gap-1 text-left"
                  >
                    <span className="truncate group-hover/def:text-[var(--cr-ink)]">{m.label}</span>
                    <Info className="h-3 w-3 shrink-0 text-transparent transition-colors group-hover/def:text-[var(--cr-ink-3)]" />
                  </button>
                ) : (
                  <span className="block truncate">{m.label}</span>
                )}
              </div>
              <Check
                className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400"
                aria-label="Completed"
              />
            </li>
          );
        })}
        {metrics.length === 0 && <li className="cr-meta py-2">None selected</li>}
      </ul>

      {active && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setActive(null)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="metric-detail-title"
            className="cr-card max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto p-6 shadow-[var(--shadow-lift)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <span className="cr-eyebrow">
                  {active.kind === 'error' ? 'Metric status' : 'Metric definition'}
                </span>
                <h4 id="metric-detail-title" className="mt-1 text-lg font-bold text-[var(--cr-ink)]">
                  {active.kind === 'error' ? active.presentation.title : active.label}
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setActive(null)}
                aria-label="Close metric details"
                className="cr-focus shrink-0 rounded-full p-1.5 text-[var(--cr-ink-3)] hover:bg-[var(--cr-muted)] hover:text-[var(--cr-ink)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {active.kind === 'definition' ? (
              <p className="mt-3 text-sm leading-6 text-[var(--cr-ink-2)]">{active.definition}</p>
            ) : (
              <div className="mt-4">
                <section className="border-y border-[var(--cr-card-border)] py-4">
                  <p className="cr-meta font-semibold">What happened</p>
                  <p className="mt-1.5 text-sm leading-6 text-[var(--cr-ink-2)]">
                    {active.presentation.explanation}
                  </p>
                  <p className="cr-meta mt-4 font-semibold">Next step</p>
                  <p className="mt-1.5 text-sm leading-6 text-[var(--cr-ink-2)]">
                    {active.presentation.action}
                  </p>
                </section>

                {active.presentation.technicalDetails && (
                  <details className="group mt-4 text-xs text-[var(--cr-ink-2)]">
                    <summary className="cr-focus inline-flex cursor-pointer list-none items-center gap-1.5 rounded-sm font-semibold text-[var(--cr-ink)] hover:text-[var(--cr-brand-primary)] [&::-webkit-details-marker]:hidden">
                      <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" aria-hidden />
                      Technical details
                    </summary>
                    <pre className="mt-2 whitespace-pre-wrap break-words border-l-2 border-[var(--cr-card-border)] pl-3 font-mono text-[0.6875rem] leading-5 text-[var(--cr-ink-3)]">
                      {active.presentation.technicalDetails}
                    </pre>
                  </details>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
