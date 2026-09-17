// Background service worker

// Answer tab-id lookups. Both the content script and the sidebar iframe can
// ask for the id of the tab they live in (sender.tab is populated for content
// scripts and for extension iframes embedded in tabs); the sidebar uses it to
// reach the content script via chrome.tabs.sendMessage.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === 'GET_TAB_ID') {
    sendResponse({ tabId: sender.tab ? sender.tab.id : null });
  }
});

// Hosts the extension supports, derived from the manifest's own
// content_scripts matches so the allowlist is defined in exactly one place.
const SUPPORTED_HOSTS = new Set(
  chrome.runtime.getManifest().content_scripts
    .flatMap((cs) => cs.matches || [])
    .map((pattern) => {
      try {
        return new URL(pattern.replace('*://', 'https://')).hostname;
      } catch (e) {
        return null;
      }
    })
    .filter(Boolean)
);

function tabHostname(tab) {
  try {
    return new URL(tab.url ?? '').hostname;
  } catch (e) {
    return '';
  }
}

function clearActionBadge(tabId) {
  chrome.action.setBadgeText({ tabId, text: '' });
  chrome.action.setTitle({ tabId, title: 'CounselReflect' });
}

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;

  try {
    // Try to send message to content script
    await chrome.tabs.sendMessage(tab.id, { action: 'toggleSidebar' });
    // A successful toggle proves the page is supported: drop any stale '!'
    // badge left from a click on an unsupported page in this tab.
    clearActionBadge(tab.id);
  } catch (error) {
    // The content script is not loaded. Only inject on supported hosts:
    // web_accessible_resources exposes sidebar.html to those origins only,
    // so anywhere else the sidebar iframe would render as a blank frame.
    // (tab.url is readable here because the click grants activeTab.)
    if (!SUPPORTED_HOSTS.has(tabHostname(tab))) {
      chrome.action.setBadgeText({ tabId: tab.id, text: '!' });
      chrome.action.setTitle({
        tabId: tab.id,
        title: 'Open Gemini, ChatGPT, or Claude to use CounselReflect'
      });
      return;
    }

    // Inject the content script, then retry the toggle
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      });
      
      // executeScript resolves after the file has run, so its listener is
      // already registered. Send immediately instead of relying on a timer
      // that an idle Manifest V3 service worker may be suspended before firing.
      await chrome.tabs.sendMessage(tab.id, { action: 'toggleSidebar' });
      clearActionBadge(tab.id);
    } catch (injectionError) {
      console.error('Failed to inject content script:', injectionError);
    }
  }
});
