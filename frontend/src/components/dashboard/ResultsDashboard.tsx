import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { useEvaluationState, useMetrics, useAuth } from '@shared/context';
import { useMetricData, useSummaryAndChat } from '@shared/hooks';
import {
  ExportButtons,
  EvaluatedMetricsSummary,
  SummarySection,
  MetricVisualization,
  TurnByTurnTable,
  TurnDetailView,
  ChatbotSection
} from '@shared/components/dashboard';
import { EvidenceSketch, PencilRule, PencilUnderline } from '../design/NotebookMarks';
import { MarkerHighlight } from '@shared/components/design/MarkerHighlight';

/**
 * Main Results Dashboard - Refactored into modular components
 *
 * This component orchestrates the display of evaluation results including:
 * - Structured evaluation summary
 * - Interactive metric visualizations
 * - Turn-by-turn analysis table
 * - Detailed turn view
 * - Result assistant for Q&A
 */
export const ResultsDashboard: React.FC = () => {
  // Context
  const { conversation, results, runMetadata } = useEvaluationState();
  const { selectedPredefinedMetrics, selectedCustomizedMetrics, selectedLiteratureMetrics } = useMetrics();
  const { apiKeys, selectedProvider, selectedModel } = useAuth();

  // Local state
  const [selectedTurnIndex, setSelectedTurnIndex] = useState<number | null>(0);
  const turnDetailRef = useRef<HTMLDivElement | null>(null);
  const shouldScrollToTurnDetailRef = useRef(false);
  const navigate = useNavigate();

  // Derive string[] of literature metric names for components that need string[]
  const literatureMetricNames = selectedLiteratureMetrics.map(m => m.metricName);

  // Custom hooks
  const derivedMetricData = useMetricData(
    results,
    selectedPredefinedMetrics,
    selectedCustomizedMetrics,
    literatureMetricNames
  );
  const metricNames = runMetadata?.metricNames?.length ? runMetadata.metricNames : derivedMetricData.metricNames;
  const metricLabelMap = runMetadata?.metricLabelMap || derivedMetricData.metricLabelMap;
  const evaluatedPredefinedMetricNames = runMetadata?.metricGroups?.predefined
    || selectedPredefinedMetrics.map((metric) => metric.name);
  const evaluatedLiteratureMetricNames = runMetadata?.metricGroups?.literature || literatureMetricNames;
  const {
    summary,
    isLoadingSummary,
    summaryError,
    resetSummary,
    chatbotMessages,
    chatbotInput,
    setChatbotInput,
    isLoadingChatbot,
    userRole,
    setUserRole,
    handleChatbotSubmit
  } = useSummaryAndChat({
    conversation,
    results,
    apiKeys,
    selectedProvider,
    selectedModel,
    useTurnNumbers: true
  });

  useEffect(() => {
    if (selectedTurnIndex === null || !shouldScrollToTurnDetailRef.current) return;
    shouldScrollToTurnDetailRef.current = false;
    // On wide screens the detail pane is sticky beside the table, so don't yank the page.
    const isWide = typeof window !== 'undefined' && window.matchMedia('(min-width: 1280px)').matches;
    if (isWide) return;
    turnDetailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [selectedTurnIndex]);

  const handleSelectTurn = (turnIndex: number) => {
    if (turnIndex === selectedTurnIndex) {
      const isWide = typeof window !== 'undefined' && window.matchMedia('(min-width: 1280px)').matches;
      if (!isWide) {
        window.requestAnimationFrame(() => {
          turnDetailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      }
      return;
    }
    shouldScrollToTurnDetailRef.current = true;
    setSelectedTurnIndex(turnIndex);
  };

  // Don't render if no results available
  if (!results || !conversation) {
    return null;
  }

  const savedAtLabel = runMetadata?.savedAt
    ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(runMetadata.savedAt)
    : null;

  return (
    <div>
      <div className="grid gap-6 pb-10 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div className="min-w-0">
          <p className="cr-kicker">Report</p>
          <div className="relative mt-2 max-w-3xl pb-2">
            <h1 className="cr-page-title break-words text-[30px] text-[var(--cr-ink)] md:text-[36px]">
              {conversation.title || 'Conversation review'}
            </h1>
            <PencilUnderline className="absolute -bottom-0.5 left-0 h-2.5 w-2/3 text-[var(--cr-brand-primary)] opacity-55" />
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--cr-ink-2)]">
            <span>{conversation.messages.length} turns</span>
            {runMetadata?.selectedMetricCount ? (
              <span>
                {runMetadata.selectedMetricCount} metric{runMetadata.selectedMetricCount === 1 ? '' : 's'}
              </span>
            ) : null}
            {runMetadata?.provider ? <span>{runMetadata.provider} · {runMetadata.model}</span> : null}
            {savedAtLabel ? <span>{savedAtLabel}</span> : null}
          </div>
        </div>
        <div className="flex min-w-0 items-end gap-5">
          <EvidenceSketch className="hidden h-20 w-20 text-[var(--cr-brand-primary)] xl:block" />
          <div className="grid w-full min-w-0 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center">
            <button
              onClick={() => navigate('/configure')}
              className="cr-btn cr-btn-ghost cr-focus h-9 justify-start px-4 sm:justify-center"
            >
              <ChevronLeft size={16} />
              Evaluation criteria
            </button>
            <ExportButtons
              results={results}
              conversation={conversation}
              metricNames={metricNames}
              metricLabelMap={metricLabelMap}
            />
          </div>
        </div>
      </div>

      <section id="results-integrity" className="scroll-mt-24 pb-10">
        <EvaluatedMetricsSummary />
      </section>

      <div className="mb-12 grid gap-1 border-l-[3px] border-[var(--cr-brand-leaf)] bg-[var(--cr-brand-leaf-soft)] px-4 py-3 text-sm leading-6 text-[var(--cr-brand-leaf-strong)] sm:grid-cols-[170px_minmax(0,1fr)] sm:gap-5">
        <p className="font-semibold">Interpretation guidance</p>
        <p>
          These are model-generated review signals,{' '}
          <MarkerHighlight tone="coral">not clinical conclusions.</MarkerHighlight>{' '}
          Inspect the cited turns before using a finding.
        </p>
      </div>

      <div>
        <section id="results-summary" className="scroll-mt-24 pb-14">
          <SummarySection
            summary={summary}
            isLoadingSummary={isLoadingSummary}
            summaryError={summaryError}
            onRegenerate={resetSummary}
          />
        </section>

        <section id="results-trends" className="scroll-mt-24 pb-14">
          <MetricVisualization
            results={results}
            conversation={conversation}
            metricNames={metricNames}
            metricLabelMap={metricLabelMap}
          />
        </section>

        <section id="results-turns" className="scroll-mt-24 pb-14">
          <header>
            <PencilRule className="h-2.5 w-full text-[var(--cr-card-border)]" />
            <span className="cr-eyebrow mt-3">Transcript evidence</span>
            <h2 className="cr-section-title mt-1 text-lg md:text-xl">Evidence by turn</h2>
            <p className="mt-1 max-w-2xl text-[13px] leading-5 text-[var(--cr-ink-2)]">
              Select a transcript row to review its metric results and available evidence.
            </p>
            <div className="mt-3 max-w-3xl border-l-[3px] border-[var(--cr-brand-primary)] bg-[var(--cr-brand-primary-soft)] px-3 py-2 text-[13px] leading-5 text-[var(--cr-ink-2)]">
              <MarkerHighlight tone="blue">Trained model-scored metrics</MarkerHighlight>{' '}
              return model-defined labels or scores without generated reasoning. This is expected, not a missing result.{' '}
              <MarkerHighlight tone="mint">Build your own</MarkerHighlight> and rubric-scored metrics include supporting reasoning.
            </div>
          </header>

          <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(360px,0.85fr)]">
            <div className="min-w-0">
              <TurnByTurnTable
                results={results}
                conversation={conversation}
                metricNames={metricNames}
                metricLabelMap={metricLabelMap}
                selectedLiteratureMetrics={evaluatedLiteratureMetricNames}
                selectedTurnIndex={selectedTurnIndex}
                onSelectTurn={handleSelectTurn}
              />
            </div>

            <div ref={turnDetailRef} className="scroll-mt-24 xl:sticky xl:top-5 xl:self-start">
              {selectedTurnIndex !== null && results.utteranceScores[selectedTurnIndex] ? (
                <TurnDetailView
                  turnIndex={selectedTurnIndex}
                  results={results}
                  conversation={conversation}
                  metricNames={metricNames}
                  metricLabelMap={metricLabelMap}
                  selectedLiteratureMetrics={evaluatedLiteratureMetricNames}
                  trainedModelMetricNames={evaluatedPredefinedMetricNames}
                  layout="compact"
                  onClose={() => setSelectedTurnIndex(null)}
                />
              ) : (
                <div className="cr-card flex min-h-[320px] flex-col items-center justify-center px-6 py-12 text-center">
                  <p className="text-[13px] text-[var(--cr-ink-2)]">
                    Select a turn to see scores and evidence.
                  </p>
                </div>
              )}
            </div>
          </div>
        </section>

        <section id="results-assistant" className="scroll-mt-24">
          <ChatbotSection
            chatbotMessages={chatbotMessages}
            chatbotInput={chatbotInput}
            setChatbotInput={setChatbotInput}
            isLoadingChatbot={isLoadingChatbot}
            userRole={userRole}
            setUserRole={setUserRole}
            onSubmit={handleChatbotSubmit}
          />
        </section>

      </div>
    </div>
  );
};
