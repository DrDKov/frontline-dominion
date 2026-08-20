import { chromium } from 'playwright';

const url = process.env.FD_GAME_URL || 'http://127.0.0.1:8765/frontline-dominion/frontline-dominion.html?build=201';
const browser = await chromium.launch({ headless: true });
const contextOptions = { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 };
const errors = [];
let context;
let page;

const attach = current => {
  current.on('pageerror', error => errors.push(String(error?.stack || error)));
  current.on('console', message => {
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

context = await browser.newContext(contextOptions);
page = await context.newPage();
attach(page);
await page.goto(url, { waitUntil: 'load', timeout: 60000 });
await waitFor(() => page.evaluate(() => Boolean(globalThis.__FD_RUNTIME_SHELL_201__?.build === 201 && !document.getElementById('start-game')?.disabled)), 30000);
await page.locator('#start-game').click();
await waitFor(() => page.evaluate(() => {
  const bridge = globalThis.__FD_STABLE_STATE165__?.bridge;
  return Boolean(globalThis.__FD_DEBUG__?.game && bridge?.ready && !bridge.failed && Number(bridge.workerTick || 0) > 8);
}), 30000);

const save = await page.evaluate(() => {
  const D = globalThis.__FD_DEBUG__;
  const shell = globalThis.__FD_RUNTIME_SHELL_201__;
  const ok = shell.saveNow?.('worker-recovery201-fixture') === true;
  const raw = localStorage.getItem(D.SAVE_KEY);
  return { ok, key: D.SAVE_KEY, raw, bytes: raw?.length || 0 };
});
if (!save.ok || !save.raw || save.bytes < 1000) throw new Error(`Worker recovery save fixture failed: ${JSON.stringify({ ...save, raw: undefined })}`);

await context.close();
errors.length = 0;
const origin = new URL(url).origin;
context = await browser.newContext({
  ...contextOptions,
  storageState: { cookies: [], origins: [{ origin, localStorage: [{ name: save.key, value: save.raw }] }] },
});
page = await context.newPage();
attach(page);
await page.goto(url, { waitUntil: 'load', timeout: 60000 });
await waitFor(() => page.evaluate(() => Boolean(globalThis.__FD_RUNTIME_SHELL_201__?.findSavedGame?.() && !document.getElementById('load-game')?.disabled)), 30000);
await page.locator('#load-game').click();
const loaded = await waitFor(() => page.evaluate(() => {
  const game = globalThis.__FD_DEBUG__?.game;
  const bridge = globalThis.__FD_STABLE_STATE165__?.bridge;
  if (!game || !bridge?.ready || bridge.failed || Number(bridge.workerTick || 0) < 8) return null;
  return { tick: Number(bridge.workerTick), units: game.units.filter(unit => unit?.alive).length, buildings: game.buildings.filter(item => item?.alive).length };
}), 30000);

const forced = await page.evaluate(() => {
  const game = globalThis.__FD_DEBUG__.game;
  const bridge = globalThis.__FD_STABLE_STATE165__.bridge;
  const alerts = [];
  const baseAlert = game.alert;
  game.alert = function(message, type, ...rest) {
    alerts.push({ message: String(message), type: String(type || '') });
    return baseAlert?.call(this, message, type, ...rest);
  };
  globalThis.__FD_RECOVERY_ALERTS_201__ = alerts;
  const before = { tick: Number(bridge.workerTick), attempts: Number(bridge.recoveryAttempts201 || 0), successes: Number(bridge.recoverySuccesses201 || 0) };
  bridge.fail('Build 201 post-load recovery fixture');
  return { before, failed: bridge.failed, recovering: bridge.recovering201 };
});
if (!forced.failed || !forced.recovering) throw new Error(`Automatic recovery did not start: ${JSON.stringify(forced)}`);

const recovered = await waitFor(() => page.evaluate(expected => {
  const bridge = globalThis.__FD_STABLE_STATE165__?.bridge;
  const alerts = globalThis.__FD_RECOVERY_ALERTS_201__ || [];
  if (!bridge?.ready || bridge.failed || bridge.recovering201 || Number(bridge.recoverySuccesses201 || 0) <= expected.before.successes || Number(bridge.workerTick || 0) <= expected.before.tick + 4) return null;
  return {
    tick: Number(bridge.workerTick),
    attempts: Number(bridge.recoveryAttempts201 || 0),
    successes: Number(bridge.recoverySuccesses201 || 0),
    fatalAlerts: alerts.filter(item => /Worker отключён/i.test(item.message)),
    alerts,
  };
}, forced), 12000);
if (recovered.fatalAlerts.length || recovered.attempts <= forced.before.attempts) {
  throw new Error(`Post-load Worker recovery was noisy or missing: ${JSON.stringify(recovered)}`);
}

const command = await page.evaluate(() => {
  const D = globalThis.__FD_DEBUG__;
  const game = D.game;
  const bridge = globalThis.__FD_STABLE_STATE165__.bridge;
  const unit = game.units.find(item => item?.alive && item.team === 'player' && !item.air && !item.embarkedIn);
  if (!unit) return { error: 'post-recovery-unit-missing' };
  game.setSelection([unit], false);
  const before = { x: unit.x, y: unit.y, seq: Number(bridge.seq), errors: Number(bridge.actionErrors || 0) };
  const target = { x: Math.min(D.WORLD.width - 150, unit.x + 620), y: Math.min(D.WORLD.height - 150, unit.y + 180) };
  const issued = game.issueMove(target.x, target.y, false);
  return { id: unit.id, before, target, issued, sentSeq: Number(bridge.seq) };
});
if (command.error || !command.issued || command.sentSeq <= command.before.seq) throw new Error(`Post-recovery command failed to route: ${JSON.stringify(command)}`);

const moved = await waitFor(() => page.evaluate(expected => {
  const game = globalThis.__FD_DEBUG__?.game;
  const bridge = globalThis.__FD_STABLE_STATE165__?.bridge;
  const unit = game?.getEntity?.(expected.id);
  if (!unit || Number(bridge?.lastAck || 0) < expected.sentSeq || Math.hypot(unit.x - expected.before.x, unit.y - expected.before.y) < 8) return null;
  return { x: unit.x, y: unit.y, ack: Number(bridge.lastAck), failed: bridge.failed, errorDelta: Number(bridge.actionErrors || 0) - expected.before.errors };
}, command), 10000);
if (moved.failed || moved.errorDelta) throw new Error(`Post-recovery command was not healthy: ${JSON.stringify(moved)}`);

if (errors.length) throw new Error(`Browser errors: ${JSON.stringify(errors)}`);
console.log(JSON.stringify({ ok: true, loaded, forced, recovered, moved }));

await context.close();
await browser.close();
