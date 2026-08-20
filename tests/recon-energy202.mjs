import { chromium } from 'playwright';

const url = process.env.FD_GAME_URL || 'http://127.0.0.1:8765/frontline-dominion/frontline-dominion.html?build=202';
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
  const requestId = `power202-${Date.now()}-${Math.random()}`;
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
  globalThis.__FD_RUNTIME_SHELL_202__?.build === 202 &&
  globalThis.__FD_COMMAND_POWER_AUTHORITY_202__?.build === 202 &&
  !document.getElementById('start-game')?.disabled
)), 30000);
await page.locator('#start-game').click();
await waitFor(() => page.evaluate(() => {
  const game = globalThis.__FD_DEBUG__?.game;
  const bridge = globalThis.__FD_STABLE_STATE165__?.bridge;
  return Boolean(game && bridge?.ready && !bridge.failed && Number(bridge.workerTick || 0) > 8);
}), 30000);

const issued = await page.evaluate(() => {
  const D = globalThis.__FD_DEBUG__;
  const game = D.game;
  const bridge = globalThis.__FD_STABLE_STATE165__.bridge;
  const alerts = [];
  const baseAlert = game.alert;
  game.alert = function(message, type, ...rest) {
    alerts.push({ message: String(message), type: String(type || '') });
    return baseAlert?.call(this, message, type, ...rest);
  };
  globalThis.__FD_POWER_ALERTS_202__ = alerts;

  // Recreate the exact authoritative HUD snapshot reported by the player.
  // The bridge must carry this same snapshot into the Worker with the command.
  const team = game.teams.player;
  team.powerUsed = 75;
  team.powerProduced = 165;
  team.powerFactor = 1;
  team.powers.scan = 0;
  game.updateUI(true);
  const display = document.getElementById('power-value')?.textContent;
  const status = game.commandPowerStatus202('player', { allowIntent: false, reconcile: false });
  const beforeSeq = Number(bridge.seq || 0);
  const target = { x: Math.min(D.WORLD.width - 500, game.playerBase.x + 2200), y: game.playerBase.y + 900 };
  game.activatePower('scan');
  const result = game.executePower('scan', target.x, target.y);
  return {
    result, display, status, target, beforeSeq, sentSeq: Number(bridge.seq || 0),
  };
});

if (!issued.result || issued.sentSeq <= issued.beforeSeq || issued.display !== '75 / 165' || !issued.status.online || issued.status.reserve !== 90) {
  throw new Error(`Recon energy command was rejected before Worker: ${JSON.stringify(issued)}`);
}

const active = await waitFor(() => page.evaluate(expected => {
  const game = globalThis.__FD_DEBUG__?.game;
  const bridge = globalThis.__FD_STABLE_STATE165__?.bridge;
  const zone = game?.abilityZones?.find(item => item?.type === 'scan' && item.team === 'player' && Math.hypot(item.x - expected.target.x, item.y - expected.target.y) < 5);
  if (!zone || Number(bridge?.lastAck || 0) < expected.sentSeq) return null;
  return { duration: Number(zone.duration), age: Number(zone.age), ack: Number(bridge.lastAck), failed: Boolean(bridge.failed) };
}, issued), 8000);

const diagnostics = await waitFor(async () => {
  const value = await workerDiagnostics();
  return value?.commandPower202?.lastIntent?.online ? value : null;
}, 7000, 150);

await page.waitForTimeout(500);
const alerts = await page.evaluate(() => globalThis.__FD_POWER_ALERTS_202__ || []);
const falseEnergyAlerts = alerts.filter(item => /Недостаток энергии|командная система недоступна/i.test(item.message));
if (falseEnergyAlerts.length || active.failed || Math.abs(active.duration - 12) > 0.01) {
  throw new Error(`Recon energy synchronization failed: ${JSON.stringify({ active, diagnostics, alerts })}`);
}
const powerDiagnostics = diagnostics.commandPower202;
if (powerDiagnostics.lastIntent.produced !== 165 || powerDiagnostics.lastIntent.used !== 75 || powerDiagnostics.receivedIntents < 1) {
  throw new Error(`Worker did not receive the displayed power snapshot: ${JSON.stringify(powerDiagnostics)}`);
}

if (errors.length) throw new Error(`Browser errors: ${JSON.stringify(errors)}`);
console.log(JSON.stringify({ ok: true, issued, active, powerDiagnostics, alerts }));

await context.close();
await browser.close();
