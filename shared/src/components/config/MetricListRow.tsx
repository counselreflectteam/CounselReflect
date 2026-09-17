import React from 'react';
import { Check, ChevronDown, ChevronRight, CircleHelp } from 'lucide-react';
import { TargetSpeaker } from '../../types';
import { getTargetConfig } from '../../utils/targetSpeakerUtils';
import { getTargetMarkerTone, MarkerHighlight } from '../design/MarkerHighlight';

/**
 * MetricListRow — the single row grammar shared by all three metric pickers
 * (Guided Library spec §3).
 *
 * Grid: [checkbox] [content] [right-zone], min height 44px.
 * One bold element per row (the name); target is a quiet 14px glyph, the
 * details affordance is a chevron icon button rendered only when
 * onOpenDetails is provided.
 *
 * Selection and inspection are separate controls: the checkbox changes the
 * evaluation set, while the metric name, summary, and chevron open details.
 * This avoids selecting a metric when the user only intended to understand it.
 * Unavailable rows (serverAvailable === false upstream) stay visible but
 * block toggling unless already selected, so users can always deselect.
 */
export interface MetricListRowProps {
  name: string;
  gloss: string;
  selected: boolean;
  onToggle: () => void;
  /** Renders the 14px target glyph + title in the right zone; omit to hide. */
  target?: TargetSpeaker;
  /** Adds a hand-marked highlight behind the target label. */
  highlightTarget?: boolean;
  /** Renders the quiet "HF" cr-meta tag after the name. */
  requiresHf?: boolean;
  /** opacity-50, cursor-not-allowed; toggle blocked unless selected. */
  unavailable?: boolean;
  /** Conditional amber third line (caller passes getMetricReadiness output). */
  readinessLabel?: string;
  /** e.g. 'matches "rapport"' — cr-meta note under the gloss during search. */
  matchNote?: string;
  /** Custom tab scale line (mono cr-meta), rendered below the gloss. */
  metaSuffix?: React.ReactNode;
  /** Renders the › chevron details button when provided. */
  onOpenDetails?: () => void;
  /** Keeps the selected metric's explanation in the catalogue flow. */
  detailsExpanded?: boolean;
  detailsContent?: React.ReactNode;
  /** Shows the full row gloss while its details are open. */
  expandGlossWithDetails?: boolean;
}

export const MetricListRow: React.FC<MetricListRowProps> = ({
  name,
  gloss,
  selected,
  onToggle,
  target,
  highlightTarget = false,
  requiresHf,
  unavailable,
  readinessLabel,
  matchNote,
  metaSuffix,
  onOpenDetails,
  detailsExpanded = false,
  detailsContent,
  expandGlossWithDetails = false,
}) => {
  // Unavailable rows stay deselectable so nobody gets stuck.
  const toggleBlocked = Boolean(unavailable) && !selected;

  const rowId = React.useId();
  const nameId = `${rowId}-name`;
  const glossId = `${rowId}-gloss`;
  const readinessId = `${rowId}-readiness`;
  const detailsId = `${rowId}-details`;

  const handleToggle = () => {
    if (toggleBlocked) return;
    onToggle();
  };

  const targetConfig = target ? getTargetConfig(target) : null;

  return (
    <div>
      <div
        className={`cr-interactive-row group/metric flex min-h-[52px] items-start gap-1 ${
          selected
            ? 'bg-brand-100/60 dark:bg-brand-500/15 dark:[.cr-module_&]:bg-brand-500/20'
            : 'hover:bg-[var(--cr-muted)] [.cr-module_&]:hover:bg-[var(--cr-bg)] [.cr-well_&]:hover:bg-[var(--cr-muted)]'
        }`}
      >
        <button
          type="button"
          disabled={toggleBlocked}
          aria-pressed={selected}
          aria-disabled={toggleBlocked || undefined}
          aria-label={`${selected ? 'Deselect' : 'Select'} ${name}`}
          onClick={handleToggle}
          className={`cr-focus flex h-11 w-9 shrink-0 items-center justify-center self-start ${
            toggleBlocked ? 'cursor-not-allowed opacity-40' : ''
          }`}
        >
          <span
            aria-hidden
            className={`flex h-[18px] w-[18px] items-center justify-center rounded-[4px] border transition-colors ${
              selected
                ? 'border-brand-600 bg-brand-600 dark:border-brand-500 dark:bg-brand-500'
                : 'border-[var(--cr-input-border)]'
            }`}
          >
            {selected && <Check className="h-3 w-3 text-white" />}
          </span>
        </button>

        <button
          type="button"
          onClick={onOpenDetails ?? handleToggle}
          aria-labelledby={nameId}
          aria-describedby={`${glossId}${readinessLabel ? ` ${readinessId}` : ''}`}
          aria-expanded={detailsContent ? detailsExpanded : undefined}
          aria-controls={detailsContent ? detailsId : undefined}
          className="cr-focus min-w-0 flex-1 py-3 text-left"
        >
          <span className="block min-w-0">
            <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span id={nameId} className="text-[0.9375rem] font-bold leading-snug text-[var(--cr-ink)]">
                {name}
              </span>
              {requiresHf && (
                <span title="Requires a Hugging Face API key" className="cr-meta">
                  HF
                </span>
              )}
            </span>
            <span
              id={glossId}
              className={`mt-0.5 block text-[0.8125rem] leading-5 text-[var(--cr-ink-2)] ${
                expandGlossWithDetails && detailsExpanded ? '' : 'line-clamp-1'
              }`}
            >
              {gloss}
            </span>
            {targetConfig && (
              <span
                className={`cr-meta mt-1 block ${highlightTarget ? 'font-semibold text-[var(--cr-ink)]' : ''}`}
                title={targetConfig.description}
              >
                {highlightTarget
                  ? <MarkerHighlight tone={getTargetMarkerTone(target!)}>{targetConfig.label}</MarkerHighlight>
                  : targetConfig.label}
              </span>
            )}
            {metaSuffix}
            {readinessLabel && (
              <span
                id={readinessId}
                className="mt-1 flex w-fit flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs font-semibold text-amber-700 dark:text-amber-300"
              >
                <CircleHelp className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span>{readinessLabel}</span>
                {onOpenDetails && (
                  <span className="font-medium underline decoration-amber-400 underline-offset-2 dark:decoration-amber-600">
                    {detailsExpanded ? 'Hide explanation' : 'Why?'}
                  </span>
                )}
              </span>
            )}
            {matchNote && <span className="cr-meta mt-0.5 block">{matchNote}</span>}
          </span>
        </button>

        <div className="flex items-center self-start pt-1">
          {onOpenDetails && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onOpenDetails();
              }}
              className="cr-control cr-focus flex h-11 w-11 items-center justify-center rounded-md text-[var(--cr-ink-3)] hover:bg-[var(--cr-muted)] hover:text-[var(--cr-ink)] [.cr-module_&]:hover:bg-[var(--cr-bg)] [.cr-well_&]:hover:bg-[var(--cr-muted)]"
              aria-label={`${detailsExpanded ? 'Hide' : 'View'} details for ${name}`}
              aria-expanded={detailsExpanded}
              aria-controls={detailsContent ? detailsId : undefined}
            >
              {detailsExpanded ? (
                <ChevronDown className="h-4 w-4" aria-hidden />
              ) : (
                <ChevronRight className="h-4 w-4" aria-hidden />
              )}
            </button>
          )}
        </div>
      </div>

      {detailsExpanded && detailsContent && (
        <div
          id={detailsId}
          className="mb-3 border-l-2 border-[var(--cr-card-border)] px-3 py-4 sm:ml-11 sm:px-5"
          onClick={(event) => event.stopPropagation()}
        >
          {detailsContent}
        </div>
      )}
    </div>
  );
};
