import React from 'react';
import { CircleAlert, ChevronDown } from 'lucide-react';
import { getEvaluationErrorPresentation } from '../../utils/evaluationErrorUtils';

export interface EvaluationErrorProps {
  error: string | null;
  onRetry: () => void;
  onBackToConfigure: () => void;
}

/**
 * Displays evaluation error state with retry and back options
 */
export const EvaluationError: React.FC<EvaluationErrorProps> = ({
  error,
  onRetry,
  onBackToConfigure
}) => {
  const presentation = getEvaluationErrorPresentation(error);

  return (
    <div className="cr-enter max-w-3xl border-l-[3px] border-rose-500 py-2 pl-4" role="alert">
      <span className="cr-eyebrow">Evaluation could not finish</span>
      <h2 className="mt-1.5 flex items-start gap-2 text-[0.9375rem] font-bold text-[var(--cr-ink)]">
        <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" aria-hidden />
        <span>{presentation.title}</span>
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--cr-ink-2)]">
        {presentation.explanation}
      </p>

      <div className="mt-4 border-y border-[var(--cr-card-border)] py-3">
        <p className="text-xs font-bold uppercase text-[var(--cr-ink)]">What to do</p>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-[var(--cr-ink-2)]">
          {presentation.action}
        </p>
      </div>

      {presentation.technicalDetails && (
        <details className="group mt-3 max-w-2xl text-xs text-[var(--cr-ink-2)]">
          <summary className="cr-focus inline-flex cursor-pointer list-none items-center gap-1.5 rounded-sm font-semibold text-[var(--cr-ink)] hover:text-[var(--cr-brand-primary)] [&::-webkit-details-marker]:hidden">
            <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" aria-hidden />
            Technical details
          </summary>
          <pre className="mt-2 whitespace-pre-wrap break-words border-l-2 border-[var(--cr-card-border)] pl-3 font-mono text-[0.6875rem] leading-5 text-[var(--cr-ink-3)]">
            {presentation.technicalDetails}
          </pre>
        </details>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <button
          onClick={onRetry}
          className="cr-btn cr-btn-primary cr-focus h-10 px-5"
        >
          Retry
        </button>
        {/* On muted module ground (extension sidebar) the secondary hover
            fill inverts to the canvas value; on white it keeps the default. */}
        <button
          onClick={onBackToConfigure}
          className="cr-btn cr-btn-secondary cr-focus h-10 px-5 [.cr-module_&]:enabled:hover:bg-[var(--cr-bg)]!"
        >
          Back to configure
        </button>
      </div>
    </div>
  );
};
