import React from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { SummaryResponse } from '@shared/services/summaryService';

interface SummarySectionProps {
  summary: SummaryResponse | null;
  isLoadingSummary: boolean;
  summaryError: string | null;
  onRegenerate: () => void;
  /** When true (extension only), replace "Line N" with "Turn N" in displayed text */
  replaceLineWithTurn?: boolean;
  /** Suppress the cr-opener band when a collapsible zone header owns the threshold. */
  hideOpener?: boolean;
}

/**
 * Structured summary section with strengths and areas for improvement
 */
/** Replace "Line N" / "Lines N" with "Turn N" / "Turns N" for extension display */
const replaceLineWithTurnInText = (text: string): string => {
  if (!text) return text;
  return text
    .replace(/\bLines\s+(\d+(?:-\d+)?)/gi, 'Turns $1')
    .replace(/\bLine\s+(\d+)/gi, 'Turn $1');
};

export const SummarySection: React.FC<SummarySectionProps> = ({
  summary,
  isLoadingSummary,
  summaryError,
  onRegenerate,
  replaceLineWithTurn = true,
  hideOpener = false
}) => {

  return (
    <div>
      {hideOpener ? (
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1">
          <p className="cr-meta min-w-0 max-w-2xl">
            A generated synthesis of the selected signals. Verify each point against the cited turns.
          </p>
          {summary && (
            <button
              onClick={onRegenerate}
              disabled={isLoadingSummary}
              className="cr-btn cr-btn-ghost cr-focus ml-auto h-8 shrink-0 px-3 text-xs"
              title="Regenerate summary"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoadingSummary ? 'animate-spin' : ''}`} aria-hidden />
              Regenerate
            </button>
          )}
        </div>
      ) : (
        <header className="cr-opener">
          <span className="cr-eyebrow">Findings</span>
          <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
            <h2 className="cr-section-title min-w-0 text-lg md:text-xl">Summary</h2>
            {summary && (
              <button
                onClick={onRegenerate}
                disabled={isLoadingSummary}
                className="cr-btn cr-btn-ghost cr-focus ml-auto h-8 shrink-0 px-3 text-xs"
                title="Regenerate summary"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isLoadingSummary ? 'animate-spin' : ''}`} aria-hidden />
                Regenerate
              </button>
            )}
          </div>
          <p className="mt-1 max-w-2xl text-[0.8125rem] leading-5 text-[var(--cr-ink-2)]">
            A generated synthesis of the selected signals. Verify each point against the cited turns.
          </p>
        </header>
      )}

      <div>
        {isLoadingSummary && (
          <div className="flex items-center gap-2 py-6">
            <Loader2 className="h-4 w-4 animate-spin text-brand-600 dark:text-brand-400" aria-hidden />
            <p className="text-[0.8125rem] text-[var(--cr-ink-2)]">Generating summary…</p>
          </div>
        )}

        {summaryError && !isLoadingSummary && (
          <div className="pt-6">
            <p className="text-[0.9375rem] leading-relaxed">
              <span className="font-bold text-[var(--cr-ink)]">Summary unavailable.</span>{' '}
              <span className="text-[var(--cr-ink-2)]">{summaryError}</span>
            </p>
            <button
              onClick={onRegenerate}
              className="cr-link cr-focus mt-2 text-sm"
            >
              Try again
            </button>
          </div>
        )}

        {summary && !isLoadingSummary && (
          <div className="grid grid-cols-1 gap-8 pt-5 md:grid-cols-2 md:gap-10">
            {summary.strengths && summary.strengths.length > 0 && (
              <section className="min-w-0 border-t-2 border-green-600 pt-4 dark:border-green-400">
                <div className="flex items-baseline justify-between gap-4">
                  <h3 className="text-[0.9375rem] font-semibold text-green-700 dark:text-green-400">Observed strengths</h3>
                  <span className="text-xs tabular-nums text-[var(--cr-ink-3)]">
                    {summary.strengths.length} {summary.strengths.length === 1 ? 'observation' : 'observations'}
                  </span>
                </div>
                <ol className="mt-3 divide-y divide-[var(--cr-card-border)]">
                  {summary.strengths.map((item, idx) => (
                    <li key={idx} className="grid grid-cols-[26px_minmax(0,1fr)] gap-2 py-3 text-[0.9375rem] leading-relaxed text-[var(--cr-ink)]">
                      <span className="pt-0.5 text-xs tabular-nums text-green-700 dark:text-green-400">{String(idx + 1).padStart(2, '0')}</span>
                      <span className="cr-reading">{replaceLineWithTurn ? replaceLineWithTurnInText(item) : item}</span>
                    </li>
                  ))}
                </ol>
              </section>
            )}

            {summary.areas_for_improvement && summary.areas_for_improvement.length > 0 && (
              <section className="min-w-0 border-t-2 border-amber-600 pt-4 dark:border-amber-400">
                <div className="flex items-baseline justify-between gap-4">
                  <h3 className="text-[0.9375rem] font-semibold text-amber-800 dark:text-amber-400">Areas for further review</h3>
                  <span className="text-xs tabular-nums text-[var(--cr-ink-3)]">
                    {summary.areas_for_improvement.length}{' '}
                    {summary.areas_for_improvement.length === 1 ? 'observation' : 'observations'}
                  </span>
                </div>
                <ol className="mt-3 divide-y divide-[var(--cr-card-border)]">
                  {summary.areas_for_improvement.map((item, idx) => (
                    <li key={idx} className="grid grid-cols-[26px_minmax(0,1fr)] gap-2 py-3 text-[0.9375rem] leading-relaxed text-[var(--cr-ink)]">
                      <span className="pt-0.5 text-xs tabular-nums text-amber-700 dark:text-amber-400">{String(idx + 1).padStart(2, '0')}</span>
                      <span className="cr-reading">{replaceLineWithTurn ? replaceLineWithTurnInText(item) : item}</span>
                    </li>
                  ))}
                </ol>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
