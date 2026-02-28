// Main content script - orchestrates sidebar and scraping functionality
import { toggleSidebar, getSidebarIframe } from './utils/sidebar.js';
import { scrapeCurrentPage } from './utils/scrapers.js';
import { initTooltipSystem, setEvaluationData, mapMessageElements, clearTooltipSystem } from './utils/tooltip.js';

// Initialize tooltip system on page load
initTooltipSystem();

// Store the last scraped messages for re-mapping
let lastScrapedMessages = [];

// Listen for messages from background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'toggleSidebar') {
    toggleSidebar();
    sendResponse({ success: true });
  }
  
  return true; // Keep message channel open for async response
});

// Listen for messages from sidebar iframe
window.addEventListener('message', (event) => {
  // Handle scrape requests from sidebar
  if (event.data.type === 'SCRAPE_REQUEST') {
    try {
      const result = scrapeCurrentPage();
      const iframe = getSidebarIframe();
      
      // Map message elements for tooltip system and store messages
      if (result.success && result.messages.length > 0) {
        mapMessageElements(result.messages);
        lastScrapedMessages = result.messages; // Store for later re-mapping
      }
      
      // Send response back to sidebar iframe
      if (iframe && iframe.contentWindow) {
        iframe.contentWindow.postMessage({
          type: 'SCRAPE_RESPONSE',
          payload: result
        }, '*');
      }
    } catch (error) {
      const iframe = getSidebarIframe();
      if (iframe && iframe.contentWindow) {
        iframe.contentWindow.postMessage({
          type: 'SCRAPE_RESPONSE',
          payload: {
            platform: 'unknown',
            messages: [],
            success: false,
            error: error.message
          }
        }, '*');
      }
    }
  }
  
  // Handle evaluation results from sidebar
  if (event.data.type === 'EVALUATION_RESULTS') {
    // Pass messages to re-map elements after they were cleared
    setEvaluationData(event.data.payload, lastScrapedMessages);
  }
  
  // Handle clear tooltip request
  if (event.data.type === 'CLEAR_TOOLTIPS') {
    clearTooltipSystem();
    // Don't clear lastScrapedMessages - we need them for re-mapping after evaluation
  }
  
  // Handle batch highlight request
  if (event.data.type === 'HIGHLIGHT_ALL_REQUEST' && event.data.highlights) {
    clearHighlights();
    highlightAllTexts(event.data.highlights);
  }
  
  // Handle clear highlights request
  if (event.data.type === 'CLEAR_HIGHLIGHTS') {
    clearHighlights();
  }
  
  // Handle single highlight request (legacy)
  if (event.data.type === 'HIGHLIGHT_REQUEST' && event.data.action === 'highlight') {
    clearHighlights();
    highlightTextOnPage(event.data.text, event.data.score);
  }
});

// Clear all highlights
function clearHighlights() {
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
    setTimeout(() => {
      highlightTextOnPage(highlight.text, highlight.score, false);
    }, index * 100); // Stagger highlights for smoother UX
  });
  
  // Scroll to first highlight after all are applied
  setTimeout(() => {
    const firstHighlight = document.querySelector('.llm-highlight-wrapper');
    if (firstHighlight) {
      firstHighlight.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, highlights.length * 100 + 200);
}

// Improved function to highlight text on the current page
function highlightTextOnPage(textToHighlight, score, scrollTo = true) {
  // Determine color based on score
  const bgColor = score === 5 ? '#fef08a' : '#fed7aa'; // yellow-200 for 5, orange-200 for 4
  const borderColor = score === 5 ? '#84cc16' : '#f97316'; // lime-500 for 5, orange-500 for 4
  
  // Normalize the search text (trim and normalize whitespace)
  const normalizedSearch = textToHighlight.trim().replace(/\s+/g, ' ');
  
  let found = false;
  
  // Try different search strategies
  const searchStrategies = [
    // Strategy 1: Exact match
    (text) => text.indexOf(normalizedSearch),
    // Strategy 2: Case-insensitive match
    (text) => text.toLowerCase().indexOf(normalizedSearch.toLowerCase()),
    // Strategy 3: Partial match (first 30 chars)
    (text) => normalizedSearch.length > 30 ? text.indexOf(normalizedSearch.substring(0, 30)) : -1,
  ];
  
  // Try each strategy
  for (const strategy of searchStrategies) {
    if (found) break;
    
    // Use TreeWalker to find text nodes
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: function(node) {
          // Skip script, style, and already highlighted nodes
          if (node.parentElement.tagName === 'SCRIPT' || 
              node.parentElement.tagName === 'STYLE' ||
              node.parentElement.classList.contains('llm-highlight-wrapper')) {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );
    
    let node;
    while (node = walker.nextNode()) {
      const text = node.textContent.trim().replace(/\s+/g, ' ');
      const index = strategy(text);
      
      if (index !== -1) {
        try {
          // Calculate the actual position in the original text
          const highlightLength = Math.min(normalizedSearch.length, node.textContent.length - index);
          
          // Create range for highlighting
          const range = document.createRange();
          range.setStart(node, index);
          range.setEnd(node, index + highlightLength);
          
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
  
  if (!found) {
    console.warn('Text not found on page:', normalizedSearch.substring(0, 100));
  }
  
  return found;
}

