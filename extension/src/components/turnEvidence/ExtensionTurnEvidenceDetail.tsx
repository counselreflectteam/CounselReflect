import React from 'react';
import {
  ChevronLeft,
  ChevronRight,
  LocateFixed,
  X,
} from 'lucide-react';
import type {
  Message,
  MetricPresentationSnapshot,
  UtteranceScore,
} from '@shared/types';
import { getTurnRoleDotClass, getTurnRoleLabelClass } from '@shared/components/dashboard/turnDisplayUtils';
import { RichMetricResults } from './RichMetricResults';

interface ExtensionTurnEvidenceDetailProps {
  turnIndex: number;
  message: Message;
  scoreItem: UtteranceScore;
  presentationById: Readonly<Record<string, MetricPresentationSnapshot>>;
  scoredTurnIndexes: number[];
  containerRef?: React.Ref<HTMLDivElement>;
  headingRef?: React.Ref<HTMLHeadingElement>;
  onClose: () => void;
  onFindOnPage?: () => void;
  onSelectTurn: (turnIndex: number) => void;
}

export const ExtensionTurnEvidenceDetail: React.FC<ExtensionTurnEvidenceDetailProps> = ({
  turnIndex,
  message,
  scoreItem,
  presentationById,
  scoredTurnIndexes,
  containerRef,
  headingRef,
  onClose,
  onFindOnPage,
  onSelectTurn,
}) => {
  const currentScoredPosition = scoredTurnIndexes.indexOf(turnIndex);
  const previousTurnIndex = currentScoredPosition > 0
    ? scoredTurnIndexes[currentScoredPosition - 1]
    : null;
  const nextTurnIndex = currentScoredPosition >= 0 && currentScoredPosition < scoredTurnIndexes.length - 1
    ? scoredTurnIndexes[currentScoredPosition + 1]
    : null;

  return (
    <div
      ref={containerRef}
      id={`turn-evidence-detail-${turnIndex}`}
      className="cr-evidence-detail cr-enter scroll-mt-4"
      aria-labelledby={`turn-evidence-heading-${turnIndex}`}
    >
      <div className="flex items-start justify-between gap-4 border-b border-[var(--cr-evidence-rule)] px-4 py-4">
        <div className="min-w-0">
          <p className="cr-eyebrow">Turn evidence</p>
          <div className="mt-1 flex min-w-0 flex-wrap items-baseline gap-2">
            <h3
              ref={headingRef}
              id={`turn-evidence-heading-${turnIndex}`}
              tabIndex={-1}
              className="rounded-sm text-[0.9375rem] font-bold text-[var(--cr-ink)] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              Turn {turnIndex + 1}
            </h3>
            <span className={`inline-flex items-center gap-1.5 text-[0.8125rem] ${getTurnRoleLabelClass(message.role)}`}>
              <span
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${getTurnRoleDotClass(message.role)}`}
                aria-hidden
              />
              {message.role}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="cr-focus flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--cr-ink-3)] transition-colors hover:bg-[var(--cr-muted)] hover:text-[var(--cr-ink)]"
          aria-label={`Close Turn ${turnIndex + 1} evidence`}
          title="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-4 p-4">
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={previousTurnIndex === null}
            onClick={() => previousTurnIndex !== null && onSelectTurn(previousTurnIndex)}
            className="cr-btn cr-btn-secondary cr-focus h-8 min-w-0 px-2.5 text-xs disabled:opacity-35"
            aria-label="Previous scored turn"
          >
            <ChevronLeft className="h-3.5 w-3.5" /> Previous
          </button>
          <button
            type="button"
            disabled={nextTurnIndex === null}
            onClick={() => nextTurnIndex !== null && onSelectTurn(nextTurnIndex)}
            className="cr-btn cr-btn-secondary cr-focus h-8 min-w-0 px-2.5 text-xs disabled:opacity-35"
            aria-label="Next scored turn"
          >
            Next <ChevronRight className="h-3.5 w-3.5" />
          </button>
          {onFindOnPage && (
            <button
              type="button"
              onClick={onFindOnPage}
              className="cr-btn cr-btn-secondary cr-focus col-span-2 h-8 w-full px-2.5 text-xs"
            >
              <LocateFixed className="h-3.5 w-3.5" /> Find on page
            </button>
          )}
        </div>

        <section>
          <h4 className="mb-2 text-[0.8125rem] font-bold text-[var(--cr-ink)]">Scores</h4>
          <RichMetricResults
            scoreItem={scoreItem}
            presentationById={presentationById}
          />
        </section>
      </div>
    </div>
  );
};
