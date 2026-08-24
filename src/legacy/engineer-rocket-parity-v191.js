(() => {
  'use strict';

  const root = globalThis;
  const debug = root.__FD_DEBUG__;
  const Game = debug?.Game;
  const Unit = debug?.Unit;
  const UNIT_TYPES = debug?.UNIT_TYPES;
  if (!Game || !Unit || !UNIT_TYPES?.worker || !UNIT_TYPES?.rocket) return;
  if (root.__FD_ENGINEER_ROCKET_191__) return;

  const VERSION = '16.8.7';
  const BUILD = 191;
  const WORKER_ALPHA = Object.freeze({ x: 55, y: 26, width: 82, height: 105 });
  const ROCKET_ALPHA = Object.freeze({ x: 37, y: 15, width: 118, height: 125 });
  const GEOMETRY_KEYS = Object.freeze([
    'radius', 'collisionRadius', 'footprintRadius', 'selectionRadius',
    'profileRadius', 'displayRadius', 'bodyRadius', 'navRadius',
    'avoidanceRadius', 'separationRadius', 'width', 'length',
    'halfWidth', 'halfLength', 'footprintWidth', 'footprintLength',
    'footprintHalfWidth', 'footprintHalfLength',
  ]);
  const MODEL_GEOMETRY_KEYS = Object.freeze([
    'modelBoundsMeters', 'modelCollisionFootprintMeters', 'modelUnitScale', 'modelCollision',
  ]);
  const clone = value => {
    if (Array.isArray(value)) return value.map(clone);
    if (!value || typeof value !== 'object') return value;
    const proto = Object.getPrototypeOf(value);
    if (proto && proto !== Object.prototype) return value;
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, clone(entry)]));
  };
  const assign = (target, key, value) => {
    if (!target || value === undefined) return;
    try { target[key] = clone(value); } catch (_) {}
  };
  const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const almost = (left, right, tolerance = 0.001) => Math.abs(finite(left) - finite(right)) <= tolerance;

  const diagnostics = {
    staticNormalizations: 0,
    unitNormalizations: 0,
    unresolved: 0,
    lastWorkerId: null,
    lastRocketId: null,
    lastPhysicalRatio: 0,
    lastVisibleWidthRatio: 0,
    lastVisibleHeightRatio: 0,
  };

  const rocketStatic = () => UNIT_TYPES.rocket;
  const staticSignature = () => {
    const stats = rocketStatic();
    return [
      stats.radius, stats.collisionRadius, stats.footprintRadius, stats.visualScale,
      JSON.stringify(stats.modelBoundsMeters || null),
      JSON.stringify(stats.modelCollisionFootprintMeters || null),
    ].join('|');
  };

  const copyGeometry = (target, reference, includeModelGeometry = true) => {
    if (!target || !reference) return false;
    const targetStats = target.stats || target;
    const referenceStats = reference.stats || reference;
    for (const key of GEOMETRY_KEYS) {
      const value = reference[key] !== undefined ? reference[key] : referenceStats[key];
      if (value !== undefined) {
        assign(targetStats, key, value);
        if (target.stats) assign(target, key, value);
      }
    }
    if (includeModelGeometry) {
      for (const key of MODEL_GEOMETRY_KEYS) {
        const value = referenceStats[key] !== undefined ? referenceStats[key] : reference[key];
        if (value !== undefined) assign(targetStats, key, value);
      }
    }
    assign(targetStats, 'visualScale', referenceStats.visualScale ?? reference.visualScale ?? 1);
    if (target.stats) assign(target, 'visualScale', reference.visualScale ?? referenceStats.visualScale ?? 1);
    return true;
  };

  const normalizeStatic = () => {
    const worker = UNIT_TYPES.worker;
    const rocket = rocketStatic();
    if (!worker || !rocket) return false;
    copyGeometry(worker, rocket, true);
    worker.infantry = true;
    worker._fdEngineerRocketStatic191 = staticSignature();
    diagnostics.staticNormalizations += 1;
    return true;
  };

  const liveRocket = (game, worker) => (game?.units || []).find(unit =>
    unit?.alive !== false && unit.typeId === 'rocket' && unit.team === worker?.team && !unit.embarkedIn
  ) || null;

  const normalizeUnit = (unit, force = false) => {
    if (!unit || unit.typeId !== 'worker') return false;
    const signature = staticSignature();
    if (!force && unit._fdEngineerRocketSignature191 === signature) return true;
    const reference = liveRocket(unit.game, unit) || rocketStatic();
    if (!reference) {
      diagnostics.unresolved += 1;
      return false;
    }
    unit.stats ||= {};
    copyGeometry(unit, reference, true);
    unit.infantry = true;
    unit._fdEngineerRocketSignature191 = signature;
    unit._fdEngineerRocketParity191 = {
      version: VERSION,
      build: BUILD,
      referenceId: reference.id || null,
      referenceType: 'rocket',
      radius: finite(unit.radius || unit.stats.radius),
    };
    diagnostics.unitNormalizations += 1;
    diagnostics.lastWorkerId = unit.id || null;
    diagnostics.lastRocketId = reference.id || null;
    const referenceRadius = finite(reference.radius ?? reference.stats?.radius, 1);
    diagnostics.lastPhysicalRatio = finite(unit.radius ?? unit.stats.radius) / Math.max(0.001, referenceRadius);
    return true;
  };

  const normalizeGame = game => {
    normalizeStatic();
    let count = 0;
    for (const unit of game?.units || []) if (unit?.typeId === 'worker' && normalizeUnit(unit, true)) count += 1;
    return count;
  };

  normalizeStatic();

  const wrapAfter = name => {
    const base = Game.prototype[name];
    if (typeof base !== 'function' || base.__fdEngineerRocket191Wrapped) return;
    const wrapped = function(...args) {
      const result = base.apply(this, args);
      normalizeGame(this);
      return result;
    };
    Object.defineProperty(wrapped, '__fdEngineerRocket191Wrapped', { value: true });
    Game.prototype[name] = wrapped;
  };
  for (const name of ['addEntity', 'hydrate', 'restore', 'restoreState', 'loadState', 'deserialize']) wrapAfter(name);

  const baseUnitUpdate = Unit.prototype.update;
  if (typeof baseUnitUpdate === 'function' && !baseUnitUpdate.__fdEngineerRocket191Wrapped) {
    const wrapped = function(...args) {
      if (this?.typeId === 'worker') normalizeUnit(this);
      return baseUnitUpdate.apply(this, args);
    };
    Object.defineProperty(wrapped, '__fdEngineerRocket191Wrapped', { value: true });
    Unit.prototype.update = wrapped;
  }

  const rocketRenderTarget = game => {
    const stats = rocketStatic();
    if (!game || !stats) return null;
    const fake = {
      id: '__fd_rocket_reference_191__', typeId: 'rocket', kind: 'unit', alive: true,
      infantry: true, air: false, embarkedIn: null, x: 0, y: 0, rotation: 0,
      radius: finite(stats.radius, 5.4), stats,
    };
    const footprint = game.getUnitFootprintAt?.(fake, 0, 0, 0) || game.getUnitFootprint?.('rocket', fake.radius) || null;
    const worldWidth = footprint
      ? Math.max(finite(footprint.halfLength) * 2, finite(footprint.halfWidth) * 2)
      : fake.radius * 2.85;
    const cellAspect = 0.75;
    const displayScale = game.getUnitPresentationScale138?.(fake, worldWidth, cellAspect) || 1;
    const zoom = game.camera?.zoom || 1;
    const targetWidth = worldWidth * zoom * 1.34 * displayScale;
    return { targetWidth, targetHeight: targetWidth * cellAspect, worldWidth, displayScale };
  };

  if (typeof document !== 'undefined') {
    Game.prototype.getInfantryRenderGeometry191 = function(unit, worldWidth, cellAspect = 0.75, baseScale = 1) {
      if (unit?.typeId !== 'worker') return null;
      normalizeUnit(unit);
      const rocket = rocketRenderTarget(this);
      const zoom = this.camera?.zoom || 1;
      const fallbackWidth = Math.max(1, finite(worldWidth, finite(unit.radius, 5.4) * 2.85)) * zoom * 1.34 * finite(baseScale, 1);
      const rocketWidth = rocket?.targetWidth || fallbackWidth;
      const rocketHeight = rocket?.targetHeight || rocketWidth * 0.75;
      const targetWidth = rocketWidth * ROCKET_ALPHA.width / WORKER_ALPHA.width;
      const targetHeight = rocketHeight * ROCKET_ALPHA.height / WORKER_ALPHA.height;
      const rawWidth = Math.max(1, finite(worldWidth, 1) * zoom * 1.34);
      const rawHeight = Math.max(1, rawWidth * Math.max(0.1, finite(cellAspect, 0.75)));
      return {
        build: BUILD,
        targetWidth,
        targetHeight,
        scaleX: targetWidth / rawWidth,
        scaleY: targetHeight / rawHeight,
        footprintScale: Math.max(targetWidth / rawWidth, targetHeight / rawHeight),
      };
    };

    const baseBounds = Game.prototype.getInfantryScreenBounds138;
    if (typeof baseBounds === 'function' && !baseBounds.__fdEngineerRocket191Wrapped) {
      const wrappedBounds = function(unit) {
        if (unit?.typeId !== 'worker') return baseBounds.call(this, unit);
        normalizeUnit(unit);
        const x = unit.renderX ?? unit.x;
        const y = unit.renderY ?? unit.y;
        const rotation = unit.renderRotation ?? unit.rotation ?? 0;
        const exact = this.getUnitFootprintAt?.(unit, x, y, rotation) || null;
        const worldWidth = exact
          ? Math.max(finite(exact.halfLength) * 2, finite(exact.halfWidth) * 2)
          : finite(unit.radius, 5.4) * 2.85;
        const baseScale = this.getUnitPresentationScale138?.(unit, worldWidth, 0.75) || 1;
        const geometry = this.getInfantryRenderGeometry191(unit, worldWidth, 0.75, baseScale);
        if (!geometry) return baseBounds.call(this, unit);
        const center = this.worldToScreen(x, y, 0);
        const imageX = center.x - geometry.targetWidth * 0.5;
        const imageY = center.y - geometry.targetHeight * 0.79;
        const pad = Math.max(2, Math.min(5, geometry.targetWidth * 0.026));
        const x1 = imageX + geometry.targetWidth * WORKER_ALPHA.x / 192 - pad;
        const y1 = imageY + geometry.targetHeight * WORKER_ALPHA.y / 144 - pad;
        const x2 = imageX + geometry.targetWidth * (WORKER_ALPHA.x + WORKER_ALPHA.width) / 192 + pad;
        const y2 = imageY + geometry.targetHeight * (WORKER_ALPHA.y + WORKER_ALPHA.height) / 144 + pad;
        return {
          x1, y1, x2, y2, footprint: exact,
          renderedWidth: geometry.targetWidth,
          renderedHeight: geometry.targetHeight,
          visibleWidth: x2 - x1,
          visibleHeight: y2 - y1,
          engineerRocketParity191: true,
        };
      };
      Object.defineProperty(wrappedBounds, '__fdEngineerRocket191Wrapped', { value: true });
      Game.prototype.getInfantryScreenBounds138 = wrappedBounds;
    }

    const updateDiagnostics = game => {
      const worker = (game?.units || []).find(unit => unit?.alive && unit.typeId === 'worker' && unit.team === 'player');
      const rocket = (game?.units || []).find(unit => unit?.alive && unit.typeId === 'rocket' && unit.team === worker?.team);
      if (!worker || !rocket) return;
      const wb = game.getInfantryScreenBounds138?.(worker);
      const rb = game.getInfantryScreenBounds138?.(rocket);
      if (!wb || !rb) return;
      diagnostics.lastVisibleWidthRatio = finite(wb.visibleWidth) / Math.max(1, finite(rb.visibleWidth));
      diagnostics.lastVisibleHeightRatio = finite(wb.visibleHeight) / Math.max(1, finite(rb.visibleHeight));
    };
    const baseUpdateUI = Game.prototype.updateUI;
    if (typeof baseUpdateUI === 'function' && !baseUpdateUI.__fdEngineerRocket191Wrapped) {
      const wrappedUpdateUI = function(...args) {
        const result = baseUpdateUI.apply(this, args);
        updateDiagnostics(this);
        return result;
      };
      Object.defineProperty(wrappedUpdateUI, '__fdEngineerRocket191Wrapped', { value: true });
      Game.prototype.updateUI = wrappedUpdateUI;
    }

    Promise.resolve(root.__FD_MODEL_PILOT__?.ready).then(() => normalizeGame(debug?.game)).catch(() => {});
    queueMicrotask(() => normalizeGame(debug?.game));
  }

  root.__FD_ENGINEER_ROCKET_191__ = {
    version: VERSION,
    build: BUILD,
    normalizeStatic,
    normalizeUnit,
    normalizeGame,
    diagnostics: () => ({ ...diagnostics }),
  };
})();
