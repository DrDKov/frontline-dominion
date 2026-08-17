'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = process.argv[2] || 'dist';
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const formationSource = read('formation-march-core-v183.js');
const finalSource = read('screen-selection-formation-v140.js');
const footprints = read('unit-footprints-v115.js');
const refinement = read('unit-formation-refinement-v138.js');
const html = read('frontline-dominion.html');
const bundle = read('authoritative-simulation-bundle-v172.js');

if (!formationSource.includes("const VERSION = '16.8.5';\n  const BUILD = 189;")) throw new Error('formation build 189 version missing');
if (!formationSource.includes('optimizeFormationSlots189')) throw new Error('nearest-slot assignment missing');
if (!formationSource.includes('state.formingTicks189 >= 24')) throw new Error('hard formation release budget missing');
if (!formationSource.includes('memberTurnRate189')) throw new Error('natural turn controller missing');
if ((finalSource.match(/march183\?\.build \|\| 0\) >= 189/g) || []).length < 2) throw new Error('legacy v140 wait/snap bypass missing');
if (/ENGINEER_DISPLAY_SCALE\s*=\s*2\.85/.test(footprints + refinement)) throw new Error('oversized engineer scale survived');
if (/typeId === 'worker'\) return ENGINEER_DISPLAY_SCALE/.test(footprints + refinement)) throw new Error('special engineer visual branch survived');
if (/typeId === 'worker'\) return this\.getWorkerScreenBounds115/.test(refinement)) throw new Error('special engineer selection branch survived');
if (!/worker\s*:\s*\{\s*name\s*:\s*'Инженер'[\s\S]{0,420}?radius\s*:\s*14\b/.test(html)) throw new Error('main-thread engineer radius is not 14');
if (!/worker\s*:\s*\{\s*name\s*:\s*'Инженер'[\s\S]{0,420}?radius\s*:\s*14\b/.test(bundle)) throw new Error('Worker engineer radius is not 14');
if (!html.includes('fd-boot189-script') || !html.includes('runtime-shell-v189.js?build=189')) throw new Error('canonical launch shell missing');
if (!html.includes('runtime-ui-v189.js?build=189')) throw new Error('canonical runtime UI missing');
if (/runtime-(?:ui|shell)-v188\.js/.test(html)) throw new Error('old runtime shell still loaded');
if (!html.includes('ЗАГРУЗКА…') || !html.includes('data-fd-canonical-build="189"')) throw new Error('canonical first paint missing');
const scriptSources = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+\.js(?:\?build=\d+)?)["']/gi)].map(match => match[1]);
const mixed = scriptSources.filter(source => !source.endsWith('?build=189'));
if (mixed.length) throw new Error(`mixed browser cache generations: ${mixed.join(', ')}`);

class Unit {
  processFormationCommand() { return false; }
  finishCommand() { this.currentCommand = null; return true; }
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
  syncFormationFinalSlots138() {}
  createFormationGroup(units, type, targetX, targetY, options = {}) {
    const spacing = options.spacing || 40;
    const group = {
      id: options.id || 'g189',
      unitIds: units.map(unit => unit.id),
      slots: {},
      formation: options.formation || 'line',
      anchorX: options.anchorX || 1000,
      anchorY: options.anchorY || 1000,
      angle: options.angle || 0,
      lateralSpacing: spacing,
      depthSpacing: spacing,
      maxRadius: 260,
      targetX,
      targetY,
      finalAnchorX138: targetX,
      finalAnchorY138: targetY,
    };
    units.forEach((unit, index) => {
      group.slots[unit.id] = { forward: 0, lateral: (index - (units.length - 1) / 2) * spacing };
      unit.currentCommand = { type, x: targetX, y: targetY, formationGroupId: group.id };
    });
    this.formations.set(group.id, group);
    return group;
  }
}

globalThis.__FD_DEBUG__ = { Game, Unit, WORLD: { width: 6000, height: 6000 }, game: null };
new Function(formationSource)();

const game = new Game();
globalThis.__FD_DEBUG__.game = game;
const count = 60;
const units = [];
for (let index = 0; index < count; index += 1) {
  const unit = new Unit();
  Object.assign(unit, {
    id: `u${index + 1}`,
    kind: 'unit', alive: true, air: false, embarkedIn: null,
    x: 1000 - 150 - (index % 5) * 12,
    y: 1000 + ((count - 1 - index) - (count - 1) / 2) * 40 + ((index % 3) - 1) * 18,
    rotation: Math.PI, renderRotation: Math.PI,
    radius: 8, vehicle: true, infantry: false,
    stats: { speed: index >= 52 ? 32 : 100 },
    healthRatio: 1, supply160: 1, cohesion160: 1,
    commandQueue: [], game, weaponCooldown: 0,
  });
  units.push(unit);
  game.units.push(unit);
}

const originalSlots = Object.fromEntries(units.map((unit, index) => [unit.id, { forward: 0, lateral: (index - (count - 1) / 2) * 40 }]));
const centerY = units.reduce((sum, unit) => sum + unit.y, 0) / units.length;
const cost = slots => units.reduce((sum, unit) => {
  const localY = unit.y - centerY;
  return sum + Math.abs(localY - slots[unit.id].lateral);
}, 0);
const beforeAssignmentCost = cost(originalSlots);
const group = game.createFormationGroup(units, 'move', 2200, 1000, { id: 'g189', formation: 'line', spacing: 40, anchorX: 1000, anchorY: 1000 });
const afterAssignmentCost = cost(group.slots);
if (!group.slotAssignment189) throw new Error('slot assignment marker missing');
if (!(afterAssignmentCost < beforeAssignmentCost * 0.18)) throw new Error(`slot assignment did not remove crossing: before=${beforeAssignmentCost} after=${afterAssignmentCost}`);

const leader = units[0];
let releasedAt = null;
let maxStepRatio = 0;
let rotated = 0;
for (let tick = 0; tick < 30; tick += 1) {
  const before = units.map(unit => ({ x: unit.x, y: unit.y, rotation: unit.rotation }));
  game.simTick += 1;
  game.time += 0.04;
  leader.processFormationCommand(leader.currentCommand, 0.04);
  units.forEach((unit, index) => {
    const step = Math.hypot(unit.x - before[index].x, unit.y - before[index].y);
    const cap = Math.max(1, unit.stats.speed * 2.25 * 0.04);
    maxStepRatio = Math.max(maxStepRatio, step / cap);
    if (Math.abs(Math.atan2(Math.sin(unit.rotation - before[index].rotation), Math.cos(unit.rotation - before[index].rotation))) > 0.02) rotated += 1;
    if (step > cap + 0.02) throw new Error(`unit teleported during assembly: ${unit.id} step=${step} cap=${cap}`);
  });
  if (group.march183?.phase === 'marching') { releasedAt = tick + 1; break; }
}
if (releasedAt == null || releasedAt > 24) throw new Error(`formation exceeded assembly budget: ${releasedAt}`);
if (rotated < count * 0.6) throw new Error(`too few units rotated toward their slots: ${rotated}/${count}`);

const anchorBefore = { x: group.anchorX, y: group.anchorY };
const straggler = units[count - 1];
straggler.x -= 360;
straggler.y += 180;
game.simTick += 1;
game.time += 0.04;
leader.processFormationCommand(leader.currentCommand, 0.04);
if (group.march183?.phase !== 'marching') throw new Error('one straggler stopped the whole formation');
const anchorAdvance = Math.hypot(group.anchorX - anchorBefore.x, group.anchorY - anchorBefore.y);
if (!(anchorAdvance > 0.2)) throw new Error(`formation did not start marching after release: ${anchorAdvance}`);
const diag = game.formationMarchDiagnostics183();
if (diag.build !== 189 || diag.version !== '16.8.5') throw new Error(`diagnostic version mismatch: ${JSON.stringify(diag)}`);

console.log(JSON.stringify({
  ok: true,
  build: diag.build,
  beforeAssignmentCost,
  afterAssignmentCost,
  releasedAt,
  maxStepRatio,
  rotated,
  anchorAdvance,
  phase: group.march183.phase,
}));
