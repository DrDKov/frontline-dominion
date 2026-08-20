import assert from 'node:assert/strict';

const storage = new Map();

class MockGame {
  constructor() {
    this.time = 10;
    this.simTick = 250;
    this.teams = { enemy: { faction: 'dominion', upgrades: new Set() } };
    this.buildings = [];
    this.visiblePoints = new Set();
    this.exploredPoints = new Set();
    this.nextSnapshot = { units: [], buildings: [], clusters94: [] };
  }
  pointKey(x, y) { return `${Math.round(x)},${Math.round(y)}`; }
  isVisibleAt(x, y) { return this.visiblePoints.has(this.pointKey(x, y)); }
  isExploredAt(x, y) { return this.exploredPoints.has(this.pointKey(x, y)) || this.isVisibleAt(x, y); }
  isTargetableBy() { return true; }
  isOnScreen() { return true; }
  updateVisibilityV9() { return true; }
  buildRenderSnapshotV9() { return this.nextSnapshot; }
  renderMinimap() {}
  hydrate(data) { this.hydrated = data; return true; }
  save() {
    storage.set('fd-save', JSON.stringify({ version: 5, entities: [], explored: [] }));
    return true;
  }
}

globalThis.__FD_DEBUG__ = {
  Game: MockGame,
  WORLD: { width: 32000, height: 22000 },
  BUILDING_TYPES: {
    hq: { name: 'Command center', radius: 90, hp: 5000 },
    barracks: { name: 'Barracks', radius: 62, hp: 1800 },
  },
  getBuildingStats(typeId) { return this.BUILDING_TYPES[typeId]; },
  SAVE_KEY: 'fd-save',
  storageGet(key) { return storage.get(key) ?? null; },
  storageSet(key, value) { storage.set(key, value); },
};

await import('../src/v203/recon-memory-production-v203.js');

const api = globalThis.__FD_RECON_MEMORY_QUEUE_203__;
assert.equal(api?.build, 203);
assert.equal(api.queueLimit, 10);

const game = new MockGame();
const seenBuilding = {
  id: 'e900', kind: 'building', typeId: 'hq', team: 'enemy', alive: true,
  x: 100, y: 200, rotation: 1.2, weaponRotation: 1.3, desiredWeaponRotation: 1.4,
  radius: 90, construction: 1, completed: true, hp: 4200, maxHp: 5000,
};
game.buildings.push(seenBuilding);
game.visiblePoints.add('100,200');
game.exploredPoints.add('100,200');
game.updateVisibilityV9();

let memory = api.ensureMemory(game);
assert.equal(memory.size, 1);
assert.equal(memory.get('e900').x, 100);
assert.equal(memory.get('e900').hp, 4200);

// Once the shroud closes, the photograph must not follow authoritative moves
// and a hostile unit at the same hidden location must not be rendered.
game.visiblePoints.clear();
seenBuilding.x = 560;
seenBuilding.y = 640;
const hiddenEnemyUnit = { id: 'e901', kind: 'unit', team: 'enemy', alive: true, x: 560, y: 640 };
const friendlyUnit = { id: 'e2', kind: 'unit', team: 'player', alive: true, x: 80, y: 90 };
game.nextSnapshot = { units: [hiddenEnemyUnit, friendlyUnit], buildings: [], clusters94: [] };
const shrouded = game.buildRenderSnapshotV9(1);
const ghost = shrouded.buildings.find(item => item._fdReconGhost203);
assert.ok(ghost, 'remembered building was not rendered under explored fog');
assert.equal(ghost.x, 100);
assert.equal(ghost.y, 200);
assert.deepEqual(shrouded.units.map(unit => unit.id), ['e2']);

// A new hostile building behind fog is not intelligence and must stay absent.
const hiddenNewBuilding = {
  id: 'e902', kind: 'building', typeId: 'barracks', team: 'enemy', alive: true,
  x: 700, y: 800, radius: 62, construction: 1, completed: true, hp: 1800, maxHp: 1800,
};
game.buildings.push(hiddenNewBuilding);
api.syncMemory(game);
assert.equal(memory.has('e902'), false);

// Destruction behind fog leaves the old photograph. It is invalidated only
// after the photographed point is observed again and found empty.
game.buildings = [hiddenNewBuilding];
api.syncMemory(game);
assert.equal(memory.has('e900'), true);
game.visiblePoints.add('100,200');
api.syncMemory(game);
assert.equal(memory.has('e900'), false);

// The previously hidden new structure becomes known only on actual reveal.
game.visiblePoints.clear();
game.visiblePoints.add('700,800');
game.exploredPoints.add('700,800');
api.syncMemory(game);
assert.equal(memory.has('e902'), true);
assert.equal(memory.get('e902').x, 700);

game.visiblePoints.clear();
assert.equal(game.save(false), true);
const saved = JSON.parse(storage.get('fd-save'));
assert.equal(saved.reconBuildingMemory203.length, 1);
assert.equal(saved.reconBuildingMemory203[0].id, 'e902');

const restored = new MockGame();
restored.hydrate(saved);
assert.equal(api.ensureMemory(restored).size, 1);
assert.equal(api.ensureMemory(restored).get('e902').x, 700);

const queue = Array.from({ length: 8 }, (_, index) => ({
  kind: 'unit', id: `unit-${index}`, remaining: 20 - index, total: 20, cost: 400 + index,
}));
const producer = { queue, rallyPoint: { x: 10, y: 20 }, completed: true, team: 'player', powered: true };
const signature8 = api.queueSignature(producer);
queue.push({ kind: 'unit', id: 'unit-8', remaining: 19, total: 20, cost: 408 });
const signature9 = api.queueSignature(producer);
queue.push({ kind: 'unit', id: 'unit-9', remaining: 18, total: 20, cost: 409 });
const signature10 = api.queueSignature(producer);
queue[8].remaining = 12.4;
const progressed9 = api.queueSignature(producer);

assert.notEqual(signature8, signature9, 'ninth slot was invisible to queue signature');
assert.notEqual(signature9, signature10, 'tenth slot was invisible to queue signature');
assert.notEqual(signature10, progressed9, 'progress outside the old eight-slot window was invisible');

console.log(JSON.stringify({
  ok: true,
  memory: api.serializeMemory(restored),
  queueLengths: [8, 9, 10],
  diagnostics: api.diagnostics(),
}));
