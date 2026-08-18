(() => {
  'use strict';

  const root = globalThis;
  const D = root.__FD_DEBUG__;
  const Game = D?.Game;
  if (typeof document === 'undefined' || !Game?.prototype || root.__FD_BUILDING_SELECTION_OWNER_196__) return;

  const VERSION = '16.8.12';
  const BUILD = 196;
  const state = {
    flagsCleared: 0,
    selectionCanonicalizations: 0,
    renderSelectionMasks: 0,
    overlayFrames: 0,
    overlayDraws: 0,
    duplicateSelectedIdsRemoved: 0,
    lastSelectedIds: [],
  };

  const canonicalizeSelected = game => {
    const seen = new Set();
    const selected = [];
    for (const entity of game?.selected || []) {
      const current = entity?.id != null ? (game.getEntity?.(entity.id) || entity) : entity;
      if (!current?.alive) continue;
      const key = current.id ?? current;
      if (seen.has(key)) {
        state.duplicateSelectedIdsRemoved += 1;
        continue;
      }
      seen.add(key);
      selected.push(current);
    }
    game.selected = selected;
    state.selectionCanonicalizations += 1;
    state.lastSelectedIds = selected.map(entity => entity.id).filter(Boolean);
    return selected;
  };

  const clearBuildingVisualFlags = game => {
    let cleared = 0;
    for (const building of game?.buildings || []) {
      if (!building?.selected) continue;
      building.selected = false;
      cleared += 1;
    }
    state.flagsCleared += cleared;
    return cleared;
  };

  const selectedBuildings = game => canonicalizeSelected(game)
    .filter(entity => entity?.alive && entity.kind === 'building');

  const enforceSelectionOwner = game => {
    canonicalizeSelected(game);
    clearBuildingVisualFlags(game);
  };

  const drawBuildingSelection = (game, building) => {
    if (!building?.alive) return false;
    if (building.team === 'enemy' && !game.isVisibleAt?.(building.x, building.y)) return false;
    if (building.team === 'neutral' && !game.isExploredAt?.(building.x, building.y)) return false;
    if (typeof game.isOnScreen === 'function' && !game.isOnScreen(building.x, building.y, (building.radius || 24) + 180)) return false;
    const color = game.teamColor?.(building.team) || '#7dd3fc';
    const footprint = game.getEntityBuildingFootprintAt?.(building, Number(building.rotation) || 0);
    if (footprint?.corners?.length >= 3 && typeof game.screenPolygon === 'function') {
      const points = footprint.corners.map(point => game.worldToScreen(point.x, point.y, 0.045));
      game.screenPolygon(points, null, color, 2.25);
      return true;
    }
    if (typeof game.groundEllipse3D === 'function') {
      const radius = Math.max(9, Number(building.radius) || 24);
      game.groundEllipse3D(
        building.x,
        building.y,
        radius + 6,
        (radius + 6) * 0.72,
        Number(building.rotation) || 0,
        null,
        color,
        2.25,
      );
      return true;
    }
    return false;
  };

  for (const name of ['setSelection', 'selectAt', 'selectRect', 'clearSelection']) {
    const base = Game.prototype[name];
    if (typeof base !== 'function') continue;
    Game.prototype[name] = function buildingSelectionOwned196(...args) {
      const result = base.apply(this, args);
      enforceSelectionOwner(this);
      return result;
    };
    Object.defineProperty(Game.prototype[name], '__fdBuildingSelectionOwner196', { value: true });
  }

  const baseRender = Game.prototype.render;
  if (typeof baseRender === 'function') {
    Game.prototype.render = function renderWithSingleBuildingSelection196(...args) {
      const fullSelection = canonicalizeSelected(this);
      const buildings = fullSelection.filter(entity => entity?.alive && entity.kind === 'building');
      clearBuildingVisualFlags(this);

      // Some historical selection renderers never consult building.selected;
      // they iterate game.selected and repaint a highlighted/high-detail model
      // directly. That bypassed build 195's drawBuilding3D guard and produced
      // the larger second copy reported by the player. Hide only buildings from
      // the render-time selection list, then restore the authoritative list in
      // the same frame. Commands/UI outside render continue to see the selection.
      if (buildings.length) {
        this.selected = fullSelection.filter(entity => entity?.kind !== 'building');
        state.renderSelectionMasks += 1;
      }

      let result;
      try {
        result = baseRender.apply(this, args);
        return result;
      } finally {
        this.selected = fullSelection;
        clearBuildingVisualFlags(this);
        state.lastSelectedIds = fullSelection.map(entity => entity?.id).filter(Boolean);
        if (buildings.length) {
          state.overlayFrames += 1;
          for (const building of buildings) {
            if (drawBuildingSelection(this, building)) state.overlayDraws += 1;
          }
        }
      }
    };
    Object.defineProperty(Game.prototype.render, '__fdBuildingSelectionOwner196', { value: true });
  }

  root.__FD_BUILDING_SELECTION_OWNER_196__ = {
    version: VERSION,
    build: BUILD,
    state,
    enforce: () => {
      const game = D?.game;
      if (game) enforceSelectionOwner(game);
      return game || null;
    },
  };
})();
