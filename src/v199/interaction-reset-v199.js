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
    clickFallbacks: 0,
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
    if (!game) return false;
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const duplicate = now - lastResetAt < 120 && Math.hypot(worldX - lastResetX, worldY - lastResetY) < 4;
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
  let completedPrimary = null;

  const worldFromClient = (game, clientX, clientY) => {
    const rect = canvas?.getBoundingClientRect?.();
    if (!game || !canvas || !rect?.width || !rect?.height) return null;
    const screenX = (clientX - rect.left) * canvas.width / rect.width;
    const screenY = (clientY - rect.top) * canvas.height / rect.height;
    const world = game.screenToWorld?.(screenX, screenY, 0) || game.screenToWorld?.(screenX, screenY);
    return world && Number.isFinite(world.x) && Number.isFinite(world.y) ? world : null;
  };

  const finishPhysicalEmptyClick = (gameAtRelease, world, reason) => {
    setTimeout(() => {
      const game = D?.game;
      if (!game || game !== gameAtRelease || intentionalMode(game)) return;
      if (figureHit(game, world.x, world.y)) return;
      if (resetEmptyTerrain(game, world.x, world.y, reason)) state.physicalEmptyClicks += 1;
    }, 0);
  };

  if (canvas) {
    canvas.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      const game = D?.game;
      const gesture = {
        pointerId: event.pointerId,
        clientX: event.clientX,
        clientY: event.clientY,
        lastClientX: event.clientX,
        lastClientY: event.clientY,
        maxMovement: 0,
        intentional: intentionalMode(game),
        modified: Boolean(event.shiftKey || event.ctrlKey || event.metaKey || event.altKey),
        completedAt: 0,
      };
      pointerStarts.set(event.pointerId, gesture);
      completedPrimary = null;
    }, true);

    canvas.addEventListener('pointermove', event => {
      const gesture = pointerStarts.get(event.pointerId);
      if (!gesture) return;
      gesture.lastClientX = event.clientX;
      gesture.lastClientY = event.clientY;
      gesture.maxMovement = Math.max(
        gesture.maxMovement,
        Math.hypot(event.clientX - gesture.clientX, event.clientY - gesture.clientY),
      );
    }, true);

    canvas.addEventListener('pointerup', event => {
      const start = pointerStarts.get(event.pointerId);
      pointerStarts.delete(event.pointerId);
      if (!start) return;
      start.lastClientX = event.clientX;
      start.lastClientY = event.clientY;
      start.maxMovement = Math.max(
        start.maxMovement,
        Math.hypot(event.clientX - start.clientX, event.clientY - start.clientY),
      );
      start.completedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
      completedPrimary = start;

      // Some browsers report -1 on pointerup after the primary button has
      // already been released. Accept both 0 and -1; the pointerdown record is
      // the authoritative proof that this was a primary-button gesture.
      if (event.button !== 0 && event.button !== -1) return;
      if (start.maxMovement > 7 || start.modified || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return;
      const gameAtRelease = D?.game;
      if (start.intentional || intentionalMode(gameAtRelease)) {
        state.intentionalClicksPreserved += 1;
        return;
      }
      const world = worldFromClient(gameAtRelease, event.clientX, event.clientY);
      if (world) finishPhysicalEmptyClick(gameAtRelease, world, 'physical-pointerup-empty-terrain');
    }, true);

    // Browser click is the final, cross-engine fallback. It runs after the
    // historical pointer/mouse selection listeners, so it also covers code
    // paths that bypass Game.selectAt or report a nonstandard pointerup button.
    canvas.addEventListener('click', event => {
      if (event.button !== 0 || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return;
      const gesture = completedPrimary;
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      if (!gesture || now - gesture.completedAt > 600 || gesture.maxMovement > 7 || gesture.modified) return;
      const gameAtRelease = D?.game;
      if (gesture.intentional || intentionalMode(gameAtRelease)) {
        state.intentionalClicksPreserved += 1;
        return;
      }
      const world = worldFromClient(gameAtRelease, event.clientX, event.clientY);
      if (!world) return;
      state.clickFallbacks += 1;
      finishPhysicalEmptyClick(gameAtRelease, world, 'physical-click-empty-terrain');
    }, true);

    canvas.addEventListener('pointercancel', event => {
      pointerStarts.delete(event.pointerId);
      if (completedPrimary?.pointerId === event.pointerId) completedPrimary = null;
    }, true);
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
