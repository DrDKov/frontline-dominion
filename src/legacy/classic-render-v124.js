(() => {
  'use strict';

  const debug = window.__FD_DEBUG__;
  const GameClass = debug?.Game;
  const canvas = document.getElementById('game-canvas');
  const context = canvas?.getContext('2d');
  if (!GameClass || !canvas || !context) return;

  const VERSION = '12.4';
  const terrainCaches = new WeakMap();
  const metrics = {
    terrainHits: 0,
    terrainMisses: 0,
    minimapDraws: 0,
    minimapSkips: 0,
    avoidanceBuilds: 0,
    avoidanceReuses: 0,
  };

  const angleDelta = (left, right) => Math.atan2(Math.sin(left - right), Math.cos(left - right));
  const stablePhase = (value) => {
    let hash = 2166136261;
    for (const char of String(value || '')) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
    return hash & 1;
  };

  const cacheKey = (game) => {
    const camera = game.camera || {};
    return [
      canvas.width,
      canvas.height,
      game.seed || 0,
      Number(camera.x || 0).toFixed(3),
      Number(camera.y || 0).toFixed(3),
      Number(camera.zoom || 1).toFixed(5),
      Number(camera.yaw || 0).toFixed(5),
      Number(camera.pitch || 0).toFixed(5),
      game.roads?.length || 0,
      game.terrainPatches?.length || 0,
    ].join(':');
  };

  const ensureTerrainCache = (game) => {
    let cache = terrainCaches.get(game);
    if (!cache) {
      const surface = document.createElement('canvas');
      cache = { surface, context: surface.getContext('2d'), key: '', valid: false };
      terrainCaches.set(game, cache);
    }
    if (cache.surface.width !== canvas.width || cache.surface.height !== canvas.height) {
      cache.surface.width = canvas.width;
      cache.surface.height = canvas.height;
      cache.key = '';
      cache.valid = false;
    }
    return cache;
  };

  const baseDrawTerrain = GameClass.prototype.drawTerrain;
  GameClass.prototype.drawTerrain = function(...args) {
    // Camera shake deliberately bypasses the cache so explosions still move
    // the whole world consistently. The stable frame is cached again as soon
    // as the shake ends.
    if ((this.cameraShake || 0) > 0.01) {
      const cache = ensureTerrainCache(this);
      cache.valid = false;
      metrics.terrainMisses += 1;
      return baseDrawTerrain.apply(this, args);
    }

    const cache = ensureTerrainCache(this);
    const key = cacheKey(this);
    if (cache.valid && cache.key === key) {
      // render() has already drawn the sky and installed the world transform.
      // The cached surface contains the exact native-resolution sky+terrain
      // pixels, so restore it in a single blit and then return to that transform.
      context.save();
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.globalAlpha = 1;
      context.globalCompositeOperation = 'source-over';
      context.drawImage(cache.surface, 0, 0);
      context.restore();
      metrics.terrainHits += 1;
      this._classicStaticReady124 = true;
      return;
    }

    const result = baseDrawTerrain.apply(this, args);
    cache.context.save();
    cache.context.setTransform(1, 0, 0, 1, 0, 0);
    cache.context.globalAlpha = 1;
    cache.context.globalCompositeOperation = 'copy';
    cache.context.drawImage(canvas, 0, 0);
    cache.context.restore();
    cache.key = key;
    cache.valid = true;
    metrics.terrainMisses += 1;
    this._classicStaticReady124 = true;
    return result;
  };

  // The fixed Cossacks-style camera must remain genuinely stable. Legacy
  // explosion shake changed the terrain transform every frame and defeated
  // the static-layer cache during exactly the battles that need it most.
  const baseRender = GameClass.prototype.render;
  GameClass.prototype.render = function(...args) {
    this.cameraShake = 0;
    const cache = ensureTerrainCache(this);
    this._classicStaticReady124 = Boolean(cache.valid && cache.key === cacheKey(this));
    const result = baseRender.apply(this, args);
    this._classicMetricFrame124 = (this._classicMetricFrame124 || 0) + 1;
    if ((this._classicMetricFrame124 % 30) === 0) {
      canvas.dataset.classicTerrainHits = String(metrics.terrainHits);
      canvas.dataset.classicTerrainMisses = String(metrics.terrainMisses);
      canvas.dataset.classicMinimapDraws = String(metrics.minimapDraws);
      canvas.dataset.classicMinimapSkips = String(metrics.minimapSkips);
      canvas.dataset.classicAvoidanceBuilds = String(metrics.avoidanceBuilds);
      canvas.dataset.classicAvoidanceReuses = String(metrics.avoidanceReuses);
    }
    return result;
  };

  // A tactical minimap does not need monitor refresh frequency. Ten native
  // updates per second remain visually continuous while avoiding a complete
  // redraw of roads, resources, armies and fog on every animation frame.
  const baseRenderMinimap = GameClass.prototype.renderMinimap;
  GameClass.prototype.renderMinimap = function(...args) {
    const now = performance.now();
    const elapsed = now - (this._classicMinimapAt124 || -Infinity);
    if (elapsed < 100 && !this._classicForceMinimap124) {
      metrics.minimapSkips += 1;
      return;
    }
    this._classicMinimapAt124 = now;
    this._classicForceMinimap124 = false;
    metrics.minimapDraws += 1;
    return baseRenderMinimap.apply(this, args);
  };

  const baseResize = GameClass.prototype.resize;
  GameClass.prototype.resize = function(...args) {
    const result = baseResize.apply(this, args);
    const cache = terrainCaches.get(this);
    if (cache) cache.valid = false;
    this._classicStaticReady124 = false;
    this._classicForceMinimap124 = true;
    return result;
  };

  // Reciprocal avoidance is the most expensive per-soldier query in a dense
  // column because the final footprint-aware stack examines neighbours twice.
  // Cossacks-like simulation updates that steering field at 12.5 Hz while
  // positions still advance at 25 Hz and render at monitor frequency. Each
  // unit uses a stable alternating phase, so there is no every-other-tick CPU
  // spike and no texture/model LOD change.
  const baseAvoidance = GameClass.prototype.computeUnitAvoidance;
  GameClass.prototype.computeUnitAvoidance = function(unit, desiredX, desiredY) {
    const alive = this._v94AliveUnits || this.units?.length || 0;
    if (!unit?.alive || unit.air || unit.selected || alive < 64) {
      metrics.avoidanceBuilds += 1;
      return baseAvoidance.call(this, unit, desiredX, desiredY);
    }
    const tick = this.simTick || 0;
    const desiredAngle = Math.atan2(desiredY, desiredX);
    const cache = unit._classicAvoidance124;
    const directionChanged = !cache || Math.abs(angleDelta(desiredAngle, cache.desiredAngle)) > .24;
    const movedTooFar = !cache || Math.hypot(unit.x - cache.x, unit.y - cache.y) > Math.max(12, (unit.radius || 12) * .72);
    const scheduled = ((tick + stablePhase(unit.id)) & 1) === 0;
    if (cache && !directionChanged && !movedTooFar && !scheduled && tick - cache.tick <= 2) {
      unit.v71TrafficSpeedFactor = cache.trafficSpeedFactor;
      unit.navYieldFactor = cache.navYieldFactor;
      metrics.avoidanceReuses += 1;
      return cache.output;
    }
    if (!cache && !scheduled) {
      unit.v71TrafficSpeedFactor = 1;
      unit.navYieldFactor = 1;
      metrics.avoidanceReuses += 1;
      return { x: 0, y: 0 };
    }
    const output = baseAvoidance.call(this, unit, desiredX, desiredY) || { x: 0, y: 0 };
    unit._classicAvoidance124 = {
      tick,
      x: unit.x,
      y: unit.y,
      desiredAngle,
      output: { x: output.x || 0, y: output.y || 0 },
      trafficSpeedFactor: Number.isFinite(unit.v71TrafficSpeedFactor) ? unit.v71TrafficSpeedFactor : 1,
      navYieldFactor: Number.isFinite(unit.navYieldFactor) ? unit.navYieldFactor : 1,
    };
    metrics.avoidanceBuilds += 1;
    return output;
  };

  window.__FD_CLASSIC_RENDER__ = {
    version: VERSION,
    architecture: 'native-resolution terrain snapshot + dynamic entity layer + 10hz tactical minimap',
    metrics: () => ({ ...metrics }),
    invalidate: () => {
      const game = debug.game;
      const cache = game ? terrainCaches.get(game) : null;
      if (cache) cache.valid = false;
      if (game) game._classicForceMinimap124 = true;
    },
  };
})();
