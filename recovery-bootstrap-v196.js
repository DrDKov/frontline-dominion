(() => {
  'use strict';

  const root = globalThis;
  if (typeof document === 'undefined' || root.__FD_RECOVERY_BOOTSTRAP_196__) return;

  const VERSION = '16.8.12';
  const BUILD = 196;
  const state = {
    attempts: 0,
    injections: 0,
    installedOwners: 0,
    completed: false,
    timedOut: false,
    lastMissing: [],
    lastInjected: null,
  };

  const owners = [
    {
      global: '__FD_FORMATION_OBSTACLE_RECOVERY_196__',
      file: 'formation-obstacle-recovery-v196.js',
      ready: () => Boolean(root.__FD_DEBUG__?.Game?.prototype && root.__FD_DEBUG__?.Unit?.prototype),
    },
    {
      global: '__FD_POST_LOAD_COMMAND_RECOVERY_196__',
      file: 'post-load-command-recovery-v196.js',
      ready: () => Boolean(root.__FD_DEBUG__?.Game?.prototype),
    },
    {
      global: '__FD_BUILDING_SELECTION_OWNER_196__',
      file: 'building-selection-owner-v196.js',
      ready: () => Boolean(root.__FD_DEBUG__?.Game?.prototype),
    },
  ];

  const injected = new Set();
  const inject = owner => {
    if (!owner || injected.has(owner.global) || root[owner.global] || !owner.ready()) return false;
    injected.add(owner.global);
    const script = document.createElement('script');
    script.async = false;
    script.dataset.fdRecoveryRetry196 = owner.global;
    script.src = `./${owner.file}?build=${BUILD}&retry=${state.attempts}`;
    script.addEventListener('load', () => {
      injected.delete(owner.global);
      if (root[owner.global]) state.installedOwners += 1;
    }, { once: true });
    script.addEventListener('error', () => injected.delete(owner.global), { once: true });
    (document.head || document.documentElement).appendChild(script);
    state.injections += 1;
    state.lastInjected = owner.global;
    return true;
  };

  let timer = 0;
  const inspect = () => {
    state.attempts += 1;
    const missing = owners.filter(owner => !root[owner.global]);
    state.lastMissing = missing.map(owner => owner.global);
    if (!missing.length) {
      state.completed = true;
      if (timer) clearInterval(timer);
      return true;
    }
    for (const owner of missing) inject(owner);
    if (state.attempts >= 240) {
      state.timedOut = true;
      if (timer) clearInterval(timer);
    }
    return false;
  };

  root.__FD_RECOVERY_BOOTSTRAP_196__ = {
    version: VERSION,
    build: BUILD,
    state,
    inspect,
  };

  inspect();
  if (!state.completed && !state.timedOut) timer = setInterval(inspect, 25);
})();
