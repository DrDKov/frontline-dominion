(() => {
  'use strict';

  const debug = window.__FD_DEBUG__;
  const GameClass = debug?.Game;
  const UnitClass = debug?.Unit;
  const WORLD = debug?.WORLD || { width: 32000, height: 22000 };
  if (!GameClass || !UnitClass || !window.__FD_AIR_WAR_NAVIGATION_V133__) return;

  const VERSION = '13.5';
  const TARGET_LIMIT = 144;
  const MISSION_TYPES = new Set(['move', 'attackMove', 'attack', 'patrol', 'guard', 'hold', 'formation']);
  const clamp134 = (value, min, max) => Math.max(min, Math.min(max, value));
  const distance134 = (left, right) => Math.hypot((left?.x || 0) - (right?.x || 0), (left?.y || 0) - (right?.y || 0));
  const hash134 = (value) => {
    let hash = 2166136261;
    for (const char of String(value || 'air')) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
    return hash >>> 0;
  };
  const isFixedWing134 = (unit) => Boolean(
    unit?.alive && unit.air && unit.stats?.mobilityClass === 'fixedWing' &&
    !/helicopter|lightGunship|transportHelicopter/i.test(`${unit.typeId || ''} ${unit.stats?.visualRole || ''}`),
  );
  const airRole134 = (game, unit) => game.unitVisualRole?.(unit) || unit?.stats?.visualRole || '';
  const pointSegmentDistance134 = (point, start, end) => {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lengthSquared = dx * dx + dy * dy;
    if (lengthSquared < 1e-6) return distance134(point, start);
    const t = clamp134(((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared, 0, 1);
    return Math.hypot(point.x - (start.x + dx * t), point.y - (start.y + dy * t));
  };
  const fsm134 = (unit) => {
    unit._airFsm133 ||= {
      state: 'search', enteredAt: unit.game.time || 0, targetId: null,
      anchorX: unit.x, anchorY: unit.y, orbitAngle: unit.rotation || 0,
      lastDistance: Infinity, lastProgressAt: unit.game.time || 0,
    };
    return unit._airFsm133;
  };
  const layerAllowed134 = (unit, target) => {
    if (!target?.alive || target.team === unit.team || target.team === 'neutral' || !unit.stats?.weapon) return false;
    return unit.stats.weapon.targets?.includes(target.air ? 'air' : 'ground');
  };
  const roleAllows134 = (game, unit, target, explicit = false) => {
    if (!layerAllowed134(unit, target)) return false;
    const role = airRole134(game, unit);
    if (['bomber', 'heavyBomber', 'stealthStriker', 'aerialArtillery'].includes(role) && target.air) return false;
    if (role === 'interceptor' && !target.air && !explicit) return false;
    return true;
  };

  const ensureCommandMetadata134 = (unit, command) => {
    if (!command || !MISSION_TYPES.has(command.type)) return command;
    if (!command.airMissionId134) {
      unit._airMissionSerial134 = (unit._airMissionSerial134 || 0) + 1;
      command.airMissionId134 = `${unit.id}:${unit._airMissionSerial134}:${command.type}`;
    }
    if (!Number.isFinite(command.airOriginX134)) command.airOriginX134 = unit.x;
    if (!Number.isFinite(command.airOriginY134)) command.airOriginY134 = unit.y;
    if (command.type === 'hold') {
      if (!Number.isFinite(command.x)) command.x = unit.x;
      if (!Number.isFinite(command.y)) command.y = unit.y;
    }
    if (command.type === 'patrol') {
      if (!Number.isFinite(command.ax)) command.ax = command.airOriginX134;
      if (!Number.isFinite(command.ay)) command.ay = command.airOriginY134;
      if (!Number.isFinite(command.bx)) command.bx = Number.isFinite(command.x) ? command.x : unit.x;
      if (!Number.isFinite(command.by)) command.by = Number.isFinite(command.y) ? command.y : unit.y;
    }
    return command;
  };

  GameClass.prototype.getAircraftMissionAnchor134 = function(unit, command = unit?.currentCommand) {
    const fsm = fsm134(unit);
    if (!command) return { x: fsm.anchorX, y: fsm.anchorY };
    ensureCommandMetadata134(unit, command);
    const formationId = command.formationGroupId || command.formationId;
    if (formationId) {
      const group = this.formations?.get?.(formationId);
      const slot = group && (this.getFormationSlotWorld?.(group, unit)
        || this.getFormationSlotTarget?.(formationId, unit.id));
      if (slot && Number.isFinite(slot.x) && Number.isFinite(slot.y)) return { x: slot.x, y: slot.y };
    }
    if (command.type === 'guard') {
      const guarded = this.getEntity?.(command.targetId);
      if (guarded?.alive) return { x: guarded.x, y: guarded.y };
    }
    if (command.type === 'patrol') return command.phase
      ? { x: command.ax, y: command.ay }
      : { x: command.bx, y: command.by };
    if (command.type === 'attack') {
      const target = this.getEntity?.(command.targetId);
      if (target?.alive && (!this.isTargetableBy || this.isTargetableBy(target, unit.team, unit))) {
        command.airLastTargetX134 = target.x;
        command.airLastTargetY134 = target.y;
        return { x: target.x, y: target.y };
      }
      if (Number.isFinite(command.airLastTargetX134) && Number.isFinite(command.airLastTargetY134)) {
        return { x: command.airLastTargetX134, y: command.airLastTargetY134 };
      }
    }
    if (Number.isFinite(command.x) && Number.isFinite(command.y)) return { x: command.x, y: command.y };
    return { x: fsm.anchorX, y: fsm.anchorY };
  };

  GameClass.prototype.getAircraftMissionLeash134 = function(unit, command = unit?.currentCommand) {
    const vision = Math.max(300, Number(unit?.vision) || Number(unit?.stats?.vision) || 0);
    const weaponRange = Math.max(200, Number(unit?.stats?.weapon?.range) || 0);
    switch (command?.type) {
      case 'attackMove': return Math.max(1100, vision * 1.55, weaponRange * 2.15);
      case 'patrol': return Math.max(940, vision * 1.42, weaponRange * 1.95);
      case 'guard': return Math.max(880, vision * 1.35, weaponRange * 1.85);
      case 'move': return Math.max(760, vision * 1.25, weaponRange * 1.65);
      case 'formation': return Math.max(820, vision * 1.28, weaponRange * 1.72);
      default: return Math.max(720, vision * 1.22, weaponRange * 1.60);
    }
  };

  GameClass.prototype.isAircraftTargetWithinMission134 = function(unit, target, command = unit?.currentCommand, explicit = false) {
    if (!target?.alive || !isFixedWing134(unit)) return false;
    if (explicit && command?.type === 'attack' && command.targetId === target.id) return true;
    const leash = this.getAircraftMissionLeash134(unit, command);
    const fsm = fsm134(unit);
    if (fsm.targetId === target.id && Number.isFinite(fsm.engagedAt134) && (this.time || 0) - fsm.engagedAt134 > 42) return false;
    const retention = Math.max(1900, leash * 1.85);
    if (distance134(unit, target) > retention) return false;
    if (!command || command.type === 'hold') {
      const center = this.getAircraftMissionAnchor134(unit, command);
      return distance134(target, center) <= leash;
    }
    if (command.type === 'guard') {
      const center = this.getAircraftMissionAnchor134(unit, command);
      return distance134(target, center) <= leash;
    }
    if (command.type === 'patrol') {
      return pointSegmentDistance134(target, { x: command.ax, y: command.ay }, { x: command.bx, y: command.by }) <= leash;
    }
    if (['move', 'attackMove', 'formation'].includes(command.type)) {
      const end = this.getAircraftMissionAnchor134(unit, command);
      const start = { x: command.airOriginX134, y: command.airOriginY134 };
      return pointSegmentDistance134(target, start, end) <= leash;
    }
    if (command.type === 'attack') {
      const center = this.getAircraftMissionAnchor134(unit, command);
      return distance134(target, center) <= leash;
    }
    return distance134(unit, target) <= leash;
  };

  GameClass.prototype.isAircraftMissionTargetValid134 = function(unit, target, command = unit?.currentCommand, explicit = false) {
    if (!roleAllows134(this, unit, target, explicit)) return false;
    if (this.isTargetableBy && !this.isTargetableBy(target, unit.team, unit)) return false;
    return this.isAircraftTargetWithinMission134(unit, target, command, explicit);
  };

  UnitClass.prototype.prepareAircraftMission134 = function(command = this.currentCommand) {
    if (!isFixedWing134(this)) return null;
    ensureCommandMetadata134(this, command);
    const fsm = fsm134(this);
    const token = command?.airMissionId134 || 'idle';
    if (fsm.missionId134 === token) return fsm;
    fsm.missionId134 = token;
    fsm.targetId = command?.type === 'attack' ? command.targetId || null : null;
    fsm.engagedAt134 = 0;
    fsm.engageOriginX134 = this.x;
    fsm.engageOriginY134 = this.y;
    const anchor = this.game.getAircraftMissionAnchor134(this, command);
    fsm.anchorX = clamp134(anchor.x, 180, WORLD.width - 180);
    fsm.anchorY = clamp134(anchor.y, 180, WORLD.height - 180);
    fsm.state = command?.type === 'attack' ? 'ingress' : command ? 'transit' : 'hold';
    fsm.enteredAt = this.game.time || 0;
    fsm.lastDistance = Infinity;
    fsm.lastProgressAt = this.game.time || 0;
    delete fsm.x;
    delete fsm.y;
    delete fsm.egressUntil;
    delete fsm.evadeUntil;
    this.airOrbitCenter = null;
    this.movingFireTargetId91 = null;
    return fsm;
  };

  const baseSetCommand134 = UnitClass.prototype.setCommand;
  UnitClass.prototype.setCommand = function(command, append = false) {
    if (isFixedWing134(this)) ensureCommandMetadata134(this, command);
    const result = baseSetCommand134.call(this, command, append);
    if (isFixedWing134(this) && this.currentCommand === command) this.prepareAircraftMission134(command);
    return result;
  };

  const targetScore134 = (game, unit, target, range) => {
    const role = airRole134(game, unit);
    const d = distance134(unit, target);
    let score = 1800 - d / Math.max(1, range) * 720;
    if (role === 'interceptor') score += target.air ? 1050 : -1200;
    else if (role === 'multirole') score += target.air ? 520 : target.vehicle ? 320 : 180;
    else if (['bomber', 'heavyBomber'].includes(role)) {
      score += target.kind === 'building' ? 620 : target.vehicle ? 210 : 40;
      if (target.kind === 'building' && ['power', 'fusionPlant', 'airfield', 'advancedAirfield', 'factory', 'heavyFactory', 'hq'].includes(target.typeId)) score += 440;
    } else score += target.vehicle ? 320 : target.kind === 'building' ? 210 : 130;
    return score + (hash134(`${unit.id}:${target.id}`) % 1000) / 10000;
  };

  GameClass.prototype.findAircraftTarget133 = function(unit, macro = false) {
    if (!isFixedWing134(unit) || !unit.stats?.weapon || unit.airServiceState) return null;
    const command = unit._activeAirCommand134 || unit.currentCommand || null;
    unit.prepareAircraftMission134(command);
    const role = airRole134(this, unit);
    const weapon = unit.stats.weapon;
    const layers = role === 'interceptor'
      ? ['air']
      : ['bomber', 'heavyBomber', 'stealthStriker', 'aerialArtillery'].includes(role)
        ? ['ground']
        : [...(weapon.targets || [])];
    const range = Math.min(2600, Math.max(720, Number(unit.vision) || 0, (Number(weapon.range) || 0) * (macro ? 1.42 : 1.62)));
    let best = null;
    let bestScore = -Infinity;
    let examined = 0;
    const consider = (target) => {
      if (!target || examined >= TARGET_LIMIT) return;
      examined += 1;
      if (!this.isAircraftMissionTargetValid134(unit, target, command, false) || target.embarkedIn) return;
      if (distance134(unit, target) > range + (target.radius || 0)) return;
      const score = targetScore134(this, unit, target, range);
      if (score > bestScore) { best = target; bestScore = score; }
    };

    // The shared combat grid supplies an immediate nearest visible contact.
    // Rotating bounded samples below retain role-aware prioritisation without
    // letting a dense friendly formation permanently hide every hostile.
    consider(this.findNearestEnemy?.(unit.x, unit.y, unit.team, range, layers, unit));
    const units = this.spatial?.queryRadius?.('units', unit.x, unit.y, range)
      || this.querySpatial?.(this.unitSpatial, unit.x, unit.y, range) || [];
    const buildings = layers.includes('ground')
      ? this.spatial?.queryRadius?.('buildings', unit.x, unit.y, range)
        || this.querySpatial?.(this.buildingSpatial, unit.x, unit.y, range) || []
      : [];
    const phase = Math.floor((this.time || 0) * 3.2);
    const scan = (source, budget, salt) => {
      if (!source.length || examined >= TARGET_LIMIT) return;
      const stride = Math.max(1, Math.ceil(source.length / Math.max(1, budget)));
      const offset = (hash134(`${unit.id}:${salt}`) + phase) % stride;
      let visited = 0;
      for (let index = offset; index < source.length && visited < budget && examined < TARGET_LIMIT; index += stride) {
        consider(source[index]);
        visited += 1;
      }
    };
    scan(units, 104, 'units');
    scan(buildings, 40, 'buildings');
    this._v134Metrics ||= Object.create(null);
    this._v134Metrics.targetScans = (this._v134Metrics.targetScans || 0) + 1;
    this._v134Metrics.candidatesExamined = (this._v134Metrics.candidatesExamined || 0) + examined;
    return best;
  };

  const baseMission134 = UnitClass.prototype.processFixedWingMission133;
  UnitClass.prototype.processFixedWingMission133 = function(command, dt) {
    if (!isFixedWing134(this)) return baseMission134.call(this, command, dt);
    let active = command || null;
    const formationId134 = active?.formationGroupId || active?.formationId;
    let formation134 = formationId134 ? this.game.formations?.get?.(formationId134) : null;
    if (formation134) this.game.ensureFormationGroupUpdated?.(formation134, dt);
    else if (formationId134) {
      delete active.formationGroupId;
      delete active.formationId;
    }
    let fsm = this.prepareAircraftMission134(active);

    if (active?.type === 'attack') {
      const direct = this.game.getEntity?.(active.targetId);
      if (!direct?.alive || direct.team === this.team || !roleAllows134(this.game, this, direct, true)) {
        fsm.targetId = null;
        if (this.currentCommand === active) this.finishCommand?.();
        fsm.missionId134 = null;
        const next = this.currentCommand;
        return next && next !== active
          ? this.processFixedWingMission133(next, dt)
          : this.processFixedWingMission133(null, dt);
      }
      if (!this.game.isTargetableBy || this.game.isTargetableBy(direct, this.team, this)) {
        active.airLastTargetX134 = direct.x;
        active.airLastTargetY134 = direct.y;
      } else {
        const last = this.game.getAircraftMissionAnchor134(this, active);
        this._airLostContactCommand134 ||= { type: 'attackMove' };
        Object.assign(this._airLostContactCommand134, {
          x: last.x, y: last.y,
          airOriginX134: active.airOriginX134, airOriginY134: active.airOriginY134,
          airMissionId134: active.airMissionId134,
        });
        active = this._airLostContactCommand134;
      }
    } else if (active?.type === 'guard') {
      const guarded = this.game.getEntity?.(active.targetId);
      if (!guarded?.alive || guarded.team !== this.team) {
        fsm.targetId = null;
        if (this.currentCommand === active) this.finishCommand?.();
        fsm.missionId134 = null;
        const next = this.currentCommand;
        return next && next !== active
          ? this.processFixedWingMission133(next, dt)
          : this.processFixedWingMission133(null, dt);
      }
    }

    const tracked = this.game.getEntity?.(fsm.targetId);
    const explicit = Boolean(command?.type === 'attack' && command.targetId === tracked?.id);
    if (tracked && !this.game.isAircraftMissionTargetValid134(this, tracked, command, explicit)) {
      fsm.targetId = null;
      // Complete the already committed weapon-release/escape leg even if the
      // target dies. Cancelling that leg made aircraft snap back over the
      // defended target instead of exiting the threat envelope.
      if (!['release', 'egress', 'evade'].includes(fsm.state)) {
        fsm.state = 'transit';
        fsm.enteredAt = this.game.time || 0;
        this.airOrbitCenter = null;
      }
    }

    if (!active) {
      this._airIdleCommand134 ||= { type: 'hold', airMissionId134: 'idle' };
      Object.assign(this._airIdleCommand134, { x: fsm.anchorX, y: fsm.anchorY });
      active = this._airIdleCommand134;
    }
    const waypointAnchor134 = command && this.currentCommand === command &&
      ['move', 'attackMove', 'formation'].includes(command.type)
      ? this.game.getAircraftMissionAnchor134(this, command)
      : null;
    formation134 = formationId134 ? this.game.formations?.get?.(formationId134) : null;
    const waypointReached134 = Boolean(waypointAnchor134 &&
      (!formation134 || formation134.completed) && distance134(this, waypointAnchor134) <= 180);
    const targetBefore = fsm.targetId;
    this._activeAirCommand134 = active;
    let result;
    try {
      result = baseMission134.call(this, active, dt);
    } finally {
      this._activeAirCommand134 = null;
    }
    fsm = fsm134(this);
    if (fsm.targetId && fsm.targetId !== targetBefore) {
      fsm.engagedAt134 = this.game.time || 0;
      fsm.engageOriginX134 = this.x;
      fsm.engageOriginY134 = this.y;
      this.game._v134Metrics ||= Object.create(null);
      this.game._v134Metrics.autoEngagements = (this.game._v134Metrics.autoEngagements || 0) + 1;
    }
    // A waypoint is a real order, not a permanent orbit command. Completing
    // it advances an appended route; with no next order the freshly captured
    // mission anchor becomes the aircraft's stable holding point.
    if (waypointAnchor134 && this.currentCommand === command && !fsm.targetId &&
      (waypointReached134 || !formation134 && distance134(this, waypointAnchor134) <= 180)) {
      fsm.anchorX = waypointAnchor134.x;
      fsm.anchorY = waypointAnchor134.y;
      this.finishCommand?.();
      fsm.missionId134 = null;
      this.airOrbitCenter = null;
    }
    return result;
  };

  // Persist only authoritative mission metadata; transient lost-contact
  // shadows are reconstructed on demand.
  const baseSerialize134 = UnitClass.prototype.serialize;
  if (baseSerialize134) UnitClass.prototype.serialize = function() {
    const data = baseSerialize134.call(this);
    if (isFixedWing134(this)) data.airMissionSerial134 = this._airMissionSerial134 || 0;
    return data;
  };

  const baseHydrate134 = GameClass.prototype.hydrate;
  if (baseHydrate134) GameClass.prototype.hydrate = function(data) {
    const result = baseHydrate134.call(this, data);
    const saved = new Map((data?.entities || []).map((entity) => [entity.id, entity]));
    for (const unit of this.units || []) {
      if (!isFixedWing134(unit)) continue;
      unit._airMissionSerial134 = saved.get(unit.id)?.airMissionSerial134 || unit._airMissionSerial134 || 0;
      if (unit._airFsm133) unit._airFsm133.missionId134 = null;
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
    if (strip && !strip.querySelector?.('[data-air-command134-feature]')) {
      void 0;
    }
  }

  window.__FD_AIR_COMMAND_DOCTRINE_V134__ = {
    version: VERSION,
    isFixedWing: isFixedWing134,
    get metrics() { return debug.game?._v134Metrics || null; },
  };
})();
