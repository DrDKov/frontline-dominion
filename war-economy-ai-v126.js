(() => {
  'use strict';

  const debug = window.__FD_DEBUG__;
  const GameClass = debug?.Game;
  const UnitClass = debug?.Unit;
  const BuildingClass = debug?.Building;
  const TacticalAIClass = debug?.TacticalAI;
  const UNIT_TYPES = debug?.UNIT_TYPES;
  if (!GameClass || !UnitClass || !BuildingClass || !TacticalAIClass || !UNIT_TYPES) return;

  const VERSION = '12.6';
  const POWER_EPSILON = .001;
  const TARGET_CELL = 720;
  const SUPPLY_BUILDINGS = new Set([
    'refinery', 'logisticsHub', 'resourceSilo', 'supplyBeacon',
    'oilPump', 'gasPump', 'mineralQuarry', 'oreMine', 'deepMine', 'coreDrill',
  ]);
  const AIR_ENGAGEMENT_COSTS = Object.freeze({
    rocket: 4,
    aa: 18,
    mobileFireGroup: 10,
    counterUASVehicle: 24,
    longRangeSAM: 118,
    interceptor: 54,
    aaTurret: 26,
    counterUASTower: 18,
    missileBattery: 92,
    abmBattery: 185,
    orbitalDefense: 285,
  });
  const OPERATION_CONFIG = Object.freeze({
    easy: { interval: 34, assaultLimit: 2, raidLimit: 1, mainMin: 7, raidSize: 4, covertCeiling: 150 },
    normal: { interval: 21, assaultLimit: 4, raidLimit: 2, mainMin: 10, raidSize: 6, covertCeiling: 72 },
    hard: { interval: 13, assaultLimit: 6, raidLimit: 4, mainMin: 12, raidSize: 9, covertCeiling: 42 },
  });
  const clamp126 = (value, min, max) => Math.max(min, Math.min(max, value));
  const distanceSquared126 = (left, right) => {
    const dx = (left?.x || 0) - (right?.x || 0);
    const dy = (left?.y || 0) - (right?.y || 0);
    return dx * dx + dy * dy;
  };

  // -------------------- Power is a hard operational resource --------------------
  GameClass.prototype.isPowerGridOnline126 = function(teamKey) {
    const team = this.teams?.[teamKey];
    if (!team || teamKey === 'neutral') return false;
    const produced = Number(team.powerProduced) || 0;
    const used = Number(team.powerUsed) || 0;
    return produced > 0 && produced + POWER_EPSILON >= used;
  };

  // Existing radar, interception and combat modules consult this hook at run
  // time. A deficit of even one unit therefore drops every stationary defense
  // from the common fire-control picture; mobile/manually crewed units remain.
  GameClass.prototype.isStationaryDefensePowered = function(building) {
    return Boolean(
      building?.alive && building.completed && building.sabotagedUntil <= this.time &&
      this.isPowerGridOnline126(building.team)
    );
  };

  const baseBuildingUpdate126 = BuildingClass.prototype.update;
  BuildingClass.prototype.update = function(dt) {
    const poweredService = Boolean(this.completed && this.team !== 'neutral' && Number(this.stats?.powerUse) > 0);
    const offline = poweredService && !this.game.isPowerGridOnline126(this.team);
    this.powerOffline126 = offline;
    if (!offline) return baseBuildingUpdate126.call(this, dt);

    // Keep construction, damage, capture and cooldown state alive, but remove
    // every powered service for this update. Building stats are per-instance,
    // so this cannot leak into another structure or faction.
    const stats = this.stats;
    const saved = {
      weapon: stats.weapon,
      income: stats.income,
      healAura: stats.healAura,
      repairAura: stats.repairAura,
      logisticsExtractor: stats.logisticsExtractor,
    };
    stats.weapon = null;
    stats.income = 0;
    stats.healAura = 0;
    stats.repairAura = 0;
    stats.logisticsExtractor = false;
    try {
      return baseBuildingUpdate126.call(this, dt);
    } finally {
      stats.weapon = saved.weapon;
      stats.income = saved.income;
      stats.healAura = saved.healAura;
      stats.repairAura = saved.repairAura;
      stats.logisticsExtractor = saved.logisticsExtractor;
    }
  };

  const baseBuildingQueue126 = BuildingClass.prototype.updateQueue;
  BuildingClass.prototype.updateQueue = function(dt) {
    if (Number(this.stats?.powerUse) > 0 && !this.game.isPowerGridOnline126(this.team)) return;
    return baseBuildingQueue126.call(this, dt);
  };

  const baseBuildingAuras126 = BuildingClass.prototype.updateAuras;
  BuildingClass.prototype.updateAuras = function(dt) {
    if (Number(this.stats?.powerUse) > 0 && !this.game.isPowerGridOnline126(this.team)) return;
    return baseBuildingAuras126.call(this, dt);
  };

  const baseSensorSources126 = GameClass.prototype.getSensorSources;
  GameClass.prototype.getSensorSources = function(teamKey) {
    const sources = baseSensorSources126?.call(this, teamKey) || [];
    return sources.filter((source) => source?.kind !== 'building' || !source.stats?.powerUse || this.isStationaryDefensePowered(source));
  };

  const baseAirState126 = GameClass.prototype.getIntegratedAirDefenseState119;
  if (baseAirState126) {
    GameClass.prototype.getIntegratedAirDefenseState119 = function(teamKey, force = false) {
      const state = baseAirState126.call(this, teamKey, force);
      if (state && !this.isPowerGridOnline126(teamKey)) {
        state.online = false;
        state.reason = 'no-power';
        if (Array.isArray(state.radarNodes)) state.radarNodes.length = 0;
        if (Array.isArray(state.sensors)) state.sensors.length = 0;
        state.trackCache120?.clear?.();
      }
      return state;
    };
  }

  const baseShield126 = GameClass.prototype.getShieldReduction;
  GameClass.prototype.getShieldReduction = function(entity) {
    if (entity?.team && !this.isPowerGridOnline126(entity.team)) return 0;
    return baseShield126.call(this, entity);
  };

  const baseCommandAura126 = GameClass.prototype.getCommandAuraBonus;
  GameClass.prototype.getCommandAuraBonus = function(entity) {
    if (entity?.team && !this.isPowerGridOnline126(entity.team)) return 0;
    return baseCommandAura126.call(this, entity);
  };

  const baseJamming126 = GameClass.prototype.getJammingFactor;
  GameClass.prototype.getJammingFactor = function(entity) {
    const opposing = entity?.team === 'player' ? 'enemy' : entity?.team === 'enemy' ? 'player' : null;
    if (opposing && !this.isPowerGridOnline126(opposing)) return 1;
    return baseJamming126.call(this, entity);
  };

  // The tactical map remains useful for roads and friendly logistics, but all
  // hostile tracks disappear under a clearly labelled blackout mask.
  const minimap126 = document.getElementById('minimap');
  const minimapContext126 = minimap126?.getContext?.('2d') || null;
  const baseRenderMinimap126 = GameClass.prototype.renderMinimap;
  GameClass.prototype.renderMinimap = function(...args) {
    const online = this.isPowerGridOnline126('player');
    if (this._powerMapOnline126 !== online) {
      this._powerMapOnline126 = online;
      this._classicForceMinimap124 = true;
    }
    if (online) return baseRenderMinimap126.apply(this, args);

    const visibleAt = this.isVisibleAt;
    this.isVisibleAt = () => false;
    let result;
    try {
      result = baseRenderMinimap126.apply(this, args);
    } finally {
      this.isVisibleAt = visibleAt;
    }
    if (minimapContext126 && minimap126) {
      const width = minimap126.width;
      const height = minimap126.height;
      minimapContext126.save();
      minimapContext126.setTransform(1, 0, 0, 1, 0, 0);
      minimapContext126.fillStyle = 'rgba(5, 10, 8, .90)';
      minimapContext126.fillRect(0, 0, width, height);
      minimapContext126.strokeStyle = 'rgba(255, 113, 91, .78)';
      minimapContext126.lineWidth = 2;
      minimapContext126.strokeRect(2, 2, width - 4, height - 4);
      minimapContext126.fillStyle = '#ffb29f';
      minimapContext126.textAlign = 'center';
      minimapContext126.textBaseline = 'middle';
      minimapContext126.font = `800 ${Math.max(10, Math.round(height * .09))}px system-ui`;
      minimapContext126.fillText('НЕТ ПИТАНИЯ', width / 2, height / 2);
      minimapContext126.restore();
    }
    return result;
  };

  // -------------------- Interception cost belongs to the weapon --------------------
  GameClass.prototype.getAirEngagementCost126 = function(source) {
    if (!source?.stats) return 0;
    const explicit = Number(source.stats.airEngagementCost);
    if (Number.isFinite(explicit) && explicit >= 0) return Math.round(explicit);
    if (AIR_ENGAGEMENT_COSTS[source.typeId] != null) return AIR_ENGAGEMENT_COSTS[source.typeId];
    const interceptor = Number(source.stats.interceptorCost);
    if (Number.isFinite(interceptor) && interceptor > 0) return Math.round(interceptor);
    if (source.infantry) return 4;
    if (source.air) return 48;
    if (source.vehicle) return 20;
    return source.kind === 'building' ? 28 : 0;
  };

  GameClass.prototype.recordAirEngagementSpend126 = function(source, amount) {
    if (!(amount > 0)) return;
    const team = this.teams?.[source.team];
    if (!team) return;
    team.credits = Math.max(0, team.credits - amount);
    if (source.team === 'player') this.stats.interceptionSpend = (this.stats.interceptionSpend || 0) + amount;
    this.stats.interceptionSpendBySystem ||= Object.create(null);
    this.stats.interceptionSpendBySystem[source.typeId || 'unknown'] =
      (this.stats.interceptionSpendBySystem[source.typeId || 'unknown'] || 0) + amount;
  };

  const canAffordAirShot126 = (source, target) => {
    if (!target?.air || !source?.stats?.weapon?.targets?.includes('air')) return { allowed: true, cost: 0 };
    const cost = source.game.getAirEngagementCost126(source);
    const team = source.game.teams?.[source.team];
    if (!team || team.credits < cost) {
      source.weaponCooldown = Math.max(source.weaponCooldown || 0, .45);
      if (source.team === 'player' && source.game.time >= (source._noInterceptFundsAt126 || 0)) {
        source._noInterceptFundsAt126 = source.game.time + 5;
        source.game.alert?.('Нет средств на боеприпас для перехвата.', 'warning', source.x, source.y);
      }
      return { allowed: false, cost };
    }
    return { allowed: true, cost };
  };

  const baseUnitFire126 = UnitClass.prototype.fire;
  UnitClass.prototype.fire = function(target) {
    const payment = canAffordAirShot126(this, target);
    if (!payment.allowed) return;
    const previousShot = this.lastShotAt;
    const previousCooldown = this.weaponCooldown || 0;
    const result = baseUnitFire126.call(this, target);
    if (payment.cost > 0 && (this.lastShotAt !== previousShot || (this.weaponCooldown || 0) > previousCooldown + .001)) {
      this.game.recordAirEngagementSpend126(this, payment.cost);
    }
    return result;
  };

  const baseBuildingFire126 = BuildingClass.prototype.fire;
  BuildingClass.prototype.fire = function(target) {
    if (!this.game.isStationaryDefensePowered(this)) return;
    const payment = canAffordAirShot126(this, target);
    if (!payment.allowed) return;
    const previousCooldown = this.weaponCooldown || 0;
    const result = baseBuildingFire126.call(this, target);
    if (payment.cost > 0 && (this.weaponCooldown || 0) > previousCooldown + .001) {
      this.game.recordAirEngagementSpend126(this, payment.cost);
    }
    return result;
  };

  // A worker carries a hand-cart-sized lot. A truck carries an actual convoy
  // load, making truck routes efficient and their destruction consequential.
  UNIT_TYPES.worker.cargoCapacity = 320;
  UNIT_TYPES.worker.harvestTime = Math.max(2.6, UNIT_TYPES.worker.harvestTime || 0);
  if (UNIT_TYPES.resourceTruck) {
    UNIT_TYPES.resourceTruck.cargoCapacity = 5600;
    UNIT_TYPES.resourceTruck.harvestTime = .82;
    UNIT_TYPES.resourceTruck.role = 'Массовая перевозка сырья; главная и уязвимая цель системы снабжения.';
  }

  // -------------------- Multi-vector opponent operations --------------------
  const baseRememberEntity126 = TacticalAIClass.prototype.rememberEntity;
  TacticalAIClass.prototype.rememberEntity = function(entity) {
    const result = baseRememberEntity126.call(this, entity);
    const intel = entity?.id ? this.intel?.get(entity.id) : null;
    if (intel && entity.team === 'player') {
      intel.cargo = Number(entity.cargo) || 0;
      intel.cargoCapacity = Number(entity.stats?.cargoCapacity) || 0;
      intel.logisticsExtractor = Boolean(entity.stats?.logisticsExtractor);
      if (entity.typeId === 'resourceTruck') intel.value = Math.max(intel.value || 0, 300 + intel.cargo * .08);
      else if (entity.typeId === 'worker' && intel.cargo > 0) intel.value = Math.max(intel.value || 0, 135 + intel.cargo * .12);
      else if (entity.stats?.logisticsExtractor) intel.value = Math.max(intel.value || 0, 235);
    }
    return result;
  };

  TacticalAIClass.prototype.refreshWarPicture126 = function(force = false) {
    const now = Number(this.game.time) || 0;
    const difficulty = this.game.difficultyKey || 'normal';
    const refresh = difficulty === 'hard' ? 3.2 : difficulty === 'easy' ? 7.5 : 4.8;
    if (!force && this._warPicture126 && now < this._warPicture126.expiresAt) return this._warPicture126;

    const entities = [];
    const seen = new Set();
    for (const item of this.knownTargets?.() || []) {
      const entity = this.getActualTarget?.(item);
      if (!entity?.alive || entity.team !== 'player' || seen.has(entity.id)) continue;
      seen.add(entity.id);
      entities.push(entity);
      if (entities.length >= 192) break;
    }
    const defenseHeat = new Map();
    for (const entity of entities) {
      const armed = entity.kind === 'unit' && entity.stats?.weapon;
      const defensive = entity.kind === 'building' && entity.stats?.category === 'defense';
      if (!armed && !defensive) continue;
      const key = `${Math.floor(entity.x / TARGET_CELL)}:${Math.floor(entity.y / TARGET_CELL)}`;
      const weight = defensive ? 3.4 : clamp126((entity.stats?.cost || 450) / 650, .4, 3.2);
      defenseHeat.set(key, (defenseHeat.get(key) || 0) + weight);
    }
    this._warPicture126 = { entities, defenseHeat, expiresAt: now + refresh };
    return this._warPicture126;
  };

  TacticalAIClass.prototype.warTargetScore126 = function(entity, purpose, picture) {
    const stats = entity.stats || {};
    const category = stats.category || (entity.air ? 'air' : entity.vehicle ? 'vehicle' : 'infantry');
    const cargo = Number(entity.cargo) || 0;
    const cargoCapacity = Math.max(1, Number(stats.cargoCapacity) || 1);
    const cargoRatio = clamp126(cargo / cargoCapacity, 0, 1);
    const healthRatio = Number.isFinite(entity.healthRatio) ? entity.healthRatio : clamp126((entity.hp || 1) / Math.max(1, entity.maxHp || 1), 0, 1);
    const cellX = Math.floor(entity.x / TARGET_CELL);
    const cellY = Math.floor(entity.y / TARGET_CELL);
    let defense = 0;
    for (let ox = -1; ox <= 1; ox += 1) for (let oy = -1; oy <= 1; oy += 1) {
      defense += picture.defenseHeat.get(`${cellX + ox}:${cellY + oy}`) || 0;
    }
    let score = (stats.cost || 300) * .035 + (1 - healthRatio) * 95;

    if (purpose === 'supply') {
      if (entity.typeId === 'resourceTruck') score += 760 + cargoRatio * 620;
      else if (entity.typeId === 'worker' && cargo > 0) score += 320 + cargoRatio * 230;
      else if (stats.logisticsExtractor || SUPPLY_BUILDINGS.has(entity.typeId)) score += 500;
      else if (stats.dropoff) score += 330;
      else score -= 420;
      score -= defense * 16;
    } else if (purpose === 'economy') {
      if (stats.power) score += 540 + Number(stats.power) * 1.5;
      if (stats.logisticsExtractor || stats.income || stats.dropoff || category === 'economy') score += 430;
      if (entity.typeId === 'resourceTruck') score += 220 + cargoRatio * 260;
      if (category === 'defense') score -= 260;
      score -= defense * 12;
    } else if (purpose === 'production') {
      if (category === 'production') score += 650;
      else if (category === 'strategy') score += 540;
      else if (category === 'technology') score += 390;
      else score -= 220;
      if (entity.typeId === 'airfield' || entity.typeId === 'advancedAirfield' || entity.typeId === 'heavyFactory') score += 160;
      score -= defense * 10;
    } else if (purpose === 'weak') {
      if (entity.kind === 'building') score += 260;
      if (category === 'production' || category === 'economy' || stats.power) score += 210;
      score += (1 - healthRatio) * 280;
      score -= defense * 32;
    } else {
      if (entity.typeId === 'hq') score += 720;
      if (category === 'production') score += 520;
      if (category === 'strategy') score += 460;
      if (stats.power) score += 350;
      if (stats.logisticsExtractor || stats.dropoff) score += 260;
      score -= defense * 5;
    }
    score -= Math.sqrt(distanceSquared126(entity, this.base)) / 1900;
    score += this.random() * 18;
    return score;
  };

  TacticalAIClass.prototype.pickWarTarget126 = function(purpose = 'assault') {
    const picture = this.refreshWarPicture126();
    let best = null;
    let bestScore = -Infinity;
    for (const entity of picture.entities) {
      const score = this.warTargetScore126(entity, purpose, picture);
      if (score > bestScore) {
        best = entity;
        bestScore = score;
      }
    }
    return best;
  };

  const basePickTarget126 = TacticalAIClass.prototype.pickTarget;
  TacticalAIClass.prototype.pickTarget = function(purpose = 'assault') {
    if (['supply', 'economy', 'production', 'weak'].includes(purpose)) {
      return this.pickWarTarget126(purpose) || basePickTarget126.call(this, purpose === 'weak' ? 'assault' : 'harass');
    }
    if (purpose === 'harass') {
      const mission = (this.operationCycle126 || 0) % 2 ? 'supply' : 'economy';
      return this.pickWarTarget126(mission) || basePickTarget126.call(this, purpose);
    }
    if (purpose === 'assault' || purpose === 'siege' || purpose === 'power') {
      return this.pickWarTarget126(purpose === 'power' ? 'economy' : 'assault') || basePickTarget126.call(this, purpose);
    }
    return basePickTarget126.call(this, purpose);
  };

  const baseTargetPriority126 = TacticalAIClass.prototype.targetPriorityForSquad;
  TacticalAIClass.prototype.targetPriorityForSquad = function(target, role) {
    let score = baseTargetPriority126.call(this, target, role);
    const squad = role && this.squads?.find((item) => item.role === role && item.targetId === target?.id);
    const mission = squad?.mission;
    if (target?.typeId === 'resourceTruck') score += 520 + clamp126((target.cargo || 0) / Math.max(1, target.stats?.cargoCapacity || 1), 0, 1) * 420;
    if (target?.stats?.logisticsExtractor) score += mission === 'supply' ? 430 : 180;
    if (mission === 'production' && target?.stats?.category === 'production') score += 430;
    if (mission === 'economy' && (target?.stats?.category === 'economy' || target?.stats?.power)) score += 390;
    return score;
  };

  const baseCovertScore126 = TacticalAIClass.prototype.covertTargetScore;
  if (baseCovertScore126) {
    TacticalAIClass.prototype.covertTargetScore = function(entity, mission) {
      let score = baseCovertScore126.call(this, entity, mission);
      if (mission === 'sabotage') {
        if (entity?.stats?.power) score += 340;
        if (entity?.stats?.category === 'production') score += 250;
        if (entity?.stats?.logisticsExtractor || SUPPLY_BUILDINGS.has(entity?.typeId)) score += 210;
      }
      return score;
    };
  }

  TacticalAIClass.prototype.launchWarOperations126 = function() {
    const difficulty = this.game.difficultyKey || 'normal';
    const config = OPERATION_CONFIG[difficulty] || OPERATION_CONFIG.normal;
    const combatAvailable = () => this.availableCombatUnits((unit) =>
      !this.isCovert(unit) && !unit.stats?.strategicLauncher?.length && Boolean(unit.stats?.weapon));
    let available = combatAvailable();
    if (!available.length) return false;
    let launched = false;
    const totalArmy = this.game.units.reduce((count, unit) => count + Number(Boolean(unit.alive && unit.team === 'enemy' && unit.stats?.weapon)), 0);
    const massMode = totalArmy >= 500;
    const assaultLimit = massMode ? Math.max(config.assaultLimit, 10) : config.assaultLimit;
    let activeAssaults = this.squads.filter((squad) => squad.role === 'assault').length;

    const assaultBursts = massMode ? Math.min(3, assaultLimit - activeAssaults) : Math.min(1, assaultLimit - activeAssaults);
    for (let burst = 0; burst < assaultBursts && available.length >= config.mainMin; burst += 1) {
      const reserveForRaid = difficulty === 'easy' ? 0 : Math.min(config.raidSize, Math.floor(available.length * .22));
      const usable = Math.max(config.mainMin, available.length - reserveForRaid);
      const desired = massMode
        ? Math.min(120, Math.max(36, Math.ceil(usable * .18)))
        : Math.min(difficulty === 'hard' ? 58 : difficulty === 'easy' ? 24 : 42, Math.max(config.mainMin, Math.ceil(usable * .58)));
      const units = [...available]
        .sort((left, right) => this.assaultSelectionScore(right) - this.assaultSelectionScore(left))
        .slice(0, desired);
      if (units.length < config.mainMin) break;
      const target = this.pickWarTarget126('assault') || this.pickTarget('assault');
      const squad = this.createAssaultSquad(units, target, this.laneRotation++ % 3 - 1, 'assault', 0);
      if (!squad) break;
      squad.mission = 'main-assault';
      launched = true;
      activeAssaults += 1;
      available = combatAvailable();
    }

    const raidMissions = difficulty === 'easy'
      ? ['supply']
      : difficulty === 'hard'
        ? ['supply', 'economy', 'production', 'weak']
        : ['supply', 'economy', 'production'];
    const mission = raidMissions[(this.operationCycle126 || 0) % raidMissions.length];
    const activeRaids = this.squads.filter((squad) => ['harass', 'feint'].includes(squad.role)).length;
    if (activeRaids < config.raidLimit) {
      const target = this.pickWarTarget126(mission);
      const candidates = combatAvailable()
        .filter((unit) => this.isRaider(unit) || unit.air || unit.stats?.stealth)
        .sort((left, right) => (right.stats.speed || 0) + (right.stats.stealth ? 90 : 0) - (left.stats.speed || 0) - (left.stats.stealth ? 90 : 0));
      const raidSize = massMode ? Math.min(24, Math.max(config.raidSize, Math.ceil(candidates.length * .08))) : config.raidSize;
      const units = candidates.slice(0, raidSize);
      if (target && units.length >= Math.min(3, config.raidSize)) {
        const flank = this.laneRotation++ % 2 ? 1 : -1;
        const squad = this.createSquad('harass', units, {
          targetId: target.id,
          targetX: target.x,
          targetY: target.y,
          path: this.buildFlankPath(target, flank, mission === 'weak' ? .78 : 1.08),
          state: 'raiding',
          flank,
          mission,
          expiresAt: this.game.time + 250,
        });
        if (squad) {
          this.issueRaidOrders(squad);
          launched = true;
        }
      }
    }
    this.operationCycle126 = (this.operationCycle126 || 0) + 1;
    return launched;
  };

  const baseManageRaid126 = TacticalAIClass.prototype.manageRaidSquad;
  TacticalAIClass.prototype.manageRaidSquad = function(squad, units) {
    if (!['supply', 'economy', 'production', 'weak'].includes(squad?.mission)) {
      return baseManageRaid126.call(this, squad, units);
    }
    const target = this.game.getEntity(squad.targetId);
    if (target?.alive && target.team === 'player') {
      squad.targetX = target.x;
      squad.targetY = target.y;
    }
    const idle = units.every((unit) => !unit.currentCommand);
    if (!target?.alive || target.team !== 'player' || idle || this.game.time - squad.lastOrderAt > 72) {
      this._warPicture126 = null;
      const next = this.pickWarTarget126(squad.mission);
      if (!next) return baseManageRaid126.call(this, squad, units);
      squad.targetId = next.id;
      squad.targetX = next.x;
      squad.targetY = next.y;
      squad.path = this.buildFlankPath(next, squad.flank || 1, squad.mission === 'weak' ? .76 : 1.02).slice(1);
      this.issueRaidOrders(squad);
    }
  };

  const baseAIUpdate126 = TacticalAIClass.prototype.update;
  TacticalAIClass.prototype.update = function(dt) {
    const result = baseAIUpdate126.call(this, dt);
    const difficulty = this.game.difficultyKey || 'normal';
    const config = OPERATION_CONFIG[difficulty] || OPERATION_CONFIG.normal;
    const army = this.game._v94AliveUnits || this.game.units.length;
    const massInterval = army >= 500 ? 4.5 : config.interval;
    this.operationTimer126 = (this.operationTimer126 ?? (difficulty === 'hard' ? 7 : 12)) - dt * (this.game.difficulty.aiAggression || 1);
    if (this.operationTimer126 <= 0) {
      const launched = this.launchWarOperations126();
      this.operationTimer126 = launched ? massInterval : Math.min(9, massInterval * .42);
    }

    // The legacy missions remain concurrent, but may no longer postpone the
    // actual offensive for several quiet minutes while units pile up at base.
    this.attackTimer = Math.min(this.attackTimer, difficulty === 'hard' ? 22 : difficulty === 'easy' ? 54 : 34);
    this.harassTimer = Math.min(this.harassTimer, difficulty === 'hard' ? 28 : difficulty === 'easy' ? 88 : 48);
    this.ambushTimer = Math.min(this.ambushTimer, difficulty === 'hard' ? 42 : difficulty === 'easy' ? 125 : 70);
    if (this.game.time > (difficulty === 'hard' ? 65 : difficulty === 'normal' ? 115 : 210)) {
      this.covertTimer = Math.min(this.covertTimer, config.covertCeiling);
    }
    return result;
  };

  const baseAISerialize126 = TacticalAIClass.prototype.serialize;
  TacticalAIClass.prototype.serialize = function() {
    const data = baseAISerialize126.call(this);
    data.operationTimer126 = this.operationTimer126;
    data.operationCycle126 = this.operationCycle126 || 0;
    return data;
  };

  const baseHydrate126 = GameClass.prototype.hydrate;
  GameClass.prototype.hydrate = function(data) {
    const result = baseHydrate126.call(this, data);
    if (this.ai && data?.ai) {
      if (Number.isFinite(data.ai.operationTimer126)) this.ai.operationTimer126 = data.ai.operationTimer126;
      if (Number.isFinite(data.ai.operationCycle126)) this.ai.operationCycle126 = data.ai.operationCycle126;
    }
    return result;
  };

  const baseRenderSelection126 = GameClass.prototype.renderSelectionUI;
  GameClass.prototype.renderSelectionUI = function(...args) {
    const result = baseRenderSelection126.apply(this, args);
    const primary = this.selected?.length === 1 ? this.selected[0] : null;
    const details = document.getElementById('selection-details');
    details?.querySelector?.('[data-power-doctrine126]')?.remove?.();
    if (details && primary?.kind === 'building' && Number(primary.stats?.powerUse) > 0) {
      const online = this.isPowerGridOnline126(primary.team);
      details.insertAdjacentHTML('beforeend', `<div data-power-doctrine126 class="stat-line"><span>Энергоконтур</span><strong>${online ? 'В НОРМЕ' : 'ОБЕСТОЧЕНО'}</strong></div>`);
    }
    return result;
  };

  void 0;
  const eyebrow = document.querySelector('#start-screen .eyebrow');
  if (eyebrow) void 0;
  const lead = document.querySelector('#start-screen .lead');
  if (lead) void 0;

  window.__FD_WAR_ECONOMY_AI__ = {
    version: VERSION,
    operationConfig: OPERATION_CONFIG,
    airEngagementCosts: AIR_ENGAGEMENT_COSTS,
    powerOnline: (team = 'player') => Boolean(debug.game?.isPowerGridOnline126(team)),
    picture: () => debug.game?.ai?.refreshWarPicture126?.(true) || null,
  };
})();
