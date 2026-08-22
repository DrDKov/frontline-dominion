'use strict';
(() => {
  const VERSION = '16.8.16';
  const BUILD = 200;
  if (globalThis.__FD_RUNTIME_SHELL_200__) return;

  const root = document.documentElement;
  root.dataset.fdBuild = String(BUILD);
  root.dataset.fdVersion = VERSION;

  const boot = globalThis.__FD_BOOT_200__;
  const state = {
    installed: false,
    launching: false,
    launchMode: null,
    launchCount: 0,
    lastError: null,
    installedAt: null,
    launchStartedAt: null,
    gameObservedAt: null,
    saveSourceKey: null,
    saveBackupKey: null,
    lastSavedAt: null,
    invalidSaveKeys: [],
    fallbackBridgeId: null,
    fallbackStartTick: null,
    fallbackObservedAt: null,
  };

  const debug = () => globalThis.__FD_DEBUG__;
  const selectedValue = (selector, key, fallback) =>
    document.querySelector(`${selector}.selected`)?.dataset?.[key] ||
    document.querySelector(selector)?.dataset?.[key] || fallback;

  const storageGet190 = (api, key) => {
    try {
      if (typeof api?.storageGet === 'function') return api.storageGet(key);
      return localStorage.getItem(key);
    } catch (_) {
      return null;
    }
  };

  const storageSet190 = (api, key, value) => {
    try {
      if (typeof api?.storageSet === 'function') return api.storageSet(key, value) !== false;
      localStorage.setItem(key, value);
      return true;
    } catch (_) {
      return false;
    }
  };

  const saveKeys190 = api => {
    const current = api?.SAVE_KEY || 'frontline-dominion-save-v5';
    const backup = `${current}-backup-build${BUILD}`;
    return {
      current,
      backup,
      candidates: [...new Set([
        current,
        backup,
        'frontline-dominion-save-v5',
        'frontline-dominion-save-v4',
        'frontline-dominion-save-v3',
        'frontline-dominion-save-v2',
        'frontline-dominion-save-v1',
        'frontline-dominion-save',
      ])],
    };
  };

  const parseSave190 = (raw, key = '') => {
    if (!raw || typeof raw !== 'string') return null;
    try {
      const data = JSON.parse(raw);
      if (!data || typeof data !== 'object') return null;
      const hasEntities = Array.isArray(data.entities) ||
        (Array.isArray(data.units) && Array.isArray(data.buildings));
      const hasTeams = data.teams && typeof data.teams === 'object';
      if (!hasEntities || !hasTeams) return null;
      return { raw, data, key };
    } catch (_) {
      return null;
    }
  };

  const findSavedGame190 = (api, migrate = true) => {
    const keys = saveKeys190(api);
    state.saveBackupKey = keys.backup;
    state.invalidSaveKeys = [];
    for (const key of keys.candidates) {
      const raw = storageGet190(api, key);
      if (!raw) continue;
      const parsed = parseSave190(raw, key);
      if (!parsed) {
        state.invalidSaveKeys.push(key);
        continue;
      }
      if (migrate && key !== keys.current) storageSet190(api, keys.current, raw);
      state.saveSourceKey = key;
      return { ...parsed, currentKey: keys.current, backupKey: keys.backup };
    }
    state.saveSourceKey = null;
    return null;
  };

  const preserveCurrentSave190 = api => {
    const keys = saveKeys190(api);
    const raw = storageGet190(api, keys.current);
    if (!parseSave190(raw, keys.current)) return null;
    storageSet190(api, keys.backup, raw);
    state.saveBackupKey = keys.backup;
    return raw;
  };

  const restorePreservedSave190 = api => {
    const keys = saveKeys190(api);
    const raw = storageGet190(api, keys.backup);
    if (!parseSave190(raw, keys.backup)) return false;
    const restored = storageSet190(api, keys.current, raw);
    boot?.setLoadAvailable?.(restored);
    return restored;
  };

  const showLaunchError = (text) => {
    state.lastError = String(text || 'Не удалось запустить игру');
    state.launching = false;
    state.launchMode = null;
    boot?.setLaunching?.(false);
    const available = Boolean(findSavedGame190(debug(), false));
    boot?.setLoadAvailable?.(available);
    const start = document.getElementById('start-screen');
    start?.classList.remove('hidden');
    console.error('[FD200] Launch error:', state.lastError);
    const alerts = document.getElementById('alerts');
    if (!alerts) return;
    alerts.querySelector('[data-fd-launch-error190]')?.remove();
    const message = document.createElement('div');
    message.className = 'alert danger';
    message.dataset.fdLaunchError190 = 'true';
    message.textContent = state.lastError;
    alerts.prepend(message);
    setTimeout(() => message.remove(), 9000);
  };

  let autosaveTimer190 = 0;
  let delayedAutosave190 = 0;
  const safeSave190 = (reason = 'periodic') => {
    const api = debug();
    const game = api?.game;
    if (!game || typeof game.save !== 'function' || state.launching) return false;
    const keys = saveKeys190(api);
    const previous = storageGet190(api, keys.current);
    if (parseSave190(previous, keys.current)) storageSet190(api, keys.backup, previous);
    try {
      const ok = game.save(false) !== false;
      const next = storageGet190(api, keys.current);
      if (!ok || !parseSave190(next, keys.current)) {
        if (parseSave190(previous, keys.current)) storageSet190(api, keys.current, previous);
        return false;
      }
      state.lastSavedAt = Date.now();
      boot?.setLoadAvailable?.(true);
      console.info('[FD200] Checkpoint saved:', reason);
      return true;
    } catch (error) {
      if (parseSave190(previous, keys.current)) storageSet190(api, keys.current, previous);
      console.warn('[FD200] Checkpoint save failed:', reason, error);
      return false;
    }
  };

  const configureAutosave190 = () => {
    clearInterval(autosaveTimer190);
    clearTimeout(delayedAutosave190);
    delayedAutosave190 = setTimeout(() => safeSave190('launch-checkpoint'), 1800);
    autosaveTimer190 = setInterval(() => safeSave190('periodic'), 30000);
  };

  const launchCoreReady190 = () => {
    const api = debug();
    const game = api?.game;
    if (!game) return { ready: false, failed: false, reason: 'game-object-missing' };
    const bridge = globalThis.__FD_STABLE_STATE165__?.bridge;
    if (bridge?.failed) {
      const tick = Number(game.simTick || 0);
      if (state.fallbackBridgeId !== bridge.id) {
        state.fallbackBridgeId = bridge.id;
        state.fallbackStartTick = tick;
        state.fallbackObservedAt = performance.now();
        return { ready: false, failed: false, reason: 'main-thread-fallback-starting' };
      }
      if (tick > Number(state.fallbackStartTick ?? tick)) {
        return { ready: true, failed: false, reason: 'main-thread-fallback' };
      }
      const stalled = performance.now() - Number(state.fallbackObservedAt || performance.now()) > 2500;
      return {
        ready: false,
        failed: stalled,
        reason: stalled ? (bridge.lastError || 'main-thread-fallback-stalled') : 'main-thread-fallback-starting',
      };
    }
    if (bridge) {
      const tick = Number(bridge.workerTick || 0);
      const ready = Boolean(bridge.ready && tick > 0);
      return {
        ready,
        failed: false,
        reason: ready ? null : (bridge.ready ? 'worker-not-ticking' : 'worker-not-ready'),
      };
    }
    const tick = Number(game.simTick || 0);
    const elapsed = performance.now() - Number(state.launchStartedAt || performance.now());
    return { ready: tick > 0 || elapsed > 1200, failed: false, reason: 'legacy-main-thread' };
  };

  const finishSuccessfulLaunch = () => {
    const readiness = launchCoreReady190();
    if (!readiness.ready) return readiness;
    const game = debug()?.game;
    if (!game) return { ready: false, failed: false, reason: 'game-object-missing' };
    state.gameObservedAt = performance.now();
    const start = document.getElementById('start-screen');
    start?.classList.add('hidden');
    if (start) {
      start.style.removeProperty('visibility');
      start.style.removeProperty('opacity');
      start.style.removeProperty('pointer-events');
    }
    boot?.stop?.();
    root.classList.remove('fd-loading200', 'fd-ready200');
    root.classList.add('fd-running200');
    state.launching = false;
    const mode = state.launchMode;
    state.launchMode = null;
    configureAutosave190();
    console.info(
      '[FD200] Stable game observed after launch',
      Math.round(state.gameObservedAt - (state.launchStartedAt || state.gameObservedAt)),
      'ms',
      mode,
    );
    return { ready: true, failed: false, reason: null };
  };

  const failLaunch190 = reason => {
    const api = debug();
    if (state.launchMode === 'saved') restorePreservedSave190(api);
    const detail = reason ? ` Причина: ${String(reason).slice(0, 260)}` : '';
    showLaunchError(`Игра не завершила загрузку, сохранение не удалено.${detail}`);
  };

  const verifyLaunch = (attempt = 0) => {
    const result = finishSuccessfulLaunch();
    if (result.ready) return;
    if (result.failed) {
      failLaunch190(result.reason);
      return;
    }
    if (attempt < 300) {
      setTimeout(() => verifyLaunch(attempt + 1), 50);
      return;
    }
    failLaunch190(result.reason || 'истёк контрольный интервал запуска');
  };

  const beginLaunch190 = mode => {
    const api = debug();
    preserveCurrentSave190(api);
    state.launching = true;
    state.launchMode = mode;
    state.launchCount += 1;
    state.launchStartedAt = performance.now();
    state.lastError = null;
    state.fallbackBridgeId = null;
    state.fallbackStartTick = null;
    state.fallbackObservedAt = null;
    boot?.setLaunching?.(true);
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
    beginLaunch190('new');
    const options = {
      faction: selectedValue('[data-faction]', 'faction', 'vanguard'),
      difficulty: selectedValue('[data-difficulty]', 'difficulty', 'normal'),
    };
    console.info('[FD200] Starting new game', options);
    try {
      api.startGame(options);
      verifyLaunch();
    } catch (error) {
      console.error('[FD200] startGame threw', error);
      showLaunchError(error?.stack || error?.message || error);
    }
  };

  const launchSavedGame = (event) => {
    event?.preventDefault?.();
    event?.stopImmediatePropagation?.();
    if (state.launching) return;
    const api = debug();
    if (typeof api?.startGame !== 'function') {
      showLaunchError('Игровое ядро ещё не готово.');
      return;
    }
    const candidate = findSavedGame190(api, true);
    if (!candidate) {
      boot?.setLoadAvailable?.(false);
      showLaunchError('Рабочее сохранение на этом адресе не найдено. Повреждённые записи сохранены и не удалены.');
      return;
    }
    preserveCurrentSave190(api);
    beginLaunch190('saved');
    console.info('[FD200] Starting saved game from', candidate.key);
    try {
      api.startGame({
        loadData: candidate.data,
        faction: candidate.data.teams?.player?.faction || 'vanguard',
        difficulty: candidate.data.difficultyKey || 'normal',
      });
      verifyLaunch();
    } catch (error) {
      console.error('[FD200] saved start threw', error);
      restorePreservedSave190(api);
      showLaunchError(`Сохранение не запустилось, но было сохранено без удаления: ${error?.message || error}`);
    }
  };

  const install = () => {
    if (state.installed) return true;
    const api = debug();
    let startButton = document.getElementById('start-game');
    let loadButton = document.getElementById('load-game');
    if (typeof api?.startGame !== 'function' || !startButton || !loadButton) return false;

    // Historical builds registered their own start/load handlers before the
    // canonical runtime shell. Replace both nodes once so a saved-game click
    // cannot be intercepted and converted into a new game by an older owner.
    const cleanStart = startButton.cloneNode(true);
    const cleanLoad = loadButton.cloneNode(true);
    cleanStart.removeAttribute('onclick');
    cleanLoad.removeAttribute('onclick');
    startButton.replaceWith(cleanStart);
    loadButton.replaceWith(cleanLoad);
    startButton = cleanStart;
    loadButton = cleanLoad;
    startButton.addEventListener('click', launchNewGame, { capture: true });
    loadButton.addEventListener('click', launchSavedGame, { capture: true });

    const candidate = findSavedGame190(api, true);
    boot?.setLoadAvailable?.(Boolean(candidate));
    state.installed = true;
    state.installedAt = performance.now();
    boot?.setReady?.(true);
    startButton.disabled = false;
    loadButton.disabled = !candidate;
    startButton.setAttribute('aria-disabled', 'false');
    loadButton.setAttribute('aria-disabled', candidate ? 'false' : 'true');
    console.info('[FD200] Canonical launch/save owner ready', {
      loadAvailable: Boolean(candidate),
      saveSource: candidate?.key || null,
      invalidSaveKeys: [...state.invalidSaveKeys],
    });
    return true;
  };

  addEventListener('pagehide', () => safeSave190('pagehide'));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') safeSave190('visibility-hidden');
  });

  let attempts = 0;
  const timer = setInterval(() => {
    attempts += 1;
    if (install() || attempts >= 500) {
      clearInterval(timer);
      if (!state.installed) showLaunchError('Не удалось подготовить кнопки запуска и загрузки.');
    }
  }, 25);
  install();

  globalThis.__FD_RUNTIME_SHELL_200__ = {
    version: VERSION,
    build: BUILD,
    state,
    install,
    launchNewGame,
    launchSavedGame,
    findSavedGame: () => findSavedGame190(debug(), false),
    saveNow: safeSave190,
  };
})();
