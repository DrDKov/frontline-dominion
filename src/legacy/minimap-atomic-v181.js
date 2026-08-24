(() => {
  'use strict';

  const root = globalThis;
  const debug = root.__FD_DEBUG__;
  const GameClass = debug?.Game;
  const minimap = typeof document !== 'undefined' ? document.getElementById('minimap') : null;
  if (!GameClass || !minimap || GameClass.prototype.__fdMinimapAtomic181) return;

  Object.defineProperty(GameClass.prototype, '__fdMinimapAtomic181', {
    value: true,
    configurable: true,
  });

  const VERSION = '16.6.1';
  const BUILD = 181;
  const finalRenderMinimap181 = GameClass.prototype.renderMinimap;
  const finalResize181 = GameClass.prototype.resize;
  const states181 = new WeakMap();
  const metrics181 = {
    calls: 0,
    draws: 0,
    skips: 0,
    reentrantSkips: 0,
    forcedDraws: 0,
    restoredFrames: 0,
    errors: 0,
  };

  const now181 = () => typeof performance !== 'undefined' ? performance.now() : Date.now();
  const finite181 = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

  function interval181(game) {
    const alive = finite181(game?._v94AliveUnits, game?.units?.length || 0);
    if (alive >= 70000) return 240;
    if (alive >= 20000) return 180;
    return 120;
  }

  function currentSequence181(game) {
    return Number(
      game?._fdMinimapState165?.sequence ??
      root.__FD_STABLE_STATE165__?.minimapSequence ??
      root.__FD_STABLE_STATE165__?.bridge?.minimapStateSequence165 ??
      0
    ) || 0;
  }

  function cameraKey181(game) {
    const camera = game?.camera || {};
    const viewport = game?.viewport || {};
    return [
      Math.round(finite181(camera.x) / 72),
      Math.round(finite181(camera.y) / 72),
      Math.round(finite181(camera.zoom, 1) * 80),
      Math.round(finite181(viewport.width)),
      Math.round(finite181(viewport.height)),
    ].join(':');
  }

  function powerOnline181(game) {
    if (typeof game?.isPowerGridOnline126 === 'function') {
      try { return Boolean(game.isPowerGridOnline126('player')); } catch (_) {}
    }
    return finite181(game?.teams?.player?.powerFactor, 1) > 0.05;
  }

  function state181(game) {
    let state = states181.get(game);
    if (state) return state;
    const surface = document.createElement('canvas');
    const context = surface.getContext('2d');
    state = {
      surface,
      context,
      valid: false,
      drawing: false,
      lastDrawAt: -Infinity,
      lastSequence: -1,
      lastCameraKey: '',
      lastSizeKey: '',
      lastPowerOnline: null,
      frame: 0,
    };
    states181.set(game, state);
    return state;
  }

  function resetContext181(context) {
    if (!context) return;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.globalAlpha = 1;
    context.globalCompositeOperation = 'source-over';
    context.lineWidth = 1;
    context.setLineDash?.([]);
  }

  function storeStableFrame181(state) {
    if (!state.context || !minimap.width || !minimap.height) return;
    if (state.surface.width !== minimap.width || state.surface.height !== minimap.height) {
      state.surface.width = minimap.width;
      state.surface.height = minimap.height;
    }
    state.context.save();
    state.context.setTransform(1, 0, 0, 1, 0, 0);
    state.context.globalAlpha = 1;
    state.context.globalCompositeOperation = 'copy';
    state.context.drawImage(minimap, 0, 0);
    state.context.restore();
    state.valid = true;
  }

  function restoreStableFrame181(state) {
    if (!state.valid || state.surface.width !== minimap.width || state.surface.height !== minimap.height) return false;
    const context = minimap.getContext('2d');
    if (!context) return false;
    context.save();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.globalAlpha = 1;
    context.globalCompositeOperation = 'copy';
    context.drawImage(state.surface, 0, 0);
    context.restore();
    metrics181.restoredFrames += 1;
    return true;
  }

  GameClass.prototype.renderMinimap = function(...args) {
    metrics181.calls += 1;
    const state = state181(this);
    if (state.drawing) {
      metrics181.reentrantSkips += 1;
      return false;
    }

    const now = now181();
    const interval = interval181(this);
    const sequence = currentSequence181(this);
    const cameraKey = cameraKey181(this);
    const sizeKey = `${minimap.width}x${minimap.height}`;
    const powerOnline = powerOnline181(this);
    const explicitForce = Boolean(this._fdMinimapForce181);
    const sizeChanged = sizeKey !== state.lastSizeKey;
    const powerChanged = powerOnline !== state.lastPowerOnline;
    const sequenceChanged = sequence !== state.lastSequence;
    const cameraChanged = cameraKey !== state.lastCameraKey;
    const elapsed = now - state.lastDrawAt;
    const due = elapsed >= interval;
    const responsiveDue = elapsed >= Math.min(80, interval);
    const shouldDraw = explicitForce || sizeChanged || powerChanged || due ||
      (responsiveDue && (sequenceChanged || cameraChanged));

    if (!shouldDraw) {
      metrics181.skips += 1;
      return false;
    }

    state.drawing = true;
    this._fdMinimapForce181 = false;

    // Force every legacy layer to participate in this one complete frame.
    // The outer wrapper then suppresses all intermediate calls, so translucent
    // sector overlays cannot accumulate between full background redraws.
    this._classicForceMinimap124 = true;
    this._v94MiniRenderAt = -Infinity;
    this._v94MiniDirty = true;

    const context = minimap.getContext('2d');
    resetContext181(context);

    try {
      const result = finalRenderMinimap181?.apply(this, args);
      resetContext181(context);
      storeStableFrame181(state);
      state.lastDrawAt = now;
      state.lastSequence = sequence;
      state.lastCameraKey = cameraKey;
      state.lastSizeKey = sizeKey;
      state.lastPowerOnline = powerOnline;
      state.frame += 1;
      metrics181.draws += 1;
      if (explicitForce || sizeChanged || powerChanged) metrics181.forcedDraws += 1;
      minimap.dataset.atomicFrame181 = String(state.frame);
      minimap.dataset.atomicSequence181 = String(sequence);
      minimap.dataset.atomicInterval181 = String(interval);
      return result === false ? true : result;
    } catch (error) {
      metrics181.errors += 1;
      state.lastDrawAt = -Infinity;
      restoreStableFrame181(state);
      console.error('[Frontline Dominion v16.6.1] atomic minimap render failed', error);
      return false;
    } finally {
      state.drawing = false;
    }
  };

  if (typeof finalResize181 === 'function') {
    GameClass.prototype.resize = function(...args) {
      const result = finalResize181.apply(this, args);
      const state = states181.get(this);
      if (state) {
        state.valid = false;
        state.lastSizeKey = '';
      }
      this._fdMinimapForce181 = true;
      return result;
    };
  }

  root.__FD_MINIMAP_ATOMIC_181__ = {
    version: VERSION,
    build: BUILD,
    architecture: 'single outer owner + complete legacy frame + stable backup',
    metrics: () => ({ ...metrics181 }),
    invalidate() {
      const game = debug.game;
      if (game) game._fdMinimapForce181 = true;
    },
  };

  document.documentElement.dataset.fdMinimapAtomic = `v${VERSION}-b${BUILD}`;
})();
