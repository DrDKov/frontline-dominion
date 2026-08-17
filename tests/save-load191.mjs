import { chromium, webkit, devices } from 'playwright';

const browserName = process.env.FD_BROWSER || 'chromium';
const url = process.env.FD_GAME_URL || 'http://127.0.0.1:8765/frontline-dominion/frontline-dominion.html?build=191';
const browserType = browserName === 'webkit' ? webkit : chromium;
const browser = await browserType.launch({ headless: true });
const context = browserName === 'webkit'
  ? await browser.newContext({ ...devices['iPad Pro 11'] })
  : await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
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
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'load', timeout: 60000 });

await waitFor(() => page.evaluate(() => {
  const button = document.getElementById('start-game');
  return Boolean(button && !button.disabled && globalThis.__FD_DEBUG__?.startGame && globalThis.__FD_RUNTIME_SHELL_191__);
}), 20000);
await page.locator('#start-game').click();

const newGame = await waitFor(() => page.evaluate(() => {
  const game = globalThis.__FD_DEBUG__?.game;
  const bridge = globalThis.__FD_STABLE_STATE165__?.bridge;
  const tick = Number(globalThis.__FD_STABLE_STATE165__?.tick ?? bridge?.lastWorkerTick ?? game?.simTick ?? 0);
  if (!game || tick < 6) return null;
  return {
    tick,
    units: game.units?.filter(unit => unit?.alive).length || 0,
    buildings: game.buildings?.filter(building => building?.alive).length || 0,
    faction: game.teams?.player?.faction || null,
    build: Number(document.documentElement.dataset.fdBuild || 0),
  };
}), 20000);
if (newGame.build !== 191 || !newGame.units || !newGame.buildings) {
  throw new Error(`new game did not initialize correctly: ${JSON.stringify(newGame)}`);
}

const checkpoint = await page.evaluate(() => {
  const api = globalThis.__FD_DEBUG__;
  const shell = globalThis.__FD_RUNTIME_SHELL_191__;
  const key = api?.SAVE_KEY || 'frontline-dominion-save-v5';
  const ok = shell?.saveNow?.('browser-save-load-regression') === true;
  const raw = localStorage.getItem(key);
  if (!ok || !raw) return { ok, key, bytes: raw?.length || 0 };
  const parsed = JSON.parse(raw);
  parsed._fdRegressionSaveLoad191 = {
    sentinel: 'legacy-wrapper-restored',
    savedAt: Date.now(),
    units: globalThis.__FD_DEBUG__?.game?.units?.filter(unit => unit?.alive).length || 0,
  };
  const legacyKey = 'frontline-dominion-save-v3';
  const wrapped = JSON.stringify({
    savedAt: Date.now(),
    payload: {
      saveData: parsed,
    },
  });
  localStorage.setItem(legacyKey, wrapped);
  localStorage.removeItem(key);
  for (let index = localStorage.length - 1; index >= 0; index -= 1) {
    const candidate = localStorage.key(index);
    if (candidate?.startsWith(`${key}-backup-build`) || candidate === `${key}-legacy-source-build191`) {
      localStorage.removeItem(candidate);
    }
  }
  // pagehide/visibility autosave would otherwise recreate the current key and
  // hide the legacy migration path this regression is intended to exercise.
  if (shell?.state) shell.state.launching = true;
  return {
    ok,
    key,
    legacyKey,
    bytes: raw.length,
    wrappedBytes: wrapped.length,
    sentinel: parsed._fdRegressionSaveLoad191.sentinel,
  };
});
if (!checkpoint.ok || checkpoint.bytes < 100 || checkpoint.sentinel !== 'legacy-wrapper-restored') {
  throw new Error(`checkpoint was not produced: ${JSON.stringify(checkpoint)}`);
}

await page.reload({ waitUntil: 'load', timeout: 60000 });
let loadReady;
try {
  loadReady = await waitFor(() => page.evaluate(() => {
    const shell = globalThis.__FD_RUNTIME_SHELL_191__;
    const compat = globalThis.__FD_SAVE_COMPAT_191__;
    const button = document.getElementById('load-game');
    const candidate = shell?.findSavedGame?.();
    const sentinel = candidate?.data?._fdRegressionSaveLoad191?.sentinel || null;
    if (!shell?.state?.installed || !compat || !button || button.disabled || sentinel !== 'legacy-wrapper-restored') return null;
    return {
      buttonDisabled: button.disabled,
      sourceKey: shell.state.saveSourceKey,
      candidateKey: candidate.key,
      sentinel,
      compat: { ...compat.state, invalidKeys: [...(compat.state?.invalidKeys || [])] },
      currentBytes: localStorage.getItem(globalThis.__FD_DEBUG__?.SAVE_KEY || 'frontline-dominion-save-v5')?.length || 0,
    };
  }), 20000);
} catch (error) {
  const diagnostic = await page.evaluate(() => {
    const shell = globalThis.__FD_RUNTIME_SHELL_191__;
    const compat = globalThis.__FD_SAVE_COMPAT_191__;
    const button = document.getElementById('load-game');
    const candidate = shell?.findSavedGame?.();
    const keys = [];
    for (let index = 0; index < localStorage.length; index += 1) keys.push(localStorage.key(index));
    return {
      shell: shell ? { ...shell.state, candidateKey: candidate?.key || null, sentinel: candidate?.data?._fdRegressionSaveLoad191?.sentinel || null } : null,
      compat: compat ? { ...compat.state, invalidKeys: [...(compat.state?.invalidKeys || [])] } : null,
      button: button ? { disabled: button.disabled, text: button.textContent } : null,
      keys,
    };
  });
  throw new Error(`${error.message}; load diagnostic: ${JSON.stringify(diagnostic)}`);
}

await page.locator('#load-game').click();
const loadedGame = await waitFor(() => page.evaluate(() => {
  const game = globalThis.__FD_DEBUG__?.game;
  const shell = globalThis.__FD_RUNTIME_SHELL_191__;
  const bridge = globalThis.__FD_STABLE_STATE165__?.bridge;
  const tick = Number(globalThis.__FD_STABLE_STATE165__?.tick ?? bridge?.lastWorkerTick ?? game?.simTick ?? 0);
  if (!game || tick < 6 || !shell?.state?.gameObservedAt || shell.state.launchCount < 1) return null;
  return {
    tick,
    units: game.units?.filter(unit => unit?.alive).length || 0,
    buildings: game.buildings?.filter(building => building?.alive).length || 0,
    faction: game.teams?.player?.faction || null,
    launchCount: shell.state.launchCount,
    saveSourceKey: shell.state.saveSourceKey,
    bridgeFailed: Boolean(bridge?.failed),
  };
}), 25000);

if (!loadedGame.units || !loadedGame.buildings || loadedGame.bridgeFailed) {
  throw new Error(`saved game did not restore: ${JSON.stringify(loadedGame)}`);
}
if (errors.length) throw new Error(`browser errors: ${errors.join(' | ')}`);

console.log(JSON.stringify({
  ok: true,
  browserName,
  newGame,
  checkpoint,
  loadReady,
  loadedGame,
}));
await browser.close();
