// Page scraping functions for different platforms

export function scrapeGemini() {
  const messages = [];
  
  // Find all conversation containers
  const conversationContainers = document.querySelectorAll('.conversation-container');
  
  conversationContainers.forEach((container, index) => {
    // Check for user query
    const userQuery = container.querySelector('user-query');
    if (userQuery) {
      const userTextElements = userQuery.querySelectorAll('.query-text-line');
      const userText = Array.from(userTextElements)
        .map(el => el.textContent?.trim())
        .filter(text => text)
        .join('\n');
      
      if (userText) {
        messages.push({
          id: `gemini-user-${index}`,
          role: 'Client',
          content: userText
        });
      }
    }
    
    // Check for model response
    const modelResponse = container.querySelector('model-response');
    if (modelResponse) {
      // Get the markdown content
      const markdownContainer = modelResponse.querySelector('.markdown');
      if (markdownContainer) {
        // Get all paragraph elements
        const paragraphs = markdownContainer.querySelectorAll('p[data-path-to-node]');
        const responseText = Array.from(paragraphs)
          .map(p => p.textContent?.trim())
          .filter(text => text)
          .join('\n\n');
        
        if (responseText) {
          messages.push({
            id: `gemini-ai-${index}`,
            role: 'Therapist',
            content: responseText
          });
        }
      }
    }
  });
  
  return messages;
}

export function scrapeChatGPT() {
  const messages = [];
  
  // Find all conversation turns (articles)
  const articles = document.querySelectorAll('article[data-testid^="conversation-turn"]');
  
  articles.forEach((article, index) => {
    const turnType = article.getAttribute('data-turn');
    
    if (turnType === 'user') {
      // User message
      const messageContent = article.querySelector('.whitespace-pre-wrap');
      if (messageContent) {
        const content = messageContent.textContent?.trim();
        if (content) {
          messages.push({
            id: `chatgpt-user-${index}`,
            role: 'Client',
            content
          });
        }
      }
    } else if (turnType === 'assistant') {
      // Assistant message
      const markdownContainer = article.querySelector('.markdown');
      if (markdownContainer) {
        // Get all paragraph elements
        const paragraphs = markdownContainer.querySelectorAll('p[data-start]');
        const responseText = Array.from(paragraphs)
          .map(p => {
            // Remove <br> tags and get text
            const clone = p.cloneNode(true);
            clone.querySelectorAll('br').forEach(br => br.replaceWith('\n'));
            return clone.textContent?.trim();
          })
          .filter(text => text)
          .join('\n\n');
        
        if (responseText) {
          messages.push({
            id: `chatgpt-ai-${index}`,
            role: 'Therapist',
            content: responseText
          });
        }
      }
    }
  });
  
  return messages;
}

export function scrapeClaude() {
  const messages = [];
  
  // Find all message groups
  const messageGroups = document.querySelectorAll('[data-test-render-count]');
  
  messageGroups.forEach((group, index) => {
    // Check for user message
    const userMessage = group.querySelector('[data-testid="user-message"]');
    if (userMessage) {
      const textElement = userMessage.querySelector('p.whitespace-pre-wrap');
      if (textElement) {
        const content = textElement.textContent?.trim();
        if (content) {
          messages.push({
            id: `claude-user-${index}`,
            role: 'Client',
            content
          });
        }
      }
    }
    
    // Check for Claude response
    const claudeResponse = group.querySelector('.font-claude-response');
    if (claudeResponse) {
      // Try standard-markdown first, then progressive-markdown
      const markdownContainer = claudeResponse.querySelector('.standard-markdown, .progressive-markdown');
      if (markdownContainer) {
        // Get all paragraph elements with Claude's response styling
        const paragraphs = markdownContainer.querySelectorAll('p.font-claude-response-body');
        const responseText = Array.from(paragraphs)
          .map(p => p.textContent?.trim())
          .filter(text => text)
          .join('\n\n');
        
        if (responseText) {
          messages.push({
            id: `claude-ai-${index}`,
            role: 'Therapist',
            content: responseText
          });
        }
      }
    }
  });
  
  return messages;
}

export function scrapeCurrentPage() {
  // Detect platform
  const hostname = window.location.hostname;
  
  if (hostname.includes('gemini.google.com')) {
    return {
      platform: 'gemini',
      messages: scrapeGemini(),
      success: true
    };
  }
  
  if (hostname.includes('chat.openai.com') || hostname.includes('chatgpt.com')) {
    const messages = scrapeChatGPT();
    return {
      platform: 'chatgpt',
      messages,
      success: messages.length > 0,
      error: messages.length === 0 ? 'No conversation found on page' : undefined
    };
  }
  
  if (hostname.includes('claude.ai')) {
    const messages = scrapeClaude();
    return {
      platform: 'claude',
      messages,
      success: messages.length > 0,
      error: messages.length === 0 ? 'No conversation found on page' : undefined
    };
  }
  
  return {
    platform: 'unknown',
    messages: [],
    success: false,
    error: 'Unsupported platform. Please use Gemini, ChatGPT, or Claude.'
  };
}
