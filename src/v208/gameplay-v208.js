(() => {
  'use strict';
  const root = typeof window !== 'undefined' ? window : self;
  const D = root.__FD_DEBUG__;
  const L = root.__FD_LOGISTICS206__;
  if (!D?.Game || !D?.Unit || !D?.BUILDING_TYPES || !L) return;
  const { Game, Unit } = D;
  if (Game.prototype.__fdGameplay208Installed) return;
  Object.defineProperty(Game.prototype, '__fdGameplay208Installed', { value: true, configurable: true });

  const BUILD = 208;
  const VERSION = '16.9.2';
  const EPS = 1e-6;
  const EXTRACTOR_MONEY = Object.freeze({ oilPump: 8, gasPump: 7 });
  const isWorkerRealm = typeof document === 'undefined';
  const isEngineer = unit => Boolean(unit?.alive !== false && unit.typeId === 'worker' && !unit.embarkedIn);
  const hashText = value => {
    let hash = 2166136261 >>> 0;
    for (const char of String(value || '')) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
    return hash >>> 0;
  };

  // Every building that can produce units and consumes physical supply must be a logistics node.
  // Existing explicit profiles (HQ, barracks, airfields, factories, etc.) always win.
  for (const [typeId, stats] of Object.entries(D.BUILDING_TYPES || {})) {
    if (!stats) continue;
    const produces = Array.isArray(stats.produces) && stats.produces.length > 0;
    const factionProduces = stats.producesByFaction && typeof stats.producesByFaction === 'object' &&
      Object.values(stats.producesByFaction).some(list => Array.isArray(list) && list.length > 0);
    if (!(produces || factionProduces)) continue;
    if (L.profileForBuilding({ typeId, stats })) continue;
    stats.role = `${stats.role || ''} Производственный объект с локальным физическим снабжением.`.trim();
    stats.logisticsProduction208 = true;
  }

  for (const [typeId, rate] of Object.entries(EXTRACTOR_MONEY)) {
    const stats = D.BUILDING_TYPES[typeId];
    if (stats) stats.moneyIncomePerSecond208 = rate;
  }

  // Build 207 accidentally registered an idle-engineer resource hauling hook.
  // Explicit harvest commands remain fully supported; only autonomous assignment is removed.
  function pruneIdleEngineerHauling208() {
    const hooks = Game.prototype.logisticsHooks206?.call(Game.prototype);
    if (!hooks) return 0;
    let removed = 0;
    for (const stage of ['pre', 'post']) {
      const list = hooks[stage] || [];
      const keep = list.filter(entry => {
        const fn = entry?.fn;
        const name = fn?.__fdOriginalName207 || fn?.name || '';
        if (name !== 'workerAutomation207') return true;
        removed += 1;
        return false;
      });
      list.splice(0, list.length, ...keep);
    }
    return removed;
  }
  const removedIdleHooks = pruneIdleEngineerHauling208();

  function clearLegacyAutoHaulOrders208(game) {
    let cleared = 0;
    for (const unit of game?.units || []) {
      if (!isEngineer(unit)) continue;
      const queue = Array.isArray(unit.commandQueue) ? unit.commandQueue : [];
      const filtered = queue.filter(command => !command?.autoLogistics207);
      if (filtered.length !== queue.length) {
        unit.commandQueue = filtered;
        unit.workerHaul207 = null;
        cleared += queue.length - filtered.length;
      }
    }
    return cleared;
  }

  if (isWorkerRealm) {
    const baseHydrate208 = Game.prototype.hydrate;
    if (typeof baseHydrate208 === 'function') Game.prototype.hydrate = function(data, ...args) {
      const result = baseHydrate208.call(this, data, ...args);
      clearLegacyAutoHaulOrders208(this);
      return result;
    };

    // Direct user context orders must always construct any friendly unfinished building.
    // This explicitly preserves the older engineer initiative while repairing the authoritative context path.
    const baseIssueContext208 = Game.prototype.issueContext;
    if (typeof baseIssueContext208 === 'function') Game.prototype.issueContext = function(x, y, append = false) {
      const target = this.hitTestForContext?.(x, y) || this.hitTest?.(x, y, false);
      const unfinished = target?.kind === 'building' && target.alive !== false && target.team === 'player' &&
        (!target.completed || (Number.isFinite(target.construction) && target.construction < 1 - EPS));
      if (unfinished) {
        const workers = (this.getSelectedUnits?.() || []).filter(isEngineer);
        if (workers.length) {
          for (const worker of workers) worker.setCommand({ type: 'build', buildingId: target.id, directPlayerOrder208: true }, append);
          this.addEffect?.({ type: 'marker', x: target.x, y: target.y, color: '#f1d58a', duration: .8 });
          this.sound?.click?.();
          return true;
        }
      }
      return baseIssueContext208.call(this, x, y, append);
    };

    // SUPPLY_GROUP accepts either a real formation id or an explicit deterministic list of unit ids.
    const baseSetMission208 = Game.prototype.setLogisticsMission206;
    if (typeof baseSetMission208 === 'function') Game.prototype.setLogisticsMission206 = function(payload = {}) {
      let next = payload && typeof payload === 'object' ? { ...payload } : {};
      if (next.missionType === 'SUPPLY_GROUP' && !next.targetGroupId && Array.isArray(next.targetUnitIds208)) {
        const requested = [...new Set(next.targetUnitIds208.map(String))].sort();
        const units = requested.map(id => this.getEntity?.(id)).filter(unit =>
          unit?.alive && unit.kind === 'unit' && unit.team === 'player' && !L.isAir(unit) && !L.isTruck(unit)
        );
        if (!units.length) return false;
        const signature = units.map(unit => unit.id).sort().join('|');
        const groupId = next.syntheticGroupId208 || `supply208-${hashText(signature).toString(16)}`;
        if (!(this.formations instanceof Map)) this.formations = new Map();
        const existing = this.formations.get(groupId) || { id: groupId };
        existing.id = groupId;
        existing.unitIds = units.map(unit => unit.id).sort();
        existing.syntheticSupply208 = true;
        existing.updatedAt208 = Number(this.time) || 0;
        this.formations.set(groupId, existing);
        next.targetGroupId = groupId;
      }
      return baseSetMission208.call(this, next);
    };
  }

  // Extraction facilities provide a modest deterministic Money income in addition to Fuel/Ammo.
  function extractorMoneyIncome208(dt) {
    const game = this;
    game._extractorMoneyAccumulator208 = (Number(game._extractorMoneyAccumulator208) || 0) + dt;
    if (game._extractorMoneyAccumulator208 < 1) return;
    const seconds = Math.floor(game._extractorMoneyAccumulator208);
    game._extractorMoneyAccumulator208 -= seconds;
    const logistics = L.ensureGame(game);
    logistics.telemetry.moneyExtractionIncome208 = Number(logistics.telemetry.moneyExtractionIncome208) || 0;
    for (const building of game.buildings || []) {
      if (!building?.alive || !building.completed || !['player', 'enemy'].includes(building.team)) continue;
      const rate = Number(building.stats?.moneyIncomePerSecond208 ?? EXTRACTOR_MONEY[building.typeId]) || 0;
      if (rate <= 0 || !L.ensureExtractor(building)) continue;
      const resourceNode = game.getEntity?.(building.resourceNodeId);
      if (!resourceNode?.alive || (Number(resourceNode.amount) || 0) <= EPS) continue;
      if ((Number(building.sabotagedUntil) || 0) > (Number(game.time) || 0)) continue;
      const team = game.teams?.[building.team];
      if (!team) continue;
      if (Number(building.stats?.powerUse) > 0 && (Number(team.powerFactor) || 0) < .2) continue;
      const income = L.round(rate * seconds);
      team.credits = L.round((Number(team.credits) || 0) + income);
      logistics.telemetry.moneyExtractionIncome208 = L.round(logistics.telemetry.moneyExtractionIncome208 + income);
    }
  }
  Game.prototype.registerLogisticsHook206?.('post', extractorMoneyIncome208, 19);

  // Re-prune after logisticsHooks206 has had a chance to context-wrap inherited hooks.
  pruneIdleEngineerHauling208();

  root.__FD_GAMEPLAY_208__ = {
    build: BUILD,
    version: VERSION,
    extractorMoneyPerSecond: { ...EXTRACTOR_MONEY },
    removedIdleEngineerHooks: removedIdleHooks,
    clearLegacyAutoHaulOrders208,
    initiativePreserved: typeof Unit.prototype.tryEngineerInitiative130 === 'function',
  };
})();
