import { chromium } from 'playwright';

const url = process.env.FD_GAME_URL || 'http://127.0.0.1:8765/frontline-dominion/frontline-dominion.html?build=208';
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(String(error?.stack || error)));
page.on('console', message => {
  if (message.type() === 'error' && !/favicon|404/i.test(message.text())) errors.push(`console:${message.text()}`);
});

const waitFor = async (fn, timeout = 15000, interval = 80) => {
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
  globalThis.__FD_RUNTIME_SHELL_208__?.build === 208 &&
  globalThis.__FD_RIGHT_CLICK_AUTHORITY_197__?.build === 197 &&
  globalThis.__FD_COMMAND_INPUT_190__?.route &&
  globalThis.__FD_DEBUG__?.startGame &&
  !document.getElementById('start-game')?.disabled
)), 30000);
await page.locator('#start-game').click();
await waitFor(() => page.evaluate(() => {
  const game = globalThis.__FD_DEBUG__?.game;
  const bridge = globalThis.__FD_STABLE_STATE165__?.bridge;
  return Boolean(game && bridge?.ready && !bridge.failed && Number(bridge.workerTick || 0) >= 12);
}), 30000);

const fixture = await page.evaluate(() => {
  const D = globalThis.__FD_DEBUG__;
  const game = D?.game;
  const bridge = globalThis.__FD_STABLE_STATE165__?.bridge;
  const canvas = document.getElementById('game-canvas');
  const rect = canvas?.getBoundingClientRect?.();
  const units = (game?.units || []).filter(unit => unit?.alive && unit.team === 'player' && !unit.air && !unit.embarkedIn).slice(0, 4);
  if (!game || !bridge || !canvas || !rect?.width || !rect?.height || units.length < 2) return { error: 'directional-fixture-missing' };
  game.setSelection?.(units, false);
  if (typeof game.setFormationEnabled201 === 'function') game.setFormationEnabled201(false, false);
  if (game.formationSettings) game.formationSettings.enabled = false;
  const center = units.reduce((acc, unit) => ({ x: acc.x + Number(unit.x) / units.length, y: acc.y + Number(unit.y) / units.length }), { x: 0, y: 0 });
  game.centerCamera?.(center.x, center.y);
  if (game.camera) game.camera.zoom = 0.82;
  game.render?.();

  globalThis.__FD_MOVE209_ACTIONS__ = [];
  globalThis.__FD_MOVE209_TARGET__ = null;
  const originalContext = game.hitTestForContext;
  const originalHit = game.hitTest;
  const hadOwnContext = Object.prototype.hasOwnProperty.call(game, 'hitTestForContext');
  const hadOwnHit = Object.prototype.hasOwnProperty.call(game, 'hitTest');
  const nearTarget = (x, y) => {
    const target = globalThis.__FD_MOVE209_TARGET__;
    return Boolean(target && Math.hypot(Number(x) - target.x, Number(y) - target.y) <= 105);
  };
  game.hitTestForContext = function(x, y, ...rest) {
    if (nearTarget(x, y)) return null;
    return typeof originalContext === 'function' ? originalContext.call(this, x, y, ...rest) : null;
  };
  game.hitTest = function(x, y, selectableOnly = true, ...rest) {
    if (!selectableOnly && nearTarget(x, y)) return null;
    return typeof originalHit === 'function' ? originalHit.call(this, x, y, selectableOnly, ...rest) : null;
  };
  const worker = bridge.worker;
  const originalPost = worker.postMessage.bind(worker);
  worker.postMessage = function(message, ...rest) {
    if (message?.type === 'action') globalThis.__FD_MOVE209_ACTIONS__.push(structuredClone(message));
    return originalPost(message, ...rest);
  };
  globalThis.__FD_MOVE209_RESTORE__ = () => {
    if (hadOwnContext) game.hitTestForContext = originalContext; else delete game.hitTestForContext;
    if (hadOwnHit) game.hitTest = originalHit; else delete game.hitTest;
    worker.postMessage = originalPost;
    delete globalThis.__FD_MOVE209_TARGET__;
    delete globalThis.__FD_MOVE209_ACTIONS__;
    delete globalThis.__FD_MOVE209_RESTORE__;
  };
  return { ids: units.map(unit => unit.id), world: D.WORLD || { width: 32000, height: 22000 } };
});
if (fixture.error) throw new Error(JSON.stringify(fixture));

const directions = [
  ['E', 1, 0], ['W', -1, 0], ['S', 0, 1], ['N', 0, -1],
  ['SE', Math.SQRT1_2, Math.SQRT1_2], ['NW', -Math.SQRT1_2, -Math.SQRT1_2],
  ['NE', Math.SQRT1_2, -Math.SQRT1_2], ['SW', -Math.SQRT1_2, Math.SQRT1_2],
];
const diagnostics = [];

try {
  for (const [name, dx, dy] of directions) {
    const prepared = await page.evaluate(({ ids, dx, dy, name, world }) => {
      const game = globalThis.__FD_DEBUG__?.game;
      const bridge = globalThis.__FD_STABLE_STATE165__?.bridge;
      const canvas = document.getElementById('game-canvas');
      const rect = canvas?.getBoundingClientRect?.();
      const units = ids.map(id => game?.getEntity?.(id)).filter(unit => unit?.alive);
      if (!game || !bridge || !canvas || !rect?.width || units.length !== ids.length) return { error: 'state-missing', name };
      game.setSelection?.(units, false);
      if (typeof game.setFormationEnabled201 === 'function') game.setFormationEnabled201(false, false);
      if (game.formationSettings) game.formationSettings.enabled = false;
      const center = units.reduce((acc, unit) => ({ x: acc.x + Number(unit.x) / units.length, y: acc.y + Number(unit.y) / units.length }), { x: 0, y: 0 });
      game.centerCamera?.(center.x, center.y);
      if (game.camera) game.camera.zoom = 0.82;
      game.render?.();
      const obstacles = [...(game.buildings || []), ...(game.resources || [])].filter(item => item?.alive !== false);
      let target = null;
      for (const radius of [300, 380, 460, 540]) {
        const x = center.x + dx * radius;
        const y = center.y + dy * radius;
        if (x < 160 || y < 160 || x > world.width - 160 || y > world.height - 160) continue;
        if (obstacles.some(item => Math.hypot(Number(item.x || 0) - x, Number(item.y || 0) - y) < (Number(item.radius || 24) + 105))) continue;
        const screen = game.worldToScreen?.(x, y, 0);
        if (!screen || !Number.isFinite(screen.x) || !Number.isFinite(screen.y)) continue;
        const cssX = rect.left + screen.x * rect.width / canvas.width;
        const cssY = rect.top + screen.y * rect.height / canvas.height;
        if (cssX < rect.left + 28 || cssY < rect.top + 28 || cssX > rect.right - 28 || cssY > rect.bottom - 28) continue;
        target = { x, y, cssX, cssY, screenX: screen.x, screenY: screen.y, radius };
        break;
      }
      if (!target) return { error: 'target-missing', name, center };
      globalThis.__FD_MOVE209_TARGET__ = { x: target.x, y: target.y };
      return {
        name,
        center,
        target,
        before: Object.fromEntries(units.map(unit => [unit.id, { x: Number(unit.x), y: Number(unit.y) }])),
        beforeSeq: Number(bridge.seq || 0),
        beforeActions: (globalThis.__FD_MOVE209_ACTIONS__ || []).length,
        beforeErrors: Number(bridge.actionErrors || 0),
      };
    }, { ids: fixture.ids, dx, dy, name, world: fixture.world });
    if (prepared.error) throw new Error(`prepare ${name}: ${JSON.stringify(prepared)}`);

    await page.mouse.click(prepared.target.cssX, prepared.target.cssY, { button: 'right' });

    const routed = await waitFor(() => page.evaluate(({ beforeSeq, beforeActions, target }) => {
      const bridge = globalThis.__FD_STABLE_STATE165__?.bridge;
      const actions = (globalThis.__FD_MOVE209_ACTIONS__ || []).slice(beforeActions).filter(action => Number(action.seq || 0) > beforeSeq);
      if (!bridge || !actions.length || Number(bridge.lastAck || 0) < Number(actions.at(-1)?.seq || 0)) return null;
      const action = actions[0];
      return {
        count: actions.length,
        action: action.action,
        targetId: action.payload?.targetId ?? null,
        x: Number(action.payload?.x),
        y: Number(action.payload?.y),
        targetError: Math.hypot(Number(action.payload?.x) - target.x, Number(action.payload?.y) - target.y),
        seq: Number(action.seq || 0),
        ack: Number(bridge.lastAck || 0),
      };
    }, { beforeSeq: prepared.beforeSeq, beforeActions: prepared.beforeActions, target: prepared.target }), 8000);

    if (routed.count !== 1 || routed.action !== 'context' || routed.targetId != null || routed.targetError > 8) {
      throw new Error(`route ${name}: ${JSON.stringify({ prepared, routed })}`);
    }

    const vector = await waitFor(() => page.evaluate(({ ids, start, target, beforeErrors }) => {
      const game = globalThis.__FD_DEBUG__?.game;
      const bridge = globalThis.__FD_STABLE_STATE165__?.bridge;
      const units = ids.map(id => game?.getEntity?.(id)).filter(unit => unit?.alive);
      if (!game || !bridge || units.length !== ids.length) return null;
      const center = units.reduce((acc, unit) => ({ x: acc.x + Number(unit.x) / units.length, y: acc.y + Number(unit.y) / units.length }), { x: 0, y: 0 });
      const ax = center.x - start.x;
      const ay = center.y - start.y;
      const moved = Math.hypot(ax, ay);
      if (moved < 16) return null;
      const tx = target.x - start.x;
      const ty = target.y - start.y;
      const targetLen = Math.max(1e-9, Math.hypot(tx, ty));
      const cosine = (ax * tx + ay * ty) / Math.max(1e-9, moved * targetLen);
      return {
        center,
        moved,
        cosine,
        dot: ax * tx + ay * ty,
        bridgeFailed: Boolean(bridge.failed),
        errorDelta: Number(bridge.actionErrors || 0) - beforeErrors,
        commands: units.map(unit => ({ id: unit.id, type: unit.currentCommand?.type || unit.commandQueue?.[0]?.type || null, x: unit.currentCommand?.x, y: unit.currentCommand?.y })),
      };
    }, { ids: fixture.ids, start: prepared.center, target: prepared.target, beforeErrors: prepared.beforeErrors }), 9000, 80);

    if (vector.bridgeFailed || vector.errorDelta || vector.dot <= 0 || vector.cosine < 0.20) {
      throw new Error(`wrong-way ${name}: ${JSON.stringify({ prepared, routed, vector, errors })}`);
    }
    diagnostics.push({ name, prepared, routed, vector });
  }
} finally {
  await page.evaluate(() => globalThis.__FD_MOVE209_RESTORE__?.());
}

if (errors.length) throw new Error(`browser errors: ${JSON.stringify({ errors, diagnostics })}`);
console.log(JSON.stringify({ ok: true, directions: diagnostics.map(item => ({ name: item.name, targetError: item.routed.targetError, moved: item.vector.moved, cosine: item.vector.cosine })) }));
await context.close();
await browser.close();
