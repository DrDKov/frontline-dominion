import { chromium, webkit, devices } from 'playwright';

const browserName = process.env.FD_BROWSER || 'webkit';
const url = process.env.FD_GAME_URL || 'http://127.0.0.1:8765/frontline-dominion/frontline-dominion.html?build=192';
const browserType = browserName === 'webkit' ? webkit : chromium;
const browser = await browserType.launch({ headless: true });
const context = browserName === 'webkit'
  ? await browser.newContext({ ...devices['iPad Pro 11'] })
  : await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', error => pageErrors.push(String(error?.stack || error)));

async function waitFor(fn, timeout = 15000, interval = 70) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const value = await fn();
    if (value) return value;
    await page.waitForTimeout(interval);
  }
  return null;
}

await page.goto(url, { waitUntil: 'load', timeout: 60000 });
await waitFor(() => page.evaluate(() => Boolean(
  globalThis.__FD_DEBUG__?.startGame &&
  document.documentElement.dataset.fdBuild === '192' &&
  !document.getElementById('start-game')?.disabled
)), 20000);
await page.locator('#start-game').click();

const ready = await waitFor(() => page.evaluate(() => {
  const bridge = globalThis.__FD_STABLE_STATE165__?.bridge;
  return Boolean(globalThis.__FD_DEBUG__?.game && bridge?.ready && !bridge.failed && Number(bridge.workerTick || 0) >= 8);
}), 20000);
if (!ready) throw new Error('authoritative bridge did not become ready');

const setup = await page.evaluate(() => {
  const D = globalThis.__FD_DEBUG__;
  const game = D.game;
  const core = globalThis.__FD_RESOURCE_EXTRACTION_V114__;
  if (game.explored?.fill) game.explored.fill(1);
  if (game.visible?.fill) game.visible.fill(1);
  const typeId = core?.typeForVariant?.('alloy');
  const node = (game.resources || []).find(candidate => {
    if (!candidate?.alive || candidate.variant !== 'alloy' || candidate.extractorBuildingId) return false;
    const rotation = Math.atan2((game.playerBase?.y ?? candidate.y) - candidate.y, (game.playerBase?.x ?? candidate.x + 1) - candidate.x);
    try { return game.isBuildPlacementValid(typeId, candidate.x, candidate.y, rotation, candidate) !== false; } catch (_) { return false; }
  });
  if (!node) return { error: 'no valid alloy node' };
  game.setSelection?.([node], false);
  game.uiDirty = true;
  game.updateUI?.(true);
  const bridge = globalThis.__FD_STABLE_STATE165__?.bridge;
  const authority = globalThis.__FD_RESOURCE_AUTHORITY_192__;
  const ui = globalThis.__FD_RESOURCE_UI_STABILITY_192__;
  const button = document.querySelector('#action-buttons .resource-build-button');
  return {
    nodeId: node.id,
    beforeSeq: Number(bridge?.seq || 0),
    beforeAck: Number(bridge?.lastAck || 0),
    bridgeReady: Boolean(bridge?.ready),
    sendAction: typeof bridge?.sendAction,
    authorityExists: Boolean(authority),
    handlerCalls: Number(authority?.state?.handlerCalls || 0),
    prototypeIsAuthority: Boolean(authority?.handler && D.Game.prototype.buildExtractorFromResource83 === authority.handler),
    uiExists: Boolean(ui),
    uiState: ui ? { ...ui.state } : null,
    buttonStable: button?.dataset?.fdResourceUiStable || null,
    buttonAuthority: button?.dataset?.fdResourceAuthority || null,
    buttonDisabled: Boolean(button?.disabled),
  };
});
if (setup?.error) throw new Error(`dispatch setup failed: ${JSON.stringify(setup)}`);

const button = page.locator('.resource-build-button');
if (await button.count() !== 1 || await button.isDisabled()) {
  throw new Error(`resource button unavailable: ${JSON.stringify(setup)}`);
}
await button.click({ timeout: 7000 });
await page.waitForTimeout(650);

const after = await page.evaluate(() => {
  const D = globalThis.__FD_DEBUG__;
  const bridge = globalThis.__FD_STABLE_STATE165__?.bridge;
  const authority = globalThis.__FD_RESOURCE_AUTHORITY_192__;
  const ui = globalThis.__FD_RESOURCE_UI_STABILITY_192__;
  const button = document.querySelector('#action-buttons .resource-build-button');
  return {
    seq: Number(bridge?.seq || 0),
    ack: Number(bridge?.lastAck || 0),
    workerTick: Number(bridge?.workerTick || 0),
    actionErrors: Number(bridge?.actionErrors || 0),
    bridgeFailed: Boolean(bridge?.failed),
    authorityState: authority ? { ...authority.state } : null,
    prototypeIsAuthority: Boolean(authority?.handler && D.Game.prototype.buildExtractorFromResource83 === authority.handler),
    uiState: ui ? { ...ui.state } : null,
    buttonStable: button?.dataset?.fdResourceUiStable || null,
    buttonAuthority: button?.dataset?.fdResourceAuthority || null,
    buttonConnected: Boolean(button?.isConnected),
  };
});

console.log(JSON.stringify({ browserName, setup, after, pageErrors }, null, 2));
if (!after.authorityState || after.authorityState.handlerCalls < 1) {
  throw new Error('physical resource click did not reach authoritative handler');
}
if (after.seq <= setup.beforeSeq || after.authorityState.commandsSent < 1) {
  throw new Error(`authoritative resource action was not sent: ${JSON.stringify(after)}`);
}
if (after.bridgeFailed || after.actionErrors > 0 || pageErrors.length) {
  throw new Error(`resource dispatch produced runtime error: ${JSON.stringify({ after, pageErrors })}`);
}

await browser.close();
