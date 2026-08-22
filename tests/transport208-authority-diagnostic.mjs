import { chromium } from 'playwright';

const url = process.env.FD_GAME_URL || 'http://127.0.0.1:8765/frontline-dominion/frontline-dominion.html?build=208';
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(String(error?.stack || error)));

const waitFor = async (fn, arg, timeout = 30000) => {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < timeout) {
    last = await page.evaluate(fn, arg);
    if (last && !last.__pending) return last;
    await page.waitForTimeout(100);
  }
  throw new Error(`probe timeout: ${JSON.stringify(last)} errors=${JSON.stringify(errors)}`);
};

await page.goto(url, { waitUntil: 'load', timeout: 60000 });
await waitFor(() => {
  const start = document.getElementById('start-game');
  return start && !start.disabled && globalThis.__FD_GAMEPLAY_208__ ? true : null;
});

await page.evaluate(() => {
  const D = globalThis.__FD_DEBUG__;
  const L = globalThis.__FD_LOGISTICS206__;
  const base = D.Game.prototype.initializeBattle;
  D.Game.prototype.initializeBattle = function(...args) {
    const result = base.apply(this, args);
    this.teams.player.credits = 500000;
    const building = new D.Building(this, {
      id: 'e998001', typeId: 'barracks', team: 'player', x: 8200, y: 6200,
      construction: 1, autoConstruct: true, rotation: 0,
    });
    building.autoConstruct = true;
    this.addEntity(building);
    const node = L.ensureNode(building);
    if (node?.stock) for (const key of L.STOCK_KEYS) node.stock[key] = node.stock[`${key}Max`];
    globalThis.__FD208_PROBE_INITIAL__ = {
      completed: Boolean(building.completed), construction: Number(building.construction),
      queue: (building.queue || []).map(item => ({ ...item })),
    };
    return result;
  };
});

await page.locator('#start-game').click();
await waitFor(() => {
  const g = globalThis.__FD_DEBUG__?.game;
  const bridge = globalThis.__FD_STABLE_STATE165__?.bridge;
  const building = g?.getEntity?.('e998001');
  if (g && bridge?.ready && !bridge.failed && Number(bridge.workerTick) > 15 && building?.alive) {
    return {
      completed: Boolean(building.completed), construction: Number(building.construction),
      tick: Number(bridge.workerTick), initial: globalThis.__FD208_PROBE_INITIAL__ || null,
    };
  }
  return { __pending: true, tick: Number(bridge?.workerTick || 0) };
}, undefined, 45000);

const action = await page.evaluate(() => {
  const g = globalThis.__FD_DEBUG__.game;
  const bridge = globalThis.__FD_STABLE_STATE165__.bridge;
  const building = g.getEntity('e998001');
  const before = Number(bridge.seq || 0);
  const result = g.createSupplyTransport206({ buildingId: building.id });
  return { before, after: Number(bridge.seq || 0), result: Boolean(result) };
});
if (!action.result || action.after <= action.before) throw new Error(`probe action not sent ${JSON.stringify(action)}`);
await waitFor(seq => Number(globalThis.__FD_STABLE_STATE165__?.bridge?.lastAck || 0) >= seq ? true : null, action.after, 15000);
await page.waitForTimeout(2500);

const state = await page.evaluate(() => {
  const g = globalThis.__FD_DEBUG__.game;
  const bridge = globalThis.__FD_STABLE_STATE165__.bridge;
  const b = g.getEntity('e998001');
  const n = globalThis.__FD_LOGISTICS206__.ensureNode(b);
  return {
    completed: Boolean(b?.completed), construction: Number(b?.construction), alive: Boolean(b?.alive),
    queue: (b?.queue || []).map(q => ({ id: q.id, kind: q.kind, remaining: Number(q.remaining), total: Number(q.total) })),
    fuel: Number(n?.stock?.fuel || 0), support: Number(n?.stock?.support || 0),
    productionBlocked: Boolean(n?.productionBlocked206 || b?.logistics206?.productionBlocked206),
    powerFactor: Number(g.teams?.player?.powerFactor || 0),
    tick: Number(bridge.workerTick || 0), lastAck: Number(bridge.lastAck || 0), seq: Number(bridge.seq || 0),
    ack: bridge.lastActionAck208 || null,
    productionFallback: globalThis.__FD_GAMEPLAY_208__?.productionQueueFallback || false,
  };
});
console.log('FD208_TRANSPORT_AUTHORITY_PROBE', JSON.stringify({ action, state }));
if (errors.length) throw new Error(JSON.stringify(errors));
await context.close();
await browser.close();
