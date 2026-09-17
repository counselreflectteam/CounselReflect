// On-page score affordances: hovering an evaluated turn shows a lightweight
// preview card; clicking the turn pins it and opens the complete, interactive
// explanation in the extension sidebar (clicking again unpins). There is no
// injected button chrome — the message itself is the affordance. The host
// page only receives the minimum presentation snapshot that belongs to the
// completed run.
import { scrapeCurrentPageWithElements } from './scrapers.js';

let evaluationData = null;
let metricPresentation = {};
let messageElements = new Map();
let attachedElements = new Map();
let tooltipElement = null;
let tooltipHideTimer = null;
let pinnedMessageId = null;
let pinnedElementStyles = new Map();
let onPinnedMessageChange = null;
let activeTooltipAnchor = null;
let tooltipFollowListenersAttached = false;
let mappedMessages = [];
let messageRemapObserver = null;
let messageRemapTimer = null;
let messageRemapRetryCount = 0;
// Mirrors the sidebar's text-size preference (content.js syncs it from
// chrome.storage). Applied as CSS zoom on the tooltip CONTENT wrapper — never
// on the fixed-position root, whose px coordinates zoom would multiply.
let tooltipTextScale = 1;

const TOOLTIP_ID = 'counselreflect-score-preview';
// Older builds injected fixed "Scores" buttons with this class. The constant
// remains only so removeStaleOverlayDom can sweep them after an extension
// upgrade replaces the content script without a page reload.
const LEGACY_TRIGGER_CLASS = 'counselreflect-score-trigger';
const OVERLAY_STYLE_ID = 'counselreflect-score-overlay-styles';
const PINNED_TEXT_BACKGROUND = 'rgba(47, 110, 211, 0.055)';
const MESSAGE_REMAP_DELAY_MS = 120;
const MIN_HOST_PREVIEW_WIDTH = 240;
const MESSAGE_REMAP_MAX_RETRIES = 24;

/** Return the DOM roots mapped to a scraped turn without exposing our Map. */
export function getMessageElementRoots(messageId) {
  const entry = messageElements.get(messageId);
  return entry ? Array.from(entry.elements || []) : [];
}

export function getPinnedScoreMessageId() {
  return pinnedMessageId;
}

/**
 * Sync the sidebar's text-size preference onto the on-page overlays. The
 * preview card content and the toxic "!" badges scale together with the
 * sidebar type so the whole extension reads at one size.
 */
export function setTooltipTextScale(scale) {
  const next = Number.isFinite(scale) && scale > 0 ? scale : 1;
  if (next === tooltipTextScale) return;
  tooltipTextScale = next;
  applyTooltipRootScale();
  // A visible preview re-renders at the new scale on its next hover; badges
  // are long-lived, so restyle them in place.
  if (document.querySelectorAll) {
    document.querySelectorAll('.toxic-warning-badge').forEach(applyWarningBadgeScale);
  }
}

function wrapTooltipContentForScale(content) {
  if (tooltipTextScale === 1) return content;
  // zoom scales the wrapper's rendered size; the compensating width keeps the
  // scaled content filling exactly the tooltip's box.
  return `<div style="zoom:${tooltipTextScale};width:${100 / tooltipTextScale}%">${content}</div>`;
}

// Scale the root's width and height cap together with the content. Keeping
// width proportional preserves the default line wrapping exactly (layout
// width stays 360 CSS px inside the zoom wrapper), so rendered height is
// precisely scale x default and the scaled max-height clips nothing that
// fit at the default size.
function applyTooltipRootScale() {
  if (!tooltipElement) return;
  tooltipElement.style.width = `min(${Math.round(360 * tooltipTextScale)}px, calc(100vw - 24px))`;
  tooltipElement.style.maxHeight = `min(${Math.round(420 * tooltipTextScale)}px, calc(100vh - 24px))`;
}

function applyWarningBadgeScale(badge) {
  const size = Math.round(18 * tooltipTextScale);
  badge.style.width = `${size}px`;
  badge.style.height = `${size}px`;
  badge.style.font = `700 ${Math.round(11 * tooltipTextScale)}px/1 Inter, sans-serif`;
}

/**
 * Initialize once from content.js. The callback opens/closes the matching
 * Turn evidence detail; keeping that coordination outside this file makes the
 * score overlay testable without chrome runtime APIs.
 */
export function initTooltipSystem(options = {}) {
  onPinnedMessageChange =
    typeof options.onPinnedMessageChange === 'function'
      ? options.onPinnedMessageChange
      : null;
  removeStaleOverlayDom();
  createTooltipElement();
}

// DOM inserted by an invalidated extension context can outlive that context
// on the host page. A replacement content-script instance has empty module
// Maps and therefore cannot remove those nodes through its normal cleanup
// path; sweep them before creating the current overlay system.
function removeStaleOverlayDom() {
  if (!document.querySelectorAll) return;
  const staleTooltip = document.getElementById?.(TOOLTIP_ID);
  if (staleTooltip && staleTooltip !== tooltipElement) staleTooltip.remove();
  document.querySelectorAll(`.${LEGACY_TRIGGER_CLASS}, .toxic-warning-badge`).forEach((element) => {
    element._cleanup?.();
    element.remove();
  });
  document.getElementById?.(OVERLAY_STYLE_ID)?.remove();
}

function createTooltipElement() {
  createOverlayStyles();
  if (tooltipElement || !document.body) return;

  tooltipElement = document.createElement('div');
  tooltipElement.id = TOOLTIP_ID;
  tooltipElement.setAttribute('role', 'tooltip');
  tooltipElement.style.cssText = `
    all: initial;
    position: fixed;
    box-sizing: border-box;
    display: none;
    width: min(360px, calc(100vw - 24px));
    max-height: min(420px, calc(100vh - 24px));
    overflow: hidden;
    padding: 0;
    border: 1px solid #dce5ef;
    border-radius: 16px;
    background: rgba(255, 255, 255, 0.985);
    color: #0f1419;
    box-shadow: 0 1px 2px rgba(15, 20, 25, 0.08), 0 18px 50px -22px rgba(15, 23, 42, 0.42);
    font: 13px/1.45 Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    letter-spacing: 0;
    text-align: left;
    z-index: 2147483646;
    pointer-events: none;
    opacity: 0;
    transition: opacity 120ms ease;
    color-scheme: light;
    isolation: isolate;
    -webkit-font-smoothing: antialiased;
  `;
  applyTooltipRootScale();
  document.body.appendChild(tooltipElement);
}

function createOverlayStyles() {
  if (!document.head || document.getElementById?.(OVERLAY_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = OVERLAY_STYLE_ID;
  style.textContent = `
    @media (prefers-reduced-motion: reduce) {
      #${TOOLTIP_ID} { transition: none !important; }
    }
  `;
  document.head.appendChild(style);
}

/** Store evaluation results and the metric definitions captured for this run. */
export function setEvaluationData(results, messages = null, presentation = {}) {
  evaluationData = results;
  metricPresentation = presentation && typeof presentation === 'object' ? presentation : {};
  removeToxicWarnings();

  if (messages && messages.length > 0) {
    mapMessageElements(messages);
  }

  highlightToxicMessages();
}

function highlightToxicMessages() {
  if (!evaluationData) return;

  if (evaluationData.utteranceScores) {
    evaluationData.utteranceScores.forEach((utterance, index) => {
      const metrics = utterance.metrics || {};
      const flag = metrics.is_toxic || metrics.toxicity;
      if (flag && flag.label === 'Toxic') {
        const entry = findMessageEntryByIndex(index);
        if (entry?.elements?.[0]) createWarningForElement(entry.elements[0], entry.messageId);
      }
    });
    return;
  }

  evaluationData.toxicity?.per_utterance?.forEach((utterance) => {
    const flag = utterance.metrics?.is_toxic;
    if (flag?.type === 'categorical' && flag.label === 'Toxic') {
      const entry = findMessageEntryByIndex(utterance.index);
      if (entry?.elements?.[0]) createWarningForElement(entry.elements[0], entry.messageId);
    }
  });
}

function findMessageEntryByIndex(index) {
  for (const [messageId, entry] of messageElements.entries()) {
    if (entry.index === index) return { ...entry, messageId };
  }
  return null;
}

function createWarningForElement(targetElement, messageId) {
  if (!targetElement || document.querySelector(`[data-toxic-for="${cssAttributeValue(messageId)}"]`)) return;

  const warning = document.createElement('div');
  warning.className = 'toxic-warning-badge';
  warning.setAttribute('data-toxic-for', messageId);
  warning.setAttribute('aria-hidden', 'true');
  warning.style.cssText = `
    all: initial;
    position: fixed;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    border: 2px solid white;
    border-radius: 999px;
    background: #dc2626;
    color: white;
    box-shadow: 0 2px 6px rgba(220, 38, 38, 0.4);
    font: 700 11px/1 Inter, sans-serif;
    z-index: 2147483645;
    pointer-events: none;
  `;
  warning.textContent = '!';
  applyWarningBadgeScale(warning);
  document.body.appendChild(warning);

  const updatePosition = () => {
    const rect = targetElement.getBoundingClientRect();
    warning.style.display = isRectVisible(rect) ? 'flex' : 'none';
    warning.style.top = `${Math.max(2, rect.top)}px`;
    warning.style.left = `${Math.max(2, rect.left - 25)}px`;
  };
  updatePosition();
  window.addEventListener('scroll', updatePosition, true);
  window.addEventListener('resize', updatePosition);
  warning._cleanup = () => {
    window.removeEventListener('scroll', updatePosition, true);
    window.removeEventListener('resize', updatePosition);
  };
}

function cssAttributeValue(value) {
  if (globalThis.CSS?.escape) return CSS.escape(String(value));
  return String(value).replace(/["\\]/g, '\\$&');
}

function removeToxicWarnings() {
  if (!document.querySelectorAll) return;
  document.querySelectorAll('.toxic-warning-badge').forEach((badge) => {
    badge._cleanup?.();
    badge.remove();
  });
}

/**
 * Re-walk the page using the scraper's own emit/skip rules, then align turns
 * by deterministic message id. This remains correct when a user excluded
 * individual turns in the scraped-transcript preview.
 */
export function mapMessageElements(messages) {
  detachAllHoverListeners();
  restorePinnedElementStyles();
  hideTooltip(true);
  messageElements.clear();
  mappedMessages = Array.isArray(messages) ? messages : [];

  if (!messages || messages.length === 0) {
    stopMessageRemapObserver();
    return;
  }

  const { turns } = scrapeCurrentPageWithElements();
  const indexById = new Map(messages.map((message, index) => [message.id, index]));

  turns.forEach((turn) => {
    const index = indexById.get(turn.message.id);
    if (index === undefined) return;
    turn.elements.forEach((element) => attachHoverListeners(element, index, turn.message.id));
    messageElements.set(turn.message.id, {
      elements: turn.elements,
      index,
      message: messages[index]
    });
  });

  applyPinnedElementStyles();
  startMessageRemapObserver();
}

// ChatGPT, Claude, and Gemini can replace a rendered turn without navigating
// (draft swaps, virtualized lists, streaming finalization). Re-map only when
// one of our actual roots becomes disconnected; unrelated page mutations do
// not restart hover wiring or animations.
function startMessageRemapObserver() {
  if (
    messageRemapObserver ||
    typeof MutationObserver === 'undefined' ||
    !document.body
  ) return;

  messageRemapObserver = new MutationObserver(() => {
    if (messageRemapTimer || !hasDisconnectedMessageRoot()) return;
    messageRemapRetryCount = 0;
    messageRemapTimer = setTimeout(attemptMessageRemap, MESSAGE_REMAP_DELAY_MS);
  });
  // attributes:true matters on Gemini, where the scraped response container
  // is chosen by aria-selected/hidden flips: the page can settle into a
  // scrapeable state through an attribute-only mutation that childList and
  // characterData passes never observe.
  messageRemapObserver.observe(document.body, {
    childList: true,
    characterData: true,
    attributes: true,
    subtree: true
  });
}

function attemptMessageRemap() {
  messageRemapTimer = null;
  if (!hasDisconnectedMessageRoot() || !mappedMessages.length) return;

  const { turns } = scrapeCurrentPageWithElements();
  const currentById = new Map(turns.map((turn) => [turn.message.id, turn.message]));
  const conversationStillMatches = mappedMessages.every((message) => {
    const current = currentById.get(message.id);
    return (
      current &&
      current.role === message.role &&
      current.content === message.content
    );
  });

  if (conversationStillMatches) {
    messageRemapRetryCount = 0;
    mapMessageElements(mappedMessages);
    return;
  }

  // Responsive host layouts can temporarily remove turns while changing
  // width. Keep the existing hover map until a complete replacement is
  // ready — turns that stayed mounted remain interactive throughout the
  // reflow; a successful mapMessageElements call replaces the set at once.
  if (messageRemapRetryCount === 0) {
    hideTooltip(true);
  }
  messageRemapRetryCount += 1;
  if (messageRemapRetryCount < MESSAGE_REMAP_MAX_RETRIES) {
    messageRemapTimer = setTimeout(attemptMessageRemap, MESSAGE_REMAP_DELAY_MS);
  }
}

function hasDisconnectedMessageRoot() {
  return Array.from(messageElements.values()).some((entry) =>
    entry.elements?.some((element) => 'isConnected' in element && !element.isConnected)
  );
}

function stopMessageRemapObserver() {
  if (messageRemapTimer) clearTimeout(messageRemapTimer);
  messageRemapTimer = null;
  messageRemapRetryCount = 0;
  messageRemapObserver?.disconnect();
  messageRemapObserver = null;
}

// Clicks that express some other intent must never open the sidebar: links
// and controls inside a message, modified clicks (open in new tab etc.),
// non-primary buttons, and mouseups that finish a text selection.
const INTERACTIVE_TARGET_SELECTOR =
  'a, button, input, textarea, select, summary, audio, video, [role="button"], [role="link"], [contenteditable="true"]';

function isPlainScoreClick(event) {
  if (event.defaultPrevented) return false;
  if (typeof event.button === 'number' && event.button !== 0) return false;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  if (event.target?.closest?.(INTERACTIVE_TARGET_SELECTOR)) return false;
  const selection = window.getSelection?.();
  if (selection && selection.isCollapsed === false) return false;
  return true;
}

function attachHoverListeners(element, messageIndex, messageId) {
  detachHoverListeners(element);

  const originalStyles = {
    cursor: element.style.cursor,
    transition: element.style.transition,
    backgroundColor: element.style.backgroundColor,
    borderRadius: element.style.borderRadius
  };

  if (evaluationData) {
    // Preserve the host page's normal text-selection cursor: the message
    // must stay selectable. The hover wash plus the preview card's footer
    // line are the affordance for the click-to-open behavior.
    element.style.transition = appendTransition(element.style.transition, 'background-color 150ms ease');
  }

  const onMouseEnter = () => {
    if (!hasScoresForMessage(messageIndex)) return;
    applyHoverWash(messageId);
    showTooltip(element, messageIndex);
  };
  const onMouseLeave = () => {
    clearHoverWash(messageId);
    hideTooltip();
  };
  const onFocusIn = () => {
    if (hasScoresForMessage(messageIndex)) showTooltip(element, messageIndex);
  };
  const onFocusOut = () => hideTooltip();
  const onClick = (event) => {
    if (!evaluationData || !hasScoresForMessage(messageIndex)) return;
    if (!isPlainScoreClick(event)) return;
    const nextId = pinnedMessageId === messageId ? null : messageId;
    setPinnedScoreMessage(nextId);
    onPinnedMessageChange?.(nextId);
  };

  element.addEventListener('mouseenter', onMouseEnter);
  element.addEventListener('mouseleave', onMouseLeave);
  element.addEventListener('focusin', onFocusIn);
  element.addEventListener('focusout', onFocusOut);
  element.addEventListener('click', onClick);
  attachedElements.set(element, {
    messageId,
    originalStyles,
    onMouseEnter,
    onMouseLeave,
    onFocusIn,
    onFocusOut,
    onClick
  });
}

function appendTransition(current, addition) {
  return current ? `${current}, ${addition}` : addition;
}

function detachHoverListeners(element) {
  const handlers = attachedElements.get(element);
  if (!handlers) return;

  element.removeEventListener('mouseenter', handlers.onMouseEnter);
  element.removeEventListener('mouseleave', handlers.onMouseLeave);
  element.removeEventListener('focusin', handlers.onFocusIn);
  element.removeEventListener('focusout', handlers.onFocusOut);
  element.removeEventListener('click', handlers.onClick);
  element.style.cursor = handlers.originalStyles.cursor;
  element.style.transition = handlers.originalStyles.transition;
  element.style.backgroundColor = handlers.originalStyles.backgroundColor;
  element.style.borderRadius = handlers.originalStyles.borderRadius;
  attachedElements.delete(element);
}

function detachAllHoverListeners() {
  Array.from(attachedElements.keys()).forEach(detachHoverListeners);
}

// Hovering any block of a turn washes the WHOLE turn: the click target (and
// the pin that follows) is the turn, so the highlight must communicate that
// unit rather than the single paragraph under the cursor.
function applyHoverWash(messageId) {
  const elements = messageElements.get(messageId)?.elements || [];
  elements.forEach((element) => {
    element.style.backgroundColor = 'rgba(29, 114, 189, 0.10)';
  });
}

function clearHoverWash(messageId) {
  const elements = messageElements.get(messageId)?.elements || [];
  elements.forEach((element) => {
    element.style.backgroundColor = pinnedMessageId === messageId
      ? PINNED_TEXT_BACKGROUND
      : attachedElements.get(element)?.originalStyles.backgroundColor ?? '';
  });
}

function getOverlayRightBoundary() {
  const viewportWidth = window.innerWidth || document.documentElement?.clientWidth || 0;
  const sidebar = document.getElementById('counselreflect-sidebar');
  if (!sidebar || sidebar.getAttribute('aria-hidden') === 'true') return viewportWidth;
  const sidebarWidth = sidebar.getBoundingClientRect().width;
  if (!Number.isFinite(sidebarWidth) || sidebarWidth <= 0) return viewportWidth;
  // The sidebar animates in with a transform, so its temporary rect.left can
  // still be at the viewport edge when the open state changes. Its width and
  // right anchoring already give us the final, stable host-page boundary.
  return Math.max(0, viewportWidth - Math.min(sidebarWidth, viewportWidth));
}

/**
 * Place an overlay beside its message while respecting the visible host-page
 * boundary. When the extension sidebar is open that boundary is its left
 * edge, not window.innerWidth (content drawn below the iframe is invisible).
 */
export function calculateHorizontalOverlayPosition(
  anchorRect,
  overlayWidth,
  rightBoundary,
  gap = 8,
  edge = 8
) {
  let left = anchorRect.right + gap;
  if (left + overlayWidth > rightBoundary - edge) {
    left = anchorRect.left - overlayWidth - gap;
  }
  if (left < edge || left + overlayWidth > rightBoundary - edge) {
    left = Math.max(
      edge,
      Math.min(anchorRect.right - overlayWidth, rightBoundary - overlayWidth - edge)
    );
  }
  return left;
}

function isRectVisible(rect, rightBoundary = window.innerWidth || document.documentElement?.clientWidth || 0) {
  const viewportHeight = window.innerHeight || document.documentElement?.clientHeight || 0;
  return rect.bottom > 0 && rect.right > 0 && rect.top < viewportHeight && rect.left < rightBoundary;
}

/** Apply the selected-turn state received from the page or Turn evidence. */
export function setPinnedScoreMessage(messageId) {
  const nextId = typeof messageId === 'string' && messageElements.has(messageId) ? messageId : null;
  restorePinnedElementStyles();
  pinnedMessageId = nextId;
  applyPinnedElementStyles();
}

function applyPinnedElementStyles() {
  if (!pinnedMessageId) return;
  const elements = messageElements.get(pinnedMessageId)?.elements || [];
  elements.forEach((element) => {
    const hostStyles = attachedElements.get(element)?.originalStyles;
    pinnedElementStyles.set(element, {
      backgroundColor: hostStyles?.backgroundColor ?? element.style.backgroundColor,
      borderRadius: hostStyles?.borderRadius ?? element.style.borderRadius
    });
    element.style.backgroundColor = PINNED_TEXT_BACKGROUND;
    if (!element.style.borderRadius) element.style.borderRadius = '6px';
  });
}

function restorePinnedElementStyles() {
  pinnedElementStyles.forEach((styles, element) => {
    element.style.backgroundColor = styles.backgroundColor;
    element.style.borderRadius = styles.borderRadius;
  });
  pinnedElementStyles.clear();
}

function showTooltip(anchorElement, messageIndex) {
  if (!evaluationData) return;
  if (getOverlayRightBoundary() < MIN_HOST_PREVIEW_WIDTH) {
    hideTooltip(true);
    return;
  }
  if (!tooltipElement) createTooltipElement();
  if (!tooltipElement) return;

  const content = formatTooltipContent(messageIndex);
  if (!content) return;

  if (tooltipHideTimer) clearTimeout(tooltipHideTimer);
  activeTooltipAnchor = anchorElement;
  tooltipElement.innerHTML = wrapTooltipContentForScale(content);
  tooltipElement.style.display = 'block';
  tooltipElement.style.opacity = '0';
  positionTooltip(anchorElement);
  attachTooltipFollowListeners();
  // Force layout before fading in, without keeping a perpetual animation loop.
  void tooltipElement.offsetWidth;
  tooltipElement.style.opacity = '1';
}

function hideTooltip(immediate = false) {
  if (!tooltipElement) return;
  if (tooltipHideTimer) clearTimeout(tooltipHideTimer);
  tooltipElement.style.opacity = '0';
  const finish = () => {
    if (tooltipElement?.style.opacity === '0') {
      tooltipElement.style.display = 'none';
      activeTooltipAnchor = null;
      detachTooltipFollowListeners();
    }
  };
  if (immediate) finish();
  else tooltipHideTimer = setTimeout(finish, 140);
}

// While a preview is showing, keep it glued to its message through scrolls
// (mouse wheel over the hovered turn) and window resizes. Listeners exist
// only while a tooltip is visible, so an idle page carries no overhead.
function repositionActiveTooltip() {
  if (!activeTooltipAnchor || !tooltipElement || tooltipElement.style.display === 'none') return;
  if ('isConnected' in activeTooltipAnchor && !activeTooltipAnchor.isConnected) {
    hideTooltip(true);
    return;
  }
  positionTooltip(activeTooltipAnchor);
}

function attachTooltipFollowListeners() {
  if (tooltipFollowListenersAttached) return;
  window.addEventListener('scroll', repositionActiveTooltip, true);
  window.addEventListener('resize', repositionActiveTooltip);
  tooltipFollowListenersAttached = true;
}

function detachTooltipFollowListeners() {
  if (!tooltipFollowListenersAttached) return;
  window.removeEventListener('scroll', repositionActiveTooltip, true);
  window.removeEventListener('resize', repositionActiveTooltip);
  tooltipFollowListenersAttached = false;
}

function positionTooltip(anchorElement) {
  if (!tooltipElement || !anchorElement) return;
  const anchorRect = anchorElement.getBoundingClientRect();
  const rightBoundary = getOverlayRightBoundary();
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
  const gap = 12;
  const edge = 10;
  const availableWidth = rightBoundary - edge * 2;

  if (availableWidth < 180 || !isRectVisible(anchorRect, rightBoundary)) {
    tooltipElement.style.display = 'none';
    activeTooltipAnchor = null;
    detachTooltipFollowListeners();
    return;
  }
  // Keep the preview within the part of the website that is not covered by
  // the extension sidebar. This also makes narrow browser windows usable.
  tooltipElement.style.width = `${Math.min(360, availableWidth)}px`;
  const tooltipRect = tooltipElement.getBoundingClientRect();
  const left = calculateHorizontalOverlayPosition(
    anchorRect,
    tooltipRect.width,
    rightBoundary,
    gap,
    edge
  );

  let top = anchorRect.top;
  if (top + tooltipRect.height > viewportHeight - edge) {
    top = viewportHeight - tooltipRect.height - edge;
  }
  tooltipElement.style.left = `${Math.max(edge, left)}px`;
  tooltipElement.style.top = `${Math.max(edge, top)}px`;
}

function getMetricsForMessage(messageIndex) {
  if (!evaluationData) return {};
  if (evaluationData.utteranceScores) {
    return evaluationData.utteranceScores[messageIndex]?.metrics || {};
  }

  const metrics = {};
  Object.values(evaluationData).forEach((category) => {
    const utterance = category?.per_utterance?.find((item) => item.index === messageIndex);
    Object.assign(metrics, utterance?.metrics || {});
  });
  return metrics;
}

function hasScoresForMessage(messageIndex) {
  return Object.keys(getMetricsForMessage(messageIndex)).length > 0;
}

function getDisplayMetrics(messageIndex) {
  const metrics = Object.entries(getMetricsForMessage(messageIndex));
  const display = [];
  const groupedParents = new Set();

  metrics.forEach(([name, score]) => {
    const metadata = resolvePresentation(name);
    if (metadata?.parentId) {
      if (groupedParents.has(metadata.parentId)) return;
      groupedParents.add(metadata.parentId);
      const siblings = metrics.filter(([candidate]) => resolvePresentation(candidate)?.parentId === metadata.parentId);
      const summary = siblings.find(([candidate]) => candidate === 'is_toxic') || siblings[0];
      const parent = metricPresentation[metadata.parentId] || metadata;
      display.push({ name: metadata.parentId, score: summary[1], metadata: parent });
      return;
    }
    display.push({ name, score, metadata });
  });

  return display;
}

function resolvePresentation(name) {
  if (metricPresentation[name]) return metricPresentation[name];
  const normalized = normalizeName(name);
  const entries = Object.values(metricPresentation);
  return entries.find((entry) => normalizeName(entry.id) === normalized) ||
    entries.find((entry) => normalized.startsWith(`${normalizeName(entry.id)}_`));
}

function normalizeName(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9]+/g, '_');
}

function scorePreviewTone(score) {
  if (!score || isNotApplicable(score)) {
    return { background: '#f1f5f9', color: '#536471' };
  }
  const label = String(score.label || '').toLowerCase();
  if (label === 'toxic') {
    return { background: '#fff1f2', color: '#9f1239' };
  }
  if (label === 'safe') {
    return { background: '#ecfdf5', color: '#166534' };
  }
  return { background: '#e6eefc', color: '#1f519f' };
}

function formatTooltipContent(messageIndex) {
  const metrics = getDisplayMetrics(messageIndex);
  if (!metrics.length) return null;

  const toxicNotice = isMessageToxic(messageIndex)
    ? `<div style="display:flex;align-items:center;gap:8px;margin:0 14px 4px;padding:8px 10px;border-radius:10px;background:#fff1f2;color:#9f1239;font-size:12px;font-weight:650">
        <span style="display:inline-flex;align-items:center;justify-content:center;width:17px;height:17px;flex:none;border-radius:999px;background:#fecdd3;color:#9f1239;font-size:11px;font-weight:800">!</span>
        <span>Toxicity threshold flag detected</span>
      </div>`
    : '';
  const visible = metrics.slice(0, 3).map(({ name, score, metadata }) => {
    const label = metadata?.label || formatMetricName(name);
    const definition = metadata?.shortDefinition || 'Open the details for the metric definition.';
    const tone = scorePreviewTone(score);
    return `
      <div style="padding:11px 0;border-top:1px solid #eff3f4">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:14px">
          <span style="min-width:0;color:#0f1419;font-weight:700">${escapeHtml(label)}</span>
          <span style="flex:none;padding:3px 8px;border-radius:999px;background:${tone.background};color:${tone.color};font-size:12px;font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap">${escapeHtml(formatScoreForDisplay(score))}</span>
        </div>
        <div style="display:-webkit-box;margin-top:4px;overflow:hidden;color:#536471;font-size:12px;line-height:1.45;-webkit-box-orient:vertical;-webkit-line-clamp:2">${escapeHtml(definition)}</div>
      </div>`;
  }).join('');
  const remaining = metrics.length - Math.min(metrics.length, 3);

  return `
    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:14px;padding:14px 14px 10px">
      <div style="min-width:0">
        <div style="display:flex;align-items:center;gap:7px;color:#1f519f;font-size:10px;font-weight:800;letter-spacing:.09em;text-transform:uppercase">
          <span style="display:inline-block;width:22px;height:2px;border-radius:999px;background:#2f6ed3"></span>
          Turn ${messageIndex + 1}
        </div>
        <strong style="display:block;margin-top:5px;color:#0f1419;font-size:15px;line-height:1.25">Score preview</strong>
      </div>
      <span style="flex:none;padding:3px 8px;border-radius:999px;background:#f1f5f9;color:#536471;font-size:11px;font-weight:650;white-space:nowrap">${metrics.length} metric${metrics.length === 1 ? '' : 's'}</span>
    </div>
    ${toxicNotice}
    <div style="padding:0 14px">
      ${visible}
      ${remaining > 0 ? `<div style="padding:0 0 11px;color:#8b98a5;font-size:11px;font-weight:600">+ ${remaining} more metric${remaining === 1 ? '' : 's'} in the full view</div>` : ''}
    </div>
    <div style="display:flex;align-items:flex-start;gap:8px;padding:10px 14px;border-top:1px solid #eff3f4;background:#f8fafc;color:#536471;font-size:11px;line-height:1.4">
      <span style="display:inline-block;width:3px;height:18px;flex:none;border-radius:999px;background:#2f6ed3"></span>
      <span><strong style="color:#1f519f">Click this message</strong> to open the full explanation in the sidebar — definitions, scales, reasoning, and cautions. Click it again to close.</span>
    </div>
  `;
}

function isMessageToxic(messageIndex) {
  const metrics = getMetricsForMessage(messageIndex);
  const flag = metrics.is_toxic || metrics.toxicity;
  return !!flag && flag.label === 'Toxic';
}

/** Preserve a metric's native scale instead of converting everything to %. */
export function formatScoreForDisplay(score) {
  if (!score || isNotApplicable(score)) return 'N/A';
  if (score.type === 'numerical' && typeof score.value === 'number') {
    const value = conciseNumber(score.value);
    const maximum = typeof score.max_value === 'number' && score.max_value > 0
      ? ` / ${conciseNumber(score.max_value)}`
      : '';
    return `${value}${maximum}${score.label ? ` · ${score.label}` : ''}`;
  }
  return score.label || 'No score';
}

function isNotApplicable(score) {
  return score.value === -1 || ['-1', 'n/a', 'not applicable'].includes(String(score.label || '').toLowerCase());
}

function conciseNumber(value) {
  if (Number.isInteger(value)) return String(value);
  return Number(value).toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatMetricName(name) {
  return String(name)
    .split(/[_-]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function clearTooltipSystem() {
  stopMessageRemapObserver();
  removeToxicWarnings();
  detachAllHoverListeners();
  restorePinnedElementStyles();
  messageElements.clear();
  mappedMessages = [];
  evaluationData = null;
  metricPresentation = {};
  pinnedMessageId = null;
  hideTooltip(true);
  detachTooltipFollowListeners();
}
