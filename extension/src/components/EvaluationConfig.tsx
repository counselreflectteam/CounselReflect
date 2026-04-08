import React, { useState, useCallback, useMemo } from 'react';
import { BookOpen, CheckSquare, FlaskConical, Play } from 'lucide-react';
import { 
  PredefinedMetricsConfig, 
  CustomizedMetricsConfig, 
  LiteratureBenchmarksConfig,
  EvaluationError,
  EvaluationProgress
} from '@shared/components/config';
import { useAuth, useEvaluationState, useMetrics } from '@shared/context';
import { useEvaluation } from '@shared/hooks/useEvaluation';
import { calculatePhasesToRun } from '@shared/utils/evaluationUtils';

interface EvaluationConfigProps {
  disabled: boolean;
}

export const EvaluationConfig: React.FC<EvaluationConfigProps> = ({ disabled }) => {
  const { selectedPredefinedMetrics, selectedCustomizedMetrics, selectedLiteratureMetrics, lockedProfile } = useMetrics();
  const { apiKeys, selectedProvider, selectedModel } = useAuth();
  const { conversation, setStatus, setResults, setError } = useEvaluationState();
  const [activeTab, setActiveTab] = useState<'predefined' | 'literature' | 'custom'>('predefined');

  // Use shared evaluation hook
  const {
    isEvaluating,
    status: evalStatus,
    progress,
    error: evalError,
    results: evalResults,
    runEvaluation,
    abortEvaluation,
    resetEvaluation
  } = useEvaluation();

  const phasesToRun = useMemo(() => 
    calculatePhasesToRun(
      selectedPredefinedMetrics.length,
      selectedCustomizedMetrics.length,
      selectedLiteratureMetrics.length,
      !!lockedProfile
    ),
    [selectedPredefinedMetrics.length, selectedCustomizedMetrics.length, selectedLiteratureMetrics.length, lockedProfile]
  );

  const phaseCounts = useMemo(() => ({
    predefined: selectedPredefinedMetrics.length,
    custom: selectedCustomizedMetrics.length,
    literature: selectedLiteratureMetrics.length
  }), [selectedPredefinedMetrics.length, selectedCustomizedMetrics.length, selectedLiteratureMetrics.length]);

  // Sync evaluation state to context
  React.useEffect(() => {
    setStatus(evalStatus);
    if (evalResults) setResults(evalResults);
    if (evalError) setError(evalError);
  }, [evalStatus, evalResults, evalError, setStatus, setResults, setError]);

  const handleRunEvaluation = useCallback(async () => {
    setError(null);
    await runEvaluation({
      conversation,
      selectedPredefinedMetrics,
      selectedCustomizedMetrics,
      selectedLiteratureMetrics,
      lockedProfile,
      apiKeys: apiKeys as unknown as Record<string, string>,
      selectedProvider,
      selectedModel,
      onComplete: (finalResult) => {
        // Extension-specific: Send results to content script for tooltips
        try {
          window.parent.postMessage({
            type: 'EVALUATION_RESULTS',
            payload: finalResult
          }, '*');
        } catch (e) {
          console.error('Failed to send results to content script:', e);
        }
      }
    });
  }, [
    conversation,
    selectedPredefinedMetrics,
    selectedCustomizedMetrics,
    selectedLiteratureMetrics,
    lockedProfile,
    apiKeys,
    selectedProvider,
    selectedModel,
    runEvaluation,
    setError
  ]);

  const TabButton = ({ id, label, icon: Icon }: any) => (
    <button
      onClick={() => setActiveTab(id)}
      className={`flex items-center space-x-2 px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
        activeTab === id
          ? 'border-blue-600 text-blue-800 dark:text-blue-400 dark:border-blue-400'
          : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
      }`}
    >
      <Icon className="w-4 h-4" />
      <span>{label}</span>
    </button>
  );

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden transition-colors">
        <div className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-2 flex">
          <TabButton id="predefined" label="Research-Trained Metrics" icon={CheckSquare} />
          <TabButton id="literature" label="Literature-Derived Metrics" icon={BookOpen} />
          <TabButton id="custom" label="Custom Metrics" icon={FlaskConical} />
        </div>

        <div className="p-6 min-h-[400px]">
          <div className={activeTab === 'predefined' ? 'block' : 'hidden'}>
            <PredefinedMetricsConfig />
          </div>

          <div className={activeTab === 'literature' ? 'block' : 'hidden'}>
            <LiteratureBenchmarksConfig />
          </div>

          <div className={activeTab === 'custom' ? 'block' : 'hidden'}>
            <CustomizedMetricsConfig />
          </div>
        </div>
      </div>

      {/* Progress Display */}
      {isEvaluating && (
        <div className="px-4">
          <EvaluationProgress 
            progress={progress}
            phasesToRun={phasesToRun}
            phaseCounts={phaseCounts}
            onCancel={() => {
              if (abortEvaluation) abortEvaluation();
            }}
          />
        </div>
      )}

      {/* Run Evaluation Button */}
      {!isEvaluating && !evalError && (
        <div className="flex justify-center">
          <button
            onClick={handleRunEvaluation}
            disabled={
              disabled ||
              (selectedPredefinedMetrics.length === 0 &&
                selectedCustomizedMetrics.length === 0 &&
                selectedLiteratureMetrics.length === 0)
            }
            className={`
              flex items-center space-x-3 px-8 py-4 rounded-full shadow-lg transition-all duration-300
              ${
                disabled ||
                (selectedPredefinedMetrics.length === 0 &&
                  selectedCustomizedMetrics.length === 0 &&
                  selectedLiteratureMetrics.length === 0)
                  ? 'bg-slate-300 dark:bg-slate-700 cursor-not-allowed text-slate-500 dark:text-slate-400'
                  : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white hover:shadow-xl transform hover:-translate-y-0.5'
              }
            `}
          >
            <Play className="w-5 h-5 fill-current" />
            <span className="text-lg font-semibold">Run Evaluation</span>
          </button>
          {selectedPredefinedMetrics.length === 0 &&
            selectedCustomizedMetrics.length === 0 &&
            selectedLiteratureMetrics.length === 0 &&
            !disabled && (
              <div className="absolute mt-16 text-xs text-red-400 animate-bounce">
                Please select at least one metric from any tab
              </div>
            )}
        </div>
      )}

      {/* Error Display */}
      {evalError && (
        <EvaluationError 
          error={evalError}
          onRetry={handleRunEvaluation}
          onBackToConfigure={() => {
            if (resetEvaluation) resetEvaluation();
            setError(null);
          }}
        />
      )}
    </div>
  );
};

