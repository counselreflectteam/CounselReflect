import type { EvaluationResult, UtteranceScore } from '@shared/types';

export type EvaluationPhase = 'predefined' | 'custom' | 'literature';

export interface ProgressState {
  currentPhase: EvaluationPhase | null;
  completedPhases: EvaluationPhase[];
  totalMetrics: number;
  completedMetrics: number;
  progressPercent: number;
  phaseProgress: {
    predefined: number;
    custom: number;
    literature: number;
  };
}

/**
 * Merge two evaluation results into one
 * Combines overallScores and utteranceScores from both results
 */
export const mergeResults = (
  result1: EvaluationResult | null, 
  result2: EvaluationResult | null
): EvaluationResult | null => {
  if (!result1) return result2;
  if (!result2) return result1;

  const mergedOverallScores = { ...result1.overallScores, ...result2.overallScores };
  // Merge rawResults from all phases so isMetricSuccessful can find every metric
  const mergedRawResults = { ...(result1.rawResults ?? {}), ...(result2.rawResults ?? {}) };
  const mergedUtteranceScores: UtteranceScore[] = [];

  const allMessageIds = new Set([
    ...result1.utteranceScores.map(u => u.messageId),
    ...result2.utteranceScores.map(u => u.messageId)
  ]);

  for (const messageId of allMessageIds) {
    const utt1 = result1.utteranceScores.find(u => u.messageId === messageId);
    const utt2 = result2.utteranceScores.find(u => u.messageId === messageId);

    if (utt1 && utt2) {
      mergedUtteranceScores.push({
        messageId,
        metrics: { ...utt1.metrics, ...utt2.metrics },
        reasoning: { ...utt1.reasoning, ...utt2.reasoning }
      });
    } else if (utt1) {
      mergedUtteranceScores.push(utt1);
    } else if (utt2) {
      mergedUtteranceScores.push(utt2);
    }
  }

  return {
    timestamp: Date.now(),
    overallScores: mergedOverallScores,
    utteranceScores: mergedUtteranceScores,
    ...(Object.keys(mergedRawResults).length > 0 && { rawResults: mergedRawResults })
  };
};

/**
 * Get human-readable label for an evaluation phase
 */
export const getPhaseLabel = (
  phase: EvaluationPhase,
  counts: { predefined: number; custom: number; literature: number }
): string => {
  switch (phase) {
    case 'predefined': 
      return `Research-Trained Metrics (${counts.predefined})`;
    case 'custom': 
      return `Custom Metrics (${counts.custom})`;
    case 'literature': 
      return `Literature-Derived Metrics (${counts.literature})`;
  }
};

/**
 * Calculate which phases need to run based on selected metrics
 */
export const calculatePhasesToRun = (
  predefinedCount: number,
  customCount: number,
  literatureCount: number,
  hasLockedProfile: boolean
): EvaluationPhase[] => {
  const phases: EvaluationPhase[] = [];
  
  if (predefinedCount > 0) phases.push('predefined');
  if (customCount > 0 && hasLockedProfile) phases.push('custom');
  if (literatureCount > 0) phases.push('literature');
  
  return phases;
};

/**
 * Validate that evaluation can proceed
 * Returns error message if validation fails, null if valid
 */
export const validateEvaluation = (
  predefinedCount: number,
  customCount: number,
  literatureCount: number,
  hasLockedProfile: boolean
): string | null => {
  const hasPredefinedMetrics = predefinedCount > 0;
  const hasCustomMetrics = customCount > 0 && hasLockedProfile;
  const hasLiteratureMetrics = literatureCount > 0;

  if (!hasPredefinedMetrics && !hasCustomMetrics && !hasLiteratureMetrics) {
    return 'Please select at least one metric to evaluate';
  }

  if (customCount > 0 && !hasLockedProfile) {
    return 'Please lock the profile for your custom metrics before running evaluation';
  }

  return null;
};
