import { useState, useRef, useCallback } from 'react';
import { evaluatePretrainedModelStream } from '../services/pretrainedMetricsService';
import { evaluateCustomMetricsStream } from '../services/customMetricsService';
import { evaluateLiteratureMetricsStream } from '../services/literatureMetricsService';
import {
  EvaluationResult, 
  Conversation,
  EvaluationStatus
} from '../types';
import { mergeResults, EvaluationPhase, ProgressState } from '../utils/evaluationUtils';
import { transformStandardizedResponse } from '../services/transformers/evaluationTransformer';

export { EvaluationStatus };

const PHASE_TIMEOUT_MS = 12000_000;

const isCanceledError = (error: any): boolean => {
  return (
    error?.name === 'AbortError' ||
    error?.name === 'CanceledError' ||
    error?.message === 'CanceledError'
  );
};

const hasSuccessfulMetricResult = (metricResult: any): boolean => {
  if (!metricResult) return false;
  if (metricResult.overall) return true;
  if (Array.isArray(metricResult.per_utterance) && metricResult.per_utterance.length > 0) return true;
  if (Array.isArray(metricResult.per_segment) && metricResult.per_segment.length > 0) return true;
  return false;
};

const getSuccessfulMetricNamesFromResult = (result: EvaluationResult | null): string[] => {
  const rawResults = result?.rawResults;
  if (!rawResults || typeof rawResults !== 'object') return [];
  return Object.entries(rawResults)
    .filter(([, metricResult]) => hasSuccessfulMetricResult(metricResult))
    .map(([metricName]) => metricName);
};

const withTimeout = async <T>(
  task: Promise<T>,
  timeoutMs: number,
  label: string,
  signal?: AbortSignal
): Promise<T> => {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${Math.round(timeoutMs / 1000)}s`));
    }, timeoutMs);

    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error('CanceledError'));
    };

    if (signal) {
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener('abort', onAbort, { once: true });
    }

    task.then(
      (value) => {
        clearTimeout(timer);
        if (signal) signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        if (signal) signal.removeEventListener('abort', onAbort);
        reject(error);
      }
    );
  });
};

const buildFailedPhaseResult = (
  metricNames: string[],
  successfulMetricResults: Record<string, any>,
  conversationLength: number,
  errorMessage: string
): EvaluationResult => {
  const results: Record<string, any> = { ...successfulMetricResults };

  for (const metricName of metricNames) {
    if (!results[metricName]) {
      results[metricName] = {
        granularity: 'utterance',
        overall: null,
        per_utterance: [],
        per_segment: null,
        summary: `FAILED: ${errorMessage}`
      };
    }
  }

  return transformStandardizedResponse(
    {
      timestamp: Date.now(),
      results,
      status: Object.keys(successfulMetricResults).length > 0 ? 'partial' : 'error',
      message: errorMessage
    },
    conversationLength
  );
};

interface RunEvaluationParams {
  conversation: Conversation | null;
  selectedPredefinedMetrics: any[];
  selectedCustomizedMetrics: any[];
  selectedLiteratureMetrics: any[];
  lockedProfile: any;
  apiKeys: Record<string, string>;
  selectedProvider: string;
  selectedModel: string;
  onComplete?: (result: EvaluationResult) => void;
}

export const useEvaluation = (options?: { onNavigate?: () => void }) => {
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<EvaluationStatus>(EvaluationStatus.Idle);
  const [results, setResults] = useState<EvaluationResult | null>(null);
  const [progress, setProgress] = useState<ProgressState>({
    currentPhase: null,
    completedPhases: [],
    completedMetrics: 0,
    totalMetrics: 0,
    progressPercent: 0,
    phaseProgress: {
      predefined: 0,
      custom: 0,
      literature: 0
    }
  });

  const abortControllerRef = useRef<AbortController | null>(null);

  const runEvaluation = useCallback(async (params: RunEvaluationParams) => {
    const {
      conversation,
      selectedPredefinedMetrics,
      selectedCustomizedMetrics,
      selectedLiteratureMetrics,
      lockedProfile,
      apiKeys,
      selectedProvider,
      selectedModel,
      onComplete
    } = params;

    if (!conversation) {
      setError('No conversation to evaluate');
      return;
    }

    setIsEvaluating(true);
    setError(null);
    setStatus(EvaluationStatus.Loading);
    
    // Calculate phases safely inside hook
    const phases: EvaluationPhase[] = [];
    if (selectedPredefinedMetrics.length > 0) phases.push('predefined');
    if (selectedLiteratureMetrics.length > 0) phases.push('literature');
    if (selectedCustomizedMetrics.length > 0 && lockedProfile) phases.push('custom');

    // Calculate total metrics to run
    let totalMetricsCount = 0;
    if (selectedPredefinedMetrics.length > 0) totalMetricsCount += selectedPredefinedMetrics.length;
    if (selectedCustomizedMetrics.length > 0 && lockedProfile) totalMetricsCount += selectedCustomizedMetrics.length;
    if (selectedLiteratureMetrics.length > 0) totalMetricsCount += selectedLiteratureMetrics.length;

    setProgress({
      currentPhase: null,
      completedPhases: [],
      completedMetrics: 0,
      totalMetrics: totalMetricsCount,
      progressPercent: 0,
      phaseProgress: {
        predefined: 0,
        custom: 0,
        literature: 0
      }
    });

    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    try {
      const progressTracker = {
        predefined: 0,
        custom: 0,
        literature: 0
      };

      const updateGlobalProgress = () => {
        const currentTotal = progressTracker.predefined + progressTracker.custom + progressTracker.literature;
        setProgress(prev => ({
          ...prev,
          completedMetrics: currentTotal,
          progressPercent: prev.totalMetrics > 0 ? (currentTotal / prev.totalMetrics) * 100 : 0,
          phaseProgress: { ...progressTracker }
        }));
      };

      type PhaseTask = {
        phase: EvaluationPhase;
        metricNames: string[];
        successfulMetricResults: Record<string, any>;
        promise: Promise<EvaluationResult | null>;
      };

      const phaseTasks: PhaseTask[] = [];

      // --- Phase 1: Research-Trained Metrics ---
      if (selectedPredefinedMetrics.length > 0) {
        if (signal.aborted) throw new Error('CanceledError');

        setProgress(prev => ({ ...prev, currentPhase: 'predefined' }));

        const metricNames = selectedPredefinedMetrics.map(m => m.name);
        const successfulMetricResults: Record<string, any> = {};

        const keysRecord: Record<string, string> = {};
        if (apiKeys[selectedProvider]) keysRecord[selectedProvider] = apiKeys[selectedProvider];
        if (apiKeys.hf) keysRecord.hf = apiKeys.hf;

        const phasePromise = withTimeout(
          evaluatePretrainedModelStream(
            conversation,
            metricNames,
            keysRecord,
            selectedProvider,
            selectedModel,
            (metric, result, compl) => {
              if (result) successfulMetricResults[metric] = result;
              progressTracker.predefined = compl;
              updateGlobalProgress();
            },
            signal
          ),
          PHASE_TIMEOUT_MS,
          'Research-trained metrics evaluation',
          signal
        );

        phaseTasks.push({
          phase: 'predefined',
          metricNames,
          successfulMetricResults,
          promise: phasePromise
        });
      }

      // --- Phase 2: Custom Metrics ---
      if (selectedCustomizedMetrics.length > 0 && lockedProfile) {
        if (signal.aborted) throw new Error('CanceledError');

        if (selectedPredefinedMetrics.length === 0) {
          setProgress(prev => ({ ...prev, currentPhase: 'custom' }));
        }

        const metricNames = selectedCustomizedMetrics.map(m => m.name);
        const successfulMetricResults: Record<string, any> = {};

        const conversationTurns = conversation.messages.map(msg => ({
          role: msg.role.toLowerCase(),
          content: msg.content
        }));

        const phasePromise = withTimeout(
          evaluateCustomMetricsStream({
            conversation: conversationTurns,
            selectedMetricNames: metricNames,
            lockedProfile: lockedProfile,
            apiKey: apiKeys[selectedProvider],
            provider: selectedProvider,
            model: selectedModel
          }, (metric, result, compl) => {
            if (result) successfulMetricResults[metric] = result;
            progressTracker.custom = compl;
            updateGlobalProgress();
          }, signal),
          PHASE_TIMEOUT_MS,
          'Custom metrics evaluation',
          signal
        );

        phaseTasks.push({
          phase: 'custom',
          metricNames,
          successfulMetricResults,
          promise: phasePromise
        });
      }

      // --- Phase 3: Literature-Derived Metrics ---
      if (selectedLiteratureMetrics.length > 0) {
        if (signal.aborted) throw new Error('CanceledError');

        if (selectedPredefinedMetrics.length === 0 && (!lockedProfile || selectedCustomizedMetrics.length === 0)) {
          setProgress(prev => ({ ...prev, currentPhase: 'literature' }));
        }

        const metricNames = selectedLiteratureMetrics.map((m: any) => typeof m === 'string' ? m : m.metricName);
        const successfulMetricResults: Record<string, any> = {};

        const conversationTurns = conversation.messages.map(msg => ({
          speaker: msg.role.toLowerCase(),
          text: msg.content
        }));

        const phasePromise = withTimeout(
          evaluateLiteratureMetricsStream(
            conversationTurns,
            metricNames,
            selectedProvider,
            selectedModel,
            (metric, result, compl) => {
              if (result) successfulMetricResults[metric] = result;
              progressTracker.literature = compl;
              updateGlobalProgress();
            },
            apiKeys[selectedProvider],
            signal
          ),
          PHASE_TIMEOUT_MS,
          'Literature-derived metrics evaluation',
          signal
        );

        phaseTasks.push({
          phase: 'literature',
          metricNames,
          successfulMetricResults,
          promise: phasePromise
        });
      }

      const settled = await Promise.allSettled(phaseTasks.map(task => task.promise));

      if (signal.aborted) {
        setStatus(EvaluationStatus.Idle);
        setIsEvaluating(false);
        return;
      }

      let accumulatedResult: EvaluationResult | null = null;
      const phaseErrors: string[] = [];

      for (let i = 0; i < settled.length; i++) {
        const task = phaseTasks[i];
        const settledResult = settled[i];

        progressTracker[task.phase] = task.metricNames.length;
        updateGlobalProgress();
        setProgress(prev => ({
          ...prev,
          completedPhases: prev.completedPhases.includes(task.phase)
            ? prev.completedPhases
            : [...prev.completedPhases, task.phase]
        }));

        if (settledResult.status === 'fulfilled') {
          const phaseResult = settledResult.value;
          const phaseSuccessfulMap: Record<string, any> = { ...task.successfulMetricResults };

          const successfulFromPhaseResult = getSuccessfulMetricNamesFromResult(phaseResult);
          for (const metricName of successfulFromPhaseResult) {
            const rawMetric = phaseResult?.rawResults?.[metricName];
            if (rawMetric) phaseSuccessfulMap[metricName] = rawMetric;
          }

          const missingMetricNames = task.metricNames.filter(name => !phaseSuccessfulMap[name]);

          if (missingMetricNames.length > 0) {
            const warning = `${task.phase} phase completed with ${missingMetricNames.length} failed metric(s).`;
            phaseErrors.push(warning);

            const patchedPhaseResult = mergeResults(
              phaseResult,
              buildFailedPhaseResult(
                task.metricNames,
                phaseSuccessfulMap,
                conversation.messages.length,
                warning
              )
            );
            accumulatedResult = mergeResults(accumulatedResult, patchedPhaseResult);
          } else {
            accumulatedResult = mergeResults(accumulatedResult, phaseResult);
          }
        } else {
          if (isCanceledError(settledResult.reason)) {
            setStatus(EvaluationStatus.Idle);
            setIsEvaluating(false);
            return;
          }

          const reasonMessage = settledResult.reason?.message || `Failed ${task.phase} phase`;
          phaseErrors.push(`${task.phase}: ${reasonMessage}`);

          const failedPhaseResult = buildFailedPhaseResult(
            task.metricNames,
            task.successfulMetricResults,
            conversation.messages.length,
            reasonMessage
          );
          accumulatedResult = mergeResults(accumulatedResult, failedPhaseResult);
        }
      }

      const finalResult = accumulatedResult || {
        timestamp: Date.now(),
        overallScores: {},
        utteranceScores: []
      };

      const successfulMetricCount = getSuccessfulMetricNamesFromResult(finalResult).length;
      if (successfulMetricCount === 0 && phaseTasks.length > 0) {
        const errorMsg = phaseErrors[0] || 'All selected metrics failed to evaluate.';
        setError(errorMsg);
        setStatus(EvaluationStatus.Error);
        setIsEvaluating(false);
        return;
      }

      if (phaseErrors.length > 0) {
        console.warn('[Evaluation] Partial completion:', phaseErrors);
      }

      setError(null);
      setResults(finalResult);
      setStatus(EvaluationStatus.Complete);
      setIsEvaluating(false);

      if (onComplete) {
        onComplete(finalResult);
      } else if (options?.onNavigate) {
        setTimeout(() => {
        options.onNavigate!();
        }, 500);
      }

    } catch (e: any) {
      if (isCanceledError(e)) {
        setStatus(EvaluationStatus.Idle);
        setIsEvaluating(false);
        return;
      }

      const errorMsg = e.response?.data?.message || e.message || "An unknown error occurred during evaluation.";
      setError(errorMsg);
      setStatus(EvaluationStatus.Error);
      setIsEvaluating(false);
    }
  }, [options]);

  const abortEvaluation = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  const resetEvaluation = useCallback(() => {
    setStatus(EvaluationStatus.Idle);
    setResults(null);
    setError(null);
    setProgress({
      currentPhase: null,
      completedPhases: [],
      completedMetrics: 0,
      totalMetrics: 0,
      progressPercent: 0,
      phaseProgress: {
        predefined: 0,
        custom: 0,
        literature: 0
      }
    });
  }, []);

  return {
    isEvaluating,
    status,
    progress,
    error,
    results,
    runEvaluation,
    abortEvaluation,
    resetEvaluation
  };
};
