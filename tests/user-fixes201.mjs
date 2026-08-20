import { chromium } from 'playwright';

const url = process.env.FD_GAME_URL || 'http://127.0.0.1:8765/frontline-dominion/frontline-dominion.html?build=201';
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
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

const workerDiagnostics = () => page.evaluate(async () => {
  const bridge = globalThis.__FD_STABLE_STATE165__?.bridge;
  if (!bridge?.worker) return null;
  const requestId = `build201-${Date.now()}-${Math.random()}`;
  return await new Promise(resolve => {
    const key = `diag:${requestId}`;
    const timer = setTimeout(() => {
      bridge.pendingSaves.delete(key);
      resolve(null);
    }, 3000);
    bridge.pendingSaves.set(key, { resolve(message) { clearTimeout(timer); resolve(message); } });
    bridge.worker.postMessage({ type: 'diagnosticsRequest', requestId });
  });
});

await page.goto(url, { waitUntil: 'load', timeout: 60000 });
await waitFor(() => page.evaluate(() => Boolean(
  globalThis.__FD_RUNTIME_SHELL_201__?.build === 201 &&
  globalThis.__FD_BUILDING_MODEL_HIT_201__?.build === 201 &&
  globalThis.__FD_GROUP_MOVEMENT_201__?.build === 201 &&
  !document.getElementById('start-game')?.disabled
)), 30000);
await page.locator('#start-game').click();
await waitFor(() => page.evaluate(() => {
  const game = globalThis.__FD_DEBUG__?.game;
  const bridge = globalThis.__FD_STABLE_STATE165__?.bridge;
  return Boolean(game && bridge?.ready && !bridge.failed && Number(bridge.workerTick || 0) > 8);
}), 30000);

const selectedBuilding = await page.evaluate(() => {
  const game = globalThis.__FD_DEBUG__.game;
  const building = (game.buildings || []).find(item =>
    item?.alive && item.team === 'player' && item.completed &&
    (!game.isOnScreen || game.isOnScreen(item.x, item.y, (item.radius || 30) + 180))
  );
  if (!building) return { error: 'visible-player-building-missing' };
  game.setSelection([building], false);
  game.uiDirty = true;
  return { id: building.id };
});
if (selectedBuilding.error) throw new Error(JSON.stringify(selectedBuilding));

await waitFor(() => page.evaluate(id => {
  const contour = globalThis.__FD_BUILDING_SELECTION_CONTOUR_200__?.diagnostics?.();
  const game = globalThis.__FD_DEBUG__?.game;
  return Boolean(game?.selected?.some(entity => entity.id === id) && contour?.lastBuildingIds?.includes(id) && contour?.outlineFrames > 0);
}, selectedBuilding.id), 12000);

const transparentMiss = await page.evaluate(id => {
  const D = globalThis.__FD_DEBUG__;
  const game = D.game;
  const building = game.getEntity(id);
  const contour = globalThis.__FD_BUILDING_SELECTION_CONTOUR_200__;
  const canvas = document.getElementById('game-canvas');
  const rect = canvas.getBoundingClientRect();
  const bounds = game.getBuildingFigureScreenBounds193(building);
  if (!bounds) return { error: 'building-bounds-missing' };
  const plainBounds = {
    x1: bounds.x1, y1: bounds.y1, x2: bounds.x2, y2: bounds.y2,
    width: bounds.width, height: bounds.height, source: bounds.source,
  };
  const x1 = Math.max(2, Math.floor(bounds.x1));
  const y1 = Math.max(2, Math.floor(bounds.y1));
  const x2 = Math.min(canvas.width - 3, Math.ceil(bounds.x2));
  const y2 = Math.min(canvas.height - 3, Math.ceil(bounds.y2));
  const neighborOffsets = [[4, 0], [-4, 0], [0, 4], [0, -4], [7, 0], [-7, 0], [0, 7], [0, -7], [5, 5], [-5, 5], [5, -5], [-5, -5]];
  for (let y = y1; y <= y2; y += 2) {
    for (let x = x1; x <= x2; x += 2) {
      if (contour.alphaAtCanvas(x, y, 1) !== false) continue;
      if (!neighborOffsets.some(([dx, dy]) => contour.alphaAtCanvas(x + dx, y + dy, 0) === true)) continue;
      const cssX = rect.left + x * rect.width / canvas.width;
      const cssY = rect.top + y * rect.height / canvas.height;
      if (document.elementFromPoint(cssX, cssY) !== canvas) continue;
      const world = game.screenToWorld(x, y, 0);
      if (!world || game.getUnitFigureHits140?.(world.x, world.y)?.length) continue;
      if (game.getBuildingFigureHits193?.(world.x, world.y)?.length) continue;
      if (game.hitTest?.(world.x, world.y, true)) continue;
      return { cssX, cssY, world, canvasX: x, canvasY: y, bounds: plainBounds };
    }
  }
  return { error: 'near-model-transparent-pixel-missing', bounds: plainBounds, contour: contour.diagnostics() };
}, selectedBuilding.id);
if (transparentMiss.error) throw new Error(`Could not build exact deselection fixture: ${JSON.stringify(transparentMiss)}`);

await page.mouse.click(transparentMiss.cssX, transparentMiss.cssY, { button: 'left' });
const deselected = await waitFor(() => page.evaluate(id => {
  const game = globalThis.__FD_DEBUG__?.game;
  const hit = globalThis.__FD_BUILDING_MODEL_HIT_201__?.state;
  if (game?.selected?.some(entity => entity.id === id)) return null;
  return { selectedIds: (game?.selected || []).map(entity => entity.id), hit: { ...hit } };
}, selectedBuilding.id), 5000);
if (!deselected.hit.figureMissesFiltered && !deselected.hit.hitTestsFiltered) {
  throw new Error(`Exact building miss was not exercised: ${JSON.stringify(deselected)}`);
}

const groupFixture = await page.evaluate(() => {
  const D = globalThis.__FD_DEBUG__;
  const game = D.game;
  const bridge = globalThis.__FD_STABLE_STATE165__.bridge;
  const units = game.units.filter(unit => unit?.alive && unit.team === 'player' && !unit.air && !unit.embarkedIn).slice(0, 4);
  if (units.length < 3) return { error: 'ground-group-missing', count: units.length };
  game.setSelection(units, false);
  const center = units.reduce((sum, unit) => ({ x: sum.x + unit.x / units.length, y: sum.y + unit.y / units.length }), { x: 0, y: 0 });
  const target = { x: Math.min(D.WORLD.width - 300, center.x + 1450), y: Math.min(D.WORLD.height - 300, center.y + 420) };
  const before = units.map(unit => ({ id: unit.id, x: unit.x, y: unit.y }));
  const seq = Number(bridge.seq || 0);
  const issued = game.issueMove(target.x, target.y, false);
  return { ids: units.map(unit => unit.id), before, target, issued, seq, sentSeq: Number(bridge.seq || 0) };
});
if (groupFixture.error || !groupFixture.issued || groupFixture.sentSeq <= groupFixture.seq) {
  throw new Error(`Free group command was not routed: ${JSON.stringify(groupFixture)}`);
}

const freeMoved = await waitFor(() => page.evaluate(expected => {
  const game = globalThis.__FD_DEBUG__?.game;
  const bridge = globalThis.__FD_STABLE_STATE165__?.bridge;
  const units = expected.before.map(item => game?.getEntity?.(item.id)).filter(Boolean);
  const moved = units.map((unit, index) => Math.hypot(unit.x - expected.before[index].x, unit.y - expected.before[index].y));
  const attachedFormation = [...(game?.formations?.values?.() || [])].find(group => expected.ids.every(id => group.unitIds?.includes(id)));
  if (Number(bridge?.lastAck || 0) < expected.sentSeq || moved.some(value => value < 12) || attachedFormation) return null;
  return { moved, ack: Number(bridge.lastAck), formations: game.formations.size };
}, groupFixture), 10000);

const freeDiagnostics = await workerDiagnostics();
const freeState = freeDiagnostics?.groupMovement201;
if (!freeState || freeState.lastMode !== 'free' || freeState.freeOrders < 1 || new Set(freeState.lastEndpoints.map(point => `${Math.round(point.x)}:${Math.round(point.y)}`)).size < groupFixture.ids.length) {
  throw new Error(`Authoritative free-group endpoints are invalid: ${JSON.stringify(freeDiagnostics)}`);
}

await page.locator('[data-selection-tab="formation"]').click();
await page.locator('[data-formation-mode="line"]').click();
const lineIssued = await page.evaluate(previous => {
  const D = globalThis.__FD_DEBUG__;
  const game = D.game;
  const bridge = globalThis.__FD_STABLE_STATE165__.bridge;
  const target = { x: Math.min(D.WORLD.width - 300, previous.target.x + 900), y: Math.min(D.WORLD.height - 300, previous.target.y + 360) };
  const beforeSeq = Number(bridge.seq || 0);
  const issued = game.issueMove(target.x, target.y, false);
  return { target, beforeSeq, sentSeq: Number(bridge.seq || 0), issued, enabled: game.formationEnabled201, mode: game.formationMode };
}, groupFixture);
if (!lineIssued.enabled || lineIssued.mode !== 'line' || !lineIssued.issued || lineIssued.sentSeq <= lineIssued.beforeSeq) {
  throw new Error(`Line formation was not enabled: ${JSON.stringify(lineIssued)}`);
}

const lineGroup = await waitFor(() => page.evaluate(expected => {
  const game = globalThis.__FD_DEBUG__?.game;
  const bridge = globalThis.__FD_STABLE_STATE165__?.bridge;
  if (Number(bridge?.lastAck || 0) < expected.sentSeq) return null;
  const group = [...(game?.formations?.values?.() || [])].find(item => expected.ids.every(id => item.unitIds?.includes(id)));
  if (!group || group.mode !== 'line') return null;
  return { id: group.id, mode: group.mode, anchorX: group.anchorX, anchorY: group.anchorY };
}, { ...lineIssued, ids: groupFixture.ids }), 10000);

await page.locator('[data-formation-free="true"]').click();
const finalFree = await page.evaluate(previous => {
  const D = globalThis.__FD_DEBUG__;
  const game = D.game;
  const bridge = globalThis.__FD_STABLE_STATE165__.bridge;
  const beforeSeq = Number(bridge.seq || 0);
  const target = { x: Math.min(D.WORLD.width - 300, previous.target.x + 780), y: Math.max(300, previous.target.y - 620) };
  const issued = game.issueMove(target.x, target.y, false);
  return { enabled: game.formationEnabled201, issued, beforeSeq, sentSeq: Number(bridge.seq || 0), target };
}, lineIssued);
if (finalFree.enabled || !finalFree.issued || finalFree.sentSeq <= finalFree.beforeSeq) {
  throw new Error(`Free mode did not disable formation: ${JSON.stringify(finalFree)}`);
}

const finalFreeState = await waitFor(async () => {
  const diagnostics = await workerDiagnostics();
  return diagnostics?.groupMovement201?.lastMode === 'free' && diagnostics.groupMovement201.freeOrders >= 2
    ? diagnostics.groupMovement201
    : null;
}, 8000, 180);

if (errors.length) throw new Error(`Browser errors: ${JSON.stringify(errors)}`);
console.log(JSON.stringify({ ok: true, transparentMiss, deselected, freeMoved, freeState, lineIssued, lineGroup, finalFree, finalFreeState }));

await context.close();
await browser.close();
