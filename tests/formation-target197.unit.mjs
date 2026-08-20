import fs from 'node:fs';
import vm from 'node:vm';

class Game {
  constructor() {
    this.simTick = 0;
    this.time = 0;
    this.formations = new Map();
    this.entities = new Map();
    this.selected = [];
    this.formationCounter = 1;
  }
  getEntity(id) { return this.entities.get(id) || null; }
  issueMove(x, y) {
    const id = `f${this.formationCounter++}`;
    const ids = this.selected.map(unit => unit.id);
    const slots = new Map(ids.map((unitId, index) => [unitId, {
      along: index * 60,
      lateral: index % 2 ? 22 : -22,
    }]));
    const group = {
      id,
      unitIds: ids,
      slots,
      path: [{ x: x + 480, y: y - 260 }],
      pathIndex: 0,
      targetX: x + 480,
      targetY: y - 260,
      finalAnchorX138: x + 480,
      finalAnchorY138: y - 260,
      maxRadius: 80,
      arrived: false,
      completed: false,
      march183: { phase: 'marching', blockedTicks: 0, formingTicks189: 0, memberSignature: ids.join('|') },
    };
    this.formations.set(id, group);
    for (const unit of this.selected) {
      unit.currentCommand = { type: 'move', formationGroupId: id, x: x + 480, y: y - 260 };
    }
    return true;
  }
  issueAttackMove(x, y) { return this.issueMove(x, y); }
}

class Unit {
  constructor(game, id, x, y) {
    this.game = game;
    this.id = id;
    this.kind = 'unit';
    this.alive = true;
    this.air = false;
    this.embarkedIn = null;
    this.x = x;
    this.y = y;
    this.currentCommand = null;
    this.commandQueue = [];
  }
  processFormationCommand(command, dt) {
    const group = this.game.formations.get(command.formationGroupId);
    if (group.arrived || group.completed) return true;
    const slot = group.slots.get(this.id);
    const tx = group.finalAnchorX138 + Number(slot.forward ?? slot.along ?? 0);
    const ty = group.finalAnchorY138 + Number(slot.lateral ?? 0);
    const dx = tx - this.x;
    const dy = ty - this.y;
    const length = Math.hypot(dx, dy);
    if (length > 0.5) {
      const step = Math.min(length, 260 * dt);
      this.x += dx / length * step;
      this.y += dy / length * step;
    }
    return true;
  }
}

globalThis.__FD_DEBUG__ = { Game, Unit };
const source = fs.readFileSync(new URL('../src/v197/formation-target-fidelity-v197.js', import.meta.url), 'utf8');
vm.runInThisContext(source, { filename: 'formation-target-fidelity-v197.js' });

const game = new Game();
const units = Array.from({ length: 4 }, (_, index) => new Unit(game, `u${index + 1}`, 200 - index * 20, 400));
for (const unit of units) game.entities.set(unit.id, unit);
game.selected = units;

const requested = { x: 1450, y: 920 };
if (game.issueMove(requested.x, requested.y, false) !== true) throw new Error('issueMove failed');
const group = [...game.formations.values()][0];
if (!group) throw new Error('formation was not created');
if (Math.hypot(group.finalAnchorX138 - requested.x, group.finalAnchorY138 - requested.y) > 0.01) {
  throw new Error(`group retained wrong target: ${JSON.stringify(group)}`);
}
const slotValues = [...group.slots.values()];
const meanForward = slotValues.reduce((sum, slot) => sum + Number(slot.forward || 0), 0) / slotValues.length;
const meanLateral = slotValues.reduce((sum, slot) => sum + Number(slot.lateral || 0), 0) / slotValues.length;
if (Math.abs(meanForward) > 0.001 || Math.abs(meanLateral) > 0.001) {
  throw new Error(`slots remain biased: ${JSON.stringify({ meanForward, meanLateral, slotValues })}`);
}

for (let tick = 0; tick < 260; tick += 1) {
  game.simTick = tick;
  game.time = tick / 25;
  if (tick === 8) {
    group.arrived = true;
    group.completed = true;
  }
  for (const unit of units) unit.processFormationCommand(unit.currentCommand, 1 / 25);
}

const center = units.reduce((acc, unit) => ({ x: acc.x + unit.x / units.length, y: acc.y + unit.y / units.length }), { x: 0, y: 0 });
const error = Math.hypot(center.x - requested.x, center.y - requested.y);
const api = globalThis.__FD_FORMATION_TARGET_FIDELITY_197__;
if (!api?.installed || api.build !== 197) throw new Error(`v197 target API unavailable: ${JSON.stringify(api)}`);
if (error > 3) throw new Error(`formation center missed requested point: ${JSON.stringify({ center, requested, error })}`);
if (api.state.prematureCompletionsPrevented < 1) {
  throw new Error(`premature completion was not rejected: ${JSON.stringify(api.state)}`);
}

const freeUnit = units[0];
freeUnit.currentCommand = { type: 'move', x: 1720, y: 1080, _fdFreeGroup201: true };
api.tagIssuedOrder(game, [freeUnit.id], { x: 1900, y: 1200 }, false);
if (freeUnit.currentCommand.x !== 1720 || freeUnit.currentCommand.y !== 1080) {
  throw new Error(`free-group endpoint was collapsed to the group target: ${JSON.stringify(freeUnit.currentCommand)}`);
}

console.log(JSON.stringify({ ok: true, requested, center, error, state: api.state }));
