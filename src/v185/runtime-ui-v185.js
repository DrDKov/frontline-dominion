(() => {
  'use strict';
  if (typeof document === 'undefined') return;
  const root = globalThis;
  const D = root.__FD_DEBUG__;
  const Game = D?.Game;
  if (!Game) return;

  const VERSION = '16.8.1';
  const BUILD = 185;
  const TITLE = 'Frontline Dominion v16.8.1 — Runtime Isolation';
  const EYEBROW = 'ОПЕРАТИВНО-ТАКТИЧЕСКАЯ RTS · v16.8.1 BUILD 185';
  const LEAD = 'Action Group и захват командного центра считаются только authoritative Worker. Главный поток отвечает за интерфейс и облегчённое отображение больших групп.';

  const finite = (v, fallback = 0) => Number.isFinite(Number(v)) ? Number(v) : fallback;
  const q = (v, step = 180) => Math.round(finite(v) / step);
  const GROUP_COMMANDS = new Set(['move', 'attackMove', 'patrol']);
  const renderMetrics = { omitted: 0, clusters: 0, frames: 0 };

  function applyStart() {
    document.title = TITLE;
    const start = document.querySelector('#start-screen');
    if (!start) return false;
    const eyebrow = start.querySelector('.eyebrow');
    const lead = start.querySelector('.lead');
    if (eyebrow) eyebrow.textContent = EYEBROW;
    if (lead) lead.textContent = LEAD;
    start.dataset.currentVersion = VERSION;
    start.dataset.currentBuild = String(BUILD);
    start.setAttribute('aria-busy', 'false');
    for (const node of start.querySelectorAll('[data-build-history],[data-version-history],.build-history,.version-history,.release-history,.previous-builds,[data-legacy-variant],[data-old-build],[data-current-build183]')) node.remove?.();
    if (!start.querySelector('[data-current-build185]')) {
      const badge = document.createElement('div');
      badge.dataset.currentBuild185 = 'true';
      badge.textContent = `АКТУАЛЬНАЯ СБОРКА · ${BUILD}`;
      badge.style.cssText = ['display:inline-flex','align-items:center','margin-top:12px','padding:6px 10px','border:1px solid rgba(142,196,225,.32)','border-radius:999px','background:rgba(7,19,28,.68)','color:#b8d9e8','font:700 11px/1.2 system-ui,sans-serif','letter-spacing:.08em'].join(';');
      lead?.insertAdjacentElement?.('afterend', badge);
    }
    document.documentElement.classList.remove('fd-boot183');
    document.documentElement.classList.add('fd-ready183');
    document.getElementById('fd-boot183-style')?.remove?.();
    return true;
  }

  function scheduleStart() {
    for (const delay of [0, 80, 320, 1000, 2200]) setTimeout(applyStart, delay);
  }

  const commandKey = unit => {
    const c = unit?.currentCommand;
    if (!c || !GROUP_COMMANDS.has(c.type)) return null;
    const fx = c.formationGroupId || c.formationId;
    if (fx) return `${unit.team}|formation|${fx}|${c.type}`;
    if (c.type === 'patrol') return `${unit.team}|patrol|${q(c.ax)}:${q(c.ay)}|${q(c.bx ?? c.x)}:${q(c.by ?? c.y)}`;
    return `${unit.team}|${c.type}|${q(c.x)}:${q(c.y)}|${Math.floor(unit.x / 1200)}:${Math.floor(unit.y / 1200)}`;
  };

  const baseSnapshot = Game.prototype.buildRenderSnapshotV9;
  if (typeof baseSnapshot === 'function' && !baseSnapshot._v185RenderIsolated) {
    const wrapped = function(alpha) {
      const snapshot = baseSnapshot.call(this, alpha);
      if (!snapshot?.units?.length) return snapshot;
      const groups = new Map();
      const passthrough = [];
      for (const unit of snapshot.units) {
        if (!unit?.alive || unit.air || unit.embarkedIn) { passthrough.push(unit); continue; }
        const key = commandKey(unit);
        if (!key) { passthrough.push(unit); continue; }
        let list = groups.get(key);
        if (!list) groups.set(key, list = []);
        list.push(unit);
      }
      let changed = false;
      const keep = passthrough;
      snapshot.clusters94 ||= [];
      const zoom = finite(this.camera?.zoom, 1);
      const budget = zoom >= 1.05 ? 34 : zoom >= .72 ? 26 : 18;
      for (const list of groups.values()) {
        if (list.length < 36) { keep.push(...list); continue; }
        const center = list.reduce((acc, u) => { acc.x += u.x; acc.y += u.y; return acc; }, { x: 0, y: 0 });
        center.x /= list.length; center.y /= list.length;
        let kept = 0, omitted = 0;
        for (const unit of list) {
          const important = unit.selected || this.time - Math.max(unit.lastShotAt || -999, unit.lastDamagedAt || -999) < 1.25;
          if (important || kept < budget) { keep.push(unit); kept += 1; } else omitted += 1;
        }
        if (omitted > 0) {
          changed = true;
          const sample = list[0];
          snapshot.clusters94.push({ team: sample.team, air: false, typeId: sample.typeId, x: center.x, y: center.y, count: omitted, hp: 1, rotation: finite(sample.renderRotation, finite(sample.rotation)) });
          renderMetrics.omitted += omitted;
          renderMetrics.clusters += 1;
        }
      }
      if (changed) { snapshot.units.length = 0; snapshot.units.push(...keep); }
      renderMetrics.frames += 1;
      return snapshot;
    };
    wrapped._v185RenderIsolated = true;
    Game.prototype.buildRenderSnapshotV9 = wrapped;
  }

  function workerObjective() { return root.__FD_STABLE_STATE165__?.bridge?.workerPerformance?.objective184 || null; }
  function outcomeText(winner) { return winner === 'player' ? 'КОМАНДНЫЙ ЦЕНТР ПРОТИВНИКА ЗАХВАЧЕН — ПОБЕДА' : 'ВАШ КОМАНДНЫЙ ЦЕНТР ЗАХВАЧЕН — ПОРАЖЕНИЕ'; }
  function showOutcome(winner) {
    if (!winner || document.getElementById('fd-hq-outcome185')) return;
    const overlay = document.createElement('div');
    overlay.id = 'fd-hq-outcome185';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;background:rgba(3,8,12,.82);backdrop-filter:blur(5px);color:#eef8fc;font-family:system-ui,sans-serif';
    overlay.innerHTML = `<div style="max-width:680px;margin:24px;padding:34px 38px;border:1px solid rgba(170,215,236,.42);border-radius:16px;background:rgba(7,18,26,.96);text-align:center"><div style="font-size:12px;letter-spacing:.16em;color:#9fc6d9;font-weight:800">FRONTLINE DOMINION · BUILD ${BUILD}</div><div style="margin:14px 0 8px;font-size:48px;font-weight:900">${winner === 'player' ? 'ПОБЕДА' : 'ПОРАЖЕНИЕ'}</div><div>${outcomeText(winner)}</div></div>`;
    document.body.appendChild(overlay);
  }
  let lastUiAt = 0;
  function uiFrame(now) {
    requestAnimationFrame(uiFrame);
    if (now - lastUiAt < 160) return;
    lastUiAt = now;
    const state = workerObjective();
    if (!state) return;
    const objective = document.getElementById('objective-text');
    if (state.winner) { if (objective) objective.textContent = outcomeText(state.winner); showOutcome(state.winner); return; }
    const pct = Math.max(0, Math.min(100, Math.round(finite(state.captureProgress) * 100)));
    if (objective) objective.textContent = pct > 0 ? `Захватите командный центр противника · захват ${pct}%` : 'Захватите командный центр противника пехотой';
  }

  root.__FD_RUNTIME_UI_185__ = { version: VERSION, build: BUILD, applyStart, renderMetrics, objective: workerObjective };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scheduleStart, { once: true }); else scheduleStart();
  requestAnimationFrame(uiFrame);
})();