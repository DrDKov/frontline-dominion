(() => {
  'use strict';

  if (typeof document === 'undefined') return;
  const root = globalThis;
  const D = root.__FD_DEBUG__;
  const Game = D?.Game;
  const Context = root.CanvasRenderingContext2D;
  if (!Game?.prototype || !Context?.prototype || root.__FD_BUILDING_RENDER_AUTHORITY_199__) return;

  const VERSION = '16.8.15';
  const BUILD = 199;
  const state = {
    frames: 0,
    canonicalBuildingDraws: 0,
    canonicalBuildingSprites: 0,
    suppressedNoncanonicalSprites: 0,
    noncanonicalBuildingSpritesAllowed: 0,
    lastSuppressed: null,
  };

  let renderDepth = 0;
  let canonicalDepth = 0;
  let gameCanvas = null;

  const resolveGameCanvas = () => gameCanvas || (gameCanvas = document.getElementById('game-canvas'));
  const sourcePath = image => {
    const raw = String(image?.currentSrc || image?.src || image?.dataset?.src || '');
    if (!raw) return '';
    try { return new URL(raw, document.baseURI || location.href).pathname.toLowerCase(); }
    catch (_) { return raw.split(/[?#]/, 1)[0].toLowerCase(); }
  };
  const isBuildingAtlas = path => /\/models\/canvas\/b-[a-z0-9-]+-views\.webp$/i.test(path);
  const destination = args => args.length >= 8
    ? { x: Number(args[4]), y: Number(args[5]), width: Number(args[6]), height: Number(args[7]) }
    : { x: Number(args[0]), y: Number(args[1]), width: Number(args[2]), height: Number(args[3]) };

  const baseDrawImage = Context.prototype.drawImage;
  Context.prototype.drawImage = function authoritativeBuildingSprite199(image, ...args) {
    const canvas = resolveGameCanvas();
    if (!canvas || this.canvas !== canvas) return baseDrawImage.call(this, image, ...args);
    const path = sourcePath(image);
    if (!isBuildingAtlas(path)) return baseDrawImage.call(this, image, ...args);
    if (canonicalDepth > 0) {
      state.canonicalBuildingSprites += 1;
      return baseDrawImage.call(this, image, ...args);
    }

    // No game-canvas owner other than drawBuilding3D is allowed to paint a
    // building atlas. This also catches delayed selection snapshots that fire
    // after Game.render has already returned—the source of the one-frame,
    // enlarged flash while switching or clearing selection.
    state.suppressedNoncanonicalSprites += 1;
    state.lastSuppressed = {
      path,
      destination: destination(args),
      duringRender: renderDepth > 0,
      at: typeof performance !== 'undefined' ? performance.now() : Date.now(),
    };
    return undefined;
  };
  Object.defineProperty(Context.prototype.drawImage, '__fdBuildingRenderAuthority199', { value: true });

  const baseDrawBuilding = Game.prototype.drawBuilding3D;
  if (typeof baseDrawBuilding === 'function') {
    Game.prototype.drawBuilding3D = function canonicalBuilding199(building, ...rest) {
      canonicalDepth += 1;
      state.canonicalBuildingDraws += 1;
      try { return baseDrawBuilding.call(this, building, ...rest); }
      finally { canonicalDepth -= 1; }
    };
    Object.defineProperty(Game.prototype.drawBuilding3D, '__fdBuildingRenderAuthority199', { value: true });
  }

  const baseRender = Game.prototype.render;
  if (typeof baseRender === 'function') {
    Game.prototype.render = function buildingRenderFrame199(...args) {
      const outer = renderDepth === 0;
      if (outer) {
        gameCanvas = document.getElementById('game-canvas') || this.canvas || gameCanvas;
        state.frames += 1;
      }
      renderDepth += 1;
      try { return baseRender.apply(this, args); }
      finally { renderDepth -= 1; }
    };
    Object.defineProperty(Game.prototype.render, '__fdBuildingRenderAuthority199', { value: true });
  }

  root.__FD_BUILDING_RENDER_AUTHORITY_199__ = {
    version: VERSION,
    build: BUILD,
    state,
    diagnostics: () => ({
      ...state,
      lastSuppressed: state.lastSuppressed ? {
        ...state.lastSuppressed,
        destination: { ...state.lastSuppressed.destination },
      } : null,
    }),
  };
})();
