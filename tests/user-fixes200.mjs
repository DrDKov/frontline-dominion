import { chromium } from 'playwright';

const url = process.env.FD_GAME_URL || 'http://127.0.0.1:8765/frontline-dominion/frontline-dominion.html?build=200';
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
const page = await context.newPage();
const errors = [];

page.on('pageerror', error => errors.push(String(error?.stack || error)));
page.on('console', message => {
  if (message.type() !== 'error') return;
  const text = message.text();
  if (!/favicon|404|chrome-extension:/i.test(text)) errors.push(`console:${text}`);
});

const waitFor = async (fn, timeout = 15000, interval = 80) => {
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
  globalThis.__FD_RUNTIME_SHELL_200__?.build === 200 &&
  globalThis.__FD_SIMULATION_RESILIENCE_200__?.build === 200 &&
  globalThis.__FD_BUILDING_SELECTION_CONTOUR_200__?.build === 200 &&
  globalThis.__FD_COMMAND_INPUT_190__?.diagnostics?.().installed &&
  !document.getElementById('start-game')?.disabled
)), 30000);

await page.locator('#start-game').click();
await waitFor(() => page.evaluate(() => {
  const game = globalThis.__FD_DEBUG__?.game;
  const bridge = globalThis.__FD_STABLE_STATE165__?.bridge;
  return Boolean(game && bridge?.ready && !bridge.failed && Number(bridge.workerTick || 0) > 8);
}), 30000);

const cancelFixture = await page.evaluate(() => {
  const game = globalThis.__FD_DEBUG__.game;
  const canvas = document.getElementById('game-canvas');
  const rect = canvas.getBoundingClientRect();
  let point = null;
  for (const fy of [0.50, 0.42, 0.58, 0.34, 0.66]) {
    for (const fx of [0.50, 0.42, 0.58, 0.34, 0.66]) {
      const x = rect.left + rect.width * fx;
      const y = rect.top + rect.height * fy;
      if (document.elementFromPoint(x, y) === canvas) {
        point = { x, y };
        break;
      }
    }
    if (point) break;
  }
  game.buildMode = null;
  game.commandMode = 'power:scan';
  return {
    point,
    cancels: Number(globalThis.__FD_COMMAND_INPUT_190__.diagnostics().cancels || 0),
  };
});
if (!cancelFixture.point) throw new Error('No unobstructed canvas point for right-click cancellation');
await page.mouse.click(cancelFixture.point.x, cancelFixture.point.y, { button: 'right' });
const cancelled = await waitFor(() => page.evaluate(before => {
  const game = globalThis.__FD_DEBUG__?.game;
  const diagnostics = globalThis.__FD_COMMAND_INPUT_190__?.diagnostics?.();
  if (game?.commandMode || Number(diagnostics?.cancels || 0) <= before) return null;
  return { commandMode: game.commandMode || null, cancels: diagnostics.cancels, source: diagnostics.lastSource };
}, cancelFixture.cancels), 5000);

const contourFixture = await page.evaluate(() => {
  const game = globalThis.__FD_DEBUG__.game;
  const candidates = (game.buildings || []).filter(building =>
    building?.alive && building.team === 'player' && building.completed &&
    (!game.isOnScreen || game.isOnScreen(building.x, building.y, (building.radius || 30) + 180))
  );
  const building = candidates[0];
  if (!building) return { error: 'visible-player-building-missing' };
  const diagnostics = globalThis.__FD_BUILDING_SELECTION_CONTOUR_200__.diagnostics();
  game.setSelection([building], false);
  game.uiDirty = true;
  return { id: building.id, typeId: building.typeId, before: diagnostics.outlineFrames };
});
if (contourFixture.error) throw new Error(JSON.stringify(contourFixture));
const contour = await waitFor(() => page.evaluate(({ id, before }) => {
  const game = globalThis.__FD_DEBUG__?.game;
  const diagnostics = globalThis.__FD_BUILDING_SELECTION_CONTOUR_200__?.diagnostics?.();
  if (!game?.selected?.some(entity => entity.id === id) || !diagnostics || diagnostics.outlineFrames <= before || !diagnostics.capturedSprites) return null;
  return diagnostics;
}, contourFixture), 12000);
if (!contour.exactModelAlpha || contour.legacyBoxOverlay || !contour.lastBounds?.width || !contour.lastBounds?.height) {
  throw new Error(`Building contour is not model-alpha based: ${JSON.stringify(contour)}`);
}

const scanIssued = await page.evaluate(() => {
  const D = globalThis.__FD_DEBUG__;
  const game = D.game;
  const bridge = globalThis.__FD_STABLE_STATE165__.bridge;
  const player = [...game.units, ...game.buildings].filter(entity => entity?.alive && entity.team === 'player');
  let target = null;
  const step = 480;
  for (let y = step; y < D.WORLD.height - step && !target; y += step) {
    for (let x = step; x < D.WORLD.width - step; x += step) {
      const index = game.fogIndexAt(x, y);
      if (game.visible[index]) continue;
      if (player.some(entity => Math.hypot(entity.x - x, entity.y - y) < 1450)) continue;
      target = { x, y, index };
      break;
    }
  }
  if (!target) return { error: 'unseen-scan-target-missing' };
  const beforeSeq = Number(bridge.seq || 0);
  const issued = game.executePower('scan', target.x, target.y);
  return { ...target, issued, beforeSeq, sentSeq: Number(bridge.seq || 0), issuedAt: performance.now() };
});
if (scanIssued.error || !scanIssued.issued || scanIssued.sentSeq <= scanIssued.beforeSeq) {
  throw new Error(`Recon scan was not issued: ${JSON.stringify(scanIssued)}`);
}

const scanActive = await waitFor(() => page.evaluate(expected => {
  const game = globalThis.__FD_DEBUG__?.game;
  const bridge = globalThis.__FD_STABLE_STATE165__?.bridge;
  const zone = game?.abilityZones?.find(item =>
    item?.type === 'scan' && item.team === 'player' && Math.hypot(item.x - expected.x, item.y - expected.y) < 5
  );
  if (!zone || !game.visible[expected.index] || Number(bridge?.lastAck || 0) < expected.sentSeq) return null;
  return {
    duration: Number(zone.duration),
    age: Number(zone.age),
    visible: Boolean(game.visible[expected.index]),
    ack: Number(bridge.lastAck || 0),
    workerTick: Number(bridge.workerTick || 0),
  };
}, scanIssued), 6000);
if (Math.abs(scanActive.duration - 12) > 0.01) throw new Error(`Recon duration is not 12 seconds: ${JSON.stringify(scanActive)}`);

const scanExpired = await waitFor(() => page.evaluate(expected => {
  const game = globalThis.__FD_DEBUG__?.game;
  const bridge = globalThis.__FD_STABLE_STATE165__?.bridge;
  const zone = game?.abilityZones?.find(item =>
    item?.type === 'scan' && item.team === 'player' && Math.hypot(item.x - expected.x, item.y - expected.y) < 5
  );
  if (zone || game?.visible?.[expected.index]) return null;
  return {
    elapsedMs: performance.now() - expected.issuedAt,
    visible: Boolean(game.visible[expected.index]),
    zones: game.abilityZones.length,
    workerTick: Number(bridge?.workerTick || 0),
    bridgeFailed: Boolean(bridge?.failed),
  };
}, scanIssued), 15500, 120);
if (scanExpired.elapsedMs < 11500 || scanExpired.elapsedMs > 14500 || scanExpired.bridgeFailed) {
  throw new Error(`Recon scan expiry was not finite and healthy: ${JSON.stringify(scanExpired)}`);
}

if (errors.length) throw new Error(`Browser errors: ${JSON.stringify(errors)}`);

console.log(JSON.stringify({
  ok: true,
  cancelled,
  contour: {
    building: contourFixture,
    capturedSprites: contour.capturedSprites,
    outlineFrames: contour.outlineFrames,
    bounds: contour.lastBounds,
  },
  scanActive,
  scanExpired,
}));

await context.close();
await browser.close();
