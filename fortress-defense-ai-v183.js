(() => {
  'use strict';

  const root = globalThis;
  const debug = root.__FD_DEBUG__;
  const GameClass = debug?.Game;
  const UnitClass = debug?.Unit;
  const BuildingClass = debug?.Building;
  const TacticalAIClass = debug?.TacticalAI;
  const BUILDING_TYPES = debug?.BUILDING_TYPES || {};
  const UNIT_TYPES = debug?.UNIT_TYPES || {};
  const getBuildingStats = debug?.getBuildingStats;
  const getUnitStats = debug?.getUnitStats;
  const WORLD = debug?.WORLD || { width: 32000, height: 22000 };
  if (!GameClass || !UnitClass || !TacticalAIClass) return;
  if (TacticalAIClass.prototype.__fdFortressDefense183Installed) return;
  Object.defineProperty(TacticalAIClass.prototype, '__fdFortressDefense183Installed', {
    value: true,
    configurable: true,
  });

  const VERSION = '16.7';
  const BUILD = 183;
  const clamp183 = (value, min, max) => Math.max(min, Math.min(max, value));
  const finite183 = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const dist183 = (left, right) => Math.hypot(finite183(left?.x) - finite183(right?.x), finite183(left?.y) - finite183(right?.y));
  const hash183 = value => {
    let hash = 2166136261 >>> 0;
    for (const char of String(value ?? '')) {
      hash ^= char.charCodeAt(0);
      hash = Math.imul(hash, 16777619) >>> 0;
    }
    return hash >>> 0;
  };
  const clampPoint183 = value => ({
    x: clamp183(finite183(value?.x), 180, WORLD.width - 180),
    y: clamp183(finite183(value?.y), 180, WORLD.height - 180),
  });
  const normalize183 = (x, y) => {
    const length = Math.hypot(x, y) || 1;
    return { x: x / length, y: y / length };
  };
  const text183 = entity => `${entity?.typeId || ''} ${entity?.stats?.name || entity?.name || ''} ${entity?.stats?.visualRole || ''} ${entity?.stats?.role || ''}`.toLowerCase();

  const CONFIG = Object.freeze({
    easy: {
      buildInterval: 3.0, buildBatch: 1, readiness: .50, reserveRatio: .24, reserveMin: 10,
      capMin: 2, sensor: 1, ground: 5, bunker: 2, aa: 2, missile: 1, abm: 0, counterUAS: 1, mine: 1, airfield: 1,
    },
    normal: {
      buildInterval: 1.9, buildBatch: 2, readiness: .66, reserveRatio: .32, reserveMin: 18,
      capMin: 4, sensor: 2, ground: 9, bunker: 4, aa: 5, missile: 2, abm: 1, counterUAS: 2, mine: 2, airfield: 1,
    },
    hard: {
      buildInterval: 1.25, buildBatch: 3, readiness: .76, reserveRatio: .38, reserveMin: 26,
      capMin: 7, sensor: 3, ground: 14, bunker: 6, aa: 8, missile: 4, abm: 2, counterUAS: 3, mine: 3, airfield: 2,
    },
  });

  const TYPE_CANDIDATES = Object.freeze({
    power: ['fusionPlant', 'power', 'solarArray', 'geothermalPlant'],
    sensor: ['radar', 'sensorTower', 'commandRelay'],
    ground: ['cannonTurret', 'turret', 'flameTower'],
    bunker: ['bunker', 'forwardOutpost'],
    aa: ['aaTurret', 'missileBattery', 'counterUASTower'],
    missile: ['missileBattery', 'aaTurret'],
    abm: ['abmBattery', 'orbitalDefense'],
    counterUAS: ['counterUASTower', 'aaTurret'],
    mine: ['mineControl'],
    airfield: ['advancedAirfield', 'airfield', 'droneBay'],
  });

  const CRITICAL_TYPES = new Set([
    'hq', 'commandCenter', 'power', 'fusionPlant', 'solarArray', 'geothermalPlant',
    'factory', 'vehicleFactory', 'heavyFactory', 'artilleryFoundry', 'barracks',
    'airfield', 'advancedAirfield', 'droneBay', 'refinery', 'logisticsHub',
    'resourceSilo', 'commandRelay', 'radar', 'techLab', 'cyberLab',
  ]);

  function config183(ai) {
    return CONFIG[ai?.game?.difficultyKey] || CONFIG.normal;
  }

  function state183(ai) {
    ai.fortressState183 ||= {
      version: VERSION,
      build: BUILD,
      nextBuildAt: 0,
      nextReserveAt: 0,
      nextAirAt: 0,
      nextProductionAt: 0,
      nextGateAt: 0,
      buildSerial: 0,
      threatLevel: 0,
      threatX: finite183(ai.base?.x, finite183(ai.game?.enemyBase?.x)),
      threatY: finite183(ai.base?.y, finite183(ai.game?.enemyBase?.y)),
      metrics: {
        fortificationsBuilt: 0,
        buildSurges: 0,
        sensorsBuilt: 0,
        groundDefensesBuilt: 0,
        aaBuilt: 0,
        missileComplexesBuilt: 0,
        abmBuilt: 0,
        mineControllersBuilt: 0,
        airfieldsBuilt: 0,
        capOrders: 0,
        defensiveSorties: 0,
        aircraftQueued: 0,
        reserveOrders: 0,
        offensiveLaunchesBlocked: 0,
        protectedAssets: 0,
        lastReadiness: 0,
      },
    };
    return ai.fortressState183;
  }

  function buildingStats183(ai, typeId) {
    try {
      if (typeof getBuildingStats === 'function') return getBuildingStats(typeId, ai.game.teams?.enemy);
    } catch (_) {}
    return BUILDING_TYPES[typeId] || null;
  }

  function unitStats183(ai, typeId) {
    try {
      if (typeof getUnitStats === 'function') return getUnitStats(typeId, ai.game.teams?.enemy);
    } catch (_) {}
    return UNIT_TYPES[typeId] || null;
  }

  function aliveEnemyBuildings183(ai) {
    return (ai.game.buildings || []).filter(building => building?.alive && building.team === 'enemy');
  }

  function aliveEnemyUnits183(ai) {
    return (ai.game.units || []).filter(unit => unit?.alive && unit.team === 'enemy' && !unit.embarkedIn);
  }

  function isDefense183(building) {
    const type = building?.typeId;
    return Boolean(building?.stats?.category === 'defense' ||
      ['turret', 'cannonTurret', 'bunker', 'mineControl', 'aaTurret', 'counterUASTower', 'missileBattery', 'abmBattery', 'flameTower', 'orbitalDefense', 'forwardOutpost'].includes(type));
  }

  function isAA183(entity) {
    return Boolean(entity?.stats?.weapon?.targets?.includes?.('air') || entity?.stats?.interceptPower || entity?.stats?.softKillPower ||
      /anti-air|sam|counter-uas|air defense|пво|зенит|interceptor/.test(text183(entity)));
  }

  function isAirfield183(building) {
    return Boolean(building?.stats?.produces?.some?.(typeId => unitStats183({ game: building.game || { teams: { enemy: {} } } }, typeId)?.air) ||
      /airfield|dronebay|air base|аэродром/.test(text183(building)));
  }

  function buildingRole183(building) {
    const type = building?.typeId;
    if (['radar', 'sensorTower', 'commandRelay'].includes(type) || building?.stats?.radarRelay) return 'sensor';
    if (type === 'abmBattery' || type === 'orbitalDefense') return 'abm';
    if (type === 'missileBattery') return 'missile';
    if (type === 'counterUASTower') return 'counterUAS';
    if (type === 'mineControl') return 'mine';
    if (type === 'bunker' || type === 'forwardOutpost') return 'bunker';
    if (isAirfield183(building)) return 'airfield';
    if (isAA183(building)) return 'aa';
    if (isDefense183(building)) return 'ground';
    return 'other';
  }

  function criticalAssets183(ai) {
    const base = ai.base || ai.game.enemyBase || { x: WORLD.width * .8, y: WORLD.height * .5 };
    const assets = aliveEnemyBuildings183(ai)
      .filter(building => building.completed !== false && (
        CRITICAL_TYPES.has(building.typeId) ||
        ['production', 'technology', 'strategy', 'economy'].includes(building.stats?.category) ||
        finite183(building.stats?.power) > 0 || building.stats?.produces?.length || building.stats?.dropoff
      ))
      .sort((left, right) => {
        const score = building => (building.typeId === 'hq' || building.typeId === 'commandCenter' ? 1000 : 0) +
          (finite183(building.stats?.power) > 0 ? 350 : 0) + (building.stats?.produces?.length ? 300 : 0) +
          (isAirfield183(building) ? 260 : 0) - dist183(building, base) * .02;
        return score(right) - score(left);
      });
    if (!assets.length) assets.push({ id: 'enemy-base-183', x: base.x, y: base.y, typeId: 'base-anchor', stats: {} });
    return assets.slice(0, 12);
  }

  function threatPicture183(ai) {
    const base = ai.base || ai.game.enemyBase || { x: WORLD.width * .8, y: WORLD.height * .5 };
    const contacts = [];
    for (const unit of ai.game.units || []) {
      if (!unit?.alive || unit.team !== 'player' || unit.embarkedIn) continue;
      const distance = dist183(unit, base);
      if (distance > 5600) continue;
      let observed = distance < 1500;
      try { observed ||= Boolean(ai.canObserveEntity128?.(unit, true)); } catch (_) {}
      if (!observed) continue;
      contacts.push(unit);
    }
    if (!contacts.length) return { level: 0, score: 0, air: 0, ground: 0, contacts: [], point: { x: base.x, y: base.y } };
    let score = 0;
    let air = 0;
    let ground = 0;
    let x = 0;
    let y = 0;
    for (const unit of contacts) {
      const distance = Math.max(1, dist183(unit, base));
      const armed = unit.stats?.weapon ? 1 : .25;
      const weight = armed * (1 + finite183(unit.stats?.cost, 300) / 900) * clamp183(1 - distance / 6500, .12, 1);
      score += weight;
      x += unit.x * weight;
      y += unit.y * weight;
      if (unit.air) air += 1;
      else ground += 1;
    }
    const level = score >= 24 || contacts.length >= 38 ? 3 : score >= 10 || contacts.length >= 16 ? 2 : 1;
    return { level, score, air, ground, contacts, point: { x: x / Math.max(.001, score), y: y / Math.max(.001, score) } };
  }

  function dynamicQuotas183(ai, threat) {
    const base = { ...config183(ai) };
    const elapsed = finite183(ai.game.time);
    const scale = elapsed > 900 ? 1.35 : elapsed > 480 ? 1.20 : elapsed > 180 ? 1.08 : 1;
    const threatBoost = threat.level === 3 ? 1.45 : threat.level === 2 ? 1.25 : 1;
    for (const key of ['ground', 'bunker', 'aa', 'missile', 'abm', 'counterUAS', 'mine']) {
      base[key] = Math.max(base[key], Math.ceil(base[key] * scale * threatBoost));
    }
    if (threat.air >= 4) {
      base.aa += Math.ceil(threat.air / 3);
      base.missile += Math.ceil(threat.air / 8);
      base.counterUAS += 1;
    }
    if (threat.ground >= 16) {
      base.ground += Math.ceil(threat.ground / 12);
      base.bunker += Math.ceil(threat.ground / 22);
      base.mine += 1;
    }
    return base;
  }

  function inventory183(ai) {
    const counts = { sensor: 0, ground: 0, bunker: 0, aa: 0, missile: 0, abm: 0, counterUAS: 0, mine: 0, airfield: 0 };
    const buildings = aliveEnemyBuildings183(ai);
    for (const building of buildings) {
      const role = buildingRole183(building);
      if (counts[role] != null) counts[role] += 1;
      if (isDefense183(building) && !['bunker', 'aa', 'missile', 'abm', 'counterUAS', 'mine'].includes(role)) counts.ground += 1;
      if (isAA183(building) && !['aa', 'missile', 'abm', 'counterUAS'].includes(role)) counts.aa += 1;
    }
    return { counts, buildings };
  }

  function powerMargin183(ai) {
    const team = ai.game.teams?.enemy || {};
    const produced = finite183(team.powerProduced);
    const used = finite183(team.powerUsed);
    return { produced, used, margin: produced - used, ratio: produced > 0 ? (produced - used) / produced : -1 };
  }

  function canConstruct183(ai, typeId, reserveCredits = 650) {
    const stats = buildingStats183(ai, typeId);
    const team = ai.game.teams?.enemy;
    if (!stats || !team) return false;
    const cost = finite183(stats.cost, Infinity);
    if (!Number.isFinite(cost) || team.credits < cost + reserveCredits) return false;
    try {
      if (typeof ai.game.requirementsMet === 'function' && !ai.game.requirementsMet('enemy', stats.requires || [], stats.rank || 1)) return false;
    } catch (_) {}
    return true;
  }

  function firstConstructible183(ai, category, reserveCredits) {
    return (TYPE_CANDIDATES[category] || []).find(typeId => canConstruct183(ai, typeId, reserveCredits)) || null;
  }

  function assetCoverage183(ai, asset, radius = 900) {
    const defenses = aliveEnemyBuildings183(ai).filter(building => isDefense183(building) && dist183(building, asset) <= radius);
    return {
      total: defenses.length,
      ground: defenses.filter(building => !isAA183(building)).length,
      aa: defenses.filter(isAA183).length,
    };
  }

  function leastProtectedAsset183(ai, category) {
    const assets = criticalAssets183(ai);
    let best = assets[0];
    let bestScore = Infinity;
    for (const asset of assets) {
      const coverage = assetCoverage183(ai, asset, category === 'sensor' ? 1200 : 900);
      const weight = category === 'aa' || category === 'missile' || category === 'abm' || category === 'counterUAS'
        ? coverage.aa * 2.2 + coverage.total * .25
        : coverage.ground * 2 + coverage.total * .25;
      const criticalBonus = asset.typeId === 'hq' || asset.typeId === 'commandCenter' ? -1.4 :
        finite183(asset.stats?.power) > 0 ? -.9 : asset.stats?.produces?.length ? -.7 : 0;
      const score = weight + criticalBonus;
      if (score < bestScore) { best = asset; bestScore = score; }
    }
    return best;
  }

  function chooseBuild183(ai, threat, quotas, inventory) {
    const power = powerMargin183(ai);
    const reserve = threat.level >= 2 ? 220 : 650;
    if (power.produced <= 0 || power.margin < Math.max(75, power.used * .24)) {
      const typeId = firstConstructible183(ai, 'power', threat.level >= 2 ? 120 : 400);
      if (typeId) return { category: 'power', typeId, asset: leastProtectedAsset183(ai, 'ground'), ring: 'utility' };
    }
    const order = ['sensor', 'missile', 'abm', 'aa', 'counterUAS', 'bunker', 'ground', 'mine', 'airfield'];
    for (const category of order) {
      if (inventory.counts[category] >= quotas[category]) continue;
      const typeId = firstConstructible183(ai, category, reserve);
      if (!typeId) continue;
      return {
        category,
        typeId,
        asset: leastProtectedAsset183(ai, category),
        ring: category === 'sensor' ? 'outer' : category === 'airfield' || category === 'power' ? 'utility' :
          ['missile', 'abm', 'aa', 'counterUAS'].includes(category) ? 'middle' : category === 'mine' ? 'outer' : 'inner',
      };
    }

    // Even after meeting global quotas, no command post, power plant, factory or
    // airfield may remain as an undefended single point of failure.
    for (const asset of criticalAssets183(ai)) {
      const coverage = assetCoverage183(ai, asset, 850);
      if (coverage.ground < 2) {
        const typeId = firstConstructible183(ai, 'ground', reserve) || firstConstructible183(ai, 'bunker', reserve);
        if (typeId) return { category: 'ground', typeId, asset, ring: 'asset' };
      }
      if (coverage.aa < 1) {
        const typeId = firstConstructible183(ai, 'aa', reserve);
        if (typeId) return { category: 'aa', typeId, asset, ring: 'asset' };
      }
    }
    return null;
  }

  function buildAnchor183(ai, choice, serial, threat) {
    const asset = choice.asset || ai.base || ai.game.enemyBase;
    const base = ai.base || ai.game.enemyBase || asset;
    const towardThreat = normalize183(threat.point.x - asset.x, threat.point.y - asset.y);
    const facing = Math.atan2(towardThreat.y, towardThreat.x);
    const radii = {
      utility: 360,
      asset: 520,
      inner: 650,
      middle: 930,
      outer: 1320,
    };
    const radius = radii[choice.ring] || 720;
    const slots = choice.ring === 'outer' ? 12 : choice.ring === 'middle' ? 10 : 8;
    const slot = serial % slots;
    const spread = (slot - (slots - 1) / 2) * (Math.PI * 1.72 / slots);
    const angle = facing + spread + ((hash183(`${choice.typeId}:${asset.id}:${serial}`) % 101) - 50) / 500;
    const anchor = clampPoint183({
      x: asset.x + Math.cos(angle) * radius,
      y: asset.y + Math.sin(angle) * radius,
    });
    // Keep utility buildings behind the main fighting line.
    if (choice.ring === 'utility') {
      const away = normalize183(asset.x - threat.point.x, asset.y - threat.point.y);
      anchor.x = clamp183(asset.x + away.x * radius, 180, WORLD.width - 180);
      anchor.y = clamp183(asset.y + away.y * radius, 180, WORLD.height - 180);
    }
    // Do not let a critical-asset strongpoint drift outside the base system.
    if (dist183(anchor, base) > 2500 && choice.ring !== 'outer') {
      const direction = normalize183(anchor.x - base.x, anchor.y - base.y);
      anchor.x = base.x + direction.x * 2300;
      anchor.y = base.y + direction.y * 2300;
    }
    return anchor;
  }

  function findBuildSpot183(ai, choice, anchor, serial) {
    const candidates = [anchor];
    for (let ring = 1; ring <= 3; ring += 1) {
      for (let index = 0; index < 12; index += 1) {
        const angle = index / 12 * Math.PI * 2;
        candidates.push(clampPoint183({
          x: anchor.x + Math.cos(angle) * ring * 150,
          y: anchor.y + Math.sin(angle) * ring * 150,
        }));
      }
    }
    for (const candidate of candidates) {
      let spot = candidate;
      try { spot = ai.game.findAiBuildSpot?.(choice.typeId, candidate, serial) || candidate; } catch (_) {}
      if (!Number.isFinite(spot?.x) || !Number.isFinite(spot?.y)) continue;
      try {
        if (typeof ai.game.canPlaceBuilding === 'function') {
          const result = ai.game.canPlaceBuilding(choice.typeId, spot.x, spot.y, 0, 'enemy');
          if (result === false || result?.valid === false) continue;
        }
      } catch (_) { continue; }
      return clampPoint183(spot);
    }
    return null;
  }

  function recordBuilt183(ai, choice) {
    const metrics = state183(ai).metrics;
    metrics.fortificationsBuilt += 1;
    if (choice.category === 'sensor') metrics.sensorsBuilt += 1;
    if (['ground', 'bunker'].includes(choice.category)) metrics.groundDefensesBuilt += 1;
    if (['aa', 'counterUAS'].includes(choice.category)) metrics.aaBuilt += 1;
    if (choice.category === 'missile') metrics.missileComplexesBuilt += 1;
    if (choice.category === 'abm') metrics.abmBuilt += 1;
    if (choice.category === 'mine') metrics.mineControllersBuilt += 1;
    if (choice.category === 'airfield') metrics.airfieldsBuilt += 1;
  }

  function constructOne183(ai, threat, quotas) {
    if (!BuildingClass) return false;
    const state = state183(ai);
    const inventory = inventory183(ai);
    const choice = chooseBuild183(ai, threat, quotas, inventory);
    if (!choice) return false;
    const stats = buildingStats183(ai, choice.typeId);
    const team = ai.game.teams?.enemy;
    if (!stats || !team) return false;
    const cost = finite183(stats.cost, Infinity);
    if (!Number.isFinite(cost) || team.credits < cost) return false;
    const serial = state.buildSerial++;
    const anchor = buildAnchor183(ai, choice, serial, threat);
    const spot = findBuildSpot183(ai, choice, anchor, serial + (ai.wave || 0) * 17);
    if (!spot) return false;
    team.credits -= cost;
    const building = new BuildingClass(ai.game, {
      typeId: choice.typeId,
      team: 'enemy',
      x: spot.x,
      y: spot.y,
      rotation: Math.atan2(threat.point.y - spot.y, threat.point.x - spot.x),
      construction: .04,
      autoConstruct: true,
    });
    building.fortressDefense183 = true;
    building.fortressRole183 = choice.category;
    building.protectedAsset183 = choice.asset?.id || null;
    const added184 = ai.game.addEntity?.(building);
    if (added184 === false) return false;
    ai.game.recalculatePower?.();
    if (stats.category === 'defense') ai.defenseCount = (ai.defenseCount || 0) + 1;
    recordBuilt183(ai, choice);
    return true;
  }

  function isCombatGround183(unit) {
    return Boolean(unit?.alive && unit.team === 'enemy' && !unit.air && unit.kind === 'unit' &&
      unit.typeId !== 'worker' && unit.stats?.weapon && !unit.embarkedIn && finite183(unit.healthRatio, 1) > .22);
  }

  function isArtillery183(unit) {
    return Boolean(unit?.stats?.weapon && (unit.stats.weapon.ballistic || finite183(unit.stats.weapon.range) >= 620 ||
      /artillery|howitzer|mortar|mlrs|rocket artillery|артилл|рсзо|гаубиц/.test(text183(unit))));
  }

  function groundReserveDesired183(ai, threat, combatCount) {
    const cfg = config183(ai);
    const ratio = cfg.reserveRatio + (threat.level === 3 ? .12 : threat.level === 2 ? .07 : 0);
    return clamp183(Math.max(cfg.reserveMin, Math.ceil(combatCount * ratio)), 0, combatCount >= 1000 ? 320 : combatCount >= 300 ? 120 : 72);
  }

  function reserveAnchor183(ai, index, count, threat, asset) {
    const base = asset || ai.base || ai.game.enemyBase;
    const direction = normalize183(threat.point.x - base.x, threat.point.y - base.y);
    const facing = Math.atan2(direction.y, direction.x);
    const columns = Math.max(4, Math.ceil(Math.sqrt(count)));
    const row = Math.floor(index / columns);
    const column = index % columns;
    const lateral = (column - (columns - 1) / 2) * 74;
    const rear = 300 + row * 80;
    return clampPoint183({
      x: base.x - direction.x * rear - direction.y * lateral,
      y: base.y - direction.y * rear + direction.x * lateral,
    });
  }

  function updateGroundReserve183(ai, threat, force = false) {
    const state = state183(ai);
    const now = finite183(ai.game.time);
    if (!force && now < state.nextReserveAt) return;
    state.nextReserveAt = now + (threat.level ? .75 : 2.2);
    const combat = aliveEnemyUnits183(ai).filter(isCombatGround183);
    const desired = groundReserveDesired183(ai, threat, combat.length);
    let reserved = combat.filter(unit => unit._fortressReserve183);
    if (reserved.length < desired) {
      const candidates = combat
        .filter(unit => !unit._fortressReserve183 && !unit.deepOperation182)
        .sort((left, right) => {
          const score = unit => finite183(unit.healthRatio, 1) * 130 + finite183(unit.stats?.speed) * .22 +
            (isAA183(unit) ? 45 : 0) + (isArtillery183(unit) ? 22 : 0) + finite183(unit.stats?.cost) * .025;
          return score(right) - score(left);
        });
      for (const unit of candidates.slice(0, desired - reserved.length)) {
        unit._fortressReserve183 = true;
        unit._deepDefensiveReserve182 = true;
        unit._deepDefenseEngaged182 = false;
        reserved.push(unit);
      }
    }
    if (reserved.length > desired && !threat.level) {
      for (const unit of reserved.slice(desired)) {
        unit._fortressReserve183 = false;
        unit._deepDefensiveReserve182 = false;
      }
      reserved = reserved.slice(0, desired);
    }

    const assets = criticalAssets183(ai);
    if (threat.level) {
      const centroid = threat.point;
      for (const unit of reserved) {
        unit._deepDefensiveReserve182 = true;
        unit._deepDefenseEngaged182 = true;
        if (now < finite183(unit._fortressOrderAt183)) continue;
        const target = threat.contacts
          .filter(enemy => unit.canAttack?.(enemy))
          .sort((left, right) => dist183(unit, left) - dist183(unit, right))[0];
        if (target) unit.setCommand?.({ type: 'attack', targetId: target.id });
        else unit.setCommand?.({ type: 'attackMove', x: centroid.x, y: centroid.y });
        unit._fortressOrderAt183 = now + .9 + (hash183(unit.id) % 11) * .05;
      }
      state.metrics.reserveOrders += reserved.length;
      return;
    }

    reserved.forEach((unit, index) => {
      unit._deepDefensiveReserve182 = true;
      unit._deepDefenseEngaged182 = false;
      if (now < finite183(unit._fortressOrderAt183)) return;
      const asset = assets[index % assets.length];
      const point = reserveAnchor183(ai, index, reserved.length, threat, asset);
      if (dist183(unit, point) > 130) {
        unit.setCommand?.({ type: 'move', x: point.x, y: point.y });
        unit.setCommand?.({ type: 'hold' }, true);
      } else if (unit.currentCommand?.type !== 'hold') unit.setCommand?.({ type: 'hold' });
      unit._fortressOrderAt183 = now + 4.4 + (hash183(unit.id) % 23) * .08;
    });
  }

  function airRole183(unitOrStats, typeId = '') {
    const stats = unitOrStats?.stats || unitOrStats || {};
    return `${typeId || unitOrStats?.typeId || ''} ${stats.visualRole || ''} ${stats.role || ''}`.toLowerCase();
  }

  function defensiveAircraft183(unit) {
    if (!unit?.alive || !unit.air || unit.team !== 'enemy' || unit.embarkedIn) return false;
    const role = airRole183(unit);
    if (/transport|airlifter|repair/.test(role)) return false;
    if (/bomber|aerialartillery|stealthstriker/.test(role) && !unit.stats?.weapon?.targets?.includes?.('air')) return false;
    return Boolean(unit.stats?.weapon || /awacs|recon|drlo|дрло/.test(role));
  }

  function desiredCap183(ai, threat) {
    const cfg = config183(ai);
    const enemyAir = (ai.game.units || []).filter(unit => unit?.alive && unit.team === 'player' && unit.air).length;
    return Math.max(cfg.capMin, Math.ceil(enemyAir * .42) + (threat.level >= 2 ? 2 : 0));
  }

  function capPatrol183(ai, unit, index, count) {
    const base = ai.base || ai.game.enemyBase;
    const radius = 900 + (index % 3) * 340;
    const angle = index / Math.max(1, count) * Math.PI * 2 + finite183(ai.game.time) * .025;
    const ax = clampPoint183({ x: base.x + Math.cos(angle) * radius, y: base.y + Math.sin(angle) * radius });
    const bx = clampPoint183({ x: base.x - Math.cos(angle) * radius, y: base.y - Math.sin(angle) * radius });
    unit.setCommand?.({ type: 'patrol', ax: ax.x, ay: ax.y, bx: bx.x, by: bx.y, x: bx.x, y: bx.y, phase: false });
  }

  function updateAirDefense183(ai, threat, force = false) {
    const state = state183(ai);
    const now = finite183(ai.game.time);
    if (!force && now < state.nextAirAt) return;
    state.nextAirAt = now + (threat.level ? .65 : 2.6);
    const desired = desiredCap183(ai, threat);
    const candidates = aliveEnemyUnits183(ai)
      .filter(defensiveAircraft183)
      .sort((left, right) => {
        const score = unit => (/interceptor/.test(airRole183(unit)) ? 160 : 0) +
          (unit.stats?.weapon?.targets?.includes?.('air') ? 100 : 0) + finite183(unit.healthRatio, 1) * 80 + finite183(unit.stats?.speed) * .08;
        return score(right) - score(left);
      });
    const cap = candidates.slice(0, Math.min(desired, candidates.length));
    for (const unit of candidates) {
      unit._fortressCap183 = cap.includes(unit);
      if (unit._fortressCap183) unit._deepDefensiveReserve182 = true;
    }
    const airThreats = threat.contacts.filter(unit => unit.air);
    const groundThreats = threat.contacts.filter(unit => !unit.air);
    cap.forEach((unit, index) => {
      if (now < finite183(unit._fortressAirOrderAt183)) return;
      const compatible = [...airThreats, ...groundThreats]
        .filter(target => unit.canAttack?.(target))
        .sort((left, right) => dist183(unit, left) - dist183(unit, right));
      if (compatible.length) {
        unit.setCommand?.({ type: 'attack', targetId: compatible[0].id });
        state.metrics.defensiveSorties += 1;
      } else if (threat.level) {
        unit.setCommand?.({ type: 'attackMove', x: threat.point.x, y: threat.point.y });
        state.metrics.defensiveSorties += 1;
      } else {
        capPatrol183(ai, unit, index, cap.length);
        state.metrics.capOrders += 1;
      }
      unit._fortressAirOrderAt183 = now + (threat.level ? 1.4 : 7.0) + (hash183(unit.id) % 13) * .13;
    });
    return { desired, cap: cap.length };
  }

  function queuedTypeCount183(game, typeId) {
    let count = 0;
    for (const building of game.buildings || []) {
      if (!building?.alive || building.team !== 'enemy') continue;
      for (const item of building.queue || []) if ((item.typeId || item.itemId) === typeId) count += 1;
    }
    return count;
  }

  function airProductionScore183(typeId, stats, threat) {
    if (!stats?.air) return -Infinity;
    const role = airRole183(stats, typeId);
    let score = 0;
    if (/interceptor/.test(role)) score += 900;
    if (stats.weapon?.targets?.includes?.('air')) score += 620;
    if (/multirole|gunship/.test(role)) score += 360;
    if (/awacs|recon|drlo|дрло/.test(role)) score += 240;
    if (/transport|airlifter|repair/.test(role)) score -= 900;
    if (/bomber|heavybomber/.test(role)) score -= threat.ground >= 20 ? 80 : 420;
    score += finite183(stats.speed) * .35 + finite183(stats.cost) * .02;
    return score;
  }

  function requestDefensiveAircraft183(ai, threat, force = false) {
    const state = state183(ai);
    const now = finite183(ai.game.time);
    if (!force && now < state.nextProductionAt) return false;
    state.nextProductionAt = now + (threat.level ? 2.8 : 6.0);
    const desired = desiredCap183(ai, threat);
    const current = aliveEnemyUnits183(ai).filter(defensiveAircraft183).length;
    const queued = (ai.game.buildings || []).reduce((sum, building) => sum + (building.queue || []).filter(item => {
      const stats = unitStats183(ai, item.typeId || item.itemId);
      return stats?.air && airProductionScore183(item.typeId || item.itemId, stats, threat) > 0;
    }).length, 0);
    if (current + queued >= desired) return false;
    const team = ai.game.teams?.enemy;
    const producers = aliveEnemyBuildings183(ai)
      .filter(building => building.completed && building.stats?.produces?.length && (building.queue?.length || 0) < 3)
      .sort((left, right) => (left.queue?.length || 0) - (right.queue?.length || 0));
    for (const producer of producers) {
      const options = (producer.stats.produces || [])
        .map(typeId => ({ typeId, stats: unitStats183(ai, typeId) }))
        .filter(item => item.stats?.air && airProductionScore183(item.typeId, item.stats, threat) > 0)
        .sort((left, right) => airProductionScore183(right.typeId, right.stats, threat) - airProductionScore183(left.typeId, left.stats, threat));
      for (const option of options) {
        if (queuedTypeCount183(ai.game, option.typeId) > 1) continue;
        try { if (typeof ai.game.canProduceUnit === 'function' && !ai.game.canProduceUnit('enemy', option.typeId)) continue; } catch (_) {}
        const cost = finite183(option.stats.cost, Infinity);
        if (!Number.isFinite(cost) || !team || team.credits < cost + (threat.level ? 250 : 900)) continue;
        try {
          const result = ai.game.queueProduction?.(producer, option.typeId, 'unit', true);
          if (result !== false) {
            state.metrics.aircraftQueued += 1;
            return true;
          }
        } catch (_) {}
      }
    }
    return false;
  }

  function readiness183(ai, threat = threatPicture183(ai), quotas = dynamicQuotas183(ai, threat)) {
    const inventory = inventory183(ai);
    const counts = inventory.counts;
    const combat = aliveEnemyUnits183(ai).filter(isCombatGround183);
    const reserve = combat.filter(unit => unit._fortressReserve183).length;
    const desiredReserve = groundReserveDesired183(ai, threat, combat.length);
    const air = aliveEnemyUnits183(ai).filter(defensiveAircraft183);
    const cap = air.filter(unit => unit._fortressCap183).length;
    const desiredCap = desiredCap183(ai, threat);
    const power = powerMargin183(ai);
    const ratio = (key, weight) => clamp183(counts[key] / Math.max(1, quotas[key]), 0, 1) * weight;
    const assets = criticalAssets183(ai);
    const protectedAssets = assets.filter(asset => {
      const coverage = assetCoverage183(ai, asset, 850);
      return coverage.ground >= 2 && coverage.aa >= 1;
    }).length;
    const score = clamp183(
      ratio('sensor', .08) + ratio('ground', .15) + ratio('bunker', .08) +
      ratio('aa', .12) + ratio('missile', .10) + ratio('abm', .06) +
      ratio('counterUAS', .05) + ratio('mine', .04) + ratio('airfield', .04) +
      clamp183(reserve / Math.max(1, desiredReserve), 0, 1) * .12 +
      clamp183(cap / Math.max(1, desiredCap), 0, 1) * .08 +
      clamp183((power.margin + 40) / Math.max(120, power.used * .30), 0, 1) * .04 +
      clamp183(protectedAssets / Math.max(1, assets.length), 0, 1) * .04,
      0,
      1,
    );
    return {
      score, counts, quotas, reserve, desiredReserve, cap, desiredCap,
      threatLevel: threat.level, threatScore: threat.score, protectedAssets, criticalAssets: assets.length,
      powerMargin: power.margin,
    };
  }

  function supportTick183(ai, force = false) {
    const state = state183(ai);
    const now = finite183(ai.game.time);
    const threat = threatPicture183(ai);
    state.threatLevel = threat.level;
    state.threatX = threat.point.x;
    state.threatY = threat.point.y;
    const quotas = dynamicQuotas183(ai, threat);

    if (force || now >= state.nextBuildAt) {
      const cfg = config183(ai);
      state.nextBuildAt = now + (threat.level >= 2 ? cfg.buildInterval * .48 : cfg.buildInterval);
      const batch = cfg.buildBatch + (threat.level === 3 ? 2 : threat.level === 2 ? 1 : 0);
      let built = 0;
      for (let index = 0; index < batch; index += 1) {
        if (!constructOne183(ai, threat, quotas)) break;
        built += 1;
      }
      if (built > 1) state.metrics.buildSurges += 1;
    }

    updateGroundReserve183(ai, threat, force);
    updateAirDefense183(ai, threat, force);
    requestDefensiveAircraft183(ai, threat, force);
    const ready = readiness183(ai, threat, quotas);
    state.metrics.lastReadiness = ready.score;
    state.metrics.protectedAssets = ready.protectedAssets;
    return ready;
  }

  function launchAllowed183(ai) {
    const threat = threatPicture183(ai);
    const ready = readiness183(ai, threat);
    const required = config183(ai).readiness;
    const allowed = threat.level === 0 && ready.score >= required && ready.reserve >= Math.max(3, Math.floor(ready.desiredReserve * .82));
    if (!allowed) {
      const state = state183(ai);
      state.metrics.offensiveLaunchesBlocked += 1;
      const now = finite183(ai.game.time);
      if (now >= state.nextGateAt) {
        state.nextGateAt = now + .9;
        supportTick183(ai, true);
      }
    }
    return allowed;
  }

  const gateMethod183 = name => {
    const base = TacticalAIClass.prototype[name];
    if (typeof base !== 'function') return;
    TacticalAIClass.prototype[name] = function(...args) {
      if (!launchAllowed183(this)) return false;
      return base.apply(this, args);
    };
  };
  for (const name of ['launchCampaign129', 'ensurePersistentPressure129', 'launchWarOperations126', 'launchCoordinatedAttack']) gateMethod183(name);

  const baseAIUpdate183 = TacticalAIClass.prototype.update;
  TacticalAIClass.prototype.update = function(dt) {
    const result = baseAIUpdate183.call(this, dt);
    supportTick183(this, false);
    return result;
  };

  const baseUnitSerialize183 = UnitClass.prototype.serialize;
  if (typeof baseUnitSerialize183 === 'function') {
    UnitClass.prototype.serialize = function() {
      const data = baseUnitSerialize183.call(this);
      if (this._fortressReserve183) data.fortressReserve183 = true;
      if (this._fortressCap183) data.fortressCap183 = true;
      return data;
    };
  }

  const baseAISerialize183 = TacticalAIClass.prototype.serialize;
  if (typeof baseAISerialize183 === 'function') {
    TacticalAIClass.prototype.serialize = function() {
      const data = baseAISerialize183.call(this);
      const state = state183(this);
      data.fortressState183 = { ...state, metrics: { ...state.metrics } };
      return data;
    };
  }

  const baseHydrate183 = GameClass.prototype.hydrate;
  if (typeof baseHydrate183 === 'function') {
    GameClass.prototype.hydrate = function(data) {
      const result = baseHydrate183.call(this, data);
      if (this.ai && data?.ai?.fortressState183) {
        this.ai.fortressState183 = {
          ...state183(this.ai),
          ...data.ai.fortressState183,
          metrics: { ...state183(this.ai).metrics, ...(data.ai.fortressState183.metrics || {}) },
        };
      }
      const raw = new Map((data?.entities || []).filter(entity => entity.kind === 'unit').map(entity => [entity.id, entity]));
      for (const unit of this.units || []) {
        const saved = raw.get(unit.id);
        unit._fortressReserve183 = Boolean(saved?.fortressReserve183);
        unit._fortressCap183 = Boolean(saved?.fortressCap183);
        if (unit._fortressReserve183 || unit._fortressCap183) unit._deepDefensiveReserve182 = true;
      }
      return result;
    };
  }

  GameClass.prototype.fortressDefenseDiagnostics183 = function() {
    const ai = this.ai;
    if (!ai) return null;
    const state = state183(ai);
    const threat = threatPicture183(ai);
    const ready = readiness183(ai, threat);
    return {
      version: VERSION,
      build: BUILD,
      ...ready,
      metrics: { ...state.metrics },
    };
  };

  root.__FD_FORTRESS_DEFENSE_183__ = {
    version: VERSION,
    build: BUILD,
    diagnostics: () => debug.game?.fortressDefenseDiagnostics183?.() || null,
    forceTick: () => debug.game?.ai ? supportTick183(debug.game.ai, true) : null,
    forceBuild: () => {
      const ai = debug.game?.ai;
      if (!ai) return false;
      const threat = threatPicture183(ai);
      return constructOne183(ai, threat, dynamicQuotas183(ai, threat));
    },
  };
})();
