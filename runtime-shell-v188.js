'use strict';
(() => {
  const VERSION = '16.8.4';
  const BUILD = 188;
  if (globalThis.__FD_RUNTIME_SHELL_188__) return;

  const root = document.documentElement;
  root.classList.remove('fd-boot183', 'fd-ready183');
  root.dataset.fdBuild = String(BUILD);

  const ownMetadata = () => {
    void 0;
    const eyebrow = document.querySelector('#start-screen .eyebrow');
    if (eyebrow) void 0;
  };

  const revealStart = () => {
    const start = document.getElementById('start-screen');
    if (!start || globalThis.__FD_DEBUG__?.game) return;
    start.classList.remove('hidden');
    start.style.visibility = 'visible';
    start.style.opacity = '1';
    start.style.pointerEvents = 'auto';
    const button = document.getElementById('start-game');
    if (button) button.disabled = false;
  };

  ownMetadata();
  revealStart();

  const button = document.getElementById('start-game');
  if (button) button.addEventListener('click', () => {
    const start = document.getElementById('start-screen');
    if (start) {
      start.style.removeProperty('visibility');
      start.style.removeProperty('opacity');
      start.style.removeProperty('pointer-events');
    }
  }, { once: true, capture: true });

  globalThis.__FD_RUNTIME_SHELL_188__ = {
    version: VERSION,
    build: BUILD,
    revealStart,
    ownMetadata,
  };
})();
