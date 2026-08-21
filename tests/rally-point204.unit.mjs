import assert from 'node:assert/strict';

const canvas = {
  width: 1200,
  height: 800,
  clientWidth: 600,
  getContext() { return context; },
  getBoundingClientRect() {
    return { left: 10, top: 20, width: 600, height: 400 };
  },
};

const context = {
  save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {},
  fill() {}, closePath() {}, arc() {},
};

globalThis.document = {
  getElementById(id) { return id === 'game-canvas' ? canvas : null; },
};

let baseRoutes = 0;
globalThis.__FD_COMMAND_INPUT_190__ = {
  route() {
    baseRoutes += 1;
    return true;
  },
};

class MockGame {
  constructor() {
    this.selected = [];
    this.buildings = [];
    this.ended = false;
    this.commandMode = null;
    this.rallyCalls = [];
    this.baseFlagDraws = 0;
  }
  getSelectedUnits() { return this.selected.filter(entity => entity.kind === 'unit'); }
  screenToWorld(x, y) { return { x: x + 5, y: y + 7 }; }
  setRallyPoint91(buildingId, x, y) {
    this.rallyCalls.push({ buildingId, x, y });
    const building = this.selected.find(entity => entity.id === buildingId);
    if (building) building.rallyPoint = { x, y };
    return Boolean(building);
  }
  drawRallyFlags80() {
    this.baseFlagDraws += 1;
  }
  render() {
    this.drawRallyFlags80();
    return 'rendered';
  }
  worldToScreen(x, y, z = 0) { return { x, y: y - z }; }
}

const game = new MockGame();
globalThis.__FD_DEBUG__ = { Game: MockGame, game };

await import('../src/v204/rally-point-authority-v204.js');

const api = globalThis.__FD_RALLY_POINT_AUTHORITY_204__;
assert.equal(api?.build, 204);
assert.equal(api.diagnostics().installed, true);

const barracks = {
  id: 'barracks-1',
  kind: 'building',
  team: 'player',
  alive: true,
  completed: true,
  selected: true,
  stats: { produces: ['rifleSquad'] },
  rallyPoint: { x: 1, y: 2 },
};
game.selected = [barracks];
game.buildings = [barracks];

assert.equal(globalThis.__FD_COMMAND_INPUT_190__.route(310, 220, 'authority197-pointer-right', false), true);
assert.equal(baseRoutes, 0, 'production-building right click leaked into the unit route');
assert.deepEqual(game.rallyCalls, [{ buildingId: 'barracks-1', x: 605, y: 407 }]);
assert.equal(game.selected[0], barracks, 'rally placement cleared the selected building');

assert.equal(game.render(), 'rendered');
assert.equal(game.baseFlagDraws, 0, 'legacy selected-flag renderer was not suppressed');
assert.deepEqual(api.diagnostics().lastFlagPoint, { buildingId: 'barracks-1', x: 605, y: 407 });
assert.equal(api.diagnostics().legacyFlagPassesSuppressed, 1);

game.commandMode = 'power:scan';
assert.equal(globalThis.__FD_COMMAND_INPUT_190__.route(320, 230, 'authority197-pointer-right', false), true);
assert.equal(baseRoutes, 1, 'right click no longer delegated target-mode cancellation');
assert.equal(game.rallyCalls.length, 1);

game.commandMode = null;
const unit = { id: 'u1', kind: 'unit', team: 'player', alive: true };
game.selected = [unit];
assert.equal(globalThis.__FD_COMMAND_INPUT_190__.route(330, 240, 'authority197-pointer-right', false), true);
assert.equal(baseRoutes, 2, 'unit right click no longer delegated to context movement');

game.selected = [{ ...barracks, id: 'unfinished', completed: false }];
assert.equal(globalThis.__FD_COMMAND_INPUT_190__.route(340, 250, 'authority197-pointer-right', false), true);
assert.equal(baseRoutes, 3, 'unfinished building incorrectly received a rally point');

const diagnostics = api.diagnostics();
assert.equal(diagnostics.rallyRoutes, 1);
assert.equal(diagnostics.lastBuildingId, 'barracks-1');
assert.equal(diagnostics.lastSource, 'authority197-pointer-right');
assert.deepEqual(diagnostics.lastWorld, { x: 605, y: 407 });

console.log(JSON.stringify({ ok: true, diagnostics }));
