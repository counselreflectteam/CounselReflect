import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import { useMetrics } from '@shared/context';
import { useNavigationState } from '../context/NavigationContext';
import { useEvaluationState } from '@shared/context';
import { useAuth } from '@shared/context';
import { EvaluationStatus } from '@shared/types';
import { useEvaluation } from '../hooks/useEvaluation';
import { SketchArrow } from '../components/design/NotebookMarks';
import { MarkerHighlight } from '@shared/components/design/MarkerHighlight';
import { isHfReady, isProviderReady } from '../utils/providerReadiness';

// Components
import { ConfigureHeader } from '../components/config/ConfigureHeader';
import { MetricsTabs } from '../components/config/MetricsTabs';
import { EvaluationError } from '@shared/components/config';

// Utils
import {
  validateEvaluation,
  calculatePhasesToRun
} from '@shared/utils/evaluationUtils';
import { buildMetricLabelMap, filterMetricNames } from '@shared/utils/metricUtils';

const LLM_BACKED_PREDEFINED_METRICS = new Set(['fact_score', 'medscore']);

interface RunReadiness {
  canRun: boolean;
  primaryMessage: string;
  issues: string[];
}

export const ConfigurePage: React.FC = () => {
  const navigate = useNavigate();
  const {
    selectedPredefinedMetrics,
    selectedCustomizedMetrics,
    selectedLiteratureMetrics,
    lockedProfile,
    togglePredefinedMetric,
    toggleLiteratureMetric,
    toggleCustomizedMetric
  } = useMetrics();
  const { markStepCompleted, setHasUnsavedResults } = useNavigationState();
  const { conversation, status, setStatus, setResults, setRunMetadata, error: evalError, setError: setEvalError } = useEvaluationState();
  const {
    apiKeys,
    selectedProvider,
    selectedModel,
    serverKeyStatus,
    hasValidatedApiKey,
    hfValidationStatus,
    hasHfCredential
  } = useAuth();
  
  const [activeTab, setActiveTab] = useState<'predefined' | 'literature' | 'custom'>('predefined');
  const [validationError, setValidationError] = useState<string | null>(null);
  const catalogueRef = useRef<HTMLDivElement | null>(null);

  // Use custom evaluation hook
  const { 
    runEvaluation: executeEvaluation, 
    isEvaluating, 
    isCancelling,
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

  const runReadiness = useMemo<RunReadiness>(() => {
    const issues: string[] = [];
    const conversationTurnCount = conversation?.messages?.length || 0;
    const hfMetrics = selectedPredefinedMetrics.filter((metric) => metric.requiresHf);
    const llmBackedPredefinedMetrics = selectedPredefinedMetrics.filter((metric) =>
      LLM_BACKED_PREDEFINED_METRICS.has(metric.name)
    );
    const unavailablePredefinedMetrics = selectedPredefinedMetrics.filter((metric) => metric.serverAvailable === false);
    const providerReady = isProviderReady({
      selectedProvider,
      selectedModel,
      apiKeys,
      serverKeyStatus,
      hasValidatedApiKey
    });
    const hfReady = isHfReady({
      apiKey: apiKeys.hf,
      serverKeyAvailable: serverKeyStatus.hf,
      validationStatus: hfValidationStatus
    });
    const needsProviderKey =
      selectedLiteratureMetrics.length > 0 ||
      selectedCustomizedMetrics.length > 0 ||
      llmBackedPredefinedMetrics.length > 0;

    if (conversationTurnCount === 0) {
      issues.push('Load a transcript in Setup before running evaluation.');
    }

    const validationMessage = validateEvaluation(
      selectedPredefinedMetrics.length,
      selectedCustomizedMetrics.length,
      selectedLiteratureMetrics.length,
      !!lockedProfile
    );
    if (validationMessage) issues.push(validationMessage);

    if (unavailablePredefinedMetrics.length > 0) {
      const labels = unavailablePredefinedMetrics.map((metric) => metric.label);
      const list = labels.length > 1
        ? `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`
        : labels[0];
      issues.push(`${list} need${labels.length === 1 ? 's' : ''} backend dependencies that are not configured.`);
    }

    if (needsProviderKey && !providerReady) {
      issues.push(
        apiKeys[selectedProvider]?.trim()
          ? 'Verify the selected provider credential in Setup before running these metrics.'
          : 'Add a provider key in Setup to run the selected metrics.'
      );
    }

    if (hfMetrics.length > 0 && !hfReady) {
      if (!hasHfCredential) {
        issues.push('Add a Hugging Face key in Setup to run the selected HF metrics.');
      } else if (hfValidationStatus === 'validating') {
        issues.push('Wait for the Hugging Face credential check to finish before generating the report.');
      } else if (hfValidationStatus === 'invalid') {
        issues.push('The Hugging Face key is invalid. Update it in Setup or deselect the HF metrics.');
      } else {
        issues.push('Verify the Hugging Face credential in Setup before running the selected HF metrics.');
      }
    }

    return {
      canRun: issues.length === 0,
      primaryMessage: issues.length === 0
        ? 'Ready to run.'
        : issues[0],
      issues
    };
  }, [
    conversation?.messages?.length,
    apiKeys,
    hasHfCredential,
    hasValidatedApiKey,
    hfValidationStatus,
    lockedProfile,
    phasesToRun.length,
    selectedCustomizedMetrics.length,
    selectedLiteratureMetrics.length,
    selectedModel,
    selectedPredefinedMetrics,
    selectedProvider,
    serverKeyStatus,
    totalSelectedMetrics
  ]);

  // Event handlers
  const handleRunEvaluation = () => {
    setValidationError(null);
    setEvalError(null);

    if (!runReadiness.canRun) {
      setValidationError(runReadiness.primaryMessage);
      return;
    }

    markStepCompleted(2);
    setResults(null);
    setRunMetadata(null);
    setStatus(EvaluationStatus.Loading);

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
        const literatureMetricNames = selectedLiteratureMetrics.map((metric) => metric.metricName);
        const metricLabelMap = buildMetricLabelMap(
          selectedPredefinedMetrics,
          selectedCustomizedMetrics,
          literatureMetricNames
        );
        setRunMetadata({
          metricNames: filterMetricNames(result),
          metricLabelMap,
          selectedMetricCount: totalSelectedMetrics,
          provider: selectedProvider,
          model: selectedModel,
          metricGroups: {
            predefined: selectedPredefinedMetrics.map((metric) => metric.name),
            literature: literatureMetricNames,
            custom: selectedCustomizedMetrics.map((metric) => metric.name),
          },
          savedAt: Date.now(),
        });
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
    // The hook's cancel path resets only its internal status and never calls
    // onComplete/onError, so the global context status must be reset here or
    // the TopBar "Evaluating" badge stays on forever.
    setStatus(EvaluationStatus.Idle);
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

  const handleClearAll = () => {
    selectedPredefinedMetrics.forEach((metric) => togglePredefinedMetric(metric));
    selectedLiteratureMetrics.forEach((metric) => toggleLiteratureMetric(metric));
    selectedCustomizedMetrics.forEach((metric) => toggleCustomizedMetric(metric));
  };

  const handleOpenMetricTab = (tab: 'predefined' | 'literature' | 'custom') => {
    setActiveTab(tab);
    window.requestAnimationFrame(() => {
      catalogueRef.current?.scrollIntoView({ block: 'start' });
      document.getElementById(`metrics-tab-${tab}`)?.focus();
    });
  };

  // Review tray: selection grouped by source, chips removable via the
  // existing toggles. Zero-count groups are omitted.
  const selectedChipGroups = [
    {
      id: 'predefined' as const,
      label: 'Model-scored',
      chips: selectedPredefinedMetrics.map((m) => ({
        key: `predefined-${m.name}`,
        label: m.label || m.name,
        onRemove: () => togglePredefinedMetric(m)
      }))
    },
    {
      id: 'literature' as const,
      label: 'Rubric-scored',
      chips: selectedLiteratureMetrics.map((m) => ({
        key: `literature-${m.metricName}`,
        label: m.metricName,
        onRemove: () => toggleLiteratureMetric(m)
      }))
    },
    {
      id: 'custom' as const,
      label: 'Build your own metrics',
      chips: selectedCustomizedMetrics.map((m) => ({
        key: `custom-${m.id}`,
        label: m.name,
        onRemove: () => toggleCustomizedMetric(m)
      }))
    }
  ].filter((group) => group.chips.length > 0);

  // Source breakdown next to the count — each fragment jumps to its tab, so
  // "what did I pick on the other tabs?" never needs chips in the dock line.
  const sourceBreakdown = [
    {
      tab: 'predefined' as const,
      count: selectedPredefinedMetrics.length,
      label: 'model-scored',
      accent: 'text-[#1F5CB7] dark:text-[#9CC2FF]'
    },
    {
      tab: 'literature' as const,
      count: selectedLiteratureMetrics.length,
      label: 'rubric-scored',
      accent: 'text-[#6A4CAF] dark:text-[#C9B8F4]'
    },
    {
      tab: 'custom' as const,
      count: selectedCustomizedMetrics.length,
      label: 'yours',
      accent: 'text-[#147782] dark:text-[#82E0E8]'
    }
  ].filter((fragment) => fragment.count > 0);

  const readinessNote = validationError ?? (runReadiness.canRun ? null : runReadiness.primaryMessage);

  return (
    <div className="cr-enter mx-auto max-w-6xl space-y-6">
      <ConfigureHeader
        isEvaluating={isEvaluating}
        isCancelling={isCancelling}
        status={status}
        totalSelectedMetrics={totalSelectedMetrics}
        progress={progress}
        phasesToRun={phasesToRun}
        phaseCounts={phaseCounts}
        onCancel={handleCancel}
      />

      {/* Keep MetricsTabs mounted during a run and hide it with CSS, matching
          the extension surface. Unmounting would wipe picker local state
          (unactivated generated rubrics, typed custom rows, search queries)
          on cancel or error. */}
      <div
        ref={catalogueRef}
        className={`${isEvaluating || status === EvaluationStatus.Error ? 'hidden' : ''} scroll-mt-4`}
      >
        <MetricsTabs
          activeTab={activeTab}
          onTabChange={setActiveTab}
          isEvaluating={isEvaluating}
        />
      </div>

      {status === EvaluationStatus.Error && (
        <EvaluationError
          error={evaluationError || evalError}
          onRetry={handleRetry}
          onBackToConfigure={handleBackToConfigure}
        />
      )}

      {/* The dock stays quiet when empty, then picks up a blue review surface
          once the user has criteria to confirm. */}
      {!isEvaluating && status !== EvaluationStatus.Error && (
        <div data-selection-dock className={`sticky bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-30 -mx-4 border-y border-l-[3px] px-4 py-3 transition-colors sm:mx-0 sm:rounded-md sm:border lg:bottom-0 ${
          totalSelectedMetrics > 0
            ? 'border-[#B9D1FA] border-l-[#176BFF] bg-[#F3F7FF] dark:border-[#36577E] dark:border-l-[#78A8F8] dark:bg-[#172A47]'
            : 'border-[var(--cr-card-border)] border-l-[var(--cr-brand-primary)] bg-[var(--cr-card)]'
        }`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              {totalSelectedMetrics > 0 ? (
                <MarkerHighlight tone="blue" className="text-sm font-bold text-[#164B94] dark:text-[var(--cr-ink)]">
                  {totalSelectedMetrics} selected
                </MarkerHighlight>
              ) : (
                <span className="text-sm font-semibold text-[var(--cr-ink-2)]">
                  0 selected
                </span>
              )}
              {sourceBreakdown.length > 0 && (
                <span className="cr-meta inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                  {sourceBreakdown.map((fragment, index) => (
                    <React.Fragment key={fragment.tab}>
                      {index > 0 && <span aria-hidden>·</span>}
                      <button
                        type="button"
                        onClick={() => handleOpenMetricTab(fragment.tab)}
                        className={`cr-focus rounded-sm font-semibold hover:underline ${fragment.accent}`}
                      >
                        {fragment.count} {fragment.label}
                      </button>
                    </React.Fragment>
                  ))}
                </span>
              )}
              {totalSelectedMetrics > 0 && (
                <button
                  type="button"
                  onClick={handleClearAll}
                  className="cr-focus text-xs font-semibold text-[var(--cr-ink-2)] hover:text-rose-700"
                >
                  Clear selection
                </button>
              )}
            </div>
            <div className="grid w-full min-w-0 grid-cols-1 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center">
              <button
                type="button"
                onClick={handleBack}
                className="cr-btn cr-btn-secondary cr-focus h-10 w-full bg-[var(--cr-bg)] px-5 sm:w-auto"
              >
                Back to transcript
              </button>
              <button
                type="button"
                onClick={handleRunEvaluation}
                disabled={!runReadiness.canRun}
                className="cr-btn cr-btn-primary cr-focus h-10 w-full px-6 disabled:bg-[var(--cr-muted)] disabled:text-[var(--cr-ink-3)] disabled:opacity-100 sm:w-auto"
              >
                Generate report
                <SketchArrow className="h-3.5 w-5" />
              </button>
            </div>
          </div>
          {selectedChipGroups.length > 0 && (
            <details className="mt-2">
              <summary className="cr-btn cr-btn-ghost cr-focus inline-flex h-8 cursor-pointer select-none list-none items-center px-3 text-xs [&::-webkit-details-marker]:hidden">
                Review selected criteria
              </summary>
              <div className="custom-scrollbar mt-2 max-h-[min(42vh,24rem)] space-y-2.5 overflow-y-auto pr-1">
                {selectedChipGroups.map((group) => (
                  <div key={group.id}>
                    <p className="cr-meta font-semibold">{group.label}</p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {group.chips.map((chip) => (
                        <button
                          key={chip.key}
                          type="button"
                          onClick={chip.onRemove}
                          aria-label={`Remove ${chip.label}`}
                          title={`Remove ${chip.label}`}
                          className="cr-focus inline-flex items-center gap-1 rounded-sm border border-[var(--cr-card-border)] bg-[var(--cr-bg)] px-2 py-1 text-xs text-[var(--cr-ink-2)] hover:border-rose-300 hover:text-rose-700 dark:hover:text-rose-300"
                        >
                          <span className="max-w-[160px] truncate">{chip.label}</span>
                          <X className="h-3 w-3 shrink-0" aria-hidden />
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </details>
          )}
          {readinessNote && (
            <p className="mt-3 border-t border-[var(--cr-card-border)] pt-2 text-sm text-[var(--cr-ink-2)]">{readinessNote}</p>
          )}
        </div>
      )}
    </div>
  );
};
