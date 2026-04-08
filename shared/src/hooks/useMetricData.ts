import { useMemo } from 'react';
import { filterMetricNames, buildMetricLabelMap } from '../utils/metricUtils';

/**
 * Custom hook to process and organize metric data
 */
export const useMetricData = (
  results: any,
  selectedPredefinedMetrics: any[],
  selectedCustomizedMetrics: any[],
  selectedLiteratureMetrics: string[]  // array of metric name strings
) => {
  // Extract and filter metric names
  const metricNames = useMemo(() => {
    if (!results) return [];
    return filterMetricNames(results);
  }, [results]);

  // Build metric label map
  const metricLabelMap = useMemo(() => {
    return buildMetricLabelMap(
      selectedPredefinedMetrics,
      selectedCustomizedMetrics,
      selectedLiteratureMetrics
    );
  }, [selectedPredefinedMetrics, selectedCustomizedMetrics, selectedLiteratureMetrics]);

  return {
    metricNames,
    metricLabelMap
  };
};
