(() => {
  'use strict';

  if (typeof document === 'undefined') return;
  const root = globalThis;
  if (root.__FD_PERFORMANCE_194__) return;

  const VERSION = '16.8.10';
  const BUILD = 194;
  const SAMPLE_LIMIT = 360;
  const LOOP_INTERVAL = 50;
  const MAX_RENDER_STRESS = 1600;

  const rafSamples = [];
  const loopSamples = [];
  const snapshotSamples = [];
  const uiSamples = [];
  const longTaskSamples = [];

  const state = {
    installed: false,
    installedAt: performance.now(),
    gameHooksInstalledAt: null,
    rafFrames: 0,
    measuredFrames: 0,
    longFrames33: 0,
    longFrames50: 0,
    longFrames100: 0,
    eventLoopSamples: 0,
    eventLoopStalls50: 0,
    snapshotCalls: 0,
    uiCalls: 0,
    longTasks: 0,
    stressEnabled: false,
    stressTarget: 0,
    stressInjected: 0,
    lastStressInjected: 0,
    lastError: null,
  };

  const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const push = (list, value) => {
    if (!Number.isFinite(value)) return;
    list.push(value);
    if (list.length > SAMPLE_LIMIT) list.splice(0, list.length - SAMPLE_LIMIT);
  };
  const quantile = (list, q) => {
    if (!list.length) return 0;
    const sorted = [...list].sort((a, b) => a - b);
    const index = Math.max(0, Math.min(sorted.length - 1, Math.ceil((sorted.length - 1) * q)));
    return sorted[index];
  };
  const summarize = list => ({
    samples: list.length,
    averageMs: list.length ? list.reduce((sum, value) => sum + value, 0) / list.length : 0,
    p95Ms: quantile(list, .95),
    p99Ms: quantile(list, .99),
    maxMs: list.length ? Math.max(...list) : 0,
    lastMs: list.length ? list[list.length - 1] : 0,
  });

  const gameRunning = () => {
    const game = root.__FD_DEBUG__?.game;
    if (!game) return false;
    const start = document.getElementById('start-screen');
    return !start || start.classList.contains('hidden');
  };

  function injectRenderStress(snapshot) {
    if (!state.stressEnabled || !snapshot?.units || !Array.isArray(snapshot.units)) {
      state.lastStressInjected = 0;
      return snapshot;
    }
    const source = snapshot.units.filter(unit => unit?.alive !== false && !String(unit?.id || '').startsWith('fd194-stress-'));
    if (!source.length) {
      state.lastStressInjected = 0;
      return snapshot;
    }
    const requested = Math.max(0, Math.min(MAX_RENDER_STRESS, Math.round(state.stressTarget)));
    const need = Math.max(0, requested - source.length);
    if (!need) {
      state.lastStressInjected = 0;
      return snapshot;
    }
    const clones = [];
    for (let index = 0; index < need; index += 1) {
      const base = source[index % source.length];
      const ring = 1 + Math.floor(index / Math.max(1, source.length));
      const slot = index % Math.max(1, source.length);
      const angle = (slot * 2.399963229728653) + ring * .13;
      const radius = 34 + (index % 29) * 11 + ring * 7;
      clones.push({
        ...base,
        id: `fd194-stress-${index}-${base.id || 'unit'}`,
        x: finite(base.x) + Math.cos(angle) * radius,
        y: finite(base.y) + Math.sin(angle) * radius,
        selected: false,
        hovered: false,
        renderOnly194: true,
      });
    }
    snapshot.units.push(...clones);
    state.stressInjected += clones.length;
    state.lastStressInjected = clones.length;
    return snapshot;
  }

  function wrapTimedMethod(proto, name, samples, counterKey, options = {}) {
    const original = proto?.[name];
    if (typeof original !== 'function' || original.__fdPerf194Wrapped) return false;
    const wrapped = function(...args) {
      const started = performance.now();
      try {
        const value = original.apply(this, args);
        return options.after ? options.after.call(this, value) : value;
      } finally {
        push(samples, performance.now() - started);
        state[counterKey] += 1;
      }
    };
    Object.defineProperty(wrapped, '__fdPerf194Wrapped', { value: true });
    Object.defineProperty(wrapped, '__fdPerf194Original', { value: original });
    proto[name] = wrapped;
    return true;
  }

  function installGameHooks() {
    const Game = root.__FD_DEBUG__?.Game;
    if (!Game?.prototype) return false;
    const proto = Game.prototype;
    let changed = false;
    changed = wrapTimedMethod(proto, 'buildRenderSnapshotV9', snapshotSamples, 'snapshotCalls', {
      after: injectRenderStress,
    }) || changed;
    changed = wrapTimedMethod(proto, 'updateUI', uiSamples, 'uiCalls') || changed;
    if (changed || proto.buildRenderSnapshotV9?.__fdPerf194Wrapped || proto.updateUI?.__fdPerf194Wrapped) {
      state.installed = true;
      state.gameHooksInstalledAt ||= performance.now();
      return true;
    }
    return false;
  }

  let previousRaf = 0;
  function rafLoop(now) {
    requestAnimationFrame(rafLoop);
    state.rafFrames += 1;
    if (!gameRunning()) {
      previousRaf = now;
      installGameHooks();
      return;
    }
    if (previousRaf > 0) {
      const delta = now - previousRaf;
      push(rafSamples, delta);
      state.measuredFrames += 1;
      if (delta > 33.4) state.longFrames33 += 1;
      if (delta > 50) state.longFrames50 += 1;
      if (delta > 100) state.longFrames100 += 1;
    }
    previousRaf = now;
    installGameHooks();
  }

  let nextLoopAt = performance.now() + LOOP_INTERVAL;
  const loopTimer = setInterval(() => {
    const now = performance.now();
    const drift = Math.max(0, now - nextLoopAt);
    nextLoopAt = now + LOOP_INTERVAL;
    if (!gameRunning()) return;
    push(loopSamples, drift);
    state.eventLoopSamples += 1;
    if (drift > 50) state.eventLoopStalls50 += 1;
  }, LOOP_INTERVAL);

  let longTaskObserver = null;
  try {
    if (typeof PerformanceObserver !== 'undefined' && PerformanceObserver.supportedEntryTypes?.includes?.('longtask')) {
      longTaskObserver = new PerformanceObserver(list => {
        if (!gameRunning()) return;
        for (const entry of list.getEntries()) {
          push(longTaskSamples, finite(entry.duration));
          state.longTasks += 1;
        }
      });
      longTaskObserver.observe({ entryTypes: ['longtask'] });
    }
  } catch (error) {
    state.lastError = String(error?.message || error);
  }

  function workerSnapshot() {
    const bridge = root.__FD_STABLE_STATE165__?.bridge;
    const perf = bridge?.workerPerformance || {};
    return {
      tick: finite(bridge?.workerTick),
      averageTickMs: finite(perf.averageTickMs),
      maxTickMs: finite(perf.maxTickMs),
      snapshotBytes: finite(perf.snapshotBytes),
      actionErrors: finite(bridge?.actionErrors),
      failed: Boolean(bridge?.failed),
      transport: bridge?.transportMode165 || root.__FD_STABLE_STATE165__?.transport || 'unknown',
      lastAck: finite(bridge?.lastAck),
      seq: finite(bridge?.seq),
    };
  }

  function snapshot() {
    const raf = summarize(rafSamples);
    const eventLoop = summarize(loopSamples);
    const renderSnapshot = summarize(snapshotSamples);
    const updateUI = summarize(uiSamples);
    const longTask = summarize(longTaskSamples);
    return {
      version: VERSION,
      build: BUILD,
      active: gameRunning(),
      installed: state.installed,
      raf: {
        ...raf,
        frames: state.measuredFrames,
        over33ms: state.longFrames33,
        over50ms: state.longFrames50,
        over100ms: state.longFrames100,
      },
      eventLoop: {
        ...eventLoop,
        samplesTotal: state.eventLoopSamples,
        stallsOver50ms: state.eventLoopStalls50,
      },
      renderSnapshot: {
        ...renderSnapshot,
        calls: state.snapshotCalls,
      },
      updateUI: {
        ...updateUI,
        calls: state.uiCalls,
      },
      longTask: {
        ...longTask,
        count: state.longTasks,
        supported: Boolean(longTaskObserver),
      },
      worker: workerSnapshot(),
      stress: {
        enabled: state.stressEnabled,
        target: state.stressTarget,
        injectedTotal: state.stressInjected,
        lastInjected: state.lastStressInjected,
        maxTarget: MAX_RENDER_STRESS,
      },
      lastError: state.lastError,
    };
  }

  function reset() {
    rafSamples.length = 0;
    loopSamples.length = 0;
    snapshotSamples.length = 0;
    uiSamples.length = 0;
    longTaskSamples.length = 0;
    state.measuredFrames = 0;
    state.longFrames33 = 0;
    state.longFrames50 = 0;
    state.longFrames100 = 0;
    state.eventLoopSamples = 0;
    state.eventLoopStalls50 = 0;
    state.snapshotCalls = 0;
    state.uiCalls = 0;
    state.longTasks = 0;
    state.stressInjected = 0;
    state.lastStressInjected = 0;
    previousRaf = performance.now();
  }

  function enableRenderStress(target = 600) {
    state.stressTarget = Math.max(0, Math.min(MAX_RENDER_STRESS, Math.round(finite(target, 600))));
    state.stressEnabled = state.stressTarget > 0;
    return state.stressEnabled;
  }

  function disableRenderStress() {
    state.stressEnabled = false;
    state.stressTarget = 0;
    state.lastStressInjected = 0;
  }

  root.__FD_PERFORMANCE_194__ = {
    version: VERSION,
    build: BUILD,
    state,
    snapshot,
    reset,
    enableRenderStress,
    disableRenderStress,
    installGameHooks,
    dispose() {
      clearInterval(loopTimer);
      try { longTaskObserver?.disconnect?.(); } catch (_) {}
    },
  };

  installGameHooks();
  requestAnimationFrame(rafLoop);
})();
