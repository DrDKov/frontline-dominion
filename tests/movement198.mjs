import { chromium, webkit } from 'playwright';

const browserName = process.env.FD_BROWSER || 'chromium';
const launcher = browserName === 'webkit' ? webkit : chromium;
const url = process.env.FD_GAME_URL || 'http://127.0.0.1:8765/frontline-dominion/frontline-dominion.html?build=198';
const browser = await launcher.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(String(error?.stack || error)));
page.on('console', message => {
  if (message.type() === 'error' && !/favicon|404/i.test(message.text())) errors.push(`console:${message.text()}`);
});

const waitFor = async (fn, timeout = 30000, interval = 100) => {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const value = await fn();
    if (value) return value;
    await page.waitForTimeout(interval);
  }
  throw new Error(`Timed out after ${timeout} ms`);
};

await page.goto(url, { waitUntil: 'load', timeout: 60000 });
await waitFor(() => page.evaluate(() => Boolean(
  globalThis.__FD_RUNTIME_SHELL_198__?.build === 198 &&
  globalThis.__FD_RIGHT_CLICK_AUTHORITY_197__?.build === 197 &&
  globalThis.__FD_COMMAND_INPUT_190__?.route &&
  globalThis.__FD_DEBUG__?.startGame &&
  !document.getElementById('start-game')?.disabled
)));
await page.locator('#start-game').click();
await waitFor(() => page.evaluate(() => {
  const game = globalThis.__FD_DEBUG__?.game;
  const bridge = globalThis.__FD_STABLE_STATE165__?.bridge;
  return Boolean(game && bridge?.ready && !bridge.failed && Number(bridge.workerTick || 0) >= 10);
}));

const fixture = await page.evaluate(() => {
  const D = globalThis.__FD_DEBUG__;
  const game = D?.game;
  const bridge = globalThis.__FD_STABLE_STATE165__?.bridge;
  const canvas = document.getElementById('game-canvas');
  const rect = canvas?.getBoundingClientRect?.();
  const units = (game?.units || []).filter(unit => unit?.alive && unit.team === 'player' && !unit.air && !unit.embarkedIn).slice(0, 4);
  if (!game || !bridge || !canvas || !rect?.width || !rect?.height || units.length < 2) return { error: 'movement-fixture-missing' };

  game.setSelection?.(units, false);
  game.formationSettings = { ...(game.formationSettings || {}), formation: 'column', type: 'column' };
  const center = units.reduce((acc, unit) => ({ x: acc.x + unit.x / units.length, y: acc.y + unit.y / units.length }), { x: 0, y: 0 });
  game.centerCamera?.(center.x, center.y);
  if (game.camera) game.camera.zoom = Math.max(0.72, Math.min(0.92, Number(game.camera.zoom) || 0.82));
  game.render?.();

  const world = D.WORLD || { width: 32000, height: 22000 };
  const obstacles = [...(game.buildings || []), ...(game.resources || [])].filter(item => item?.alive !== false);
  let target = null;
  for (const radius of [300, 380, 460, 540, 620]) {
    for (const angle of [0, Math.PI / 2, -Math.PI / 2, Math.PI, Math.PI / 4, -Math.PI / 4, 3 * Math.PI / 4, -3 * Math.PI / 4]) {
      const x = center.x + Math.cos(angle) * radius;
      const y = center.y + Math.sin(angle) * radius;
      if (x < 140 || y < 140 || x > world.width - 140 || y > world.height - 140) continue;
      if (obstacles.some(item => Math.hypot(Number(item.x || 0) - x, Number(item.y || 0) - y) < (Number(item.radius || 24) + 120))) continue;
      const screen = game.worldToScreen?.(x, y, 0);
      if (!screen || !Number.isFinite(screen.x) || !Number.isFinite(screen.y)) continue;
      const cssX = rect.left + screen.x * rect.width / canvas.width;
      const cssY = rect.top + screen.y * rect.height / canvas.height;
      if (cssX < rect.left + 35 || cssY < rect.top + 35 || cssX > rect.right - 35 || cssY > rect.bottom - 35) continue;
      target = { x, y, cssX, cssY };
      break;
    }
    if (target) break;
  }
  if (!target) return { error: 'open-target-missing', center };

  const originalContext = game.hitTestForContext;
  const originalHit = game.hitTest;
  const hadOwnContext = Object.prototype.hasOwnProperty.call(game, 'hitTestForContext');
  const hadOwnHit = Object.prototype.hasOwnProperty.call(game, 'hitTest');
  const near = (x, y) => Math.hypot(Number(x || 0) - target.x, Number(y || 0) - target.y) <= 110;
  game.hitTestForContext = function(x, y, ...rest) {
    if (near(x, y)) return null;
    return typeof originalContext === 'function' ? originalContext.call(this, x, y, ...rest) : null;
  };
  game.hitTest = function(x, y, selectableOnly = true, ...rest) {
    if (!selectableOnly && near(x, y)) return null;
    return typeof originalHit === 'function' ? originalHit.call(this, x, y, selectableOnly, ...rest) : null;
  };
  globalThis.__FD_MOVE198_RESTORE__ = () => {
    if (hadOwnContext) game.hitTestForContext = originalContext; else delete game.hitTestForContext;
    if (hadOwnHit) game.hitTest = originalHit; else delete game.hitTest;
    delete globalThis.__FD_MOVE198_RESTORE__;
  };

  globalThis.__FD_MOVE198_ACTIONS__ = [];
  const worker = bridge.worker;
  const originalPost = worker.postMessage.bind(worker);
  worker.postMessage = function(message, ...rest) {
    if (message?.type === 'action') globalThis.__FD_MOVE198_ACTIONS__.push(structuredClone(message));
    return originalPost(message, ...rest);
  };
  globalThis.__FD_MOVE198_RESTORE_WORKER__ = () => {
    worker.postMessage = originalPost;
    delete globalThis.__FD_MOVE198_RESTORE_WORKER__;
  };

  return {
    ids: units.map(unit => unit.id),
    before: Object.fromEntries(units.map(unit => [unit.id, { x: unit.x, y: unit.y }])),
    center,
    target,
    beforeSeq: Number(bridge.seq || 0),
    beforeErrors: Number(bridge.actionErrors || 0),
  };
});
if (fixture.error) throw new Error(JSON.stringify(fixture));

try {
  await page.mouse.click(fixture.target.cssX, fixture.target.cssY, { button: 'right' });
  await waitFor(() => page.evaluate(beforeSeq => Number(globalThis.__FD_STABLE_STATE165__?.bridge?.seq || 0) > beforeSeq, fixture.beforeSeq), 6000);
} finally {
  await page.evaluate(() => globalThis.__FD_MOVE198_RESTORE__?.());
}

const routed = await waitFor(() => page.evaluate(({ beforeSeq, target }) => {
  const bridge = globalThis.__FD_STABLE_STATE165__?.bridge;
  const actions = globalThis.__FD_MOVE198_ACTIONS__ || [];
  const issued = actions.filter(action => Number(action.seq || 0) > beforeSeq);
  if (!bridge || !issued.length || Number(bridge.lastAck || 0) < Number(issued.at(-1)?.seq || 0)) return null;
  return {
    bridgeSeq: Number(bridge.seq || 0),
    ack: Number(bridge.lastAck || 0),
    actions: issued,
    targetError: Math.hypot(Number(issued[0]?.payload?.x) - target.x, Number(issued[0]?.payload?.y) - target.y),
  };
}, { beforeSeq: fixture.beforeSeq, target: fixture.target }), 9000);

if (routed.actions.length !== 1) throw new Error(`physical right click emitted ${routed.actions.length} actions: ${JSON.stringify(routed)}`);
const action = routed.actions[0];
if (action.action !== 'context' || action.payload?.targetId != null || routed.targetError > 8) {
  throw new Error(`physical right click routed incorrectly: ${JSON.stringify({ fixture, routed })}`);
}

const arrival = await waitFor(() => page.evaluate(({ ids, before, target, beforeErrors }) => {
  const game = globalThis.__FD_DEBUG__?.game;
  const bridge = globalThis.__FD_STABLE_STATE165__?.bridge;
  const units = ids.map(id => game?.getEntity?.(id)).filter(Boolean);
  if (!game || !bridge || units.length !== ids.length) return null;
  const center = units.reduce((acc, unit) => ({ x: acc.x + Number(unit.x || 0) / units.length, y: acc.y + Number(unit.y || 0) / units.length }), { x: 0, y: 0 });
  const moved = units.map(unit => Math.hypot(Number(unit.x || 0) - before[unit.id].x, Number(unit.y || 0) - before[unit.id].y));
  const targetError = Math.hypot(center.x - target.x, center.y - target.y);
  if (Math.max(...moved) < 80 || targetError > 95) return null;
  return {
    center,
    targetError,
    moved,
    workerTick: Number(bridge.workerTick || 0),
    bridgeFailed: Boolean(bridge.failed),
    errorDelta: Number(bridge.actionErrors || 0) - beforeErrors,
    commands: units.map(unit => unit.currentCommand?.type || unit.commandQueue?.[0]?.type || null),
  };
}, { ids: fixture.ids, before: fixture.before, target: fixture.target, beforeErrors: fixture.beforeErrors }), 30000, 120);

await page.evaluate(() => globalThis.__FD_MOVE198_RESTORE_WORKER__?.());
if (arrival.bridgeFailed || arrival.errorDelta || errors.length) {
  throw new Error(`movement gate unhealthy: ${JSON.stringify({ fixture, routed, arrival, errors })}`);
}

console.log(JSON.stringify({ ok: true, browserName, fixture, routed, arrival, errors }));
await context.close();
await browser.close();
