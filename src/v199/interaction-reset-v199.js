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
    }
    game._v78OrderDrag = null;
    if (changed) state.modesCleared += 1;
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
      if (!hit && !additive) {
        state.emptyClicks += 1;
        const hadSelection = Boolean(this.selected?.length);
        try { this.clearSelection?.(); } catch (_) { this.selected = []; }
        if (hadSelection || !this.selected?.length) state.selectionsCleared += 1;
        clearTransientActions(this);
        this.uiDirty = true;
        state.lastReason = 'simple-primary-empty-terrain';
      }
      return result;
    };
    Object.defineProperty(Game.prototype.selectAt, '__fdInteractionReset199', { value: true });
  }

  root.__FD_INTERACTION_RESET_199__ = {
    version: VERSION,
    build: BUILD,
    state,
    intentionalMode: () => intentionalMode(D?.game),
  };
})();
