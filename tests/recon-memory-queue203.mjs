import { chromium } from 'playwright';

const url = process.env.FD_GAME_URL || 'http://127.0.0.1:8765/frontline-dominion/frontline-dominion.html?build=203';
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
  const requestId = `fog-queue203-${Date.now()}-${Math.random()}`;
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
  globalThis.__FD_RUNTIME_SHELL_203__?.build === 203 &&
  globalThis.__FD_RECON_MEMORY_QUEUE_203__?.build === 203 &&
  !document.getElementById('start-game')?.disabled
)), 30000);
await page.locator('#start-game').click();
await waitFor(() => page.evaluate(() => {
  const game = globalThis.__FD_DEBUG__?.game;
  const bridge = globalThis.__FD_STABLE_STATE165__?.bridge;
  return Boolean(game && bridge?.ready && !bridge.failed && Number(bridge.workerTick || 0) > 8);
}), 30000);

const fogMemory = await page.evaluate(() => {
  const D = globalThis.__FD_DEBUG__;
  const game = D.game;
  const api = globalThis.__FD_RECON_MEMORY_QUEUE_203__;
  const building = game.buildings.find(item => item?.alive && item.team === 'enemy' && item.completed);
  const enemyUnit = game.units.find(item => item?.alive && item.team === 'enemy');
  const friendlyUnit = game.units.find(item => item?.alive && item.team === 'player');
  if (!building || !enemyUnit || !friendlyUnit) return { error: 'fog-fixture-missing' };

  const original = {
    isVisibleAt: game.isVisibleAt,
    isExploredAt: game.isExploredAt,
    isOnScreen: game.isOnScreen,
    x: building.x,
    y: building.y,
  };
  try {
    game.isVisibleAt = (x, y) => Math.hypot(x - original.x, y - original.y) < Math.max(20, building.radius);
    game.isExploredAt = () => true;
    game.isOnScreen = () => true;
    api.syncMemory(game);
    const captured = api.ensureMemory(game).get(building.id);
    if (!captured) return { error: 'building-not-captured' };

    game.isVisibleAt = () => false;
    building.x += 900;
    building.y += 450;
    const snapshot = api.decorateSnapshot(game, {
      units: [enemyUnit, friendlyUnit],
      buildings: [],
      clusters94: [{ team: 'enemy', x: enemyUnit.x, y: enemyUnit.y }],
    });
    const ghost = snapshot.buildings.find(item => item?._fdReconGhost203 && item._fdReconSourceId203 === building.id);
    return {
      id: building.id,
      captured: { x: captured.x, y: captured.y, typeId: captured.typeId },
      liveWhileHidden: { x: building.x, y: building.y },
      ghost: ghost ? { x: ghost.x, y: ghost.y, typeId: ghost.typeId, selected: ghost.selected } : null,
      renderedUnitIds: snapshot.units.map(unit => unit.id),
      enemyClusters: snapshot.clusters94.filter(cluster => cluster.team === 'enemy').length,
    };
  } finally {
    building.x = original.x;
    building.y = original.y;
    game.isVisibleAt = original.isVisibleAt;
    game.isExploredAt = original.isExploredAt;
    game.isOnScreen = original.isOnScreen;
  }
});

if (fogMemory.error || !fogMemory.ghost || fogMemory.ghost.x !== fogMemory.captured.x || fogMemory.ghost.y !== fogMemory.captured.y ||
    fogMemory.ghost.x === fogMemory.liveWhileHidden.x || fogMemory.renderedUnitIds.length !== 1 || fogMemory.enemyClusters !== 0) {
  throw new Error(`Fog memory is not a fixed building-only photograph: ${JSON.stringify(fogMemory)}`);
}

const queued = await page.evaluate(() => {
  const D = globalThis.__FD_DEBUG__;
  const game = D.game;
  const bridge = globalThis.__FD_STABLE_STATE165__.bridge;
  const candidates = game.buildings.filter(building =>
    building?.alive && building.completed && building.team === 'player' &&
    Array.isArray(building.queue) && building.queue.length === 0 && building.stats?.produces?.length
  );
  let fixture = null;
  for (const building of candidates) {
    for (const itemId of building.stats.produces) {
      let stats = null;
      try { stats = D.getUnitStats(itemId, game.teams.player); } catch (_) {}
      if (!stats || stats.cost * 10 > game.teams.player.credits || !game.canProduceUnit('player', itemId)) continue;
      fixture = { building, itemId, cost: stats.cost };
      break;
    }
    if (fixture) break;
  }
  if (!fixture) return { error: 'ten-slot-producer-missing', credits: game.teams.player.credits };
  game.setSelection([fixture.building], false);
  game.updateUI(true);
  const beforeSeq = Number(bridge.seq || 0);
  const results = [];
  for (let index = 0; index < 10; index += 1) {
    results.push(game.queueProduction(fixture.building, fixture.itemId, 'unit', false));
  }
  return {
    buildingId: fixture.building.id,
    itemId: fixture.itemId,
    cost: fixture.cost,
    beforeSeq,
    sentSeq: Number(bridge.seq || 0),
    results,
  };
});

if (queued.error || queued.sentSeq - queued.beforeSeq !== 10 || queued.results.some(result => result !== true)) {
  throw new Error(`Ten production commands were not dispatched: ${JSON.stringify(queued)}`);
}

const queueFull = await waitFor(() => page.evaluate(expected => {
  const game = globalThis.__FD_DEBUG__?.game;
  const bridge = globalThis.__FD_STABLE_STATE165__?.bridge;
  const building = game?.getEntity?.(expected.buildingId);
  if (!building || Number(bridge?.lastAck || 0) < expected.sentSeq || building.queue?.length !== 10) return null;
  game.updateUI(true);
  return {
    ack: Number(bridge.lastAck),
    length: building.queue.length,
    ids: building.queue.map(item => item.id),
    label: document.querySelector('[data-v75-queue-count]')?.textContent?.trim() || null,
    failed: Boolean(bridge.failed),
    actionErrors: Number(bridge.actionErrors || 0),
  };
}, queued), 10000, 100);

if (queueFull.failed || queueFull.actionErrors || queueFull.length !== 10 || queueFull.ids.some(id => id !== queued.itemId) || queueFull.label !== '10 / 10') {
  throw new Error(`Production queue did not synchronize all ten slots: ${JSON.stringify({ queued, queueFull })}`);
}

const diagnostics = await waitFor(async () => {
  const value = await workerDiagnostics();
  return Number(value?.reconMemoryQueue203?.queueSignatures || 0) > 0 ? value : null;
}, 7000, 150);

if (errors.length) throw new Error(`Browser errors: ${JSON.stringify(errors)}`);

console.log(JSON.stringify({
  ok: true,
  fogMemory,
  queued,
  queueFull,
  worker: diagnostics.reconMemoryQueue203,
}));

await context.close();
await browser.close();
