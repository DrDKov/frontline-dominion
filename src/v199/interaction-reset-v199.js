(() => {
  'use strict';

  if (typeof document === 'undefined') return;
  const root = globalThis;
  const D = root.__FD_DEBUG__;
  const Game = D?.Game;
  if (!Game?.prototype || root.__FD_INTERACTION_RESET_199__) return;

  const VERSION = '16.8.15';
  const BUILD = 199;
  const state = {
    emptyClicks: 0,
    selectionsCleared: 0,
    modesCleared: 0,
    intentionalClicksPreserved: 0,
    physicalEmptyClicks: 0,
    lastReason: null,
  };

  const intentionalMode = game => Boolean(
    game?.buildMode ||
    game?.commandMode ||
    game?._v78OrderDrag ||
    game?.input?.buildPlacementDrag ||
    game?.input?.routeDrag ||
    game?.input?.patrolDrag ||
    game?.input?.attackDrag ||
    game?.input?.orientedMoveDrag ||
    game?.input?.targetDrag ||
    game?.input?.commandDrag ||
    game?._touchOrderMode ||
    game?._transportHover95?.ready,
  );

  const figureHit = (game, x, y) => {
    try {
      if (game.getUnitFigureHits140?.(x, y)?.length) return true;
      if (game.getBuildingFigureHits193?.(x, y)?.length) return true;
      return Boolean(game.hitTest?.(x, y, true));
    } catch (_) {
      return false;
    }
  };

  const clearTransientActions = game => {
    let changed = false;
    if (game.buildMode || game.commandMode) changed = true;
    try { game.cancelModes?.(); } catch (_) {}
    game.buildMode = null;
    game.commandMode = null;
    if (game.input) {
      game.input.drag = null;
      game.input.selectionDrag = null;
      game.input.buildPlacementDrag = null;
      game.input.routeDrag = null;
      game.input.patrolDrag = null;
      game.input.attackDrag = null;
      game.input.orientedMoveDrag = null;
      game.input.targetDrag = null;
      game.input.commandDrag = null;
    }
    game._v78OrderDrag = null;
    if (changed) state.modesCleared += 1;
  };

  let lastResetAt = -Infinity;
  let lastResetX = NaN;
  let lastResetY = NaN;
  const resetEmptyTerrain = (game, worldX, worldY, reason) => {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const duplicate = now - lastResetAt < 80 && Math.hypot(worldX - lastResetX, worldY - lastResetY) < 4;
    if (duplicate) return false;
    lastResetAt = now;
    lastResetX = worldX;
    lastResetY = worldY;

    state.emptyClicks += 1;
    const hadSelection = Boolean(game.selected?.length);
    try { game.clearSelection?.(); } catch (_) { game.selected = []; }
    if (hadSelection || !game.selected?.length) state.selectionsCleared += 1;
    clearTransientActions(game);
    game.uiDirty = true;
    game.renderSnapshotDirty = true;
    if (game.uiCache) {
      game.uiCache.selectionKey = '';
      game.uiCache.commandKey = '';
    }
    state.lastReason = reason;
    return true;
  };

  const baseSelectAt = Game.prototype.selectAt;
  if (typeof baseSelectAt === 'function') {
    Game.prototype.selectAt = function emptyTerrainSelectionReset199(worldX, worldY, additive = false, ...rest) {
      if (intentionalMode(this)) {
        state.intentionalClicksPreserved += 1;
        return baseSelectAt.call(this, worldX, worldY, additive, ...rest);
      }
      const hit = figureHit(this, worldX, worldY);
      const result = baseSelectAt.call(this, worldX, worldY, additive, ...rest);
      if (!hit && !additive) resetEmptyTerrain(this, worldX, worldY, 'selectAt-empty-terrain');
      return result;
    };
    Object.defineProperty(Game.prototype.selectAt, '__fdInteractionReset199', { value: true });
  }

  const canvas = document.getElementById('game-canvas');
  const pointerStarts = new Map();
  if (canvas) {
    canvas.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      const game = D?.game;
      pointerStarts.set(event.pointerId, {
        clientX: event.clientX,
        clientY: event.clientY,
        intentional: intentionalMode(game),
        modified: Boolean(event.shiftKey || event.ctrlKey || event.metaKey || event.altKey),
      });
    }, true);

    canvas.addEventListener('pointerup', event => {
      if (event.button !== 0) return;
      const start = pointerStarts.get(event.pointerId);
      pointerStarts.delete(event.pointerId);
      if (!start) return;
      const movement = Math.hypot(event.clientX - start.clientX, event.clientY - start.clientY);
      if (movement > 7 || start.modified || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return;
      const gameAtRelease = D?.game;
      if (start.intentional || intentionalMode(gameAtRelease)) {
        state.intentionalClicksPreserved += 1;
        return;
      }

      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const screenX = (event.clientX - rect.left) * canvas.width / rect.width;
      const screenY = (event.clientY - rect.top) * canvas.height / rect.height;
      const world = gameAtRelease?.screenToWorld?.(screenX, screenY, 0) || gameAtRelease?.screenToWorld?.(screenX, screenY);
      if (!world || !Number.isFinite(world.x) || !Number.isFinite(world.y)) return;

      // Run after the historical selection owner has processed pointerup. This
      // makes a physical click deterministic even when that owner bypasses
      // Game.selectAt and manipulates selection directly.
      setTimeout(() => {
        const game = D?.game;
        if (!game || game !== gameAtRelease || intentionalMode(game)) return;
        if (figureHit(game, world.x, world.y)) return;
        if (resetEmptyTerrain(game, world.x, world.y, 'physical-primary-empty-terrain')) {
          state.physicalEmptyClicks += 1;
        }
      }, 0);
    }, true);

    canvas.addEventListener('pointercancel', event => pointerStarts.delete(event.pointerId), true);
    canvas.addEventListener('pointerleave', event => {
      if ((event.buttons & 1) === 0) pointerStarts.delete(event.pointerId);
    }, true);
  }

  root.__FD_INTERACTION_RESET_199__ = {
    version: VERSION,
    build: BUILD,
    state,
    intentionalMode: () => intentionalMode(D?.game),
    resetEmptyTerrain: (x, y) => resetEmptyTerrain(D?.game, x, y, 'debug-empty-terrain'),
  };
})();
