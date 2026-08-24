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

  const AUTO_FLAG = 'autoEngineer130';
  const EPS = 1e-6;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, Number(v) || 0));
  const hash = value => {
    let h = 2166136261 >>> 0;
    for (const c of String(value ?? 'engineer')) {
      h ^= c.charCodeAt(0);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  };

  const isEngineer = unit => Boolean(
    legacy.isEngineer?.(unit) ||
    (unit?.alive && !unit.embarkedIn && !unit.air && (unit.typeId === 'worker' || unit.stats?.engineer === true))
  );

  function repairNeed(building) {
    if (!building?.alive || building.kind !== 'building' || !building.completed || building.team === 'neutral') return null;
    const construction = Number.isFinite(building.construction) ? building.construction : 1;
    if (construction < 1 - EPS) return null;
    const maxHp = Math.max(1, Number(building.maxHp) || 1);
    const hp = clamp(building.hp, 0, maxHp);
    const missingHp = maxHp - hp;
    const threshold = Math.max(.5, maxHp * .001);
    if (missingHp <= threshold) return null;
    return { purpose: 'repair', missing: missingHp / maxHp };
  }

  Game.prototype.findEngineerRepairTarget = function(engineer) {
    if (!isEngineer(engineer)) return null;
    const jamming = Number(this.getJammingFactor?.(engineer));
    const vision = Math.max(40, (Number(engineer.vision) || Number(engineer.stats?.vision) || 220) * (Number.isFinite(jamming) ? jamming : 1));
    const candidates = this.querySpatial?.(this.buildingSpatial, engineer.x, engineer.y, vision + 460) || this.buildings || [];
    const avoided = engineer.engineerAvoidTargets130;
    let best = null;
    let bestScore = -Infinity;
    for (const building of candidates) {
      if (!building?.alive || building.team !== engineer.team) continue;
      const need = repairNeed(building);
      if (!need) continue;
      const avoidUntil = Number(avoided?.get?.(building.id)) || 0;
      if (avoidUntil > (Number(this.time) || 0)) continue;
      if (avoidUntil && avoided?.delete) avoided.delete(building.id);
      const surfaceDistance = Number(this.engineerSurfaceDistance130?.(engineer, building));
      const distance = Number.isFinite(surfaceDistance)
        ? Math.max(0, surfaceDistance)
        : Math.max(0, Math.hypot((building.x || 0) - (engineer.x || 0), (building.y || 0) - (engineer.y || 0)) - (building.radius || 0));
      if (distance > vision) continue;
      const assigned = Number(this.engineerReservationCount130?.(building.id)) || 0;
      const capacity = Math.max(1, Number(this.engineerTargetCapacity130?.(building, engineer)) || 1);
      if (assigned >= capacity) continue;
      let critical = 0;
      const stats = building.stats || {};
      if (building.typeId === 'hq') critical += .72;
      if (Number(stats.power) > 0) critical += .58;
      if (stats.weapon || stats.category === 'defense') critical += .42;
      if (stats.produces?.length || stats.producesByFaction) critical += .32;
      if (stats.dropoff || stats.logisticsExtractor || stats.placeOnResource) critical += .26;
      const tie = (hash(`${engineer.id}:${building.id}`) % 1000) / 100000;
      const score = (1.08 + need.missing * 2.85 + critical) * 1000 - distance * 1.65 - assigned * 85 + tie;
      if (score > bestScore) {
        best = { building, need, surfaceDistance: distance, capacity, assigned, score };
        bestScore = score;
      }
    }
    return best;
  };

  // Replace only automatic initiative. Explicit player/AI build commands remain
  // ordinary `build` commands and are intentionally untouched.
  Unit.prototype.tryEngineerInitiative130 = function(force = false) {
    if (!isEngineer(this)) return false;
    const current = this.currentCommand;
    const canInterrupt = !current || (current.type === 'attack' && current.autoEngage98);
    if (!canInterrupt) return false;
    const now = Number(this.game?.time) || 0;
    if (!force && now < (Number(this.engineerScanAt130) || -Infinity)) return false;
    const stagger = (hash(this.id) % 9) * .041;
    this.engineerScanAt130 = now + .76 + stagger;
    const target = this.game?.findEngineerRepairTarget?.(this);
    if (!target?.building?.alive) return false;
    const command = {
      type: 'repair',
      targetId: target.building.id,
      [AUTO_FLAG]: true,
      assignedAt130: now,
      progressAt130: now,
      bestSurfaceDistance130: target.surfaceDistance,
      repairOnlyInitiative: true,
    };
    this.setCommand(command);
    return true;
  };

  const baseSetCommand = Unit.prototype.setCommand;
  Unit.prototype.setCommand = function(command, append = false) {
    if (isEngineer(this) && command?.[AUTO_FLAG] && command.type === 'build') {
      // Old code or a hydrated legacy helper must never create a new automatic
      // construction assignment. Manual build commands have no AUTO_FLAG.
      this.engineerScanAt130 = Math.min(Number(this.engineerScanAt130) || Infinity, (Number(this.game?.time) || 0) + .06);
      return false;
    }
    return baseSetCommand.call(this, command, append);
  };

  const baseProcessCommand = Unit.prototype.processCommand;
  Unit.prototype.processCommand = function(command, dt) {
    if (isEngineer(this) && command?.[AUTO_FLAG] && command.type === 'build') {
      // Save compatibility: discard historical automatic construction orders
      // after load, then let repair-only initiative resume normally.
      this.game?.releaseEngineerCommand130?.(this, command);
      this.finishCommand?.();
      this.engineerScanAt130 = Math.min(Number(this.engineerScanAt130) || Infinity, (Number(this.game?.time) || 0) + .06);
      return;
    }
    return baseProcessCommand.call(this, command, dt);
  };

  // Any diagnostic/external caller that asks for an automatic service target
  // should see the new contract as well: automatic service means repair only.
  Game.prototype.findEngineerServiceTarget130 = function(engineer) {
    return this.findEngineerRepairTarget(engineer);
  };

  root.__FD_ENGINEER_COMMAND_CONTROL__ = Object.freeze({
    manualConstructionOnly: true,
    automaticConstructionDisabled: true,
    automaticRepairPreserved: true,
    legacyAutoBuildCancelledOnLoad: true,
    repairNeed,
    targetFor: engineer => engineer?.game?.findEngineerRepairTarget?.(engineer) || null,
  });
})();
