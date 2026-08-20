from pathlib import Path

source = Path('tests/save-load191.mjs')
target = Path('tests/save-load199.generated.mjs')
text = source.read_text('utf-8')
text = text.replace('?build=191', '?build=199')
text = text.replace('__FD_RUNTIME_SHELL_191__', '__FD_RUNTIME_SHELL_199__')
text = text.replace('newGame.build !== 191', 'newGame.build !== 199')
text = text.replace('save-load191', 'save-load199')
text = text.replace('SaveLoad191', 'SaveLoad199')

# Build 199 exposes the canonical authoritative simulation counter as
# bridge.workerTick. The historical global tick can legitimately be zero after
# restoring a save even while the Worker is already running, so it must not
# shadow the live bridge counter through nullish coalescing.
legacy_tick = "Number(globalThis.__FD_STABLE_STATE165__?.tick ?? bridge?.lastWorkerTick ?? game?.simTick ?? 0)"
authoritative_tick = "Number(bridge?.workerTick ?? globalThis.__FD_STABLE_STATE165__?.tick ?? bridge?.lastWorkerTick ?? game?.simTick ?? 0)"
if text.count(legacy_tick) != 2:
    raise RuntimeError(f'build 199 save/load tick anchor count invalid: {text.count(legacy_tick)}')
text = text.replace(legacy_tick, authoritative_tick)

loaded_anchor = """const loadedGame = await waitFor(() => page.evaluate((creditSentinel) => {
  const game = globalThis.__FD_DEBUG__?.game;
  const shell = globalThis.__FD_RUNTIME_SHELL_199__;
  const bridge = globalThis.__FD_STABLE_STATE165__?.bridge;
  const tick = Number(bridge?.workerTick ?? globalThis.__FD_STABLE_STATE165__?.tick ?? bridge?.lastWorkerTick ?? game?.simTick ?? 0);
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
"""

loaded_replacement = """let loadedGame;
try {
  loadedGame = await waitFor(() => page.evaluate((creditSentinel) => {
    const game = globalThis.__FD_DEBUG__?.game;
    const shell = globalThis.__FD_RUNTIME_SHELL_199__;
    const bridge = globalThis.__FD_STABLE_STATE165__?.bridge;
    const tick = Number(bridge?.workerTick ?? globalThis.__FD_STABLE_STATE165__?.tick ?? bridge?.lastWorkerTick ?? game?.simTick ?? 0);
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
} catch (error) {
  const diagnostic = await page.evaluate((creditSentinel) => {
    const api = globalThis.__FD_DEBUG__;
    const game = api?.game;
    const shell = globalThis.__FD_RUNTIME_SHELL_199__;
    const stable = globalThis.__FD_STABLE_STATE165__;
    const bridge = stable?.bridge;
    const compat = globalThis.__FD_SAVE_COMPAT_191__;
    const candidate = shell?.findSavedGame?.();
    const button = document.getElementById('load-game');
    const start = document.getElementById('start-screen');
    const key = api?.SAVE_KEY || 'frontline-dominion-save-v5';
    let current = null;
    try {
      const raw = localStorage.getItem(key);
      const parsed = raw ? JSON.parse(raw) : null;
      current = {
        bytes: raw?.length || 0,
        credits: Number(parsed?.teams?.player?.credits ?? NaN),
        seed: parsed?.seed ?? null,
        entities: parsed?.entities?.length ?? null,
        units: parsed?.units?.length ?? null,
        buildings: parsed?.buildings?.length ?? null,
      };
    } catch (storageError) {
      current = { error: String(storageError?.message || storageError) };
    }
    return {
      expectedCredits: creditSentinel,
      game: game ? {
        seed: game.seed ?? null,
        credits: Number(game.teams?.player?.credits ?? NaN),
        units: game.units?.filter(unit => unit?.alive).length || 0,
        buildings: game.buildings?.filter(building => building?.alive).length || 0,
        simTick: Number(game.simTick || 0),
      } : null,
      shell: shell ? { ...shell.state } : null,
      stableTick: Number(stable?.tick ?? NaN),
      bridge: bridge ? {
        ready: Boolean(bridge.ready),
        failed: Boolean(bridge.failed),
        workerTick: Number(bridge.workerTick || 0),
        lastWorkerTick: Number(bridge.lastWorkerTick || 0),
        lastAck: Number(bridge.lastAck || 0),
        actionErrors: Number(bridge.actionErrors || 0),
        lastError: bridge.lastError || null,
      } : null,
      candidate: candidate ? {
        key: candidate.key,
        credits: Number(candidate.data?.teams?.player?.credits ?? NaN),
        seed: candidate.data?.seed ?? null,
        entities: candidate.data?.entities?.length ?? null,
        units: candidate.data?.units?.length ?? null,
        buildings: candidate.data?.buildings?.length ?? null,
      } : null,
      compat: compat ? { ...compat.state, invalidKeys: [...(compat.state?.invalidKeys || [])] } : null,
      button: button ? { disabled: button.disabled, ariaDisabled: button.getAttribute('aria-disabled'), text: button.textContent } : null,
      start: start ? { hidden: start.classList.contains('hidden'), display: getComputedStyle(start).display } : null,
      current,
    };
  }, CREDIT_SENTINEL);
  throw new Error(`${error.message}; loaded diagnostic: ${JSON.stringify(diagnostic)}; browser errors: ${JSON.stringify(errors)}`);
}
"""

if text.count(loaded_anchor) != 1:
    raise RuntimeError(f'build 199 loaded-game diagnostic anchor count invalid: {text.count(loaded_anchor)}')
text = text.replace(loaded_anchor, loaded_replacement, 1)

target.write_text(text, 'utf-8')
print('Build 199 isolated save/load regression generated with authoritative Worker tick and load diagnostics')
