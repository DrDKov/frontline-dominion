'use strict';
(() => {
  const VERSION = '16.8.14';
  const BUILD = 198;
  const OBJECTIVE = 'Захватите командный центр противника пехотой';
  if (globalThis.__FD_RUNTIME_UI_198__) return;
  globalThis.__FD_RUNTIME_UI_198__ = { version: VERSION, build: BUILD };

  function captureInfo(game) {
    const diag = game?.constructionVictoryDiagnostics184?.();
    const perfDiag = globalThis.__FD_STABLE_STATE165__?.bridge?.workerPerformance?.objective184;
    const source = diag || perfDiag || null;
    if (!source) return null;
    return { winner: source.winner || null, progress: Number(source.captureProgress) || 0 };
  }

  function normalizeObjective(game) {
    const el = document.getElementById('objective-text');
    if (!el) return;
    const cap = captureInfo(game);
    if (cap?.winner) {
      el.textContent = cap.winner === 'player' ? 'Командный центр противника захвачен' : 'Ваш командный центр захвачен';
      return;
    }
    if (cap?.progress > 0) {
      const pct = Math.max(0, Math.min(100, Math.round(cap.progress * 100)));
      el.textContent = `${OBJECTIVE} · захват ${pct}%`;
      return;
    }
    el.textContent = OBJECTIVE;
  }

  function install() {
    const Game = globalThis.__FD_DEBUG__?.Game;
    if (!Game?.prototype || Game.prototype.__fdRuntimeUi188Installed) return false;
    const original = Game.prototype.updateUI;
    if (typeof original !== 'function') return false;
    Object.defineProperty(Game.prototype, '__fdRuntimeUi188Installed', { value: true, configurable: true });
    Game.prototype.updateUI = function runtimeUi188Update(...args) {
      const result = original.apply(this, args);
      normalizeObjective(this);
      return result;
    };
    const game = globalThis.__FD_DEBUG__?.game;
    if (game) normalizeObjective(game);
    return true;
  }

  if (!install()) {
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      if (install() || attempts >= 80) clearInterval(timer);
    }, 50);
  }
  queueMicrotask(() => normalizeObjective(globalThis.__FD_DEBUG__?.game));
})();
