import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Play } from 'lucide-react';
import { useMetrics } from '@shared/context';
import { useNavigationState } from '../context/NavigationContext';
import { useEvaluationState } from '@shared/context';
import { useAuth } from '@shared/context';
import { EvaluationStatus } from '@shared/types';
import { useEvaluation } from '../hooks/useEvaluation';

// Components
import { ConfigureHeader } from '../components/config/ConfigureHeader';
import { MetricsTabs } from '../components/config/MetricsTabs';
import { EvaluationError } from '@shared/components/config';

// Utils
import {
  validateEvaluation,
  calculatePhasesToRun
} from '@shared/utils/evaluationUtils';

export const ConfigurePage: React.FC = () => {
  const navigate = useNavigate();
  const { 
    selectedPredefinedMetrics, 
    selectedCustomizedMetrics, 
    selectedLiteratureMetrics,
    lockedProfile
  } = useMetrics();
  const { markStepCompleted, setHasUnsavedResults } = useNavigationState();
  const { conversation, status, setStatus, setResults, error: evalError, setError: setEvalError } = useEvaluationState();
  const { apiKeys, selectedProvider, selectedModel } = useAuth();
  
  const [activeTab, setActiveTab] = useState<'predefined' | 'literature' | 'custom'>('predefined');
  const [validationError, setValidationError] = useState<string | null>(null);

  // Use custom evaluation hook
  const { 
    runEvaluation: executeEvaluation, 
    isEvaluating, 
    progress, 
    error: evaluationError,
    abortEvaluation,
    resetEvaluation
  } = useEvaluation();

  // Sync evaluation status with global context if needed
  useEffect(() => {
    if (evaluationError) {
        setStatus(EvaluationStatus.Error);
        setEvalError(evaluationError);
    }
  }, [evaluationError, setStatus, setEvalError]);

  // Memoized calculations
  const totalSelectedMetrics = useMemo(() => 
    selectedPredefinedMetrics.length + 
    selectedCustomizedMetrics.length + 
    selectedLiteratureMetrics.length,
    [selectedPredefinedMetrics.length, selectedCustomizedMetrics.length, selectedLiteratureMetrics.length]
  );

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

  // Event handlers
  const handleRunEvaluation = () => {
    setValidationError(null);
    setEvalError(null);

    const errorMsg = validateEvaluation(
      selectedPredefinedMetrics.length,
      selectedCustomizedMetrics.length,
      selectedLiteratureMetrics.length,
      !!lockedProfile
    );

    if (errorMsg) {
      setValidationError(errorMsg);
      return;
    }

    markStepCompleted(2);

    const safeApiKeys = apiKeys as unknown as Record<string, string>;

    executeEvaluation({
      conversation,
      selectedPredefinedMetrics,
      selectedCustomizedMetrics,
      selectedLiteratureMetrics,
      lockedProfile,
      apiKeys: safeApiKeys,
      selectedProvider,
      selectedModel,
      onComplete: (result) => {
        setResults(result);
        setStatus(EvaluationStatus.Complete);
        markStepCompleted(3);
        setHasUnsavedResults(true);
        setTimeout(() => {
          navigate('/results');
        }, 500);
      }
    });
  };

  const handleCancel = () => {
    abortEvaluation();
  };

  const handleRetry = () => {
    setValidationError(null);
    setEvalError(null);
    setStatus(EvaluationStatus.Idle);
    handleRunEvaluation();
  };

  const handleBackToConfigure = () => {
    if (resetEvaluation) resetEvaluation();
    setValidationError(null);
    setEvalError(null);
    setStatus(EvaluationStatus.Idle);
  };

  const handleBack = () => {
    navigate('/setup');
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header Card */}
      <ConfigureHeader
        isEvaluating={isEvaluating}
        status={status}
        totalSelectedMetrics={totalSelectedMetrics}
        progress={progress}
        phasesToRun={phasesToRun}
        phaseCounts={phaseCounts}
        onCancel={handleCancel}
      />

      {/* Metrics Configuration - Tabs */}
      {!isEvaluating && (
        <MetricsTabs
          activeTab={activeTab}
          onTabChange={setActiveTab}
          error={validationError}
          isEvaluating={isEvaluating}
        />
      )}

      {/* Error State (Evaluation Failed) */}
      {status === EvaluationStatus.Error && (
        <EvaluationError
          error={evaluationError || evalError}
          onRetry={handleRetry}
          onBackToConfigure={handleBackToConfigure}
        />
      )}


      {/* Navigation Buttons */}
      {!isEvaluating && status !== EvaluationStatus.Error && (
        <div className="flex justify-between pt-4">
          <button
            onClick={handleBack}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
          >
            <ChevronLeft size={18} />
            Back
          </button>
          <button
            onClick={handleRunEvaluation}
            disabled={totalSelectedMetrics === 0}
            className={`
              inline-flex items-center gap-2 px-6 py-3 rounded-lg font-medium
              transition-colors
              ${totalSelectedMetrics === 0
                ? 'bg-slate-300 dark:bg-slate-700 text-slate-500 dark:text-slate-400 cursor-not-allowed' 
                : 'bg-indigo-600 text-white hover:bg-indigo-700 dark:bg-indigo-600 dark:hover:bg-indigo-700'}`}
          >
            <Play size={18} />
            Start Evaluation
          </button>
        </div>
      )}
    </div>
  );
};
