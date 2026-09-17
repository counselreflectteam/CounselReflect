import React, { useState, useCallback, useMemo } from 'react';
import { Play } from 'lucide-react';
import {
  PredefinedMetricsConfig,
  CustomizedMetricsConfig,
  LiteratureBenchmarksConfig,
  EvaluationError,
  EvaluationProgress,
  EvaluationLoadingMark
} from '@shared/components/config';
import { SectionCard } from './SectionCard';
import { StepSection, type StepPresentation } from './StepSection';
import { useAuth, useEvaluationState, useMetrics } from '@shared/context';
import { useEvaluation } from '@shared/hooks/useEvaluation';
import { calculatePhasesToRun } from '@shared/utils/evaluationUtils';
import { buildMetricLabelMap, filterMetricNames } from '@shared/utils/metricUtils';
import { buildMetricPresentationSnapshot } from '@shared/utils/metricPresentation';

interface EvaluationConfigProps {
  disabled: boolean;
  /** Collapse presentation decided by App; this component NEVER unmounts
      while collapsed — it owns the in-flight run (useEvaluation). */
  presentation?: StepPresentation;
  receipt?: React.ReactNode;
  onExpand?: () => void;
  onCollapse?: () => void;
}

type TabId = 'predefined' | 'literature' | 'custom';
type TabMotionDirection = 'forward' | 'backward';

const TAB_ORDER: TabId[] = ['predefined', 'literature', 'custom'];

interface TabButtonProps {
  id: TabId;
  label: string;
  isActive: boolean;
  onClick: () => void;
  buttonRef: (element: HTMLButtonElement | null) => void;
}

/* Text tabs (system .cr-tab vocabulary, matching web MetricsTabs) —
   aria-selected drives the active bold ink + brand underline. Roving
   tabindex keeps a single tab stop on the tablist. Module scope so
   re-renders don't remount the button and drop keyboard focus. */
const TabButton: React.FC<TabButtonProps> = ({ id, label, isActive, onClick, buttonRef }) => (
  <button
    ref={buttonRef}
    type="button"
    role="tab"
    id={`metrics-tab-${id}`}
    aria-controls={`metrics-panel-${id}`}
    tabIndex={isActive ? 0 : -1}
    aria-selected={isActive}
    onClick={onClick}
    className="cr-tab cr-control cr-focus flex min-h-[52px] min-w-0 items-end justify-center whitespace-normal px-1 text-center leading-4"
  >
    {label}
  </button>
);

export const EvaluationConfig: React.FC<EvaluationConfigProps> = ({
  disabled,
  presentation = 'active',
  receipt,
  onExpand,
  onCollapse
}) => {
  const { selectedPredefinedMetrics, selectedCustomizedMetrics, selectedLiteratureMetrics, lockedProfile } = useMetrics();
  const { apiKeys, selectedProvider, selectedModel } = useAuth();
  const { conversation, setStatus, setResults, setError, setRunMetadata } = useEvaluationState();
  const [activeTab, setActiveTab] = useState<TabId>('predefined');
  const [tabMotionDirection, setTabMotionDirection] = useState<TabMotionDirection | null>(null);

  const tabRefs = React.useRef<Record<TabId, HTMLButtonElement | null>>({
    predefined: null,
    literature: null,
    custom: null
  });

  const activateTab = useCallback((nextTab: TabId, direction?: TabMotionDirection) => {
    if (nextTab === activeTab) return;
    const currentIndex = TAB_ORDER.indexOf(activeTab);
    const nextIndex = TAB_ORDER.indexOf(nextTab);
    setTabMotionDirection(direction ?? (nextIndex > currentIndex ? 'forward' : 'backward'));
    setActiveTab(nextTab);
  }, [activeTab]);

  // APG tabs pattern: ArrowLeft/ArrowRight (wrapping) plus Home/End move
  // focus and activate the tab (automatic activation — panels are
  // pre-rendered, so switching is cheap). Matches web MetricsTabs.
  const handleTablistKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const currentIndex = TAB_ORDER.indexOf(activeTab);
    let nextTab: TabId;
    switch (event.key) {
      case 'ArrowRight':
        nextTab = TAB_ORDER[(currentIndex + 1) % TAB_ORDER.length];
        event.preventDefault();
        activateTab(nextTab, 'forward');
        tabRefs.current[nextTab]?.focus();
        return;
      case 'ArrowLeft':
        nextTab = TAB_ORDER[(currentIndex - 1 + TAB_ORDER.length) % TAB_ORDER.length];
        event.preventDefault();
        activateTab(nextTab, 'backward');
        tabRefs.current[nextTab]?.focus();
        return;
      case 'Home':
        nextTab = TAB_ORDER[0];
        break;
      case 'End':
        nextTab = TAB_ORDER[TAB_ORDER.length - 1];
        break;
      default:
        return;
    }
    event.preventDefault();
    activateTab(nextTab);
    tabRefs.current[nextTab]?.focus();
  };

  const activePanelClass = tabMotionDirection
    ? `cr-metric-panel-${tabMotionDirection}`
    : '';

  // Use shared evaluation hook
  const {
    isEvaluating,
    isCancelling,
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

  // Tracks whether an evaluation has started during this mount so the sync
  // below skips the initial render: useEvaluation always starts at Idle, and
  // syncing that would clobber a Complete status/results snapshot restored
  // from sessionStorage (and delete the persisted snapshot).
  const hasRunRef = React.useRef(false);

  // Sync evaluation state to context
  React.useEffect(() => {
    if (!hasRunRef.current) return;
    setStatus(evalStatus);
    if (evalResults) setResults(evalResults);
    if (evalError) setError(evalError);
  }, [evalStatus, evalResults, evalError, setStatus, setResults, setError]);

  const handleRunEvaluation = useCallback(async () => {
    hasRunRef.current = true;
    setError(null);
    setRunMetadata(null);
    // Note: results/status flow to context via the sync effect above —
    // ResultsDashboard is the single sender of EVALUATION_RESULTS to the
    // content script, with id-normalized results. onComplete only snapshots
    // the run metadata so the "Run integrity" panel reflects what actually
    // ran instead of drifting with live checkbox selections.
    await runEvaluation({
      conversation,
      selectedPredefinedMetrics,
      selectedCustomizedMetrics,
      selectedLiteratureMetrics,
      lockedProfile,
      apiKeys: apiKeys as unknown as Record<string, string>,
      selectedProvider,
      selectedModel,
      onComplete: (result) => {
        const literatureMetricNames = selectedLiteratureMetrics.map((metric) => metric.metricName);
        setRunMetadata({
          metricNames: filterMetricNames(result),
          metricLabelMap: buildMetricLabelMap(
            selectedPredefinedMetrics,
            selectedCustomizedMetrics,
            literatureMetricNames
          ),
          metricPresentation: buildMetricPresentationSnapshot(
            selectedPredefinedMetrics,
            selectedCustomizedMetrics,
            selectedLiteratureMetrics
          ),
          selectedMetricCount:
            selectedPredefinedMetrics.length +
            selectedCustomizedMetrics.length +
            selectedLiteratureMetrics.length,
          provider: selectedProvider,
          model: selectedModel,
          metricGroups: {
            predefined: selectedPredefinedMetrics.map((metric) => metric.name),
            literature: literatureMetricNames,
            custom: selectedCustomizedMetrics.map((metric) => metric.name),
          },
          savedAt: Date.now(),
        });
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
    setError,
    setRunMetadata
  ]);

  const noMetricsSelected =
    selectedPredefinedMetrics.length === 0 &&
    selectedCustomizedMetrics.length === 0 &&
    selectedLiteratureMetrics.length === 0;

  // Attributed selection line above the Run button — plain text, no
  // tab-switch links at sidebar widths. Zero-count sources are omitted.
  const selectionBreakdown = useMemo(() => {
    const totalSelected =
      selectedPredefinedMetrics.length +
      selectedLiteratureMetrics.length +
      selectedCustomizedMetrics.length;
    if (totalSelected === 0) return null;
    const parts = [
      { count: selectedPredefinedMetrics.length, label: 'model-scored' },
      { count: selectedLiteratureMetrics.length, label: 'rubric-scored' },
      { count: selectedCustomizedMetrics.length, label: 'custom' }
    ]
      .filter((part) => part.count > 0)
      .map((part) => `${part.count} ${part.label}`);
    return [`${totalSelected} selected`, ...parts].join(' · ');
  }, [
    selectedPredefinedMetrics.length,
    selectedLiteratureMetrics.length,
    selectedCustomizedMetrics.length
  ]);

  return (
    <div className="space-y-6">
      {/* Step 3 — the action step's tool module. StepSection keeps the body
          mounted (hidden) in receipt/locked states so a live run survives. */}
      <StepSection
        eyebrow="Step 3 of 3"
        title="Evaluation metrics"
        subtitle="Select metrics or define rubrics for the model to apply."
        state={presentation}
        receipt={receipt}
        purpose="Choose or build the metrics to run"
        onExpand={onExpand}
        onCollapse={onCollapse}
      >
        <div className="space-y-4">
          {/* Equal tracks keep every source visible in a narrow sidebar.
              The custom label wraps instead of becoming a hidden horizontal
              scroll target. */}
          <div
            role="tablist"
            aria-label="Metric sources"
            onKeyDown={handleTablistKeyDown}
            className="grid grid-cols-3 border-b border-[var(--cr-rule-on-muted)]"
          >
            <TabButton
              id="predefined"
              label="Model-scored"
              isActive={activeTab === 'predefined'}
              onClick={() => activateTab('predefined')}
              buttonRef={(element) => { tabRefs.current.predefined = element; }}
            />
            <TabButton
              id="literature"
              label="Rubric-scored"
              isActive={activeTab === 'literature'}
              onClick={() => activateTab('literature')}
              buttonRef={(element) => { tabRefs.current.literature = element; }}
            />
            <TabButton
              id="custom"
              label="Build your own metrics"
              isActive={activeTab === 'custom'}
              onClick={() => activateTab('custom')}
              buttonRef={(element) => { tabRefs.current.custom = element; }}
            />
          </div>

          <div
            inert={isEvaluating}
            aria-busy={isEvaluating}
            className={`min-h-[200px] overflow-x-clip transition-opacity ${isEvaluating ? 'pointer-events-none opacity-60' : ''}`}
          >
            <div
              role="tabpanel"
              id="metrics-panel-predefined"
              aria-labelledby="metrics-tab-predefined"
              tabIndex={0}
              className={activeTab === 'predefined' ? `cr-focus block cr-well p-3 ${activePanelClass}` : 'hidden'}
            >
              <PredefinedMetricsConfig />
            </div>
            <div
              role="tabpanel"
              id="metrics-panel-literature"
              aria-labelledby="metrics-tab-literature"
              tabIndex={0}
              className={activeTab === 'literature' ? `cr-focus block cr-well p-3 ${activePanelClass}` : 'hidden'}
            >
              <LiteratureBenchmarksConfig density="compact" />
            </div>
            <div
              role="tabpanel"
              id="metrics-panel-custom"
              aria-labelledby="metrics-tab-custom"
              tabIndex={0}
              className={activeTab === 'custom' ? `cr-focus block cr-well p-3 ${activePanelClass}` : 'hidden'}
            >
              <CustomizedMetricsConfig />
            </div>
          </div>

          {/* Run zone — the sidebar's flow dock. Dock chrome is invisible
              (§6): no tinted surface, the cobalt button IS the color. */}
          {!isEvaluating && !evalError && (
            <div className="space-y-2 p-3">
              {selectionBreakdown && (
                <p className="text-center text-xs text-[var(--cr-ink-2)]">{selectionBreakdown}</p>
              )}
              <button
                onClick={handleRunEvaluation}
                disabled={disabled || noMetricsSelected}
                className="cr-btn cr-btn-primary cr-focus w-full px-5 py-3 text-[0.9375rem] disabled:bg-[var(--cr-bg)] disabled:text-[var(--cr-ink-3)] disabled:opacity-100"
              >
                <Play className="h-4 w-4 fill-current" />
                Run evaluation
              </button>
              {noMetricsSelected && !disabled && (
                <p className="text-center text-xs text-[var(--cr-ink-2)]">
                  Select at least one metric from any tab to continue.
                </p>
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
      </StepSection>

      {/* RUN STATUS — separate module (mode test), matching web ConfigureHeader;
          in-progress status is quiet ink-2 typography (green is reserved
          for satisfied states) */}
      {isEvaluating && (
        <SectionCard
          eyebrow="Run status"
          title={isCancelling ? 'Stopping evaluation' : 'Evaluation in progress'}
          motionClassName="cr-run-enter"
          status={
            <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-xs font-medium text-[var(--cr-ink-2)]">
              <EvaluationLoadingMark className="h-3.5 w-3.5" />
              {isCancelling ? 'Stopping' : 'Running'}
            </span>
          }
        >
          <EvaluationProgress
            progress={progress}
            phasesToRun={phasesToRun}
            phaseCounts={phaseCounts}
            onCancel={() => {
              if (abortEvaluation) abortEvaluation();
            }}
            isCancelling={isCancelling}
          />
        </SectionCard>
      )}
    </div>
  );
};
