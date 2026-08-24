(() => {
  'use strict';

  const root = globalThis;
  const D = root.__FD_DEBUG__;
  const Game = D?.Game;
  if (!Game?.prototype || root.__FD_SIMULATION_RESILIENCE_200__) return;

  const VERSION = '16.8.16';
  const BUILD = 200;
  const SAVE_VERSION = 5;
  const VALID_TEAMS = new Set(['player', 'enemy', 'neutral']);
  const VALID_KINDS = new Set(['unit', 'building', 'resource']);
  const state = {
    savesNormalized: 0,
    entitiesDropped: 0,
    duplicateIdsDropped: 0,
    invalidCommandsDropped: 0,
    invalidQueueItemsDropped: 0,
    expiredZonesDropped: 0,
    staleFogEmittersRemoved: 0,
    scanPulsesStarted: 0,
    plainZonesMadeSerializable: 0,
    workerStallsDetected: 0,
    mainThreadFallbacks: 0,
    lastNormalization: null,
    lastFallbackReason: null,
  };

  const number = (value, fallback = 0) => {
    if (value == null || value === '') return fallback;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const positive = (value, fallback = 1) => Math.max(0.001, number(value, fallback));
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const array = value => Array.isArray(value) ? value : [];
  const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const idKey = value => value == null ? '' : String(value);
  const clonePlain = (value, depth = 0) => {
    if (depth > 6 || value == null || ['string', 'boolean'].includes(typeof value)) return value;
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    if (Array.isArray(value)) return value.slice(0, 256).map(item => clonePlain(item, depth + 1));
    if (typeof value !== 'object') return undefined;
    const result = {};
    for (const [key, item] of Object.entries(value)) {
      const cloned = clonePlain(item, depth + 1);
      if (cloned !== undefined) result[key] = cloned;
    }
    return result;
  };

  const normalizePoint = (point, fallbackX = 0, fallbackY = 0) => ({
    x: number(point?.x, fallbackX),
    y: number(point?.y, fallbackY),
  });

  const normalizeCommand = command => {
    if (!command || typeof command !== 'object' || Array.isArray(command) || typeof command.type !== 'string' || !command.type.trim()) {
      state.invalidCommandsDropped += 1;
      return null;
    }
    const normalized = clonePlain(command);
    normalized.type = command.type.trim().slice(0, 64);
    for (const key of [
      'x', 'y', 'ax', 'ay', 'bx', 'by', 'targetX', 'targetY', 'angle', 'rotation',
      'progress', 'leash', 'issuedAt95', 'issuedAt199', 'approachAngle95', 'cargoCost95',
    ]) {
      if (normalized[key] != null) normalized[key] = number(normalized[key]);
    }
    return normalized;
  };

  const productionStats = (itemId, kind, team) => {
    if (kind === 'upgrade') return D.UPGRADES?.[itemId] || null;
    try {
      const upgrades = new Set(array(team?.upgrades));
      return D.getUnitStats?.(itemId, { faction: team?.faction || 'vanguard', upgrades }) || D.UNIT_TYPES?.[itemId] || null;
    } catch (_) {
      return D.UNIT_TYPES?.[itemId] || null;
    }
  };

  const normalizeQueueItem = (raw, team) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      state.invalidQueueItemsDropped += 1;
      return null;
    }
    const candidateId = raw.id ?? raw.itemId ?? raw.typeId ?? (
      raw.type !== 'unit' && raw.type !== 'upgrade' ? raw.type : null
    );
    const id = typeof candidateId === 'string' ? candidateId : '';
    const kind = raw.kind === 'upgrade' || raw.type === 'upgrade' || D.UPGRADES?.[id]
      ? 'upgrade'
      : raw.kind === 'unit' || raw.type === 'unit' || D.UNIT_TYPES?.[id] ? 'unit' : null;
    const stats = kind && id ? productionStats(id, kind, team) : null;
    if (!kind || !id || !stats) {
      state.invalidQueueItemsDropped += 1;
      return null;
    }
    const total = positive(raw.total ?? raw.duration ?? raw.time, positive(stats.time, 1));
    let remaining;
    if (raw.remaining != null && raw.remaining !== '') remaining = number(raw.remaining, total);
    else if (raw.timeRemaining != null) remaining = number(raw.timeRemaining, total);
    else if (raw.progress != null) remaining = total * (1 - clamp(number(raw.progress), 0, 1));
    else remaining = total;
    return {
      kind,
      id,
      remaining: clamp(remaining, 0, total),
      total,
      cost: Math.max(0, number(raw.cost, number(stats.cost))),
      name: String(raw.name || stats.name || id).slice(0, 160),
    };
  };

  const normalizeTeam = (raw, fallbackFaction, fallbackCredits) => {
    const source = object(raw);
    const powers = {};
    for (const [key, value] of Object.entries(object(source.powers))) powers[key] = Math.max(0, number(value));
    return {
      ...clonePlain(source),
      faction: typeof source.faction === 'string' && source.faction ? source.faction : fallbackFaction,
      credits: Math.max(0, number(source.credits, fallbackCredits)),
      commandXp: Math.max(0, number(source.commandXp)),
      rank: Math.max(1, Math.floor(number(source.rank, 1))),
      powerProduced: Math.max(0, number(source.powerProduced)),
      powerUsed: Math.max(0, number(source.powerUsed)),
      powerFactor: clamp(number(source.powerFactor, 1), 0, 1),
      upgrades: [...new Set(array(source.upgrades).filter(value => typeof value === 'string'))],
      powers,
    };
  };

  const normalizeSave = rawSave => {
    const source = object(rawSave);
    const result = { ...clonePlain(source) };
    const worldWidth = positive(D.WORLD?.width, 32000);
    const worldHeight = positive(D.WORLD?.height, 22000);
    const teams = {
      player: normalizeTeam(source.teams?.player, 'vanguard', 16000),
      enemy: normalizeTeam(source.teams?.enemy, 'dominion', 16000),
    };
    result.version = SAVE_VERSION;
    result.seed = Math.max(1, Math.floor(number(source.seed, 921731)));
    result.time = Math.max(0, number(source.time));
    result.difficultyKey = ['easy', 'normal', 'hard'].includes(source.difficultyKey) ? source.difficultyKey : 'normal';
    result.teams = teams;
    result.camera = {
      ...clonePlain(object(source.camera)),
      x: clamp(number(source.camera?.x, 1800), 0, worldWidth),
      y: clamp(number(source.camera?.y, worldHeight / 2), 0, worldHeight),
      zoom: clamp(number(source.camera?.zoom, 0.68), 0.12, 3.5),
      yaw: number(source.camera?.yaw, -0.42),
      pitch: clamp(number(source.camera?.pitch, 0.58), 0.12, 1.35),
    };

    const combined = array(source.entities).length
      ? array(source.entities)
      : [...array(source.units), ...array(source.buildings), ...array(source.resources)];
    const seenIds = new Set();
    const entities = [];
    let maxNumericId = 0;
    for (const rawEntity of combined) {
      if (!rawEntity || typeof rawEntity !== 'object' || !VALID_KINDS.has(rawEntity.kind)) {
        state.entitiesDropped += 1;
        continue;
      }
      const id = idKey(rawEntity.id);
      const team = VALID_TEAMS.has(rawEntity.team) ? rawEntity.team : (rawEntity.kind === 'resource' ? 'neutral' : 'player');
      const knownType = rawEntity.kind === 'unit'
        ? Boolean(D.UNIT_TYPES?.[rawEntity.typeId])
        : rawEntity.kind === 'building' ? Boolean(D.BUILDING_TYPES?.[rawEntity.typeId]) : true;
      if (!id || seenIds.has(id) || !knownType) {
        if (seenIds.has(id)) state.duplicateIdsDropped += 1;
        else state.entitiesDropped += 1;
        continue;
      }
      seenIds.add(id);
      maxNumericId = Math.max(maxNumericId, number(id.match(/\d+/)?.[0]));
      const entity = {
        ...clonePlain(rawEntity),
        id: rawEntity.id,
        kind: rawEntity.kind,
        team,
        x: clamp(number(rawEntity.x), 0, worldWidth),
        y: clamp(number(rawEntity.y), 0, worldHeight),
        alive: rawEntity.alive !== false,
      };
      for (const key of [
        'hp', 'maxHp', 'rotation', 'weaponRotation', 'desiredWeaponRotation', 'weaponCooldown',
        'construction', 'incomeTimer', 'auraTimer', 'captureProgress', 'sabotagedUntil',
        'compromisedUntil', 'interceptCooldown', 'sabotagePulse', 'cargo', 'harvestTimer',
        'xp', 'rank', 'kills', 'revealTimer', 'lastShotAt', 'coverIntegrity', 'covertCooldown',
      ]) {
        if (entity[key] != null) entity[key] = number(entity[key]);
      }
      if (entity.kind === 'unit') {
        entity.commandQueue = array(rawEntity.commandQueue).slice(0, 32).map(normalizeCommand).filter(Boolean);
        entity.transportCargoIds = [...new Set(array(rawEntity.transportCargoIds).filter(idValue => idValue != null))];
      } else if (entity.kind === 'building') {
        const teamData = teams[team] || teams.player;
        entity.construction = clamp(number(rawEntity.construction, 1), 0, 1);
        entity.queue = array(rawEntity.queue).slice(0, 10).map(item => normalizeQueueItem(item, teamData)).filter(Boolean);
        entity.rallyPoint = normalizePoint(rawEntity.rallyPoint, entity.x + (team === 'player' ? 120 : -120), entity.y);
      } else {
        entity.amount = Math.max(0, number(rawEntity.amount, 120000));
        entity.maxAmount = Math.max(entity.amount, number(rawEntity.maxAmount, entity.amount));
      }
      entities.push(entity);
    }

    const liveIds = new Set(entities.map(entity => idKey(entity.id)));
    for (const entity of entities) {
      if (entity.kind !== 'unit') continue;
      entity.transportCargoIds = array(entity.transportCargoIds).filter(id => liveIds.has(idKey(id)));
      if (entity.embarkedIn && !liveIds.has(idKey(entity.embarkedIn))) {
        entity.embarkedIn = null;
        entity.inTransport = false;
      }
    }
    result.entities = entities;
    delete result.units;
    delete result.buildings;
    delete result.resources;
    result.idCounter = Math.max(Math.floor(number(source.idCounter, 1)), maxNumericId + 1, 1);

    result.abilityZones = array(source.abilityZones).slice(0, 256).map(rawZone => {
      if (!rawZone || typeof rawZone !== 'object' || typeof rawZone.type !== 'string') return null;
      const duration = positive(rawZone.duration, rawZone.type === 'scan' ? 12 : 10);
      const age = Math.max(0, number(rawZone.age));
      if (age >= duration) {
        state.expiredZonesDropped += 1;
        return null;
      }
      return {
        ...clonePlain(rawZone),
        type: rawZone.type.slice(0, 40),
        team: VALID_TEAMS.has(rawZone.team) ? rawZone.team : 'player',
        x: clamp(number(rawZone.x), 0, worldWidth),
        y: clamp(number(rawZone.y), 0, worldHeight),
        radius: clamp(positive(rawZone.radius, 300), 1, Math.max(worldWidth, worldHeight)),
        duration,
        age,
        tick: number(rawZone.tick),
      };
    }).filter(Boolean);

    result.spyCells = array(source.spyCells).filter(cell => cell && typeof cell === 'object').slice(0, 2048).map(cell => clonePlain(cell));
    result.scorchMarks = array(source.scorchMarks).filter(mark => mark && typeof mark === 'object').slice(-80).map(mark => clonePlain(mark));
    result.selectedIds = [...new Set(array(source.selectedIds).filter(id => liveIds.has(idKey(id))))];
    result.controlGroups = Array.from({ length: 10 }, (_, index) =>
      [...new Set(array(source.controlGroups?.[index]).filter(id => liveIds.has(idKey(id))))],
    );
    result.formations = array(source.formations).filter(group => group && typeof group === 'object' && group.id != null).slice(0, 2048).map(group => ({
      ...clonePlain(group),
      unitIds: [...new Set(array(group.unitIds).filter(id => liveIds.has(idKey(id))))],
      path: array(group.path).filter(point => point && typeof point === 'object').slice(0, 512).map(point => normalizePoint(point)),
      slots: object(group.slots),
    }));
    if (source.ai && typeof source.ai === 'object') {
      result.ai = {
        ...clonePlain(source.ai),
        squads: array(source.ai.squads).filter(squad => squad && typeof squad === 'object').slice(0, 512).map(squad => ({
          ...clonePlain(squad),
          unitIds: [...new Set(array(squad.unitIds).filter(id => liveIds.has(idKey(id))))],
          path: array(squad.path).filter(point => point && typeof point === 'object').slice(0, 512).map(point => normalizePoint(point)),
        })),
        intel: array(source.ai.intel).filter(item => item && typeof item === 'object' && item.id != null).slice(0, 4096).map(item => clonePlain(item)),
      };
    }
    if (result.authoritative172 && typeof result.authoritative172 === 'object') {
      result.authoritative172 = {
        ...result.authoritative172,
        simTick: Math.max(0, Math.floor(number(result.authoritative172.simTick, Math.round(result.time * 25)))),
        rngSeed: Math.max(1, Math.floor(number(result.authoritative172.rngSeed, result.seed))),
      };
    }
    state.savesNormalized += 1;
    state.lastNormalization = {
      at: Date.now(),
      entities: entities.length,
      zones: result.abilityZones.length,
      sourceVersion: source.version ?? null,
    };
    return result;
  };

  const baseHydrate = Game.prototype.hydrate;
  if (typeof baseHydrate === 'function') {
    Game.prototype.hydrate = function resilientHydrate200(data, ...rest) {
      return baseHydrate.call(this, normalizeSave(data), ...rest);
    };
    Object.defineProperty(Game.prototype.hydrate, '__fdSimulationResilience200', { value: true });
  }

  // Authoritative snapshots intentionally mirror ability zones as plain
  // objects.  The legacy save layer still calls zone.serialize(), so an
  // autosave during an active scan used to throw on the main thread.  Attach a
  // non-enumerable serializer before every save; Worker-side AbilityZone
  // instances already own one and are left untouched.
  const ensureSerializableZone = zone => {
    if (!zone || typeof zone !== 'object' || typeof zone.serialize === 'function') return zone;
    try {
      Object.defineProperty(zone, 'serialize', {
        configurable: true,
        enumerable: false,
        value() {
          return {
            type: this.type,
            team: this.team,
            x: number(this.x),
            y: number(this.y),
            radius: positive(this.radius, 300),
            duration: positive(this.duration, this.type === 'scan' ? 12 : 10),
            age: Math.max(0, number(this.age)),
            tick: number(this.tick),
            triggered: Boolean(this.triggered),
            seed: Math.floor(number(this.seed)),
          };
        },
      });
      state.plainZonesMadeSerializable += 1;
    } catch (_) {}
    return zone;
  };

  const baseSave = Game.prototype.save;
  if (typeof baseSave === 'function') {
    Game.prototype.save = function serializableZoneSave200(...args) {
      for (const zone of this.abilityZones || []) ensureSerializableZone(zone);
      return baseSave.apply(this, args);
    };
    Object.defineProperty(Game.prototype.save, '__fdSerializableZoneSave200', { value: true });
  }

  const baseExecutePower = Game.prototype.executePower;
  if (typeof baseExecutePower === 'function') {
    Game.prototype.executePower = function exactReconPulse200(type, ...args) {
      const before = this.abilityZones?.length || 0;
      const result = baseExecutePower.call(this, type, ...args);
      if (result !== false && type === 'scan') {
        for (const zone of (this.abilityZones || []).slice(before)) {
          if (zone?.type !== 'scan' || zone.team !== 'player') continue;
          zone.duration = 12;
          zone.age = 0;
          state.scanPulsesStarted += 1;
        }
      }
      return result;
    };
    Object.defineProperty(Game.prototype.executePower, '__fdExactReconPulse200', { value: true });
  }

  const baseVisibility = Game.prototype.updateVisibilityV9;
  if (typeof baseVisibility === 'function') {
    Game.prototype.updateVisibilityV9 = function finiteReconVisibility200(force = false) {
      const result = baseVisibility.call(this, force);
      const emitters = this._v9FogEmitters;
      const stamp = this._v9FogStamp;
      if (!(emitters instanceof Map) || typeof stamp !== 'function') return result;
      let activeScanCount = 0;
      for (const zone of this.abilityZones || []) {
        if (zone?.alive !== false && zone?.team === 'player' && zone?.type === 'scan') activeScanCount += 1;
      }
      for (const [id, old] of [...emitters]) {
        const match = /^v94zone:(\d+)$/.exec(String(id));
        if (!match || Number(match[1]) < activeScanCount) continue;
        try { stamp.call(this, old, -1); } catch (_) {}
        emitters.delete(id);
        state.staleFogEmittersRemoved += 1;
      }
      return result;
    };
    Game.prototype.updateVisibility = function finiteReconVisibilityAlias200(force = false) {
      return this.updateVisibilityV9(force);
    };
    Object.defineProperty(Game.prototype.updateVisibilityV9, '__fdFiniteReconVisibility200', { value: true });
  }

  let watchedBridgeId = null;
  let watchedTick = -1;
  let watchedTickAt = typeof performance !== 'undefined' ? performance.now() : 0;
  let watchdogTimer = 0;
  if (typeof document !== 'undefined' && typeof setInterval === 'function') {
    watchdogTimer = setInterval(() => {
      const game = D?.game;
      const bridge = root.__FD_STABLE_STATE165__?.bridge;
      if (!game || !bridge || bridge.failed || !bridge.ready || game.ended || game.paused || document.visibilityState !== 'visible') {
        watchedBridgeId = bridge?.id ?? null;
        watchedTick = Number(bridge?.workerTick ?? -1);
        watchedTickAt = performance.now();
        return;
      }
      const tick = Number(bridge.workerTick ?? -1);
      if (watchedBridgeId !== bridge.id || tick !== watchedTick) {
        watchedBridgeId = bridge.id;
        watchedTick = tick;
        watchedTickAt = performance.now();
        return;
      }
      if (performance.now() - watchedTickAt < 4000) return;
      const reason = `Simulation Worker не продвинулся за ${Math.round(performance.now() - watchedTickAt)} мс`;
      state.workerStallsDetected += 1;
      state.lastFallbackReason = reason;
      try {
        bridge.lastError = reason;
        bridge.fail?.(reason);
        state.mainThreadFallbacks += 1;
      } catch (error) {
        console.error('[FD200] Worker stall fallback failed', error);
      }
      watchedTickAt = performance.now();
    }, 400);
  }

  root.__FD_SIMULATION_RESILIENCE_200__ = {
    version: VERSION,
    build: BUILD,
    state,
    normalizeSave,
    ensureSerializableZone,
    diagnostics: () => ({ ...state, lastNormalization: state.lastNormalization ? { ...state.lastNormalization } : null }),
    dispose() {
      if (watchdogTimer) clearInterval(watchdogTimer);
      watchdogTimer = 0;
    },
  };
})();
