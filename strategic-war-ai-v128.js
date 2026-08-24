(() => {
  'use strict';

  const debug = window.__FD_DEBUG__;
  const GameClass = debug?.Game;
  const UnitClass = debug?.Unit;
  const TacticalAIClass = debug?.TacticalAI;
  const WORLD = debug?.WORLD;
  if (!GameClass || !TacticalAIClass || !WORLD) return;

  const VERSION = '12.8';
  const CONTACT_CELL = 720;
  const MAX_RECON_OBSERVERS = Object.freeze({ easy: 18, normal: 32, hard: 48 });
  const STRATEGIC_CONFIG = Object.freeze({
    easy: { interval: 31, scoutSquads: 1, assaultLimit: 2, raidLimit: 1, mainMin: 8, raidSize: 4, raidBursts: 1 },
    normal: { interval: 17, scoutSquads: 2, assaultLimit: 4, raidLimit: 3, mainMin: 10, raidSize: 6, raidBursts: 2 },
    hard: { interval: 10, scoutSquads: 3, assaultLimit: 6, raidLimit: 5, mainMin: 12, raidSize: 9, raidBursts: 3 },
  });
  const MISSION_SEQUENCE = Object.freeze({
    easy: ['supply', 'extraction'],
    normal: ['power', 'supply', 'production', 'extraction', 'weak'],
    hard: ['power', 'supply', 'production', 'extraction', 'weak'],
  });
  const SUPPLY_TYPES = new Set([
    'refinery', 'logisticsHub', 'resourceSilo', 'supplyBeacon',
    'oilPump', 'gasPump', 'mineralQuarry', 'oreMine', 'deepMine', 'coreDrill',
  ]);
  const EXTRACTION_TYPES = new Set([
    'oilPump', 'gasPump', 'mineralQuarry', 'oreMine', 'deepMine', 'coreDrill',
  ]);
  const clamp128 = (value, min, max) => Math.max(min, Math.min(max, value));
  const distance128 = (left, right) => Math.hypot((left?.x || 0) - (right?.x || 0), (left?.y || 0) - (right?.y || 0));
  const distanceSquared128 = (left, right) => {
    const dx = (left?.x || 0) - (right?.x || 0);
    const dy = (left?.y || 0) - (right?.y || 0);
    return dx * dx + dy * dy;
  };

  const isOperationalObserver128 = (ai, observer) => {
    if (!observer?.alive || observer.team !== 'enemy' || observer.embarkedIn || observer.airServiceState === 'servicing') return false;
    if (observer.kind === 'building') {
      if (!observer.completed || observer.sabotagedUntil > ai.game.time) return false;
      if (Number(observer.stats?.powerUse) > 0 && ai.game.isPowerGridOnline126 && !ai.game.isPowerGridOnline126('enemy')) return false;
    }
    return true;
  };

  const observerRange128 = (ai, observer) => {
    if (!isOperationalObserver128(ai, observer)) return 0;
    const detector = Math.max(Number(observer.detector) || 0, Number(observer.stats?.detector) || 0);
    const relay = observer.stats?.radarRelay ? Math.max(Number(observer.stats?.sensorRange) || 0, Number(observer.vision) || 0) : 0;
    const sight = Number(observer.vision) || Number(observer.stats?.vision) || 0;
    return Math.max(detector, relay, sight, 220);
  };

  TacticalAIClass.prototype.rememberBaseSignal = function() {
    const x = this.game.playerBase?.x ?? WORLD.width * .2;
    const y = this.game.playerBase?.y ?? WORLD.height * .5;
    this.intel.delete('player-base-signal');
    this.intel.set('player-deployment-sector-128', {
      id: 'player-deployment-sector-128', kind: 'signal', typeId: 'deployment-sector', category: 'unknown',
      x, y, hpRatio: 1, air: false, lastSeen: -1, value: 35, signal: true,
      confidence128: .22, uncertainty128: 1800, source128: 'deployment-briefing',
    });
  };

  const baseRememberEntity128 = TacticalAIClass.prototype.rememberEntity;
  TacticalAIClass.prototype.rememberEntity = function(entity) {
    if (!entity?.alive || entity.team !== 'player') return undefined;
    const previous = this.intel?.get(entity.id);
    const previousX = Number(previous?.x);
    const previousY = Number(previous?.y);
    const previousSeen = Number(previous?.lastSeen);
    const result = baseRememberEntity128.call(this, entity);
    const contact = this.intel?.get(entity.id);
    if (!contact) return result;

    const elapsed = Number.isFinite(previousSeen) ? Math.max(.05, this.game.time - previousSeen) : 0;
    const canEstimateMotion = elapsed > 0 && elapsed <= 28 && Number.isFinite(previousX) && Number.isFinite(previousY);
    contact.firstSeen128 = Number.isFinite(previous?.firstSeen128) ? previous.firstSeen128 : this.game.time;
    contact.confirmedAt128 = this.game.time;
    contact.confidence128 = 1;
    contact.uncertainty128 = 0;
    contact.source128 = this._intelSource128 || previous?.source128 || 'shared-battlefield-contact';
    contact.cost128 = Number(entity.stats?.cost) || 0;
    contact.power128 = Number(entity.stats?.power) || 0;
    contact.powerUse128 = Number(entity.stats?.powerUse) || 0;
    contact.income128 = Number(entity.stats?.income) || 0;
    contact.dropoff128 = Boolean(entity.stats?.dropoff);
    contact.logisticsExtractor128 = Boolean(entity.stats?.logisticsExtractor || EXTRACTION_TYPES.has(entity.typeId));
    contact.armed128 = Boolean(entity.stats?.weapon);
    contact.defense128 = entity.kind === 'building' && entity.stats?.category === 'defense';
    contact.cargo128 = Number(entity.cargo) || 0;
    contact.cargoCapacity128 = Number(entity.stats?.cargoCapacity) || 0;
    contact.completed128 = entity.kind !== 'building' || Boolean(entity.completed);
    contact.velocityX128 = canEstimateMotion ? (entity.x - previousX) / elapsed : 0;
    contact.velocityY128 = canEstimateMotion ? (entity.y - previousY) / elapsed : 0;
    contact.routeSamples128 = Math.min(8, (previous?.routeSamples128 || 0) + Number(canEstimateMotion));
    return result;
  };

  TacticalAIClass.prototype.operationalObserversNear128 = function(x, y, radius = 2200) {
    const game = this.game;
    const candidates = [
      ...(game.querySpatial?.(game.unitSpatial, x, y, radius) || []),
      ...(game.querySpatial?.(game.buildingSpatial, x, y, radius) || []),
    ];
    const seen = new Set();
    return candidates.filter((observer) => {
      if (!observer || seen.has(observer.id)) return false;
      seen.add(observer.id);
      return isOperationalObserver128(this, observer) && distanceSquared128(observer, { x, y }) <= observerRange128(this, observer) ** 2;
    });
  };

  TacticalAIClass.prototype.canObserveEntity128 = function(entity, force = false) {
    if (!entity?.alive || entity.team !== 'player') return false;
    const tick = Math.floor(this.game.time * 4);
    this._observationCache128 ||= new Map();
    const cached = this._observationCache128.get(entity.id);
    if (!force && cached?.tick === tick) return cached.value;
    const observers = this.operationalObserversNear128(entity.x, entity.y);
    let value = false;
    for (const observer of observers) {
      const range = observerRange128(this, observer);
      if (distance128(observer, entity) > range + (entity.radius || 0)) continue;
      if (!this.game.isTargetableBy?.(entity, 'enemy', observer)) continue;
      value = true;
      break;
    }
    this._observationCache128.set(entity.id, { tick, value });
    return value;
  };

  TacticalAIClass.prototype.canConfirmArea128 = function(x, y, radius = 260) {
    return this.operationalObserversNear128(x, y, 2200).some((observer) => {
      const range = observerRange128(this, observer);
      return Math.hypot(observer.x - x, observer.y - y) <= Math.max(radius, range);
    });
  };

  TacticalAIClass.prototype.collectIntel = function() {
    const game = this.game;
    const difficulty = game.difficultyKey || 'normal';
    const activeSquadIds = new Set(this.squads.flatMap((squad) => squad.unitIds || []));
    const observers = [
      ...game.units.filter((unit) => isOperationalObserver128(this, unit) && (
        this.isScout(unit) || activeSquadIds.has(unit.id) || Number(unit.detector) > 0 || Number(unit.stats?.radarRelay) > 0
      )),
      ...game.buildings.filter((building) => isOperationalObserver128(this, building) && (
        Number(building.detector) > 0 || building.stats?.radarRelay || Number(building.vision) >= 560
      )),
    ]
      .sort((left, right) => observerRange128(this, right) - observerRange128(this, left))
      .slice(0, MAX_RECON_OBSERVERS[difficulty] || MAX_RECON_OBSERVERS.normal);

    for (const observer of observers) {
      // Difficulty changes how often and how many real scouts are used, never
      // the physical sight radius of a unit. Hard AI therefore remains fair.
      const range = observerRange128(this, observer);
      const candidates = [
        ...(game.querySpatial?.(game.unitSpatial, observer.x, observer.y, range + 80) || []),
        ...(game.querySpatial?.(game.buildingSpatial, observer.x, observer.y, range + 140) || []),
      ];
      const seen = new Set();
      for (const entity of candidates) {
        if (!entity?.alive || entity.team !== 'player' || seen.has(entity.id)) continue;
        seen.add(entity.id);
        if (distance128(observer, entity) > range + (entity.radius || 0)) continue;
        if (!game.isTargetableBy?.(entity, 'enemy', observer)) continue;
        this._intelSource128 = this.isScout(observer) ? 'recon-unit' : observer.kind === 'building' ? 'powered-sensor' : 'combat-contact';
        this.rememberEntity(entity);
      }
    }
    this._intelSource128 = null;

    const now = game.time;
    const memoryScale = difficulty === 'hard' ? 1.2 : difficulty === 'easy' ? .72 : 1;
    for (const [id, contact] of this.intel.entries()) {
      if (contact.signal) continue;
      const baseMemory = contact.kind === 'building' ? 520 : contact.typeId === 'resourceTruck' ? 125 : 92;
      const age = now - (Number(contact.lastSeen) || 0);
      contact.confidence128 = clamp128(1 - age / (baseMemory * memoryScale), .08, 1);
      contact.uncertainty128 = contact.kind === 'building' ? Math.min(220, age * .35) : Math.min(1600, age * 7.5);
      if (age > baseMemory * memoryScale) this.intel.delete(id);
    }
    this.rememberBaseSignal();
    this.lastPlayerComposition = this.analyzePlayerComposition();
  };

  TacticalAIClass.prototype.knownTargets = function() {
    const now = this.game.time;
    return [...this.intel.values()].filter((contact) => {
      if (contact.signal) return true;
      const baseMemory = contact.kind === 'building' ? 520 : contact.typeId === 'resourceTruck' ? 125 : 92;
      const scale = this.game.difficultyKey === 'hard' ? 1.2 : this.game.difficultyKey === 'easy' ? .72 : 1;
      return now - (Number(contact.lastSeen) || 0) <= baseMemory * scale;
    });
  };

  TacticalAIClass.prototype.contactPoint128 = function(contact, purpose = 'assault') {
    if (!contact) return { x: this.game.playerBase.x, y: this.game.playerBase.y };
    let x = Number(contact.x) || 0;
    let y = Number(contact.y) || 0;
    if (contact.kind === 'unit' && ['supply', 'weak'].includes(purpose) && (contact.routeSamples128 || 0) >= 2) {
      const age = clamp128(this.game.time - (Number(contact.lastSeen) || 0), 0, 14);
      const horizon = Math.min(10, age + 3.5);
      x += (Number(contact.velocityX128) || 0) * horizon;
      y += (Number(contact.velocityY128) || 0) * horizon;
    }
    return {
      x: clamp128(x, 160, WORLD.width - 160),
      y: clamp128(y, 160, WORLD.height - 160),
    };
  };

  TacticalAIClass.prototype.refreshWarPicture126 = function(force = false) {
    const now = Number(this.game.time) || 0;
    const refresh = this.game.difficultyKey === 'hard' ? 2.8 : this.game.difficultyKey === 'easy' ? 7 : 4.4;
    if (!force && this._warPicture126 && now < this._warPicture126.expiresAt) return this._warPicture126;
    const entities = this.knownTargets().filter((contact) => !contact.signal).slice(0, 256);
    const defenseHeat = new Map();
    for (const contact of entities) {
      if (!contact.armed128 && !contact.defense128) continue;
      const key = `${Math.floor(contact.x / CONTACT_CELL)}:${Math.floor(contact.y / CONTACT_CELL)}`;
      const weight = contact.defense128 ? 3.5 : clamp128((contact.cost128 || 450) / 650, .4, 3.2);
      defenseHeat.set(key, (defenseHeat.get(key) || 0) + weight * (contact.confidence128 || 1));
    }
    this._warPicture126 = { entities, defenseHeat, expiresAt: now + refresh };
    return this._warPicture126;
  };

  TacticalAIClass.prototype.warTargetScore126 = function(contact, purpose, picture) {
    const age = Math.max(0, this.game.time - (Number(contact.lastSeen) || 0));
    const confidence = clamp128(Number(contact.confidence128) || 0, .05, 1);
    const category = contact.category || 'unknown';
    const cargoRatio = clamp128((Number(contact.cargo128) || 0) / Math.max(1, Number(contact.cargoCapacity128) || 1), 0, 1);
    const cellX = Math.floor(contact.x / CONTACT_CELL);
    const cellY = Math.floor(contact.y / CONTACT_CELL);
    let defense = 0;
    for (let ox = -1; ox <= 1; ox += 1) for (let oy = -1; oy <= 1; oy += 1) {
      defense += picture.defenseHeat.get(`${cellX + ox}:${cellY + oy}`) || 0;
    }
    let score = (contact.value || 30) + (contact.cost128 || 0) * .025;
    if (purpose === 'supply') {
      if (contact.typeId === 'resourceTruck') score += 820 + cargoRatio * 660;
      else if (contact.typeId === 'worker' && contact.cargo128 > 0) score += 300 + cargoRatio * 240;
      else if (contact.logisticsExtractor128 || SUPPLY_TYPES.has(contact.typeId)) score += 520;
      else if (contact.dropoff128) score += 360;
      else score -= 480;
      score -= defense * 18;
    } else if (purpose === 'extraction') {
      if (contact.logisticsExtractor128 || EXTRACTION_TYPES.has(contact.typeId)) score += 760;
      else if (contact.typeId === 'resourceTruck') score += 240 + cargoRatio * 300;
      else score -= 520;
      score -= defense * 15;
    } else if (purpose === 'power' || purpose === 'economy') {
      if (contact.power128 > 0) score += 760 + contact.power128 * 2.25;
      if (category === 'economy' || contact.income128 || contact.dropoff128) score += 240;
      if (!contact.power128 && category !== 'economy') score -= 350;
      score -= defense * 13;
    } else if (purpose === 'production') {
      if (category === 'production') score += 760;
      else if (category === 'strategy') score += 620;
      else if (category === 'technology') score += 430;
      else score -= 300;
      if (['airfield', 'advancedAirfield', 'heavyFactory', 'artilleryFoundry'].includes(contact.typeId)) score += 190;
      score -= defense * 11;
    } else if (purpose === 'weak') {
      if (contact.kind === 'building') score += 270;
      if (['production', 'economy', 'strategy'].includes(category) || contact.power128) score += 230;
      score -= defense * 38;
    } else {
      if (contact.typeId === 'hq') score += 680;
      if (category === 'production') score += 520;
      if (category === 'strategy') score += 450;
      if (contact.power128) score += 390;
      if (contact.logisticsExtractor128 || contact.dropoff128) score += 250;
      score -= defense * 6;
    }
    score *= .34 + confidence * .66;
    score -= age * (contact.kind === 'unit' ? 2.1 : .18);
    score -= (contact.uncertainty128 || 0) * .08;
    score -= Math.sqrt(distanceSquared128(contact, this.base)) / 1900;
    score += this.random() * 16;
    return score;
  };

  TacticalAIClass.prototype.pickWarTarget126 = function(purpose = 'assault') {
    const picture = this.refreshWarPicture126();
    let best = null;
    let bestScore = -Infinity;
    for (const contact of picture.entities) {
      const score = this.warTargetScore126(contact, purpose, picture);
      if (score > bestScore) {
        best = contact;
        bestScore = score;
      }
    }
    if (!best || bestScore < -180) return null;
    const point = this.contactPoint128(best, purpose);
    return { ...best, x: point.x, y: point.y, strategicPurpose128: purpose };
  };

  TacticalAIClass.prototype.pickTarget = function(purpose = 'assault') {
    let strategicPurpose = purpose;
    if (purpose === 'harass') {
      const sequence = MISSION_SEQUENCE[this.game.difficultyKey] || MISSION_SEQUENCE.normal;
      strategicPurpose = sequence[(this.operationCycle126 || 0) % sequence.length];
    } else if (purpose === 'siege') strategicPurpose = 'production';
    else if (purpose === 'feint') strategicPurpose = 'weak';
    else if (purpose === 'economy') strategicPurpose = 'power';
    const target = this.pickWarTarget126(strategicPurpose);
    if (target) return target;
    return this.intel.get('player-deployment-sector-128') || {
      id: 'player-deployment-sector-128', kind: 'signal', signal: true,
      x: this.game.playerBase.x, y: this.game.playerBase.y, category: 'unknown', value: 20,
    };
  };

  TacticalAIClass.prototype.ensureReconGrid128 = function() {
    if (Array.isArray(this._reconSectors128)) return this._reconSectors128;
    const columns = 5;
    const rows = 4;
    this._reconSectors128 = [];
    for (let row = 0; row < rows; row += 1) for (let column = 0; column < columns; column += 1) {
      const x = (column + .5) * WORLD.width / columns;
      const y = (row + .5) * WORLD.height / rows;
      const playerBias = 1 - clamp128(Math.hypot(x - this.game.playerBase.x, y - this.game.playerBase.y) / Math.hypot(WORLD.width, WORLD.height), 0, 1);
      this._reconSectors128.push({ id: `${column}:${row}`, x, y, playerBias, lastVisited: -9999, assignedUntil: 0 });
    }
    return this._reconSectors128;
  };

  TacticalAIClass.prototype.chooseReconSector128 = function() {
    const now = this.game.time;
    const sectors = this.ensureReconGrid128();
    const candidates = sectors.filter((sector) => sector.assignedUntil <= now);
    const pool = candidates.length ? candidates : sectors;
    const sector = [...pool].sort((left, right) => {
      const leftScore = now - left.lastVisited + left.playerBias * 190 + this.random() * 55;
      const rightScore = now - right.lastVisited + right.playerBias * 190 + this.random() * 55;
      return rightScore - leftScore;
    })[0];
    if (sector) sector.assignedUntil = now + 95;
    return sector || { id: 'fallback', x: this.game.playerBase.x, y: this.game.playerBase.y, lastVisited: -9999, assignedUntil: now + 60 };
  };

  TacticalAIClass.prototype.launchScoutMission = function() {
    const active = this.squads.filter((squad) => squad.role === 'scout').length;
    const config = STRATEGIC_CONFIG[this.game.difficultyKey] || STRATEGIC_CONFIG.normal;
    if (active >= config.scoutSquads) return false;
    const available = this.availableCombatUnits((unit) => !this.isCovert(unit));
    let candidates = available.filter((unit) => this.isScout(unit));
    if (!candidates.length) {
      candidates = [...available]
        .sort((left, right) => (right.stats.speed || 0) + (right.vision || 0) * .22 - (left.stats.speed || 0) - (left.vision || 0) * .22)
        .slice(0, 1);
    }
    if (!candidates.length) return false;
    const sector = this.chooseReconSector128();
    const count = this.game.difficultyKey === 'hard' ? Math.min(2, candidates.length) : 1;
    const units = candidates.slice(0, count);
    const flank = this.laneRotation++ % 2 ? 1 : -1;
    const target = { x: sector.x, y: sector.y };
    const path = this.buildFlankPath(target, flank, 1.12).slice(0, 3);
    path.push(target);
    const squad = this.createSquad('scout', units, {
      targetX: sector.x, targetY: sector.y, path, state: 'scouting', flank,
      mission: 'recon', expiresAt: this.game.time + 250,
    });
    if (!squad) return false;
    squad.reconSectorId128 = sector.id;
    this.issueScoutOrders(squad);
    return true;
  };

  TacticalAIClass.prototype.manageScoutSquad = function(squad, units, centroid) {
    const sector = this.ensureReconGrid128().find((item) => item.id === squad.reconSectorId128);
    const arrived = Math.hypot(centroid.x - squad.targetX, centroid.y - squad.targetY) < 420;
    if (arrived && sector) sector.lastVisited = this.game.time;
    if (arrived || units.every((unit) => !unit.currentCommand) || this.game.time - squad.lastOrderAt > 145) {
      const next = this.chooseReconSector128();
      squad.reconSectorId128 = next.id;
      squad.targetX = next.x;
      squad.targetY = next.y;
      squad.path = this.buildFlankPath(next, this.laneRotation++ % 2 ? 1 : -1, 1.08).slice(0, 3);
      squad.path.push({ x: next.x, y: next.y });
      this.issueScoutOrders(squad);
    }
    if (units.some((unit) => unit.healthRatio < .28)) this.releaseSquad(squad, true);
  };

  TacticalAIClass.prototype.resolveObservedTarget128 = function(squad) {
    const target = this.game.getEntity(squad.targetId);
    if (target?.alive && target.team === 'player' && this.canObserveEntity128(target)) {
      this._intelSource128 = 'operation-contact';
      this.rememberEntity(target);
      this._intelSource128 = null;
      const contact = this.intel.get(target.id);
      const point = this.contactPoint128(contact, squad.mission || 'assault');
      squad.targetX = point.x;
      squad.targetY = point.y;
      squad.lastConfirmedAt128 = this.game.time;
      return target;
    }
    return null;
  };

  TacticalAIClass.prototype.localOpportunity128 = function(squad, units) {
    const centroid = this.squadCentroid(units);
    const radius = Math.max(620, Math.min(1450, Math.max(...units.map((unit) => Number(unit.vision) || 300))));
    const nearby = this.playerTargetsNear(centroid.x, centroid.y, radius);
    for (const entity of nearby) {
      if (!this.canObserveEntity128(entity, true)) continue;
      this._intelSource128 = 'operation-contact';
      this.rememberEntity(entity);
    }
    this._intelSource128 = null;
    const picture = this.refreshWarPicture126(true);
    return nearby
      .filter((entity) => this.canObserveEntity128(entity))
      .sort((left, right) => this.warTargetScore126(this.intel.get(right.id) || {}, squad.mission || 'assault', picture) -
        this.warTargetScore126(this.intel.get(left.id) || {}, squad.mission || 'assault', picture))[0] || null;
  };

  TacticalAIClass.prototype.issueRaidOrders = function(squad) {
    const units = this.squadUnits(squad);
    if (!units.length) return;
    const visibleTarget = this.resolveObservedTarget128(squad);
    const path = squad.path?.length ? squad.path : [{ x: squad.targetX, y: squad.targetY }];
    units.forEach((unit, index) => {
      const offset = this.game.formationOffset(index, units.length, 56);
      unit.setCommand({ type: 'attackMove', x: path[0].x + offset.x, y: path[0].y + offset.y });
      for (const point of path.slice(1)) unit.setCommand({ type: 'attackMove', x: point.x + offset.x, y: point.y + offset.y }, true);
      if (visibleTarget && unit.canAttack(visibleTarget)) unit.setCommand({ type: 'attack', targetId: visibleTarget.id }, true);
      else unit.setCommand({ type: 'attackMove', x: squad.targetX + offset.x, y: squad.targetY + offset.y }, true);
    });
    squad.lastOrderAt = this.game.time;
  };

  TacticalAIClass.prototype.issueAssaultOrders = function(squad) {
    const units = this.squadUnits(squad);
    if (!units.length) return;
    const visibleTarget = this.resolveObservedTarget128(squad);
    const path = squad.path?.length ? squad.path : [{ x: squad.targetX, y: squad.targetY }];
    const targetPoint = { x: squad.targetX, y: squad.targetY };
    const angleFromTarget = Math.atan2(this.base.y - targetPoint.y, this.base.x - targetPoint.x);
    units.forEach((unit, index) => {
      const offset = this.game.formationOffset(index, units.length, Math.max(48, unit.radius * 2.2));
      unit.setCommand({ type: 'attackMove', x: path[0].x + offset.x, y: path[0].y + offset.y });
      for (const point of path.slice(1)) unit.setCommand({ type: 'attackMove', x: point.x + offset.x, y: point.y + offset.y }, true);
      if (this.isSiege(unit)) {
        const standOff = clamp128((unit.stats.weapon?.range || 420) * .62, 240, 520);
        unit.setCommand({
          type: 'attackMove',
          x: targetPoint.x + Math.cos(angleFromTarget) * standOff + offset.x * .5,
          y: targetPoint.y + Math.sin(angleFromTarget) * standOff + offset.y * .5,
        }, true);
      }
      if (visibleTarget && unit.canAttack(visibleTarget)) unit.setCommand({ type: 'attack', targetId: visibleTarget.id }, true);
      else unit.setCommand({ type: 'attackMove', x: targetPoint.x + offset.x, y: targetPoint.y + offset.y }, true);
    });
    squad.state = 'advancing';
    squad.lastOrderAt = this.game.time;
  };

  TacticalAIClass.prototype.retaskOperation128 = function(squad, units, role = 'raid') {
    const local = this.localOpportunity128(squad, units);
    let next = local ? this.intel.get(local.id) : this.pickWarTarget126(squad.mission || (role === 'assault' ? 'assault' : 'supply'));
    if (!next) {
      if (this.canConfirmArea128(squad.targetX, squad.targetY)) this.intel.delete(squad.targetId);
      this.releaseSquad(squad, true);
      return false;
    }
    const point = this.contactPoint128(next, squad.mission || 'assault');
    squad.targetId = next.id;
    squad.targetX = point.x;
    squad.targetY = point.y;
    squad.path = this.buildFlankPath(point, squad.flank || 1, role === 'assault' ? .62 : 1.02).slice(1);
    if (role === 'assault') this.issueAssaultOrders(squad);
    else this.issueRaidOrders(squad);
    return true;
  };

  TacticalAIClass.prototype.manageRaidSquad = function(squad, units) {
    const visibleTarget = this.resolveObservedTarget128(squad);
    const centroid = this.squadCentroid(units);
    const reachedLastKnown = Math.hypot(centroid.x - squad.targetX, centroid.y - squad.targetY) < 460;
    const idle = units.every((unit) => !unit.currentCommand);
    const target = this.game.getEntity(squad.targetId);
    const confirmedGone = !target?.alive && reachedLastKnown && this.canConfirmArea128(squad.targetX, squad.targetY);
    if (confirmedGone) this.intel.delete(squad.targetId);
    if (confirmedGone || idle || (reachedLastKnown && !visibleTarget) || this.game.time - squad.lastOrderAt > 68) {
      this._warPicture126 = null;
      this.retaskOperation128(squad, units, 'raid');
    }
  };

  TacticalAIClass.prototype.manageAssaultSquad = function(squad, units) {
    if (squad.state === 'staging' && this.game.time >= squad.launchAt) this.issueAssaultOrders(squad);
    const visibleTarget = this.resolveObservedTarget128(squad);
    const centroid = this.squadCentroid(units);
    const reachedLastKnown = Math.hypot(centroid.x - squad.targetX, centroid.y - squad.targetY) < 520;
    const idle = units.every((unit) => !unit.currentCommand);
    const target = this.game.getEntity(squad.targetId);
    const confirmedGone = !target?.alive && reachedLastKnown && this.canConfirmArea128(squad.targetX, squad.targetY);
    if (confirmedGone) this.intel.delete(squad.targetId);
    if ((confirmedGone || idle || (reachedLastKnown && !visibleTarget)) && this.game.time - squad.lastOrderAt > 10) {
      this._warPicture126 = null;
      this.retaskOperation128(squad, units, 'assault');
    }
  };

  TacticalAIClass.prototype.currentBaseThreat = function() {
    const tick = Math.floor(this.game.time * 2);
    if (this._baseThreat128?.tick === tick) return this._baseThreat128.value;
    const candidates = this.game.querySpatial?.(this.game.unitSpatial, this.base.x, this.base.y, 3000) || [];
    const targets = candidates.filter((unit) => unit?.alive && unit.team === 'player' && distance128(unit, this.base) < (unit.air ? 3000 : 2400) && this.canObserveEntity128(unit));
    const result = { score: 0, infantry: 0, vehicle: 0, air: 0, ground: 0, targets, x: this.base.x, y: this.base.y };
    let weightedX = 0;
    let weightedY = 0;
    for (const unit of targets) {
      this._intelSource128 = 'base-contact';
      this.rememberEntity(unit);
      const value = 1 + (unit.stats.cost || 500) / 1000 + (this.isSiege(unit) ? 1.6 : 0);
      result.score += value;
      weightedX += unit.x * value;
      weightedY += unit.y * value;
      if (unit.air) result.air += value;
      else {
        result.ground += value;
        if (unit.vehicle) result.vehicle += value;
        else result.infantry += value;
      }
    }
    this._intelSource128 = null;
    if (result.score > 0) {
      result.x = weightedX / result.score;
      result.y = weightedY / result.score;
    }
    this._baseThreat128 = { tick, value: result };
    return result;
  };

  TacticalAIClass.prototype.chooseCovertTarget = function(mission) {
    const contacts = this.knownTargets()
      .filter((contact) => !contact.signal && contact.kind === 'building' && contact.completed128 !== false)
      .filter((contact) => this.game.time - contact.lastSeen <= (this.game.difficultyKey === 'hard' ? 150 : 105));
    let bestContact = null;
    let bestScore = -Infinity;
    for (const contact of contacts) {
      let score = (contact.value || 70) * (.42 + (contact.confidence128 || .5) * .58);
      if (mission === 'sabotage') {
        if (contact.power128) score += 430 + contact.power128 * 1.5;
        if (contact.category === 'production') score += 310;
        if (contact.logisticsExtractor128 || SUPPLY_TYPES.has(contact.typeId)) score += 260;
      } else if (mission === 'intel') {
        if (['command', 'technology', 'production'].includes(contact.category)) score += 260;
      } else if (mission === 'recruit' && ['economy', 'production'].includes(contact.category)) score += 220;
      score -= (contact.uncertainty128 || 0) * .12;
      if (score > bestScore) {
        bestContact = contact;
        bestScore = score;
      }
    }
    if (!bestContact) return null;
    const entity = this.game.getEntity(bestContact.id);
    if (entity?.alive && entity.team === 'player' && entity.completed) return entity;
    // A stale report remains a place to investigate, not proof that the target
    // still exists. The agent travels there before the contact is discarded.
    return {
      id: bestContact.id, kind: 'building', team: 'player', alive: true, completed: true,
      typeId: bestContact.typeId, x: bestContact.x, y: bestContact.y, radius: 55,
      stats: {
        category: bestContact.category,
        power: bestContact.power128,
        cost: bestContact.cost128,
        income: bestContact.income128,
        dropoff: bestContact.dropoff128,
      },
    };
  };

  const baseManageCovert128 = TacticalAIClass.prototype.manageCovertSquad;
  TacticalAIClass.prototype.manageCovertSquad = function(squad, units) {
    const agent = units[0];
    if (!agent?.alive) {
      squad.unitIds = [];
      return;
    }
    const target = this.game.getEntity(squad.targetId);
    if (target?.alive && target.kind === 'building' && target.team === 'player') {
      return baseManageCovert128.call(this, squad, units);
    }
    const reachedLastKnown = Math.hypot(agent.x - squad.targetX, agent.y - squad.targetY) < 380;
    if (!reachedLastKnown || !this.canConfirmArea128(squad.targetX, squad.targetY)) {
      if (!agent.currentCommand || agent.currentCommand.type === 'infiltrate') {
        agent.setCommand({ type: 'move', x: squad.targetX, y: squad.targetY });
        squad.lastOrderAt = this.game.time;
      }
      return;
    }

    this.intel.delete(squad.targetId);
    const replacement = this.chooseCovertTarget(squad.mission || 'sabotage');
    if (!replacement) {
      this.releaseSquad(squad, true);
      return;
    }
    squad.targetId = replacement.id;
    squad.targetX = replacement.x;
    squad.targetY = replacement.y;
    const path = this.buildFlankPath(replacement, squad.flank || 1, 1.04);
    path.slice(0, -1).forEach((point, index) => agent.setCommand({ type: 'move', x: point.x, y: point.y }, index > 0));
    agent.setCommand({ type: 'infiltrate', targetId: replacement.id, mission: squad.mission || 'sabotage', progress: 0 }, true);
    squad.lastOrderAt = this.game.time;
  };

  TacticalAIClass.prototype.raidSelectionScore128 = function(unit, mission) {
    const speed = Number(unit.stats?.speed) || 0;
    const range = Number(unit.stats?.weapon?.range) || 0;
    const buildingDamage = Number(unit.stats?.weapon?.bonus?.building) || 0;
    let score = speed * .42 + range * .12 + unit.healthRatio * 60;
    if (unit.stats?.stealth) score += 95;
    if (unit.air) score += 60;
    if (mission === 'supply' || mission === 'extraction') score += this.isRaider(unit) ? 110 : 0;
    if (mission === 'power' || mission === 'production') score += this.isSiege(unit) ? 135 : buildingDamage * 70;
    if (mission === 'weak') score += speed * .20;
    return score;
  };

  TacticalAIClass.prototype.launchWarOperations126 = function() {
    const difficulty = this.game.difficultyKey || 'normal';
    const config = STRATEGIC_CONFIG[difficulty] || STRATEGIC_CONFIG.normal;
    while (this.squads.filter((squad) => squad.role === 'scout').length < config.scoutSquads) {
      if (!this.launchScoutMission()) break;
    }

    const combatAvailable = () => this.availableCombatUnits((unit) =>
      !this.isCovert(unit) && !unit.stats?.strategicLauncher?.length && Boolean(unit.stats?.weapon));
    let available = combatAvailable();
    let launched = false;
    const totalArmy = this.game._v94AliveUnits || this.game.units.length;
    const massMode = totalArmy >= 500;
    const assaultLimit = massMode ? Math.max(config.assaultLimit, 12) : config.assaultLimit;
    let activeAssaults = this.squads.filter((squad) => squad.role === 'assault').length;
    const assaultBursts = massMode ? Math.min(3, assaultLimit - activeAssaults) : Math.min(1, assaultLimit - activeAssaults);
    for (let burst = 0; burst < assaultBursts && available.length >= config.mainMin; burst += 1) {
      const target = this.pickWarTarget126('assault') || this.pickTarget('assault');
      const reserve = Math.min(config.raidSize * Math.max(1, config.raidLimit - 1), Math.floor(available.length * .32));
      const desired = massMode
        ? Math.min(140, Math.max(42, Math.ceil((available.length - reserve) * .16)))
        : Math.min(difficulty === 'hard' ? 64 : difficulty === 'easy' ? 26 : 46, Math.max(config.mainMin, Math.ceil((available.length - reserve) * .54)));
      const units = [...available]
        .sort((left, right) => this.assaultSelectionScore(right) - this.assaultSelectionScore(left))
        .slice(0, desired);
      const squad = this.createAssaultSquad(units, target, this.laneRotation++ % 3 - 1, 'assault', 0);
      if (squad) {
        squad.mission = 'main-assault';
        squad.intelStamp128 = target.lastSeen || -1;
        launched = true;
        activeAssaults += 1;
      }
      available = combatAvailable();
    }

    const sequence = MISSION_SEQUENCE[difficulty] || MISSION_SEQUENCE.normal;
    const raidLimit = massMode ? Math.max(config.raidLimit, 15) : config.raidLimit;
    const missionLimit = massMode ? (difficulty === 'hard' ? 3 : 2) : 1;
    let bursts = 0;
    for (let offset = 0; offset < sequence.length && bursts < config.raidBursts; offset += 1) {
      const mission = sequence[((this.operationCycle126 || 0) + offset) % sequence.length];
      const activeMission = this.squads.filter((squad) => ['harass', 'feint'].includes(squad.role) && squad.mission === mission).length;
      const activeRaids = this.squads.filter((squad) => ['harass', 'feint'].includes(squad.role)).length;
      if (activeMission >= missionLimit || activeRaids >= raidLimit) continue;
      const target = this.pickWarTarget126(mission);
      if (!target) continue;
      available = combatAvailable();
      const raidSize = massMode ? Math.min(36, Math.max(config.raidSize, Math.ceil(available.length * .008))) : config.raidSize;
      const units = [...available]
        .sort((left, right) => this.raidSelectionScore128(right, mission) - this.raidSelectionScore128(left, mission))
        .slice(0, raidSize);
      if (units.length < Math.min(3, config.raidSize)) continue;
      const flank = this.laneRotation++ % 2 ? 1 : -1;
      const squad = this.createSquad('harass', units, {
        targetId: target.id, targetX: target.x, targetY: target.y,
        path: this.buildFlankPath(target, flank, mission === 'weak' ? .78 : 1.08),
        state: 'raiding', flank, mission, expiresAt: this.game.time + 260,
      });
      if (!squad) continue;
      squad.intelStamp128 = target.lastSeen || -1;
      this.issueRaidOrders(squad);
      launched = true;
      bursts += 1;
    }
    this.operationCycle126 = (this.operationCycle126 || 0) + 1;
    return launched;
  };

  const baseAIUpdate128 = TacticalAIClass.prototype.update;
  TacticalAIClass.prototype.update = function(dt) {
    const result = baseAIUpdate128.call(this, dt);
    const config = STRATEGIC_CONFIG[this.game.difficultyKey] || STRATEGIC_CONFIG.normal;
    this.operationTimer126 = Math.min(this.operationTimer126 ?? config.interval, config.interval);
    return result;
  };

  const baseUseStrategicPower128 = TacticalAIClass.prototype.useStrategicPower;
  if (baseUseStrategicPower128) {
    TacticalAIClass.prototype.useStrategicPower = function() {
      if (!this.game.isPowerGridOnline126?.('enemy')) return false;
      return baseUseStrategicPower128.call(this);
    };
  }

  // The older strategic-arsenal loop inspected every player building directly.
  // Restrict its synchronous view to structures that a scout, combat observer or
  // physical agent network has actually reported. Mobile launchers may then act
  // on that shared headquarters picture, exactly as a human player would.
  const baseEnemyStrategicArsenal128 = GameClass.prototype.updateEnemyStrategicArsenal;
  if (baseEnemyStrategicArsenal128) {
    GameClass.prototype.updateEnemyStrategicArsenal = function(dt) {
      const knownBuildingIds = new Set((this.ai?.knownTargets?.() || [])
        .filter((contact) => !contact.signal && contact.kind === 'building')
        .map((contact) => contact.id));
      const buildings = this.buildings;
      this.buildings = buildings.filter((building) => building.team !== 'player' || knownBuildingIds.has(building.id));
      try {
        return baseEnemyStrategicArsenal128.call(this, dt);
      } finally {
        this.buildings = buildings;
      }
    };
  }

  const baseAISerialize128 = TacticalAIClass.prototype.serialize;
  TacticalAIClass.prototype.serialize = function() {
    const data = baseAISerialize128.call(this);
    data.reconSectors128 = this.ensureReconGrid128().map((sector) => ({
      id: sector.id, lastVisited: sector.lastVisited, assignedUntil: sector.assignedUntil,
    }));
    return data;
  };

  const baseHydrate128 = GameClass.prototype.hydrate;
  if (baseHydrate128) {
    GameClass.prototype.hydrate = function(data) {
      const result = baseHydrate128.call(this, data);
      if (this.ai && Array.isArray(data?.ai?.reconSectors128)) {
        const saved = new Map(data.ai.reconSectors128.map((sector) => [sector.id, sector]));
        for (const sector of this.ai.ensureReconGrid128()) {
          const state = saved.get(sector.id);
          if (!state) continue;
          sector.lastVisited = Number(state.lastVisited) || -9999;
          sector.assignedUntil = Number(state.assignedUntil) || 0;
        }
      }
      return result;
    };
  }

  // Base-wide command abilities and powered airfield servicing stop during a
  // deficit as well. Mobile launchers remain autonomous and can still fire.
  const baseActivatePower128 = GameClass.prototype.activatePower;
  if (baseActivatePower128) {
    GameClass.prototype.activatePower = function(type) {
      const config = debug.POWER_TYPES?.[type];
      if (!config?.strategic && !this.isPowerGridOnline126?.('player')) {
        this.alert?.('Недостаток энергии: командная система недоступна.', 'warning');
        return false;
      }
      return baseActivatePower128.call(this, type);
    };
  }

  const baseExecutePower128 = GameClass.prototype.executePower;
  if (baseExecutePower128) {
    GameClass.prototype.executePower = function(type, x, y) {
      const config = debug.POWER_TYPES?.[type];
      if (!config?.strategic && !this.isPowerGridOnline126?.('player')) {
        this.commandMode = null;
        this.alert?.('Недостаток энергии: командная система недоступна.', 'warning');
        return false;
      }
      return baseExecutePower128.call(this, type, x, y);
    };
  }

  if (UnitClass) {
    const baseProcessCommand128 = UnitClass.prototype.processCommand;
    UnitClass.prototype.processCommand = function(command, dt) {
      if (command?.type === 'airService' && command.stage === 'servicing') {
        const field = this.game.getEntity(command.airfieldId || this.airServiceTargetId);
        if (field?.stats?.powerUse > 0 && !this.game.isPowerGridOnline126?.(this.team)) {
          this.airServiceState = 'servicing';
          this.airServiceTimer = this.airServiceTimer || 0;
          if (this.team === 'player' && this.game.time >= (this._airfieldBlackoutAlert128 || 0)) {
            this._airfieldBlackoutAlert128 = this.game.time + 8;
            this.game.alert?.(`${field.stats.name}: обслуживание приостановлено — нет питания`, 'warning', field.x, field.y);
          }
          return;
        }
      }
      return baseProcessCommand128.call(this, command, dt);
    };

    const baseUnitUpdate128 = UnitClass.prototype.update;
    if (baseUnitUpdate128) {
      UnitClass.prototype.update = function(dt) {
        const field = this.airServiceState === 'servicing'
          ? this.game.getEntity(this.airServiceTargetId || this.currentCommand?.airfieldId)
          : null;
        const blackout = Boolean(field?.stats?.powerUse > 0 && !this.game.isPowerGridOnline126?.(this.team));
        if (!blackout) return baseUnitUpdate128.call(this, dt);
        const savedCharges = this.countermeasureCharges92;
        const savedReload = this.countermeasureReload92;
        const result = baseUnitUpdate128.call(this, dt);
        this.countermeasureCharges92 = savedCharges;
        this.countermeasureReload92 = savedReload;
        return result;
      };
    }
  }

  const baseRenderSelection128 = GameClass.prototype.renderSelectionUI;
  GameClass.prototype.renderSelectionUI = function(...args) {
    const result = baseRenderSelection128.apply(this, args);
    const primary = this.selected?.length === 1 ? this.selected[0] : null;
    const details = document.getElementById('selection-details');
    details?.querySelector?.('[data-strategic-power128]')?.remove?.();
    if (details && primary?.kind === 'building' && Number(primary.stats?.powerUse) > 0) {
      const online = this.isPowerGridOnline126?.(primary.team);
      details.insertAdjacentHTML('beforeend', `<div data-strategic-power128 class="stat-line"><span>Питание систем</span><strong>${online ? 'РАБОТАЮТ' : 'ОТКЛЮЧЕНЫ'}</strong></div>`);
    }
    return result;
  };

  void 0;
  const eyebrow = document.querySelector('#start-screen .eyebrow');
  if (eyebrow) void 0;
  const lead = document.querySelector('#start-screen .lead');
  if (lead) void 0;

  window.__FD_STRATEGIC_WAR_AI__ = {
    version: VERSION,
    config: STRATEGIC_CONFIG,
    missions: MISSION_SEQUENCE,
    contacts: () => debug.game?.ai?.knownTargets?.().map((contact) => ({ ...contact })) || [],
    operations: () => debug.game?.ai?.squads?.map((squad) => ({
      id: squad.id, role: squad.role, mission: squad.mission, targetId: squad.targetId,
    })) || [],
    powerOnline: (team = 'player') => Boolean(debug.game?.isPowerGridOnline126?.(team)),
  };
})();
