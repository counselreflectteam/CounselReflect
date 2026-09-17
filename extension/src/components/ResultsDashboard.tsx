import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { Check } from 'lucide-react';
import { EvaluationStatus } from '@shared/types';
import { useEvaluationState } from '@shared/context';
import { useMetrics } from '@shared/context';
import { useAuth } from '@shared/context';
import {
  getHostTabId,
  sendToContent,
  CONTENT_UNREACHABLE_MESSAGE,
} from '../utils/bridge';
import { buildMetricPresentationSnapshot } from '@shared/utils/metricPresentation';
import { ExtensionTurnEvidenceDetail } from './turnEvidence/ExtensionTurnEvidenceDetail';
import { getScoredTurnIndexes } from './turnEvidence/turnMetricModel';
import { ReportZone } from './ReportZone';
import { ReportNav } from './ReportNav';

// Hooks from shared
import { useMetricData, useSummaryAndChat, useMetricCompletion } from '@shared/hooks';

// Components from shared
import {
  ExportButtons,
  SummarySection,
  MetricVisualization,
  TurnByTurnTable,
  ChatbotSection,
  EvaluatedMetricsSummary
} from '@shared/components/dashboard';

declare const chrome: any;

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
  const { conversation, results, status, runMetadata } = useEvaluationState();
  const { selectedPredefinedMetrics, selectedCustomizedMetrics, selectedLiteratureMetrics } = useMetrics();
  const { apiKeys, selectedProvider, selectedModel } = useAuth();

  // Local state
  const [selectedTurnMessageId, setSelectedTurnMessageId] = useState<string | null>(null);
  const [revealSelectedTurnRequest, setRevealSelectedTurnRequest] = useState(0);
  const [detailNavigationRequest, setDetailNavigationRequest] = useState(0);
  const [selectedHighlightMetric, setSelectedHighlightMetric] = useState<string | null>(null);
  const evidenceHeadingRef = React.useRef<HTMLHeadingElement | null>(null);
  const detailContainerRef = React.useRef<HTMLDivElement | null>(null);
  const detailHeadingRef = React.useRef<HTMLHeadingElement | null>(null);
  const selectionOriginRef = React.useRef<'host' | 'report'>('report');
  const selectedTurnMessageIdRef = React.useRef<string | null>(null);
  const resultScopeRef = React.useRef({
    timestamp: results?.timestamp ?? null,
    conversationId: conversation?.id ?? null,
  });

  // Derive string[] of literature metric names for components that need string[]
  const literatureMetricNames = React.useMemo(
    () => selectedLiteratureMetrics.map((metric) => metric.metricName),
    [selectedLiteratureMetrics]
  );

  // Custom hooks
  const derivedMetricData = useMetricData(
    results,
    selectedPredefinedMetrics,
    selectedCustomizedMetrics,
    literatureMetricNames
  );
  const metricNames = runMetadata?.metricNames?.length
    ? runMetadata.metricNames
    : derivedMetricData.metricNames;
  const metricLabelMap = runMetadata?.metricLabelMap || derivedMetricData.metricLabelMap;
  const metricPresentation = React.useMemo(
    () =>
      runMetadata?.metricPresentation ||
      buildMetricPresentationSnapshot(
        selectedPredefinedMetrics,
        selectedCustomizedMetrics,
        selectedLiteratureMetrics
      ),
    [
      runMetadata?.metricPresentation,
      selectedPredefinedMetrics,
      selectedCustomizedMetrics,
      selectedLiteratureMetrics,
    ]
  );
  const evaluatedLiteratureMetricNames = React.useMemo(
    () => runMetadata?.metricGroups.literature || literatureMetricNames,
    [runMetadata?.metricGroups.literature, literatureMetricNames]
  );
  const isPageTranscript = Boolean(conversation?.id?.startsWith('scraped-'));

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

  const selectedTurnIndex = React.useMemo(() => {
    if (!selectedTurnMessageId || !processedResults?.utteranceScores) return null;
    const index = processedResults.utteranceScores.findIndex(
      (scoreItem) => scoreItem.messageId === selectedTurnMessageId,
    );
    return index >= 0 ? index : null;
  }, [processedResults, selectedTurnMessageId]);
  const selectedScoreItem = selectedTurnIndex !== null
    ? processedResults?.utteranceScores[selectedTurnIndex]
    : null;
  const selectedMessage = selectedTurnMessageId
    ? conversation?.messages.find((message) => message.id === selectedTurnMessageId)
    : null;
  const scoredTurnIndexes = React.useMemo(
    () => getScoredTurnIndexes(processedResults?.utteranceScores || []),
    [processedResults],
  );

  // Report zones. Coverage opens itself when any selected metric failed;
  // zone bodies are hidden, never unmounted, so chat/chart/highlight state
  // survives collapse.
  const { totalSuccessCount, totalMetricCount, hasFailures } = useMetricCompletion();
  const [openZones, setOpenZones] = React.useState(() => ({
    coverage: Boolean(runMetadata && metricNames.length < runMetadata.selectedMetricCount),
    findings: true,
    highlight: true,
    explore: true
  }));
  const toggleZone = React.useCallback((id: keyof typeof openZones) => {
    setOpenZones((zones) => ({ ...zones, [id]: !zones[id] }));
  }, []);
  const jumpToZone = React.useCallback((id: string) => {
    // Non-zone targets (the always-open Ask section) just scroll.
    setOpenZones((zones) => {
      const key = id as keyof typeof zones;
      if (!(key in zones) || zones[key]) return zones;
      return { ...zones, [key]: true };
    });
    window.requestAnimationFrame(() => {
      const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      document.getElementById(`report-zone-section-${id}`)?.scrollIntoView({
        behavior: reduceMotion ? 'auto' : 'smooth',
        block: 'start'
      });
    });
  }, []);

  const runReceipt = React.useMemo(() => {
    const metricCount = runMetadata?.selectedMetricCount ?? metricNames.length;
    const parts = [
      `${metricCount} metric${metricCount === 1 ? '' : 's'}`,
      runMetadata?.provider,
      runMetadata?.model,
      runMetadata?.savedAt
        ? new Date(runMetadata.savedAt).toLocaleString(undefined, {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          })
        : null,
      conversation ? `${conversation.messages.length} turns` : null
    ];
    return parts.filter(Boolean).join(' · ');
  }, [runMetadata, metricNames.length, conversation]);

  React.useEffect(() => {
    selectedTurnMessageIdRef.current = selectedTurnMessageId;
  }, [selectedTurnMessageId]);

  React.useEffect(() => {
    const previous = resultScopeRef.current;
    const next = {
      timestamp: results?.timestamp ?? null,
      conversationId: conversation?.id ?? null,
    };
    resultScopeRef.current = next;
    const scopeChanged =
      (previous.timestamp !== null && previous.timestamp !== next.timestamp) ||
      (previous.conversationId !== null && previous.conversationId !== next.conversationId);
    if (!scopeChanged || !selectedTurnMessageIdRef.current) return;
    setSelectedTurnMessageId(null);
    if (isPageTranscript) {
      void sendToContent({ type: 'SET_PINNED_SCORE', messageId: null }).catch(() => {});
    }
  }, [conversation?.id, isPageTranscript, results?.timestamp]);

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

  const syncHostSelection = React.useCallback((
    messageId: string | null,
  ) => {
    if (!isPageTranscript) return Promise.resolve(null);
    return sendToContent<{ success: boolean; messageId?: string | null }>({
      type: 'SET_PINNED_SCORE',
      messageId,
    });
  }, [isPageTranscript]);

  const selectTurn = React.useCallback((
    messageId: string,
    origin: 'host' | 'report',
    options: { revealInExplorer?: boolean; navigateToDetail?: boolean } = {},
  ) => {
    selectionOriginRef.current = origin;
    setSelectedTurnMessageId(messageId);
    if (options.revealInExplorer) {
      setRevealSelectedTurnRequest((request) => request + 1);
    }
    if (options.navigateToDetail) {
      // The single choke point for every arrival mode (host click, cold
      // GET_PINNED_SCORE recovery, report rows): the Explore zone must be
      // open before the rAF scroll effect measures the detail card.
      setOpenZones((zones) => (zones.explore ? zones : { ...zones, explore: true }));
      setDetailNavigationRequest((request) => request + 1);
    }
  }, []);

  const handleHostTurnIntent = React.useCallback((messageId: string | null) => {
    if (!isPageTranscript) return;
    if (!messageId) {
      setSelectedTurnMessageId(null);
      return;
    }

    const scoreItem = processedResults?.utteranceScores.find(
      (item) => item.messageId === messageId,
    );
    const message = conversation?.messages.find((item) => item.id === messageId);
    if (!scoreItem || !message) {
      setSelectedTurnMessageId(null);
      void syncHostSelection(null).catch(() => {});
      toast('That page turn is no longer part of this report. Scrape the page again.', {
        id: 'stale-turn-evidence',
      });
      return;
    }

    selectTurn(messageId, 'host', {
      revealInExplorer: true,
      navigateToDetail: true,
    });
  }, [conversation, isPageTranscript, processedResults, selectTurn, syncHostSelection]);

  const hostIntentHandlerRef = React.useRef(handleHostTurnIntent);
  React.useEffect(() => {
    hostIntentHandlerRef.current = handleHostTurnIntent;
  }, [handleHostTurnIntent]);

  // A live runtime message handles an already-mounted sidebar. GET restores
  // the same intent when the iframe or lazy report mounts after the click.
  React.useEffect(() => {
    let active = true;
    let requestSequence = 0;

    const listener = (runtimeMessage: any) => {
      if (
        runtimeMessage?.type !== 'OPEN_TURN_EVIDENCE' &&
        runtimeMessage?.type !== 'PIN_SCORE_INSPECTOR'
      ) return;

      const request = ++requestSequence;
      void getHostTabId().then((tabId) => {
        if (!active || request !== requestSequence) return;
        if (typeof runtimeMessage.tabId === 'number' && runtimeMessage.tabId !== tabId) return;
        hostIntentHandlerRef.current(
          typeof runtimeMessage.messageId === 'string' ? runtimeMessage.messageId : null,
        );
      });
    };

    chrome.runtime.onMessage.addListener(listener);
    const recoveryRequest = ++requestSequence;
    sendToContent<{ messageId?: string | null }>({ type: 'GET_PINNED_SCORE' })
      .then((response) => {
        if (!active || recoveryRequest !== requestSequence) return;
        hostIntentHandlerRef.current(response?.messageId || null);
      })
      .catch(() => {});

    return () => {
      active = false;
      chrome.runtime.onMessage.removeListener(listener);
    };
  }, []);

  const handleSelectTurnFromReport = React.useCallback((turnIndex: number) => {
    const messageId = processedResults?.utteranceScores[turnIndex]?.messageId;
    if (!messageId) return;

    selectTurn(messageId, 'report', { navigateToDetail: true });
    void syncHostSelection(messageId)
      .then((response) => {
        if (isPageTranscript && response && response.messageId !== messageId) {
          toast('This turn is open in the report, but it could not be linked to the page.', {
            id: 'turn-page-link',
          });
        }
      })
      .catch(() => {
        if (isPageTranscript) {
          toast(CONTENT_UNREACHABLE_MESSAGE, { id: 'turn-page-link' });
        }
      });
  }, [isPageTranscript, processedResults, selectTurn, syncHostSelection]);

  const handleNavigateScoredTurn = React.useCallback((turnIndex: number) => {
    const messageId = processedResults?.utteranceScores[turnIndex]?.messageId;
    if (!messageId) return;
    selectionOriginRef.current = 'report';
    setSelectedTurnMessageId(messageId);
    void syncHostSelection(messageId).catch(() => {});
  }, [processedResults, syncHostSelection]);

  const closeTurnEvidence = React.useCallback(() => {
    const messageId = selectedTurnMessageIdRef.current;
    if (!messageId) return;
    setSelectedTurnMessageId(null);
    void syncHostSelection(null).catch(() => {});

    window.requestAnimationFrame(() => {
      evidenceHeadingRef.current?.focus({ preventScroll: true });
    });
  }, [syncHostSelection]);

  const findSelectedTurnOnPage = React.useCallback(() => {
    if (!selectedTurnMessageId || !isPageTranscript) return;
    sendToContent<{ success: boolean; error?: string }>({
      type: 'SCROLL_TO_SCORE_MESSAGE',
      messageId: selectedTurnMessageId,
    })
      .then((response) => {
        if (response?.success === false) {
          toast('Could not find this turn on the page. Scrape the conversation again.', {
            id: 'find-turn-on-page',
          });
        }
      })
      .catch(() => toast(CONTENT_UNREACHABLE_MESSAGE, { id: 'find-turn-on-page' }));
  }, [isPageTranscript, selectedTurnMessageId]);

  React.useEffect(() => {
    if (!detailNavigationRequest || selectedTurnIndex === null) return;
    let focusFrame: number | null = null;
    const scrollFrame = window.requestAnimationFrame(() => {
      const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      const detail = detailContainerRef.current;
      const scrollContainer = detail?.closest('main');
      if (detail && scrollContainer instanceof HTMLElement) {
        const containerRect = scrollContainer.getBoundingClientRect();
        const detailRect = detail.getBoundingClientRect();
        scrollContainer.scrollTo({
          // 60 = 44px sticky report nav + 16px breathing room, so the detail
          // card lands fully below the nav.
          top: Math.max(0, scrollContainer.scrollTop + detailRect.top - containerRect.top - 60),
          behavior: reduceMotion ? 'auto' : 'smooth',
        });
      }
      if (selectionOriginRef.current === 'host') {
        focusFrame = window.requestAnimationFrame(() => {
          detailHeadingRef.current?.focus({ preventScroll: true });
        });
      }
    });

    return () => {
      window.cancelAnimationFrame(scrollFrame);
      if (focusFrame !== null) window.cancelAnimationFrame(focusFrame);
    };
  }, [detailNavigationRequest, selectedTurnIndex]);

  React.useEffect(() => {
    if (selectedTurnIndex === null) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      const detail = detailContainerRef.current;
      if (!detail || !detail.contains(document.activeElement)) return;
      event.preventDefault();
      closeTurnEvidence();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [closeTurnEvidence, selectedTurnIndex]);

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
        //
        // Highlight the specific span the LLM flagged (the backend requires
        // highlighted_text for 4-5 scores). Skip entries without one rather
        // than falling back to the whole message, which content.js can only
        // ever partially match.
        if (numericScore >= 4) {
          const flagged = typeof score.highlighted_text === 'string' ? score.highlighted_text.trim() : '';
          if (flagged) {
            highlights.push({
              text: flagged,
              score: Math.round(numericScore),
              metricName,
              messageId: utt.messageId
            });
          }
        }
      });
    });

    return highlights;
  }, [processedResults, conversation]);

  // Eligible metrics: selected literature metrics where needHighlight === true.
  // Memoized (like everything feeding the highlight effect below) so the
  // effect only re-fires when the underlying data actually changes, not on
  // every unrelated dashboard render such as a chatbot keystroke.
  const highlightEligibleMetrics = React.useMemo(
    () => {
      const evaluatedNames = new Set(evaluatedLiteratureMetricNames);
      return selectedLiteratureMetrics.filter(
        (metric) => metric.needHighlight && evaluatedNames.has(metric.metricName)
      );
    },
    [selectedLiteratureMetrics, evaluatedLiteratureMetricNames]
  );

  // Only keep highlights for eligible metrics (sent to the content script)
  const eligibleHighlightedTexts = React.useMemo(() => {
    const eligibleNames = new Set(highlightEligibleMetrics.map(m => m.metricName));
    return highlightedTexts.filter(h => eligibleNames.has(h.metricName));
  }, [highlightedTexts, highlightEligibleMetrics]);

  const selectedMetricHighlights = React.useMemo(
    () =>
      selectedHighlightMetric
        ? eligibleHighlightedTexts.filter(h => h.metricName === selectedHighlightMetric)
        : [],
    [eligibleHighlightedTexts, selectedHighlightMetric]
  );

  // Effect to handle highlighting on the actual page. The cleanup clears the
  // host page whenever the highlights change, the metric is deselected, or
  // the dashboard unmounts, so stale highlight spans never linger there.
  React.useEffect(() => {
    if (!isPageTranscript || !selectedHighlightMetric || selectedMetricHighlights.length === 0) return;

    // Send batch highlight request
    sendToContent<{ success: boolean; error?: string }>({
      type: 'HIGHLIGHT_ALL_REQUEST',
      highlights: selectedMetricHighlights
    })
      .then((response) => {
        if (response?.success === false) {
          toast(
            response.error === 'page-changed'
              ? 'The page conversation changed. Scrape it again before showing highlights.'
              : 'Scrape the page again before showing highlights.',
            { id: 'highlight-stale-page' }
          );
        }
      })
      .catch((e) => {
        console.error('Failed to send highlights to content script:', e);
        toast.error(CONTENT_UNREACHABLE_MESSAGE, { id: 'content-bridge' });
      });

    return () => {
      sendToContent({ type: 'CLEAR_HIGHLIGHTS' }).catch(() => {
        // No highlights to clear if the content script is unreachable
      });
    };
  }, [isPageTranscript, selectedHighlightMetric, selectedMetricHighlights]);

  // Effect to send evaluation results to content script (for tooltips)
  React.useEffect(() => {
    if (!results || status !== EvaluationStatus.Complete) return;

    // Tooltips map scores by index onto the messages scraped from THIS page.
    // Results for an uploaded transcript must never be overlaid onto whatever
    // unrelated conversation the user happens to have open.
    if (!isPageTranscript) return;

    sendToContent<{ success: boolean; error?: string }>({
      type: 'EVALUATION_RESULTS',
      payload: processedResults,
      // A scraped preview may exclude individual turns. Send the exact
      // evaluated subset so host-page tooltips map result indexes back to the
      // retained message ids instead of the original unfiltered scrape.
      messages: conversation?.messages ?? [],
      metricPresentation
    })
      .then((response) => {
        if (response && response.success === false && response.error === 'no-scrape') {
          // Restored run + freshly injected content script that could not find
          // the conversation even after waiting out hydration. Re-scraping
          // would discard this restored report, so point at the recovery that
          // preserves it: reloading the page and reopening the sidebar.
          toast(
            'Could not find this conversation on the page. Reload the page and reopen the sidebar to restore on-page scores.',
            { id: 'tooltip-noscrape' }
          );
        } else if (response && response.success === false && response.error === 'page-changed') {
          toast(
            'The page conversation changed since this report was created. Scrape and evaluate again to refresh on-page scores.',
            { id: 'tooltip-page-changed' }
          );
        }
      })
      .catch((e) => {
        console.error('Failed to send evaluation results to content script:', e);
        toast.error(CONTENT_UNREACHABLE_MESSAGE, { id: 'content-bridge' });
      });
  }, [results, status, processedResults, conversation, isPageTranscript, metricPresentation]);

  // Don't render if no results available
  if (!results || !conversation) {
    return null;
  }

  return (
    <div>
      {/* MASTHEAD — stable landing for the Header's "View report" button and
          the run-complete auto-scroll. Never collapses. */}
      <div className="pb-6">
        <h2 className="cr-display text-xl text-[var(--cr-ink)]">Evaluation results</h2>
        <p className="cr-meta mt-1.5">{runReceipt}</p>
        <div className="mt-4">
          <ExportButtons
            results={processedResults}
            conversation={conversation}
            metricNames={metricNames}
            metricLabelMap={metricLabelMap}
          />
        </div>
      </div>

      <ReportNav
        zones={[
          { id: 'coverage', label: 'Coverage', open: openZones.coverage },
          { id: 'findings', label: 'Summary', open: openZones.findings },
          { id: 'explore', label: 'Explore', open: openZones.explore },
          { id: 'ask', label: 'Ask', open: true }
        ]}
        onJump={jumpToZone}
      />

      <div className="pt-6">

      {/* COVERAGE — run meta: which metrics ran and succeeded. Opens itself
          when anything failed; otherwise its stat row says it all. */}
      <ReportZone
        id="coverage"
        eyebrow="Coverage"
        title="What was evaluated"
        purpose="Which metrics ran and succeeded"
        stat={
          totalMetricCount === 0 ? (
            <span className="cr-meta">No metric record</span>
          ) : hasFailures ? (
            <span className="whitespace-nowrap text-xs font-medium tabular-nums text-rose-700 dark:text-rose-300">
              {totalSuccessCount} of {totalMetricCount}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium tabular-nums text-emerald-700 dark:text-emerald-400">
              <Check className="h-3 w-3" aria-hidden />
              {totalSuccessCount}/{totalMetricCount}
            </span>
          )
        }
        open={openZones.coverage}
        onToggle={() => toggleZone('coverage')}
      >
        <EvaluatedMetricsSummary hideOpener />
      </ReportZone>

      {/* SUMMARY — the generated session summary. */}
      <ReportZone
        id="findings"
        eyebrow="Summary"
        title="Session summary"
        purpose="A generated synthesis of the evaluated signals"
        open={openZones.findings}
        onToggle={() => toggleZone('findings')}
      >
        <SummarySection
          summary={summary}
          isLoadingSummary={isLoadingSummary}
          summaryError={summaryError}
          onRegenerate={resetSummary}
          replaceLineWithTurn={true}
          hideOpener
        />
      </ReportZone>

      {/* HIGHLIGHTS — on-page highlight tool (module), shown when the user
          selected needHighlight metrics. Not in the chip nav; its closed row
          always names any live highlight. */}
      {isPageTranscript && highlightEligibleMetrics.length > 0 && (
        <ReportZone
          id="highlight"
          eyebrow="Highlights"
          title="Highlight on page"
          purpose="Paint high-scoring sentences on the conversation page"
          stat={
            selectedHighlightMetric && selectedMetricHighlights.length > 0 ? (
              /* Long metric names must ellipsize (house pattern, cf. the
                 StepSection receipts) — an unbounded nowrap span pushes the
                 chevron past the overflow-x-clip edge at larger text sizes. */
              <span className="cr-meta block max-w-[11rem] truncate">
                {metricLabelMap[selectedHighlightMetric] || selectedHighlightMetric} · {selectedMetricHighlights.length} on page
              </span>
            ) : (
              <span className="cr-meta whitespace-nowrap">{highlightEligibleMetrics.length} available</span>
            )
          }
          open={openZones.highlight}
          onToggle={() => toggleZone('highlight')}
        >
          <div className="cr-module p-4">
            <div className="relative">
              <select
                value={selectedHighlightMetric || ''}
                onChange={(e) => setSelectedHighlightMetric(e.target.value || null)}
                className="cr-control cr-focus w-full cursor-pointer appearance-none rounded-lg border border-[var(--cr-input-border)] bg-[var(--cr-bg)] px-3 py-2.5 pr-9 text-sm font-medium text-[var(--cr-ink)] focus:outline-none"
              >
                <option value="">Select a metric to highlight…</option>
                {highlightEligibleMetrics.map((metric) => {
                  const count = eligibleHighlightedTexts.filter(h => h.metricName === metric.metricName).length;
                  return (
                    <option key={metric.metricName} value={metric.metricName}>
                      {metricLabelMap[metric.metricName] || metric.metricName} ({count} sentence{count !== 1 ? 's' : ''})
                    </option>
                  );
                })}
              </select>
              <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[var(--cr-ink-3)]">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>

            {selectedHighlightMetric && (
              <p className="mt-3 flex items-center text-xs text-[var(--cr-ink-2)]">
                {selectedMetricHighlights.length > 0 ? (
                  <>
                    <span className="mr-2 inline-block h-2 w-2 shrink-0 rounded-full bg-amber-500" />
                    {selectedMetricHighlights.length} sentence{selectedMetricHighlights.length !== 1 ? 's' : ''} highlighted on the page (orange = 4, yellow = 5).
                  </>
                ) : (
                  <>
                    <span className="mr-2 inline-block h-2 w-2 shrink-0 rounded-full bg-[var(--cr-ink-3)]" />
                    No high-scoring sentences found for this metric.
                  </>
                )}
              </p>
            )}
          </div>
        </ReportZone>
      )}

      {/* EXPLORE — one exploration surface: the metric chart, the turn
          table, and the turn evidence detail. Deep links force this open. */}
      <ReportZone
        id="explore"
        eyebrow="Explore"
        title="Scores, turns, and evidence"
        purpose="Chart each metric and inspect every turn's scores"
        open={openZones.explore}
        onToggle={() => toggleZone('explore')}
      >
        <MetricVisualization
          results={processedResults}
          conversation={conversation}
          metricNames={metricNames}
          metricLabelMap={metricLabelMap}
          compact
          hideOpener
        />

        <div className="mt-8">
          <h3
            ref={evidenceHeadingRef}
            tabIndex={-1}
            className="cr-subhead rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            Turn explorer
          </h3>
          <p className="cr-meta mt-1">Select a row to see that turn&apos;s scores and evidence.</p>
          <div className="mt-3 border-l-[3px] border-[var(--cr-brand-primary)] bg-[var(--cr-brand-primary-soft)] px-3 py-2 text-[0.8125rem] leading-5 text-[var(--cr-ink-2)]">
            <strong className="text-[var(--cr-ink)]">Trained model-scored metrics</strong> return labels or scores without generated reasoning.
            This is expected. Build your own and rubric-scored metrics include supporting reasoning.
          </div>

          <div className="mt-5 space-y-4">
            <TurnByTurnTable
              results={processedResults}
              conversation={conversation}
              metricNames={metricNames}
              metricLabelMap={metricLabelMap}
              selectedLiteratureMetrics={evaluatedLiteratureMetricNames}
              selectedTurnIndex={selectedTurnIndex}
              onSelectTurn={handleSelectTurnFromReport}
              revealSelectedTurnRequest={revealSelectedTurnRequest}
              compact
            />

            {selectedTurnIndex !== null && selectedScoreItem && selectedMessage && (
              <ExtensionTurnEvidenceDetail
                turnIndex={selectedTurnIndex}
                message={selectedMessage}
                scoreItem={selectedScoreItem}
                presentationById={metricPresentation}
                scoredTurnIndexes={scoredTurnIndexes}
                containerRef={detailContainerRef}
                headingRef={detailHeadingRef}
                onClose={closeTurnEvidence}
                onFindOnPage={isPageTranscript ? findSelectedTurnOnPage : undefined}
                onSelectTurn={handleNavigateScoredTurn}
              />
            )}
          </div>
        </div>
      </ReportZone>

      {/* ASK — follow-up chat, always laid out in full (no fold): its own
          opener band renders the threshold. */}
      <section id="report-zone-section-ask" className="scroll-mt-[60px]">
        <ChatbotSection
          chatbotMessages={chatbotMessages}
          chatbotInput={chatbotInput}
          setChatbotInput={setChatbotInput}
          isLoadingChatbot={isLoadingChatbot}
          userRole={userRole}
          setUserRole={setUserRole}
          onSubmit={handleChatbotSubmit}
          compact
        />
      </section>

      </div>
    </div>
  );
};
