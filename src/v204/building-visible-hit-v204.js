(() => {
  'use strict';

  if (typeof document === 'undefined') return;
  const root = globalThis;
  const D = root.__FD_DEBUG__;
  const Game = D?.Game;
  const Context = root.CanvasRenderingContext2D;
  if (!Game?.prototype || !Context?.prototype || root.__FD_BUILDING_VISIBLE_HIT_204__) return;

  const VERSION = '16.8.20';
  const BUILD = 204;
  const state = {
    frames: 0,
    readyFrames: 0,
    capturedSprites: 0,
    pixelQueries: 0,
    pixelHits: 0,
    transparentMisses: 0,
    broadHitsFiltered: 0,
    recoveredVisibleHits: 0,
    readErrors: 0,
    lastBuildingId: null,
    lastPointer: null,
  };

  let gameCanvas = null;
  let pickCanvas = null;
  let scratchCanvas = null;
  let pickContext = null;
  let scratchContext = null;
  let activeBuilding = null;
  let activeCode = 0;
  let nextCode = 1;
  let frameReady = false;
  let buildingByCode = [];
  let codeByBuildingId = new Map();

  const finite = value => Number.isFinite(Number(value));
  const sourcePath = image => {
    const raw = String(image?.currentSrc || image?.src || image?.dataset?.src || '');
    if (!raw) return '';
    try { return new URL(raw, document.baseURI || root.location?.href || 'http://localhost/').pathname.toLowerCase(); }
    catch (_) { return raw.split(/[?#]/, 1)[0].toLowerCase(); }
  };
  const isBuildingAtlas = path => /\/models\/canvas\/b-[a-z0-9-]+-views\.webp$/i.test(path);

  const ensureBuffers = canvas => {
    if (!canvas) return false;
    if (!pickCanvas) {
      pickCanvas = document.createElement('canvas');
      scratchCanvas = document.createElement('canvas');
      pickContext = pickCanvas.getContext('2d', { willReadFrequently: true });
      scratchContext = scratchCanvas.getContext('2d');
    }
    for (const buffer of [pickCanvas, scratchCanvas]) {
      if (buffer.width !== canvas.width || buffer.height !== canvas.height) {
        buffer.width = canvas.width;
        buffer.height = canvas.height;
        frameReady = false;
      }
    }
    return Boolean(pickContext && scratchContext);
  };

  const destinationRect = args => {
    if (args.length >= 8) return { x: Number(args[4]), y: Number(args[5]), width: Number(args[6]), height: Number(args[7]) };
    if (args.length >= 4) return { x: Number(args[0]), y: Number(args[1]), width: Number(args[2]), height: Number(args[3]) };
    return null;
  };

  const transformedBounds = (context, rect) => {
    if (!rect || ![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite)) return null;
    const matrix = context.getTransform?.();
    if (!matrix) return null;
    const transform = (x, y) => matrix.transformPoint
      ? matrix.transformPoint({ x, y })
      : { x: matrix.a * x + matrix.c * y + matrix.e, y: matrix.b * x + matrix.d * y + matrix.f };
    const points = [
      transform(rect.x, rect.y),
      transform(rect.x + rect.width, rect.y),
      transform(rect.x, rect.y + rect.height),
      transform(rect.x + rect.width, rect.y + rect.height),
    ];
    return {
      x1: Math.max(0, Math.floor(Math.min(...points.map(point => point.x)) - 2)),
      y1: Math.max(0, Math.floor(Math.min(...points.map(point => point.y)) - 2)),
      x2: Math.min(gameCanvas.width, Math.ceil(Math.max(...points.map(point => point.x)) + 2)),
      y2: Math.min(gameCanvas.height, Math.ceil(Math.max(...points.map(point => point.y)) + 2)),
    };
  };

  const clearRegion = (context, bounds) => {
    if (!context || !bounds) return;
    context.save();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.globalCompositeOperation = 'copy';
    context.clearRect(bounds.x1, bounds.y1, Math.max(0, bounds.x2 - bounds.x1), Math.max(0, bounds.y2 - bounds.y1));
    context.restore();
  };

  const colorForCode = code => `rgb(${code & 255},${(code >> 8) & 255},${(code >> 16) & 255})`;
  const codeForBuilding = building => {
    const id = String(building?.id ?? '');
    let code = codeByBuildingId.get(id);
    if (!code) {
      code = nextCode++;
      if (code > 0xfffffe) return 0;
      codeByBuildingId.set(id, code);
    }
    buildingByCode[code] = building;
    return code;
  };

  const baseDrawImage = Context.prototype.drawImage;
  Context.prototype.drawImage = function visibleBuildingPickPixels204(image, ...args) {
    if (activeBuilding && activeCode && this.canvas === gameCanvas && isBuildingAtlas(sourcePath(image)) && ensureBuffers(gameCanvas)) {
      const bounds = transformedBounds(this, destinationRect(args));
      if (bounds && bounds.x2 > bounds.x1 && bounds.y2 > bounds.y1) {
        clearRegion(scratchContext, bounds);
        const transform = this.getTransform?.();
        scratchContext.save();
        try {
          scratchContext.setTransform(transform || { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
          scratchContext.globalAlpha = finite(this.globalAlpha) ? Number(this.globalAlpha) : 1;
          scratchContext.globalCompositeOperation = 'source-over';
          scratchContext.imageSmoothingEnabled = this.imageSmoothingEnabled;
          scratchContext.imageSmoothingQuality = this.imageSmoothingQuality;
          baseDrawImage.call(scratchContext, image, ...args);
        } finally {
          scratchContext.restore();
        }

        scratchContext.save();
        scratchContext.setTransform(1, 0, 0, 1, 0, 0);
        scratchContext.globalCompositeOperation = 'source-in';
        scratchContext.fillStyle = colorForCode(activeCode);
        scratchContext.fillRect(bounds.x1, bounds.y1, bounds.x2 - bounds.x1, bounds.y2 - bounds.y1);
        scratchContext.restore();

        pickContext.save();
        pickContext.setTransform(1, 0, 0, 1, 0, 0);
        pickContext.globalCompositeOperation = 'source-over';
        baseDrawImage.call(
          pickContext,
          scratchCanvas,
          bounds.x1, bounds.y1, bounds.x2 - bounds.x1, bounds.y2 - bounds.y1,
          bounds.x1, bounds.y1, bounds.x2 - bounds.x1, bounds.y2 - bounds.y1,
        );
        pickContext.restore();
        state.capturedSprites += 1;
      }
    }
    return baseDrawImage.call(this, image, ...args);
  };
  Object.defineProperty(Context.prototype.drawImage, '__fdBuildingVisibleHit204', { value: true });

  const baseDrawBuilding = Game.prototype.drawBuilding3D;
  if (typeof baseDrawBuilding === 'function') {
    Game.prototype.drawBuilding3D = function captureVisibleBuildingPixels204(building, ...rest) {
      const previousBuilding = activeBuilding;
      const previousCode = activeCode;
      activeBuilding = building?.alive ? building : null;
      activeCode = activeBuilding ? codeForBuilding(activeBuilding) : 0;
      try { return baseDrawBuilding.call(this, building, ...rest); }
      finally {
        activeBuilding = previousBuilding;
        activeCode = previousCode;
      }
    };
    Object.defineProperty(Game.prototype.drawBuilding3D, '__fdBuildingVisibleHit204', { value: true });
  }

  const baseRender = Game.prototype.render;
  if (typeof baseRender === 'function') {
    Game.prototype.render = function renderVisibleBuildingPickFrame204(...args) {
      gameCanvas = document.getElementById('game-canvas') || this.canvas || gameCanvas;
      frameReady = false;
      buildingByCode = [];
      codeByBuildingId = new Map();
      nextCode = 1;
      state.frames += 1;
      if (gameCanvas && ensureBuffers(gameCanvas)) {
        pickContext.save();
        pickContext.setTransform(1, 0, 0, 1, 0, 0);
        pickContext.globalCompositeOperation = 'copy';
        pickContext.clearRect(0, 0, pickCanvas.width, pickCanvas.height);
        pickContext.restore();
      }
      const capturedBefore = state.capturedSprites;
      const result = baseRender.apply(this, args);
      frameReady = Boolean(gameCanvas && pickContext && state.capturedSprites > capturedBefore);
      if (frameReady) state.readyFrames += 1;
      return result;
    };
    Object.defineProperty(Game.prototype.render, '__fdBuildingVisibleHit204', { value: true });
  }

  const pointerAtWorld = (game, worldX, worldY) => {
    const point = game?.getSelectionPointerScreen193?.(worldX, worldY) || game?.worldToScreen?.(worldX, worldY, 0);
    return finite(point?.x) && finite(point?.y) ? { x: Number(point.x), y: Number(point.y) } : null;
  };

  const pickAtCanvas = (canvasX, canvasY) => {
    state.pixelQueries += 1;
    if (!frameReady || !pickContext || !pickCanvas || !finite(canvasX) || !finite(canvasY)) return null;
    const x = Math.round(Number(canvasX));
    const y = Math.round(Number(canvasY));
    state.lastPointer = { x, y };
    if (x < 0 || y < 0 || x >= pickCanvas.width || y >= pickCanvas.height) return null;
    try {
      const pixel = pickContext.getImageData(x, y, 1, 1).data;
      if (pixel[3] < 18) {
        state.transparentMisses += 1;
        return null;
      }
      const code = pixel[0] | (pixel[1] << 8) | (pixel[2] << 16);
      const building = buildingByCode[code] || null;
      if (building?.alive) {
        state.pixelHits += 1;
        state.lastBuildingId = building.id || null;
        return building;
      }
      return null;
    } catch (_) {
      state.readErrors += 1;
      return null;
    }
  };

  const pickAtWorld = (game, worldX, worldY) => {
    const pointer = pointerAtWorld(game, worldX, worldY);
    return pointer ? pickAtCanvas(pointer.x, pointer.y) : null;
  };

  const baseFigureHits = Game.prototype.getBuildingFigureHits193;
  if (typeof baseFigureHits === 'function') {
    Game.prototype.getBuildingFigureHits193 = function visiblePixelBuildingHits204(worldX, worldY, ...rest) {
      const legacyHits = baseFigureHits.call(this, worldX, worldY, ...rest) || [];
      if (!frameReady) return legacyHits;
      const building = pickAtWorld(this, worldX, worldY);
      if (!building) {
        state.broadHitsFiltered += legacyHits.length;
        return [];
      }
      const existing = legacyHits.find(hit => String(hit?.building?.id) === String(building.id));
      if (existing) return [existing];
      state.recoveredVisibleHits += 1;
      const bounds = this.getBuildingFigureScreenBounds193?.(building) || null;
      return [{
        building,
        bounds: bounds || { source: 'visible-pixel-buffer' },
        score: 0,
        depth: this.worldToScreen?.(building.x, building.y, 0)?.y || 0,
      }];
    };
    Object.defineProperty(Game.prototype.getBuildingFigureHits193, '__fdBuildingVisibleHit204', { value: true });
  }

  const wrapHitTest = name => {
    const base = Game.prototype[name];
    if (typeof base !== 'function') return;
    Game.prototype[name] = function visiblePixelHitTest204(worldX, worldY, ...rest) {
      const legacyHit = base.call(this, worldX, worldY, ...rest);
      if (!frameReady) return legacyHit;
      const building = pickAtWorld(this, worldX, worldY);
      if (legacyHit?.kind === 'unit') return legacyHit;
      if (building) {
        if (legacyHit !== building) state.recoveredVisibleHits += 1;
        return building;
      }
      if (legacyHit?.kind === 'building') {
        state.broadHitsFiltered += 1;
        return null;
      }
      return legacyHit;
    };
    Object.defineProperty(Game.prototype[name], '__fdBuildingVisibleHit204', { value: true });
  };

  wrapHitTest('hitTest');
  wrapHitTest('hitTestForContext');

  root.__FD_BUILDING_VISIBLE_HIT_204__ = {
    version: VERSION,
    build: BUILD,
    state,
    pickAtCanvas,
    pickAtWorld: (worldX, worldY, game = D?.game) => pickAtWorld(game, worldX, worldY),
    diagnostics: () => ({
      ...state,
      frameReady,
      lastPointer: state.lastPointer ? { ...state.lastPointer } : null,
    }),
  };
})();
