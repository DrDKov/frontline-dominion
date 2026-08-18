import fs from 'node:fs';
import vm from 'node:vm';

class Game {
  constructor() {
    this.simTick = 0;
    this.time = 0;
    this.formations = new Map();
    this.entities = new Map();
    this.spatial = { update() {} };
  }
  getEntity(id) { return this.entities.get(id) || null; }
  isNavigableUnitPoint133() { return true; }
}

class Unit {
  constructor(game, id, x, y) {
    this.game = game;
    this.id = id;
    this.kind = 'unit';
    this.alive = true;
    this.air = false;
    this.embarkedIn = null;
    this.radius = 7;
    this.x = x;
    this.y = y;
    this.stats = { speed: 110 };
    this.dynamicCalls = 0;
  }
  processFormationCommand(command) {
    const group = this.game.formations.get(command.formationGroupId);
    group.march183.blockedTicks += 1;
    group.march183.phase = 'marching';
    return true;
  }
  moveToward(x, y, dt, factor, options) {
    if (!options?.dynamic || !options?.formationRecovery196) throw new Error('recovery did not request dynamic navigation');
    this.dynamicCalls += 1;
    const dx = x - this.x;
    const dy = y - this.y;
    const length = Math.max(1, Math.hypot(dx, dy));
    const step = Math.min(length, 110 * factor * dt * 3.5);
    this.x += dx / length * step;
    this.y += dy / length * step;
    return true;
  }
}

globalThis.__FD_DEBUG__ = {
  Game,
  Unit,
  WORLD: { width: 4000, height: 3000 },
};

const source = fs.readFileSync(new URL('../src/v196/formation-obstacle-recovery-v196.js', import.meta.url), 'utf8');
vm.runInThisContext(source, { filename: 'formation-obstacle-recovery-v196.js' });

const game = new Game();
const group = {
  id: 'f7',
  unitIds: ['u1', 'u2', 'u3', 'u4'],
  formation: 'column',
  path: [{ x: 900, y: 1000 }, { x: 1600, y: 1000 }],
  pathIndex: 0,
  finalAnchorX138: 1600,
  finalAnchorY138: 1000,
  maxRadius: 44,
  anchorX: 500,
  anchorY: 1000,
  arrived: false,
  completed: false,
  march183: {
    phase: 'marching',
    blockedTicks: 4,
    anchorX: 500,
    anchorY: 1000,
    formingTicks189: 0,
    memberSignature: 'u1|u2|u3|u4',
  },
};
game.formations.set(group.id, group);
const units = group.unitIds.map((id, index) => new Unit(game, id, 500 - index * 24, 1000));
for (const unit of units) game.entities.set(unit.id, unit);
const commands = new Map(units.map(unit => [unit.id, { type: 'move', formationGroupId: group.id, x: 1600, y: 1000 }]));
const startCenter = units.reduce((sum, unit) => sum + unit.x, 0) / units.length;

for (let tick = 0; tick < 32; tick += 1) {
  game.simTick = tick;
  game.time = tick / 25;
  for (const unit of units) unit.processFormationCommand(commands.get(unit.id), 1 / 25);
}

const api = globalThis.__FD_FORMATION_OBSTACLE_RECOVERY_196__;
const endCenter = units.reduce((sum, unit) => sum + unit.x, 0) / units.length;
const dynamicCalls = units.reduce((sum, unit) => sum + unit.dynamicCalls, 0);
if (!api || api.build !== 196) throw new Error('v196 recovery API missing');
if (api.diagnostics.activations < 1) throw new Error(`recovery never activated: ${JSON.stringify(api.diagnostics)}`);
if (dynamicCalls < units.length) throw new Error(`individual dynamic navigation was not used: ${dynamicCalls}`);
if (endCenter <= startCenter + 80) throw new Error(`formation did not clear the obstacle zone: ${JSON.stringify({ startCenter, endCenter })}`);
if (api.diagnostics.rejoins < 1) throw new Error(`formation never rejoined: ${JSON.stringify(api.diagnostics)}`);

console.log(JSON.stringify({
  ok: true,
  startCenter,
  endCenter,
  dynamicCalls,
  diagnostics: api.diagnostics,
}));
