(() => {
  'use strict';

  const root = typeof window !== 'undefined' ? window : self;
  if (root.__FD_LOGISTICS206__?.version === '20.6') return;

  const D = root.__FD_DEBUG__ || null;
  const Game = D?.Game || null;
  const Unit = D?.Unit || null;
  const Building = D?.Building || null;

  const VERSION = '20.6';
  const BUILD = 206;
  const STOCK_KEYS = Object.freeze(['fuel', 'ammo', 'support']);
  const PRIORITY = Object.freeze({ LOW: 0.55, NORMAL: 1, HIGH: 1.65, CRITICAL: 2.7 });
  const PRIORITY_NAMES = Object.freeze(['LOW', 'NORMAL', 'HIGH', 'CRITICAL']);
  const EPS = 1e-6;

  const NODE_PROFILES = Object.freeze({
    central: Object.freeze({ fuelMax: 36000, ammoMax: 30000, supportMax: 22000, radius: 620, throughput: 2600, slots: 4 }),
    warehouse: Object.freeze({ fuelMax: 26000, ammoMax: 22000, supportMax: 16000, radius: 420, throughput: 1900, slots: 3 }),
    pmto: Object.freeze({ fuelMax: 20000, ammoMax: 17000, supportMax: 12500, radius: 760, throughput: 3000, slots: 5 }),
    terminal: Object.freeze({ fuelMax: 42000, ammoMax: 35000, supportMax: 26000, radius: 520, throughput: 3600, slots: 6 }),
    trade: Object.freeze({ fuelMax: 12000, ammoMax: 10000, supportMax: 4000, radius: 300, throughput: 2500, slots: 4 }),
    airfield: Object.freeze({ fuelMax: 24000, ammoMax: 18000, supportMax: 13000, radius: 360, throughput: 2100, slots: 3 }),
    production: Object.freeze({ fuelMax: 7000, ammoMax: 7000, supportMax: 5000, radius: 220, throughput: 900, slots: 2 }),
    barracks: Object.freeze({ fuelMax: 0, ammoMax: 4200, supportMax: 4200, radius: 220, throughput: 750, slots: 1 }),
    repair: Object.freeze({ fuelMax: 8000, ammoMax: 3000, supportMax: 9000, radius: 300, throughput: 1300, slots: 2 }),
    defense: Object.freeze({ fuelMax: 0, ammoMax: 5200, supportMax: 1800, radius: 180, throughput: 700, slots: 1 }),
  });

  const NODE_TYPES = Object.freeze({
    hq: 'central', commandCenter: 'central', logisticsHub: 'central', refinery: 'warehouse', resourceSilo: 'warehouse',
    supplyBeacon: 'pmto', forwardSupplyCenter: 'pmto', pmto: 'pmto',
    logisticsCommercialTerminal: 'terminal', financialTradeCenter: 'trade', commodityExchange: 'trade', creditExchange: 'trade',
    airfield: 'airfield', advancedAirfield: 'airfield',
    barracks: 'barracks', infantryBarracks: 'barracks',
    repairBay: 'repair', repairBase: 'repair', fieldWorkshop: 'repair',
    vehicleFactory: 'production', heavyFactory: 'production', artilleryFoundry: 'production', aircraftFactory: 'production',
    missileBattery: 'defense', abmBattery: 'defense', orbitalDefense: 'defense', aaTurret: 'defense', cannonTurret: 'defense',
  });

  const EXTRACTION_TYPES = Object.freeze({
    oilPump: 'fuel',
    gasPump: 'ammo',
    mineralQuarry: 'ammo',
    oreMine: 'ammo',
    deepMine: 'ammo',
    coreDrill: 'ammo',
    ironMine: 'ammo',
  });

  const round = value => Math.round((Number(value) || 0) * 1000) / 1000;
  const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, finite(value, min)));
  const stableId = value => String(value?.id ?? value ?? '');
  const compareIds = (a, b) => stableId(a).localeCompare(stableId(b), 'en');

  function emptyManifest() { return { fuel: 0, ammo: 0, support: 0 }; }
  function manifestTotal(manifest) { return STOCK_KEYS.reduce((sum, key) => sum + Math.max(0, finite(manifest?.[key])), 0); }
  function copyManifest(manifest) {
    return { fuel: Math.max(0, finite(manifest?.fuel)), ammo: Math.max(0, finite(manifest?.ammo)), support: Math.max(0, finite(manifest?.support)) };
  }

  function makeStock(maximums = {}, ratios = {}) {
    const stock = {};
    for (const key of STOCK_KEYS) {
      const max = Math.max(0, finite(maximums[`${key}Max`] ?? maximums[key]));
      const ratio = clamp(ratios[key] ?? 0, 0, 1);
      stock[key] = round(max * ratio);
      stock[`${key}Max`] = round(max);
    }
    return stock;
  }

  function normalizeStock(stock, fallbackMaximums = {}) {
    const out = stock && typeof stock === 'object' ? stock : {};
    for (const key of STOCK_KEYS) {
      const maxKey = `${key}Max`;
      const max = Math.max(0, finite(out[maxKey], fallbackMaximums[maxKey] ?? fallbackMaximums[key] ?? 0));
      out[maxKey] = round(max);
      out[key] = round(clamp(out[key], 0, max));
    }
    return out;
  }

  function stockRatio(stock, key) {
    const max = Math.max(0, finite(stock?.[`${key}Max`]));
    if (max <= EPS) return 1;
    return clamp(finite(stock?.[key]) / max, 0, 1);
  }

  function transferResource(source, destination, key, requested, telemetry = null) {
    if (!STOCK_KEYS.includes(key)) return 0;
    normalizeStock(source); normalizeStock(destination);
    const available = Math.max(0, finite(source[key]));
    const room = Math.max(0, finite(destination[`${key}Max`]) - finite(destination[key]));
    const amount = round(Math.min(Math.max(0, finite(requested)), available, room));
    if (amount <= EPS) return 0;
    source[key] = round(source[key] - amount);
    destination[key] = round(destination[key] + amount);
    if (telemetry) telemetry.transfers = round(finite(telemetry.transfers) + amount);
    return amount;
  }

  function transferManifest(source, destination, manifest, telemetry = null) {
    const moved = emptyManifest();
    for (const key of STOCK_KEYS) moved[key] = transferResource(source, destination, key, manifest?.[key], telemetry);
    return moved;
  }

  function thresholdsFor(stock, overrides = {}) {
    const target = {}, low = {}, critical = {};
    for (const key of STOCK_KEYS) {
      const max = Math.max(0, finite(stock?.[`${key}Max`]));
      target[key] = round(clamp(overrides?.target?.[key] ?? max * 0.70, 0, max));
      low[key] = round(clamp(overrides?.low?.[key] ?? max * 0.35, 0, target[key] || max));
      critical[key] = round(clamp(overrides?.critical?.[key] ?? max * 0.15, 0, low[key] || max));
    }
    return { target, low, critical };
  }

  function priorityName(value) {
    if (typeof value === 'string' && PRIORITY[value]) return value;
    const n = Math.max(0, Math.min(3, Math.round(finite(value, 1))));
    return PRIORITY_NAMES[n] || 'NORMAL';
  }

  function priorityMultiplier(value) { return PRIORITY[priorityName(value)] || 1; }

  function computeDemand(stock, thresholds, priority = 'NORMAL', allowed = STOCK_KEYS) {
    normalizeStock(stock);
    const p = priorityMultiplier(priority);
    const demand = emptyManifest();
    for (const key of STOCK_KEYS) {
      if (!allowed.includes(key) || stock[`${key}Max`] <= EPS) continue;
      const target = Math.max(0, finite(thresholds?.target?.[key], stock[`${key}Max`] * .70));
      const deficit = Math.max(0, target - stock[key]);
      const low = finite(thresholds?.low?.[key], stock[`${key}Max`] * .35);
      const critical = finite(thresholds?.critical?.[key], stock[`${key}Max`] * .15);
      let urgency = p;
      if (stock[key] <= critical + EPS) urgency *= 2.4;
      else if (stock[key] <= low + EPS) urgency *= 1.55;
      demand[key] = round(deficit * urgency);
    }
    return demand;
  }

  function allocateManifest(deficits, capacity, weights = {}, allowed = STOCK_KEYS) {
    const result = emptyManifest();
    let room = Math.max(0, finite(capacity));
    if (room <= EPS) return result;
    const entries = STOCK_KEYS.filter(key => allowed.includes(key) && finite(deficits?.[key]) > EPS)
      .map(key => ({ key, deficit: Math.max(0, finite(deficits[key])), weight: Math.max(.01, finite(weights[key], 1)) }));
    if (!entries.length) return result;

    let pending = entries;
    for (let pass = 0; pass < 4 && room > EPS && pending.length; pass += 1) {
      const denominator = pending.reduce((sum, entry) => sum + entry.deficit * entry.weight, 0);
      if (denominator <= EPS) break;
      let consumed = 0;
      for (const entry of pending) {
        const remaining = Math.max(0, entry.deficit - result[entry.key]);
        if (remaining <= EPS) continue;
        const share = room * (remaining * entry.weight / denominator);
        const amount = Math.min(remaining, share);
        result[entry.key] = round(result[entry.key] + amount);
        consumed += amount;
      }
      room = Math.max(0, room - consumed);
      pending = pending.filter(entry => entry.deficit - result[entry.key] > EPS);
      if (consumed <= EPS) break;
    }
    if (room > EPS) {
      for (const entry of entries.sort((a,b) => b.weight - a.weight || a.key.localeCompare(b.key))) {
        if (room <= EPS) break;
        const remaining = Math.max(0, entry.deficit - result[entry.key]);
        const amount = Math.min(room, remaining);
        result[entry.key] = round(result[entry.key] + amount);
        room -= amount;
      }
    }
    return result;
  }

  function profileForBuilding(building) {
    const explicit = NODE_TYPES[building?.typeId];
    if (explicit) return explicit;
    const stats = building?.stats || {};
    const text = `${building?.typeId || ''} ${stats.name || ''} ${stats.role || ''}`.toLowerCase();
    if (/airfield|аэродром/.test(text)) return 'airfield';
    if (/logistics|supply|склад|depot|warehouse|снабжен|мто/.test(text)) return 'warehouse';
    if (/factory|foundry|завод|производ/.test(text)) return 'production';
    if (/barracks|казарм/.test(text)) return 'barracks';
    if (/repair|ремонт/.test(text)) return 'repair';
    if (stats.weapon && /missile|rocket|sam|abm|пво|про|ракет/.test(text)) return 'defense';
    return null;
  }

  function extractorResourceType(building) {
    if (!building) return null;
    if (building.resourceType206 === 'fuel' || building.resourceType206 === 'ammo') return building.resourceType206;
    if (EXTRACTION_TYPES[building.typeId]) return EXTRACTION_TYPES[building.typeId];
    const variant = building.stats?.placeOnResource;
    return variant === 'oil' ? 'fuel' : variant ? 'ammo' : null;
  }

  function isTruck(unit) { return Boolean(unit?.alive !== false && (unit.typeId === 'resourceTruck' || unit.stats?.resourceHauler)); }
  function isAir(unit) { return Boolean(unit?.air || unit?.stats?.air); }
  function isHelicopter(unit) { return isAir(unit) && /helicopter|gunship|rotary/i.test(`${unit?.typeId || ''} ${unit?.stats?.visualRole || ''} ${unit?.stats?.mobilityClass || ''}`); }
  function isMotorized(unit) {
    if (!unit || isAir(unit) || isTruck(unit)) return false;
    if (unit.stats?.vehicle || unit.vehicle) return true;
    const text = `${unit.typeId || ''} ${unit.stats?.role || ''} ${unit.stats?.mobilityClass || ''}`.toLowerCase();
    return /tank|vehicle|armor|apc|ifv|truck|mobile|самоход|танк|броне/.test(text);
  }
  function hasWeapon(unit) { return Boolean(unit?.stats?.weapon && finite(unit.stats.weapon.damage) > 0); }

  function inferMagazine(unit) {
    const declared = Math.floor(finite(unit?.stats?.magazineCapacity));
    if (declared > 0) return Math.max(1, declared);
    if (!hasWeapon(unit)) return 0;
    const role = `${unit?.typeId || ''} ${unit?.stats?.visualRole || ''} ${unit?.stats?.role || ''}`.toLowerCase();
    if (/artillery|howitzer|rocket|mlrs|артилл|рсзо/.test(role)) return 6;
    if (/missile|sam|abm|rocket|пво|про/.test(role)) return 4;
    if (unit?.stats?.infantry || unit?.infantry) return 30;
    return 12;
  }

  function inferReservePacks(unit, readyMax) {
    if (readyMax <= 0) return 0;
    const role = `${unit?.typeId || ''} ${unit?.stats?.visualRole || ''} ${unit?.stats?.role || ''}`.toLowerCase();
    if (/artillery|howitzer|rocket|mlrs|артилл|рсзо/.test(role)) return readyMax * 4;
    if (/missile|sam|abm|rocket|пво|про/.test(role)) return readyMax * 3;
    return readyMax * 5;
  }

  function ensureUnit(unit, initializeFull = true) {
    if (!unit) return null;
    const existing = unit.logistics206 && typeof unit.logistics206 === 'object' ? unit.logistics206 : {};
    const truck = isTruck(unit), air = isAir(unit), motorized = isMotorized(unit);
    const readyMax = Math.max(0, finite(existing.ammoReadyMax, air ? finite(unit.airAmmoMax, inferMagazine(unit)) : inferMagazine(unit)));
    const reserveMax = Math.max(0, finite(existing.ammoReserveMax, air ? 0 : inferReservePacks(unit, readyMax)));
    const fuelMax = Math.max(0, finite(existing.fuelMax,
      truck ? 0 : air ? finite(unit.sortieFuelMax, 320) : motorized ? Math.max(600, Math.min(1800, finite(unit.stats?.cost, 1000) * .55)) : 0));
    const supportMax = Math.max(0, finite(existing.supportMax, air ? 120 : motorized ? 180 : (unit.stats?.infantry || unit.infantry) ? 95 : hasWeapon(unit) ? 80 : 45));
    const cargoCapacity = truck ? Math.max(0, finite(existing.cargoCapacity, unit.stats?.cargoCapacity || 5600)) : 0;
    const cargo = normalizeStock(existing.cargo || {}, { fuelMax: cargoCapacity, ammoMax: cargoCapacity, supportMax: cargoCapacity });
    if (manifestTotal(cargo) > cargoCapacity + EPS) {
      const ratio = cargoCapacity / Math.max(EPS, manifestTotal(cargo));
      for (const key of STOCK_KEYS) cargo[key] = round(cargo[key] * ratio);
    }
    const state = {
      ...existing,
      version: BUILD,
      role: truck ? 'truck' : air ? 'air' : motorized ? 'motorized' : 'foot',
      fuelMax: round(fuelMax),
      fuel: round(clamp(existing.fuel, 0, fuelMax)),
      ammoReadyMax: round(readyMax),
      ammoReady: round(clamp(existing.ammoReady, 0, readyMax)),
      ammoReserveMax: round(reserveMax),
      ammoReserve: round(clamp(existing.ammoReserve, 0, reserveMax)),
      supportMax: round(supportMax),
      support: round(clamp(existing.support, 0, supportMax)),
      cargoCapacity: round(cargoCapacity), cargo,
      missionType: existing.missionType || (truck ? 'AUTO' : null),
      status: existing.status || (truck ? 'IDLE' : null),
      homeNodeId: existing.homeNodeId || null,
      sourceNodeId: existing.sourceNodeId || null,
      destinationNodeId: existing.destinationNodeId || null,
      targetGroupId: existing.targetGroupId || null,
      targetX: Number.isFinite(existing.targetX) ? existing.targetX : null,
      targetY: Number.isFinite(existing.targetY) ? existing.targetY : null,
      supplyRadius: round(Math.max(0, finite(existing.supplyRadius, truck ? 310 : 0))),
      routeRisk: round(Math.max(0, finite(existing.routeRisk))),
      resupplySourceId: existing.resupplySourceId || null,
      resupplyProgress: clamp(existing.resupplyProgress, 0, 1),
    };
    if (initializeFull && !unit.logistics206) {
      state.fuel = state.fuelMax;
      state.ammoReady = state.ammoReadyMax;
      state.ammoReserve = state.ammoReserveMax;
      state.support = state.supportMax;
      for (const key of STOCK_KEYS) state.cargo[key] = 0;
    }
    Object.assign(existing, state);
    unit.logistics206 = existing;
    if (truck) unit.cargo = round(manifestTotal(existing.cargo));
    return existing;
  }

  function ensureNode(building, initializeRatio = null) {
    if (!building) return null;
    const profileName = profileForBuilding(building);
    if (!profileName) return null;
    const profile = NODE_PROFILES[profileName] || NODE_PROFILES.warehouse;
    const existing = building.logistics206 && typeof building.logistics206 === 'object' ? building.logistics206 : {};
    const initial = initializeRatio == null ? (building.team === 'neutral' ? 0 : .48) : initializeRatio;
    let stock = normalizeStock(existing.stock || {}, profile);
    if (!building.logistics206 && initial > 0) stock = makeStock(profile, { fuel: initial, ammo: initial, support: Math.min(.78, initial + .12) });
    const thresholds = thresholdsFor(stock, existing.thresholds || {});
    const state = {
      ...existing,
      version: BUILD,
      nodeType: profileName,
      stock,
      thresholds,
      priority: priorityName(existing.priority || 'NORMAL'),
      transportSlots: Math.max(0, Math.floor(finite(existing.transportSlots, profile.slots))),
      supplyRadius: round(Math.max(0, finite(existing.supplyRadius, profile.radius))),
      throughput: round(Math.max(0, finite(existing.throughput, profile.throughput))),
      supportTargetRatio: clamp(existing.supportTargetRatio, 0, 1) || .70,
      supportConversionRate: round(Math.max(0, finite(existing.supportConversionRate, 105))),
      supportMoneyPerUnit: round(Math.max(.01, finite(existing.supportMoneyPerUnit, .42))),
      transportIds: Array.isArray(existing.transportIds) ? [...new Set(existing.transportIds.map(String))] : [],
      serviceAccumulator: Math.max(0, finite(existing.serviceAccumulator)),
    };
    if (profileName === 'trade') {
      state.importBuffer = normalizeStock(existing.importBuffer || {}, { fuelMax: 18000, ammoMax: 15000, supportMax: 0 });
      state.importBuffer.supportMax = 0; state.importBuffer.support = 0;
    }
    Object.assign(existing, state);
    building.logistics206 = existing;
    return existing;
  }

  function ensureExtractor(building) {
    const type = extractorResourceType(building);
    if (!type) return null;
    building.resourceType206 = type;
    if (!Number.isFinite(building.resourceBuffer83)) building.resourceBuffer83 = 0;
    if (!Number.isFinite(building.resourceBufferMax206)) building.resourceBufferMax206 = Math.max(12000, finite(building.stats?.bufferCapacity, 16800));
    return { resourceType: type, amount: Math.max(0, finite(building.resourceBuffer83)), capacity: building.resourceBufferMax206 };
  }

  function ensureGame(game) {
    if (!game) return null;
    const existing = game.logistics206 && typeof game.logistics206 === 'object' ? game.logistics206 : {};
    const state = {
      ...existing,
      version: BUILD,
      routeRisk: existing.routeRisk && typeof existing.routeRisk === 'object' ? { ...existing.routeRisk } : {},
      team: existing.team && typeof existing.team === 'object' ? existing.team : {},
      telemetry: existing.telemetry && typeof existing.telemetry === 'object' ? existing.telemetry : {},
      audit: existing.audit && typeof existing.audit === 'object' ? existing.audit : { conservationError: 0, lastAt: 0 },
      tickBucket: Math.max(0, Math.floor(finite(existing.tickBucket))),
      lastScanTick: Math.floor(finite(existing.lastScanTick, -1)),
      history: Array.isArray(existing.history) ? existing.history.slice(-256) : [],
    };
    for (const team of ['player','enemy']) {
      const old = state.team[team] && typeof state.team[team] === 'object' ? state.team[team] : {};
      Object.assign(old, {
        supportSpent: Math.max(0, finite(old.supportSpent)),
        importSpent: Math.max(0, finite(old.importSpent)),
        importDependency: clamp(old.importDependency, 0, 1),
        contracts: old.contracts && typeof old.contracts === 'object' ? old.contracts : {},
        aggregates: old.aggregates && typeof old.aggregates === 'object' ? old.aggregates : {},
      });
      state.team[team] = old;
    }
    Object.assign(existing, state);
    game.logistics206 = existing;
    const t = existing.telemetry;
    for (const key of [
      'fuelProduced','fuelImported','fuelConsumed','fuelLostInTransit','ammoProduced','ammoImported','ammoConsumed','ammoLostInTransit',
      'supportProduced','supportConsumed','supportLostInTransit','moneyIncome','moneyImportSpent','moneySupportSpent','transfers','trucksDestroyed'
    ]) t[key] = Math.max(0, finite(t[key]));
    return existing;
  }

  function logEvent(game, type, detail = {}) {
    const state = ensureGame(game);
    const event = { tick: Math.floor(finite(game?.simTick)), time: round(finite(game?.time)), type, ...detail };
    state.history.push(event);
    if (state.history.length > 256) state.history.splice(0, state.history.length - 256);
    if (root.__FD_DEBUG_LOGISTICS206__) console.debug('[FD206]', type, detail);
    return event;
  }

  function scanEntities(game, force = false) {
    const state = ensureGame(game);
    const tick = Math.floor(finite(game.simTick));
    if (!force && state.lastScanTick >= 0 && tick - state.lastScanTick < 25) return;
    state.lastScanTick = tick;
    for (const building of game.buildings || []) {
      if (!building?.alive) continue;
      ensureExtractor(building);
      ensureNode(building);
    }
    for (const unit of game.units || []) if (unit?.alive) ensureUnit(unit, !unit.logistics206);
  }

  function totalPhysical(game, team = null) {
    const totals = emptyManifest();
    for (const building of game?.buildings || []) {
      if (!building?.alive || (team && building.team !== team)) continue;
      const state = building.logistics206;
      if (state?.stock) for (const key of STOCK_KEYS) totals[key] += finite(state.stock[key]);
      if (state?.importBuffer) for (const key of STOCK_KEYS) totals[key] += finite(state.importBuffer[key]);
      const extracted = ensureExtractor(building);
      if (extracted?.resourceType) totals[extracted.resourceType] += finite(extracted.amount);
    }
    for (const unit of game?.units || []) {
      if (!unit?.alive || (team && unit.team !== team)) continue;
      const state = unit.logistics206;
      if (!state) continue;
      totals.fuel += finite(state.fuel) + finite(state.cargo?.fuel);
      totals.ammo += finite(state.ammoReady) + finite(state.ammoReserve) + finite(state.cargo?.ammo);
      totals.support += finite(state.support) + finite(state.cargo?.support);
    }
    for (const key of STOCK_KEYS) totals[key] = round(totals[key]);
    return totals;
  }

  function aggregateTeam(game, team) {
    const totals = totalPhysical(game, team);
    const units = (game.units || []).filter(unit => unit?.alive && unit.team === team && !isTruck(unit));
    let fuelNeed = 0, ammoNeed = 0, supportNeed = 0, fuelHave = 0, ammoHave = 0, supportHave = 0;
    for (const unit of units) {
      const s = ensureUnit(unit, false); if (!s) continue;
      fuelNeed += s.fuelMax; fuelHave += s.fuel;
      ammoNeed += s.ammoReadyMax + s.ammoReserveMax; ammoHave += s.ammoReady + s.ammoReserve;
      supportNeed += s.supportMax; supportHave += s.support;
    }
    const ratio = (have, need) => need > EPS ? clamp(have / need, 0, 1) : 1;
    const result = {
      totalFuel: totals.fuel, totalAmmo: totals.ammo, totalSupport: totals.support,
      armyFuelReadiness: ratio(fuelHave, fuelNeed), armyAmmoReadiness: ratio(ammoHave, ammoNeed), armySupportReadiness: ratio(supportHave, supportNeed),
      unitCount: units.length,
    };
    ensureGame(game).team[team].aggregates = result;
    return result;
  }

  function logisticsSnapshot(game) {
    scanEntities(game);
    const player = aggregateTeam(game, 'player');
    const enemy = aggregateTeam(game, 'enemy');
    const nodes = (game.buildings || []).filter(b => b?.alive && b.logistics206?.stock).map(b => ({
      id: b.id, typeId: b.typeId, team: b.team, nodeType: b.logistics206.nodeType,
      stock: copyManifest(b.logistics206.stock), max: {
        fuel: b.logistics206.stock.fuelMax, ammo: b.logistics206.stock.ammoMax, support: b.logistics206.stock.supportMax,
      }, priority: b.logistics206.priority, x: b.x, y: b.y,
    }));
    const trucks = (game.units || []).filter(isTruck).map(u => ({
      id: u.id, team: u.team, cargo: copyManifest(u.logistics206?.cargo), capacity: finite(u.logistics206?.cargoCapacity),
      missionType: u.logistics206?.missionType || 'AUTO', status: u.logistics206?.status || 'IDLE',
      sourceNodeId: u.logistics206?.sourceNodeId || null, destinationNodeId: u.logistics206?.destinationNodeId || null,
    }));
    return { version: BUILD, player, enemy, nodes, trucks, telemetry: { ...ensureGame(game).telemetry }, conservationError: finite(game.logistics206.audit?.conservationError) };
  }

  function hashMix(hash, value) {
    let n;
    if (typeof value === 'string') {
      n = 2166136261 >>> 0;
      for (let i = 0; i < value.length; i += 1) { n ^= value.charCodeAt(i); n = Math.imul(n, 16777619) >>> 0; }
    } else n = Math.round(finite(value) * 1000) >>> 0;
    hash ^= n >>> 0;
    return Math.imul(hash, 16777619) >>> 0;
  }

  function logisticsHash(game) {
    let hash = 2166136261 >>> 0;
    scanEntities(game);
    for (const team of ['player','enemy']) {
      hash = hashMix(hash, team); hash = hashMix(hash, game.teams?.[team]?.credits || 0);
      const contracts = ensureGame(game).team[team].contracts || {};
      for (const key of Object.keys(contracts).sort()) hash = hashMix(hash, JSON.stringify(contracts[key]));
    }
    const entities = [...(game.buildings || []), ...(game.units || [])].filter(e => e?.alive).sort(compareIds);
    for (const entity of entities) {
      const s = entity.logistics206; if (!s) continue;
      hash = hashMix(hash, entity.id);
      if (s.stock) for (const key of STOCK_KEYS) hash = hashMix(hash, s.stock[key]);
      if (s.importBuffer) for (const key of STOCK_KEYS) hash = hashMix(hash, s.importBuffer[key]);
      if (s.cargo) for (const key of STOCK_KEYS) hash = hashMix(hash, s.cargo[key]);
      for (const key of ['fuel','ammoReady','ammoReserve','support','routeRisk']) if (Number.isFinite(s[key])) hash = hashMix(hash, s[key]);
      for (const key of ['missionType','status','sourceNodeId','destinationNodeId','targetGroupId']) if (s[key] != null) hash = hashMix(hash, String(s[key]));
      if (Number.isFinite(entity.resourceBuffer83)) hash = hashMix(hash, entity.resourceBuffer83);
      if (entity.resourceType206) hash = hashMix(hash, entity.resourceType206);
    }
    return hash >>> 0;
  }

  function exportState(game) {
    const state = ensureGame(game);
    return {
      version: BUILD,
      routeRisk: { ...state.routeRisk },
      team: JSON.parse(JSON.stringify(state.team)),
      telemetry: { ...state.telemetry },
      audit: { ...state.audit },
      history: state.history.slice(-128),
    };
  }

  function importState(game, data) {
    if (!data || typeof data !== 'object') { ensureGame(game); scanEntities(game, true); return false; }
    game.logistics206 = {
      version: BUILD,
      routeRisk: { ...(data.routeRisk || {}) },
      team: JSON.parse(JSON.stringify(data.team || {})),
      telemetry: { ...(data.telemetry || {}) },
      audit: { ...(data.audit || {}) },
      history: Array.isArray(data.history) ? data.history.slice(-128) : [],
      lastScanTick: -1,
      tickBucket: 0,
    };
    ensureGame(game); scanEntities(game, true); return true;
  }

  function unitReadiness(unit) {
    const s = ensureUnit(unit, false);
    if (!s) return { fuel: 1, ammo: 1, support: 1, supply: 1 };
    const fuel = s.fuelMax > EPS ? clamp(s.fuel / s.fuelMax, 0, 1) : 1;
    const ammoMax = s.ammoReadyMax + s.ammoReserveMax;
    const ammo = ammoMax > EPS ? clamp((s.ammoReady + s.ammoReserve) / ammoMax, 0, 1) : 1;
    const support = s.supportMax > EPS ? clamp(s.support / s.supportMax, 0, 1) : 1;
    const supply = clamp(fuel * .34 + ammo * .43 + support * .23, 0, 1);
    return { fuel, ammo, support, supply };
  }

  const api = root.__FD_LOGISTICS206__ = {
    version: VERSION, build: BUILD, STOCK_KEYS, PRIORITY, NODE_PROFILES, NODE_TYPES, EXTRACTION_TYPES,
    round, finite, clamp, emptyManifest, manifestTotal, copyManifest, makeStock, normalizeStock, stockRatio,
    transferResource, transferManifest, thresholdsFor, priorityName, priorityMultiplier, computeDemand, allocateManifest,
    profileForBuilding, extractorResourceType, isTruck, isAir, isHelicopter, isMotorized, hasWeapon,
    ensureUnit, ensureNode, ensureExtractor, ensureGame, scanEntities, logEvent, totalPhysical, aggregateTeam,
    logisticsSnapshot, logisticsHash, exportState, importState, unitReadiness,
  };

  if (!Game || !Unit || !Building) return;
  if (Game.prototype.__fdLogisticsCore206Installed) return;
  Object.defineProperty(Game.prototype, '__fdLogisticsCore206Installed', { value: true, configurable: true });

  Game.prototype.ensureLogistics206 = function(force = false) { ensureGame(this); scanEntities(this, force); return this.logistics206; };
  Game.prototype.exportLogistics206 = function() { return exportState(this); };
  Game.prototype.importLogistics206 = function(data) { return importState(this, data); };
  Game.prototype.logisticsHash206 = function() { return logisticsHash(this); };
  Game.prototype.getLogisticsSnapshot206 = function() { return logisticsSnapshot(this); };
  Game.prototype.logisticsEvent206 = function(type, detail) { return logEvent(this, type, detail); };
  Game.prototype.logisticsHooks206 = function() {
    this._logisticsHooks206 ||= { pre: [], post: [] };
    return this._logisticsHooks206;
  };
  Game.prototype.registerLogisticsHook206 = function(stage, fn, order = 100) {
    const hooks = this.logisticsHooks206();
    if (!hooks[stage] || typeof fn !== 'function') return false;
    if (!hooks[stage].some(entry => entry.fn === fn)) hooks[stage].push({ fn, order: finite(order, 100) });
    hooks[stage].sort((a,b) => a.order - b.order);
    return true;
  };

  const baseUnitSerialize206 = Unit.prototype.serialize;
  if (typeof baseUnitSerialize206 === 'function') Unit.prototype.serialize = function() {
    const data = baseUnitSerialize206.call(this);
    if (this.logistics206) data.logistics206 = JSON.parse(JSON.stringify(this.logistics206));
    return data;
  };
  const baseBuildingSerialize206 = Building.prototype.serialize;
  if (typeof baseBuildingSerialize206 === 'function') Building.prototype.serialize = function() {
    const data = baseBuildingSerialize206.call(this);
    if (this.logistics206) data.logistics206 = JSON.parse(JSON.stringify(this.logistics206));
    if (this.resourceType206) data.resourceType206 = this.resourceType206;
    if (Number.isFinite(this.resourceBuffer83)) data.resourceBuffer83 = this.resourceBuffer83;
    if (Number.isFinite(this.resourceBufferMax206)) data.resourceBufferMax206 = this.resourceBufferMax206;
    return data;
  };

  const baseHydrate206 = Game.prototype.hydrate;
  if (typeof baseHydrate206 === 'function') Game.prototype.hydrate = function(data) {
    const result = baseHydrate206.call(this, data);
    const rawById = new Map((data?.entities || []).map(raw => [String(raw.id), raw]));
    for (const entity of [...(this.units || []), ...(this.buildings || [])]) {
      const raw = rawById.get(String(entity.id));
      if (raw?.logistics206) entity.logistics206 = JSON.parse(JSON.stringify(raw.logistics206));
      if (entity.kind === 'building') {
        if (raw?.resourceType206) entity.resourceType206 = raw.resourceType206;
        if (Number.isFinite(raw?.resourceBuffer83)) entity.resourceBuffer83 = raw.resourceBuffer83;
        if (Number.isFinite(raw?.resourceBufferMax206)) entity.resourceBufferMax206 = raw.resourceBufferMax206;
      }
    }
    this.importLogistics206?.(data?.logistics206 || null);
    scanEntities(this, true);
    return result;
  };

  const baseSimulate206 = Game.prototype.simulateFixed;
  if (typeof baseSimulate206 === 'function') Game.prototype.simulateFixed = function(dt) {
    ensureGame(this); scanEntities(this);
    const hooks = this.logisticsHooks206();
    for (const entry of hooks.pre) entry.fn.call(this, dt);
    const result = baseSimulate206.call(this, dt);
    for (const entry of hooks.post) entry.fn.call(this, dt);
    return result;
  };

  // Initial values are deliberately generous: logistics constrains sustained operations,
  // not the first seconds of a match. New saves migrate lazily on first authoritative tick.
  root.__FD_LOGISTICS206_READY__ = { version: VERSION, build: BUILD };
})();
