(() => {
  'use strict';
  const root = typeof window !== 'undefined' ? window : self;
  const L = root.__FD_LOGISTICS206__;
  const D = root.__FD_DEBUG__;
  if (!L || !D?.Game || !D?.Building || !D?.UNIT_TYPES || !D?.BUILDING_TYPES) return;
  const Game = D.Game, Building = D.Building;
  if (Game.prototype.__fdResourceEconomy206Installed) return;
  Object.defineProperty(Game.prototype, '__fdResourceEconomy206Installed', { value: true, configurable: true });

  const BUILDING_TYPES = D.BUILDING_TYPES;
  const IMPORT_INTERVAL = 30;
  const BASE_PRICE = Object.freeze({ fuel: 1.34, ammo: 1.62 });
  const IMPORT_MODES = Object.freeze(['OFF','MAINTAIN_STOCK','FIXED_ORDER','EMERGENCY_PURCHASE']);
  const EXTRACTION_CONFIG = Object.freeze({
    oilPump: { resource: 'fuel', buffer: 18000, rate: 50, interval: 1.10, name: 'Нефтедобывающий комплекс' },
    gasPump: { resource: 'ammo', buffer: 18000, rate: 46, interval: 1.18, name: 'Железорудный рудник' },
    mineralQuarry: { resource: 'ammo', buffer: 17000, rate: 44, interval: 1.20, name: 'Железорудный рудник' },
    oreMine: { resource: 'ammo', buffer: 19000, rate: 50, interval: 1.12, name: 'Железорудный рудник' },
    deepMine: { resource: 'ammo', buffer: 22000, rate: 56, interval: 1.15, name: 'Железорудный рудник' },
    coreDrill: { resource: 'ammo', buffer: 24000, rate: 60, interval: 1.18, name: 'Железорудный рудник' },
    ironMine: { resource: 'ammo', buffer: 19000, rate: 50, interval: 1.12, name: 'Железорудный рудник' },
  });

  for (const [typeId, config] of Object.entries(EXTRACTION_CONFIG)) {
    const stats = BUILDING_TYPES[typeId];
    if (!stats) continue;
    stats.extractor = false;
    stats.logisticsExtractor = true;
    stats.bufferCapacity = config.buffer;
    stats.extractPerTick = config.rate;
    stats.incomeInterval = config.interval;
    stats.name = config.name;
    stats.role = config.resource === 'fuel'
      ? 'Добывает нефть и агрегированно перерабатывает её в топливо. Топливо накапливается локально и требует физического вывоза.'
      : 'Добывает железную руду и агрегированно производит боеприпасы. Боеприпасы накапливаются локально и требуют физического вывоза.';
    stats.resourceType206 = config.resource;
  }

  if (D.UNIT_TYPES.resourceTruck) {
    D.UNIT_TYPES.resourceTruck.name = 'Грузовик снабжения';
    D.UNIT_TYPES.resourceTruck.resourceHauler = true;
    D.UNIT_TYPES.resourceTruck.cargoCapacity = Math.max(6000, Number(D.UNIT_TYPES.resourceTruck.cargoCapacity) || 0);
    D.UNIT_TYPES.resourceTruck.role = 'Физически перевозит Fuel, Ammo и Support между добычей, складами, ПМТО, аэродромами и войсками.';
  }

  function configureExtractorEntity206(building) {
    const config = EXTRACTION_CONFIG[building?.typeId];
    if (!config) return null;
    building.resourceType206 = config.resource;
    building.resourceBufferMax206 = Math.max(config.buffer, Number(building.resourceBufferMax206) || 0);
    if (!Number.isFinite(building.resourceBuffer83)) building.resourceBuffer83 = 0;
    return config;
  }

  // Existing v8.3 extraction already performs the physically correct node -> local buffer move.
  // Keep that mechanism, but account its output as Fuel/Ammo instead of converting it into money later.
  const baseBuildingUpdate206 = Building.prototype.update;
  Building.prototype.update = function(dt) {
    const config = configureExtractorEntity206(this);
    const before = config ? Math.max(0, Number(this.resourceBuffer83) || 0) : 0;
    const result = baseBuildingUpdate206.call(this, dt);
    if (config) {
      const after = Math.max(0, Number(this.resourceBuffer83) || 0);
      const produced = Math.max(0, after - before);
      if (produced > 1e-6) {
        const telemetry = L.ensureGame(this.game).telemetry;
        telemetry[config.resource === 'fuel' ? 'fuelProduced' : 'ammoProduced'] = L.round(
          (Number(telemetry[config.resource === 'fuel' ? 'fuelProduced' : 'ammoProduced']) || 0) + produced
        );
      }
    }
    return result;
  };

  function marketNoise206(team, resource, cycle) {
    let x = (Math.imul((cycle + 1) >>> 0, 2654435761) ^ (team === 'enemy' ? 0x9e3779b9 : 0x85ebca6b) ^
      (resource === 'ammo' ? 0xc2b2ae35 : 0x27d4eb2d)) >>> 0;
    x ^= x >>> 16; x = Math.imul(x, 2246822519) >>> 0; x ^= x >>> 13; x = Math.imul(x, 3266489917) >>> 0; x ^= x >>> 16;
    return ((x % 2401) - 1200) / 10000; // exactly -12.00% .. +12.00%, deterministic integer path
  }

  Game.prototype.getImportPrice206 = function(team, resource, atTime = this.time) {
    if (!BASE_PRICE[resource]) return Infinity;
    const cycle = Math.max(0, Math.floor((Number(atTime) || 0) / IMPORT_INTERVAL));
    return L.round(BASE_PRICE[resource] * (1 + marketNoise206(team, resource, cycle)));
  };

  function defaultContract206(resource, now = 0) {
    return {
      resource,
      mode: 'OFF',
      targetAmount: resource === 'fuel' ? 20000 : 15000,
      fixedAmount: resource === 'fuel' ? 2000 : 1000,
      interval: IMPORT_INTERVAL,
      nextExecution: L.round(now + IMPORT_INTERVAL),
      currentPrice: BASE_PRICE[resource],
      destinationNodeId: null,
    };
  }

  Game.prototype.ensureTradeState206 = function(building) {
    const node = L.ensureNode(building);
    if (!node || node.nodeType !== 'trade') return null;
    node.trade ||= {};
    for (const resource of ['fuel','ammo']) {
      node.trade[resource] = { ...defaultContract206(resource, this.time), ...(node.trade[resource] || {}) };
      const contract = node.trade[resource];
      contract.mode = IMPORT_MODES.includes(contract.mode) ? contract.mode : 'OFF';
      contract.interval = Math.max(5, Number(contract.interval) || IMPORT_INTERVAL);
      if (!Number.isFinite(contract.nextExecution)) contract.nextExecution = this.time + contract.interval;
      contract.currentPrice = this.getImportPrice206(building.team, resource);
    }
    return node.trade;
  };

  Game.prototype.configureTradeContract206 = function(payload = {}) {
    const building = this.getEntity?.(payload.buildingId);
    if (!building?.alive || building.kind !== 'building' || !['player','enemy'].includes(building.team)) return false;
    const trade = this.ensureTradeState206(building);
    const resource = payload.resource === 'ammo' ? 'ammo' : payload.resource === 'fuel' ? 'fuel' : null;
    if (!trade || !resource) return false;
    const contract = trade[resource];
    if (payload.mode != null) contract.mode = IMPORT_MODES.includes(payload.mode) ? payload.mode : contract.mode;
    if (Number.isFinite(payload.targetAmount)) contract.targetAmount = Math.max(0, L.round(payload.targetAmount));
    if (Number.isFinite(payload.fixedAmount)) contract.fixedAmount = Math.max(0, L.round(payload.fixedAmount));
    if (Number.isFinite(payload.interval)) contract.interval = Math.max(5, L.round(payload.interval));
    if (payload.destinationNodeId !== undefined) contract.destinationNodeId = payload.destinationNodeId || null;
    if (payload.executeNow) contract.nextExecution = Math.min(contract.nextExecution, this.time);
    this.logisticsEvent206?.('trade-contract', { buildingId: building.id, resource, mode: contract.mode });
    this.uiDirty = true;
    return true;
  };

  Game.prototype.executeImport206 = function(building, resource, requested, emergency = false) {
    const node = L.ensureNode(building);
    if (!node || node.nodeType !== 'trade' || !node.importBuffer || !['fuel','ammo'].includes(resource)) return 0;
    const team = this.teams?.[building.team];
    if (!team) return 0;
    const room = Math.max(0, Number(node.importBuffer[`${resource}Max`]) - Number(node.importBuffer[resource]));
    if (room <= 1e-6) return 0;
    const price = this.getImportPrice206(building.team, resource) * (emergency ? 1.35 : 1);
    const affordable = Math.floor(Math.max(0, Number(team.credits) || 0) / Math.max(.01, price));
    const amount = L.round(Math.min(Math.max(0, Number(requested) || 0), room, affordable));
    if (amount <= 1e-6) {
      this.logisticsEvent206?.('failed-purchase', { buildingId: building.id, resource, requested: L.round(requested), reason: affordable <= 0 ? 'money' : 'buffer' });
      return 0;
    }
    const cost = L.round(amount * price);
    team.credits = L.round(Math.max(0, Number(team.credits) - cost));
    node.importBuffer[resource] = L.round(Number(node.importBuffer[resource]) + amount);
    const state = L.ensureGame(this), telemetry = state.telemetry;
    telemetry[resource === 'fuel' ? 'fuelImported' : 'ammoImported'] = L.round(Number(telemetry[resource === 'fuel' ? 'fuelImported' : 'ammoImported']) + amount);
    telemetry.moneyImportSpent = L.round(Number(telemetry.moneyImportSpent) + cost);
    state.team[building.team].importSpent = L.round(Number(state.team[building.team].importSpent) + cost);
    this.logisticsEvent206?.('purchase', { buildingId: building.id, resource, amount, cost, price: L.round(price), emergency });
    this.uiDirty = true;
    return amount;
  };

  Game.prototype.emergencyPurchase206 = function(payload = {}) {
    const building = this.getEntity?.(payload.buildingId);
    const resource = payload.resource === 'ammo' ? 'ammo' : payload.resource === 'fuel' ? 'fuel' : null;
    if (!building?.alive || !resource) return false;
    const amount = Math.max(1, Number(payload.amount) || (resource === 'fuel' ? 2500 : 1600));
    return this.executeImport206(building, resource, amount, true) > 0;
  };

  Game.prototype.getIndustrialBonus206 = function(team) {
    const count = (this.buildings || []).filter(b => b?.alive && b.completed && b.team === team && b.typeId === 'industrialCommercialCenter').length;
    return {
      speed: Math.min(.18, count * .045),
      cost: Math.min(.12, count * .03),
    };
  };

  function supportConversion206(game, building, dt) {
    const node = L.ensureNode(building);
    if (!node?.stock || node.stock.supportMax <= 0 || !building.completed || building.sabotagedUntil > game.time) return;
    const team = game.teams?.[building.team];
    if (!team || Number(team.credits) <= 0) return;
    const target = Math.min(node.stock.supportMax, Math.max(0, node.stock.supportMax * node.supportTargetRatio));
    const missing = Math.max(0, target - node.stock.support);
    if (missing <= 1e-6) return;
    const powerFactor = Number(team.powerFactor) || 0;
    if (Number(building.stats?.powerUse) > 0 && powerFactor < .20) return;
    const possible = Math.min(missing, node.supportConversionRate * dt * Math.max(.25, powerFactor || 1));
    const price = Math.max(.01, Number(node.supportMoneyPerUnit) || .42);
    const affordable = Math.min(possible, Number(team.credits) / price);
    if (affordable <= 1e-6) return;
    const amount = L.round(affordable), cost = L.round(amount * price);
    node.stock.support = L.round(node.stock.support + amount);
    team.credits = L.round(Math.max(0, Number(team.credits) - cost));
    const state = L.ensureGame(game), telemetry = state.telemetry;
    telemetry.supportProduced = L.round(Number(telemetry.supportProduced) + amount);
    telemetry.moneySupportSpent = L.round(Number(telemetry.moneySupportSpent) + cost);
    state.team[building.team].supportSpent = L.round(Number(state.team[building.team].supportSpent) + cost);
  }

  function financialIncome206(game, dt) {
    const state = L.ensureGame(game);
    state._incomeAccumulator206 = Number(state._incomeAccumulator206) || 0;
    state._incomeAccumulator206 += dt;
    if (state._incomeAccumulator206 < 1) return;
    const seconds = Math.floor(state._incomeAccumulator206);
    state._incomeAccumulator206 -= seconds;
    for (const teamKey of ['player','enemy']) {
      const team = game.teams?.[teamKey]; if (!team) continue;
      const centers = (game.buildings || []).filter(b => b?.alive && b.completed && b.team === teamKey && b.sabotagedUntil <= game.time &&
        ['financialCenter','financialTradeCenter','industrialCommercialCenter','logisticsCommercialTerminal'].includes(b.typeId));
      const financialCount = centers.filter(b => b.typeId === 'financialCenter').length;
      let income = 0;
      for (const building of centers) {
        if (Number(building.stats?.powerUse) > 0 && (Number(team.powerFactor) || 0) < .38) continue;
        let rate = Number(building.stats?.incomePerCycle206) || 0;
        if (building.typeId === 'financialCenter' && financialCount > 1) rate *= 1 / (1 + .10 * (financialCount - 1));
        income += rate * seconds;
      }
      if (income > 0) {
        team.credits = L.round(Number(team.credits) + income);
        state.telemetry.moneyIncome = L.round(Number(state.telemetry.moneyIncome) + income);
      }
    }
  }

  function importCycles206(game) {
    const totalsByTeam = { player: L.totalPhysical(game, 'player'), enemy: L.totalPhysical(game, 'enemy') };
    for (const building of (game.buildings || []).filter(b => b?.alive && b.completed && b.typeId === 'financialTradeCenter')) {
      const trade = game.ensureTradeState206(building); if (!trade) continue;
      for (const resource of ['fuel','ammo']) {
        const contract = trade[resource];
        contract.currentPrice = game.getImportPrice206(building.team, resource);
        if (contract.mode === 'OFF' || game.time + 1e-6 < contract.nextExecution) continue;
        contract.nextExecution = L.round(game.time + contract.interval);
        let requested = 0;
        if (contract.mode === 'MAINTAIN_STOCK') requested = Math.max(0, Number(contract.targetAmount) - Number(totalsByTeam[building.team]?.[resource] || 0));
        else if (contract.mode === 'FIXED_ORDER') requested = Math.max(0, Number(contract.fixedAmount) || 0);
        else if (contract.mode === 'EMERGENCY_PURCHASE') requested = Math.max(Number(contract.fixedAmount) || 0, resource === 'fuel' ? 3000 : 2000);
        if (requested <= 1e-6) continue;
        const bought = game.executeImport206(building, resource, requested, contract.mode === 'EMERGENCY_PURCHASE');
        totalsByTeam[building.team][resource] += bought;
      }
    }
  }

  function economyPost206(dt) {
    L.scanEntities(this);
    financialIncome206(this, dt);
    for (const building of this.buildings || []) if (building?.alive && building.logistics206?.stock) supportConversion206(this, building, dt);
    const state = L.ensureGame(this);
    state._importAccumulator206 = Number(state._importAccumulator206) || 0;
    state._importAccumulator206 += dt;
    if (state._importAccumulator206 >= 1) {
      state._importAccumulator206 %= 1;
      importCycles206(this);
      for (const team of ['player','enemy']) L.aggregateTeam(this, team);
    }
  }

  // Prevent the old money-per-interceptor-shot abstraction from coexisting with physical ammunition.
  // Existing combat code consults this hook before debiting credits; build 206 makes every such cost zero.
  Game.prototype.getAirEngagementCost126 = function() { return 0; };
  Game.prototype.recordAirEngagementSpend126 = function() { return 0; };

  Game.prototype.registerLogisticsHook206('post', economyPost206, 20);
  root.__FD_RESOURCE_ECONOMY206__ = { version: '20.6', IMPORT_INTERVAL, BASE_PRICE, IMPORT_MODES, EXTRACTION_CONFIG };
})();
