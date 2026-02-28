import { useMemo } from 'react';

interface ScoreStats {
  avgScore: string;
  numericalMetricAverages: { name: string; avg: number; max_value: number }[];
  mostFrequentCategories: { metricName: string; label: string }[];
  hasNumerical: boolean;
  hasCategorical: boolean;
}

/**
 * Custom hook to compute statistics from evaluation results
 */
export const useScoreStats = (results: any): ScoreStats | null => {
  return useMemo(() => {
    if (!results) return null;

    const allScores: number[] = [];
    const categoryCountsMap: Record<string, Record<string, number>> = {};
    const metricScores: Record<string, number[]> = {};
    const metricMaxValues: Record<string, number> = {};

    // Collect all numerical scores and categorical values
    // Skip scores with value -1 (not applicable turns for literature metrics)
    results.utteranceScores.forEach((utterance: any) => {
      Object.entries(utterance.metrics).forEach(([metricName, metricData]: [string, any]) => {
        if (metricData?.type === 'numerical' && typeof metricData.value === 'number') {
          // Exclude -1 (not applicable) scores from all averages
          if (metricData.value === -1) return;
          allScores.push(metricData.value);
          if (!metricScores[metricName]) metricScores[metricName] = [];
          metricScores[metricName].push(metricData.value);
          if (metricData.max_value != null && metricMaxValues[metricName] == null) {
            metricMaxValues[metricName] = Number(metricData.max_value);
          }
        } else if (metricData?.type === 'categorical' && metricData.label) {
          // Exclude "-1" (not applicable) categorical labels
          if (metricData.label === '-1') return;
          if (!categoryCountsMap[metricName]) categoryCountsMap[metricName] = {};
          categoryCountsMap[metricName][metricData.label] = (categoryCountsMap[metricName][metricData.label] || 0) + 1;
        }
      });
    });

    // Also check overallScores
    Object.entries(results.overallScores || {}).forEach(([metricName, metricData]: [string, any]) => {
      if (metricData?.type === 'numerical' && typeof metricData.value === 'number') {
        // Exclude -1 (not applicable)
        if (metricData.value === -1) return;
        if (!metricScores[metricName]) {
          metricScores[metricName] = [metricData.value];
          allScores.push(metricData.value);
        }
        if (metricData.max_value != null && metricMaxValues[metricName] == null) {
          metricMaxValues[metricName] = Number(metricData.max_value);
        }
      }
    });

    // Calculate per-metric averages for numerical metrics
    const numericalMetricAverages: { name: string; avg: number; max_value: number }[] = [];
    Object.entries(metricScores).forEach(([name, scores]) => {
      const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
      const max_value = metricMaxValues[name] ?? 5;
      numericalMetricAverages.push({ name, avg, max_value });
    });
    // Sort by normalized average (ratio) descending so metrics with different scales are comparable
    numericalMetricAverages.sort((a, b) => {
      const ratioA = a.max_value > 0 ? a.avg / a.max_value : 0;
      const ratioB = b.max_value > 0 ? b.avg / b.max_value : 0;
      return ratioB - ratioA;
    });

    // Calculate overall average
    const avgScore = allScores.length > 0 ? (allScores.reduce((a, b) => a + b, 0) / allScores.length) : 0;

    // Find most frequent category for each categorical metric
    const mostFrequentCategories: { metricName: string; label: string }[] = [];
    Object.entries(categoryCountsMap).forEach(([metricName, counts]) => {
      const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
      if (sorted.length > 0) {
        mostFrequentCategories.push({ metricName, label: sorted[0][0] });
      }
    });

    return {
      avgScore: avgScore.toFixed(2),
      numericalMetricAverages,
      mostFrequentCategories,
      hasNumerical: numericalMetricAverages.length > 0,
      hasCategorical: mostFrequentCategories.length > 0
    };
  }, [results]);
};
