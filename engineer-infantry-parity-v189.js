(() => {
  'use strict';

  const root = globalThis;
  const debug = root.__FD_DEBUG__;
  const GameClass = debug?.Game;
  const UnitClass = debug?.Unit;
  if (!GameClass || !UnitClass) return;
  if (GameClass.prototype.__fdEngineerInfantryParity189Installed) return;
  Object.defineProperty(GameClass.prototype, '__fdEngineerInfantryParity189Installed', {
    value: true,
    configurable: true,
  });

  const VERSION = '16.8.5';
  const BUILD = 189;
  const DIRECT_GEOMETRY_KEYS = Object.freeze([
    'radius', 'collisionRadius', 'footprintRadius', 'selectionRadius',
    'profileRadius', 'displayRadius', 'bodyRadius', 'hullRadius',
    'navRadius', 'avoidanceRadius', 'separationRadius', 'visualRadius',
    'width', 'length', 'halfWidth', 'halfLength',
    'footprintWidth', 'footprintLength', 'footprintHalfWidth', 'footprintHalfLength',
    'collisionShape', 'footprint', 'bodyBounds', 'hullBounds',
  ]);
  const STAT_GEOMETRY_KEYS = Object.freeze([
    'radius', 'collisionRadius', 'footprintRadius', 'selectionRadius',
    'profileRadius', 'displayRadius', 'bodyRadius', 'hullRadius',
    'navRadius', 'avoidanceRadius', 'separationRadius', 'visualRadius',
    'width', 'length', 'halfWidth', 'halfLength',
    'footprintWidth', 'footprintLength', 'footprintHalfWidth', 'footprintHalfLength',
    'collisionShape', 'footprint', 'bodyBounds', 'hullBounds', 'dimensions',
  ]);

  const diagnostics189 = {
    normalized: 0,
    unresolved: 0,
    lastReferenceType: null,
    lastWorkerRadius: 0,
    lastReferenceRadius: 0,
  };

  const cloneGeometry189 = value => {
    if (Array.isArray(value)) return value.map(cloneGeometry189);
    if (!value || typeof value !== 'object') return value;
    const prototype = Object.getPrototypeOf(value);
    if (prototype && prototype !== Object.prototype) return value;
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, cloneGeometry189(entry)]));
  };

  const assignGeometry189 = (target, key, value) => {
    if (!target || value === undefined) return false;
    try {
      target[key] = cloneGeometry189(value);
      return true;
    } catch (_) {
      return false;
    }
  };

  const aliveInfantry189 = unit => Boolean(
    unit?.alive !== false && unit?.kind === 'unit' && unit?.infantry &&
    unit?.typeId !== 'worker' && !unit?.air && !unit?.embarkedIn &&
    Number.isFinite(Number(unit?.radius)) && Number(unit.radius) > 0
  );

  const referenceScore189 = (worker, candidate) => {
    let score = 0;
    if (candidate.team === worker.team) score += 10000;
    if (candidate.stats?.faction && candidate.stats.faction === worker.stats?.faction) score += 1000;
    if (candidate.typeId === 'rifle') score += 700;
    if (Number(candidate.stats?.archetypeIndex) === 0) score += 500;
    if (/line|rifle|стрел/i.test(String(candidate.stats?.role || candidate.stats?.name || candidate.typeId))) score += 250;
    score -= Math.abs(Number(candidate.radius) - 6) * 2;
    return score;
  };

  const referenceForWorker189 = (game, worker) => {
    const cache = game._fdEngineerParityReferences189 ||= new Map();
    const key = `${worker?.team || ''}|${worker?.stats?.faction || ''}`;
    const cached = cache.get(key);
    if (aliveInfantry189(cached)) return cached;
    let best = null;
    let bestScore = -Infinity;
    for (const candidate of game?.units || []) {
      if (!aliveInfantry189(candidate)) continue;
      const score = referenceScore189(worker, candidate);
      if (score > bestScore) {
        best = candidate;
        bestScore = score;
      }
    }
    if (best) cache.set(key, best);
    return best;
  };

  const copyEngineerGeometry189 = (game, worker, reference = referenceForWorker189(game, worker)) => {
    if (!worker || worker.typeId !== 'worker' || !reference) return false;
    worker.stats ||= {};

    for (const key of STAT_GEOMETRY_KEYS) {
      const value = reference.stats?.[key] !== undefined ? reference.stats[key] : reference[key];
      assignGeometry189(worker.stats, key, value);
    }
    assignGeometry189(worker.stats, 'visualScale', reference.stats?.visualScale ?? reference.visualScale ?? 1);

    for (const key of DIRECT_GEOMETRY_KEYS) {
      const value = reference[key] !== undefined ? reference[key] : reference.stats?.[key];
      assignGeometry189(worker, key, value);
    }
    assignGeometry189(worker, 'visualScale', reference.visualScale ?? reference.stats?.visualScale ?? 1);

    // Radius is assigned last because older footprint layers may derive it from
    // a larger engineer-specific hull before this canonical parity owner runs.
    if (Number.isFinite(Number(reference.radius)) && Number(reference.radius) > 0) {
      assignGeometry189(worker.stats, 'radius', Number(reference.stats?.radius ?? reference.radius));
      assignGeometry189(worker, 'radius', Number(reference.radius));
    }

    worker.infantry = true;
    worker._fdEngineerParity189 = {
      build: BUILD,
      referenceId: reference.id || null,
      referenceType: reference.typeId || null,
      radius: Number(worker.radius) || 0,
    };
    diagnostics189.normalized += 1;
    diagnostics189.lastReferenceType = reference.typeId || null;
    diagnostics189.lastWorkerRadius = Number(worker.radius) || 0;
    diagnostics189.lastReferenceRadius = Number(reference.radius) || 0;
    return true;
  };

  const syncEngineerParity189 = game => {
    if (!game) return { normalized: 0, unresolved: 0 };
    let normalized = 0;
    let unresolved = 0;
    for (const worker of game.units || []) {
      if (!worker || worker.typeId !== 'worker' || worker.alive === false) continue;
      if (copyEngineerGeometry189(game, worker)) normalized += 1;
      else unresolved += 1;
    }
    game._fdEngineerParityUnresolved189 = unresolved;
    diagnostics189.unresolved = unresolved;
    return { normalized, unresolved };
  };

  const maybeSyncEngineerParity189 = game => {
    if (!game) return;
    const now = Number(game.time) || 0;
    const next = Number(game._fdEngineerParityNext189 ?? -Infinity);
    if (now < next) return;
    const report = syncEngineerParity189(game);
    game._fdEngineerParityNext189 = now + (report.unresolved ? 0.04 : 0.55);
  };

  const wrapGameAfter189 = name => {
    const base = GameClass.prototype[name];
    if (typeof base !== 'function' || base.__fdEngineerParity189Wrapped) return;
    const wrapped = function(...args) {
      const result = base.apply(this, args);
      syncEngineerParity189(this);
      return result;
    };
    Object.defineProperty(wrapped, '__fdEngineerParity189Wrapped', { value: true });
    GameClass.prototype[name] = wrapped;
  };

  const wrapGameBefore189 = name => {
    const base = GameClass.prototype[name];
    if (typeof base !== 'function' || base.__fdEngineerParity189Wrapped) return;
    const wrapped = function(...args) {
      maybeSyncEngineerParity189(this);
      return base.apply(this, args);
    };
    Object.defineProperty(wrapped, '__fdEngineerParity189Wrapped', { value: true });
    GameClass.prototype[name] = wrapped;
  };

  for (const name of ['addEntity', 'hydrate', 'restore', 'restoreState', 'loadState', 'deserialize']) {
    wrapGameAfter189(name);
  }
  for (const name of ['update', 'step', 'simulate', 'advanceSimulation']) {
    wrapGameBefore189(name);
  }

  const baseUnitUpdate189 = UnitClass.prototype.update;
  if (typeof baseUnitUpdate189 === 'function' && !baseUnitUpdate189.__fdEngineerParity189Wrapped) {
    const wrappedUnitUpdate189 = function(...args) {
      if (this?.typeId === 'worker') copyEngineerGeometry189(this.game, this);
      return baseUnitUpdate189.apply(this, args);
    };
    Object.defineProperty(wrappedUnitUpdate189, '__fdEngineerParity189Wrapped', { value: true });
    UnitClass.prototype.update = wrappedUnitUpdate189;
  }

  queueMicrotask(() => syncEngineerParity189(debug?.game));

  root.__FD_ENGINEER_PARITY_189__ = {
    version: VERSION,
    build: BUILD,
    copy: copyEngineerGeometry189,
    sync: syncEngineerParity189,
    diagnostics: () => ({ ...diagnostics189 }),
  };
})();
