(() => {
  'use strict';

  const VERSION = '16.8.21';
  const BUILD = 205;
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
    root.id = 'fd-profiler-v166';
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
      state, bridge, perf, game, counts, combat: perf.combat166 || game?.combatScaleDiagnostics166?.() || {}, deep: perf.deep182 || game?.deepOperationsDiagnostics182?.() || {}, formation: perf.formation183 || game?.formationMarchDiagnostics183?.() || {}, fortress: perf.fortress183 || game?.fortressDefenseDiagnostics183?.() || {}, action: perf.action184 || game?.actionGroupDiagnostics184?.() || {}, objective: perf.objective184 || game?.constructionVictoryDiagnostics184?.() || {},
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
      performance194: window.__FD_PERFORMANCE_194__?.snapshot?.() || {},
      lod195: window.__FD_ADAPTIVE_LOD_195__?.diagnostics?.() || {},
    };
  }

  function render(now) {
    raf = requestAnimationFrame(render);
    if (!visible || now - lastPaint < 180) return;
    lastPaint = now;
    const s = snapshot();
    const p = s.perf || {};
    const d = s.deep || {};
    const dm = d.metrics || {};
    const op = (d.operations || []).find(item => item.phase !== 'complete') || (d.operations || [])[0] || {};
    const fm = s.formation || {};
    const ft = s.fortress || {};
    const ftm = ft.metrics || {};
    const ag = s.action || {};
    const ob = s.objective || {};
    const p194 = s.performance194 || {};
    const lod = s.lod195 || {};
    const lines = [
      `SIMULATION PROFILER · v${VERSION} build ${BUILD}`,
      `Transport             ${s.transport}`,
      `Tick                  ${int(s.tick)}`,
      `Worker avg / max      ${fmt(p.averageTickMs)} / ${fmt(p.maxTickMs)} ms`,
      `Frame avg / p95       ${fmt(p194.raf?.averageMs)} / ${fmt(p194.raf?.p95Ms)} ms`,
      `Frame p99 / max       ${fmt(p194.raf?.p99Ms)} / ${fmt(p194.raf?.maxMs)} ms`,
      `Event-loop p95 / max  ${fmt(p194.eventLoop?.p95Ms)} / ${fmt(p194.eventLoop?.maxMs)} ms`,
      `Render snapshot p95   ${fmt(p194.renderSnapshot?.p95Ms)} ms · calls ${int(p194.renderSnapshot?.calls)}`,
      `Long frames >50/>100  ${int(p194.raf?.over50ms)} / ${int(p194.raf?.over100ms)}`,
      `Visual LOD             ${lod.tierName || '—'} · tier ${int(lod.tier)} · budget ${int(lod.budget)}`,
      `LOD detail/omitted     ${int(lod.detailedUnits)} / ${int(lod.omittedUnits)} · clusters ${int(lod.clusters)}`,
      `LOD pressure           ${lod.pressureReason || '—'} · changes ${int(lod.tierChanges)} · ${fmt(lod.lastLodMs)} ms`,
      `Main apply            ${fmt(s.applyMs)} ms`,
      `Worker→main latency   ${fmt(s.latencyMs)} ms`,
      `Hot snapshot          ${kb(p.snapshotBytes)}`,
      `Building delta        ${kb(s.buildingBytes)} · seq ${int(s.buildingSeq)}`,
      `Minimap/FOW state     ${kb(s.minimapBytes)} · seq ${int(s.minimapSeq)}`,
      `Units                 ${int(s.units)}`,
      `Buildings             ${int(s.buildings)}`,
      `Projectiles           ${int(s.projectiles)}`,
      `Combat cells          ${int(s.combat?.combatCells)} · indexed ${int(s.combat?.indexedUnits)}`,
      `Target queries        ${int(s.combat?.targetQueries)} · cache ${int(s.combat?.targetCacheHits)}`,
      `Fire-control groups   ${int(s.combat?.fireControlBuilds)} · reused ${int(s.combat?.fireControlHits)}`,
      `Candidate checks      ${int(s.combat?.candidateChecks)} · fallback ${int(s.combat?.fallbackQueries)}`,
      `Virtual small arms    ${int(s.combat?.virtualShots)} · hits ${int(s.combat?.virtualHits)}`,
      `Projectiles avoided   ${int(s.combat?.physicalProjectilesAvoided)}`,
      `Damage events/batches ${int(s.combat?.damageEvents)} / ${int(s.combat?.damageBatches)}`,
      `Combat ms last        cell ${fmt(s.combat?.lastIndexMs)} · target ${fmt(s.combat?.lastTargetingMs)} · batch ${fmt(s.combat?.lastBatchMs)}`,
      `Operational AI        ${int(d.activeOperations)} op · ${op.phase || 'idle'} · ${op.purpose || '—'}`,
      `Recon / defense       ${fmt(op.reconScore)} / ${fmt(d.defenseScore)}`,
      `Shaping / breach      ${fmt(op.shapingReduction)} / ${fmt(op.breachProgress)} · losses ${fmt(op.breachCasualties)}`,
      `Defensive reserve     ${int(d.defensiveReserve)} / ${int(d.desiredReserve)} · built ${int(dm.defensiveBuildings)}`,
      `Operations            plan ${int(dm.operationsPlanned)} · done ${int(dm.operationsCompleted)} · abort ${int(dm.operationsAborted)}`,
      `Formation march       ${int(fm.activeGroups)} groups · ${int(fm.activeMembers)} units · ${fmt(fm.lastSharedSpeed, 1)} speed`,
      `Formation batches     ${int(fm.sharedSteps)} · individual avoided ${int(fm.individualMovementAvoided)}`,
      `Formation cohesion    max ${fmt(fm.maxCohesionError, 1)} · regroup ${int(fm.regroupFrames)} · blocked ${int(fm.blockedFrames)}`,
      `Fortress readiness    ${fmt(ft.score)} · threat ${int(ft.threatLevel)} · protected ${int(ft.protectedAssets)}/${int(ft.criticalAssets)}`,
      `Fortress reserve/CAP  ${int(ft.reserve)}/${int(ft.desiredReserve)} · ${int(ft.cap)}/${int(ft.desiredCap)}`,
      `Fortifications        ${int(ftm.fortificationsBuilt)} · missile ${int(ftm.missileComplexesBuilt)} · AA ${int(ftm.aaBuilt)} · air queued ${int(ftm.aircraftQueued)}`,
      `Action groups         ${int(ag.groups)} groups · ${int(ag.members)} units · patrol ${int(ag.patrolGroups)}`,
      `Group work avoided    update ${int(ag.individualUpdatesAvoided)} · path ${int(ag.individualPathfindAvoided)} · render ${int(ag.renderMembersAvoided)}`,
      `Offscreen / combat    ${int(ag.offscreenSteps)} macro steps · ${int(ag.exactCombatSteps)} exact · ${fmt(ag.lastStepMs)} ms`,
      `Construction pending  ${int(ob.pending)}/${int(ob.caps?.global)} · sensors ${int(ob.pendingSensors)} · rejected ${int(ob.constructionRejected)}`,
      `Victory objective     capture-command-center · winner ${ob.winner || '—'}`,
      `Companies             ${int(s.companies)}`,
      `Shared fallbacks      ${int(s.sharedFallbacks)}`,
      '',
      s.transport === 'shared-triple'
        ? 'Stable state: SAB triple buffer + Atomics'
        : 'Stable state: transferable fallback (Pages lacks COOP/COEP)',
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

  window.__FD_PROFILER166__ = {
    version: VERSION,
    build: BUILD,
    show() { visible = true; ensureRoot().style.display = 'block'; },
    hide() { visible = false; if (root) root.style.display = 'none'; },
    snapshot
  };

  raf = requestAnimationFrame(render);
})();