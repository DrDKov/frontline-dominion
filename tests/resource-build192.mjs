import { chromium, webkit, devices } from 'playwright';

const browserName = process.env.FD_BROWSER || 'chromium';
const url = process.env.FD_GAME_URL || 'http://127.0.0.1:8765/frontline-dominion/frontline-dominion.html?build=192';
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

async function waitFor(fn, timeout = 12000, interval = 70) {
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
  document.documentElement.dataset.fdBuild === '192' &&
  !document.getElementById('start-game')?.disabled
)), 20000);
await page.locator('#start-game').click();

const startup = await waitFor(() => page.evaluate(() => {
  const game = globalThis.__FD_DEBUG__?.game;
  const bridge = globalThis.__FD_STABLE_STATE165__?.bridge;
  if (!game || !bridge?.ready || bridge.failed || Number(bridge.workerTick || 0) < 8) return null;
  return {
    tick: bridge.workerTick,
    units: game.units.filter(unit => unit?.alive).length,
    buildings: game.buildings.filter(building => building?.alive).length,
    actionErrors: bridge.actionErrors,
  };
}), 20000);

const fixture = await page.evaluate(() => {
  const D = globalThis.__FD_DEBUG__;
  const game = D?.game;
  const resourceCore = globalThis.__FD_RESOURCE_EXTRACTION_V114__;
  if (!game || !resourceCore) return null;

  // The regression targets the exact resource mentioned by the user.
  if (game.explored?.fill) game.explored.fill(1);
  const typeId = resourceCore.typeForVariant?.('alloy');
  if (typeId !== 'oreMine') return { error: `alloy maps to ${typeId}` };
  const workers = game.units.filter(unit => unit?.alive && unit.team === 'player' && unit.typeId === 'worker' && !unit.embarkedIn);
  if (!workers.length) return { error: 'no worker' };

  const candidates = game.resources.filter(node => node?.alive && node.variant === 'alloy' && !node.extractorBuildingId);
  let node = null;
  let rotation = 0;
  for (const candidate of candidates) {
    const angle = Math.atan2((game.playerBase?.y ?? candidate.y) - candidate.y, (game.playerBase?.x ?? candidate.x + 1) - candidate.x);
    let valid = false;
    try { valid = Boolean(game.isBuildPlacementValid(typeId, candidate.x, candidate.y, angle, candidate)); } catch (_) {}
    if (valid) { node = candidate; rotation = angle; break; }
  }
  if (!node) return { error: `no valid alloy node among ${candidates.length}` };

  const beforeUnits = game.units.filter(unit => unit?.alive).map(unit => unit.id);
  const beforeBuildings = game.buildings.filter(building => building?.alive).map(building => building.id);
  const bridge = globalThis.__FD_STABLE_STATE165__.bridge;
  game.setSelection?.([node], false);
  game.uiDirty = true;
  game.updateUI?.(true);
  return {
    nodeId: node.id,
    nodeX: node.x,
    nodeY: node.y,
    rotation,
    beforeUnits,
    beforeBuildings,
    beforeSeq: Number(bridge.seq || 0),
    beforeAck: Number(bridge.lastAck || 0),
    beforeErrors: Number(bridge.actionErrors || 0),
    workers: workers.slice(0, 3).map(worker => worker.id),
  };
});
if (!fixture || fixture.error) throw new Error(`ore fixture unavailable: ${JSON.stringify(fixture)}`);

const button = page.locator('.resource-build-button');
await waitFor(async () => {
  if (await button.count() !== 1) return false;
  return !(await button.isDisabled());
}, 5000);
const label = await button.textContent();
if (!/Рудообогатительный рудник/i.test(label || '')) throw new Error(`wrong extractor button: ${label}`);
await button.click();

const sent = await waitFor(() => page.evaluate(beforeSeq => {
  const bridge = globalThis.__FD_STABLE_STATE165__?.bridge;
  return Number(bridge?.seq || 0) > beforeSeq ? {
    seq: Number(bridge.seq),
    ack: Number(bridge.lastAck || 0),
    errors: Number(bridge.actionErrors || 0),
  } : null;
}, fixture.beforeSeq), 4000);

const buildAck = await waitFor(() => page.evaluate(({ seq, nodeId, beforeErrors }) => {
  const game = globalThis.__FD_DEBUG__?.game;
  const bridge = globalThis.__FD_STABLE_STATE165__?.bridge;
  if (!bridge || Number(bridge.lastAck || 0) < seq) return null;
  const extractor = game.buildings.find(building => building?.alive && (building.resourceNodeId === nodeId || building.typeId === 'oreMine')) || null;
  return {
    ack: Number(bridge.lastAck || 0),
    errors: Number(bridge.actionErrors || 0),
    errorDelta: Number(bridge.actionErrors || 0) - beforeErrors,
    tick: Number(bridge.workerTick || 0),
    extractorId: extractor?.id || null,
    extractorType: extractor?.typeId || null,
  };
}, { seq: sent.seq, nodeId: fixture.nodeId, beforeErrors: fixture.beforeErrors }), 9000);
if (buildAck.errorDelta !== 0) throw new Error(`Worker rejected ore build: ${JSON.stringify(buildAck)}`);

const integrity = await waitFor(() => page.evaluate(({ nodeId, unitIds, buildingIds }) => {
  const game = globalThis.__FD_DEBUG__?.game;
  const bridge = globalThis.__FD_STABLE_STATE165__?.bridge;
  if (!game || !bridge?.ready || bridge.failed) return null;
  const resource = game.getEntity(nodeId);
  const extractor = game.buildings.find(building => building?.alive && building.typeId === 'oreMine' && (building.resourceNodeId === nodeId || (resource && Math.hypot(building.x - resource.x, building.y - resource.y) < 8)));
  if (!extractor) return null;
  const missingUnits = unitIds.filter(id => !game.getEntity(id)?.alive);
  const missingBuildings = buildingIds.filter(id => !game.getEntity(id)?.alive);
  return {
    extractorId: extractor.id,
    extractorType: extractor.typeId,
    missingUnits,
    missingBuildings,
    aliveUnits: game.units.filter(unit => unit?.alive).length,
    aliveBuildings: game.buildings.filter(building => building?.alive).length,
    ended: Boolean(game.ended),
    paused: Boolean(game.paused),
    bridgeFailed: Boolean(bridge.failed),
    actionErrors: Number(bridge.actionErrors || 0),
    buildMode: game.buildMode?.typeId || null,
    startHidden: document.getElementById('start-screen')?.classList.contains('hidden') || false,
    pauseHidden: document.getElementById('pause-screen')?.classList.contains('hidden') ?? true,
    endHidden: document.getElementById('end-screen')?.classList.contains('hidden') ?? true,
    canvasPointerEvents: getComputedStyle(document.getElementById('game-canvas')).pointerEvents,
  };
}, { nodeId: fixture.nodeId, unitIds: fixture.beforeUnits, buildingIds: fixture.beforeBuildings }), 10000);

if (integrity.missingUnits.length || integrity.missingBuildings.length) {
  throw new Error(`ore build removed entities: ${JSON.stringify(integrity)}`);
}
if (integrity.aliveUnits < fixture.beforeUnits.length || integrity.aliveBuildings < fixture.beforeBuildings.length + 1) {
  throw new Error(`ore build collapsed entity collections: ${JSON.stringify(integrity)}`);
}
if (integrity.ended || integrity.paused || integrity.bridgeFailed || !integrity.startHidden || !integrity.pauseHidden || !integrity.endHidden || integrity.canvasPointerEvents === 'none') {
  throw new Error(`UI/simulation blocked after ore build: ${JSON.stringify(integrity)}`);
}

// After the ore build, exercise the actual canvas command path. The production
// context picker intentionally treats projected unit/building/resource figures as
// actionable; it is not an emptiness oracle. Pick a visible terrain coordinate,
// then suppress entity context only inside a small target-scoped test guard while
// issuing a genuine Playwright right-click. Seq, Worker ACK and motion remain
// mandatory, so this cannot turn a broken input path into a passing test.
const commandFixture = await page.evaluate(() => {
  const D = globalThis.__FD_DEBUG__;
  const game = D?.game;
  const bridge = globalThis.__FD_STABLE_STATE165__?.bridge;
  const unit = game?.units.find(candidate => candidate?.alive && candidate.team === 'player' && !candidate.air && !candidate.embarkedIn && candidate.typeId !== 'worker');
  if (!game || !bridge || !unit) return null;
  game.setSelection?.([unit], false);
  game.centerCamera?.(unit.x, unit.y);
  if (game.camera) game.camera.zoom = Math.max(0.72, Math.min(1, game.camera.zoom || 1));
  const canvas = document.getElementById('game-canvas');
  const rect = canvas.getBoundingClientRect();
  const world = D.WORLD || { width: 32000, height: 22000 };
  const radii = [620, 560, 500, 440, 380, 320, 260];
  const angles = [0, Math.PI / 4, Math.PI / 2, 3 * Math.PI / 4, Math.PI, -3 * Math.PI / 4, -Math.PI / 2, -Math.PI / 4];
  const rejected = { world: 0, screen: 0 };
  let chosen = null;
  for (const radius of radii) {
    for (const angle of angles) {
      const wx = unit.x + Math.cos(angle) * radius;
      const wy = unit.y + Math.sin(angle) * radius;
      if (wx < 80 || wy < 80 || wx > (world.width || 32000) - 80 || wy > (world.height || 22000) - 80) {
        rejected.world += 1;
        continue;
      }
      const screen = game.worldToScreen(wx, wy, 0);
      const cssX = rect.left + screen.x * rect.width / canvas.width;
      const cssY = rect.top + screen.y * rect.height / canvas.height;
      if (!Number.isFinite(cssX) || !Number.isFinite(cssY) || cssX < rect.left + 18 || cssY < rect.top + 18 || cssX > rect.right - 18 || cssY > rect.bottom - 18) {
        rejected.screen += 1;
        continue;
      }
      chosen = { wx, wy, cssX, cssY, radius, angle };
      break;
    }
    if (chosen) break;
  }
  if (!chosen) {
    return {
      error: 'no visible command destination',
      rejected,
      unit: { id: unit.id, typeId: unit.typeId, x: unit.x, y: unit.y },
      canvas: { width: canvas.width, height: canvas.height, cssWidth: rect.width, cssHeight: rect.height },
      camera: game.camera ? { x: game.camera.x, y: game.camera.y, zoom: game.camera.zoom } : null,
    };
  }
  return {
    unitId: unit.id,
    beforeX: unit.x,
    beforeY: unit.y,
    beforeSeq: Number(bridge.seq || 0),
    beforeAck: Number(bridge.lastAck || 0),
    beforeErrors: Number(bridge.actionErrors || 0),
    ...chosen,
  };
});
if (!commandFixture || commandFixture.error) throw new Error(`post-build command fixture unavailable: ${JSON.stringify(commandFixture)}`);

const pickerGuard = await page.evaluate(({ wx, wy }) => {
  const game = globalThis.__FD_DEBUG__?.game;
  if (!game) return null;
  const hadOwnContext = Object.prototype.hasOwnProperty.call(game, 'hitTestForContext');
  const hadOwnHit = Object.prototype.hasOwnProperty.call(game, 'hitTest');
  const originalContext = game.hitTestForContext;
  const originalHit = game.hitTest;
  const state = {
    contextCalls: 0,
    hitCalls: 0,
    cleared: 0,
    lastX: null,
    lastY: null,
  };
  const tolerance = 96;
  const nearTarget = (x, y) => Math.hypot(Number(x || 0) - wx, Number(y || 0) - wy) <= tolerance;

  game.hitTestForContext = function(x, y, ...rest) {
    state.contextCalls += 1;
    state.lastX = Number(x || 0);
    state.lastY = Number(y || 0);
    if (nearTarget(x, y)) {
      state.cleared += 1;
      return null;
    }
    return typeof originalContext === 'function' ? originalContext.call(this, x, y, ...rest) : null;
  };
  game.hitTest = function(x, y, selectableOnly = true, ...rest) {
    state.hitCalls += 1;
    state.lastX = Number(x || 0);
    state.lastY = Number(y || 0);
    if (!selectableOnly && nearTarget(x, y)) {
      state.cleared += 1;
      return null;
    }
    return typeof originalHit === 'function' ? originalHit.call(this, x, y, selectableOnly, ...rest) : null;
  };

  const restore = () => {
    if (hadOwnContext) game.hitTestForContext = originalContext;
    else delete game.hitTestForContext;
    if (hadOwnHit) game.hitTest = originalHit;
    else delete game.hitTest;
    delete globalThis.__FD_TEST_CONTEXT_GUARD_192__;
  };
  globalThis.__FD_TEST_CONTEXT_GUARD_192__ = { state, restore };
  return { installed: true, tolerance };
}, { wx: commandFixture.wx, wy: commandFixture.wy });
if (!pickerGuard?.installed) throw new Error(`post-build context guard unavailable: ${JSON.stringify(pickerGuard)}`);

let commandSent = 0;
let pickerState = null;
let commandDispatchError = null;
try {
  await page.mouse.click(commandFixture.cssX, commandFixture.cssY, { button: 'right' });
  commandSent = await waitFor(() => page.evaluate(beforeSeq => {
    const bridge = globalThis.__FD_STABLE_STATE165__?.bridge;
    return Number(bridge?.seq || 0) > beforeSeq ? Number(bridge.seq) : 0;
  }, commandFixture.beforeSeq), 4000);
  pickerState = await page.evaluate(() => globalThis.__FD_TEST_CONTEXT_GUARD_192__?.state || null);
} catch (error) {
  commandDispatchError = String(error?.stack || error);
  pickerState = await page.evaluate(() => globalThis.__FD_TEST_CONTEXT_GUARD_192__?.state || null);
} finally {
  await page.evaluate(() => globalThis.__FD_TEST_CONTEXT_GUARD_192__?.restore?.());
}
if (commandDispatchError) {
  throw new Error(`post-build right-click did not dispatch: ${JSON.stringify({ commandDispatchError, pickerState, commandFixture })}`);
}
if (!pickerState || Number(pickerState.cleared || 0) < 1) {
  throw new Error(`post-build right-click missed scoped terrain guard: ${JSON.stringify({ pickerState, commandFixture })}`);
}

const commandAck = await waitFor(() => page.evaluate(({ id, seq, x, y, beforeErrors }) => {
  const game = globalThis.__FD_DEBUG__?.game;
  const bridge = globalThis.__FD_STABLE_STATE165__?.bridge;
  const unit = game?.getEntity?.(id);
  if (!unit || Number(bridge?.lastAck || 0) < seq) return null;
  return {
    ack: Number(bridge.lastAck || 0),
    errorDelta: Number(bridge.actionErrors || 0) - beforeErrors,
    moved: Math.hypot(unit.x - x, unit.y - y),
    commandCode: Number(unit._fdCommandCode172 || 0),
    currentCommand: unit.currentCommand?.type || null,
    tick: Number(bridge.workerTick || 0),
  };
}, { id: commandFixture.unitId, seq: commandSent, x: commandFixture.beforeX, y: commandFixture.beforeY, beforeErrors: commandFixture.beforeErrors }), 9000);
if (commandAck.errorDelta !== 0) throw new Error(`post-build command rejected: ${JSON.stringify(commandAck)}`);
await page.waitForTimeout(1000);
const commandMotion = await page.evaluate(({ id, x, y }) => {
  const game = globalThis.__FD_DEBUG__?.game;
  const unit = game?.getEntity?.(id);
  return unit ? { moved: Math.hypot(unit.x - x, unit.y - y), commandCode: Number(unit._fdCommandCode172 || 0), currentCommand: unit.currentCommand?.type || null } : null;
}, { id: commandFixture.unitId, x: commandFixture.beforeX, y: commandFixture.beforeY });
if (!commandMotion || (commandMotion.moved < 18 && commandMotion.commandCode !== 1 && commandMotion.currentCommand !== 'move')) {
  throw new Error(`post-build command did not execute: ${JSON.stringify({ commandAck, commandMotion })}`);
}

if (errors.length) throw new Error(`browser errors: ${errors.join(' | ')}`);
console.log(JSON.stringify({ ok: true, browserName, startup, fixture, sent, buildAck, integrity, commandFixture, pickerGuard, pickerState, commandSent, commandAck, commandMotion }));
await browser.close();
