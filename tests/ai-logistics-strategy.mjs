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
  return b && !b.disabled && globalThis.__FD_AI_LOGISTICS_STRATEGY__?.multiOptionPlanning && globalThis.__FD_AI_ECONOMY_LOGISTICS__?.extractionHauling ? true : null;
});

await page.evaluate(I => {
  const D = globalThis.__FD_DEBUG__, L = globalThis.__FD_LOGISTICS206__;
  const base = D.Game.prototype.initializeBattle;
  D.Game.prototype.initializeBattle = function(...args) {
    const r = base.apply(this, args);
    this.difficultyKey = 'hard';
    this.teams.enemy.credits = Math.max(Number(this.teams.enemy.credits) || 0, 300000);
    const bx = (this.enemyBase?.x || 27000) - 900, by = (this.enemyBase?.y || 11000) + 600;
    const B = (id, type, x, y) => { const b = new D.Building(this, { id, typeId: type, team: 'enemy', x, y, construction: 1, rotation: 0 }); this.addEntity(b); return b; };
    const U = (id, type, x, y) => { const u = new D.Unit(this, { id, typeId: type, team: 'enemy', x, y, rotation: 0 }); this.addEntity(u); return u; };

    const storage = B(I.storage, D.BUILDING_TYPES?.logisticsHub ? 'logisticsHub' : 'refinery', bx + 650, by);
    const sn = L.ensureNode(storage); if (sn?.stock) for (const k of L.STOCK_KEYS) sn.stock[k] = 0;
    const extractor = B(I.extractor, D.BUILDING_TYPES?.oilPump ? 'oilPump' : Object.keys(D.BUILDING_TYPES).find(k => D.BUILDING_TYPES[k]?.placeOnResource), bx, by);
    const ex = L.ensureExtractor(extractor); extractor.resourceBufferMax206 = Math.max(Number(extractor.resourceBufferMax206) || 0, Number(extractor.stats?.bufferCapacity) || 18000); extractor.resourceBuffer83 = extractor.resourceBufferMax206 * .98;
    for (const b of this.buildings) if (b !== extractor && b.team === 'enemy' && L.ensureExtractor(b)) b.resourceBuffer83 = 0;

    const criticalType = D.BUILDING_TYPES?.vehicleFactory ? 'vehicleFactory' : D.BUILDING_TYPES?.barracks ? 'barracks' : 'logisticsHub';
    const critical = B(I.critical, criticalType, bx + 1100, by + 420), cn = L.ensureNode(critical);
    if (cn?.stock) { for (const k of L.STOCK_KEYS) cn.stock[k] = 0; cn.priority = 'CRITICAL'; }

    const airType = D.BUILDING_TYPES?.airfield ? 'airfield' : D.BUILDING_TYPES?.airport ? 'airport' : (D.BUILDING_TYPES?.logisticsHub ? 'logisticsHub' : criticalType);
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

    const risk = L.ensureGame(this).routeRisk; risk[`${Math.floor((bx - 1200) / 800)}:${Math.floor(by / 800)}`] = .82;
    globalThis.__ALS_FIXTURE__ = { protectedTruck: I.trucks[0], frontGroup: 'als-front-group', reconGroup: 'als-recon-group', airType, criticalType };
    return r;
  };
}, I);

await page.locator('#start-game').click();
const diag = await waitFor(I => {
  const g = globalThis.__FD_DEBUG__?.game, bridge = globalThis.__FD_STABLE_STATE165__?.bridge, api = globalThis.__FD_AI_LOGISTICS_STRATEGY__;
  const d = api?.diagnostics(g);
  if (!g || !bridge?.ready || bridge.failed || Number(bridge.workerTick) < 12 || !d?.problems?.length) return { __pending: true, tick: Number(bridge?.workerTick || 0), failed: Boolean(bridge?.failed), problems: d?.problems?.map(p => p.kind) || [] };
  const kinds = d.problems.map(p => p.kind);
  const required = ['EXTRACTION_BACKLOG', 'FRONTLINE_SHORTAGE', 'RECON_SHORTAGE', 'AVIATION_LOGISTICS_SHORTAGE', 'REAR_CRITICAL_NODE_SHORTAGE'];
  if (!required.every(k => kinds.includes(k))) return { __pending: true, tick: Number(bridge.workerTick), kinds, snapshot: d.snapshot };
  return d;
}, I, 50000);

if (diag.alternativesMinimum < 10) throw new Error(`planner minimum alternatives below requirement ${JSON.stringify(diag)}`);
if (new Set(diag.candidateTypes).size < 10) throw new Error(`planner exposes fewer than 10 distinct action families ${JSON.stringify(diag.candidateTypes)}`);
for (const problem of diag.problems) {
  if (problem.alternatives.length < 10) throw new Error(`problem ${problem.kind} has only ${problem.alternatives.length} alternatives`);
  if (new Set(problem.alternatives.map(x => x.type)).size < 10) throw new Error(`problem ${problem.kind} lacks 10 distinct alternatives`);
  for (let i = 1; i < problem.alternatives.length; i++) if (problem.alternatives[i].score > problem.alternatives[i - 1].score + 1e-9) throw new Error(`alternatives not score-sorted for ${problem.kind}`);
}

const front = diag.problems.find(p => p.kind === 'FRONTLINE_SHORTAGE');
const extraction = diag.problems.find(p => p.kind === 'EXTRACTION_BACKLOG');
const recon = diag.problems.find(p => p.kind === 'RECON_SHORTAGE');
const aviation = diag.problems.find(p => p.kind === 'AVIATION_LOGISTICS_SHORTAGE');
if (front.mode !== 'URGENT') throw new Error(`frontline shortage did not choose urgent objective ${JSON.stringify(front)}`);
if (extraction.mode !== 'THROUGHPUT') throw new Error(`extraction backlog did not choose throughput objective ${JSON.stringify(extraction)}`);
if (front.alternatives[0]?.type === extraction.alternatives[0]?.type) throw new Error(`urgent and throughput contexts selected identical top strategy ${front.alternatives[0]?.type}`);
if (!front.alternatives.some(a => ['FRONTLINE_GROUP_DIRECT', 'FRONTLINE_AREA_SHUTTLE', 'FRONTLINE_TWO_TRUCK_CONVOY'].includes(a.type) && a.feasible)) throw new Error(`no feasible frontline physical option ${JSON.stringify(front)}`);
if (!recon.alternatives.some(a => ['RECON_GROUP_DIRECT', 'RECON_AREA_CACHE'].includes(a.type) && a.feasible)) throw new Error(`no feasible reconnaissance logistics option ${JSON.stringify(recon)}`);
if (!aviation.alternatives.some(a => a.type === 'AIRFIELD_PRIORITY' && a.feasible)) throw new Error(`no feasible airfield logistics option ${JSON.stringify(aviation)}`);

const executed = await waitFor(I => {
  const g = globalThis.__FD_DEBUG__.game, api = globalThis.__FD_AI_LOGISTICS_STRATEGY__, L = globalThis.__FD_LOGISTICS206__, d = api.diagnostics(g);
  const p = g.getEntity(I.trucks[0]), ps = L.ensureUnit(p, false);
  const selected = d?.selected;
  if (!selected?.executed) return { __pending: true, selected, protectedMission: ps?.missionType };
  return { selected, protectedMission: ps?.missionType, tick: d.tick };
}, I, 30000);
if (executed.protectedMission !== 'SUPPLY_AREA') throw new Error(`adaptive planner stole protected field mission ${JSON.stringify(executed)}`);

const marker = await page.evaluate(() => globalThis.__FD_AI_LOGISTICS_STRATEGY__);
for (const key of ['multiOptionPlanning', 'deterministicScoring', 'physicalLogisticsOnly', 'rearLogistics', 'frontlineLogistics', 'reconnaissanceLogistics', 'aviationLogistics', 'routeRiskAware', 'speedCostThroughputTradeoff']) if (!marker?.[key]) throw new Error(`strategy capability missing ${key}`);
if (marker.minimumAlternatives < 10 || marker.candidateTypes.length < 10) throw new Error(`strategy capability count invalid ${JSON.stringify(marker)}`);
const bridge = await page.evaluate(() => { const b = globalThis.__FD_STABLE_STATE165__?.bridge; return { ready: Boolean(b?.ready), failed: Boolean(b?.failed), errors: Number(b?.actionErrors || 0), recoveries: Number(b?.recoveryAttempts201 || 0), tick: Number(b?.workerTick || 0) }; });
if (!bridge.ready || bridge.failed || bridge.errors || bridge.recoveries) throw new Error(`bridge unhealthy ${JSON.stringify(bridge)}`);
console.log(JSON.stringify({ ok: true, problems: diag.problems.map(p => ({ kind: p.kind, mode: p.mode, alternatives: p.alternatives.length, top: p.alternatives[0]?.type })), executed, marker: { minimumAlternatives: marker.minimumAlternatives, candidateTypes: marker.candidateTypes.length }, bridge }));
await context.close(); await browser.close();
