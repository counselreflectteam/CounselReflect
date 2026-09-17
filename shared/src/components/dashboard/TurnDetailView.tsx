import React from 'react';
import { X } from 'lucide-react';
import { renderHighlightedContent } from '@shared/utils/highlightContent';
import { renderScoreCell } from '@shared/utils/scoreRenderers';
import { findMetricScore, getNotApplicableCopy } from '@shared/utils/metricUtils';
import { getTurnRoleLabelClass, getTurnRoleDotClass } from './turnDisplayUtils';

interface TurnDetailViewProps {
  turnIndex: number;
  results: any;
  conversation: any;
  metricNames: string[];
  metricLabelMap: Record<string, string>;
  selectedLiteratureMetrics: string[];
  trainedModelMetricNames?: string[];
  layout?: 'default' | 'compact';
  onClose: () => void;
}

/**
 * Detailed view of a single conversation turn with all metrics
 */
export const TurnDetailView: React.FC<TurnDetailViewProps> = ({
  turnIndex,
  results,
  conversation,
  metricNames,
  metricLabelMap,
  selectedLiteratureMetrics,
  trainedModelMetricNames = [],
  layout = 'default',
  onClose
}) => {
  const scoreItem = results.utteranceScores[turnIndex];
  if (!scoreItem) return null;

  const msg = conversation.messages.find((m: any) => m.id === scoreItem.messageId);
  const trainedModelMetricSet = new Set(trainedModelMetricNames);

  const applicableMetrics = metricNames
    .map(name => {
      const score = findMetricScore(name, scoreItem);
      if (!score) return null;
      if (score.type === 'numerical' && score.value === -1) return null;
      if (score.type === 'categorical' && score.label === '-1') return null;

      return {
        name,
        score,
        reason: scoreItem.reasoning?.[name] ?? null,
        isTrainedModel: trainedModelMetricSet.has(name),
      };
    })
    .filter(Boolean);
  const notApplicableMetrics = metricNames
    .map(name => {
      const score = findMetricScore(name, scoreItem);
      if (!score) return null;
      if (score.type === 'numerical' && score.value === -1) return { name };
      if (score.type === 'categorical' && score.label === '-1') return { name };
      return null;
    })
    .filter(Boolean);
  const notApplicableCopy = notApplicableMetrics.length > 0
    ? getNotApplicableCopy((notApplicableMetrics[0] as { name: string }).name)
    : getNotApplicableCopy('');
  const isCompact = layout === 'compact';

  return (
    <div className={`cr-card cr-enter ${
      isCompact ? 'flex h-[650px] flex-col overflow-hidden' : ''
    }`}>
      <div className="flex items-start justify-between gap-4 border-b border-[var(--cr-card-border)] px-5 py-4">
        <div className="flex min-w-0 flex-wrap items-baseline gap-2">
          <h3 className="text-[0.9375rem] font-bold text-[var(--cr-ink)]">
            Turn {turnIndex + 1}
          </h3>
          {msg && (
            <span className={`inline-flex items-center gap-1.5 text-[0.8125rem] ${getTurnRoleLabelClass(msg.role)}`}>
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${getTurnRoleDotClass(msg.role)}`} aria-hidden />
              {msg.role}
            </span>
          )}
          <span className="cr-meta">
            {applicableMetrics.length} scored
          </span>
        </div>
        <button
          onClick={onClose}
          className="cr-focus flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--cr-ink-3)] transition-colors hover:bg-[var(--cr-muted)] hover:text-[var(--cr-ink)]"
          aria-label="Close turn details"
          title="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className={
        isCompact
          ? 'custom-scrollbar flex-1 space-y-4 overflow-y-auto p-4'
          : 'grid grid-cols-1 gap-4 p-5 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]'
      }>
        {/* Conversation Context */}
        <div className="min-w-0">
          <h4 className="mb-2 text-[0.9375rem] font-bold text-[var(--cr-ink)]">Full response</h4>
          <div className="cr-panel p-4">
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--cr-ink)]">
              {msg ? renderHighlightedContent(msg.content, scoreItem, selectedLiteratureMetrics) : null}
            </p>
          </div>
        </div>

        {/* Metrics Breakdown */}
        <div className="min-w-0">
          <h4 className="mb-2 text-[0.9375rem] font-bold text-[var(--cr-ink)]">Metric details</h4>
          {applicableMetrics.length > 0 ? (
            <div className="divide-y divide-[var(--cr-card-border)]">
              {applicableMetrics.map((metric: any) => (
                <div key={metric.name} className="py-4">
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <span className="min-w-0 text-sm font-bold text-[var(--cr-ink)]">
                      {metricLabelMap[metric.name] || metric.name}
                    </span>
                    <div className="shrink-0">
                      {renderScoreCell(metric.name, scoreItem, results)}
                    </div>
                  </div>
                  <p className="text-sm leading-6 text-[var(--cr-ink-2)]">
                    {metric.reason || (
                      metric.isTrainedModel
                        ? 'This trained model returns its defined label or score without generated reasoning. This is expected.'
                        : 'No supporting reasoning was returned for this result.'
                    )}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="cr-panel mt-3 p-4 text-sm text-[var(--cr-ink-2)]">
              <p className="font-bold text-[var(--cr-ink)]">
                {notApplicableMetrics.length > 0 ? notApplicableCopy.turnTitle : 'No metric scores for this turn'}
              </p>
              <p className="mt-1 leading-6">
                {notApplicableMetrics.length > 0
                  ? notApplicableCopy.turnDescription
                  : 'This turn did not receive any metric-level output.'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
