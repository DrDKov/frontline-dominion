(() => {
  'use strict';

  const debug = window.__FD_DEBUG__;
  const GameClass = debug?.Game;
  const UnitClass = debug?.Unit;
  const BuildingClass = debug?.Building;
  const ProjectileClass = debug?.Projectile;
  const TacticalAIClass = debug?.TacticalAI;
  const UNIT_TYPES = debug?.UNIT_TYPES;
  const BUILDING_TYPES = debug?.BUILDING_TYPES;
  const POWER_TYPES = debug?.POWER_TYPES || {};
  const WORLD = debug?.WORLD;
  if (!GameClass || !UnitClass || !BuildingClass || !ProjectileClass || !TacticalAIClass || !UNIT_TYPES || !BUILDING_TYPES || !WORLD) return;

  const VERSION = '15.0';
  const BUILD = 166;
  const TWO_PI = Math.PI * 2;
  const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
  const clamp141 = (value, min, max) => Math.max(min, Math.min(max, value));
  const distance141 = (a, b) => Math.hypot((a?.x || 0) - (b?.x || 0), (a?.y || 0) - (b?.y || 0));
  const finitePoint141 = (value) => value && Number.isFinite(value.x) && Number.isFinite(value.y);
  const hash141 = (value) => {
    let hash = 2166136261;
    for (const character of String(value)) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
    return hash >>> 0;
  };
  const copyCommand141 = (command) => command ? { ...command } : null;
  const isEngineer141 = (unit) => Boolean(unit?.kind === 'unit' && (unit.typeId === 'worker' || unit.stats?.engineering || unit.stats?.visualRole === 'engineer'));
  const isFixedWing141 = (unit) => Boolean(unit?.air && (unit.stats?.mobilityClass === 'fixedWing' || unit.typeId === 'strategicAirlifter' || (!['helicopter', 'transportHelicopter', 'repairDrone'].includes(unit.typeId) && unit.stats?.visualRole !== 'transportHelicopter')));
  const isInfiltrator141 = (unit) => Boolean(unit?.kind === 'unit' && unit.infantry && (unit.stats?.covertOps || unit.stats?.stealth));
  const isGroundCombat141 = (unit) => Boolean(unit?.alive && !unit.air && !unit.embarkedIn && unit.stats?.weapon && !isEngineer141(unit));
  const isAircraftCombat141 = (unit) => Boolean(unit?.alive && unit.air && !unit.embarkedIn && unit.stats?.weapon);
  const roleText141 = (entry) => `${entry?.typeId || ''} ${entry?.stats?.visualRole || entry?.visualRole || ''} ${entry?.stats?.role || entry?.role || ''} ${entry?.stats?.name || entry?.name || ''}`.toLowerCase();

  // -------------------------------------------------------------------------
  // Static doctrine data: transport, aircraft speeds, missile range and AA.
  // These mutations happen before the first Game instance is constructed.
  // -------------------------------------------------------------------------
  if (UNIT_TYPES.resourceTruck) {
    UNIT_TYPES.resourceTruck.transportCapacity = Math.max(10, Number(UNIT_TYPES.resourceTruck.transportCapacity) || 0);
    UNIT_TYPES.resourceTruck.transportRule = 'infantry';
    UNIT_TYPES.resourceTruck.role = `${UNIT_TYPES.resourceTruck.role || 'Ресурсный грузовик.'} Перевозит до 10 пехотинцев.`;
  }

  const inferAirRole141 = (stats, typeId = '') => {
    // Determine the airframe from stable identity fields, not from descriptive
    // prose. Recon variants mention "early interception" in their role text;
    // treating that phrase as the airframe used to turn bombers into fighters.
    const id = String(typeId || stats?.id || '').toLowerCase();
    const identity = `${id} ${stats?.visualRole || ''} ${stats?.canonicalName || ''} ${stats?.name || ''}`.toLowerCase();
    if (id.includes('transporthelicopter') || id.includes('helicopter') || id.includes('repairdrone') || identity.includes('вертол')) return 'rotary';
    if (id.includes('recondrone') || id.includes('drone') || identity.includes('бпла') || identity.includes('дрон')) return 'drone';
    if (id.includes('aerialartillery') || identity.includes('аэроплатформ') || identity.includes('воздушн') && identity.includes('артилл')) return 'aerialArtillery';
    if (id.includes('heavybomber') || identity.includes('heavy bomber') || identity.includes('тяжёл') && identity.includes('бомб')) return 'heavyBomber';
    if (id.includes('bomber') || identity.includes('бомбардиров')) return 'bomber';
    if (id.includes('aeroballistic') || identity.includes('кинжал')) return 'aeroBallisticCarrier';
    if (id.includes('stealthstriker') || identity.includes('стелс') || identity.includes('stealth striker')) return 'stealthStriker';
    if (id.includes('multirole') || identity.includes('многоцелев')) return 'multirole';
    if (id.includes('interceptor') || identity.includes('перехватчик')) return 'interceptor';
    if (id.includes('awacs') || identity.includes('дрло')) return 'awacs';
    if (id.includes('strategicairlifter') || id.includes('airlift') || identity.includes('транспортн') && identity.includes('самол')) return 'airlifter';
    if (id.includes('gunship') || identity.includes('ганшип')) return 'gunship';
    if (identity.includes('истребитель') || identity.includes('fighter')) return 'multirole';
    return stats?.air ? 'fixedWing' : '';
  };

  const AIR_SPEEDS_141 = Object.freeze({
    rotary: 230,
    gunship: 300,
    drone: 330,
    awacs: 310,
    airlifter: 350,
    aerialArtillery: 330,
    heavyBomber: 350,
    bomber: 390,
    multirole: 470,
    stealthStriker: 500,
    aeroBallisticCarrier: 515,
    interceptor: 560,
    fixedWing: 410,
  });

  const desiredAircraftSpeed141 = (stats, typeId = '') => AIR_SPEEDS_141[inferAirRole141(stats, typeId)] || Number(stats?.speed) || 300;
  for (const [typeId, stats] of Object.entries(UNIT_TYPES)) {
    if (!stats?.air) continue;
    const role = inferAirRole141(stats, typeId);
    stats.speed = Math.max(Number(stats.speed) || 0, AIR_SPEEDS_141[role] || 0);
    stats.speedClass141 = role;
  }

  let mlrsRange141 = 0;
  for (const [typeId, stats] of Object.entries(UNIT_TYPES)) {
    const text = `${typeId} ${stats?.visualRole || ''} ${stats?.name || ''}`.toLowerCase();
    if (text.includes('rocketartillery') || text.includes('рсзо') || text.includes('mlrs')) mlrsRange141 = Math.max(mlrsRange141, Number(stats?.weapon?.range) || 0);
  }
  mlrsRange141 = Math.max(760, mlrsRange141);
  if (BUILDING_TYPES.missileBattery?.weapon) {
    BUILDING_TYPES.missileBattery.weapon.range = Math.max(Number(BUILDING_TYPES.missileBattery.weapon.range) || 0, mlrsRange141 + 80);
    BUILDING_TYPES.missileBattery.directRange139 = Math.max(Number(BUILDING_TYPES.missileBattery.directRange139) || 0, mlrsRange141 + 80);
  }

  const AA_PROFILES_141 = Object.freeze({
    aa: { detector: 390, intercept: 500 },
    mobileFireGroup: { detector: 330, intercept: 430 },
    mobileAA: { detector: 470, intercept: 590 },
    longRangeSAM: { detector: 850, intercept: 1120 },
    counterUASVehicle: { detector: 560, intercept: 630 },
    aaTurret: { detector: 690, intercept: 760 },
    counterUASTower: { detector: 620, intercept: 690 },
    missileBattery: { detector: 900, intercept: 1200 },
    abmBattery: { detector: 1060, intercept: 1600 },
    orbitalDefense: { detector: 1260, intercept: 2300 },
  });

  const aaProfileFor141 = (entityOrStats, typeId = '') => {
    const stats = entityOrStats?.stats || entityOrStats || {};
    const id = entityOrStats?.typeId || typeId;
    if (AA_PROFILES_141[id]) return AA_PROFILES_141[id];
    const text = `${id} ${stats.visualRole || ''} ${stats.name || ''}`.toLowerCase();
    if (text.includes('counteruas') && text.includes('vehicle')) return AA_PROFILES_141.counterUASVehicle;
    if (text.includes('counteruas')) return AA_PROFILES_141.counterUASTower;
    if (text.includes('mobileaa')) return AA_PROFILES_141.mobileAA;
    if (text.includes('longrangesam')) return AA_PROFILES_141.longRangeSAM;
    return null;
  };

  for (const [typeId, stats] of Object.entries(UNIT_TYPES)) {
    const profile = aaProfileFor141(stats, typeId);
    if (!profile) continue;
    stats.detector = Math.max(Number(stats.detector) || 0, profile.detector);
    stats.interceptRange = profile.intercept;
    stats.networkEngagementRange139 = profile.intercept;
    if (typeId === 'missileBattery') stats.directRange139 = Math.max(Number(stats.directRange139) || 0, profile.intercept);
    stats.directTrackRange = Math.max(Number(stats.directTrackRange) || 0, Math.min(profile.detector, profile.intercept));
    if (stats.weapon?.targets?.includes('air')) {
      stats.weapon.range = Math.max(Number(stats.weapon.range) || 0, profile.intercept);
      stats.weapon.interceptRange = profile.intercept;
      stats.weapon.networkRange139 = profile.intercept;
    }
  }
  for (const [typeId, stats] of Object.entries(BUILDING_TYPES)) {
    const profile = aaProfileFor141(stats, typeId);
    if (!profile) continue;
    stats.detector = Math.max(Number(stats.detector) || 0, profile.detector);
    stats.interceptRange = profile.intercept;
    stats.interceptionRange = profile.intercept;
    stats.networkEngagementRange139 = profile.intercept;
    if (typeId === 'missileBattery') stats.directRange139 = Math.max(Number(stats.directRange139) || 0, profile.intercept);
    stats.directTrackRange = Math.max(Number(stats.directTrackRange) || 0, Math.min(profile.detector, profile.intercept));
    if (stats.weapon?.targets?.includes('air')) {
      stats.weapon.range = Math.max(Number(stats.weapon.range) || 0, profile.intercept);
      stats.weapon.interceptRange = profile.intercept;
      stats.weapon.networkRange139 = profile.intercept;
    }
  }

  const applyResolvedStats141 = (entity) => {
    if (!entity?.stats) return entity;
    if (entity.kind === 'unit') {
      if (entity.typeId === 'resourceTruck') {
        entity.stats.transportCapacity = Math.max(10, Number(entity.stats.transportCapacity) || 0);
        entity.stats.transportRule = 'infantry';
        entity.transportCapacity = entity.stats.transportCapacity;
      }
      if (entity.air) {
        const desired = desiredAircraftSpeed141(entity.stats, entity.typeId);
        entity.stats.speed = Math.max(Number(entity.stats.speed) || 0, desired);
        entity.stats.speedClass141 = inferAirRole141(entity.stats, entity.typeId);
      }
      const aa = aaProfileFor141(entity);
      if (aa) {
        entity.stats.detector = Math.max(Number(entity.stats.detector) || 0, aa.detector);
        entity.detector = entity.stats.detector;
        entity.stats.interceptRange = aa.intercept;
        entity.stats.networkEngagementRange139 = aa.intercept;
        if (entity.typeId === 'missileBattery') entity.stats.directRange139 = Math.max(Number(entity.stats.directRange139) || 0, aa.intercept);
        entity.stats.directTrackRange = Math.max(Number(entity.stats.directTrackRange) || 0, Math.min(aa.detector, aa.intercept));
        if (entity.stats.weapon?.targets?.includes('air')) {
          entity.stats.weapon.range = Math.max(Number(entity.stats.weapon.range) || 0, aa.intercept);
          entity.stats.weapon.interceptRange = aa.intercept;
          entity.stats.weapon.networkRange139 = aa.intercept;
        }
      }
    } else if (entity.kind === 'building') {
      const aa = aaProfileFor141(entity);
      if (aa) {
        entity.stats.detector = Math.max(Number(entity.stats.detector) || 0, aa.detector);
        entity.detector = entity.stats.detector;
        entity.stats.interceptRange = aa.intercept;
        entity.stats.interceptionRange = aa.intercept;
        entity.stats.networkEngagementRange139 = aa.intercept;
        if (entity.typeId === 'missileBattery') entity.stats.directRange139 = Math.max(Number(entity.stats.directRange139) || 0, aa.intercept);
        entity.stats.directTrackRange = Math.max(Number(entity.stats.directTrackRange) || 0, Math.min(aa.detector, aa.intercept));
        if (entity.stats.weapon?.targets?.includes('air')) {
          entity.stats.weapon.range = Math.max(Number(entity.stats.weapon.range) || 0, aa.intercept);
          entity.stats.weapon.interceptRange = aa.intercept;
          entity.stats.weapon.networkRange139 = aa.intercept;
        }
      }
      if (entity.typeId === 'missileBattery' && entity.stats.weapon) {
        entity.stats.weapon.range = Math.max(Number(entity.stats.weapon.range) || 0, mlrsRange141 + 80);
        entity.stats.directRange139 = Math.max(Number(entity.stats.directRange139) || 0, mlrsRange141 + 80);
      }
    }
    return entity;
  };

  // The finite-ammunition network installed in v13.9 retained older hard
  // caps in a closure. Re-apply the current profile at the final tracking
  // stage so detection and interception radii are both operational, not only
  // values shown in the UI.
  const baseDefenderTracking141 = GameClass.prototype.getDefenderTrackingQuality;
  if (typeof baseDefenderTracking141 === 'function') GameClass.prototype.getDefenderTrackingQuality = function(defender, projectile) {
    const profile = aaProfileFor141(defender);
    if (!profile || !projectile) return baseDefenderTracking141.call(this, defender, projectile);
    const d = distance141(defender, projectile);
    if (d > profile.intercept + (projectile.radius || 0)) return 0;
    const direct = Math.min(profile.detector, profile.intercept);
    const base = Number(baseDefenderTracking141.call(this, defender, projectile)) || 0;
    if (d <= direct + (projectile.radius || 0)) return Math.max(.54, base);
    const network = this.getIntegratedAirDefenseState119?.(defender.team);
    if (!network?.online) return defender.stats?.requiresRadarTrack ? 0 : base;
    return Math.max(base, Number(this.getIntegratedTrackQuality119?.(defender.team, projectile.x, projectile.y, projectile)) || 0);
  };

  // -------------------------------------------------------------------------
  // Per-game state and positional audio gate.
  // -------------------------------------------------------------------------
  const ensureGameState141 = (game) => {
    if (!game) return null;
    if (!Array.isArray(game.minefields141)) game.minefields141 = [];
    if (!Number.isInteger(game.minefieldCounter141)) game.minefieldCounter141 = 1;
    if (!(game._mineDetectionCache141 instanceof Map)) game._mineDetectionCache141 = new Map();
    if (!Number.isFinite(game._mineUpdateTimer141)) game._mineUpdateTimer141 = 0;
    if (!Number.isFinite(game._mineDetectionEpoch141)) game._mineDetectionEpoch141 = 0;
    game.stats ||= {};
    game.stats.minefieldsLaid ||= 0;
    game.stats.minesTriggered ||= 0;
    ensureSoundGate141(game);
    return game;
  };

  const ensureSoundGate141 = (game) => {
    const sound = game?.sound;
    if (!sound || sound._fdPositionalGate141) return;
    sound._fdPositionalGate141 = true;
    sound._fdWorldSourceStack141 = [];
    const audible = () => {
      const stack = sound._fdWorldSourceStack141;
      const source = stack[stack.length - 1];
      return !source || !Number.isFinite(source.x) || !Number.isFinite(source.y) || game.isOnScreen?.(source.x, source.y, 0);
    };
    for (const method of ['tone', 'noiseBurst', 'shot', 'explosion', 'missileLaunch', 'build', 'alert']) {
      const original = sound[method];
      if (typeof original !== 'function') continue;
      sound[method] = function(...args) {
        if (!audible()) return undefined;
        return original.apply(this, args);
      };
    }
  };

  const withWorldSound141 = (game, x, y, action) => {
    ensureGameState141(game);
    const stack = game?.sound?._fdWorldSourceStack141;
    if (!stack || !Number.isFinite(x) || !Number.isFinite(y)) return action();
    stack.push({ x, y });
    try { return action(); }
    finally { stack.pop(); }
  };

  const baseAddEntity141 = GameClass.prototype.addEntity;
  GameClass.prototype.addEntity = function(entity) {
    ensureGameState141(this);
    applyResolvedStats141(entity);
    return baseAddEntity141.call(this, entity);
  };

  const wrapWorldSound141 = (prototype, method, source) => {
    const base = prototype?.[method];
    if (typeof base !== 'function') return;
    prototype[method] = function(...args) {
      const game = this.game || this;
      const point = source.call(this, args) || this;
      return withWorldSound141(game, point?.x, point?.y, () => base.apply(this, args));
    };
  };
  wrapWorldSound141(UnitClass.prototype, 'fire', function() { return this; });
  wrapWorldSound141(BuildingClass.prototype, 'fire', function() { return this; });
  wrapWorldSound141(BuildingClass.prototype, 'completeConstruction', function() { return this; });
  wrapWorldSound141(ProjectileClass.prototype, 'hit', function() { return this; });
  wrapWorldSound141(ProjectileClass.prototype, 'takeInterceptDamage', function() { return this; });
  wrapWorldSound141(GameClass.prototype, 'strikeGround', function(args) { return { x: args[0], y: args[1] }; });
  wrapWorldSound141(GameClass.prototype, 'handleDeath', function(args) { return args[0] || this; });
  wrapWorldSound141(GameClass.prototype, 'handleAgentExposure', function(args) { return args[0] || this; });
  wrapWorldSound141(GameClass.prototype, 'alert', function(args) { return { x: args[2], y: args[3] }; });

  // -------------------------------------------------------------------------
  // Finite, concealed minefields.
  // -------------------------------------------------------------------------
  GameClass.prototype.directDetectorUnits141 = function(team, x, y, radius = 0) {
    const queryRadius = Math.max(80, radius + 1400);
    const candidates = this.spatial?.queryRadius?.('units', x, y, queryRadius)
      || this.querySpatial?.(this.unitSpatial, x, y, queryRadius)
      || this.units || [];
    const unique = new Set();
    const result = [];
    for (const unit of candidates) {
      if (!unit?.alive || unit.team !== team || unit.embarkedIn || unit.airServiceState === 'servicing' || unique.has(unit.id)) continue;
      unique.add(unit.id);
      const detector = Math.max(Number(unit.detector) || 0, Number(unit.stats?.detector) || 0);
      if (detector <= 0 || Math.hypot(unit.x - x, unit.y - y) > detector + radius) continue;
      result.push(unit);
    }
    return result;
  };

  GameClass.prototype.hasDirectDetectorContact141 = function(target, viewerTeam, extraRadius = 0) {
    if (!target?.alive || target.team === viewerTeam) return true;
    return this.directDetectorUnits141(viewerTeam, target.x, target.y, (target.radius || 0) + extraRadius).length > 0;
  };

  GameClass.prototype.isMinefieldDetected141 = function(field, viewerTeam = 'player') {
    if (!field || field.team === viewerTeam) return true;
    ensureGameState141(this);
    const key = `${viewerTeam}:${field.id}`;
    const cached = this._mineDetectionCache141.get(key);
    if (cached && cached.epoch === this._mineDetectionEpoch141) return cached.value;
    const value = this.directDetectorUnits141(viewerTeam, field.x, field.y, field.radius).length > 0;
    this._mineDetectionCache141.set(key, { epoch: this._mineDetectionEpoch141, value });
    return value;
  };

  const mineLayout141 = (id, x, y, radius, count, clearRadius = 18) => {
    const seed = hash141(id);
    const baseAngle = (seed % 6283) / 1000;
    const mines = [];
    for (let index = 0; index < count; index += 1) {
      const jitter = ((hash141(`${id}:${index}`) % 1000) / 1000 - .5) * .24;
      const angle = baseAngle + index * GOLDEN_ANGLE + jitter;
      const ratio = Math.sqrt((index + .65) / Math.max(1, count));
      const mineRadius = clearRadius + (radius - clearRadius - 8) * ratio;
      mines.push({
        id: `${id}-m${index + 1}`,
        x: clamp141(x + Math.cos(angle) * mineRadius, 8, WORLD.width - 8),
        y: clamp141(y + Math.sin(angle) * mineRadius, 8, WORLD.height - 8),
        armed: true,
      });
    }
    return mines;
  };

  GameClass.prototype.createMinefield141 = function(options = {}) {
    ensureGameState141(this);
    const team = options.team === 'enemy' ? 'enemy' : 'player';
    const count = clamp141(Math.round(Number(options.count) || (options.source === 'controller' ? 30 : 18)), 1, 48);
    const radius = clamp141(Number(options.radius) || (options.source === 'controller' ? 220 : 155), 70, 320);
    const x = clamp141(Number(options.x) || 0, radius + 8, WORLD.width - radius - 8);
    const y = clamp141(Number(options.y) || 0, radius + 8, WORLD.height - radius - 8);
    const id = options.id || `minefield-${this.minefieldCounter141++}`;
    const field = {
      id,
      team,
      x,
      y,
      radius,
      maxMines: count,
      damage: Math.max(40, Number(options.damage) || (options.source === 'controller' ? 245 : 195)),
      splash: Math.max(22, Number(options.splash) || (options.source === 'controller' ? 86 : 66)),
      triggerRadius: Math.max(12, Number(options.triggerRadius) || (options.source === 'controller' ? 27 : 23)),
      source: options.source || 'engineer',
      ownerId: options.ownerId || null,
      createdAt: Number.isFinite(options.createdAt) ? options.createdAt : this.time,
      mines: Array.isArray(options.mines)
        ? options.mines.filter((mine) => mine?.armed !== false && Number.isFinite(mine.x) && Number.isFinite(mine.y)).map((mine) => ({ ...mine, armed: true }))
        : mineLayout141(id, x, y, radius, count, options.source === 'controller' ? 58 : 18),
    };
    this.minefields141.push(field);
    const teamFields = this.minefields141.filter((entry) => entry.team === team);
    if (teamFields.length > 36) {
      const removable = teamFields.filter((entry) => entry.source !== 'controller').sort((a, b) => a.createdAt - b.createdAt);
      const victim = removable[0] || teamFields.sort((a, b) => a.createdAt - b.createdAt)[0];
      if (victim && victim !== field) this.minefields141 = this.minefields141.filter((entry) => entry !== victim);
    }
    this.stats.minefieldsLaid = (this.stats.minefieldsLaid || 0) + 1;
    this._mineDetectionEpoch141 += 1;
    this._mineDetectionCache141.clear();
    this.uiDirty = true;
    return field;
  };

  GameClass.prototype.triggerMine141 = function(field, mine, triggerUnit) {
    if (!field || !mine?.armed || !triggerUnit?.alive) return false;
    mine.armed = false;
    const owner = this.getEntity?.(field.ownerId);
    const candidates = this.spatial?.queryRadius?.('units', mine.x, mine.y, field.splash + 100)
      || this.querySpatial?.(this.unitSpatial, mine.x, mine.y, field.splash + 100)
      || this.units || [];
    const seen = new Set();
    for (const target of candidates) {
      if (!target?.alive || target.team === field.team || target.team === 'neutral' || target.air || target.embarkedIn || seen.has(target.id)) continue;
      seen.add(target.id);
      const d = Math.hypot(target.x - mine.x, target.y - mine.y);
      if (d > field.splash + (target.radius || 0)) continue;
      const falloff = clamp141(1 - d / Math.max(1, field.splash + (target.radius || 0)), .28, 1);
      target.takeDamage?.(field.damage * falloff, owner?.alive ? owner : null, 'explosive');
    }
    this.addEffect?.({ type: 'explosion', x: mine.x, y: mine.y, radius: field.splash, duration: .65 });
    this.addEffect?.({ type: 'smoke', x: mine.x, y: mine.y, radius: field.splash * .55, duration: 1.8 });
    withWorldSound141(this, mine.x, mine.y, () => this.sound?.explosion?.(field.damage > 220));
    this.stats.minesTriggered = (this.stats.minesTriggered || 0) + 1;
    return true;
  };

  GameClass.prototype.updateMinefields141 = function(dt) {
    ensureGameState141(this);
    this._mineUpdateTimer141 -= dt;
    if (this._mineUpdateTimer141 > 0) return;
    this._mineUpdateTimer141 = .10;
    this._mineDetectionEpoch141 += 1;
    this._mineDetectionCache141.clear();
    const surviving = [];
    for (const field of this.minefields141) {
      field.mines = (field.mines || []).filter((mine) => mine?.armed !== false);
      if (!field.mines.length) continue;
      const candidates = this.spatial?.queryRadius?.('units', field.x, field.y, field.radius + 100)
        || this.querySpatial?.(this.unitSpatial, field.x, field.y, field.radius + 100)
        || this.units || [];
      let triggered = false;
      for (const unit of candidates) {
        if (!unit?.alive || unit.team === field.team || unit.team === 'neutral' || unit.air || unit.embarkedIn) continue;
        if (Math.hypot(unit.x - field.x, unit.y - field.y) > field.radius + (unit.radius || 0)) continue;
        for (const mine of field.mines) {
          if (Math.hypot(unit.x - mine.x, unit.y - mine.y) <= field.triggerRadius + (unit.radius || 0)) {
            this.triggerMine141(field, mine, unit);
            triggered = true;
            break;
          }
        }
        if (triggered) break; // one detonation per field per 100 ms avoids chain-spike CPU and damage.
      }
      field.mines = field.mines.filter((mine) => mine.armed !== false);
      if (field.mines.length) surviving.push(field);
    }
    this.minefields141 = surviving;
  };

  const baseBuildingUpdate141 = BuildingClass.prototype.update;
  BuildingClass.prototype.update = function(dt) {
    const result = baseBuildingUpdate141.call(this, dt);
    if (this.alive && this.completed && this.typeId === 'mineControl') {
      ensureGameState141(this.game);
      let field = this.minefieldId141 && this.game.minefields141.find((entry) => entry.id === this.minefieldId141);
      if (!field) field = this.game.minefields141.find((entry) => entry.ownerId === this.id && entry.source === 'controller');
      if (!field) {
        field = this.game.createMinefield141({
          team: this.team,
          x: this.x,
          y: this.y,
          radius: 225,
          count: 30,
          damage: 245,
          splash: 86,
          triggerRadius: 27,
          source: 'controller',
          ownerId: this.id,
        });
      }
      this.minefieldId141 = field?.id || null;
    }
    return result;
  };

  const renderMinefields141 = function() {
    ensureGameState141(this);
    const canvas = document.getElementById('game-canvas');
    const context = canvas?.getContext?.('2d');
    if (!context || !this.minefields141.length) return;
    context.save();
    context.setTransform(this.viewport?.dpr || 1, 0, 0, this.viewport?.dpr || 1, 0, 0);
    for (const field of this.minefields141) {
      if (!this.isOnScreen?.(field.x, field.y, field.radius + 80)) continue;
      if (field.team !== 'player' && !this.isMinefieldDetected141(field, 'player')) continue;
      const friendly = field.team === 'player';
      context.globalAlpha = friendly ? .90 : .80;
      // v178: no minefield perimeter/radius overlay; render armed mines only.
      const stride = 1;
      for (let index = 0; index < field.mines.length; index += stride) {
        const mine = field.mines[index];
        const p = this.worldToScreen(mine.x, mine.y, 0);
        context.beginPath();
        context.arc(p.x, p.y, friendly ? 2.2 : 1.8, 0, TWO_PI);
        context.fillStyle = friendly ? 'rgba(255,225,128,.92)' : 'rgba(255,141,117,.88)';
        context.fill();
      }
    }
    context.restore();
  };

  // Movement/order vectors are deliberately disabled. This is a no-op at
  // the final prototype layer, so neither line geometry nor per-selected-unit
  // endpoint traversal is performed each frame.
  GameClass.prototype.drawSelectedCommands = function() {};

  const baseRender141 = GameClass.prototype.render;
  GameClass.prototype.render = function(...args) {
    // Preserve the drag state for command release, but hide it from the legacy
    // renderer. This removes movement-line drawing and its slot-preview work
    // without cancelling the player's right-drag order.
    const orderDrag141 = this._v78OrderDrag;
    this._v78OrderDrag = null;
    let result;
    try { result = baseRender141.apply(this, args); }
    finally { this._v78OrderDrag = orderDrag141; }
    renderMinefields141.call(this);
    return result;
  };

  // -------------------------------------------------------------------------
  // Engineer mine command and non-combat survival doctrine.
  // -------------------------------------------------------------------------
  GameClass.prototype.setMinefieldCommandMode141 = function() {
    const engineers = (this.getSelectedUnits?.() || []).filter(isEngineer141);
    if (!engineers.length) {
      this.alert?.('Для установки минного поля выберите инженеров', 'warning');
      return false;
    }
    this.buildMode = null;
    this.commandMode = 'minefield141';
    this.uiDirty = true;
    this.alert?.('Укажите центр минного поля. Боезапас поля конечный, противнику оно скрыто без разведчиков.', 'info');
    return true;
  };

  GameClass.prototype.issueMinefieldOrder141 = function(x, y, append = false) {
    const engineers = (this.getSelectedUnits?.() || []).filter((unit) => isEngineer141(unit) && unit.alive && !unit.embarkedIn);
    if (!engineers.length) return false;
    engineers.forEach((engineer, index) => {
      const offset = this.formationOffset?.(index, engineers.length, 52) || { x: 0, y: 0 };
      const point = this.findReachablePoint?.(x + (offset.x || 0), y + (offset.y || 0), engineer.radius || 8) || { x, y };
      engineer.setCommand({
        type: 'layMinefield141',
        x: point.x,
        y: point.y,
        progress141: 0,
        issuedAt141: this.time,
      }, append);
    });
    this.addEffect?.({ type: 'marker', x, y, color: '#f3d778', duration: 1.0 });
    this.sound?.click?.();
    return true;
  };

  const baseExecuteCurrentMode141 = GameClass.prototype.executeCurrentMode;
  if (baseExecuteCurrentMode141) GameClass.prototype.executeCurrentMode = function(x, y, append = false) {
    if (this.commandMode === 'minefield141') {
      const result = this.issueMinefieldOrder141(x, y, append);
      this.commandMode = null;
      this.uiDirty = true;
      return result;
    }
    return baseExecuteCurrentMode141.call(this, x, y, append);
  };

  const baseExecuteCommandMode141 = GameClass.prototype.executeCommandMode;
  if (baseExecuteCommandMode141) GameClass.prototype.executeCommandMode = function(x, y, append = false) {
    if (this.commandMode === 'minefield141') {
      const result = this.issueMinefieldOrder141(x, y, append);
      this.commandMode = null;
      this.uiDirty = true;
      return result;
    }
    return baseExecuteCommandMode141.call(this, x, y, append);
  };

  const baseRenderUnitCommands141 = GameClass.prototype.renderUnitCommandButtons;
  GameClass.prototype.renderUnitCommandButtons = function(units) {
    const result = baseRenderUnitCommands141.call(this, units);
    const commandButtons = document.getElementById('command-buttons');
    if (!commandButtons || !Array.isArray(units) || !units.some(isEngineer141) || commandButtons.querySelector('[data-command-minefield141]')) return result;
    const engineers = units.filter(isEngineer141);
    const now = this.time || 0;
    const ready = engineers.some((unit) => (unit.engineerMineReadyAt141 || 0) <= now);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'action-button command-button mine-command141';
    button.dataset.commandMinefield141 = 'true';
    button.disabled = !ready;
    button.textContent = 'M · Минное поле';
    button.title = ready
      ? 'Установить скрытое минное поле с конечным количеством мин'
      : `Перезарядка инженерного комплекта: ${Math.ceil(Math.min(...engineers.map((unit) => Math.max(0, (unit.engineerMineReadyAt141 || 0) - now))))} с`;
    button.addEventListener('click', () => this.setMinefieldCommandMode141());
    commandButtons.appendChild(button);
    return result;
  };

  const baseCommandLabel141 = GameClass.prototype.commandLabel;
  GameClass.prototype.commandLabel = function(command) {
    if (command?.type === 'layMinefield141') return 'Установка минного поля';
    return baseCommandLabel141.call(this, command);
  };

  const nearbyEngineerThreats141 = (unit, radius = 690) => {
    const game = unit.game;
    const sources = game.spatial?.queryRadius?.('units', unit.x, unit.y, radius)
      || game.querySpatial?.(game.unitSpatial, unit.x, unit.y, radius)
      || game.units || [];
    const threats = [];
    const seen = new Set();
    for (const enemy of sources) {
      if (!enemy?.alive || enemy.team === unit.team || enemy.team === 'neutral' || enemy.embarkedIn || seen.has(enemy.id)) continue;
      seen.add(enemy.id);
      if (!enemy.stats?.weapon?.targets?.includes('ground')) continue;
      if (game.isTargetableBy && !game.isTargetableBy(enemy, unit.team, unit)) continue;
      threats.push(enemy);
    }
    const buildings = game.spatial?.queryRadius?.('buildings', unit.x, unit.y, radius)
      || game.querySpatial?.(game.buildingSpatial, unit.x, unit.y, radius)
      || game.buildings || [];
    for (const enemy of buildings) {
      if (!enemy?.alive || !enemy.completed || enemy.team === unit.team || enemy.team === 'neutral' || !enemy.stats?.weapon?.targets?.includes('ground') || seen.has(enemy.id)) continue;
      seen.add(enemy.id);
      threats.push(enemy);
    }
    return threats.sort((a, b) => distance141(unit, a) - distance141(unit, b)).slice(0, 10);
  };

  const safeEngineerAnchor141 = (unit) => {
    let best = null;
    let bestScore = Infinity;
    for (const building of unit.game.buildings || []) {
      if (!building?.alive || !building.completed || building.team !== unit.team) continue;
      const critical = ['hq', 'repairDepot', 'bunker', 'turret', 'cannonTurret', 'aaTurret', 'mineControl', 'forwardOutpost'].includes(building.typeId);
      const score = distance141(unit, building) - (critical ? 520 : 0);
      if (score < bestScore) { best = building; bestScore = score; }
    }
    return best || (unit.team === 'enemy' ? unit.game.enemyBase : unit.game.playerBase);
  };

  const processEngineerEvasion141 = (unit, dt) => {
    if (!isEngineer141(unit) || !unit.alive || unit.embarkedIn) return false;
    const threats = nearbyEngineerThreats141(unit);
    const recentlyDamaged = (unit.game.time || 0) - (unit.lastDamagedAt || -999) < 2.8;
    if (threats.length) {
      unit._engineerThreatLast141 = unit.game.time || 0;
      let awayX = 0;
      let awayY = 0;
      for (const threat of threats) {
        const dx = unit.x - threat.x;
        const dy = unit.y - threat.y;
        const d = Math.hypot(dx, dy) || 1;
        const weight = 1 / Math.max(90, d);
        awayX += dx / d * weight;
        awayY += dy / d * weight;
      }
      const safe = safeEngineerAnchor141(unit);
      if (safe) {
        const dx = safe.x - unit.x;
        const dy = safe.y - unit.y;
        const d = Math.hypot(dx, dy) || 1;
        awayX += dx / d * .0055;
        awayY += dy / d * .0055;
      }
      const length = Math.hypot(awayX, awayY) || 1;
      const retreatDistance = clamp141(360 + threats.length * 26, 390, 620);
      const raw = {
        x: clamp141(unit.x + awayX / length * retreatDistance, unit.radius + 10, WORLD.width - unit.radius - 10),
        y: clamp141(unit.y + awayY / length * retreatDistance, unit.radius + 10, WORLD.height - unit.radius - 10),
      };
      unit._engineerEvadeTarget141 = unit.game.findReachablePoint?.(raw.x, raw.y, unit.radius || 8) || raw;
    }
    const linger = (unit.game.time || 0) - (unit._engineerThreatLast141 || -999) < (recentlyDamaged ? 3.0 : 2.1);
    if (!threats.length && !linger) {
      unit._engineerEvadeTarget141 = null;
      return false;
    }
    const target = unit._engineerEvadeTarget141 || safeEngineerAnchor141(unit);
    if (target) unit.moveToward?.(target.x, target.y, dt, 1.18, { dynamic: true });
    return true;
  };

  const processEngineerMinefield141 = (unit, command, dt) => {
    if (!isEngineer141(unit)) { unit.finishCommand?.(); return true; }
    if ((unit.engineerMineReadyAt141 || 0) > (unit.game.time || 0)) {
      if (unit.team === 'player' && !command.cooldownAlerted141) {
        command.cooldownAlerted141 = true;
        unit.game.alert?.(`${unit.stats.name}: инженерный комплект ещё не готов`, 'warning', unit.x, unit.y);
      }
      unit.finishCommand?.();
      return true;
    }
    const reached = unit.moveToward?.(command.x, command.y, dt, .92, { dynamic: false });
    if (!reached && Math.hypot(unit.x - command.x, unit.y - command.y) > Math.max(30, unit.radius * 2.2)) return true;
    command.progress141 = (command.progress141 || 0) + dt;
    unit.attemptedMove = false;
    if (command.progress141 < 3.2) return true;
    const field = unit.game.createMinefield141({
      team: unit.team,
      x: command.x,
      y: command.y,
      radius: 158,
      count: 18,
      damage: 195,
      splash: 66,
      triggerRadius: 23,
      source: 'engineer',
      ownerId: unit.id,
    });
    unit.engineerMineReadyAt141 = (unit.game.time || 0) + 11;
    unit.game.addEffect?.({ type: 'text', x: field.x, y: field.y, text: 'МИННОЕ ПОЛЕ', color: '#f4d77f', duration: 1.35 });
    unit.finishCommand?.();
    return true;
  };

  const baseSetCommand141 = UnitClass.prototype.setCommand;
  UnitClass.prototype.setCommand = function(command, append = false) {
    if (isEngineer141(this) && command) {
      if (command.type === 'attackMove') command = { ...command, type: 'move' };
      if (command.type === 'attack') {
        const target = this.game.getEntity?.(command.targetId);
        const dx = this.x - (target?.x ?? this.x - 1);
        const dy = this.y - (target?.y ?? this.y);
        const d = Math.hypot(dx, dy) || 1;
        command = {
          type: 'move',
          x: clamp141(this.x + dx / d * 460, this.radius + 10, WORLD.width - this.radius - 10),
          y: clamp141(this.y + dy / d * 460, this.radius + 10, WORLD.height - this.radius - 10),
          engineerRetreat141: true,
        };
      }
    }
    return baseSetCommand141.call(this, command, append);
  };

  const baseMovingProfile141 = UnitClass.prototype.getMovingFireProfile91;
  if (baseMovingProfile141) UnitClass.prototype.getMovingFireProfile91 = function() {
    if (isEngineer141(this)) return null;
    return baseMovingProfile141.call(this);
  };

  const baseIdleBehavior141 = UnitClass.prototype.idleBehavior;
  UnitClass.prototype.idleBehavior = function(dt) {
    if (!isEngineer141(this)) return baseIdleBehavior141.call(this, dt);
    if (processEngineerEvasion141(this, dt)) return;
    if (typeof this.tryEngineerInitiative130 === 'function') this.tryEngineerInitiative130(dt);
  };

  // -------------------------------------------------------------------------
  // Route-authoritative movement and destination-only formation assembly.
  // -------------------------------------------------------------------------
  const baseCreateFormation141 = GameClass.prototype.createFormationGroup;
  GameClass.prototype.createFormationGroup = function(units, type, targetX, targetY, options = {}) {
    const group = baseCreateFormation141.call(this, units, type, targetX, targetY, options);
    if (!group || group.air || !['move', 'attackMove'].includes(type)) return group;
    const live = units.filter((unit) => unit?.alive && !unit.air && !unit.embarkedIn);
    const center = live.reduce((acc, unit) => ({ x: acc.x + unit.x / live.length, y: acc.y + unit.y / live.length }), { x: 0, y: 0 });
    group.looseTransit141 = true;
    group.transitPhase141 = 'march';
    group.transitOriginX141 = center.x;
    group.transitOriginY141 = center.y;
    group.transitFinalX141 = Number.isFinite(group.finalAnchorX138) ? group.finalAnchorX138 : group.targetX;
    group.transitFinalY141 = Number.isFinite(group.finalAnchorY138) ? group.finalAnchorY138 : group.targetY;
    group.transitDistance141 = Math.max(1, Math.hypot(group.transitFinalX141 - center.x, group.transitFinalY141 - center.y));
    group.transitOffsets141 = Object.fromEntries(live.map((unit) => [unit.id, { x: unit.x - center.x, y: unit.y - center.y }]));
    group.lastLooseUpdate141 = -1;
    group.arrived = false;
    group.completed = false;
    group.forming = false;
    return group;
  };

  GameClass.prototype.updateLooseFormation141 = function(group) {
    if (!group?.looseTransit141 || group.transitPhase141 !== 'march') return group;
    if (group.lastLooseUpdate141 === this.time) return group;
    group.lastLooseUpdate141 = this.time;
    const members = (group.unitIds || []).map((id) => this.getEntity?.(id)).filter((unit) => unit?.alive && !unit.air && !unit.embarkedIn && unit.currentCommand?.formationGroupId === group.id);
    if (!members.length) { group.cancelled = true; return group; }
    const center = members.reduce((acc, unit) => ({ x: acc.x + unit.x / members.length, y: acc.y + unit.y / members.length }), { x: 0, y: 0 });
    group.anchorX = center.x;
    group.anchorY = center.y;
    const finalX = Number.isFinite(group.finalAnchorX138) ? group.finalAnchorX138 : group.transitFinalX141;
    const finalY = Number.isFinite(group.finalAnchorY138) ? group.finalAnchorY138 : group.transitFinalY141;
    group.transitFinalX141 = finalX;
    group.transitFinalY141 = finalY;
    const remaining = Math.hypot(finalX - center.x, finalY - center.y);
    const progress = 1 - remaining / Math.max(1, group.transitDistance141);
    const offsets = Object.values(group.transitOffsets141 || {});
    const extent = Math.max(0, ...offsets.map((offset) => Math.hypot(offset.x || 0, offset.y || 0)));
    const assembleDistance = Math.max(72, Math.min(150, extent * .24 + (group.maxRadius || 8) * 2.4));
    if (remaining <= assembleDistance || progress >= .975) {
      group.transitPhase141 = 'assemble';
      group.looseTransit141 = false;
      group.anchorX = finalX;
      group.anchorY = finalY;
      group.targetX = finalX;
      group.targetY = finalY;
      if (Number.isFinite(group.finalAngle138)) group.angle = group.finalAngle138;
      group.compression = 1;
      group.arrived = true;
      group.completed = false;
      group.forming = true;
      if (Array.isArray(group.path)) group.pathIndex = group.path.length;
      this.syncFormationFinalSlots138?.(group, true);
    }
    return group;
  };

  const baseEnsureFormation141 = GameClass.prototype.ensureFormationGroupUpdated;
  GameClass.prototype.ensureFormationGroupUpdated = function(group, dt) {
    if (group?.looseTransit141 && group.transitPhase141 === 'march') return this.updateLooseFormation141(group);
    return baseEnsureFormation141.call(this, group, dt);
  };

  const baseFormationCommand141 = UnitClass.prototype.processFormationCommand;
  UnitClass.prototype.processFormationCommand = function(command, dt) {
    const group = this.game.formations?.get(command?.formationGroupId);
    if (!group?.looseTransit141 || group.transitPhase141 !== 'march' || this.air || !['move', 'attackMove'].includes(command?.type)) {
      return baseFormationCommand141.call(this, command, dt);
    }
    this.game.updateLooseFormation141(group);
    if (group.transitPhase141 !== 'march') return baseFormationCommand141.call(this, command, dt);
    const offset = group.transitOffsets141?.[this.id] || { x: 0, y: 0 };
    const tx = clamp141(group.transitFinalX141 + (offset.x || 0), this.radius + 6, WORLD.width - this.radius - 6);
    const ty = clamp141(group.transitFinalY141 + (offset.y || 0), this.radius + 6, WORLD.height - this.radius - 6);
    this.moveToward?.(tx, ty, dt, 1, { dynamic: true });
    if (!isEngineer141(this)) this.tryFireWhileMoving91?.(dt);
    return true;
  };

  const routeCommand141 = (unit, command, dt) => {
    if (!command || !['move', 'attackMove'].includes(command.type) || command.formationGroupId) return false;
    if (isEngineer141(unit)) {
      unit.moveToward?.(command.x, command.y, dt, 1, { dynamic: true });
      if (Math.hypot(unit.x - command.x, unit.y - command.y) <= Math.max(18, unit.radius * 1.35)) unit.finishCommand?.();
      return true;
    }
    if (isFixedWing141(unit)) {
      // A direct route order is authoritative. Low health or empty stores stop
      // weapon use naturally, but do not cancel the player's destination.
      if (unit.airServiceState === 'servicing') return false;
      const fsm = unit.prepareAircraftMission134?.(command) || unit.airFsm133;
      if (fsm) {
        fsm.targetId = null;
        fsm.state = 'transit';
        fsm.anchorX = command.x;
        fsm.anchorY = command.y;
      }
      unit.airOrbitCenter = null;
      unit.moveToward?.(command.x, command.y, dt, 1, { dynamic: true });
      unit.tryFireWhileMoving91?.(dt);
      const arrival = Math.max(145, unit.radius * 4.2, (unit.stats?.speed || 300) * .34);
      if (Math.hypot(unit.x - command.x, unit.y - command.y) <= arrival) {
        if (fsm) { fsm.anchorX = command.x; fsm.anchorY = command.y; fsm.state = 'hold'; fsm.targetId = null; }
        unit.finishCommand?.();
      }
      return true;
    }
    unit.moveToward?.(command.x, command.y, dt, 1, { dynamic: true });
    unit.tryFireWhileMoving91?.(dt);
    if (Math.hypot(unit.x - command.x, unit.y - command.y) <= Math.max(18, unit.radius * 1.35)) unit.finishCommand?.();
    return true;
  };

  const baseProcessCommand141 = UnitClass.prototype.processCommand;
  UnitClass.prototype.processCommand = function(command, dt) {
    if (isEngineer141(this)) {
      const playerDirectedBuild178 = command?.type === 'build' && !command?.autoEngineer130;
      if (!playerDirectedBuild178 && processEngineerEvasion141(this, dt)) return;
      if (command?.type === 'layMinefield141') { processEngineerMinefield141(this, command, dt); return; }
      if (command?.type === 'hold') return;
      if (command?.type === 'guard') {
        const guarded = this.game.getEntity?.(command.targetId);
        if (!guarded?.alive || guarded.team !== this.team) this.finishCommand?.();
        else if (distance141(this, guarded) > 120) this.moveToward?.(guarded.x, guarded.y, dt);
        return;
      }
    }
    if (routeCommand141(this, command, dt)) return;
    return baseProcessCommand141.call(this, command, dt);
  };

  // -------------------------------------------------------------------------
  // Covert operatives: buildings do not magically reveal them. Only living
  // detector/recon units, or an already compromised cover, can expose them.
  // -------------------------------------------------------------------------
  GameClass.prototype.directCounterIntelStrength141 = function(team, x, y, radius = 760) {
    const detectors = this.directDetectorUnits141(team, x, y, radius);
    let strength = 0;
    for (const detector of detectors) {
      const range = Math.max(Number(detector.detector) || 0, Number(detector.stats?.detector) || 0, 1);
      const d = Math.hypot(detector.x - x, detector.y - y);
      strength += clamp141(1 - d / Math.max(1, range + radius), .08, 1) * clamp141(range / 700, .35, 1.8);
    }
    return strength;
  };

  const baseEnemyDetectorNear141 = GameClass.prototype.enemyDetectorNear;
  GameClass.prototype.enemyDetectorNear = function(unit) {
    if (isInfiltrator141(unit)) {
      const viewer = unit.team === 'player' ? 'enemy' : 'player';
      return this.hasDirectDetectorContact141(unit, viewer);
    }
    return baseEnemyDetectorNear141.call(this, unit);
  };

  const baseAgentExposed141 = GameClass.prototype.isAgentExposedTo;
  GameClass.prototype.isAgentExposedTo = function(unit, viewerTeam) {
    if (!isInfiltrator141(unit) || unit.team === viewerTeam) return baseAgentExposed141.call(this, unit, viewerTeam);
    const coverBroken = (unit.compromisedUntil || 0) > (this.time || 0) || (unit.revealTimer || 0) > 0 || unit.undercover === false || (unit.coverIntegrity ?? 1) <= .12;
    return coverBroken || this.hasDirectDetectorContact141(unit, viewerTeam);
  };

  const baseTargetable141 = GameClass.prototype.isTargetableBy;
  GameClass.prototype.isTargetableBy = function(entity, viewerTeam, observer = null) {
    if (isInfiltrator141(entity) && entity.team !== viewerTeam) {
      const exposed = (entity.compromisedUntil || 0) > (this.time || 0) || (entity.revealTimer || 0) > 0 || entity.undercover === false || (entity.coverIntegrity ?? 1) <= .12;
      if (!exposed && !this.hasDirectDetectorContact141(entity, viewerTeam)) return false;
    }
    return baseTargetable141.call(this, entity, viewerTeam, observer);
  };

  const withDirectCounterIntel141 = (game, action) => {
    const original = game.getCounterIntelStrength;
    game.getCounterIntelStrength = function(team, x, y, radius = 700) {
      return this.directCounterIntelStrength141(team, x, y, radius);
    };
    try { return action(); }
    finally { game.getCounterIntelStrength = original; }
  };

  const baseCovertMission141 = UnitClass.prototype.processCovertMission;
  UnitClass.prototype.processCovertMission = function(command, dt) {
    if (!isInfiltrator141(this)) return baseCovertMission141.call(this, command, dt);
    return withDirectCounterIntel141(this.game, () => baseCovertMission141.call(this, command, dt));
  };

  const baseCounterIntel141 = GameClass.prototype.updateCounterIntelligence;
  GameClass.prototype.updateCounterIntelligence = function(dt) {
    return withDirectCounterIntel141(this, () => baseCounterIntel141.call(this, dt));
  };

  // -------------------------------------------------------------------------
  // Mine simulation and persistence.
  // -------------------------------------------------------------------------
  const baseSimulateFixed141 = GameClass.prototype.simulateFixed;
  GameClass.prototype.simulateFixed = function(dt) {
    ensureGameState141(this);
    const result = baseSimulateFixed141.call(this, dt);
    if (!this.paused && !this.ended) this.updateMinefields141(dt);
    return result;
  };

  const baseUnitSerialize141 = UnitClass.prototype.serialize;
  UnitClass.prototype.serialize = function() {
    const data = baseUnitSerialize141.call(this);
    if (Number.isFinite(this.engineerMineReadyAt141)) data.engineerMineReadyAt141 = this.engineerMineReadyAt141;
    return data;
  };

  const baseBuildingSerialize141 = BuildingClass.prototype.serialize;
  BuildingClass.prototype.serialize = function() {
    const data = baseBuildingSerialize141.call(this);
    if (this.minefieldId141) data.minefieldId141 = this.minefieldId141;
    return data;
  };

  const baseHydrate141 = GameClass.prototype.hydrate;
  GameClass.prototype.hydrate = function(data) {
    const result = baseHydrate141.call(this, data);
    ensureGameState141(this);
    const saved = data?.combinedArms141 || {};
    this.minefieldCounter141 = Math.max(1, Number(saved.minefieldCounter141) || 1);
    this.minefields141 = Array.isArray(saved.minefields141)
      ? saved.minefields141.map((field) => ({
          ...field,
          mines: Array.isArray(field.mines) ? field.mines.filter((mine) => mine?.armed !== false).map((mine) => ({ ...mine, armed: true })) : [],
        })).filter((field) => field.id && field.mines.length)
      : [];
    const rawUnits = new Map((data?.entities || []).filter((entry) => entry.kind === 'unit').map((entry) => [entry.id, entry]));
    const rawBuildings = new Map((data?.entities || []).filter((entry) => entry.kind === 'building').map((entry) => [entry.id, entry]));
    for (const unit of this.units || []) {
      const raw = rawUnits.get(unit.id);
      unit.engineerMineReadyAt141 = Number(raw?.engineerMineReadyAt141) || 0;
      applyResolvedStats141(unit);
    }
    for (const building of this.buildings || []) {
      building.minefieldId141 = rawBuildings.get(building.id)?.minefieldId141 || null;
      applyResolvedStats141(building);
    }
    this._aiDoctrineSaved141 = saved.aiDoctrine141 || null;
    return result;
  };

  const baseSave141 = GameClass.prototype.save;
  GameClass.prototype.save = function(notify = true) {
    ensureGameState141(this);
    const ok = baseSave141.call(this, notify);
    if (!ok) return false;
    try {
      const data = JSON.parse(debug.storageGet(debug.SAVE_KEY));
      const ops = this.ai?._ops141;
      data.combinedArms141 = {
        version: VERSION,
        build: BUILD,
        minefieldCounter141: this.minefieldCounter141,
        minefields141: this.minefields141.map((field) => ({
          ...field,
          mines: (field.mines || []).filter((mine) => mine.armed !== false).map((mine) => ({ ...mine })),
        })),
        aiDoctrine141: ops ? {
          balanceTimer: ops.balanceTimer,
          defenseTimer: ops.defenseTimer,
          economyTimer: ops.economyTimer,
          saturationTimer: ops.saturationTimer,
          pressureTimer: ops.pressureTimer,
          saturationQueue: (ops.saturationQueue || []).map((entry) => ({ ...entry })),
          economyPosture: ops.economyPosture,
          metrics: { ...(ops.metrics || {}) },
        } : null,
      };
      debug.storageSet(debug.SAVE_KEY, JSON.stringify(data));
    } catch (error) {
      console.warn('v15.0: не удалось дополнить сохранение общей доктриной', error);
    }
    return true;
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('keydown', (event) => {
      if (event.code !== 'KeyM' || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target?.isContentEditable) return;
      const game = debug.game;
      if (!game || game.paused || game.ended || !(game.getSelectedUnits?.() || []).some(isEngineer141)) return;
      game.setMinefieldCommandMode141();
      event.preventDefault();
    }, true);
  }

  // -------------------------------------------------------------------------
  // Combined-arms operational AI: concurrent defense, several offensive axes,
  // balanced packages, artillery shaping, saturation and economic warfare.
  // -------------------------------------------------------------------------
  const offensiveRole141 = (squad) => ['assault', 'harass', 'feint'].includes(squad?.role);
  const classifyAIUnit141 = (unit) => {
    const text = roleText141(unit);
    const weapon = unit?.stats?.weapon;
    return {
      infantry: Boolean(unit?.infantry && !isEngineer141(unit)),
      vehicle: Boolean(unit?.vehicle && !unit?.air),
      air: Boolean(unit?.air),
      aa: Boolean(weapon?.targets?.includes('air') || (unit?.detector || unit?.stats?.detector || 0) >= 350),
      artillery: Boolean(text.includes('artillery') || text.includes('howitzer') || text.includes('rocketartillery') || text.includes('рсзо') || text.includes('артилл') || (weapon?.range || 0) >= 650),
      recon: Boolean((unit?.detector || unit?.stats?.detector || 0) > 0 || text.includes('recon') || text.includes('scout') || text.includes('развед')),
      armor: Boolean(unit?.vehicle && ((unit?.stats?.armor || '') === 'heavy' || text.includes('tank') || text.includes('брон'))),
      combat: Boolean(weapon),
    };
  };

  TacticalAIClass.prototype.ensureOperationalState141 = function() {
    if (!this._ops141) {
      this._ops141 = {
        balanceTimer: .8,
        defenseTimer: 1.2,
        economyTimer: .4,
        saturationTimer: this.game.difficultyKey === 'hard' ? 28 : this.game.difficultyKey === 'easy' ? 70 : 44,
        pressureTimer: 2,
        saturationQueue: [],
        economyPosture: 'healthy',
        metrics: {
          balancedPackages: 0,
          defensePlans: 0,
          flankReplans: 0,
          artilleryPreparations: 0,
          saturationOperations: 0,
          economicTargets: 0,
          concurrentOperationsPeak: 0,
        },
      };
    }
    const saved = this.game._aiDoctrineSaved141;
    if (saved && !this._ops141._restored) {
      for (const key of ['balanceTimer', 'defenseTimer', 'economyTimer', 'saturationTimer', 'pressureTimer']) {
        if (Number.isFinite(saved[key])) this._ops141[key] = saved[key];
      }
      if (Array.isArray(saved.saturationQueue)) this._ops141.saturationQueue = saved.saturationQueue.map((entry) => ({ ...entry }));
      if (typeof saved.economyPosture === 'string') this._ops141.economyPosture = saved.economyPosture;
      this._ops141.metrics = { ...this._ops141.metrics, ...(saved.metrics || {}) };
      this._ops141._restored = true;
      this.game._aiDoctrineSaved141 = null;
    }
    return this._ops141;
  };

  TacticalAIClass.prototype.economyPosture141 = function() {
    const ops = this.ensureOperationalState141();
    const team = this.game.teams.enemy;
    const margin = (Number(team.powerProduced) || 0) - (Number(team.powerUsed) || 0);
    const powerFactor = Number(team.powerFactor) || 0;
    const credits = Number(team.credits) || 0;
    let posture = 'healthy';
    if (powerFactor < .48 || margin < -25 || credits < 850) posture = 'emergency';
    else if (powerFactor < .78 || margin < 30 || credits < 2600) posture = 'strained';
    ops.economyPosture = posture;
    ops.economy = { credits, margin, powerFactor, at: this.game.time };
    return ops.economy;
  };

  TacticalAIClass.prototype.knownContacts141 = function() {
    return (this.refreshWarPicture126?.(false)?.entities || this.knownTargets?.() || []).filter((contact) => contact && !contact.signal);
  };

  TacticalAIClass.prototype.actualContact141 = function(contact) {
    if (!contact) return null;
    const actual = this.getActualTarget?.(contact) || this.game.getEntity?.(contact.id);
    return actual?.alive && actual.team === 'player' ? actual : null;
  };

  TacticalAIClass.prototype.attachUnitToSquad141 = function(squad, unit) {
    if (!squad || !unit?.alive || unit.team !== 'enemy' || isEngineer141(unit)) return false;
    for (const other of this.squads) {
      if (other.id === squad.id) continue;
      other.unitIds = (other.unitIds || []).filter((id) => id !== unit.id);
    }
    squad.unitIds ||= [];
    if (!squad.unitIds.includes(unit.id)) squad.unitIds.push(unit.id);
    unit.aiSquadId = squad.id;
    return true;
  };

  TacticalAIClass.prototype.balanceSquad141 = function(squad, reissue = false) {
    if (!offensiveRole141(squad)) return true;
    const units = this.squadUnits(squad).filter((unit) => this.isOperationalAttacker129?.(unit) !== false);
    if (!units.length) return false;
    const roles = units.map(classifyAIUnit141);
    const has = (key) => roles.some((role) => role[key]);
    const contacts = this.knownContacts141();
    const local = contacts.filter((contact) => Math.hypot((contact.x || 0) - squad.targetX, (contact.y || 0) - squad.targetY) < 1700);
    const airThreat = local.some((contact) => contact.air || contact.air128);
    const hardDefense = local.some((contact) => contact.defense128 || contact.kind === 'building' || (contact.weaponRange128 || 0) > 500);
    const available = this.availableCombatUnits((unit) => this.isOperationalAttacker129?.(unit) !== false);
    const take = (predicate, score = () => 0) => {
      const candidates = available.filter(predicate).sort((a, b) => score(b) - score(a));
      const unit = candidates[0];
      if (!unit) return null;
      available.splice(available.indexOf(unit), 1);
      this.attachUnitToSquad141(squad, unit);
      return unit;
    };
    let changed = false;
    if (has('infantry') && !has('vehicle') && !has('air')) changed = Boolean(take((unit) => classifyAIUnit141(unit).vehicle, (unit) => (unit.stats?.hp || 0) + (unit.stats?.cost || 0))) || changed;
    if (!has('recon')) changed = Boolean(take((unit) => classifyAIUnit141(unit).recon, (unit) => (unit.detector || unit.stats?.detector || 0) + (unit.vision || 0))) || changed;
    if (airThreat && !has('aa')) changed = Boolean(take((unit) => classifyAIUnit141(unit).aa, (unit) => (unit.stats?.weapon?.range || 0) + (unit.detector || 0))) || changed;
    if (hardDefense && !has('artillery')) changed = Boolean(take((unit) => classifyAIUnit141(unit).artillery, (unit) => unit.stats?.weapon?.range || 0)) || changed;
    if (has('infantry') && !has('air')) changed = Boolean(take((unit) => isAircraftCombat141(unit), (unit) => (unit.stats?.speed || 0) + (unit.stats?.cost || 0) * .04)) || changed;
    const finalUnits = this.squadUnits(squad);
    const finalRoles = finalUnits.map(classifyAIUnit141);
    const infantryAlone = finalRoles.some((role) => role.infantry) && !finalRoles.some((role) => role.vehicle || role.air);
    squad.awaitingSupport141 = infantryAlone;
    if (infantryAlone) {
      squad.state = 'staging';
      squad.launchAt = Math.max(squad.launchAt || 0, this.game.time + 4);
      for (const unit of finalUnits) if (unit.infantry) unit.setCommand({ type: 'hold' });
    } else if (changed && reissue && squad.launchedAt129) {
      if (squad.role === 'assault') this.issueAssaultOrders(squad);
      else this.issueRaidOrders(squad);
    }
    if (changed) {
      const ops = this.ensureOperationalState141();
      ops.metrics.balancedPackages += 1;
    }
    return !infantryAlone;
  };

  TacticalAIClass.prototype.rebalanceOperations141 = function() {
    for (const squad of this.squads.filter(offensiveRole141).slice(0, 24)) this.balanceSquad141(squad, true);
    const ops = this.ensureOperationalState141();
    const active = this.squads.filter((squad) => offensiveRole141(squad) && squad.unitIds?.length).length;
    ops.metrics.concurrentOperationsPeak = Math.max(ops.metrics.concurrentOperationsPeak || 0, active);
  };

  TacticalAIClass.prototype.criticalAssets141 = function() {
    const assets = [];
    for (const building of this.game.buildings || []) {
      if (!building?.alive || !building.completed || building.team !== 'enemy') continue;
      const text = roleText141(building);
      let priority = 0;
      if (building.typeId === 'hq') priority += 1200;
      if ((building.stats?.power || 0) > 0 || text.includes('power') || text.includes('reactor') || text.includes('элект')) priority += 850;
      if (building.stats?.logisticsExtractor || building.stats?.dropoff || building.stats?.income || text.includes('logistics') || text.includes('resource')) priority += 760;
      if (building.stats?.category === 'production' || building.stats?.produces?.length) priority += 620;
      if (building.stats?.strategicLauncher || ['airfield', 'advancedAirfield', 'artilleryFoundry'].includes(building.typeId)) priority += 500;
      if (priority > 0) assets.push({ entity: building, priority });
    }
    for (const truck of this.game.units || []) {
      if (truck?.alive && truck.team === 'enemy' && truck.typeId === 'resourceTruck') assets.push({ entity: truck, priority: 680 + (truck.cargo || 0) * .08 });
    }
    return assets.sort((a, b) => b.priority - a.priority).slice(0, 12);
  };

  TacticalAIClass.prototype.assetThreatScore141 = function(asset) {
    let score = 0;
    for (const contact of this.knownContacts141()) {
      const d = Math.hypot((contact.x || 0) - asset.x, (contact.y || 0) - asset.y);
      if (d > 2600) continue;
      score += clamp141(1 - d / 2600, 0, 1) * (contact.armed128 || contact.kind === 'unit' ? 3 : 1);
    }
    return score;
  };

  TacticalAIClass.prototype.planDefense141 = function() {
    const ops = this.ensureOperationalState141();
    const assets = this.criticalAssets141();
    const existingByAsset = new Map(this.squads.filter((squad) => squad.role === 'defense' && squad.defenseAssetId141).map((squad) => [squad.defenseAssetId141, squad]));
    const maxPlans = this.game.difficultyKey === 'hard' ? 6 : this.game.difficultyKey === 'easy' ? 3 : 5;
    let plans = 0;
    for (const item of assets) {
      if (plans >= maxPlans) break;
      const asset = item.entity;
      const threat = this.assetThreatScore141(asset);
      if (threat < .35 && asset.typeId !== 'hq' && item.priority < 800) continue;
      let squad = existingByAsset.get(asset.id);
      if (!squad) {
        const available = this.availableCombatUnits((unit) => isGroundCombat141(unit) && distance141(unit, asset) < 4200);
        const selected = [];
        const ground = available.filter((unit) => !classifyAIUnit141(unit).artillery).sort((a, b) => distance141(a, asset) - distance141(b, asset));
        if (ground[0]) selected.push(ground[0]);
        const aa = available.filter((unit) => classifyAIUnit141(unit).aa && !selected.includes(unit)).sort((a, b) => distance141(a, asset) - distance141(b, asset));
        if (aa[0]) selected.push(aa[0]);
        const armor = available.filter((unit) => classifyAIUnit141(unit).vehicle && !selected.includes(unit)).sort((a, b) => distance141(a, asset) - distance141(b, asset));
        if (armor[0]) selected.push(armor[0]);
        if (selected.length) {
          squad = this.createSquad('defense', selected, { targetId: asset.id, targetX: asset.x, targetY: asset.y, expiresAt: this.game.time + 260 });
          if (squad) squad.defenseAssetId141 = asset.id;
        }
      }
      if (squad) {
        squad.targetId = asset.id;
        squad.targetX = asset.x;
        squad.targetY = asset.y;
        squad.expiresAt = Math.max(squad.expiresAt || 0, this.game.time + 90);
        for (const unit of this.squadUnits(squad)) {
          const activeGuard = unit.currentCommand?.type === 'guard' && unit.currentCommand.targetId === asset.id;
          if (!activeGuard) unit.setCommand({ type: 'guard', targetId: asset.id });
        }
        plans += 1;
      }
    }

    // Engineers seed critical approaches instead of joining assault groups.
    const engineers = (this.game.units || []).filter((unit) => unit?.alive && unit.team === 'enemy' && isEngineer141(unit) && !unit.embarkedIn && (!unit.currentCommand || ['hold', 'harvest'].includes(unit.currentCommand.type)));
    for (const engineer of engineers.slice(0, 3)) {
      const asset = assets.find((entry) => !this.game.minefields141?.some((field) => field.team === 'enemy' && Math.hypot(field.x - entry.entity.x, field.y - entry.entity.y) < 310));
      if (!asset) break;
      const angle = (hash141(`${engineer.id}:${asset.entity.id}`) % 6283) / 1000;
      engineer.setCommand({
        type: 'layMinefield141',
        x: clamp141(asset.entity.x + Math.cos(angle) * Math.max(150, asset.entity.radius + 90), 180, WORLD.width - 180),
        y: clamp141(asset.entity.y + Math.sin(angle) * Math.max(150, asset.entity.radius + 90), 180, WORLD.height - 180),
        progress141: 0,
        aiDefense141: true,
      });
    }
    ops.metrics.defensePlans += plans;
  };

  TacticalAIClass.prototype.pathExposure141 = function(path) {
    const sensors = this.knownContacts141().filter((contact) => contact.defense128 || contact.detector128 || contact.category === 'defense' || (contact.weaponRange128 || 0) > 0);
    let score = 0;
    for (const point of path || []) {
      for (const sensor of sensors) {
        const d = Math.hypot(point.x - (sensor.x || 0), point.y - (sensor.y || 0));
        const reach = Math.max(600, Number(sensor.detector128) || Number(sensor.weaponRange128) || 900) + (Number(sensor.uncertainty128) || 0);
        if (d < reach) score += (1 - d / reach) * (sensor.defense128 ? 4 : 2);
      }
    }
    return score;
  };

  const baseCampaignConfig141 = TacticalAIClass.prototype.campaignConfig129;
  if (baseCampaignConfig141) TacticalAIClass.prototype.campaignConfig129 = function() {
    const base = baseCampaignConfig141.call(this);
    const difficulty = this.game.difficultyKey;
    return {
      ...base,
      campaignLimit: difficulty === 'hard' ? Math.max(5, base.campaignLimit || 0) : difficulty === 'easy' ? Math.max(2, base.campaignLimit || 0) : Math.max(4, base.campaignLimit || 0),
      squadLimit: difficulty === 'hard' ? Math.max(30, base.squadLimit || 0) : difficulty === 'easy' ? Math.max(10, base.squadLimit || 0) : Math.max(22, base.squadLimit || 0),
      commitRatio: difficulty === 'hard' ? Math.max(.91, base.commitRatio || 0) : difficulty === 'easy' ? Math.max(.68, base.commitRatio || 0) : Math.max(.84, base.commitRatio || 0),
      interval: Math.min(base.interval || 12, difficulty === 'hard' ? 4.8 : difficulty === 'easy' ? 17 : 7.5),
    };
  };

  const baseOperationalPath141 = TacticalAIClass.prototype.buildOperationalPath129;
  if (baseOperationalPath141) TacticalAIClass.prototype.buildOperationalPath129 = function(target, lane = 0, element = 'main', origin = this.base) {
    const sign = lane === 0 ? (this.laneRotation % 2 ? 1 : -1) : Math.sign(lane);
    const lanes = [...new Set([lane, sign * Math.max(1, Math.abs(lane)), -sign * Math.max(1, Math.abs(lane)), sign * Math.max(2, Math.abs(lane) + 1), -sign * Math.max(2, Math.abs(lane) + 1)])];
    let best = null;
    let bestScore = Infinity;
    for (const candidateLane of lanes) {
      const path = baseOperationalPath141.call(this, target, candidateLane, element, origin);
      const score = this.pathExposure141(path) + Math.abs(candidateLane) * .18;
      if (score < bestScore) { best = path; bestScore = score; }
    }
    if (best) {
      const ops = this.ensureOperationalState141();
      ops.metrics.flankReplans += 1;
      return best.map((point) => ({ ...point, concealedAxis141: true }));
    }
    return baseOperationalPath141.call(this, target, lane, element, origin);
  };

  TacticalAIClass.prototype.findEconomicTarget141 = function() {
    const contacts = this.knownContacts141();
    let best = null;
    let bestScore = -Infinity;
    for (const contact of contacts) {
      const text = `${contact.typeId || ''} ${contact.category || ''}`.toLowerCase();
      let score = Number(contact.value) || 0;
      if (contact.typeId === 'resourceTruck') score += 1650 + (Number(contact.cargo128) || 0) * .10;
      if (contact.power128 > 0 || text.includes('power') || text.includes('reactor')) score += 1550 + (Number(contact.power128) || 0) * 2;
      if (contact.logisticsExtractor128 || contact.dropoff128 || text.includes('logistics') || text.includes('resource')) score += 1350;
      if (contact.income128 || contact.category === 'economy') score += 1050;
      if (contact.category === 'production') score += 850;
      if (contact.defense128) score -= 180;
      score *= Number(contact.confidence128) || 1;
      if (score > bestScore) { best = contact; bestScore = score; }
    }
    return best;
  };

  TacticalAIClass.prototype.currentObservedEntity141 = function(contact) {
    const actual = this.actualContact141(contact);
    if (!actual) return null;
    if (typeof this.canObserveEntity128 === 'function' && !this.canObserveEntity128(actual, false)) return null;
    return actual;
  };

  TacticalAIClass.prototype.strategicTargetScore141 = function(contact, purpose = 'economy') {
    if (!contact || contact.signal) return -Infinity;
    const text = `${contact.typeId || ''} ${contact.category || ''}`.toLowerCase();
    let score = (Number(contact.value) || 0) * .8 + (Number(contact.cost128) || 0) * .04;
    if (contact.typeId === 'resourceTruck') score += 1750 + (Number(contact.cargo128) || 0) * .12;
    if ((Number(contact.power128) || 0) > 0 || text.includes('power') || text.includes('reactor')) score += 1700 + (Number(contact.power128) || 0) * 2.4;
    if (contact.logisticsExtractor128 || contact.dropoff128 || text.includes('resource') || text.includes('logistics')) score += 1450;
    if ((Number(contact.income128) || 0) > 0 || contact.category === 'economy') score += 1150;
    if (contact.category === 'production') score += 900;
    if (contact.typeId === 'hq') score += 950;
    if (purpose === 'air-defense' && contact.defense128) score += 950;
    const nearbyDefenses = this.knownContacts141().filter((other) => {
      if (other === contact || other.signal) return false;
      if (!(other.defense128 || (Number(other.detector128) || 0) > 0 || (Number(other.weaponRange128) || 0) > 420)) return false;
      return Math.hypot((other.x || 0) - (contact.x || 0), (other.y || 0) - (contact.y || 0)) < 1200;
    }).length;
    // A protected high-value target is a useful saturation target: the drone
    // wave forces the local network to spend channels before missiles arrive.
    score += Math.min(6, nearbyDefenses) * 155;
    score *= clamp141(Number(contact.confidence128) || .35, .18, 1);
    score -= (Number(contact.uncertainty128) || 0) * .12;
    return score;
  };

  TacticalAIClass.prototype.selectSaturationTarget141 = function() {
    const contacts = this.knownContacts141().filter((contact) => !contact.signal);
    if (!contacts.length) return null;
    return contacts.sort((left, right) => this.strategicTargetScore141(right) - this.strategicTargetScore141(left))[0] || null;
  };

  TacticalAIClass.prototype.positionStrategicLauncher141 = function(type, contact, reserved = new Set()) {
    const config = POWER_TYPES[type];
    if (!config?.strategic || !contact) return false;
    const candidates = this.game.findStrategicLaunchers?.('enemy', type, true)
      ?.filter((launcher) => !reserved.has(launcher.id))
      ?.sort((left, right) => distance141(left, contact) - distance141(right, contact)) || [];
    const launcher = candidates[0];
    if (!launcher || launcher.currentCommand?.aiSaturation141) return false;
    const dx = launcher.x - contact.x;
    const dy = launcher.y - contact.y;
    const length = Math.hypot(dx, dy) || 1;
    const desired = clamp141((Number(config.maxRange) || 1200) * .72, (Number(config.minRange) || 0) + 240, (Number(config.maxRange) || 1200) - 180);
    launcher.setCommand({
      type: 'move',
      x: clamp141(contact.x + dx / length * desired, 180, WORLD.width - 180),
      y: clamp141(contact.y + dy / length * desired, 180, WORLD.height - 180),
      aiSaturation141: true,
      strategicType141: type,
    });
    return true;
  };

  TacticalAIClass.prototype.queueStrategicLaunch141 = function(type, contact, delay = 0, reserved = new Set()) {
    const config = POWER_TYPES[type];
    const team = this.game.teams.enemy;
    if (!config?.strategic || !contact || team.rank < config.rank) return false;
    const observed = this.currentObservedEntity141(contact);
    if (type === 'cruiseSalvo' && !observed) return false;
    const x = observed?.x ?? contact.x;
    const y = observed?.y ?? contact.y;
    const launchers = this.game.findStrategicLaunchers?.('enemy', type, true)
      ?.filter((launcher) => !reserved.has(launcher.id) && this.game.launcherRangeStatus?.(launcher, config, x, y)?.valid)
      ?.sort((left, right) => distance141(left, { x, y }) - distance141(right, { x, y })) || [];
    const launcher = launchers[0];
    if (!launcher) {
      this.positionStrategicLauncher141(type, contact, reserved);
      return false;
    }
    const ops = this.ensureOperationalState141();
    const queuedCost = (ops.saturationQueue || []).reduce((sum, entry) => sum + (POWER_TYPES[entry.type]?.cost || 0), 0);
    const reserveCredits = ops.economyPosture === 'strained' ? 2600 : 4200;
    if ((Number(team.credits) || 0) - queuedCost < config.cost + reserveCredits) return false;
    reserved.add(launcher.id);
    ops.saturationQueue.push({
      id: `sat-${Math.floor(this.game.time * 1000)}-${type}-${launcher.id}`,
      type,
      launcherId: launcher.id,
      targetId: observed?.id || contact.id || null,
      x,
      y,
      executeAt: this.game.time + Math.max(0, delay),
      expiresAt: this.game.time + Math.max(12, delay + 16),
      attempts: 0,
    });
    return true;
  };

  TacticalAIClass.prototype.processSaturationQueue141 = function() {
    const ops = this.ensureOperationalState141();
    if (!ops.saturationQueue.length) return;
    const remaining = [];
    for (const entry of ops.saturationQueue) {
      if (!entry || this.game.time > (entry.expiresAt || 0)) continue;
      if (this.game.time < (entry.executeAt || 0)) {
        remaining.push(entry);
        continue;
      }
      let x = Number(entry.x);
      let y = Number(entry.y);
      const target = entry.targetId ? this.game.getEntity?.(entry.targetId) : null;
      const observed = target?.alive && target.team === 'player' && (typeof this.canObserveEntity128 !== 'function' || this.canObserveEntity128(target, false));
      if (observed) {
        x = target.x;
        y = target.y;
      } else if (entry.type === 'cruiseSalvo') {
        continue; // no cheating: cruise missiles require a current concrete track.
      }
      const launcher = this.game.getEntity?.(entry.launcherId);
      const launched = launcher?.alive && launcher.team === 'enemy'
        ? this.game.launchStrategicWeapon?.(entry.type, x, y, 'enemy', launcher.id)
        : false;
      if (!launched && (entry.attempts || 0) < 2) {
        entry.attempts = (entry.attempts || 0) + 1;
        entry.executeAt = this.game.time + 1.1 + entry.attempts * .45;
        remaining.push(entry);
      }
    }
    ops.saturationQueue = remaining;
  };

  TacticalAIClass.prototype.startSaturationAttack141 = function(contact = null) {
    const ops = this.ensureOperationalState141();
    const economy = this.economyPosture141();
    if (ops.economyPosture === 'emergency') return false;
    contact ||= this.selectSaturationTarget141();
    if (!contact) return false;
    const reserved = new Set((ops.saturationQueue || []).map((entry) => entry.launcherId));
    const difficulty = this.game.difficultyKey;
    const limit = difficulty === 'hard' ? 7 : difficulty === 'easy' ? 3 : 5;
    const sequence = difficulty === 'easy'
      ? ['droneRaid', 'cruiseSalvo', 'ballisticStrike']
      : ['droneRaid', 'droneRaid', 'cruiseSalvo', 'ballisticStrike', 'aeroBallisticStrike', 'hypersonicStrike', 'cruiseSalvo'];
    let queued = 0;
    let delay = 0;
    for (const type of sequence) {
      if (queued >= limit) break;
      if (ops.economyPosture === 'strained' && ['aeroBallisticStrike', 'hypersonicStrike'].includes(type)) continue;
      if (this.queueStrategicLaunch141(type, contact, delay, reserved)) {
        queued += 1;
        // Drones arrive first; missiles follow closely enough to overlap the
        // local interception windows without creating a one-frame CPU spike.
        delay += type === 'droneRaid' ? .38 : type === 'cruiseSalvo' ? .48 : .62;
      }
    }
    if (queued >= 2) {
      ops.metrics.saturationOperations += 1;
      ops.metrics.economicTargets += this.strategicTargetScore141(contact) > 900 ? 1 : 0;
      ops.lastSaturation141 = { at: this.game.time, targetId: contact.id || null, x: contact.x, y: contact.y, queued };
      return true;
    }
    return false;
  };

  TacticalAIClass.prototype.findArtilleryForSquad141 = function(squad) {
    const already = this.squadUnits(squad).filter((unit) => classifyAIUnit141(unit).artillery);
    const extra = this.availableCombatUnits((unit) => classifyAIUnit141(unit).artillery)
      .sort((left, right) => distance141(left, { x: squad.targetX, y: squad.targetY }) - distance141(right, { x: squad.targetX, y: squad.targetY }))
      .slice(0, Math.max(0, (this.game.difficultyKey === 'hard' ? 3 : 2) - already.length));
    for (const unit of extra) this.attachUnitToSquad141(squad, unit);
    return [...already, ...extra];
  };

  TacticalAIClass.prototype.startArtilleryPreparation141 = function(squad) {
    if (!squad?.unitIds?.length || squad.artPrepStarted141) return false;
    const targetContact = this.knownContacts141().find((contact) => contact.id === squad.targetId)
      || { id: squad.targetId, x: squad.targetX, y: squad.targetY, confidence128: .45 };
    const observedTarget = this.currentObservedEntity141(targetContact);
    const target = { x: observedTarget?.x ?? squad.targetX, y: observedTarget?.y ?? squad.targetY };
    const artillery = this.findArtilleryForSquad141(squad);
    let maxTravelTime = 0;
    for (const unit of artillery) {
      const range = Math.max(620, Number(unit.stats?.weapon?.range) || 0);
      const dx = unit.x - target.x;
      const dy = unit.y - target.y;
      const distance = Math.hypot(dx, dy) || 1;
      const desired = Math.max(260, range * .76);
      const firePoint = distance <= range * .92
        ? { x: unit.x, y: unit.y }
        : {
            x: clamp141(target.x + dx / distance * desired, 180, WORLD.width - 180),
            y: clamp141(target.y + dy / distance * desired, 180, WORLD.height - 180),
          };
      const travel = Math.hypot(unit.x - firePoint.x, unit.y - firePoint.y) / Math.max(40, Number(unit.stats?.speed) || 70);
      maxTravelTime = Math.max(maxTravelTime, travel);
      if (Math.hypot(unit.x - firePoint.x, unit.y - firePoint.y) > 90) unit.setCommand({ type: 'move', x: firePoint.x, y: firePoint.y, aiArtPrep141: true });
      const current = observedTarget?.alive && this.game.isTargetableBy?.(observedTarget, 'enemy', unit);
      unit.setCommand(current
        ? { type: 'attack', targetId: observedTarget.id, aiArtPrep141: true }
        : { type: 'attackMove', x: target.x, y: target.y, aiArtPrep141: true }, true);
    }
    const prepDuration = clamp141(6.5 + maxTravelTime, 7, 18);
    squad.artPrepStarted141 = true;
    squad.artPrepUntil141 = this.game.time + prepDuration;
    squad.launchAt = Math.max(squad.launchAt || 0, squad.artPrepUntil141);
    squad.state = 'staging';
    squad.lastOrderAt = this.game.time;
    const ops = this.ensureOperationalState141();
    ops.metrics.artilleryPreparations += 1;
    // A physical long-range salvo may join the preparation, but only from a
    // known target and only if the economy can pay for it.
    if (ops.economyPosture === 'healthy') {
      const reserved = new Set((ops.saturationQueue || []).map((entry) => entry.launcherId));
      this.queueStrategicLaunch141('droneRaid', targetContact, .4, reserved)
        || this.queueStrategicLaunch141('ballisticStrike', targetContact, .6, reserved);
    }
    return artillery.length > 0;
  };

  const baseIssueAssaultOrders141 = TacticalAIClass.prototype.issueAssaultOrders;
  if (baseIssueAssaultOrders141) TacticalAIClass.prototype.issueAssaultOrders = function(squad) {
    if (!this.balanceSquad141(squad, false)) {
      squad.state = 'staging';
      squad.launchAt = Math.max(squad.launchAt || 0, this.game.time + 4);
      return false;
    }
    if (squad?.campaignId129 && squad.role === 'assault' && !squad.artPrepStarted141) {
      this.startArtilleryPreparation141(squad);
      return false;
    }
    if (squad?.artPrepStarted141 && this.game.time < (squad.artPrepUntil141 || 0)) {
      squad.state = 'staging';
      return false;
    }
    squad.artPrepCompleted141 = Boolean(squad.artPrepStarted141);
    return baseIssueAssaultOrders141.call(this, squad);
  };

  const baseLaunchCampaignSquad141 = TacticalAIClass.prototype.launchCampaignSquad129;
  if (baseLaunchCampaignSquad141) TacticalAIClass.prototype.launchCampaignSquad129 = function(squad) {
    if (!squad?.unitIds?.length || !this.balanceSquad141(squad, false)) return false;
    if (squad.role === 'assault' && !squad.artPrepStarted141) {
      this.startArtilleryPreparation141(squad);
      return false;
    }
    if (squad.artPrepStarted141 && this.game.time < (squad.artPrepUntil141 || 0)) {
      squad.state = 'staging';
      squad.launchAt = Math.max(squad.launchAt || 0, squad.artPrepUntil141);
      return false;
    }
    squad.artPrepCompleted141 = Boolean(squad.artPrepStarted141);
    return baseLaunchCampaignSquad141.call(this, squad);
  };

  TacticalAIClass.prototype.requestBalancedSupportProduction141 = function() {
    const waiting = this.squads.filter((squad) => offensiveRole141(squad) && squad.awaitingSupport141 && squad.unitIds?.length);
    if (!waiting.length) return false;
    const team = this.game.teams.enemy;
    if ((Number(team.credits) || 0) < 1300) return false;
    const queuedIds = new Set((this.game.buildings || []).filter((building) => building.team === 'enemy').flatMap((building) => (building.queue || []).filter((item) => item.kind === 'unit').map((item) => item.id)));
    const candidates = Object.entries(UNIT_TYPES)
      .filter(([typeId, stats]) => !queuedIds.has(typeId) && stats?.weapon && !stats.air && (stats.vehicle || stats.visualRole?.toLowerCase?.().includes('vehicle')))
      .filter(([typeId]) => this.game.canProduceUnit?.('enemy', typeId))
      .sort((left, right) => {
        const ls = (Number(left[1].hp) || 0) + (Number(left[1].weapon?.range) || 0) * .8 - (Number(left[1].cost) || 0) * .04;
        const rs = (Number(right[1].hp) || 0) + (Number(right[1].weapon?.range) || 0) * .8 - (Number(right[1].cost) || 0) * .04;
        return rs - ls;
      });
    for (const [typeId, stats] of candidates) {
      if ((Number(team.credits) || 0) < (Number(stats.cost) || 0) + 900) continue;
      const producer = (this.game.buildings || [])
        .filter((building) => building.alive && building.completed && building.team === 'enemy' && (building.queue?.length || 0) < 3 && building.stats?.produces?.includes(typeId))
        .sort((left, right) => (left.queue?.length || 0) - (right.queue?.length || 0))[0];
      if (producer && this.game.queueProduction?.(producer, typeId, 'unit', true)) return true;
    }
    return false;
  };

  TacticalAIClass.prototype.guardLogisticsRoutes141 = function() {
    const trucks = (this.game.units || []).filter((unit) => unit?.alive && unit.team === 'enemy' && unit.typeId === 'resourceTruck');
    if (!trucks.length) return 0;
    let assigned = 0;
    for (const truck of trucks.slice(0, this.game.difficultyKey === 'hard' ? 5 : 3)) {
      const protectedAlready = this.squads.some((squad) => squad.role === 'defense' && squad.defenseAssetId141 === truck.id && squad.unitIds?.length);
      if (protectedAlready || this.assetThreatScore141(truck) < .2) continue;
      const escorts = this.availableCombatUnits((unit) => isGroundCombat141(unit) && distance141(unit, truck) < 2600)
        .sort((left, right) => distance141(left, truck) - distance141(right, truck))
        .slice(0, 2);
      if (!escorts.length) continue;
      const squad = this.createSquad('defense', escorts, { targetId: truck.id, targetX: truck.x, targetY: truck.y, expiresAt: this.game.time + 180 });
      if (!squad) continue;
      squad.defenseAssetId141 = truck.id;
      for (const unit of escorts) unit.setCommand({ type: 'guard', targetId: truck.id, aiLogisticsGuard141: true });
      assigned += 1;
    }
    return assigned;
  };

  const baseCreateSquad141 = TacticalAIClass.prototype.createSquad;
  TacticalAIClass.prototype.createSquad = function(role, units, options = {}) {
    const filtered = (units || []).filter((unit) => !isEngineer141(unit));
    const squad = baseCreateSquad141.call(this, role, filtered, options);
    if (squad && offensiveRole141(squad)) this.balanceSquad141(squad, false);
    return squad;
  };

  const baseAIUpdate141 = TacticalAIClass.prototype.update;
  TacticalAIClass.prototype.update = function(dt) {
    const result = baseAIUpdate141.call(this, dt);
    const ops = this.ensureOperationalState141();
    this.processSaturationQueue141();
    ops.economyTimer -= dt;
    ops.balanceTimer -= dt;
    ops.defenseTimer -= dt;
    ops.pressureTimer -= dt;
    ops.saturationTimer -= dt;

    if (ops.economyTimer <= 0) {
      this.economyPosture141();
      ops.economyTimer = 2.8;
      if (ops.economyPosture !== 'healthy') {
        // Force the existing economy/build planner to reconsider power and
        // resource infrastructure before spending on another offensive burst.
        this.buildTimer = Math.min(this.buildTimer, .35);
        this.productionTimer = Math.max(this.productionTimer, ops.economyPosture === 'emergency' ? 1.8 : .8);
      }
    }
    if (ops.balanceTimer <= 0) {
      this.rebalanceOperations141();
      this.requestBalancedSupportProduction141();
      ops.balanceTimer = this.game.difficultyKey === 'hard' ? 1.6 : 2.4;
    }
    if (ops.defenseTimer <= 0) {
      this.planDefense141();
      this.guardLogisticsRoutes141();
      ops.defenseTimer = this.game.difficultyKey === 'hard' ? 2.6 : 3.8;
    }
    if (ops.pressureTimer <= 0) {
      if (ops.economyPosture !== 'emergency') this.ensurePersistentPressure129?.(true);
      ops.pressureTimer = this.game.difficultyKey === 'hard' ? 4.5 : this.game.difficultyKey === 'easy' ? 14 : 7;
    }
    if (ops.saturationTimer <= 0) {
      const launched = this.startSaturationAttack141();
      const baseInterval = this.game.difficultyKey === 'hard' ? 34 : this.game.difficultyKey === 'easy' ? 88 : 54;
      ops.saturationTimer = launched ? baseInterval : Math.min(18, baseInterval * .34);
    }
    return result;
  };

  // Persist the squad-local shaping/defense metadata in the existing AI save.
  const baseAISerialize141 = TacticalAIClass.prototype.serialize;
  TacticalAIClass.prototype.serialize = function() {
    const data = baseAISerialize141.call(this);
    data.combinedArmsSquads141 = (this.squads || []).map((squad) => ({
      id: squad.id,
      awaitingSupport141: Boolean(squad.awaitingSupport141),
      defenseAssetId141: squad.defenseAssetId141 || null,
      artPrepStarted141: Boolean(squad.artPrepStarted141),
      artPrepCompleted141: Boolean(squad.artPrepCompleted141),
      artPrepUntil141: Number(squad.artPrepUntil141) || 0,
    }));
    return data;
  };

  const previousHydrateForAISquads141 = GameClass.prototype.hydrate;
  GameClass.prototype.hydrate = function(data) {
    const result = previousHydrateForAISquads141.call(this, data);
    this._combinedArmsSquadsSaved141 = Array.isArray(data?.ai?.combinedArmsSquads141)
      ? data.ai.combinedArmsSquads141.map((entry) => ({ ...entry }))
      : [];
    return result;
  };

  const baseReconcileSquads141 = TacticalAIClass.prototype.reconcileSquads;
  TacticalAIClass.prototype.reconcileSquads = function() {
    const result = baseReconcileSquads141.call(this);
    const saved = this.game._combinedArmsSquadsSaved141;
    if (Array.isArray(saved) && saved.length) {
      const byId = new Map(saved.map((entry) => [entry.id, entry]));
      for (const squad of this.squads || []) {
        const raw = byId.get(squad.id);
        if (!raw) continue;
        squad.awaitingSupport141 = Boolean(raw.awaitingSupport141);
        squad.defenseAssetId141 = raw.defenseAssetId141 || null;
        squad.artPrepStarted141 = Boolean(raw.artPrepStarted141);
        squad.artPrepCompleted141 = Boolean(raw.artPrepCompleted141);
        squad.artPrepUntil141 = Number(raw.artPrepUntil141) || 0;
      }
      this.game._combinedArmsSquadsSaved141 = null;
    }
    return result;
  };

  // -------------------------------------------------------------------------
  // Version surface and diagnostics.
  // -------------------------------------------------------------------------
  if (typeof document !== 'undefined') {
    void 0;
    const eyebrow = document.querySelector?.('#start-screen .eyebrow');
    if (eyebrow) void 0;
    const lead = document.querySelector?.('#start-screen .lead');
    if (lead) void 0;
    const strip = document.querySelector?.('#start-screen .feature-strip');
    if (strip && !strip.querySelector?.('[data-combined-arms141]')) void 0;
  }

  window.__FD_COMBINED_ARMS_DOCTRINE_V141__ = {
    version: VERSION,
    build: BUILD,
    aircraftSpeeds: { ...AIR_SPEEDS_141 },
    aaProfiles: JSON.parse(JSON.stringify(AA_PROFILES_141)),
    mlrsRange: mlrsRange141,
    get minefields() { return debug.game?.minefields141 || []; },
    get aiState() { return debug.game?.ai?.ensureOperationalState141?.() || null; },
    forceSaturation: () => debug.game?.ai?.startSaturationAttack141?.() || false,
    forceDefensePlan: () => { debug.game?.ai?.planDefense141?.(); return debug.game?.ai?._ops141 || null; },
  };
})();
