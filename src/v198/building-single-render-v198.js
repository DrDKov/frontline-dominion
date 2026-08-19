(() => {
  'use strict';

  const root = globalThis;
  const D = root.__FD_DEBUG__;
  const Game = D?.Game;
  const CanvasContext = root.CanvasRenderingContext2D;
  if (typeof document === 'undefined' || !Game?.prototype || !CanvasContext?.prototype || root.__FD_BUILDING_SINGLE_RENDER_198__) return;

  const VERSION = '16.8.14';
  const BUILD = 198;
  const state = {
    frames: 0,
    canonicalBuildingDraws: 0,
    canonicalSelectedSpriteDraws: 0,
    suppressedOutsideCanonical: 0,
    ignoredOtherCanvas: 0,
    selectedCodes: [],
    selectedSpritePaths: [],
    lastSuppressed: null,
  };

  let renderDepth = 0;
  let buildingDrawDepth = 0;
  let activeGame = null;
  let gameCanvas = null;
  let selectedSpritePaths = new Set();

  const pathOf = value => {
    const raw = String(value || '');
    if (!raw) return '';
    try {
      return new URL(raw, document.baseURI || location.href).pathname.toLowerCase();
    } catch (_) {
      return raw.split(/[?#]/, 1)[0].toLowerCase();
    }
  };

  const sourcePath = image => pathOf(
    image?.currentSrc || image?.src || image?.dataset?.src || '',
  );

  const selectedBuildings = game => {
    const seen = new Set();
    const result = [];
    const sources = [
      ...(Array.isArray(game?.selected) ? game.selected : []),
      ...(root.__FD_BUILDING_SELECTION_INVARIANCE_197__?.selectedBuildings?.() || []),
    ];
    for (const entity of sources) {
      const current = entity?.id != null ? (game?.getEntity?.(entity.id) || entity) : entity;
      if (!current?.alive || current.kind !== 'building') continue;
      const key = current.id ?? current;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(current);
    }
    return result;
  };

  const spritePathFor = (pilot, building, code) => {
    const sprite = pilot?.canvasSprites?.[code] || null;
    const direct = pathOf(sprite?.image?.currentSrc || sprite?.image?.src || sprite?.uri || sprite?.spec?.canvasSprite?.uri || '');
    if (direct) return direct;
    if (!code) return '';
    return `/frontline-dominion/models/canvas/${String(code).toLowerCase()}-views.webp`;
  };

  const captureSelectedSprites = game => {
    const pilot = root.__FD_MODEL_PILOT__;
    const paths = new Set();
    const codes = [];
    for (const building of selectedBuildings(game)) {
      const code = pilot?.modelForType?.(building.typeId, 'building') || building?.stats?.modelCode || null;
      if (!code) continue;
      codes.push(code);
      const path = spritePathFor(pilot, building, code);
      if (path) paths.add(path);
    }
    state.selectedCodes = [...new Set(codes)];
    state.selectedSpritePaths = [...paths];
    return paths;
  };

  const readDestination = args => {
    if (args.length >= 8) {
      return {
        x: Number(args[4]), y: Number(args[5]),
        width: Number(args[6]), height: Number(args[7]),
      };
    }
    if (args.length >= 4) {
      return {
        x: Number(args[0]), y: Number(args[1]),
        width: Number(args[2]), height: Number(args[3]),
      };
    }
    return {
      x: Number(args[0]), y: Number(args[1]),
      width: NaN, height: NaN,
    };
  };

  const baseDrawImage = CanvasContext.prototype.drawImage;
  CanvasContext.prototype.drawImage = function singleBuildingSpriteDraw198(image, ...args) {
    if (renderDepth <= 0 || !activeGame) return baseDrawImage.call(this, image, ...args);
    if (!gameCanvas) gameCanvas = document.getElementById('game-canvas') || activeGame?.canvas || null;
    if (!gameCanvas || this.canvas !== gameCanvas) {
      state.ignoredOtherCanvas += 1;
      return baseDrawImage.call(this, image, ...args);
    }

    const path = sourcePath(image);
    if (!path || !selectedSpritePaths.has(path)) return baseDrawImage.call(this, image, ...args);

    if (buildingDrawDepth > 0) {
      state.canonicalSelectedSpriteDraws += 1;
      return baseDrawImage.call(this, image, ...args);
    }

    // Selected buildings are painted by the canonical drawBuilding3D owner.
    // Historical priority/selection layers can still repaint the same atlas
    // directly from a delayed render snapshot. That second call is outside
    // drawBuilding3D, uses a larger destination rectangle and creates the
    // displaced duplicate seen by the player. Reject only that non-canonical
    // selected-building atlas call; terrain, units and all canonical building
    // draws continue unchanged.
    state.suppressedOutsideCanonical += 1;
    state.lastSuppressed = {
      path,
      destination: readDestination(args),
      selectedCodes: [...state.selectedCodes],
    };
    return undefined;
  };
  Object.defineProperty(CanvasContext.prototype.drawImage, '__fdBuildingSingleRender198', { value: true });

  const baseDrawBuilding = Game.prototype.drawBuilding3D;
  if (typeof baseDrawBuilding === 'function') {
    Game.prototype.drawBuilding3D = function canonicalBuildingDraw198(building, ...rest) {
      buildingDrawDepth += 1;
      state.canonicalBuildingDraws += 1;
      try {
        return baseDrawBuilding.call(this, building, ...rest);
      } finally {
        buildingDrawDepth -= 1;
      }
    };
    Object.defineProperty(Game.prototype.drawBuilding3D, '__fdBuildingSingleRender198', { value: true });
  }

  const baseRender = Game.prototype.render;
  if (typeof baseRender === 'function') {
    Game.prototype.render = function renderWithSingleBuildingSprite198(...args) {
      const outer = renderDepth === 0;
      if (outer) {
        activeGame = this;
        gameCanvas = document.getElementById('game-canvas') || this.canvas || null;
        selectedSpritePaths = captureSelectedSprites(this);
        state.frames += 1;
      }
      renderDepth += 1;
      try {
        return baseRender.apply(this, args);
      } finally {
        renderDepth -= 1;
        if (outer) {
          activeGame = null;
          selectedSpritePaths = new Set();
        }
      }
    };
    Object.defineProperty(Game.prototype.render, '__fdBuildingSingleRender198', { value: true });
  }

  root.__FD_BUILDING_SINGLE_RENDER_198__ = {
    version: VERSION,
    build: BUILD,
    state,
    diagnostics: () => ({
      ...state,
      selectedCodes: [...state.selectedCodes],
      selectedSpritePaths: [...state.selectedSpritePaths],
      lastSuppressed: state.lastSuppressed ? {
        ...state.lastSuppressed,
        selectedCodes: [...state.lastSuppressed.selectedCodes],
        destination: { ...state.lastSuppressed.destination },
      } : null,
    }),
  };
})();
