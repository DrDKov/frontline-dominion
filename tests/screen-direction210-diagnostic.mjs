import { chromium } from 'playwright';

const url = process.env.FD_GAME_URL || 'http://127.0.0.1:8765/frontline-dominion/frontline-dominion.html?build=209';
const browser = await chromium.launch({ headless: true });
const directions = [
  { name: 'up', dx: 0, dy: -140 },
  { name: 'right', dx: 140, dy: 0 },
  { name: 'down', dx: 0, dy: 140 },
  { name: 'left', dx: -140, dy: 0 },
];
const results = [];

const waitFor = async (page, fn, arg, timeout = 20000, interval = 80) => {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < timeout) {
    last = await page.evaluate(fn, arg);
    if (last && !last.__pending) return last;
    await page.waitForTimeout(interval);
  }
  throw new Error(`Timed out after ${timeout}ms; last=${JSON.stringify(last)}`);
};

for (const direction of directions) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, hasTouch: true });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(String(error?.stack || error)));

  await page.goto(url, { waitUntil: 'load', timeout: 60000 });
  await waitFor(page, () => ({
    __pending: !(globalThis.__FD_RUNTIME_SHELL_209__?.build === 209 && globalThis.__FD_DEBUG__?.startGame && !document.getElementById('start-game')?.disabled),
  }));
  await page.locator('#start-game').click();
  await waitFor(page, () => {
    const g = globalThis.__FD_DEBUG__?.game;
    const b = globalThis.__FD_STABLE_STATE165__?.bridge;
    return { __pending: !(g && b?.ready && !b.failed && Number(b.workerTick || 0) >= 12) };
  });

  const fixture = await page.evaluate(({ dx, dy, name }) => {
    const g = globalThis.__FD_DEBUG__.game;
    const bridge = globalThis.__FD_STABLE_STATE165__.bridge;
    const canvas = document.getElementById('game-canvas');
    const rect = canvas.getBoundingClientRect();
    const unit = (g.units || []).find(u => u?.alive && u.team === 'player' && u.kind === 'unit' && !u.air && !u.embarkedIn);
    if (!unit) return { error: 'ground-unit-missing' };
    g.setSelection?.([unit], false);
    g.setFormationEnabled201?.(false, false);
    if (g.formationSettings) g.formationSettings.enabled = false;
    g.centerCamera?.(unit.x, unit.y);
    if (g.camera) { g.camera.x = unit.x; g.camera.y = unit.y; g.camera.zoom = 0.82; }
    g.render?.();

    const beforeScreen = g.worldToScreen(unit.x, unit.y, 0);
    const targetScreen = { x: beforeScreen.x + dx, y: beforeScreen.y + dy };
    // worldToScreen/screenToWorld use game.viewport coordinates. Convert those to
    // CSS client coordinates using the same viewport, not the HiDPI canvas backing size.
    const client = {
      x: rect.left + targetScreen.x * rect.width / g.viewport.width,
      y: rect.top + targetScreen.y * rect.height / g.viewport.height,
    };
    const expectedWorld = g.screenToWorld(targetScreen.x, targetScreen.y, 0) || g.screenToWorld(targetScreen.x, targetScreen.y);

    const originalContext = g.hitTestForContext;
    const originalHit = g.hitTest;
    g.hitTestForContext = () => null;
    g.hitTest = (x, y, selectableOnly = true, ...rest) => selectableOnly ? originalHit?.call(g, x, y, selectableOnly, ...rest) : null;
    globalThis.__FD210_RESTORE_HIT__ = () => {
      g.hitTestForContext = originalContext;
      g.hitTest = originalHit;
      delete globalThis.__FD210_RESTORE_HIT__;
    };

    globalThis.__FD210_ACTIONS__ = [];
    const originalPost = bridge.worker.postMessage.bind(bridge.worker);
    bridge.worker.postMessage = function(message, ...rest) {
      if (message?.type === 'action') globalThis.__FD210_ACTIONS__.push(structuredClone(message));
      return originalPost(message, ...rest);
    };
    globalThis.__FD210_RESTORE_WORKER__ = () => {
      bridge.worker.postMessage = originalPost;
      delete globalThis.__FD210_RESTORE_WORKER__;
    };

    return {
      name,
      id: unit.id,
      before: { x: unit.x, y: unit.y },
      beforeScreen,
      targetScreen,
      client,
      expectedWorld,
      beforeSeq: Number(bridge.seq || 0),
      dimensions: {
        dpr: devicePixelRatio,
        canvasWidth: canvas.width,
        canvasHeight: canvas.height,
        rectWidth: rect.width,
        rectHeight: rect.height,
        viewportWidth: g.viewport.width,
        viewportHeight: g.viewport.height,
      },
      screenToWorldSource: String(g.screenToWorld),
      worldToScreenSource: String(g.worldToScreen),
    };
  }, direction);
  if (fixture.error) throw new Error(JSON.stringify(fixture));

  await page.mouse.click(fixture.client.x, fixture.client.y, { button: 'right' });
  await page.evaluate(() => globalThis.__FD210_RESTORE_HIT__?.());

  const routed = await waitFor(page, ({ beforeSeq, id, before, beforeScreen, targetScreen, dx, dy }) => {
    const g = globalThis.__FD_DEBUG__.game;
    const bridge = globalThis.__FD_STABLE_STATE165__.bridge;
    const actions = (globalThis.__FD210_ACTIONS__ || []).filter(a => Number(a.seq || 0) > beforeSeq);
    const unit = g.getEntity(id);
    if (!actions.length || Number(bridge.lastAck || 0) < Number(actions.at(-1)?.seq || 0) || !unit) return { __pending: true };
    const cmd = unit.currentCommand || unit.commandQueue?.[0] || null;
    if (!cmd || !Number.isFinite(Number(cmd.x)) || !Number.isFinite(Number(cmd.y))) return { __pending: true, action: actions[0], cmd };
    const endScreen = g.worldToScreen(Number(cmd.x), Number(cmd.y), 0);
    const commandScreenVector = { x: endScreen.x - beforeScreen.x, y: endScreen.y - beforeScreen.y };
    const desiredLength = Math.max(1e-9, Math.hypot(dx, dy));
    const commandLength = Math.max(1e-9, Math.hypot(commandScreenVector.x, commandScreenVector.y));
    const commandCosine = (commandScreenVector.x * dx + commandScreenVector.y * dy) / (commandLength * desiredLength);
    return {
      action: actions[0],
      cmd: structuredClone(cmd),
      input: globalThis.__FD_COMMAND_INPUT_190__?.diagnostics?.(),
      before,
      targetScreen,
      endScreen,
      commandScreenVector,
      commandCosine,
      bridge: { seq: bridge.seq, lastAck: bridge.lastAck, workerTick: bridge.workerTick, failed: bridge.failed },
    };
  }, { beforeSeq: fixture.beforeSeq, id: fixture.id, before: fixture.before, beforeScreen: fixture.beforeScreen, targetScreen: fixture.targetScreen, dx: direction.dx, dy: direction.dy }, 10000);

  const motion = await waitFor(page, ({ id, before, beforeScreen, dx, dy }) => {
    const g = globalThis.__FD_DEBUG__.game;
    const unit = g.getEntity(id);
    if (!unit) return { __pending: true };
    const worldMoved = Math.hypot(unit.x - before.x, unit.y - before.y);
    if (worldMoved < 35) return { __pending: true, worldMoved, x: unit.x, y: unit.y };
    const afterScreen = g.worldToScreen(unit.x, unit.y, 0);
    const screenVector = { x: afterScreen.x - beforeScreen.x, y: afterScreen.y - beforeScreen.y };
    const desiredLength = Math.max(1e-9, Math.hypot(dx, dy));
    const movedLength = Math.max(1e-9, Math.hypot(screenVector.x, screenVector.y));
    const cosine = (screenVector.x * dx + screenVector.y * dy) / (movedLength * desiredLength);
    return { world: { x: unit.x, y: unit.y }, worldMoved, afterScreen, screenVector, cosine };
  }, { id: fixture.id, before: fixture.before, beforeScreen: fixture.beforeScreen, dx: direction.dx, dy: direction.dy }, 12000);

  await page.evaluate(() => globalThis.__FD210_RESTORE_WORKER__?.());
  const row = { direction, fixture, routed, motion, pageErrors };
  results.push(row);
  console.log('SCREEN_DIRECTION_210', JSON.stringify(row));
  await context.close();
}

console.log('SCREEN_DIRECTION_210_SUMMARY', JSON.stringify(results.map(r => ({
  direction: r.direction.name,
  dimensions: r.fixture.dimensions,
  expectedWorld: r.fixture.expectedWorld,
  action: r.routed.action,
  commandScreenVector: r.routed.commandScreenVector,
  commandCosine: r.routed.commandCosine,
  motionScreenVector: r.motion.screenVector,
  motionCosine: r.motion.cosine,
}))));

const bad = results.filter(r => r.routed.commandCosine < 0.6 || r.motion.cosine < 0.2 || r.pageErrors.length);
if (bad.length) throw new Error(`SCREEN_DIRECTION_MISMATCH ${JSON.stringify(bad.map(r => ({ direction: r.direction.name, dimensions: r.fixture.dimensions, routed: r.routed, motion: r.motion, errors: r.pageErrors })))}`);

await browser.close();
