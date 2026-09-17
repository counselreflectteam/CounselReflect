// Sidebar <-> content-script bridge over chrome runtime messaging.
//
// The window.postMessage channel between the sidebar iframe and the host page
// is readable and spoofable by any script running on gemini/chatgpt/claude, so
// all sidebar <-> content-script traffic goes through chrome.tabs.sendMessage
// instead (host-page scripts cannot access chrome.runtime / chrome.tabs, and
// chrome.tabs.sendMessage requires no extra manifest permission).
//
// The content script passes its tab id to the sidebar via the ?tabId= query
// param on the iframe URL; if that is missing we fall back to asking the
// background service worker (sender.tab is populated for extension iframes
// embedded in tabs).

declare const chrome: any;

export const CONTENT_UNREACHABLE_MESSAGE =
  'Could not reach the page. Please refresh the page, then reopen the CounselReflect sidebar.';

let cachedTabId: number | null = null;

const parseTabIdFromLocation = (): number | null => {
  const raw = new URLSearchParams(window.location.search).get('tabId');
  if (!raw) return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isInteger(parsed) ? parsed : null;
};

const resolveTabId = (): Promise<number | null> => {
  if (cachedTabId === null) {
    cachedTabId = parseTabIdFromLocation();
  }
  if (cachedTabId !== null) return Promise.resolve(cachedTabId);

  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage({ type: 'GET_TAB_ID' }, (response: any) => {
        if (!chrome.runtime.lastError && typeof response?.tabId === 'number') {
          cachedTabId = response.tabId;
        }
        resolve(cachedTabId);
      });
    } catch {
      resolve(null);
    }
  });
};

export const getHostTabId = resolveTabId;

/**
 * Send a message to the content script of the tab hosting this sidebar.
 * Resolves with the content script's response; rejects when the content
 * script is unreachable (e.g. the extension was reloaded but the page was
 * not refreshed, or the sidebar is open on an unsupported page).
 */
export const sendToContent = async <T = unknown>(message: {
  type: string;
  [key: string]: unknown;
}): Promise<T> => {
  const tabId = await resolveTabId();

  return new Promise<T>((resolve, reject) => {
    if (tabId === null) {
      reject(new Error(CONTENT_UNREACHABLE_MESSAGE));
      return;
    }

    try {
      chrome.tabs.sendMessage(tabId, message, (response: T) => {
        if (chrome.runtime.lastError) {
          reject(new Error(CONTENT_UNREACHABLE_MESSAGE));
          return;
        }
        resolve(response);
      });
    } catch {
      reject(new Error(CONTENT_UNREACHABLE_MESSAGE));
    }
  });
};
