import { chromium } from 'playwright';

const url = process.env.FD_GAME_URL || 'http://127.0.0.1:8765/frontline-dominion/frontline-dominion.html?build=205';
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const page = await context.newPage();
const errors = [];

page.on('pageerror', error => errors.push(String(error?.stack || error)));
page.on('console', message => {
  if (message.type() !== 'error') return;
  const value = message.text();
  if (!/favicon|404|audio|autoplay|Failed to load resource:.*503/i.test(value)) errors.push(`console:${value}`);
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

const waitForGame = () => waitFor(() => page.evaluate(() => {
  const game = globalThis.__FD_DEBUG__?.game;
  const bridge = globalThis.__FD_STABLE_STATE165__?.bridge;
  return game && bridge?.ready && !bridge.failed && Number(bridge.workerTick || 0) > 8
    ? { tick: Number(bridge.workerTick), units: game.units.length, buildings: game.buildings.length }
    : null;
}), 30000);

await page.goto(url, { waitUntil: 'load', timeout: 60000 });
const menu = await waitFor(() => page.evaluate(() => {
  const slots = globalThis.__FD_SAVE_SLOTS_205__;
  const shell = globalThis.__FD_RUNTIME_SHELL_205__;
  if (!slots?.state?.ready || !slots?.state?.installed || !shell?.state?.installed) return null;
  const actions = [...document.querySelectorAll('#start-screen button')].map(button => button.id);
  return {
    build: slots.build,
    lead: document.querySelector('#start-screen .lead')?.textContent?.trim(),
    featureStrip: Boolean(document.querySelector('#start-screen .feature-strip')),
    actions,
    loadIndex: actions.indexOf('load-game'),
    multiplayerIndex: actions.indexOf('multiplayer-game'),
  };
}), 30000);

if (menu.build !== 205 || menu.featureStrip || menu.lead !== 'Выберите сторону и сложность операции.' ||
    menu.loadIndex < 0 || menu.multiplayerIndex !== menu.loadIndex + 1) {
  throw new Error(`Start menu is not the clean build-205 owner: ${JSON.stringify(menu)}`);
}

await page.locator('#start-game').click();
const initial = await waitForGame();

const fixture = await page.evaluate(() => {
  const D = globalThis.__FD_DEBUG__;
  const game = D.game;
  const bridge = globalThis.__FD_STABLE_STATE165__.bridge;
  const building = game.buildings.find(item =>
    item?.alive && item.completed && item.team === 'player' && Array.isArray(item.stats?.produces) && item.stats.produces.length
  );
  if (!building) return { error: 'production-building-missing' };
  const pointA = game.findReachablePoint?.(building.x + 260, building.y + 95, 22) || { x: building.x + 260, y: building.y + 95 };
  const pointB = game.findReachablePoint?.(building.x - 430, building.y + 310, 22) || { x: building.x - 430, y: building.y + 310 };
  const beforeSeq = Number(bridge.seq || 0);
  const issued = game.setRallyPoint91(building, pointA.x, pointA.y);
  return { buildingId: building.id, pointA, pointB, beforeSeq, sentSeq: Number(bridge.seq || 0), issued };
});
if (fixture.error || !fixture.issued || fixture.sentSeq <= fixture.beforeSeq) {
  throw new Error(`Could not prepare save fixture: ${JSON.stringify(fixture)}`);
}

await waitFor(() => page.evaluate(expected => {
  const game = globalThis.__FD_DEBUG__?.game;
  const bridge = globalThis.__FD_STABLE_STATE165__?.bridge;
  const point = game?.getEntity?.(expected.buildingId)?.rallyPoint;
  return Number(bridge?.lastAck || 0) >= expected.sentSeq && point && Math.hypot(point.x - expected.pointA.x, point.y - expected.pointA.y) < 3
    ? { ack: Number(bridge.lastAck), point: { x: point.x, y: point.y } }
    : null;
}, fixture), 10000);

const alpha = await page.evaluate(async expected => {
  const api = globalThis.__FD_SAVE_SLOTS_205__;
  const record = await api.saveNamed('Операция Альфа');
  const data = JSON.parse(record.payload);
  const building = data.entities.find(item => item.id === expected.buildingId);
  return {
    id: record.id,
    name: record.name,
    hash: record.sourceHash,
    tick: record.summary.simTick,
    rallyPoint: building?.rallyPoint || null,
    bytes: record.payload.length,
  };
}, fixture);
if (!alpha.id || !alpha.rallyPoint || alpha.bytes < 1000 || Math.hypot(alpha.rallyPoint.x - fixture.pointA.x, alpha.rallyPoint.y - fixture.pointA.y) >= 3) {
  throw new Error(`Alpha save does not contain the authoritative progress: ${JSON.stringify(alpha)}`);
}

const secondCommand = await page.evaluate(expected => {
  const game = globalThis.__FD_DEBUG__.game;
  const bridge = globalThis.__FD_STABLE_STATE165__.bridge;
  const building = game.getEntity(expected.buildingId);
  const beforeSeq = Number(bridge.seq || 0);
  const issued = game.setRallyPoint91(building, expected.pointB.x, expected.pointB.y);
  return { beforeSeq, sentSeq: Number(bridge.seq || 0), issued };
}, fixture);
if (!secondCommand.issued || secondCommand.sentSeq <= secondCommand.beforeSeq) {
  throw new Error(`Second progress mutation was not sent: ${JSON.stringify(secondCommand)}`);
}

await waitFor(() => page.evaluate(({ expected, command }) => {
  const game = globalThis.__FD_DEBUG__?.game;
  const bridge = globalThis.__FD_STABLE_STATE165__?.bridge;
  const point = game?.getEntity?.(expected.buildingId)?.rallyPoint;
  return Number(bridge?.lastAck || 0) >= command.sentSeq && point && Math.hypot(point.x - expected.pointB.x, point.y - expected.pointB.y) < 3;
}, { expected: fixture, command: secondCommand }), 10000);

const beta = await page.evaluate(async expected => {
  const api = globalThis.__FD_SAVE_SLOTS_205__;
  const record = await api.saveNamed('Операция Бета');
  const data = JSON.parse(record.payload);
  const building = data.entities.find(item => item.id === expected.buildingId);
  return {
    id: record.id,
    name: record.name,
    hash: record.sourceHash,
    tick: record.summary.simTick,
    rallyPoint: building?.rallyPoint || null,
    bytes: record.payload.length,
    diagnostics: api.diagnostics(),
  };
}, fixture);

if (!beta.id || beta.id === alpha.id || beta.hash === alpha.hash || beta.tick < alpha.tick || !beta.rallyPoint ||
    Math.hypot(beta.rallyPoint.x - fixture.pointB.x, beta.rallyPoint.y - fixture.pointB.y) >= 3 ||
    Number(beta.diagnostics.exactWorkerSaves || 0) < 2 || Number(beta.diagnostics.fallbackSaves || 0) !== 0) {
  throw new Error(`Independent authoritative slots were not created: ${JSON.stringify({ alpha, beta })}`);
}

await page.evaluate(() => globalThis.__FD_SAVE_SLOTS_205__.openLoad());
const modalBeforeReload = await page.evaluate(() => ({
  visible: !document.getElementById('fd-save-center205')?.classList.contains('hidden'),
  names: [...document.querySelectorAll('#fd-save-list205 .fd-save-row205 strong')].map(node => node.textContent),
}));
if (!modalBeforeReload.visible || !modalBeforeReload.names.includes('Операция Альфа') || !modalBeforeReload.names.includes('Операция Бета')) {
  throw new Error(`Save center does not expose both slots: ${JSON.stringify(modalBeforeReload)}`);
}
await page.evaluate(() => globalThis.__FD_SAVE_SLOTS_205__.close());

const autosave = await waitFor(() => page.evaluate(async () => {
  const records = await globalThis.__FD_SAVE_SLOTS_205__?.list?.();
  const automatic = records?.find(record => record.kind === 'autosave');
  const manuals = records?.filter(record => record.kind === 'manual') || [];
  return automatic && manuals.length === 2
    ? { id: automatic.id, name: automatic.name, manualIds: manuals.map(record => record.id) }
    : null;
}), 8000, 120);

await page.reload({ waitUntil: 'load', timeout: 60000 });
const persisted = await waitFor(() => page.evaluate(async () => {
  const api = globalThis.__FD_SAVE_SLOTS_205__;
  if (!api?.state?.ready || !api?.state?.installed) return null;
  const records = await api.list();
  return records.filter(record => record.kind === 'manual').length >= 2
    ? { records, loadDisabled: document.getElementById('load-game')?.disabled }
    : null;
}), 30000);
if (persisted.loadDisabled) throw new Error(`Load button is disabled despite persistent slots: ${JSON.stringify(persisted)}`);

await page.locator('#load-game').click();
await page.locator(`[data-save-id="${alpha.id}"]`).click();
await page.locator('#fd-save-confirm205').click();
const loadedGame = await waitForGame();

const loaded = await page.evaluate(async expected => {
  const api = globalThis.__FD_SAVE_SLOTS_205__;
  const raw = await api.captureExactSave();
  const data = JSON.parse(raw);
  const building = data.entities.find(item => item.id === expected.buildingId);
  return {
    activeManualId: api.state.activeManualId,
    lastLoadedId: api.state.lastLoadedId,
    rallyPoint: building?.rallyPoint || null,
    tick: Number(data.authoritative172?.simTick ?? data.simTick ?? 0),
    bridgeFailed: Boolean(globalThis.__FD_STABLE_STATE165__?.bridge?.failed),
    shellError: globalThis.__FD_RUNTIME_SHELL_205__?.state?.lastError || null,
  };
}, fixture);

if (loaded.activeManualId !== alpha.id || loaded.lastLoadedId !== alpha.id || !loaded.rallyPoint ||
    Math.hypot(loaded.rallyPoint.x - alpha.rallyPoint.x, loaded.rallyPoint.y - alpha.rallyPoint.y) >= 3 ||
    Math.hypot(loaded.rallyPoint.x - beta.rallyPoint.x, loaded.rallyPoint.y - beta.rallyPoint.y) < 40 ||
    loaded.bridgeFailed || loaded.shellError || errors.length) {
  throw new Error(`Named slot loaded the wrong or stale game: ${JSON.stringify({ loaded, alpha, beta, errors })}`);
}

console.log(JSON.stringify({
  ok: true,
  menu,
  initial,
  alpha,
  beta: { ...beta, diagnostics: undefined },
  autosave,
  persistedManuals: persisted.records.filter(record => record.kind === 'manual').map(record => ({ id: record.id, name: record.name })),
  loadedGame,
  loaded,
}));

await context.close();
await browser.close();
