import { chromium } from 'playwright';
import { gameUrl } from './lib/fd-env.mjs';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const page = await context.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e?.stack || e)));
page.on('console', m => { if (m.type() === 'error' && !/favicon|404|audio|autoplay|Failed to load resource/i.test(m.text())) errors.push(`console:${m.text()}`); });
const waitFor = async (fn, arg = undefined, timeout = 60000, interval = 100) => {
  const started = Date.now(); let last = null;
  while (Date.now() - started < timeout) {
    if (errors.length) throw new Error(`Browser errors ${JSON.stringify(errors)}`);
    last = await page.evaluate(fn, arg);
    if (last && !last.__pending) return last;
    await page.waitForTimeout(interval);
  }
  throw new Error(`Timed out ${timeout}ms; last=${JSON.stringify(last)}`);
};

const I = {
  storage: 'als-storage', extractor: 'als-extractor', critical: 'als-critical', airfield: 'als-airfield',
  trucks: ['als-t1', 'als-t2', 'als-t3', 'als-t4'],
  front: Array.from({ length: 8 }, (_, i) => `als-front-${i}`),
  recon: ['als-recon-1', 'als-recon-2'],
};

await page.goto(gameUrl(), { waitUntil: 'load', timeout: 60000 });
await waitFor(() => {
  const b = document.getElementById('start-game');
  const adaptive = globalThis.__FD_AI_LOGISTICS_ADAPTIVE__;
  return b && !b.disabled &&
    globalThis.__FD_AI_LOGISTICS_STRATEGY__?.multiOptionPlanning &&
    adaptive?.automaticReplanning && adaptive?.authoritativePostHookRegistered &&
    globalThis.__FD_AI_ECONOMY_LOGISTICS__?.extractionHauling ? true : null;
});

await page.evaluate(I => {
  const D = globalThis.__FD_DEBUG__, L = globalThis.__FD_LOGISTICS206__;
  const base = D.Game.prototype.initializeBattle;
  D.Game.prototype.initializeBattle = function(...args) {
    const r = base.apply(this, args);
    this.difficultyKey = 'hard';
    this.teams.enemy.credits = 300000;
    const bx = (this.enemyBase?.x || 27000) - 900, by = (this.enemyBase?.y || 11000) + 600;
    const B = (id, type, x, y) => { const b = new D.Building(this, { id, typeId: type, team: 'enemy', x, y, construction: 1, rotation: 0 }); this.addEntity(b); return b; };
    const U = (id, type, x, y) => { const u = new D.Unit(this, { id, typeId: type, team: 'enemy', x, y, rotation: 0 }); this.addEntity(u); return u; };

    const storage = B(I.storage, D.BUILDING_TYPES?.logisticsHub ? 'logisticsHub' : 'refinery', bx + 650, by);
    const sn = L.ensureNode(storage); if (sn?.stock) for (const k of L.STOCK_KEYS) sn.stock[k] = 0;

    const extractorType = D.BUILDING_TYPES?.oilPump ? 'oilPump' : Object.keys(D.BUILDING_TYPES || {}).find(k => D.BUILDING_TYPES[k]?.placeOnResource);
    const extractor = B(I.extractor, extractorType, bx, by);
    L.ensureExtractor(extractor);
    extractor.resourceBufferMax206 = Math.max(Number(extractor.resourceBufferMax206) || 0, Number(extractor.stats?.bufferCapacity) || 18000);
    extractor.resourceBuffer83 = extractor.resourceBufferMax206 * .98;
    for (const b of this.buildings) if (b !== extractor && b.team === 'enemy' && L.ensureExtractor(b)) b.resourceBuffer83 = 0;

    const criticalType = D.BUILDING_TYPES?.vehicleFactory ? 'vehicleFactory' : D.BUILDING_TYPES?.barracks ? 'barracks' : 'logisticsHub';
    const critical = B(I.critical, criticalType, bx + 1100, by + 420), cn = L.ensureNode(critical);
    if (cn?.stock) { for (const k of L.STOCK_KEYS) cn.stock[k] = 0; cn.priority = 'CRITICAL'; }

    const airType = D.BUILDING_TYPES?.airfield ? 'airfield' : D.BUILDING_TYPES?.advancedAirfield ? 'advancedAirfield' : (D.BUILDING_TYPES?.logisticsHub ? 'logisticsHub' : criticalType);
    const airfield = B(I.airfield, airType, bx + 1350, by - 650), an = L.ensureNode(airfield);
    if (an) { an.nodeType = 'airfield'; an.priority = 'CRITICAL'; if (an.stock) for (const k of L.STOCK_KEYS) an.stock[k] = 0; }

    I.trucks.forEach((id, i) => {
      const t = U(id, 'resourceTruck', bx + 220 + i * 75, by + 260), s = L.ensureUnit(t, true);
      Object.assign(s, { fuelMax: 720, fuel: 720, missionType: 'AUTO', phase206: 'PLAN', homeNodeId: I.storage, sourceNodeId: null, destinationNodeId: null, status: 'WAITING_DEMAND' });
      for (const k of L.STOCK_KEYS) s.cargo[k] = 0;
      t.setCommand?.({ type: 'logistics206', missionType: 'AUTO' }, false);
    });
    const protectedTruck = this.getEntity(I.trucks[0]), ps = L.ensureUnit(protectedTruck, false);
    Object.assign(ps, { missionType: 'SUPPLY_AREA', phase206: 'PLAN', targetX: bx + 2400, targetY: by, serviceRadius: 700, status: 'ASSIGNED' });
    protectedTruck.setCommand?.({ type: 'logistics206', missionType: 'SUPPLY_AREA', targetX: ps.targetX, targetY: ps.targetY, serviceRadius: ps.serviceRadius }, false);

    I.front.forEach((id, i) => {
      const u = U(id, 'rifle', bx - 2600 - (i % 4) * 85, by + Math.floor(i / 4) * 110), s = L.ensureUnit(u, true);
      u.aiSquadId = 'als-front-group';
      Object.assign(s, { fuelMax: 800, fuel: 40, ammoReserveMax: 1200, ammoReserve: 30, supportMax: 900, support: 20 });
      u.setCommand?.({ type: 'attackMove', x: (this.playerBase?.x || 4500) + 1000, y: this.playerBase?.y || 11000 }, false);
    });
    I.recon.forEach((id, i) => {
      const u = U(id, 'rifle', bx - 3600 - i * 90, by - 800), s = L.ensureUnit(u, true);
      u.stats = { ...u.stats, recon: true, scout: true };
      u.aiSquadId = 'als-recon-group';
      Object.assign(s, { fuelMax: 600, fuel: 20, ammoReserveMax: 500, ammoReserve: 40, supportMax: 500, support: 10 });
      u.setCommand?.({ type: 'move', x: (this.playerBase?.x || 4500) + 600, y: (this.playerBase?.y || 11000) - 900 }, false);
    });

    L.ensureGame(this).routeRisk[`${Math.floor((bx - 1200) / 800)}:${Math.floor(by / 800)}`] = .82;
    globalThis.__ALS_FIXTURE__ = { protectedTruck: I.trucks[0], frontGroup: 'als-front-group', reconGroup: 'als-recon-group', airType, criticalType };
    return r;
  };
}, I);

await page.locator('#start-game').click();
await waitFor(() => {
  const g = globalThis.__FD_DEBUG__?.game, bridge = globalThis.__FD_STABLE_STATE165__?.bridge;
  return g?.ai && bridge?.ready && !bridge.failed && Number(bridge.workerTick) >= 12 ? true : { __pending: true, ai: Boolean(g?.ai), ready: Boolean(bridge?.ready), failed: Boolean(bridge?.failed), tick: Number(bridge?.workerTick || 0) };
}, undefined, 30000);

// Browser debug state is a mirror while the authoritative Worker owns simulation.
// Evaluate the same deterministic planner explicitly here; separately verify that the
// exact controller is registered in the authoritative simulateFixed post-hook below.
const diag = await page.evaluate(() => {
  const g = globalThis.__FD_DEBUG__.game, api = globalThis.__FD_AI_LOGISTICS_ADAPTIVE__;
  return api.evaluate(g, false);
});
if (!diag?.problems?.length) throw new Error(`adaptive planner produced no problems ${JSON.stringify(diag)}`);

const kinds = diag.problems.map(p => p.kind);
for (const required of ['EXTRACTION_BACKLOG', 'FRONTLINE_SHORTAGE', 'RECON_SHORTAGE', 'AVIATION_LOGISTICS_SHORTAGE', 'REAR_CRITICAL_NODE_SHORTAGE']) {
  if (!kinds.includes(required)) throw new Error(`missing adaptive problem ${required}: ${JSON.stringify(kinds)}`);
}
if (!diag.plannerValid) throw new Error(`adaptive planner declared invalid ${JSON.stringify(diag)}`);
if (diag.alternativesMinimum < 10) throw new Error(`planner minimum alternatives below requirement ${JSON.stringify(diag)}`);
if (new Set(diag.candidateTypes).size < 10) throw new Error(`planner exposes fewer than 10 distinct action families ${JSON.stringify(diag.candidateTypes)}`);
for (const problem of diag.problems) {
  if (problem.alternatives.length < 10 || problem.alternativesCount < 10) throw new Error(`problem ${problem.kind} has fewer than 10 alternatives`);
  if (problem.distinctAlternatives < 10 || new Set(problem.alternatives.map(x => x.type)).size < 10) throw new Error(`problem ${problem.kind} lacks 10 distinct alternatives`);
  for (let i = 1; i < problem.alternatives.length; i++) if (problem.alternatives[i].score > problem.alternatives[i - 1].score + 1e-9) throw new Error(`alternatives not score-sorted for ${problem.kind}`);
  for (const objective of ['FASTEST', 'MAX_THROUGHPUT', 'ECONOMICAL', 'RESILIENT', 'LOW_RISK', 'BALANCED']) if (!problem.objectiveLeaders?.[objective]) throw new Error(`problem ${problem.kind} missing ${objective} leader`);
}

const front = diag.problems.find(p => p.kind === 'FRONTLINE_SHORTAGE');
const extraction = diag.problems.find(p => p.kind === 'EXTRACTION_BACKLOG');
const recon = diag.problems.find(p => p.kind === 'RECON_SHORTAGE');
const aviation = diag.problems.find(p => p.kind === 'AVIATION_LOGISTICS_SHORTAGE');
const rear = diag.problems.find(p => p.kind === 'REAR_CRITICAL_NODE_SHORTAGE');
const risk = diag.problems.find(p => p.kind === 'ROUTE_RISK');
if (front.mode !== 'URGENT' || front.contextObjective !== 'FASTEST') throw new Error(`frontline shortage did not choose speed objective ${JSON.stringify(front)}`);
if (extraction.mode !== 'THROUGHPUT' || extraction.contextObjective !== 'MAX_THROUGHPUT') throw new Error(`extraction backlog did not choose throughput objective ${JSON.stringify(extraction)}`);
if (risk && risk.contextObjective !== 'LOW_RISK') throw new Error(`route risk did not choose low-risk objective ${JSON.stringify(risk)}`);
if (!rear.alternatives.some(a => ['DIRECT_CRITICAL_NODE', 'NEAREST_TRUCK_SHUTTLE', 'HIGH_CAPACITY_SHUTTLE', 'MULTI_NODE_DISTRIBUTION'].includes(a.type) && a.feasible)) throw new Error(`no feasible rear logistics option ${JSON.stringify(rear)}`);
if (!front.alternatives.some(a => ['FRONTLINE_GROUP_DIRECT', 'FRONTLINE_AREA_SHUTTLE', 'FRONTLINE_TWO_TRUCK_CONVOY'].includes(a.type) && a.feasible)) throw new Error(`no feasible frontline physical option ${JSON.stringify(front)}`);
if (!recon.alternatives.some(a => ['RECON_GROUP_DIRECT', 'RECON_AREA_CACHE'].includes(a.type) && a.feasible)) throw new Error(`no feasible reconnaissance logistics option ${JSON.stringify(recon)}`);
if (!aviation.alternatives.some(a => a.type === 'AIRFIELD_PRIORITY' && a.feasible)) throw new Error(`no feasible airfield logistics option ${JSON.stringify(aviation)}`);

// Verify the same problem can produce different preferred actions under different
// optimization objectives (fastest, maximum throughput, economical, resilient, low risk).
const leaderTypes = new Set([
  front.objectiveLeaders.FASTEST?.type,
  front.objectiveLeaders.MAX_THROUGHPUT?.type,
  front.objectiveLeaders.ECONOMICAL?.type,
  front.objectiveLeaders.RESILIENT?.type,
  front.objectiveLeaders.LOW_RISK?.type,
].filter(Boolean));
if (leaderTypes.size < 2) throw new Error(`objective profiles did not diversify solutions ${JSON.stringify(front.objectiveLeaders)}`);

// Economic context change: same rear shortage must switch to ECONOMY/ECONOMICAL.
const economicChange = await page.evaluate(() => {
  const g = globalThis.__FD_DEBUG__.game, api = globalThis.__FD_AI_LOGISTICS_ADAPTIVE__;
  const signatureBefore = api.signature(g);
  g.teams.enemy.credits = 1000;
  const signatureAfter = api.signature(g);
  const d = api.evaluate(g, false);
  const rear = d.problems.find(p => p.kind === 'REAR_CRITICAL_NODE_SHORTAGE');
  return { signatureBefore, signatureAfter, mode: rear?.mode, objective: rear?.contextObjective, economicalLeader: rear?.objectiveLeaders?.ECONOMICAL?.type };
});
if (economicChange.signatureBefore === economicChange.signatureAfter) throw new Error(`economic situation change not detected ${JSON.stringify(economicChange)}`);
if (economicChange.mode !== 'ECONOMY' || economicChange.objective !== 'ECONOMICAL') throw new Error(`low-credit rear shortage did not choose economical mode ${JSON.stringify(economicChange)}`);

// Execute the actual registered post-hook twice on the debug mirror. This is the same
// deterministic hook invoked by logistics-core-v206 from authoritative simulateFixed.
const automatic = await page.evaluate(I => {
  const D = globalThis.__FD_DEBUG__, g = D.game, L = globalThis.__FD_LOGISTICS206__, api = globalThis.__FD_AI_LOGISTICS_ADAPTIVE__;
  const hooks = D.Game.prototype.logisticsHooks206?.().post || [];
  const entry = hooks.find(x => x.order === 97);
  if (!entry?.fn) return { ok: false, reason: 'POST_HOOK_NOT_FOUND', hooks: hooks.map(x => x.order) };
  g.simTick = Math.max(100, Number(g.simTick) || 0);
  g.ai._nextAdaptiveLogisticsStrategy = -Infinity;
  entry.fn.call(g, .04);
  const afterFirst = { ...(api.state(g) || {}) };
  const firstSelected = api.diagnostics(g)?.selected || null;
  const lowSignature = api.signature(g);
  g.teams.enemy.credits = 300000;
  g.simTick += 1;
  entry.fn.call(g, .04);
  const afterChange = { ...(api.state(g) || {}) };
  const highSignature = api.signature(g);
  const protectedState = L.ensureUnit(g.getEntity(I.trucks[0]), false);
  return {
    ok: true,
    hookOrder: entry.order,
    afterFirst,
    afterChange,
    firstSelected,
    lastSelected: api.diagnostics(g)?.selected || null,
    lowSignature,
    highSignature,
    protectedMission: protectedState?.missionType,
  };
}, I);
if (!automatic.ok) throw new Error(`authoritative adaptive hook unavailable ${JSON.stringify(automatic)}`);
if (automatic.hookOrder !== 97) throw new Error(`adaptive post-hook order incorrect ${JSON.stringify(automatic)}`);
if (Number(automatic.afterFirst.evaluations || 0) < 1) throw new Error(`adaptive post-hook did not evaluate ${JSON.stringify(automatic)}`);
if (Number(automatic.afterChange.changes || 0) <= Number(automatic.afterFirst.changes || 0) || automatic.afterChange.lastReason !== 'SITUATION_CHANGE') throw new Error(`adaptive post-hook did not react to situation change ${JSON.stringify(automatic)}`);
if (automatic.lowSignature === automatic.highSignature) throw new Error(`adaptive post-hook signatures did not change ${JSON.stringify(automatic)}`);
if (automatic.protectedMission !== 'SUPPLY_AREA') throw new Error(`adaptive planner stole protected field mission ${JSON.stringify(automatic)}`);
if (!automatic.afterChange.lastExecuted && !automatic.afterFirst.lastExecuted) throw new Error(`adaptive planner found no executable physical response ${JSON.stringify(automatic)}`);

const marker = await page.evaluate(() => ({ strategy: globalThis.__FD_AI_LOGISTICS_STRATEGY__, adaptive: globalThis.__FD_AI_LOGISTICS_ADAPTIVE__ }));
for (const key of ['multiOptionPlanning', 'deterministicScoring', 'physicalLogisticsOnly', 'rearLogistics', 'frontlineLogistics', 'reconnaissanceLogistics', 'aviationLogistics', 'routeRiskAware', 'speedCostThroughputTradeoff']) if (!marker.strategy?.[key]) throw new Error(`strategy capability missing ${key}`);
for (const key of ['automaticReplanning', 'changeResponsive', 'deterministic', 'authoritativePostHookRegistered', 'rearLogistics', 'frontlineLogistics', 'reconnaissanceLogistics', 'aviationLogistics', 'protectedFieldMissions']) if (!marker.adaptive?.[key]) throw new Error(`adaptive capability missing ${key}`);
if (marker.strategy.minimumAlternatives < 10 || marker.strategy.candidateTypes.length < 10 || marker.adaptive.minimumAlternativesPerProblem < 10) throw new Error(`strategy capability count invalid`);
if (marker.adaptive.objectiveProfiles.length < 6) throw new Error(`adaptive objective profiles incomplete ${JSON.stringify(marker.adaptive.objectiveProfiles)}`);

const bridge = await page.evaluate(() => { const b = globalThis.__FD_STABLE_STATE165__?.bridge; return { ready: Boolean(b?.ready), failed: Boolean(b?.failed), errors: Number(b?.actionErrors || 0), recoveries: Number(b?.recoveryAttempts201 || 0), tick: Number(b?.workerTick || 0) }; });
if (!bridge.ready || bridge.failed || bridge.errors || bridge.recoveries) throw new Error(`bridge unhealthy ${JSON.stringify(bridge)}`);
console.log(JSON.stringify({
  ok: true,
  initial: diag.problems.map(p => ({ kind: p.kind, mode: p.mode, objective: p.contextObjective, alternatives: p.alternativesCount, feasible: p.feasibleAlternatives, top: p.contextLeader?.type })),
  economicChange,
  automatic,
  marker: { minimumAlternatives: marker.adaptive.minimumAlternativesPerProblem, objectiveProfiles: marker.adaptive.objectiveProfiles, authoritativePostHookRegistered: marker.adaptive.authoritativePostHookRegistered },
  bridge,
}));
await context.close(); await browser.close();