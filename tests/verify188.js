'use strict';
const fs = require('node:fs');
const path = process.argv[2] || 'dist/formation-march-core-v183.js';
const source = fs.readFileSync(path, 'utf8');

class Unit {
  processFormationCommand() { return false; }
}

class Game {
  constructor() {
    this.units = [];
    this.formations = new Map();
    this.simTick = 1;
    this.time = 0;
    this.spatial = { update() {} };
  }
  getEntity(id) { return this.units.find(unit => unit.id === id) || null; }
  ensureFormationGroupUpdated(group) { return group; }
  isNavigableUnitPoint133() { return true; }
  _v94SyncMini164() {}
}

globalThis.__FD_DEBUG__ = { Game, Unit, WORLD: { width: 5000, height: 5000 }, game: null };
new Function(source)();

const game = new Game();
globalThis.__FD_DEBUG__.game = game;
const count = 10;
const spacing = 40;
const group = {
  id: 'g188',
  unitIds: [],
  slots: {},
  formation: 'line',
  anchorX: 1000,
  anchorY: 1000,
  angle: 0,
  lateralSpacing: spacing,
  depthSpacing: spacing,
  maxRadius: 150,
  targetX: 1800,
  targetY: 1000,
  finalAnchorX138: 1800,
  finalAnchorY138: 1000,
};

for (let i = 0; i < count; i += 1) {
  const id = `u${i + 1}`;
  const lateral = (i - (count - 1) / 2) * spacing;
  group.unitIds.push(id);
  group.slots[id] = { forward: 0, lateral };
  const command = { type: 'move', x: 1800, y: 1000, formationGroupId: group.id };
  const unit = new Unit();
  Object.assign(unit, {
    id,
    kind: 'unit',
    alive: true,
    air: false,
    embarkedIn: null,
    x: 1000,
    y: 1000 + lateral + 120,
    rotation: 0,
    renderRotation: 0,
    radius: 8,
    vehicle: true,
    infantry: false,
    stats: { speed: i === count - 1 ? 20 : 100 },
    healthRatio: 1,
    supply160: 1,
    cohesion160: 1,
    currentCommand: command,
    commandQueue: [],
    game,
    weaponCooldown: 0,
  });
  game.units.push(unit);
}
game.formations.set(group.id, group);

const fast = game.units[0];
const slow = game.units[count - 1];
const fastBefore = { x: fast.x, y: fast.y };
const slowBefore = { x: slow.x, y: slow.y };
fast.processFormationCommand(fast.currentCommand, 0.04);
const fastStep = Math.hypot(fast.x - fastBefore.x, fast.y - fastBefore.y);
const slowStep = Math.hypot(slow.x - slowBefore.x, slow.y - slowBefore.y);
if (!(fastStep > 4.5)) throw new Error(`fast form-up still throttled by slowest member: ${fastStep}`);
if (!(fastStep > slowStep * 3.5)) throw new Error(`member-local form-up speed not effective: fast=${fastStep} slow=${slowStep}`);
if (!(fast.rotation < -0.12)) throw new Error(`unit did not turn toward its actual slot vector: rotation=${fast.rotation}`);

// Arrange a practically assembled body with one deliberate straggler. The group
// must release into march without snapping that straggler into its exact slot.
for (let i = 0; i < count; i += 1) {
  const unit = game.units[i];
  const slot = group.slots[unit.id];
  const targetX = group.anchorX + slot.forward;
  const targetY = group.anchorY + slot.lateral;
  unit.x = targetX;
  unit.y = targetY + (i === count - 1 ? 90 : 2);
  unit.renderX = unit.x;
  unit.renderY = unit.y;
}
const straggler = game.units[count - 1];
const stragglerBeforeRelease = { x: straggler.x, y: straggler.y };
game.simTick += 1;
game.time += 0.04;
fast.processFormationCommand(fast.currentCommand, 0.04);
if (group.march183?.phase !== 'marching') throw new Error(`practical formation did not release: ${group.march183?.phase}`);
const releaseMove = Math.hypot(straggler.x - stragglerBeforeRelease.x, straggler.y - stragglerBeforeRelease.y);
if (!(releaseMove > 0 && releaseMove < 8)) throw new Error(`straggler snapped/failed during release: move=${releaseMove}`);
const slotAtRelease = { x: group.anchorX + group.slots[straggler.id].forward, y: group.anchorY + group.slots[straggler.id].lateral };
if (!(Math.hypot(straggler.x - slotAtRelease.x, straggler.y - slotAtRelease.y) > 60)) {
  throw new Error('straggler was teleported into its slot at march release');
}

const anchorBeforeMarch = { x: group.anchorX, y: group.anchorY };
const stragglerBeforeMarch = { x: straggler.x, y: straggler.y };
game.simTick += 1;
game.time += 0.04;
fast.processFormationCommand(fast.currentCommand, 0.04);
if (group.march183?.phase !== 'marching') throw new Error('one straggler forced the whole group back into regrouping');
const anchorAdvance = Math.hypot(group.anchorX - anchorBeforeMarch.x, group.anchorY - anchorBeforeMarch.y);
if (!(anchorAdvance > 0.2)) throw new Error(`formation did not begin marching immediately: ${anchorAdvance}`);
const stragglerCatchup = Math.hypot(straggler.x - stragglerBeforeMarch.x, straggler.y - stragglerBeforeMarch.y);
if (!(stragglerCatchup > 0 && stragglerCatchup < 8)) throw new Error(`moving-slot catchup is discontinuous: ${stragglerCatchup}`);

const diag = game.formationMarchDiagnostics183();
if (diag.build !== 188 || diag.version !== '16.8.4') throw new Error(`formation diagnostics version mismatch: ${JSON.stringify(diag)}`);
if (!source.includes('ownSpeed * assemblyFactor')) throw new Error('rapid member-local assembly source marker missing');
if (!source.includes('Intentionally no exact-slot snap here')) throw new Error('no-snap source marker missing');
if (!source.includes('tooManyOutliers188')) throw new Error('practical cohesion source marker missing');

console.log(JSON.stringify({
  ok: true,
  fastStep,
  slowStep,
  releaseMove,
  anchorAdvance,
  stragglerCatchup,
  phase: group.march183.phase,
  build: diag.build,
}));
