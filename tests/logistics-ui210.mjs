import { chromium } from 'playwright';

const url = process.env.FD_GAME_URL || 'http://127.0.0.1:8765/frontline-dominion/frontline-dominion.html?build=210';
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const page = await context.newPage();
const errors = [];

page.on('pageerror', error => errors.push(String(error?.stack || error)));
page.on('console', message => {
  if (message.type() === 'error' && !/favicon|404|audio|autoplay|Failed to load resource:.*503/i.test(message.text())) {
    errors.push(`console:${message.text()}`);
  }
});

const waitFor = async (fn, arg = undefined, timeout = 30000, interval = 100) => {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < timeout) {
    if (errors.length) throw new Error(`Browser error: ${JSON.stringify(errors)}`);
    last = await page.evaluate(fn, arg);
    if (last && !last.__pending) return last;
    await page.waitForTimeout(interval);
  }
  throw new Error(`Timed out; last=${JSON.stringify(last)} errors=${JSON.stringify(errors)}`);
};

await page.goto(url, { waitUntil: 'load', timeout: 60000 });
await waitFor(() => {
  const button = document.getElementById('start-game');
  return button && !button.disabled && globalThis.__FD_LOGISTICS206__ && globalThis.__FD_LOGISTICS_UI208__ && globalThis.__FD_GAMEPLAY_208__
    ? true : null;
});

await page.locator('#start-game').click();
await waitFor(() => {
  const game = globalThis.__FD_DEBUG__?.game;
  const bridge = globalThis.__FD_STABLE_STATE165__?.bridge;
  return game && bridge?.ready && !bridge.failed && Number(bridge.workerTick || 0) > 8 ? true : null;
}, undefined, 45000);

const hud = await waitFor(() => {
  const game = globalThis.__FD_DEBUG__?.game;
  const L = globalThis.__FD_LOGISTICS206__;
  const fuel = document.getElementById('fd-fuel-resource207');
  const value = document.getElementById('fd-fuel-value207');
  const power = document.getElementById('power-value')?.closest('.resource');
  if (!game || !L || !fuel || !value || !power) return { __pending: true };
  const expected = Math.round(Number(L.totalPhysical(game, 'player')?.fuel) || 0);
  const actual = Number(String(value.textContent || '').replace(/\D/g, ''));
  const topBar = document.getElementById('top-bar');
  const style = getComputedStyle(fuel);
  return {
    expected,
    actual,
    afterPower: power.nextElementSibling === fuel,
    connected: fuel.isConnected && fuel.parentElement === topBar,
    visible: style.display !== 'none' && style.visibility !== 'hidden',
    title: fuel.title,
  };
});
if (!hud.connected || !hud.visible || !hud.afterPower || hud.actual !== hud.expected) {
  throw new Error(`Fuel HUD regression: ${JSON.stringify(hud)}`);
}

const unitSetup = await page.evaluate(() => {
  const game = globalThis.__FD_DEBUG__?.game;
  const unit = (game?.units || []).find(entity => entity?.alive && entity.team === 'player');
  if (!unit) return null;
  game.setSelection?.([unit], false);
  game.renderSelectionUI?.(true);
  return { id: unit.id, typeId: unit.typeId };
});
if (!unitSetup) throw new Error('No player unit available for Logistics tab test');

const unitTab = await waitFor(() => {
  const tab = document.querySelector('[data-selection-tab="logistics"]');
  if (!tab) return { __pending: true };
  return { exists: true, disabled: Boolean(tab.disabled), text: tab.textContent?.trim() || '' };
});
if (unitTab.disabled || unitTab.text !== 'Логистика') throw new Error(`Unit Logistics tab unavailable: ${JSON.stringify(unitTab)}`);
await page.locator('[data-selection-tab="logistics"]').click();
const unitPanel = await waitFor(() => {
  const pane = document.querySelector('[data-selection-pane="logistics"]');
  const panel = document.getElementById('fd-logistics-panel207');
  if (!pane?.classList.contains('active') || !panel) return { __pending: true };
  return { active: true, text: panel.textContent?.trim() || '' };
});
if (!unitPanel.text) throw new Error('Unit Logistics panel is empty');

const buildingSetup = await page.evaluate(() => {
  const game = globalThis.__FD_DEBUG__?.game;
  const L = globalThis.__FD_LOGISTICS206__;
  const building = (game?.buildings || []).find(entity => entity?.alive && entity.team === 'player' && L?.ensureNode?.(entity))
    || (game?.buildings || []).find(entity => entity?.alive && entity.team === 'player');
  if (!building) return null;
  game.setSelection?.([building], false);
  game.renderSelectionUI?.(true);
  return { id: building.id, typeId: building.typeId, node: Boolean(L?.ensureNode?.(building)) };
});
if (!buildingSetup) throw new Error('No player building available for Logistics tab test');

const buildingTab = await waitFor(() => {
  const tab = document.querySelector('[data-selection-tab="logistics"]');
  if (!tab) return { __pending: true };
  return { exists: true, disabled: Boolean(tab.disabled), text: tab.textContent?.trim() || '' };
});
if (buildingTab.disabled || buildingTab.text !== 'Логистика') throw new Error(`Building Logistics tab unavailable: ${JSON.stringify(buildingTab)}`);
await page.locator('[data-selection-tab="logistics"]').click();
const buildingPanel = await waitFor(() => {
  const pane = document.querySelector('[data-selection-pane="logistics"]');
  const panel = document.getElementById('fd-logistics-panel207');
  if (!pane?.classList.contains('active') || !panel) return { __pending: true };
  return { active: true, text: panel.textContent?.trim() || '' };
});
if (!buildingPanel.text) throw new Error('Building Logistics panel is empty');

if (errors.length) throw new Error(`Browser errors: ${JSON.stringify(errors)}`);
console.log(JSON.stringify({ ok: true, hud, unit: unitSetup, building: buildingSetup, unitTab, buildingTab }, null, 2));
await browser.close();
