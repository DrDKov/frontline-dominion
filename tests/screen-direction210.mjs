import { chromium } from 'playwright';

const url = process.env.FD_GAME_URL || 'http://127.0.0.1:8765/frontline-dominion/frontline-dominion.html?build=210';
const browser = await chromium.launch({ headless: true });
const directions = [
  { name: 'up', dx: 0, dy: -140 },
  { name: 'right', dx: 140, dy: 0 },
  { name: 'down', dx: 0, dy: 140 },
  { name: 'left', dx: -140, dy: 0 },
];

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

async function openGame(dpr) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: dpr, hasTouch: dpr > 1 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(String(error?.stack || error)));
  await page.goto(url, { waitUntil: 'load', timeout: 60000 });
  await waitFor(page, () => ({
    __pending: !(globalThis.__FD_RUNTIME_SHELL_210__?.build === 210 && globalThis.__FD_SCREEN_INPUT_FIDELITY_210__?.build === 210 && globalThis.__FD_DEBUG__?.startGame && !document.getElementById('start-game')?.disabled),
  }));
  await page.locator('#start-game').click();
  await waitFor(page, () => {
    const g = globalThis.__FD_DEBUG__?.game;
    const b = globalThis.__FD_STABLE_STATE165__?.bridge;
    return { __pending: !(g && b?.ready && !b.failed && Number(b.workerTick || 0) >= 12) };
  });
  return { context, page, errors };
}

async function prepare(page, direction) {
  return page.evaluate(({ dx, dy, name }) => {
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
    };
  }, direction);
}

async function readResult(page, fixture, direction) {
  const routed = await waitFor(page, ({ beforeSeq, id, beforeScreen, targetScreen, dx, dy, expectedWorld }) => {
    const g = globalThis.__FD_DEBUG__.game;
    const bridge = globalThis.__FD_STABLE_STATE165__.bridge;
    const actions = (globalThis.__FD210_ACTIONS__ || []).filter(a => Number(a.seq || 0) > beforeSeq);
    const unit = g.getEntity(id);
    if (!actions.length || Number(bridge.lastAck || 0) < Number(actions.at(-1)?.seq || 0) || !unit) return { __pending: true };
    const cmd = unit.currentCommand || unit.commandQueue?.[0] || null;
    if (!cmd || !Number.isFinite(Number(cmd.x)) || !Number.isFinite(Number(cmd.y))) return { __pending: true };
    const endScreen = g.worldToScreen(Number(cmd.x), Number(cmd.y), 0);
    const commandScreenVector = { x: endScreen.x - beforeScreen.x, y: endScreen.y - beforeScreen.y };
    const targetScreenError = Math.hypot(endScreen.x - targetScreen.x, endScreen.y - targetScreen.y);
    const worldTargetError = Math.hypot(Number(actions[0]?.payload?.x) - Number(expectedWorld.x), Number(actions[0]?.payload?.y) - Number(expectedWorld.y));
    const desiredLength = Math.max(1e-9, Math.hypot(dx, dy));
    const commandLength = Math.max(1e-9, Math.hypot(commandScreenVector.x, commandScreenVector.y));
    const commandCosine = (commandScreenVector.x * dx + commandScreenVector.y * dy) / (commandLength * desiredLength);
    return {
      action: actions[0], cmd: structuredClone(cmd), endScreen, commandScreenVector,
      targetScreenError, worldTargetError, commandCosine,
      input: globalThis.__FD_COMMAND_INPUT_190__?.diagnostics?.(),
      bridge: { seq: bridge.seq, lastAck: bridge.lastAck, workerTick: bridge.workerTick, failed: bridge.failed },
    };
  }, { beforeSeq: fixture.beforeSeq, id: fixture.id, beforeScreen: fixture.beforeScreen, targetScreen: fixture.targetScreen, dx: direction.dx, dy: direction.dy, expectedWorld: fixture.expectedWorld }, 10000);

  const motion = await waitFor(page, ({ id, before, beforeScreen, dx, dy }) => {
    const g = globalThis.__FD_DEBUG__.game;
    const unit = g.getEntity(id);
    if (!unit) return { __pending: true };
    const worldMoved = Math.hypot(unit.x - before.x, unit.y - before.y);
    if (worldMoved < 30) return { __pending: true, worldMoved };
    const afterScreen = g.worldToScreen(unit.x, unit.y, 0);
    const vector = { x: afterScreen.x - beforeScreen.x, y: afterScreen.y - beforeScreen.y };
    const desiredLength = Math.max(1e-9, Math.hypot(dx, dy));
    const movedLength = Math.max(1e-9, Math.hypot(vector.x, vector.y));
    const cosine = (vector.x * dx + vector.y * dy) / (movedLength * desiredLength);
    return { worldMoved, afterScreen, vector, cosine };
  }, { id: fixture.id, before: fixture.before, beforeScreen: fixture.beforeScreen, dx: direction.dx, dy: direction.dy }, 12000);
  return { routed, motion };
}

async function runMouse(dpr, direction) {
  const { context, page, errors } = await openGame(dpr);
  const fixture = await prepare(page, direction);
  if (fixture.error) throw new Error(JSON.stringify(fixture));
  await page.mouse.click(fixture.client.x, fixture.client.y, { button: 'right' });
  await page.evaluate(() => globalThis.__FD210_RESTORE_HIT__?.());
  const result = await readResult(page, fixture, direction);
  await page.evaluate(() => globalThis.__FD210_RESTORE_WORKER__?.());
  const row = { mode: 'mouse', dpr, direction: direction.name, fixture, ...result, errors };
  console.log('SCREEN_DIRECTION_210', JSON.stringify(row));
  if (errors.length || result.routed.targetScreenError > 2 || result.routed.worldTargetError > 3 || result.routed.commandCosine < 0.98 || result.motion.cosine < 0.8) {
    throw new Error(`SCREEN_DIRECTION_210_MOUSE_FAIL ${JSON.stringify(row)}`);
  }
  await context.close();
}

async function runLongPress(direction) {
  const { context, page, errors } = await openGame(2);
  const fixture = await prepare(page, direction);
  if (fixture.error) throw new Error(JSON.stringify(fixture));
  const cdp = await context.newCDPSession(page);
  const point = { x: fixture.client.x, y: fixture.client.y, radiusX: 1, radiusY: 1, force: 1, id: 77 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
  await page.waitForTimeout(460);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.evaluate(() => globalThis.__FD210_RESTORE_HIT__?.());
  const result = await readResult(page, fixture, direction);
  await page.evaluate(() => globalThis.__FD210_RESTORE_WORKER__?.());
  const row = { mode: 'long-press', dpr: 2, direction: direction.name, fixture, ...result, errors };
  console.log('TOUCH_DIRECTION_210', JSON.stringify(row));
  if (errors.length || result.routed.input?.lastSource !== 'long-press' || result.routed.targetScreenError > 2 || result.routed.worldTargetError > 3 || result.routed.commandCosine < 0.98 || result.motion.cosine < 0.8) {
    throw new Error(`SCREEN_DIRECTION_210_TOUCH_FAIL ${JSON.stringify(row)}`);
  }
  await context.close();
}

for (const direction of directions) await runMouse(2, direction);
await runMouse(1, directions[0]);
await runLongPress(directions[0]);

console.log(JSON.stringify({ ok: true, build: 210, dpr2Directions: directions.map(d => d.name), dpr1: true, touchLongPress: true }));
await browser.close();
