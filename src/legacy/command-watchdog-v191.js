(() => {
  'use strict';

  const root = globalThis;
  if (typeof document === 'undefined' || root.__FD_COMMAND_WATCHDOG_191__) return;

  const VERSION = '16.8.17';
  const BUILD = 201;
  const state = {
    interactions: 0,
    wakeAttempts: 0,
    resumeMessages: 0,
    relaunches: 0,
    lastInteractionAt: 0,
    lastObservedTick: -1,
    lastTickAt: performance.now(),
  };

  const game = () => root.__FD_DEBUG__?.game || null;
  const bridge = () => root.__FD_STABLE_STATE165__?.bridge || null;
  const pauseScreenVisible = () => {
    const element = document.getElementById('pause-screen');
    return Boolean(element && !element.classList.contains('hidden'));
  };

  const wake = () => {
    const currentGame = game();
    if (!currentGame || currentGame.paused || pauseScreenVisible()) return false;
    const currentBridge = bridge();
    if (!currentBridge) return false;
    if (currentBridge.recovering201 || currentBridge.recoveryTimer201) return true;
    state.wakeAttempts += 1;

    try { currentBridge.setPaused?.(false); } catch (_) {}
    try { currentBridge.resume?.(); } catch (_) {}
    try {
      currentBridge.worker?.postMessage?.({ type: 'setPaused', paused: false, resumeIfMainRunning: true, source: 'command-watchdog-191' });
      currentBridge.worker?.postMessage?.({ type: 'pause', paused: false, resumeIfMainRunning: true, source: 'command-watchdog-191' });
      state.resumeMessages += 2;
    } catch (_) {}

    if ((!currentBridge.worker || currentBridge.failed) && typeof currentBridge.launch === 'function') {
      try {
        currentBridge.failed = false;
        currentBridge.launch();
        state.relaunches += 1;
      } catch (_) {}
    }
    return true;
  };

  const onCommandInteraction = event => {
    const target = event.target;
    const commandSurface = target?.closest?.('#game-canvas, #action-panel, #selection-panel, #powers-panel, #minimap-wrap');
    if (!commandSurface && !['KeyA', 'KeyM', 'KeyP', 'KeyS', 'KeyH', 'KeyJ'].includes(event.code)) return;
    state.interactions += 1;
    state.lastInteractionAt = performance.now();
    wake();
    setTimeout(wake, 80);
  };

  document.addEventListener('pointerdown', onCommandInteraction, { capture: true, passive: true });
  document.addEventListener('contextmenu', onCommandInteraction, { capture: true });
  document.addEventListener('keydown', onCommandInteraction, { capture: true });

  const timer = setInterval(() => {
    const currentGame = game();
    const currentBridge = bridge();
    if (!currentGame || !currentBridge) return;
    const tick = Number(root.__FD_STABLE_STATE165__?.tick ?? currentBridge.lastWorkerTick ?? currentGame.simTick ?? -1);
    if (tick !== state.lastObservedTick) {
      state.lastObservedTick = tick;
      state.lastTickAt = performance.now();
      return;
    }
    const recentlyCommanded = performance.now() - state.lastInteractionAt < 1400;
    const stalled = performance.now() - state.lastTickAt > 700;
    if (recentlyCommanded && stalled && !currentGame.paused && !pauseScreenVisible()) wake();
  }, 180);

  root.__FD_COMMAND_WATCHDOG_191__ = {
    version: VERSION,
    build: BUILD,
    state,
    wake,
    dispose() {
      clearInterval(timer);
      document.removeEventListener('pointerdown', onCommandInteraction, true);
      document.removeEventListener('contextmenu', onCommandInteraction, true);
      document.removeEventListener('keydown', onCommandInteraction, true);
    },
  };
})();
