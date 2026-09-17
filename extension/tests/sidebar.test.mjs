import assert from 'node:assert/strict';
import test from 'node:test';

const importSidebar = () =>
  import(`../src/utils/sidebar.js?test=${Date.now()}-${Math.random()}`);

const createElement = (tagName, elementsById) => {
  const listeners = new Map();
  const attributes = new Map();
  const element = {
    tagName: tagName.toUpperCase(),
    style: {},
    dataset: {},
    children: [],
    parentNode: null,
    tabIndex: 0,
    inert: false,
    _id: '',
    get id() {
      return this._id;
    },
    set id(value) {
      if (this._id) elementsById.delete(this._id);
      this._id = value;
      if (value) elementsById.set(value, this);
    },
    setAttribute(name, value) {
      attributes.set(name, String(value));
    },
    getAttribute(name) {
      return attributes.get(name) ?? null;
    },
    addEventListener(name, handler) {
      listeners.set(name, handler);
    },
    removeEventListener(name) {
      listeners.delete(name);
    },
    remove() {
      if (this.id) elementsById.delete(this.id);
      if (this.parentNode) {
        this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
      }
      this.parentNode = null;
    },
    emit(name, event = {}) {
      listeners.get(name)?.(event);
    }
  };
  return element;
};

const installDom = ({ viewportWidth = 390, savedWidth = 800 } = {}) => {
  const elementsById = new Map();
  const windowListeners = new Map();
  const documentListeners = new Map();
  const dispatchedEvents = [];
  const body = createElement('body', elementsById);
  body.style.marginRight = '17px';
  body.style.transition = 'opacity 1s';
  body.style.cursor = 'crosshair';
  body.style.userSelect = 'text';
  body.appendChild = (element) => {
    element.parentNode = body;
    body.children.push(element);
  };
  body.removeChild = (element) => {
    body.children = body.children.filter((child) => child !== element);
    element.parentNode = null;
  };

  globalThis.document = {
    body,
    activeElement: null,
    createElement: (tagName) => createElement(tagName, elementsById),
    getElementById: (id) => elementsById.get(id) ?? null,
    addEventListener: (name, handler) => documentListeners.set(name, handler),
    removeEventListener: (name) => documentListeners.delete(name)
  };
  globalThis.window = {
    innerWidth: viewportWidth,
    addEventListener: (name, handler) => windowListeners.set(name, handler),
    dispatchEvent: (event) => {
      dispatchedEvents.push(event.type);
      windowListeners.get(event.type)?.(event);
      return true;
    }
  };
  globalThis.CustomEvent = class CustomEvent {
    constructor(type) { this.type = type; }
  };
  globalThis.localStorage = {
    getItem: () => null,
    removeItem() {}
  };
  globalThis.chrome = {
    runtime: {
      lastError: null,
      getURL: (path) => `chrome-extension://test/${path}`
    },
    storage: {
      local: {
        get: (_key, callback) => callback({ sidebarWidth: savedWidth }),
        set() {}
      }
    }
  };

  return { body, dispatchedEvents, documentListeners, elementsById, windowListeners };
};

test('keeps a score rail when clamping a persisted width to a 390px viewport', async () => {
  const { elementsById } = installDom({ viewportWidth: 390, savedWidth: 800 });
  const { createSidebar } = await importSidebar();

  createSidebar();

  const iframe = elementsById.get('counselreflect-sidebar');
  const handle = elementsById.get('sidebar-resize-handle');
  assert.equal(iframe.style.width, '342px');
  assert.equal(handle.style.right, '342px');
  assert.equal(handle.getAttribute('aria-valuemax'), '342');
  assert.equal(handle.getAttribute('aria-valuenow'), '342');
  assert.equal(handle.getAttribute('aria-valuetext'), 'Sidebar 342 pixels; 48 pixels remain for page scores');
});

test('restores host body styles and removes hidden sidebar from focus order', async () => {
  const { body, elementsById } = installDom({ viewportWidth: 360, savedWidth: 700 });
  const { toggleSidebar } = await importSidebar();

  toggleSidebar();
  const iframe = elementsById.get('counselreflect-sidebar');
  assert.equal(body.style.marginRight, '312px');
  assert.equal(body.style.transition, 'margin-right 0.3s ease-in-out');
  assert.equal(iframe.getAttribute('aria-hidden'), 'false');
  assert.equal(iframe.inert, false);
  assert.equal(iframe.tabIndex, 0);

  toggleSidebar();
  assert.equal(body.style.marginRight, '17px');
  assert.equal(body.style.transition, 'opacity 1s');
  assert.equal(iframe.getAttribute('aria-hidden'), 'true');
  assert.equal(iframe.inert, true);
  assert.equal(iframe.tabIndex, -1);
});

test('reclamps the sidebar when the browser window narrows', async () => {
  const { elementsById, windowListeners } = installDom({ viewportWidth: 800, savedWidth: 700 });
  const { createSidebar } = await importSidebar();

  createSidebar();
  globalThis.window.innerWidth = 360;
  windowListeners.get('resize')();

  const iframe = elementsById.get('counselreflect-sidebar');
  assert.equal(iframe.style.width, '312px');
});

test('mouse and keyboard resize cannot consume the 48px score rail', async () => {
  const { body, documentListeners, elementsById } = installDom({
    viewportWidth: 800,
    savedWidth: 800
  });
  const { toggleSidebar } = await importSidebar();

  toggleSidebar();
  const iframe = elementsById.get('counselreflect-sidebar');
  const handle = elementsById.get('sidebar-resize-handle');
  assert.equal(iframe.style.width, '752px');

  handle.emit('keydown', {
    key: 'ArrowLeft',
    preventDefault() {},
    stopPropagation() {}
  });
  assert.equal(iframe.style.width, '752px');

  handle.emit('mousedown', {
    preventDefault() {},
    stopPropagation() {}
  });
  documentListeners.get('mousemove')({ clientX: 0 });
  documentListeners.get('mouseup')();
  assert.equal(iframe.style.width, '752px');
  assert.equal(body.style.marginRight, '752px');
  assert.equal(handle.getAttribute('aria-valuemax'), '752');
});

test('restores host cursor and selection styles after mouse resize', async () => {
  const { body, documentListeners, elementsById } = installDom({
    viewportWidth: 390,
    savedWidth: 360
  });
  const { toggleSidebar } = await importSidebar();

  toggleSidebar();
  const handle = elementsById.get('sidebar-resize-handle');
  handle.emit('mousedown', {
    preventDefault() {},
    stopPropagation() {}
  });
  assert.equal(body.style.cursor, 'ew-resize');
  assert.equal(body.style.userSelect, 'none');

  documentListeners.get('mouseup')();
  assert.equal(body.style.cursor, 'crosshair');
  assert.equal(body.style.userSelect, 'text');
});

test('fits narrow viewports while preserving the minimum score rail', async () => {
  const { elementsById } = installDom({ viewportWidth: 280, savedWidth: 700 });
  const { createSidebar } = await importSidebar();

  createSidebar();

  const iframe = elementsById.get('counselreflect-sidebar');
  const handle = elementsById.get('sidebar-resize-handle');
  assert.equal(iframe.style.width, '232px');
  assert.equal(handle.getAttribute('aria-valuemin'), '232');
  assert.equal(handle.getAttribute('aria-valuemax'), '232');
});

test('notifies score overlays after the sidebar opening transition settles', async () => {
  const { dispatchedEvents, elementsById } = installDom({ viewportWidth: 1000, savedWidth: 400 });
  const { createSidebar } = await importSidebar();

  createSidebar();
  const iframe = elementsById.get('counselreflect-sidebar');
  const beforeTransition = dispatchedEvents.filter(
    (type) => type === 'counselreflect:sidebar-layout'
  ).length;

  iframe.emit('transitionend', { propertyName: 'opacity' });
  assert.equal(
    dispatchedEvents.filter((type) => type === 'counselreflect:sidebar-layout').length,
    beforeTransition
  );

  iframe.emit('transitionend', { propertyName: 'transform' });
  assert.equal(
    dispatchedEvents.filter((type) => type === 'counselreflect:sidebar-layout').length,
    beforeTransition + 1
  );
});
