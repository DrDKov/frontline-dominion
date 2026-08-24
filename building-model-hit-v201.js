(() => {
  'use strict';

  if (typeof document === 'undefined') return;
  const root = globalThis;
  const D = root.__FD_DEBUG__;
  const Game = D?.Game;
  if (!Game?.prototype || root.__FD_BUILDING_MODEL_HIT_201__) return;

  const VERSION = '16.8.17';
  const BUILD = 201;
  const state = {
    figureQueries: 0,
    figureMissesFiltered: 0,
    hitTestsFiltered: 0,
    failOpenQueries: 0,
    lastBuildingId: null,
  };

  const selectedBuildingIds = game => new Set((game?.selected || [])
    .filter(entity => entity?.alive && entity.kind === 'building')
    .map(entity => entity.id));

  const exactSelectedHit = (game, building, worldX, worldY) => {
    if (!building?.id || !selectedBuildingIds(game).has(building.id)) return true;
    const contour = root.__FD_BUILDING_SELECTION_CONTOUR_200__;
    const hit = contour?.modelHitAtWorld?.(worldX, worldY, building.id, game);
    state.lastBuildingId = building.id;
    if (hit == null) {
      state.failOpenQueries += 1;
      return true;
    }
    return hit;
  };

  const baseFigureHits = Game.prototype.getBuildingFigureHits193;
  if (typeof baseFigureHits === 'function') {
    Game.prototype.getBuildingFigureHits193 = function exactSelectedBuildingFigure201(worldX, worldY, ...rest) {
      const hits = baseFigureHits.call(this, worldX, worldY, ...rest) || [];
      state.figureQueries += 1;
      return hits.filter(hit => {
        const keep = exactSelectedHit(this, hit?.building, worldX, worldY);
        if (!keep) state.figureMissesFiltered += 1;
        return keep;
      });
    };
    Object.defineProperty(Game.prototype.getBuildingFigureHits193, '__fdBuildingModelHit201', { value: true });
  }

  const baseHitTest = Game.prototype.hitTest;
  if (typeof baseHitTest === 'function') {
    Game.prototype.hitTest = function exactSelectedBuildingHitTest201(worldX, worldY, selectableOnly = true, ...rest) {
      const hit = baseHitTest.call(this, worldX, worldY, selectableOnly, ...rest);
      if (hit?.kind === 'building' && !exactSelectedHit(this, hit, worldX, worldY)) {
        state.hitTestsFiltered += 1;
        return null;
      }
      return hit;
    };
    Object.defineProperty(Game.prototype.hitTest, '__fdBuildingModelHit201', { value: true });
  }

  root.__FD_BUILDING_MODEL_HIT_201__ = {
    version: VERSION,
    build: BUILD,
    state,
    exactSelectedHit: (building, worldX, worldY, game = D?.game) =>
      exactSelectedHit(game, building, worldX, worldY),
  };
})();
