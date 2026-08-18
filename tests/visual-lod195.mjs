import { chromium, webkit, devices } from 'playwright';

const browserName = process.env.FD_BROWSER || 'chromium';
const isWebKit = browserName === 'webkit';
const url = process.env.FD_GAME_URL || 'http://127.0.0.1:8765/frontline-dominion/frontline-dominion.html?build=195';
const stressTarget = isWebKit ? 420 : 800;
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

await waitFor(() => page.evaluate(() => {
  const start = document.getElementById('start-game');
  return Boolean(
    start && !start.disabled &&
    globalThis.__FD_RUNTIME_SHELL_195__ &&
    globalThis.__FD_PERFORMANCE_194__ &&
    globalThis.__FD_ADAPTIVE_LOD_195__ &&
    globalThis.__FD_DEBUG__?.startGame &&
    Number(document.documentElement.dataset.fdBuild || 0) === 195
  );
}));

await page.locator('#start-game').click();
const startup = await waitFor(() => page.evaluate(() => {
  const game = globalThis.__FD_DEBUG__?.game;
  const bridge = globalThis.__FD_STABLE_STATE165__?.bridge;
  const lod = globalThis.__FD_ADAPTIVE_LOD_195__?.diagnostics?.();
  if (!game || !bridge || !lod || Number(bridge.workerTick || 0) < 6) return null;
  return {
    tick: Number(bridge.workerTick || 0),
    units: game.units?.filter(unit => unit?.alive).length || 0,
    buildings: game.buildings?.filter(building => building?.alive).length || 0,
    bridgeFailed: Boolean(bridge.failed),
    actionErrors: Number(bridge.actionErrors || 0),
    mainAction184: Boolean(globalThis.__FD_ACTION_GROUP_184__),
    mainObjective184: Boolean(globalThis.__FD_CONSTRUCTION_VICTORY_184__),
    lod,
  };
}));
if (!startup.units || !startup.buildings || startup.bridgeFailed || startup.actionErrors || startup.mainAction184 || startup.mainObjective184 || !startup.lod.installed) {
  throw new Error(`build 195 startup invalid: ${JSON.stringify(startup)}`);
}

await page.waitForTimeout(1400);
const baseline = await page.evaluate(() => {
  const game = globalThis.__FD_DEBUG__?.game;
  const bridge = globalThis.__FD_STABLE_STATE165__?.bridge;
  const lod = globalThis.__FD_ADAPTIVE_LOD_195__;
  const unit = game?.units?.find(item => item?.alive && item.team === 'player' && !item.embarkedIn);
  if (unit) {
    for (const selected of game.selected || []) selected.selected = false;
    game.selected = [unit];
    unit.selected = true;
  }
  const diag = lod?.diagnostics?.();
  return {
    tick: Number(bridge?.workerTick || 0),
    selectedId: unit?.id || null,
    tier: diag?.tier,
    tierName: diag?.tierName,
    budget: diag?.budget,
    inputUnits: diag?.inputUnits,
    detailedUnits: diag?.detailedUnits,
    omittedUnits: diag?.omittedUnits,
    clusters: diag?.clusters,
    actionErrors: Number(bridge?.actionErrors || 0),
    failed: Boolean(bridge?.failed),
  };
});
if (!baseline.selectedId || baseline.failed || baseline.actionErrors) throw new Error(`baseline fixture invalid: ${JSON.stringify(baseline)}`);
if (baseline.omittedUnits !== 0) throw new Error(`LOD altered small baseline army: ${JSON.stringify(baseline)}`);

await page.evaluate(target => {
  const perf = globalThis.__FD_PERFORMANCE_194__;
  perf.reset();
  perf.enableRenderStress(target);
}, stressTarget);
const stressTick0 = await page.evaluate(() => Number(globalThis.__FD_STABLE_STATE165__?.bridge?.workerTick || 0));

const active = await waitFor(() => page.evaluate(({ selectedId, initialTier }) => {
  const game = globalThis.__FD_DEBUG__?.game;
  const bridge = globalThis.__FD_STABLE_STATE165__?.bridge;
  const lodApi = globalThis.__FD_ADAPTIVE_LOD_195__;
  const diag = lodApi?.diagnostics?.();
  if (!game || !bridge || !diag || diag.activeFrames < 2 || diag.omittedUnits <= 0 || diag.clusters <= 0) return null;
  const snapshot = game.buildRenderSnapshotV9?.(1);
  const selectedPresent = Boolean(snapshot?.units?.some(unit => unit?.id === selectedId));
  const lodClusters = snapshot?.clusters94?.filter(cluster => cluster?.lod195)?.length || 0;
  if (!selectedPresent || lodClusters <= 0) return null;
  return {
    tick: Number(bridge.workerTick || 0),
    tier: diag.tier,
    tierName: diag.tierName,
    pressureTier: diag.pressureTier,
    pressureReason: diag.pressureReason,
    initialTier,
    budget: diag.budget,
    inputUnits: diag.inputUnits,
    importantUnits: diag.importantUnits,
    detailedUnits: diag.detailedUnits,
    omittedUnits: diag.omittedUnits,
    clusters: diag.clusters,
    totalOmitted: diag.totalOmitted,
    tierChanges: diag.tierChanges,
    eventLoopP95: diag.eventLoopP95,
    renderSnapshotP95: diag.renderSnapshotP95,
    selectedPresent,
    lodClusters,
    snapshotUnits: snapshot?.units?.length || 0,
    snapshotClusters: snapshot?.clusters94?.length || 0,
    failed: Boolean(bridge.failed),
    actionErrors: Number(bridge.actionErrors || 0),
  };
}, { selectedId: baseline.selectedId, initialTier: baseline.tier }), 7000, 120);

if (active.failed || active.actionErrors) throw new Error(`Worker unhealthy during LOD stress: ${JSON.stringify(active)}`);
if (active.tick <= stressTick0 + 20) throw new Error(`Worker did not advance during LOD stress: ${JSON.stringify({ stressTick0, active })}`);
if (!active.selectedPresent || active.omittedUnits <= 0 || active.clusters <= 0) throw new Error(`LOD did not preserve selected/aggregate mass: ${JSON.stringify(active)}`);
if (!(active.detailedUnits < active.inputUnits) || active.detailedUnits > active.budget + active.importantUnits + 8) {
  throw new Error(`LOD detail budget ineffective: ${JSON.stringify(active)}`);
}
if (active.tier > baseline.tier) throw new Error(`LOD quality increased under stress: ${JSON.stringify({ baseline, active })}`);

// Let pressure controller observe sustained load. Desktop must step down from
// quality under this CI stress. On headless WebKit the touch default is already
// balanced, so aggregation itself is the required behavior; a drop is optional.
await page.waitForTimeout(2600);
const stressed = await page.evaluate(() => {
  const bridge = globalThis.__FD_STABLE_STATE165__?.bridge;
  const lod = globalThis.__FD_ADAPTIVE_LOD_195__?.diagnostics?.();
  const perf = globalThis.__FD_PERFORMANCE_194__?.snapshot?.();
  return {
    tick: Number(bridge?.workerTick || 0),
    lod,
    perf: {
      eventLoop: perf?.eventLoop,
      renderSnapshot: perf?.renderSnapshot,
      worker: perf?.worker,
      stress: perf?.stress,
    },
  };
});
if (!isWebKit && stressed.lod.tier >= baseline.tier) {
  throw new Error(`desktop adaptive tier did not reduce under sustained stress: ${JSON.stringify({ baseline, active, stressed })}`);
}
if (stressed.perf.worker?.failed || stressed.perf.worker?.actionErrors) {
  throw new Error(`Worker failed under sustained LOD stress: ${JSON.stringify(stressed)}`);
}

await page.evaluate(() => {
  globalThis.__FD_PERFORMANCE_194__.disableRenderStress();
  globalThis.__FD_PERFORMANCE_194__.reset();
});
const stressTier = stressed.lod.tier;
await page.waitForTimeout(3600);
const recovered = await page.evaluate(() => {
  const bridge = globalThis.__FD_STABLE_STATE165__?.bridge;
  const lod = globalThis.__FD_ADAPTIVE_LOD_195__?.diagnostics?.();
  const perf = globalThis.__FD_PERFORMANCE_194__?.snapshot?.();
  return {
    tick: Number(bridge?.workerTick || 0),
    tier: lod?.tier,
    tierName: lod?.tierName,
    pressureTier: lod?.pressureTier,
    pressureReason: lod?.pressureReason,
    omittedUnits: lod?.omittedUnits,
    clusters: lod?.clusters,
    tierChanges: lod?.tierChanges,
    eventLoopP95: perf?.eventLoop?.p95Ms,
    renderSnapshotP95: perf?.renderSnapshot?.p95Ms,
    failed: Boolean(bridge?.failed),
    actionErrors: Number(bridge?.actionErrors || 0),
  };
});
if (recovered.failed || recovered.actionErrors) throw new Error(`Worker unhealthy after LOD recovery: ${JSON.stringify(recovered)}`);
if (recovered.tier < stressTier) throw new Error(`LOD degraded further after pressure ended: ${JSON.stringify({ stressTier, recovered })}`);
if (recovered.omittedUnits !== 0) throw new Error(`LOD still omitted small army after stress disabled: ${JSON.stringify(recovered)}`);

const command = await page.evaluate(id => {
  const game = globalThis.__FD_DEBUG__?.game;
  const bridge = globalThis.__FD_STABLE_STATE165__?.bridge;
  const unit = game?.getEntity?.(id) || game?.units?.find(item => item?.id === id);
  if (!game || !bridge || !unit) return { error: 'selected-unit-missing' };
  for (const selected of game.selected || []) selected.selected = false;
  game.selected = [unit];
  unit.selected = true;
  const before = { x: unit.x, y: unit.y, seq: Number(bridge.seq || 0), ack: Number(bridge.lastAck || 0) };
  const ok = game.issueMove(unit.x + 190, unit.y - 65, false);
  return { id: unit.id, before, ok, seq: Number(bridge.seq || 0) };
}, baseline.selectedId);
if (command.error || !command.ok || command.seq <= command.before.seq) throw new Error(`post-LOD move not routed: ${JSON.stringify(command)}`);

const moved = await waitFor(() => page.evaluate(({ id, before, seq }) => {
  const game = globalThis.__FD_DEBUG__?.game;
  const bridge = globalThis.__FD_STABLE_STATE165__?.bridge;
  const unit = game?.getEntity?.(id) || game?.units?.find(item => item?.id === id);
  if (!unit || Number(bridge?.lastAck || 0) < seq) return null;
  const distance = Math.hypot(Number(unit.x || 0) - before.x, Number(unit.y || 0) - before.y);
  if (distance <= 2) return null;
  return {
    distance,
    ack: Number(bridge.lastAck || 0),
    workerTick: Number(bridge.workerTick || 0),
    failed: Boolean(bridge.failed),
    actionErrors: Number(bridge.actionErrors || 0),
  };
}, command), 12000);
if (moved.failed || moved.actionErrors) throw new Error(`post-LOD move failed: ${JSON.stringify(moved)}`);

const profiler = await page.evaluate(() => {
  const snap = globalThis.__FD_PROFILER166__?.snapshot?.();
  return {
    build: globalThis.__FD_PROFILER166__?.build,
    version: globalThis.__FD_PROFILER166__?.version,
    lod: snap?.lod195 || null,
    performance: snap?.performance194 || null,
  };
});
if (profiler.build !== 195 || profiler.version !== '16.8.11' || profiler.lod?.build !== 195 || profiler.performance?.build !== 194) {
  throw new Error(`F10 profiler missing build 195 LOD/performance diagnostics: ${JSON.stringify(profiler)}`);
}
if (errors.length) throw new Error(`browser errors: ${errors.join(' | ')}`);

console.log(JSON.stringify({
  ok: true,
  browserName,
  startup,
  baseline,
  active,
  stressed,
  recovered,
  moved,
  profiler: { build: profiler.build, version: profiler.version, lod: profiler.lod },
  errors,
}));

await context.close();
await browser.close();
