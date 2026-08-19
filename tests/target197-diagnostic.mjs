import { webkit, devices } from 'playwright';

const url = process.env.FD_GAME_URL || 'http://127.0.0.1:8765/frontline-dominion/frontline-dominion.html?build=197';
const browser = await webkit.launch({ headless: true });
const context = await browser.newContext({ ...devices['iPad Pro 11'] });
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
await waitFor(() => page.evaluate(() => Boolean(
  globalThis.__FD_RUNTIME_SHELL_197__?.build === 197 &&
  globalThis.__FD_FORMATION_TARGET_FIDELITY_197__?.build === 197 &&
  globalThis.__FD_DEBUG__?.startGame &&
  !document.getElementById('start-game')?.disabled
)), 30000);
await page.locator('#start-game').click();
await waitFor(() => page.evaluate(() => {
  const game = globalThis.__FD_DEBUG__?.game;
  const bridge = globalThis.__FD_STABLE_STATE165__?.bridge;
  return Boolean(game && bridge?.ready && !bridge.failed && Number(bridge.workerTick || 0) >= 8);
}), 30000);

const fixture = await page.evaluate(() => {
  const D = globalThis.__FD_DEBUG__;
  const game = D?.game;
  const bridge = globalThis.__FD_STABLE_STATE165__?.bridge;
  const units = (game?.units || []).filter(unit => unit?.alive && unit.team === 'player' && !unit.air && !unit.embarkedIn).slice(0, 4);
  if (!game || !bridge || units.length < 2) return { error: 'unit-fixture-missing' };
  game.setSelection?.(units, false);
  game.formationSettings = { ...(game.formationSettings || {}), formation: 'column', type: 'column' };
  const center = units.reduce((acc, unit) => ({ x: acc.x + unit.x / units.length, y: acc.y + unit.y / units.length }), { x: 0, y: 0 });
  game.centerCamera?.(center.x, center.y);
  if (game.camera) game.camera.zoom = Math.max(0.72, Math.min(0.92, Number(game.camera.zoom) || 0.82));
  const canvas = document.getElementById('game-canvas');
  const rect = canvas?.getBoundingClientRect?.();
  const world = D.WORLD || { width: 32000, height: 22000 };
  const obstacles = [...(game.buildings || []), ...(game.resources || [])].filter(item => item?.alive !== false);
  const candidates = [];
  for (const radius of [300, 380, 460, 540]) {
    for (const angle of [0, Math.PI / 2, -Math.PI / 2, Math.PI, Math.PI / 4, -Math.PI / 4, 3 * Math.PI / 4, -3 * Math.PI / 4]) {
      const x = center.x + Math.cos(angle) * radius;
      const y = center.y + Math.sin(angle) * radius;
      if (x < 140 || y < 140 || x > world.width - 140 || y > world.height - 140) continue;
      if (obstacles.some(item => Math.hypot(Number(item.x || 0) - x, Number(item.y || 0) - y) < (Number(item.radius || 24) + 110))) continue;
      const screen = game.worldToScreen?.(x, y, 0);
      if (!screen || !Number.isFinite(screen.x) || !Number.isFinite(screen.y) || !rect?.width || !rect?.height) continue;
      const cssX = rect.left + screen.x * rect.width / canvas.width;
      const cssY = rect.top + screen.y * rect.height / canvas.height;
      if (cssX < rect.left + 30 || cssY < rect.top + 30 || cssX > rect.right - 30 || cssY > rect.bottom - 30) continue;
      candidates.push({ x, y, cssX, cssY, radius, angle });
    }
  }
  const target = candidates[0];
  if (!target) return { error: 'open-target-missing', center };
  const originalContext = game.hitTestForContext;
  const originalHit = game.hitTest;
  const hadOwnContext = Object.prototype.hasOwnProperty.call(game, 'hitTestForContext');
  const hadOwnHit = Object.prototype.hasOwnProperty.call(game, 'hitTest');
  const near = (x, y) => Math.hypot(Number(x || 0) - target.x, Number(y || 0) - target.y) <= 100;
  game.hitTestForContext = function(x, y, ...rest) {
    if (near(x, y)) return null;
    return typeof originalContext === 'function' ? originalContext.call(this, x, y, ...rest) : null;
  };
  game.hitTest = function(x, y, selectableOnly = true, ...rest) {
    if (!selectableOnly && near(x, y)) return null;
    return typeof originalHit === 'function' ? originalHit.call(this, x, y, selectableOnly, ...rest) : null;
  };

  globalThis.__FD_TARGET197_ACTIONS__ = [];
  const originalPostMessage = bridge.worker?.postMessage?.bind(bridge.worker);
  if (originalPostMessage) {
    bridge.worker.postMessage = function(message, transfer) {
      if (message?.type === 'action') {
        let plain = null;
        try { plain = JSON.parse(JSON.stringify(message)); } catch (_) { plain = { type: message?.type, action: message?.action }; }
        globalThis.__FD_TARGET197_ACTIONS__.push(plain);
      }
      return transfer === undefined ? originalPostMessage(message) : originalPostMessage(message, transfer);
    };
  }

  const preHitContext = game.hitTestForContext?.(target.x, target.y)?.id || null;
  const preHit = game.hitTest?.(target.x, target.y, false)?.id || null;
  globalThis.__FD_TARGET197_RESTORE__ = () => {
    if (hadOwnContext) game.hitTestForContext = originalContext; else delete game.hitTestForContext;
    if (hadOwnHit) game.hitTest = originalHit; else delete game.hitTest;
    delete globalThis.__FD_TARGET197_RESTORE__;
  };
  return {
    ids: units.map(unit => unit.id),
    before: Object.fromEntries(units.map(unit => [unit.id, { x: unit.x, y: unit.y }])),
    center,
    target,
    preHitContext,
    preHit,
    beforeSeq: Number(bridge.seq || 0),
    beforeErrors: Number(bridge.actionErrors || 0),
  };
});
if (fixture.error) throw new Error(JSON.stringify(fixture));
console.log('FD197_FIXTURE ' + JSON.stringify(fixture));

await page.mouse.click(fixture.target.cssX, fixture.target.cssY, { button: 'right' });
await waitFor(() => page.evaluate(beforeSeq => Number(globalThis.__FD_STABLE_STATE165__?.bridge?.seq || 0) > beforeSeq, fixture.beforeSeq), 6000);
await page.evaluate(() => globalThis.__FD_TARGET197_RESTORE__?.());

const snapshot = async label => page.evaluate(({ label, ids, before, target, beforeErrors }) => {
  const game = globalThis.__FD_DEBUG__?.game;
  const bridge = globalThis.__FD_STABLE_STATE165__?.bridge;
  const units = ids.map(id => game?.getEntity?.(id)).filter(Boolean);
  const center = units.length ? units.reduce((acc, unit) => ({ x: acc.x + Number(unit.x || 0) / units.length, y: acc.y + Number(unit.y || 0) / units.length }), { x: 0, y: 0 }) : null;
  const groups = [];
  const seen = new Set();
  for (const unit of units) {
    const command = unit.currentCommand || unit.commandQueue?.[0];
    const gid = command?.formationGroupId ?? command?.formationId;
    if (gid == null || seen.has(String(gid))) continue;
    seen.add(String(gid));
    const group = game?.formations?.get?.(gid) || game?.formations?.get?.(String(gid)) || game?.formations?.[gid] || null;
    if (group) groups.push({
      id: group.id ?? gid,
      targetX: group.targetX,
      targetY: group.targetY,
      finalAnchorX138: group.finalAnchorX138,
      finalAnchorY138: group.finalAnchorY138,
      anchorX: group.anchorX,
      anchorY: group.anchorY,
      pathIndex: group.pathIndex,
      pathLength: Array.isArray(group.path) ? group.path.length : null,
      path: Array.isArray(group.path) ? group.path.slice(-4) : null,
      arrived: group.arrived,
      completed: group.completed,
      march: group.march183 ? {
        phase: group.march183.phase,
        blockedTicks: group.march183.blockedTicks,
        anchorX: group.march183.anchorX,
        anchorY: group.march183.anchorY,
        finalAnchorX: group.march183.finalAnchorX,
        finalAnchorY: group.march183.finalAnchorY,
      } : null,
    });
  }
  return {
    label,
    actions: [...(globalThis.__FD_TARGET197_ACTIONS__ || [])],
    bridge: bridge ? {
      seq: Number(bridge.seq || 0),
      lastAck: Number(bridge.lastAck || 0),
      workerTick: Number(bridge.workerTick || 0),
      actionErrors: Number(bridge.actionErrors || 0),
      errorDelta: Number(bridge.actionErrors || 0) - beforeErrors,
      failed: Boolean(bridge.failed),
      lastError: bridge.lastError || bridge.error || null,
    } : null,
    selected: (game?.selected || []).map(item => item?.id),
    center,
    targetError: center ? Math.hypot(center.x - target.x, center.y - target.y) : null,
    units: units.map(unit => ({
      id: unit.id,
      x: unit.x,
      y: unit.y,
      moved: Math.hypot(Number(unit.x || 0) - before[unit.id].x, Number(unit.y || 0) - before[unit.id].y),
      currentCommand: unit.currentCommand ? {
        type: unit.currentCommand.type,
        x: unit.currentCommand.x,
        y: unit.currentCommand.y,
        targetId: unit.currentCommand.targetId,
        formationGroupId: unit.currentCommand.formationGroupId,
        formationId: unit.currentCommand.formationId,
      } : null,
      queueLength: Array.isArray(unit.commandQueue) ? unit.commandQueue.length : null,
    })),
    groups,
    fidelity: { ...globalThis.__FD_FORMATION_TARGET_FIDELITY_197__?.state },
    obstacle: { ...globalThis.__FD_FORMATION_OBSTACLE_RECOVERY_196__?.diagnostics },
  };
}, { label, ids: fixture.ids, before: fixture.before, target: fixture.target, beforeErrors: fixture.beforeErrors });

for (const [label, delay] of [['t0', 0], ['t1', 1000], ['t3', 2000], ['t7', 4000], ['t12', 5000]]) {
  if (delay) await page.waitForTimeout(delay);
  console.log('FD197_DIAG ' + JSON.stringify(await snapshot(label)));
}
console.log('FD197_ERRORS ' + JSON.stringify(errors));
await context.close();
await browser.close();
