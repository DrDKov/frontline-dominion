(() => {
  'use strict';

  const root = globalThis;
  const debug = root.__FD_DEBUG__;
  const GameClass = debug?.Game;
  const UnitClass = debug?.Unit;
  if (!GameClass || !UnitClass) return;
  if (GameClass.prototype.__fdRuntimeStability190Installed) return;
  Object.defineProperty(GameClass.prototype, '__fdRuntimeStability190Installed', {
    value: true,
    configurable: true,
  });

  const VERSION = '16.8.6';
  const BUILD = 190;
  const WORKER_ALPHA = Object.freeze({ width: 82, height: 105, x: 55, y: 26 });
  const ROCKET_ALPHA = Object.freeze({ width: 118, height: 125, x: 37, y: 15 });
  const CELL_ASPECT = 0.75;
  const IMAGE_ANCHOR_X = 0.5;
  const GROUND_BASELINE = 0.79;
  const GEOMETRY_KEYS = Object.freeze([
    'radius', 'collisionRadius', 'footprintRadius', 'selectionRadius',
    'profileRadius', 'displayRadius', 'bodyRadius', 'navRadius',
    'avoidanceRadius', 'separationRadius',
  ]);

  const diagnostics190 = {
    engineersNormalized: 0,
    lastReferenceRadius: 0,
    lastWorkerRadius: 0,
    lastVisibleWidthRatio: 0,
    lastVisibleHeightRatio: 0,
    extractorBuilds: 0,
    repairedUnits: 0,
    repairedBuildings: 0,
    lastIntegrityReport: null,
  };

  const finite190 = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const clamp190 = (value, min, max) => Math.max(min, Math.min(max, value));
  const healthValue190 = entity => {
    for (const key of ['health', 'hp', 'healthRatio']) {
      if (Number.isFinite(Number(entity?.[key]))) return Number(entity[key]);
    }
    return null;
  };

  const rocketReference190 = (game, worker = null) => {
    const sameTeam = (game?.units || []).find(unit =>
      unit?.alive !== false && unit?.kind === 'unit' && unit?.typeId === 'rocket' &&
      (!worker?.team || unit.team === worker.team)
    );
    if (sameTeam) return sameTeam;

    const team = game?.teams?.[worker?.team] || game?.teams?.player || null;
    let stats = null;
    try {
      stats = typeof debug?.getUnitStats === 'function'
        ? debug.getUnitStats('rocket', team)
        : null;
    } catch (_) {}
    stats ||= debug?.UNIT_TYPES?.rocket || null;
    if (!stats) return null;
    return {
      id: null,
      typeId: 'rocket',
      kind: 'unit',
      alive: true,
      infantry: true,
      team: worker?.team || 'player',
      radius: finite190(stats.radius, 14),
      visualScale: finite190(stats.visualScale, 1),
      stats,
    };
  };

  const scalarFromReference190 = (reference, key, fallback) => {
    const direct = reference?.[key];
    if (Number.isFinite(Number(direct))) return Number(direct);
    const stat = reference?.stats?.[key];
    if (Number.isFinite(Number(stat))) return Number(stat);
    return fallback;
  };

  const normalizeEngineer190 = (game, worker) => {
    if (!worker || worker.typeId !== 'worker' || worker.alive === false) return false;
    const reference = rocketReference190(game, worker);
    if (!reference) return false;
    const referenceRadius = Math.max(1, scalarFromReference190(reference, 'radius', 14));
    const referenceScale = Math.max(0.2, scalarFromReference190(reference, 'visualScale', 1));
    const signature = `${referenceRadius.toFixed(4)}:${referenceScale.toFixed(4)}`;
    if (worker._fdEngineerRocketSignature190 === signature) return true;

    worker.stats ||= {};
    for (const key of GEOMETRY_KEYS) {
      const value = scalarFromReference190(reference, key, referenceRadius);
      try { worker[key] = value; } catch (_) {}
      try { worker.stats[key] = value; } catch (_) {}
    }
    try { worker.visualScale = referenceScale; } catch (_) {}
    try { worker.stats.visualScale = referenceScale; } catch (_) {}
    worker.infantry = true;
    worker._fdEngineerRocketSignature190 = signature;
    worker._fdEngineerRocketSize190 = {
      build: BUILD,
      referenceType: 'rocket',
      referenceId: reference.id || null,
      radius: referenceRadius,
      visualScale: referenceScale,
    };
    diagnostics190.engineersNormalized += 1;
    diagnostics190.lastReferenceRadius = referenceRadius;
    diagnostics190.lastWorkerRadius = finite190(worker.radius);
    return true;
  };

  const syncEngineers190 = game => {
    if (!game) return 0;
    let count = 0;
    for (const unit of game.units || []) {
      if (unit?.typeId === 'worker' && unit.alive !== false && normalizeEngineer190(game, unit)) count += 1;
    }
    return count;
  };

  const basePresentation190 = GameClass.prototype.getUnitPresentationScale138;
  const engineerRenderScales190 = (game, unit, workerWorldWidth, cellAspect = CELL_ASPECT) => {
    const reference = rocketReference190(game, unit);
    const referenceRadius = Math.max(1, scalarFromReference190(reference, 'radius', finite190(unit?.radius, 6)));
    let rocketFootprint = null;
    try {
      rocketFootprint = game.getUnitFootprint?.(reference, referenceRadius) || game.getUnitFootprint?.('rocket', referenceRadius) || null;
    } catch (_) {}
    const rocketWorldWidth = Math.max(
      1,
      finite190(rocketFootprint?.halfLength, referenceRadius) * 2,
      finite190(rocketFootprint?.halfWidth, referenceRadius * 0.8) * 2,
    );
    const syntheticRocket = reference || {
      typeId: 'rocket', infantry: true, radius: referenceRadius,
      stats: debug?.UNIT_TYPES?.rocket || { radius: referenceRadius, infantry: true },
    };
    let rocketScale = 1;
    try {
      rocketScale = typeof basePresentation190 === 'function'
        ? finite190(basePresentation190.call(game, syntheticRocket, rocketWorldWidth, CELL_ASPECT), 1)
        : 1;
    } catch (_) {}
    const width = Math.max(1, finite190(workerWorldWidth, referenceRadius * 2));
    const scaleX = clamp190(
      rocketWorldWidth * rocketScale * (ROCKET_ALPHA.width / WORKER_ALPHA.width) / width,
      0.5,
      20,
    );
    const scaleY = clamp190(
      rocketWorldWidth * rocketScale * (ROCKET_ALPHA.height / WORKER_ALPHA.height) / width,
      0.5,
      20,
    );
    return {
      scaleX,
      scaleY,
      footprintScale: Math.sqrt(scaleX * scaleY),
      rocketScale,
      rocketWorldWidth,
      cellAspect: Math.max(0.2, finite190(cellAspect, CELL_ASPECT)),
    };
  };

  if (typeof basePresentation190 === 'function') {
    GameClass.prototype.getUnitPresentationScale138 = function(unit, worldWidth, cellAspect = CELL_ASPECT) {
      if (unit?.typeId === 'worker') {
        normalizeEngineer190(this, unit);
        return engineerRenderScales190(this, unit, worldWidth, cellAspect).scaleX;
      }
      return basePresentation190.call(this, unit, worldWidth, cellAspect);
    };
  }

  GameClass.prototype.getInfantryRenderGeometry190 = function(unit, worldWidth, cellAspect = CELL_ASPECT, fallbackScale = 1) {
    const zoom = Math.max(0.001, finite190(this.camera?.zoom, 1));
    const width = Math.max(1, finite190(worldWidth, finite190(unit?.radius, 6) * 2));
    if (unit?.typeId !== 'worker') {
      const scale = Math.max(0.1, finite190(fallbackScale, 1));
      return {
        targetWidth: width * zoom * 1.34 * scale,
        targetHeight: width * zoom * 1.34 * Math.max(0.2, finite190(cellAspect, CELL_ASPECT)) * scale,
        scaleX: scale,
        scaleY: scale,
        footprintScale: scale,
        source: 'standard-infantry-190',
      };
    }
    normalizeEngineer190(this, unit);
    const scales = engineerRenderScales190(this, unit, width, cellAspect);
    const targetWidth = width * zoom * 1.34 * scales.scaleX;
    const targetHeight = width * zoom * 1.34 * scales.cellAspect * scales.scaleY;
    diagnostics190.lastVisibleWidthRatio =
      (targetWidth * WORKER_ALPHA.width / 192) /
      Math.max(1, scales.rocketWorldWidth * zoom * 1.34 * scales.rocketScale * ROCKET_ALPHA.width / 192);
    diagnostics190.lastVisibleHeightRatio =
      (targetHeight * WORKER_ALPHA.height / 144) /
      Math.max(1, scales.rocketWorldWidth * zoom * 1.34 * CELL_ASPECT * scales.rocketScale * ROCKET_ALPHA.height / 144);
    return {
      targetWidth,
      targetHeight,
      scaleX: scales.scaleX,
      scaleY: scales.scaleY,
      footprintScale: scales.footprintScale,
      source: 'rocket-equivalent-engineer-190',
    };
  };

  const baseInfantryBounds190 = GameClass.prototype.getInfantryScreenBounds138;
  if (typeof baseInfantryBounds190 === 'function') {
    GameClass.prototype.getInfantryScreenBounds138 = function(unit) {
      if (unit?.typeId !== 'worker') return baseInfantryBounds190.call(this, unit);
      normalizeEngineer190(this, unit);
      const x = unit.renderX ?? unit.x;
      const y = unit.renderY ?? unit.y;
      const rotation = unit.renderRotation ?? unit.rotation ?? 0;
      let exact = null;
      try { exact = this.getUnitFootprintAt?.(unit, x, y, rotation) || null; } catch (_) {}
      const radius = finite190(unit.radius, 6) * finite190(unit.stats?.visualScale, 1);
      const worldWidth = exact
        ? Math.max(finite190(exact.halfLength) * 2, finite190(exact.halfWidth) * 2, 1)
        : Math.max(1, radius * 2.85);
      const geometry = this.getInfantryRenderGeometry190(unit, worldWidth, CELL_ASPECT, 1);
      const center = this.worldToScreen(x, y, 0);
      const imageX = center.x - geometry.targetWidth * IMAGE_ANCHOR_X;
      const imageY = center.y - geometry.targetHeight * GROUND_BASELINE;
      const pad = clamp190(geometry.targetWidth * 0.026, 2, 5);
      const x1 = imageX + geometry.targetWidth * WORKER_ALPHA.x / 192 - pad;
      const y1 = imageY + geometry.targetHeight * WORKER_ALPHA.y / 144 - pad;
      const x2 = imageX + geometry.targetWidth * (WORKER_ALPHA.x + WORKER_ALPHA.width) / 192 + pad;
      const y2 = imageY + geometry.targetHeight * (WORKER_ALPHA.y + WORKER_ALPHA.height) / 144 + pad;
      return {
        x1, y1, x2, y2,
        footprint: exact,
        renderedWidth: geometry.targetWidth,
        renderedHeight: geometry.targetHeight,
        visibleWidth: x2 - x1,
        visibleHeight: y2 - y1,
        source: geometry.source,
      };
    };
  }

  const installEntityHooks190 = () => {
    const baseAdd = GameClass.prototype.addEntity;
    if (typeof baseAdd === 'function' && !baseAdd.__fdRuntimeStability190Wrapped) {
      const wrappedAdd = function(entity, ...rest) {
        const result = baseAdd.call(this, entity, ...rest);
        if (entity?.typeId === 'worker') normalizeEngineer190(this, entity);
        else if (entity?.typeId === 'rocket') syncEngineers190(this);
        return result;
      };
      Object.defineProperty(wrappedAdd, '__fdRuntimeStability190Wrapped', { value: true });
      GameClass.prototype.addEntity = wrappedAdd;
    }

    for (const name of ['hydrate', 'restore', 'restoreState', 'loadState', 'deserialize', 'initializeBattle']) {
      const base = GameClass.prototype[name];
      if (typeof base !== 'function' || base.__fdRuntimeStability190Wrapped) continue;
      const wrapped = function(...args) {
        const result = base.apply(this, args);
        syncEngineers190(this);
        return result;
      };
      Object.defineProperty(wrapped, '__fdRuntimeStability190Wrapped', { value: true });
      GameClass.prototype[name] = wrapped;
    }
  };

  const snapshotIntegrity190 = game => ({
    units: (game?.units || []).filter(entity => entity?.alive !== false).map(entity => ({
      entity,
      id: entity.id,
      alive: entity.alive,
      health: healthValue190(entity),
      embarkedIn: entity.embarkedIn ?? null,
    })),
    buildings: (game?.buildings || []).filter(entity => entity?.alive !== false).map(entity => ({
      entity,
      id: entity.id,
      alive: entity.alive,
      health: healthValue190(entity),
    })),
  });

  const restoreCollectionEntry190 = (game, collectionName, entry) => {
    const entity = entry?.entity;
    if (!entity || !entry.id) return false;
    const collection = game?.[collectionName];
    if (!Array.isArray(collection)) return false;
    const currentHealth = healthValue190(entity);
    const sufferedDamage = entry.health != null && currentHealth != null && currentHealth < entry.health - 0.0001;
    let repaired = false;
    if (!sufferedDamage && entity.alive === false) {
      entity.alive = entry.alive !== false;
      repaired = true;
    }
    if (collectionName === 'units' && !sufferedDamage && entity.embarkedIn && !entry.embarkedIn) {
      entity.embarkedIn = null;
      repaired = true;
    }
    if (!sufferedDamage && !collection.includes(entity)) {
      const existing = game.getEntity?.(entry.id);
      if (!existing || existing === entity) {
        collection.push(entity);
        repaired = true;
      }
    }
    if (repaired) {
      for (const mapName of ['entities', 'entityById', 'entitiesById']) {
        const map = game?.[mapName];
        try { if (map?.set) map.set(entry.id, entity); } catch (_) {}
      }
      try { game.spatial?.update?.(entity, collectionName); } catch (_) {}
      try { game.unitSpatial?.update?.(entity); } catch (_) {}
      try { game.buildingSpatial?.update?.(entity); } catch (_) {}
    }
    return repaired;
  };

  const repairIntegrity190 = (game, snapshot, reason = 'resource-build') => {
    if (!game || !snapshot) return { repairedUnits: 0, repairedBuildings: 0 };
    let repairedUnits = 0;
    let repairedBuildings = 0;
    for (const entry of snapshot.units || []) {
      if (restoreCollectionEntry190(game, 'units', entry)) repairedUnits += 1;
    }
    for (const entry of snapshot.buildings || []) {
      if (restoreCollectionEntry190(game, 'buildings', entry)) repairedBuildings += 1;
    }
    if (repairedUnits || repairedBuildings) {
      try { game.rebuildSpatialIndexes?.(); } catch (_) {}
      game.uiDirty = true;
    }
    diagnostics190.repairedUnits += repairedUnits;
    diagnostics190.repairedBuildings += repairedBuildings;
    diagnostics190.lastIntegrityReport = {
      reason,
      tick: finite190(game.simTick),
      repairedUnits,
      repairedBuildings,
    };
    return { repairedUnits, repairedBuildings };
  };

  const baseExtractorBuild190 = GameClass.prototype.buildExtractorFromResource83;
  if (typeof baseExtractorBuild190 === 'function' && !baseExtractorBuild190.__fdRuntimeStability190Wrapped) {
    const wrappedExtractorBuild190 = function(node, ...rest) {
      const snapshot = snapshotIntegrity190(this);
      const result = baseExtractorBuild190.call(this, node, ...rest);
      if (!result) return result;
      diagnostics190.extractorBuilds += 1;
      repairIntegrity190(this, snapshot, 'resource-build-sync');
      this._fdResourceBuildGuard190 = {
        snapshot,
        expiresAtTick: finite190(this.simTick) + 2,
      };
      return result;
    };
    Object.defineProperty(wrappedExtractorBuild190, '__fdRuntimeStability190Wrapped', { value: true });
    GameClass.prototype.buildExtractorFromResource83 = wrappedExtractorBuild190;
  }

  const baseUpdate190 = GameClass.prototype.update;
  if (typeof baseUpdate190 === 'function' && !baseUpdate190.__fdResourceGuard190Wrapped) {
    const wrappedUpdate190 = function(...args) {
      const result = baseUpdate190.apply(this, args);
      const guard = this._fdResourceBuildGuard190;
      if (guard) {
        repairIntegrity190(this, guard.snapshot, 'resource-build-next-tick');
        if (finite190(this.simTick) >= finite190(guard.expiresAtTick)) this._fdResourceBuildGuard190 = null;
      }
      return result;
    };
    Object.defineProperty(wrappedUpdate190, '__fdResourceGuard190Wrapped', { value: true });
    GameClass.prototype.update = wrappedUpdate190;
  }

  installEntityHooks190();
  queueMicrotask(() => syncEngineers190(debug?.game));

  root.__FD_RUNTIME_STABILITY_190__ = {
    version: VERSION,
    build: BUILD,
    normalizeEngineer: normalizeEngineer190,
    syncEngineers: syncEngineers190,
    repairIntegrity: repairIntegrity190,
    diagnostics: () => ({ ...diagnostics190 }),
  };
})();
