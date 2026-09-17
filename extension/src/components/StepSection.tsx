import React from 'react';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';
import { SectionCard } from './SectionCard';

export type StepPresentation = 'locked' | 'active' | 'receipt';

interface StepSectionProps {
  eyebrow: string;
  title: string;
  state: StepPresentation;
  /** One-line earned summary shown in the receipt row (e.g. "24 turns · from this page"). */
  receipt?: React.ReactNode;
  /** One-line function statement shown while the step is locked. */
  purpose?: string;
  /** Optional trailing chip on the receipt row (e.g. "Connected ✓"). */
  statusChip?: React.ReactNode;
  /** Status node passed through to the expanded SectionCard header. */
  status?: React.ReactNode;
  subtitle?: string;
  onExpand?: () => void;
  /** Offered while 'active' AND the step would collapse without the user's
      manual expansion — renders a collapse chevron in the card header. */
  onCollapse?: () => void;
  children: React.ReactNode;
}

/**
 * Renders a setup step in one of three states: the full SectionCard
 * ('active'), a one-line receipt row ('receipt'), or a dimmed one-line
 * purpose row ('locked').
 *
 * CRITICAL INVARIANT: the children's tree position is IDENTICAL in every
 * state — always div > SectionCard > children — with visibility controlled
 * by the `hidden` attribute. Swapping the children between different parent
 * structures would remount them, and step bodies own live state whose reset
 * feeds back into the state that picks the presentation (ApiKeyConfig's
 * validation notify resets access; EvaluationConfig owns the in-flight
 * run). A remount here once produced an infinite receipt/active flip-flop.
 * Collapse/expand is instant: the app's rAF-measured scroll effects must
 * always see settled layout.
 */
export const StepSection: React.FC<StepSectionProps> = ({
  eyebrow,
  title,
  state,
  receipt,
  purpose,
  statusChip,
  status,
  subtitle,
  onExpand,
  onCollapse,
  children
}) => {
  const bodyId = React.useId();

  const activeStatus = onCollapse ? (
    <span className="flex shrink-0 items-center gap-1">
      {status}
      <button
        type="button"
        onClick={onCollapse}
        aria-label={`Collapse ${title}`}
        title="Collapse"
        className="cr-control cr-focus rounded-full p-1.5 text-[var(--cr-ink-3)] hover:bg-[var(--cr-bg)] hover:text-[var(--cr-ink)]"
      >
        <ChevronUp className="h-4 w-4" aria-hidden />
      </button>
    </span>
  ) : status;

  return (
    <div>
      {state === 'receipt' && (
        <button
          type="button"
          onClick={onExpand}
          aria-expanded={false}
          aria-controls={bodyId}
          className="cr-step-row cr-focus cr-interactive-row hover:bg-[var(--cr-bg)]"
        >
          <Check className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
          <span className="min-w-0 flex-1 truncate">
            <span className="font-bold text-[var(--cr-ink)]">{title}</span>
            {receipt && <span className="text-[var(--cr-ink-2)]"> — {receipt}</span>}
          </span>
          {statusChip}
          <ChevronDown className="h-4 w-4 shrink-0 text-[var(--cr-ink-3)]" aria-hidden />
        </button>
      )}
      {state === 'locked' && (
        <div className="cr-step-row is-locked">
          <span className="min-w-0 flex-1 truncate">
            <span className="font-bold text-[var(--cr-ink)]">{title}</span>
            {purpose && <span className="text-[var(--cr-ink-2)]"> — {purpose}</span>}
          </span>
        </div>
      )}
      <div id={bodyId} hidden={state !== 'active'}>
        <SectionCard eyebrow={eyebrow} title={title} subtitle={subtitle} status={activeStatus} motionClassName="">
          {children}
        </SectionCard>
      </div>
    </div>
  );
};
