'use strict';
const fs = require('fs');
const vm = require('vm');

class FakeElement {
  constructor(tag = 'div') {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.dataset = {};
    this.className = '';
    this.textContent = '';
    this.innerHTML = '';
    this.disabled = false;
    this.listeners = {};
    this.title = '';
    this.classList = { add() {}, remove() {} };
  }
  appendChild(node) { node.parentNode = this; this.children.push(node); return node; }
  remove() {
    if (!this.parentNode) return;
    this.parentNode.children = this.parentNode.children.filter(child => child !== this);
    this.parentNode = null;
  }
  addEventListener(type, handler) { this.listeners[type] = handler; }
  click() { this.listeners.click?.({ currentTarget: this }); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  querySelectorAll(selector) {
    if (selector === '[data-command-minefield141]') return this.children.filter(node => node.dataset.commandMinefield141 != null);
    if (selector === '[data-minefield-defense181]') return this.children.filter(node => node.dataset.minefieldDefense181 != null);
    return [];
  }
}

let now = 0;
let baseMinimapCalls = 0;
let baseResizeCalls = 0;
const minimapContext = {
  globalAlpha: 1,
  globalCompositeOperation: 'source-over',
  lineWidth: 1,
  setTransform() {},
  setLineDash() {},
  save() {},
  restore() {},
  drawImage() {},
};
const minimap = new FakeElement('canvas');
minimap.width = 240;
minimap.height = 160;
minimap.getContext = () => minimapContext;

const commandButtons = new FakeElement();
const actionButtons = new FakeElement();
const actionTitle = new FakeElement();
actionTitle.textContent = 'Строительство · Оборона';
const actionPanel = new FakeElement();
const defenseTab = new FakeElement('button');

const documentStub = {
  documentElement: { dataset: {} },
  createElement(tag) {
    const element = new FakeElement(tag);
    if (tag === 'canvas') {
      element.width = 0;
      element.height = 0;
      element.getContext = () => ({ ...minimapContext });
    }
    return element;
  },
  getElementById(id) {
    return {
      minimap,
      'command-buttons': commandButtons,
      'action-buttons': actionButtons,
      'action-title': actionTitle,
      'action-panel': actionPanel,
    }[id] || null;
  },
  querySelector(selector) {
    if (selector === '[data-category-id="defense"]') return defenseTab;
    return null;
  },
};

global.document = documentStub;
global.window = global;
global.performance = { now: () => now };

class Game {
  constructor() {
    this.units = [];
    this.camera = { x: 1000, y: 1000, zoom: 1 };
    this.viewport = { width: 1200, height: 800 };
    this.teams = { player: { powerFactor: 1 } };
    this.buildCategory = 'defense';
    this.time = 20;
    this.selected = [];
    this.sound = { click() {} };
    this.minefieldCommands = 0;
  }
  renderMinimap() { baseMinimapCalls += 1; }
  resize() { baseResizeCalls += 1; }
  renderUnitCommandButtons() {
    const old = new FakeElement('button');
    old.dataset.commandMinefield141 = 'true';
    commandButtons.appendChild(old);
  }
  renderActionUI() {}
  getSelectedUnits() { return this.selected; }
  setMinefieldCommandMode141() { this.minefieldCommands += 1; return true; }
}

global.__FD_DEBUG__ = { Game, game: null };

vm.runInThisContext(fs.readFileSync('dist/minimap-atomic-v181.js', 'utf8'));
const minimapGame = new Game();
global.__FD_DEBUG__.game = minimapGame;
minimapGame.renderMinimap();
for (let index = 0; index < 20; index += 1) minimapGame.renderMinimap();
if (baseMinimapCalls !== 1) throw new Error(`minimap intermediate calls leaked: ${baseMinimapCalls}`);
now = 121;
minimapGame.renderMinimap();
if (baseMinimapCalls !== 2) throw new Error(`minimap due frame missing: ${baseMinimapCalls}`);
minimapGame.resize();
minimapGame.renderMinimap();
if (baseResizeCalls !== 1 || baseMinimapCalls !== 3) throw new Error('resize did not force one complete minimap frame');

vm.runInThisContext(fs.readFileSync('dist/minefield-defense-catalog-v181.js', 'utf8'));
const mineGame = new Game();
const engineer = {
  alive: true,
  kind: 'unit',
  team: 'player',
  typeId: 'worker',
  stats: { engineering: true, name: 'Инженер' },
  engineerMineReadyAt141: 0,
};
mineGame.selected = [engineer];
global.__FD_DEBUG__.game = mineGame;
mineGame.renderUnitCommandButtons([engineer]);
if (commandButtons.querySelector('[data-command-minefield141]')) throw new Error('legacy engineer command button still visible');
mineGame.renderActionUI(true);
const card = actionButtons.querySelector('[data-minefield-defense181]');
if (!card) throw new Error('minefield defense catalog card missing');
if (card.disabled) throw new Error('ready minefield card unexpectedly disabled');
card.click();
if (mineGame.minefieldCommands !== 1) throw new Error('defense catalog card did not activate placement');
mineGame.buildCategory = 'economy';
actionTitle.textContent = 'Строительство · Экономика';
mineGame.renderActionUI(true);
if (actionButtons.querySelector('[data-minefield-defense181]')) throw new Error('minefield card leaked outside defense category');

console.log(JSON.stringify({ ok: true, baseMinimapCalls, minefieldCommands: mineGame.minefieldCommands }));
