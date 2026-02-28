import React from 'react';
import { renderHighlightedContent } from '@shared/utils/highlightContent';
import { renderScoreCell } from '@shared/utils/scoreRenderers';
import { findMetricScore } from '@shared/utils/metricUtils';

interface TurnDetailViewProps {
  turnIndex: number;
  results: any;
  conversation: any;
  metricNames: string[];
  metricLabelMap: Record<string, string>;
  selectedLiteratureMetrics: string[];
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
  onClose
}) => {
  const scoreItem = results.utteranceScores[turnIndex];
  if (!scoreItem) return null;

  const msg = conversation.messages.find((m: any) => m.id === scoreItem.messageId);

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-md p-6 transition-all duration-300 animate-in fade-in slide-in-from-bottom-4">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
          Detailed Analysis: Turn #{turnIndex + 1}
        </h3>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 text-sm"
        >
          Close Details
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Conversation Context */}
        <div className="space-y-4">
          <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-4 border border-slate-100 dark:border-slate-700">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2 block">Full Response</span>
            <p className="text-slate-700 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">
              {msg ? renderHighlightedContent(msg.content, scoreItem, selectedLiteratureMetrics) : null}
            </p>
          </div>
        </div>

        {/* Metrics Breakdown */}
        <div className="space-y-4">
          {metricNames.map(name => {
            const s = findMetricScore(name, scoreItem);
            const reason = scoreItem.reasoning?.[name] ?? null;

            if (!s) return null;
            // Skip metrics that are not applicable to this turn (score === -1)
            if (s.type === 'numerical' && s.value === -1) return null;
            if (s.type === 'categorical' && s.label === '-1') return null;

            return (
              <div key={name} className="border-b border-slate-100 dark:border-slate-700 pb-4 last:border-0">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-slate-800 dark:text-slate-100">{metricLabelMap[name] || name}</span>
                  {renderScoreCell(name, scoreItem, results)}
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">{reason || "No detailed reasoning provided."}</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
