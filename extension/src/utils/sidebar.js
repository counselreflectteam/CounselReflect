// Sidebar management module
let sidebarIframe = null;
let resizeHandle = null;
let isOpen = false;
let isResizing = false;

const MIN_WIDTH = 320;
const MAX_WIDTH = 800;
const DEFAULT_WIDTH = 400;
const KEYBOARD_RESIZE_STEP = 16;
const MIN_HOST_SCORE_RAIL = 48;
const SIDEBAR_LAYOUT_EVENT = 'counselreflect:sidebar-layout';

let currentWidth = DEFAULT_WIDTH;
let bodyLayoutSnapshot = null;

function viewportMaxWidth() {
  if (typeof window === 'undefined' || !Number.isFinite(window.innerWidth)) {
    return MAX_WIDTH;
  }
  const viewportWidth = Math.floor(window.innerWidth);
  // A full-width sidebar used to make every on-page Scores button vanish.
  // Keep a narrow, guaranteed host-page rail so compact score controls remain
  // visible and keyboard-operable even at the widest sidebar setting.
  const hostRail = viewportWidth > MIN_HOST_SCORE_RAIL ? MIN_HOST_SCORE_RAIL : 0;
  return Math.max(1, Math.min(MAX_WIDTH, viewportWidth - hostRail));
}

function viewportMinWidth() {
  return Math.min(MIN_WIDTH, viewportMaxWidth());
}

function clampWidth(width) {
  return Math.min(viewportMaxWidth(), Math.max(viewportMinWidth(), width));
}

// Apply a width to everything that depends on it, keeping the iframe, the
// resize handle and the pushed-aside host page in sync.
function applyWidth(width) {
  currentWidth = clampWidth(width);
  const viewportMax = viewportMaxWidth();
  sidebarIframe.style.width = `${currentWidth}px`;
  resizeHandle.style.right = `${currentWidth}px`;
  resizeHandle.setAttribute('aria-valuemin', String(viewportMinWidth()));
  resizeHandle.setAttribute('aria-valuemax', String(viewportMax));
  resizeHandle.setAttribute('aria-valuenow', String(currentWidth));
  resizeHandle.setAttribute(
    'aria-valuetext',
    `Sidebar ${currentWidth} pixels; ${Math.max(0, Math.floor(window.innerWidth) - currentWidth)} pixels remain for page scores`
  );
  if (isOpen) {
    document.body.style.marginRight = `${currentWidth}px`;
  }
  notifyHostLayoutChange();
}

function notifyHostLayoutChange() {
  if (typeof window.dispatchEvent !== 'function' || typeof CustomEvent !== 'function') return;
  const dispatch = () => window.dispatchEvent(new CustomEvent(SIDEBAR_LAYOUT_EVENT));
  dispatch();
  // Host apps may finish responsive reflow in ResizeObserver/React work after
  // the synchronous margin write. A coalesced next-frame pass prevents score
  // controls from retaining geometry measured during that transient layout.
  if (typeof window.requestAnimationFrame === 'function') {
    if (notifyHostLayoutChange.frame !== null) {
      window.cancelAnimationFrame(notifyHostLayoutChange.frame);
    }
    notifyHostLayoutChange.frame = window.requestAnimationFrame(() => {
      notifyHostLayoutChange.frame = null;
      dispatch();
    });
  }
}
notifyHostLayoutChange.frame = null;

function captureBodyLayout() {
  bodyLayoutSnapshot = {
    marginRight: document.body.style.marginRight,
    transition: document.body.style.transition
  };
  if (sidebarIframe) {
    sidebarIframe.dataset.crBodyAdjusted = 'true';
    sidebarIframe.dataset.crHostMarginRight = bodyLayoutSnapshot.marginRight;
    sidebarIframe.dataset.crHostTransition = bodyLayoutSnapshot.transition;
  }
}

function restoreBodyLayout() {
  if (!bodyLayoutSnapshot) return;
  document.body.style.marginRight = bodyLayoutSnapshot.marginRight;
  document.body.style.transition = bodyLayoutSnapshot.transition;
  bodyLayoutSnapshot = null;
  if (sidebarIframe) {
    delete sidebarIframe.dataset.crBodyAdjusted;
    delete sidebarIframe.dataset.crHostMarginRight;
    delete sidebarIframe.dataset.crHostTransition;
  }
}

// Persist the width in extension storage: unlike the host page's
// localStorage it is shared across the supported sites and cannot collide
// with (or be read by) the host site's own storage.
function saveWidth() {
  try {
    chrome.storage.local.set({ sidebarWidth: currentWidth });
  } catch (e) {
    // Extension context gone (e.g. reloaded); the width just won't persist.
  }
}

function restoreWidth() {
  try {
    chrome.storage.local.get('sidebarWidth', (stored) => {
      if (chrome.runtime.lastError) return;
      const saved = parseInt(stored && stored.sidebarWidth, 10);
      // One-time migration from the pre-chrome.storage location: earlier
      // builds kept the width in the HOST page's localStorage. Adopt it when
      // chrome.storage has nothing yet, and always remove it — extension
      // data should not linger in site storage.
      const legacy = migrateLegacyWidth();
      if (Number.isFinite(saved)) {
        applyWidth(clampWidth(saved));
        return;
      }
      if (Number.isFinite(legacy)) {
        applyWidth(clampWidth(legacy));
        saveWidth();
      }
    });
  } catch (e) {
    // Fall back to the default width
  }
}

function migrateLegacyWidth() {
  try {
    const legacy = parseInt(localStorage.getItem('sidebarWidth'), 10);
    localStorage.removeItem('sidebarWidth');
    return legacy;
  } catch (e) {
    // Host page storage unavailable; nothing to migrate.
    return NaN;
  }
}

export function createSidebar(initialUrl) {
  if (sidebarIframe) return;
  currentWidth = clampWidth(currentWidth);

  // Content scripts are replaced when an unpacked extension is reloaded, but
  // DOM inserted by the previous context can remain in the host page. Remove
  // those stale nodes and restore any host-page layout values they recorded.
  const staleIframe = document.getElementById('counselreflect-sidebar');
  if (staleIframe) {
    if (staleIframe.dataset.crBodyAdjusted === 'true') {
      document.body.style.marginRight = staleIframe.dataset.crHostMarginRight || '';
      document.body.style.transition = staleIframe.dataset.crHostTransition || '';
    }
    staleIframe.remove();
  }
  document.getElementById('sidebar-resize-handle')?.remove();
  document.getElementById('resize-overlay')?.remove();

  // Create iframe for the sidebar
  sidebarIframe = document.createElement('iframe');
  sidebarIframe.id = 'counselreflect-sidebar';
  sidebarIframe.title = 'CounselReflect sidebar';
  sidebarIframe.src = initialUrl || chrome.runtime.getURL('sidebar.html');
  sidebarIframe.setAttribute('aria-hidden', 'true');
  sidebarIframe.tabIndex = -1;
  sidebarIframe.inert = true;
  sidebarIframe.style.cssText = `
    position: fixed;
    top: 0;
    right: 0;
    width: ${currentWidth}px;
    height: 100vh;
    border: none;
    z-index: 2147483647;
    transform: translateX(100%);
    transition: transform 0.3s ease-in-out;
    box-shadow: -10px 0 30px -14px rgba(15, 23, 42, 0.28);
  `;
  // The initial layout event can occur before restored evaluation results
  // have rebuilt their score controls. Emit once more when the slide finishes
  // so fixed overlays are positioned against the settled host-page geometry.
  sidebarIframe.addEventListener('transitionend', (event) => {
    if (event.propertyName === 'transform') notifyHostLayoutChange();
  });

  // Create resize handle
  resizeHandle = document.createElement('div');
  resizeHandle.id = 'sidebar-resize-handle';
  resizeHandle.style.cssText = `
    position: fixed;
    top: 0;
    right: ${currentWidth}px;
    width: 16px;
    height: 100vh;
    cursor: ew-resize;
    z-index: 2147483648;
    transform: translateX(100%);
    transition: transform 0.3s ease-in-out, background-color 0.2s;
    background: transparent;
    margin-right: -8px;
  `;

  // Expose the handle to assistive tech; it only becomes focusable while the
  // sidebar is open (see toggleSidebar)
  resizeHandle.setAttribute('role', 'separator');
  resizeHandle.setAttribute('aria-orientation', 'vertical');
  resizeHandle.setAttribute('aria-label', 'Resize CounselReflect sidebar');
  resizeHandle.setAttribute('aria-valuemin', String(viewportMinWidth()));
  resizeHandle.setAttribute('aria-valuemax', String(viewportMaxWidth()));
  resizeHandle.setAttribute('aria-valuenow', String(currentWidth));
  resizeHandle.setAttribute('aria-hidden', 'true');
  resizeHandle.tabIndex = -1;

  const showHandleHighlight = () => {
    resizeHandle.style.background = 'rgba(29, 114, 189, 0.3)';
    resizeHandle.style.borderLeft = '2px solid rgba(29, 114, 189, 0.6)';
  };

  const hideHandleHighlight = () => {
    resizeHandle.style.background = 'transparent';
    resizeHandle.style.borderLeft = 'none';
  };

  // Add hover/focus effect
  resizeHandle.addEventListener('mouseenter', () => {
    if (isOpen) showHandleHighlight();
  });

  resizeHandle.addEventListener('mouseleave', () => {
    if (!isResizing && document.activeElement !== resizeHandle) hideHandleHighlight();
  });

  resizeHandle.addEventListener('focus', () => {
    if (isOpen) showHandleHighlight();
  });

  resizeHandle.addEventListener('blur', () => {
    if (!isResizing) hideHandleHighlight();
  });

  // Add resize functionality
  resizeHandle.addEventListener('mousedown', startResize);

  // Keyboard resize: the sidebar is anchored to the right edge, so
  // ArrowLeft widens it and ArrowRight narrows it
  resizeHandle.addEventListener('keydown', (e) => {
    if (!isOpen) return;

    let delta = 0;
    if (e.key === 'ArrowLeft') {
      delta = KEYBOARD_RESIZE_STEP;
    } else if (e.key === 'ArrowRight') {
      delta = -KEYBOARD_RESIZE_STEP;
    } else {
      return;
    }

    e.preventDefault();
    e.stopPropagation();
    applyWidth(clampWidth(currentWidth + delta));
    saveWidth();
  });

  document.body.appendChild(sidebarIframe);
  document.body.appendChild(resizeHandle);

  // Restore the last saved width (clamped to the documented 320-800px bounds)
  restoreWidth();

  // A width saved on a large monitor must not leave the sidebar wider than a
  // later, narrower browser window.
  window.addEventListener('resize', () => {
    applyWidth(currentWidth);
  });
}

function startResize(e) {
  if (!isOpen) return;

  e.preventDefault();
  e.stopPropagation();

  isResizing = true;

  // Create overlay to capture all mouse events (prevents iframe from blocking)
  const overlay = document.createElement('div');
  overlay.id = 'resize-overlay';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 2147483649;
    cursor: ew-resize;
    user-select: none;
  `;
  document.body.appendChild(overlay);

  // Disable ALL transitions during resize
  const originalIframeTransition = sidebarIframe.style.transition;
  const originalHandleTransition = resizeHandle.style.transition;
  const originalBodyTransition = document.body.style.transition;
  const originalBodyCursor = document.body.style.cursor;
  const originalBodyUserSelect = document.body.style.userSelect;

  resizeHandle.style.background = 'rgba(29, 114, 189, 0.5)';
  resizeHandle.style.borderLeft = '2px solid rgba(29, 114, 189, 0.8)';
  document.body.style.cursor = 'ew-resize';
  document.body.style.userSelect = 'none';

  sidebarIframe.style.transition = 'none';
  resizeHandle.style.transition = 'none';
  document.body.style.transition = 'none';

  const onMouseMove = (moveEvent) => {
    if (!isResizing) return;

    // Direct calculation: distance from right edge of window
    const distanceFromRight = window.innerWidth - moveEvent.clientX;
    applyWidth(clampWidth(distanceFromRight));
  };

  const onMouseUp = () => {
    if (!isResizing) return;

    isResizing = false;

    // Remove overlay
    if (overlay && overlay.parentNode) {
      overlay.parentNode.removeChild(overlay);
    }

    resizeHandle.style.background = 'transparent';
    resizeHandle.style.borderLeft = 'none';
    document.body.style.cursor = originalBodyCursor;
    document.body.style.userSelect = originalBodyUserSelect;

    // Restore transitions
    sidebarIframe.style.transition = originalIframeTransition;
    resizeHandle.style.transition = originalHandleTransition;
    document.body.style.transition = originalBodyTransition;

    // Save final width
    saveWidth();
    notifyHostLayoutChange();

    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
  };

  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);
}

export function toggleSidebar(initialUrl) {
  if (!sidebarIframe) {
    createSidebar(initialUrl);
  }

  isOpen = !isOpen;

  if (isOpen) {
    captureBodyLayout();
    applyWidth(currentWidth);
    // Slide in sidebar
    sidebarIframe.style.transform = 'translateX(0)';
    sidebarIframe.setAttribute('aria-hidden', 'false');
    sidebarIframe.tabIndex = 0;
    sidebarIframe.inert = false;
    resizeHandle.style.transform = 'translateX(0)';
    resizeHandle.setAttribute('aria-hidden', 'false');
    resizeHandle.tabIndex = 0;
    // Push main content to the left
    document.body.style.marginRight = `${currentWidth}px`;
    document.body.style.transition = 'margin-right 0.3s ease-in-out';
    notifyHostLayoutChange();
  } else {
    // Slide out sidebar
    sidebarIframe.style.transform = 'translateX(100%)';
    sidebarIframe.setAttribute('aria-hidden', 'true');
    sidebarIframe.tabIndex = -1;
    sidebarIframe.inert = true;
    resizeHandle.style.transform = 'translateX(100%)';
    resizeHandle.setAttribute('aria-hidden', 'true');
    resizeHandle.tabIndex = -1;
    // Reset main content position
    restoreBodyLayout();
    notifyHostLayoutChange();
  }
}

export function getSidebarIframe() {
  return sidebarIframe;
}
