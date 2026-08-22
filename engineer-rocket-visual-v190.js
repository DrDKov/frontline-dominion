(() => {
  'use strict';

  const root = globalThis;
  const debug = root.__FD_DEBUG__;
  const Game = debug?.Game;
  if (!Game?.prototype || Game.prototype.__fdEngineerRocketVisual190Installed) return;
  Object.defineProperty(Game.prototype, '__fdEngineerRocketVisual190Installed', {
    value: true,
    configurable: true,
  });

  const VERSION = '16.8.6';
  const BUILD = 190;
  const WORKER_ALPHA = Object.freeze({ width: 82, height: 105 });
  const ROCKET_ALPHA = Object.freeze({ width: 118, height: 125 });
  const DEFAULT_ASPECT = 0.75;
  const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  const previousPresentation = Game.prototype.getUnitPresentationScale138;
  const previousGeometry = Game.prototype.getInfantryRenderGeometry190;
  const diagnostics = {
    samples: 0,
    lastHeightRatio: 0,
    lastWidthRatio: 0,
    lastScale: 0,
    lastRocketScale: 0,
    source: 'uniform-height-match',
  };

  const rocketReference = (game, worker) => {
    const live = (game?.units || []).find(unit =>
      unit?.alive !== false && unit?.kind === 'unit' && unit?.typeId === 'rocket' &&
      (!worker?.team || unit.team === worker.team)
    );
    if (live) return live;
    const team = game?.teams?.[worker?.team] || game?.teams?.player || null;
    let stats = null;
    try { stats = debug?.getUnitStats?.('rocket', team) || null; } catch (_) {}
    stats ||= debug?.UNIT_TYPES?.rocket || null;
    if (!stats) return null;
    return {
      id: null,
      typeId: 'rocket',
      kind: 'unit',
      alive: true,
      infantry: true,
      team: worker?.team || 'player',
      radius: finite(stats.radius, 14),
      stats,
    };
  };

  const footprintWidth = (game, unitOrType, radius) => {
    try {
      const footprint = game.getUnitFootprint?.(unitOrType, radius) ||
        (typeof unitOrType === 'object' ? game.getUnitFootprint?.(unitOrType?.typeId, radius) : null);
      if (footprint) return Math.max(
        1,
        finite(footprint.halfLength, radius) * 2,
        finite(footprint.halfWidth, radius * 0.8) * 2,
      );
    } catch (_) {}
    return Math.max(1, finite(radius, 6) * 2);
  };

  const uniformEngineerScale = (game, worker, workerWorldWidth, cellAspect = DEFAULT_ASPECT) => {
    const reference = rocketReference(game, worker);
    const rocketRadius = Math.max(1, finite(reference?.radius ?? reference?.stats?.radius, finite(worker?.radius, 6)));
    const rocketWorldWidth = footprintWidth(game, reference || 'rocket', rocketRadius);
    let rocketScale = 1;
    try {
      rocketScale = typeof previousPresentation === 'function'
        ? finite(previousPresentation.call(game, reference, rocketWorldWidth, DEFAULT_ASPECT), 1)
        : 1;
    } catch (_) {}
    const width = Math.max(1, finite(workerWorldWidth, finite(worker?.radius, 6) * 2));
    const aspect = Math.max(0.2, finite(cellAspect, DEFAULT_ASPECT));
    // A rocket launcher makes the rocket atlas wider. Matching both axes would
    // stretch the engineer sideways, so the engineer is scaled uniformly by
    // visible human height. The physical body and selection footprint remain
    // rocket-sized, while the silhouette keeps its natural proportions.
    const scale = clamp(
      rocketWorldWidth * rocketScale * DEFAULT_ASPECT * ROCKET_ALPHA.height /
        Math.max(1, width * aspect * WORKER_ALPHA.height),
      0.5,
      20,
    );
    return { scale, rocketScale, rocketWorldWidth, width, aspect };
  };

  if (typeof previousPresentation === 'function') {
    Game.prototype.getUnitPresentationScale138 = function(unit, worldWidth, cellAspect = DEFAULT_ASPECT) {
      if (unit?.typeId !== 'worker') return previousPresentation.call(this, unit, worldWidth, cellAspect);
      try { root.__FD_RUNTIME_STABILITY_190__?.normalizeEngineer?.(this, unit); } catch (_) {}
      return uniformEngineerScale(this, unit, worldWidth, cellAspect).scale;
    };
  }

  Game.prototype.getInfantryRenderGeometry190 = function(unit, worldWidth, cellAspect = DEFAULT_ASPECT, fallbackScale = 1) {
    if (unit?.typeId !== 'worker') {
      if (typeof previousGeometry === 'function') return previousGeometry.call(this, unit, worldWidth, cellAspect, fallbackScale);
      const width = Math.max(1, finite(worldWidth, finite(unit?.radius, 6) * 2));
      const zoom = Math.max(0.001, finite(this.camera?.zoom, 1));
      const scale = Math.max(0.1, finite(fallbackScale, 1));
      return {
        targetWidth: width * zoom * 1.34 * scale,
        targetHeight: width * zoom * 1.34 * Math.max(0.2, finite(cellAspect, DEFAULT_ASPECT)) * scale,
        scaleX: scale,
        scaleY: scale,
        footprintScale: scale,
        source: 'standard-infantry-190',
      };
    }

    try { root.__FD_RUNTIME_STABILITY_190__?.normalizeEngineer?.(this, unit); } catch (_) {}
    const zoom = Math.max(0.001, finite(this.camera?.zoom, 1));
    const scales = uniformEngineerScale(this, unit, worldWidth, cellAspect);
    const targetWidth = scales.width * zoom * 1.34 * scales.scale;
    const targetHeight = targetWidth * scales.aspect;
    const rocketTargetWidth = scales.rocketWorldWidth * zoom * 1.34 * scales.rocketScale;
    const rocketTargetHeight = rocketTargetWidth * DEFAULT_ASPECT;
    const visibleWidth = targetWidth * WORKER_ALPHA.width / 192;
    const visibleHeight = targetHeight * WORKER_ALPHA.height / 144;
    const rocketVisibleWidth = rocketTargetWidth * ROCKET_ALPHA.width / 192;
    const rocketVisibleHeight = rocketTargetHeight * ROCKET_ALPHA.height / 144;

    diagnostics.samples += 1;
    diagnostics.lastHeightRatio = visibleHeight / Math.max(1, rocketVisibleHeight);
    diagnostics.lastWidthRatio = visibleWidth / Math.max(1, rocketVisibleWidth);
    diagnostics.lastScale = scales.scale;
    diagnostics.lastRocketScale = scales.rocketScale;

    return {
      targetWidth,
      targetHeight,
      scaleX: scales.scale,
      scaleY: scales.scale,
      // Indicators follow the same presentation scale as the rocket rather
      // than the wider launcher silhouette or the engineer atlas correction.
      footprintScale: scales.rocketScale,
      source: 'rocket-height-engineer-190',
    };
  };

  root.__FD_ENGINEER_ROCKET_VISUAL_190__ = {
    version: VERSION,
    build: BUILD,
    diagnostics: () => ({ ...diagnostics }),
    scaleFor: uniformEngineerScale,
  };
})();