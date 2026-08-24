// requires: __FD_DEBUG__, __FD_ENGINEER_INITIATIVE_V130__
// provides: __FD_ENGINEER_COMMAND_CONTROL__
(() => {
  'use strict';
  const root = typeof window !== 'undefined' ? window : self;
  const D = root.__FD_DEBUG__;
  const legacy = root.__FD_ENGINEER_INITIATIVE_V130__;
  const Game = D?.Game;
  const Unit = D?.Unit;
  if (!Game || !Unit || !legacy || root.__FD_ENGINEER_COMMAND_CONTROL__) return;

  const EPS = 1e-6;
  const AUTO_FLAG = 'autoEngineer130';
  const EXPLICIT_BUILD_FLAG = 'explicitEngineerConstructionAssignment';
  const BUILD_ASSIGNMENTS = 'engineerConstructionAssignments';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, Number(v) || 0));
  const distance = (a, b) => Math.hypot((Number(a?.x) || 0) - (Number(b?.x) || 0), (Number(a?.y) || 0) - (Number(b?.y) || 0));
  const isEngineer = unit => Boolean(
    legacy.isEngineer?.(unit) ||
    (unit?.alive && !unit.embarkedIn && !unit.air && (unit.typeId === 'worker' || unit.stats?.engineer === true))
  );
  const buildTargetId = command => command?.type === 'build' ? (command.buildingId || command.targetId || null) : null;

  // Automatic construction in the legacy engineer initiative always carried either
  // autoEngineer130 or the initiative progress metadata. Direct player/AI allocation
  // of a specific engineer carries neither and is therefore treated as an explicit
  // assignment. This also catches old save commands where the auto flag was lost but
  // the initiative timestamps survived.
  const isAutomaticConstructionCommand = command => Boolean(
    command?.type === 'build' && !command?.[EXPLICIT_BUILD_FLAG] && (
      command?.[AUTO_FLAG] ||
      command?.repairOnlyInitiative ||
      command?.engineerInitiative === true ||
      command?.assignedAt130 != null ||
      command?.progressAt130 != null ||
      command?.bestSurfaceDistance130 != null
    )
  );

  function repairNeed(building) {
    if (!building?.alive || building.kind !== 'building' || !building.completed || building.team === 'neutral') return null;
    const construction = Number.isFinite(building.construction) ? building.construction : 1;
    if (construction < 1 - EPS) return null;
    const maxHp = Math.max(1, Number(building.maxHp) || 1);
    const hp = clamp(building.hp, 0, maxHp);
    const missingHp = maxHp - hp;
    if (missingHp <= Math.max(.5, maxHp * .001)) return null;
    return { purpose: 'repair', missing: missingHp / maxHp };
  }

  Game.prototype.ensureEngineerConstructionAssignments = function() {
    this[BUILD_ASSIGNMENTS] ||= new Map();
    return this[BUILD_ASSIGNMENTS];
  };

  Game.prototype.assignEngineerToConstruction = function(engineer, targetId) {
    if (!isEngineer(engineer) || !targetId) return false;
    const target = this.getEntity?.(targetId);
    if (!target?.alive || target.team !== engineer.team || target.kind !== 'building') return false;
    const assignments = this.ensureEngineerConstructionAssignments();
    let set = assignments.get(String(targetId));
    if (!set) { set = new Set(); assignments.set(String(targetId), set); }
    set.add(String(engineer.id));
    return true;
  };

  Game.prototype.releaseEngineerConstructionAssignment = function(engineer, targetId) {
    if (!engineer || !targetId || !this[BUILD_ASSIGNMENTS]) return false;
    const set = this[BUILD_ASSIGNMENTS].get(String(targetId));
    if (!set) return false;
    const removed = set.delete(String(engineer.id));
    if (!set.size) this[BUILD_ASSIGNMENTS].delete(String(targetId));
    return removed;
  };

  Game.prototype.engineersAssignedToConstruction = function(targetId) {
    const set = this[BUILD_ASSIGNMENTS]?.get(String(targetId));
    if (!set) return [];
    const out = [];
    for (const id of set) {
      const unit = this.getEntity?.(id);
      const commandTarget = buildTargetId(unit?.currentCommand);
      if (unit?.alive && isEngineer(unit) && String(commandTarget || '') === String(targetId)) out.push(String(id));
    }
    out.sort((a, b) => a.localeCompare(b, 'en'));
    return out;
  };

  Game.prototype.isEngineerAssignedToConstruction = function(engineer, targetId) {
    if (!isEngineer(engineer) || !targetId) return false;
    return this.engineersAssignedToConstruction(targetId).includes(String(engineer.id));
  };

  Game.prototype.findEngineerRepairTarget = function(engineer) {
    if (!isEngineer(engineer)) return null;
    const jamming = Number(this.getJammingFactor?.(engineer));
    const vision = Math.max(40, (Number(engineer.vision) || Number(engineer.stats?.vision) || 220) * (Number.isFinite(jamming) ? jamming : 1));
    const candidates = this.querySpatial?.(this.buildingSpatial, engineer.x, engineer.y, vision + 460) || this.buildings || [];
    let best = null, bestScore = -Infinity;
    for (const building of candidates) {
      if (!building?.alive || building.team !== engineer.team || building.team === 'neutral') continue;
      const need = repairNeed(building);
      if (!need) continue;
      const exact = this.getBuildingSurfaceDistance117?.(engineer, building);
      const surface = Number.isFinite(exact) ? Math.max(0, exact) : Math.max(0, distance(engineer, building) - (Number(building.radius) || 0));
      if (surface > vision) continue;
      const reservations = this.engineerReservationCount130?.(building.id) || 0;
      const score = need.missing * 3200 - surface * 1.5 - reservations * 90 + (building.stats?.weapon ? 420 : 0) + (Number(building.stats?.power) > 0 ? 360 : 0);
      if (score > bestScore) { bestScore = score; best = { building, need, surfaceDistance: surface, score }; }
    }
    return best;
  };

  // Engineer initiative is intentionally repair-only. Construction can only start
  // from a direct command to a particular engineer.
  Unit.prototype.tryEngineerInitiative130 = function(force = false) {
    if (!isEngineer(this)) return false;
    const current = this.currentCommand;
    const canInterrupt = !current || (current.type === 'attack' && current.autoEngage98);
    if (!canInterrupt) return false;
    const now = Number(this.game?.time) || 0;
    if (!force && now < (this.engineerScanAt130 ?? -Infinity)) return false;
    const stagger = (String(this.id).split('').reduce((s, c) => (s * 33 + c.charCodeAt(0)) >>> 0, 5381) % 9) * .041;
    this.engineerScanAt130 = now + .76 + stagger;
    const target = this.game?.findEngineerRepairTarget?.(this);
    if (!target?.building?.alive) return false;
    const command = {
      type: 'repair',
      targetId: target.building.id,
      [AUTO_FLAG]: true,
      repairOnlyInitiative: true,
      assignedAt130: now,
      progressAt130: now,
      bestSurfaceDistance130: target.surfaceDistance,
    };
    this.setCommand(command);
    return true;
  };

  const baseSetCommand = Unit.prototype.setCommand;
  Unit.prototype.setCommand = function(command, append = false) {
    if (isEngineer(this) && command?.type === 'build') {
      const targetId = buildTargetId(command);
      if (!targetId || isAutomaticConstructionCommand(command)) {
        this.engineerScanAt130 = Number(this.game?.time) || 0;
        return false;
      }
      // A direct command to this concrete unit is the explicit assignment authority.
      command[EXPLICIT_BUILD_FLAG] = true;
      this.game?.assignEngineerToConstruction?.(this, targetId);
    }
    return baseSetCommand.call(this, command, append);
  };

  const baseProcessCommand = Unit.prototype.processCommand;
  Unit.prototype.processCommand = function(command, dt) {
    if (isEngineer(this) && command?.type === 'build') {
      const targetId = buildTargetId(command);
      if (!targetId || isAutomaticConstructionCommand(command)) {
        this.game?.releaseEngineerCommand130?.(this, command);
        this.game?.releaseEngineerConstructionAssignment?.(this, targetId);
        this.finishCommand?.();
        this.engineerScanAt130 = Number(this.game?.time) || 0;
        return;
      }
      if (!command[EXPLICIT_BUILD_FLAG]) command[EXPLICIT_BUILD_FLAG] = true;
      this.game?.assignEngineerToConstruction?.(this, targetId);
      if (!this.game?.isEngineerAssignedToConstruction?.(this, targetId)) {
        this.finishCommand?.();
        return;
      }
    }
    return baseProcessCommand.call(this, command, dt);
  };

  const baseFinishCommand = Unit.prototype.finishCommand;
  Unit.prototype.finishCommand = function(...args) {
    const command = this.currentCommand;
    const targetId = buildTargetId(command);
    const result = baseFinishCommand.apply(this, args);
    if (isEngineer(this) && targetId) this.game?.releaseEngineerConstructionAssignment?.(this, targetId);
    return result;
  };

  const baseStop = Unit.prototype.stop;
  Unit.prototype.stop = function(...args) {
    if (isEngineer(this)) {
      for (const command of this.commandQueue || []) {
        const targetId = buildTargetId(command);
        if (targetId) this.game?.releaseEngineerConstructionAssignment?.(this, targetId);
      }
    }
    return baseStop.apply(this, args);
  };

  // Keep legacy callers compatible, but only return repair work to idle engineers.
  Game.prototype.findEngineerServiceTarget130 = function(engineer) {
    return this.findEngineerRepairTarget(engineer);
  };

  root.__FD_ENGINEER_COMMAND_CONTROL__ = Object.freeze({
    manualConstructionOnly: true,
    explicitConstructionAssignmentOnly: true,
    unassignedEngineersIgnoreConstruction: true,
    automaticConstructionDisabled: true,
    automaticRepairPreserved: true,
    legacyAutoBuildCancelledOnLoad: true,
    explicitBuildFlag: EXPLICIT_BUILD_FLAG,
    repairNeed,
    assignedTo(game, targetId) { return game?.engineersAssignedToConstruction?.(targetId) || []; },
    targetFor: engineer => engineer?.game?.findEngineerRepairTarget?.(engineer) || null,
  });
})();