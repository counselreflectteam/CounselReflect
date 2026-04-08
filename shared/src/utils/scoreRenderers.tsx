import React from 'react';
import { LinkIcon } from 'lucide-react';
import { EMOTION_COLORS } from './emotionColors';
import { findMetricScore } from './metricUtils';

/**
 * Render a score cell for a metric in the table
 * Handles both numerical and categorical metrics with appropriate styling
 */
export const renderScoreCell = (
  metricName: string,
  scoreItem: any,
  results: any
): React.ReactNode => {
  const s = findMetricScore(metricName, scoreItem);

  // For conversation-level metrics, show a special indicator instead of dash
  if (!s) {
    // Check if this is a conversation-level metric
    if (results.conversationMetrics?.[metricName]) {
      return (
        <span className="text-purple-400 dark:text-purple-500 text-xs font-medium" title="Conversation-level metric">
          Conv
        </span>
      );
    }
    // Otherwise show a dash for utterance-level metrics with no data
    return <span className="text-slate-300 dark:text-slate-600 text-lg leading-none select-none">-</span>;
  }

  let displayContent: React.ReactNode;
  let bgColor = 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';

  if (s.type === 'numerical') {
    // -1 means rubric is not applicable to this utterance — show placeholder dash
    if (s.value === -1) {
      return <span className="text-slate-300 dark:text-slate-600 text-lg leading-none select-none" title="Not applicable">-</span>;
    }
    const ratio = s.value / s.max_value; // normalized 0-1
    const isHigherBetter = s.direction !== 'lower_is_better'; // Default to higher is better

    if (isHigherBetter) {
      if (ratio >= 0.7) bgColor = 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-200';
      else if (ratio >= 0.4) bgColor = 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-200';
      else bgColor = 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200';
    } else {
      // Lower is better (e.g. Toxicity)
      // Low score = Good (Green), High score = Bad (Red)
      if (ratio <= 0.3) bgColor = 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-200';
      else if (ratio <= 0.6) bgColor = 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-200';
      else bgColor = 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200';
    }

    displayContent = <span className="font-bold">{s.value.toFixed(2)}</span>;
  } else {
    // Check if it's an emotion and use specific color
    if (s.label && EMOTION_COLORS[s.label.toLowerCase()]) {
      const colors = EMOTION_COLORS[s.label.toLowerCase()];
      bgColor = `${colors.bg} ${colors.text} border border-transparent`;
    }
    // Fallback for other categorical metrics
    else if (['High', 'Change', 'Safe'].includes(s.label)) bgColor = 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-200';
    else if (['Medium'].includes(s.label)) bgColor = 'bg-blue-50 text-blue-700 dark:bg-blue-900/50 dark:text-blue-200';
    else if (['Low', 'Sustain', 'Toxic'].includes(s.label)) bgColor = 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-200';

    displayContent = <span className="text-xs font-semibold uppercase tracking-wider">{s.label}</span>;
  }

  const isAggregated = s.metadata?.aggregated;

  return (
    <div className="flex justify-center">
      <div className={`inline-flex items-center justify-center px-2 py-1 rounded-md shadow-sm min-w-[32px] ${bgColor} relative`}>
        {displayContent}
        {isAggregated && (
          <div className="absolute -top-2 -right-2 bg-indigo-50 dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 rounded-full p-0.5 shadow-sm border border-indigo-200 dark:border-slate-600 z-10" title="Score based on aggregated therapist turn">
            <LinkIcon className="w-3 h-3" />
          </div>
        )}
      </div>
    </div>
  );
};
