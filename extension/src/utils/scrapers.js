// Page scraping functions for different platforms

// Block-level elements that make up a message's readable content. Nested
// matches (a <p> inside a <blockquote> or <li>, a <code> inside <pre>) are
// collapsed onto the outermost match so text is never counted twice, and
// 'pre code' (rather than 'pre') skips code-block header/copy-button chrome.
const BLOCK_SELECTOR = 'p, li, h1, h2, h3, h4, h5, h6, blockquote, pre code, table';

/**
 * Enumerate the outermost readable block elements of a message container in
 * DOM order. This single function decides both what text gets scraped and
 * which elements receive hover tooltips (see utils/tooltip.js), so the
 * scraper and the tooltip mapper can never disagree about which turns exist.
 */
function getMessageBlocks(container) {
  if (!container) return [];
  return Array.from(container.querySelectorAll(BLOCK_SELECTOR)).filter(el => {
    // Keep only OUTERMOST matches within the container. The ancestor check
    // must stop at the container: closest() walks the whole document, and a
    // block-like ancestor ABOVE the container (e.g. the thread nested in a
    // layout <li> after a platform redesign) would otherwise discard every
    // block and silently drop the entire message.
    const ancestor = el.parentElement?.closest(BLOCK_SELECTOR);
    return !(ancestor && container.contains(ancestor) && ancestor !== container);
  });
}

/**
 * Extract readable text from the blocks returned by getMessageBlocks.
 */
function blocksToText(blocks) {
  return blocks
    .map(el => {
      // Preserve intentional line breaks (e.g. ChatGPT renders <br> inside paragraphs)
      let source = el;
      if (el.querySelector('br')) {
        source = el.cloneNode(true);
        source.querySelectorAll('br').forEach(br => br.replaceWith('\n'));
      }
      const text = source.textContent?.trim();
      if (!text) return '';
      return el.tagName === 'LI' ? `- ${text}` : text;
    })
    .filter(text => text)
    .join('\n\n');
}

function containerToTurnContent(container) {
  if (!container) return { text: '', elements: [] };
  const blocks = getMessageBlocks(container);
  const text =
    (blocks.length > 0 ? blocksToText(blocks) : container.textContent?.trim()) || '';
  return {
    text,
    elements: blocks.length > 0 ? blocks : [container]
  };
}

function extractGeminiTurns() {
  const turns = [];

  // Find all conversation containers
  const conversationContainers = document.querySelectorAll('.conversation-container');

  conversationContainers.forEach((container, index) => {
    // Check for user query
    const userQuery =
      container.querySelector('user-query') ||
      container.querySelector('.query-text');
    if (userQuery) {
      const queryText = userQuery.querySelector?.('.query-text') || userQuery;
      const userTextElements = Array.from(userQuery.querySelectorAll('.query-text-line'));
      const userText = userTextElements
        .map(el => el.textContent?.trim())
        .filter(text => text)
        .join('\n') || queryText.textContent?.trim();

      if (userText) {
        turns.push({
          message: { id: `gemini-user-${index}`, role: 'Client', content: userText },
          elements: userTextElements.length > 0 ? userTextElements : [queryText]
        });
      }
    }

    // Gemini's newer renderer places the selected draft under
    // response-container/structured-content-container rather than .markdown.
    const responseContainers = Array.from(
      container.querySelectorAll?.('response-container') || []
    );
    const selectedResponse =
      responseContainers.find((response) =>
        response.getAttribute?.('aria-selected') === 'true' ||
        response.matches?.('.selected, [data-active="true"]')
      ) ||
      responseContainers.find((response) =>
        !response.hasAttribute?.('hidden') &&
        response.getAttribute?.('aria-hidden') !== 'true'
      ) ||
      responseContainers.at(-1);
    const modelResponse =
      selectedResponse ||
      container.querySelector('model-response');

    if (modelResponse) {
      const responseContent =
        modelResponse.querySelector?.('.markdown') ||
        modelResponse.querySelector?.('structured-content-container > div.container') ||
        modelResponse.querySelector?.('structured-content-container') ||
        modelResponse.querySelector?.('message-content') ||
        modelResponse;
      const { text: responseText, elements } = containerToTurnContent(responseContent);

      if (responseText) {
        turns.push({
          message: { id: `gemini-ai-${index}`, role: 'Chatbot', content: responseText },
          elements
        });
      }
    }
  });

  return turns;
}

function extractChatGPTTurns() {
  const turns = [];

  const roleSelector =
    '[data-message-author-role="user"], [data-message-author-role="assistant"]';
  let containers = Array.from(
    document.querySelectorAll('[data-testid^="conversation-turn"]')
  );

  // ChatGPT has also shipped layouts without conversation-turn wrappers.
  // In those versions, the author-role element itself is the stable boundary.
  if (containers.length === 0) {
    containers = Array.from(document.querySelectorAll(roleSelector)).filter((element) => {
      const parentRole = element.parentElement?.closest?.(roleSelector);
      return !parentRole;
    });
  }

  containers.forEach((container, index) => {
    const directRole =
      container.getAttribute?.('data-turn') ||
      container.getAttribute?.('data-message-author-role');
    const nestedRoleElement = container.querySelector?.(roleSelector);
    const turnType =
      directRole || nestedRoleElement?.getAttribute?.('data-message-author-role');
    const roleElement =
      container.getAttribute?.('data-message-author-role')
        ? container
        : nestedRoleElement || container;

    if (turnType === 'user') {
      const messageContent =
        roleElement.querySelector?.('.whitespace-pre-wrap, [data-testid="user-message"]') ||
        roleElement;
      const blocks = getMessageBlocks(messageContent);
      const content =
        (blocks.length > 0 ? blocksToText(blocks) : messageContent.textContent?.trim()) || '';

      if (content) {
        turns.push({
          message: { id: `chatgpt-user-${index}`, role: 'Client', content },
          elements: blocks.length > 0 ? blocks : [messageContent]
        });
      }
    } else if (turnType === 'assistant') {
      const messageContent =
        roleElement.querySelector?.('.markdown, [data-testid="assistant-message"]') ||
        roleElement;
      const blocks = getMessageBlocks(messageContent);
      const responseText =
        (blocks.length > 0 ? blocksToText(blocks) : messageContent.textContent?.trim()) || '';

      if (responseText) {
        turns.push({
          message: { id: `chatgpt-ai-${index}`, role: 'Chatbot', content: responseText },
          elements: blocks.length > 0 ? blocks : [messageContent]
        });
      }
    }
  });

  return turns;
}

function extractClaudeTurns() {
  const turns = [];

  // Prefer the role-bearing message nodes. They are stable across layouts and
  // preserve document order without relying on an experiment-specific parent.
  const directMessages = Array.from(document.querySelectorAll(
    '[data-testid="user-message"], [data-testid="assistant-message"], .font-claude-response'
  )).filter((element) => {
    const testId = element.getAttribute?.('data-testid');
    if (testId) return true;
    return !element.closest?.('[data-testid="assistant-message"]');
  });

  directMessages.forEach((element, index) => {
    const role =
      element.getAttribute?.('data-testid') === 'user-message'
        ? 'user'
        : 'assistant';
    const { text, elements } = containerToTurnContent(element);
    if (!text) return;

    turns.push({
      message: {
        id: `claude-${role === 'user' ? 'user' : 'ai'}-${index}`,
        role: role === 'user' ? 'Client' : 'Chatbot',
        content: text
      },
      elements
    });
  });

  if (turns.length > 0) return turns;

  // Legacy fallback for older Claude layouts.
  const messageGroups = document.querySelectorAll('[data-test-render-count]');

  messageGroups.forEach((group, index) => {
    // Check for user message (may span multiple paragraphs)
    const userMessage = group.querySelector('[data-testid="user-message"]');
    if (userMessage) {
      const blocks = getMessageBlocks(userMessage);
      const content = blocksToText(blocks);

      if (content) {
        turns.push({
          message: { id: `claude-user-${index}`, role: 'Client', content },
          elements: blocks
        });
      }
    }

    // Check for Claude response
    const claudeResponse = group.querySelector('.font-claude-response');
    if (claudeResponse) {
      // Try standard-markdown first, then progressive-markdown
      const markdownContainer = claudeResponse.querySelector('.standard-markdown, .progressive-markdown');
      const blocks = getMessageBlocks(markdownContainer);
      const responseText = blocksToText(blocks);

      if (responseText) {
        turns.push({
          message: { id: `claude-ai-${index}`, role: 'Chatbot', content: responseText },
          elements: blocks
        });
      }
    }
  });

  return turns;
}

export function scrapeGemini() {
  return extractGeminiTurns().map(turn => turn.message);
}

export function scrapeChatGPT() {
  return extractChatGPTTurns().map(turn => turn.message);
}

export function scrapeClaude() {
  return extractClaudeTurns().map(turn => turn.message);
}

function buildTurnsResult(platform, turns) {
  return {
    platform,
    turns,
    success: turns.length > 0,
    error: turns.length === 0 ? 'No conversation found on page' : undefined
  };
}

/**
 * Extract the turns ({ message, elements }) for the current platform.
 * The tooltip system uses the elements as hover targets; only the plain
 * messages may be sent to the sidebar (DOM nodes cannot cross the
 * extension messaging boundary).
 */
export function scrapeCurrentPageWithElements() {
  // Detect platform
  const hostname = window.location.hostname;

  if (hostname.includes('gemini.google.com')) {
    return buildTurnsResult('gemini', extractGeminiTurns());
  }

  if (hostname.includes('chat.openai.com') || hostname.includes('chatgpt.com')) {
    return buildTurnsResult('chatgpt', extractChatGPTTurns());
  }

  if (hostname.includes('claude.ai')) {
    return buildTurnsResult('claude', extractClaudeTurns());
  }

  return {
    platform: 'unknown',
    turns: [],
    success: false,
    error: 'Unsupported platform. Please use Gemini, ChatGPT, or Claude.'
  };
}

export function scrapeCurrentPage() {
  const { platform, turns, success, error } = scrapeCurrentPageWithElements();
  return { platform, messages: turns.map(turn => turn.message), success, error };
}

/**
 * Compare a fresh scrape with the transcript that was evaluated. Turn ids are
 * index-derived on all supported sites, so role and content must also match;
 * ids alone would treat two different SPA conversations as the same thread.
 */
export function areSameConversationMessages(left = [], right = []) {
  if (left.length !== right.length) return false;
  return left.every((message, index) => {
    const other = right[index];
    return (
      other &&
      message.id === other.id &&
      message.role === other.role &&
      message.content === other.content
    );
  });
}

/**
 * Confirm that an evaluated transcript is an unchanged, ordered subset of
 * the conversation currently rendered on the page. This is intentionally
 * stricter than matching ids: supported sites derive ids from turn indexes,
 * so a different SPA thread can reuse every id.
 *
 * The subset form matters because the scrape preview lets a user exclude
 * individual turns before evaluation. A freshly injected content script can
 * therefore recover overlays for a restored report without requiring another
 * manual scrape, while still refusing to attach scores to the wrong thread.
 */
export function areMessagesContainedInConversation(evaluated = [], current = []) {
  if (!evaluated.length || !current.length || evaluated.length > current.length) return false;

  const currentById = new Map(
    current.map((message, index) => [message.id, { message, index }])
  );
  let previousIndex = -1;

  return evaluated.every((message) => {
    const match = currentById.get(message.id);
    if (!match || match.index <= previousIndex) return false;
    previousIndex = match.index;
    return (
      message.role === match.message.role &&
      message.content === match.message.content
    );
  });
}
