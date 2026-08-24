(() => {
  'use strict';

  const debug = window.__FD_DEBUG__;
  const GameClass = debug?.Game;
  const UnitClass = debug?.Unit;
  if (!GameClass || !UnitClass) return;

  const VERSION = '13.0';
  const MAX_AUTO_ENGINEERS = 5;
  const MAX_BUILDING_EXTENT = 460;
  const AUTO_FLAG = 'autoEngineer130';
  const clamp130 = (value, min, max) => Math.max(min, Math.min(max, value));
  const hash130 = (value) => {
    let hash = 2166136261;
    for (const char of String(value || 'engineer')) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
    return hash >>> 0;
  };

  const isEngineer130 = (unit) => Boolean(
    unit?.alive && !unit.embarkedIn && !unit.air &&
    (unit.typeId === 'worker' || unit.stats?.engineer === true),
  );

  const serviceTargetId130 = (command) => {
    if (command?.type === 'build') return command.buildingId || command.targetId || null;
    if (command?.type === 'repair') return command.targetId || command.buildingId || null;
    return null;
  };

  const isServiceCommand130 = (command) => Boolean(serviceTargetId130(command));

  const serviceNeed130 = (building) => {
    if (!building?.alive || building.kind !== 'building' || building.team === 'neutral') return null;
    const construction = Number.isFinite(building.construction)
      ? clamp130(building.construction, 0, 1)
      : building.completed ? 1 : 0;
    if (!building.completed || construction < 1) {
      return { purpose: 'build', missing: 1 - construction };
    }
    const maxHp = Math.max(1, Number(building.maxHp) || 1);
    const hp = clamp130(Number(building.hp) || 0, 0, maxHp);
    const missingHp = maxHp - hp;
    const threshold = Math.max(.5, maxHp * .001);
    if (missingHp <= threshold) return null;
    return { purpose: 'repair', missing: missingHp / maxHp };
  };

  GameClass.prototype.ensureEngineerReservations130 = function() {
    this.engineerReservations130 ||= new Map();
    return this.engineerReservations130;
  };

  GameClass.prototype.pruneEngineerReservations130 = function(targetId) {
    const reservations = this.ensureEngineerReservations130();
    const assigned = reservations.get(targetId);
    if (!assigned) return null;
    for (const unitId of assigned) {
      const unit = this.getEntity(unitId);
      const stillAssigned = unit?.alive && unit.commandQueue?.some(
        (command) => isServiceCommand130(command) && serviceTargetId130(command) === targetId,
      );
      if (!stillAssigned) assigned.delete(unitId);
    }
    if (!assigned.size) {
      reservations.delete(targetId);
      return null;
    }
    return assigned;
  };

  GameClass.prototype.reserveEngineerCommand130 = function(unit, command) {
    const targetId = serviceTargetId130(command);
    if (!isEngineer130(unit) || !targetId) return false;
    const reservations = this.ensureEngineerReservations130();
    let assigned = reservations.get(targetId);
    if (!assigned) {
      assigned = new Set();
      reservations.set(targetId, assigned);
    }
    assigned.add(unit.id);
    return true;
  };

  GameClass.prototype.releaseEngineerCommand130 = function(unit, command) {
    const targetId = serviceTargetId130(command);
    if (!targetId || !this.engineerReservations130) return false;
    const assigned = this.engineerReservations130.get(targetId);
    if (!assigned) return false;
    assigned.delete(unit.id);
    if (!assigned.size) this.engineerReservations130.delete(targetId);
    return true;
  };

  GameClass.prototype.engineerReservationCount130 = function(targetId) {
    return this.pruneEngineerReservations130(targetId)?.size || 0;
  };

  GameClass.prototype.engineerTargetCapacity130 = function(building, engineer) {
    const footprint = this.getEntityBuildingFootprintAt?.(building, 0);
    const width = Number(footprint?.width) || Math.max(1, Number(footprint?.maxX) - Number(footprint?.minX)) || (building.radius || 45) * 2;
    const height = Number(footprint?.height) || Math.max(1, Number(footprint?.maxY) - Number(footprint?.minY)) || (building.radius || 45) * 2;
    const perimeter = Math.max(80, (width + height) * 2);
    const navigationRadius = this.getUnitNavigationRadius117?.(engineer) || engineer.radius || 15;
    const spacing = Math.max(210, navigationRadius * 7.5);
    return clamp130(Math.round(perimeter / spacing), 1, MAX_AUTO_ENGINEERS);
  };

  GameClass.prototype.engineerSurfaceDistance130 = function(engineer, building) {
    const exact = this.getBuildingSurfaceDistance117?.(engineer, building);
    if (Number.isFinite(exact)) return Math.max(0, exact);
    return Math.max(0, Math.hypot(building.x - engineer.x, building.y - engineer.y) - (building.radius || 0));
  };

  GameClass.prototype.engineerTargetPriority130 = function(engineer, building, need, surfaceDistance, assigned) {
    const stats = building.stats || {};
    let critical = 0;
    if (building.typeId === 'hq') critical += .72;
    if (Number(stats.power) > 0) critical += .58;
    if (stats.weapon || stats.category === 'defense') critical += .42;
    if (stats.produces?.length || stats.producesByFaction) critical += .32;
    if (stats.dropoff || stats.logisticsExtractor || stats.placeOnResource) critical += .26;
    const urgency = need.purpose === 'build'
      ? 2.2 + need.missing * 1.25
      : 1.08 + need.missing * 2.85;
    const stableTieBreak = (hash130(`${engineer.id}:${building.id}`) % 1000) / 100000;
    return (urgency + critical) * 1000 - surfaceDistance * 1.65 - assigned * 85 + stableTieBreak;
  };

  GameClass.prototype.findEngineerServiceTarget130 = function(engineer) {
    if (!isEngineer130(engineer)) return null;
    const jamming = Number(this.getJammingFactor?.(engineer));
    const vision = Math.max(40, (Number(engineer.vision) || Number(engineer.stats?.vision) || 220) * (Number.isFinite(jamming) ? jamming : 1));
    const candidates = this.querySpatial?.(this.buildingSpatial, engineer.x, engineer.y, vision + MAX_BUILDING_EXTENT)
      || this.buildings
      || [];
    const avoided = engineer.engineerAvoidTargets130;
    let best = null;
    let bestScore = -Infinity;
    for (const building of candidates) {
      if (!building?.alive || building.team !== engineer.team || building.team === 'neutral') continue;
      const need = serviceNeed130(building);
      if (!need) continue;
      const avoidUntil = avoided?.get(building.id) || 0;
      if (avoidUntil > (this.time || 0)) continue;
      if (avoidUntil && avoided) avoided.delete(building.id);
      const surfaceDistance = this.engineerSurfaceDistance130(engineer, building);
      if (surfaceDistance > vision) continue;
      const assigned = this.engineerReservationCount130(building.id);
      const capacity = this.engineerTargetCapacity130(building, engineer);
      if (assigned >= capacity) continue;
      const score = this.engineerTargetPriority130(engineer, building, need, surfaceDistance, assigned);
      if (score > bestScore) {
        best = { building, need, surfaceDistance, capacity, assigned, score };
        bestScore = score;
      }
    }
    return best;
  };

  UnitClass.prototype.assignEngineerService130 = function(target) {
    if (!isEngineer130(this) || !target?.building?.alive) return false;
    const command = target.need.purpose === 'build'
      ? { type: 'build', buildingId: target.building.id }
      : { type: 'repair', targetId: target.building.id };
    Object.assign(command, {
      [AUTO_FLAG]: true,
      assignedAt130: this.game.time || 0,
      progressAt130: this.game.time || 0,
      bestSurfaceDistance130: target.surfaceDistance,
    });
    this.setCommand(command);
    return true;
  };

  UnitClass.prototype.tryEngineerInitiative130 = function(force = false) {
    if (!isEngineer130(this)) return false;
    const current = this.currentCommand;
    const canInterrupt = !current || (current.type === 'attack' && current.autoEngage98);
    if (!canInterrupt) return false;
    const now = this.game.time || 0;
    if (!force && now < (this.engineerScanAt130 ?? -Infinity)) return false;
    const stagger = (hash130(this.id) % 9) * .041;
    this.engineerScanAt130 = now + .76 + stagger;
    const target = this.game.findEngineerServiceTarget130(this);
    if (!target) return false;
    return this.assignEngineerService130(target);
  };

  const baseSetCommand130 = UnitClass.prototype.setCommand;
  UnitClass.prototype.setCommand = function(command, append = false) {
    if (isEngineer130(this) && !append) {
      for (const queued of this.commandQueue || []) this.game.releaseEngineerCommand130(this, queued);
    }
    const result = baseSetCommand130.call(this, command, append);
    if (isEngineer130(this)) this.game.reserveEngineerCommand130(this, command);
    return result;
  };

  const baseStop130 = UnitClass.prototype.stop;
  UnitClass.prototype.stop = function(...args) {
    if (isEngineer130(this)) {
      for (const command of this.commandQueue || []) this.game.releaseEngineerCommand130(this, command);
      this.engineerScanAt130 = this.game.time || 0;
    }
    return baseStop130.apply(this, args);
  };

  const baseFinishCommand130 = UnitClass.prototype.finishCommand;
  UnitClass.prototype.finishCommand = function(...args) {
    const command = this.currentCommand;
    if (isEngineer130(this)) this.game.releaseEngineerCommand130(this, command);
    const result = baseFinishCommand130.apply(this, args);
    if (isEngineer130(this) && !this.currentCommand) {
      this.engineerScanAt130 = Math.min(this.engineerScanAt130 ?? Infinity, (this.game.time || 0) + .06);
    }
    return result;
  };

  const baseProcessCommand130 = UnitClass.prototype.processCommand;
  UnitClass.prototype.processCommand = function(command, dt) {
    if (!isEngineer130(this)) return baseProcessCommand130.call(this, command, dt);

    if (command?.type === 'attack' && command.autoEngage98 && this.tryEngineerInitiative130()) return;

    if (isServiceCommand130(command)) this.game.reserveEngineerCommand130(this, command);
    if (command?.[AUTO_FLAG]) {
      const targetId = serviceTargetId130(command);
      const target = this.game.getEntity(targetId);
      const need = target?.team === this.team ? serviceNeed130(target) : null;
      if (!need) {
        this.finishCommand();
        return;
      }

      const expectedType = need.purpose === 'build' ? 'build' : 'repair';
      if (command.type !== expectedType) {
        command.type = expectedType;
        if (expectedType === 'build') {
          command.buildingId = target.id;
          delete command.targetId;
        } else {
          command.targetId = target.id;
          delete command.buildingId;
        }
        this.clearInteractionState?.(command);
        this.invalidateNavigation?.();
      }

      const surfaceDistance = this.game.engineerSurfaceDistance130(this, target);
      if (!Number.isFinite(command.bestSurfaceDistance130) || surfaceDistance + 5 < command.bestSurfaceDistance130) {
        command.bestSurfaceDistance130 = surfaceDistance;
        command.progressAt130 = this.game.time || 0;
      }
      const ready = this.game.isBuildingInteractionReady117?.(this, target, need.purpose) || false;
      if (!ready && (this.game.time || 0) - (command.progressAt130 || command.assignedAt130 || 0) > 18) {
        this.engineerAvoidTargets130 ||= new Map();
        this.engineerAvoidTargets130.set(target.id, (this.game.time || 0) + 24);
        this.finishCommand();
        return;
      }
    }

    return baseProcessCommand130.call(this, command, dt);
  };

  const baseIdleBehavior130 = UnitClass.prototype.idleBehavior;
  UnitClass.prototype.idleBehavior = function(dt) {
    if (isEngineer130(this) && this.tryEngineerInitiative130()) return;
    return baseIdleBehavior130.call(this, dt);
  };

  if (typeof document !== 'undefined') {
    void 0;
    const eyebrow = document.querySelector?.('#start-screen .eyebrow');
    if (eyebrow) void 0;
    const lead = document.querySelector?.('#start-screen .lead');
    if (lead) void 0;
  }

  window.__FD_ENGINEER_INITIATIVE_V130__ = {
    version: VERSION,
    isEngineer: isEngineer130,
    serviceNeed: serviceNeed130,
    targetFor: (engineer) => engineer?.game?.findEngineerServiceTarget130(engineer) || null,
    reservationCount: (targetId) => debug.game?.engineerReservationCount130(targetId) || 0,
  };
})();
