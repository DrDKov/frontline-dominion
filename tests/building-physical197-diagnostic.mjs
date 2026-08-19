import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const url = process.env.FD_GAME_URL || 'http://127.0.0.1:8765/frontline-dominion/frontline-dominion.html?build=197';
const outDir = process.env.FD_DIAG_DIR || 'diagnostics-building197';
await fs.mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(String(error?.stack || error)));
page.on('console', message => {
  if (message.type() === 'error' && !/favicon|404/i.test(message.text())) errors.push(`console:${message.text()}`);
});

await page.addInitScript(() => {
  const root = globalThis;
  const diag = root.__FD_PHYSICAL_BUILDING_DIAG_197__ = {
    active: false,
    frame: 0,
    renderDepth: 0,
    events: [],
    maxEvents: 30000,
  };
  const push = event => {
    if (!diag.active || diag.events.length >= diag.maxEvents) return;
    diag.events.push({ frame: diag.frame, at: performance.now(), ...event });
  };

  const installCanvas = prototype => {
    if (!prototype || prototype.__fdPhysicalDiag197) return;
    Object.defineProperty(prototype, '__fdPhysicalDiag197', { value: true, configurable: true });
    for (const name of ['drawImage', 'clearRect', 'fillRect', 'strokeRect']) {
      const original = prototype[name];
      if (typeof original !== 'function') continue;
      prototype[name] = function(...args) {
        if (diag.active && this.canvas?.id === 'game-canvas') {
          const item = { kind: `canvas:${name}`, args: args.map(value => Number.isFinite(Number(value)) ? Number(value) : String(value)) };
          if (name === 'drawImage') {
            const image = args[0];
            item.source = String(image?.currentSrc || image?.src || image?.constructor?.name || 'unknown');
            item.args = args.slice(1).map(value => Number.isFinite(Number(value)) ? Number(value) : String(value));
          }
          try {
            const matrix = this.getTransform?.();
            if (matrix) item.transform = { a: matrix.a, b: matrix.b, c: matrix.c, d: matrix.d, e: matrix.e, f: matrix.f };
          } catch (_) {}
          push(item);
        }
        return original.apply(this, args);
      };
    }
  };
  installCanvas(root.CanvasRenderingContext2D?.prototype);
  installCanvas(root.OffscreenCanvasRenderingContext2D?.prototype);

  root.__FD_INSTALL_PHYSICAL_BUILDING_DIAG_197__ = () => {
    const game = root.__FD_DEBUG__?.game;
    const Game = root.__FD_DEBUG__?.Game;
    if (!game || !Game?.prototype || Game.prototype.__fdPhysicalBuildingMethods197) return Boolean(game);
    Object.defineProperty(Game.prototype, '__fdPhysicalBuildingMethods197', { value: true, configurable: true });

    const wrap = (name, describe) => {
      const original = Game.prototype[name];
      if (typeof original !== 'function' || original.__fdPhysicalBuildingMethod197) return;
      const wrapped = function(...args) {
        const details = describe ? describe.call(this, args) : {};
        push({ kind: `method:${name}:enter`, ...details });
        const result = original.apply(this, args);
        push({ kind: `method:${name}:exit`, ...details });
        return result;
      };
      Object.defineProperty(wrapped, '__fdPhysicalBuildingMethod197', { value: true });
      Game.prototype[name] = wrapped;
    };

    const buildingDetails = function(args) {
      const building = args[0];
      return {
        id: building?.id || null,
        typeId: building?.typeId || building?.type || null,
        selectedFlag: Boolean(building?.selected),
        selectedInArray: Boolean(this.selected?.some?.(item => item === building || item?.id === building?.id)),
        radius: Number(building?.radius || 0),
        x: Number(building?.x || 0),
        y: Number(building?.y || 0),
      };
    };
    wrap('drawBuilding3D', buildingDetails);
    wrap('drawBuilding', buildingDetails);
    wrap('paintBuildingSprite', buildingDetails);
    wrap('drawBuildingDynamicDetails', buildingDetails);
    wrap('drawBuildings', function() { return { buildingCount: Number(this.buildings?.length || 0) }; });
    wrap('drawWorldObjects3D', function() { return { buildingCount: Number(this.buildings?.length || 0) }; });
    wrap('drawTerrain', function() { return {}; });
    wrap('drawScreenOverlay', function() { return { selectedIds: (this.selected || []).map(item => item?.id || null) }; });
    wrap('setSelection', function(args) { return { requestedIds: (args[0] || []).map?.(item => item?.id || null) || [] }; });
    wrap('selectAt', function(args) { return { worldX: Number(args[0]), worldY: Number(args[1]) }; });

    const originalRender = Game.prototype.render;
    if (typeof originalRender === 'function' && !originalRender.__fdPhysicalBuildingRender197) {
      const render = function(...args) {
        const outer = diag.renderDepth === 0;
        diag.renderDepth += 1;
        if (outer && diag.active) {
          diag.frame += 1;
          push({ kind: 'frame:start', selectedIds: (this.selected || []).map(item => item?.id || null) });
        }
        try {
          return originalRender.apply(this, args);
        } finally {
          diag.renderDepth -= 1;
          if (outer && diag.active) push({ kind: 'frame:end', selectedIds: (this.selected || []).map(item => item?.id || null) });
        }
      };
      Object.defineProperty(render, '__fdPhysicalBuildingRender197', { value: true });
      Game.prototype.render = render;
    }
    return true;
  };
});

const waitFor = async (fn, timeout = 30000, interval = 80) => {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const value = await fn();
    if (value) return value;
    await page.waitForTimeout(interval);
  }
  throw new Error(`Timed out after ${timeout} ms`);
};

await page.goto(url, { waitUntil: 'load', timeout: 60000 });
await waitFor(() => page.evaluate(() => Boolean(
  globalThis.__FD_RUNTIME_SHELL_197__?.build === 197 &&
  globalThis.__FD_BUILDING_SELECTION_INVARIANCE_197__?.build === 197 &&
  globalThis.__FD_DEBUG__?.startGame &&
  !document.getElementById('start-game')?.disabled
)));
await page.locator('#start-game').click();
await waitFor(() => page.evaluate(() => {
  const game = globalThis.__FD_DEBUG__?.game;
  const bridge = globalThis.__FD_STABLE_STATE165__?.bridge;
  return Boolean(game && bridge?.ready && !bridge.failed && Number(bridge.workerTick || 0) >= 10);
}));
await page.evaluate(() => globalThis.__FD_INSTALL_PHYSICAL_BUILDING_DIAG_197__?.());

const fixture = await page.evaluate(() => {
  const game = globalThis.__FD_DEBUG__?.game;
  const building = (game?.buildings || []).find(item => item?.alive && item.team === 'player' && item.typeId === 'power') ||
    (game?.buildings || []).find(item => item?.alive && item.team === 'player');
  const canvas = document.getElementById('game-canvas');
  const rect = canvas?.getBoundingClientRect?.();
  if (!game || !building || !canvas || !rect?.width || !rect?.height) return { error: 'fixture-missing' };
  game.paused = true;
  game.clearSelection?.();
  game.centerCamera?.(building.x, building.y);
  if (game.camera) game.camera.zoom = 0.82;
  game._terrainSpriteCache123 && (game._terrainSpriteCache123.valid = false);
  globalThis.__FD_CLASSIC_RENDER__?.invalidate?.();
  game.render?.();
  game.render?.();
  const bounds = game.getBuildingFigureScreenBounds193?.(building);
  if (!bounds) return { error: 'bounds-missing', id: building.id };
  const clickCanvasX = (bounds.x1 + bounds.x2) * 0.5;
  const clickCanvasY = bounds.y1 + bounds.height * 0.58;
  return {
    id: building.id,
    typeId: building.typeId,
    radius: building.radius,
    bounds: { x1: bounds.x1, y1: bounds.y1, x2: bounds.x2, y2: bounds.y2, width: bounds.width, height: bounds.height },
    clickCanvasX,
    clickCanvasY,
    clickCssX: rect.left + clickCanvasX * rect.width / canvas.width,
    clickCssY: rect.top + clickCanvasY * rect.height / canvas.height,
    canvasWidth: canvas.width,
    canvasHeight: canvas.height,
    rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
  };
});
if (fixture.error) throw new Error(JSON.stringify(fixture));

const canvas = page.locator('#game-canvas');
await canvas.screenshot({ path: path.join(outDir, 'physical-before.png') });
const baseline = await page.evaluate(({ bounds }) => {
  const canvas = document.getElementById('game-canvas');
  const ctx = canvas.getContext('2d');
  const x = Math.max(0, Math.floor(bounds.x1 + bounds.width * 0.12));
  const y = Math.max(0, Math.floor(bounds.y1 + bounds.height * 0.12));
  const width = Math.max(1, Math.min(canvas.width - x, Math.ceil(bounds.width * 0.76)));
  const height = Math.max(1, Math.min(canvas.height - y, Math.ceil(bounds.height * 0.76)));
  const data = ctx.getImageData(x, y, width, height).data;
  return { x, y, width, height, data: Array.from(data) };
}, fixture);

await page.evaluate(() => {
  const diag = globalThis.__FD_PHYSICAL_BUILDING_DIAG_197__;
  diag.events = [];
  diag.frame = 0;
  diag.renderDepth = 0;
  diag.active = true;
});
await page.mouse.click(fixture.clickCssX, fixture.clickCssY, { button: 'left' });
await waitFor(() => page.evaluate(id => globalThis.__FD_DEBUG__?.game?.selected?.some?.(item => item?.id === id), fixture.id), 6000);
await page.waitForTimeout(800);
await page.evaluate(() => { globalThis.__FD_PHYSICAL_BUILDING_DIAG_197__.active = false; });
await canvas.screenshot({ path: path.join(outDir, 'physical-after.png') });

const report = await page.evaluate(({ fixture, baseline }) => {
  const game = globalThis.__FD_DEBUG__?.game;
  const canvas = document.getElementById('game-canvas');
  const ctx = canvas.getContext('2d');
  const current = ctx.getImageData(baseline.x, baseline.y, baseline.width, baseline.height).data;
  const before = baseline.data;
  let changedPixels = 0;
  let changedStrong = 0;
  let absoluteDelta = 0;
  for (let index = 0; index < current.length; index += 4) {
    const delta = Math.abs(current[index] - before[index]) + Math.abs(current[index + 1] - before[index + 1]) +
      Math.abs(current[index + 2] - before[index + 2]) + Math.abs(current[index + 3] - before[index + 3]);
    absoluteDelta += delta;
    if (delta > 8) changedPixels += 1;
    if (delta > 80) changedStrong += 1;
  }
  const diag = globalThis.__FD_PHYSICAL_BUILDING_DIAG_197__;
  const events = [...diag.events];
  const frames = new Map();
  for (const event of events) {
    const frame = frames.get(event.frame) || { frame: event.frame, events: [], imageSources: {}, building3D: {}, legacyBuilding: {}, selectedIds: null };
    frame.events.push(event);
    if (event.kind === 'frame:start') frame.selectedIds = event.selectedIds;
    if (event.kind === 'canvas:drawImage' && /models\/canvas\/b-/i.test(event.source || '')) {
      frame.imageSources[event.source] = (frame.imageSources[event.source] || 0) + 1;
    }
    if (event.kind === 'method:drawBuilding3D:enter') {
      const key = `${event.id || 'null'}:${event.typeId || 'null'}`;
      frame.building3D[key] = (frame.building3D[key] || 0) + 1;
    }
    if (event.kind === 'method:drawBuilding:enter') {
      const key = `${event.id || 'null'}:${event.typeId || 'null'}`;
      frame.legacyBuilding[key] = (frame.legacyBuilding[key] || 0) + 1;
    }
    frames.set(event.frame, frame);
  }
  const frameSummary = [...frames.values()].map(frame => ({
    frame: frame.frame,
    selectedIds: frame.selectedIds,
    imageSources: frame.imageSources,
    building3D: frame.building3D,
    legacyBuilding: frame.legacyBuilding,
    kinds: frame.events.reduce((map, event) => { map[event.kind] = (map[event.kind] || 0) + 1; return map; }, {}),
  }));
  const building = game.getEntity?.(fixture.id) || game.buildings?.find(item => item?.id === fixture.id);
  const overlappingElements = [...document.elementsFromPoint(fixture.clickCssX, fixture.clickCssY)].map(element => ({
    tag: element.tagName,
    id: element.id || null,
    className: typeof element.className === 'string' ? element.className : null,
    opacity: getComputedStyle(element).opacity,
    position: getComputedStyle(element).position,
    zIndex: getComputedStyle(element).zIndex,
  }));
  return {
    fixture,
    selectedIds: (game.selected || []).map(item => item?.id || null),
    selectedFlag: building?.selected,
    geometry: { radius: building?.radius, visualScale: building?.visualScale, scale: building?.scale },
    region: { x: baseline.x, y: baseline.y, width: baseline.width, height: baseline.height },
    changedPixels,
    changedStrong,
    totalPixels: baseline.width * baseline.height,
    changedRatio: changedPixels / Math.max(1, baseline.width * baseline.height),
    strongRatio: changedStrong / Math.max(1, baseline.width * baseline.height),
    meanAbsoluteDelta: absoluteDelta / Math.max(1, baseline.width * baseline.height * 4),
    frameSummary,
    events,
    overlappingElements,
    invariance: { ...globalThis.__FD_BUILDING_SELECTION_INVARIANCE_197__?.state },
    owner196: { ...globalThis.__FD_BUILDING_SELECTION_OWNER_196__?.state },
    selection193: { ...globalThis.__FD_BUILDING_SELECTION_193__?.state },
    errors: [],
  };
}, { fixture, baseline });
report.errors = errors;
await fs.writeFile(path.join(outDir, 'physical-report.json'), JSON.stringify(report, null, 2));
console.log('FD197_PHYSICAL_BUILDING ' + JSON.stringify(report));
await context.close();
await browser.close();
