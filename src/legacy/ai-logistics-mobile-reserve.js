// requires: __FD_DEBUG__, __FD_LOGISTICS206__, __FD_AI_ECONOMY_LOGISTICS__
// provides: __FD_AI_LOGISTICS_MOBILE_RESERVE__
(() => {
  'use strict';
  const root = typeof window !== 'undefined' ? window : self;
  const D = root.__FD_DEBUG__;
  const L = root.__FD_LOGISTICS206__;
  const economy = root.__FD_AI_ECONOMY_LOGISTICS__;
  const Game = D?.Game;
  if (!Game || !L || !economy || root.__FD_AI_LOGISTICS_MOBILE_RESERVE__) return;

  const PROTECTED = new Set(['SUPPLY_AREA', 'SUPPLY_GROUP', 'MANUAL_TRANSFER']);
  const EPS = 1e-6;
  const round = v => L.round?.(v) ?? Math.round((Number(v) || 0) * 1000) / 1000;

  function config(game) {
    return economy.configurations?.[game?.difficultyKey] || economy.configurations?.normal || { reserveTruck: 1, saturation: .58 };
  }
  function state(truck) { return L.ensureUnit(truck, false); }
  function protectedMission(truck) {
    const s = state(truck);
    return Boolean(s && PROTECTED.has(s.missionType));
  }
  function cargoTotal(truck) {
    return L.manifestTotal?.(state(truck)?.cargo || {}) || 0;
  }
  function extractorPressure(game, truck) {
    const s = state(truck), source = game.getEntity?.(s?.sourceNodeId);
    if (!source?.alive || !L.ensureExtractor(source)) return 0;
    const amount = Math.max(0, Number(source.resourceBuffer83) || 0);
    const cap = Math.max(1, Number(source.resourceBufferMax206 || source.stats?.bufferCapacity) || 1);
    return amount / cap;
  }
  function destinationPressure(game, truck) {
    const s = state(truck), destination = game.getEntity?.(s?.destinationNodeId);
    if (!destination?.alive) return 0;
    const n = L.ensureNode(destination);
    if (!n?.stock) return 0;
    return L.manifestTotal(L.computeDemand(n.stock, n.thresholds, n.priority));
  }
  function reserveReady(truck) {
    const s = state(truck);
    if (!s || protectedMission(truck) || s.missionType === 'EXTRACT_RESOURCE') return false;
    if (['WAITING', 'WAITING_DEMAND', 'WAITING_DESTINATION', 'IDLE', 'ASSIGNED'].includes(s.status)) return true;
    return s.missionType === 'AUTO' && ['PLAN', 'WAIT_SOURCE', 'WAIT_DESTINATION'].includes(s.phase206);
  }
  function interruptCost(game, truck) {
    const s = state(truck);
    if (!s || protectedMission(truck)) return Infinity;
    if (reserveReady(truck)) return -1000;
    const cargoPenalty = Math.min(400, cargoTotal(truck) * .04);
    if (s.missionType === 'SUPPLY_BUILDING') return 50 + Math.min(900, destinationPressure(game, truck) * .08) + cargoPenalty;
    if (s.missionType === 'EXTRACT_RESOURCE') return 260 + extractorPressure(game, truck) * 900 + cargoPenalty;
    if (s.missionType === 'RETURN_TO_SOURCE' || s.missionType === 'AUTO') return 10 + cargoPenalty;
    return 180 + cargoPenalty;
  }
  function reclaim(game, truck) {
    const s = state(truck);
    if (!s || protectedMission(truck)) return false;
    const previous = { missionType: s.missionType, sourceNodeId: s.sourceNodeId || null, destinationNodeId: s.destinationNodeId || null, status: s.status || null };
    const home = s.homeNodeId || s.sourceNodeId || s.destinationNodeId || null;
    const ok = Boolean(game.setLogisticsMission206?.({
      truckIds: [truck.id],
      missionType: 'AUTO',
      homeNodeId: home,
      sourceNodeId: null,
      destinationNodeId: null,
    }));
    if (!ok) return false;
    const next = state(truck);
    next.adaptiveReserve214 = true;
    next.adaptiveReservePrevious214 = previous;
    next.adaptiveReserveAt214 = Number(game.time) || 0;
    return true;
  }

  function maintain(game) {
    const c = config(game);
    const all = (game.units || []).filter(u => u?.alive && u.team === 'enemy' && L.isTruck(u)).sort((a, b) => String(a.id).localeCompare(String(b.id), 'en'));
    for (const truck of all) {
      const s = state(truck);
      if (s?.adaptiveReserve214 && !reserveReady(truck)) s.adaptiveReserve214 = false;
    }
    const protectedCount = all.filter(protectedMission).length;
    const eligible = all.filter(t => !protectedMission(t));
    const target = Math.max(0, Math.min(Number(c.reserveTruck) || 1, eligible.length));
    let ready = eligible.filter(reserveReady);
    const reclaimed = [];
    if (ready.length < target) {
      const candidates = eligible.filter(t => !reserveReady(t)).map(t => ({ t, cost: interruptCost(game, t) })).filter(r => Number.isFinite(r.cost)).sort((a, b) => a.cost - b.cost || String(a.t.id).localeCompare(String(b.t.id), 'en'));
      for (const row of candidates) {
        if (ready.length >= target) break;
        if (!reclaim(game, row.t)) continue;
        ready.push(row.t);
        reclaimed.push({ truckId: row.t.id, interruptCost: round(row.cost), previous: state(row.t)?.adaptiveReservePrevious214 || null });
      }
    }
    const diag = {
      tick: Number(game.simTick) || 0,
      target,
      ready: ready.length,
      readyTruckIds: ready.map(t => t.id),
      protectedCount,
      protectedTruckIds: all.filter(protectedMission).map(t => t.id),
      reclaimed,
    };
    game.__aiLogisticsMobileReserve = diag;
    return diag;
  }

  function reservePostHook() { maintain(this); }
  const postHookRegistered = typeof Game.prototype.registerLogisticsHook206 === 'function'
    ? Boolean(Game.prototype.registerLogisticsHook206('post', reservePostHook, 96))
    : false;

  root.__FD_AI_LOGISTICS_MOBILE_RESERVE__ = Object.freeze({
    active: true,
    deterministic: true,
    physicalReassignmentOnly: true,
    protectedFieldMissions: true,
    postHookRegistered,
    maintain,
    diagnostics(game) { return game?.__aiLogisticsMobileReserve || null; },
  });
})();
