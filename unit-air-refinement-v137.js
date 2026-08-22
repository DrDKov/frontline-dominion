(() => {
  'use strict';

  const debug = window.__FD_DEBUG__;
  const GameClass = debug?.Game;
  const UnitClass = debug?.Unit;
  const WORLD = debug?.WORLD || { width: 32000, height: 22000 };
  if (!GameClass || !UnitClass) return;

  const VERSION = '13.7';
  const WORKER_RADIUS = 17;
  const AIR_CONTACT_TTL = 4.5;
  const clamp137 = (value, min, max) => Math.max(min, Math.min(max, value));
  const distance137 = (left, right) => Math.hypot((left?.x || 0) - (right?.x || 0), (left?.y || 0) - (right?.y || 0));
  const isFixedWing137 = (unit) => Boolean(
    unit?.alive && unit.air && unit.stats?.mobilityClass === 'fixedWing' &&
    !/helicopter|lightGunship|transportHelicopter/i.test(`${unit.typeId || ''} ${unit.stats?.visualRole || ''}`),
  );
  const commandWing137 = (unit, command = unit?._activeAirCommand134 || unit?.currentCommand) =>
    command?.airWingId137 || null;

  const normalizeWorker137 = (unit) => {
    if (unit?.typeId !== 'worker') return unit;
    unit.radius = WORKER_RADIUS;
    if (unit.stats) {
      unit.stats.radius = WORKER_RADIUS;
      unit.stats.visualScale = .90;
    }
    delete unit._v125WorldWidth;
    delete unit._v125WorldWidthRadius;
    return unit;
  };

  if (debug.UNIT_TYPES?.worker) {
    debug.UNIT_TYPES.worker.radius = WORKER_RADIUS;
    debug.UNIT_TYPES.worker.visualScale = .90;
  }
  for (const unit of debug.game?.units || []) normalizeWorker137(unit);

  const baseAddEntity137 = GameClass.prototype.addEntity;
  if (baseAddEntity137) GameClass.prototype.addEntity = function(entity) {
    normalizeWorker137(entity);
    return baseAddEntity137.call(this, entity);
  };

  // A worker health bar is anchored to the measured non-transparent atlas
  // silhouette. It uses the same compact width class as a light vehicle and
  // sits immediately above the hard hat.
  const baseScreenHealth137 = GameClass.prototype.drawScreenHealthBar;
  if (baseScreenHealth137) GameClass.prototype.drawScreenHealthBar = function(entity, centerX, y, width, ...rest) {
    if (entity?.typeId === 'worker') {
      const tight = this.getWorkerScreenBounds115?.(entity);
      if (tight) {
        centerX = (tight.x1 + tight.x2) * .5;
        y = tight.y1 - 5;
        width = clamp137(tight.visibleWidth * 1.08, 30, 48);
      }
    }
    return baseScreenHealth137.call(this, entity, centerX, y, width, ...rest);
  };

  // Combat altitude remains authoritative for collision, aiming and weapon
  // trajectories. Only the fixed-isometric projection is lowered, while its
  // visual floor still clears the tallest approved building.
  GameClass.prototype.getAircraftVisualAltitude137 = function(unit) {
    if (!unit?.air) return 0;
    const actual = this.getAircraftFlightAltitude119?.(unit) ?? Math.max(30, (unit.radius || 12) * 5.2);
    if (unit.airServiceState === 'servicing' || unit.currentCommand?.stage === 'ready' || unit.currentCommand?.stage === 'service') return actual;
    const tallest = Math.max(0, Number(this.getTallestBuildingHeight119?.()) || 0);
    const role = this.unitVisualRole?.(unit) || unit.stats?.visualRole || '';
    const roleLift = role === 'awacs' ? 30 : ['heavyBomber', 'strategicAirlifter'].includes(role) ? 14 : 0;
    const safeVisualFloor = tallest + (isFixedWing137(unit) ? 36 : 28) + roleLift;
    return Math.min(actual, Math.max(safeVisualFloor, actual * .78));
  };

  // The ordinary world pass is below the shroud. Redrawing only the player's
  // aircraft after fog keeps the units themselves visible but exposes neither
  // hostile contacts nor the terrain around them. The 20k renderer already
  // composites its sprite layer above its separate fog layer.
  GameClass.prototype.drawFriendlyAircraftOverFog137 = function() {
    const alive = this._v94AliveUnits || this.units?.length || 0;
    if (alive >= 3000) return;
    for (const unit of this.units || []) {
      if (!unit?.alive || !unit.air || unit.team !== 'player' || unit.embarkedIn || unit.inTransport) continue;
      if (!this.isOnScreen?.(unit.x, unit.y, (unit.radius || 12) + 260)) continue;
      this.drawUnit3D?.(unit);
    }
  };

  const groupForCommand137 = (unit, command) => {
    const id = command?.formationGroupId || command?.formationId;
    return id ? unit.game?.formations?.get?.(id) : null;
  };

  const normalizeAirCommand137 = (unit, command, wingFallback = null) => {
    if (!isFixedWing137(unit) || !command) return command;
    const group = groupForCommand137(unit, command);
    const formerId = command.formationGroupId || command.formationId;
    if (!command.airWingId137 && (formerId || wingFallback)) command.airWingId137 = String(formerId || wingFallback);
    if (command.type === 'formation') {
      const type = group?.type === 'patrol' ? 'patrol' : group?.type === 'attackMove' ? 'attackMove' : 'move';
      command.type = type;
      if (type === 'patrol') {
        command.ax = Number.isFinite(command.ax) ? command.ax : group?.ax ?? unit.x;
        command.ay = Number.isFinite(command.ay) ? command.ay : group?.ay ?? unit.y;
        command.bx = Number.isFinite(command.bx) ? command.bx : group?.bx ?? group?.targetX ?? unit.x;
        command.by = Number.isFinite(command.by) ? command.by : group?.by ?? group?.targetY ?? unit.y;
        command.phase = Boolean(command.phase);
      } else {
        command.x = Number.isFinite(command.x) ? command.x : group?.targetX ?? unit.x;
        command.y = Number.isFinite(command.y) ? command.y : group?.targetY ?? unit.y;
      }
    }
    delete command.formationGroupId;
    delete command.formationId;
    return command;
  };

  const baseSetCommand137 = UnitClass.prototype.setCommand;
  UnitClass.prototype.setCommand = function(command, append = false) {
    normalizeAirCommand137(this, command);
    return baseSetCommand137.call(this, command, append);
  };

  const normalizeAircraftQueues137 = (unit) => {
    if (!isFixedWing137(unit)) return;
    let fallback = null;
    for (const command of unit.commandQueue || []) {
      fallback ||= command?.formationGroupId || command?.formationId || command?.airWingId137 || null;
      normalizeAirCommand137(unit, command, fallback);
    }
    for (const command of unit.airSavedCommands || []) normalizeAirCommand137(unit, command, fallback);
  };
  for (const unit of debug.game?.units || []) normalizeAircraftQueues137(unit);

  // Ground formations remain rigid. Fixed-wing selections receive the same
  // wing identifier and route, but each command owns its phase/progress. A
  // late launch, rearm or damaged member can therefore never freeze the wing.
  const baseIssueFormation137 = GameClass.prototype.issueFormationCommand;
  if (baseIssueFormation137) GameClass.prototype.issueFormationCommand = function(type, x, y, append = false) {
    const selected = this.getSelectedUnits?.() || [];
    const aircraft = selected.filter(isFixedWing137).filter((unit) => type !== 'attackMove' || unit.stats?.weapon);
    if (!aircraft.length) return baseIssueFormation137.call(this, type, x, y, append);

    const others = selected.filter((unit) => !aircraft.includes(unit));
    let groundHandled = false;
    if (others.length) {
      const originalSelection = this.selected;
      this.selected = others;
      try { groundHandled = Boolean(baseIssueFormation137.call(this, type, x, y, append)); }
      finally { this.selected = originalSelection; }
    }

    this._airWingCounter137 = (this._airWingCounter137 || 0) + 1;
    const wingId = `air-wing-${this._airWingCounter137}`;
    const count = aircraft.length;
    const spacing = Math.max(54, Math.max(...aircraft.map((unit) => unit.radius || 12)) * 2.8);
    for (let index = 0; index < count; index += 1) {
      const unit = aircraft[index];
      const offset = this.formationOffset?.(index, count, spacing) || {
        x: (index - (count - 1) * .5) * spacing,
        y: 0,
      };
      const targetX = clamp137(x + (offset.x || 0), 180, WORLD.width - 180);
      const targetY = clamp137(y + (offset.y || 0), 180, WORLD.height - 180);
      const command = type === 'patrol'
        ? { type, ax: unit.x, ay: unit.y, bx: targetX, by: targetY, phase: false, airWingId137: wingId }
        : { type, x: targetX, y: targetY, airWingId137: wingId };
      unit.setCommand(command, append);
    }
    this.addEffect?.({ type: 'marker', x, y, color: type === 'patrol' ? '#7ecbff' : type === 'attackMove' ? '#ffb06c' : '#8fe6b2', duration: .9 });
    if (!groundHandled) this.sound?.click?.();
    return true;
  };

  const contactMap137 = (game) => game._airWingContacts137 || (game._airWingContacts137 = new Map());
  const freshContact137 = (game, unit) => {
    const wingId = commandWing137(unit);
    if (!wingId) return null;
    const contact = contactMap137(game).get(wingId);
    if (!contact || (game.time || 0) - contact.time > AIR_CONTACT_TTL) return null;
    const target = game.getEntity?.(contact.targetId);
    if (!target?.alive || target.team === unit.team || target.team === 'neutral') return null;
    const supportRange = Math.max(1900, (unit.vision || unit.stats?.vision || 0) * 2.4, (unit.stats?.weapon?.range || 0) * 3.2);
    return distance137(unit, target) <= supportRange ? { contact, target } : null;
  };
  const roleAccepts137 = (game, unit, target) => {
    const layer = target?.air ? 'air' : 'ground';
    if (!unit.stats?.weapon?.targets?.includes(layer)) return false;
    const role = game.unitVisualRole?.(unit) || unit.stats?.visualRole || '';
    if (['bomber', 'heavyBomber', 'stealthStriker', 'aerialArtillery'].includes(role) && target.air) return false;
    if (role === 'interceptor' && !target.air) return false;
    return true;
  };

  const baseTargetable137 = GameClass.prototype.isTargetableBy;
  if (baseTargetable137) GameClass.prototype.isTargetableBy = function(entity, viewerTeam, observer = null) {
    if (baseTargetable137.call(this, entity, viewerTeam, observer)) return true;
    if (!isFixedWing137(observer) || observer.team !== viewerTeam) return false;
    const shared = freshContact137(this, observer);
    return Boolean(shared?.target?.id === entity?.id && roleAccepts137(this, observer, entity));
  };

  const baseMissionValid137 = GameClass.prototype.isAircraftMissionTargetValid134;
  if (baseMissionValid137) GameClass.prototype.isAircraftMissionTargetValid134 = function(unit, target, command = unit?.currentCommand, explicit = false) {
    if (baseMissionValid137.call(this, unit, target, command, explicit)) return true;
    const shared = freshContact137(this, unit);
    if (shared?.target?.id !== target?.id || !roleAccepts137(this, unit, target)) return false;
    return this.isAircraftTargetWithinMission134?.(unit, target, command, explicit) !== false;
  };

  const baseFindAircraftTarget137 = GameClass.prototype.findAircraftTarget133;
  if (baseFindAircraftTarget137) GameClass.prototype.findAircraftTarget133 = function(unit, macro = false) {
    if (!isFixedWing137(unit) || unit.airServiceState) return baseFindAircraftTarget137.call(this, unit, macro);
    const local = baseFindAircraftTarget137.call(this, unit, macro);
    const wingId = commandWing137(unit);
    if (local && wingId) {
      contactMap137(this).set(wingId, {
        targetId: local.id,
        reporterId: unit.id,
        time: this.time || 0,
        x: local.x,
        y: local.y,
      });
      return local;
    }
    const shared = freshContact137(this, unit);
    if (!shared || !roleAccepts137(this, unit, shared.target)) return local;
    return this.isAircraftMissionTargetValid134?.(unit, shared.target, unit.currentCommand, false)
      ? shared.target
      : local;
  };

  const baseHydrate137 = GameClass.prototype.hydrate;
  if (baseHydrate137) GameClass.prototype.hydrate = function(data) {
    const result = baseHydrate137.call(this, data);
    for (const unit of this.units || []) {
      normalizeWorker137(unit);
      normalizeAircraftQueues137(unit);
    }
    return result;
  };

  if (typeof document !== 'undefined') {
    void 0;
    const eyebrow = document.querySelector?.('#start-screen .eyebrow');
    if (eyebrow) void 0;
    const lead = document.querySelector?.('#start-screen .lead');
    if (lead) void 0;
    const strip = document.querySelector?.('#start-screen .feature-strip');
    if (strip && !strip.querySelector?.('[data-unit-air137-feature]')) {
      void 0;
    }
  }

  window.__FD_UNIT_AIR_REFINEMENT_V137__ = {
    version: VERSION,
    workerRadius: WORKER_RADIUS,
    contactTtl: AIR_CONTACT_TTL,
    isFixedWing: isFixedWing137,
    normalizeAirCommand: normalizeAirCommand137,
  };
})();
