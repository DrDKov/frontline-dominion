'use strict';
(() => {
  const VERSION = '16.8.5';
  const BUILD = 189;
  if (globalThis.__FD_RUNTIME_SHELL_189__) return;

  const boot = globalThis.__FD_BOOT_189__;
  const state = {
    installed: false,
    launching: false,
    launchCount: 0,
    lastError: null,
  };

  const debug = () => globalThis.__FD_DEBUG__;
  const selectedValue = (selector, key, fallback) =>
    document.querySelector(`${selector}.selected`)?.dataset?.[key] ||
    document.querySelector(selector)?.dataset?.[key] || fallback;

  const showLaunchError = (text) => {
    state.lastError = String(text || 'Не удалось запустить игру');
    boot?.setLaunching?.(false);
    const alerts = document.getElementById('alerts');
    if (!alerts) return;
    const message = document.createElement('div');
    message.className = 'alert danger';
    message.dataset.fdLaunchError189 = 'true';
    message.textContent = state.lastError;
    alerts.prepend(message);
    setTimeout(() => message.remove(), 7000);
  };

  const finishSuccessfulLaunch = () => {
    const game = debug()?.game;
    if (!game) return false;
    const start = document.getElementById('start-screen');
    start?.classList.add('hidden');
    if (start) {
      start.style.removeProperty('visibility');
      start.style.removeProperty('opacity');
      start.style.removeProperty('pointer-events');
    }
    boot?.stop?.();
    document.documentElement.classList.remove('fd-loading189');
    document.documentElement.classList.add('fd-running189');
    state.launching = false;
    return true;
  };

  const verifyLaunch = (attempt = 0) => {
    if (finishSuccessfulLaunch()) return;
    if (attempt < 30) {
      setTimeout(() => verifyLaunch(attempt + 1), 50);
      return;
    }
    state.launching = false;
    showLaunchError('Игра не запустилась. Кнопка снова активна; повторите запуск.');
  };

  const launchNewGame = (event) => {
    event?.preventDefault?.();
    event?.stopImmediatePropagation?.();
    if (state.launching) return;
    const api = debug();
    if (typeof api?.startGame !== 'function') {
      showLaunchError('Игровое ядро ещё не готово.');
      return;
    }
    state.launching = true;
    state.launchCount += 1;
    boot?.setLaunching?.(true);
    try {
      api.startGame({
        faction: selectedValue('[data-faction]', 'faction', 'vanguard'),
        difficulty: selectedValue('[data-difficulty]', 'difficulty', 'normal'),
      });
      verifyLaunch();
    } catch (error) {
      state.launching = false;
      console.error(error);
      showLaunchError(error?.message || error);
    }
  };

  const launchSavedGame = (event) => {
    event?.preventDefault?.();
    event?.stopImmediatePropagation?.();
    if (state.launching) return;
    const api = debug();
    if (typeof api?.startGame !== 'function' || typeof api?.storageGet !== 'function') {
      showLaunchError('Игровое ядро ещё не готово.');
      return;
    }
    try {
      const raw = api.storageGet(api.SAVE_KEY);
      const saved = raw ? JSON.parse(raw) : null;
      if (!saved) {
        boot?.setLoadAvailable?.(false);
        showLaunchError('Сохранение не найдено.');
        return;
      }
      state.launching = true;
      state.launchCount += 1;
      boot?.setLaunching?.(true);
      api.startGame({
        loadData: saved,
        faction: saved.teams?.player?.faction || 'vanguard',
        difficulty: saved.difficultyKey || 'normal',
      });
      verifyLaunch();
    } catch (error) {
      state.launching = false;
      console.error(error);
      boot?.setLoadAvailable?.(false);
      showLaunchError('Сохранение повреждено или несовместимо. Начните новую игру.');
    }
  };

  const install = () => {
    if (state.installed) return true;
    const api = debug();
    const startButton = document.getElementById('start-game');
    const loadButton = document.getElementById('load-game');
    if (typeof api?.startGame !== 'function' || !startButton || !loadButton) return false;

    // Capture-phase handlers are the only launch owners. They stop the legacy
    // bubble listeners, preventing a second Game instance or a no-op early tap.
    startButton.addEventListener('click', launchNewGame, { capture: true });
    loadButton.addEventListener('click', launchSavedGame, { capture: true });

    const loadAvailable = Boolean(api.storageGet?.(api.SAVE_KEY));
    boot?.setLoadAvailable?.(loadAvailable);
    boot?.setReady?.(true);
    state.installed = true;
    return true;
  };

  let attempts = 0;
  const timer = setInterval(() => {
    attempts += 1;
    if (install() || attempts >= 200) {
      clearInterval(timer);
      if (!state.installed) showLaunchError('Не удалось подготовить кнопку запуска.');
    }
  }, 25);
  install();

  globalThis.__FD_RUNTIME_SHELL_189__ = {
    version: VERSION,
    build: BUILD,
    state,
    install,
    launchNewGame,
    launchSavedGame,
  };
})();
