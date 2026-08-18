import { chromium, webkit, devices } from 'playwright';

const browserName = process.env.FD_BROWSER || 'chromium';
const url = process.env.FD_GAME_URL || 'http://127.0.0.1:8765/frontline-dominion/frontline-dominion.html?build=196';
const CREDIT_SENTINEL = 1967654;
const LEGACY_KEY = 'frontline-dominion-save-v3';
const browserType = browserName === 'webkit' ? webkit : chromium;
const browser = await browserType.launch({ headless: true });
const contextOptions = browserName === 'webkit'
  ? { ...devices['iPad Pro 11'] }
  : { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 };
let context;
let page;
let errors = [];

const attachDiagnostics = current => {
  current.on('pageerror', error => errors.push(String(error?.stack || error)));
  current.on('console', message => {
    if (message.type() === 'error' && !/favicon|404/i.test(message.text())) errors.push(`console:${message.text()}`);
  });
};

const waitFor = async (fn, timeout = 18000, interval = 80) => {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const value = await fn();
    if (value) return value;
    await page.waitForTimeout(interval);
  }
  throw new Error(`Timed out after ${timeout} ms`);
};

// Produce a real save while a multi-unit formation order is active. This is
// materially closer to an actual returning player than a pristine idle save.
context = await browser.newContext(contextOptions);
page = await context.newPage();
attachDiagnostics(page);
await page.goto(url, { waitUntil: 'load', timeout: 60000 });
await waitFor(() => page.evaluate(() => Boolean(
  globalThis.__FD_RUNTIME_SHELL_196__?.build === 196 &&
  globalThis.__FD_POST_LOAD_COMMAND_RECOVERY_196__?.build === 196 &&
  globalThis.__FD_DEBUG__?.startGame &&
  !document.getElementById('start-game')?.disabled
)), 25000);
await page.locator('#start-game').click();
await waitFor(() => page.evaluate(() => {
  const game = globalThis.__FD_DEBUG__?.game;
  const bridge = globalThis.__FD_STABLE_STATE165__?.bridge;
  return Boolean(game && bridge?.ready && !bridge.failed && Number(bridge.workerTick || 0) >= 8);
}), 25000);

const activeOrder = await page.evaluate(() => {
  const game = globalThis.__FD_DEBUG__?.game;
  const bridge = globalThis.__FD_STABLE_STATE165__?.bridge;
  const units = (game?.units || []).filter(unit => unit?.alive && unit.team === 'player' && !unit.air && !unit.embarkedIn).slice(0, 4);
  if (!game || !bridge || units.length < 2) return { error: 'formation-fixture-missing' };
  game.setSelection?.(units, false);
  game.formationSettings = {
    ...(game.formationSettings || {}),
    formation: 'column',
    type: 'column',
  };
  const center = units.reduce((acc, unit) => ({ x: acc.x + unit.x / units.length, y: acc.y + unit.y / units.length }), { x: 0, y: 0 });
  const target = {
    x: Math.max(100, Math.min((globalThis.__FD_DEBUG__?.WORLD?.width || 32000) - 100, center.x + 820)),
    y: Math.max(100, Math.min((globalThis.__FD_DEBUG__?.WORLD?.height || 22000) - 100, center.y + 160)),
  };
  const before = Object.fromEntries(units.map(unit => [unit.id, { x: unit.x, y: unit.y }]));
  const beforeSeq = Number(bridge.seq || 0);
  const ok = game.issueMove(target.x, target.y, false);
  return { ids: units.map(unit => unit.id), before, beforeSeq, target, ok };
});
if (activeOrder.error || !activeOrder.ok) throw new Error(`could not create active formation save: ${JSON.stringify(activeOrder)}`);

const firstAck = await waitFor(() => page.evaluate(beforeSeq => {
  const bridge = globalThis.__FD_STABLE_STATE165__?.bridge;
  if (Number(bridge?.seq || 0) <= beforeSeq || Number(bridge?.lastAck || 0) < Number(bridge?.seq || 0)) return null;
  return { seq: Number(bridge.seq), ack: Number(bridge.lastAck), tick: Number(bridge.workerTick || 0) };
}, activeOrder.beforeSeq), 9000);

await waitFor(() => page.evaluate(({ ids, before }) => {
  const game = globalThis.__FD_DEBUG__?.game;
  const moved = ids.map(id => {
    const unit = game?.getEntity?.(id);
    const start = before[id];
    return unit && start ? Math.hypot(unit.x - start.x, unit.y - start.y) : 0;
  });
  return Math.max(...moved) > 8 ? moved : null;
}, activeOrder), 9000);

const generated = await page.evaluate((creditSentinel) => {
  const D = globalThis.__FD_DEBUG__;
  const shell = globalThis.__FD_RUNTIME_SHELL_196__;
  const key = D?.SAVE_KEY || 'frontline-dominion-save-v5';
  const ok = shell?.saveNow?.('active-formation-post-load-196') === true;
  const raw = localStorage.getItem(key);
  if (!ok || !raw) return { ok, key, bytes: raw?.length || 0 };
  const data = JSON.parse(raw);
  if (!data?.teams?.player) return { ok: false, key, bytes: raw.length, reason: 'player-team-missing' };
  data.teams.player.credits = creditSentinel;
  data._fdRegressionPostLoad196 = { sentinel: 'active-formation-save', savedAt: Date.now() };
  return {
    ok,
    key,
    bytes: raw.length,
    wrapped: JSON.stringify({ savedAt: Date.now(), payload: { saveData: data } }),
  };
}, CREDIT_SENTINEL);
if (!generated.ok || !generated.wrapped || generated.bytes < 100) {
  throw new Error(`active formation checkpoint unavailable: ${JSON.stringify({ ...generated, wrapped: undefined })}`);
}

const legacyWrapped = generated.wrapped;
await context.close();
errors = [];

// Load the save in a clean returning-user context.
const origin = new URL(url).origin;
context = await browser.newContext({
  ...contextOptions,
  storageState: {
    cookies: [],
    origins: [{ origin, localStorage: [{ name: LEGACY_KEY, value: legacyWrapped }] }],
  },
});
page = await context.newPage();
attachDiagnostics(page);
await page.goto(url, { waitUntil: 'load', timeout: 60000 });
await waitFor(() => page.evaluate((creditSentinel) => {
  const shell = globalThis.__FD_RUNTIME_SHELL_196__;
  const candidate = shell?.findSavedGame?.();
  const button = document.getElementById('load-game');
  return Boolean(shell?.state?.installed && candidate?.data?.teams?.player?.credits === creditSentinel && button && !button.disabled);
}, CREDIT_SENTINEL), 25000);
await page.locator('#load-game').click();

const loaded = await waitFor(() => page.evaluate((creditSentinel) => {
  const game = globalThis.__FD_DEBUG__?.game;
  const bridge = globalThis.__FD_STABLE_STATE165__?.bridge;
  const recovery = globalThis.__FD_POST_LOAD_COMMAND_RECOVERY_196__;
  if (!game || !bridge?.ready || bridge.failed || Number(bridge.workerTick || 0) < 8 ||
      Number(game.teams?.player?.credits || 0) !== creditSentinel || !recovery) return null;
  return {
    tick: Number(bridge.workerTick || 0),
    units: game.units.filter(unit => unit?.alive).length,
    buildings: game.buildings.filter(building => building?.alive).length,
    credits: Number(game.teams.player.credits),
    bridgeFailed: Boolean(bridge.failed),
    actionErrors: Number(bridge.actionErrors || 0),
    recovery: { ...recovery.state, lastSelectedIds: [...recovery.state.lastSelectedIds] },
  };
}, CREDIT_SENTINEL), 30000);
if (!loaded.units || loaded.bridgeFailed || loaded.actionErrors) throw new Error(`loaded game unhealthy: ${JSON.stringify(loaded)}`);

// Select loaded entities, then send a genuine right-click through the canvas.
const commandFixture = await page.evaluate(savedIds => {
  const D = globalThis.__FD_DEBUG__;
  const game = D?.game;
  const bridge = globalThis.__FD_STABLE_STATE165__?.bridge;
  const units = savedIds.map(id => game?.getEntity?.(id)).filter(unit => unit?.alive && unit.team === 'player' && !unit.air && !unit.embarkedIn);
  const selected = units.length ? units : (game?.units || []).filter(unit => unit?.alive && unit.team === 'player' && !unit.air && !unit.embarkedIn).slice(0, 3);
  if (!game || !bridge || !selected.length) return { error: 'loaded-command-units-missing' };
  game.setSelection?.(selected, false);
  const lead = selected[0];
  game.centerCamera?.(lead.x, lead.y);
  if (game.camera) game.camera.zoom = Math.max(0.72, Math.min(1, game.camera.zoom || 1));
  const canvas = document.getElementById('game-canvas');
  const rect = canvas.getBoundingClientRect();
  const world = D.WORLD || { width: 32000, height: 22000 };
  const candidates = [];
  for (const radius of [720, 620, 520, 420, 320]) {
    for (const angle of [Math.PI, -3 * Math.PI / 4, 3 * Math.PI / 4, -Math.PI / 2, Math.PI / 2, 0]) {
      const wx = lead.x + Math.cos(angle) * radius;
      const wy = lead.y + Math.sin(angle) * radius;
      if (wx < 100 || wy < 100 || wx > world.width - 100 || wy > world.height - 100) continue;
      const screen = game.worldToScreen(wx, wy, 0);
      const cssX = rect.left + screen.x * rect.width / canvas.width;
      const cssY = rect.top + screen.y * rect.height / canvas.height;
      if (cssX < rect.left + 18 || cssY < rect.top + 18 || cssX > rect.right - 18 || cssY > rect.bottom - 18) continue;
      candidates.push({ wx, wy, cssX, cssY, radius, angle });
    }
  }
  const chosen = candidates[0];
  if (!chosen) return { error: 'no-visible-loaded-command-target' };
  return {
    ids: selected.map(unit => unit.id),
    before: Object.fromEntries(selected.map(unit => [unit.id, { x: unit.x, y: unit.y }])),
    beforeSeq: Number(bridge.seq || 0),
    beforeAck: Number(bridge.lastAck || 0),
    beforeErrors: Number(bridge.actionErrors || 0),
    ...chosen,
  };
}, activeOrder.ids);
if (!commandFixture || commandFixture.error) throw new Error(`loaded command fixture unavailable: ${JSON.stringify(commandFixture)}`);

const guard = await page.evaluate(({ wx, wy }) => {
  const game = globalThis.__FD_DEBUG__?.game;
  if (!game) return null;
  const originalContext = game.hitTestForContext;
  const originalHit = game.hitTest;
  const hadOwnContext = Object.prototype.hasOwnProperty.call(game, 'hitTestForContext');
  const hadOwnHit = Object.prototype.hasOwnProperty.call(game, 'hitTest');
  const state = { cleared: 0, contextCalls: 0, hitCalls: 0 };
  const near = (x, y) => Math.hypot(Number(x || 0) - wx, Number(y || 0) - wy) <= 96;
  game.hitTestForContext = function(x, y, ...rest) {
    state.contextCalls += 1;
    if (near(x, y)) { state.cleared += 1; return null; }
    return typeof originalContext === 'function' ? originalContext.call(this, x, y, ...rest) : null;
  };
  game.hitTest = function(x, y, selectableOnly = true, ...rest) {
    state.hitCalls += 1;
    if (!selectableOnly && near(x, y)) { state.cleared += 1; return null; }
    return typeof originalHit === 'function' ? originalHit.call(this, x, y, selectableOnly, ...rest) : null;
  };
  globalThis.__FD_TEST_POST_LOAD_CONTEXT_196__ = {
    state,
    restore() {
      if (hadOwnContext) game.hitTestForContext = originalContext;
      else delete game.hitTestForContext;
      if (hadOwnHit) game.hitTest = originalHit;
      else delete game.hitTest;
      delete globalThis.__FD_TEST_POST_LOAD_CONTEXT_196__;
    },
  };
  return { installed: true };
}, commandFixture);
if (!guard?.installed) throw new Error('post-load terrain guard unavailable');

let sentSeq = 0;
let guardState = null;
try {
  await page.mouse.click(commandFixture.cssX, commandFixture.cssY, { button: 'right' });
  sentSeq = await waitFor(() => page.evaluate(beforeSeq => {
    const bridge = globalThis.__FD_STABLE_STATE165__?.bridge;
    return Number(bridge?.seq || 0) > beforeSeq ? Number(bridge.seq) : 0;
  }, commandFixture.beforeSeq), 5000);
  guardState = await page.evaluate(() => globalThis.__FD_TEST_POST_LOAD_CONTEXT_196__?.state || null);
} finally {
  await page.evaluate(() => globalThis.__FD_TEST_POST_LOAD_CONTEXT_196__?.restore?.());
}
if (!sentSeq || !guardState?.cleared) {
  throw new Error(`physical post-load order did not dispatch: ${JSON.stringify({ sentSeq, guardState, commandFixture })}`);
}

const commandResult = await waitFor(() => page.evaluate(({ ids, before, seq, beforeErrors }) => {
  const game = globalThis.__FD_DEBUG__?.game;
  const bridge = globalThis.__FD_STABLE_STATE165__?.bridge;
  if (!game || !bridge || Number(bridge.lastAck || 0) < seq) return null;
  const distances = ids.map(id => {
    const unit = game.getEntity?.(id);
    const start = before[id];
    return unit && start ? Math.hypot(unit.x - start.x, unit.y - start.y) : 0;
  });
  if (Math.max(...distances) <= 24) return null;
  const recovery = globalThis.__FD_POST_LOAD_COMMAND_RECOVERY_196__;
  return {
    ack: Number(bridge.lastAck || 0),
    workerTick: Number(bridge.workerTick || 0),
    errorDelta: Number(bridge.actionErrors || 0) - beforeErrors,
    bridgeFailed: Boolean(bridge.failed),
    distances,
    recovery: recovery ? { ...recovery.state, lastSelectedIds: [...recovery.state.lastSelectedIds] } : null,
  };
}, { ids: commandFixture.ids, before: commandFixture.before, seq: sentSeq, beforeErrors: commandFixture.beforeErrors }), 15000);

if (commandResult.bridgeFailed || commandResult.errorDelta || !commandResult.recovery ||
    commandResult.recovery.hydrateRepairs < 1 || commandResult.recovery.launchRepairs < 1 ||
    commandResult.recovery.routedActions < 1 || errors.length) {
  throw new Error(`loaded game did not regain command authority: ${JSON.stringify({ loaded, firstAck, commandFixture, guardState, commandResult, errors })}`);
}

console.log(JSON.stringify({
  ok: true,
  browserName,
  firstAck,
  loaded,
  commandFixture: { ids: commandFixture.ids, beforeSeq: commandFixture.beforeSeq, wx: commandFixture.wx, wy: commandFixture.wy },
  guardState,
  commandResult,
  errors,
}));
await context.close();
await browser.close();
