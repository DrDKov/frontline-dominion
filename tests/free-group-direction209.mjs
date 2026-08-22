import { chromium } from 'playwright';

const url = process.env.FD_GAME_URL || 'http://127.0.0.1:8765/frontline-dominion/frontline-dominion.html?build=208';
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const page = await context.newPage();
const waitFor = async (fn, timeout = 20000, interval = 80) => {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < timeout) {
    last = await fn();
    if (last) return last;
    await page.waitForTimeout(interval);
  }
  throw new Error(`Timed out after ${timeout}ms; last=${JSON.stringify(last)}`);
};

await page.goto(url, { waitUntil: 'load', timeout: 60000 });
await waitFor(() => page.evaluate(() => Boolean(
  globalThis.__FD_RUNTIME_SHELL_208__?.build === 208 &&
  typeof globalThis.__FD_COMMAND_INPUT_190__?.route === 'function' &&
  !document.getElementById('start-game')?.disabled
)));
await page.locator('#start-game').click();
await waitFor(() => page.evaluate(() => {
  const g = globalThis.__FD_DEBUG__?.game;
  const b = globalThis.__FD_STABLE_STATE165__?.bridge;
  return Boolean(g && b?.ready && !b.failed && Number(b.workerTick || 0) >= 12);
}));

const fixture = await page.evaluate(() => {
  const g = globalThis.__FD_DEBUG__.game;
  const bridge = globalThis.__FD_STABLE_STATE165__.bridge;
  const canvas = document.getElementById('game-canvas');
  const rect = canvas.getBoundingClientRect();
  const units = (g.units || []).filter(u => u?.alive && u.team === 'player' && u.kind === 'unit' && !u.air && !u.embarkedIn).slice(0, 4);
  if (units.length < 4) return { error: 'need-four-ground-units', count: units.length };
  g.setSelection(units, false);
  g.setFormationEnabled201?.(false, false);
  const center = units.reduce((a, u) => ({ x: a.x + u.x / units.length, y: a.y + u.y / units.length }), { x: 0, y: 0 });
  g.centerCamera?.(center.x, center.y);
  if (g.camera) { g.camera.x = center.x; g.camera.y = center.y; g.camera.zoom = 0.72; }
  g.render?.();
  const target = { x: center.x + 420, y: center.y };
  const screen = g.worldToScreen(target.x, target.y, 0);
  const client = {
    x: rect.left + screen.x * rect.width / canvas.width,
    y: rect.top + screen.y * rect.height / canvas.height,
  };
  const originalContext = g.hitTestForContext;
  const originalHit = g.hitTest;
  g.hitTestForContext = (x, y) => Math.hypot(x - target.x, y - target.y) < 140 ? null : originalContext?.call(g, x, y);
  g.hitTest = (x, y, selectableOnly = true) => !selectableOnly && Math.hypot(x - target.x, y - target.y) < 140 ? null : originalHit?.call(g, x, y, selectableOnly);
  globalThis.__FD_DIR209_RESTORE__ = () => {
    g.hitTestForContext = originalContext;
    g.hitTest = originalHit;
  };
  return {
    ids: units.map(u => u.id),
    before: Object.fromEntries(units.map(u => [u.id, { x: u.x, y: u.y }])),
    center,
    target,
    client,
    beforeSeq: Number(bridge.seq || 0),
  };
});
if (fixture.error) throw new Error(JSON.stringify(fixture));

await page.mouse.click(fixture.client.x, fixture.client.y, { button: 'right' });
await page.evaluate(() => globalThis.__FD_DIR209_RESTORE__?.());

const result = await waitFor(() => page.evaluate(({ ids, before, center, target, beforeSeq }) => {
  const g = globalThis.__FD_DEBUG__.game;
  const bridge = globalThis.__FD_STABLE_STATE165__.bridge;
  if (Number(bridge.lastAck || 0) <= beforeSeq) return null;
  const desired = { x: target.x - center.x, y: target.y - center.y };
  const desiredLength = Math.max(1e-9, Math.hypot(desired.x, desired.y));
  const units = ids.map(id => g.getEntity(id)).filter(Boolean);
  const intents = units.map(u => {
    const cmd = u.currentCommand || u.commandQueue?.[0] || null;
    const end = cmd && Number.isFinite(Number(cmd.x)) && Number.isFinite(Number(cmd.y)) ? { x: Number(cmd.x), y: Number(cmd.y) } : null;
    const start = before[u.id];
    const vector = end ? { x: end.x - start.x, y: end.y - start.y } : null;
    const projection = vector ? (vector.x * desired.x + vector.y * desired.y) / desiredLength : null;
    return { id: u.id, start, end, vector, projection, command: cmd ? { type: cmd.type, free201: Boolean(cmd._fdFreeGroup201), requested: cmd._fdRequestedGroupTarget201 || null } : null };
  });
  if (intents.some(item => !item.end)) return null;
  return { tick: bridge.workerTick, desired, intents };
}, fixture), 10000);

const opposite = result.intents.filter(item => Number(item.projection) <= 0);
console.log(JSON.stringify({ fixture, result, opposite }));
if (opposite.length) {
  throw new Error(`FREE_GROUP_OPPOSITE_DIRECTION ${JSON.stringify({ desired: result.desired, opposite, intents: result.intents })}`);
}

console.log(JSON.stringify({ ok: true, build: 208, intents: result.intents }));
await context.close();
await browser.close();
