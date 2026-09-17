import assert from 'node:assert/strict';
import test from 'node:test';

import {
  calculateHorizontalOverlayPosition,
  clearTooltipSystem,
  formatScoreForDisplay,
  getMessageElementRoots,
  initTooltipSystem,
  mapMessageElements,
  setEvaluationData,
  setPinnedScoreMessage
} from '../src/utils/tooltip.js';

test('keeps score overlays to the left of an open sidebar', () => {
  const target = { left: 8, right: 392 };

  assert.equal(
    calculateHorizontalOverlayPosition(target, 95, 240, 8, 8),
    137
  );
  assert.equal(
    calculateHorizontalOverlayPosition({ left: 100, right: 200 }, 80, 1000, 8, 8),
    208
  );
  assert.equal(
    calculateHorizontalOverlayPosition({ left: 56, right: 180 }, 44, 48, 2, 2),
    2
  );
});

test('preserves native metric scales instead of converting them to percentages', () => {
  assert.equal(
    formatScoreForDisplay({ type: 'numerical', value: 4, max_value: 5 }),
    '4 / 5'
  );
  assert.equal(
    formatScoreForDisplay({ type: 'numerical', value: 0.8, max_value: 1 }),
    '0.8 / 1'
  );
  assert.equal(
    formatScoreForDisplay({ type: 'categorical', label: 'Sustain' }),
    'Sustain'
  );
  assert.equal(
    formatScoreForDisplay({ type: 'numerical', value: -1, max_value: 5 }),
    'N/A'
  );
});

test('returns an empty root list for an unmapped highlight message', () => {
  assert.deepEqual(getMessageElementRoots('missing-turn'), []);
});

test('exposes the mapped DOM roots used to scope a turn highlight', () => {
  const messageElement = {
    textContent: 'A repeated phrase in the evaluated turn.',
    style: {},
    addEventListener() {},
    removeEventListener() {}
  };
  const article = {
    getAttribute: (name) => name === 'data-turn' ? 'user' : null,
    querySelector: (selector) =>
      selector.startsWith('.whitespace-pre-wrap') ? messageElement : null
  };
  messageElement.querySelector = () => null;
  messageElement.querySelectorAll = () => [];

  globalThis.window = {
    location: { hostname: 'chatgpt.com' },
    innerWidth: 1024,
    innerHeight: 768
  };
  globalThis.document = {
    documentElement: { clientWidth: 1024, clientHeight: 768 },
    getElementById: () => null,
    querySelectorAll: (selector) =>
      selector === '[data-testid^="conversation-turn"]' ? [article] : []
  };

  const messages = [
    {
      id: 'chatgpt-user-0',
      role: 'Client',
      content: 'A repeated phrase in the evaluated turn.'
    }
  ];
  mapMessageElements(messages);

  assert.deepEqual(getMessageElementRoots('chatgpt-user-0'), [messageElement]);
});

test('maps only the retained scraped turns after preview filtering', () => {
  const userElement = {
    textContent: 'Remove this turn.',
    style: {},
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener() {},
    removeEventListener() {}
  };
  const assistantElement = {
    textContent: 'Keep this turn.',
    style: {},
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener() {},
    removeEventListener() {}
  };
  const articles = [
    {
      getAttribute: (name) => name === 'data-turn' ? 'user' : null,
      querySelector: (selector) =>
        selector.startsWith('.whitespace-pre-wrap') ? userElement : null
    },
    {
      getAttribute: (name) => name === 'data-turn' ? 'assistant' : null,
      querySelector: (selector) => selector.startsWith('.markdown') ? assistantElement : null
    }
  ];

  globalThis.window = { location: { hostname: 'chatgpt.com' } };
  globalThis.document = {
    querySelectorAll: (selector) =>
      selector === '[data-testid^="conversation-turn"]' ? articles : []
  };

  mapMessageElements([
    {
      id: 'chatgpt-ai-1',
      role: 'Chatbot',
      content: 'Keep this turn.'
    }
  ]);

  assert.deepEqual(getMessageElementRoots('chatgpt-user-0'), []);
  assert.deepEqual(getMessageElementRoots('chatgpt-ai-1'), [assistantElement]);
});

test('uses a quiet pinned wash and restores host-page styles exactly', () => {
  const handlers = {};
  const messageElement = {
    textContent: 'Keep this pinned turn visible.',
    style: {
      backgroundColor: 'rgb(250, 250, 250)',
      boxShadow: '0 1px 2px rgba(0, 0, 0, 0.1)',
      borderRadius: '3px'
    },
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener(type, handler) { handlers[type] = handler; },
    removeEventListener(type) { delete handlers[type]; }
  };
  const article = {
    getAttribute: (name) => name === 'data-turn' ? 'user' : null,
    querySelector: (selector) =>
      selector.startsWith('.whitespace-pre-wrap') ? messageElement : null
  };

  globalThis.window = {
    location: { hostname: 'chatgpt.com' },
    innerWidth: 1024,
    innerHeight: 768
  };
  globalThis.document = {
    documentElement: { clientWidth: 1024, clientHeight: 768 },
    getElementById: () => null,
    querySelectorAll: (selector) =>
      selector === '[data-testid^="conversation-turn"]' ? [article] : []
  };

  mapMessageElements([
    { id: 'chatgpt-user-0', role: 'Client', content: 'Keep this pinned turn visible.' }
  ]);
  setPinnedScoreMessage('chatgpt-user-0');

  assert.equal(messageElement.style.outline, undefined);
  assert.equal(messageElement.style.backgroundColor, 'rgba(47, 110, 211, 0.055)');
  assert.equal(messageElement.style.boxShadow, '0 1px 2px rgba(0, 0, 0, 0.1)');
  assert.equal(messageElement.style.borderRadius, '3px');

  handlers.mouseenter();
  handlers.mouseleave();
  assert.equal(messageElement.style.backgroundColor, 'rgba(47, 110, 211, 0.055)');

  setPinnedScoreMessage(null);
  assert.equal(messageElement.style.backgroundColor, 'rgb(250, 250, 250)');
  assert.equal(messageElement.style.boxShadow, '0 1px 2px rgba(0, 0, 0, 0.1)');
  assert.equal(messageElement.style.borderRadius, '3px');
});

test('preserves the host text cursor instead of showing an ambiguous help cursor', () => {
  clearTooltipSystem();
  const handlers = {};
  const messageElement = {
    textContent: 'Keep the normal text cursor.',
    style: {
      cursor: 'text',
      transition: 'color 100ms ease',
      backgroundColor: '',
      borderRadius: ''
    },
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener(type, handler) { handlers[type] = handler; },
    removeEventListener(type) { delete handlers[type]; }
  };
  const article = {
    getAttribute: (name) => name === 'data-turn' ? 'assistant' : null,
    querySelector: (selector) => selector.startsWith('.markdown') ? messageElement : null
  };

  globalThis.window = {
    location: { hostname: 'chatgpt.com' },
    innerWidth: 1024,
    innerHeight: 768
  };
  globalThis.document = {
    body: {},
    documentElement: { clientWidth: 1024, clientHeight: 768 },
    getElementById: () => null,
    querySelectorAll: (selector) =>
      selector === '[data-testid^="conversation-turn"]' ? [article] : []
  };

  setEvaluationData(
    { utteranceScores: [{ metrics: {} }] },
    [{ id: 'chatgpt-ai-0', role: 'Chatbot', content: 'Keep the normal text cursor.' }]
  );

  assert.equal(messageElement.style.cursor, 'text');
  assert.match(messageElement.style.transition, /background-color 150ms ease/);
  assert.equal(typeof handlers.mouseenter, 'function');

  clearTooltipSystem();
  assert.equal(messageElement.style.cursor, 'text');
  assert.equal(messageElement.style.transition, 'color 100ms ease');
});

// The message itself is now the affordance: clicking an evaluated turn pins
// it and opens Turn evidence in the sidebar; clicking again unpins. Clicks
// that express other intents (links, modified clicks, text selection) must
// pass through untouched.
test('clicking an evaluated message toggles the pin and notifies the sidebar', () => {
  clearTooltipSystem();
  const handlers = {};
  const pinEvents = [];
  const messageElement = {
    textContent: 'Reflect the client perspective.',
    isConnected: true,
    style: { cursor: 'text', transition: '', backgroundColor: '', borderRadius: '' },
    getBoundingClientRect: () => ({ top: 120, bottom: 180, left: 120, right: 620, width: 500, height: 60 }),
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener(type, handler) { handlers[type] = handler; },
    removeEventListener(type) { delete handlers[type]; }
  };
  const article = {
    getAttribute: (name) => name === 'data-turn' ? 'assistant' : null,
    querySelector: (selector) => selector.startsWith('.markdown') ? messageElement : null
  };

  globalThis.window = {
    location: { hostname: 'chatgpt.com' },
    innerWidth: 1024,
    innerHeight: 768,
    getSelection: () => ({ isCollapsed: true }),
    addEventListener() {},
    removeEventListener() {}
  };
  globalThis.document = {
    body: { appendChild() {} },
    documentElement: { clientWidth: 1024, clientHeight: 768 },
    createElement: () => ({ style: {}, setAttribute() {}, remove() {} }),
    getElementById: () => null,
    querySelectorAll: (selector) =>
      selector === '[data-testid^="conversation-turn"]' ? [article] : []
  };

  initTooltipSystem({ onPinnedMessageChange: (id) => pinEvents.push(id) });
  setEvaluationData(
    { utteranceScores: [{ metrics: { empathy: { type: 'numerical', value: 4, max_value: 5 } } }] },
    [{ id: 'chatgpt-ai-0', role: 'Chatbot', content: 'Reflect the client perspective.' }],
    { empathy: { id: 'empathy', label: 'Empathy' } }
  );

  const plainClick = {
    defaultPrevented: false,
    button: 0,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    target: { closest: () => null }
  };

  handlers.click(plainClick);
  assert.deepEqual(pinEvents, ['chatgpt-ai-0']);
  assert.equal(messageElement.style.backgroundColor, 'rgba(47, 110, 211, 0.055)');

  // A second plain click unpins and restores the host styling.
  handlers.click(plainClick);
  assert.deepEqual(pinEvents, ['chatgpt-ai-0', null]);
  assert.equal(messageElement.style.backgroundColor, '');

  // Clicks on interactive descendants pass through to the host page.
  handlers.click({ ...plainClick, target: { closest: (sel) => sel.includes('a') ? {} : null } });
  // Modified clicks (open link in new tab, etc.) pass through.
  handlers.click({ ...plainClick, metaKey: true });
  handlers.click({ ...plainClick, button: 1 });
  // A mouseup that finishes a text selection is not an open intent.
  globalThis.window.getSelection = () => ({ isCollapsed: false });
  handlers.click(plainClick);
  assert.deepEqual(pinEvents, ['chatgpt-ai-0', null]);

  clearTooltipSystem();
  initTooltipSystem({});
});
