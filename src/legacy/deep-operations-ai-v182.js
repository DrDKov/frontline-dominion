(() => {
  'use strict';

  const root = globalThis;
  const debug = root.__FD_DEBUG__;
  const GameClass = debug?.Game;
  const UnitClass = debug?.Unit;
  const BuildingClass = debug?.Building;
  const TacticalAIClass = debug?.TacticalAI;
  const UNIT_TYPES = debug?.UNIT_TYPES || {};
  const BUILDING_TYPES = debug?.BUILDING_TYPES || {};
  const WORLD = debug?.WORLD;
  const getUnitStats = debug?.getUnitStats;
  const getBuildingStats = debug?.getBuildingStats;
  if (!GameClass || !UnitClass || !TacticalAIClass || !WORLD) return;
  if (TacticalAIClass.prototype.__fdDeepOperations182Installed) return;
  Object.defineProperty(TacticalAIClass.prototype, '__fdDeepOperations182Installed', {
    value: true,
    configurable: true,
  });

  const VERSION = '16.6.2';
  const BUILD = 182;
  const PHASES = Object.freeze({
    RECON: 'reconnaissance',
    ASSEMBLY: 'assembly',
    SHAPING: 'shaping',
    BREACH: 'breach',
    COMMIT: 'commit-reserve',
    EXPLOIT: 'exploitation',
    CONSOLIDATE: 'consolidation',
    ABORT: 'abort',
    COMPLETE: 'complete',
  });
  const PURPOSES = Object.freeze(['power', 'supply', 'production', 'extraction', 'weak', 'assault']);
  const DEFENSE_TYPES = Object.freeze([
    'turret', 'cannonTurret', 'bunker', 'mineControl', 'aaTurret',
    'counterUASTower', 'missileBattery', 'abmBattery', 'flameTower',
  ]);
  const SENSOR_TYPES = Object.freeze(['radar', 'sensorTower', 'commandRelay']);
  const POWER_TYPES = Object.freeze(['power', 'solarArray', 'fusionPlant', 'geothermalPlant']);
  const CONFIG = Object.freeze({
    easy: {
      operationLimit: 1, minForce: 8, packageCap: 48, reconThreshold: .44,
      defenseThreshold: .38, reserveRatio: .28, reconTimeout: 72,
      assemblyTimeout: 25, shapingMin: 9, shapingMax: 17,
      breachTimeout: 48, exploitationTime: 46, consolidationTime: 16,
      operationCooldown: 26, defenseInterval: 6.0, compositionInterval: 8.0,
    },
    normal: {
      operationLimit: 1, minForce: 12, packageCap: 110, reconThreshold: .56,
      defenseThreshold: .52, reserveRatio: .23, reconTimeout: 62,
      assemblyTimeout: 21, shapingMin: 11, shapingMax: 20,
      breachTimeout: 44, exploitationTime: 58, consolidationTime: 18,
      operationCooldown: 14, defenseInterval: 4.2, compositionInterval: 6.5,
    },
    hard: {
      operationLimit: 2, minForce: 15, packageCap: 190, reconThreshold: .64,
      defenseThreshold: .62, reserveRatio: .19, reconTimeout: 54,
      assemblyTimeout: 18, shapingMin: 12, shapingMax: 23,
      breachTimeout: 40, exploitationTime: 72, consolidationTime: 20,
      operationCooldown: 8, defenseInterval: 3.0, compositionInterval: 5.0,
    },
  });

  const clamp182 = (value, min, max) => Math.max(min, Math.min(max, value));
  const finite182 = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const dist182 = (left, right) => Math.hypot(finite182(left?.x) - finite182(right?.x), finite182(left?.y) - finite182(right?.y));
  const point182 = value => ({ x: finite182(value?.x), y: finite182(value?.y) });
  const copy182 = value => {
    if (typeof structuredClone === 'function') {
      try { return structuredClone(value); } catch (_) {}
    }
    try { return JSON.parse(JSON.stringify(value)); } catch (_) { return value; }
  };
  const hash182 = value => {
    let hash = 2166136261 >>> 0;
    for (const char of String(value ?? '')) {
      hash ^= char.charCodeAt(0);
      hash = Math.imul(hash, 16777619) >>> 0;
    }
    hash ^= hash >>> 16;
    return hash >>> 0;
  };
  const normalize182 = (x, y) => {
    const length = Math.hypot(x, y) || 1;
    return { x: x / length, y: y / length };
  };
  const clampPoint182 = value => ({
    x: clamp182(finite182(value?.x), 170, WORLD.width - 170),
    y: clamp182(finite182(value?.y), 170, WORLD.height - 170),
  });
  const categoryText182 = entity => `${entity?.typeId || ''} ${entity?.stats?.visualRole || entity?.visualRole || ''} ${entity?.stats?.role || entity?.role || ''} ${entity?.stats?.name || entity?.name || ''}`.toLowerCase();
  const isEngineer182 = unit => Boolean(unit?.alive && unit.kind === 'unit' && !unit.air && (
    unit.typeId === 'worker' || unit.stats?.engineering || unit.stats?.engineer || /engineer|инженер/.test(categoryText182(unit))
  ));
  const isScout182 = (ai, unit) => Boolean(unit?.alive && unit.kind === 'unit' && (
    ai.isScout?.(unit) || unit.stats?.variant === 'recon' || unit.stats?.radarRelay ||
    finite182(unit.detector ?? unit.stats?.detector) > 0 || /recon|scout|awacs|дрло|развед/.test(categoryText182(unit))
  ));
  const isArtillery182 = (ai, unit) => Boolean(unit?.alive && unit.stats?.weapon && (
    ai.isSiege?.(unit) || unit.stats.weapon.ballistic || finite182(unit.stats.weapon.range) >= 620 ||
    /artillery|howitzer|mortar|mlrs|rocket artillery|артилл|рсзо|гаубиц/.test(categoryText182(unit))
  ));
  const isAA182 = unit => Boolean(unit?.alive && (
    unit.stats?.weapon?.targets?.includes?.('air') || unit.stats?.interceptPower || unit.stats?.softKillPower ||
    /anti-air|sam|counter-uas|пво|зенит/.test(categoryText182(unit))
  ));
  const isMobile182 = unit => Boolean(unit?.alive && (unit.air || finite182(unit.stats?.speed) >= 118 || unit.stats?.variant === 'recon'));
  const isCombat182 = unit => Boolean(
    unit?.alive && unit.team === 'enemy' && unit.kind === 'unit' && !unit.embarkedIn &&
    unit.typeId !== 'worker' && unit.stats?.weapon && unit.healthRatio > .18 && !unit._v160Retreating
  );
  const isFreshContact182 = (ai, contact, unitMaxAge = 38, buildingMaxAge = 150) => {
    if (!contact || contact.signal) return false;
    const age = Math.max(0, finite182(ai.game.time) - finite182(contact.lastSeen));
    const maxAge = contact.kind === 'building' ? buildingMaxAge : unitMaxAge;
    return age <= maxAge && finite182(contact.confidence128, .25) >= .20;
  };
  const contactPoint182 = (ai, contact, purpose = 'assault') => clampPoint182(ai.contactPoint128?.(contact, purpose) || contact || ai.game.playerBase);
  const liveSquadUnits182 = (ai, squad) => (ai.squadUnits?.(squad) || [])
    .filter(unit => unit?.alive && unit.team === 'enemy');

  function config182(ai) {
    return CONFIG[ai?.game?.difficultyKey] || CONFIG.normal;
  }

  function state182(ai) {
    ai.deepOperationsState182 ||= {
      version: VERSION,
      build: BUILD,
      nextOperationId: 1,
      launchReadyAt: 0,
      nextDefenseAt: 0,
      nextReserveAt: 0,
      nextCompositionAt: 0,
      nextReconRefreshAt: 0,
      defenseBuildCounter: 0,
      lastThreatAt: -Infinity,
      metrics: {
        operationsPlanned: 0,
        operationsLaunched: 0,
        operationsCompleted: 0,
        operationsAborted: 0,
        reconMissions: 0,
        reconBlockedLaunches: 0,
        artilleryPreparations: 0,
        feintsLaunched: 0,
        breachesAttempted: 0,
        reservesCommitted: 0,
        exploitations: 0,
        logisticsTargets: 0,
        defensiveBuildings: 0,
        defensiveReserveOrders: 0,
        compositionOrders: 0,
        lastReconScore: 0,
        lastDefenseScore: 0,
        lastBreachProgress: 0,
        lastPhase: 'idle',
      },
    };
    ai.campaigns129 ||= [];
    return ai.deepOperationsState182;
  }

  function deepCampaigns182(ai, activeOnly = false) {
    const campaigns = (ai.campaigns129 || []).filter(campaign => campaign?.deepOperation182);
    if (!activeOnly) return campaigns;
    return campaigns.filter(campaign => ![PHASES.COMPLETE, PHASES.ABORT].includes(campaign.phase) || !campaign.finishedAt182);
  }

  function squadById182(ai, id) {
    return (ai.squads || []).find(squad => squad.id === id) || null;
  }

  function operationSquads182(ai, operation) {
    return (operation.squadIds || []).map(id => squadById182(ai, id)).filter(Boolean);
  }

  function elementSquads182(ai, operation, element) {
    return operationSquads182(ai, operation).filter(squad => squad.deepElement182 === element);
  }

  function allOperationUnits182(ai, operation) {
    const units = [];
    const seen = new Set();
    for (const squad of operationSquads182(ai, operation)) {
      for (const unit of liveSquadUnits182(ai, squad)) {
        if (seen.has(unit.id)) continue;
        seen.add(unit.id);
        units.push(unit);
      }
    }
    return units;
  }

  function contactStats182(contact) {
    return contact?.kind === 'building'
      ? (BUILDING_TYPES[contact.typeId] || {})
      : (UNIT_TYPES[contact?.typeId] || {});
  }

  function contactDefenseWeight182(contact) {
    const stats = contactStats182(contact);
    let weight = 0;
    if (contact.defense128 || stats.category === 'defense') weight += 4.2;
    if (contact.armed128 || stats.weapon) weight += clamp182(finite182(contact.cost128 || stats.cost, 400) / 620, .35, 3.4);
    if (stats.weapon?.targets?.includes?.('air') || stats.interceptPower) weight += .65;
    if (stats.weapon?.ballistic || finite182(stats.weapon?.range) >= 650) weight += .55;
    return weight * clamp182(finite182(contact.confidence128, .35), .1, 1);
  }

  function contactStrategicValue182(contact, purpose = 'assault') {
    const stats = contactStats182(contact);
    const category = contact.category || stats.category || 'unknown';
    let value = finite182(contact.value, 20) + finite182(contact.cost128 || stats.cost) * .025;
    if (purpose === 'power') {
      if (finite182(contact.power128 || stats.power) > 0) value += 850 + finite182(contact.power128 || stats.power) * 2.1;
      else value -= 260;
    } else if (purpose === 'supply') {
      if (contact.typeId === 'resourceTruck') value += 920 + finite182(contact.cargo128) * .12;
      if (contact.logisticsExtractor128 || stats.logisticsExtractor || stats.dropoff || stats.income) value += 650;
      if (!contact.logisticsExtractor128 && !stats.logisticsExtractor && !stats.dropoff && !stats.income && contact.typeId !== 'resourceTruck') value -= 220;
    } else if (purpose === 'production') {
      if (category === 'production') value += 820;
      else if (category === 'strategy') value += 650;
      else if (category === 'technology') value += 420;
      else value -= 180;
    } else if (purpose === 'extraction') {
      if (contact.logisticsExtractor128 || stats.placeOnResource || stats.extractor) value += 820;
      else value -= 260;
    } else if (purpose === 'weak') {
      value += contact.kind === 'building' ? 280 : 40;
      value -= contactDefenseWeight182(contact) * 70;
    } else {
      if (contact.typeId === 'hq') value += 780;
      if (category === 'production') value += 520;
      if (finite182(contact.power128 || stats.power) > 0) value += 360;
      if (contact.logisticsExtractor128 || stats.logisticsExtractor || stats.dropoff) value += 260;
    }
    return value * (.35 + clamp182(finite182(contact.confidence128, .25), .05, 1) * .65);
  }

  function operationAxis182(ai, destination = null) {
    const origin = point182(ai.base || ai.game.enemyBase || { x: WORLD.width * .8, y: WORLD.height * .5 });
    const target = point182(destination || ai.intel?.get?.('player-deployment-sector-128') || ai.game.playerBase || { x: WORLD.width * .2, y: WORLD.height * .5 });
    const direction = normalize182(target.x - origin.x, target.y - origin.y);
    return {
      origin,
      target,
      nx: direction.x,
      ny: direction.y,
      px: -direction.y,
      py: direction.x,
      length: Math.max(1, dist182(origin, target)),
    };
  }

  function projection182(axis, value) {
    const dx = finite182(value?.x) - axis.origin.x;
    const dy = finite182(value?.y) - axis.origin.y;
    return {
      forward: dx * axis.nx + dy * axis.ny,
      lateral: dx * axis.px + dy * axis.py,
    };
  }

  function adaptivePurpose182(ai) {
    const scores = ai.adaptivePurposeScores131?.();
    if (scores && typeof scores === 'object') {
      const ranked = PURPOSES
        .map(purpose => [purpose, finite182(scores[purpose])])
        .sort((left, right) => right[1] - left[1]);
      if (ranked[0]?.[1] > 0) return ranked[0][0];
    }
    const cycle = state182(ai).nextOperationId % PURPOSES.length;
    return PURPOSES[cycle];
  }

  function reconPicture182(ai, center, radius = 3600) {
    const now = finite182(ai.game.time);
    const contacts = (ai.knownTargets?.() || [])
      .filter(contact => isFreshContact182(ai, contact, 52, 190));
    const near = contacts.filter(contact => dist182(contact, center) <= radius);
    const cells = new Set();
    let confidence = 0;
    let defenses = 0;
    let critical = 0;
    let movingRoutes = 0;
    let freshestAge = Infinity;
    for (const contact of near) {
      cells.add(`${Math.floor(contact.x / 720)}:${Math.floor(contact.y / 720)}`);
      const c = clamp182(finite182(contact.confidence128, .25), .05, 1);
      confidence += c;
      defenses += contactDefenseWeight182(contact);
      critical += contactStrategicValue182(contact, 'assault') > 300 ? c : 0;
      movingRoutes += Math.min(1, finite182(contact.routeSamples128) / 2);
      freshestAge = Math.min(freshestAge, Math.max(0, now - finite182(contact.lastSeen)));
    }
    const coverage = clamp182(cells.size / 7, 0, 1);
    const confidenceScore = clamp182(confidence / 8, 0, 1);
    const defensePicture = clamp182(defenses / 12, 0, 1);
    const criticalPicture = clamp182(critical / 4, 0, 1);
    const routePicture = clamp182(movingRoutes / 3, 0, 1);
    const freshness = Number.isFinite(freshestAge) ? clamp182(1 - freshestAge / 55, 0, 1) : 0;
    const score = clamp182(
      coverage * .24 + confidenceScore * .22 + defensePicture * .18 +
      criticalPicture * .14 + routePicture * .08 + freshness * .14,
      0,
      1,
    );
    return { contacts, near, score, coverage, confidenceScore, defenses, critical, routePicture, freshness };
  }

  function frontAnalysis182(ai, purpose, destination = null) {
    const axis = operationAxis182(ai, destination);
    const contacts = (ai.knownTargets?.() || []).filter(contact => isFreshContact182(ai, contact, 55, 190));
    const defensive = contacts.filter(contact => contactDefenseWeight182(contact) > .25);
    let frontDistance = axis.length * .70;
    if (defensive.length) {
      const projections = defensive
        .map(contact => projection182(axis, contact).forward)
        .filter(value => value > axis.length * .36 && value < axis.length * 1.08)
        .sort((a, b) => a - b);
      if (projections.length) frontDistance = clamp182(projections[Math.min(projections.length - 1, Math.floor(projections.length * .22))] - 240, axis.length * .46, axis.length * .86);
    }
    const lanes = [];
    for (let lane = -3; lane <= 3; lane += 1) {
      const lateral = lane * 760;
      const center = clampPoint182({
        x: axis.origin.x + axis.nx * frontDistance + axis.px * lateral,
        y: axis.origin.y + axis.ny * frontDistance + axis.py * lateral,
      });
      let defense = 0;
      let strategic = 0;
      let recon = 0;
      let depth = 0;
      for (const contact of contacts) {
        const p = projection182(axis, contact);
        const lateralDistance = Math.abs(p.lateral - lateral);
        const frontDelta = Math.abs(p.forward - frontDistance);
        const c = clamp182(finite182(contact.confidence128, .25), .05, 1);
        if (frontDelta <= 1250 && lateralDistance <= 1250) defense += contactDefenseWeight182(contact) * (1 - frontDelta / 1800) * (1 - lateralDistance / 1800);
        if (p.forward >= frontDistance - 200 && p.forward <= frontDistance + 4200 && lateralDistance <= 1900) {
          strategic += Math.max(0, contactStrategicValue182(contact, purpose)) * (1 - lateralDistance / 2600);
          depth += c;
        }
        if (frontDelta <= 2200 && lateralDistance <= 1700) recon += c;
      }
      const flankBonus = Math.abs(lane) * 18;
      const score = strategic * .0105 + recon * 22 + flankBonus - defense * 72;
      lanes.push({ lane, center, defense, strategic, recon, depth, score, frontDistance });
    }
    lanes.sort((left, right) => right.score - left.score);
    return { axis, contacts, lanes, best: lanes[0] };
  }

  function deepTarget182(ai, purpose, breach, axis, lateralLimit = 2500) {
    const breachProjection = projection182(axis, breach);
    const contacts = (ai.knownTargets?.() || []).filter(contact => isFreshContact182(ai, contact, 52, 190));
    let best = null;
    let bestScore = -Infinity;
    for (const contact of contacts) {
      const p = projection182(axis, contact);
      if (p.forward < breachProjection.forward - 300) continue;
      const lateral = Math.abs(p.lateral - breachProjection.lateral);
      if (lateral > lateralLimit) continue;
      const depth = clamp182((p.forward - breachProjection.forward) / 4200, 0, 1);
      const score = contactStrategicValue182(contact, purpose) + depth * 180 - lateral * .025 - contactDefenseWeight182(contact) * 22;
      if (score > bestScore) {
        best = contact;
        bestScore = score;
      }
    }
    const fallback = ai.pickWarTarget126?.(purpose);
    const selected = best || (fallback && !fallback.signal ? fallback : null);
    return selected ? { ...selected, ...contactPoint182(ai, selected, purpose), strategicPurpose128: purpose } : {
      id: `deep-point-${purpose}`,
      signal: true,
      kind: 'signal',
      x: clampPoint182({ x: breach.x + axis.nx * 2500, y: breach.y + axis.ny * 2500 }).x,
      y: clampPoint182({ x: breach.x + axis.nx * 2500, y: breach.y + axis.ny * 2500 }).y,
      strategicPurpose128: purpose,
    };
  }

  function buildPlan182(ai, operation) {
    const purpose = operation.purpose || adaptivePurpose182(ai);
    const analysis = frontAnalysis182(ai, purpose, operation.suspectedPoint182);
    if (!analysis.best) return null;
    const main = analysis.best;
    const mainIndex = main.lane;
    const opposite = [...analysis.lanes]
      .sort((left, right) => {
        const leftSeparation = Math.abs(left.lane - mainIndex);
        const rightSeparation = Math.abs(right.lane - mainIndex);
        const leftDraw = left.defense * 42 + left.strategic * .005 + leftSeparation * 32;
        const rightDraw = right.defense * 42 + right.strategic * .005 + rightSeparation * 32;
        return rightDraw - leftDraw;
      });
    const feintA = opposite.find(lane => Math.abs(lane.lane - mainIndex) >= 2) || analysis.lanes[analysis.lanes.length - 1];
    const feintB = opposite.find(lane => lane !== feintA && Math.abs(lane.lane - mainIndex) >= 3) || null;
    const breach = main.center;
    const objective = deepTarget182(ai, purpose, breach, analysis.axis, 2450);
    const turningPurpose = purpose === 'supply' ? 'power' : purpose === 'power' ? 'supply' : 'supply';
    const turning = deepTarget182(ai, turningPurpose, {
      x: breach.x - analysis.axis.px * Math.sign(mainIndex || 1) * 1150,
      y: breach.y - analysis.axis.py * Math.sign(mainIndex || 1) * 1150,
    }, analysis.axis, 4200);
    const direction = normalize182(breach.x - analysis.axis.origin.x, breach.y - analysis.axis.origin.y);
    const perpendicular = { x: -direction.y, y: direction.x };
    const assembly = clampPoint182({ x: breach.x - direction.x * 1550, y: breach.y - direction.y * 1550 });
    const firePosition = clampPoint182({
      x: breach.x - direction.x * 2150 + perpendicular.x * Math.sign(mainIndex || 1) * 420,
      y: breach.y - direction.y * 2150 + perpendicular.y * Math.sign(mainIndex || 1) * 420,
    });
    const reservePoint = clampPoint182({ x: breach.x - direction.x * 2750, y: breach.y - direction.y * 2750 });
    const flankPoint = clampPoint182({
      x: breach.x - direction.x * 950 - perpendicular.x * Math.sign(mainIndex || 1) * 2200,
      y: breach.y - direction.y * 950 - perpendicular.y * Math.sign(mainIndex || 1) * 2200,
    });
    return {
      purpose,
      axis: analysis.axis,
      lane: mainIndex,
      breach,
      objective,
      turning,
      assembly,
      firePosition,
      reservePoint,
      flankPoint,
      feintPoints: [feintA?.center, feintB?.center].filter(Boolean),
      initialResistance: resistance182(ai, breach, 1550),
      mainDefense: main.defense,
      analysis: analysis.lanes.map(lane => ({ lane: lane.lane, defense: lane.defense, strategic: lane.strategic, recon: lane.recon, score: lane.score })),
    };
  }

  function resistance182(ai, center, radius = 1500) {
    let total = 0;
    for (const contact of ai.knownTargets?.() || []) {
      if (!isFreshContact182(ai, contact, 58, 210) || dist182(contact, center) > radius) continue;
      const actual = ai.game.getEntity?.(contact.id);
      if (actual && !actual.alive) continue;
      const health = actual?.alive ? clamp182(finite182(actual.hp, 1) / Math.max(1, finite182(actual.maxHp, 1)), 0, 1) : 1;
      total += contactDefenseWeight182(contact) * health;
    }
    return total;
  }

  function baseThreat182(ai) {
    const base = point182(ai.base || ai.game.enemyBase);
    let best = null;
    let score = 0;
    for (const contact of ai.knownTargets?.() || []) {
      if (!isFreshContact182(ai, contact, 28, 90)) continue;
      const stats = contactStats182(contact);
      if (!contact.armed128 && !stats.weapon) continue;
      const distance = dist182(contact, base);
      if (distance > 4200) continue;
      const candidate = (1 - distance / 4200) * (1 + clamp182(finite182(contact.cost128 || stats.cost, 350) / 900, .2, 2.5));
      if (candidate > score) {
        score = candidate;
        best = contact;
      }
    }
    if (!best) return { active: false, score: 0, point: point182(ai.game.playerBase), contacts: [] };
    const contacts = (ai.knownTargets?.() || []).filter(contact => isFreshContact182(ai, contact, 30, 100) && dist182(contact, base) <= 4400);
    return { active: score > .18, score, point: point182(best), contacts };
  }

  function defenseReadiness182(ai) {
    const base = point182(ai.base || ai.game.enemyBase);
    const buildings = ai.game.buildings.filter(building => building.alive && building.team === 'enemy');
    const defenses = buildings.filter(building => building.stats?.category === 'defense' && dist182(building, base) <= 1900);
    const outer = defenses.filter(building => {
      const d = dist182(building, base);
      return d >= 620 && d <= 1650;
    }).length;
    const inner = defenses.filter(building => dist182(building, base) < 900).length;
    const sensors = buildings.filter(building => (building.completed || (building.buildProgress ?? building.construction ?? 0) > 0) && (
      building.stats?.radarRelay || finite182(building.detector ?? building.stats?.detector) >= 420 || SENSOR_TYPES.includes(building.typeId)
    )).length;
    const team = ai.game.teams?.enemy || {};
    const produced = finite182(team.powerProduced);
    const used = finite182(team.powerUsed);
    const margin = produced > 0 ? clamp182((produced - used) / Math.max(60, produced), -1, 1) : -1;
    const combat = ai.game.units.filter(isCombat182);
    const reserved = combat.filter(unit => unit._deepDefensiveReserve182 || unit._deepDefenseEngaged182).length;
    const cfg = config182(ai);
    const desiredReserve = Math.max(3, Math.floor(combat.length * cfg.reserveRatio));
    const score = clamp182(
      clamp182(outer / 5, 0, 1) * .30 +
      clamp182(inner / 3, 0, 1) * .14 +
      clamp182(sensors / 2, 0, 1) * .16 +
      clamp182((margin + .05) / .28, 0, 1) * .18 +
      clamp182(reserved / Math.max(1, desiredReserve), 0, 1) * .22,
      0,
      1,
    );
    return { score, outer, inner, sensors, margin, reserved, desiredReserve, defenses, buildings };
  }

  function buildingStats182(ai, typeId) {
    try {
      if (typeof getBuildingStats === 'function') return getBuildingStats(typeId, ai.game.teams.enemy);
    } catch (_) {}
    return BUILDING_TYPES[typeId] || null;
  }

  function canConstruct182(ai, typeId, reserveCredits = 1300) {
    const stats = buildingStats182(ai, typeId);
    const team = ai.game.teams?.enemy;
    if (!stats || !team) return false;
    const cost = finite182(stats.cost, Infinity);
    if (!Number.isFinite(cost) || team.credits < cost + reserveCredits) return false;
    if (typeof ai.game.requirementsMet === 'function' && !ai.game.requirementsMet('enemy', stats.requires || [], stats.rank || 1)) return false;
    return true;
  }

  function chooseDefenseType182(ai, readiness) {
    const profile = ai.ensureAdaptiveDoctrine131?.()?.profile || {};
    const team = ai.game.teams?.enemy || {};
    const produced = finite182(team.powerProduced);
    const used = finite182(team.powerUsed);
    if (produced <= 0 || produced - used < Math.max(50, used * .18)) {
      const power = POWER_TYPES.find(typeId => canConstruct182(ai, typeId, 800));
      if (power) return { typeId: power, ring: 'utility' };
    }
    if (readiness.sensors < 1) {
      const sensor = SENSOR_TYPES.find(typeId => canConstruct182(ai, typeId, 1000));
      if (sensor) return { typeId: sensor, ring: 'sensor' };
    }
    if (finite182(profile.air) > .22) {
      const aa = ['aaTurret', 'missileBattery', 'counterUASTower', 'abmBattery']
        .find(typeId => canConstruct182(ai, typeId, 1400));
      if (aa && readiness.defenses.filter(building => isAA182(building)).length < Math.max(2, Math.ceil(readiness.outer * .45))) return { typeId: aa, ring: 'fallback' };
    }
    if (readiness.outer < 5) {
      const outer = ['bunker', 'cannonTurret', 'turret', 'mineControl', 'flameTower']
        .find(typeId => canConstruct182(ai, typeId, 1200));
      if (outer) return { typeId: outer, ring: 'outer' };
    }
    if (readiness.inner < 3) {
      const fallback = ['missileBattery', 'aaTurret', 'bunker', 'cannonTurret']
        .find(typeId => canConstruct182(ai, typeId, 1600));
      if (fallback) return { typeId: fallback, ring: 'inner' };
    }
    if (readiness.outer < 8) {
      const extra = DEFENSE_TYPES.find(typeId => canConstruct182(ai, typeId, 1800));
      if (extra) return { typeId: extra, ring: 'outer' };
    }
    return null;
  }

  function defenseAnchor182(ai, typeId, ring, counter) {
    const base = point182(ai.base || ai.game.enemyBase);
    const threat = baseThreat182(ai);
    const direction = normalize182(threat.point.x - base.x, threat.point.y - base.y);
    const baseAngle = Math.atan2(direction.y, direction.x);
    const slots = ring === 'outer' ? 7 : ring === 'inner' ? 5 : ring === 'sensor' ? 4 : 6;
    const slot = counter % slots;
    const alternating = Math.ceil(slot / 2) * (slot % 2 ? 1 : -1);
    const angle = baseAngle + alternating * (ring === 'outer' ? .34 : .48);
    const radius = ring === 'outer' ? 1150 : ring === 'inner' ? 650 : ring === 'sensor' ? 420 : 360;
    const jitter = ((hash182(`${typeId}:${counter}`) % 181) - 90);
    return clampPoint182({
      x: base.x + Math.cos(angle) * (radius + jitter),
      y: base.y + Math.sin(angle) * (radius + jitter),
    });
  }

  function constructDefense182(ai) {
    if (!BuildingClass) return false;
    const state = state182(ai);
    const readiness = defenseReadiness182(ai);
    state.metrics.lastDefenseScore = readiness.score;
    const choice = chooseDefenseType182(ai, readiness);
    if (!choice) return false;
    const stats = buildingStats182(ai, choice.typeId);
    const team = ai.game.teams.enemy;
    const anchor = defenseAnchor182(ai, choice.typeId, choice.ring, state.defenseBuildCounter++);
    let spot = null;
    try { spot = ai.game.findAiBuildSpot?.(choice.typeId, anchor, state.defenseBuildCounter + (ai.wave || 0) * 11); } catch (_) {}
    spot ||= anchor;
    if (!Number.isFinite(spot.x) || !Number.isFinite(spot.y)) return false;
    if (typeof ai.game.canPlaceBuilding === 'function') {
      try {
        const placement = ai.game.canPlaceBuilding(choice.typeId, spot.x, spot.y, 0, 'enemy');
        if (placement === false || placement?.valid === false) return false;
      } catch (_) {}
    }
    const cost = finite182(stats.cost);
    if (team.credits < cost) return false;
    team.credits -= cost;
    const building = new BuildingClass(ai.game, {
      typeId: choice.typeId,
      team: 'enemy',
      x: spot.x,
      y: spot.y,
      rotation: Math.atan2((ai.game.playerBase?.y || 0) - spot.y, (ai.game.playerBase?.x || 0) - spot.x),
      construction: .03,
      autoConstruct: true,
    });
    building.deepDefense182 = true;
    building.deepDefenseRing182 = choice.ring;
    const added184 = ai.game.addEntity(building);
    if (added184 === false) return false;
    ai.game.recalculatePower?.();
    if (stats.category === 'defense') ai.defenseCount = (ai.defenseCount || 0) + 1;
    state.metrics.defensiveBuildings += 1;
    return true;
  }

  function currentSquadMembership182(ai) {
    const ids = new Set();
    for (const squad of ai.squads || []) for (const id of squad.unitIds || []) ids.add(id);
    return ids;
  }

  function visibleBaseThreats182(ai) {
    const base = point182(ai.base || ai.game.enemyBase);
    const threats = [];
    for (const unit of ai.game.units || []) {
      if (!unit?.alive || unit.team !== 'player' || !unit.stats?.weapon || dist182(unit, base) > 3100) continue;
      let observed = false;
      try { observed = Boolean(ai.canObserveEntity128?.(unit, true)); } catch (_) {}
      if (!observed && dist182(unit, base) > 1300) continue;
      threats.push(unit);
    }
    return threats;
  }

  function reservePosition182(ai, index, count) {
    const base = point182(ai.base || ai.game.enemyBase);
    const threat = baseThreat182(ai);
    const direction = normalize182(threat.point.x - base.x, threat.point.y - base.y);
    const angle = Math.atan2(direction.y, direction.x) + Math.PI + (index - (count - 1) / 2) * .16;
    const rank = index % 3;
    const radius = 360 + rank * 120;
    return clampPoint182({ x: base.x + Math.cos(angle) * radius, y: base.y + Math.sin(angle) * radius });
  }

  function updateDefensiveReserve182(ai, force = false) {
    const state = state182(ai);
    const now = finite182(ai.game.time);
    if (!force && now < state.nextReserveAt) return;
    state.nextReserveAt = now + 2.4;
    const combat = (ai.game.units || []).filter(isCombat182);
    const cfg = config182(ai);
    const desired = clamp182(Math.floor(combat.length * cfg.reserveRatio), 3, combat.length >= 5000 ? 520 : combat.length >= 1000 ? 180 : 48);
    const membership = currentSquadMembership182(ai);
    let reserved = combat.filter(unit => unit._deepDefensiveReserve182 || unit._deepDefenseEngaged182);
    const threats = visibleBaseThreats182(ai);
    if (threats.length) {
      state.lastThreatAt = now;
      const centroid = threats.reduce((sum, unit) => ({ x: sum.x + unit.x, y: sum.y + unit.y }), { x: 0, y: 0 });
      centroid.x /= threats.length;
      centroid.y /= threats.length;
      for (const unit of reserved) {
        unit._deepDefenseEngaged182 = true;
        unit._deepDefensiveReserve182 = false;
        if (now < finite182(unit._deepDefenseOrderAt182)) continue;
        unit._deepDefenseOrderAt182 = now + 2.0 + (hash182(unit.id) % 9) * .08;
        const target = threats
          .filter(enemy => unit.canAttack?.(enemy))
          .sort((left, right) => dist182(unit, left) - dist182(unit, right))[0];
        if (target) unit.setCommand({ type: 'attack', targetId: target.id });
        else unit.setCommand({ type: 'attackMove', x: centroid.x, y: centroid.y });
      }
      state.metrics.defensiveReserveOrders += reserved.length;
      return;
    }

    if (now - state.lastThreatAt > 12) {
      for (const unit of reserved) {
        unit._deepDefenseEngaged182 = false;
        unit._deepDefensiveReserve182 = true;
      }
    }
    reserved = combat.filter(unit => unit._deepDefensiveReserve182 && !membership.has(unit.id));
    if (reserved.length < desired) {
      const candidates = combat
        .filter(unit => !membership.has(unit.id) && !unit._deepDefensiveReserve182 && !unit._deepDefenseEngaged182 && !isArtillery182(ai, unit))
        .sort((left, right) => {
          const leftScore = left.healthRatio * 100 + finite182(left.stats?.speed) * .22 + (isAA182(left) ? 20 : 0);
          const rightScore = right.healthRatio * 100 + finite182(right.stats?.speed) * .22 + (isAA182(right) ? 20 : 0);
          return rightScore - leftScore;
        });
      for (const unit of candidates.slice(0, desired - reserved.length)) {
        unit._deepDefensiveReserve182 = true;
        unit._deepDefenseEngaged182 = false;
        reserved.push(unit);
      }
    }
    if (reserved.length > desired) {
      for (const unit of reserved.slice(desired)) unit._deepDefensiveReserve182 = false;
      reserved = reserved.slice(0, desired);
    }
    reserved.forEach((unit, index) => {
      if (now < finite182(unit._deepReserveOrderAt182)) return;
      const position = reservePosition182(ai, index, reserved.length);
      if (dist182(unit, position) > 150) {
        unit.setCommand({ type: 'move', x: position.x, y: position.y });
        unit.setCommand({ type: 'hold' }, true);
      } else if (!unit.currentCommand || unit.currentCommand.type !== 'hold') unit.setCommand({ type: 'hold' });
      unit._deepReserveOrderAt182 = now + 5.2 + (hash182(unit.id) % 17) * .09;
    });
  }

  function unitStats182(ai, typeId) {
    try {
      if (typeof getUnitStats === 'function') return getUnitStats(typeId, ai.game.teams.enemy);
    } catch (_) {}
    return UNIT_TYPES[typeId] || null;
  }

  function queuedTypeCount182(game, typeId) {
    let count = 0;
    for (const building of game.buildings || []) {
      if (!building?.alive || building.team !== 'enemy') continue;
      for (const item of building.queue || []) if ((item.typeId || item.itemId) === typeId) count += 1;
    }
    return count;
  }

  function roleForStats182(ai, typeId, stats) {
    const fake = { typeId, stats, alive: true, kind: 'unit', team: 'enemy', detector: stats?.detector, air: stats?.air };
    if (isEngineer182(fake)) return 'engineer';
    if (isScout182(ai, fake)) return 'recon';
    if (isArtillery182(ai, fake)) return 'artillery';
    if (isAA182(fake)) return 'aa';
    if (stats?.weapon) return 'assault';
    return 'other';
  }

  function requestCompositionUnit182(ai) {
    const game = ai.game;
    const team = game.teams?.enemy;
    if (!team) return false;
    const units = (game.units || []).filter(unit => unit.alive && unit.team === 'enemy' && !unit.embarkedIn);
    const combat = units.filter(unit => unit.stats?.weapon && unit.typeId !== 'worker');
    const counts = { recon: 0, artillery: 0, aa: 0, engineer: 0, assault: 0 };
    for (const unit of units) {
      if (isEngineer182(unit)) counts.engineer += 1;
      else if (isScout182(ai, unit)) counts.recon += 1;
      else if (isArtillery182(ai, unit)) counts.artillery += 1;
      else if (isAA182(unit)) counts.aa += 1;
      else if (unit.stats?.weapon) counts.assault += 1;
    }
    const total = Math.max(1, combat.length);
    const needs = [
      ['recon', Math.max(2, Math.ceil(total * .045)) - counts.recon],
      ['engineer', Math.max(2, Math.ceil(total * .018)) - counts.engineer],
      ['artillery', Math.max(2, Math.ceil(total * .105)) - counts.artillery],
      ['aa', Math.max(2, Math.ceil(total * .09)) - counts.aa],
      ['assault', Math.max(8, Math.ceil(total * .55)) - counts.assault],
    ].filter(([, need]) => need > 0).sort((left, right) => right[1] - left[1]);
    if (!needs.length) return false;
    const desiredRole = needs[0][0];
    const producers = (game.buildings || [])
      .filter(building => building.alive && building.completed && building.team === 'enemy' && (building.queue?.length || 0) < 2 && building.stats?.produces?.length)
      .sort((left, right) => (left.queue?.length || 0) - (right.queue?.length || 0));
    for (const producer of producers) {
      for (const typeId of producer.stats.produces || []) {
        const stats = unitStats182(ai, typeId);
        if (!stats || roleForStats182(ai, typeId, stats) !== desiredRole) continue;
        if (queuedTypeCount182(game, typeId) > 1) continue;
        if (typeof game.canProduceUnit === 'function' && !game.canProduceUnit('enemy', typeId)) continue;
        if (team.credits < finite182(stats.cost) + 900) continue;
        try {
          const queued = game.queueProduction?.(producer, typeId, 'unit', true);
          if (queued !== false) {
            state182(ai).metrics.compositionOrders += 1;
            return true;
          }
        } catch (_) {}
      }
    }
    return false;
  }

  function selectedPurposeTarget182(ai, operation) {
    const target = ai.pickWarTarget126?.(operation.purpose || 'assault');
    if (target && !target.signal && isFreshContact182(ai, target, 52, 190)) return target;
    const contacts = (ai.knownTargets?.() || []).filter(contact => isFreshContact182(ai, contact, 52, 190));
    return contacts.sort((left, right) => contactStrategicValue182(right, operation.purpose) - contactStrategicValue182(left, operation.purpose))[0] || null;
  }

  function reconnaissancePoints182(ai, operation) {
    const axis = operationAxis182(ai, operation.suspectedPoint182);
    const center = point182(operation.suspectedPoint182 || axis.target);
    return [
      clampPoint182({ x: center.x - axis.nx * 1850 + axis.px * 1250, y: center.y - axis.ny * 1850 + axis.py * 1250 }),
      clampPoint182({ x: center.x - axis.nx * 1450 - axis.px * 1250, y: center.y - axis.ny * 1450 - axis.py * 1250 }),
      clampPoint182({ x: center.x - axis.nx * 650, y: center.y - axis.ny * 650 }),
    ];
  }

  function createDeepSquad182(ai, operation, element, role, units, target, stage, lane = 0) {
    if (!units?.length) return null;
    const squad = ai.createSquad?.(role, units, {
      targetId: target?.id || null,
      targetX: finite182(target?.x, stage?.x),
      targetY: finite182(target?.y, stage?.y),
      path: [],
      state: 'staging',
      flank: lane,
      mission: target?.strategicPurpose128 || operation.purpose,
      expiresAt: finite182(ai.game.time) + 780,
    });
    if (!squad) return null;
    squad.deepOperation182 = operation.id;
    squad.deepElement182 = element;
    squad.initialCount182 = units.length;
    squad.stageX182 = stage.x;
    squad.stageY182 = stage.y;
    squad.deepTargetId182 = target?.id || null;
    squad.deepTargetX182 = finite182(target?.x, stage.x);
    squad.deepTargetY182 = finite182(target?.y, stage.y);
    squad.deepOrderAt182 = -Infinity;
    for (const unit of units) unit.deepOperation182 = operation.id;
    operation.squadIds.push(squad.id);
    operation.elements.push({ squadId: squad.id, element, lane, initialCount: units.length });
    issueStage182(ai, squad, units, stage);
    return squad;
  }

  function issueStage182(ai, squad, units, stage) {
    const now = finite182(ai.game.time);
    units.forEach((unit, index) => {
      const offset = ai.game.formationOffset?.(index, units.length, Math.max(52, finite182(unit.radius, 14) * 2.2)) || { x: 0, y: 0 };
      unit.setCommand({ type: 'move', x: stage.x + offset.x, y: stage.y + offset.y });
      unit.setCommand({ type: 'hold' }, true);
    });
    squad.state = 'staging';
    squad.lastOrderAt = now;
    squad.deepOrderAt182 = now;
  }

  function createReconSquads182(ai, operation) {
    const cfg = config182(ai);
    const membership = currentSquadMembership182(ai);
    const available = (ai.game.units || [])
      .filter(unit => unit.alive && unit.team === 'enemy' && !unit.embarkedIn && !membership.has(unit.id) && !unit._deepDefensiveReserve182 && !unit._deepDefenseEngaged182);
    let candidates = available.filter(unit => isScout182(ai, unit));
    if (!candidates.length) candidates = available
      .filter(unit => unit.stats?.weapon && isMobile182(unit))
      .sort((left, right) => finite182(right.vision) + finite182(right.stats?.speed) * .8 - finite182(left.vision) - finite182(left.stats?.speed) * .8);
    const desiredSquads = ai.game.difficultyKey === 'hard' ? 2 : 1;
    const perSquad = ai.game.difficultyKey === 'hard' ? 2 : 1;
    const points = reconnaissancePoints182(ai, operation);
    let created = 0;
    for (let index = 0; index < desiredSquads; index += 1) {
      const units = candidates.splice(0, perSquad);
      if (!units.length) break;
      const target = points[index % points.length];
      const squad = ai.createSquad?.('scout', units, {
        targetX: target.x,
        targetY: target.y,
        path: [points[index % points.length], points[(index + 1) % points.length], points[2]],
        state: 'scouting',
        flank: index ? -1 : 1,
        mission: 'targeted-recon',
        expiresAt: finite182(ai.game.time) + cfg.reconTimeout + 45,
      });
      if (!squad) continue;
      squad.deepOperation182 = operation.id;
      squad.deepElement182 = 'recon';
      squad.initialCount182 = units.length;
      squad.reconIndex182 = index;
      for (const unit of units) unit.deepOperation182 = operation.id;
      operation.squadIds.push(squad.id);
      operation.elements.push({ squadId: squad.id, element: 'recon', lane: index ? -2 : 2, initialCount: units.length });
      ai.issueScoutOrders?.(squad);
      created += 1;
    }
    state182(ai).metrics.reconMissions += created;
    return created;
  }

  function scoreUnit182(ai, unit, role) {
    const speed = finite182(unit.stats?.speed);
    const range = finite182(unit.stats?.weapon?.range);
    const cost = finite182(unit.stats?.cost, 300);
    const hp = finite182(unit.maxHp || unit.stats?.hp, 100);
    const health = finite182(unit.healthRatio, 1);
    if (role === 'artillery') return range * .34 + cost * .05 + health * 80;
    if (role === 'flank') return speed * .7 + range * .1 + (unit.stats?.stealth ? 100 : 0) + (unit.air ? 75 : 0) + health * 70;
    if (role === 'reserve') return speed * .35 + hp * .06 + cost * .06 + health * 90 + (isAA182(unit) ? 15 : 0);
    if (role === 'feint') return speed * .45 + hp * .05 + health * 70;
    return hp * .08 + cost * .07 + range * .12 + health * 100 + (unit.vehicle ? 25 : 0);
  }

  function takeUnits182(pool, count, score) {
    if (count <= 0 || !pool.length) return [];
    const selected = [...pool].sort((left, right) => score(right) - score(left)).slice(0, Math.min(count, pool.length));
    const ids = new Set(selected.map(unit => unit.id));
    for (let index = pool.length - 1; index >= 0; index -= 1) if (ids.has(pool[index].id)) pool.splice(index, 1);
    return selected;
  }

  function assembleOperation182(ai, operation) {
    const cfg = config182(ai);
    const plan = buildPlan182(ai, operation);
    if (!plan) return false;
    operation.plan182 = copy182(plan);
    operation.primaryX = plan.breach.x;
    operation.primaryY = plan.breach.y;
    operation.primaryTargetId = plan.objective.id;
    operation.initialResistance182 = plan.initialResistance;

    updateDefensiveReserve182(ai, true);
    const available = ai.availableCombatUnits?.(unit => isCombat182(unit) && !unit._deepDefensiveReserve182 && !unit._deepDefenseEngaged182) || [];
    const reserveNeeded = Math.max(0, defenseReadiness182(ai).desiredReserve - (ai.game.units || []).filter(unit => unit._deepDefensiveReserve182 || unit._deepDefenseEngaged182).length);
    const usable = Math.max(0, available.length - reserveNeeded);
    const requested = Math.max(cfg.minForce, finite182(operation.requestedSize182, cfg.minForce));
    const packageCap = available.length >= 5000 ? 1300 : available.length >= 1000 ? 480 : available.length >= 500 ? 260 : cfg.packageCap;
    const packageSize = Math.min(usable, packageCap, Math.max(cfg.minForce, requested));
    if (packageSize < cfg.minForce) return false;
    const pool = available.slice(0, packageSize);

    const artilleryPool = pool.filter(unit => isArtillery182(ai, unit));
    if (packageSize >= 12 && !artilleryPool.length) return false;
    const artilleryWanted = clamp182(Math.floor(packageSize * .14), artilleryPool.length ? 1 : 0, Math.ceil(packageSize * .22));
    const artillery = [...artilleryPool]
      .sort((left, right) => scoreUnit182(ai, right, 'artillery') - scoreUnit182(ai, left, 'artillery'))
      .slice(0, Math.min(artilleryWanted, artilleryPool.length));
    const artilleryIds = new Set(artillery.map(unit => unit.id));
    for (let index = pool.length - 1; index >= 0; index -= 1) {
      if (artilleryIds.has(pool[index].id)) pool.splice(index, 1);
    }

    const reserveCount = packageSize >= 16 ? Math.max(3, Math.floor(packageSize * .22)) : Math.max(1, Math.floor(packageSize * .16));
    const flankCount = packageSize >= 14 ? Math.max(2, Math.floor(packageSize * .14)) : 0;
    const feintTotal = packageSize >= 18 ? Math.max(4, Math.floor(packageSize * .16)) : packageSize >= 10 ? 2 : 0;
    const reserve = takeUnits182(pool, reserveCount, unit => scoreUnit182(ai, unit, 'reserve'));
    const flank = takeUnits182(pool, flankCount, unit => scoreUnit182(ai, unit, 'flank'));
    const feintA = takeUnits182(pool, Math.ceil(feintTotal / 2), unit => scoreUnit182(ai, unit, 'feint'));
    const feintB = takeUnits182(pool, Math.floor(feintTotal / 2), unit => scoreUnit182(ai, unit, 'feint'));
    const breach = takeUnits182(pool, pool.length, unit => scoreUnit182(ai, unit, 'breach'));

    const direction = normalize182(plan.breach.x - plan.axis.origin.x, plan.breach.y - plan.axis.origin.y);
    const perpendicular = { x: -direction.y, y: direction.x };
    const offsetPoint = (base, lateral, rear = 0) => clampPoint182({
      x: base.x + perpendicular.x * lateral - direction.x * rear,
      y: base.y + perpendicular.y * lateral - direction.y * rear,
    });

    createDeepSquad182(ai, operation, 'fire-support', 'assault', artillery, plan.breach, plan.firePosition, plan.lane);
    createDeepSquad182(ai, operation, 'breach', 'assault', breach, plan.objective, plan.assembly, plan.lane);
    createDeepSquad182(ai, operation, 'reserve', 'assault', reserve, plan.objective, plan.reservePoint, 0);
    createDeepSquad182(ai, operation, 'turning', 'harass', flank, plan.turning, plan.flankPoint, -Math.sign(plan.lane || 1) * 3);
    if (plan.feintPoints[0]) createDeepSquad182(ai, operation, 'feint-left', 'feint', feintA, plan.feintPoints[0], offsetPoint(plan.feintPoints[0], 0, 1500), 3);
    if (plan.feintPoints[1]) createDeepSquad182(ai, operation, 'feint-right', 'feint', feintB, plan.feintPoints[1], offsetPoint(plan.feintPoints[1], 0, 1500), -3);

    operation.phase = PHASES.ASSEMBLY;
    operation.phaseStartedAt182 = finite182(ai.game.time);
    operation.assembledAt182 = finite182(ai.game.time);
    operation.lastProgressAt182 = finite182(ai.game.time);
    operation.lastProgressValue182 = 0;
    state182(ai).metrics.operationsLaunched += 1;
    return true;
  }

  function squadReadiness182(ai, squad) {
    const units = liveSquadUnits182(ai, squad);
    if (!units.length) return 0;
    const near = units.filter(unit => dist182(unit, { x: squad.stageX182, y: squad.stageY182 }) <= 360).length;
    return near / units.length;
  }

  function operationReadiness182(ai, operation) {
    const combatSquads = operationSquads182(ai, operation).filter(squad => squad.deepElement182 !== 'recon');
    if (!combatSquads.length) return 0;
    return combatSquads.reduce((sum, squad) => sum + squadReadiness182(ai, squad), 0) / combatSquads.length;
  }

  function knownTargetsNear182(ai, center, radius, predicate = null) {
    return (ai.knownTargets?.() || [])
      .filter(contact => isFreshContact182(ai, contact, 50, 190) && dist182(contact, center) <= radius && (!predicate || predicate(contact)))
      .sort((left, right) => contactDefenseWeight182(right) - contactDefenseWeight182(left));
  }

  function issueFeint182(ai, squad) {
    const units = liveSquadUnits182(ai, squad);
    if (!units.length) return;
    const target = { x: squad.deepTargetX182, y: squad.deepTargetY182 };
    units.forEach((unit, index) => {
      const offset = ai.game.formationOffset?.(index, units.length, 54) || { x: 0, y: 0 };
      unit.setCommand({ type: 'attackMove', x: target.x + offset.x, y: target.y + offset.y });
    });
    squad.state = 'demonstration';
    squad.lastOrderAt = finite182(ai.game.time);
  }

  function issueArtilleryPreparation182(ai, operation, squad) {
    const units = liveSquadUnits182(ai, squad);
    if (!units.length) return;
    const targets = knownTargetsNear182(ai, operation.plan182.breach, 1900, contact => contactDefenseWeight182(contact) > .3);
    units.forEach((unit, index) => {
      const contact = targets[index % Math.max(1, targets.length)];
      const actual = contact ? ai.game.getEntity?.(contact.id) : null;
      if (actual?.alive && unit.canAttack?.(actual)) unit.setCommand({ type: 'attack', targetId: actual.id });
      else {
        const offset = ai.game.formationOffset?.(index, units.length, Math.max(55, finite182(unit.radius, 14) * 2.2)) || { x: 0, y: 0 };
        unit.setCommand({ type: 'attackMove', x: operation.plan182.firePosition.x + offset.x, y: operation.plan182.firePosition.y + offset.y });
        unit.setCommand({ type: 'hold' }, true);
      }
    });
    squad.state = 'fire-preparation';
    squad.lastOrderAt = finite182(ai.game.time);
  }

  function issueBreach182(ai, operation, squad) {
    const units = liveSquadUnits182(ai, squad);
    if (!units.length) return;
    const breach = operation.plan182.breach;
    const objective = operation.plan182.objective;
    units.forEach((unit, index) => {
      const offset = ai.game.formationOffset?.(index, units.length, Math.max(48, finite182(unit.radius, 14) * 2.0)) || { x: 0, y: 0 };
      unit.setCommand({ type: 'attackMove', x: breach.x + offset.x * .55, y: breach.y + offset.y * .55 });
      unit.setCommand({ type: 'attackMove', x: objective.x + offset.x, y: objective.y + offset.y }, true);
    });
    squad.state = 'breaching';
    squad.lastOrderAt = finite182(ai.game.time);
  }

  function issueTurning182(ai, operation, squad) {
    const units = liveSquadUnits182(ai, squad);
    if (!units.length) return;
    const target = operation.plan182.turning;
    const path = ai.buildOperationalPath129?.(target, squad.flank || 3, 'turning', { x: squad.stageX182, y: squad.stageY182 }) || [target];
    units.forEach((unit, index) => {
      const offset = ai.game.formationOffset?.(index, units.length, 58) || { x: 0, y: 0 };
      path.forEach((waypoint, pathIndex) => unit.setCommand({ type: 'attackMove', x: waypoint.x + offset.x, y: waypoint.y + offset.y }, pathIndex > 0));
    });
    squad.state = 'turning-movement';
    squad.lastOrderAt = finite182(ai.game.time);
  }

  function issueReserveCommit182(ai, operation, squad) {
    const units = liveSquadUnits182(ai, squad);
    if (!units.length) return;
    const breach = operation.plan182.breach;
    const objective = operation.plan182.objective;
    units.forEach((unit, index) => {
      const offset = ai.game.formationOffset?.(index, units.length, Math.max(52, finite182(unit.radius, 14) * 2.1)) || { x: 0, y: 0 };
      unit.setCommand({ type: 'attackMove', x: breach.x + offset.x * .35, y: breach.y + offset.y * .35 });
      unit.setCommand({ type: 'attackMove', x: objective.x + offset.x, y: objective.y + offset.y }, true);
    });
    squad.state = 'committed';
    squad.lastOrderAt = finite182(ai.game.time);
  }

  function issueExploitation182(ai, operation, squad, purpose = null) {
    const units = liveSquadUnits182(ai, squad);
    if (!units.length) return;
    const mission = purpose || (squad.deepElement182 === 'turning' ? 'supply' : operation.purpose);
    let target = ai.pickWarTarget126?.(mission);
    if (!target || target.signal || !isFreshContact182(ai, target, 58, 210)) target = operation.plan182.objective;
    const point = contactPoint182(ai, target, mission);
    squad.deepTargetId182 = target.id || null;
    squad.deepTargetX182 = point.x;
    squad.deepTargetY182 = point.y;
    squad.mission = mission;
    units.forEach((unit, index) => {
      const offset = ai.game.formationOffset?.(index, units.length, 58) || { x: 0, y: 0 };
      unit.setCommand({ type: 'attackMove', x: point.x + offset.x, y: point.y + offset.y });
      const actual = target.id ? ai.game.getEntity?.(target.id) : null;
      if (actual?.alive && unit.canAttack?.(actual)) unit.setCommand({ type: 'attack', targetId: actual.id }, true);
    });
    squad.state = 'exploiting';
    squad.lastOrderAt = finite182(ai.game.time);
    if (['supply', 'power', 'production', 'extraction'].includes(mission)) state182(ai).metrics.logisticsTargets += 1;
  }

  function issueConsolidation182(ai, operation, squad) {
    const units = liveSquadUnits182(ai, squad);
    if (!units.length) return;
    const point = operation.plan182.objective;
    units.forEach((unit, index) => {
      const offset = ai.game.formationOffset?.(index, units.length, Math.max(60, finite182(unit.radius, 14) * 2.4)) || { x: 0, y: 0 };
      unit.setCommand({ type: 'move', x: point.x + offset.x, y: point.y + offset.y });
      unit.setCommand({ type: 'hold' }, true);
    });
    squad.state = 'consolidating';
    squad.lastOrderAt = finite182(ai.game.time);
  }

  function issueWithdrawal182(ai, operation, squad) {
    const units = liveSquadUnits182(ai, squad);
    const base = point182(ai.base || ai.game.enemyBase);
    units.forEach((unit, index) => {
      const offset = ai.game.formationOffset?.(index, units.length, 70) || { x: 0, y: 0 };
      unit.setCommand({ type: 'move', x: base.x + offset.x, y: base.y + offset.y });
    });
    squad.state = 'withdrawing';
    squad.lastOrderAt = finite182(ai.game.time);
  }

  function operationCasualtyRatio182(ai, operation, elements = null) {
    const squads = operationSquads182(ai, operation).filter(squad => !elements || elements.includes(squad.deepElement182));
    let initial = 0;
    let alive = 0;
    for (const squad of squads) {
      initial += Math.max(0, finite182(squad.initialCount182));
      alive += liveSquadUnits182(ai, squad).length;
    }
    return initial ? clamp182(1 - alive / initial, 0, 1) : 1;
  }

  function breachProgress182(ai, operation) {
    const squads = elementSquads182(ai, operation, 'breach');
    const units = squads.flatMap(squad => liveSquadUnits182(ai, squad));
    if (!units.length) return 0;
    const centroid = ai.squadCentroid?.(units) || units.reduce((sum, unit) => ({ x: sum.x + unit.x / units.length, y: sum.y + unit.y / units.length }), { x: 0, y: 0 });
    const start = operation.plan182.assembly;
    const end = operation.plan182.objective;
    const direction = normalize182(end.x - start.x, end.y - start.y);
    const total = Math.max(1, (end.x - start.x) * direction.x + (end.y - start.y) * direction.y);
    const current = (centroid.x - start.x) * direction.x + (centroid.y - start.y) * direction.y;
    return clamp182(current / total, 0, 1.25);
  }

  function transition182(ai, operation, next, reason = '') {
    operation.phase = next;
    operation.phaseStartedAt182 = finite182(ai.game.time);
    operation.phaseReason182 = reason;
    const metrics = state182(ai).metrics;
    metrics.lastPhase = next;
    if (next === PHASES.SHAPING) metrics.artilleryPreparations += 1;
    if (next === PHASES.BREACH) metrics.breachesAttempted += 1;
    if (next === PHASES.COMMIT) metrics.reservesCommitted += 1;
    if (next === PHASES.EXPLOIT) metrics.exploitations += 1;
    if (next === PHASES.COMPLETE) metrics.operationsCompleted += 1;
    if (next === PHASES.ABORT) metrics.operationsAborted += 1;
  }

  function cleanupOperation182(ai, operation, release = true) {
    for (const squad of operationSquads182(ai, operation)) {
      for (const unit of liveSquadUnits182(ai, squad)) {
        delete unit.deepOperation182;
      }
      if (release) ai.releaseSquad?.(squad, true);
    }
    operation.finishedAt182 = finite182(ai.game.time);
  }

  function manageRecon182(ai, operation, elapsed) {
    const picture = reconPicture182(ai, operation.suspectedPoint182 || ai.game.playerBase, 4200);
    operation.reconScore182 = picture.score;
    operation.reconContacts182 = picture.near.length;
    state182(ai).metrics.lastReconScore = picture.score;
    const reconSquads = elementSquads182(ai, operation, 'recon');
    const liveRecon = reconSquads.some(squad => liveSquadUnits182(ai, squad).length);
    if (!liveRecon && elapsed < config182(ai).reconTimeout - 8) createReconSquads182(ai, operation);
    if (picture.score >= config182(ai).reconThreshold) {
      if (assembleOperation182(ai, operation)) return;
      operation.waitingForForce182 = true;
      return;
    }
    state182(ai).metrics.reconBlockedLaunches += 1;
    if (elapsed >= config182(ai).reconTimeout) {
      transition182(ai, operation, PHASES.ABORT, 'insufficient-reconnaissance');
      for (const squad of reconSquads) issueWithdrawal182(ai, operation, squad);
    }
  }

  function manageAssembly182(ai, operation, elapsed) {
    const readiness = operationReadiness182(ai, operation);
    operation.assemblyReadiness182 = readiness;
    const defense = defenseReadiness182(ai);
    state182(ai).metrics.lastDefenseScore = defense.score;
    if (defense.score < config182(ai).defenseThreshold && elapsed < config182(ai).assemblyTimeout) return;
    if (readiness >= .66 || elapsed >= config182(ai).assemblyTimeout) {
      transition182(ai, operation, PHASES.SHAPING, readiness >= .66 ? 'force-ready' : 'assembly-timeout');
      for (const squad of elementSquads182(ai, operation, 'fire-support')) issueArtilleryPreparation182(ai, operation, squad);
      for (const squad of [...elementSquads182(ai, operation, 'feint-left'), ...elementSquads182(ai, operation, 'feint-right')]) {
        issueFeint182(ai, squad);
        state182(ai).metrics.feintsLaunched += 1;
      }
      for (const squad of elementSquads182(ai, operation, 'turning')) issueStage182(ai, squad, liveSquadUnits182(ai, squad), operation.plan182.flankPoint);
    }
  }

  function manageShaping182(ai, operation, elapsed) {
    const resistance = resistance182(ai, operation.plan182.breach, 1600);
    operation.currentResistance182 = resistance;
    const reduction = operation.initialResistance182 > .01
      ? clamp182(1 - resistance / operation.initialResistance182, 0, 1)
      : .35;
    operation.shapingReduction182 = reduction;
    for (const squad of elementSquads182(ai, operation, 'fire-support')) {
      if (finite182(ai.game.time) - finite182(squad.lastOrderAt) > 4.5) issueArtilleryPreparation182(ai, operation, squad);
    }
    const cfg = config182(ai);
    if (elapsed >= cfg.shapingMin && (reduction >= .18 || elapsed >= cfg.shapingMax)) {
      transition182(ai, operation, PHASES.BREACH, reduction >= .18 ? 'defense-suppressed' : 'maximum-preparation');
      for (const squad of elementSquads182(ai, operation, 'breach')) issueBreach182(ai, operation, squad);
      for (const squad of elementSquads182(ai, operation, 'turning')) issueTurning182(ai, operation, squad);
    }
  }

  function manageBreach182(ai, operation, elapsed) {
    const progress = breachProgress182(ai, operation);
    const casualties = operationCasualtyRatio182(ai, operation, ['breach']);
    const resistance = resistance182(ai, operation.plan182.breach, 1500);
    operation.breachProgress182 = progress;
    operation.breachCasualties182 = casualties;
    state182(ai).metrics.lastBreachProgress = progress;
    if (progress > operation.lastProgressValue182 + .05) {
      operation.lastProgressValue182 = progress;
      operation.lastProgressAt182 = finite182(ai.game.time);
    }
    const opened = progress >= .42 || (operation.initialResistance182 > 0 && resistance <= operation.initialResistance182 * .52);
    if (opened && casualties < .58) {
      transition182(ai, operation, PHASES.COMMIT, 'breach-open');
      for (const squad of elementSquads182(ai, operation, 'reserve')) issueReserveCommit182(ai, operation, squad);
      return;
    }
    const stalled = finite182(ai.game.time) - finite182(operation.lastProgressAt182) > 18;
    if (casualties >= .58 || elapsed >= config182(ai).breachTimeout || stalled) {
      transition182(ai, operation, PHASES.ABORT, casualties >= .58 ? 'breach-casualties' : stalled ? 'breach-stalled' : 'breach-timeout');
      for (const squad of operationSquads182(ai, operation)) issueWithdrawal182(ai, operation, squad);
    }
  }

  function manageCommit182(ai, operation, elapsed) {
    if (elapsed < 3.2) return;
    transition182(ai, operation, PHASES.EXPLOIT, 'reserve-through-gap');
    for (const squad of operationSquads182(ai, operation)) {
      if (['reserve', 'turning', 'breach'].includes(squad.deepElement182)) issueExploitation182(ai, operation, squad);
      else if (squad.deepElement182 === 'fire-support') {
        const forward = clampPoint182({
          x: operation.plan182.breach.x - operation.plan182.axis.nx * 500,
          y: operation.plan182.breach.y - operation.plan182.axis.ny * 500,
        });
        issueStage182(ai, squad, liveSquadUnits182(ai, squad), forward);
      }
    }
  }

  function manageExploitation182(ai, operation, elapsed) {
    const combatCasualties = operationCasualtyRatio182(ai, operation, ['breach', 'reserve', 'turning']);
    for (const squad of operationSquads182(ai, operation)) {
      if (!['reserve', 'turning', 'breach'].includes(squad.deepElement182)) continue;
      const units = liveSquadUnits182(ai, squad);
      if (!units.length) continue;
      const target = squad.deepTargetId182 ? ai.game.getEntity?.(squad.deepTargetId182) : null;
      const idle = units.every(unit => !unit.currentCommand);
      if (!target?.alive || idle || finite182(ai.game.time) - finite182(squad.lastOrderAt) > 24) {
        const mission = squad.deepElement182 === 'turning'
          ? 'supply'
          : PURPOSES[(hash182(`${operation.id}:${squad.id}:${Math.floor(elapsed / 20)}`) % 4)];
        issueExploitation182(ai, operation, squad, mission);
      }
    }
    if (combatCasualties >= .66) {
      transition182(ai, operation, PHASES.CONSOLIDATE, 'exploitation-casualties');
    } else if (elapsed >= config182(ai).exploitationTime) {
      transition182(ai, operation, PHASES.CONSOLIDATE, 'operational-depth-reached');
    }
    if (operation.phase === PHASES.CONSOLIDATE) {
      for (const squad of operationSquads182(ai, operation)) {
        if (squad.deepElement182 === 'recon') continue;
        issueConsolidation182(ai, operation, squad);
      }
    }
  }

  function manageConsolidation182(ai, operation, elapsed) {
    if (elapsed < config182(ai).consolidationTime) return;
    transition182(ai, operation, PHASES.COMPLETE, 'consolidated');
    cleanupOperation182(ai, operation, true);
    state182(ai).launchReadyAt = finite182(ai.game.time) + config182(ai).operationCooldown;
  }

  function manageAbort182(ai, operation, elapsed) {
    if (elapsed < 15) return;
    cleanupOperation182(ai, operation, true);
    operation.phase = PHASES.COMPLETE;
    operation.phaseReason182 = `aborted:${operation.phaseReason182 || 'unknown'}`;
    state182(ai).launchReadyAt = finite182(ai.game.time) + Math.max(8, config182(ai).operationCooldown * .72);
  }

  function manageDeepOperation182(ai, operation) {
    if (!operation?.deepOperation182 || operation.phase === PHASES.COMPLETE) return;
    const elapsed = finite182(ai.game.time) - finite182(operation.phaseStartedAt182, operation.createdAt);
    operation.squadIds = (operation.squadIds || []).filter(id => squadById182(ai, id));
    switch (operation.phase) {
      case PHASES.RECON: manageRecon182(ai, operation, elapsed); break;
      case PHASES.ASSEMBLY: manageAssembly182(ai, operation, elapsed); break;
      case PHASES.SHAPING: manageShaping182(ai, operation, elapsed); break;
      case PHASES.BREACH: manageBreach182(ai, operation, elapsed); break;
      case PHASES.COMMIT: manageCommit182(ai, operation, elapsed); break;
      case PHASES.EXPLOIT: manageExploitation182(ai, operation, elapsed); break;
      case PHASES.CONSOLIDATE: manageConsolidation182(ai, operation, elapsed); break;
      case PHASES.ABORT: manageAbort182(ai, operation, elapsed); break;
      default: transition182(ai, operation, PHASES.RECON, 'recovered-state'); break;
    }
  }

  function createOperation182(ai, requestedSize = null) {
    const state = state182(ai);
    const now = finite182(ai.game.time);
    const target = selectedPurposeTarget182(ai, { purpose: adaptivePurpose182(ai) });
    const suspectedPoint = contactPoint182(ai, target || ai.intel?.get?.('player-deployment-sector-128') || ai.game.playerBase, 'assault');
    const operation = {
      id: `deep-operation-${state.nextOperationId++}`,
      deepOperation182: true,
      doctrine182: 'reconnaissance-shaping-breach-exploitation',
      purpose: adaptivePurpose182(ai),
      phase: PHASES.RECON,
      createdAt: now,
      phaseStartedAt182: now,
      requestedSize182: requestedSize || config182(ai).minForce,
      suspectedPoint182: suspectedPoint,
      primaryX: suspectedPoint.x,
      primaryY: suspectedPoint.y,
      squadIds: [],
      elements: [],
      lastReinforcedAt: now,
      expiresAt: now + 900,
    };
    ai.campaigns129.push(operation);
    createReconSquads182(ai, operation);
    state.metrics.operationsPlanned += 1;
    return operation;
  }

  function ensureOperationalPressure182(ai, force = false) {
    const state = state182(ai);
    const now = finite182(ai.game.time);
    updateDefensiveReserve182(ai, true);
    const cfg = config182(ai);
    const active = deepCampaigns182(ai, true).filter(operation => operation.phase !== PHASES.COMPLETE);
    if (active.length >= cfg.operationLimit) return true;
    if (!force && now < state.launchReadyAt) return active.length > 0;
    const combatAvailable = ai.availableCombatUnits?.(unit => isCombat182(unit) && !unit._deepDefensiveReserve182 && !unit._deepDefenseEngaged182) || [];
    if (combatAvailable.length < Math.max(3, cfg.minForce * .55)) return false;
    const requested = Math.min(cfg.packageCap, Math.max(cfg.minForce, Math.floor(combatAvailable.length * .58)));
    createOperation182(ai, requested);
    state.launchReadyAt = now + cfg.operationCooldown;
    return true;
  }

  function supportTick182(ai) {
    const state = state182(ai);
    const now = finite182(ai.game.time);
    const cfg = config182(ai);
    if (now >= state.nextDefenseAt) {
      state.nextDefenseAt = now + cfg.defenseInterval;
      constructDefense182(ai);
    }
    updateDefensiveReserve182(ai, false);
    if (now >= state.nextCompositionAt) {
      state.nextCompositionAt = now + cfg.compositionInterval;
      requestCompositionUnit182(ai);
    }
  }

  const baseAvailableCombatUnits182 = TacticalAIClass.prototype.availableCombatUnits;
  if (typeof baseAvailableCombatUnits182 === 'function') {
    TacticalAIClass.prototype.availableCombatUnits = function(predicate = null) {
      return baseAvailableCombatUnits182.call(this, unit => {
        if (unit?._deepDefensiveReserve182 || unit?._deepDefenseEngaged182) return false;
        return !predicate || predicate(unit);
      });
    };
  }

  const baseOperationalAttacker182 = TacticalAIClass.prototype.isOperationalAttacker129;
  TacticalAIClass.prototype.isOperationalAttacker129 = function(unit) {
    if (unit?._deepDefensiveReserve182 || unit?._deepDefenseEngaged182) return false;
    return typeof baseOperationalAttacker182 === 'function' ? baseOperationalAttacker182.call(this, unit) : isCombat182(unit);
  };

  TacticalAIClass.prototype.launchCampaign129 = function(requestedSize = null) {
    return Boolean(createOperation182(this, requestedSize));
  };

  TacticalAIClass.prototype.ensurePersistentPressure129 = function(force = false) {
    return ensureOperationalPressure182(this, force);
  };

  TacticalAIClass.prototype.launchWarOperations126 = function() {
    return ensureOperationalPressure182(this, true);
  };

  TacticalAIClass.prototype.launchCoordinatedAttack = function() {
    return ensureOperationalPressure182(this, true);
  };

  const baseLaunchHarassment182 = TacticalAIClass.prototype.launchHarassment;
  if (typeof baseLaunchHarassment182 === 'function') {
    TacticalAIClass.prototype.launchHarassment = function() {
      const target = this.pickWarTarget126?.(['power', 'supply', 'production', 'extraction'][state182(this).nextOperationId % 4]);
      if (!target || target.signal || !isFreshContact182(this, target, 48, 170)) {
        const active = deepCampaigns182(this, true);
        if (!active.length) createOperation182(this, Math.max(4, Math.floor(config182(this).minForce * .5)));
        state182(this).metrics.reconBlockedLaunches += 1;
        return false;
      }
      return baseLaunchHarassment182.call(this);
    };
  }

  const baseManageCampaigns182 = TacticalAIClass.prototype.manageCampaigns129;
  TacticalAIClass.prototype.manageCampaigns129 = function() {
    const deep = (this.campaigns129 || []).filter(operation => operation?.deepOperation182);
    const legacy = (this.campaigns129 || []).filter(operation => !operation?.deepOperation182);
    if (typeof baseManageCampaigns182 === 'function') {
      this.campaigns129 = legacy;
      baseManageCampaigns182.call(this);
    } else this.campaigns129 = legacy;
    this.campaigns129.push(...deep);
    for (const operation of deep) manageDeepOperation182(this, operation);
    this.campaigns129 = (this.campaigns129 || []).filter(operation => {
      if (!operation.deepOperation182) return true;
      return operation.phase !== PHASES.COMPLETE || finite182(this.game.time) - finite182(operation.finishedAt182) < 40;
    });
  };

  const baseManageAssault182 = TacticalAIClass.prototype.manageAssaultSquad;
  TacticalAIClass.prototype.manageAssaultSquad = function(squad, units, centroid) {
    if (squad?.deepOperation182) return undefined;
    return baseManageAssault182?.call(this, squad, units, centroid);
  };

  const baseManageRaid182 = TacticalAIClass.prototype.manageRaidSquad;
  TacticalAIClass.prototype.manageRaidSquad = function(squad, units, centroid) {
    if (squad?.deepOperation182) return undefined;
    return baseManageRaid182?.call(this, squad, units, centroid);
  };

  const baseManageScout182 = TacticalAIClass.prototype.manageScoutSquad;
  TacticalAIClass.prototype.manageScoutSquad = function(squad, units, centroid) {
    if (!squad?.deepOperation182) return baseManageScout182?.call(this, squad, units, centroid);
    const operation = deepCampaigns182(this, false).find(item => item.id === squad.deepOperation182);
    if (!operation || operation.phase === PHASES.COMPLETE || operation.phase === PHASES.ABORT) {
      this.releaseSquad?.(squad, true);
      return;
    }
    if (!units.length) return;
    const points = reconnaissancePoints182(this, operation);
    const reached = dist182(centroid, { x: squad.targetX, y: squad.targetY }) < 320;
    if (reached || units.every(unit => !unit.currentCommand) || finite182(this.game.time) - finite182(squad.lastOrderAt) > 28) {
      squad.reconIndex182 = (finite182(squad.reconIndex182) + 1) % points.length;
      const next = points[squad.reconIndex182];
      squad.targetX = next.x;
      squad.targetY = next.y;
      squad.path = [next, points[(squad.reconIndex182 + 1) % points.length]];
      this.issueScoutOrders?.(squad);
    }
    if (units.some(unit => unit.healthRatio < .24)) {
      for (const unit of units) unit.setCommand({ type: 'move', x: this.base.x, y: this.base.y });
    }
  };

  const baseAIUpdate182 = TacticalAIClass.prototype.update;
  TacticalAIClass.prototype.update = function(dt) {
    const result = baseAIUpdate182.call(this, dt);
    supportTick182(this);
    return result;
  };

  const baseUnitSerialize182 = UnitClass.prototype.serialize;
  if (typeof baseUnitSerialize182 === 'function') {
    UnitClass.prototype.serialize = function() {
      const data = baseUnitSerialize182.call(this);
      if (this._deepDefensiveReserve182) data.deepDefensiveReserve182 = true;
      if (this._deepDefenseEngaged182) data.deepDefenseEngaged182 = true;
      return data;
    };
  }

  const baseAISerialize182 = TacticalAIClass.prototype.serialize;
  if (typeof baseAISerialize182 === 'function') {
    TacticalAIClass.prototype.serialize = function() {
      const data = baseAISerialize182.call(this);
      const state = state182(this);
      data.deepOperationsState182 = {
        ...state,
        metrics: { ...state.metrics },
      };
      data.deepCampaigns182 = deepCampaigns182(this, false).map(operation => copy182(operation));
      data.deepSquads182 = (this.squads || []).filter(squad => squad.deepOperation182).map(squad => ({
        id: squad.id,
        deepOperation182: squad.deepOperation182,
        deepElement182: squad.deepElement182,
        initialCount182: squad.initialCount182,
        stageX182: squad.stageX182,
        stageY182: squad.stageY182,
        deepTargetId182: squad.deepTargetId182,
        deepTargetX182: squad.deepTargetX182,
        deepTargetY182: squad.deepTargetY182,
        deepOrderAt182: squad.deepOrderAt182,
        reconIndex182: squad.reconIndex182,
      }));
      return data;
    };
  }

  const baseHydrate182 = GameClass.prototype.hydrate;
  if (typeof baseHydrate182 === 'function') {
    GameClass.prototype.hydrate = function(data) {
      const result = baseHydrate182.call(this, data);
      if (!this.ai) return result;
      const savedState = data?.ai?.deepOperationsState182;
      if (savedState) {
        this.ai.deepOperationsState182 = {
          ...state182(this.ai),
          ...savedState,
          metrics: { ...state182(this.ai).metrics, ...(savedState.metrics || {}) },
        };
      }
      const savedCampaigns = Array.isArray(data?.ai?.deepCampaigns182) ? data.ai.deepCampaigns182 : [];
      if (savedCampaigns.length) {
        const byId = new Map((this.ai.campaigns129 || []).map(operation => [operation.id, operation]));
        for (const saved of savedCampaigns) {
          const current = byId.get(saved.id);
          if (current) Object.assign(current, copy182(saved));
          else this.ai.campaigns129.push(copy182(saved));
        }
      }
      const savedSquads = new Map((data?.ai?.deepSquads182 || []).map(squad => [squad.id, squad]));
      for (const squad of this.ai.squads || []) {
        const saved = savedSquads.get(squad.id);
        if (saved) Object.assign(squad, saved);
      }
      const rawUnits = new Map((data?.entities || []).filter(entity => entity.kind === 'unit').map(entity => [entity.id, entity]));
      for (const unit of this.units || []) {
        const raw = rawUnits.get(unit.id);
        unit._deepDefensiveReserve182 = Boolean(raw?.deepDefensiveReserve182);
        unit._deepDefenseEngaged182 = Boolean(raw?.deepDefenseEngaged182);
      }
      return result;
    };
  }

  GameClass.prototype.deepOperationsDiagnostics182 = function() {
    const ai = this.ai;
    if (!ai) return null;
    const state = state182(ai);
    const readiness = defenseReadiness182(ai);
    const operations = deepCampaigns182(ai, false).map(operation => ({
      id: operation.id,
      phase: operation.phase,
      purpose: operation.purpose,
      reconScore: finite182(operation.reconScore182),
      assembly: finite182(operation.assemblyReadiness182),
      shapingReduction: finite182(operation.shapingReduction182),
      breachProgress: finite182(operation.breachProgress182),
      breachCasualties: finite182(operation.breachCasualties182),
      squads: operation.squadIds?.length || 0,
      reason: operation.phaseReason182 || '',
    }));
    return {
      version: VERSION,
      build: BUILD,
      defenseScore: readiness.score,
      defenseOuter: readiness.outer,
      defenseInner: readiness.inner,
      defenseSensors: readiness.sensors,
      defensiveReserve: readiness.reserved,
      desiredReserve: readiness.desiredReserve,
      activeOperations: operations.filter(operation => operation.phase !== PHASES.COMPLETE).length,
      operations,
      metrics: { ...state.metrics },
    };
  };

  root.__FD_DEEP_OPERATIONS_182__ = {
    version: VERSION,
    build: BUILD,
    phases: PHASES,
    config: CONFIG,
    diagnostics: () => debug.game?.deepOperationsDiagnostics182?.() || null,
    forceOperation: size => debug.game?.ai ? createOperation182(debug.game.ai, size) : null,
    forceDefense: () => debug.game?.ai ? constructDefense182(debug.game.ai) : false,
  };

  if (typeof document !== 'undefined') {
    void 0;
    const eyebrow = document.querySelector?.('#start-screen .eyebrow');
    if (eyebrow) void 0;
    const lead = document.querySelector?.('#start-screen .lead');
    if (lead) void 0;
  }
})();
