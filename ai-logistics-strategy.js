// requires: __FD_DEBUG__, __FD_LOGISTICS206__, __FD_AI_ECONOMY_LOGISTICS__
// provides: __FD_AI_LOGISTICS_STRATEGY__
(() => {
  'use strict';
  const root = typeof window !== 'undefined' ? window : self;
  const D = root.__FD_DEBUG__;
  const L = root.__FD_LOGISTICS206__;
  const economy = root.__FD_AI_ECONOMY_LOGISTICS__;
  const TacticalAI = D?.TacticalAI;
  if (!D?.Game || !TacticalAI || !L || !economy || root.__FD_AI_LOGISTICS_STRATEGY__) return;
  if (TacticalAI.prototype.__fdAdaptiveLogisticsStrategyInstalled) return;
  Object.defineProperty(TacticalAI.prototype, '__fdAdaptiveLogisticsStrategyInstalled', { value: true, configurable: true });

  const EPS = 1e-6;
  const MIN_ALTERNATIVES = 10;
  const STORAGE = new Set(['central', 'warehouse', 'pmto', 'terminal']);
  const PROTECTED = new Set(['SUPPLY_AREA', 'SUPPLY_GROUP', 'MANUAL_TRANSFER']);
  const ACTION_TYPES = Object.freeze([
    'DIRECT_CRITICAL_NODE',
    'NEAREST_TRUCK_SHUTTLE',
    'HIGH_CAPACITY_SHUTTLE',
    'MULTI_NODE_DISTRIBUTION',
    'FRONTLINE_GROUP_DIRECT',
    'FRONTLINE_AREA_SHUTTLE',
    'FRONTLINE_TWO_TRUCK_CONVOY',
    'RECON_GROUP_DIRECT',
    'RECON_AREA_CACHE',
    'AIRFIELD_PRIORITY',
    'EXTRACTOR_SURGE',
    'STORAGE_REBALANCE_TRANSFER',
    'QUEUE_RESOURCE_TRUCK',
    'BUILD_LOGISTICS_CAPACITY',
    'EMERGENCY_PURCHASE_FUEL',
    'EMERGENCY_PURCHASE_AMMO',
    'RELEASE_MOBILE_RESERVE',
    'HOLD_OPERATION_FOR_RESERVE',
  ]);

  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, Number(v) || 0));
  const round = v => L.round?.(v) ?? Math.round((Number(v) || 0) * 1000) / 1000;
  const dist = (a, b) => Math.hypot((Number(a?.x) || 0) - (Number(b?.x) || 0), (Number(a?.y) || 0) - (Number(b?.y) || 0));
  const manifest = () => ({ fuel: 0, ammo: 0, support: 0 });
  const total = m => L.manifestTotal?.(m) ?? Object.values(m || {}).reduce((s, v) => s + Math.max(0, Number(v) || 0), 0);
  const stableHash = value => {
    let h = 2166136261 >>> 0;
    for (const c of String(value ?? '')) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  };

  function node(building) { return building?.alive ? L.ensureNode(building) : null; }
  function nodeDemand(building) {
    const n = node(building);
    return n?.stock ? L.computeDemand(n.stock, n.thresholds, n.priority) : manifest();
  }
  function demandTotal(building) { return total(nodeDemand(building)); }
  function storageNodes(game, team = 'enemy') {
    return (game.buildings || []).filter(b => b?.alive && b.completed && b.team === team && !L.ensureExtractor(b) && STORAGE.has(node(b)?.nodeType));
  }
  function logisticsNodes(game, team = 'enemy') {
    return (game.buildings || []).filter(b => b?.alive && b.completed && b.team === team && !L.ensureExtractor(b) && node(b)?.stock);
  }
  function trucks(game, team = 'enemy') {
    return (game.units || []).filter(u => u?.alive && u.team === team && L.isTruck(u));
  }
  function protectedMission(truck) {
    const state = L.ensureUnit(truck, false);
    return Boolean(state && PROTECTED.has(state.missionType));
  }
  function freeTruck(truck) {
    const s = L.ensureUnit(truck, false);
    if (!s || protectedMission(truck) || s.missionType === 'EXTRACT_RESOURCE') return false;
    if (['WAITING', 'WAITING_DEMAND', 'WAITING_DESTINATION', 'IDLE', 'ASSIGNED'].includes(s.status)) return true;
    return s.missionType === 'AUTO' && ['PLAN', 'WAIT_SOURCE', 'WAIT_DESTINATION'].includes(s.phase206);
  }
  function freeTrucks(game, team = 'enemy') {
    return trucks(game, team).filter(freeTruck).sort((a, b) => String(a.id).localeCompare(String(b.id), 'en'));
  }
  function unitDeficit(unit) {
    const s = L.ensureUnit(unit, false), out = manifest();
    if (!s || !unit?.alive || L.isTruck(unit)) return out;
    if (s.fuelMax > 0) out.fuel = Math.max(0, s.fuelMax * .92 - s.fuel);
    if (s.ammoReserveMax > 0) out.ammo = Math.max(0, s.ammoReserveMax * .92 - s.ammoReserve);
    if (s.supportMax > 0) out.support = Math.max(0, s.supportMax * .88 - s.support);
    return out;
  }
  function sumDeficit(units) {
    const out = manifest();
    for (const u of units || []) { const d = unitDeficit(u); for (const k of L.STOCK_KEYS) out[k] += d[k]; }
    for (const k of L.STOCK_KEYS) out[k] = round(out[k]);
    return out;
  }
  function centroid(units) {
    if (!units?.length) return null;
    const p = units.reduce((s, u) => ({ x: s.x + (Number(u.x) || 0), y: s.y + (Number(u.y) || 0) }), { x: 0, y: 0 });
    return { x: p.x / units.length, y: p.y / units.length };
  }
  function groupId(unit) {
    return unit?.aiSquadId || unit?.currentCommand?.formationGroupId || unit?.currentCommand?.formationId || null;
  }
  function groundCombatUnits(game, team = 'enemy') {
    return (game.units || []).filter(u => u?.alive && u.team === team && !u.air && !u.embarkedIn && !L.isTruck(u) && u.typeId !== 'worker' && Boolean(u.stats?.weapon));
  }
  function frontlineUnits(game, team = 'enemy') {
    const base = team === 'enemy' ? game.enemyBase : game.playerBase;
    const combat = groundCombatUnits(game, team);
    return combat.filter(u => {
      const command = u.currentCommand?.type;
      const offensive = ['attack', 'attackMove', 'patrol'].includes(command) || Boolean(u.aiSquadId || u.currentCommand?.formationId || u.currentCommand?.formationGroupId);
      const forward = base ? dist(u, base) > 2200 : false;
      return offensive || forward;
    });
  }
  function reconUnits(game, team = 'enemy') {
    return (game.units || []).filter(u => {
      if (!u?.alive || u.team !== team || u.embarkedIn || L.isTruck(u) || u.air) return false;
      const text = `${u.typeId || ''} ${u.stats?.visualRole || ''} ${u.stats?.role || ''}`.toLowerCase();
      return Boolean(u.stats?.recon || u.stats?.scout || u.stats?.sensor || /recon|scout|uav|drone|развед/.test(text));
    });
  }
  function airfields(game, team = 'enemy') {
    return logisticsNodes(game, team).filter(b => node(b)?.nodeType === 'airfield' || /airfield|aerodrome|аэродром/.test(`${b.typeId || ''}`.toLowerCase()));
  }
  function extractors(game, team = 'enemy') {
    return (game.buildings || []).filter(b => b?.alive && b.completed && b.team === team && L.ensureExtractor(b)).map(b => {
      const ex = L.ensureExtractor(b), amount = Math.max(0, Number(b.resourceBuffer83) || 0), cap = Math.max(1, Number(b.resourceBufferMax206 || b.stats?.bufferCapacity) || 1);
      return { b, key: ex?.resourceType || L.extractorResourceType?.(b), amount, cap, ratio: amount / cap };
    }).filter(r => r.key && r.amount > EPS);
  }
  function routeRisk(game, from, to) {
    const risk = L.ensureGame(game)?.routeRisk || {};
    if (!from || !to) return 0;
    const steps = Math.max(1, Math.min(12, Math.ceil(dist(from, to) / 900)));
    let sum = 0;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps, x = from.x + (to.x - from.x) * t, y = from.y + (to.y - from.y) * t;
      const key = `${Math.floor(x / 800)}:${Math.floor(y / 800)}`;
      sum += Number(risk[key]) || 0;
    }
    return clamp(sum / (steps + 1));
  }

  function strategicWeight(building) {
    const n = node(building);
    if (!n) return 0;
    let w = ({ airfield: 6, pmto: 5.4, central: 4, warehouse: 3, terminal: 2.8, trade: 1.4 }[n.nodeType] || 2.2);
    if ((building.stats?.produces || []).length) w += 2.2;
    const p = String(n.priority || building.priority || '').toUpperCase();
    if (p === 'CRITICAL') w += 3.5; else if (p === 'HIGH') w += 1.6;
    return w;
  }

  function snapshot(game) {
    const reserve = economy.usableReserve(game, 'enemy');
    const capacity = economy.storageCapacity(game, 'enemy');
    const backlog = economy.backlog(game, 'enemy');
    const stores = storageNodes(game, 'enemy');
    const nodes = logisticsNodes(game, 'enemy');
    const ts = trucks(game, 'enemy');
    const free = freeTrucks(game, 'enemy');
    const front = frontlineUnits(game, 'enemy');
    const recon = reconUnits(game, 'enemy');
    const fields = airfields(game, 'enemy');
    const frontDeficit = sumDeficit(front), reconDeficit = sumDeficit(recon);
    const nodeRows = nodes.map(b => ({ b, demand: demandTotal(b), weight: strategicWeight(b) })).filter(r => r.demand > EPS).sort((a, b) => b.demand * b.weight - a.demand * a.weight || String(a.b.id).localeCompare(String(b.b.id), 'en'));
    const airRows = fields.map(b => ({ b, demand: demandTotal(b) })).filter(r => r.demand > EPS).sort((a, b) => b.demand - a.demand || String(a.b.id).localeCompare(String(b.b.id), 'en'));
    const capTotal = Math.max(1, total(capacity));
    const fill = total(reserve) / capTotal;
    const ratios = Object.fromEntries(L.STOCK_KEYS.map(k => [k, capacity[k] > EPS ? clamp(reserve[k] / capacity[k]) : 1]));
    const ex = extractors(game, 'enemy').sort((a, b) => b.ratio - a.ratio || b.amount - a.amount || String(a.b.id).localeCompare(String(b.b.id), 'en'));
    const credits = Math.max(0, Number(game.teams?.enemy?.credits) || 0);
    return { reserve, capacity, backlog, stores, nodes, trucks: ts, free, front, recon, fields, frontDeficit, reconDeficit, nodeRows, airRows, fill, ratios, extractors: ex, credits };
  }

  function detectProblems(game, s) {
    const problems = [];
    const minRatio = Math.min(s.ratios.fuel, s.ratios.ammo, s.ratios.support);
    if (minRatio < .48) problems.push({ kind: 'STRATEGIC_RESERVE_SHORTAGE', severity: clamp((.48 - minRatio) / .48 + .3) });
    if (total(s.backlog) > 300) problems.push({ kind: 'EXTRACTION_BACKLOG', severity: clamp(total(s.backlog) / 16000) });
    if (s.fill > .82 || (s.extractors.some(r => r.ratio > .78) && s.fill > .68)) problems.push({ kind: 'STORAGE_CAPACITY_PRESSURE', severity: clamp((s.fill - .65) / .35) });
    if (s.nodeRows.some(r => r.demand > 800 && strategicWeight(r.b) >= 4)) problems.push({ kind: 'REAR_CRITICAL_NODE_SHORTAGE', severity: clamp((s.nodeRows[0]?.demand || 0) / 4500) });
    if (total(s.frontDeficit) > 180) problems.push({ kind: 'FRONTLINE_SHORTAGE', severity: clamp(total(s.frontDeficit) / 7000) });
    if (total(s.reconDeficit) > 45) problems.push({ kind: 'RECON_SHORTAGE', severity: clamp(total(s.reconDeficit) / 1400) });
    if (s.airRows.some(r => r.demand > 100)) problems.push({ kind: 'AVIATION_LOGISTICS_SHORTAGE', severity: clamp((s.airRows[0]?.demand || 0) / 4500) });
    const desiredTrucks = Math.max(3, Math.min(24, Math.ceil(s.extractors.length * 1.2 + s.nodes.length / 3 + s.front.length / 18 + s.fields.length / 2 + 1)));
    if (s.trucks.length < desiredTrucks) problems.push({ kind: 'TRUCK_FLEET_SHORTAGE', severity: clamp((desiredTrucks - s.trucks.length) / desiredTrucks + .25), desiredTrucks });
    const risks = Object.values(L.ensureGame(game)?.routeRisk || {}).map(Number).filter(Number.isFinite);
    const peakRisk = risks.length ? Math.max(...risks) : 0;
    if (peakRisk > .25) problems.push({ kind: 'ROUTE_RISK', severity: clamp(peakRisk), peakRisk });
    if ((minRatio < .35 || total(s.frontDeficit) > 3500) && s.front.length >= 6) problems.push({ kind: 'OPERATION_READINESS', severity: clamp(.55 + (.35 - Math.min(.35, minRatio))) });
    if (!problems.length) problems.push({ kind: 'BALANCED_OPTIMIZATION', severity: .25 });
    return problems.sort((a, b) => b.severity - a.severity || a.kind.localeCompare(b.kind, 'en'));
  }

  function modeFor(problem, s) {
    if (['FRONTLINE_SHORTAGE', 'RECON_SHORTAGE', 'AVIATION_LOGISTICS_SHORTAGE', 'OPERATION_READINESS'].includes(problem.kind) && problem.severity > .55) return 'URGENT';
    if (['EXTRACTION_BACKLOG', 'STORAGE_CAPACITY_PRESSURE', 'TRUCK_FLEET_SHORTAGE'].includes(problem.kind)) return 'THROUGHPUT';
    if (s.credits < 9000) return 'ECONOMY';
    return 'BALANCED';
  }
  const WEIGHTS = Object.freeze({
    URGENT:     Object.freeze({ speed: .34, throughput: .20, strategic: .25, resilience: .09, cost: .04, risk: .08 }),
    THROUGHPUT: Object.freeze({ speed: .15, throughput: .34, strategic: .18, resilience: .16, cost: .08, risk: .09 }),
    ECONOMY:    Object.freeze({ speed: .12, throughput: .16, strategic: .18, resilience: .15, cost: .31, risk: .08 }),
    BALANCED:   Object.freeze({ speed: .19, throughput: .23, strategic: .23, resilience: .14, cost: .11, risk: .10 }),
  });
  function scoreCandidate(candidate, problem, mode) {
    const w = WEIGHTS[mode] || WEIGHTS.BALANCED;
    const metrics = candidate.metrics;
    const relevance = clamp(candidate.relevance?.[problem.kind] ?? candidate.relevance?.DEFAULT ?? .5);
    const base = metrics.speed * w.speed + metrics.throughput * w.throughput + metrics.strategic * w.strategic + metrics.resilience * w.resilience + (1 - metrics.cost) * w.cost + (1 - metrics.risk) * w.risk;
    const feasibility = candidate.feasible ? 1 : .08;
    const tie = (stableHash(`${problem.kind}:${candidate.type}:${candidate.targetId || ''}`) % 997) / 1000000;
    return round((base * (.55 + relevance * .45) * feasibility * (.75 + problem.severity * .25)) + tie);
  }

  function missionCandidate(type, problem, mode, data, execute, relevance, metrics, feasible = true, reason = null) {
    const c = { type, targetId: data?.targetId || null, data: data || {}, feasible: Boolean(feasible), reason: reason || null, relevance, metrics: {
      speed: clamp(metrics.speed), cost: clamp(metrics.cost), risk: clamp(metrics.risk), throughput: clamp(metrics.throughput), strategic: clamp(metrics.strategic), resilience: clamp(metrics.resilience),
    }, execute };
    c.score = scoreCandidate(c, problem, mode);
    return c;
  }

  function nearestTruck(s, target, highestCapacity = false) {
    const list = [...s.free];
    list.sort((a, b) => {
      if (highestCapacity) {
        const ca = Number(L.ensureUnit(a, false)?.cargoCapacity) || 0, cb = Number(L.ensureUnit(b, false)?.cargoCapacity) || 0;
        if (cb !== ca) return cb - ca;
      }
      return dist(a, target) - dist(b, target) || String(a.id).localeCompare(String(b.id), 'en');
    });
    return list[0] || null;
  }
  function setMission(game, truckIds, payload) {
    if (!truckIds?.length || typeof game.setLogisticsMission206 !== 'function') return false;
    return Boolean(game.setLogisticsMission206({ truckIds, ...payload }));
  }
  function sourceDestinationPair(s) {
    let best = null;
    for (const source of s.stores) for (const destination of s.stores) {
      if (source === destination) continue;
      const sn = node(source), dn = node(destination);
      for (const key of L.STOCK_KEYS) {
        const sMax = Number(sn?.stock?.[`${key}Max`]) || 0, dMax = Number(dn?.stock?.[`${key}Max`]) || 0;
        if (sMax <= EPS || dMax <= EPS) continue;
        const sr = (Number(sn.stock[key]) || 0) / sMax, dr = (Number(dn.stock[key]) || 0) / dMax;
        const gap = sr - dr;
        if (gap < .38 || dr > .5) continue;
        const value = gap * 1000 - dist(source, destination) * .01;
        if (!best || value > best.value) best = { source, destination, key, gap, value };
      }
    }
    return best;
  }
  function tradeContract(game, key, emergency = true) {
    const trades = logisticsNodes(game, 'enemy').filter(b => node(b)?.nodeType === 'trade');
    for (const b of trades) {
      const t = game.ensureTradeState206?.(b), contract = t?.[key];
      if (!contract) continue;
      const cap = Math.max(1, economy.storageCapacity(game, 'enemy')[key] || 1);
      contract.mode = emergency ? 'EMERGENCY_PURCHASE' : 'MAINTAIN_STOCK';
      contract.targetAmount = Math.max(Number(contract.targetAmount) || 0, Math.round(cap * (emergency ? .58 : .7)));
      contract.nextExecution = Math.min(Number(contract.nextExecution) || Number(game.time) || 0, Number(game.time) || 0);
      return true;
    }
    return false;
  }

  function buildAlternatives(ai, problem, s) {
    const game = ai.game, mode = modeFor(problem, s), out = [];
    const critical = s.nodeRows[0]?.b || null;
    const frontPoint = centroid(s.front), reconPoint = centroid(s.recon);
    const frontGroup = s.front.find(u => groupId(u)) ? groupId(s.front.find(u => groupId(u))) : null;
    const reconGroup = s.recon.find(u => groupId(u)) ? groupId(s.recon.find(u => groupId(u))) : null;
    const field = s.airRows[0]?.b || s.fields[0] || null;
    const saturated = s.extractors[0] || null;
    const pair = sourceDestinationPair(s);
    const truckNearCritical = critical ? nearestTruck(s, critical, false) : null;
    const highCapacity = critical ? nearestTruck(s, critical, true) : null;
    const frontTruck = frontPoint ? nearestTruck(s, frontPoint, false) : null;
    const reconTruck = reconPoint ? nearestTruck(s, reconPoint, false) : null;
    const airTruck = field ? nearestTruck(s, field, false) : null;
    const exTruck = saturated ? nearestTruck(s, saturated.b, false) : null;
    const averageRisk = target => target && s.free.length ? routeRisk(game, nearestTruck(s, target), target) : 0;

    out.push(missionCandidate('DIRECT_CRITICAL_NODE', problem, mode, { targetId: critical?.id, truckId: truckNearCritical?.id }, () => setMission(game, [truckNearCritical?.id].filter(Boolean), { missionType: 'SUPPLY_BUILDING', destinationNodeId: critical?.id, homeNodeId: L.ensureUnit(truckNearCritical, false)?.homeNodeId || critical?.id }), { REAR_CRITICAL_NODE_SHORTAGE: 1, AVIATION_LOGISTICS_SHORTAGE: .65, DEFAULT: .58 }, { speed: .92, cost: .12, risk: averageRisk(critical), throughput: .52, strategic: critical ? clamp(strategicWeight(critical) / 9) : 0, resilience: .46 }, Boolean(critical && truckNearCritical), !critical ? 'NO_CRITICAL_NODE' : 'NO_FREE_TRUCK'));
    out.push(missionCandidate('NEAREST_TRUCK_SHUTTLE', problem, mode, { targetId: critical?.id, truckId: truckNearCritical?.id }, () => setMission(game, [truckNearCritical?.id].filter(Boolean), { missionType: 'SUPPLY_BUILDING', destinationNodeId: critical?.id }), { STRATEGIC_RESERVE_SHORTAGE: .72, REAR_CRITICAL_NODE_SHORTAGE: .92, DEFAULT: .62 }, { speed: .96, cost: .1, risk: averageRisk(critical), throughput: .46, strategic: .72, resilience: .38 }, Boolean(critical && truckNearCritical), !critical ? 'NO_DEMAND_TARGET' : 'NO_FREE_TRUCK'));
    out.push(missionCandidate('HIGH_CAPACITY_SHUTTLE', problem, mode, { targetId: critical?.id, truckId: highCapacity?.id }, () => setMission(game, [highCapacity?.id].filter(Boolean), { missionType: 'SUPPLY_BUILDING', destinationNodeId: critical?.id }), { REAR_CRITICAL_NODE_SHORTAGE: .9, STRATEGIC_RESERVE_SHORTAGE: .68, DEFAULT: .64 }, { speed: .68, cost: .11, risk: averageRisk(critical), throughput: .88, strategic: .74, resilience: .5 }, Boolean(critical && highCapacity), !critical ? 'NO_DEMAND_TARGET' : 'NO_FREE_TRUCK'));

    const topNodes = s.nodeRows.slice(0, 2), twoTrucks = s.free.slice(0, 2);
    out.push(missionCandidate('MULTI_NODE_DISTRIBUTION', problem, mode, { targetId: topNodes.map(x => x.b.id).join(','), truckIds: twoTrucks.map(t => t.id) }, () => {
      if (topNodes.length < 2 || twoTrucks.length < 2) return false;
      return topNodes.every((row, i) => setMission(game, [twoTrucks[i].id], { missionType: 'SUPPLY_BUILDING', destinationNodeId: row.b.id }));
    }, { REAR_CRITICAL_NODE_SHORTAGE: .94, STRATEGIC_RESERVE_SHORTAGE: .7, DEFAULT: .58 }, { speed: .74, cost: .2, risk: topNodes.length ? Math.max(...topNodes.map(r => averageRisk(r.b))) : 0, throughput: .94, strategic: .86, resilience: .8 }, topNodes.length >= 2 && twoTrucks.length >= 2, topNodes.length < 2 ? 'FEWER_THAN_TWO_TARGETS' : 'FEWER_THAN_TWO_FREE_TRUCKS'));

    out.push(missionCandidate('FRONTLINE_GROUP_DIRECT', problem, mode, { targetId: frontGroup, truckId: frontTruck?.id }, () => setMission(game, [frontTruck?.id].filter(Boolean), { missionType: 'SUPPLY_GROUP', targetGroupId: frontGroup, serviceRadius: 680 }), { FRONTLINE_SHORTAGE: 1, OPERATION_READINESS: .94, DEFAULT: .34 }, { speed: .83, cost: .15, risk: averageRisk(frontPoint), throughput: .72, strategic: .92, resilience: .7 }, Boolean(frontGroup && frontTruck), !frontGroup ? 'NO_FRONTLINE_GROUP' : 'NO_FREE_TRUCK'));
    out.push(missionCandidate('FRONTLINE_AREA_SHUTTLE', problem, mode, { targetId: frontPoint ? `${round(frontPoint.x)}:${round(frontPoint.y)}` : null, truckId: frontTruck?.id }, () => setMission(game, [frontTruck?.id].filter(Boolean), { missionType: 'SUPPLY_AREA', targetX: frontPoint?.x, targetY: frontPoint?.y, serviceRadius: 760 }), { FRONTLINE_SHORTAGE: 1, OPERATION_READINESS: .9, DEFAULT: .36 }, { speed: .9, cost: .14, risk: averageRisk(frontPoint), throughput: .67, strategic: .9, resilience: .62 }, Boolean(frontPoint && frontTruck), !frontPoint ? 'NO_FRONTLINE' : 'NO_FREE_TRUCK'));
    const convoy = frontPoint ? [...s.free].sort((a, b) => dist(a, frontPoint) - dist(b, frontPoint)).slice(0, 2) : [];
    out.push(missionCandidate('FRONTLINE_TWO_TRUCK_CONVOY', problem, mode, { targetId: frontPoint ? `${round(frontPoint.x)}:${round(frontPoint.y)}` : null, truckIds: convoy.map(t => t.id) }, () => setMission(game, convoy.map(t => t.id), { missionType: 'SUPPLY_AREA', targetX: frontPoint?.x, targetY: frontPoint?.y, serviceRadius: 850 }), { FRONTLINE_SHORTAGE: .98, OPERATION_READINESS: 1, ROUTE_RISK: .75, DEFAULT: .3 }, { speed: .67, cost: .27, risk: averageRisk(frontPoint) * .82, throughput: 1, strategic: .96, resilience: .9 }, Boolean(frontPoint && convoy.length >= 2), !frontPoint ? 'NO_FRONTLINE' : 'FEWER_THAN_TWO_FREE_TRUCKS'));

    out.push(missionCandidate('RECON_GROUP_DIRECT', problem, mode, { targetId: reconGroup, truckId: reconTruck?.id }, () => setMission(game, [reconTruck?.id].filter(Boolean), { missionType: 'SUPPLY_GROUP', targetGroupId: reconGroup, serviceRadius: 500 }), { RECON_SHORTAGE: 1, ROUTE_RISK: .5, DEFAULT: .2 }, { speed: .84, cost: .1, risk: averageRisk(reconPoint), throughput: .36, strategic: .7, resilience: .57 }, Boolean(reconGroup && reconTruck), !reconGroup ? 'NO_RECON_GROUP' : 'NO_FREE_TRUCK'));
    out.push(missionCandidate('RECON_AREA_CACHE', problem, mode, { targetId: reconPoint ? `${round(reconPoint.x)}:${round(reconPoint.y)}` : null, truckId: reconTruck?.id }, () => setMission(game, [reconTruck?.id].filter(Boolean), { missionType: 'SUPPLY_AREA', targetX: reconPoint?.x, targetY: reconPoint?.y, serviceRadius: 480 }), { RECON_SHORTAGE: 1, ROUTE_RISK: .55, DEFAULT: .24 }, { speed: .92, cost: .08, risk: averageRisk(reconPoint), throughput: .31, strategic: .68, resilience: .5 }, Boolean(reconPoint && reconTruck), !reconPoint ? 'NO_GROUND_RECON' : 'NO_FREE_TRUCK'));

    out.push(missionCandidate('AIRFIELD_PRIORITY', problem, mode, { targetId: field?.id, truckId: airTruck?.id }, () => setMission(game, [airTruck?.id].filter(Boolean), { missionType: 'SUPPLY_BUILDING', destinationNodeId: field?.id }), { AVIATION_LOGISTICS_SHORTAGE: 1, OPERATION_READINESS: .72, DEFAULT: .28 }, { speed: .88, cost: .14, risk: averageRisk(field), throughput: .76, strategic: .98, resilience: .72 }, Boolean(field && airTruck), !field ? 'NO_AIRFIELD_DEMAND' : 'NO_FREE_TRUCK'));

    out.push(missionCandidate('EXTRACTOR_SURGE', problem, mode, { targetId: saturated?.b?.id, truckId: exTruck?.id }, () => setMission(game, [exTruck?.id].filter(Boolean), { missionType: 'EXTRACT_RESOURCE', sourceNodeId: saturated?.b?.id, destinationNodeId: null, homeNodeId: L.ensureUnit(exTruck, false)?.homeNodeId || null }), { EXTRACTION_BACKLOG: 1, STORAGE_CAPACITY_PRESSURE: .45, STRATEGIC_RESERVE_SHORTAGE: .7, DEFAULT: .33 }, { speed: .82, cost: .1, risk: averageRisk(saturated?.b), throughput: .88, strategic: .68, resilience: .57 }, Boolean(saturated && exTruck), !saturated ? 'NO_EXTRACTOR_BACKLOG' : 'NO_FREE_TRUCK'));

    const transferTruck = pair ? nearestTruck(s, pair.source, false) : null;
    out.push(missionCandidate('STORAGE_REBALANCE_TRANSFER', problem, mode, { targetId: pair?.destination?.id, sourceId: pair?.source?.id, truckId: transferTruck?.id, resource: pair?.key }, () => setMission(game, [transferTruck?.id].filter(Boolean), { missionType: 'MANUAL_TRANSFER', sourceNodeId: pair?.source?.id, destinationNodeId: pair?.destination?.id, homeNodeId: pair?.source?.id }), { STRATEGIC_RESERVE_SHORTAGE: .86, REAR_CRITICAL_NODE_SHORTAGE: .78, ROUTE_RISK: .4, DEFAULT: .52 }, { speed: .66, cost: .06, risk: pair ? routeRisk(game, pair.source, pair.destination) : 0, throughput: .67, strategic: .76, resilience: .88 }, Boolean(pair && transferTruck), !pair ? 'NO_USEFUL_STORAGE_IMBALANCE' : 'NO_FREE_TRUCK'));

    const producer = (game.buildings || []).filter(b => b?.alive && b.completed && b.team === 'enemy' && b.stats?.produces?.includes('resourceTruck')).sort((a, b) => (a.queue?.length || 0) - (b.queue?.length || 0) || String(a.id).localeCompare(String(b.id), 'en'))[0];
    out.push(missionCandidate('QUEUE_RESOURCE_TRUCK', problem, mode, { targetId: producer?.id }, () => Boolean(producer && (producer.queue?.length || 0) < 3 && game.queueProduction?.(producer, 'resourceTruck', 'unit', true)), { TRUCK_FLEET_SHORTAGE: 1, EXTRACTION_BACKLOG: .72, FRONTLINE_SHORTAGE: .6, DEFAULT: .45 }, { speed: .3, cost: .58, risk: 0, throughput: .86, strategic: .7, resilience: .92 }, Boolean(producer && (producer.queue?.length || 0) < 3), !producer ? 'NO_TRUCK_PRODUCER' : 'PRODUCTION_QUEUE_FULL'));

    const storageType = D.BUILDING_TYPES?.resourceSilo ? 'resourceSilo' : D.BUILDING_TYPES?.logisticsHub ? 'logisticsHub' : null;
    out.push(missionCandidate('BUILD_LOGISTICS_CAPACITY', problem, mode, { targetId: storageType }, () => Boolean(storageType && ai.buildPlanned79?.(storageType)), { STORAGE_CAPACITY_PRESSURE: 1, EXTRACTION_BACKLOG: .74, STRATEGIC_RESERVE_SHORTAGE: .48, DEFAULT: .32 }, { speed: .2, cost: .68, risk: .08, throughput: .9, strategic: .73, resilience: 1 }, Boolean(storageType && typeof ai.buildPlanned79 === 'function'), !storageType ? 'NO_STORAGE_BUILDING_TYPE' : 'NO_BUILD_PLANNER'));

    const fuelLow = s.ratios.fuel < .55;
    out.push(missionCandidate('EMERGENCY_PURCHASE_FUEL', problem, mode, { targetId: 'fuel' }, () => tradeContract(game, 'fuel', true), { STRATEGIC_RESERVE_SHORTAGE: 1, FRONTLINE_SHORTAGE: .68, AVIATION_LOGISTICS_SHORTAGE: .82, DEFAULT: .38 }, { speed: .98, cost: .88, risk: .02, throughput: .72, strategic: .86, resilience: .42 }, fuelLow && logisticsNodes(game, 'enemy').some(b => node(b)?.nodeType === 'trade'), fuelLow ? 'NO_TRADE_CENTER' : 'FUEL_RESERVE_NOT_LOW'));
    const ammoLow = s.ratios.ammo < .55;
    out.push(missionCandidate('EMERGENCY_PURCHASE_AMMO', problem, mode, { targetId: 'ammo' }, () => tradeContract(game, 'ammo', true), { STRATEGIC_RESERVE_SHORTAGE: 1, FRONTLINE_SHORTAGE: .8, OPERATION_READINESS: .76, DEFAULT: .38 }, { speed: .98, cost: .9, risk: .02, throughput: .72, strategic: .9, resilience: .4 }, ammoLow && logisticsNodes(game, 'enemy').some(b => node(b)?.nodeType === 'trade'), ammoLow ? 'NO_TRADE_CENTER' : 'AMMO_RESERVE_NOT_LOW'));

    const reserveTruck = s.free[s.free.length - 1] || null;
    const urgentTarget = frontPoint || critical || field;
    out.push(missionCandidate('RELEASE_MOBILE_RESERVE', problem, mode, { targetId: urgentTarget?.id || (frontPoint ? 'frontline' : null), truckId: reserveTruck?.id }, () => {
      if (!reserveTruck || !urgentTarget) return false;
      if (frontPoint && urgentTarget === frontPoint) return setMission(game, [reserveTruck.id], { missionType: 'SUPPLY_AREA', targetX: frontPoint.x, targetY: frontPoint.y, serviceRadius: 720 });
      return setMission(game, [reserveTruck.id], { missionType: 'SUPPLY_BUILDING', destinationNodeId: urgentTarget.id });
    }, { FRONTLINE_SHORTAGE: .91, OPERATION_READINESS: .95, REAR_CRITICAL_NODE_SHORTAGE: .7, DEFAULT: .25 }, { speed: .97, cost: .08, risk: averageRisk(urgentTarget), throughput: .51, strategic: .92, resilience: .22 }, Boolean(problem.severity > .68 && reserveTruck && urgentTarget), problem.severity <= .68 ? 'NOT_EMERGENCY' : 'NO_MOBILE_RESERVE'));

    const minRatio = Math.min(s.ratios.fuel, s.ratios.ammo, s.ratios.support);
    out.push(missionCandidate('HOLD_OPERATION_FOR_RESERVE', problem, mode, { targetId: 'operations' }, () => {
      ai.operationTimer126 = Math.min(Number(ai.operationTimer126) || 10, 10);
      return true;
    }, { OPERATION_READINESS: 1, STRATEGIC_RESERVE_SHORTAGE: .84, ROUTE_RISK: .54, DEFAULT: .15 }, { speed: .99, cost: 0, risk: 0, throughput: .08, strategic: .8, resilience: 1 }, Boolean(minRatio < .4 || problem.kind === 'OPERATION_READINESS'), 'READINESS_SUFFICIENT'));

    out.sort((a, b) => b.score - a.score || a.type.localeCompare(b.type, 'en'));
    return { mode, alternatives: out };
  }

  function summarizeCandidate(c) {
    return { type: c.type, targetId: c.targetId, feasible: c.feasible, reason: c.reason, score: c.score, metrics: c.metrics, data: c.data };
  }

  function evaluate(ai, execute = true) {
    const game = ai?.game;
    if (!game) return null;
    const s = snapshot(game), problems = detectProblems(game, s);
    const plans = problems.map(problem => {
      const built = buildAlternatives(ai, problem, s);
      return { ...problem, mode: built.mode, alternatives: built.alternatives.map(summarizeCandidate), _raw: built.alternatives };
    });
    let selected = null, executed = false;
    const now = Number(game.time) || 0;
    const nextAllowed = Number(ai._nextAdaptiveLogisticsStrategy) || -Infinity;
    if (execute && now + EPS >= nextAllowed) {
      const mostSevere = plans[0];
      const candidate = mostSevere?._raw?.find(c => c.feasible);
      if (candidate) {
        try { executed = Boolean(candidate.execute?.()); } catch (_) { executed = false; }
        selected = { problem: mostSevere.kind, mode: mostSevere.mode, ...summarizeCandidate(candidate), executed };
        ai._nextAdaptiveLogisticsStrategy = now + (executed ? .9 : .35);
      }
    }
    const cleanPlans = plans.map(({ _raw, ...p }) => p);
    const diag = {
      tick: Number(game.simTick) || 0,
      time: round(game.time),
      alternativesMinimum: MIN_ALTERNATIVES,
      candidateTypes: ACTION_TYPES,
      snapshot: {
        reserve: s.reserve, capacity: s.capacity, backlog: s.backlog, reserveRatios: s.ratios,
        trucks: s.trucks.length, freeTrucks: s.free.length, frontlineUnits: s.front.length,
        frontlineDeficit: s.frontDeficit, reconUnits: s.recon.length, reconDeficit: s.reconDeficit,
        airfields: s.fields.length, airfieldDemand: round(s.airRows.reduce((sum, r) => sum + r.demand, 0)), credits: s.credits,
      },
      problems: cleanPlans,
      selected,
    };
    game.__aiLogisticsStrategy = diag;
    return diag;
  }

  const baseManage = TacticalAI.prototype.managePhysicalLogistics206;
  TacticalAI.prototype.managePhysicalLogistics206 = function(...args) {
    const result = typeof baseManage === 'function' ? baseManage.apply(this, args) : {};
    evaluate(this, true);
    return result;
  };

  root.__FD_AI_LOGISTICS_STRATEGY__ = Object.freeze({
    multiOptionPlanning: true,
    minimumAlternatives: MIN_ALTERNATIVES,
    deterministicScoring: true,
    physicalLogisticsOnly: true,
    rearLogistics: true,
    frontlineLogistics: true,
    reconnaissanceLogistics: true,
    aviationLogistics: true,
    routeRiskAware: true,
    speedCostThroughputTradeoff: true,
    candidateTypes: ACTION_TYPES,
    evaluate(ai, execute = false) { return evaluate(ai, execute); },
    diagnostics(game) { return game?.__aiLogisticsStrategy || null; },
  });
})();
