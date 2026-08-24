(() => {
  'use strict';

  const root = globalThis;
  const D = root.__FD_DEBUG__;
  const Game = D?.Game;
  if (typeof document === 'undefined' || !Game?.prototype || root.__FD_BUILDING_SELECTION_193__) return;

  const VERSION = '16.8.9';
  const BUILD = 193;
  const clamp193 = (value, min, max) => Math.max(min, Math.min(max, value));
  const state = {
    clicks: 0,
    directSelections: 0,
    duplicateSelectionIdsPrevented: 0,
    duplicateBuildingDrawsPrevented: 0,
    selectedBuildingRenderFlagsNeutralized: 0,
    selectionOverlayDraws: 0,
    lastBuildingId: null,
    lastBoundsSource: null,
    lastHitCount: 0,
    lastPointerSource: null,
    lastPointerScaleX: 1,
    lastPointerScaleY: 1,
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

  // Pointer events are expressed in CSS pixels while the game canvas is drawn
  // at native backing-store resolution. On Retina/iPad that backing store is
  // typically 2x in both dimensions. Legacy worldX/worldY therefore project
  // back to half-sized screen coordinates. Recover the original pointer from
  // the live input state and explicitly scale CSS -> canvas pixels whenever the
  // selectAt arguments came from that same physical pointer event.
  const selectionPointer193 = (game, worldX, worldY) => {
    const projected = game.worldToScreen(worldX, worldY, 0);
    const mouse = game.input?.mouse;
    const canvas = document.getElementById('game-canvas');
    const rect = canvas?.getBoundingClientRect?.();
    const inputWorldMatches = mouse && Number.isFinite(mouse.worldX) && Number.isFinite(mouse.worldY) &&
      Number.isFinite(worldX) && Number.isFinite(worldY) &&
      Math.hypot(mouse.worldX - worldX, mouse.worldY - worldY) < 0.5;

    if (!inputWorldMatches || !Number.isFinite(mouse?.x) || !Number.isFinite(mouse?.y) ||
        !canvas || !rect || rect.width <= 0 || rect.height <= 0) {
      state.lastPointerSource = 'world-projection';
      state.lastPointerScaleX = 1;
      state.lastPointerScaleY = 1;
      return { ...projected, source: 'world-projection', scaleX: 1, scaleY: 1 };
    }

    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    let cssX = mouse.x;
    let cssY = mouse.y;
    // Input normally stores canvas-relative CSS coordinates. If a browser or a
    // future input owner stores client coordinates instead, detect that by the
    // range and remove the canvas offset before scaling.
    if (cssX < -1 || cssX > rect.width + 1 || cssY < -1 || cssY > rect.height + 1) {
      cssX -= rect.left;
      cssY -= rect.top;
    }
    const pointer = {
      x: cssX * scaleX,
      y: cssY * scaleY,
      source: 'input-css-scaled',
      scaleX,
      scaleY,
    };
    state.lastPointerSource = pointer.source;
    state.lastPointerScaleX = scaleX;
    state.lastPointerScaleY = scaleY;
    return pointer;
  };

  Game.prototype.getSelectionPointerScreen193 = function(worldX, worldY) {
    return selectionPointer193(this, worldX, worldY);
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
    const pointer = selectionPointer193(this, worldX, worldY);
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

  // v140 already selects units by their visible sprite, but its pointer was
  // derived from the same Retina-misaligned world coordinates. Replace only
  // the hit list calculation; v140's click cycling, double click and selection
  // semantics continue to run unchanged through the captured base selectAt.
  const baseUnitFigureHits140 = Game.prototype.getUnitFigureHits140;
  if (typeof baseUnitFigureHits140 === 'function' && typeof Game.prototype.getUnitFigureScreenBounds140 === 'function') {
    Game.prototype.getUnitFigureHits140 = function retinaSafeUnitFigureHits193(worldX, worldY) {
      const pointer = selectionPointer193(this, worldX, worldY);
      const hits = [];
      for (const unit of this.units || []) {
        if (!unit?.alive || unit.embarkedIn) continue;
        if (unit.team === 'enemy' && !this.isTargetableBy?.(unit, 'player')) continue;
        const bounds = this.getUnitFigureScreenBounds140(unit);
        if (!bounds) continue;
        const width = Math.max(1, bounds.x2 - bounds.x1);
        const height = Math.max(1, bounds.y2 - bounds.y1);
        const pad = clamp193(Math.min(width, height) * 0.045, 2, unit.air ? 7 : 5);
        if (pointer.x < bounds.x1 - pad || pointer.x > bounds.x2 + pad ||
            pointer.y < bounds.y1 - pad || pointer.y > bounds.y2 + pad) continue;
        const centerX = (bounds.x1 + bounds.x2) * 0.5;
        const centerY = (bounds.y1 + bounds.y2) * 0.5;
        const nx = (pointer.x - centerX) / Math.max(1, width * 0.5 + pad);
        const ny = (pointer.y - centerY) / Math.max(1, height * 0.5 + pad);
        hits.push({ unit, bounds, score: nx * nx + ny * ny, area: width * height });
      }
      hits.sort((left, right) => left.score - right.score || left.area - right.area ||
        String(left.unit.id).localeCompare(String(right.unit.id)));
      return hits;
    };
    Object.defineProperty(Game.prototype.getUnitFigureHits140, '__fdRetinaSelection193', { value: true });
  }

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

  // Legacy visual layers use building.selected not only for the footprint
  // outline but also as a request to repaint a high-detail/full-size building.
  // Selection itself is already authoritative in game.selected. Temporarily
  // neutralise only the per-building visual flag during the world frame, then
  // restore it exactly so UI, commands and save state keep normal semantics.
  const neutralizeSelectedBuildingRenderFlags193 = (game) => {
    const records = [];
    const seen = new Set();
    for (const building of game.buildings || []) {
      if (!building?.selected || building.kind !== 'building') continue;
      const key = building.id || building;
      if (seen.has(key)) continue;
      seen.add(key);
      records.push({
        building,
        own: Object.prototype.hasOwnProperty.call(building, 'selected'),
        value: building.selected,
      });
      building.selected = false;
      state.selectedBuildingRenderFlagsNeutralized += 1;
    }
    return records;
  };

  const restoreSelectedBuildingRenderFlags193 = (records) => {
    for (const record of records || []) {
      if (!record?.building) continue;
      if (record.own) record.building.selected = record.value;
      else delete record.building.selected;
    }
  };

  const drawSelectionOverlay193 = (game, records) => {
    if (!records?.length) return;
    for (const record of records) {
      const building = record?.building;
      if (!allowedBuilding(game, building) || !game.isOnScreen?.(building.x, building.y, (building.radius || 24) + 180)) continue;
      const footprint = game.getEntityBuildingFootprintAt?.(building, 0);
      const color = game.teamColor?.(building.team) || '#7dd3fc';
      if (footprint?.corners?.length >= 3 && typeof game.screenPolygon === 'function') {
        const points = footprint.corners.map(point => game.worldToScreen(point.x, point.y, 0.04));
        game.screenPolygon(points, null, color, 2);
        state.selectionOverlayDraws += 1;
      } else if (typeof game.groundEllipse3D === 'function') {
        const radius = Math.max(8, Number(building.radius) || 24);
        game.groundEllipse3D(building.x, building.y, radius + 5, (radius + 5) * 0.72,
          Number(building.rotation) || 0, null, color, 2);
        state.selectionOverlayDraws += 1;
      }
    }
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
  // model/sprite draw in that frame. During that same frame, selected building
  // flags are muted so legacy selection passes cannot paint a second enlarged
  // model. A lightweight footprint outline is drawn once after the frame.
  const baseDrawBuilding = Game.prototype.drawBuilding3D;
  const baseRender = Game.prototype.render;
  if (typeof baseDrawBuilding === 'function' && typeof baseRender === 'function') {
    Game.prototype.render = function singleBuildingFrame193(...args) {
      const selectedRecords = neutralizeSelectedBuildingRenderFlags193(this);
      this._fdBuildingDrawIds193 = new Set();
      let rendered = false;
      try {
        const result = baseRender.apply(this, args);
        rendered = true;
        return result;
      } finally {
        this._fdBuildingDrawIds193 = null;
        restoreSelectedBuildingRenderFlags193(selectedRecords);
        if (rendered) drawSelectionOverlay193(this, selectedRecords);
      }
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
    pointer: (worldX, worldY) => D?.game?.getSelectionPointerScreen193?.(worldX, worldY) || null,
    bounds: building => D?.game?.getBuildingFigureScreenBounds193?.(building) || null,
  };
})();