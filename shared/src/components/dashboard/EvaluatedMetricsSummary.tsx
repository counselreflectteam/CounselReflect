import React, { useMemo } from 'react';
import { useEvaluationState, useMetrics } from '@shared/context';

export const EvaluatedMetricsSummary: React.FC = () => {
  const { results, status } = useEvaluationState();
  const { selectedPredefinedMetrics, selectedCustomizedMetrics, selectedLiteratureMetrics } = useMetrics();

  if (!results) return null;

  // Check if a metric has any results (overall or per-utterance)
  const isMetricSuccessful = (metricName: string | undefined | null): boolean => {
    if (!results) return false;
    if (!metricName) return false;

    // Normalize metric name for lookup (try original, lowercased, and snake_case)
    const candidates = [
      metricName, 
      metricName.toLowerCase(), 
      metricName.toLowerCase().replace(/ /g, '_')
    ];
    
    // Helper to check if any candidate key exists in an object
    const hasKey = (obj: any) => candidates.some(k => obj?.[k] !== undefined);

    // 1. Check rawResults
    if (results.rawResults) {
      const matchingRawKey = candidates.find(k => results.rawResults?.[k]);
      if (matchingRawKey) {
        const rawMetric = results.rawResults[matchingRawKey];
        if (rawMetric.overall && Object.keys(rawMetric.overall).length > 0) return true;
        if (Array.isArray(rawMetric.per_utterance) && rawMetric.per_utterance.length > 0) {
           return true; 
        }
      }
    }
    
    // 2. Check overall scores
    if (results.overallScores && hasKey(results.overallScores)) {
      return true;
    }
    
    // 3. Check utterance scores
    if (results.utteranceScores) {
      return results.utteranceScores.some((u: any) => {
        if (!u.metrics) return false;
        
        if (hasKey(u.metrics)) return true;

        return Object.keys(u.metrics).some(k => 
          candidates.some(c => k.startsWith(c + '_'))
        );
      });
    }
    
    return false;
  };

  const predefinedSuccessCount = selectedPredefinedMetrics.filter(m => m?.name && isMetricSuccessful(m.name)).length;
  const literatureSuccessCount = selectedLiteratureMetrics.filter(m => m?.metricName && isMetricSuccessful(m.metricName)).length;
  const customizedSuccessCount = selectedCustomizedMetrics.filter(m => m?.name && isMetricSuccessful(m.name)).length;
  const predefinedMetrics = selectedPredefinedMetrics.filter(m => m?.name).map(m => ({
    id: m.name,
    label: m.label || m.name,
    isSuccessful: isMetricSuccessful(m.name),
  }));
  const literatureMetrics = selectedLiteratureMetrics.filter(m => m?.metricName).map(m => ({
    id: m.metricName,
    label: m.metricName,
    isSuccessful: isMetricSuccessful(m.metricName),
  }));
  const customizedMetrics = selectedCustomizedMetrics.filter(m => m?.name).map(m => ({
    id: m.id,
    label: m.name,
    isSuccessful: isMetricSuccessful(m.name),
  }));

  return (
    <div className="bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 rounded-xl p-6 border border-indigo-100 dark:border-indigo-800">
      <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-4">Evaluated Metrics Summary</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <MetricSummaryList
          title="Research-Trained Metrics"
          icon="📊"
          metrics={predefinedMetrics}
          successCount={predefinedSuccessCount}
          colorClass="text-indigo-600 dark:text-indigo-400"
        />
        
        <MetricSummaryList
          title="Literature-Derived Metrics"
          icon="📚"
          metrics={literatureMetrics}
          successCount={literatureSuccessCount}
          colorClass="text-emerald-600 dark:text-emerald-400"
        />
        
        <MetricSummaryList
          title="Custom Metrics"
          icon="⚙️"
          metrics={customizedMetrics}
          successCount={customizedSuccessCount}
          colorClass="text-amber-600 dark:text-amber-400"
        />
      </div>
    </div>
  );
};

const MetricSummaryList: React.FC<{
  title: string;
  icon: string;
  metrics: Array<{ id: string; label: string; isSuccessful: boolean }>;
  successCount: number;
  colorClass: string;
}> = ({ title, icon, metrics, successCount, colorClass }) => {
  const failedCount = Math.max(0, metrics.length - successCount);

  return (
    <div>
      <h4 className={`text-sm font-medium mb-2 flex flex-wrap items-center gap-2 ${colorClass}`}>
        <span className="text-base">{icon}</span>
        {title}
        {metrics.length > 0 && (
          <span className="text-slate-500 dark:text-slate-400 font-normal">
            ({successCount} succeeded, {failedCount} failed)
          </span>
        )}
      </h4>
      <ul className="text-sm text-slate-600 dark:text-slate-400 space-y-1.5">
        {metrics.map(m => (
          <li key={m.id} className="flex items-center justify-between gap-3">
            <span className="truncate">- {m.label}</span>
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium whitespace-nowrap ${
                m.isSuccessful
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                  : 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300'
              }`}
            >
              {m.isSuccessful ? 'Succeeded' : 'Failed'}
            </span>
          </li>
        ))}
        {metrics.length === 0 && <li className="text-slate-400 dark:text-slate-500">None selected</li>}
      </ul>
    </div>
  );
};
