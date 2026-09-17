import assert from 'node:assert/strict';
import test from 'node:test';

import {
  areMessagesContainedInConversation,
  areSameConversationMessages,
  scrapeChatGPT,
  scrapeClaude,
  scrapeGemini
} from '../src/utils/scrapers.js';

const messages = [
  { id: 'chatgpt-user-0', role: 'Client', content: 'I feel stuck.' },
  { id: 'chatgpt-ai-1', role: 'Chatbot', content: 'What feels most difficult?' }
];

test('matches an unchanged scraped conversation', () => {
  assert.equal(
    areSameConversationMessages(messages, messages.map((message) => ({ ...message }))),
    true
  );
});

test('rejects a different SPA conversation even when index-derived ids match', () => {
  const changed = messages.map((message) => ({ ...message }));
  changed[0].content = 'This is a different thread.';
  assert.equal(areSameConversationMessages(messages, changed), false);
});

test('rejects changed turn order, roles, and length', () => {
  assert.equal(areSameConversationMessages(messages, [...messages].reverse()), false);
  assert.equal(
    areSameConversationMessages(messages, [{ ...messages[0], role: 'Chatbot' }, messages[1]]),
    false
  );
  assert.equal(areSameConversationMessages(messages, messages.slice(0, 1)), false);
});

test('accepts an unchanged evaluated subset in page order', () => {
  const current = [
    messages[0],
    { id: 'chatgpt-user-1', role: 'Client', content: 'A turn excluded in preview.' },
    messages[1]
  ];
  assert.equal(
    areMessagesContainedInConversation([messages[0], messages[1]], current),
    true
  );
});

test('rejects a restored report for a changed thread or reordered subset', () => {
  const current = messages.map((message) => ({ ...message }));
  const changed = [{ ...messages[0], content: 'Same id, different conversation.' }];
  assert.equal(areMessagesContainedInConversation(changed, current), false);
  assert.equal(areMessagesContainedInConversation([...messages].reverse(), current), false);
  assert.equal(areMessagesContainedInConversation([], current), false);
});

const makeBlock = (tagName, text) => ({
  tagName,
  textContent: text,
  parentElement: { closest: () => null },
  querySelector: () => null
});

const makeBlockContainer = (...blocks) => ({
  querySelectorAll: () => blocks,
  contains: () => true
});

test('scrapes client and chatbot turns from ChatGPT', () => {
  const assistantBlocks = makeBlockContainer(
    makeBlock('P', 'That sounds difficult.'),
    makeBlock('LI', 'Name one small next step.')
  );
  const articles = [
    {
      getAttribute: (name) => name === 'data-turn' ? 'user' : null,
      querySelector: (selector) =>
        selector.startsWith('.whitespace-pre-wrap')
          ? {
              textContent: 'I feel stuck.',
              querySelector: () => null,
              querySelectorAll: () => []
            }
          : null
    },
    {
      getAttribute: (name) => name === 'data-turn' ? 'assistant' : null,
      querySelector: (selector) => selector.startsWith('.markdown') ? assistantBlocks : null
    }
  ];
  globalThis.document = {
    querySelectorAll: (selector) =>
      selector === '[data-testid^="conversation-turn"]' ? articles : []
  };

  assert.deepEqual(scrapeChatGPT(), [
    { id: 'chatgpt-user-0', role: 'Client', content: 'I feel stuck.' },
    {
      id: 'chatgpt-ai-1',
      role: 'Chatbot',
      content: 'That sounds difficult.\n\n- Name one small next step.'
    }
  ]);
});

test('scrapes ChatGPT turns from author-role containers without turn wrappers', () => {
  const user = {
    parentElement: { closest: () => null },
    getAttribute: (name) => name === 'data-message-author-role' ? 'user' : null,
    querySelector: () => null,
    querySelectorAll: () => [],
    textContent: 'I need help deciding.'
  };
  const assistant = {
    parentElement: { closest: () => null },
    getAttribute: (name) => name === 'data-message-author-role' ? 'assistant' : null,
    querySelector: () => null,
    querySelectorAll: () => [],
    textContent: 'What options are you considering?'
  };
  globalThis.document = {
    querySelectorAll: (selector) => {
      if (selector === '[data-testid^="conversation-turn"]') return [];
      if (selector.includes('data-message-author-role')) return [user, assistant];
      return [];
    }
  };

  assert.deepEqual(scrapeChatGPT(), [
    { id: 'chatgpt-user-0', role: 'Client', content: 'I need help deciding.' },
    {
      id: 'chatgpt-ai-1',
      role: 'Chatbot',
      content: 'What options are you considering?'
    }
  ]);
});

test('reads ChatGPT author roles nested inside generic turn containers', () => {
  const userRole = {
    getAttribute: (name) => name === 'data-message-author-role' ? 'user' : null,
    querySelector: () => null,
    querySelectorAll: () => [],
    textContent: 'I feel overwhelmed.'
  };
  const assistantRole = {
    getAttribute: (name) => name === 'data-message-author-role' ? 'assistant' : null,
    querySelector: () => null,
    querySelectorAll: () => [],
    textContent: 'Let us slow this down together.'
  };
  const containers = [userRole, assistantRole].map((roleElement) => ({
    getAttribute: () => null,
    querySelector: (selector) =>
      selector.includes('data-message-author-role') ? roleElement : null
  }));
  globalThis.document = {
    querySelectorAll: (selector) =>
      selector === '[data-testid^="conversation-turn"]' ? containers : []
  };

  assert.deepEqual(scrapeChatGPT(), [
    { id: 'chatgpt-user-0', role: 'Client', content: 'I feel overwhelmed.' },
    {
      id: 'chatgpt-ai-1',
      role: 'Chatbot',
      content: 'Let us slow this down together.'
    }
  ]);
});

test('scrapes client and chatbot turns from Gemini', () => {
  const queryLines = [{ textContent: 'First line' }, { textContent: 'Second line' }];
  const responseBlocks = makeBlockContainer(makeBlock('P', 'Let us examine that.'));
  const userQuery = {
    querySelectorAll: (selector) => selector === '.query-text-line' ? queryLines : []
  };
  const modelResponse = {
    querySelector: (selector) => selector === '.markdown' ? responseBlocks : null
  };
  const container = {
    querySelector: (selector) => {
      if (selector === 'user-query') return userQuery;
      if (selector === 'model-response') return modelResponse;
      return null;
    }
  };
  globalThis.document = {
    querySelectorAll: (selector) => selector === '.conversation-container' ? [container] : []
  };

  assert.deepEqual(scrapeGemini(), [
    { id: 'gemini-user-0', role: 'Client', content: 'First line\nSecond line' },
    { id: 'gemini-ai-0', role: 'Chatbot', content: 'Let us examine that.' }
  ]);
});

test('scrapes Gemini turns from structured response containers', () => {
  const queryText = {
    textContent: 'Help me think this through.',
    querySelector: () => null,
    querySelectorAll: () => []
  };
  const structuredContent = makeBlockContainer(
    makeBlock('P', 'Let us compare the available options.')
  );
  const responseContainer = {
    getAttribute: (name) => name === 'aria-selected' ? 'true' : null,
    hasAttribute: () => false,
    matches: () => false,
    querySelector: (selector) =>
      selector === 'structured-content-container > div.container'
        ? structuredContent
        : null
  };
  const container = {
    querySelector: (selector) => {
      if (selector === '.query-text') return queryText;
      return null;
    },
    querySelectorAll: (selector) =>
      selector === 'response-container' ? [responseContainer] : []
  };
  globalThis.document = {
    querySelectorAll: (selector) =>
      selector === '.conversation-container' ? [container] : []
  };

  assert.deepEqual(scrapeGemini(), [
    { id: 'gemini-user-0', role: 'Client', content: 'Help me think this through.' },
    {
      id: 'gemini-ai-0',
      role: 'Chatbot',
      content: 'Let us compare the available options.'
    }
  ]);
});

test('scrapes client and chatbot turns from Claude legacy groups', () => {
  const userBlocks = makeBlockContainer(makeBlock('P', 'I am anxious.'));
  const responseBlocks = makeBlockContainer(makeBlock('P', 'What feels uncertain?'));
  const response = {
    querySelector: (selector) =>
      selector === '.standard-markdown, .progressive-markdown' ? responseBlocks : null
  };
  const group = {
    querySelector: (selector) => {
      if (selector === '[data-testid="user-message"]') return userBlocks;
      if (selector === '.font-claude-response') return response;
      return null;
    }
  };
  globalThis.document = {
    querySelectorAll: (selector) => selector === '[data-test-render-count]' ? [group] : []
  };

  assert.deepEqual(scrapeClaude(), [
    { id: 'claude-user-0', role: 'Client', content: 'I am anxious.' },
    { id: 'claude-ai-0', role: 'Chatbot', content: 'What feels uncertain?' }
  ]);
});

test('scrapes Claude turns from direct user and assistant message nodes', () => {
  const userMessage = Object.assign(
    makeBlockContainer(makeBlock('P', 'I cannot focus today.')),
    {
      getAttribute: (name) => name === 'data-testid' ? 'user-message' : null,
      closest: () => null
    }
  );
  const assistantMessage = Object.assign(
    makeBlockContainer(makeBlock('P', 'What has been competing for your attention?')),
    {
      getAttribute: (name) => name === 'data-testid' ? 'assistant-message' : null,
      closest: () => null
    }
  );
  globalThis.document = {
    querySelectorAll: (selector) =>
      selector.includes('[data-testid="assistant-message"]')
        ? [userMessage, assistantMessage]
        : []
  };

  assert.deepEqual(scrapeClaude(), [
    { id: 'claude-user-0', role: 'Client', content: 'I cannot focus today.' },
    {
      id: 'claude-ai-1',
      role: 'Chatbot',
      content: 'What has been competing for your attention?'
    }
  ]);
});
