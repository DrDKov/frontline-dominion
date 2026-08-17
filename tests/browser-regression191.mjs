import { chromium, webkit, devices } from 'playwright';

const browserName = process.env.FD_BROWSER || 'chromium';
const url = process.env.FD_GAME_URL || 'http://127.0.0.1:8765/frontline-dominion/frontline-dominion.html?build=191';
const browserType = browserName === 'webkit' ? webkit : chromium;
const browser = await browserType.launch({ headless: true });
const context = browserName === 'webkit'
  ? await browser.newContext({ ...devices['iPad Pro 11'] })
  : await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', error => pageErrors.push(String(error?.stack || error)));
page.on('console', message => {
  if (message.type() === 'error' && !/favicon|404/i.test(message.text())) pageErrors.push(`console:${message.text()}`);
});

const waitFor = async (fn, timeout = 12000, interval = 80) => {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const value = await fn();
    if (value) return value;
    await page.waitForTimeout(interval);
  }
  throw new Error(`Timed out after ${timeout} ms`);
};

await page.goto(url, { waitUntil: 'load', timeout: 60000 });
await waitFor(() => page.evaluate(() => {
  const button = document.getElementById('start-game');
  return Boolean(button && !button.disabled && globalThis.__FD_DEBUG__?.startGame);
}), 20000);
await page.locator('#start-game').click();

const startup = await waitFor(() => page.evaluate(() => {
  const game = globalThis.__FD_DEBUG__?.game;
  const stable = globalThis.__FD_STABLE_STATE165__;
  const tick = Number(stable?.tick ?? stable?.bridge?.lastWorkerTick ?? game?.simTick ?? 0);
  if (!game || tick < 6) return null;
  return {
    tick,
    paused: Boolean(game.paused),
    bridgeFailed: Boolean(stable?.bridge?.failed),
    build: Number(document.documentElement.dataset.fdBuild || 0),
  };
}), 20000);
if (startup.build !== 191) throw new Error(`wrong build: ${JSON.stringify(startup)}`);
if (startup.paused || startup.bridgeFailed) throw new Error(`simulation not running: ${JSON.stringify(startup)}`);

await page.evaluate(async () => {
  try { await globalThis.__FD_MODEL_PILOT__?.ready; } catch (_) {}
  const game = globalThis.__FD_DEBUG__?.game;
  globalThis.__FD_ENGINEER_ROCKET_191__?.normalizeGame?.(game);
});

const parity = await page.evaluate(() => {
  const D = globalThis.__FD_DEBUG__;
  const game = D?.game;
  if (!game) return null;
  let worker = game.units.find(unit => unit?.alive && unit.team === 'player' && unit.typeId === 'worker');
  let rocket = game.units.find(unit => unit?.alive && unit.team === 'player' && unit.typeId === 'rocket');
  const base = game.playerBase || { x: game.camera.x, y: game.camera.y };
  if (!worker) {
    worker = new D.Unit(game, { typeId: 'worker', team: 'player', x: base.x - 90, y: base.y + 210, rotation: 0 });
    game.addEntity(worker);
  }
  if (!rocket) {
    rocket = new D.Unit(game, { typeId: 'rocket', team: 'player', x: base.x + 90, y: base.y + 210, rotation: 0 });
    game.addEntity(rocket);
  }
  globalThis.__FD_ENGINEER_ROCKET_191__?.normalizeGame?.(game);
  game.centerCamera?.((worker.x + rocket.x) / 2, (worker.y + rocket.y) / 2);
  if (game.camera) game.camera.zoom = Math.max(1, game.camera.zoom || 1);
  const workerBounds = game.getInfantryScreenBounds138?.(worker);
  const rocketBounds = game.getInfantryScreenBounds138?.(rocket);
  return {
    workerId: worker.id,
    rocketId: rocket.id,
    workerRadius: Number(worker.radius ?? worker.stats?.radius ?? 0),
    rocketRadius: Number(rocket.radius ?? rocket.stats?.radius ?? 0),
    workerCollision: Number(worker.collisionRadius ?? worker.stats?.collisionRadius ?? worker.radius ?? 0),
    rocketCollision: Number(rocket.collisionRadius ?? rocket.stats?.collisionRadius ?? rocket.radius ?? 0),
    workerWidth: Number(workerBounds?.visibleWidth || 0),
    rocketWidth: Number(rocketBounds?.visibleWidth || 0),
    workerHeight: Number(workerBounds?.visibleHeight || 0),
    rocketHeight: Number(rocketBounds?.visibleHeight || 0),
    marker: worker._fdEngineerRocketParity191 || null,
  };
});
if (!parity) throw new Error('engineer parity payload missing');
const physicalRatio = parity.workerRadius / Math.max(0.001, parity.rocketRadius);
const collisionRatio = parity.workerCollision / Math.max(0.001, parity.rocketCollision);
const widthRatio = parity.workerWidth / Math.max(1, parity.rocketWidth);
const heightRatio = parity.workerHeight / Math.max(1, parity.rocketHeight);
for (const [label, ratio, tolerance] of [
  ['physical', physicalRatio, 0.015],
  ['collision', collisionRatio, 0.015],
  ['visible width', widthRatio, 0.04],
  ['visible height', heightRatio, 0.04],
]) {
  if (!Number.isFinite(ratio) || Math.abs(ratio - 1) > tolerance) {
    throw new Error(`engineer ${label} ratio mismatch: ${ratio}; ${JSON.stringify(parity)}`);
  }
}
if (Number(parity.marker?.build || 0) !== 191 || parity.marker?.referenceType !== 'rocket') {
  throw new Error(`engineer is not owned by rocket parity module: ${JSON.stringify(parity)}`);
}

let commandResult = { skipped: browserName !== 'chromium' };
if (browserName === 'chromium') {
  const target = await page.evaluate(() => {
    const game = globalThis.__FD_DEBUG__?.game;
    const unit = game?.units.find(candidate => candidate?.alive && candidate.team === 'player' && !candidate.air && candidate.typeId !== 'worker' && !candidate.embarkedIn);
    if (!game || !unit) return null;
    game.centerCamera?.(unit.x, unit.y);
    if (game.camera) game.camera.zoom = Math.max(0.9, game.camera.zoom || 1);
    game.setSelection?.([], false);
    const bounds = game.getUnitScreenBounds116?.(unit) || game.getInfantryScreenBounds138?.(unit);
    const canvas = document.getElementById('game-canvas');
    const rect = canvas.getBoundingClientRect();
    const toCss = point => ({
      x: rect.left + point.x * rect.width / canvas.width,
      y: rect.top + point.y * rect.height / canvas.height,
    });
    const centerInternal = bounds
      ? { x: (bounds.x1 + bounds.x2) / 2, y: (bounds.y1 + bounds.y2) / 2 }
      : game.worldToScreen(unit.x, unit.y, 0);
    const destinationWorld = { x: unit.x + 420, y: unit.y + 70 };
    const destinationInternal = game.worldToScreen(destinationWorld.x, destinationWorld.y, 0);
    const bridge = globalThis.__FD_STABLE_STATE165__?.bridge;
    return {
      unitId: unit.id,
      beforeX: unit.x,
      beforeY: unit.y,
      beforeAck: Number(bridge?.lastAck ?? bridge?.appliedNetworkSeq ?? 0),
      select: toCss(centerInternal),
      destination: toCss(destinationInternal),
    };
  });
  if (!target) throw new Error('no controllable player unit for command test');
  await page.mouse.click(target.select.x, target.select.y, { button: 'left' });
  await waitFor(() => page.evaluate(id => globalThis.__FD_DEBUG__?.game?.selected?.some(entity => entity.id === id), target.unitId), 5000);
  await page.mouse.click(target.destination.x, target.destination.y, { button: 'right' });
  commandResult = await waitFor(() => page.evaluate(({ id, x, y, ack }) => {
    const game = globalThis.__FD_DEBUG__?.game;
    const unit = game?.getEntity?.(id) || game?.units?.find(entity => entity.id === id);
    const bridge = globalThis.__FD_STABLE_STATE165__?.bridge;
    const currentAck = Number(bridge?.lastAck ?? bridge?.appliedNetworkSeq ?? 0);
    const moved = unit ? Math.hypot(unit.x - x, unit.y - y) : 0;
    if (moved < 8) return null;
    return {
      unitId: id,
      moved,
      currentAck,
      ackAdvanced: currentAck > ack,
      command: unit.currentCommand?.type || null,
      workerTick: Number(globalThis.__FD_STABLE_STATE165__?.tick ?? bridge?.lastWorkerTick ?? 0),
      actionErrors: Number(bridge?.actionErrors || 0),
      failed: Boolean(bridge?.failed),
    };
  }, { id: target.unitId, x: target.beforeX, y: target.beforeY, ack: target.beforeAck }), 9000);
  if (commandResult.failed || commandResult.actionErrors) throw new Error(`command pipeline failed: ${JSON.stringify(commandResult)}`);
}

if (pageErrors.length) throw new Error(`browser errors: ${pageErrors.join(' | ')}`);
console.log(JSON.stringify({ ok: true, browserName, startup, parity, ratios: { physicalRatio, collisionRatio, widthRatio, heightRatio }, commandResult }));
await browser.close();
