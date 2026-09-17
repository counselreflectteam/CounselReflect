import React from 'react';
import { Check, Circle, CircleX } from 'lucide-react';
import type { EvaluationPhase, ProgressState } from '../../utils/evaluationUtils';
import { getPhaseLabel } from '../../utils/evaluationUtils';
import { getEvaluationErrorPresentation } from '../../utils/evaluationErrorUtils';
import { EvaluationLoadingDoodle, EvaluationLoadingMark } from './EvaluationLoadingDoodle';

export interface EvaluationProgressProps {
  progress: ProgressState;
  phasesToRun: EvaluationPhase[];
  phaseCounts: {
    predefined: number;
    custom: number;
    literature: number;
  };
  onCancel: () => void;
  isCancelling?: boolean;
}

/**
 * Displays true stream progress: overall completion followed by every metric
 * in its source group. Each source evaluates sequentially while sources may
 * run in parallel, so one metric per active source can be running at once.
 */
export const EvaluationProgress: React.FC<EvaluationProgressProps> = ({
  progress,
  phasesToRun,
  phaseCounts,
  onCancel,
  isCancelling = false
}) => {
  const completedCount = progress.metricProgress.filter((item) => item.status === 'completed').length;
  const failedCount = progress.metricProgress.filter((item) => item.status === 'failed').length;

  return (
    <div className="space-y-6">
      {/* Overall progress */}
      <div className="flex items-start gap-3 sm:gap-5">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-4">
            <span className="text-2xl font-bold tracking-tight text-[var(--cr-ink)] tabular-nums">
              {progress.progressPercent.toFixed(0)}%
            </span>
            <span className="cr-meta shrink-0 tabular-nums">
              {progress.completedMetrics} of {progress.totalMetrics} metrics
            </span>
          </div>
          <div className="relative mt-3 h-1.5 w-full overflow-visible bg-[var(--cr-bg)]">
            <div
              className="h-full bg-brand-600 transition-[width] duration-300 ease-out dark:bg-brand-400"
              style={{ width: `${progress.progressPercent}%` }}
              role="progressbar"
              aria-valuenow={progress.progressPercent}
              aria-valuemin={0}
              aria-valuemax={100}
            />
            {progress.completedMetrics < progress.totalMetrics && (
              <span
                aria-hidden="true"
                className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 bg-[#F04F68] motion-safe:animate-pulse"
                style={{ left: `${Math.max(0.8, progress.progressPercent)}%` }}
              />
            )}
          </div>
          <p className="mt-2 text-xs text-[var(--cr-ink-2)]" aria-live="polite">
            {completedCount} completed
            {failedCount > 0 ? ` · ${failedCount} failed` : ''}
            {progress.totalMetrics - completedCount - failedCount > 0
              ? ` · ${progress.totalMetrics - completedCount - failedCount} remaining`
              : ''}
          </p>
        </div>
        <EvaluationLoadingDoodle
          completedCount={completedCount}
          failedCount={failedCount}
          className="h-[58px] w-[86px] sm:h-[68px] sm:w-[108px]"
        />
      </div>

      <div className="space-y-6" aria-live="polite">
        {phasesToRun.map((phase) => {
          const items = progress.metricProgress.filter((item) => item.phase === phase);
          const phaseDone = items.filter(
            (item) => item.status === 'completed' || item.status === 'failed'
          ).length;
          const phaseName = getPhaseLabel(phase, phaseCounts).replace(/\s*\(\d+\)$/, '');

          return (
            <section key={phase} aria-labelledby={`progress-${phase}`}>
              <div className="flex items-baseline justify-between gap-4">
                <h3 id={`progress-${phase}`} className="min-w-0 flex-1 truncate text-sm font-bold text-[var(--cr-ink)]">
                  {phaseName}
                </h3>
                <span className="cr-meta shrink-0 tabular-nums">{phaseDone}/{items.length}</span>
              </div>

              <ol className="mt-2 divide-y divide-[var(--cr-card-border)] border-y border-[var(--cr-card-border)]">
                {items.map((item) => {
                  const isRunning = item.status === 'running';
                  const statusLabel = item.status === 'completed'
                    ? 'Complete'
                    : item.status === 'failed'
                      ? 'Could not score'
                      : isRunning
                        ? 'Analyzing'
                        : 'Waiting';
                  const errorPresentation = item.error
                    ? getEvaluationErrorPresentation(item.error, item.label)
                    : null;
                  const icon = item.status === 'completed'
                    ? <Check className="h-4 w-4 text-[var(--cr-brand-leaf)]" aria-hidden />
                    : item.status === 'failed'
                      ? <CircleX className="h-4 w-4 text-rose-600 dark:text-rose-400" aria-hidden />
                      : isRunning
                        ? <EvaluationLoadingMark className="h-4 w-4" />
                        : <Circle className="h-3.5 w-3.5 text-[var(--cr-input-border)]" aria-hidden />;

                  return (
                    <li
                      key={item.id}
                      className={`grid min-h-11 grid-cols-[20px_minmax(0,1fr)] items-start gap-x-2.5 gap-y-1 px-1 py-2.5 sm:grid-cols-[20px_minmax(0,1fr)_auto] sm:items-center ${
                        isRunning ? 'bg-[#FFFBE8] dark:bg-amber-500/8' : ''
                      }`}
                    >
                      <span className="flex h-5 w-5 items-center justify-center sm:self-start">{icon}</span>
                      <div className="min-w-0">
                        <p className={`text-sm leading-5 sm:truncate ${isRunning ? 'font-bold' : 'font-medium'} text-[var(--cr-ink)]`}>
                          {item.label}
                        </p>
                        {errorPresentation && (
                          <p className="mt-0.5 line-clamp-2 text-xs leading-4 text-rose-700 dark:text-rose-300">
                            {errorPresentation.explanation}
                          </p>
                        )}
                      </div>
                      <span className={`col-start-2 text-xs font-semibold sm:col-start-3 sm:row-start-1 sm:self-start sm:pt-0.5 ${
                        item.status === 'completed'
                          ? 'text-[var(--cr-brand-leaf)]'
                          : item.status === 'failed'
                            ? 'text-rose-700 dark:text-rose-300'
                            : isRunning
                              ? 'text-[var(--cr-brand-primary)]'
                              : 'text-[var(--cr-ink-3)]'
                      }`}>
                        {statusLabel}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </section>
          );
        })}
      </div>

      {/* Cancel button */}
      <div className="flex justify-end">
        <button
          onClick={onCancel}
          disabled={isCancelling}
          className="cr-btn cr-btn-secondary cr-focus h-9 px-4 text-rose-600 enabled:hover:bg-[var(--cr-bg)]! dark:text-rose-400"
        >
          {isCancelling ? 'Stopping evaluation...' : 'Cancel evaluation'}
        </button>
      </div>
    </div>
  );
};
