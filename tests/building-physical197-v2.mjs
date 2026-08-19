import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const url = process.env.FD_GAME_URL || 'http://127.0.0.1:8765/frontline-dominion/frontline-dominion.html?build=197';
const outDir = process.env.FD_DIAG_DIR || 'diagnostics-building197';
await fs.mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
const page = await context.newPage();
const browserErrors = [];
page.on('pageerror', error => browserErrors.push(String(error?.stack || error)));
page.on('console', message => {
  if (message.type() === 'error' && !/favicon|404/i.test(message.text())) browserErrors.push(`console:${message.text()}`);
});

const waitFor = async (fn, timeout = 30000, interval = 80) => {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const value = await fn();
    if (value) return value;
    await page.waitForTimeout(interval);
  }
  return null;
};

await page.goto(url, { waitUntil: 'load', timeout: 60000 });
if (!await waitFor(() => page.evaluate(() => Boolean(
  globalThis.__FD_RUNTIME_SHELL_197__?.build === 197 &&
  globalThis.__FD_BUILDING_SELECTION_INVARIANCE_197__?.build === 197 &&
  globalThis.__FD_DEBUG__?.startGame &&
  !document.getElementById('start-game')?.disabled
)))) throw new Error('runtime did not become ready');
await page.locator('#start-game').click();
if (!await waitFor(() => page.evaluate(() => {
  const game = globalThis.__FD_DEBUG__?.game;
  const bridge = globalThis.__FD_STABLE_STATE165__?.bridge;
  return Boolean(game && bridge?.ready && !bridge.failed && Number(bridge.workerTick || 0) >= 10);
}))) throw new Error('game did not become ready');

await page.evaluate(() => {
  const root = globalThis;
  const D = root.__FD_DEBUG__;
  const Game = D?.Game;
  const game = D?.game;
  if (!Game?.prototype || !game) throw new Error('game prototype missing');
  const diag = root.__FD_PHYSICAL_BUILDING_V2__ = {
    active: false,
    frame: 0,
    renderDepth: 0,
    events: [],
    maxEvents: 40000,
  };
  const push = event => {
    if (!diag.active || diag.events.length >= diag.maxEvents) return;
    diag.events.push({ frame: diag.frame, at: performance.now(), ...event });
  };

  const canvasProto = root.CanvasRenderingContext2D?.prototype;
  if (canvasProto && !canvasProto.__fdPhysicalBuildingV2) {
    Object.defineProperty(canvasProto, '__fdPhysicalBuildingV2', { value: true, configurable: true });
    const originalDrawImage = canvasProto.drawImage;
    canvasProto.drawImage = function(image, ...args) {
      if (diag.active && this.canvas?.id === 'game-canvas') {
        push({
          kind: 'drawImage',
          source: String(image?.currentSrc || image?.src || image?.constructor?.name || 'unknown'),
          args: args.map(value => Number.isFinite(Number(value)) ? Number(value) : String(value)),
        });
      }
      return originalDrawImage.call(this, image, ...args);
    };
    const originalClearRect = canvasProto.clearRect;
    canvasProto.clearRect = function(...args) {
      if (diag.active && this.canvas?.id === 'game-canvas') push({ kind: 'clearRect', args: args.map(Number) });
      return originalClearRect.apply(this, args);
    };
  }

  const wrap = (name, details) => {
    const original = Game.prototype[name];
    if (typeof original !== 'function' || original.__fdPhysicalBuildingV2) return;
    const wrapped = function(...args) {
      const info = details ? details.call(this, args) : {};
      push({ kind: `${name}:enter`, ...info });
      const result = original.apply(this, args);
      push({ kind: `${name}:exit`, ...info });
      return result;
    };
    Object.defineProperty(wrapped, '__fdPhysicalBuildingV2', { value: true });
    Game.prototype[name] = wrapped;
  };
  const buildingInfo = function(args) {
    const building = args[0];
    return {
      id: building?.id || null,
      typeId: building?.typeId || building?.type || null,
      selectedFlag: Boolean(building?.selected),
      selectedInArray: Boolean(this.selected?.some?.(item => item === building || item?.id === building?.id)),
      radius: Number(building?.radius || 0),
    };
  };
  wrap('drawBuilding3D', buildingInfo);
  wrap('drawBuilding', buildingInfo);
  wrap('drawBuildings', function() { return { count: Number(this.buildings?.length || 0) }; });
  wrap('drawWorldObjects3D', function() { return { count: Number(this.buildings?.length || 0) }; });
  wrap('drawTerrain', function() { return {}; });
  wrap('setSelection', function(args) { return { requestedIds: Array.from(args[0] || []).map(item => item?.id || null) }; });
  wrap('selectAt', function(args) { return { x: Number(args[0]), y: Number(args[1]) }; });

  const originalRender = Game.prototype.render;
  if (typeof originalRender === 'function' && !originalRender.__fdPhysicalBuildingV2) {
    const wrappedRender = function(...args) {
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
    Object.defineProperty(wrappedRender, '__fdPhysicalBuildingV2', { value: true });
    Game.prototype.render = wrappedRender;
  }
});

const fixture = await page.evaluate(() => {
  const game = globalThis.__FD_DEBUG__?.game;
  const canvas = document.getElementById('game-canvas');
  const rect = canvas?.getBoundingClientRect?.();
  const building = (game?.buildings || []).find(item => item?.alive && item.team === 'player' && item.typeId === 'power') ||
    (game?.buildings || []).find(item => item?.alive && item.team === 'player');
  if (!game || !canvas || !rect?.width || !rect?.height || !building) return { error: 'fixture-missing' };

  game.clearSelection?.();
  game.centerCamera?.(building.x, building.y);
  if (game.camera) game.camera.zoom = 0.82;
  if (game._terrainSpriteCache123) game._terrainSpriteCache123.valid = false;
  globalThis.__FD_CLASSIC_RENDER__?.invalidate?.();
  game.render?.();
  game.render?.();

  const bounds = game.getBuildingFigureScreenBounds193?.(building);
  if (!bounds) return { error: 'bounds-missing', id: building.id };
  let point = null;
  for (let yi = 2; yi <= 10 && !point; yi += 1) {
    for (let xi = 2; xi <= 10; xi += 1) {
      const sx = bounds.x1 + bounds.width * xi / 12;
      const sy = bounds.y1 + bounds.height * yi / 12;
      const world = game.screenToWorld?.(sx, sy, 0) || game.screenToWorld?.(sx, sy);
      if (!world || !Number.isFinite(world.x) || !Number.isFinite(world.y)) continue;
      const hits = game.getBuildingFigureHits193?.(world.x, world.y) || [];
      if (hits[0]?.building?.id === building.id) {
        const distance = Math.hypot(sx - (bounds.x1 + bounds.x2) * 0.5, sy - (bounds.y1 + bounds.y2) * 0.5);
        if (!point || distance < point.distance) point = { sx, sy, worldX: world.x, worldY: world.y, distance, hitIds: hits.map(hit => hit.building?.id) };
      }
    }
  }

  let isolatedForClick = false;
  if (!point) {
    const sx = (bounds.x1 + bounds.x2) * 0.5;
    const sy = (bounds.y1 + bounds.y2) * 0.5;
    const world = game.screenToWorld?.(sx, sy, 0) || game.screenToWorld?.(sx, sy);
    point = { sx, sy, worldX: world?.x, worldY: world?.y, distance: 0, hitIds: [] };
    isolatedForClick = true;
    globalThis.__FD_PHYSICAL_BUILDING_ORIGINAL_LIST_V2__ = game.buildings;
    game.buildings = [building];
  }

  return {
    id: building.id,
    typeId: building.typeId,
    radius: building.radius,
    bounds: { x1: bounds.x1, y1: bounds.y1, x2: bounds.x2, y2: bounds.y2, width: bounds.width, height: bounds.height },
    point,
    isolatedForClick,
    clickCssX: rect.left + point.sx * rect.width / canvas.width,
    clickCssY: rect.top + point.sy * rect.height / canvas.height,
    canvasWidth: canvas.width,
    canvasHeight: canvas.height,
    rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
  };
});
if (fixture.error) throw new Error(JSON.stringify(fixture));

const canvas = page.locator('#game-canvas');
await canvas.screenshot({ path: path.join(outDir, 'physical-v2-before.png') });
const baseline = await page.evaluate(({ bounds }) => {
  const canvas = document.getElementById('game-canvas');
  const ctx = canvas.getContext('2d');
  const x = Math.max(0, Math.floor(bounds.x1 + bounds.width * 0.08));
  const y = Math.max(0, Math.floor(bounds.y1 + bounds.height * 0.08));
  const width = Math.max(1, Math.min(canvas.width - x, Math.ceil(bounds.width * 0.84)));
  const height = Math.max(1, Math.min(canvas.height - y, Math.ceil(bounds.height * 0.84)));
  return { x, y, width, height, data: Array.from(ctx.getImageData(x, y, width, height).data) };
}, fixture);

await page.evaluate(() => {
  const diag = globalThis.__FD_PHYSICAL_BUILDING_V2__;
  diag.events = [];
  diag.frame = 0;
  diag.renderDepth = 0;
  diag.active = true;
});
await page.mouse.click(fixture.clickCssX, fixture.clickCssY, { button: 'left' });
await page.waitForTimeout(250);
await page.evaluate(() => {
  const game = globalThis.__FD_DEBUG__?.game;
  const original = globalThis.__FD_PHYSICAL_BUILDING_ORIGINAL_LIST_V2__;
  if (original) {
    game.buildings = original;
    delete globalThis.__FD_PHYSICAL_BUILDING_ORIGINAL_LIST_V2__;
  }
});
await page.waitForTimeout(750);
await page.evaluate(() => { globalThis.__FD_PHYSICAL_BUILDING_V2__.active = false; });
await canvas.screenshot({ path: path.join(outDir, 'physical-v2-after.png') });

const report = await page.evaluate(({ fixture, baseline, browserErrors }) => {
  const game = globalThis.__FD_DEBUG__?.game;
  const canvas = document.getElementById('game-canvas');
  const ctx = canvas.getContext('2d');
  const current = ctx.getImageData(baseline.x, baseline.y, baseline.width, baseline.height).data;
  let changed = 0;
  let strong = 0;
  let totalDelta = 0;
  for (let index = 0; index < current.length; index += 4) {
    const delta = Math.abs(current[index] - baseline.data[index]) + Math.abs(current[index + 1] - baseline.data[index + 1]) +
      Math.abs(current[index + 2] - baseline.data[index + 2]) + Math.abs(current[index + 3] - baseline.data[index + 3]);
    totalDelta += delta;
    if (delta > 8) changed += 1;
    if (delta > 80) strong += 1;
  }

  const diag = globalThis.__FD_PHYSICAL_BUILDING_V2__;
  const frames = new Map();
  for (const event of diag.events) {
    const frame = frames.get(event.frame) || {
      frame: event.frame,
      selectedIds: null,
      targetSpriteDraws: 0,
      allBuildingSpriteDraws: 0,
      target3DCalls: 0,
      targetLegacyCalls: 0,
      clearCalls: 0,
      kinds: {},
    };
    frame.kinds[event.kind] = (frame.kinds[event.kind] || 0) + 1;
    if (event.kind === 'frame:start') frame.selectedIds = event.selectedIds;
    if (event.kind === 'clearRect') frame.clearCalls += 1;
    if (event.kind === 'drawImage' && /models\/canvas\/b-/i.test(event.source || '')) {
      frame.allBuildingSpriteDraws += 1;
      if (new RegExp(`/b-0?2-views\\.webp`, 'i').test(event.source || '')) frame.targetSpriteDraws += 1;
    }
    if (event.kind === 'drawBuilding3D:enter' && event.id === fixture.id) frame.target3DCalls += 1;
    if (event.kind === 'drawBuilding:enter' && event.id === fixture.id) frame.targetLegacyCalls += 1;
    frames.set(event.frame, frame);
  }
  const frameSummary = [...frames.values()];
  const building = game.getEntity?.(fixture.id) || game.buildings?.find(item => item?.id === fixture.id);
  return {
    fixture,
    selectedIds: (game.selected || []).map(item => item?.id || null),
    selectedFlag: building?.selected,
    geometry: { radius: building?.radius, visualScale: building?.visualScale, scale: building?.scale },
    pixelDiff: {
      region: { x: baseline.x, y: baseline.y, width: baseline.width, height: baseline.height },
      changed,
      strong,
      total: baseline.width * baseline.height,
      changedRatio: changed / Math.max(1, baseline.width * baseline.height),
      strongRatio: strong / Math.max(1, baseline.width * baseline.height),
      meanAbsoluteDelta: totalDelta / Math.max(1, baseline.width * baseline.height * 4),
    },
    frameSummary,
    events: diag.events,
    invariance: { ...globalThis.__FD_BUILDING_SELECTION_INVARIANCE_197__?.state },
    owner196: { ...globalThis.__FD_BUILDING_SELECTION_OWNER_196__?.state },
    selection193: { ...globalThis.__FD_BUILDING_SELECTION_193__?.state },
    browserErrors,
  };
}, { fixture, baseline, browserErrors });

await fs.writeFile(path.join(outDir, 'physical-v2-report.json'), JSON.stringify(report, null, 2));
console.log('FD197_PHYSICAL_BUILDING_V2 ' + JSON.stringify(report));
await context.close();
await browser.close();
