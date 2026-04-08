import React from 'react';
import { Sparkles, RefreshCw } from 'lucide-react';
import { SummaryResponse } from '@shared/services/summaryService';

interface SummarySectionProps {
  summary: SummaryResponse | null;
  isLoadingSummary: boolean;
  summaryError: string | null;
  scoreStats: any;
  results: any; // Add results as prop instead of using context
  onRegenerate: () => void;
  /** When true (extension only), replace "Line N" with "Turn N" in displayed text */
  replaceLineWithTurn?: boolean;
}

/**
 * AI-generated summary section with strengths and areas for improvement
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
  scoreStats,
  results,
  onRegenerate,
  replaceLineWithTurn = false
}) => {

  const getMetricDirection = (metricName: string): string | undefined => {
    if (!results) return undefined;

    // 1. Try to find in utterance scores (most common)
    const utteranceWithMetric = results.utteranceScores.find(
      u => u.metrics && u.metrics[metricName]
    );
    if (utteranceWithMetric) {
      const score = utteranceWithMetric.metrics[metricName];
      if (score.type === 'numerical') {
        return score.direction;
      }
    }

    // 2. Try to find in conversation metrics
    if (results.conversationMetrics && results.conversationMetrics[metricName]) {
      const score = results.conversationMetrics[metricName].score;
      if (score.type === 'numerical') {
        return score.direction;
      }
    }

    return undefined;
  };

  const getScoreColorClass = (val: number, maxVal: number, direction: string | undefined): string => {
    const ratio = maxVal > 0 ? val / maxVal : 0;
    const isLowerBetter = direction === 'lower_is_better';

    if (isLowerBetter) {
      if (ratio >= 0.8) return 'text-red-600 dark:text-red-400';
      if (ratio >= 0.6) return 'text-amber-600 dark:text-amber-400';
      if (ratio >= 0.4) return 'text-blue-600 dark:text-blue-400';
      return 'text-emerald-600 dark:text-emerald-400';
    }

    // Higher is better (default)
    if (ratio >= 0.8) return 'text-emerald-600 dark:text-emerald-400';
    if (ratio >= 0.6) return 'text-blue-600 dark:text-blue-400';
    if (ratio >= 0.4) return 'text-amber-600 dark:text-amber-400';
    return 'text-red-600 dark:text-red-400';
  };

  const formatScoreDisplay = (avg: number, maxVal: number): string => {
    const decimals = maxVal <= 1 ? 1 : 2;
    return `${avg.toFixed(decimals)}/${maxVal}`;
  };

  return (
    <div className="animate-fade-in-up">
      <div className="bg-gradient-to-br from-white via-slate-50 to-indigo-50/30 dark:from-slate-800 dark:via-slate-800 dark:to-indigo-900/10 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 shadow-lg hover:shadow-xl transition-all duration-300 p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <div className="p-3 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl shadow-lg shadow-emerald-500/30">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100">Evaluation Summary</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">AI-generated strengths and improvements</p>
            </div>
          </div>
          {summary && (
            <button
              onClick={onRegenerate}
              disabled={isLoadingSummary}
              className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg transition-colors"
              title="Regenerate summary"
            >
              <RefreshCw className={`w-5 h-5 ${isLoadingSummary ? 'animate-spin' : ''}`} />
            </button>
          )}
        </div>

        <div>
          {isLoadingSummary && (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="relative">
                <div className="w-12 h-12 rounded-full border-4 border-indigo-100 dark:border-indigo-900"></div>
                <div className="w-12 h-12 rounded-full border-4 border-indigo-500 border-t-transparent animate-spin absolute top-0"></div>
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-4">Generating summary...</p>
            </div>
          )}

          {summaryError && !isLoadingSummary && (
            <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-4 border border-red-200 dark:border-red-800">
              <p className="text-sm text-red-600 dark:text-red-400 mb-2">{summaryError}</p>
              <button
                onClick={onRegenerate}
                className="text-sm text-red-700 dark:text-red-300 hover:underline"
              >
                Try again
              </button>
            </div>
          )}

          {summary && !isLoadingSummary && (
            <div className="space-y-8">
              {/* Performance Overview */}
              {scoreStats && (scoreStats.hasNumerical || scoreStats.hasCategorical) && (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                  {/* Numerical Metrics */}
                  {scoreStats.numericalMetricAverages.map((metric: any, idx: number) => {
                    const maxVal = metric.max_value ?? 5;
                    return (
                      <div
                        key={`num-${idx}`}
                        className="bg-white dark:bg-slate-800/50 rounded-xl p-4 border border-slate-100 dark:border-slate-700 shadow-sm hover:shadow-md transition-shadow h-[80px] flex flex-col justify-center"
                      >
                        <div className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider truncate mb-1" title={metric.name}>
                          {metric.name}
                        </div>
                        <div className={`text-xl font-bold ${getScoreColorClass(metric.avg, maxVal, getMetricDirection(metric.name))}`}>
                          {formatScoreDisplay(metric.avg, maxVal)}
                        </div>
                      </div>
                    );
                  })}

                  {/* Categorical Metrics */}
                  {scoreStats.mostFrequentCategories.map((cat: any, idx: number) => (
                    <div
                      key={`cat-${idx}`}
                      className="bg-white dark:bg-slate-800/50 rounded-xl p-4 border border-purple-100 dark:border-purple-900/30 shadow-sm hover:shadow-md transition-shadow h-[80px] flex flex-col justify-center"
                    >
                      <div className="text-[10px] text-purple-500 dark:text-purple-400 uppercase tracking-wider truncate mb-1" title={cat.metricName}>
                        {cat.metricName}
                      </div>
                      <div className="text-sm font-bold text-purple-700 dark:text-purple-300 truncate" title={cat.label}>
                        {cat.label}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Strengths & Improvements */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {summary.strengths && summary.strengths.length > 0 && (
                  <div className="relative group p-6 border border-emerald-100 dark:border-emerald-800/50 rounded-2xl overflow-hidden">
                     <div className="absolute inset-0 bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 opacity-50 group-hover:opacity-100 transition-opacity"></div>
                     <div className="relative z-10">
                      <h4 className="flex items-center gap-3 text-lg font-bold text-emerald-800 dark:text-emerald-300 mb-4">
                        <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center shadow-sm">
                           <span className="text-emerald-600 dark:text-emerald-400 text-sm">✓</span>
                        </div>
                        Strengths
                      </h4>
                      <ul className="space-y-3">
                        {summary.strengths.map((item, idx) => (
                          <li key={idx} className="flex items-start gap-3 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                             <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0"></span>
                             <span>{replaceLineWithTurn ? replaceLineWithTurnInText(item) : item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}

                {summary.areas_for_improvement && summary.areas_for_improvement.length > 0 && (
                  <div className="relative group p-6 border border-amber-100 dark:border-amber-800/50 rounded-2xl overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 opacity-50 group-hover:opacity-100 transition-opacity"></div>
                    <div className="relative z-10">
                      <h4 className="flex items-center gap-3 text-lg font-bold text-amber-800 dark:text-amber-300 mb-4">
                        <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center shadow-sm">
                           <span className="text-amber-600 dark:text-amber-400 text-base">!</span>
                        </div>
                        Areas for Improvement
                      </h4>
                      <ul className="space-y-3">
                        {summary.areas_for_improvement.map((item, idx) => (
                          <li key={idx} className="flex items-start gap-3 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                            <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0"></span>
                            <span>{replaceLineWithTurn ? replaceLineWithTurnInText(item) : item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
