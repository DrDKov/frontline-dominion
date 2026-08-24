'use strict';

/*
 * Frontline Dominion v16.2 — headless browser compatibility layer.
 * The authoritative simulation executes the real game classes inside a
 * Dedicated Worker. Only DOM, canvas and audio surfaces are inert; no
 * simulation method is replaced here.
 */
self.window = self;
self.globalThis = self;
try { Object.defineProperty(self.navigator, 'maxTouchPoints', { value: 0, configurable: true }); } catch (_) {}
self.matchMedia = self.matchMedia || (() => ({
  matches: false,
  addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}
}));
self.requestAnimationFrame = () => 1;
self.cancelAnimationFrame = () => {};
self.alert = () => {};
self.confirm = () => true;
self.prompt = () => null;
self.innerWidth = 1280;
self.innerHeight = 720;
self.devicePixelRatio = 1;
self.addEventListener = () => {};
self.removeEventListener = () => {};
self.dispatchEvent = () => true;

class FD171DummyClassList {
  add() {}
  remove() {}
  toggle(_name, force) { return force ?? false; }
  contains() { return false; }
}

class FD171DummyContext2D {
  constructor() {
    this.canvas = { width: 1280, height: 720, clientWidth: 1280, clientHeight: 720 };
    this.globalAlpha = 1;
    this.globalCompositeOperation = 'source-over';
    this.lineWidth = 1;
    this.font = '10px sans-serif';
    this.textAlign = 'start';
    this.textBaseline = 'alphabetic';
  }
  save() {} restore() {} setTransform() {} resetTransform() {} translate() {} rotate() {} scale() {} transform() {}
  clearRect() {} fillRect() {} strokeRect() {} beginPath() {} closePath() {} moveTo() {} lineTo() {} arc() {} ellipse() {}
  rect() {} quadraticCurveTo() {} bezierCurveTo() {} fill() {} stroke() {} clip() {} drawImage() {} fillText() {} strokeText() {}
  setLineDash() {} getLineDash() { return []; }
  createPattern() { return null; }
  createLinearGradient() { return { addColorStop() {} }; }
  createRadialGradient() { return { addColorStop() {} }; }
  measureText(text) { return { width: String(text || '').length * 7 }; }
  isPointInPath() { return false; }
  isPointInStroke() { return false; }
  putImageData() {}
  getImageData() { return { data: new Uint8ClampedArray(4), width: 1, height: 1 }; }
}

self.CanvasRenderingContext2D = FD171DummyContext2D;
class FD171DummyBitmapContext { transferFromImageBitmap() {} }
const fd171DummyContext = new FD171DummyContext2D();

function fd171MakeDummyElement(tag = 'div') {
  const lowerTag = String(tag).toLowerCase();
  const base = {
    tagName: lowerTag.toUpperCase(),
    id: '', dataset: {}, style: {}, classList: new FD171DummyClassList(),
    children: [], childNodes: [], parentNode: null,
    parentElement: { style: {}, classList: new FD171DummyClassList(), setAttribute() {}, removeAttribute() {} },
    width: lowerTag === 'canvas' ? 1280 : 0,
    height: lowerTag === 'canvas' ? 720 : 0,
    clientWidth: 1280, clientHeight: 720, offsetLeft: 0, offsetTop: 0,
    value: '', textContent: '', innerHTML: '', disabled: false, hidden: false, checked: false,
    appendChild(child) { if (child) { this.children.push(child); child.parentNode = this; } return child; },
    prepend(child) { return this.appendChild(child); },
    append(...items) { for (const item of items) this.appendChild(item); },
    removeChild(child) { const index = this.children.indexOf(child); if (index >= 0) this.children.splice(index, 1); },
    replaceChildren(...items) { this.children.length = 0; for (const item of items) this.appendChild(item); },
    remove() {}, insertAdjacentHTML() {}, setAttribute() {}, getAttribute() { return null; },
    removeAttribute() {}, hasAttribute() { return false; },
    addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; }, click() {}, focus() {}, blur() {},
    querySelector() { return fd171MakeDummyElement('div'); }, querySelectorAll() { return []; }, closest() { return null; }, matches() { return false; },
    getContext(type) { return type === 'bitmaprenderer' ? new FD171DummyBitmapContext() : fd171DummyContext; },
    getBoundingClientRect() { return { left: 0, top: 0, right: 1280, bottom: 720, width: 1280, height: 720, x: 0, y: 0 }; },
    setPointerCapture() {}, releasePointerCapture() {},
    transferControlToOffscreen() { return new OffscreenCanvas(this.width || 1, this.height || 1); }
  };
  return new Proxy(base, {
    get(target, property) {
      if (property in target) return target[property];
      if (property === Symbol.iterator) return function* iterator() {};
      if (String(property).startsWith('on')) return null;
      const fn = () => {};
      target[property] = fn;
      return fn;
    },
    set(target, property, value) { target[property] = value; return true; }
  });
}

const fd171ElementCache = new Map();
function fd171GetElement(key = 'div') {
  if (!fd171ElementCache.has(key)) {
    const isCanvas = String(key).includes('canvas') || String(key).includes('minimap');
    fd171ElementCache.set(key, fd171MakeDummyElement(isCanvas ? 'canvas' : 'div'));
  }
  return fd171ElementCache.get(key);
}

self.document = {
  documentElement: fd171GetElement('documentElement'),
  body: fd171GetElement('body'),
  head: fd171GetElement('head'),
  title: 'Frontline Dominion — Authoritative Worker',
  fullscreenElement: null,
  webkitFullscreenElement: null,
  querySelector(selector) { return fd171GetElement(String(selector)); },
  querySelectorAll() { return []; },
  getElementById(id) { return fd171GetElement(`#${id}`); },
  createElement(tag) { return fd171MakeDummyElement(tag); },
  createTextNode(text) { return { textContent: String(text), remove() {} }; },
  addEventListener() {}, removeEventListener() {},
  exitFullscreen() { return Promise.resolve(); }, webkitExitFullscreen() { return Promise.resolve(); }
};

self.HTMLElement = class {};
self.HTMLCanvasElement = class {};
self.HTMLInputElement = class {};
self.HTMLTextAreaElement = class {};
self.HTMLSelectElement = class {};
self.Image = class {
  constructor() {
    this.width = 1; this.height = 1; this.complete = true;
    this.naturalWidth = 1; this.naturalHeight = 1; this.decoding = 'async';
  }
  addEventListener(type, handler) { if (type === 'load' && typeof handler === 'function') queueMicrotask(handler); }
  removeEventListener() {}
  set src(value) { this._src = value; }
  get src() { return this._src || ''; }
};
self.ImageBitmap = class { close() {} };
self.OffscreenCanvas = self.OffscreenCanvas || class {
  constructor(width, height) { this.width = width; this.height = height; }
  getContext() { return new FD171DummyContext2D(); }
  transferToImageBitmap() { return new ImageBitmap(); }
};
self.CustomEvent = self.CustomEvent || class {
  constructor(type, init = {}) { this.type = type; this.detail = init.detail; }
};

const fd171Storage = new Map();
self.localStorage = {
  getItem(key) { return fd171Storage.get(key) ?? null; },
  setItem(key, value) { fd171Storage.set(key, String(value)); },
  removeItem(key) { fd171Storage.delete(key); },
  clear() { fd171Storage.clear(); }
};

// Legacy render modules may try to spawn nested workers. They are deliberately
// disabled in the simulation process; no gameplay code depends on them.
self.Worker = class FD171NestedWorkerDisabled {
  constructor() { this.onmessage = null; this.onerror = null; }
  addEventListener() {} removeEventListener() {} postMessage() {} terminate() {}
};
self.AudioContext = undefined;
self.webkitAudioContext = undefined;
