import { chromium, webkit } from 'playwright';

const browserName = process.env.FD_BROWSER || 'chromium';
const launcher = browserName === 'webkit' ? webkit : chromium;
const url = process.env.FD_GAME_URL || 'http://127.0.0.1:8765/frontline-dominion/frontline-dominion.html?build=198';
const browser = await launcher.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(String(error?.stack || error)));
page.on('console', message => {
  if (message.type() === 'error' && !/favicon|404/i.test(message.text())) errors.push(`console:${message.text()}`);
});

await page.addInitScript(() => {
  const root = globalThis;
  const state = root.__FD_ACTUAL_DRAW_TRACE_198__ = {
    active: false,
    frame: 0,
    calls: [],
    maxCalls: 12000,
  };
  const proto = root.CanvasRenderingContext2D?.prototype;
  if (!proto || proto.__fdActualDrawTrace198) return;
  Object.defineProperty(proto, '__fdActualDrawTrace198', { value: true, configurable: true });
  const original = proto.drawImage;
  proto.drawImage = function tracedActualDraw198(image, ...args) {
    if (state.active && state.calls.length < state.maxCalls && this.canvas?.id === 'game-canvas') {
      let destination = null;
      if (args.length >= 8) destination = { x: Number(args[4]), y: Number(args[5]), width: Number(args[6]), height: Number(args[7]) };
      else if (args.length >= 4) destination = { x: Number(args[0]), y: Number(args[1]), width: Number(args[2]), height: Number(args[3]) };
      state.calls.push({
        frame: state.frame,
        source: String(image?.currentSrc || image?.src || ''),
        destination,
      });
    }
    return original.call(this, image, ...args);
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
  globalThis.__FD_RUNTIME_SHELL_198__?.build === 198 &&
  globalThis.__FD_BUILDING_SINGLE_RENDER_198__?.build === 198 &&
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

const fixture = await waitFor(() => page.evaluate(() => {
  const game = globalThis.__FD_DEBUG__?.game;
  const pilot = globalThis.__FD_MODEL_PILOT__;
  const canvas = document.getElementById('game-canvas');
  const rect = canvas?.getBoundingClientRect?.();
  const building = (game?.buildings || []).find(item => item?.alive && item.team === 'player' && item.typeId === 'power') ||
    (game?.buildings || []).find(item => item?.alive && item.team === 'player');
  if (!game || !pilot || !building || !canvas || !rect?.width || !rect?.height) return null;

  game.clearSelection?.();
  game.centerCamera?.(building.x, building.y);
  if (game.camera) game.camera.zoom = 0.82;
  globalThis.__FD_CLASSIC_RENDER__?.invalidate?.();
  game.render?.();

  const code = pilot.modelForType?.(building.typeId, 'building') || building.stats?.modelCode;
  const sprite = pilot.canvasSprites?.[code];
  if (!code || !sprite?.image?.complete || !sprite.image.naturalWidth) return null;
  const bounds = game.getBuildingFigureScreenBounds193?.(building);
  if (!bounds) return null;

  let point = null;
  for (let yi = 2; yi <= 10 && !point; yi += 1) {
    for (let xi = 2; xi <= 10; xi += 1) {
      const sx = bounds.x1 + bounds.width * xi / 12;
      const sy = bounds.y1 + bounds.height * yi / 12;
      const world = game.screenToWorld?.(sx, sy, 0) || game.screenToWorld?.(sx, sy);
      if (!world || !Number.isFinite(world.x) || !Number.isFinite(world.y)) continue;
      const hits = game.getBuildingFigureHits193?.(world.x, world.y) || [];
      if (hits[0]?.building?.id === building.id) {
        point = { sx, sy, worldX: world.x, worldY: world.y };
        break;
      }
    }
  }
  if (!point) return null;

  const geometry = globalThis.__FD_BUILDING_SELECTION_INVARIANCE_197__?.geometrySignature?.(building) || {};
  const sourcePath = (() => {
    try { return new URL(sprite.image.currentSrc || sprite.image.src || sprite.uri, document.baseURI).pathname.toLowerCase(); }
    catch (_) { return String(sprite.image.currentSrc || sprite.image.src || sprite.uri || '').split(/[?#]/, 1)[0].toLowerCase(); }
  })();

  return {
    id: building.id,
    typeId: building.typeId,
    code,
    sourcePath,
    geometry,
    bounds: { x1: bounds.x1, y1: bounds.y1, x2: bounds.x2, y2: bounds.y2, width: bounds.width, height: bounds.height },
    clickCssX: rect.left + point.sx * rect.width / canvas.width,
    clickCssY: rect.top + point.sy * rect.height / canvas.height,
  };
}), 30000, 120);

const suppressedBefore = await page.evaluate(() => Number(globalThis.__FD_BUILDING_SINGLE_RENDER_198__?.state?.suppressedOutsideCanonical || 0));
await page.mouse.click(fixture.clickCssX, fixture.clickCssY, { button: 'left' });
await waitFor(() => page.evaluate(id => globalThis.__FD_DEBUG__?.game?.selected?.some?.(item => item?.id === id), fixture.id), 6000);

await page.evaluate(() => {
  const D = globalThis.__FD_DEBUG__;
  const Game = D?.Game;
  const trace = globalThis.__FD_ACTUAL_DRAW_TRACE_198__;
  if (!Game?.prototype || !trace) throw new Error('build 198 trace fixture missing');
  if (!Game.prototype.__fdActualRenderTrace198) {
    const original = Game.prototype.render;
    Game.prototype.render = function tracedRender198(...args) {
      trace.frame += 1;
      return original.apply(this, args);
    };
    Object.defineProperty(Game.prototype, '__fdActualRenderTrace198', { value: true, configurable: true });
  }
  trace.calls = [];
  trace.frame = 0;
  trace.active = true;
});

await page.waitForTimeout(1400);
await page.evaluate(() => { globalThis.__FD_ACTUAL_DRAW_TRACE_198__.active = false; });

const result = await page.evaluate(({ fixture, suppressedBefore }) => {
  const game = globalThis.__FD_DEBUG__?.game;
  const building = game?.getEntity?.(fixture.id) || (game?.buildings || []).find(item => item?.id === fixture.id);
  const trace = globalThis.__FD_ACTUAL_DRAW_TRACE_198__;
  const gate = globalThis.__FD_BUILDING_SINGLE_RENDER_198__;
  const invariance = globalThis.__FD_BUILDING_SELECTION_INVARIANCE_197__;
  const afterBounds = game?.getBuildingFigureScreenBounds193?.(building) || null;
  const afterGeometry = invariance?.geometrySignature?.(building) || {};
  const geometryDelta = invariance?.geometryDelta?.(fixture.geometry, afterGeometry) ?? NaN;
  const center = { x: (fixture.bounds.x1 + fixture.bounds.x2) * 0.5, y: (fixture.bounds.y1 + fixture.bounds.y2) * 0.5 };
  const sourceMatches = call => {
    let path = '';
    try { path = new URL(call.source, document.baseURI).pathname.toLowerCase(); }
    catch (_) { path = String(call.source || '').split(/[?#]/, 1)[0].toLowerCase(); }
    if (path !== fixture.sourcePath || !call.destination) return false;
    const destinationCenter = {
      x: call.destination.x + call.destination.width * 0.5,
      y: call.destination.y + call.destination.height * 0.5,
    };
    return Math.hypot(destinationCenter.x - center.x, destinationCenter.y - center.y) <= Math.max(fixture.bounds.width, fixture.bounds.height) * 0.38;
  };
  const counts = new Map();
  for (const call of trace.calls.filter(sourceMatches)) counts.set(call.frame, (counts.get(call.frame) || 0) + 1);
  const settledFrames = [...counts.entries()].filter(([frame]) => frame >= 3).map(([frame, count]) => ({ frame, count }));
  const diagnostics = gate?.diagnostics?.() || { ...gate?.state };
  return {
    selectedIds: (game?.selected || []).map(item => item?.id),
    selectedFlag: building?.selected,
    geometryDelta,
    beforeBounds: fixture.bounds,
    afterBounds: afterBounds ? { x1: afterBounds.x1, y1: afterBounds.y1, x2: afterBounds.x2, y2: afterBounds.y2, width: afterBounds.width, height: afterBounds.height } : null,
    settledFrames,
    totalTraceFrames: Number(trace.frame || 0),
    suppressedBefore,
    suppressedAfter: Number(gate?.state?.suppressedOutsideCanonical || 0),
    suppressionDelta: Number(gate?.state?.suppressedOutsideCanonical || 0) - suppressedBefore,
    diagnostics,
  };
}, { fixture, suppressedBefore });

if (!result.selectedIds.includes(fixture.id)) throw new Error(`physical building selection failed: ${JSON.stringify({ fixture, result })}`);
if (!Number.isFinite(result.geometryDelta) || result.geometryDelta > 1e-9) throw new Error(`building geometry changed: ${JSON.stringify({ fixture, result })}`);
if (!result.afterBounds || Math.max(
  Math.abs(result.afterBounds.width - fixture.bounds.width),
  Math.abs(result.afterBounds.height - fixture.bounds.height),
) > 0.01) throw new Error(`building bounds changed: ${JSON.stringify({ fixture, result })}`);
if (result.suppressionDelta < 1) throw new Error(`duplicate selected-building path was not intercepted: ${JSON.stringify({ fixture, result })}`);
if (result.settledFrames.length < 3 || result.settledFrames.some(frame => frame.count !== 1)) {
  throw new Error(`selected building was not painted exactly once per frame: ${JSON.stringify({ fixture, result })}`);
}
if (errors.length) throw new Error(`browser errors: ${JSON.stringify(errors)}`);

console.log(JSON.stringify({ ok: true, browserName, fixture, result, errors }));
await context.close();
await browser.close();
