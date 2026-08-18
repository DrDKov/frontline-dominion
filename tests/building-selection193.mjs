import { chromium, webkit, devices } from 'playwright';

const browserName = process.env.FD_BROWSER || 'chromium';
const url = process.env.FD_GAME_URL || 'http://127.0.0.1:8765/frontline-dominion/frontline-dominion.html?build=193';
const browserType = browserName === 'webkit' ? webkit : chromium;
const browser = await browserType.launch({ headless: true });
const context = browserName === 'webkit'
  ? await browser.newContext({ ...devices['iPad Pro 11'] })
  : await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(String(error?.stack || error)));
page.on('console', message => {
  if (message.type() === 'error' && !/favicon|404/i.test(message.text())) errors.push(`console:${message.text()}`);
});

async function waitFor(fn, timeout = 15000, interval = 70) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const value = await fn();
    if (value) return value;
    await page.waitForTimeout(interval);
  }
  throw new Error(`Timed out after ${timeout} ms`);
}

await page.goto(url, { waitUntil: 'load', timeout: 60000 });
await waitFor(() => page.evaluate(() => Boolean(
  globalThis.__FD_DEBUG__?.startGame &&
  globalThis.__FD_BUILDING_SELECTION_193__?.build === 193 &&
  document.documentElement.dataset.fdBuild === '193' &&
  !document.getElementById('start-game')?.disabled
)), 20000);
await page.locator('#start-game').click();

await waitFor(() => page.evaluate(() => {
  const game = globalThis.__FD_DEBUG__?.game;
  const bridge = globalThis.__FD_STABLE_STATE165__?.bridge;
  return Boolean(game && bridge?.ready && !bridge.failed && Number(bridge.workerTick || 0) >= 8);
}), 20000);

const fixture = await page.evaluate(() => {
  const game = globalThis.__FD_DEBUG__?.game;
  const api = globalThis.__FD_BUILDING_SELECTION_193__;
  if (!game || !api) return null;
  const building = game.buildings.find(item => item?.alive && item.team === 'player' && item.typeId === 'barracks') ||
    game.buildings.find(item => item?.alive && item.team === 'player');
  if (!building) return { error: 'no player building' };
  game.centerCamera?.(building.x, building.y);
  if (game.camera) game.camera.zoom = Math.max(0.86, Math.min(1.08, game.camera.zoom || 1));
  game.clearSelection?.();
  game.uiDirty = true;
  game.updateUI?.(true);
  const canvas = document.getElementById('game-canvas');
  const rect = canvas.getBoundingClientRect();
  const bounds = game.getBuildingFigureScreenBounds193?.(building);
  if (!bounds) return { error: 'no building bounds' };
  const toCss = (x, y) => ({
    x: rect.left + x * rect.width / canvas.width,
    y: rect.top + y * rect.height / canvas.height,
  });
  const points = [
    toCss((bounds.x1 + bounds.x2) * .5, bounds.y1 + bounds.height * .55),
    toCss(bounds.x1 + bounds.width * .38, bounds.y1 + bounds.height * .62),
    toCss(bounds.x1 + bounds.width * .62, bounds.y1 + bounds.height * .62),
  ];
  const ids = game.buildings.filter(item => item?.alive).map(item => item.id);
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  return {
    buildingId: building.id,
    typeId: building.typeId,
    bounds: { x1: bounds.x1, y1: bounds.y1, x2: bounds.x2, y2: bounds.y2, width: bounds.width, height: bounds.height, source: bounds.source },
    points,
    canvas: { width: canvas.width, height: canvas.height, cssWidth: rect.width, cssHeight: rect.height },
    duplicateIds: [...new Set(duplicates)],
  };
});
if (!fixture || fixture.error) throw new Error(`building fixture unavailable: ${JSON.stringify(fixture)}`);

const attempts = [];
for (const point of fixture.points) {
  await page.evaluate(() => {
    const game = globalThis.__FD_DEBUG__?.game;
    game?.clearSelection?.();
    if (game) { game.uiDirty = true; game.updateUI?.(true); }
  });
  await page.mouse.click(point.x, point.y, { button: 'left' });
  const selected = await waitFor(() => page.evaluate(expectedId => {
    const game = globalThis.__FD_DEBUG__?.game;
    if (!game) return null;
    const ids = (game.selected || []).map(entity => entity?.id).filter(Boolean);
    if (!ids.length) return null;
    return {
      ids,
      unique: new Set(ids).size,
      selectedBuilding: Boolean(game.getEntity?.(expectedId)?.selected),
      directSelections: Number(globalThis.__FD_BUILDING_SELECTION_193__?.state?.directSelections || 0),
      lastBuildingId: globalThis.__FD_BUILDING_SELECTION_193__?.state?.lastBuildingId || null,
      boundsSource: globalThis.__FD_BUILDING_SELECTION_193__?.state?.lastBoundsSource || null,
    };
  }, fixture.buildingId), 3000);
  if (selected.ids.length !== 1 || selected.unique !== 1 || selected.ids[0] !== fixture.buildingId || !selected.selectedBuilding) {
    throw new Error(`single building click failed: ${JSON.stringify({ point, selected, fixture })}`);
  }
  attempts.push(selected);
}

// Prove the full-model draw guard itself, without altering simulation state:
// insert one temporary duplicate array reference for one render and restore it
// immediately. The second full draw for the same building id must be skipped.
const drawGuard = await page.evaluate(buildingId => {
  const game = globalThis.__FD_DEBUG__?.game;
  const api = globalThis.__FD_BUILDING_SELECTION_193__;
  const building = game?.getEntity?.(buildingId);
  if (!game || !api || !building) return null;
  const before = Number(api.state.duplicateBuildingDrawsPrevented || 0);
  game.buildings.push(building);
  try { game.render?.(); }
  finally {
    const index = game.buildings.lastIndexOf(building);
    if (index >= 0) game.buildings.splice(index, 1);
  }
  return {
    before,
    after: Number(api.state.duplicateBuildingDrawsPrevented || 0),
    aliveBuildings: game.buildings.filter(item => item?.alive).length,
  };
}, fixture.buildingId);
if (!drawGuard || drawGuard.after <= drawGuard.before) {
  throw new Error(`duplicate building draw guard failed: ${JSON.stringify(drawGuard)}`);
}

const finalState = await page.evaluate(() => {
  const game = globalThis.__FD_DEBUG__?.game;
  const api = globalThis.__FD_BUILDING_SELECTION_193__;
  const bridge = globalThis.__FD_STABLE_STATE165__?.bridge;
  return {
    selectedIds: (game?.selected || []).map(entity => entity?.id).filter(Boolean),
    duplicateSelectionIdsPrevented: Number(api?.state?.duplicateSelectionIdsPrevented || 0),
    duplicateBuildingDrawsPrevented: Number(api?.state?.duplicateBuildingDrawsPrevented || 0),
    workerTick: Number(bridge?.workerTick || 0),
    bridgeFailed: Boolean(bridge?.failed),
    actionErrors: Number(bridge?.actionErrors || 0),
  };
});
if (finalState.bridgeFailed || finalState.actionErrors !== 0) throw new Error(`simulation damaged by selection test: ${JSON.stringify(finalState)}`);
if (errors.length) throw new Error(`browser errors: ${errors.join(' | ')}`);

console.log(JSON.stringify({ ok: true, browserName, fixture, attempts, drawGuard, finalState }));
await browser.close();
