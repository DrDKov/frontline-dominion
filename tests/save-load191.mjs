import { chromium, webkit, devices } from 'playwright';

const browserName = process.env.FD_BROWSER || 'chromium';
const url = process.env.FD_GAME_URL || 'http://127.0.0.1:8765/frontline-dominion/frontline-dominion.html?build=191';
const CREDIT_SENTINEL = 7654321;
const LEGACY_KEY = 'frontline-dominion-save-v3';
const browserType = browserName === 'webkit' ? webkit : chromium;
const browser = await browserType.launch({ headless: true });
const baseContextOptions = browserName === 'webkit'
  ? { ...devices['iPad Pro 11'] }
  : { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 };
const errors = [];
let context = null;
let page = null;

const attachPageDiagnostics = currentPage => {
  currentPage.on('pageerror', error => errors.push(String(error?.stack || error)));
  currentPage.on('console', message => {
    if (message.type() === 'error' && !/favicon|404/i.test(message.text())) errors.push(`console:${message.text()}`);
  });
};

const waitFor = async (fn, timeout = 15000, interval = 80) => {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const value = await fn();
    if (value) return value;
    await page.waitForTimeout(interval);
  }
  throw new Error(`Timed out after ${timeout} ms`);
};

// Phase 1: create a structurally real save using the current game. This
// context is only a fixture factory; it is deliberately not the context in
// which legacy migration is tested, because closing/reloading a running game
// correctly triggers pagehide autosave of that active game.
context = await browser.newContext(baseContextOptions);
page = await context.newPage();
attachPageDiagnostics(page);
await page.goto(url, { waitUntil: 'load', timeout: 60000 });

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
    credits: Number(game.teams?.player?.credits || 0),
    build: Number(document.documentElement.dataset.fdBuild || 0),
  };
}), 20000);
if (newGame.build !== 191 || !newGame.units || !newGame.buildings) {
  throw new Error(`new game did not initialize correctly: ${JSON.stringify(newGame)}`);
}

const generated = await page.evaluate((creditSentinel) => {
  const api = globalThis.__FD_DEBUG__;
  const shell = globalThis.__FD_RUNTIME_SHELL_191__;
  const key = api?.SAVE_KEY || 'frontline-dominion-save-v5';
  const ok = shell?.saveNow?.('browser-save-load-regression') === true;
  const raw = localStorage.getItem(key);
  if (!ok || !raw) return { ok, key, bytes: raw?.length || 0, wrapped: null };
  const parsed = JSON.parse(raw);
  if (!parsed?.teams?.player) return { ok: false, key, bytes: raw.length, reason: 'player-team-missing', wrapped: null };
  const originalCredits = Number(parsed.teams.player.credits || 0);
  parsed.teams.player.credits = creditSentinel;
  parsed._fdRegressionSaveLoad191 = {
    sentinel: 'legacy-wrapper-restored',
    savedAt: Date.now(),
    units: globalThis.__FD_DEBUG__?.game?.units?.filter(unit => unit?.alive).length || 0,
  };
  const wrapped = JSON.stringify({
    savedAt: Date.now(),
    payload: {
      saveData: parsed,
    },
  });
  return {
    ok,
    key,
    legacyKey: 'frontline-dominion-save-v3',
    bytes: raw.length,
    wrappedBytes: wrapped.length,
    originalCredits,
    creditSentinel,
    wrapped,
  };
}, CREDIT_SENTINEL);

const legacyWrapped = generated.wrapped;
const checkpoint = { ...generated, wrapped: undefined };
delete checkpoint.wrapped;
if (!checkpoint.ok || checkpoint.bytes < 100 || checkpoint.creditSentinel !== CREDIT_SENTINEL || !legacyWrapped) {
  throw new Error(`checkpoint was not produced: ${JSON.stringify(checkpoint)}`);
}

// Phase 2: emulate a returning user whose browser storage contains only a
// legacy save. This is the production migration case. It has no running game
// capable of writing a newer v5 during pagehide, so the result measures the
// migration/loading pipeline rather than autosave ordering from the fixture.
await context.close();
errors.length = 0;
const origin = new URL(url).origin;
context = await browser.newContext({
  ...baseContextOptions,
  storageState: {
    cookies: [],
    origins: [{
      origin,
      localStorage: [{ name: LEGACY_KEY, value: legacyWrapped }],
    }],
  },
});
page = await context.newPage();
attachPageDiagnostics(page);
await page.goto(url, { waitUntil: 'load', timeout: 60000 });

let loadReady;
try {
  loadReady = await waitFor(() => page.evaluate((creditSentinel) => {
    const shell = globalThis.__FD_RUNTIME_SHELL_191__;
    const compat = globalThis.__FD_SAVE_COMPAT_191__;
    const button = document.getElementById('load-game');
    const candidate = shell?.findSavedGame?.();
    const candidateCredits = Number(candidate?.data?.teams?.player?.credits ?? NaN);
    if (!shell?.state?.installed || !compat || !button || button.disabled || candidateCredits !== creditSentinel) return null;
    return {
      buttonDisabled: button.disabled,
      sourceKey: shell.state.saveSourceKey,
      candidateKey: candidate.key,
      candidateCredits,
      sentinel: candidate?.data?._fdRegressionSaveLoad191?.sentinel || null,
      compat: { ...compat.state, invalidKeys: [...(compat.state?.invalidKeys || [])] },
      currentBytes: localStorage.getItem(globalThis.__FD_DEBUG__?.SAVE_KEY || 'frontline-dominion-save-v5')?.length || 0,
      keys: Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index)),
    };
  }, CREDIT_SENTINEL), 20000);
} catch (error) {
  const diagnostic = await page.evaluate((creditSentinel) => {
    const shell = globalThis.__FD_RUNTIME_SHELL_191__;
    const compat = globalThis.__FD_SAVE_COMPAT_191__;
    const button = document.getElementById('load-game');
    const candidate = shell?.findSavedGame?.();
    const keys = [];
    for (let index = 0; index < localStorage.length; index += 1) keys.push(localStorage.key(index));
    const rawByKey = Object.fromEntries(keys.map(key => {
      let parsed = null;
      try { parsed = JSON.parse(localStorage.getItem(key)); } catch (_) {}
      const directCredits = Number(parsed?.teams?.player?.credits ?? NaN);
      const wrappedCredits = Number(parsed?.payload?.saveData?.teams?.player?.credits ?? NaN);
      return [key, {
        bytes: localStorage.getItem(key)?.length || 0,
        directCredits: Number.isFinite(directCredits) ? directCredits : null,
        wrappedCredits: Number.isFinite(wrappedCredits) ? wrappedCredits : null,
      }];
    }));
    return {
      expectedCredits: creditSentinel,
      shell: shell ? {
        ...shell.state,
        candidateKey: candidate?.key || null,
        candidateCredits: Number(candidate?.data?.teams?.player?.credits ?? NaN),
        sentinel: candidate?.data?._fdRegressionSaveLoad191?.sentinel || null,
      } : null,
      compat: compat ? { ...compat.state, invalidKeys: [...(compat.state?.invalidKeys || [])] } : null,
      button: button ? { disabled: button.disabled, text: button.textContent } : null,
      keys,
      rawByKey,
    };
  }, CREDIT_SENTINEL);
  throw new Error(`${error.message}; load diagnostic: ${JSON.stringify(diagnostic)}`);
}

await page.locator('#load-game').click();
const loadedGame = await waitFor(() => page.evaluate((creditSentinel) => {
  const game = globalThis.__FD_DEBUG__?.game;
  const shell = globalThis.__FD_RUNTIME_SHELL_191__;
  const bridge = globalThis.__FD_STABLE_STATE165__?.bridge;
  const tick = Number(globalThis.__FD_STABLE_STATE165__?.tick ?? bridge?.lastWorkerTick ?? game?.simTick ?? 0);
  const credits = Number(game?.teams?.player?.credits ?? NaN);
  if (!game || tick < 6 || !shell?.state?.gameObservedAt || shell.state.launchCount < 1 || credits !== creditSentinel) return null;
  return {
    tick,
    units: game.units?.filter(unit => unit?.alive).length || 0,
    buildings: game.buildings?.filter(building => building?.alive).length || 0,
    faction: game.teams?.player?.faction || null,
    credits,
    launchCount: shell.state.launchCount,
    saveSourceKey: shell.state.saveSourceKey,
    bridgeFailed: Boolean(bridge?.failed),
    actionErrors: Number(bridge?.actionErrors || 0),
  };
}, CREDIT_SENTINEL), 25000);

if (!loadedGame.units || !loadedGame.buildings || loadedGame.credits !== CREDIT_SENTINEL || loadedGame.bridgeFailed || loadedGame.actionErrors !== 0) {
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
await context.close();
await browser.close();
