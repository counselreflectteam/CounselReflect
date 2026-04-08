import React, { useState } from 'react';
import { EvaluationStatus } from '@shared/types';
import { useEvaluationState } from '@shared/context';
import { useMetrics } from '@shared/context';
import { useAuth } from '@shared/context';

// Hooks from shared
import { useScoreStats, useMetricData, useSummaryAndChat } from '@shared/hooks';

// Components from shared
import {
  ExportButtons,
  SummarySection,
  MetricVisualization,
  TurnByTurnTable,
  TurnDetailView,
  ChatbotSection,
  EvaluatedMetricsSummary
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
  const { conversation, results, status } = useEvaluationState();
  const { selectedPredefinedMetrics, selectedCustomizedMetrics, selectedLiteratureMetrics } = useMetrics();
  const { apiKeys, selectedProvider, selectedModel } = useAuth();

  // Local state
  const [selectedTurnIndex, setSelectedTurnIndex] = useState<number | null>(null);
  const [selectedHighlightMetric, setSelectedHighlightMetric] = useState<string | null>(null);

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

  // Pre-process results to ensure messageIds exist and match conversation
  const processedResults = React.useMemo(() => {
    if (!results || !results.utteranceScores || !conversation || !conversation.messages) return results;
    
    // Always map utteranceScores to match conversation message IDs by index
    // This fixes the issue where backend returns generic 'msg-0' but frontend has 'gemini-user-0'
    const newUtteranceScores = results.utteranceScores.map((score: any, idx: number) => {
      if (conversation.messages[idx]) {
        return { ...score, messageId: conversation.messages[idx].id };
      }
      return score;
    });

    return { ...results, utteranceScores: newUtteranceScores };
  }, [results, conversation]);

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

  // Calculate highlights for all metrics
  const highlightedTexts = React.useMemo(() => {
    if (!processedResults || !processedResults.utteranceScores) return [];
    
    const highlights: Array<{
      text: string;
      score: number;
      metricName: string;
      messageId: string;
    }> = [];

    processedResults.utteranceScores.forEach((utt: any) => {
      const msg = conversation?.messages.find((m: any) => m.id === utt.messageId);
      if (!msg) return;

      Object.entries(utt.metrics).forEach(([metricName, score]: [string, any]) => {
        let numericScore = 0;
        
        if (score.type === 'numerical') {
          // Normalize to 1-5 scale if possible, or just use value
          if (score.max_value === 5) numericScore = score.value;
          else numericScore = (score.value / score.max_value) * 5;
        } else if (score.type === 'categorical') {
           const label = score.label.toLowerCase();
           if (['high', 'good', 'excellent', 'strong', 'positive', 'toxic'].some(l => label.includes(l))) numericScore = 5;
           else if (['medium', 'moderate', 'average'].some(l => label.includes(l))) numericScore = 3;
           else numericScore = 1;
        }

        // Only highlight significant scores (e.g. >= 4 or specific categories)
        // For toxicity, we might want to highlight high toxicity
        // For empathy, high empathy
        if (numericScore >= 4) {
          highlights.push({
            text: msg.content,
            score: Math.round(numericScore),
            metricName,
            messageId: utt.messageId
          });
        } 
      });
    });

    return highlights;
  }, [processedResults, conversation]);

  // Eligible metrics: selected literature metrics where needHighlight === true
  const highlightEligibleMetrics = selectedLiteratureMetrics.filter(m => m.needHighlight);
  const highlightEligibleMetricNames = new Set(highlightEligibleMetrics.map(m => m.metricName));

  // Only keep highlights for eligible metrics (for postMessage)
  const eligibleHighlightedTexts = highlightedTexts.filter(h => highlightEligibleMetricNames.has(h.metricName));

  const selectedMetricHighlights = selectedHighlightMetric 
    ? eligibleHighlightedTexts.filter(h => h.metricName === selectedHighlightMetric)
    : [];

  // Effect to handle highlighting on the actual page
  React.useEffect(() => {
    try {
      if (selectedHighlightMetric && selectedMetricHighlights.length > 0) {
        // Send batch highlight request
        window.parent.postMessage({
            type: 'HIGHLIGHT_ALL_REQUEST',
            highlights: selectedMetricHighlights
        }, '*');
      } else {
        // Clear highlights if no metric selected
        window.parent.postMessage({
            type: 'CLEAR_HIGHLIGHTS'
        }, '*');
      }
    } catch (e) {
      console.error('Failed to post message to parent:', e);
    }
  }, [selectedHighlightMetric, selectedMetricHighlights]);

  // Effect to send evaluation results to content script (for tooltips)
  React.useEffect(() => {
    if (results && status === EvaluationStatus.Complete) {
      try {
        window.parent.postMessage({
            type: 'EVALUATION_RESULTS',
            payload: processedResults
        }, '*');
      } catch (e) {
        console.error('Failed to post evaluation results to parent:', e);
      }
    }
  }, [results, status, processedResults]);

  // Don't render if no results available
  if (!results || !conversation) {
    return null;
  }

  return (
    <div className="space-y-8 animate-fade-in-up">
      {/* Header with Export Buttons */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-700 pb-4">
        <div className="flex items-center">
          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 text-blue-600 dark:bg-blue-900/50 dark:text-blue-400 font-bold text-sm mr-3 shrink-0">
            4
          </div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Evaluation Results</h2>
        </div>

        <ExportButtons
          results={processedResults}
          conversation={conversation}
          metricNames={metricNames}
          metricLabelMap={metricLabelMap}
        />
      </div>

      <EvaluatedMetricsSummary />

      {/* Highlighted Sentences Section - shown when user selected needHighlight metrics */}
      {highlightEligibleMetrics.length > 0 && (
        <div className="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 rounded-lg p-4 border-2 border-amber-200 dark:border-amber-700">
          <div className="flex items-start space-x-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-amber-500 text-white shrink-0 mt-0.5">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-bold text-amber-900 dark:text-amber-100 mb-1">
                Highlighted Sentences
              </h3>
              <p className="text-xs text-amber-700 dark:text-amber-300 mb-3">
                Select a metric to highlight relevant sentences on the webpage
              </p>
              
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-2">
                Selected Metric
              </label>
              <div className="relative">
                <select
                  value={selectedHighlightMetric || ''}
                  onChange={(e) => setSelectedHighlightMetric(e.target.value || null)}
                  className="appearance-none w-full px-4 py-2.5 pr-10 
                    bg-white dark:bg-slate-800 
                    border-2 border-amber-300 dark:border-amber-600 
                    rounded-lg text-sm font-medium text-slate-800 dark:text-slate-100
                    shadow-md hover:shadow-lg 
                    hover:border-amber-400 dark:hover:border-amber-500
                    hover:scale-[1.01] active:scale-[0.99]
                    focus:outline-none focus:ring-4 focus:ring-amber-500/30 focus:border-amber-500
                    transition-all duration-200 cursor-pointer"
                >
                  <option value="">Select a metric to highlight...</option>
                  {highlightEligibleMetrics.map((metric) => {
                    const count = eligibleHighlightedTexts.filter(h => h.metricName === metric.metricName).length;
                    return (
                      <option key={metric.metricName} value={metric.metricName}>
                        {metricLabelMap[metric.metricName] || metric.metricName} ({count} sentence{count !== 1 ? 's' : ''})
                      </option>
                    );
                  })}
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                  <svg 
                    className="w-4 h-4 text-amber-600 dark:text-amber-400" 
                    fill="none" 
                    stroke="currentColor" 
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
              
              {selectedHighlightMetric && (
                <div className="mt-3 p-2 bg-amber-100 dark:bg-amber-900/30 rounded border border-amber-300 dark:border-amber-700">
                  <p className="text-xs text-amber-800 dark:text-amber-200 flex items-center">
                    {selectedMetricHighlights.length > 0 ? (
                      <>
                        <span className="inline-block w-2 h-2 rounded-full bg-amber-500 mr-2 animate-pulse"></span>
                        {selectedMetricHighlights.length} sentence{selectedMetricHighlights.length !== 1 ? 's' : ''} highlighted on webpage (orange = score 4, yellow = score 5)
                      </>
                    ) : (
                      <>
                        <span className="inline-block w-2 h-2 rounded-full bg-slate-400 mr-2"></span>
                        No high-scoring sentences found for this metric
                      </>
                    )}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* AI Summary Section */}
      <SummarySection
        summary={summary}
        isLoadingSummary={isLoadingSummary}
        summaryError={summaryError}
        scoreStats={scoreStats}
        results={processedResults}
        onRegenerate={resetSummary}
        replaceLineWithTurn={true}
      />

      {/* Metric Visualization (Line Chart) */}
      <MetricVisualization
        results={processedResults}
        conversation={conversation}
        metricNames={metricNames}
        metricLabelMap={metricLabelMap}
        scoreStats={scoreStats}
      />

      {/* Turn-by-Turn Analysis Table */}
      <TurnByTurnTable
        results={processedResults}
        conversation={conversation}
        metricNames={metricNames}
        metricLabelMap={metricLabelMap}
        selectedLiteratureMetrics={literatureMetricNames}
        selectedTurnIndex={selectedTurnIndex}
        onSelectTurn={setSelectedTurnIndex}
      />

      {/* Turn Detail View (Expanded Turn) */}
      {selectedTurnIndex !== null && (
        <TurnDetailView
          results={processedResults}
          conversation={conversation}
          metricNames={metricNames}
          metricLabelMap={metricLabelMap}
          selectedLiteratureMetrics={literatureMetricNames}
          turnIndex={selectedTurnIndex}
          onClose={() => setSelectedTurnIndex(null)}
        />
      )}

      {/* AI Chatbot Section */}
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
  );
};
