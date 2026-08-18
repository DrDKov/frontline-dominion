import fs from 'node:fs';
import vm from 'node:vm';

const ctx = {
  save() {}, restore() {}, setTransform() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {},
  set globalAlpha(value) { this._alpha = value; },
  set strokeStyle(value) { this._stroke = value; },
  set lineWidth(value) { this._width = value; },
  set lineJoin(value) {}, set lineCap(value) {},
};
const canvas = { width: 1280, height: 800, clientWidth: 1280, getContext: () => ctx };
globalThis.document = {
  getElementById(id) { return id === 'game-canvas' ? canvas : null; },
};

class Game {
  constructor() {
    this.buildings = [{ id: 'b1', kind: 'building', alive: true, selected: false, team: 'player', x: 100, y: 100, radius: 30, visualScale: 1, scale: 1 }];
    this.units = [];
    this.selected = [];
    this.canvas = canvas;
    this.ctx = ctx;
    this.draws = 0;
  }
  getEntity(id) { return this.buildings.find(building => building.id === id) || null; }
  setSelection(items) {
    this.selected = [...items];
    for (const building of this.buildings) building.selected = false;
    for (const entity of this.selected) {
      entity.selected = true;
      if (entity.kind === 'building') {
        entity.scale *= 1.6;
        entity.visualScale *= 1.35;
        entity.radius += 9;
      }
    }
    return this.selected;
  }
  selectAt() { return this.setSelection([this.buildings[0]]); }
  clearSelection() { this.selected = []; return true; }
  drawBuilding3D(building) {
    if (building.selected) building.scale *= 1.2;
    this.draws += 1;
  }
  render() { for (const building of this.buildings) this.drawBuilding3D(building); }
  getBuildingFigureScreenBounds193() { return { x1: 50, y1: 40, x2: 150, y2: 140, width: 100, height: 100 }; }
  teamColor() { return '#54f0a2'; }
  isOnScreen() { return true; }
}

globalThis.__FD_DEBUG__ = { Game };
globalThis.__FD_BUILDING_SELECTION_OWNER_196__ = { enforce() {} };
globalThis.__FD_BUILDING_SELECTION_193__ = { drawBuildingSelection() { throw new Error('legacy overlay must be suppressed'); } };
const source = fs.readFileSync(new URL('../src/v197/building-selection-invariance-v197.js', import.meta.url), 'utf8');
vm.runInThisContext(source, { filename: 'building-selection-invariance-v197.js' });

const game = new Game();
globalThis.__FD_DEBUG__.game = game;
const building = game.buildings[0];
const baseline = { radius: building.radius, visualScale: building.visualScale, scale: building.scale };
game.setSelection([building], false);
game.render();

const after = { radius: building.radius, visualScale: building.visualScale, scale: building.scale };
const api = globalThis.__FD_BUILDING_SELECTION_INVARIANCE_197__;
if (!api || api.build !== 197) throw new Error('v197 building API unavailable');
if (JSON.stringify(after) !== JSON.stringify(baseline)) {
  throw new Error(`selection changed geometry: ${JSON.stringify({ baseline, after, state: api.state })}`);
}
if (building.selected !== false) throw new Error('building.selected visual flag remained true');
if (!game.selected.includes(building)) throw new Error('authoritative selection was lost');
if (game.draws !== 1) throw new Error(`building model draw count changed: ${game.draws}`);
if (api.state.bracketOverlays < 1) throw new Error(`2D bracket overlay missing: ${JSON.stringify(api.state)}`);
if (api.state.selectionMutationsReverted < 1) throw new Error(`selection mutation was not detected: ${JSON.stringify(api.state)}`);

console.log(JSON.stringify({ ok: true, baseline, after, state: api.state }));
