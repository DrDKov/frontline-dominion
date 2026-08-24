(() => {
  'use strict';

  const debug = window.__FD_DEBUG__;
  const GameClass = debug?.Game;
  const UnitClass = debug?.Unit;
  const BuildingClass = debug?.Building;
  const TacticalAIClass = debug?.TacticalAI;
  const UNIT_TYPES = debug?.UNIT_TYPES || {};
  const BUILDING_TYPES = debug?.BUILDING_TYPES || {};
  const WORLD = debug?.WORLD;
  if (!GameClass || !TacticalAIClass || !WORLD) return;

  const VERSION = '13.1';
  const SECTOR_COUNT = 8;
  const MAX_CONTACTS = 256;
  const PROFILE_KEYS = Object.freeze([
    'air', 'armor', 'infantry', 'artillery', 'mobility', 'covert',
    'fortification', 'logistics', 'powerDependence', 'aggression', 'turtling',
  ]);
  const PURPOSES = Object.freeze(['assault', 'power', 'production', 'supply', 'extraction', 'weak']);
  const FALLBACK_PURPOSES = Object.freeze({
    easy: ['assault', 'production', 'supply'],
    normal: ['power', 'production', 'assault', 'extraction', 'supply'],
    hard: ['power', 'production', 'supply', 'extraction', 'weak', 'assault'],
  });
  const CONFIG = Object.freeze({
    easy: {
      interval: 4.8, learningRate: .09, response: .48, exploration: .32,
      minimumEvidence: 7, outcomeMemory: .84, purposeRepeatLimit: 2,
    },
    normal: {
      interval: 3.1, learningRate: .17, response: .74, exploration: .18,
      minimumEvidence: 4.5, outcomeMemory: .88, purposeRepeatLimit: 2,
    },
    hard: {
      interval: 2.2, learningRate: .24, response: .96, exploration: .10,
      minimumEvidence: 3, outcomeMemory: .92, purposeRepeatLimit: 2,
    },
  });
  const clamp131 = (value, min, max) => Math.max(min, Math.min(max, value));
  const distance131 = (left, right) => Math.hypot((left?.x || 0) - (right?.x || 0), (left?.y || 0) - (right?.y || 0));
  const emptyAxes131 = () => Array.from({ length: SECTOR_COUNT }, () => 0);
  const emptyProfile131 = () => Object.fromEntries(PROFILE_KEYS.map((key) => [key, 0]));
  const sector131 = (origin, point) => {
    const angle = Math.atan2((point?.y || 0) - (origin?.y || 0), (point?.x || 0) - (origin?.x || 0));
    return Math.floor(((angle + Math.PI * 2 + Math.PI / SECTOR_COUNT) % (Math.PI * 2)) / (Math.PI * 2 / SECTOR_COUNT));
  };
  const statsForContact131 = (contact) => contact?.kind === 'building'
    ? (BUILDING_TYPES[contact.typeId] || {})
    : (UNIT_TYPES[contact?.typeId] || {});
  const weaponTargets131 = (stats) => Array.isArray(stats?.weapon?.targets) ? stats.weapon.targets : [];
  const isSiegeStats131 = (stats) => Boolean(
    stats?.weapon?.ballistic || Number(stats?.weapon?.range) >= 500 ||
    Number(stats?.weapon?.bonus?.building) > 1.05,
  );
  const isMobileStats131 = (stats) => Boolean(
    stats?.air || Number(stats?.speed) >= 118 || stats?.variant === 'recon',
  );
  const isCovertStats131 = (stats) => Boolean(stats?.stealth || stats?.covertOps);
  const normalizeAxes131 = (axes, total) => axes.map((value) => clamp131(value / Math.max(1, total), 0, 1));

  TacticalAIClass.prototype.adaptiveConfig131 = function() {
    return CONFIG[this.game.difficultyKey] || CONFIG.normal;
  };

  TacticalAIClass.prototype.ensureAdaptiveDoctrine131 = function() {
    if (!this.adaptiveDoctrine131) {
      this.adaptiveDoctrine131 = {
        version: VERSION,
        updatedAt: -Infinity,
        profile: emptyProfile131(),
        evidence: 0,
        observedContacts: 0,
        attackAxes: emptyAxes131(),
        defenseAxes: emptyAxes131(),
        axisOutcomes: emptyAxes131().map(() => ({ success: 0, failure: 0 })),
        outcomes: Object.fromEntries(PURPOSES.map((purpose) => [purpose, { success: 0, failure: 0, stalls: 0, lastAt: -Infinity }])),
        recentPurposes: [],
        lastPurpose: null,
        repeatedPurpose: 0,
        snapshots: 0,
      };
    }
    const state = this.adaptiveDoctrine131;
    state.profile ||= emptyProfile131();
    for (const key of PROFILE_KEYS) state.profile[key] = clamp131(Number(state.profile[key]) || 0, 0, 1);
    if (!Array.isArray(state.attackAxes) || state.attackAxes.length !== SECTOR_COUNT) state.attackAxes = emptyAxes131();
    if (!Array.isArray(state.defenseAxes) || state.defenseAxes.length !== SECTOR_COUNT) state.defenseAxes = emptyAxes131();
    if (!Array.isArray(state.axisOutcomes) || state.axisOutcomes.length !== SECTOR_COUNT) {
      state.axisOutcomes = emptyAxes131().map(() => ({ success: 0, failure: 0 }));
    }
    state.outcomes ||= {};
    for (const purpose of PURPOSES) state.outcomes[purpose] ||= { success: 0, failure: 0, stalls: 0, lastAt: -Infinity };
    state.recentPurposes = Array.isArray(state.recentPurposes) ? state.recentPurposes.slice(-6) : [];
    return state;
  };

  TacticalAIClass.prototype.observePlayerDoctrine131 = function() {
    const state = this.ensureAdaptiveDoctrine131();
    const config = this.adaptiveConfig131();
    const now = Number(this.game.time) || 0;
    const picture = this.refreshWarPicture126?.(true);
    const contacts = (picture?.entities || this.knownTargets?.() || [])
      .filter((contact) => contact && !contact.signal)
      .slice(0, MAX_CONTACTS);
    const deployment = this.intel?.get?.('player-deployment-sector-128') || this.game.playerBase || { x: WORLD.width * .2, y: WORLD.height * .5 };
    const enemyBase = this.base || this.game.enemyBase || { x: WORLD.width * .8, y: WORLD.height * .5 };
    const sample = emptyProfile131();
    const attackAxes = emptyAxes131();
    const defenseAxes = emptyAxes131();
    let unitWeight = 0;
    let buildingWeight = 0;
    let combatUnitWeight = 0;
    let defenseWeight = 0;
    let logisticsWeight = 0;
    let powerLoad = 0;
    let powerGeneration = 0;
    let aggressiveWeight = 0;
    let nearHomeWeight = 0;

    for (const contact of contacts) {
      const age = Math.max(0, now - (Number(contact.lastSeen) || 0));
      const confidence = clamp131(Number(contact.confidence128) || .35, .05, 1);
      const freshness = Math.exp(-age / (contact.kind === 'building' ? 440 : 92));
      const weight = confidence * clamp131(freshness, .08, 1);
      const stats = statsForContact131(contact);
      if (contact.kind === 'building') {
        buildingWeight += weight;
        const isDefense = Boolean(contact.defense128 || contact.category === 'defense' || stats.category === 'defense');
        const isLogistics = Boolean(
          contact.dropoff128 || contact.logisticsExtractor128 || Number(contact.income128) > 0 ||
          stats.dropoff || stats.logisticsExtractor || stats.placeOnResource,
        );
        if (isDefense) {
          defenseWeight += weight;
          defenseAxes[sector131(deployment, contact)] += weight * (1 + clamp131((Number(contact.cost128) || Number(stats.cost) || 0) / 3000, 0, 1.5));
        }
        if (isLogistics) logisticsWeight += weight;
        powerLoad += Math.max(0, Number(contact.powerUse128) || Number(stats.powerUse) || 0) * weight;
        powerGeneration += Math.max(0, Number(contact.power128) || Number(stats.power) || 0) * weight;
        continue;
      }

      unitWeight += weight;
      const armed = Boolean(contact.armed128 || stats.weapon);
      if (armed) combatUnitWeight += weight;
      const isAir = Boolean(contact.air || stats.air);
      const isVehicle = !isAir && Boolean(stats.vehicle || contact.category === 'vehicle');
      if (isAir) sample.air += weight;
      else if (isVehicle) sample.armor += weight;
      else sample.infantry += weight;
      if (isSiegeStats131(stats)) sample.artillery += weight;
      if (isMobileStats131(stats)) sample.mobility += weight;
      if (isCovertStats131(stats)) sample.covert += weight;
      if (contact.typeId === 'resourceTruck' || Number(contact.cargoCapacity128) >= 80) logisticsWeight += weight * 1.4;

      const distanceToEnemy = distance131(contact, enemyBase);
      const distanceToHome = distance131(contact, deployment);
      const proximity = clamp131(1 - distanceToEnemy / Math.max(2600, distanceToHome + distanceToEnemy), 0, 1);
      const velocityX = Number(contact.velocityX128) || 0;
      const velocityY = Number(contact.velocityY128) || 0;
      const towardX = enemyBase.x - contact.x;
      const towardY = enemyBase.y - contact.y;
      const towardLength = Math.hypot(towardX, towardY) || 1;
      const velocityLength = Math.hypot(velocityX, velocityY);
      const approach = velocityLength > 2
        ? clamp131((velocityX * towardX + velocityY * towardY) / (velocityLength * towardLength), 0, 1)
        : 0;
      const aggression = armed ? Math.max(proximity, approach * .88) : 0;
      aggressiveWeight += weight * aggression;
      if (distanceToHome < Math.max(1700, distanceToEnemy * .58)) nearHomeWeight += weight;
      if (aggression > .16) attackAxes[sector131(enemyBase, contact)] += weight * (.35 + aggression);
    }

    const safeUnits = Math.max(1, unitWeight);
    const safeCombat = Math.max(1, combatUnitWeight);
    sample.air = clamp131(sample.air / safeUnits, 0, 1);
    sample.armor = clamp131(sample.armor / safeUnits, 0, 1);
    sample.infantry = clamp131(sample.infantry / safeUnits, 0, 1);
    sample.artillery = clamp131(sample.artillery / safeCombat, 0, 1);
    sample.mobility = clamp131(sample.mobility / safeCombat, 0, 1);
    sample.covert = clamp131(sample.covert / safeCombat, 0, 1);
    sample.fortification = clamp131(defenseWeight / Math.max(1, buildingWeight * .42), 0, 1);
    sample.logistics = clamp131(logisticsWeight / Math.max(1, unitWeight + buildingWeight * .55), 0, 1);
    sample.powerDependence = clamp131(
      powerLoad / Math.max(55, powerLoad + 80) + Math.min(.32, powerGeneration / 1200),
      0,
      1,
    );
    sample.aggression = clamp131(aggressiveWeight / safeCombat, 0, 1);
    const homeRatio = clamp131(nearHomeWeight / safeCombat, 0, 1);
    sample.turtling = clamp131(sample.fortification * .58 + homeRatio * .27 + (1 - sample.aggression) * .15, 0, 1);

    const rawEvidence = unitWeight + buildingWeight * .75;
    const evidence = clamp131(rawEvidence / config.minimumEvidence, 0, 1);
    const alpha = config.learningRate * (.24 + evidence * .76);
    if (contacts.length) {
      for (const key of PROFILE_KEYS) state.profile[key] += (sample[key] - state.profile[key]) * alpha;
      const normalizedAttack = normalizeAxes131(attackAxes, Math.max(1, aggressiveWeight));
      const normalizedDefense = normalizeAxes131(defenseAxes, Math.max(1, defenseWeight));
      for (let index = 0; index < SECTOR_COUNT; index += 1) {
        state.attackAxes[index] += (normalizedAttack[index] - state.attackAxes[index]) * alpha;
        state.defenseAxes[index] += (normalizedDefense[index] - state.defenseAxes[index]) * alpha;
      }
    } else {
      const forget = this.game.difficultyKey === 'hard' ? .997 : this.game.difficultyKey === 'easy' ? .988 : .993;
      for (const key of PROFILE_KEYS) state.profile[key] *= forget;
      for (let index = 0; index < SECTOR_COUNT; index += 1) {
        state.attackAxes[index] *= forget;
        state.defenseAxes[index] *= forget;
      }
    }
    state.evidence += (evidence - state.evidence) * Math.max(.08, alpha);
    state.observedContacts = contacts.length;
    state.updatedAt = now;
    state.snapshots += 1;
    this.adaptiveMode131 = this.describeAdaptiveMode131();
    return state.profile;
  };

  TacticalAIClass.prototype.updateAdaptiveDoctrine131 = function(force = false) {
    const state = this.ensureAdaptiveDoctrine131();
    const interval = this.adaptiveConfig131().interval;
    if (!force && (Number(this.game.time) || 0) - state.updatedAt < interval) return state.profile;
    return this.observePlayerDoctrine131();
  };

  TacticalAIClass.prototype.describeAdaptiveMode131 = function() {
    const state = this.ensureAdaptiveDoctrine131();
    if (state.evidence < .24) return 'разведка тактики';
    const profile = state.profile;
    const modes = [
      ['контрбатарейная охота и глубокий обход', profile.artillery],
      ['эшелонированная ПВО', profile.air],
      ['противотанковый резерв', profile.armor],
      ['огневое подавление пехоты', profile.infantry],
      ['осада и удары по инфраструктуре', Math.max(profile.fortification, profile.turtling)],
      ['перехват мобильных групп', profile.mobility],
      ['контрразведка', profile.covert],
      ['разрыв снабжения', profile.logistics],
    ].sort((left, right) => right[1] - left[1]);
    return modes[0][0];
  };

  TacticalAIClass.prototype.adaptivePurposeScores131 = function() {
    const state = this.ensureAdaptiveDoctrine131();
    const config = this.adaptiveConfig131();
    const p = state.profile;
    const response = config.response * state.evidence;
    const scores = {
      assault: .66 + (1 - p.fortification) * .30 + p.aggression * .16,
      power: .34 + response * (p.powerDependence * 1.48 + p.fortification * .34 + p.turtling * .28),
      production: .38 + response * (p.fortification * .86 + p.artillery * .48 + p.air * .22),
      supply: .31 + response * (p.logistics * 1.34 + p.aggression * .34 + p.mobility * .20),
      extraction: .29 + response * (p.logistics * .98 + p.turtling * .18),
      weak: .39 + response * (p.fortification * .72 + p.artillery * .38 + p.mobility * .22),
    };
    for (const purpose of PURPOSES) {
      const outcome = state.outcomes[purpose];
      const total = outcome.success + outcome.failure;
      if (total > .1) scores[purpose] += clamp131((outcome.success - outcome.failure) / total, -.55, .38) * config.response;
      scores[purpose] -= Math.min(.38, outcome.stalls * .035);
      const recentCount = state.recentPurposes.filter((item) => item === purpose).length;
      scores[purpose] -= recentCount * .16;
      if (state.lastPurpose === purpose && state.repeatedPurpose >= config.purposeRepeatLimit) scores[purpose] -= .62;
    }
    return scores;
  };

  TacticalAIClass.prototype.chooseAdaptivePurpose131 = function() {
    const state = this.ensureAdaptiveDoctrine131();
    const config = this.adaptiveConfig131();
    const fallback = FALLBACK_PURPOSES[this.game.difficultyKey] || FALLBACK_PURPOSES.normal;
    if (state.evidence < .18) return fallback[(this.campaignCycle129 || 0) % fallback.length];
    const scores = this.adaptivePurposeScores131();
    const ranked = PURPOSES.map((purpose) => ({ purpose, score: scores[purpose] }))
      .sort((left, right) => right.score - left.score);
    if (this.random() < config.exploration) {
      const pool = ranked.slice(0, Math.min(3, ranked.length));
      return pool[Math.floor(this.random() * pool.length)]?.purpose || ranked[0].purpose;
    }
    return ranked[0].purpose;
  };

  TacticalAIClass.prototype.commitAdaptivePurpose131 = function(purpose) {
    const state = this.ensureAdaptiveDoctrine131();
    state.repeatedPurpose = state.lastPurpose === purpose ? state.repeatedPurpose + 1 : 1;
    state.lastPurpose = purpose;
    state.recentPurposes.push(purpose);
    state.recentPurposes = state.recentPurposes.slice(-6);
  };

  TacticalAIClass.prototype.chooseTurningPurpose131 = function(primaryPurpose) {
    const state = this.ensureAdaptiveDoctrine131();
    const p = state.profile;
    const ranked = [
      ['supply', p.logistics * 1.3 + p.aggression * .22],
      ['power', p.powerDependence * 1.25 + p.turtling * .28],
      ['production', p.fortification * .82 + p.air * .2 + p.artillery * .3],
      ['extraction', p.logistics * .88 + .12],
    ].filter(([purpose]) => purpose !== primaryPurpose).sort((left, right) => right[1] - left[1]);
    return ranked[0]?.[0] || 'supply';
  };

  TacticalAIClass.prototype.adaptiveUnitCounterScore131 = function(unitOrStats, mission = 'assault') {
    const state = this.ensureAdaptiveDoctrine131();
    if (state.evidence < .08) return 0;
    const config = this.adaptiveConfig131();
    const stats = unitOrStats?.stats || unitOrStats || {};
    const p = state.profile;
    const weapon = stats.weapon || {};
    const targets = weaponTargets131(stats);
    let score = 0;
    if (targets.includes('air')) score += p.air * 118;
    if (Number(weapon.bonus?.vehicle) > 1) score += p.armor * 88 * Number(weapon.bonus.vehicle);
    if (Number(weapon.bonus?.infantry) > 1) score += p.infantry * 68 * Number(weapon.bonus.infantry);
    if (Number(weapon.splash) > 0) score += p.infantry * Math.min(84, Number(weapon.splash) * .65);
    if (isSiegeStats131(stats)) score += Math.max(p.fortification, p.turtling) * 102;
    if (isMobileStats131(stats) || stats.air) score += p.artillery * 76 + p.mobility * 28;
    if (stats.stealth || stats.covertOps) score += (p.artillery + p.turtling + p.logistics) * 34;
    if (Number(stats.detector) > 0 || stats.variant === 'recon') score += p.covert * 92;
    if ((mission === 'supply' || mission === 'extraction') && isMobileStats131(stats)) score += p.logistics * 82;
    if ((mission === 'power' || mission === 'production') && (isSiegeStats131(stats) || Number(weapon.bonus?.building) > 1)) score += 58;
    return score * config.response * state.evidence;
  };

  const baseProductionScore131 = TacticalAIClass.prototype.productionScore;
  if (baseProductionScore131) {
    TacticalAIClass.prototype.productionScore = function(typeId, composition, roleCounts, credits) {
      const base = baseProductionScore131.call(this, typeId, composition, roleCounts, credits);
      return base + this.adaptiveUnitCounterScore131(UNIT_TYPES[typeId] || {}, 'production');
    };
  }

  const baseAssaultSelectionScore131 = TacticalAIClass.prototype.assaultSelectionScore;
  if (baseAssaultSelectionScore131) {
    TacticalAIClass.prototype.assaultSelectionScore = function(unit) {
      return baseAssaultSelectionScore131.call(this, unit) + this.adaptiveUnitCounterScore131(unit, 'assault');
    };
  }

  const baseRaidSelectionScore131 = TacticalAIClass.prototype.raidSelectionScore128;
  if (baseRaidSelectionScore131) {
    TacticalAIClass.prototype.raidSelectionScore128 = function(unit, mission) {
      return baseRaidSelectionScore131.call(this, unit, mission) + this.adaptiveUnitCounterScore131(unit, mission);
    };
  }

  const baseWarTargetScore131 = TacticalAIClass.prototype.warTargetScore126;
  if (baseWarTargetScore131) {
    TacticalAIClass.prototype.warTargetScore126 = function(contact, purpose, picture) {
      let score = baseWarTargetScore131.call(this, contact, purpose, picture);
      const state = this.ensureAdaptiveDoctrine131();
      const response = this.adaptiveConfig131().response * state.evidence;
      const p = state.profile;
      if (Number(contact.power128) > 0) score += response * p.powerDependence * 260;
      if (contact.dropoff128 || contact.logisticsExtractor128 || contact.typeId === 'resourceTruck') score += response * p.logistics * 245;
      if (contact.category === 'production') score += response * Math.max(p.fortification, p.air, p.artillery) * 210;
      if (contact.defense128 && purpose === 'weak') score -= response * p.fortification * 130;
      return score;
    };
  }

  const baseCampaignConfig131 = TacticalAIClass.prototype.campaignConfig129;
  if (baseCampaignConfig131) {
    TacticalAIClass.prototype.campaignConfig129 = function() {
      const base = baseCampaignConfig131.call(this);
      const state = this.ensureAdaptiveDoctrine131();
      if (state.evidence < .22) return base;
      const reserve = state.profile.aggression * this.adaptiveConfig131().response * .11;
      return { ...base, commitRatio: clamp131(base.commitRatio - reserve, .52, .88) };
    };
  }

  const baseBuildAnchor131 = TacticalAIClass.prototype.aiBuildAnchor;
  if (baseBuildAnchor131) {
    TacticalAIClass.prototype.aiBuildAnchor = function(typeId, count) {
      const fallback = baseBuildAnchor131.call(this, typeId, count);
      const state = this.ensureAdaptiveDoctrine131();
      const stats = BUILDING_TYPES[typeId] || {};
      if (stats.category !== 'defense' || state.evidence < .3) return fallback;
      let strongest = 0;
      for (let index = 1; index < SECTOR_COUNT; index += 1) {
        if (state.attackAxes[index] > state.attackAxes[strongest]) strongest = index;
      }
      if (state.attackAxes[strongest] < .08) return fallback;
      const spread = ((count % 3) - 1) * .16;
      const angle = strongest * Math.PI * 2 / SECTOR_COUNT + spread;
      const ring = 480 + (count % 4) * 118;
      return {
        x: clamp131(this.base.x + Math.cos(angle) * ring, 180, WORLD.width - 180),
        y: clamp131(this.base.y + Math.sin(angle) * ring, 180, WORLD.height - 180),
      };
    };
  }

  const baseBuildOperationalPath131 = TacticalAIClass.prototype.buildOperationalPath129;
  TacticalAIClass.prototype.adaptiveLaneScore131 = function(target, lane, element = 'main') {
    const state = this.ensureAdaptiveDoctrine131();
    if (!baseBuildOperationalPath131) return Math.abs(lane) * .04;
    const path = baseBuildOperationalPath131.call(this, target, lane, element);
    const approach = path[Math.max(0, path.length - 2)] || target;
    const deployment = this.intel?.get?.('player-deployment-sector-128') || this.game.playerBase;
    const sector = sector131(deployment, approach);
    const outcome = state.axisOutcomes[sector] || { success: 0, failure: 0 };
    const total = outcome.success + outcome.failure;
    const failureRate = total > .1 ? outcome.failure / total : 0;
    return state.defenseAxes[sector] * 1.35 + failureRate * .86 + (lane === 0 ? state.profile.fortification * .42 : 0);
  };

  TacticalAIClass.prototype.adaptiveLanePlan131 = function(target) {
    const state = this.ensureAdaptiveDoctrine131();
    if (state.evidence < .2) {
      const orientation = (this.campaignCycle129 || 0) % 2 ? 1 : -1;
      return { main: -orientation, turning: orientation * 2, feint: -orientation * 2, follow: 0 };
    }
    const candidates = [-2, 2, -1, 1, 0]
      .map((lane) => ({ lane, score: this.adaptiveLaneScore131(target, lane, 'main') }))
      .sort((left, right) => left.score - right.score);
    const main = candidates[0].lane;
    const turning = candidates.find((candidate) => candidate.lane && Math.sign(candidate.lane) !== Math.sign(main || 1))?.lane
      ?? candidates[1]?.lane ?? (-main || 2);
    const feint = [...candidates].sort((left, right) => right.score - left.score)
      .find((candidate) => candidate.lane !== main && candidate.lane !== turning)?.lane ?? (-main || -2);
    return { main, turning, feint, follow: main };
  };

  TacticalAIClass.prototype.recordCampaignOutcome131 = function(campaign, result) {
    if (!campaign || campaign.adaptiveOutcomeRecorded131) return false;
    const state = this.ensureAdaptiveDoctrine131();
    const config = this.adaptiveConfig131();
    const purpose = PURPOSES.includes(campaign.purpose) ? campaign.purpose : 'assault';
    for (const outcome of Object.values(state.outcomes)) {
      outcome.success *= config.outcomeMemory;
      outcome.failure *= config.outcomeMemory;
      outcome.stalls *= config.outcomeMemory;
    }
    const outcome = state.outcomes[purpose];
    const success = clamp131(Number(result?.success) || 0, 0, 1);
    const failure = clamp131(Number(result?.failure) || 0, 0, 1);
    outcome.success += success;
    outcome.failure += failure;
    outcome.stalls += Math.max(0, Number(result?.stalls) || 0);
    outcome.lastAt = Number(this.game.time) || 0;
    const sector = Number.isInteger(campaign.adaptiveApproachSector131) ? campaign.adaptiveApproachSector131 : null;
    if (sector !== null && state.axisOutcomes[sector]) {
      state.axisOutcomes[sector].success = state.axisOutcomes[sector].success * config.outcomeMemory + success;
      state.axisOutcomes[sector].failure = state.axisOutcomes[sector].failure * config.outcomeMemory + failure;
    }
    campaign.adaptiveOutcomeRecorded131 = true;
    campaign.adaptiveOutcome131 = { success, failure, stalls: Number(result?.stalls) || 0, at: this.game.time };
    return true;
  };

  const baseManageCampaigns131 = TacticalAIClass.prototype.manageCampaigns129;
  if (baseManageCampaigns131) {
    TacticalAIClass.prototype.manageCampaigns129 = function() {
      this.ensureCampaignState129?.();
      const campaigns = this.campaigns129 || [];
      const liveSquads = new Map((this.squads || []).filter((squad) => squad.unitIds?.length).map((squad) => [squad.id, squad]));
      for (const campaign of campaigns) {
        if (campaign.adaptiveOutcomeRecorded131) continue;
        const squads = campaign.squadIds.map((id) => liveSquads.get(id)).filter(Boolean);
        const alive = squads.reduce((total, squad) => total + (squad.unitIds?.length || 0), 0);
        campaign.adaptiveInitialUnits131 ||= Math.max(1, alive);
        campaign.adaptiveLowestUnits131 = Math.min(campaign.adaptiveLowestUnits131 ?? alive, alive);
        let nearest = Infinity;
        let stalls = 0;
        for (const squad of squads) {
          const progress = Number(squad.progress129?.distance);
          if (Number.isFinite(progress)) nearest = Math.min(nearest, progress);
          stalls += Number(squad.stallCount129) || 0;
        }
        if (Number.isFinite(nearest)) campaign.adaptiveNearest131 = Math.min(campaign.adaptiveNearest131 ?? Infinity, nearest);
        campaign.adaptiveStalls131 = Math.max(campaign.adaptiveStalls131 || 0, stalls);

        let targetDestroyed = false;
        if (campaign.primaryTargetId && this.canConfirmArea128?.(campaign.primaryX, campaign.primaryY, 300)) {
          const target = this.game.getEntity?.(campaign.primaryTargetId);
          targetDestroyed = !target?.alive;
        }
        const elapsed = (Number(this.game.time) || 0) - (Number(campaign.createdAt) || 0);
        const exhausted = !squads.length && elapsed > 4;
        const expired = elapsed >= 710 || (Number(campaign.expiresAt) || Infinity) <= this.game.time;
        if (targetDestroyed) {
          this.recordCampaignOutcome131(campaign, { success: 1, failure: 0, stalls: campaign.adaptiveStalls131 });
        } else if (exhausted || expired) {
          const reached = (campaign.adaptiveNearest131 ?? Infinity) < 700;
          const survival = clamp131((campaign.adaptiveLowestUnits131 || 0) / Math.max(1, campaign.adaptiveInitialUnits131), 0, 1);
          this.recordCampaignOutcome131(campaign, {
            success: reached ? .24 : 0,
            failure: clamp131(.58 + (1 - survival) * .34 + (reached ? -.18 : .12), 0, 1),
            stalls: campaign.adaptiveStalls131,
          });
        }
      }
      return baseManageCampaigns131.call(this);
    };
  }

  const baseLaunchCampaign131 = TacticalAIClass.prototype.launchCampaign129;
  if (baseLaunchCampaign131) {
    TacticalAIClass.prototype.launchCampaign129 = function(requestedSize = null) {
      this.ensureCampaignState129();
      this.updateAdaptiveDoctrine131();
      const config = this.campaignConfig129();
      const pressure = this.offensivePressure129();
      const limits = this.massOperationLimits129(pressure.total);
      const available = this.availableCombatUnits((unit) => this.isOperationalAttacker129(unit));
      if (available.length < 3) return false;
      const purpose = this.chooseAdaptivePurpose131();
      const packageSize = Math.min(
        available.length,
        limits.packageCap,
        Math.max(3, Number(requestedSize) || Math.ceil(Math.max(config.minForce, available.length * .56))),
      );
      const pool = [...available]
        .sort((left, right) => (
          this.assaultSelectionScore(right) + this.adaptiveUnitCounterScore131(right, purpose)
        ) - (
          this.assaultSelectionScore(left) + this.adaptiveUnitCounterScore131(left, purpose)
        ))
        .slice(0, packageSize);
      const primary = this.pickOperationTarget129(purpose, new Set(), null, true);
      if (!primary) return baseLaunchCampaign131.call(this, requestedSize);
      const excluded = new Set(primary.id ? [primary.id] : []);
      const feint = this.pickOperationTarget129('weak', excluded, primary, true) || primary;
      if (feint?.id) excluded.add(feint.id);
      const turningPurpose = this.chooseTurningPurpose131(purpose);
      const turning = this.pickOperationTarget129(turningPurpose, excluded, primary, true) || primary;
      const lanes = this.adaptiveLanePlan131(primary);
      const now = this.game.time;
      const deployment = this.intel?.get?.('player-deployment-sector-128') || this.game.playerBase;
      const approachPath = baseBuildOperationalPath131?.call(this, primary, lanes.main, 'main') || [primary];
      const approach = approachPath[Math.max(0, approachPath.length - 2)] || primary;
      const campaign = {
        id: `campaign-${this.nextCampaignId129++}`,
        purpose,
        phase: 'shaping',
        createdAt: now,
        synchronizedAt: now + config.mainDelay,
        exploitAt: now + config.exploitDelay,
        primaryTargetId: primary.id,
        primaryX: primary.x,
        primaryY: primary.y,
        feintTargetId: feint.id,
        turningTargetId: turning.id,
        orientation: Math.sign(lanes.main || 1),
        squadIds: [],
        elements: [],
        lastReinforcedAt: now,
        expiresAt: now + 720,
        adaptive131: true,
        adaptiveMode131: this.describeAdaptiveMode131(),
        adaptiveEvidence131: this.ensureAdaptiveDoctrine131().evidence,
        adaptiveApproachSector131: sector131(deployment, approach),
        adaptiveInitialUnits131: packageSize,
        adaptiveLowestUnits131: packageSize,
        adaptiveNearest131: Infinity,
        adaptiveStalls131: 0,
      };
      this.campaigns129.push(campaign);

      if (pool.length < 7) {
        const probe = this.takeCampaignUnits129(pool, pool.length, (unit) => this.assaultSelectionScore(unit) + this.adaptiveUnitCounterScore131(unit, purpose));
        this.createCampaignSquad129(campaign, 'main', probe, primary, lanes.main, now);
      } else {
        const p = this.ensureAdaptiveDoctrine131().profile;
        const feintRatio = clamp131(.18 + p.turtling * .03, .16, .23);
        const turningRatio = clamp131(.21 + p.fortification * .07 + p.artillery * .03, .20, .31);
        const followRatio = packageSize >= 24 ? clamp131(.12 + p.aggression * .05, .11, .18) : 0;
        const feintCount = Math.max(2, Math.floor(packageSize * feintRatio));
        const turningCount = packageSize >= 11 ? Math.max(2, Math.floor(packageSize * turningRatio)) : 0;
        const followCount = packageSize >= 24 ? Math.max(3, Math.floor(packageSize * followRatio)) : 0;
        const feintUnits = this.takeCampaignUnits129(pool, feintCount, (unit) => this.raidSelectionScore128(unit, 'weak'));
        const turningUnits = this.takeCampaignUnits129(pool, turningCount, (unit) => this.raidSelectionScore128(unit, turningPurpose));
        const followUnits = this.takeCampaignUnits129(pool, followCount, (unit) => this.assaultSelectionScore(unit) + (this.isRaider(unit) ? 35 : 0));
        const mainUnits = this.takeCampaignUnits129(pool, pool.length, (unit) => this.assaultSelectionScore(unit));

        this.createCampaignSquad129(campaign, 'feint', feintUnits, feint, lanes.feint, now);
        this.createCampaignSquad129(campaign, 'turning', turningUnits, turning, lanes.turning, now);
        this.createCampaignSquad129(campaign, 'main', mainUnits, primary, lanes.main, now + config.mainDelay);
        this.createCampaignSquad129(campaign, 'follow-through', followUnits, primary, lanes.follow, now + config.exploitDelay);
      }
      if (!campaign.squadIds.length) {
        this.campaigns129 = this.campaigns129.filter((item) => item !== campaign);
        return false;
      }
      this.commitAdaptivePurpose131(purpose);
      this.campaignCycle129 += 1;
      this.operationCycle126 = (this.operationCycle126 || 0) + 1;
      return true;
    };
  }

  const baseReinforceCampaign131 = TacticalAIClass.prototype.reinforceCampaign129;
  if (baseReinforceCampaign131) {
    TacticalAIClass.prototype.reinforceCampaign129 = function(campaign, requestedSize) {
      const available = this.availableCombatUnits((unit) => this.isOperationalAttacker129(unit));
      if (!available.length || !campaign) return false;
      const mission = campaign.phase === 'exploitation' ? 'production' : campaign.purpose;
      const target = this.pickOperationTarget129(mission, new Set(), null, true);
      if (!target) return baseReinforceCampaign131.call(this, campaign, requestedSize);
      const count = Math.min(available.length, Math.max(3, requestedSize));
      const units = [...available]
        .sort((left, right) => (
          this.assaultSelectionScore(right) + this.adaptiveUnitCounterScore131(right, mission)
        ) - (
          this.assaultSelectionScore(left) + this.adaptiveUnitCounterScore131(left, mission)
        ))
        .slice(0, count);
      const lanes = this.adaptiveLanePlan131(target);
      const candidates = [lanes.follow, lanes.turning, lanes.main, lanes.feint, 0];
      const lane = candidates[(campaign.elements.length + this.campaignCycle129) % candidates.length];
      const squad = this.createCampaignSquad129(campaign, 'follow-through', units, target, lane, this.game.time + 1.5);
      if (!squad) return false;
      campaign.lastReinforcedAt = this.game.time;
      return true;
    };
  }

  const baseAIUpdate131 = TacticalAIClass.prototype.update;
  TacticalAIClass.prototype.update = function(dt) {
    this.updateAdaptiveDoctrine131();
    return baseAIUpdate131.call(this, dt);
  };

  const baseSerialize131 = TacticalAIClass.prototype.serialize;
  TacticalAIClass.prototype.serialize = function() {
    const data = baseSerialize131.call(this);
    const state = this.ensureAdaptiveDoctrine131();
    data.adaptiveDoctrine131 = {
      ...state,
      profile: { ...state.profile },
      attackAxes: [...state.attackAxes],
      defenseAxes: [...state.defenseAxes],
      axisOutcomes: state.axisOutcomes.map((outcome) => ({ ...outcome })),
      outcomes: Object.fromEntries(Object.entries(state.outcomes).map(([purpose, outcome]) => [purpose, { ...outcome }])),
      recentPurposes: [...state.recentPurposes],
    };
    return data;
  };

  const baseHydrate131 = GameClass.prototype.hydrate;
  if (baseHydrate131) {
    GameClass.prototype.hydrate = function(data) {
      const result = baseHydrate131.call(this, data);
      if (this.ai && data?.ai?.adaptiveDoctrine131) {
        const saved = data.ai.adaptiveDoctrine131;
        this.ai.adaptiveDoctrine131 = {
          ...saved,
          profile: { ...emptyProfile131(), ...(saved.profile || {}) },
          attackAxes: Array.isArray(saved.attackAxes) ? saved.attackAxes.slice(0, SECTOR_COUNT) : emptyAxes131(),
          defenseAxes: Array.isArray(saved.defenseAxes) ? saved.defenseAxes.slice(0, SECTOR_COUNT) : emptyAxes131(),
          axisOutcomes: Array.isArray(saved.axisOutcomes) ? saved.axisOutcomes.slice(0, SECTOR_COUNT).map((outcome) => ({ ...outcome })) : emptyAxes131().map(() => ({ success: 0, failure: 0 })),
          outcomes: Object.fromEntries(Object.entries(saved.outcomes || {}).map(([purpose, outcome]) => [purpose, { ...outcome }])),
          recentPurposes: Array.isArray(saved.recentPurposes) ? [...saved.recentPurposes] : [],
        };
        this.ai.ensureAdaptiveDoctrine131();
      }
      return result;
    };
  }

  if (typeof document !== 'undefined') {
    void 0;
    const eyebrow = document.querySelector?.('#start-screen .eyebrow');
    if (eyebrow) void 0;
    const lead = document.querySelector?.('#start-screen .lead');
    if (lead) void 0;
  }

  window.__FD_ADAPTIVE_DOCTRINE_V131__ = {
    version: VERSION,
    config: CONFIG,
    get profile() { return debug.game?.ai?.ensureAdaptiveDoctrine131?.().profile || null; },
    get evidence() { return debug.game?.ai?.ensureAdaptiveDoctrine131?.().evidence || 0; },
    get mode() { return debug.game?.ai?.describeAdaptiveMode131?.() || 'разведка тактики'; },
    get purposes() { return debug.game?.ai?.adaptivePurposeScores131?.() || null; },
    forceObserve: () => debug.game?.ai?.updateAdaptiveDoctrine131?.(true) || null,
  };
})();
