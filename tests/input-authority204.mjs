import { chromium } from 'playwright';

const url = process.env.FD_GAME_URL || 'http://127.0.0.1:8765/frontline-dominion/frontline-dominion.html?build=204';
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const page = await context.newPage();
const errors = [];

page.on('pageerror', error => errors.push(String(error?.stack || error)));
page.on('console', message => {
  if (message.type() !== 'error') return;
  const text = message.text();
  if (!/favicon|404|chrome-extension:/i.test(text)) errors.push(`console:${text}`);
});

const waitFor = async (fn, timeout = 15000, interval = 80) => {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < timeout) {
    last = await fn();
    if (last) return last;
    await page.waitForTimeout(interval);
  }
  throw new Error(`Timed out after ${timeout} ms; last=${JSON.stringify(last)}`);
};

await page.goto(url, { waitUntil: 'load', timeout: 60000 });
await waitFor(() => page.evaluate(() => Boolean(
  globalThis.__FD_RUNTIME_SHELL_204__?.build === 204 &&
  globalThis.__FD_BUILDING_VISIBLE_HIT_204__?.build === 204 &&
  globalThis.__FD_RALLY_POINT_AUTHORITY_204__?.build === 204 &&
  !document.getElementById('start-game')?.disabled
)), 30000);
await page.locator('#start-game').click();
await waitFor(() => page.evaluate(() => {
  const game = globalThis.__FD_DEBUG__?.game;
  const bridge = globalThis.__FD_STABLE_STATE165__?.bridge;
  return Boolean(game && bridge?.ready && !bridge.failed && Number(bridge.workerTick || 0) > 8);
}), 30000);

const buildingId = await page.evaluate(() => {
  const game = globalThis.__FD_DEBUG__.game;
  const building = game.buildings.find(item =>
    item?.alive && item.completed && item.team === 'player' && Array.isArray(item.stats?.produces) && item.stats.produces.length
  );
  if (!building) return null;
  game.centerCamera?.(building.x, building.y);
  if (game.camera) game.camera.zoom = Math.max(0.82, Math.min(1.02, Number(game.camera.zoom) || 0.9));
  game.clearSelection?.();
  game.uiDirty = true;
  game.render?.();
  return building.id;
});
if (!buildingId) throw new Error('No completed player production building is available');

const clickFixture = await waitFor(() => page.evaluate(id => {
  const game = globalThis.__FD_DEBUG__?.game;
  const api = globalThis.__FD_BUILDING_VISIBLE_HIT_204__;
  const building = game?.getEntity?.(id);
  const canvas = document.getElementById('game-canvas');
  const rect = canvas?.getBoundingClientRect?.();
  const bounds = building && game.getBuildingFigureScreenBounds193?.(building);
  if (!game || !api?.diagnostics?.().frameReady || !building || !canvas || !rect?.width || !bounds) return null;

  const toWorld = (x, y) => game.screenToWorld?.(x, y, 0) || game.screenToWorld?.(x, y);
  const toClient = (x, y) => ({
    x: rect.left + x * rect.width / canvas.width,
    y: rect.top + y * rect.height / canvas.height,
  });
  const insideCanvas = (x, y) => x >= 2 && y >= 2 && x < canvas.width - 2 && y < canvas.height * 0.70;
  let opaque = null;
  let transparent = null;
  const step = Math.max(2, Math.round(Math.min(bounds.width, bounds.height) / 48));
  for (let y = Math.ceil(bounds.y1 + 3); y <= Math.floor(bounds.y2 - 3); y += step) {
    for (let x = Math.ceil(bounds.x1 + 3); x <= Math.floor(bounds.x2 - 3); x += step) {
      if (!insideCanvas(x, y)) continue;
      const picked = api.pickAtCanvas(x, y);
      if (!opaque && String(picked?.id) === String(id)) opaque = { canvasX: x, canvasY: y, ...toClient(x, y) };
      if (!transparent && !picked) {
        const world = toWorld(x, y);
        let unitHit = null;
        try { unitHit = game.getUnitFigureHits140?.(world.x, world.y)?.[0]?.unit || null; } catch (_) {}
        if (!unitHit) transparent = { canvasX: x, canvasY: y, world, ...toClient(x, y) };
      }
      if (opaque && transparent) break;
    }
    if (opaque && transparent) break;
  }
  if (!opaque || !transparent) return null;

  game._fdSetSelectionBeforeProbe204 = game.setSelection;
  game._fdSelectionCalls204 = [];
  game.setSelection = function selectionProbe204(items, ...args) {
    this._fdSelectionCalls204.push((items || []).map(item => item?.id).filter(Boolean));
    return this._fdSetSelectionBeforeProbe204.call(this, items, ...args);
  };
  return {
    buildingId: id,
    opaque,
    transparent,
    bounds: { x1: bounds.x1, y1: bounds.y1, x2: bounds.x2, y2: bounds.y2, source: bounds.source },
    diagnostics: api.diagnostics(),
  };
}, buildingId), 7000, 120);

// This click is inside the historical broad model bounds but on a transparent
// pixel. There must be no transient call selecting the building at all.
await page.mouse.click(clickFixture.transparent.x, clickFixture.transparent.y, { button: 'left' });
await page.waitForTimeout(240);
const transparentClick = await page.evaluate(id => {
  const game = globalThis.__FD_DEBUG__?.game;
  const calls = (game?._fdSelectionCalls204 || []).map(ids => [...ids]);
  const selectedIds = (game?.selected || []).map(entity => entity?.id).filter(Boolean);
  const selectedBuildingCalls = calls.filter(ids => ids.includes(id));
  if (game?._fdSetSelectionBeforeProbe204) game.setSelection = game._fdSetSelectionBeforeProbe204;
  delete game?._fdSetSelectionBeforeProbe204;
  delete game?._fdSelectionCalls204;
  return {
    selectedIds,
    calls,
    selectedBuildingCalls,
    diagnostics: globalThis.__FD_BUILDING_VISIBLE_HIT_204__?.diagnostics?.(),
  };
}, buildingId);
if (transparentClick.selectedIds.length || transparentClick.selectedBuildingCalls.length ||
    Number(transparentClick.diagnostics?.broadHitsFiltered || 0) < 1) {
  throw new Error(`Transparent area still caused selection flicker: ${JSON.stringify({ clickFixture, transparentClick })}`);
}

// A real opaque model pixel must remain selectable with the same physical LMB.
await page.mouse.click(clickFixture.opaque.x, clickFixture.opaque.y, { button: 'left' });
const selected = await waitFor(() => page.evaluate(id => {
  const game = globalThis.__FD_DEBUG__?.game;
  const ids = (game?.selected || []).map(entity => entity?.id).filter(Boolean);
  return ids.length === 1 && String(ids[0]) === String(id) ? { ids } : null;
}, buildingId), 5000);

const rallyFixture = await page.evaluate(id => {
  const game = globalThis.__FD_DEBUG__.game;
  const bridge = globalThis.__FD_STABLE_STATE165__.bridge;
  const authority = globalThis.__FD_RALLY_POINT_AUTHORITY_204__;
  const building = game.getEntity(id);
  const canvas = document.getElementById('game-canvas');
  const rect = canvas.getBoundingClientRect();
  const canvasX = canvas.width * 0.57;
  const canvasY = canvas.height * 0.54;
  const world = game.screenToWorld?.(canvasX, canvasY, 0) || game.screenToWorld?.(canvasX, canvasY);
  const expected = game.findReachablePoint?.(world.x, world.y, 22) || world;
  return {
    buildingId: id,
    client: {
      x: rect.left + canvasX * rect.width / canvas.width,
      y: rect.top + canvasY * rect.height / canvas.height,
    },
    world,
    expected,
    oldPoint: building.rallyPoint ? { ...building.rallyPoint } : null,
    beforeSeq: Number(bridge.seq || 0),
    beforeAck: Number(bridge.lastAck || 0),
    beforeRoutes: Number(authority.diagnostics().rallyRoutes || 0),
    beforeFlagFrames: Number(authority.diagnostics().flagFrames || 0),
  };
}, buildingId);

await page.mouse.click(rallyFixture.client.x, rallyFixture.client.y, { button: 'right' });
const rallyResult = await waitFor(() => page.evaluate(expected => {
  const game = globalThis.__FD_DEBUG__?.game;
  const bridge = globalThis.__FD_STABLE_STATE165__?.bridge;
  const authority = globalThis.__FD_RALLY_POINT_AUTHORITY_204__;
  const building = game?.getEntity?.(expected.buildingId);
  const point = building?.rallyPoint;
  const diagnostics = authority?.diagnostics?.();
  const sentSeq = Number(bridge?.seq || 0);
  const ack = Number(bridge?.lastAck || 0);
  const flag = diagnostics?.lastFlagPoint;
  const synchronized = point && Math.hypot(point.x - expected.expected.x, point.y - expected.expected.y) < 2;
  const flagSynchronized = flag && String(flag.buildingId) === String(expected.buildingId) &&
    Math.hypot(flag.x - point.x, flag.y - point.y) < 0.5;
  if (sentSeq <= expected.beforeSeq || ack < sentSeq || !synchronized || !flagSynchronized ||
      Number(diagnostics?.rallyRoutes || 0) <= expected.beforeRoutes ||
      Number(diagnostics?.flagFrames || 0) <= expected.beforeFlagFrames) return null;
  return {
    sentSeq,
    ack,
    point: { x: point.x, y: point.y },
    selectedIds: (game.selected || []).map(entity => entity?.id).filter(Boolean),
    bridgeFailed: Boolean(bridge.failed),
    actionErrors: Number(bridge.actionErrors || 0),
    diagnostics,
    rightClick: globalThis.__FD_RIGHT_CLICK_AUTHORITY_197__?.diagnostics?.(),
  };
}, rallyFixture), 10000, 100);

if (rallyResult.selectedIds.length !== 1 || String(rallyResult.selectedIds[0]) !== String(buildingId) ||
    rallyResult.bridgeFailed || rallyResult.actionErrors || errors.length) {
  throw new Error(`Rally point physical route failed: ${JSON.stringify({ rallyFixture, rallyResult, errors })}`);
}

console.log(JSON.stringify({
  ok: true,
  buildingId,
  clickFixture,
  transparentClick,
  selected,
  rallyFixture,
  rallyResult,
  errors,
}));

await context.close();
await browser.close();
