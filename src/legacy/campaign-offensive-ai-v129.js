(() => {
  'use strict';

  const debug = window.__FD_DEBUG__;
  const GameClass = debug?.Game;
  const TacticalAIClass = debug?.TacticalAI;
  const WORLD = debug?.WORLD;
  if (!GameClass || !TacticalAIClass || !WORLD) return;

  const VERSION = '12.9';
  const OFFENSIVE_ROLES = new Set(['assault', 'harass', 'feint']);
  const CONFIG = Object.freeze({
    easy: {
      interval: 23, campaignLimit: 1, minForce: 5, commitRatio: .62,
      packageCap: 34, squadLimit: 5, mainDelay: 7, exploitDelay: 15,
    },
    normal: {
      interval: 11, campaignLimit: 2, minForce: 7, commitRatio: .76,
      packageCap: 72, squadLimit: 11, mainDelay: 5, exploitDelay: 11,
    },
    hard: {
      interval: 6.5, campaignLimit: 3, minForce: 8, commitRatio: .84,
      packageCap: 104, squadLimit: 17, mainDelay: 3.5, exploitDelay: 8,
    },
  });
  const MAIN_PURPOSES = Object.freeze({
    easy: ['assault', 'production'],
    normal: ['power', 'production', 'assault', 'extraction', 'assault'],
    hard: ['power', 'production', 'assault', 'extraction', 'supply', 'assault'],
  });
  const TURNING_PURPOSES = Object.freeze(['supply', 'power', 'extraction', 'production']);
  const clamp129 = (value, min, max) => Math.max(min, Math.min(max, value));
  const distance129 = (left, right) => Math.hypot((left?.x || 0) - (right?.x || 0), (left?.y || 0) - (right?.y || 0));
  const elementRole129 = (element) => element === 'main' || element === 'follow-through' ? 'assault' : element === 'feint' ? 'feint' : 'harass';

  TacticalAIClass.prototype.campaignConfig129 = function() {
    return CONFIG[this.game.difficultyKey] || CONFIG.normal;
  };

  TacticalAIClass.prototype.ensureCampaignState129 = function() {
    this.campaigns129 ||= [];
    this.nextCampaignId129 ||= 1;
    this.campaignCycle129 ||= 0;
    return this.campaigns129;
  };

  TacticalAIClass.prototype.isOperationalAttacker129 = function(unit) {
    return Boolean(
      unit?.alive && unit.team === 'enemy' && unit.typeId !== 'worker' &&
      !unit.embarkedIn && unit.airServiceState !== 'servicing' &&
      !this.isCovert(unit) && !unit.stats?.strategicLauncher?.length &&
      unit.stats?.weapon && unit.healthRatio > .22
    );
  };

  TacticalAIClass.prototype.offensiveSquads129 = function() {
    return this.squads.filter((squad) => OFFENSIVE_ROLES.has(squad.role) && squad.unitIds?.length);
  };

  TacticalAIClass.prototype.offensivePressure129 = function() {
    const attackers = this.game.units.filter((unit) => this.isOperationalAttacker129(unit));
    const attackerIds = new Set(attackers.map((unit) => unit.id));
    const committedIds = new Set();
    for (const squad of this.offensiveSquads129()) {
      for (const id of squad.unitIds) if (attackerIds.has(id)) committedIds.add(id);
    }
    const available = this.availableCombatUnits((unit) => this.isOperationalAttacker129(unit));
    return {
      total: attackers.length,
      committed: committedIds.size,
      available: available.length,
      ratio: attackers.length ? committedIds.size / attackers.length : 0,
      activeSquads: this.offensiveSquads129().length,
    };
  };

  TacticalAIClass.prototype.massOperationLimits129 = function(total) {
    const config = this.campaignConfig129();
    if (total >= 5000) {
      return {
        packageCap: 1200,
        reinforcementSize: 520,
        squadLimit: this.game.difficultyKey === 'hard' ? 32 : this.game.difficultyKey === 'easy' ? 20 : 27,
      };
    }
    if (total >= 1000) return { packageCap: 430, reinforcementSize: 260, squadLimit: Math.max(config.squadLimit, 24) };
    if (total >= 500) return { packageCap: 240, reinforcementSize: 140, squadLimit: Math.max(config.squadLimit, 20) };
    return {
      packageCap: config.packageCap,
      reinforcementSize: this.game.difficultyKey === 'hard' ? 42 : this.game.difficultyKey === 'easy' ? 18 : 30,
      squadLimit: config.squadLimit,
    };
  };

  TacticalAIClass.prototype.pickOperationTarget129 = function(purpose = 'assault', excludedIds = new Set(), reference = null, preferBuilding = true) {
    const picture = this.refreshWarPicture126?.(true);
    let candidates = (picture?.entities || this.knownTargets?.() || [])
      .filter((contact) => contact && !contact.signal && !excludedIds.has(contact.id));
    if (preferBuilding) {
      const buildings = candidates.filter((contact) => contact.kind === 'building' && contact.completed128 !== false);
      if (buildings.length) candidates = buildings;
    }
    let best = null;
    let bestScore = -Infinity;
    for (const contact of candidates) {
      let score = this.warTargetScore126?.(contact, purpose, picture) ?? (Number(contact.value) || 0);
      if (contact.kind === 'building') score += 90;
      if (reference) score += clamp129(distance129(contact, reference) / 9, 0, 190);
      if (score > bestScore) {
        best = contact;
        bestScore = score;
      }
    }
    if (best) {
      const point = this.contactPoint128?.(best, purpose) || best;
      return { ...best, x: point.x, y: point.y, strategicPurpose128: purpose };
    }
    const signal = this.intel?.get('player-deployment-sector-128') || {
      id: 'player-deployment-sector-128', kind: 'signal', signal: true,
      x: this.game.playerBase.x, y: this.game.playerBase.y, category: 'unknown', value: 20,
    };
    return { ...signal, strategicPurpose128: purpose };
  };

  TacticalAIClass.prototype.buildOperationalPath129 = function(target, lane = 0, element = 'main', origin = this.base) {
    const point = { x: Number(target?.x) || this.game.playerBase.x, y: Number(target?.y) || this.game.playerBase.y };
    const dx = point.x - origin.x;
    const dy = point.y - origin.y;
    const length = Math.hypot(dx, dy) || 1;
    const nx = dx / length;
    const ny = dy / length;
    const px = -ny;
    const py = nx;
    const sign = lane === 0 ? (this.laneRotation % 2 ? 1 : -1) : Math.sign(lane);
    const depth = Math.abs(lane);
    const wide = depth >= 2 ? 2850 : depth === 1 ? 1650 : 520;
    const elementScale = element === 'turning' ? 1.18 : element === 'feint' ? 1.08 : element === 'follow-through' ? .58 : .82;
    const offset = wide * elementScale;
    const path = [
      {
        x: origin.x + dx * .23 + px * sign * offset,
        y: origin.y + dy * .23 + py * sign * offset,
      },
      {
        x: origin.x + dx * .54 + px * sign * offset * .84,
        y: origin.y + dy * .54 + py * sign * offset * .84,
      },
      {
        x: origin.x + dx * .78 + px * sign * offset * .48,
        y: origin.y + dy * .78 + py * sign * offset * .48,
      },
    ];
    if (element === 'turning') {
      path.push({
        x: point.x + nx * 720 + px * sign * 420,
        y: point.y + ny * 720 + py * sign * 420,
      });
    } else if (element === 'feint') {
      path.push({
        x: point.x + px * sign * 520,
        y: point.y + py * sign * 520,
      });
    }
    path.push(point);
    return path.map((waypoint) => ({
      x: clamp129(waypoint.x, 180, WORLD.width - 180),
      y: clamp129(waypoint.y, 180, WORLD.height - 180),
    }));
  };

  TacticalAIClass.prototype.stageCampaignSquad129 = function(squad) {
    const units = this.squadUnits(squad);
    const stage = squad.path?.[0] || { x: squad.targetX, y: squad.targetY };
    units.forEach((unit, index) => {
      const offset = this.game.formationOffset(index, units.length, Math.max(48, unit.radius * 2.1));
      unit.setCommand({ type: 'move', x: stage.x + offset.x, y: stage.y + offset.y });
      unit.setCommand({ type: 'hold' }, true);
    });
    squad.state = 'staging';
    squad.lastOrderAt = this.game.time;
  };

  TacticalAIClass.prototype.launchCampaignSquad129 = function(squad) {
    if (!squad?.unitIds?.length) return false;
    if (squad.role === 'assault') this.issueAssaultOrders(squad);
    else {
      squad.state = 'raiding';
      this.issueRaidOrders(squad);
    }
    squad.launchedAt129 = this.game.time;
    squad.progress129 = null;
    return true;
  };

  TacticalAIClass.prototype.createCampaignSquad129 = function(campaign, element, units, target, lane, launchAt) {
    if (!units.length) return null;
    const role = elementRole129(element);
    const path = this.buildOperationalPath129(target, lane, element);
    const squad = this.createSquad(role, units, {
      targetId: target.id,
      targetX: target.x,
      targetY: target.y,
      path,
      state: launchAt > this.game.time ? 'staging' : role === 'assault' ? 'advancing' : 'raiding',
      flank: lane,
      mission: target.strategicPurpose128 || campaign.purpose,
      launchAt,
      expiresAt: this.game.time + 420,
    });
    if (!squad) return null;
    squad.campaignId129 = campaign.id;
    squad.element129 = element;
    squad.operationalAxis129 = lane;
    squad.launchAt = launchAt;
    campaign.squadIds.push(squad.id);
    campaign.elements.push({ squadId: squad.id, element, lane, targetId: target.id, launchAt });
    if (launchAt > this.game.time) this.stageCampaignSquad129(squad);
    else this.launchCampaignSquad129(squad);
    return squad;
  };

  TacticalAIClass.prototype.takeCampaignUnits129 = function(pool, count, score) {
    if (count <= 0 || !pool.length) return [];
    const ordered = [...pool].sort((left, right) => score(right) - score(left));
    const selected = ordered.slice(0, Math.min(count, ordered.length));
    const used = new Set(selected.map((unit) => unit.id));
    for (let index = pool.length - 1; index >= 0; index -= 1) {
      if (used.has(pool[index].id)) pool.splice(index, 1);
    }
    return selected;
  };

  TacticalAIClass.prototype.launchCampaign129 = function(requestedSize = null) {
    this.ensureCampaignState129();
    const config = this.campaignConfig129();
    const pressure = this.offensivePressure129();
    const limits = this.massOperationLimits129(pressure.total);
    const available = this.availableCombatUnits((unit) => this.isOperationalAttacker129(unit));
    if (available.length < 3) return false;
    const sequence = MAIN_PURPOSES[this.game.difficultyKey] || MAIN_PURPOSES.normal;
    const purpose = sequence[this.campaignCycle129 % sequence.length];
    const packageSize = Math.min(
      available.length,
      limits.packageCap,
      Math.max(3, Number(requestedSize) || Math.ceil(Math.max(config.minForce, available.length * .56))),
    );
    const pool = available.slice(0, packageSize);
    const orientation = this.campaignCycle129 % 2 ? 1 : -1;
    const primary = this.pickOperationTarget129(purpose, new Set(), null, true);
    const excluded = new Set(primary?.id ? [primary.id] : []);
    const feint = this.pickOperationTarget129('weak', excluded, primary, true) || primary;
    if (feint?.id) excluded.add(feint.id);
    const turningPurpose = TURNING_PURPOSES[this.campaignCycle129 % TURNING_PURPOSES.length];
    const turning = this.pickOperationTarget129(turningPurpose, excluded, primary, true) || primary;
    const now = this.game.time;
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
      orientation,
      squadIds: [],
      elements: [],
      lastReinforcedAt: now,
      expiresAt: now + 720,
    };
    this.campaigns129.push(campaign);

    if (pool.length < 7) {
      const probe = this.takeCampaignUnits129(pool, pool.length, (unit) => this.assaultSelectionScore(unit));
      this.createCampaignSquad129(campaign, 'main', probe, primary, orientation, now);
    } else {
      const feintCount = Math.max(2, Math.floor(packageSize * (packageSize >= 24 ? .18 : .25)));
      const turningCount = packageSize >= 11 ? Math.max(2, Math.floor(packageSize * .22)) : 0;
      const followCount = packageSize >= 24 ? Math.max(3, Math.floor(packageSize * .13)) : 0;
      const feintUnits = this.takeCampaignUnits129(pool, feintCount, (unit) => this.raidSelectionScore128(unit, 'weak'));
      const turningUnits = this.takeCampaignUnits129(pool, turningCount, (unit) => this.raidSelectionScore128(unit, turningPurpose));
      const followUnits = this.takeCampaignUnits129(pool, followCount, (unit) => this.assaultSelectionScore(unit) + (this.isRaider(unit) ? 35 : 0));
      const mainUnits = this.takeCampaignUnits129(pool, pool.length, (unit) => this.assaultSelectionScore(unit));

      this.createCampaignSquad129(campaign, 'feint', feintUnits, feint, orientation * 2, now);
      this.createCampaignSquad129(campaign, 'turning', turningUnits, turning, -orientation * 2, now);
      this.createCampaignSquad129(campaign, 'main', mainUnits, primary, -orientation, now + config.mainDelay);
      this.createCampaignSquad129(campaign, 'follow-through', followUnits, primary, 0, now + config.exploitDelay);
    }
    if (!campaign.squadIds.length) {
      this.campaigns129 = this.campaigns129.filter((item) => item !== campaign);
      return false;
    }
    this.campaignCycle129 += 1;
    this.operationCycle126 = (this.operationCycle126 || 0) + 1;
    return true;
  };

  TacticalAIClass.prototype.reinforceCampaign129 = function(campaign, requestedSize) {
    const available = this.availableCombatUnits((unit) => this.isOperationalAttacker129(unit));
    if (!available.length || !campaign) return false;
    const target = this.pickOperationTarget129(
      campaign.phase === 'exploitation' ? 'production' : campaign.purpose,
      new Set(),
      null,
      true,
    );
    const count = Math.min(available.length, Math.max(3, requestedSize));
    const units = [...available]
      .sort((left, right) => this.assaultSelectionScore(right) - this.assaultSelectionScore(left))
      .slice(0, count);
    const lanes = [-1, 1, -2, 2, 0];
    const lane = lanes[(campaign.elements.length + this.campaignCycle129) % lanes.length];
    const squad = this.createCampaignSquad129(campaign, 'follow-through', units, target, lane, this.game.time + 1.5);
    if (!squad) return false;
    campaign.lastReinforcedAt = this.game.time;
    return true;
  };

  TacticalAIClass.prototype.activeCampaigns129 = function() {
    this.ensureCampaignState129();
    const liveSquadIds = new Set(this.squads.filter((squad) => squad.unitIds?.length).map((squad) => squad.id));
    return this.campaigns129.filter((campaign) => campaign.squadIds.some((id) => liveSquadIds.has(id)));
  };

  TacticalAIClass.prototype.ensurePersistentPressure129 = function(force = false) {
    this.ensureCampaignState129();
    const config = this.campaignConfig129();
    while (this.squads.filter((squad) => squad.role === 'scout').length < (this.game.difficultyKey === 'hard' ? 3 : this.game.difficultyKey === 'easy' ? 1 : 2)) {
      if (!this.launchScoutMission()) break;
    }

    let pressure = this.offensivePressure129();
    if (!pressure.total) return false;
    const limits = this.massOperationLimits129(pressure.total);
    const desiredCommitted = Math.max(3, Math.floor(pressure.total * config.commitRatio));
    let activeCampaigns = this.activeCampaigns129();
    let changed = false;
    let guard = 0;
    while (
      guard < config.campaignLimit && activeCampaigns.length < config.campaignLimit &&
      pressure.available >= 3 && (pressure.committed < desiredCommitted || !activeCampaigns.length)
    ) {
      const slots = Math.max(1, config.campaignLimit - activeCampaigns.length);
      const requested = Math.min(limits.packageCap, Math.max(config.minForce, Math.ceil((desiredCommitted - pressure.committed) / slots)));
      if (!this.launchCampaign129(requested)) break;
      changed = true;
      guard += 1;
      pressure = this.offensivePressure129();
      activeCampaigns = this.activeCampaigns129();
    }

    let reinforcementBursts = 0;
    while (
      activeCampaigns.length && pressure.available >= 3 && pressure.committed < desiredCommitted &&
      pressure.activeSquads < limits.squadLimit && reinforcementBursts < 4
    ) {
      const campaign = [...activeCampaigns]
        .sort((left, right) => (left.lastReinforcedAt || 0) - (right.lastReinforcedAt || 0))[0];
      const need = desiredCommitted - pressure.committed;
      if (!this.reinforceCampaign129(campaign, Math.min(limits.reinforcementSize, need))) break;
      changed = true;
      reinforcementBursts += 1;
      pressure = this.offensivePressure129();
      activeCampaigns = this.activeCampaigns129();
    }

    if (!changed && force && !activeCampaigns.length && pressure.available >= 3) {
      changed = this.launchCampaign129(Math.min(pressure.available, config.minForce));
    }
    return changed || activeCampaigns.length > 0;
  };

  TacticalAIClass.prototype.replanStalledSquad129 = function(squad, units) {
    const centroid = this.squadCentroid(units);
    const target = { x: squad.targetX, y: squad.targetY };
    squad.stallCount129 = (squad.stallCount129 || 0) + 1;
    squad.flank = squad.flank ? -squad.flank : (this.laneRotation++ % 2 ? 1 : -1);
    squad.operationalAxis129 = squad.flank;
    squad.path = this.buildOperationalPath129(target, squad.flank, squad.element129 || 'main', centroid).slice(0, 4);
    if (squad.stallCount129 >= 3 && this.retaskOperation128?.(squad, units, squad.role === 'assault' ? 'assault' : 'raid')) {
      squad.stallCount129 = 0;
      squad.progress129 = null;
      return;
    }
    this.launchCampaignSquad129(squad);
    squad.progress129 = { x: centroid.x, y: centroid.y, distance: distance129(centroid, target), at: this.game.time };
  };

  TacticalAIClass.prototype.watchCampaignProgress129 = function(squad, units) {
    if (!squad?.campaignId129 || squad.state === 'staging' || !units.length) return;
    const centroid = this.squadCentroid(units);
    const target = { x: squad.targetX, y: squad.targetY };
    const remaining = distance129(centroid, target);
    if (remaining < 620) {
      squad.progress129 = { x: centroid.x, y: centroid.y, distance: remaining, at: this.game.time };
      squad.stallCount129 = 0;
      return;
    }
    const previous = squad.progress129;
    if (!previous) {
      squad.progress129 = { x: centroid.x, y: centroid.y, distance: remaining, at: this.game.time };
      return;
    }
    if (this.game.time - previous.at < 13) return;
    const displacement = Math.hypot(centroid.x - previous.x, centroid.y - previous.y);
    const progress = previous.distance - remaining;
    if (displacement < 95 || progress < 70) this.replanStalledSquad129(squad, units);
    else {
      squad.progress129 = { x: centroid.x, y: centroid.y, distance: remaining, at: this.game.time };
      squad.stallCount129 = 0;
    }
  };

  TacticalAIClass.prototype.manageCampaigns129 = function() {
    this.ensureCampaignState129();
    const liveSquads = new Map(this.squads.filter((squad) => squad.unitIds?.length).map((squad) => [squad.id, squad]));
    for (const campaign of this.campaigns129) {
      const elapsed = this.game.time - campaign.createdAt;
      campaign.phase = this.game.time < campaign.synchronizedAt
        ? 'shaping'
        : this.game.time < campaign.exploitAt ? 'main-effort' : 'exploitation';
      campaign.squadIds = campaign.squadIds.filter((id) => liveSquads.has(id));
      if (!campaign.squadIds.length && !campaign.finishedAt) campaign.finishedAt = this.game.time;
      if (elapsed > 720) campaign.expiresAt = this.game.time;
    }
    this.campaigns129 = this.campaigns129.filter((campaign) => !campaign.finishedAt || this.game.time - campaign.finishedAt < 45);
  };

  const baseManageRaid129 = TacticalAIClass.prototype.manageRaidSquad;
  TacticalAIClass.prototype.manageRaidSquad = function(squad, units, centroid) {
    if (squad?.campaignId129 && squad.state === 'staging') {
      if (this.game.time < squad.launchAt) {
        const idle = units.every((unit) => !unit.currentCommand);
        if (idle && this.game.time - squad.lastOrderAt > 3) this.stageCampaignSquad129(squad);
        return;
      }
      this.launchCampaignSquad129(squad);
    }
    const result = baseManageRaid129.call(this, squad, units, centroid);
    this.watchCampaignProgress129(squad, units);
    return result;
  };

  const baseManageAssault129 = TacticalAIClass.prototype.manageAssaultSquad;
  TacticalAIClass.prototype.manageAssaultSquad = function(squad, units, centroid) {
    const result = baseManageAssault129.call(this, squad, units, centroid);
    this.watchCampaignProgress129(squad, units);
    return result;
  };

  TacticalAIClass.prototype.launchWarOperations126 = function() {
    return this.ensurePersistentPressure129(true);
  };

  TacticalAIClass.prototype.launchCoordinatedAttack = function() {
    return this.ensurePersistentPressure129(true);
  };

  const baseAIUpdate129 = TacticalAIClass.prototype.update;
  TacticalAIClass.prototype.update = function(dt) {
    const result = baseAIUpdate129.call(this, dt);
    const config = this.campaignConfig129();
    this.manageCampaigns129();
    this.operationTimer126 = Math.min(this.operationTimer126 ?? config.interval, config.interval);
    this.attackTimer = Math.min(this.attackTimer, this.game.difficultyKey === 'hard' ? 14 : this.game.difficultyKey === 'easy' ? 42 : 24);
    this.harassTimer = Math.min(this.harassTimer, this.game.difficultyKey === 'hard' ? 19 : this.game.difficultyKey === 'easy' ? 65 : 31);
    return result;
  };

  const baseSerialize129 = TacticalAIClass.prototype.serialize;
  TacticalAIClass.prototype.serialize = function() {
    const data = baseSerialize129.call(this);
    this.ensureCampaignState129();
    data.campaignCycle129 = this.campaignCycle129;
    data.nextCampaignId129 = this.nextCampaignId129;
    data.campaigns129 = this.campaigns129.map((campaign) => ({
      ...campaign,
      squadIds: [...campaign.squadIds],
      elements: campaign.elements.map((element) => ({ ...element })),
    }));
    data.campaignSquads129 = this.squads
      .filter((squad) => squad.campaignId129)
      .map((squad) => ({
        id: squad.id,
        campaignId129: squad.campaignId129,
        element129: squad.element129,
        operationalAxis129: squad.operationalAxis129,
        launchedAt129: squad.launchedAt129,
        stallCount129: squad.stallCount129 || 0,
      }));
    return data;
  };

  const baseHydrate129 = GameClass.prototype.hydrate;
  if (baseHydrate129) {
    GameClass.prototype.hydrate = function(data) {
      const result = baseHydrate129.call(this, data);
      if (this.ai && data?.ai) {
        this.ai.campaignCycle129 = Number(data.ai.campaignCycle129) || 0;
        this.ai.nextCampaignId129 = Math.max(1, Number(data.ai.nextCampaignId129) || 1);
        this.ai.campaigns129 = Array.isArray(data.ai.campaigns129)
          ? data.ai.campaigns129.map((campaign) => ({
              ...campaign,
              squadIds: Array.isArray(campaign.squadIds) ? [...campaign.squadIds] : [],
              elements: Array.isArray(campaign.elements) ? campaign.elements.map((element) => ({ ...element })) : [],
            }))
          : [];
        const savedSquads = new Map((data.ai.campaignSquads129 || []).map((squad) => [squad.id, squad]));
        for (const squad of this.ai.squads) {
          const saved = savedSquads.get(squad.id);
          if (!saved) continue;
          squad.campaignId129 = saved.campaignId129;
          squad.element129 = saved.element129;
          squad.operationalAxis129 = Number(saved.operationalAxis129) || 0;
          squad.launchedAt129 = Number(saved.launchedAt129) || undefined;
          squad.stallCount129 = Number(saved.stallCount129) || 0;
        }
      }
      return result;
    };
  }

  void 0;
  const eyebrow = document.querySelector('#start-screen .eyebrow');
  if (eyebrow) void 0;
  const lead = document.querySelector('#start-screen .lead');
  if (lead) void 0;

  window.__FD_CAMPAIGN_OFFENSIVE_AI__ = {
    version: VERSION,
    config: CONFIG,
    campaigns: () => debug.game?.ai?.campaigns129?.map((campaign) => ({
      id: campaign.id,
      phase: campaign.phase,
      purpose: campaign.purpose,
      primaryTargetId: campaign.primaryTargetId,
      elements: campaign.elements.map((element) => ({ ...element })),
    })) || [],
    pressure: () => debug.game?.ai?.offensivePressure129?.() || { total: 0, committed: 0, available: 0, ratio: 0, activeSquads: 0 },
  };
})();
