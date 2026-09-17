import React from 'react';
import { Toaster } from 'react-hot-toast';
import { Check } from 'lucide-react';
import { Header } from './components/Header';
import { InputSection } from './components/InputSection';
import { EvaluationConfigLazy } from './components/EvaluationConfigLazy';
import { ApiKeyConfig } from './components/ApiKeyConfig';
import { AccessCodeCard, type BackendAccessState } from './components/AccessCodeCard';
import { StepSection, type StepPresentation } from './components/StepSection';
import { EvaluationStatus } from '@shared/types';
import {
  AuthProvider,
  MetricsProvider,
  EvaluationStateProvider,
  ThemeProvider,
  useEvaluationState,
  useAuth
} from '@shared/context';
import { ACCESS_TOKEN_CLEARED_EVENT } from '@shared/services/apiClient';
import { ResultsDashboardLazy } from './components/ResultsDashboardLazy';
import { sendToContent } from './utils/bridge';

/* Quiet zone status — typography on the title's baseline, never a pill.
   A satisfied status renders semantic emerald text + check glyph (12px
   medium); an unsatisfied one renders quiet ink-2. (cr-meta's unlayered
   ink would override utility colors, so chips style the text directly.) */
const StatusChip: React.FC<{ complete: boolean; label: string; className?: string }> = ({
  complete,
  label,
  className
}) => (
  <span className={`inline-flex shrink-0 items-center gap-1.5 ${className ?? 'cr-meta'}`}>
    {complete && <Check className="h-3.5 w-3.5" aria-hidden />}
    {label}
  </span>
);

const AppToaster: React.FC = () => (
  <Toaster
    position="top-right"
    toastOptions={{
      duration: 5000,
      style: {
        background: 'var(--cr-card)',
        color: 'var(--cr-toast-ink)',
        border: '1px solid var(--cr-card-border)',
        borderRadius: '1rem',
        boxShadow: 'var(--shadow-lift)'
      }
    }}
  />
);

const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

const AppContent: React.FC = () => {
  const { isAccessGranted, selectedProvider, selectedModel, serverKeyStatusLoaded } = useAuth();
  const { conversation, status, results, runMetadata } = useEvaluationState();
  const hasConversation = Boolean(conversation?.messages?.length);
  const reportReady = Boolean(results && status === EvaluationStatus.Complete);
  // A restored complete report implies consent was granted for this transcript
  // earlier in the same browser session; hydration is synchronous, so this
  // lazy init makes the restored first paint correct (receipts, not forms).
  const [hasDataAuthorization, setHasDataAuthorization] = React.useState(
    () => Boolean(results && status === EvaluationStatus.Complete)
  );
  const mainRef = React.useRef<HTMLElement | null>(null);
  const transcriptRef = React.useRef<HTMLDivElement | null>(null);
  const metricsRef = React.useRef<HTMLDivElement | null>(null);
  const reportRef = React.useRef<HTMLDivElement | null>(null);
  const metricsReady = hasConversation && hasDataAuthorization;
  const previousAccessRef = React.useRef(isAccessGranted);
  const previousMetricsReadyRef = React.useRef(metricsReady);
  const previousReportReadyRef = React.useRef(reportReady);

  // Setup collapse state. Pure derivation — no effect-driven collapse — so a
  // restored session's first paint is already receipts, with no flash.
  const [stepOverride, setStepOverride] = React.useState<Partial<Record<1 | 2 | 3, boolean>>>({});
  const reportConversationRef = React.useRef<string | null>(reportReady ? conversation?.id ?? null : null);
  const scopeStale = reportReady && (conversation?.id ?? null) !== reportConversationRef.current;
  const collapseEligible = reportReady && !scopeStale;

  const step1State: StepPresentation =
    collapseEligible && !stepOverride[1] && (isAccessGranted || !serverKeyStatusLoaded)
      ? 'receipt'
      : 'active';
  const step2State: StepPresentation =
    collapseEligible && hasConversation && hasDataAuthorization && !stepOverride[2]
      ? 'receipt'
      : !isAccessGranted
        ? 'locked'
        : 'active';
  const step3State: StepPresentation =
    collapseEligible && !stepOverride[3]
      ? 'receipt'
      : !metricsReady
        ? 'locked'
        : 'active';

  const expandStep = React.useCallback((step: 1 | 2 | 3) => {
    setStepOverride((current) => ({ ...current, [step]: true }));
  }, []);
  const collapseStep = React.useCallback((step: 1 | 2 | 3) => {
    setStepOverride((current) => ({ ...current, [step]: false }));
  }, []);

  // A step earns a collapse control only while its receipt conditions hold
  // apart from the user's manual expansion.
  const canCollapseStep1 = collapseEligible && (isAccessGranted || !serverKeyStatusLoaded);
  const canCollapseStep2 = collapseEligible && hasConversation && hasDataAuthorization;
  const canCollapseStep3 = collapseEligible;

  // A new run resets manual expansions so completion can re-collapse setup.
  React.useEffect(() => {
    if (status === EvaluationStatus.Loading) setStepOverride({});
  }, [status]);

  const step3Receipt = React.useMemo(() => {
    if (!runMetadata) return 'Completed selection';
    const parts = [
      { count: runMetadata.metricGroups.predefined.length, label: 'model-scored' },
      { count: runMetadata.metricGroups.literature.length, label: 'rubric-scored' },
      { count: runMetadata.metricGroups.custom.length, label: 'custom' }
    ]
      .filter((part) => part.count > 0)
      .map((part) => `${part.count} ${part.label}`);
    return [`${runMetadata.selectedMetricCount} selected`, ...parts].join(' · ');
  }, [runMetadata]);

  const scrollToSection = React.useCallback((target: HTMLElement | null) => {
    const main = mainRef.current;
    if (!main || !target) return;
    const mainRect = main.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const targetTop = main.scrollTop + targetRect.top - mainRect.top - 16;
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    main.scrollTo({
      top: Math.max(0, targetTop),
      behavior: reduceMotion ? 'auto' : 'smooth'
    });
  }, []);

  React.useEffect(() => {
    const becameAvailable = !previousAccessRef.current && isAccessGranted;
    previousAccessRef.current = isAccessGranted;
    if (!becameAvailable) return;
    // A restored session's async access grant must not scroll away from the
    // report the user is already looking at.
    if (reportReady) return;
    const frame = window.requestAnimationFrame(() => scrollToSection(transcriptRef.current));
    return () => window.cancelAnimationFrame(frame);
  }, [isAccessGranted, reportReady, scrollToSection]);

  React.useEffect(() => {
    const becameReady = !previousMetricsReadyRef.current && metricsReady;
    previousMetricsReadyRef.current = metricsReady;
    if (!becameReady) return;
    const frame = window.requestAnimationFrame(() => scrollToSection(metricsRef.current));
    return () => window.cancelAnimationFrame(frame);
  }, [metricsReady, scrollToSection]);

  // The report's entrance animation retains a transform while it plays;
  // dropping the class afterwards keeps position:sticky (the report nav)
  // reliable. Restored sessions start entered and animate nothing.
  const [reportEntered, setReportEntered] = React.useState(reportReady);

  React.useEffect(() => {
    const wasReady = previousReportReadyRef.current;
    const becameReady = !wasReady && reportReady;
    previousReportReadyRef.current = reportReady;
    if (wasReady && !reportReady) {
      setReportEntered(false);
      sendToContent({ type: 'SET_PINNED_SCORE', messageId: null }).catch(() => {});
    }
    if (!becameReady) return;
    reportConversationRef.current = conversation?.id ?? null;
    setStepOverride({});
    const frame = window.requestAnimationFrame(() => scrollToSection(reportRef.current));
    return () => window.cancelAnimationFrame(frame);
  }, [reportReady, conversation, scrollToSection]);

  return (
    <div className="flex h-dvh min-h-0 flex-col overflow-hidden">
      <AppToaster />
      <Header
        hasReport={reportReady}
        onViewReport={() => {
          const report = reportRef.current;
          if (!report) return;
          report.focus({ preventScroll: true });
          scrollToSection(report);
        }}
      />

      <main ref={mainRef} className="custom-scrollbar min-h-0 flex-1 space-y-6 overflow-x-clip overflow-y-auto px-4 pb-8 pt-4">
        {/* Step 1: Model provider — collapses to a one-line receipt once a
            report exists. */}
        <StepSection
          eyebrow="Step 1 of 3"
          title="Model provider"
          state={step1State}
          receipt={`${capitalize(selectedProvider || 'Provider')}${selectedModel ? ` · ${selectedModel}` : ''}`}
          statusChip={
            isAccessGranted ? (
              <StatusChip
                complete
                label="Connected"
                className="whitespace-nowrap text-xs font-medium text-emerald-700 dark:text-emerald-400"
              />
            ) : (
              <StatusChip complete={false} label="Checking…" className="whitespace-nowrap text-xs font-medium text-[var(--cr-ink-2)]" />
            )
          }
          status={
            <StatusChip
              complete={isAccessGranted}
              label={isAccessGranted ? 'Connected' : 'Required'}
              className={`whitespace-nowrap text-xs font-medium tabular-nums ${
                isAccessGranted ? 'text-emerald-700 dark:text-emerald-400' : 'text-[var(--cr-ink-2)]'
              }`}
            />
          }
          onExpand={() => expandStep(1)}
          onCollapse={step1State === 'active' && canCollapseStep1 ? () => collapseStep(1) : undefined}
        >
          <ApiKeyConfig />
        </StepSection>

        {/* Main workflow — inert until provider access is granted. Locked
            steps render as one-line purpose rows (they self-dim), so the
            wrapper carries interaction gating only. */}
        <div inert={!isAccessGranted} className="space-y-6">
          {/* Step 2: Transcript */}
          <div ref={transcriptRef} className={isAccessGranted && step2State === 'active' ? 'cr-flow-enter' : ''}>
            <StepSection
              eyebrow="Step 2 of 3"
              title="Transcript"
              state={step2State}
              purpose="Scrape this page or upload a de-identified file"
              receipt={
                hasConversation
                  ? `${conversation!.messages.length} turns · ${conversation!.id.startsWith('scraped-') ? 'from this page' : 'uploaded'}`
                  : undefined
              }
              status={
                <StatusChip
                  complete={hasConversation}
                  label={hasConversation ? `${conversation!.messages.length} turns` : 'Required'}
                  className={`whitespace-nowrap text-xs font-medium tabular-nums ${
                    hasConversation ? 'text-emerald-700 dark:text-emerald-400' : 'text-[var(--cr-ink-2)]'
                  }`}
                />
              }
              onExpand={() => expandStep(2)}
              onCollapse={step2State === 'active' && canCollapseStep2 ? () => collapseStep(2) : undefined}
            >
              <div className="mb-4 border-b border-[var(--cr-rule-on-muted)] pb-4">
                <p className="text-xs leading-5 text-[var(--cr-ink-2)]">
                  Remove identifying information. Transcript text is sent to {selectedProvider || 'the selected model provider'} for research evaluation; CounselReflect is not a clinical or HIPAA-covered service.
                </p>
                <label className="mt-3 flex cursor-pointer items-start gap-2.5">
                  <input
                    type="checkbox"
                    checked={hasDataAuthorization}
                    onChange={(event) => setHasDataAuthorization(event.target.checked)}
                    className="cr-focus mt-0.5 h-4 w-4 shrink-0 rounded-md border-[var(--cr-input-border)] accent-brand-600"
                  />
                  <span className="text-[0.8125rem] leading-5 text-[var(--cr-ink)]">
                    I am authorized to use this de-identified transcript and consent to this processing.
                  </span>
                </label>
              </div>
              <div
                inert={!hasDataAuthorization}
                className={`transition-opacity ${hasDataAuthorization ? '' : 'pointer-events-none opacity-45'}`}
              >
                <InputSection />
              </div>
            </StepSection>
          </div>

          {/* Step 3: Evaluation configuration — owns its own StepSection so
              the in-flight run (useEvaluation) never unmounts. The RUN STATUS
              module renders outside any hidden wrapper. */}
          <div ref={metricsRef} className={step3State === 'active' ? 'cr-flow-enter' : ''}>
            <EvaluationConfigLazy
              disabled={!hasConversation || !hasDataAuthorization}
              presentation={step3State}
              receipt={step3Receipt}
              onExpand={() => expandStep(3)}
              onCollapse={step3State === 'active' && canCollapseStep3 ? () => collapseStep(3) : undefined}
            />
          </div>

          {/* Report — white reading zones; the dashboard owns its zones */}
          {results && status === EvaluationStatus.Complete && (
            <div
              ref={reportRef}
              tabIndex={-1}
              onAnimationEnd={() => setReportEntered(true)}
              className={`${reportEntered ? '' : 'cr-report-enter'} scroll-mt-4 focus:outline-none`}
            >
              <ResultsDashboardLazy />
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

const AuthorizedApp: React.FC = () => (
  <AuthProvider>
    <MetricsProvider>
      <EvaluationStateProvider>
        <AppContent />
      </EvaluationStateProvider>
    </MetricsProvider>
  </AuthProvider>
);

/**
 * Verify the backend gate before AuthProvider mounts. AuthProvider immediately
 * requests model/key status, so mounting it earlier would send configuration
 * requests before a protected preview has accepted its access code.
 *
 * This gate also owns mid-session re-locking: a 403 clears the token and emits
 * ACCESS_TOKEN_CLEARED_EVENT, which unmounts the provider tree immediately.
 */
const InitialAccessGate: React.FC = () => {
  const [state, setState] = React.useState<BackendAccessState>('checking');

  React.useEffect(() => {
    const relock = () => setState('required');
    window.addEventListener(ACCESS_TOKEN_CLEARED_EVENT, relock);
    return () => window.removeEventListener(ACCESS_TOKEN_CLEARED_EVENT, relock);
  }, []);

  if (state === 'granted') {
    return <AuthorizedApp />;
  }

  return (
    <div className="flex h-dvh min-h-0 flex-col overflow-hidden">
      <AppToaster />
      <Header />
      <main className="custom-scrollbar min-h-0 flex-1 overflow-y-auto px-4 pb-8 pt-4">
        <AccessCodeCard onStateChange={setState} />
      </main>
    </div>
  );
};

const App: React.FC = () => {
  return (
    <ThemeProvider>
      <InitialAccessGate />
    </ThemeProvider>
  );
};

export default App;
