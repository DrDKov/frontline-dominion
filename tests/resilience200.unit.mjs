import assert from 'node:assert/strict';

class MockGame {
  hydrate(data) {
    this.hydrated = data;
    return data;
  }

  executePower(type, x, y) {
    this.abilityZones ||= [];
    this.abilityZones.push({ type, team: 'player', x, y, radius: 620, duration: 999, age: 7, alive: true });
    return true;
  }

  updateVisibilityV9() {
    return true;
  }
}

globalThis.__FD_DEBUG__ = {
  Game: MockGame,
  WORLD: { width: 32000, height: 22000 },
  UNIT_TYPES: {
    rifle: { name: 'Rifle', time: 9, cost: 100 },
    worker: { name: 'Worker', time: 12, cost: 200 },
  },
  BUILDING_TYPES: {
    barracks: { name: 'Barracks' },
  },
  UPGRADES: {
    armor: { name: 'Armor', time: 20, cost: 500 },
  },
  getUnitStats(typeId) {
    return this.UNIT_TYPES[typeId] || null;
  },
};

await import('../src/v200/simulation-resilience-v200.js');

const api = globalThis.__FD_SIMULATION_RESILIENCE_200__;
assert.equal(api?.build, 200);

const corrupted = {
  version: 4,
  seed: 77,
  time: 48,
  idCounter: 1,
  difficultyKey: 'normal',
  teams: {
    player: { faction: 'vanguard', credits: '5000', rank: 1, powers: { scan: null } },
    enemy: { faction: 'dominion', credits: 3000, rank: 1 },
  },
  entities: [
    {
      id: 'e7', kind: 'unit', typeId: 'rifle', team: 'player', x: 100, y: 200,
      commandQueue: [null, { type: 'move', x: '420', y: 260 }],
    },
    {
      id: 'e8', kind: 'building', typeId: 'barracks', team: 'player', x: 300, y: 400,
      queue: [
        null,
        { kind: 'unit', id: 'rifle', remaining: null, total: null, cost: null, name: null },
        { kind: 'unit', id: 'removed-unit', remaining: 3, total: 5 },
      ],
    },
    { id: 'e8', kind: 'building', typeId: 'barracks', team: 'player', x: 900, y: 900 },
    { id: 'bad', kind: 'unit', typeId: 'removed-unit', team: 'player', x: 0, y: 0 },
  ],
  abilityZones: [
    { type: 'scan', team: 'player', x: 900, y: 800, radius: 620, duration: 12, age: 99 },
    { type: 'scan', team: 'player', x: 1100, y: 800, radius: 620, duration: 12, age: 3 },
  ],
  selectedIds: ['e7', 'missing'],
  controlGroups: [['e7', 'missing']],
  formations: [{ id: 'f1', unitIds: ['e7', 'missing'], path: [{ x: '10', y: 20 }, null] }],
};

const normalized = api.normalizeSave(corrupted);
assert.equal(normalized.version, 5);
assert.equal(normalized.entities.length, 2);
assert.ok(normalized.idCounter >= 9);
assert.deepEqual(normalized.selectedIds, ['e7']);
assert.deepEqual(normalized.controlGroups[0], ['e7']);
assert.equal(normalized.formations[0].unitIds.length, 1);
assert.equal(normalized.abilityZones.length, 1);
assert.equal(normalized.abilityZones[0].age, 3);

const unit = normalized.entities.find(entity => entity.kind === 'unit');
assert.equal(unit.commandQueue.length, 1);
assert.deepEqual(unit.commandQueue[0], { type: 'move', x: 420, y: 260 });

const building = normalized.entities.find(entity => entity.kind === 'building');
assert.equal(building.queue.length, 1);
assert.deepEqual(building.queue[0], {
  kind: 'unit', id: 'rifle', remaining: 9, total: 9, cost: 100, name: 'Rifle',
});

const hydrated = new MockGame();
hydrated.hydrate(corrupted);
assert.equal(hydrated.hydrated.version, 5);
assert.equal(hydrated.hydrated.entities.find(entity => entity.kind === 'building').queue.length, 1);

const powerGame = new MockGame();
powerGame.abilityZones = [];
assert.equal(powerGame.executePower('scan', 1000, 1200), true);
assert.equal(powerGame.abilityZones[0].duration, 12);
assert.equal(powerGame.abilityZones[0].age, 0);

const fogGame = new MockGame();
fogGame.abilityZones = [];
fogGame._v9FogEmitters = new Map([
  ['v94zone:0', { x: 100, y: 100, r: 620 }],
  ['unit:e1', { x: 20, y: 20, r: 200 }],
]);
const fogStamps = [];
fogGame._v9FogStamp = (stamp, delta) => fogStamps.push({ stamp, delta });
fogGame.updateVisibilityV9(false);
assert.equal(fogGame._v9FogEmitters.has('v94zone:0'), false);
assert.equal(fogGame._v9FogEmitters.has('unit:e1'), true);
assert.equal(fogStamps.length, 1);
assert.equal(fogStamps[0].delta, -1);

assert.ok(api.state.invalidCommandsDropped >= 2);
assert.ok(api.state.invalidQueueItemsDropped >= 4);
assert.ok(api.state.expiredZonesDropped >= 2);
assert.ok(api.state.staleFogEmittersRemoved >= 1);

delete globalThis.__FD_DEBUG__;
delete globalThis.__FD_SIMULATION_RESILIENCE_200__;

console.log(JSON.stringify({ ok: true, state: api.state }));
