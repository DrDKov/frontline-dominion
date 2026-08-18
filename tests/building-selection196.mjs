import { chromium, webkit, devices } from 'playwright';

const browserName = process.env.FD_BROWSER || 'chromium';
const url = process.env.FD_GAME_URL || 'http://127.0.0.1:8765/frontline-dominion/frontline-dominion.html?build=196';
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

const waitFor = async (fn, timeout = 18000, interval = 70) => {
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
  globalThis.__FD_DEBUG__?.startGame &&
  globalThis.__FD_BUILDING_SELECTION_OWNER_196__?.build === 196 &&
  globalThis.__FD_RUNTIME_SHELL_196__?.build === 196 &&
  document.documentElement.dataset.fdBuild === '196' &&
  !document.getElementById('start-game')?.disabled
)), 25000);
await page.locator('#start-game').click();
await waitFor(() => page.evaluate(() => {
  const game = globalThis.__FD_DEBUG__?.game;
  const bridge = globalThis.__FD_STABLE_STATE165__?.bridge;
  return Boolean(game && bridge?.ready && !bridge.failed && Number(bridge.workerTick || 0) >= 8);
}), 25000);

const fixture = await page.evaluate(() => {
  const game = globalThis.__FD_DEBUG__?.game;
  if (!game) return null;
  const building = game.buildings.find(item => item?.alive && item.team === 'player' && item.typeId === 'barracks') ||
    game.buildings.find(item => item?.alive && item.team === 'player');
  if (!building) return { error: 'no-player-building' };
  game.centerCamera?.(building.x, building.y);
  if (game.camera) game.camera.zoom = Math.max(0.86, Math.min(1.08, game.camera.zoom || 1));
  game.clearSelection?.();
  game.uiDirty = true;
  game.updateUI?.(true);
  const canvas = document.getElementById('game-canvas');
  const rect = canvas.getBoundingClientRect();
  const bounds = game.getBuildingFigureScreenBounds193?.(building);
  if (!bounds) return { error: 'no-building-bounds' };
  return {
    buildingId: building.id,
    point: {
      x: rect.left + ((bounds.x1 + bounds.x2) * 0.5) * rect.width / canvas.width,
      y: rect.top + (bounds.y1 + bounds.height * 0.57) * rect.height / canvas.height,
    },
    bounds: {
      x1: bounds.x1,
      y1: bounds.y1,
      x2: bounds.x2,
      y2: bounds.y2,
      width: bounds.width,
      height: bounds.height,
      source: bounds.source,
    },
  };
});
if (!fixture || fixture.error) throw new Error(`building fixture unavailable: ${JSON.stringify(fixture)}`);

if (browserName === 'webkit') await page.touchscreen.tap(fixture.point.x, fixture.point.y);
else await page.mouse.click(fixture.point.x, fixture.point.y, { button: 'left' });

const selected = await waitFor(() => page.evaluate(id => {
  const game = globalThis.__FD_DEBUG__?.game;
  const owner = globalThis.__FD_BUILDING_SELECTION_OWNER_196__;
  const building = game?.getEntity?.(id);
  const ids = (game?.selected || []).map(entity => entity?.id).filter(Boolean);
  if (!building || ids[0] !== id) return null;
  return {
    ids,
    unique: new Set(ids).size,
    objectSelectedFlag: Boolean(building.selected),
    owner: owner ? { ...owner.state, lastSelectedIds: [...owner.state.lastSelectedIds] } : null,
  };
}, fixture.buildingId), 5000);
if (selected.ids.length !== 1 || selected.unique !== 1 || selected.objectSelectedFlag || !selected.owner) {
  throw new Error(`selected building still owns a visual model flag: ${JSON.stringify({ fixture, selected })}`);
}

await page.waitForTimeout(320);
const renderGuard = await page.evaluate(id => {
  const game = globalThis.__FD_DEBUG__?.game;
  const owner = globalThis.__FD_BUILDING_SELECTION_OWNER_196__;
  const building = game?.getEntity?.(id);
  if (!game || !owner || !building) return null;
  const beforeOverlay = Number(owner.state.overlayDraws || 0);
  const hadOwnDraw = Object.prototype.hasOwnProperty.call(game, 'drawBuilding3D');
  const originalDraw = game.drawBuilding3D;
  const observedSelectedFlags = [];
  let targetCalls = 0;
  game.drawBuilding3D = function selectionModelProbe196(target, ...rest) {
    if (String(target?.id) === String(id)) {
      targetCalls += 1;
      observedSelectedFlags.push(Boolean(target.selected));
    }
    return originalDraw.call(this, target, ...rest);
  };
  try { game.render?.(); }
  finally {
    if (hadOwnDraw) game.drawBuilding3D = originalDraw;
    else delete game.drawBuilding3D;
  }
  return {
    selectedIds: (game.selected || []).map(entity => entity?.id).filter(Boolean),
    objectSelectedFlag: Boolean(building.selected),
    targetCalls,
    observedSelectedFlags,
    overlayDelta: Number(owner.state.overlayDraws || 0) - beforeOverlay,
    flagsCleared: Number(owner.state.flagsCleared || 0),
  };
}, fixture.buildingId);
if (!renderGuard || renderGuard.selectedIds[0] !== fixture.buildingId || renderGuard.objectSelectedFlag ||
    !renderGuard.targetCalls || renderGuard.observedSelectedFlags.some(Boolean) || renderGuard.overlayDelta < 1) {
  throw new Error(`single-model building render ownership failed: ${JSON.stringify({ fixture, selected, renderGuard })}`);
}

const deselected = await page.evaluate(id => {
  const game = globalThis.__FD_DEBUG__?.game;
  const building = game?.getEntity?.(id);
  game?.clearSelection?.();
  game?.render?.();
  return {
    selectedIds: (game?.selected || []).map(entity => entity?.id).filter(Boolean),
    objectSelectedFlag: Boolean(building?.selected),
  };
}, fixture.buildingId);
if (deselected.selectedIds.length || deselected.objectSelectedFlag) {
  throw new Error(`building selection did not clear cleanly: ${JSON.stringify(deselected)}`);
}

const finalState = await page.evaluate(() => {
  const bridge = globalThis.__FD_STABLE_STATE165__?.bridge;
  const owner = globalThis.__FD_BUILDING_SELECTION_OWNER_196__;
  return {
    bridgeFailed: Boolean(bridge?.failed),
    actionErrors: Number(bridge?.actionErrors || 0),
    workerTick: Number(bridge?.workerTick || 0),
    owner: owner ? { ...owner.state, lastSelectedIds: [...owner.state.lastSelectedIds] } : null,
  };
});
if (finalState.bridgeFailed || finalState.actionErrors || errors.length) {
  throw new Error(`building selection regression damaged runtime: ${JSON.stringify({ finalState, errors })}`);
}

console.log(JSON.stringify({ ok: true, browserName, fixture, selected, renderGuard, deselected, finalState, errors }));
await context.close();
await browser.close();
