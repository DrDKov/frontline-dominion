import { webkit } from 'playwright';

const url = process.env.FD_GAME_URL || 'http://127.0.0.1:8765/frontline-dominion/frontline-dominion.html?build=189';
const browser = await webkit.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1024, height: 768 },
  hasTouch: true,
  isMobile: false,
  deviceScaleFactor: 2,
});
const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', error => pageErrors.push(String(error?.stack || error)));

await page.addInitScript(() => {
  globalThis.__FD_SCREEN_SAMPLES_189__ = [];
  const sample = () => {
    const start = document.getElementById('start-screen');
    const button = document.getElementById('start-game');
    if (!start || !button) return;
    globalThis.__FD_SCREEN_SAMPLES_189__.push({
      title: document.title,
      eyebrow: start.querySelector('.eyebrow')?.textContent || '',
      lead: start.querySelector('.lead')?.textContent || '',
      features: [...start.querySelectorAll('.feature-strip span')].map(element => element.textContent),
      button: button.textContent,
      disabled: button.disabled,
    });
  };
  setInterval(sample, 5);
});

await page.goto(url, { waitUntil: 'commit', timeout: 30000 });
await page.locator('#start-game').waitFor({ state: 'attached', timeout: 30000 });
const early = await page.evaluate(() => {
  const button = document.getElementById('start-game');
  return {
    disabled: button.disabled,
    text: button.textContent,
    boot: globalThis.__FD_BOOT_189__?.state || null,
    shell: !!globalThis.__FD_RUNTIME_SHELL_189__,
  };
});
if (!early.disabled && !early.boot?.ready) throw new Error(`start button was actionable before core readiness: ${JSON.stringify(early)}`);

const clickStarted = Date.now();
await page.locator('#start-game').click({ timeout: 45000 });
const clickMs = Date.now() - clickStarted;
await page.waitForFunction(
  () => !!globalThis.__FD_DEBUG__?.game && Number(globalThis.__FD_STABLE_STATE165__?.bridge?.workerTick || 0) > 0,
  { timeout: 25000 },
);
await page.waitForTimeout(700);

const startup = await page.evaluate(() => {
  const game = globalThis.__FD_DEBUG__?.game;
  const bridge = globalThis.__FD_STABLE_STATE165__?.bridge;
  const canvas = document.getElementById('game-canvas');
  const ctx = canvas?.getContext('2d');
  let pixels = null;
  try {
    const width = Math.min(canvas.width, 160), height = Math.min(canvas.height, 100);
    const data = ctx.getImageData(Math.max(0, (canvas.width - width) >> 1), Math.max(0, (canvas.height - height) >> 1), width, height).data;
    let lit = 0, max = 0; const bins = new Set();
    for (let index = 0; index < data.length; index += 16) {
      const r = data[index], g = data[index + 1], b = data[index + 2], value = Math.max(r, g, b);
      if (value > 12) lit += 1;
      max = Math.max(max, value);
      bins.add(`${r >> 4},${g >> 4},${b >> 4}`);
    }
    pixels = { lit, max, bins: bins.size };
  } catch (error) { pixels = { error: String(error) }; }

  const worker = game?.units?.find(unit => unit?.alive && unit.team === 'player' && unit.typeId === 'worker');
  const infantry = game?.units?.find(unit => unit?.alive && unit.team === 'player' && unit.infantry && unit.typeId !== 'worker');
  const bounds = unit => game?.getUnitFigureScreenBounds140?.(unit) || game?.getInfantryScreenBounds138?.(unit) || null;
  const workerBounds = bounds(worker);
  const infantryBounds = bounds(infantry);
  const directWorkerBounds = game?.getWorkerScreenBounds115?.(worker) || null;
  const height = value => value ? Number(value.y2 - value.y1 || value.visibleHeight || value.height || 0) : 0;
  return {
    build: Number(globalThis.__FD_STABLE_STATE165__?.build || 0),
    workerTick: Number(bridge?.workerTick || 0),
    failed: !!bridge?.failed,
    gameTick: Number(game?.simTick || 0),
    paused: !!game?.paused,
    launchCount: Number(globalThis.__FD_RUNTIME_SHELL_189__?.state?.launchCount || 0),
    canvas: { width: canvas?.clientWidth || 0, height: canvas?.clientHeight || 0, pixels },
    engineer: {
      workerId: worker?.id || null,
      infantryId: infantry?.id || null,
      workerRadius: Number(worker?.radius || 0),
      infantryRadius: Number(infantry?.radius || 0),
      workerHeight: height(workerBounds),
      infantryHeight: height(infantryBounds),
      directWorkerHeight: height(directWorkerBounds),
      workerSource: workerBounds?.source || null,
      infantrySource: infantryBounds?.source || null,
    },
    startDisplay: getComputedStyle(document.getElementById('start-screen')).display,
  };
});

if (startup.build !== 189 || startup.workerTick <= 0 || startup.failed || startup.paused) throw new Error(`WebKit Worker start failed: ${JSON.stringify(startup)}`);
if (startup.launchCount !== 1) throw new Error(`start handler executed ${startup.launchCount} times`);
if (startup.startDisplay !== 'none') throw new Error(`start screen did not close: ${startup.startDisplay}`);
if (startup.canvas.width < 100 || startup.canvas.height < 100 || startup.canvas.pixels?.lit < 20 || startup.canvas.pixels?.bins < 3) throw new Error(`canvas blank: ${JSON.stringify(startup.canvas)}`);
const engineer = startup.engineer;
if (!engineer.workerId || !engineer.infantryId) throw new Error(`initial infantry comparison unavailable: ${JSON.stringify(engineer)}`);
if (engineer.workerRadius !== 14 || Math.abs(engineer.workerRadius - engineer.infantryRadius) > 1) throw new Error(`engineer physical radius mismatch: ${JSON.stringify(engineer)}`);
const visualRatio = engineer.workerHeight / Math.max(1, engineer.infantryHeight);
if (visualRatio < 0.82 || visualRatio > 1.18) throw new Error(`engineer visible height mismatch: ratio=${visualRatio} ${JSON.stringify(engineer)}`);
if (Math.abs(engineer.directWorkerHeight - engineer.workerHeight) > 1.5) throw new Error(`engineer indicator/selection bounds use another scale: ${JSON.stringify(engineer)}`);

const move = await page.evaluate(() => {
  const game = globalThis.__FD_DEBUG__.game, bridge = globalThis.__FD_STABLE_STATE165__.bridge;
  const unit = game.units.find(candidate => candidate?.alive && candidate.team === 'player' && !candidate.embarkedIn);
  game.setSelection?.([unit], false);
  const before = { x: unit.x, y: unit.y, seq: bridge.seq };
  const ok = game.issueMove(unit.x + 180, unit.y + 70, false);
  return { id: unit.id, before, ok, sequence: bridge.seq };
});
if (!move.ok || move.sequence <= move.before.seq) throw new Error(`move command was not routed: ${JSON.stringify(move)}`);
await page.waitForFunction(({ id, x, y, sequence }) => {
  const game = globalThis.__FD_DEBUG__?.game, bridge = globalThis.__FD_STABLE_STATE165__?.bridge, unit = game?.getEntity?.(id);
  return Number(bridge?.lastAck || 0) >= sequence && Math.hypot((unit?.x || 0) - x, (unit?.y || 0) - y) > 2;
}, { id: move.id, x: move.before.x, y: move.before.y, sequence: move.sequence }, { timeout: 10000 });

const production = await page.evaluate(() => {
  const game = globalThis.__FD_DEBUG__.game, bridge = globalThis.__FD_STABLE_STATE165__.bridge;
  const building = game.buildings.find(candidate => candidate?.alive && candidate.team === 'player' && candidate.completed !== false && (candidate.stats?.produces || []).length);
  if (!building) return { error: 'producer missing' };
  game.setSelection?.([building], false);
  game.uiDirty = true;
  game.updateUI?.();
  const typeId = building.stats.produces[0];
  const button = [...document.querySelectorAll('button')].find(element => !element.disabled && element.dataset?.actionKind === 'unit' && element.dataset?.typeId === typeId);
  if (!button) return { error: 'production button missing' };
  const before = { queue: (building.queue || []).length, credits: game.teams.player.credits, seq: bridge.seq };
  button.click();
  return { id: building.id, typeId, before, sequence: bridge.seq };
});
if (production.error || production.sequence <= production.before.seq) throw new Error(`production was not routed: ${JSON.stringify(production)}`);
await page.waitForFunction(({ id, queue, sequence }) => {
  const game = globalThis.__FD_DEBUG__?.game, bridge = globalThis.__FD_STABLE_STATE165__?.bridge, building = game?.getEntity?.(id);
  return Number(bridge?.lastAck || 0) >= sequence && (building?.queue || []).length > queue;
}, { id: production.id, queue: production.before.queue, sequence: production.sequence }, { timeout: 10000 });

const screenHistory = await page.evaluate(() => globalThis.__FD_SCREEN_SAMPLES_189__ || []);
const metadata = screenHistory
  .filter(sample => sample.eyebrow && sample.lead && sample.features.length)
  .map(sample => JSON.stringify({ title: sample.title, eyebrow: sample.eyebrow, lead: sample.lead, features: sample.features }));
const uniqueMetadata = [...new Set(metadata)];
if (uniqueMetadata.length !== 1) throw new Error(`start screen changed versions/content during load: ${JSON.stringify(uniqueMetadata)}`);
const canonical = JSON.parse(uniqueMetadata[0]);
if (!/v16\.8\.5 BUILD 189/.test(canonical.eyebrow) || canonical.features.length !== 9) throw new Error(`canonical start screen invalid: ${JSON.stringify(canonical)}`);
if (pageErrors.length) throw new Error(`WebKit page errors: ${pageErrors.join(' | ')}`);

console.log(JSON.stringify({
  ok: true,
  build: startup.build,
  clickMs,
  workerTick: startup.workerTick,
  canvas: startup.canvas,
  engineer: { ...engineer, visualRatio },
  startStates: uniqueMetadata.length,
  move,
  production,
}));
await browser.close();
