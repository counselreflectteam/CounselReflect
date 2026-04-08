import React, { useState } from 'react';
import { useEvaluationState, useMetrics, useAuth } from '@shared/context';
import { useScoreStats, useMetricData, useSummaryAndChat } from '@shared/hooks';
import {
  ExportButtons,
  SummarySection,
  MetricVisualization,
  TurnByTurnTable,
  TurnDetailView,
  ChatbotSection
} from '@shared/components/dashboard';

/**
 * Main Results Dashboard - Refactored into modular components
 * 
 * This component orchestrates the display of evaluation results including:
 * - AI-generated summary
 * - Interactive metric visualizations
 * - Turn-by-turn analysis table
 * - Detailed turn view
 * - AI chatbot for Q&A
 */
export const ResultsDashboard: React.FC = () => {
  // Context
  const { conversation, results } = useEvaluationState();
  const { selectedPredefinedMetrics, selectedCustomizedMetrics, selectedLiteratureMetrics } = useMetrics();
  const { apiKeys, selectedProvider, selectedModel } = useAuth();

  // Local state
  const [selectedTurnIndex, setSelectedTurnIndex] = useState<number | null>(null);

  // Derive string[] of literature metric names for components that need string[]
  const literatureMetricNames = selectedLiteratureMetrics.map(m => m.metricName);

  // Custom hooks
  const scoreStats = useScoreStats(results);
  const { metricNames, metricLabelMap } = useMetricData(
    results,
    selectedPredefinedMetrics,
    selectedCustomizedMetrics,
    literatureMetricNames
  );
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
    selectedModel
  });

  // Don't render if no results available
  if (!results || !conversation) {
    return null;
  }

  return (
    <div className="space-y-8 animate-fade-in-up">
      {/* Header with Export Buttons */}
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-4">
        <div className="flex items-center">
          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 text-blue-600 dark:bg-blue-900/50 dark:text-blue-400 font-bold text-sm mr-3 shrink-0">
            4
          </div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Evaluation Results</h2>
        </div>
        <ExportButtons
          results={results}
          conversation={conversation}
          metricNames={metricNames}
          metricLabelMap={metricLabelMap}
        />
      </div>


      {/* AI Summary Section - Full Width */}
      <SummarySection
        summary={summary}
        isLoadingSummary={isLoadingSummary}
        summaryError={summaryError}
        scoreStats={scoreStats}
        results={results}
        onRegenerate={resetSummary}
      />

      {/* Metric Visualization */}
      <MetricVisualization
        results={results}
        conversation={conversation}
        metricNames={metricNames}
        metricLabelMap={metricLabelMap}
      />

      {/* Turn-by-Turn Table */}
      <TurnByTurnTable
        results={results}
        conversation={conversation}
        metricNames={metricNames}
        metricLabelMap={metricLabelMap}
        selectedLiteratureMetrics={literatureMetricNames}
        selectedTurnIndex={selectedTurnIndex}
        onSelectTurn={setSelectedTurnIndex}
      />

      {/* Turn Detail View */}
      {selectedTurnIndex !== null && results.utteranceScores[selectedTurnIndex] && (
        <TurnDetailView
          turnIndex={selectedTurnIndex}
          results={results}
          conversation={conversation}
          metricNames={metricNames}
          metricLabelMap={metricLabelMap}
          selectedLiteratureMetrics={literatureMetricNames}
          onClose={() => setSelectedTurnIndex(null)}
        />
      )}

      {/* AI Chatbot Section - Full Width */}
      <div className="mt-12 w-full">
        <ChatbotSection
          chatbotMessages={chatbotMessages}
          chatbotInput={chatbotInput}
          setChatbotInput={setChatbotInput}
          isLoadingChatbot={isLoadingChatbot}
          userRole={userRole}
          setUserRole={setUserRole}
          onSubmit={handleChatbotSubmit}
        />
      </div>
    </div>
  );
};
