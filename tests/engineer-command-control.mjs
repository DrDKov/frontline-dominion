import { chromium } from 'playwright';
import { gameUrl } from './lib/fd-env.mjs';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const page = await context.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e?.stack || e)));
page.on('console', m => { if (m.type() === 'error' && !/favicon|404|audio|autoplay|Failed to load resource/i.test(m.text())) errors.push(`console:${m.text()}`); });
const waitFor = async (fn, arg = undefined, timeout = 45000, interval = 80) => {
  const started = Date.now(); let last = null;
  while (Date.now() - started < timeout) {
    if (errors.length) throw new Error(`Browser errors ${JSON.stringify(errors)}`);
    last = await page.evaluate(fn, arg);
    if (last && !last.__pending) return last;
    await page.waitForTimeout(interval);
  }
  throw new Error(`Timed out ${timeout}ms; last=${JSON.stringify(last)}`);
};
const I = { builder: 'ecc-builder', idle1: 'ecc-idle-1', idle2: 'ecc-idle-2', unfinished: 'ecc-unfinished', damaged: 'ecc-damaged' };

await page.goto(gameUrl(), { waitUntil: 'load', timeout: 60000 });
await waitFor(() => {
  const b = document.getElementById('start-game');
  const c = globalThis.__FD_ENGINEER_COMMAND_CONTROL__;
  return b && !b.disabled && c?.automaticRepairPreserved && c?.explicitConstructionAssignmentOnly && globalThis.__FD_DEBUG__?.Game ? true : null;
});

const fixture = await page.evaluate(I => {
  const D = globalThis.__FD_DEBUG__;
  const base = D.Game.prototype.initializeBattle;
  D.Game.prototype.initializeBattle = function(...args) {
    const r = base.apply(this, args);
    const anchor = (this.buildings || []).find(b => b?.alive && b.team === 'player') || { x: 3000, y: 10000 };
    const x = anchor.x + 900, y = anchor.y + 500;
    const buildingType = D.BUILDING_TYPES?.financialCenter ? 'financialCenter' : D.BUILDING_TYPES?.barracks ? 'barracks' : Object.keys(D.BUILDING_TYPES || {})[0];
    const repairType = D.BUILDING_TYPES?.barracks ? 'barracks' : buildingType;
    const B = (id, type, px, py, construction = 1) => {
      const b = new D.Building(this, { id, typeId: type, team: 'player', x: px, y: py, construction, rotation: 0 });
      this.addEntity(b); return b;
    };
    const U = (id, px, py) => { const u = new D.Unit(this, { id, typeId: 'worker', team: 'player', x: px, y: py, rotation: 0 }); this.addEntity(u); return u; };
    const unfinished = B(I.unfinished, buildingType, x + 110, y, .03);
    unfinished.construction = .03; unfinished.completed = false;
    const damaged = B(I.damaged, repairType, x - 90, y + 80, 1);
    damaged.construction = 1; damaged.completed = true;
    damaged.maxHp = Math.max(5000, Number(damaged.maxHp) || 1);
    damaged.hp = damaged.maxHp * .18;
    const builder = U(I.builder, x, y);
    const idle1 = U(I.idle1, x - 40, y + 20);
    const idle2 = U(I.idle2, x + 20, y + 55);

    // Direct command to a concrete engineer is the construction assignment.
    const manualResult = builder.setCommand({ type: 'build', buildingId: unfinished.id }, false);
    // Known legacy auto-initiative must be rejected.
    const legacyAutoResult = idle1.setCommand({ type: 'build', buildingId: unfinished.id, autoEngineer130: true }, false);
    // Also reject a hydrated/legacy automatic command even if autoEngineer130 was lost.
    const metadataAutoResult = idle2.setCommand({
      type: 'build', buildingId: unfinished.id,
      assignedAt130: Number(this.time) || 0,
      progressAt130: Number(this.time) || 0,
      bestSurfaceDistance130: 0,
    }, false);

    globalThis.__ECC_FIXTURE__ = {
      buildingType, repairType,
      manualAccepted: builder.currentCommand?.type === 'build' && builder.currentCommand?.buildingId === unfinished.id,
      legacyAutoRejected: legacyAutoResult === false && idle1.currentCommand?.type !== 'build',
      metadataAutoRejected: metadataAutoResult === false && idle2.currentCommand?.type !== 'build',
      manualResult,
      initiallyAssigned: this.engineersAssignedToConstruction?.(unfinished.id) || [],
    };
    return r;
  };
  return { ok: true };
}, I);
if (!fixture.ok) throw new Error('engineer fixture install failed');

await page.locator('#start-game').click();
const ready = await waitFor(I => {
  const g = globalThis.__FD_DEBUG__?.game, bridge = globalThis.__FD_STABLE_STATE165__?.bridge;
  const entities = [I.builder, I.idle1, I.idle2, I.unfinished, I.damaged].map(id => g?.getEntity(id));
  if (!g || entities.some(x => !x) || !bridge?.ready || bridge.failed || Number(bridge.workerTick) < 8) return { __pending: true, tick: Number(bridge?.workerTick || 0), present: entities.map(Boolean), failed: Boolean(bridge?.failed) };
  return { tick: Number(bridge.workerTick), fixture: globalThis.__ECC_FIXTURE__ };
}, I);
if (!ready.fixture?.manualAccepted) throw new Error(`manual construction was not accepted ${JSON.stringify(ready)}`);
if (!ready.fixture?.legacyAutoRejected) throw new Error(`legacy automatic construction was not rejected ${JSON.stringify(ready)}`);
if (!ready.fixture?.metadataAutoRejected) throw new Error(`metadata-only automatic construction was not rejected ${JSON.stringify(ready)}`);
if (ready.fixture.initiallyAssigned.length !== 1 || ready.fixture.initiallyAssigned[0] !== I.builder) throw new Error(`construction assignment registry incorrect ${JSON.stringify(ready.fixture)}`);

const behavior = await waitFor(I => {
  const g = globalThis.__FD_DEBUG__.game;
  const rows = [I.builder, I.idle1, I.idle2].map(id => {
    const u = g.getEntity(id), c = u?.currentCommand;
    return {
      id,
      command: c?.type || null,
      targetId: c?.targetId || c?.buildingId || null,
      auto: Boolean(c?.autoEngineer130),
      explicitBuild: Boolean(c?.explicitEngineerConstructionAssignment),
      repairOnly: Boolean(c?.repairOnlyInitiative),
    };
  });
  const idleConstruction = rows.filter(r => r.id !== I.builder && r.command === 'build' && r.targetId === I.unfinished);
  const repairs = rows.filter(r => r.id !== I.builder && r.auto && r.repairOnly && r.command === 'repair' && r.targetId === I.damaged);
  const unfinished = g.getEntity(I.unfinished);
  const assigned = globalThis.__FD_ENGINEER_COMMAND_CONTROL__?.assignedTo?.(g, I.unfinished) || [];
  if (repairs.length < 1) return { __pending: true, rows, idleConstruction, repairs, assigned, construction: unfinished?.construction };
  return { rows, idleConstruction, repairs, assigned, construction: unfinished?.construction };
}, I, 30000);
if (behavior.idleConstruction.length) throw new Error(`unassigned engineers joined construction ${JSON.stringify(behavior)}`);
if (behavior.assigned.some(id => id !== I.builder)) throw new Error(`construction registry contains an unassigned engineer ${JSON.stringify(behavior)}`);
if (!behavior.repairs.length) throw new Error(`automatic repair initiative did not survive ${JSON.stringify(behavior)}`);

const marker = await page.evaluate(() => globalThis.__FD_ENGINEER_COMMAND_CONTROL__);
for (const key of ['manualConstructionOnly', 'explicitConstructionAssignmentOnly', 'unassignedEngineersIgnoreConstruction', 'automaticConstructionDisabled', 'automaticRepairPreserved', 'legacyAutoBuildCancelledOnLoad']) {
  if (!marker?.[key]) throw new Error(`engineer control marker missing ${key}: ${JSON.stringify(marker)}`);
}
const bridge = await page.evaluate(() => { const b = globalThis.__FD_STABLE_STATE165__?.bridge; return { ready: Boolean(b?.ready), failed: Boolean(b?.failed), errors: Number(b?.actionErrors || 0), recoveries: Number(b?.recoveryAttempts201 || 0), tick: Number(b?.workerTick || 0) }; });
if (!bridge.ready || bridge.failed || bridge.errors || bridge.recoveries) throw new Error(`bridge unhealthy ${JSON.stringify(bridge)}`);
console.log(JSON.stringify({ ok: true, ready, behavior, marker: { explicitConstructionAssignmentOnly: marker.explicitConstructionAssignmentOnly, unassignedEngineersIgnoreConstruction: marker.unassignedEngineersIgnoreConstruction, automaticRepairPreserved: marker.automaticRepairPreserved }, bridge }));
await context.close(); await browser.close();