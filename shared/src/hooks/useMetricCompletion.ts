import { useEvaluationState, useMetrics } from '../context';

export interface MetricCompletionItem {
  id: string;
  label: string;
  isSuccessful: boolean;
  definition?: string;
}

export interface MetricCompletion {
  predefinedMetrics: MetricCompletionItem[];
  literatureMetrics: MetricCompletionItem[];
  customizedMetrics: MetricCompletionItem[];
  totalSuccessCount: number;
  totalMetricCount: number;
  hasFailures: boolean;
}

/**
 * Single source of truth for "how many selected metrics actually produced scores".
 *
 * Shared by the run-trust verdict tile and the run-completeness (integrity) panel so the two
 * can never disagree. A metric counts as completed only if it produced usable results
 * (rawResults / overallScores / utteranceScores) — a metric that ran without a stream error
 * but returned nothing is correctly counted as NOT completed.
 */
export const useMetricCompletion = (): MetricCompletion => {
  const { results, runMetadata } = useEvaluationState();
  const { selectedPredefinedMetrics, selectedCustomizedMetrics, selectedLiteratureMetrics } = useMetrics();

  const isMetricSuccessful = (metricName: string | undefined | null): boolean => {
    if (!results) return false;
    if (!metricName) return false;

    const candidates = [
      metricName,
      metricName.toLowerCase(),
      metricName.toLowerCase().replace(/ /g, '_')
    ];
    const hasKey = (obj: any) => candidates.some(k => obj?.[k] !== undefined);

    if (results.rawResults) {
      const matchingRawKey = candidates.find(k => results.rawResults?.[k]);
      if (matchingRawKey) {
        const rawMetric = results.rawResults[matchingRawKey];
        if (rawMetric.overall && Object.keys(rawMetric.overall).length > 0) return true;
        if (Array.isArray(rawMetric.per_utterance) && rawMetric.per_utterance.length > 0) return true;
        // Keep in step with hasSuccessfulMetricResult (useEvaluation.ts):
        // segment-scored metrics are successful runs too, or they would merge
        // into results yet display as "Failed" in the run-integrity panel.
        if (Array.isArray(rawMetric.per_segment) && rawMetric.per_segment.length > 0) return true;
      }
    }
    if (results.overallScores && hasKey(results.overallScores)) return true;
    if (results.utteranceScores) {
      return results.utteranceScores.some((u: any) => {
        if (!u.metrics) return false;
        if (hasKey(u.metrics)) return true;
        return Object.keys(u.metrics).some(k => candidates.some(c => k.startsWith(c + '_')));
      });
    }
    return false;
  };

  const labelFor = (name: string) => runMetadata?.metricLabelMap?.[name] || name;

  // name -> definition, sourced from the selected metric objects still held in context
  const predefinedDef = new Map<string, string>(
    selectedPredefinedMetrics.filter((m) => m?.name).map((m) => [m.name, m.description || ''] as [string, string])
  );
  const literatureDef = new Map<string, string>(
    selectedLiteratureMetrics.filter((m) => m?.metricName).map((m) => [m.metricName, m.definition || ''] as [string, string])
  );
  const customizedDef = new Map<string, string>(
    selectedCustomizedMetrics.filter((m) => m?.name).map((m) => [m.name, m.definition || m.description || ''] as [string, string])
  );
  const cleanDef = (value?: string) => (value && value.trim() ? value : undefined);
  const uniqueMetricNames = (names: string[]) => Array.from(new Set(names.filter(Boolean)));

  const uniqueByName = <T,>(items: T[], getName: (item: T) => string | undefined): T[] => {
    const seen = new Set<string>();
    return items.filter((item) => {
      const name = getName(item);
      if (!name || seen.has(name)) return false;
      seen.add(name);
      return true;
    });
  };

  const predefinedMetrics: MetricCompletionItem[] = runMetadata?.metricGroups
    ? uniqueMetricNames(runMetadata.metricGroups.predefined).map((name) => ({ id: name, label: labelFor(name), isSuccessful: isMetricSuccessful(name), definition: cleanDef(predefinedDef.get(name)) }))
    : uniqueByName(selectedPredefinedMetrics, (m) => m?.name).map((m) => ({ id: m.name, label: m.label || m.name, isSuccessful: isMetricSuccessful(m.name), definition: cleanDef(m.description) }));
  const literatureMetrics: MetricCompletionItem[] = runMetadata?.metricGroups
    ? uniqueMetricNames(runMetadata.metricGroups.literature).map((name) => ({ id: name, label: labelFor(name), isSuccessful: isMetricSuccessful(name), definition: cleanDef(literatureDef.get(name)) }))
    : uniqueByName(selectedLiteratureMetrics, (m) => m?.metricName).map((m) => ({ id: m.metricName, label: m.metricName, isSuccessful: isMetricSuccessful(m.metricName), definition: cleanDef(m.definition) }));
  const customizedMetrics: MetricCompletionItem[] = runMetadata?.metricGroups
    ? uniqueMetricNames(runMetadata.metricGroups.custom).map((name) => ({ id: name, label: labelFor(name), isSuccessful: isMetricSuccessful(name), definition: cleanDef(customizedDef.get(name)) }))
    : uniqueByName(selectedCustomizedMetrics, (m) => m?.name).map((m) => ({ id: m.name, label: m.name, isSuccessful: isMetricSuccessful(m.name), definition: cleanDef(m.definition || m.description) }));

  const totalMetricCount = predefinedMetrics.length + literatureMetrics.length + customizedMetrics.length;
  const totalSuccessCount =
    predefinedMetrics.filter((m) => m.isSuccessful).length +
    literatureMetrics.filter((m) => m.isSuccessful).length +
    customizedMetrics.filter((m) => m.isSuccessful).length;
  const hasFailures = totalMetricCount > 0 && totalSuccessCount < totalMetricCount;

  return { predefinedMetrics, literatureMetrics, customizedMetrics, totalSuccessCount, totalMetricCount, hasFailures };
};
