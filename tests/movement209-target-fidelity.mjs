import { chromium } from 'playwright';

const url = process.env.FD_GAME_URL || 'http://127.0.0.1:8765/frontline-dominion/frontline-dominion.html?build=208';
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(String(error?.stack || error)));
page.on('console', message => {
  if (message.type() === 'error' && !/favicon|404/i.test(message.text())) errors.push(`console:${message.text()}`);
});

const waitFor = async (fn, timeout = 30000, interval = 100) => {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < timeout) {
    last = await fn();
    if (last) return last;
    await page.waitForTimeout(interval);
  }
  throw new Error(`Timed out after ${timeout} ms; last=${JSON.stringify(last)}`);
};

await page.goto(url, { waitUntil: 'load', timeout: 60000 });
await waitFor(() => page.evaluate(() => Boolean(
  globalThis.__FD_RUNTIME_SHELL_208__?.build === 208 &&
  globalThis.__FD_RIGHT_CLICK_AUTHORITY_197__?.route !== false &&
  typeof globalThis.__FD_COMMAND_INPUT_190__?.route === 'function' &&
  globalThis.__FD_DEBUG__?.startGame &&
  !document.getElementById('start-game')?.disabled
)));
await page.locator('#start-game').click();
await waitFor(() => page.evaluate(() => {
  const game = globalThis.__FD_DEBUG__?.game;
  const bridge = globalThis.__FD_STABLE_STATE165__?.bridge;
  return Boolean(game && bridge?.ready && !bridge.failed && Number(bridge.workerTick || 0) >= 12);
}));

const fixture = await page.evaluate(() => {
  const D = globalThis.__FD_DEBUG__;
  const game = D?.game;
  const bridge = globalThis.__FD_STABLE_STATE165__?.bridge;
  const canvas = document.getElementById('game-canvas');
  const rect = canvas?.getBoundingClientRect?.();
  const units = (game?.units || []).filter(unit => unit?.alive && unit.team === 'player' && unit.kind === 'unit' && !unit.air && !unit.embarkedIn).slice(0, 4);
  if (!game || !bridge || !canvas || !rect?.width || !rect?.height || units.length < 2) return { error: 'movement-fixture-missing', unitCount: units.length };

  game.setSelection?.(units, false);
  game.formationSettings = { ...(game.formationSettings || {}), formation: 'column', type: 'column' };
  const center = units.reduce((acc, unit) => ({ x: acc.x + unit.x / units.length, y: acc.y + unit.y / units.length }), { x: 0, y: 0 });
  game.centerCamera?.(center.x, center.y);
  if (game.camera) game.camera.zoom = Math.max(0.72, Math.min(0.92, Number(game.camera.zoom) || 0.82));
  game.render?.();

  const world = D.WORLD || { width: 32000, height: 22000 };
  const obstacles = [...(game.buildings || []), ...(game.resources || [])].filter(item => item?.alive !== false);
  let target = null;
  for (const radius of [420, 520, 620, 760]) {
    for (const angle of [0, Math.PI / 2, Math.PI, -Math.PI / 2, Math.PI / 4, 3 * Math.PI / 4, -3 * Math.PI / 4, -Math.PI / 4]) {
      const x = center.x + Math.cos(angle) * radius;
      const y = center.y + Math.sin(angle) * radius;
      if (x < 180 || y < 180 || x > world.width - 180 || y > world.height - 180) continue;
      if (obstacles.some(item => Math.hypot(Number(item.x || 0) - x, Number(item.y || 0) - y) < (Number(item.radius || 24) + 150))) continue;
      const screen = game.worldToScreen?.(x, y, 0);
      if (!screen || !Number.isFinite(screen.x) || !Number.isFinite(screen.y)) continue;
      const cssX = rect.left + screen.x * rect.width / canvas.width;
      const cssY = rect.top + screen.y * rect.height / canvas.height;
      if (cssX < rect.left + 50 || cssY < rect.top + 50 || cssX > rect.right - 50 || cssY > rect.bottom - 50) continue;
      target = { x, y, cssX, cssY, screenX: screen.x, screenY: screen.y };
      break;
    }
    if (target) break;
  }
  if (!target) return { error: 'open-target-missing', center };

  // Force this diagnostic click to be pure terrain movement. The test is about
  // coordinate/formation fidelity, not context-target classification.
  const originalContext = game.hitTestForContext;
  const originalHit = game.hitTest;
  const hadOwnContext = Object.prototype.hasOwnProperty.call(game, 'hitTestForContext');
  const hadOwnHit = Object.prototype.hasOwnProperty.call(game, 'hitTest');
  const near = (x, y) => Math.hypot(Number(x || 0) - target.x, Number(y || 0) - target.y) <= 130;
  game.hitTestForContext = function(x, y, ...rest) {
    if (near(x, y)) return null;
    return typeof originalContext === 'function' ? originalContext.call(this, x, y, ...rest) : null;
  };
  game.hitTest = function(x, y, selectableOnly = true, ...rest) {
    if (!selectableOnly && near(x, y)) return null;
    return typeof originalHit === 'function' ? originalHit.call(this, x, y, selectableOnly, ...rest) : null;
  };
  globalThis.__FD_MOVE209_RESTORE_HIT__ = () => {
    if (hadOwnContext) game.hitTestForContext = originalContext; else delete game.hitTestForContext;
    if (hadOwnHit) game.hitTest = originalHit; else delete game.hitTest;
    delete globalThis.__FD_MOVE209_RESTORE_HIT__;
  };

  globalThis.__FD_MOVE209_ACTIONS__ = [];
  const worker = bridge.worker;
  const originalPost = worker.postMessage.bind(worker);
  worker.postMessage = function(message, ...rest) {
    if (message?.type === 'action') globalThis.__FD_MOVE209_ACTIONS__.push(structuredClone(message));
    return originalPost(message, ...rest);
  };
  globalThis.__FD_MOVE209_RESTORE_WORKER__ = () => {
    worker.postMessage = originalPost;
    delete globalThis.__FD_MOVE209_RESTORE_WORKER__;
  };

  return {
    ids: units.map(unit => unit.id),
    before: Object.fromEntries(units.map(unit => [unit.id, { x: unit.x, y: unit.y }])),
    center,
    target,
    beforeDistance: Math.hypot(center.x - target.x, center.y - target.y),
    beforeSeq: Number(bridge.seq || 0),
    beforeErrors: Number(bridge.actionErrors || 0),
    camera: game.camera ? { x: game.camera.x, y: game.camera.y, zoom: game.camera.zoom } : null,
    canvas: { width: canvas.width, height: canvas.height, rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height } },
  };
});
if (fixture.error) throw new Error(`Movement fixture failed: ${JSON.stringify(fixture)}`);

try {
  await page.mouse.click(fixture.target.cssX, fixture.target.cssY, { button: 'right' });
  await waitFor(() => page.evaluate(beforeSeq => Number(globalThis.__FD_STABLE_STATE165__?.bridge?.seq || 0) > beforeSeq, fixture.beforeSeq), 6000);
} finally {
  await page.evaluate(() => globalThis.__FD_MOVE209_RESTORE_HIT__?.());
}

const routed = await waitFor(() => page.evaluate(({ beforeSeq, target }) => {
  const bridge = globalThis.__FD_STABLE_STATE165__?.bridge;
  const input = globalThis.__FD_COMMAND_INPUT_190__?.diagnostics?.();
  const right = globalThis.__FD_RIGHT_CLICK_AUTHORITY_197__?.diagnostics?.();
  const actions = globalThis.__FD_MOVE209_ACTIONS__ || [];
  const issued = actions.filter(action => Number(action.seq || 0) > beforeSeq);
  if (!bridge || !issued.length || Number(bridge.lastAck || 0) < Number(issued.at(-1)?.seq || 0)) return null;
  const first = issued[0];
  return {
    bridgeSeq: Number(bridge.seq || 0),
    ack: Number(bridge.lastAck || 0),
    actions: issued,
    targetError: Math.hypot(Number(first?.payload?.x) - target.x, Number(first?.payload?.y) - target.y),
    input,
    right,
  };
}, { beforeSeq: fixture.beforeSeq, target: fixture.target }), 9000);

if (routed.actions.length !== 1) throw new Error(`Physical right click emitted ${routed.actions.length} actions: ${JSON.stringify({ fixture, routed })}`);
const action = routed.actions[0];
if (action.action !== 'context' || action.payload?.targetId != null || routed.targetError > 8) {
  throw new Error(`INPUT_TARGET_MISMATCH ${JSON.stringify({ fixture, routed })}`);
}

// Capture the first meaningful physical displacement. This distinguishes a bad
// world target from a later path/formation error even when final arrival times out.
const firstMotion = await waitFor(() => page.evaluate(({ ids, before, target, center, beforeDistance }) => {
  const game = globalThis.__FD_DEBUG__?.game;
  const bridge = globalThis.__FD_STABLE_STATE165__?.bridge;
  const units = ids.map(id => game?.getEntity?.(id)).filter(Boolean);
  if (!game || !bridge || units.length !== ids.length) return null;
  const nowCenter = units.reduce((acc, unit) => ({ x: acc.x + Number(unit.x || 0) / units.length, y: acc.y + Number(unit.y || 0) / units.length }), { x: 0, y: 0 });
  const displacement = { x: nowCenter.x - center.x, y: nowCenter.y - center.y };
  const moved = Math.hypot(displacement.x, displacement.y);
  if (moved < 35) return null;
  const desired = { x: target.x - center.x, y: target.y - center.y };
  const desiredLength = Math.max(1e-9, Math.hypot(desired.x, desired.y));
  const cosine = (displacement.x * desired.x + displacement.y * desired.y) / (Math.max(1e-9, moved) * desiredLength);
  const targetDistance = Math.hypot(nowCenter.x - target.x, nowCenter.y - target.y);
  const commandSnapshot = units.map(unit => ({
    id: unit.id,
    x: unit.x,
    y: unit.y,
    current: unit.currentCommand ? structuredClone(unit.currentCommand) : null,
    queued: unit.commandQueue?.[0] ? structuredClone(unit.commandQueue[0]) : null,
    requested197: unit._fdRequestedTarget197 ? structuredClone(unit._fdRequestedTarget197) : null,
    free201: unit._fdFreeTarget201 ? structuredClone(unit._fdFreeTarget201) : null,
  }));
  return { nowCenter, displacement, moved, cosine, targetDistance, distanceImprovement: beforeDistance - targetDistance, commandSnapshot, workerTick: bridge.workerTick };
}, { ids: fixture.ids, before: fixture.before, target: fixture.target, center: fixture.center, beforeDistance: fixture.beforeDistance }), 12000, 100);

if (firstMotion.cosine < 0.15 || firstMotion.distanceImprovement < 10) {
  await page.evaluate(() => globalThis.__FD_MOVE209_RESTORE_WORKER__?.());
  throw new Error(`WRONG_MOVEMENT_DIRECTION ${JSON.stringify({ fixture, routed, firstMotion, errors })}`);
}

const arrival = await waitFor(() => page.evaluate(({ ids, target, beforeErrors }) => {
  const game = globalThis.__FD_DEBUG__?.game;
  const bridge = globalThis.__FD_STABLE_STATE165__?.bridge;
  const units = ids.map(id => game?.getEntity?.(id)).filter(Boolean);
  if (!game || !bridge || units.length !== ids.length) return null;
  const center = units.reduce((acc, unit) => ({ x: acc.x + Number(unit.x || 0) / units.length, y: acc.y + Number(unit.y || 0) / units.length }), { x: 0, y: 0 });
  const targetError = Math.hypot(center.x - target.x, center.y - target.y);
  if (targetError > 105) return null;
  return {
    center,
    targetError,
    workerTick: Number(bridge.workerTick || 0),
    bridgeFailed: Boolean(bridge.failed),
    errorDelta: Number(bridge.actionErrors || 0) - beforeErrors,
    commands: units.map(unit => ({ id: unit.id, current: unit.currentCommand?.type || null, queued: unit.commandQueue?.[0]?.type || null })),
  };
}, { ids: fixture.ids, target: fixture.target, beforeErrors: fixture.beforeErrors }), 30000, 120);

await page.evaluate(() => globalThis.__FD_MOVE209_RESTORE_WORKER__?.());
if (arrival.bridgeFailed || arrival.errorDelta || errors.length) {
  throw new Error(`MOVEMENT_GATE_UNHEALTHY ${JSON.stringify({ fixture, routed, firstMotion, arrival, errors })}`);
}

console.log(JSON.stringify({ ok: true, build: 208, fixture, routed, firstMotion, arrival, errors }));
await context.close();
await browser.close();
