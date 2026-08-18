(() => {
  'use strict';

  const root = globalThis;
  const D = root.__FD_DEBUG__;
  const Game = D?.Game;
  if (typeof document === 'undefined' || !Game?.prototype || root.__FD_BUILDING_SELECTION_193__) return;

  const VERSION = '16.8.9';
  const BUILD = 193;
  const state = {
    clicks: 0,
    directSelections: 0,
    duplicateSelectionIdsPrevented: 0,
    duplicateBuildingDrawsPrevented: 0,
    lastBuildingId: null,
    lastBoundsSource: null,
    lastHitCount: 0,
  };

  const pilotModel = (building) => {
    const pilot = root.__FD_MODEL_PILOT__;
    const code = pilot?.modelForType?.(building?.typeId, 'building');
    if (!code) return null;
    return pilot?.manifest?.models?.find?.(model => model?.code === code) || null;
  };

  const allowedBuilding = (game, building) => {
    if (!building?.alive || building.kind !== 'building') return false;
    if (building.team === 'enemy' && !game.isVisibleAt?.(building.x, building.y)) return false;
    if (building.team === 'neutral' && !game.isExploredAt?.(building.x, building.y)) return false;
    return true;
  };

  Game.prototype.getBuildingFigureScreenBounds193 = function(building) {
    if (!allowedBuilding(this, building)) return null;
    const center = this.worldToScreen(building.x, building.y, 0);
    const zoom = Math.max(0.05, Number(this.camera?.zoom) || 1);
    const radius = Math.max(1, Number(building.radius) || Number(building.stats?.radius) || 24) *
      Math.max(0.1, Number(building.stats?.visualScale) || 1);
    const model = pilotModel(building);
    const sprite = model?.canvasSprite || null;

    let x1 = Infinity;
    let y1 = Infinity;
    let x2 = -Infinity;
    let y2 = -Infinity;
    let source = 'projected-footprint';

    if (sprite) {
      const width = radius * zoom * (Number(sprite.worldWidthFactor) || 3.2) * 1.34;
      const aspect = Math.max(0.2, Number(sprite.cellHeight) || 384) /
        Math.max(1, Number(sprite.cellWidth) || 512);
      const height = width * aspect;
      const anchorX = Number.isFinite(sprite.anchorX) ? sprite.anchorX : 0.5;
      const baseline = Number.isFinite(sprite.groundBaseline) ? sprite.groundBaseline : 0.79;
      x1 = center.x - width * anchorX;
      x2 = center.x + width * (1 - anchorX);
      y1 = center.y - height * baseline;
      y2 = center.y + height * (1 - baseline);
      source = 'approved-sprite';
    }

    const footprint = this.getEntityBuildingFootprintAt?.(building, 0);
    if (footprint?.corners?.length) {
      const height = Math.max(1, Number(footprint.height) || radius * 1.45);
      const projected = [];
      for (const corner of footprint.corners) {
        projected.push(this.worldToScreen(corner.x, corner.y, 0));
        projected.push(this.worldToScreen(corner.x, corner.y, height));
      }
      for (const point of projected) {
        x1 = Math.min(x1, point.x);
        y1 = Math.min(y1, point.y);
        x2 = Math.max(x2, point.x);
        y2 = Math.max(y2, point.y);
      }
      if (!sprite) source = 'projected-footprint';
    }

    if (![x1, y1, x2, y2].every(Number.isFinite)) {
      const halfW = Math.max(10, radius * zoom * 1.6);
      const halfH = Math.max(10, radius * zoom * 1.15);
      x1 = center.x - halfW;
      x2 = center.x + halfW;
      y1 = center.y - halfH * 1.45;
      y2 = center.y + halfH * 0.55;
      source = 'radius-fallback';
    }

    return {
      building,
      x1, y1, x2, y2,
      width: Math.max(1, x2 - x1),
      height: Math.max(1, y2 - y1),
      source,
    };
  };

  Game.prototype.getBuildingFigureHits193 = function(worldX, worldY) {
    const pointer = this.worldToScreen(worldX, worldY, 0);
    const touch = document.documentElement.classList.contains('fd-touch') || navigator.maxTouchPoints > 0;
    const hits = [];
    for (const building of this.buildings || []) {
      if (!allowedBuilding(this, building)) continue;
      const bounds = this.getBuildingFigureScreenBounds193(building);
      if (!bounds) continue;
      const pad = touch ? 14 : 7;
      if (pointer.x < bounds.x1 - pad || pointer.x > bounds.x2 + pad ||
          pointer.y < bounds.y1 - pad || pointer.y > bounds.y2 + pad) continue;
      const cx = (bounds.x1 + bounds.x2) * 0.5;
      const cy = (bounds.y1 + bounds.y2) * 0.5;
      const nx = (pointer.x - cx) / Math.max(1, bounds.width * 0.5 + pad);
      const ny = (pointer.y - cy) / Math.max(1, bounds.height * 0.5 + pad);
      const depth = this.worldToScreen(building.x, building.y, 0).y;
      hits.push({ building, bounds, score: nx * nx + ny * ny, depth });
    }
    hits.sort((a, b) => b.depth - a.depth || a.score - b.score ||
      String(a.building.id).localeCompare(String(b.building.id)));
    state.lastHitCount = hits.length;
    return hits;
  };

  const dedupeSelected193 = (game) => {
    if (!Array.isArray(game.selected) || game.selected.length < 2) return;
    const seen = new Set();
    const unique = [];
    for (const entity of game.selected) {
      const key = entity?.id || entity;
      if (seen.has(key)) {
        state.duplicateSelectionIdsPrevented += 1;
        continue;
      }
      seen.add(key);
      unique.push(entity);
    }
    if (unique.length !== game.selected.length) game.selected = unique;
  };

  const baseSelectAt = Game.prototype.selectAt;
  Game.prototype.selectAt = function buildingFirstSelect193(worldX, worldY, additive = false) {
    state.clicks += 1;

    let unitHit = null;
    try { unitHit = this.getUnitFigureHits140?.(worldX, worldY)?.[0]?.unit || null; } catch (_) {}
    if (unitHit) {
      const result = baseSelectAt.call(this, worldX, worldY, additive);
      dedupeSelected193(this);
      return result;
    }

    const hit = this.getBuildingFigureHits193(worldX, worldY)[0] || null;
    if (!hit) {
      const result = baseSelectAt.call(this, worldX, worldY, additive);
      dedupeSelected193(this);
      return result;
    }

    const building = hit.building;
    this._figureClickCycle140 = null;
    if (this.input) this.input.lastClick = {
      time: typeof performance !== 'undefined' ? performance.now() : Date.now(),
      typeId: building.typeId,
      kind: 'building',
    };
    this.setSelection?.([building], Boolean(additive));
    dedupeSelected193(this);
    building.selected = true;
    this.uiDirty = true;
    this.sound?.click?.();
    state.directSelections += 1;
    state.lastBuildingId = building.id || null;
    state.lastBoundsSource = hit.bounds.source;
    return building;
  };
  Object.defineProperty(Game.prototype.selectAt, '__fdBuildingSelection193', { value: true });

  // Guard the entire render frame rather than only drawWorldObjects3D. Some
  // compatibility/selection renderers can ask for a building again after the
  // normal world pass; the same building id must still have only one full
  // model/sprite draw in that frame.
  const baseDrawBuilding = Game.prototype.drawBuilding3D;
  const baseRender = Game.prototype.render;
  if (typeof baseDrawBuilding === 'function' && typeof baseRender === 'function') {
    Game.prototype.render = function singleBuildingFrame193(...args) {
      this._fdBuildingDrawIds193 = new Set();
      try { return baseRender.apply(this, args); }
      finally { this._fdBuildingDrawIds193 = null; }
    };
    Game.prototype.drawBuilding3D = function singleBuildingDraw193(building, ...rest) {
      const ids = this._fdBuildingDrawIds193;
      const key = building?.id || building;
      if (ids && ids.has(key)) {
        state.duplicateBuildingDrawsPrevented += 1;
        return;
      }
      if (ids) ids.add(key);
      return baseDrawBuilding.call(this, building, ...rest);
    };
    Object.defineProperty(Game.prototype.drawBuilding3D, '__fdBuildingSingleDraw193', { value: true });
  }

  root.__FD_BUILDING_SELECTION_193__ = {
    version: VERSION,
    build: BUILD,
    state,
    bounds: building => D?.game?.getBuildingFigureScreenBounds193?.(building) || null,
  };
})();
