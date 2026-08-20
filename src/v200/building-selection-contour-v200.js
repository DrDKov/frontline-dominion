(() => {
  'use strict';

  if (typeof document === 'undefined') return;
  const root = globalThis;
  const D = root.__FD_DEBUG__;
  const Game = D?.Game;
  const Context = root.CanvasRenderingContext2D;
  if (!Game?.prototype || !Context?.prototype || root.__FD_BUILDING_SELECTION_CONTOUR_200__) return;

  const VERSION = '16.8.16';
  const BUILD = 200;
  const state = {
    frames: 0,
    selectedFrames: 0,
    capturedSprites: 0,
    outlineFrames: 0,
    lastBuildingId: null,
    lastBounds: null,
    lastColor: null,
  };

  let gameCanvas = null;
  let maskCanvas = null;
  let colorCanvas = null;
  let outlineCanvas = null;
  let maskContext = null;
  let colorContext = null;
  let outlineContext = null;
  let activeBuilding = null;
  let selectedIds = new Set();
  let frameBounds = null;
  let previousBounds = null;
  let frameColor = '#70f0bd';

  const sourcePath = image => {
    const raw = String(image?.currentSrc || image?.src || image?.dataset?.src || '');
    if (!raw) return '';
    try { return new URL(raw, document.baseURI || location.href).pathname.toLowerCase(); }
    catch (_) { return raw.split(/[?#]/, 1)[0].toLowerCase(); }
  };
  const isBuildingAtlas = path => /\/models\/canvas\/b-[a-z0-9-]+-views\.webp$/i.test(path);
  const ensureBuffers = canvas => {
    if (!canvas) return false;
    if (!maskCanvas) {
      maskCanvas = document.createElement('canvas');
      colorCanvas = document.createElement('canvas');
      outlineCanvas = document.createElement('canvas');
      maskContext = maskCanvas.getContext('2d');
      colorContext = colorCanvas.getContext('2d');
      outlineContext = outlineCanvas.getContext('2d');
    }
    for (const buffer of [maskCanvas, colorCanvas, outlineCanvas]) {
      if (buffer.width !== canvas.width || buffer.height !== canvas.height) {
        buffer.width = canvas.width;
        buffer.height = canvas.height;
        previousBounds = null;
      }
    }
    return Boolean(maskContext && colorContext && outlineContext);
  };
  const expand = (bounds, amount, canvas) => {
    if (!bounds) return null;
    const x1 = Math.max(0, Math.floor(bounds.x1 - amount));
    const y1 = Math.max(0, Math.floor(bounds.y1 - amount));
    const x2 = Math.min(canvas.width, Math.ceil(bounds.x2 + amount));
    const y2 = Math.min(canvas.height, Math.ceil(bounds.y2 + amount));
    return { x1, y1, x2, y2, width: Math.max(0, x2 - x1), height: Math.max(0, y2 - y1) };
  };
  const mergeBounds = next => {
    if (!next) return;
    if (!frameBounds) frameBounds = { ...next };
    else {
      frameBounds.x1 = Math.min(frameBounds.x1, next.x1);
      frameBounds.y1 = Math.min(frameBounds.y1, next.y1);
      frameBounds.x2 = Math.max(frameBounds.x2, next.x2);
      frameBounds.y2 = Math.max(frameBounds.y2, next.y2);
    }
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
    const points = [
      matrix.transformPoint ? matrix.transformPoint({ x: rect.x, y: rect.y }) : { x: matrix.a * rect.x + matrix.c * rect.y + matrix.e, y: matrix.b * rect.x + matrix.d * rect.y + matrix.f },
      matrix.transformPoint ? matrix.transformPoint({ x: rect.x + rect.width, y: rect.y }) : { x: matrix.a * (rect.x + rect.width) + matrix.c * rect.y + matrix.e, y: matrix.b * (rect.x + rect.width) + matrix.d * rect.y + matrix.f },
      matrix.transformPoint ? matrix.transformPoint({ x: rect.x, y: rect.y + rect.height }) : { x: matrix.a * rect.x + matrix.c * (rect.y + rect.height) + matrix.e, y: matrix.b * rect.x + matrix.d * (rect.y + rect.height) + matrix.f },
      matrix.transformPoint ? matrix.transformPoint({ x: rect.x + rect.width, y: rect.y + rect.height }) : { x: matrix.a * (rect.x + rect.width) + matrix.c * (rect.y + rect.height) + matrix.e, y: matrix.b * (rect.x + rect.width) + matrix.d * (rect.y + rect.height) + matrix.f },
    ];
    return {
      x1: Math.min(...points.map(point => point.x)),
      y1: Math.min(...points.map(point => point.y)),
      x2: Math.max(...points.map(point => point.x)),
      y2: Math.max(...points.map(point => point.y)),
    };
  };
  const clearRegion = (context, bounds) => {
    if (!context || !bounds) return;
    context.save();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.globalCompositeOperation = 'copy';
    context.clearRect(bounds.x1, bounds.y1, bounds.width, bounds.height);
    context.restore();
  };

  const baseDrawImage = Context.prototype.drawImage;
  Context.prototype.drawImage = function captureSelectedBuildingAlpha200(image, ...args) {
    if (activeBuilding && this.canvas === gameCanvas && isBuildingAtlas(sourcePath(image)) && ensureBuffers(gameCanvas)) {
      const transform = this.getTransform?.();
      maskContext.save();
      try {
        maskContext.setTransform(transform || { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
        maskContext.globalAlpha = Number.isFinite(this.globalAlpha) ? this.globalAlpha : 1;
        maskContext.globalCompositeOperation = 'source-over';
        maskContext.imageSmoothingEnabled = this.imageSmoothingEnabled;
        maskContext.imageSmoothingQuality = this.imageSmoothingQuality;
        baseDrawImage.call(maskContext, image, ...args);
        mergeBounds(transformedBounds(this, destinationRect(args)));
        state.capturedSprites += 1;
        state.lastBuildingId = activeBuilding.id || null;
      } finally {
        maskContext.restore();
      }
    }
    return baseDrawImage.call(this, image, ...args);
  };
  Object.defineProperty(Context.prototype.drawImage, '__fdBuildingSelectionContour200', { value: true });

  const baseDrawBuilding = Game.prototype.drawBuilding3D;
  if (typeof baseDrawBuilding === 'function') {
    Game.prototype.drawBuilding3D = function captureBuildingModel200(building, ...rest) {
      const selected = Boolean(building?.alive && selectedIds.has(building.id));
      if (!selected) return baseDrawBuilding.call(this, building, ...rest);
      const previous = activeBuilding;
      activeBuilding = building;
      try {
        frameColor = this.teamColor?.(building.team) || '#70f0bd';
        return baseDrawBuilding.call(this, building, ...rest);
      } finally {
        activeBuilding = previous;
      }
    };
    Object.defineProperty(Game.prototype.drawBuilding3D, '__fdBuildingSelectionContour200', { value: true });
  }

  const paintContour = game => {
    if (!frameBounds || !ensureBuffers(gameCanvas)) return false;
    const dpr = Math.max(1, Number(gameCanvas.width) / Math.max(1, Number(gameCanvas.clientWidth) || gameCanvas.width));
    const radius = Math.max(2, Math.round(2.4 * dpr));
    const bounds = expand(frameBounds, radius * 4 + 4, gameCanvas);
    if (!bounds?.width || !bounds?.height) return false;
    clearRegion(colorContext, bounds);
    clearRegion(outlineContext, bounds);

    colorContext.save();
    colorContext.setTransform(1, 0, 0, 1, 0, 0);
    colorContext.globalCompositeOperation = 'source-over';
    colorContext.drawImage(maskCanvas, bounds.x1, bounds.y1, bounds.width, bounds.height, bounds.x1, bounds.y1, bounds.width, bounds.height);
    colorContext.globalCompositeOperation = 'source-in';
    colorContext.fillStyle = frameColor;
    colorContext.fillRect(bounds.x1, bounds.y1, bounds.width, bounds.height);
    colorContext.restore();

    outlineContext.save();
    outlineContext.setTransform(1, 0, 0, 1, 0, 0);
    outlineContext.globalCompositeOperation = 'source-over';
    const offsets = [
      [-radius, 0], [radius, 0], [0, -radius], [0, radius],
      [-radius, -radius], [-radius, radius], [radius, -radius], [radius, radius],
      [-Math.ceil(radius * 1.45), 0], [Math.ceil(radius * 1.45), 0],
      [0, -Math.ceil(radius * 1.45)], [0, Math.ceil(radius * 1.45)],
    ];
    for (const [dx, dy] of offsets) {
      outlineContext.drawImage(colorCanvas, bounds.x1, bounds.y1, bounds.width, bounds.height, bounds.x1 + dx, bounds.y1 + dy, bounds.width, bounds.height);
    }
    outlineContext.globalCompositeOperation = 'destination-out';
    outlineContext.drawImage(maskCanvas, bounds.x1, bounds.y1, bounds.width, bounds.height, bounds.x1, bounds.y1, bounds.width, bounds.height);
    outlineContext.restore();

    const context = gameCanvas.getContext('2d');
    context.save();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.globalAlpha = 0.96;
    context.shadowColor = frameColor;
    context.shadowBlur = Math.max(3, 4.5 * dpr);
    context.drawImage(outlineCanvas, bounds.x1, bounds.y1, bounds.width, bounds.height, bounds.x1, bounds.y1, bounds.width, bounds.height);
    context.restore();

    state.outlineFrames += 1;
    state.lastBounds = { ...bounds };
    state.lastColor = frameColor;
    previousBounds = bounds;
    return true;
  };

  const baseRender = Game.prototype.render;
  if (typeof baseRender === 'function') {
    Game.prototype.render = function modelContourFrame200(...args) {
      gameCanvas = document.getElementById('game-canvas') || this.canvas || gameCanvas;
      selectedIds = new Set((this.selected || []).filter(entity => entity?.alive && entity.kind === 'building').map(entity => entity.id));
      state.frames += 1;
      if (selectedIds.size) state.selectedFrames += 1;
      frameBounds = null;
      if (gameCanvas && ensureBuffers(gameCanvas) && previousBounds) clearRegion(maskContext, previousBounds);
      const result = baseRender.apply(this, args);
      if (selectedIds.size) paintContour(this);
      selectedIds.clear();
      return result;
    };
    Object.defineProperty(Game.prototype.render, '__fdBuildingSelectionContour200', { value: true });
  }

  root.__FD_BUILDING_SELECTION_CONTOUR_200__ = {
    version: VERSION,
    build: BUILD,
    state,
    diagnostics: () => ({
      ...state,
      lastBounds: state.lastBounds ? { ...state.lastBounds } : null,
      exactModelAlpha: true,
      legacyBoxOverlay: false,
    }),
  };
})();
