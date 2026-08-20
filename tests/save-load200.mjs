import { chromium } from 'playwright';

const url = process.env.FD_GAME_URL || 'http://127.0.0.1:8765/frontline-dominion/frontline-dominion.html?build=200';
const CREDIT_SENTINEL = 7_654_321;
const LEGACY_KEY = 'frontline-dominion-save-v3';
const browser = await chromium.launch({ headless: true });
const errors = [];
let context = null;
let page = null;

const attachDiagnostics = currentPage => {
  currentPage.on('pageerror', error => errors.push(String(error?.stack || error)));
  currentPage.on('console', message => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (!/favicon|404|chrome-extension:/i.test(text)) errors.push(`console:${text}`);
  });
};

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

const contextOptions = { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 };
context = await browser.newContext(contextOptions);
page = await context.newPage();
attachDiagnostics(page);
await page.goto(url, { waitUntil: 'load', timeout: 60000 });
await waitFor(() => page.evaluate(() => Boolean(
  globalThis.__FD_RUNTIME_SHELL_200__?.build === 200 && !document.getElementById('start-game')?.disabled
)), 30000);
await page.locator('#start-game').click();
await waitFor(() => page.evaluate(() => {
  const game = globalThis.__FD_DEBUG__?.game;
  const bridge = globalThis.__FD_STABLE_STATE165__?.bridge;
  return Boolean(game && bridge?.ready && !bridge.failed && Number(bridge.workerTick || 0) > 8);
}), 30000);

const fixture = await page.evaluate((creditSentinel) => {
  const D = globalThis.__FD_DEBUG__;
  const game = D.game;
  const shell = globalThis.__FD_RUNTIME_SHELL_200__;
  const key = D.SAVE_KEY || 'frontline-dominion-save-v5';
  const producer = game.buildings.find(building =>
    building?.alive && building.team === 'player' && building.completed &&
    (building.stats?.produces || []).some(typeId => D.UNIT_TYPES?.[typeId])
  );
  const unit = game.units.find(item => item?.alive && item.team === 'player' && !item.embarkedIn);
  if (!producer || !unit) return { error: 'save-fixture-entities-missing' };
  const itemId = producer.stats.produces.find(typeId => D.UNIT_TYPES?.[typeId]);
  const ok = shell.saveNow?.('save-load200-fixture') === true;
  const raw = localStorage.getItem(key);
  if (!ok || !raw) return { error: 'save-fixture-write-failed', ok, bytes: raw?.length || 0 };
  const data = JSON.parse(raw);
  data.teams.player.credits = creditSentinel;
  const rawProducer = data.entities.find(entity => entity.id === producer.id);
  const rawUnit = data.entities.find(entity => entity.id === unit.id);
  if (!rawProducer || !rawUnit) return { error: 'serialized-fixture-entities-missing' };

  // This is the exact class of old/rich save corruption that previously made
  // Building.updateQueue throw inside an unguarded Worker timer callback.
  rawProducer.queue = [
    null,
    { kind: 'unit', id: itemId, remaining: null, total: null, cost: null, name: null },
    { kind: 'unit', id: 'removed-unit-type', remaining: 2, total: 5 },
  ];
  rawUnit.commandQueue = [null, ...(Array.isArray(rawUnit.commandQueue) ? rawUnit.commandQueue : [])];
  data.abilityZones ||= [];
  data.abilityZones.push({ type: 'scan', team: 'player', x: producer.x + 1800, y: producer.y, radius: 620, duration: 12, age: 99 });
  data.formations = [null, ...(Array.isArray(data.formations) ? data.formations : [])];
  data._fdSaveLoad200Fixture = { producerId: producer.id, unitId: unit.id, itemId, createdAt: Date.now() };
  const wrapped = JSON.stringify({ savedAt: Date.now(), payload: { saveData: data } });
  return {
    wrapped,
    producerId: producer.id,
    unitId: unit.id,
    itemId,
    sourceBytes: raw.length,
    wrappedBytes: wrapped.length,
  };
}, CREDIT_SENTINEL);
if (fixture.error || !fixture.wrapped || fixture.wrappedBytes < 100) throw new Error(`Could not create corrupted legacy fixture: ${JSON.stringify(fixture)}`);

await context.close();
errors.length = 0;
const origin = new URL(url).origin;
context = await browser.newContext({
  ...contextOptions,
  storageState: {
    cookies: [],
    origins: [{ origin, localStorage: [{ name: LEGACY_KEY, value: fixture.wrapped }] }],
  },
});
page = await context.newPage();
attachDiagnostics(page);
await page.goto(url, { waitUntil: 'load', timeout: 60000 });
await waitFor(() => page.evaluate((creditSentinel) => {
  const shell = globalThis.__FD_RUNTIME_SHELL_200__;
  const candidate = shell?.findSavedGame?.();
  return Boolean(shell?.state?.installed && !document.getElementById('load-game')?.disabled && Number(candidate?.data?.teams?.player?.credits) === creditSentinel);
}, CREDIT_SENTINEL), 30000);
await page.locator('#load-game').click();

const loaded = await waitFor(() => page.evaluate((creditSentinel) => {
  const game = globalThis.__FD_DEBUG__?.game;
  const bridge = globalThis.__FD_STABLE_STATE165__?.bridge;
  const shell = globalThis.__FD_RUNTIME_SHELL_200__;
  const resilience = globalThis.__FD_SIMULATION_RESILIENCE_200__;
  if (!game || !shell?.state?.gameObservedAt || !bridge?.ready || bridge.failed || Number(game.teams?.player?.credits) !== creditSentinel) return null;
  return {
    tick: Number(bridge.workerTick || 0),
    time: Number(game.time || 0),
    credits: Number(game.teams.player.credits),
    units: game.units.filter(unit => unit?.alive).length,
    buildings: game.buildings.filter(building => building?.alive).length,
    normalization: resilience?.diagnostics?.() || null,
    shellError: shell.state.lastError || null,
  };
}, CREDIT_SENTINEL), 30000);
if (!loaded.units || !loaded.buildings || !loaded.normalization || loaded.normalization.invalidQueueItemsDropped < 2 || loaded.normalization.expiredZonesDropped < 1) {
  throw new Error(`Legacy save was not normalized: ${JSON.stringify(loaded)}`);
}

const ticking = await waitFor(() => page.evaluate(startTick => {
  const bridge = globalThis.__FD_STABLE_STATE165__?.bridge;
  if (!bridge || bridge.failed || Number(bridge.workerTick || 0) <= startTick + 5) return null;
  return { tick: Number(bridge.workerTick), failed: Boolean(bridge.failed), errors: Number(bridge.actionErrors || 0) };
}, loaded.tick), 5000);

const move = await page.evaluate(() => {
  const D = globalThis.__FD_DEBUG__;
  const game = D.game;
  const bridge = globalThis.__FD_STABLE_STATE165__.bridge;
  const unit = game.units.find(item => item?.alive && item.team === 'player' && !item.embarkedIn && !item.air);
  if (!unit) return { error: 'movable-unit-missing' };
  game.setSelection([unit], false);
  const target = {
    x: Math.min(D.WORLD.width - 120, unit.x + 340),
    y: Math.min(D.WORLD.height - 120, unit.y + 100),
  };
  const before = { x: unit.x, y: unit.y, seq: Number(bridge.seq || 0), errors: Number(bridge.actionErrors || 0) };
  const issued = game.issueMove(target.x, target.y, false);
  return { id: unit.id, target, before, issued, sentSeq: Number(bridge.seq || 0) };
});
if (move.error || !move.issued || move.sentSeq <= move.before.seq) throw new Error(`Move after load was not issued: ${JSON.stringify(move)}`);
const moved = await waitFor(() => page.evaluate(expected => {
  const game = globalThis.__FD_DEBUG__?.game;
  const bridge = globalThis.__FD_STABLE_STATE165__?.bridge;
  const unit = game?.getEntity?.(expected.id);
  if (!unit || Number(bridge?.lastAck || 0) < expected.sentSeq || Math.hypot(unit.x - expected.before.x, unit.y - expected.before.y) < 3) return null;
  return {
    x: unit.x, y: unit.y, ack: Number(bridge.lastAck),
    errorDelta: Number(bridge.actionErrors || 0) - expected.before.errors,
    failed: Boolean(bridge.failed),
  };
}, move), 8000);
if (moved.errorDelta || moved.failed) throw new Error(`Move after load failed: ${JSON.stringify(moved)}`);

const production = await page.evaluate(() => {
  const D = globalThis.__FD_DEBUG__;
  const game = D.game;
  const bridge = globalThis.__FD_STABLE_STATE165__.bridge;
  const building = game.buildings.find(item =>
    item?.alive && item.team === 'player' && item.completed && (item.stats?.produces || []).length
  );
  if (!building) return { error: 'producer-missing' };
  game.setSelection([building], false);
  game.uiDirty = true;
  game.updateUI?.(true);
  const itemId = building.stats.produces.find(typeId => D.UNIT_TYPES?.[typeId]);
  const button = [...document.querySelectorAll('button')].find(element =>
    !element.disabled && element.dataset?.actionKind === 'unit' && element.dataset?.typeId === itemId
  );
  if (!button) return { error: 'production-button-missing', buildingId: building.id, itemId };
  const before = {
    queue: (building.queue || []).length,
    seq: Number(bridge.seq || 0),
    errors: Number(bridge.actionErrors || 0),
  };
  button.click();
  return { buildingId: building.id, itemId, before, sentSeq: Number(bridge.seq || 0), buttonText: button.textContent.trim() };
});
if (production.error || production.sentSeq <= production.before.seq) throw new Error(`Production after load was not issued: ${JSON.stringify(production)}`);
const produced = await waitFor(() => page.evaluate(expected => {
  const game = globalThis.__FD_DEBUG__?.game;
  const bridge = globalThis.__FD_STABLE_STATE165__?.bridge;
  const building = game?.getEntity?.(expected.buildingId);
  if (!building || Number(bridge?.lastAck || 0) < expected.sentSeq || (building.queue || []).length <= expected.before.queue) return null;
  return {
    queue: building.queue.length,
    ack: Number(bridge.lastAck),
    errorDelta: Number(bridge.actionErrors || 0) - expected.before.errors,
    failed: Boolean(bridge.failed),
  };
}, production), 8000);
if (produced.errorDelta || produced.failed) throw new Error(`Production after load failed: ${JSON.stringify(produced)}`);

const durabilityStart = await page.evaluate(() => {
  const bridge = globalThis.__FD_STABLE_STATE165__?.bridge;
  return { tick: Number(bridge?.workerTick || 0), time: performance.now() };
});
await page.waitForTimeout(22000);
const durable = await page.evaluate(start => {
  const game = globalThis.__FD_DEBUG__?.game;
  const bridge = globalThis.__FD_STABLE_STATE165__?.bridge;
  const shell = globalThis.__FD_RUNTIME_SHELL_200__;
  return {
    elapsedMs: performance.now() - start.time,
    tickDelta: Number(bridge?.workerTick || 0) - start.tick,
    failed: Boolean(bridge?.failed),
    ready: Boolean(bridge?.ready),
    actionErrors: Number(bridge?.actionErrors || 0),
    shellError: shell?.state?.lastError || null,
    game: Boolean(game && !game.ended),
  };
}, durabilityStart);
if (!durable.game || !durable.ready || durable.failed || durable.shellError || durable.tickDelta < 400) {
  throw new Error(`Loaded game was not durable beyond the reported crash window: ${JSON.stringify(durable)}`);
}
if (errors.length) throw new Error(`Browser errors: ${JSON.stringify(errors)}`);

console.log(JSON.stringify({
  ok: true,
  fixture: { ...fixture, wrapped: undefined },
  loaded,
  ticking,
  moved,
  produced,
  durable,
}));

await context.close();
await browser.close();
