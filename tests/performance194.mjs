import { chromium, webkit, devices } from 'playwright';

const browserName = process.env.FD_BROWSER || 'chromium';
const isWebKit = browserName === 'webkit';
const url = process.env.FD_GAME_URL || 'http://127.0.0.1:8765/frontline-dominion/frontline-dominion.html?build=194';
const browserType = isWebKit ? webkit : chromium;
const browser = await browserType.launch({ headless: true });
const context = isWebKit
  ? await browser.newContext({ ...devices['iPad Pro 11'] })
  : await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(String(error?.stack || error)));
page.on('console', message => {
  if (message.type() === 'error' && !/favicon|404/i.test(message.text())) errors.push(`console:${message.text()}`);
});

const waitFor = async (fn, timeout = 20000, interval = 80) => {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const value = await fn();
    if (value) return value;
    await page.waitForTimeout(interval);
  }
  throw new Error(`Timed out after ${timeout} ms`);
};

await page.goto(url, { waitUntil: 'load', timeout: 60000 });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'load', timeout: 60000 });

const shellReady = await waitFor(() => page.evaluate(() => {
  const button = document.getElementById('start-game');
  return Boolean(
    button && !button.disabled &&
    globalThis.__FD_DEBUG__?.startGame &&
    globalThis.__FD_RUNTIME_SHELL_194__ &&
    globalThis.__FD_PERFORMANCE_194__ &&
    Number(document.documentElement.dataset.fdBuild || 0) === 194
  );
}));
if (!shellReady) throw new Error('build 194 shell/performance owner was not ready');

await page.locator('#start-game').click();
const startup = await waitFor(() => page.evaluate(() => {
  const game = globalThis.__FD_DEBUG__?.game;
  const bridge = globalThis.__FD_STABLE_STATE165__?.bridge;
  const perf = globalThis.__FD_PERFORMANCE_194__;
  const tick = Number(bridge?.workerTick || 0);
  if (!game || !bridge || !perf || tick < 6) return null;
  return {
    tick,
    units: game.units?.filter(unit => unit?.alive).length || 0,
    buildings: game.buildings?.filter(building => building?.alive).length || 0,
    failed: Boolean(bridge.failed),
    actionErrors: Number(bridge.actionErrors || 0),
    mainAction184: Boolean(globalThis.__FD_ACTION_GROUP_184__),
    mainObjective184: Boolean(globalThis.__FD_CONSTRUCTION_VICTORY_184__),
    perfInstalled: Boolean(perf.state?.installed),
  };
}));
if (!startup.units || !startup.buildings || startup.failed || startup.actionErrors || startup.mainAction184 || startup.mainObjective184 || !startup.perfInstalled) {
  throw new Error(`build 194 startup invalid: ${JSON.stringify(startup)}`);
}

await page.evaluate(() => globalThis.__FD_PERFORMANCE_194__.reset());
const normalTick0 = await page.evaluate(() => Number(globalThis.__FD_STABLE_STATE165__?.bridge?.workerTick || 0));
await page.waitForTimeout(4500);
const normal = await page.evaluate(() => {
  const perf = globalThis.__FD_PERFORMANCE_194__?.snapshot?.();
  const profiler = globalThis.__FD_PROFILER166__?.snapshot?.();
  return {
    perf,
    profilerBuild: globalThis.__FD_PROFILER166__?.build || null,
    profilerVersion: globalThis.__FD_PROFILER166__?.version || null,
    profilerPerf: profiler?.performance194 || null,
  };
});

const n = normal.perf;
console.log('PERF194_BASELINE ' + JSON.stringify({
  browserName,
  normalTick0,
  raf: n?.raf,
  eventLoop: n?.eventLoop,
  renderSnapshot: n?.renderSnapshot,
  updateUI: n?.updateUI,
  longTask: n?.longTask,
  worker: n?.worker,
}));

if (!n?.active || !n?.installed) throw new Error(`performance observability inactive: ${JSON.stringify(normal)}`);
// Headless Playwright WebKit deliberately throttles requestAnimationFrame to
// roughly 4–6 fps in this runner. Treat RAF there as a liveness/stall signal,
// not as an iPad FPS estimate. Authoritative Worker progress remains strict.
const minimumBaselineRafSamples = isWebKit ? 12 : 40;
if (n.raf.samples < minimumBaselineRafSamples || n.raf.frames < minimumBaselineRafSamples) {
  throw new Error(`insufficient RAF liveness samples: ${JSON.stringify({ browserName, expected: minimumBaselineRafSamples, raf: n.raf })}`);
}
if (n.eventLoop.samples < 20) throw new Error(`insufficient event-loop samples: ${JSON.stringify(n.eventLoop)}`);
if (n.renderSnapshot.calls < 2 || n.renderSnapshot.samples < 2) throw new Error(`render snapshot hook inactive: ${JSON.stringify(n.renderSnapshot)}`);
if (n.worker.tick <= normalTick0 + 35) throw new Error(`authoritative Worker advanced too slowly: ${normalTick0} -> ${n.worker.tick}`);
if (n.worker.failed || n.worker.actionErrors) throw new Error(`Worker unhealthy during baseline: ${JSON.stringify(n.worker)}`);
const baselineRafCatastrophicMs = isWebKit ? 1200 : 1000;
if (n.raf.maxMs > baselineRafCatastrophicMs || n.eventLoop.maxMs > 1000 || n.renderSnapshot.maxMs > 750) {
  throw new Error(`catastrophic baseline stall: ${JSON.stringify({ browserName, raf:n.raf, eventLoop:n.eventLoop, renderSnapshot:n.renderSnapshot })}`);
}
if (normal.profilerBuild !== 194 || normal.profilerVersion !== '16.8.10' || normal.profilerPerf?.build !== 194) {
  throw new Error(`F10 profiler did not expose build 194 metrics: ${JSON.stringify(normal)}`);
}

const stressTarget = isWebKit ? 420 : 800;
await page.evaluate(target => {
  const perf = globalThis.__FD_PERFORMANCE_194__;
  perf.reset();
  perf.enableRenderStress(target);
}, stressTarget);
const stressTick0 = await page.evaluate(() => Number(globalThis.__FD_STABLE_STATE165__?.bridge?.workerTick || 0));
await page.waitForTimeout(5000);
const stress = await page.evaluate(() => globalThis.__FD_PERFORMANCE_194__?.snapshot?.());

console.log('PERF194_STRESS ' + JSON.stringify({
  browserName,
  stressTarget,
  stressTick0,
  raf: stress?.raf,
  eventLoop: stress?.eventLoop,
  renderSnapshot: stress?.renderSnapshot,
  updateUI: stress?.updateUI,
  longTask: stress?.longTask,
  worker: stress?.worker,
  stress: stress?.stress,
}));

if (!stress?.stress?.enabled || stress.stress.target !== stressTarget || stress.stress.injectedTotal <= 0 || stress.stress.lastInjected <= 0) {
  throw new Error(`render stress did not execute: ${JSON.stringify(stress?.stress)}`);
}
const minimumStressRafSamples = isWebKit ? 10 : 30;
if (stress.raf.samples < minimumStressRafSamples || stress.renderSnapshot.calls < 2) {
  throw new Error(`insufficient stressed render liveness samples: ${JSON.stringify({ browserName, expected: minimumStressRafSamples, raf:stress.raf, renderSnapshot:stress.renderSnapshot })}`);
}
if (stress.worker.tick <= stressTick0 + 30 || stress.worker.failed || stress.worker.actionErrors) {
  throw new Error(`Worker stalled during render stress: ${JSON.stringify({ stressTick0, worker:stress.worker })}`);
}
if (stress.raf.maxMs > 1500 || stress.eventLoop.maxMs > 1500 || stress.renderSnapshot.maxMs > 1000) {
  throw new Error(`catastrophic render stress stall: ${JSON.stringify({ browserName, raf:stress.raf, eventLoop:stress.eventLoop, renderSnapshot:stress.renderSnapshot })}`);
}

await page.evaluate(() => globalThis.__FD_PERFORMANCE_194__.disableRenderStress());
await page.waitForTimeout(250);

const command = await page.evaluate(() => {
  const game = globalThis.__FD_DEBUG__?.game;
  const bridge = globalThis.__FD_STABLE_STATE165__?.bridge;
  const unit = game?.units?.find(item => item?.alive && item.team === 'player' && !item.embarkedIn);
  if (!game || !bridge || !unit) return { error: 'move-fixture-missing' };
  for (const selected of game.selected || []) selected.selected = false;
  game.selected = [unit];
  unit.selected = true;
  const before = { x: unit.x, y: unit.y, seq: Number(bridge.seq || 0), ack: Number(bridge.lastAck || 0) };
  const ok = game.issueMove(unit.x + 180, unit.y + 55, false);
  return { id: unit.id, before, ok, seq: Number(bridge.seq || 0) };
});
if (command.error || !command.ok || command.seq <= command.before.seq) {
  throw new Error(`post-stress command was not routed: ${JSON.stringify(command)}`);
}

const moved = await waitFor(() => page.evaluate(({ id, x, y, seq }) => {
  const game = globalThis.__FD_DEBUG__?.game;
  const bridge = globalThis.__FD_STABLE_STATE165__?.bridge;
  const unit = game?.getEntity?.(id) || game?.units?.find(item => item?.id === id);
  if (!unit || Number(bridge?.lastAck || 0) < seq) return null;
  const distance = Math.hypot(Number(unit.x || 0) - x, Number(unit.y || 0) - y);
  if (distance <= 2) return null;
  return {
    distance,
    x: unit.x,
    y: unit.y,
    ack: Number(bridge.lastAck || 0),
    workerTick: Number(bridge.workerTick || 0),
    actionErrors: Number(bridge.actionErrors || 0),
    failed: Boolean(bridge.failed),
  };
}, { id: command.id, x: command.before.x, y: command.before.y, seq: command.seq }), 12000);
if (moved.actionErrors || moved.failed) throw new Error(`post-stress Worker command failed: ${JSON.stringify(moved)}`);

const finalPerf = await page.evaluate(() => globalThis.__FD_PERFORMANCE_194__?.snapshot?.());
if (finalPerf?.stress?.enabled) throw new Error('render stress remained enabled after test');
if (errors.length) throw new Error(`browser errors: ${errors.join(' | ')}`);

console.log(JSON.stringify({
  ok: true,
  browserName,
  startup,
  normal: {
    raf: normal.perf.raf,
    eventLoop: normal.perf.eventLoop,
    renderSnapshot: normal.perf.renderSnapshot,
    longTask: normal.perf.longTask,
    worker: normal.perf.worker,
  },
  stress: {
    target: stressTarget,
    raf: stress.raf,
    eventLoop: stress.eventLoop,
    renderSnapshot: stress.renderSnapshot,
    longTask: stress.longTask,
    worker: stress.worker,
    injectedTotal: stress.stress.injectedTotal,
  },
  moved,
  errors,
}));

await context.close();
await browser.close();
