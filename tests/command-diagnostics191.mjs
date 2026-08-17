import { chromium, webkit, devices } from 'playwright';

const browserName = process.env.FD_BROWSER || 'chromium';
const url = process.env.FD_GAME_URL || 'http://127.0.0.1:8765/frontline-dominion/frontline-dominion.html?build=191';
const browserType = browserName === 'webkit' ? webkit : chromium;
const browser = await browserType.launch({ headless: true });
const context = browserName === 'webkit'
  ? await browser.newContext({ ...devices['iPad Pro 11'] })
  : await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const page = await context.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e?.stack || e)));
page.on('console', msg => { if (msg.type() === 'error' && !/favicon|404/i.test(msg.text())) errors.push(`console:${msg.text()}`); });

async function waitFor(fn, timeout = 12000, interval = 60) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const value = await fn();
    if (value) return value;
    await page.waitForTimeout(interval);
  }
  throw new Error(`Timed out after ${timeout} ms`);
}

await page.goto(url, { waitUntil: 'load', timeout: 60000 });
await waitFor(() => page.evaluate(() => Boolean(globalThis.__FD_DEBUG__?.startGame && !document.getElementById('start-game')?.disabled)), 20000);
await page.locator('#start-game').click();
await waitFor(() => page.evaluate(() => {
  const g = globalThis.__FD_DEBUG__?.game;
  const b = globalThis.__FD_STABLE_STATE165__?.bridge;
  return g && b?.ready && !b.failed && Number(b.workerTick || 0) > 8;
}), 20000);

const picked = await page.evaluate(() => {
  const D = globalThis.__FD_DEBUG__;
  const g = D.game;
  const unit = g.units.find(u => u?.alive && u.team === 'player' && !u.air && !u.embarkedIn && u.typeId !== 'worker') ||
    g.units.find(u => u?.alive && u.team === 'player' && !u.air && !u.embarkedIn);
  if (!unit) return null;
  g.setSelection?.([unit], false);
  g.centerCamera?.(unit.x, unit.y);
  const bridge = globalThis.__FD_STABLE_STATE165__.bridge;
  return { id: unit.id, x: unit.x, y: unit.y, seq: bridge.seq, ack: bridge.lastAck, tick: bridge.workerTick };
});
if (!picked) throw new Error('No controllable unit');

const direct = await page.evaluate(({ id }) => {
  const g = globalThis.__FD_DEBUG__.game;
  const u = g.getEntity(id);
  const b = globalThis.__FD_STABLE_STATE165__.bridge;
  g.setSelection([u], false);
  const before = { seq: b.seq, ack: b.lastAck, tick: b.workerTick, x: u.x, y: u.y };
  const ok = g.issueMove(u.x + 560, u.y + 40, false);
  return { ok, before, afterSeq: b.seq };
}, picked);
if (!direct.ok || direct.afterSeq <= direct.before.seq) throw new Error(`Direct issueMove did not enqueue: ${JSON.stringify(direct)}`);

const directAck = await waitFor(() => page.evaluate(({ id, sentSeq, beforeX, beforeY }) => {
  const g = globalThis.__FD_DEBUG__.game;
  const u = g.getEntity(id);
  const b = globalThis.__FD_STABLE_STATE165__.bridge;
  if (!u || Number(b.lastAck || 0) < sentSeq) return null;
  return {
    lastAck: b.lastAck,
    actionErrors: b.actionErrors,
    workerTick: b.workerTick,
    commandCode: u._fdCommandCode172,
    currentCommand: u.currentCommand?.type || null,
    moved: Math.hypot(u.x - beforeX, u.y - beforeY),
    x: u.x,
    y: u.y,
  };
}, { id: picked.id, sentSeq: direct.afterSeq, beforeX: direct.before.x, beforeY: direct.before.y }), 8000);
if (directAck.actionErrors) throw new Error(`Direct command ACK error: ${JSON.stringify(directAck)}`);
await page.waitForTimeout(900);
const directMotion = await page.evaluate(({ id, x, y }) => {
  const u = globalThis.__FD_DEBUG__.game.getEntity(id);
  const b = globalThis.__FD_STABLE_STATE165__.bridge;
  return { moved: Math.hypot(u.x - x, u.y - y), commandCode: u._fdCommandCode172, currentCommand: u.currentCommand?.type || null, ack: b.lastAck, seq: b.seq };
}, { id: picked.id, x: direct.before.x, y: direct.before.y });
if (directMotion.moved < 18 && directMotion.commandCode !== 1 && directMotion.currentCommand !== 'move') {
  throw new Error(`Direct command ACKed but not applied: ${JSON.stringify({ direct, directAck, directMotion })}`);
}

const uiPrep = await page.evaluate(id => {
  const g = globalThis.__FD_DEBUG__.game;
  const u = g.getEntity(id);
  const b = globalThis.__FD_STABLE_STATE165__.bridge;
  g.setSelection([u], false);
  g.centerCamera(u.x, u.y);
  if (g.camera) g.camera.zoom = Math.max(1, g.camera.zoom || 1);
  const canvas = document.getElementById('game-canvas');
  const rect = canvas.getBoundingClientRect();
  const targetWorld = { x: u.x - 520, y: u.y + 120 };
  const p = g.worldToScreen(targetWorld.x, targetWorld.y, 0);
  return {
    beforeX: u.x, beforeY: u.y, beforeSeq: b.seq, beforeAck: b.lastAck,
    cssX: rect.left + p.x * rect.width / canvas.width,
    cssY: rect.top + p.y * rect.height / canvas.height,
  };
}, picked.id);
await page.mouse.click(uiPrep.cssX, uiPrep.cssY, { button: 'right' });

const uiSent = await waitFor(() => page.evaluate(beforeSeq => {
  const b = globalThis.__FD_STABLE_STATE165__.bridge;
  return b.seq > beforeSeq ? { seq: b.seq, ack: b.lastAck, errors: b.actionErrors, tick: b.workerTick } : null;
}, uiPrep.beforeSeq), 3000);
const uiAck = await waitFor(() => page.evaluate(({ id, seq, x, y }) => {
  const g = globalThis.__FD_DEBUG__.game;
  const u = g.getEntity(id);
  const b = globalThis.__FD_STABLE_STATE165__.bridge;
  if (b.lastAck < seq) return null;
  return { ack: b.lastAck, errors: b.actionErrors, tick: b.workerTick, commandCode: u?._fdCommandCode172, currentCommand: u?.currentCommand?.type || null, moved: u ? Math.hypot(u.x - x, u.y - y) : -1 };
}, { id: picked.id, seq: uiSent.seq, x: uiPrep.beforeX, y: uiPrep.beforeY }), 8000);
if (uiAck.errors) throw new Error(`UI command ACK error: ${JSON.stringify(uiAck)}`);
await page.waitForTimeout(900);
const uiMotion = await page.evaluate(({ id, x, y }) => {
  const u = globalThis.__FD_DEBUG__.game.getEntity(id);
  const b = globalThis.__FD_STABLE_STATE165__.bridge;
  return { moved: Math.hypot(u.x - x, u.y - y), commandCode: u._fdCommandCode172, currentCommand: u.currentCommand?.type || null, ack: b.lastAck, seq: b.seq };
}, { id: picked.id, x: uiPrep.beforeX, y: uiPrep.beforeY });
if (uiMotion.moved < 18 && uiMotion.commandCode !== 1 && uiMotion.currentCommand !== 'move') {
  throw new Error(`UI command ACKed but not applied: ${JSON.stringify({ uiPrep, uiSent, uiAck, uiMotion })}`);
}

if (errors.length) throw new Error(`browser errors: ${errors.join(' | ')}`);
console.log(JSON.stringify({ ok: true, browserName, picked, direct, directAck, directMotion, uiPrep, uiSent, uiAck, uiMotion }));
await browser.close();
