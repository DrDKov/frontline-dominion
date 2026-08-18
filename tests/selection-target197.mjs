import { chromium, webkit, devices } from 'playwright';

const browserName = process.env.FD_BROWSER || 'chromium';
const url = process.env.FD_GAME_URL || 'http://127.0.0.1:8765/frontline-dominion/frontline-dominion.html?build=197';
const browserType = browserName === 'webkit' ? webkit : chromium;
const browser = await browserType.launch({ headless: true });
const context = await browser.newContext(browserName === 'webkit'
  ? { ...devices['iPad Pro 11'] }
  : { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
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
  globalThis.__FD_BUILDING_SELECTION_INVARIANCE_197__?.build === 197 &&
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

const buildingResult = await page.evaluate(() => {
  const game = globalThis.__FD_DEBUG__?.game;
  const api = globalThis.__FD_BUILDING_SELECTION_INVARIANCE_197__;
  const building = (game?.buildings || []).find(item => item?.alive && item.team === 'player');
  if (!game || !api || !building) return { error: 'building-fixture-missing' };
  game.clearSelection?.();
  api.enforce?.();
  const before = api.geometrySignature(building);
  const beforeBounds = game.getBuildingFigureScreenBounds193?.(building) || null;
  game.setSelection?.([building], false);
  game.render?.();
  game.render?.();
  api.enforce?.();
  const after = api.geometrySignature(building);
  const afterBounds = game.getBuildingFigureScreenBounds193?.(building) || null;
  return {
    id: building.id,
    before,
    after,
    beforeBounds: beforeBounds ? { width: beforeBounds.width, height: beforeBounds.height } : null,
    afterBounds: afterBounds ? { width: afterBounds.width, height: afterBounds.height } : null,
    selectedInArray: game.selected?.includes?.(building) === true,
    selectedFlag: building.selected,
    state: { ...api.state },
  };
});
if (buildingResult.error) throw new Error(`building fixture failed: ${JSON.stringify(buildingResult)}`);
if (JSON.stringify(buildingResult.before) !== JSON.stringify(buildingResult.after)) {
  throw new Error(`selected building geometry changed: ${JSON.stringify(buildingResult)}`);
}
if (buildingResult.beforeBounds && buildingResult.afterBounds && (
    Math.abs(buildingResult.beforeBounds.width - buildingResult.afterBounds.width) > 0.01 ||
    Math.abs(buildingResult.beforeBounds.height - buildingResult.afterBounds.height) > 0.01)) {
  throw new Error(`selected building projected size changed: ${JSON.stringify(buildingResult)}`);
}
if (!buildingResult.selectedInArray || buildingResult.selectedFlag !== false || buildingResult.state.bracketOverlays < 1) {
  throw new Error(`building selection invariant failed: ${JSON.stringify(buildingResult)}`);
}

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
  if (!canvas || !rect?.width || !rect?.height) return { error: 'canvas-missing' };
  const obstacles = [...(game.buildings || []), ...(game.resources || [])].filter(item => item?.alive !== false);
  const candidates = [];
  for (const radius of [300, 380, 460, 540]) {
    for (const angle of [0, Math.PI / 2, -Math.PI / 2, Math.PI, Math.PI / 4, -Math.PI / 4, 3 * Math.PI / 4, -3 * Math.PI / 4]) {
      const x = center.x + Math.cos(angle) * radius;
      const y = center.y + Math.sin(angle) * radius;
      if (x < 140 || y < 140 || x > world.width - 140 || y > world.height - 140) continue;
      if (obstacles.some(item => Math.hypot(Number(item.x || 0) - x, Number(item.y || 0) - y) < (Number(item.radius || 24) + 110))) continue;
      const screen = game.worldToScreen?.(x, y, 0);
      if (!screen || !Number.isFinite(screen.x) || !Number.isFinite(screen.y)) continue;
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
    beforeSeq: Number(bridge.seq || 0),
    beforeErrors: Number(bridge.actionErrors || 0),
  };
});
if (fixture.error) throw new Error(`movement fixture failed: ${JSON.stringify(fixture)}`);

let sentSeq = 0;
try {
  await page.mouse.click(fixture.target.cssX, fixture.target.cssY, { button: 'right' });
  sentSeq = await waitFor(() => page.evaluate(beforeSeq => {
    const bridge = globalThis.__FD_STABLE_STATE165__?.bridge;
    return Number(bridge?.seq || 0) > beforeSeq ? Number(bridge.seq) : 0;
  }, fixture.beforeSeq), 6000);
} finally {
  await page.evaluate(() => globalThis.__FD_TARGET197_RESTORE__?.());
}

const routed = await waitFor(() => page.evaluate(({ seq, target }) => {
  const bridge = globalThis.__FD_STABLE_STATE165__?.bridge;
  const input = globalThis.__FD_COMMAND_INPUT_190__?.diagnostics?.();
  if (!bridge || Number(bridge.lastAck || 0) < seq || !input?.lastWorld) return null;
  return {
    ack: Number(bridge.lastAck || 0),
    inputWorld: input.lastWorld,
    inputError: Math.hypot(Number(input.lastWorld.x) - target.x, Number(input.lastWorld.y) - target.y),
    source: input.lastSource,
  };
}, { seq: sentSeq, target: fixture.target }), 9000);
if (routed.inputError > 8) {
  throw new Error(`physical right click mapped to wrong world point: ${JSON.stringify({ fixture, routed })}`);
}

const arrival = await waitFor(() => page.evaluate(({ ids, before, target, beforeErrors }) => {
  const game = globalThis.__FD_DEBUG__?.game;
  const bridge = globalThis.__FD_STABLE_STATE165__?.bridge;
  const units = ids.map(id => game?.getEntity?.(id)).filter(Boolean);
  if (!game || !bridge || units.length !== ids.length) return null;
  const center = units.reduce((acc, unit) => ({ x: acc.x + unit.x / units.length, y: acc.y + unit.y / units.length }), { x: 0, y: 0 });
  const moved = units.map(unit => Math.hypot(unit.x - before[unit.id].x, unit.y - before[unit.id].y));
  const targetError = Math.hypot(center.x - target.x, center.y - target.y);
  if (Math.max(...moved) < 80 || targetError > 95) return null;
  return {
    center,
    targetError,
    moved,
    workerTick: Number(bridge.workerTick || 0),
    bridgeFailed: Boolean(bridge.failed),
    errorDelta: Number(bridge.actionErrors || 0) - beforeErrors,
    fidelity: { ...globalThis.__FD_FORMATION_TARGET_FIDELITY_197__?.state },
  };
}, { ids: fixture.ids, before: fixture.before, target: fixture.target, beforeErrors: fixture.beforeErrors }), 30000, 120);

if (arrival.bridgeFailed || arrival.errorDelta || errors.length) {
  throw new Error(`target arrival unhealthy: ${JSON.stringify({ buildingResult, fixture, routed, arrival, errors })}`);
}

console.log(JSON.stringify({
  ok: true,
  browserName,
  buildingResult,
  routed,
  arrival,
  errors,
}));
await context.close();
await browser.close();
