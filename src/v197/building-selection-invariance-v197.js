(() => {
  'use strict';

  const root = globalThis;
  const D = root.__FD_DEBUG__;
  const Game = D?.Game;
  if (typeof document === 'undefined' || !Game?.prototype || root.__FD_BUILDING_SELECTION_INVARIANCE_197__) return;

  const VERSION = '16.8.13';
  const BUILD = 197;
  const SCALE_FIELDS = [
    'radius', 'visualScale', 'renderScale', 'modelScale', 'spriteScale', 'scale',
    'selectionScale', 'selectedScale', '_visualScale', '_renderScale', '_modelScale',
    '_spriteScale', '_scale', '_selectionScale', '_selectedScale',
  ];
  const baselines = new WeakMap();
  const selectedDuringRender = new Set();
  const state = {
    selectionMutationsReverted: 0,
    renderMutationsReverted: 0,
    selectedFlagsCleared: 0,
    legacyOverlaysSuppressed: 0,
    bracketOverlays: 0,
    maxScaleDelta: 0,
    lastBuildingId: null,
    lastReason: null,
  };

  const finite = value => Number.isFinite(Number(value));
  const isBuilding = entity => Boolean(entity?.alive && entity.kind === 'building');
  const keyFor = building => building?.id ?? building;

  const selectedBuildings = game => {
    const seen = new Set();
    const result = [];
    for (const entity of game?.selected || []) {
      const building = entity?.id != null ? (game.getEntity?.(entity.id) || entity) : entity;
      if (!isBuilding(building)) continue;
      const key = keyFor(building);
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(building);
    }
    return result;
  };

  const captureGeometry = building => {
    const values = {};
    for (const field of SCALE_FIELDS) {
      if (!Object.prototype.hasOwnProperty.call(building, field) || !finite(building[field])) continue;
      values[field] = Number(building[field]);
    }
    return values;
  };

  const geometryDelta = (before, after) => {
    let delta = 0;
    const fields = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
    for (const field of fields) {
      const left = Number(before?.[field]);
      const right = Number(after?.[field]);
      if (!Number.isFinite(left) || !Number.isFinite(right)) continue;
      delta = Math.max(delta, Math.abs(left - right));
    }
    return delta;
  };

  const rememberUnselectedGeometry = (game, building) => {
    if (!isBuilding(building)) return;
    const selected = selectedBuildings(game).some(item => keyFor(item) === keyFor(building));
    if (selected || building.selected) return;
    baselines.set(building, captureGeometry(building));
  };

  const ensureBaseline = (game, building) => {
    if (!baselines.has(building)) baselines.set(building, captureGeometry(building));
    return baselines.get(building) || {};
  };

  const clearSelectedFlag = building => {
    if (!building || building.selected === false) return;
    try {
      building.selected = false;
      state.selectedFlagsCleared += 1;
    } catch (_) {}
  };

  const restoreGeometry = (game, building, reason = 'selection') => {
    if (!isBuilding(building)) return 0;
    const baseline = ensureBaseline(game, building);
    const before = captureGeometry(building);
    let reverted = 0;
    for (const [field, value] of Object.entries(baseline)) {
      if (!finite(building[field]) || Number(building[field]) === value) continue;
      try {
        building[field] = value;
        reverted += 1;
      } catch (_) {}
    }
    clearSelectedFlag(building);
    const after = captureGeometry(building);
    const delta = geometryDelta(before, after);
    state.maxScaleDelta = Math.max(state.maxScaleDelta, delta);
    if (reverted) {
      if (reason === 'render') state.renderMutationsReverted += reverted;
      else state.selectionMutationsReverted += reverted;
      state.lastBuildingId = building.id || null;
      state.lastReason = reason;
    }
    return reverted;
  };

  const enforce = (game, reason = 'selection') => {
    if (!game) return [];
    const chosen = selectedBuildings(game);
    const selectedIds = new Set(chosen.map(keyFor));
    for (const building of game.buildings || []) {
      if (!isBuilding(building)) continue;
      if (selectedIds.has(keyFor(building))) restoreGeometry(game, building, reason);
      else rememberUnselectedGeometry(game, building);
      clearSelectedFlag(building);
    }
    root.__FD_BUILDING_SELECTION_OWNER_196__?.enforce?.();
    for (const building of chosen) restoreGeometry(game, building, reason);
    return chosen;
  };

  const canvasContext = game => {
    const direct = game?.ctx || game?.context;
    if (direct?.save && direct?.stroke) return direct;
    const canvas = document.getElementById('game-canvas') || game?.canvas;
    try { return canvas?.getContext?.('2d') || null; } catch (_) { return null; }
  };

  const figureBounds = (game, building) => {
    try {
      return game.getBuildingFigureScreenBounds193?.(building) ||
        root.__FD_BUILDING_SELECTION_193__?.getBuildingFigureScreenBounds?.(game, building) || null;
    } catch (_) {
      return null;
    }
  };

  const drawBracketOverlay = (game, building) => {
    const ctx = canvasContext(game);
    const bounds = figureBounds(game, building);
    if (!ctx || !bounds) return false;
    const canvas = document.getElementById('game-canvas') || game?.canvas;
    const dpr = Math.max(1, Number(canvas?.width) / Math.max(1, Number(canvas?.clientWidth) || Number(canvas?.width) || 1));
    const margin = 4 * dpr;
    const corner = Math.max(8 * dpr, Math.min(bounds.width, bounds.height) * 0.17);
    const x1 = bounds.x1 - margin;
    const y1 = bounds.y1 - margin;
    const x2 = bounds.x2 + margin;
    const y2 = bounds.y2 + margin;
    const color = game.teamColor?.(building.team) || '#54f0a2';

    ctx.save();
    try {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 0.95;
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1.5, 1.7 * dpr);
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x1 + corner, y1); ctx.lineTo(x1, y1); ctx.lineTo(x1, y1 + corner);
      ctx.moveTo(x2 - corner, y1); ctx.lineTo(x2, y1); ctx.lineTo(x2, y1 + corner);
      ctx.moveTo(x1, y2 - corner); ctx.lineTo(x1, y2); ctx.lineTo(x1 + corner, y2);
      ctx.moveTo(x2 - corner, y2); ctx.lineTo(x2, y2); ctx.lineTo(x2, y2 - corner);
      ctx.stroke();
      state.bracketOverlays += 1;
      return true;
    } finally {
      ctx.restore();
    }
  };

  const wrapSelectionMethod = name => {
    const original = Game.prototype[name];
    if (typeof original !== 'function' || original.__fdBuildingInvariance197) return;
    const wrapped = function buildingInvariantSelection197(...args) {
      for (const building of this.buildings || []) rememberUnselectedGeometry(this, building);
      const result = original.apply(this, args);
      enforce(this, name);
      queueMicrotask(() => enforce(this, `${name}-microtask`));
      return result;
    };
    Object.defineProperty(wrapped, '__fdBuildingInvariance197', { value: true });
    Game.prototype[name] = wrapped;
  };

  for (const method of ['setSelection', 'selectAt', 'clearSelection']) wrapSelectionMethod(method);

  const baseDrawBuilding = Game.prototype.drawBuilding3D;
  if (typeof baseDrawBuilding === 'function') {
    Game.prototype.drawBuilding3D = function invariantBuildingDraw197(building, ...rest) {
      const selected = selectedDuringRender.has(keyFor(building)) || selectedBuildings(this).some(item => keyFor(item) === keyFor(building));
      if (!selected) rememberUnselectedGeometry(this, building);
      else restoreGeometry(this, building, 'render');
      clearSelectedFlag(building);
      const result = baseDrawBuilding.call(this, building, ...rest);
      if (selected) restoreGeometry(this, building, 'render');
      return result;
    };
    Object.defineProperty(Game.prototype.drawBuilding3D, '__fdBuildingInvariance197', { value: true });
  }

  const baseRender = Game.prototype.render;
  if (typeof baseRender === 'function') {
    Game.prototype.render = function invariantBuildingRender197(...args) {
      const fullSelection = Array.isArray(this.selected) ? [...this.selected] : [];
      const chosen = enforce(this, 'pre-render');
      selectedDuringRender.clear();
      for (const building of chosen) selectedDuringRender.add(keyFor(building));
      this.selected = fullSelection.filter(entity => !isBuilding(entity));

      const legacy = root.__FD_BUILDING_SELECTION_193__;
      let legacyDraw = null;
      let suppressed = false;
      if (legacy && typeof legacy.drawBuildingSelection === 'function') {
        legacyDraw = legacy.drawBuildingSelection;
        try {
          legacy.drawBuildingSelection = () => false;
          suppressed = legacy.drawBuildingSelection !== legacyDraw;
          if (suppressed) state.legacyOverlaysSuppressed += 1;
        } catch (_) {}
      }

      let result;
      try {
        result = baseRender.apply(this, args);
      } finally {
        if (legacyDraw && suppressed) {
          try { legacy.drawBuildingSelection = legacyDraw; } catch (_) {}
        }
        this.selected = fullSelection;
        for (const building of chosen) restoreGeometry(this, building, 'render');
        selectedDuringRender.clear();
      }

      for (const building of chosen) {
        if (!building?.alive) continue;
        if (this.isOnScreen && !this.isOnScreen(building.x, building.y, (building.radius || 24) + 160)) continue;
        drawBracketOverlay(this, building);
      }
      return result;
    };
    Object.defineProperty(Game.prototype.render, '__fdBuildingInvariance197', { value: true });
  }

  root.__FD_BUILDING_SELECTION_INVARIANCE_197__ = {
    version: VERSION,
    build: BUILD,
    state,
    enforce: () => enforce(D?.game, 'external'),
    selectedBuildings: () => selectedBuildings(D?.game),
    geometrySignature: building => captureGeometry(building),
    geometryDelta,
  };
})();
