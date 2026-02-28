// Background service worker
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  
  try {
    // Try to send message to content script
    await chrome.tabs.sendMessage(tab.id, { action: 'toggleSidebar' });
  } catch (error) {
    // If content script is not loaded, inject it first
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      });
      
      // Wait a bit for content script to initialize
      setTimeout(() => {
        chrome.tabs.sendMessage(tab.id, { action: 'toggleSidebar' }).catch(() => {
          // Silently fail if toggle doesn't work after injection
        });
      }, 100);
    } catch (injectionError) {
      console.error('Failed to inject content script:', injectionError);
    }
  }
});
