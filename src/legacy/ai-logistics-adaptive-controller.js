// requires: __FD_DEBUG__, __FD_LOGISTICS206__, __FD_AI_ECONOMY_LOGISTICS__, __FD_AI_LOGISTICS_STRATEGY__
// provides: __FD_AI_LOGISTICS_ADAPTIVE__
(() => {
  'use strict';
  const root = typeof window !== 'undefined' ? window : self;
  const D = root.__FD_DEBUG__;
  const L = root.__FD_LOGISTICS206__;
  const economy = root.__FD_AI_ECONOMY_LOGISTICS__;
  const strategy = root.__FD_AI_LOGISTICS_STRATEGY__;
  const Game = D?.Game;
  if (!Game || !L || !economy || !strategy || root.__FD_AI_LOGISTICS_ADAPTIVE__) return;

  const MIN_ALTERNATIVES = 10;
  const REPLAN_INTERVAL_TICKS = 25;
  const OBJECTIVES = Object.freeze({
    FASTEST: Object.freeze({ speed: .58, throughput: .12, strategic: .16, resilience: .04, cost: .02, risk: .08 }),
    MAX_THROUGHPUT: Object.freeze({ speed: .08, throughput: .58, strategic: .10, resilience: .12, cost: .04, risk: .08 }),
    ECONOMICAL: Object.freeze({ speed: .07, throughput: .12, strategic: .10, resilience: .10, cost: .53, risk: .08 }),
    RESILIENT: Object.freeze({ speed: .07, throughput: .16, strategic: .15, resilience: .47, cost: .05, risk: .10 }),
    LOW_RISK: Object.freeze({ speed: .10, throughput: .10, strategic: .17, resilience: .18, cost: .05, risk: .40 }),
    BALANCED: Object.freeze({ speed: .19, throughput: .23, strategic: .23, resilience: .14, cost: .11, risk: .10 }),
  });
  const clamp = v => Math.max(0, Math.min(1, Number(v) || 0));
  const round = v => L.round?.(v) ?? Math.round((Number(v) || 0) * 1000) / 1000;
  const q = (v, step = .05) => Math.round((Number(v) || 0) / step) * step;

  function utility(candidate, objective) {
    const w = OBJECTIVES[objective] || OBJECTIVES.BALANCED;
    const m = candidate?.metrics || {};
    return round(
      clamp(m.speed) * w.speed +
      clamp(m.throughput) * w.throughput +
      clamp(m.strategic) * w.strategic +
      clamp(m.resilience) * w.resilience +
      (1 - clamp(m.cost)) * w.cost +
      (1 - clamp(m.risk)) * w.risk
    );
  }

  function leader(alternatives, objective) {
    const pool = (alternatives || []).filter(a => a?.feasible);
    const rows = pool.length ? pool : (alternatives || []);
    return [...rows].sort((a, b) => utility(b, objective) - utility(a, objective) || (Number(b.score) || 0) - (Number(a.score) || 0) || String(a.type).localeCompare(String(b.type), 'en'))[0] || null;
  }

  function contextObjective(problem) {
    if (problem?.kind === 'ROUTE_RISK') return 'LOW_RISK';
    if (problem?.mode === 'URGENT') return 'FASTEST';
    if (problem?.mode === 'THROUGHPUT') return 'MAX_THROUGHPUT';
    if (problem?.mode === 'ECONOMY') return 'ECONOMICAL';
    if (problem?.kind === 'OPERATION_READINESS') return 'RESILIENT';
    return 'BALANCED';
  }

  function decorateProblem(problem) {
    const alternatives = problem?.alternatives || [];
    const feasible = alternatives.filter(a => a?.feasible);
    const objectiveLeaders = {};
    for (const objective of Object.keys(OBJECTIVES)) {
      const best = leader(alternatives, objective);
      objectiveLeaders[objective] = best ? { type: best.type, targetId: best.targetId || null, score: best.score, utility: utility(best, objective), metrics: best.metrics } : null;
    }
    const objective = contextObjective(problem);
    const contextLeader = alternatives.find(a => a?.feasible) || alternatives[0] || null;
    return {
      ...problem,
      alternativesCount: alternatives.length,
      distinctAlternatives: new Set(alternatives.map(a => a?.type).filter(Boolean)).size,
      feasibleAlternatives: feasible.length,
      contextObjective: objective,
      contextLeader: contextLeader ? { type: contextLeader.type, targetId: contextLeader.targetId || null, score: contextLeader.score, metrics: contextLeader.metrics } : null,
      objectiveLeaders,
    };
  }

  function decorate(game, raw, reason = 'MANUAL') {
    if (!raw) return null;
    const problems = (raw.problems || []).map(decorateProblem);
    const valid = problems.every(p => p.alternativesCount >= MIN_ALTERNATIVES && p.distinctAlternatives >= MIN_ALTERNATIVES);
    const diag = {
      ...raw,
      problems,
      plannerValid: valid,
      controller: {
        reason,
        replanIntervalTicks: REPLAN_INTERVAL_TICKS,
        minimumAlternativesPerProblem: MIN_ALTERNATIVES,
        objectives: Object.keys(OBJECTIVES),
        changeResponsive: true,
        protectedMissionAware: true,
        rearLogistics: true,
        frontlineLogistics: true,
        reconnaissanceLogistics: true,
        aviationLogistics: true,
      },
    };
    game.__aiLogisticsStrategy = diag;
    return diag;
  }

  function situationSignature(game) {
    const reserve = economy.usableReserve(game, 'enemy');
    const capacity = economy.storageCapacity(game, 'enemy');
    const backlog = economy.backlog(game, 'enemy');
    const ratios = L.STOCK_KEYS.map(k => q((Number(reserve[k]) || 0) / Math.max(1, Number(capacity[k]) || 1), .05));
    const trucks = (game.units || []).filter(u => u?.alive && u.team === 'enemy' && L.isTruck(u));
    const protectedCount = trucks.filter(u => ['SUPPLY_AREA', 'SUPPLY_GROUP', 'MANUAL_TRANSFER'].includes(L.ensureUnit(u, false)?.missionType)).length;
    const lowUnits = (game.units || []).filter(u => {
      if (!u?.alive || u.team !== 'enemy' || u.air || L.isTruck(u) || u.typeId === 'worker') return false;
      const s = L.ensureUnit(u, false); if (!s) return false;
      const fuel = s.fuelMax > 0 ? s.fuel / Math.max(1, s.fuelMax) : 1;
      const ammo = s.ammoReserveMax > 0 ? s.ammoReserve / Math.max(1, s.ammoReserveMax) : 1;
      const support = s.supportMax > 0 ? s.support / Math.max(1, s.supportMax) : 1;
      return Math.min(fuel, ammo, support) < .45;
    }).length;
    const airDemand = (game.buildings || []).filter(b => b?.alive && b.team === 'enemy' && b.completed && L.ensureNode(b)?.nodeType === 'airfield').reduce((sum, b) => {
      const n = L.ensureNode(b); return sum + (n?.stock ? L.manifestTotal(L.computeDemand(n.stock, n.thresholds, n.priority)) : 0);
    }, 0);
    const risks = Object.values(L.ensureGame(game)?.routeRisk || {}).map(Number).filter(Number.isFinite);
    const peakRisk = risks.length ? Math.max(...risks) : 0;
    return [
      ...ratios,
      q((Number(backlog.fuel) || 0) / 10000, .05), q((Number(backlog.ammo) || 0) / 10000, .05),
      trucks.length, protectedCount, Math.floor(lowUnits / 2), Math.floor(airDemand / 750),
      q(peakRisk, .1), Math.floor((Number(game.teams?.enemy?.credits) || 0) / 5000),
    ].join('|');
  }

  function evaluateNow(game, execute = true, reason = 'MANUAL') {
    const ai = game?.ai;
    if (!game || !ai) return null;
    const raw = strategy.evaluate(ai, execute);
    const diag = decorate(game, raw, reason);
    if (diag) {
      game.__aiLogisticsAdaptiveState ||= { evaluations: 0, executedEvaluations: 0, changes: 0, lastTick: -Infinity, signature: null };
      const state = game.__aiLogisticsAdaptiveState;
      state.evaluations += 1;
      if (execute) state.executedEvaluations += 1;
      state.lastTick = Number(game.simTick) || 0;
      state.lastReason = reason;
      state.lastSelected = diag.selected || null;
    }
    return diag;
  }

  function adaptivePostHook() {
    const ai = this.ai;
    const tick = Number(this.simTick) || 0;
    if (!ai || tick <= 0) return;
    this.__aiLogisticsAdaptiveState ||= { evaluations: 0, executedEvaluations: 0, changes: 0, lastTick: -Infinity, signature: null };
    const state = this.__aiLogisticsAdaptiveState;
    const signature = situationSignature(this);
    const changed = state.signature !== null && signature !== state.signature;
    const due = tick - (Number(state.lastTick) || -Infinity) >= REPLAN_INTERVAL_TICKS;
    if (!changed && !due && state.signature !== null) return;
    if (changed) {
      state.changes += 1;
      // A material situation change must not wait for the previous strategy cooldown.
      ai._nextAdaptiveLogisticsStrategy = Math.min(Number(ai._nextAdaptiveLogisticsStrategy) || Infinity, Number(this.time) || 0);
    }
    state.signature = signature;
    evaluateNow(this, true, changed ? 'SITUATION_CHANGE' : 'PERIODIC');
  }

  if (typeof Game.prototype.registerLogisticsHook206 === 'function') {
    Game.prototype.registerLogisticsHook206('post', adaptivePostHook, 97);
  }

  root.__FD_AI_LOGISTICS_ADAPTIVE__ = Object.freeze({
    automaticReplanning: true,
    changeResponsive: true,
    deterministic: true,
    replanIntervalTicks: REPLAN_INTERVAL_TICKS,
    minimumAlternativesPerProblem: MIN_ALTERNATIVES,
    objectiveProfiles: Object.keys(OBJECTIVES),
    rearLogistics: true,
    frontlineLogistics: true,
    reconnaissanceLogistics: true,
    aviationLogistics: true,
    protectedFieldMissions: true,
    evaluate(game, execute = false) { return evaluateNow(game, execute, execute ? 'EXPLICIT_EXECUTION' : 'EXPLICIT_ANALYSIS'); },
    diagnostics(game) { return game?.__aiLogisticsStrategy || null; },
    state(game) { return game?.__aiLogisticsAdaptiveState || null; },
  });
})();