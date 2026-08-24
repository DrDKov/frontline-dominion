(() => {
  'use strict';

  const debug = window.__FD_DEBUG__;
  const GameClass = debug?.Game;
  const UnitClass = debug?.Unit;
  const BuildingClass = debug?.Building;
  const TacticalAIClass = debug?.TacticalAI;
  if (!GameClass || !UnitClass || !BuildingClass || !TacticalAIClass) return;

  const VERSION = '12.7';
  const RECON_QUERY_RANGE = 2400;
  const RECON_TICK_RATE = 5;
  const clamp127 = (value, min, max) => Math.max(min, Math.min(max, value));
  const distance127 = (left, right) => Math.hypot((left?.x || 0) - (right?.x || 0), (left?.y || 0) - (right?.y || 0));
  const hash127 = (value) => {
    let hash = 2166136261;
    for (const char of String(value || 'unit')) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
    return hash >>> 0;
  };

  const isFixedWing127 = (unit) => Boolean(
    unit?.alive && unit.air && unit.stats?.mobilityClass === 'fixedWing' &&
    !/helicopter|lightGunship/i.test(`${unit.typeId || ''} ${unit.stats?.visualRole || ''}`),
  );

  const detectorRange127 = (entity) => {
    if (!entity?.alive || entity.embarkedIn) return 0;
    const detector = Math.max(Number(entity.detector) || 0, Number(entity.stats?.detector) || 0);
    const counterIntel = Number(entity.stats?.counterIntel) > 0
      ? Math.max(Number(entity.stats?.counterIntelRange) || 0, detector)
      : 0;
    return Math.max(detector, counterIntel);
  };

  const isDedicatedRecon127 = (game, entity) => {
    if (entity?.kind === 'building') return true;
    if (!(entity?.infantry || entity?.stats?.infantry)) return true;
    const role = game.unitVisualRole?.(entity) || entity.stats?.visualRole || '';
    const signature = `${entity.typeId || ''} ${role} ${entity.stats?.variant || ''} ${entity.stats?.role || ''}`;
    return entity.typeId === 'scout' || entity.stats?.variant === 'recon' || Number(entity.stats?.counterIntel) > 0 ||
      /recon|scout|infiltrator|развед|наблюд|контрразвед/i.test(signature);
  };

  GameClass.prototype.isReconSensorOperational127 = function(sensor, viewerTeam) {
    if (!sensor?.alive || sensor.team !== viewerTeam || detectorRange127(sensor) <= 0) return false;
    if (!isDedicatedRecon127(this, sensor)) return false;
    if (sensor.kind !== 'building') return !sensor.embarkedIn && sensor.airServiceState !== 'servicing';
    if (!sensor.completed || sensor.sabotagedUntil > this.time) return false;
    if (Number(sensor.stats?.powerUse) > 0 && this.isPowerGridOnline126) return this.isPowerGridOnline126(viewerTeam);
    if (Number(sensor.stats?.powerUse) > 0 && this.isStationaryDefensePowered) return this.isStationaryDefensePowered(sensor);
    return true;
  };

  GameClass.prototype.hasReconContact127 = function(viewerTeam, target, observer = null) {
    if (!target?.alive || !viewerTeam || target.team === viewerTeam || target.team === 'neutral') return false;
    const tick = Math.floor((Number(this.time) || 0) * RECON_TICK_RATE);
    target._reconContactCache127 ||= Object.create(null);
    const cached = target._reconContactCache127[viewerTeam];
    if (!observer && cached?.tick === tick) return cached.detected;

    const candidates = [];
    if (observer) candidates.push(observer);
    if (this.spatial?.queryRadius) {
      candidates.push(...this.spatial.queryRadius('sensors', target.x, target.y, RECON_QUERY_RANGE));
    } else {
      candidates.push(...(this.units || []), ...(this.buildings || []));
    }

    const constructionSignature = target.kind === 'unit' && target.currentCommand?.type === 'build' ? 1.30 : 1;
    const covertDifficulty = target.stats?.covertOps && constructionSignature === 1
      ? clamp127(.72 + (1 - (Number(target.coverIntegrity) || .75)) * .34, .68, 1.02)
      : 1;
    const seen = new Set();
    let detected = false;
    for (const sensor of candidates) {
      if (!sensor || seen.has(sensor.id)) continue;
      seen.add(sensor.id);
      if (!this.isReconSensorOperational127(sensor, viewerTeam)) continue;
      const range = detectorRange127(sensor) * constructionSignature * covertDifficulty * (this.getJammingFactor?.(sensor) || 1);
      if (distance127(sensor, target) <= range + (target.radius || 0)) {
        detected = true;
        break;
      }
    }
    target._reconContactCache127[viewerTeam] = { tick, detected };
    if (detected) target.reconRevealedUntil127 = Math.max(target.reconRevealedUntil127 || 0, (Number(this.time) || 0) + .34);
    return detected;
  };

  // Covert cover remains useful against ordinary troops. A scout, recon UAV,
  // radar vehicle or other explicit detector physically inside its range
  // breaks that cover, including engineers working on a visible foundation.
  const baseIsUndercover127 = GameClass.prototype.isUndercoverTo;
  GameClass.prototype.isUndercoverTo = function(unit, viewerTeam) {
    const undercover = baseIsUndercover127.call(this, unit, viewerTeam);
    return undercover && !this.hasReconContact127(viewerTeam, unit);
  };

  const baseIsTargetable127 = GameClass.prototype.isTargetableBy;
  GameClass.prototype.isTargetableBy = function(entity, viewerTeam, observer = null) {
    if (baseIsTargetable127.call(this, entity, viewerTeam, observer)) return true;
    if (!entity?.alive || entity.embarkedIn || entity.team === viewerTeam || entity.team === 'neutral') return false;
    return this.hasReconContact127(viewerTeam, entity, observer);
  };

  // Enemy construction used to progress by an invisible autoConstruct flag.
  // Every new foundation now waits for physical workers that can be scouted,
  // intercepted and killed on the way to the site.
  GameClass.prototype.assignEnemyBuilders127 = function(building) {
    if (!building?.alive || building.team !== 'enemy' || building.completed || !building.physicalConstruction127) return 0;
    const assigned = (this.units || []).filter((unit) => unit.alive && unit.team === 'enemy' && unit.typeId === 'worker' &&
      unit.currentCommand?.type === 'build' && unit.currentCommand.buildingId === building.id);
    const workers = (this.units || []).filter((unit) => unit.alive && unit.team === 'enemy' && unit.typeId === 'worker' && !unit.embarkedIn);
    if (!workers.length) return 0;
    const difficulty = this.difficultyKey || 'normal';
    const desired = difficulty === 'hard' ? 3 : difficulty === 'easy' ? 1 : 2;
    const reserve = workers.length > 2 ? 1 : 0;
    const capacity = Math.max(1, workers.length - reserve);
    const needed = Math.max(0, Math.min(desired, capacity) - assigned.length);
    if (!needed) return assigned.length;

    const commandPriority = (worker) => {
      const command = worker.currentCommand;
      if (!command) return 0;
      if (command.type === 'hold' || command.type === 'move') return 1;
      if (command.type === 'harvest') return 2;
      if (command.type === 'repair') return 3;
      return command.type === 'build' ? 20 : 8;
    };
    const assignedIds = new Set(assigned.map((unit) => unit.id));
    const candidates = workers
      .filter((worker) => !assignedIds.has(worker.id) && worker.currentCommand?.type !== 'build')
      .sort((left, right) => commandPriority(left) - commandPriority(right) || distance127(left, building) - distance127(right, building));
    for (const worker of candidates.slice(0, needed)) {
      worker.setCommand({ type: 'build', buildingId: building.id, aiConstruction127: true });
      worker.assignedConstructionId127 = building.id;
      assigned.push(worker);
    }
    building.visibleBuilderCount127 = assigned.length;
    return assigned.length;
  };

  const baseAddEntity127 = GameClass.prototype.addEntity;
  GameClass.prototype.addEntity = function(entity) {
    const physicalConstruction = Boolean(entity?.kind === 'building' && entity.team === 'enemy' && !entity.completed);
    if (physicalConstruction) {
      entity.autoConstruct = false;
      entity.physicalConstruction127 = true;
    }
    const result = baseAddEntity127.call(this, entity);
    if (physicalConstruction) this.assignEnemyBuilders127(entity);
    return result;
  };

  const baseAIUpdate127 = TacticalAIClass.prototype.update;
  TacticalAIClass.prototype.update = function(dt) {
    const result = baseAIUpdate127.call(this, dt);
    this.builderDispatchTimer127 = (this.builderDispatchTimer127 ?? 0) - dt;
    if (this.builderDispatchTimer127 <= 0) {
      this.builderDispatchTimer127 = .85;
      for (const building of this.game.buildings) {
        if (building.alive && building.team === 'enemy' && !building.completed) {
          building.autoConstruct = false;
          building.physicalConstruction127 = true;
          this.game.assignEnemyBuilders127(building);
        }
      }
    }
    return result;
  };

  // A free combat unit controls its whole useful sight bubble. Scans remain
  // staggered and use the existing spatial target cache, so this adds no
  // all-army per-frame search in 10k-v-10k battles.
  const baseAwarenessRadius127 = UnitClass.prototype.awarenessRadius98;
  UnitClass.prototype.awarenessRadius98 = function() {
    if (!this.stats?.weapon) return 0;
    const base = baseAwarenessRadius127?.call(this) || 0;
    return Math.max(base, this.stats.weapon.range * 1.42, Math.min(this.vision || 0, 1750), 280);
  };

  const baseProcessCommand127 = UnitClass.prototype.processCommand;
  UnitClass.prototype.processCommand = function(command, dt) {
    if (command?.type === 'attack' && command.autoEngage98 && !isFixedWing127(this)) {
      const target = this.game.getEntity(command.targetId);
      const leash = Math.max(720, this.awarenessRadius98() * 1.82);
      const anchorDistance = target ? Math.hypot(target.x - command.anchorX98, target.y - command.anchorY98) : Infinity;
      if (!target?.alive || !this.canAttack(target) || anchorDistance > leash) {
        this.finishCommand();
        return;
      }
      this.engageTarget(target, dt, true);
      return;
    }
    return baseProcessCommand127.call(this, command, dt);
  };

  UnitClass.prototype.getFixedWingPassPoint127 = function(target) {
    const weapon = this.stats?.weapon || {};
    const range = Math.max(260, Number(weapon.range) || 520);
    const distance = Math.max(1, distance127(this, target));
    const headingX = Math.cos(this.rotation || 0);
    const headingY = Math.sin(this.rotation || 0);
    const toX = target.x - this.x;
    const toY = target.y - this.y;
    const ahead = toX * headingX + toY * headingY;
    const passLength = Math.max(340, (this.stats?.speed || 260) * 1.9, (this.radius || 24) * 9);

    if (ahead > 0 && distance < range * .92) {
      return {
        x: this.x + headingX * passLength,
        y: this.y + headingY * passLength,
      };
    }

    const approach = Math.atan2(toY, toX);
    const side = (hash127(`${this.id}:${target.id}`) & 1) ? 1 : -1;
    const standOff = Math.max((Number(weapon.minRange) || 0) + 90, range * .46);
    const lateral = Math.max(95, range * .20) * side;
    return {
      x: target.x - Math.cos(approach) * standOff - Math.sin(approach) * lateral,
      y: target.y - Math.sin(approach) * standOff + Math.cos(approach) * lateral,
    };
  };

  // Fixed-wing aircraft perform repeated attack passes. Their hull follows the
  // flight path while the weapon tracks independently; neither guns nor missile
  // launches can turn the aircraft into a hovering stationary turret.
  const baseEngageTarget127 = UnitClass.prototype.engageTarget;
  UnitClass.prototype.engageTarget = function(target, dt, chase = true, allowMove = true) {
    if (!isFixedWing127(this) || this.airServiceState) return baseEngageTarget127.call(this, target, dt, chase, allowMove);
    if (!this.canAttack(target)) return false;
    const weapon = this.stats.weapon;
    const effectiveRange = weapon.range * this.game.getJammingFactor(this);
    const targetDistance = distance127(this, target) - this.radius - target.radius;
    const pass = this.getFixedWingPassPoint127(target);
    this.moveToward(pass.x, pass.y, dt, 1, { dynamic: true });
    this.movingFireTargetId91 = target.id;
    this.tryFireWhileMoving91?.(dt);
    return targetDistance <= effectiveRange && targetDistance >= (weapon.minRange || 0);
  };

  const baseUnitUpdate127 = UnitClass.prototype.update;
  UnitClass.prototype.update = function(dt) {
    const startX = this.x;
    const startY = this.y;
    const result = baseUnitUpdate127.call(this, dt);
    if (isFixedWing127(this) && !this.airServiceState) {
      const moving = Math.hypot(this.x - startX, this.y - startY) > .02;
      const command = this.currentCommand;
      if (moving || !command || command.type === 'hold') this.tryFireWhileMoving91?.(dt);
    }
    return result;
  };

  void 0;
  const eyebrow = document.querySelector('#start-screen .eyebrow');
  if (eyebrow) void 0;
  const lead = document.querySelector('#start-screen .lead');
  if (lead) void 0;

  window.__FD_COMBAT_INITIATIVE_V127__ = {
    version: VERSION,
    isFixedWing: isFixedWing127,
    detectorRange: detectorRange127,
    reconContact: (team, target, observer = null) => Boolean(debug.game?.hasReconContact127(team, target, observer)),
    builders: (building) => debug.game?.assignEnemyBuilders127(building) || 0,
  };
})();
