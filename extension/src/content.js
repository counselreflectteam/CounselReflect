// Main content script - orchestrates sidebar and scraping functionality
import { toggleSidebar, getSidebarIframe } from './utils/sidebar.js';
import {
  areMessagesContainedInConversation,
  areSameConversationMessages,
  scrapeCurrentPage
} from './utils/scrapers.js';
import {
  clearTooltipSystem,
  getMessageElementRoots,
  getPinnedScoreMessageId,
  initTooltipSystem,
  mapMessageElements,
  setEvaluationData,
  setPinnedScoreMessage,
  setTooltipTextScale
} from './utils/tooltip.js';

// Sidebar text-size steps → zoom factor for on-page overlays. Keep in sync
// with TEXT_SCALE_OPTIONS in utils/textScale.ts (the sidebar mirrors its
// choice into chrome.storage.local under 'textScale'). With no stored choice
// the overlays must match the sidebar's FALLBACK_STEP ('large').
const TEXT_SCALE_ZOOM = { default: 1, large: 1.125, xl: 1.25 };
const textScaleZoomFor = (step) => TEXT_SCALE_ZOOM[step] ?? TEXT_SCALE_ZOOM.large;

// Store the last scraped messages for re-mapping
let lastScrapedMessages = [];

// Resolves with this tab's id (or null); used to hand the sidebar a way to
// address this tab via chrome.tabs.sendMessage.
let tabIdPromise = null;

// Background injection can race the manifest script, and an unpacked
// extension reload can leave an old isolated-world expando on an otherwise
// live website tab. Make each injected copy explicitly replace and dispose
// the previous instance instead of using a permanent boolean guard that can
// lock a newly installed build out of the page.
const CONTENT_INSTANCE_KEY = '__counselReflectContentInstance';
const CONTENT_BUILD_ID = __COUNSELREFLECT_CONTENT_BUILD_ID__;
if (
  window[CONTENT_INSTANCE_KEY]?.buildId !== CONTENT_BUILD_ID ||
  typeof window[CONTENT_INSTANCE_KEY]?.dispose !== 'function'
) {
  installContentScriptInstance();
}

function installContentScriptInstance() {
  try {
    window[CONTENT_INSTANCE_KEY]?.dispose?.();
  } catch (e) {
    // The previous extension context may already be invalidated.
  }

  const instance = { buildId: null, dispose: null };
  window[CONTENT_INSTANCE_KEY] = instance;
  instance.dispose = initContentScript();
  // Mark the build current only after initialization finishes. A fallback
  // injection can recover if setup ever throws partway through.
  instance.buildId = CONTENT_BUILD_ID;
}

function initContentScript() {
  // Initialize tooltip system on page load
  initTooltipSystem({ onPinnedMessageChange: handleTurnEvidenceChange });

  // Adopt the sidebar's text-size preference and follow live changes.
  const handleStorageChanged = (changes, area) => {
    if (area === 'local' && changes.textScale) {
      setTooltipTextScale(textScaleZoomFor(changes.textScale.newValue));
    }
  };
  try {
    chrome.storage.local.get('textScale', (stored) => {
      if (!chrome.runtime.lastError) {
        setTooltipTextScale(textScaleZoomFor(stored?.textScale));
      }
    });
    chrome.storage.onChanged.addListener(handleStorageChanged);
  } catch (e) {
    // Extension context invalidated — overlays just keep the default scale.
  }

  tabIdPromise = new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage({ type: 'GET_TAB_ID' }, (response) => {
        if (!chrome.runtime.lastError && response && typeof response.tabId === 'number') {
          resolve(response.tabId);
        } else {
          resolve(null);
        }
      });
    } catch (e) {
      resolve(null);
    }
  });

  // Single message channel for both the background script (toggle) and the
  // sidebar iframe (scrape/tooltips/highlights via chrome.tabs.sendMessage).
  // Host-page scripts cannot reach chrome.runtime, so unlike the previous
  // window.postMessage channel this cannot be spoofed or eavesdropped by the
  // page. All responses are synchronous except SCRAPE_REQUEST, which waits
  // for the conversation DOM to stop changing (returns true to keep the
  // message channel open).
  const handleRuntimeMessage = (message, sender, sendResponse) => {
    if (!message) return;

    if (message.action === 'toggleSidebar') {
      handleToggleSidebar();
      sendResponse({ success: true });
      return;
    }

    if (typeof message.type !== 'string') return;

    switch (message.type) {
      // Handle scrape requests from sidebar
      case 'SCRAPE_REQUEST': {
        scrapeWhenStable()
          .then((result) => {
            // Map message elements for tooltip system and store messages
            if (result.success && result.messages.length > 0) {
              // A new scrape invalidates the previous run's overlays before
              // the sidebar state update makes the same transition, and
              // cancels any evaluation-apply retry still waiting on the old
              // page state.
              evaluationApplyToken += 1;
              clearTooltipSystem();
              mapMessageElements(result.messages);
              lastScrapedMessages = result.messages; // Store for later re-mapping
            }

            sendResponse(result);
          })
          .catch((error) => {
            sendResponse({
              platform: 'unknown',
              messages: [],
              success: false,
              error: error.message
            });
          });
        return true; // Async response
      }

      // Handle evaluation results from sidebar
      case 'EVALUATION_RESULTS': {
        applyEvaluationResultsWhenPageReady(message).then(sendResponse);
        return true; // Async response
      }

      // The sidebar asks for the current selected turn when it first mounts. This makes
      // opening a brand-new iframe reliable even if the initial runtime
      // broadcast happened before React installed its listener.
      case 'GET_PINNED_SCORE':
        sendResponse({ messageId: getPinnedScoreMessageId() });
        break;

      // Keep host-page selection and the Turn evidence detail in sync.
      case 'SET_PINNED_SCORE': {
        setPinnedScoreMessage(message.messageId ?? null);
        sendResponse({ success: true, messageId: getPinnedScoreMessageId() });
        break;
      }

      case 'SCROLL_TO_SCORE_MESSAGE': {
        const roots = getMessageElementRoots(message.messageId);
        if (!roots.length) {
          sendResponse({ success: false, error: 'message-not-found' });
          break;
        }
        setPinnedScoreMessage(message.messageId);
        roots[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
        sendResponse({ success: true });
        break;
      }

      // Handle clear tooltip request
      case 'CLEAR_TOOLTIPS':
        // An explicit clear also cancels any evaluation-apply retry loop so
        // a superseded report can never re-create overlays after this point.
        evaluationApplyToken += 1;
        clearTooltipSystem();
        // Don't clear lastScrapedMessages - we need them for re-mapping after evaluation
        sendResponse({ success: true });
        break;

      // Handle batch highlight request
      case 'HIGHLIGHT_ALL_REQUEST':
        if (!lastScrapedMessages.length) {
          sendResponse({ success: false, error: 'no-scrape' });
          break;
        }
        if (!currentPageMatchesLastScrape()) {
          clearHighlights();
          sendResponse({ success: false, error: 'page-changed' });
          break;
        }
        if (Array.isArray(message.highlights)) {
          clearHighlights();
          highlightAllTexts(message.highlights);
        }
        sendResponse({ success: true });
        break;

      // Handle clear highlights request
      case 'CLEAR_HIGHLIGHTS':
        clearHighlights();
        sendResponse({ success: true });
        break;

      // Handle single highlight request (legacy)
      case 'HIGHLIGHT_REQUEST':
        if (!currentPageMatchesLastScrape()) {
          clearHighlights();
          sendResponse({ success: false, error: 'page-changed' });
          break;
        }
        if (message.action === 'highlight') {
          clearHighlights();
          highlightTextOnPage(message.text, message.score, true, message.messageId);
        }
        sendResponse({ success: true });
        break;
    }
  };

  chrome.runtime.onMessage.addListener(handleRuntimeMessage);

  return () => {
    try {
      chrome.runtime.onMessage.removeListener(handleRuntimeMessage);
    } catch (e) {
      // Expected when an unpacked extension has just been reloaded.
    }
    try {
      chrome.storage.onChanged.removeListener(handleStorageChanged);
    } catch (e) {
      // Same as above.
    }
    clearTooltipSystem();
    lastScrapedMessages = [];
    tabIdPromise = null;
  };
}

/**
 * Open the extension sidebar for a selected turn and send it directly to Turn
 * evidence. A newly created iframe recovers the same state through
 * GET_PINNED_SCORE after mounting, so there is no timing race.
 */
function handleTurnEvidenceChange(messageId) {
  if (messageId) {
    const iframe = getSidebarIframe();
    if (!iframe || iframe.getAttribute('aria-hidden') === 'true') {
      handleToggleSidebar();
    }
  }

  tabIdPromise?.then((tabId) => {
    try {
      chrome.runtime.sendMessage({
        type: 'OPEN_TURN_EVIDENCE',
        tabId,
        messageId: messageId ?? null
      });
    } catch (e) {
      // The extension may have been reloaded while the host tab stayed open.
    }
  });
}

function currentPageMatchesLastScrape() {
  if (!lastScrapedMessages.length) return false;
  const current = scrapeCurrentPage();
  return current.success && areSameConversationMessages(current.messages, lastScrapedMessages);
}

// A newer EVALUATION_RESULTS delivery cancels any older retry loop so a
// re-fired sidebar effect can never apply stale results over fresh ones.
let evaluationApplyToken = 0;

/**
 * Map evaluation results onto the page, waiting out SPA hydration. Reports
 * survive a sidebar or extension reload in sessionStorage while content-script
 * memory does not, so right after a page load this handler races the host app
 * still rendering its conversation. A single instant scrape made that race a
 * permanent loss (the sidebar never re-sends); retry within a bounded budget
 * instead, and only report failure once the page has had time to settle.
 */
async function applyEvaluationResultsWhenPageReady(message) {
  const evaluatedMessages =
    Array.isArray(message.messages) && message.messages.length > 0
      ? message.messages
      : null;
  const token = ++evaluationApplyToken;
  const deadline = Date.now() + SCRAPE_STABILITY_BUDGET_MS;
  let outcome = tryApplyEvaluationResults(message, evaluatedMessages);

  while (!outcome.success && Date.now() < deadline) {
    await delay(SCRAPE_STABILITY_INTERVAL_MS);
    if (token !== evaluationApplyToken) return { success: false, error: 'superseded' };
    outcome = tryApplyEvaluationResults(message, evaluatedMessages);
  }

  // Overlays from an earlier run must not survive on a page that no longer
  // shows the evaluated conversation. Only the final verdict clears them:
  // clearing on a transient mid-hydration mismatch would be premature.
  if (!outcome.success && outcome.error === 'page-changed') clearTooltipSystem();
  return outcome;
}

function tryApplyEvaluationResults(message, evaluatedMessages) {
  // Recover the current-page scrape only after verifying that the exact
  // evaluated transcript is an ordered subset of this page. This restores
  // Scores automatically without ever mapping a report onto another SPA
  // conversation.
  if (!lastScrapedMessages.length) {
    const current = scrapeCurrentPage();
    if (!current.success || !current.messages.length) {
      return { success: false, error: 'no-scrape' };
    }
    if (
      !evaluatedMessages ||
      !areMessagesContainedInConversation(evaluatedMessages, current.messages)
    ) {
      return { success: false, error: 'page-changed' };
    }
    lastScrapedMessages = current.messages;
  }
  if (!currentPageMatchesLastScrape()) {
    // Drop a recovery scrape captured mid-hydration so the next retry can
    // re-verify containment against the settled page instead of comparing
    // full equality with a stale partial snapshot forever.
    lastScrapedMessages = [];
    return { success: false, error: 'page-changed' };
  }
  // Pass the exact evaluated subset when the sidebar filtered scraped turns.
  // Page freshness is still checked against the full original scrape above;
  // only tooltip/result index mapping uses this subset.
  setEvaluationData(
    message.payload,
    evaluatedMessages || lastScrapedMessages,
    message.metricPresentation || {}
  );
  return { success: true };
}

// Re-sample interval and total budget for the streaming-stability check.
// The budget stays under the sidebar's 10s scrape timeout.
const SCRAPE_STABILITY_INTERVAL_MS = 700;
const SCRAPE_STABILITY_BUDGET_MS = 8000;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Scrape the page repeatedly until two consecutive samples match, so a
// response that is still streaming is never captured half-finished. If the
// DOM keeps changing for the whole budget, report the in-progress response
// instead of silently evaluating a truncated transcript.
async function scrapeWhenStable() {
  const deadline = Date.now() + SCRAPE_STABILITY_BUDGET_MS;
  let previous = scrapeCurrentPage();
  let previousKey = JSON.stringify(previous.messages);

  while (Date.now() < deadline) {
    await delay(SCRAPE_STABILITY_INTERVAL_MS);
    const current = scrapeCurrentPage();
    const currentKey = JSON.stringify(current.messages);
    if (currentKey === previousKey) {
      return current;
    }
    previous = current;
    previousKey = currentKey;
  }

  return {
    platform: previous.platform,
    messages: [],
    success: false,
    error: 'A response is still being generated. Wait for it to finish, then scrape again.'
  };
}

function handleToggleSidebar() {
  tabIdPromise.then((tabId) => {
    // The sidebar needs this tab's id to reach the content script via
    // chrome.tabs.sendMessage; bake it into the iframe URL up front so the
    // first open does not trigger a second iframe load.
    const sidebarUrl = chrome.runtime.getURL(
      tabId !== null ? `sidebar.html?tabId=${tabId}` : 'sidebar.html'
    );
    toggleSidebar(sidebarUrl);

    // Defensive: patch the URL of an iframe that was somehow created before
    // the tab id was known (bridge.ts also has a GET_TAB_ID fallback).
    const iframe = getSidebarIframe();
    if (iframe && tabId !== null && !iframe.src.includes('tabId=')) {
      iframe.src = sidebarUrl;
    }
  });
}

// Timeout ids for staggered highlights still waiting to run, so a clear
// request can cancel them before they repaint.
let pendingHighlightTimeouts = [];

// Clear all highlights
function clearHighlights() {
  pendingHighlightTimeouts.forEach(id => clearTimeout(id));
  pendingHighlightTimeouts = [];

  document.querySelectorAll('.llm-highlight-wrapper').forEach(el => {
    const parent = el.parentNode;
    while (el.firstChild) {
      parent.insertBefore(el.firstChild, el);
    }
    parent.removeChild(el);
    parent.normalize(); // Merge adjacent text nodes
  });
}

// Highlight all texts at once
function highlightAllTexts(highlights) {
  // Add CSS animation if not already present
  if (!document.getElementById('llm-highlight-animation')) {
    const style = document.createElement('style');
    style.id = 'llm-highlight-animation';
    style.textContent = `
      @keyframes highlight-pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.8; }
      }
      .llm-highlight-wrapper {
        transition: all 0.3s ease;
      }
      .llm-highlight-wrapper:hover {
        filter: brightness(0.95);
      }
    `;
    document.head.appendChild(style);
  }

  // Process each highlight
  highlights.forEach((highlight, index) => {
    pendingHighlightTimeouts.push(setTimeout(() => {
      highlightTextOnPage(highlight.text, highlight.score, false, highlight.messageId);
    }, index * 100)); // Stagger highlights for smoother UX
  });

  // Scroll to first highlight after all are applied
  pendingHighlightTimeouts.push(setTimeout(() => {
    const firstHighlight = document.querySelector('.llm-highlight-wrapper');
    if (firstHighlight) {
      firstHighlight.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, highlights.length * 100 + 200));
}

// Improved function to highlight text on the current page
function highlightTextOnPage(textToHighlight, score, scrollTo = true, messageId = null) {
  // Determine color based on score
  const bgColor = score === 5 ? '#fef08a' : '#fed7aa'; // yellow-200 for 5, orange-200 for 4
  const borderColor = score === 5 ? '#84cc16' : '#f97316'; // lime-500 for 5, orange-500 for 4

  // Normalize the search text (trim and normalize whitespace)
  const normalizedSearch = textToHighlight.trim().replace(/\s+/g, ' ');
  if (!normalizedSearch) return false;

  // Results include the source turn id. Restrict the search to that turn's
  // mapped DOM blocks so repeated phrases elsewhere in the page are never
  // highlighted as evidence for the wrong message.
  const searchRoots = messageId ? getMessageElementRoots(messageId) : [document.body];
  if (messageId && searchRoots.length === 0) {
    console.warn('Message element not found for highlight:', messageId);
    return false;
  }

  let found = false;

  // Build whitespace-tolerant patterns that run against the RAW node text, so
  // match offsets/lengths are valid Range coordinates (normalizing the node
  // text first would shift the offsets and misplace the highlight).
  const toPattern = (text) => escapeRegExp(text).replace(/ /g, '\\s+');

  // Try different search strategies
  const searchStrategies = [
    // Strategy 1: Exact match
    new RegExp(toPattern(normalizedSearch)),
    // Strategy 2: Case-insensitive match
    new RegExp(toPattern(normalizedSearch), 'i'),
    // Strategy 3: Partial match (first 30 chars)
    normalizedSearch.length > 30 ? new RegExp(toPattern(normalizedSearch.substring(0, 30)), 'i') : null,
  ].filter(Boolean);

  // Try each strategy
  for (const strategy of searchStrategies) {
    if (found) break;

    for (const root of searchRoots) {
      if (found) break;

      // Use TreeWalker to find text nodes
      const walker = document.createTreeWalker(
        root,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode: function(node) {
            // Skip script, style, and already highlighted nodes
            if (node.parentElement?.tagName === 'SCRIPT' ||
                node.parentElement?.tagName === 'STYLE' ||
                node.parentElement?.classList.contains('llm-highlight-wrapper')) {
              return NodeFilter.FILTER_REJECT;
            }
            return NodeFilter.FILTER_ACCEPT;
          }
        }
      );

      let node;
      while ((node = walker.nextNode())) {
        const match = strategy.exec(node.textContent);

        if (match) {
          try {
            // Highlight exactly what matched. Extending by the normalized search
            // length would apply whitespace-collapsed offsets to the RAW node
            // text and cover characters never verified to match, so the mark
            // could spill across unrelated trailing text.
            const end = match.index + match[0].length;

            // Create range for highlighting
            const range = document.createRange();
            range.setStart(node, match.index);
            range.setEnd(node, end);

            // Create highlight span
            const highlightSpan = document.createElement('mark');
            highlightSpan.className = 'llm-highlight-wrapper';
            highlightSpan.setAttribute('data-score', score);
            highlightSpan.setAttribute('data-metric-highlight', 'true');
            highlightSpan.style.cssText = `
              background-color: ${bgColor} !important;
              border-left: 4px solid ${borderColor} !important;
              padding: 2px 4px !important;
              font-weight: 600 !important;
              box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15) !important;
              border-radius: 3px !important;
              animation: highlight-pulse 1.5s ease-in-out !important;
              display: inline !important;
              color: inherit !important;
            `;

            // Apply highlight
            range.surroundContents(highlightSpan);

            // Scroll to highlighted text if requested
            if (scrollTo) {
              setTimeout(() => {
                highlightSpan.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }, 100);
            }

            found = true;
            break;
          } catch (error) {
            console.warn('Failed to highlight text, trying next occurrence:', error);
            continue;
          }
        }
      }
    }
  }

  if (!found) {
    // Do not write transcript excerpts to the host page's developer console.
    console.warn('Highlight text was not found in the mapped message element.');
  }

  return found;
}

// Escape regex metacharacters in message text (which routinely contains
// characters like . ? ( ) so it cannot be interpolated into a RegExp as-is)
function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
