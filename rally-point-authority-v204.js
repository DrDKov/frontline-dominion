(() => {
  'use strict';

  if (typeof document === 'undefined') return;
  const root = globalThis;
  if (root.__FD_RALLY_POINT_AUTHORITY_204__) return;

  const VERSION = '16.8.20';
  const BUILD = 204;
  const D = root.__FD_DEBUG__;
  const Game = D?.Game;
  const input = root.__FD_COMMAND_INPUT_190__;
  if (!Game?.prototype || typeof input?.route !== 'function') return;

  const state = {
    installed: false,
    rallyRoutes: 0,
    rejectedRoutes: 0,
    routeErrors: 0,
    flagFrames: 0,
    legacyFlagPassesSuppressed: 0,
    lastSource: null,
    lastBuildingId: null,
    lastWorld: null,
    lastFlagPoint: null,
  };

  const finite = value => Number.isFinite(Number(value));
  const selectedProductionBuilding = game => {
    const selected = (Array.isArray(game?.selected) ? game.selected : []).filter(entity => entity?.alive !== false);
    if (selected.length !== 1 || game?.getSelectedUnits?.()?.length) return null;
    const building = selected[0];
    return building?.kind === 'building' && building.team === 'player' && building.completed &&
      Array.isArray(building.stats?.produces) && building.stats.produces.length
      ? building
      : null;
  };

  const worldAt = (game, clientX, clientY) => {
    const canvas = document.getElementById('game-canvas');
    const rect = canvas?.getBoundingClientRect?.();
    if (!canvas || !rect?.width || !rect?.height || !finite(clientX) || !finite(clientY)) return null;
    const screenX = (Number(clientX) - rect.left) * (canvas.width || rect.width) / rect.width;
    const screenY = (Number(clientY) - rect.top) * (canvas.height || rect.height) / rect.height;
    let point = null;
    try { point = game.screenToWorld?.(screenX, screenY, 0) || game.screenToWorld?.(screenX, screenY); }
    catch (_) { return null; }
    return finite(point?.x) && finite(point?.y) ? { x: Number(point.x), y: Number(point.y) } : null;
  };

  const baseRoute = input.route;
  const rallyRoute = function rallyPointRoute204(clientX, clientY, source, append = false) {
    const game = D?.game;
    const targetingMode = Boolean(game?.commandMode || game?.buildMode || game?.powerMode || game?.strategicMode);
    const building = !targetingMode ? selectedProductionBuilding(game) : null;
    if (!game || game.ended || !building) return baseRoute.call(this, clientX, clientY, source, append);

    const point = worldAt(game, clientX, clientY);
    if (!point) return baseRoute.call(this, clientX, clientY, source, append);

    let result = false;
    try {
      result = game.setRallyPoint91?.(building.id, point.x, point.y);
    } catch (error) {
      state.routeErrors += 1;
      console.error('[FD204] rally point route failed', error);
      return false;
    }
    if (result === false) {
      state.rejectedRoutes += 1;
      return false;
    }

    game._v91LastCanvasOrderAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
    state.rallyRoutes += 1;
    state.lastSource = source || null;
    state.lastBuildingId = building.id;
    state.lastWorld = { ...point };
    return true;
  };
  Object.defineProperty(rallyRoute, '__fdRallyPointAuthority204', { value: true });
  input.route = rallyRoute;

  // Historical selection owners deliberately neutralise building.selected
  // while the world is rendered. The old rally renderer used that visual flag,
  // so it could not draw even though game.selected still contained the
  // production building. Suppress that stale pass and draw once, after every
  // selection owner has restored the authoritative selection list.
  if (typeof Game.prototype.drawRallyFlags80 === 'function') {
    Game.prototype.drawRallyFlags80 = function suppressLegacyRallyFlags204() {
      state.legacyFlagPassesSuppressed += 1;
    };
    Object.defineProperty(Game.prototype.drawRallyFlags80, '__fdRallyPointAuthority204', { value: true });
  }

  Game.prototype.drawRallyFlags204 = function drawRallyFlags204() {
    const canvas = document.getElementById('game-canvas') || this.canvas;
    const context = canvas?.getContext?.('2d');
    if (!context) return 0;
    const selected = (this.selected || []).filter(entity => selectedProductionBuilding({
      selected: [entity],
      getSelectedUnits: () => [],
    }));
    let drawn = 0;
    for (const building of selected) {
      const point = building.rallyPoint;
      if (!finite(point?.x) || !finite(point?.y)) continue;
      const ground = this.worldToScreen?.(Number(point.x), Number(point.y), 0);
      const top = this.worldToScreen?.(Number(point.x), Number(point.y), 30);
      if (![ground?.x, ground?.y, top?.x, top?.y].every(finite)) continue;
      const dpr = Math.max(1, Number(canvas.width) / Math.max(1, Number(canvas.clientWidth) || Number(canvas.width)));
      context.save();
      try {
        context.globalAlpha = 0.98;
        context.strokeStyle = '#183329';
        context.lineWidth = Math.max(1.5, 1.8 * dpr);
        context.beginPath();
        context.moveTo(ground.x, ground.y + 2 * dpr);
        context.lineTo(top.x, top.y);
        context.stroke();
        context.fillStyle = '#bfffe0';
        context.beginPath();
        context.moveTo(top.x, top.y);
        context.lineTo(top.x + 13 * dpr, top.y + 5 * dpr);
        context.lineTo(top.x, top.y + 11 * dpr);
        context.closePath();
        context.fill();
        context.strokeStyle = '#45b786';
        context.lineWidth = Math.max(1, dpr);
        context.stroke();
        context.fillStyle = 'rgba(92,238,172,.24)';
        context.beginPath();
        context.arc(ground.x, ground.y, 9 * dpr, 0, Math.PI * 2);
        context.fill();
      } finally {
        context.restore();
      }
      drawn += 1;
      state.flagFrames += 1;
      state.lastFlagPoint = {
        buildingId: building.id,
        x: Number(point.x),
        y: Number(point.y),
      };
    }
    return drawn;
  };
  Object.defineProperty(Game.prototype.drawRallyFlags204, '__fdRallyPointAuthority204', { value: true });

  const baseRender = Game.prototype.render;
  if (typeof baseRender === 'function') {
    Game.prototype.render = function authoritativeRallyFlagFrame204(...args) {
      const result = baseRender.apply(this, args);
      this.drawRallyFlags204();
      return result;
    };
    Object.defineProperty(Game.prototype.render, '__fdRallyPointAuthority204', { value: true });
  }

  state.installed = true;
  root.__FD_RALLY_POINT_AUTHORITY_204__ = {
    version: VERSION,
    build: BUILD,
    selectedProductionBuilding,
    worldAt,
    diagnostics: () => ({
      ...state,
      lastWorld: state.lastWorld ? { ...state.lastWorld } : null,
      lastFlagPoint: state.lastFlagPoint ? { ...state.lastFlagPoint } : null,
    }),
  };
})();
