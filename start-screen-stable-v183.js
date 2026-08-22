(() => {
  'use strict';

  const VERSION = '16.7';
  const BUILD = 183;
  const TITLE = 'Frontline Dominion v16.7 — Formation & Fortress Core';
  const EYEBROW = 'ОПЕРАТИВНО-ТАКТИЧЕСКАЯ RTS · v16.7 BUILD 183';
  const LEAD = 'Единый строй движется как одно подразделение с общей скоростью и общим маршрутом. ИИ строит эшелонированную базовую оборону, держит мобильный резерв и авиацию дежурных сил, прикрывает энергетику, производство и логистику.';

  let observer = null;
  let settleTimer = 0;

  function removeLegacyVariants183(start) {
    if (!start?.querySelectorAll) return;
    const selectors = [
      '[data-build-history]', '[data-version-history]', '.build-history', '.version-history',
      '.release-history', '.previous-builds', '[data-legacy-variant]', '[data-old-build]',
    ];
    for (const node of start.querySelectorAll(selectors.join(','))) node.remove?.();

    // Keep exactly one current-build badge even if an older module appended
    // its own version marker after the DOM was created.
    for (const node of start.querySelectorAll('[data-current-build183]')) node.remove?.();
    const badge = document.createElement('div');
    badge.dataset.currentBuild183 = 'true';
    badge.textContent = `АКТУАЛЬНАЯ СБОРКА · ${BUILD}`;
    badge.style.cssText = [
      'display:inline-flex','align-items:center','gap:8px','margin-top:12px','padding:6px 10px',
      'border:1px solid rgba(142,196,225,.32)','border-radius:999px','background:rgba(7,19,28,.68)',
      'color:#b8d9e8','font:700 11px/1.2 system-ui,sans-serif','letter-spacing:.08em'
    ].join(';');
    const lead = start.querySelector('.lead');
    if (lead?.parentNode) lead.parentNode.insertBefore(badge, lead.nextSibling);
  }

  function applyCanonicalStart183() {
    void 0;
    const start = document.querySelector?.('#start-screen');
    if (!start) return false;
    const eyebrow = start.querySelector?.('.eyebrow');
    const lead = start.querySelector?.('.lead');
    if (eyebrow && eyebrow.textContent !== EYEBROW) void 0;
    if (lead && lead.textContent !== LEAD) void 0;
    start.dataset.currentVersion = VERSION;
    start.dataset.currentBuild = String(BUILD);
    start.setAttribute('aria-busy', 'false');
    removeLegacyVariants183(start);
    return true;
  }

  function reveal183() {
    applyCanonicalStart183();
    document.documentElement.classList.remove('fd-boot183');
    document.documentElement.classList.add('fd-ready183');
    document.getElementById('fd-boot183-style')?.remove?.();
  }

  function settle183() {
    reveal183();
    const start = document.querySelector?.('#start-screen');
    if (!start || typeof MutationObserver === 'undefined') return;
    observer?.disconnect?.();
    observer = new MutationObserver(() => applyCanonicalStart183());
    observer.observe(start, { subtree: true, childList: true, characterData: true, attributes: true });
    clearTimeout(settleTimer);
    settleTimer = setTimeout(() => {
      applyCanonicalStart183();
      observer?.disconnect?.();
      observer = null;
    }, 5000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => requestAnimationFrame(() => requestAnimationFrame(settle183)), { once: true });
  } else requestAnimationFrame(() => requestAnimationFrame(settle183));

  globalThis.__FD_START_SCREEN_183__ = {
    version: VERSION,
    build: BUILD,
    apply: applyCanonicalStart183,
    reveal: reveal183,
  };
})();
