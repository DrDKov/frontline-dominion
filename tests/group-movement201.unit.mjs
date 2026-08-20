import fs from 'node:fs';
import vm from 'node:vm';

let stored = null;

class Unit {
  constructor(id, x, y, radius = 12) {
    this.id = id;
    this.kind = 'unit';
    this.alive = true;
    this.team = 'player';
    this.air = false;
    this.embarkedIn = null;
    this.x = x;
    this.y = y;
    this.radius = radius;
    this.stats = { speed: 120, weapon: { range: 300 } };
    this.currentCommand = null;
    this.commandQueue = [];
  }
  setCommand(command, append = false) {
    if (append && this.currentCommand) this.commandQueue.push(command);
    else this.currentCommand = command;
  }
}

class Game {
  constructor() {
    this.simTick = 10;
    this.time = 0.4;
    this.selected = [];
    this.entities = new Map();
    this.formations = new Map();
    this.formationMode = 'balanced';
    this.formationSettings = { shape: 'wedge', doctrine: 'combined', customOrder: [] };
    this.baseOrders = 0;
    this.effects = [];
    this.sound = { click() {} };
  }
  getEntity(id) { return this.entities.get(id) || null; }
  getSelectedUnits() { return this.selected; }
  findReachablePoint(x, y) { return { x, y }; }
  addEffect(effect) { this.effects.push(effect); }
  issueMove(x, y, append = false) {
    this.baseOrders += 1;
    const groupId = `formation-${this.baseOrders}`;
    for (const unit of this.selected) unit.setCommand({ type: 'move', x, y, formationGroupId: groupId }, append);
    return true;
  }
  issueAttackMove(x, y, append = false) { return this.issueMove(x, y, append); }
  issuePatrol(x, y, append = false) { return this.issueMove(x, y, append); }
  issueOrientedMove78(x, y, angle, append = false) { return this.issueMove(x, y, append); }
  issueContext() { return true; }
  setFormationMode(mode) { this.formationMode = mode; return true; }
  captureCurrentFormation() { this.formationMode = 'custom'; return true; }
  updateFormationControls() {}
  ensureFormationGroupUpdated(group) { return group; }
  getFormationSlotWorld(group, unit) { return group.slots?.[unit.id] || { x: unit.x, y: unit.y }; }
  save() {
    stored = JSON.stringify({ entities: [] });
    return true;
  }
  hydrate(data) { this.formationMode = data.formationMode || 'balanced'; return true; }
}

globalThis.__FD_DEBUG__ = {
  Game,
  Unit,
  WORLD: { width: 5000, height: 4000 },
  SAVE_KEY: 'fd-test',
  storageGet() { return stored; },
  storageSet(_key, value) { stored = value; },
};

const source = fs.readFileSync(new URL('../src/v201/group-movement-v201.js', import.meta.url), 'utf8');
vm.runInThisContext(source, { filename: 'group-movement-v201.js' });

const game = new Game();
const units = [
  new Unit('u1', 300, 300, 11),
  new Unit('u2', 340, 300, 13),
  new Unit('u3', 300, 350, 12),
  new Unit('u4', 340, 350, 14),
];
for (const unit of units) game.entities.set(unit.id, unit);
game.selected = units;

if (game.issueMove(1400, 900, false) !== true) throw new Error('free group order rejected');
const freeCommands = units.map(unit => unit.currentCommand);
if (freeCommands.some(command => command.formationGroupId || !command._fdFreeGroup201)) {
  throw new Error(`default group unexpectedly formed: ${JSON.stringify(freeCommands)}`);
}
const freeEndpoints = new Set(freeCommands.map(command => `${command.x.toFixed(2)}:${command.y.toFixed(2)}`));
if (freeEndpoints.size !== units.length) throw new Error(`free endpoints are not unique: ${JSON.stringify(freeCommands)}`);

game.setFormationMode('line');
if (!game.formationEnabled201 || game.formationSettings.mode !== 'line') {
  throw new Error(`formation selection did not enable line mode: ${JSON.stringify(game.formationSettings)}`);
}
game.issueMove(1800, 1200, false);
const groupIds = new Set(units.map(unit => unit.currentCommand.formationGroupId).filter(Boolean));
if (groupIds.size !== 1) throw new Error(`explicit formation was not delegated: ${JSON.stringify(units.map(unit => unit.currentCommand))}`);

game.setFormationEnabled201(false, false);
game.issueOrientedMove78(2100, 1500, 1.2, false);
if (units.some(unit => unit.currentCommand.formationGroupId || !unit.currentCommand._fdFreeGroup201 || unit.currentCommand.finalRotation !== 1.2)) {
  throw new Error(`free oriented group order failed: ${JSON.stringify(units.map(unit => unit.currentCommand))}`);
}

game.save(false);
const save = JSON.parse(stored);
if (save.formationEnabled201 !== false || save.formationSettings?.enabled !== false) {
  throw new Error(`optional formation state was not saved: ${stored}`);
}

const api = globalThis.__FD_GROUP_MOVEMENT_201__;
game.formationSettings = { enabled: true, mode: 'column', shape: 'column' };
api.ensureSettings(game);
if (!game.formationEnabled201 || game.formationMode !== 'column') {
  throw new Error(`authoritative action settings were not synchronized: ${JSON.stringify(game.formationSettings)}`);
}
game.setFormationEnabled201(false, false);
const smartGroup = {
  id: 'smart-group',
  unitIds: units.map(unit => unit.id),
  slots: Object.fromEntries(units.map((unit, index) => [unit.id, index === units.length - 1
    ? { x: unit.x + 900, y: unit.y + 900 }
    : { x: unit.x, y: unit.y }])),
  anchorX: 500,
  anchorY: 500,
  targetX: 1800,
  targetY: 500,
  path: [{ x: 1800, y: 500 }],
  pathIndex: 0,
  depthSpacing: 48,
  maxRadius: 14,
  speed: 120,
  forming: true,
  arrived: false,
  completed: false,
};
for (const unit of units) unit.currentCommand = { type: 'move', formationGroupId: smartGroup.id };
game.ensureFormationGroupUpdated(smartGroup, 0.04);
if (smartGroup.forming || smartGroup.anchorX <= 500 || api.state.outlierStallsIgnored < 1 || api.state.robustFormationSteps < 1) {
  throw new Error(`formation outlier still stalled the group: ${JSON.stringify({ smartGroup, state: api.state })}`);
}
if (!api || api.build !== 201 || api.state.freeOrders < 2 || api.state.formationOrders < 1) {
  throw new Error(`build 201 group diagnostics invalid: ${JSON.stringify(api?.state)}`);
}

console.log(JSON.stringify({ ok: true, freeEndpoints: [...freeEndpoints], groupIds: [...groupIds], state: api.state }));
