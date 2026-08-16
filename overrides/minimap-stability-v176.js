(() => {
  'use strict';

  const debug = window.__FD_DEBUG__;
  const GameClass = debug?.Game;
  const minimap = document.getElementById('minimap');
  if (!GameClass || !minimap) return;

  const VERSION = '16.4.1';
  const BUILD = 176;
  const baseRenderMinimap176 = GameClass.prototype.renderMinimap;
  const states = new WeakMap();
  const metrics = {
    draws: 0,
    skips: 0,
    forcedDraws: 0,
    errors: 0,
  };

  const intervalFor = (game) => {
    const alive = Number(game?._v94AliveUnits) || Number(game?.units?.length) || 0;
    return alive >= 70000 ? 240 : 140;
  };

  const stateFor = (game) => {
    let state = states.get(game);
    if (!state) {
      state = {
        lastDrawAt: -Infinity,
        lastPowerOnline: null,
        lastCanvasKey: '',
      };
      states.set(game, state);
    }
    return state;
  };

  GameClass.prototype.renderMinimap = function(...args) {
    const state = stateFor(this);
    const now = performance.now();
    const intervalMs = intervalFor(this);
    const powerOnline = typeof this.isPowerGridOnline126 === 'function'
      ? Boolean(this.isPowerGridOnline126('player'))
      : true;
    const canvasKey = `${minimap.width}x${minimap.height}`;
    const explicitForce = Boolean(this._minimapForce176);
    const stateChanged =
      state.lastPowerOnline !== powerOnline ||
      state.lastCanvasKey !== canvasKey;
    const due = now - state.lastDrawAt >= intervalMs;

    if (!explicitForce && !stateChanged && !due) {
      metrics.skips += 1;
      return false;
    }

    this._minimapForce176 = false;
    state.lastDrawAt = now;
    state.lastPowerOnline = powerOnline;
    state.lastCanvasKey = canvasKey;

    // The legacy stack contains two independent throttles and several
    // translucent overlays. Permit one complete base frame and all overlays
    // exactly once; otherwise the overlays accumulate and then reset, which
    // is perceived as minimap blinking.
    this._classicForceMinimap124 = true;
    this._v94MiniRenderAt = -Infinity;
    this._v94MiniDirty = true;

    const context = minimap.getContext('2d');
    if (context) {
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.globalAlpha = 1;
      context.globalCompositeOperation = 'source-over';
    }

    try {
      const result = baseRenderMinimap176.apply(this, args);
      this._minimapStableFrame176 = (this._minimapStableFrame176 || 0) + 1;
      metrics.draws += 1;
      if (explicitForce || stateChanged) metrics.forcedDraws += 1;
      minimap.dataset.stableFrame = String(this._minimapStableFrame176);
      minimap.dataset.stableInterval = String(intervalMs);
      return result === false ? true : result;
    } catch (error) {
      state.lastDrawAt = -Infinity;
      metrics.errors += 1;
      console.error('[Frontline Dominion v16.4.1] minimap render failed', error);
      return false;
    }
  };

  const baseResize176 = GameClass.prototype.resize;
  GameClass.prototype.resize = function(...args) {
    const result = baseResize176.apply(this, args);
    this._minimapForce176 = true;
    return result;
  };

  window.__FD_MINIMAP_STABILITY__ = {
    version: VERSION,
    build: BUILD,
    intervalFor: () => intervalFor(debug.game),
    metrics: () => ({ ...metrics }),
    invalidate: () => {
      const game = debug.game;
      if (game) game._minimapForce176 = true;
    },
  };

  document.documentElement.dataset.fdMinimapStability = `v${VERSION}-b${BUILD}`;
  console.info(`[Frontline Dominion] Minimap Stability v${VERSION} build ${BUILD} loaded`);
})();
