(() => {
  'use strict';

  const VERSION = '16.5';
  const BUILD = 179;
  let visible = false;
  let root = null;
  let raf = 0;
  let lastPaint = 0;

  const fmt = (value, digits = 2) => Number.isFinite(Number(value)) ? Number(value).toFixed(digits) : '—';
  const int = value => Number.isFinite(Number(value)) ? Math.round(Number(value)).toLocaleString('ru-RU') : '—';
  const kb = value => Number.isFinite(Number(value)) ? `${(Number(value) / 1024).toFixed(1)} KB` : '—';

  function ensureRoot() {
    if (root && root.isConnected) return root;
    root = document.createElement('div');
    root.id = 'fd-profiler-v165';
    root.style.cssText = [
      'position:fixed','left:12px','top:58px','z-index:2147483646','min-width:330px',
      'max-width:440px','padding:12px 14px','border:1px solid rgba(130,180,220,.38)',
      'border-radius:8px','background:rgba(5,12,18,.92)','color:#d9edf8','font:12px/1.45 ui-monospace,SFMono-Regular,Consolas,monospace',
      'box-shadow:0 10px 30px rgba(0,0,0,.4)','pointer-events:none','white-space:pre'
    ].join(';');
    document.body.appendChild(root);
    return root;
  }

  function snapshot() {
    const state = window.__FD_STABLE_STATE165__;
    const bridge = state?.bridge;
    const perf = bridge?.workerPerformance || {};
    const game = bridge?.game || window.__FD_DEBUG__?.game || null;
    const counts = state?.counts || {};
    return {
      state, bridge, perf, game, counts,
      transport: bridge?.transportMode165 || state?.transport || 'unknown',
      tick: bridge?.workerTick ?? game?.simTick,
      units: counts.units ?? game?.units?.length,
      buildings: counts.buildings ?? game?.buildings?.length,
      projectiles: counts.projectiles ?? game?.projectiles?.length,
      companies: game?.companies164?.size ?? game?.companyState164?.size ?? null,
      applyMs: bridge?.lastApplyMs165,
      latencyMs: bridge?.lastSnapshotLatency165,
      buildingSeq: bridge?.buildingStateSequence165,
      minimapSeq: bridge?.minimapStateSequence165,
      buildingBytes: bridge?.buildingBytes165,
      minimapBytes: bridge?.minimapBytes165,
      sharedFallbacks: bridge?.sharedFallbacks165,
    };
  }

  function render(now) {
    raf = requestAnimationFrame(render);
    if (!visible || now - lastPaint < 180) return;
    lastPaint = now;
    const s = snapshot();
    const p = s.perf || {};
    const lines = [
      `SIMULATION PROFILER · v${VERSION} build ${BUILD}`,
      `Transport             ${s.transport}`,
      `Tick                  ${int(s.tick)}`,
      `Worker avg / max      ${fmt(p.averageTickMs)} / ${fmt(p.maxTickMs)} ms`,
      `Main apply            ${fmt(s.applyMs)} ms`,
      `Worker→main latency   ${fmt(s.latencyMs)} ms`,
      `Hot snapshot          ${kb(p.snapshotBytes)}`,
      `Building delta        ${kb(s.buildingBytes)} · seq ${int(s.buildingSeq)}`,
      `Minimap/FOW state     ${kb(s.minimapBytes)} · seq ${int(s.minimapSeq)}`,
      `Units                 ${int(s.units)}`,
      `Buildings             ${int(s.buildings)}`,
      `Projectiles           ${int(s.projectiles)}`,
      `Companies             ${int(s.companies)}`,
      `Shared fallbacks      ${int(s.sharedFallbacks)}`,
      '',
      s.transport === 'shared-triple'
        ? 'Stable frame: SAB triple buffer + Atomics'
        : 'Stable frame: transferable fallback (Pages lacks COOP/COEP)',
      'F10 · скрыть профилировщик'
    ];
    ensureRoot().textContent = lines.join('\n');
  }

  addEventListener('keydown', event => {
    if (event.code !== 'F10') return;
    event.preventDefault();
    visible = !visible;
    const node = ensureRoot();
    node.style.display = visible ? 'block' : 'none';
  }, true);

  window.__FD_PROFILER165__ = {
    version: VERSION,
    build: BUILD,
    show() { visible = true; ensureRoot().style.display = 'block'; },
    hide() { visible = false; if (root) root.style.display = 'none'; },
    snapshot
  };

  raf = requestAnimationFrame(render);
})();