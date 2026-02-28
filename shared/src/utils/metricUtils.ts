/**
 * Utility functions for metric processing
 */

/**
 * Determine if a metric is numerical or categorical
 */
export const getMetricType = (
  metricName: string,
  results: any
): 'numerical' | 'categorical' | null => {
  // Check if any utterance has a numerical score for this metric
  const hasNumerical = results.utteranceScores.some((u: any) =>
    u.metrics[metricName]?.type === 'numerical'
  );
  if (hasNumerical) return 'numerical';

  // Fallback to checking the first available one (likely categorical if no numerical found)
  const firstScore = results.utteranceScores.find((u: any) => {
    const metric = u.metrics[metricName];
    return metric !== undefined;
  });

  if (!firstScore?.metrics[metricName]) return null;
  return firstScore.metrics[metricName].type;
};

/**
 * Filter and deduplicate metric names from results
 * Special handling: removes 'reccon' if 'emotion' is present
 */
export const filterMetricNames = (results: any): string[] => {
  const metricNamesSet = new Set<string>();

  // Add from overallScores (predefined and custom metrics)
  Object.keys(results.overallScores).forEach(name => metricNamesSet.add(name));

  // Add from utteranceScores (literature metrics and per-utterance metrics)
  results.utteranceScores.forEach((scoreItem: any) => {
    Object.keys(scoreItem.metrics).forEach(name => metricNamesSet.add(name));
  });

  // Filter out 'reccon' if 'emotion' is also present (as they share the same underlying model)
  if (metricNamesSet.has('emotion') && metricNamesSet.has('reccon')) {
    metricNamesSet.delete('reccon');
  }

  return Array.from(metricNamesSet);
};

/**
 * Build a map from metric name to display label
 */
export const buildMetricLabelMap = (
  selectedPredefinedMetrics: any[],
  selectedCustomizedMetrics: any[],
  selectedLiteratureMetrics: string[]  // array of metric name strings
): Record<string, string> => {
  const metricLabelMap: Record<string, string> = {};

  selectedPredefinedMetrics.forEach(m => {
    metricLabelMap[m.name] = m.label;
  });

  selectedCustomizedMetrics.forEach(m => {
    metricLabelMap[m.name] = m.name; // Custom metrics use name as label
  });

  // Literature metrics: each entry is just a string name
  selectedLiteratureMetrics.forEach(name => {
    metricLabelMap[name] = name;
  });

  return metricLabelMap;
};

/**
 * Find a metric score, including sub-metrics (e.g., emotion_analysis -> emotion_sum_negative)
 */
export const findMetricScore = (metricName: string, scoreItem: any): any => {
  // First try to find the score using the metric name
  let s = scoreItem.metrics?.[metricName];

  // If not found, check for sub-metrics
  if (!s && scoreItem.metrics) {
    const subMetricKey = Object.keys(scoreItem.metrics).find(key =>
      key.startsWith(metricName) || key.includes(metricName.replace('_analysis', ''))
    );
    if (subMetricKey) {
      s = scoreItem.metrics[subMetricKey];
    }
  }

  return s;
};
