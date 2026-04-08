// Tooltip system for showing evaluation scores on hover
let evaluationData = null;
let messageElements = new Map(); // Map message IDs to DOM elements
let tooltipElement = null;

/**
 * Initialize the tooltip system
 */
export function initTooltipSystem() {
  createTooltipElement();
}

/**
 * Create the tooltip DOM element
 */
function createTooltipElement() {
  if (tooltipElement) return;

  tooltipElement = document.createElement('div');
  tooltipElement.id = 'llm-therapist-tooltip';
  tooltipElement.style.cssText = `
    position: fixed;
    background: rgba(0, 0, 0, 0.9);
    color: white;
    padding: 12px 16px;
    border-radius: 8px;
    font-size: 13px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    z-index: 999999;
    pointer-events: none;
    opacity: 0;
    display: none;
    transition: opacity 0.2s ease;
    max-width: 400px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    backdrop-filter: blur(10px);
  `;
  document.body.appendChild(tooltipElement);
}

/**
 * Store evaluation results for tooltip display
 * @param {Object} results - Raw evaluation results from backend
 * @param {Array} messages - Array of message objects to re-map
 */
export function setEvaluationData(results, messages = null) {
  evaluationData = results;
  
  // Re-map message elements if provided
  if (messages && messages.length > 0) {
    mapMessageElements(messages);
  }
  
  // Highlight toxic messages
  highlightToxicMessages();
}

/**
 * Highlight messages that are marked as toxic
 */
function highlightToxicMessages() {
  // Handle new flat format (utteranceScores)
  if (evaluationData.utteranceScores) {
    evaluationData.utteranceScores.forEach((utterance, idx) => {
      const metrics = utterance.metrics || {};
      // Check for toxicity metric (could be named 'is_toxic', 'toxicity', etc.)
      const isToxicMetric = metrics['is_toxic'] || metrics['toxicity'];
      
      if (isToxicMetric && isToxicMetric.label === 'Toxic') {
        // Find the message elements for this index
        for (const [messageId, elementData] of messageElements.entries()) {
          if (elementData.index === idx) {
            createWarningForElement(elementData.elements[0], messageId);
          }
        }
      }
    });
    return;
  }

  // Handle legacy nested format
  if (evaluationData.toxicity && evaluationData.toxicity.per_utterance) {
    evaluationData.toxicity.per_utterance.forEach((utterance, idx) => {
      const isToxic = utterance.metrics?.is_toxic;
      
      if (isToxic && isToxic.type === 'categorical' && isToxic.label === 'Toxic') {
        // Find the message elements for this index
        for (const [messageId, elementData] of messageElements.entries()) {
          if (elementData.index === utterance.index) {
             createWarningForElement(elementData.elements[0], messageId);
          }
        }
      }
    });
  }
}

/**
 * Helper to create warning indicator
 */
function createWarningForElement(targetEl, messageId) {
  if (targetEl && !document.querySelector(`[data-toxic-for="${messageId}"]`)) {
    // Get element position
    const rect = targetEl.getBoundingClientRect();
    
    // Create a floating warning indicator on body (not touching the element at all)
    const warningIndicator = document.createElement('div');
    warningIndicator.className = 'toxic-warning-badge';
    warningIndicator.setAttribute('data-toxic-for', messageId);
    warningIndicator.style.cssText = `
      position: fixed;
      top: ${rect.top + window.scrollY}px;
      left: ${rect.left + window.scrollX - 25}px;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 18px;
      height: 18px;
      background: #EF4444;
      border-radius: 50%;
      box-shadow: 0 2px 6px rgba(239, 68, 68, 0.4);
      z-index: 999999;
      border: 2px solid white;
      cursor: help;
      pointer-events: none;
    `;
    warningIndicator.title = '⚠️ Toxic content detected';
    warningIndicator.innerHTML = '<span style="color: white; font-size: 11px; font-weight: bold; line-height: 1;">!</span>';
    
    // Add to body, not to the message element
    document.body.appendChild(warningIndicator);
    
    // Update position on scroll and resize
    const updatePosition = () => {
      const newRect = targetEl.getBoundingClientRect();
      warningIndicator.style.top = `${newRect.top}px`;
      warningIndicator.style.left = `${newRect.left - 25}px`;
    };
    
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    
    // Store cleanup function
    warningIndicator._cleanup = () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }
}

/**
 * Map scraped messages to their DOM elements for hover detection
 * @param {Array} messages - Array of message objects with id, role, content
 */
export function mapMessageElements(messages) {
  messageElements.clear();
  
  const hostname = window.location.hostname;
  
  if (hostname.includes('gemini.google.com')) {
    mapGeminiElements(messages);
  } else if (hostname.includes('chat.openai.com') || hostname.includes('chatgpt.com')) {
    mapChatGPTElements(messages);
  } else if (hostname.includes('claude.ai')) {
    mapClaudeElements(messages);
  }
}

/**
 * Map Gemini conversation elements
 */
function mapGeminiElements(messages) {
  const conversationContainers = document.querySelectorAll('.conversation-container');
  let messageIndex = 0;
  
  conversationContainers.forEach((container) => {
    // User query
    const userQuery = container.querySelector('user-query');
    if (userQuery && messages[messageIndex]) {
      const textElements = userQuery.querySelectorAll('.query-text-line');
      textElements.forEach(el => {
        attachHoverListeners(el, messageIndex);
      });
      messageElements.set(messages[messageIndex].id, { elements: textElements, index: messageIndex });
      messageIndex++;
    }
    
    // Model response
    const modelResponse = container.querySelector('model-response');
    if (modelResponse && messages[messageIndex]) {
      const paragraphs = modelResponse.querySelectorAll('.markdown p[data-path-to-node]');
      paragraphs.forEach(p => {
        attachHoverListeners(p, messageIndex);
      });
      messageElements.set(messages[messageIndex].id, { elements: paragraphs, index: messageIndex });
      messageIndex++;
    }
  });
}

/**
 * Map ChatGPT conversation elements
 */
function mapChatGPTElements(messages) {
  const articles = document.querySelectorAll('article[data-testid^="conversation-turn"]');
  let messageIndex = 0;
  
  articles.forEach((article) => {
    if (messageIndex >= messages.length) return;
    
    const turnType = article.getAttribute('data-turn');
    
    if (turnType === 'user') {
      const messageContent = article.querySelector('.whitespace-pre-wrap');
      if (messageContent) {
        attachHoverListeners(messageContent, messageIndex);
        messageElements.set(messages[messageIndex].id, { elements: [messageContent], index: messageIndex });
        messageIndex++;
      }
    } else if (turnType === 'assistant') {
      const paragraphs = article.querySelectorAll('.markdown p[data-start]');
      if (paragraphs.length > 0) {
        paragraphs.forEach(p => {
          attachHoverListeners(p, messageIndex);
        });
        messageElements.set(messages[messageIndex].id, { elements: paragraphs, index: messageIndex });
        messageIndex++;
      }
    }
  });
}

/**
 * Map Claude conversation elements
 */
function mapClaudeElements(messages) {
  const messageGroups = document.querySelectorAll('[data-test-render-count]');
  let messageIndex = 0;
  
  messageGroups.forEach((group) => {
    if (messageIndex >= messages.length) return;
    
    // User message
    const userMessage = group.querySelector('[data-testid="user-message"]');
    if (userMessage) {
      const textElement = userMessage.querySelector('p.whitespace-pre-wrap');
      if (textElement) {
        attachHoverListeners(textElement, messageIndex);
        messageElements.set(messages[messageIndex].id, { elements: [textElement], index: messageIndex });
        messageIndex++;
      }
    }
    
    // Claude response
    const claudeResponse = group.querySelector('.font-claude-response');
    if (claudeResponse && messageIndex < messages.length) {
      const paragraphs = claudeResponse.querySelectorAll('.standard-markdown p, .progressive-markdown p');
      if (paragraphs.length > 0) {
        paragraphs.forEach(p => {
          attachHoverListeners(p, messageIndex);
        });
        messageElements.set(messages[messageIndex].id, { elements: paragraphs, index: messageIndex });
        messageIndex++;
      }
    }
  });
}

/**
 * Attach hover event listeners to an element
 */
function attachHoverListeners(element, messageIndex) {
  element.style.cursor = 'help';
  element.style.transition = 'background-color 0.2s ease';
  
  element.addEventListener('mouseenter', (e) => {
    element.style.backgroundColor = 'rgba(59, 130, 246, 0.1)';
    showTooltip(e, messageIndex);
  });
  
  element.addEventListener('mouseleave', () => {
    element.style.backgroundColor = '';
    hideTooltip();
  });
  
  element.addEventListener('mousemove', (e) => {
    updateTooltipPosition(e);
  });
}

/**
 * Show tooltip with evaluation scores for a message
 */
function showTooltip(event, messageIndex) {
  if (!tooltipElement) {
    createTooltipElement();
  }
  
  if (!evaluationData) return;
  
  const tooltipContent = formatTooltipContent(messageIndex);
  if (!tooltipContent) return;
  
  tooltipElement.innerHTML = tooltipContent;
  tooltipElement.style.opacity = '1';
  tooltipElement.style.display = 'block';
  updateTooltipPosition(event);
}

/**
 * Hide the tooltip
 */
function hideTooltip() {
  if (!tooltipElement) return;
  tooltipElement.style.opacity = '0';
  // Use setTimeout to hide display after transition
  setTimeout(() => {
    if (tooltipElement && tooltipElement.style.opacity === '0') {
      tooltipElement.style.display = 'none';
    }
  }, 200);
}

/**
 * Update tooltip position based on mouse position
 */
function updateTooltipPosition(event) {
  if (!tooltipElement) return;
  
  const offset = 15;
  let x = event.clientX + offset;
  let y = event.clientY + offset;
  
  // Prevent tooltip from going off screen
  const rect = tooltipElement.getBoundingClientRect();
  if (x + rect.width > window.innerWidth) {
    x = event.clientX - rect.width - offset;
  }
  if (y + rect.height > window.innerHeight) {
    y = event.clientY - rect.height - offset;
  }
  
  tooltipElement.style.left = x + 'px';
  tooltipElement.style.top = y + 'px';
}

/**
 * Format tooltip content HTML for a specific message
 */
function formatTooltipContent(messageIndex) {
  if (!evaluationData) return null;
  
  let html = `<div style="font-weight: bold; margin-bottom: 8px; font-size: 14px;">Message ${messageIndex + 1} Scores</div>`;
  let hasData = false;
  
  // Handle embedding flat format (utteranceScores)
  if (evaluationData.utteranceScores) {
    const utteranceData = evaluationData.utteranceScores[messageIndex]; // Access by index since array is ordered
    
    if (utteranceData && utteranceData.metrics && Object.keys(utteranceData.metrics).length > 0) {
      hasData = true;
      html += `<div style="margin-top: 10px;">`;
      
      // Since flat format doesn't have categories, we just list metrics
      // or we can treat them as one 'Metrics' category
      
      for (const [metricName, metricValue] of Object.entries(utteranceData.metrics)) {
         html += formatMetricValue(metricName, metricValue);
      }
      
      html += `</div>`;
    }
  } else {
    // Handle split format (legacy categories)
    // Iterate through all metric categories in the evaluation data
    for (const [metricCategory, categoryData] of Object.entries(evaluationData)) {
        if (!categoryData || !categoryData.per_utterance) continue;
        
        const utteranceData = categoryData.per_utterance.find(u => u.index === messageIndex);
        
        if (!utteranceData || !utteranceData.metrics || Object.keys(utteranceData.metrics).length === 0) {
        continue;
        }
        
        hasData = true;
        html += `<div style="margin-top: 10px;">`;
        html += `<div style="color: #60A5FA; font-weight: 600; margin-bottom: 4px; text-transform: capitalize;">${formatMetricName(metricCategory)}</div>`;
        
        for (const [metricName, metricValue] of Object.entries(utteranceData.metrics)) {
        html += formatMetricValue(metricName, metricValue);
        }
        
        html += `</div>`;
    }
  }
  
  if (!hasData) {
    return `<div style="color: #9CA3AF;">No evaluation data for this message</div>`;
  }
  
  return html;
}

/**
 * Format a single metric value
 */
function formatMetricValue(name, value) {
  const displayName = formatMetricName(name);
  
  if (value.type === 'categorical') {
    const confidence = value.confidence ? ` (${(value.confidence * 100).toFixed(1)}%)` : '';
    const color = getColorForLabel(value.label);
    return `
      <div style="margin: 4px 0; display: flex; justify-content: space-between; align-items: center;">
        <span style="color: #D1D5DB;">${displayName}:</span>
        <span style="color: ${color}; font-weight: 600;">${value.label}${confidence}</span>
      </div>
    `;
  } else if (value.type === 'numerical') {
    const percentage = value.max_value ? `${((value.value / value.max_value) * 100).toFixed(1)}%` : value.value.toFixed(3);
    const label = value.label ? ` (${value.label})` : '';
    const color = value.label ? getColorForLabel(value.label) : '#9CA3AF';
    return `
      <div style="margin: 4px 0; display: flex; justify-content: space-between; align-items: center;">
        <span style="color: #D1D5DB;">${displayName}:</span>
        <span style="color: ${color}; font-weight: 600;">${percentage}${label}</span>
      </div>
    `;
  }
  
  return '';
}

/**
 * Get color based on label
 */
function getColorForLabel(label) {
  const normalizedLabel = label.toLowerCase();
  
  if (normalizedLabel.includes('high') || normalizedLabel.includes('toxic')) {
    return '#EF4444'; // Red
  } else if (normalizedLabel.includes('medium') || normalizedLabel.includes('moderate')) {
    return '#F59E0B'; // Orange
  } else if (normalizedLabel.includes('low') || normalizedLabel.includes('safe')) {
    return '#10B981'; // Green
  }
  
  return '#9CA3AF'; // Gray default
}

/**
 * Format metric name for display
 */
function formatMetricName(name) {
  return name
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Clear all tooltip data and event listeners
 */
export function clearTooltipSystem() {
  // Remove all floating toxic warning indicators from body
  const allWarningBadges = document.querySelectorAll('.toxic-warning-badge');
  allWarningBadges.forEach(badge => {
    // Cleanup event listeners if they exist
    if (badge._cleanup) {
      badge._cleanup();
    }
    badge.remove();
  });
  
  messageElements.clear();
  evaluationData = null;
  
  if (tooltipElement) {
    tooltipElement.style.opacity = '0';
  }
}
