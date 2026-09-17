import { useState, useRef, useCallback } from 'react';
import { evaluatePretrainedModelStream } from '../services/pretrainedMetricsService';
import { evaluateCustomMetricsStream } from '../services/customMetricsService';
import { evaluateLiteratureMetricsStream } from '../services/literatureMetricsService';
import {
  cancelEvaluationRun,
  createEvaluationRunId,
} from '../services/evaluationRunService';
import {
  EvaluationResult,
  Conversation,
  EvaluationStatus,
  Role
} from '../types';
import { mergeResults, EvaluationPhase, MetricProgressItem, ProgressState } from '../utils/evaluationUtils';
import { transformStandardizedResponse } from '../services/transformers/evaluationTransformer';

export { EvaluationStatus };

// Whole-phase ceiling. Generous because research-grade phases can legitimately
// be very slow — a FIRST run may download HF torch models and build the
// MedRAG corpus index on CPU, which can exceed 30 minutes — but bounded so a
// hung backend cannot leave the UI spinning indefinitely.
const PHASE_TIMEOUT_MS = 7_200_000; // 120 min

// Backend speaker matching still expects 'therapist'/'patient'-family labels
// (custom pipeline: THERAPIST_ROLES/PATIENT_ROLES; literature evaluator:
// _should_evaluate_utterance), so the Chatbot role maps to 'therapist' on the wire.
const toWireSpeaker = (role: Role): string =>
  role === Role.Chatbot ? 'therapist' : role.toLowerCase();

const PHASE_DISPLAY_NAMES: Record<EvaluationPhase, string> = {
  predefined: 'Model-scored metrics',
  custom: 'Build your own metrics',
  literature: 'Rubric-scored metrics'
};

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
  signal?: AbortSignal,
  onTimeout?: () => void
): Promise<T> => {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      // Reject first so the settlement reason stays the timeout error, then let
      // the caller abort the underlying stream (stops orphaned onProgress churn).
      reject(new Error(`${label} timed out after ${Math.round(timeoutMs / 1000)}s`));
      onTimeout?.();
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
  const [isCancelling, setIsCancelling] = useState(false);
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
    },
    metricProgress: []
  });

  const abortControllerRef = useRef<AbortController | null>(null);
  const activeRunIdRef = useRef<string | null>(null);

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

    const runId = createEvaluationRunId();
    const runController = new AbortController();
    const signal = runController.signal;
    activeRunIdRef.current = runId;
    abortControllerRef.current = runController;
    const isCurrentRun = () => activeRunIdRef.current === runId;
    const clearCurrentRun = () => {
      if (!isCurrentRun()) return;
      activeRunIdRef.current = null;
      if (abortControllerRef.current === runController) {
        abortControllerRef.current = null;
      }
    };

    setIsEvaluating(true);
    setIsCancelling(false);
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

    const buildMetricQueue = (
      phase: EvaluationPhase,
      metrics: Array<{ name: string; label: string }>
    ): MetricProgressItem[] => metrics.map((metric, index) => ({
      id: `${phase}:${metric.name}`,
      phase,
      name: metric.name,
      label: metric.label,
      status: index === 0 ? 'running' : 'waiting'
    }));

    const metricProgress = [
      ...buildMetricQueue(
        'predefined',
        selectedPredefinedMetrics.map((metric) => ({
          name: metric.name,
          label: metric.label || metric.name
        }))
      ),
      ...buildMetricQueue(
        'custom',
        lockedProfile
          ? selectedCustomizedMetrics.map((metric) => ({
              name: metric.name,
              label: metric.name
            }))
          : []
      ),
      ...buildMetricQueue(
        'literature',
        selectedLiteratureMetrics.map((metric) => {
          const name = typeof metric === 'string' ? metric : metric.metricName;
          return { name, label: name };
        })
      )
    ];

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
      },
      metricProgress
    });

    try {
      const progressTracker = {
        predefined: 0,
        custom: 0,
        literature: 0
      };

      // Per-metric failure reasons reported by the backend stream (metric name → message).
      const metricErrors: Record<string, string> = {};

      const settleMetric = (
        phase: EvaluationPhase,
        metricName: string,
        status: 'completed' | 'failed',
        errorReason?: string
      ) => {
        if (!isCurrentRun()) return;
        setProgress((previous) => {
          const items = previous.metricProgress.map((item) => ({ ...item }));
          const metricIndex = items.findIndex(
            (item) => item.phase === phase && item.name === metricName
          );

          if (metricIndex === -1) return previous;

          items[metricIndex] = {
            ...items[metricIndex],
            status,
            ...(errorReason ? { error: errorReason } : {})
          };

          const phaseHasRunningMetric = items.some(
            (item) => item.phase === phase && item.status === 'running'
          );
          if (!phaseHasRunningMetric) {
            const nextMetricIndex = items.findIndex(
              (item) => item.phase === phase && item.status === 'waiting'
            );
            if (nextMetricIndex !== -1) {
              items[nextMetricIndex] = { ...items[nextMetricIndex], status: 'running' };
            }
          }

          return { ...previous, metricProgress: items };
        });
      };

      const updateGlobalProgress = () => {
        if (!isCurrentRun()) return;
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

      // Each phase gets its own controller (chained to the run signal) so a phase
      // timeout can tear down that phase's stream without cancelling siblings.
      const createPhaseController = () => {
        const phaseController = new AbortController();
        signal.addEventListener('abort', () => phaseController.abort(), { once: true });
        return phaseController;
      };

      // --- Phase 1: Research-Trained Metrics ---
      if (selectedPredefinedMetrics.length > 0) {
        if (signal.aborted) throw new Error('CanceledError');

        setProgress(prev => ({ ...prev, currentPhase: 'predefined' }));

        const metricNames = selectedPredefinedMetrics.map(m => m.name);
        const successfulMetricResults: Record<string, any> = {};

        const keysRecord: Record<string, string> = {};
        if (apiKeys[selectedProvider]) keysRecord[selectedProvider] = apiKeys[selectedProvider];
        if (apiKeys.hf) keysRecord.hf = apiKeys.hf;

        const phaseController = createPhaseController();
        const phasePromise = withTimeout(
          evaluatePretrainedModelStream(
            conversation,
            metricNames,
            keysRecord,
            selectedProvider,
            selectedModel,
            (metric, result, compl, _total, errorReason) => {
              if (result) successfulMetricResults[metric] = result;
              if (errorReason) metricErrors[metric] = errorReason;
              settleMetric('predefined', metric, errorReason ? 'failed' : 'completed', errorReason);
              progressTracker.predefined = compl;
              updateGlobalProgress();
            },
            phaseController.signal,
            runId
          ),
          PHASE_TIMEOUT_MS,
          'Model-scored metrics evaluation',
          signal,
          () => phaseController.abort()
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
          role: toWireSpeaker(msg.role),
          content: msg.content
        }));

        const phaseController = createPhaseController();
        const phasePromise = withTimeout(
          evaluateCustomMetricsStream({
            conversation: conversationTurns,
            selectedMetricNames: metricNames,
            lockedProfile: lockedProfile,
            apiKey: apiKeys[selectedProvider],
            provider: selectedProvider,
            model: selectedModel,
            runId
          }, (metric, result, compl, _total, errorReason) => {
            if (!isCurrentRun()) return;
            if (result) successfulMetricResults[metric] = result;
            if (errorReason) metricErrors[metric] = errorReason;
            settleMetric('custom', metric, errorReason ? 'failed' : 'completed', errorReason);
            progressTracker.custom = compl;
            updateGlobalProgress();
          }, phaseController.signal),
          PHASE_TIMEOUT_MS,
          'Custom metrics evaluation',
          signal,
          () => phaseController.abort()
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
          speaker: toWireSpeaker(msg.role),
          text: msg.content
        }));

        const phaseController = createPhaseController();
        const phasePromise = withTimeout(
          evaluateLiteratureMetricsStream(
            conversationTurns,
            metricNames,
            selectedProvider,
            selectedModel,
            (metric, result, compl, _total, errorReason) => {
              if (result) successfulMetricResults[metric] = result;
              if (errorReason) metricErrors[metric] = errorReason;
              settleMetric('literature', metric, errorReason ? 'failed' : 'completed', errorReason);
              progressTracker.literature = compl;
              updateGlobalProgress();
            },
            apiKeys[selectedProvider],
            phaseController.signal,
            runId
          ),
          PHASE_TIMEOUT_MS,
          'Rubric-scored metrics evaluation',
          signal,
          () => phaseController.abort()
        );

        phaseTasks.push({
          phase: 'literature',
          metricNames,
          successfulMetricResults,
          promise: phasePromise
        });
      }

      const settled = await Promise.allSettled(phaseTasks.map(task => task.promise));

      if (!isCurrentRun()) return;

      if (signal.aborted) {
        clearCurrentRun();
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

          setProgress((previous) => ({
            ...previous,
            metricProgress: previous.metricProgress.map((item) => {
              if (item.phase !== task.phase) return item;
              if (phaseSuccessfulMap[item.name]) {
                return { ...item, status: 'completed', error: undefined };
              }
              if (item.status === 'failed') return item;
              return {
                ...item,
                status: 'failed',
                error: 'The evaluation stream ended without returning a result for this metric.'
              };
            })
          }));

          if (missingMetricNames.length > 0) {
            const warning = `${PHASE_DISPLAY_NAMES[task.phase]} completed with ${missingMetricNames.length} failed metric(s).`;
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

          const reasonMessage = settledResult.reason?.message || `${PHASE_DISPLAY_NAMES[task.phase]} failed`;
          phaseErrors.push(`${PHASE_DISPLAY_NAMES[task.phase]}: ${reasonMessage}`);

          setProgress((previous) => ({
            ...previous,
            metricProgress: previous.metricProgress.map((item) => {
              if (item.phase !== task.phase || item.status === 'completed' || item.status === 'failed') {
                return item;
              }
              return { ...item, status: 'failed', error: reasonMessage };
            })
          }));

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

      if (Object.keys(metricErrors).length > 0) {
        finalResult.metricErrors = metricErrors;
      }

      const successfulMetricCount = getSuccessfulMetricNamesFromResult(finalResult).length;
      if (successfulMetricCount === 0 && phaseTasks.length > 0) {
        const specificReasons = Array.from(new Set(
          Object.entries(metricErrors).map(([name, reason]) => {
            const label = metricProgress.find((item) => item.name === name)?.label || name;
            return `${label}: ${reason}`;
          })
        ));
        const errorMsg = specificReasons.length > 0
          ? specificReasons.join('  •  ')
          : (phaseErrors[0] || 'All selected metrics failed to evaluate.');
        setError(errorMsg);
        setStatus(EvaluationStatus.Error);
        setIsEvaluating(false);
        setIsCancelling(false);
        clearCurrentRun();
        return;
      }

      if (phaseErrors.length > 0) {
        console.warn('[Evaluation] Partial completion:', phaseErrors);
      }

      setError(null);
      setResults(finalResult);
      setStatus(EvaluationStatus.Complete);
      setIsEvaluating(false);
      setIsCancelling(false);
      clearCurrentRun();

      if (onComplete) {
        onComplete(finalResult);
      } else if (options?.onNavigate) {
        setTimeout(() => {
        options.onNavigate!();
        }, 500);
      }

    } catch (e: any) {
      if (!isCurrentRun()) return;

      if (isCanceledError(e)) {
        clearCurrentRun();
        setStatus(EvaluationStatus.Idle);
        setIsEvaluating(false);
        setIsCancelling(false);
        return;
      }

      const errorMsg = e.response?.data?.message || e.message || "An unknown error occurred during evaluation.";
      setError(errorMsg);
      setStatus(EvaluationStatus.Error);
      setIsEvaluating(false);
      setIsCancelling(false);
      clearCurrentRun();
    }
  }, [options]);

  const abortEvaluation = useCallback(() => {
    const controller = abortControllerRef.current;
    const runId = activeRunIdRef.current;
    if (!controller && !runId) return;

    if (abortControllerRef.current === controller) abortControllerRef.current = null;
    if (activeRunIdRef.current === runId) activeRunIdRef.current = null;
    setError(null);
    setIsCancelling(true);

    const finishCancellation = () => {
      controller?.abort();
      if (activeRunIdRef.current !== null) return;
      setStatus(EvaluationStatus.Idle);
      setIsEvaluating(false);
      setIsCancelling(false);
    };
    if (!runId) {
      finishCancellation();
      return;
    }

    cancelEvaluationRun(runId)
      .catch((error) => {
        console.warn('The server did not acknowledge evaluation cancellation:', error instanceof Error ? error.message : 'unknown error');
      })
      .finally(finishCancellation);
  }, []);

  const resetEvaluation = useCallback(() => {
    setStatus(EvaluationStatus.Idle);
    setIsCancelling(false);
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
      },
      metricProgress: []
    });
  }, []);

  return {
    isEvaluating,
    isCancelling,
    status,
    progress,
    error,
    results,
    runEvaluation,
    abortEvaluation,
    resetEvaluation
  };
};
