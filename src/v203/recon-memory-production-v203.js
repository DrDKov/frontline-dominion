(() => {
  'use strict';

  const root = globalThis;
  const D = root.__FD_DEBUG__;
  const Game = D?.Game;
  if (!Game?.prototype || root.__FD_RECON_MEMORY_QUEUE_203__) return;

  const VERSION = '16.8.19';
  const BUILD = 203;
  const MEMORY_LIMIT = 4096;
  const QUEUE_LIMIT = 10;
  const state = {
    captures: 0,
    refreshed: 0,
    invalidated: 0,
    ghostsRendered: 0,
    hiddenUnitsFiltered: 0,
    queueSignatures: 0,
    savesWithMemory: 0,
    restoresWithMemory: 0,
    lastMemorySize: 0,
  };

  const finite = (value, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const plain = value => value == null ? value : JSON.parse(JSON.stringify(value));
  const memoryId = value => String(value || '').slice(0, 96);

  const visibleAt = (game, x, y) => {
    try { return Boolean(game?.isVisibleAt?.(finite(x), finite(y))); }
    catch (_) { return false; }
  };
  const exploredAt = (game, x, y) => {
    try { return Boolean(game?.isExploredAt?.(finite(x), finite(y))); }
    catch (_) { return visibleAt(game, x, y); }
  };

  const normalizeMemory = (game, raw) => {
    if (!raw || typeof raw !== 'object') return null;
    const id = memoryId(raw.id || raw.sourceId);
    const typeId = String(raw.typeId || '');
    if (!id || !typeId || !D.BUILDING_TYPES?.[typeId]) return null;
    const stats = (() => {
      try { return D.getBuildingStats?.(typeId, game?.teams?.enemy) || D.BUILDING_TYPES[typeId]; }
      catch (_) { return D.BUILDING_TYPES[typeId]; }
    })();
    const maxHp = Math.max(1, finite(raw.maxHp, stats?.hp || 1));
    return {
      id,
      typeId,
      team: 'enemy',
      x: finite(raw.x),
      y: finite(raw.y),
      rotation: finite(raw.rotation, Math.PI),
      weaponRotation: finite(raw.weaponRotation, finite(raw.rotation, Math.PI)),
      desiredWeaponRotation: finite(raw.desiredWeaponRotation, finite(raw.weaponRotation, finite(raw.rotation, Math.PI))),
      radius: Math.max(1, finite(raw.radius, stats?.radius || 40)),
      construction: clamp(finite(raw.construction, 1), 0.05, 1),
      completed: raw.completed !== false && finite(raw.construction, 1) >= 1,
      hp: clamp(finite(raw.hp, maxHp), 0, maxHp),
      maxHp,
      observedAt: Math.max(0, finite(raw.observedAt, game?.time)),
      observedTick: Math.max(0, Math.floor(finite(raw.observedTick, game?.simTick))),
    };
  };

  const snapshotBuilding = (game, building) => normalizeMemory(game, {
    id: building.id,
    typeId: building.typeId,
    x: building.x,
    y: building.y,
    rotation: building.rotation,
    weaponRotation: building.weaponRotation,
    desiredWeaponRotation: building.desiredWeaponRotation,
    radius: building.radius,
    construction: building.construction,
    completed: building.completed,
    hp: building.hp,
    maxHp: building.maxHp,
    observedAt: game.time,
    observedTick: game.simTick,
  });

  const ensureMemory = game => {
    if (!(game?._fdReconBuildingMemory203 instanceof Map)) {
      const map = new Map();
      for (const raw of game?._fdReconMemorySeed203 || []) {
        const item = normalizeMemory(game, raw);
        if (item && map.size < MEMORY_LIMIT) map.set(item.id, item);
      }
      if (game) game._fdReconBuildingMemory203 = map;
    }
    return game?._fdReconBuildingMemory203 || new Map();
  };

  const serializeMemory = game => [...ensureMemory(game).values()].slice(0, MEMORY_LIMIT).map(item => ({ ...item }));

  const syncMemory = game => {
    const memory = ensureMemory(game);
    const visibleEnemyById = new Map();
    for (const building of game?.buildings || []) {
      if (!building?.alive || building.team !== 'enemy' || !visibleAt(game, building.x, building.y)) continue;
      const item = snapshotBuilding(game, building);
      if (!item) continue;
      visibleEnemyById.set(item.id, building);
      if (memory.has(item.id)) state.refreshed += 1;
      else state.captures += 1;
      memory.set(item.id, item);
    }

    // A remembered structure is removed only when its photographed position is
    // visible again and the same live hostile building is no longer there.
    for (const [id, item] of [...memory]) {
      if (!visibleAt(game, item.x, item.y)) continue;
      const current = visibleEnemyById.get(id) || (game?.buildings || []).find(building =>
        building?.alive && building.team === 'enemy' && memoryId(building.id) === id &&
        Math.hypot(finite(building.x) - item.x, finite(building.y) - item.y) <= Math.max(12, item.radius * 0.35)
      );
      if (current) continue;
      memory.delete(id);
      state.invalidated += 1;
    }

    while (memory.size > MEMORY_LIMIT) memory.delete(memory.keys().next().value);
    state.lastMemorySize = memory.size;
    return memory;
  };

  const makeGhost = (game, item) => {
    let stats = D.BUILDING_TYPES?.[item.typeId] || {};
    try { stats = D.getBuildingStats?.(item.typeId, game?.teams?.enemy) || stats; } catch (_) {}
    return {
      id: `recon203:${item.id}`,
      _fdReconGhost203: true,
      _fdReconSourceId203: item.id,
      kind: 'building',
      typeId: item.typeId,
      team: 'enemy',
      alive: true,
      selected: false,
      x: item.x,
      y: item.y,
      rotation: item.rotation,
      weaponRotation: item.weaponRotation,
      desiredWeaponRotation: item.desiredWeaponRotation,
      radius: item.radius,
      construction: item.construction,
      completed: item.completed,
      hp: item.hp,
      maxHp: item.maxHp,
      healthRatio: clamp(item.hp / Math.max(1, item.maxHp), 0, 1),
      lastDamagedAt: -999999,
      stats,
    };
  };

  const decorateSnapshot = (game, snapshot) => {
    if (!snapshot) return snapshot;
    const memory = syncMemory(game);
    if (Array.isArray(snapshot.units)) {
      const before = snapshot.units.length;
      snapshot.units = snapshot.units.filter(unit => {
        if (!unit?.alive || unit.team !== 'enemy') return Boolean(unit?.alive);
        if (!visibleAt(game, unit.x, unit.y)) return false;
        try { return typeof game.isTargetableBy !== 'function' || game.isTargetableBy(unit, 'player'); }
        catch (_) { return true; }
      });
      state.hiddenUnitsFiltered += Math.max(0, before - snapshot.units.length);
    }
    if (Array.isArray(snapshot.clusters94)) {
      snapshot.clusters94 = snapshot.clusters94.filter(cluster => cluster?.team !== 'enemy' || visibleAt(game, cluster.x, cluster.y));
    }
    if (!Array.isArray(snapshot.buildings)) snapshot.buildings = [];
    snapshot.buildings = snapshot.buildings.filter(building => !building?._fdReconGhost203);
    for (const item of memory.values()) {
      if (visibleAt(game, item.x, item.y) || !exploredAt(game, item.x, item.y)) continue;
      if (game?.isOnScreen && !game.isOnScreen(item.x, item.y, item.radius + 260)) continue;
      snapshot.buildings.push(makeGhost(game, item));
      state.ghostsRendered += 1;
    }
    return snapshot;
  };

  const queueSignature = building => {
    state.queueSignatures += 1;
    const queue = (Array.isArray(building?.queue) ? building.queue : []).slice(0, QUEUE_LIMIT).map(item => [
      String(item?.kind || item?.type || ''),
      String(item?.id || item?.itemId || item?.typeId || ''),
      Math.round(finite(item?.remaining, finite(item?.timeRemaining)) * 10),
      Math.round(finite(item?.total, finite(item?.duration, finite(item?.time))) * 10),
      Math.round(finite(item?.cost) * 10),
    ]);
    const rally = building?.rallyPoint
      ? [Math.round(finite(building.rallyPoint.x)), Math.round(finite(building.rallyPoint.y))]
      : null;
    return JSON.stringify([
      queue,
      rally,
      building?.completed ? 1 : 0,
      String(building?.team || ''),
      building?.powered === false ? 0 : 1,
    ]);
  };

  const baseHydrate = Game.prototype.hydrate;
  if (typeof baseHydrate === 'function') {
    Game.prototype.hydrate = function hydrateReconMemory203(data, ...args) {
      const result = baseHydrate.call(this, data, ...args);
      this._fdReconMemorySeed203 = Array.isArray(data?.reconBuildingMemory203)
        ? data.reconBuildingMemory203.slice(0, MEMORY_LIMIT)
        : [];
      this._fdReconBuildingMemory203 = null;
      ensureMemory(this);
      state.restoresWithMemory += this._fdReconBuildingMemory203.size ? 1 : 0;
      return result;
    };
  }

  const baseVisibility = Game.prototype.updateVisibilityV9;
  if (typeof baseVisibility === 'function') {
    Game.prototype.updateVisibilityV9 = function updateReconMemory203(...args) {
      const result = baseVisibility.apply(this, args);
      syncMemory(this);
      return result;
    };
    Object.defineProperty(Game.prototype.updateVisibilityV9, '__fdReconMemory203', { value: true });
  }

  const baseSnapshot = Game.prototype.buildRenderSnapshotV9;
  if (typeof baseSnapshot === 'function') {
    Game.prototype.buildRenderSnapshotV9 = function renderReconMemory203(...args) {
      return decorateSnapshot(this, baseSnapshot.apply(this, args));
    };
    Object.defineProperty(Game.prototype.buildRenderSnapshotV9, '__fdReconMemory203', { value: true });
  }

  const baseMinimap = Game.prototype.renderMinimap;
  if (typeof baseMinimap === 'function' && typeof document !== 'undefined') {
    Game.prototype.renderMinimap = function renderReconMemoryMinimap203(...args) {
      const result = baseMinimap.apply(this, args);
      const canvas = document.getElementById('minimap');
      const context = canvas?.getContext?.('2d');
      if (!canvas || !context || !D.WORLD?.width || !D.WORLD?.height) return result;
      const sx = canvas.width / D.WORLD.width;
      const sy = canvas.height / D.WORLD.height;
      context.save();
      context.globalAlpha = 0.42;
      context.fillStyle = '#b85d58';
      for (const item of ensureMemory(this).values()) {
        if (visibleAt(this, item.x, item.y) || !exploredAt(this, item.x, item.y)) continue;
        const size = item.typeId === 'hq' ? 6 : 4;
        context.fillRect(item.x * sx - size / 2, item.y * sy - size / 2, size, size);
      }
      context.restore();
      return result;
    };
  }

  const baseSave = Game.prototype.save;
  if (typeof baseSave === 'function') {
    Game.prototype.save = function saveReconMemory203(...args) {
      syncMemory(this);
      const result = baseSave.apply(this, args);
      if (result !== false && D.storageGet && D.storageSet && D.SAVE_KEY) {
        try {
          const raw = D.storageGet(D.SAVE_KEY);
          const data = raw ? JSON.parse(raw) : null;
          if (data) {
            data.reconBuildingMemory203 = serializeMemory(this);
            D.storageSet(D.SAVE_KEY, JSON.stringify(data));
            state.savesWithMemory += 1;
          }
        } catch (_) {}
      }
      return result;
    };
  }

  root.__FD_RECON_MEMORY_QUEUE_203__ = {
    version: VERSION,
    build: BUILD,
    queueLimit: QUEUE_LIMIT,
    state,
    ensureMemory,
    syncMemory,
    serializeMemory,
    decorateSnapshot,
    queueSignature,
    diagnostics: () => plain(state),
  };
})();
