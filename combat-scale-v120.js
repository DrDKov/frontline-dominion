(() => {
  'use strict';

  const debug = window.__FD_DEBUG__;
  const GameClass = debug?.Game;
  const UnitClass = debug?.Unit;
  const BuildingClass = debug?.Building;
  const ProjectileClass = debug?.Projectile;
  if (!GameClass || !ProjectileClass) return;

  const VERSION = '12.5';
  const TRACK_HZ = 5;
  // Cossacks-style tactical cadence: formations share a target picture at
  // 5 Hz while weapon cooldowns, movement interpolation and visuals remain
  // continuous. This removes redundant decision work without delaying shots.
  const TARGET_HZ = 5;
  const INTERCEPT_STEP = 0.10;
  const TARGET_CELL = 280;
  const MASS_TARGET_THRESHOLD = 3000;
  const MASS_TARGET_CANDIDATES = 48;
  const TRAIL_BANDS = 3;
  const clamp120 = (value, min, max) => Math.max(min, Math.min(max, value));
  const now120 = () => performance.now();
  const classBits120 = Object.freeze({ drone: 1, low: 2, medium: 4, high: 8, hypersonic: 16 });
  const guidedTrajectories120 = new Set(['homing', 'cruise', 'swarm', 'aeroballistic', 'loitering', 'hypersonic']);
  const interceptableProfiles120 = new Set([
    'rocket', 'guidedMissile', 'lowObservableMissile', 'cruiseMissile', 'swarmMissile',
    'strategicBallistic', 'aeroBallistic', 'strategicCruise', 'loiteringDrone', 'hypersonicWeapon',
  ]);
  const isNetworkSensor120 = (entity) => Boolean(entity?.alive && (
    entity.stats?.radarRelay || entity.stats?.interceptPower > 0 || entity.stats?.softKillPower > 0 ||
    entity.stats?.weapon?.targets?.includes('air') || entity.typeId === 'awacs'
  ));
  const isPoweredNetworkEntity120 = (game, entity) => {
    if (entity?.kind !== 'building') return Boolean(entity?.alive);
    if (!entity.alive || !entity.completed || entity.sabotagedUntil > game.time) return false;
    if (typeof game.isStationaryDefensePowered === 'function') return game.isStationaryDefensePowered(entity);
    const team = game.teams?.[entity.team];
    return Boolean(team?.powerProduced > 0 && team?.powerFactor >= .60);
  };

  const hash120 = (value) => {
    let hash = 2166136261;
    const text = String(value || '0');
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  };

  const metricsSnapshot120 = (game) => {
    const state = game?._combatScale120;
    if (!state) return null;
    return {
      trackEvaluations: state.metrics.trackEvaluations,
      trackCacheHits: state.metrics.trackCacheHits,
      targetCellBuilds: state.metrics.targetCellBuilds,
      targetCellHits: state.metrics.targetCellHits,
      targetCandidateChecks: state.metrics.targetCandidateChecks,
      targetCandidatesCulled: state.metrics.targetCandidatesCulled,
      interceptorCandidateChecks: state.metrics.interceptorCandidateChecks,
      interceptorShots: state.metrics.interceptorShots,
      interceptorReservations: state.metrics.interceptorReservations,
      projectileSteps: state.metrics.projectileSteps,
      analyticProjectileSteps: state.metrics.analyticProjectileSteps,
      virtualDirectShots: state.metrics.virtualDirectShots,
      trailPoints: state.metrics.trailPoints,
      effectsMerged: state.metrics.effectsMerged,
      effectsSuppressed: state.metrics.effectsSuppressed,
      audioVoicesMerged: state.metrics.audioVoicesMerged,
      airTrackMs: state.metrics.airTrackMs,
      targetAcquireMs: state.metrics.targetAcquireMs,
      interceptionMs: state.metrics.interceptionMs,
    };
  };

  function ensureCombatScale120(game) {
    if (game._combatScale120) return game._combatScale120;
    const state = {
      targetTick: -1,
      targetCells: new Map(),
      targetReservations: new Map(),
      defenders: [],
      defendersRefreshAt: -Infinity,
      defenderCursor: 0,
      interceptionReservations: new Map(),
      projectileJammingTick: -1,
      projectileJammingCells: new Map(),
      effectWindow: -1,
      effectCells: new Map(),
      interceptTextWindow: -1,
      interceptTextCells: new Map(),
      lastExplosionVoiceAt: -Infinity,
      virtualTracers: {
        capacity: 2048,
        head: 0,
        count: 0,
        x1: new Float32Array(2048),
        y1: new Float32Array(2048),
        z1: new Float32Array(2048),
        x2: new Float32Array(2048),
        y2: new Float32Array(2048),
        z2: new Float32Array(2048),
        expires: new Float64Array(2048),
        team: new Uint8Array(2048),
        size: new Uint8Array(2048),
      },
      metrics: {
        trackEvaluations: 0,
        trackCacheHits: 0,
        targetCellBuilds: 0,
        targetCellHits: 0,
        targetCandidateChecks: 0,
        targetCandidatesCulled: 0,
        interceptorCandidateChecks: 0,
        interceptorShots: 0,
        interceptorReservations: 0,
        projectileSteps: 0,
        analyticProjectileSteps: 0,
        virtualDirectShots: 0,
        trailPoints: 0,
        effectsMerged: 0,
        effectsSuppressed: 0,
        audioVoicesMerged: 0,
        airTrackMs: 0,
        targetAcquireMs: 0,
        interceptionMs: 0,
        projectileJammingEvaluations: 0,
        projectileJammingCacheHits: 0,
      },
    };
    game._combatScale120 = state;

    const sound = game.sound;
    if (sound && !sound._combatScale120) {
      sound._combatScale120 = true;
      const baseExplosion = sound.explosion?.bind(sound);
      if (baseExplosion) {
        sound.explosion = (large = false) => {
          const current = now120();
          const minimumGap = large ? 46 : 72;
          if (current - state.lastExplosionVoiceAt < minimumGap) {
            state.metrics.audioVoicesMerged += 1;
            return;
          }
          state.lastExplosionVoiceAt = current;
          return baseExplosion(large);
        };
      }
    }

    const perf = game.perf;
    if (perf && !perf._combatScale120) {
      perf._combatScale120 = true;
      const baseSummary = perf.summary?.bind(perf);
      if (baseSummary) perf.summary = () => ({ ...baseSummary(), combatScale: metricsSnapshot120(game) });
      const baseOverlay = perf.renderOverlay?.bind(perf);
      if (baseOverlay) {
        perf.renderOverlay = () => {
          baseOverlay();
          if (!perf.overlay) return;
          const m = state.metrics;
          perf.overlay.textContent += `\nCOMBAT SCALE v${VERSION}\n` +
            `tracks ${m.trackEvaluations} · cache ${m.trackCacheHits}\n` +
            `target cells ${m.targetCellBuilds} · reuse ${m.targetCellHits}\n` +
            `target checks ${m.targetCandidateChecks} · intercept checks ${m.interceptorCandidateChecks}\n` +
            `projectiles ${m.projectileSteps} · direct batches ${m.virtualDirectShots}\n` +
            `effects merged ${m.effectsMerged} · dropped ${m.effectsSuppressed}`;
        };
      }
    }
    return state;
  }

  // A salvo crossing the same electronic-warfare cell sees one shared field
  // solution for a 5 Hz sensor tick. The original routine performs two broad
  // spatial queries per missile; repeating those hundreds of times produced a
  // large main-thread spike without creating meaningfully different tracks.
  const baseProjectileJamming120 = GameClass.prototype.getProjectileJamming;
  if (baseProjectileJamming120) {
    GameClass.prototype.getProjectileJamming = function(projectile) {
      if (!projectile?.alive || projectile.interceptability <= 0) return 0;
      const alive = this._v94AliveUnits || this.units?.length || 0;
      if (alive < MASS_TARGET_THRESHOLD || (this.projectiles?.length || 0) < 128) {
        return baseProjectileJamming120.call(this, projectile);
      }
      const combat = ensureCombatScale120(this);
      const extreme = alive >= 16000;
      const tick = Math.floor((this.time || 0) * (extreme ? 1 : TRACK_HZ));
      if (combat.projectileJammingTick !== tick) {
        combat.projectileJammingTick = tick;
        combat.projectileJammingCells.clear();
      }
      const cellSize = extreme ? 512 : 256;
      const cellX = Math.floor(projectile.x / cellSize);
      const cellY = Math.floor(projectile.y / cellSize);
      const teamCode = projectile.team === 'player' ? 1 : projectile.team === 'enemy' ? 2 : 3;
      const key = teamCode * 16777216 + (cellY + 2048) * 4096 + cellX + 2048;
      if (combat.projectileJammingCells.has(key)) {
        combat.metrics.projectileJammingCacheHits += 1;
        return combat.projectileJammingCells.get(key);
      }
      const strength = baseProjectileJamming120.call(this, projectile);
      combat.projectileJammingCells.set(key, strength);
      combat.metrics.projectileJammingEvaluations += 1;
      return strength;
    };
  }

  // The integrated air picture is authoritative for one 5 Hz network tick. A
  // target is evaluated against all sensors once, then every battery reads the
  // same cached track instead of repeating sensors × threats × defenders work.
  const baseAirState120 = GameClass.prototype.getIntegratedAirDefenseState119;
  const baseTrackQuality120 = GameClass.prototype.getIntegratedTrackQuality119;
  if (baseAirState120 && baseTrackQuality120) {
    GameClass.prototype.getIntegratedAirDefenseState119 = function(teamKey, force = false) {
      const alive = this._v94AliveUnits || this.units?.length || 0;
      if (alive >= MASS_TARGET_THRESHOLD && this._v94NetworkSensors) {
        const tick = Math.floor((Number(this.time) || 0) * TRACK_HZ);
        this._integratedAirDefense119 ||= Object.create(null);
        let state = this._integratedAirDefense119[teamKey];
        if (!force && state?.tick === tick) return state;
        if (!state?._combatScale120) {
          state = {
            _combatScale120: true,
            tick,
            online: false,
            radarNodes: [],
            sensors: [],
            reason: 'no-radar',
            trackCache120: new Map(),
          };
        } else {
          state.radarNodes.length = 0;
          state.sensors.length = 0;
          state.trackCache120.clear();
        }
        for (const building of this.buildings) {
          if (building?.alive && building.team === teamKey && building.typeId === 'radar' && isPoweredNetworkEntity120(this, building)) {
            state.radarNodes.push(building);
          }
        }
        state.tick = tick;
        state.online = state.radarNodes.length > 0;
        if (state.online) {
          for (const sensor of this._v94NetworkSensors) {
            if (sensor?.team === teamKey && isNetworkSensor120(sensor) && isPoweredNetworkEntity120(this, sensor)) state.sensors.push(sensor);
          }
          for (const building of this.buildings) {
            if (building?.team === teamKey && isNetworkSensor120(building) && isPoweredNetworkEntity120(this, building)) state.sensors.push(building);
          }
        }
        const team = this.teams?.[teamKey];
        state.reason = state.online ? 'online' : team?.powerProduced > 0 && team?.powerFactor >= .60 ? 'no-radar' : 'no-power';
        this._integratedAirDefense119[teamKey] = state;
        return state;
      }
      const state = baseAirState120.call(this, teamKey, force);
      if (!state) return state;
      state.trackCache120 ||= new Map();
      return state;
    };

    GameClass.prototype.getIntegratedTrackQuality119 = function(teamKey, x, y, target = null) {
      const combat = ensureCombatScale120(this);
      const state = this.getIntegratedAirDefenseState119(teamKey);
      if (!state?.online) return 0;
      const targetKey = target?.id
        ? target
        : `cell:${Math.floor(x / 96)}:${Math.floor(y / 96)}:${target?.cloaked ? 1 : 0}`;
      if (state.trackCache120.has(targetKey)) {
        combat.metrics.trackCacheHits += 1;
        return state.trackCache120.get(targetKey);
      }
      const started = this.perf?.wantsTiming?.() ? now120() : 0;
      const quality = baseTrackQuality120.call(this, teamKey, x, y, target);
      state.trackCache120.set(targetKey, quality);
      combat.metrics.trackEvaluations += 1;
      if (started) {
        const elapsed = now120() - started;
        combat.metrics.airTrackMs += elapsed;
        this.perf?.add?.('airTrack', elapsed);
      }
      return quality;
    };
  }

  // Nearby units share a spatial candidate list. Individual visibility,
  // weapon layers and exact distance remain per observer, so gameplay stays
  // precise while large formations stop issuing identical spatial queries.
  const baseFindNearestEnemy120 = GameClass.prototype.findNearestEnemy;
  GameClass.prototype.findNearestEnemy = function(x, y, team, radius, targetLayers = ['ground'], observer = null) {
    if (!observer || !this.spatial?.queryRadius || !Number.isFinite(radius) || radius <= 0) {
      return baseFindNearestEnemy120.call(this, x, y, team, radius, targetLayers, observer);
    }
    const combat = ensureCombatScale120(this);
    const started = this.perf?.wantsTiming?.() ? now120() : 0;
    const current = Number(this.time) || 0;
    const cached = observer._targetCache120;
    if (cached && current < cached.until && cached.radius >= radius * .92 && cached.team === team) {
      const entity = this.getEntity?.(cached.id);
      if (entity?.alive && entity.team !== team && this.isTargetableBy(entity, team, observer)) {
        combat.metrics.targetCellHits += 1;
        if (started) {
          const elapsed = now120() - started;
          combat.metrics.targetAcquireMs += elapsed;
          this.perf?.add?.('targetAcquire', elapsed);
        }
        return entity;
      }
    }

    const tick = Math.floor(current * TARGET_HZ);
    if (combat.targetTick !== tick) {
      combat.targetTick = tick;
      combat.targetCells.clear();
      combat.targetReservations.clear();
    }
    const cellX = Math.floor(x / TARGET_CELL);
    const cellY = Math.floor(y / TARGET_CELL);
    const radiusBucket = Math.max(TARGET_CELL, Math.ceil(radius / TARGET_CELL) * TARGET_CELL);
    const wantsGround = targetLayers.includes('ground');
    const wantsAir = targetLayers.includes('air');
    const teamCode = team === 'player' ? 1 : team === 'enemy' ? 2 : 3;
    const layerCode = (wantsGround ? 1 : 0) | (wantsAir ? 2 : 0);
    const radiusCode = Math.min(127, Math.round(radiusBucket / TARGET_CELL));
    const key = (((teamCode * 4 + layerCode) * 128 + radiusCode) * 256 + cellY + 64) * 256 + cellX + 64;
    let candidates = combat.targetCells.get(key);
    if (!candidates) {
      const centerX = (cellX + .5) * TARGET_CELL;
      const centerY = (cellY + .5) * TARGET_CELL;
      const queryRadius = radiusBucket + TARGET_CELL * .78 + 220;
      const units = this.spatial.queryRadius('units', centerX, centerY, queryRadius) || [];
      const buildings = wantsGround ? (this.spatial.queryRadius('buildings', centerX, centerY, queryRadius) || []) : [];
      const massMode = (this._v94AliveUnits || this.units?.length || 0) >= MASS_TARGET_THRESHOLD;
      if (!massMode) candidates = [...units, ...buildings];
      else {
        // A packed 10k-v-10k front can place thousands of entities inside one
        // weapon query.  Nearby shooters share a deterministic representative
        // set instead of each scanning that full list.  Exact range, layer,
        // visibility and overkill checks below are still applied per shooter.
        candidates = [];
        const unitBudget = MASS_TARGET_CANDIDATES;
        const unitStride = Math.max(1, Math.ceil(units.length / unitBudget));
        const unitOffset = units.length ? hash120(key) % unitStride : 0;
        for (let index = unitOffset; index < units.length && candidates.length < unitBudget; index += unitStride) candidates.push(units[index]);
        const buildingBudget = 12;
        const buildingStride = Math.max(1, Math.ceil(buildings.length / buildingBudget));
        const buildingOffset = buildings.length ? ((hash120(key) ^ 0x9e3779b9) >>> 0) % buildingStride : 0;
        for (let index = buildingOffset; index < buildings.length && candidates.length < unitBudget + buildingBudget; index += buildingStride) candidates.push(buildings[index]);
        combat.metrics.targetCandidatesCulled += Math.max(0, units.length + buildings.length - candidates.length);
      }
      combat.targetCells.set(key, candidates);
      combat.metrics.targetCellBuilds += 1;
    } else {
      combat.metrics.targetCellHits += 1;
    }

    let best = null;
    let bestScore = radius * radius;
    const weaponDamage = Math.max(1, Number(observer.stats?.weapon?.damage) || 1);
    for (const entity of candidates) {
      combat.metrics.targetCandidateChecks += 1;
      if (!entity?.alive || entity.team === team || entity.team === 'neutral' || (!entity.completed && entity.kind === 'building')) continue;
      const layer = entity.air ? 'air' : 'ground';
      if ((layer === 'air' && !wantsAir) || (layer === 'ground' && !wantsGround)) continue;
      const dx = entity.x - x;
      const dy = entity.y - y;
      const distanceSquared = dx * dx + dy * dy;
      if (distanceSquared > radius * radius) continue;
      if (!this.isTargetableBy(entity, team, observer)) continue;
      const reserved = combat.targetReservations.get(entity.id) || 0;
      const health = Math.max(1, Number(entity.hp) || Number(entity.maxHp) || 1);
      const overkill = reserved / health;
      const score = distanceSquared * (1 + Math.min(2.4, overkill) * .34);
      if (score < bestScore) {
        best = entity;
        bestScore = score;
      }
    }
    if (best) combat.targetReservations.set(best.id, (combat.targetReservations.get(best.id) || 0) + weaponDamage);
    const targetCache120 = observer._targetCache120 || (observer._targetCache120 = {});
    targetCache120.id = best?.id || null;
    targetCache120.until = current + .18 + (hash120(observer.id) % 37) / 1000;
    targetCache120.radius = radius;
    targetCache120.team = team;
    if (started) {
      const elapsed = now120() - started;
      combat.metrics.targetAcquireMs += elapsed;
      this.perf?.add?.('targetAcquire', elapsed);
    }
    return best;
  };

  const defenderClassMask120 = (defender) => {
    const classes = defender.stats?.interceptClasses || ['low', 'medium'];
    const signature = classes.join('|');
    if (defender._classSignature120 === signature) return defender._classMask120;
    defender._classSignature120 = signature;
    defender._classMask120 = classes.reduce((mask, name) => mask | (classBits120[name] || 0), 0);
    return defender._classMask120;
  };

  const validDefender120 = (game, defender) => {
    if (!defender?.alive || defender.team === 'neutral' || (defender.interceptCooldown || 0) > 0) return false;
    if (!defender.stats?.interceptPower && !defender.stats?.softKillPower) return false;
    if (defender.kind === 'building') {
      if (!defender.completed || defender.sabotagedUntil > game.time) return false;
      if (typeof game.isStationaryDefensePowered === 'function') {
        if (!game.isStationaryDefensePowered(defender)) return false;
      } else {
        const team = game.teams?.[defender.team];
        if (!team?.powerProduced || team.powerProduced + .001 < (team.powerUsed || 0)) return false;
      }
    }
    return defender.team === 'player' || defender.team === 'enemy';
  };

  const validInterceptTarget120 = (projectile) => {
    if (!projectile?.canBeIntercepted?.()) return false;
    // Ordinary bullets, tank rounds, artillery shells, bombs and energy bolts
    // never enter the air-defense allocator. Only actual missiles and the
    // simulated loitering-drone projectile class can consume an interceptor.
    if (projectile.profile) return interceptableProfiles120.has(projectile.profile);
    return guidedTrajectories120.has(projectile.trajectory) || projectile.defenseClass === 'drone';
  };

  // One fire-control pass allocates engagements for the whole team. Threat
  // reservations stop batteries from launching redundant interceptors at a
  // missile that already has enough expected defensive damage assigned.
  const baseInterception120 = GameClass.prototype.updateProjectileInterception;
  GameClass.prototype.updateProjectileInterception = function(dt) {
    if (!this.spatial?.queryRadius) return baseInterception120.call(this, dt);
    const combat = ensureCombatScale120(this);
    this.interceptionTimer = (this.interceptionTimer || 0) - dt;
    if (this.interceptionTimer > 0) return;
    this.interceptionTimer = INTERCEPT_STEP;
    const started = this.perf?.wantsTiming?.() ? now120() : 0;

    if (this.time >= combat.defendersRefreshAt) {
      combat.defenders.length = 0;
      const unitDefenders = this._v94Interceptors || this.units;
      for (const defender of unitDefenders) {
        if (defender?.alive && (defender.stats?.interceptPower || defender.stats?.softKillPower)) combat.defenders.push(defender);
      }
      for (const building of this.buildings) {
        if (building?.alive && (building.stats?.interceptPower || building.stats?.softKillPower)) combat.defenders.push(building);
      }
      combat.defendersRefreshAt = this.time + .75;
    }

    const reservations = combat.interceptionReservations;
    reservations.clear();
    const defenderCount = combat.defenders.length;
    const startIndex = defenderCount ? combat.defenderCursor++ % defenderCount : 0;
    // Central fire control rotates a bounded battery slice through a saturated
    // missile picture. With hundreds of launchers this matches their reload
    // cadence and prevents one 10 Hz pass from issuing hundreds of spatial
    // queries on the same threats.
    const aliveUnits = this._v94AliveUnits || this.units?.length || 0;
    const defenderBudget = aliveUnits >= MASS_TARGET_THRESHOLD ? Math.min(defenderCount, 64) : defenderCount;
    for (let offset = 0; offset < defenderBudget; offset += 1) {
      const defender = combat.defenders[(startIndex + offset) % defenderCount];
      if (!validDefender120(this, defender)) continue;
      const range = Math.max(1, Number(defender.stats.interceptRange) || 500);
      const rangeSquared = range * range;
      const allowedMask = defenderClassMask120(defender);
      const softKill = defender.stats.softKillPower > 0 && !defender.stats.interceptPower;
      const nearby = this.spatial.queryRadius('projectiles', defender.x, defender.y, range + 64) || [];
      if (this.perf) this.perf.spatialQueries += 1;
      let best = null;
      let bestTrack = 0;
      let bestScore = -Infinity;
      for (const projectile of nearby) {
        combat.metrics.interceptorCandidateChecks += 1;
        if (!projectile?.alive || projectile.team === defender.team || !validInterceptTarget120(projectile)) continue;
        if (!(allowedMask & (classBits120[projectile.defenseClass || 'low'] || 0))) continue;
        const dx = projectile.x - defender.x;
        const dy = projectile.y - defender.y;
        if (dx * dx + dy * dy > rangeSquared) continue;
        const trackQuality = this.getDefenderTrackingQuality(defender, projectile);
        if (trackQuality <= .02) continue;
        const reserved = reservations.get(projectile.id) || 0;
        const remaining = Math.max(1, Number(projectile.hp) || Number(projectile.maxHp) || 1);
        if (!softKill && reserved >= remaining * .92) {
          combat.metrics.interceptorReservations += 1;
          continue;
        }
        if (softKill && (projectile.guidanceLost || projectile.jammed >= .88)) continue;
        const threat = this.projectileThreatScore(projectile, defender);
        const reservationPenalty = softKill ? projectile.jammed * 120 : reserved / remaining * 210;
        const score = threat - reservationPenalty;
        if (score > bestScore) {
          best = projectile;
          bestTrack = trackQuality;
          bestScore = score;
        }
      }
      if (!best) continue;

      const powerFactor = defender.kind === 'building' ? (this.teams?.[defender.team]?.powerFactor || 0) : 1;
      const quality = Number(defender.stats.interceptQuality) || .45;
      const tracking = quality * bestTrack * best.signature * best.interceptability / Math.max(.35, best.evasion);
      // The munition belongs to the launcher, so the launcher defines the
      // complete price. A costly ABM round costs the same against a drone or
      // a ballistic missile; target class changes eligibility and probability,
      // never the invoice.
      const shotCost = Math.max(1, Math.round(Number(defender.stats.interceptorCost) || (softKill ? 8 : 30)));
      const teamState = this.teams?.[defender.team];
      if (!teamState || teamState.credits < shotCost) continue;

      let origin = {
        x: defender.x,
        y: defender.y,
        z: defender.kind === 'building' ? defender.radius * .72 : (defender.air ? 18 : 5),
      };
      if (defender.kind === 'building' && !softKill) {
        const heading = Math.atan2(best.y - defender.y, best.x - defender.x);
        const previous = Number.isFinite(defender.weaponRotation) ? defender.weaponRotation : heading;
        const delta = Math.atan2(Math.sin(heading - previous), Math.cos(heading - previous));
        defender.weaponRotation = previous + delta * clamp120(INTERCEPT_STEP * (defender.stats.turretTurnRate || 5), 0, 1);
        origin = this.getBuildingWeaponMuzzle(defender, defender.weaponRotation, defender.shotSequence || 0);
      }

      teamState.credits -= shotCost;
      if (defender.team === 'player') this.stats.interceptionSpend = (this.stats.interceptionSpend || 0) + shotCost;
      this.stats.interceptionSpendBySystem ||= Object.create(null);
      this.stats.interceptionSpendBySystem[defender.typeId || 'unknown'] =
        (this.stats.interceptionSpendBySystem[defender.typeId || 'unknown'] || 0) + shotCost;
      defender.interceptCooldown = (defender.stats.interceptReload || .7) / Math.max(.35, powerFactor);
      this.addEffect({
        type: softKill ? 'jamBeam' : 'interceptBeam',
        x: origin.x, y: origin.y, z: origin.z || 0,
        x2: best.x, y2: best.y, z2: best.altitude,
        color: defender.team === 'player' ? '#6df1d1' : '#ff8c78',
        duration: .14,
      });
      if (!softKill && defender.kind === 'building') {
        this.addEffect({ type: 'muzzle', x: origin.x, y: origin.y, z: origin.z || 0, duration: .10, rotation: defender.weaponRotation || defender.rotation || 0 });
        defender.recoil = 1;
        defender.shotSequence = ((defender.shotSequence || 0) + 1) % 32;
      }

      combat.metrics.interceptorShots += 1;
      if (softKill) {
        reservations.set(best.id, (reservations.get(best.id) || 0) + (defender.stats.softKillPower || .25) * 24);
        best.takeInterceptDamage((defender.stats.softKillPower || .25) * 46, defender, true);
        continue;
      }

      const speedPenalty = clamp120(best.speed / 2200, 0, .28);
      const hitChance = clamp120(.14 + tracking * .86 - speedPenalty + (this.rng.next() - .5) * .08, .06, .96);
      const damage = (defender.stats.interceptPower || 20) * (.84 + this.rng.next() * .34) * powerFactor;
      reservations.set(best.id, (reservations.get(best.id) || 0) + damage * (.55 + hitChance * .45));
      if (this.rng.next() <= hitChance) {
        best.takeInterceptDamage(damage, defender, false);
      } else {
        this.addEffect({
          type: 'interceptMiss',
          x: best.x + (this.rng.next() - .5) * 34,
          y: best.y + (this.rng.next() - .5) * 34,
          z: best.altitude,
          radius: 12,
          duration: .32,
        });
      }
    }

    if (started) {
      const elapsed = now120() - started;
      combat.metrics.interceptionMs += elapsed;
      this.perf?.add?.('interception', elapsed);
    }
  };

  function resetTrail120(projectile) {
    if (projectile._trailRing120) {
      projectile._trailRing120.head = 0;
      projectile._trailRing120.count = 0;
    }
    projectile._analytic120 = null;
    if (projectile.trail) projectile.trail.length = 0;
  }

  function recordTrail120(projectile, x, y, altitude) {
    const requested = clamp120(Math.ceil((projectile.trailLength || 0) / 3), 5, 30);
    let ring = projectile._trailRing120;
    if (!ring || ring.capacity !== requested) {
      ring = projectile._trailRing120 = {
        capacity: requested,
        head: 0,
        count: 0,
        x: new Float32Array(requested),
        y: new Float32Array(requested),
        z: new Float32Array(requested),
      };
    }
    const index = ring.head;
    ring.x[index] = x;
    ring.y[index] = y;
    ring.z[index] = altitude || 0;
    ring.head = (index + 1) % ring.capacity;
    ring.count = Math.min(ring.capacity, ring.count + 1);
  }

  const baseResetProjectile120 = ProjectileClass.prototype.resetV9;
  if (baseResetProjectile120) {
    ProjectileClass.prototype.resetV9 = function(game, data) {
      const result = baseResetProjectile120.call(this, game, data);
      resetTrail120(this);
      return result;
    };
  }

  const baseProjectileUpdate120 = ProjectileClass.prototype.update;
  ProjectileClass.prototype.update = function(dt) {
    if (!this.alive) return;
    const combat = ensureCombatScale120(this.game);
    combat.metrics.projectileSteps += 1;
    const previousX = this.x;
    const previousY = this.y;
    const previousAltitude = this.altitude || 0;
    const desiredTrailLength = this.trailLength || 0;
    const analytic = this.interceptability <= .001 && !this.ballistic && !guidedTrajectories120.has(this.trajectory);

    if (analytic) {
      combat.metrics.analyticProjectileSteps += 1;
      this.age += dt;
      this.ttl -= dt;
      if (this.ttl <= 0) {
        this.alive = false;
        return;
      }
      const target = this.game.getEntity(this.targetId);
      const dx = this.targetX - this.x;
      const dy = this.targetY - this.y;
      const distance = Math.hypot(dx, dy) || 1;
      const step = this.speed * dt;
      if (distance <= step + Math.max(6, this.visualSize)) {
        this.x = this.targetX;
        this.y = this.targetY;
        this.distanceTravelled += distance;
        this.updateAltitude();
        const validPrimary = target?.alive && Math.hypot(target.x - this.x, target.y - this.y) <= target.radius + Math.max(12, this.splash * .18);
        this.hit(validPrimary ? target : null);
      } else {
        const inverse = 1 / distance;
        this.x += dx * inverse * step;
        this.y += dy * inverse * step;
        this.angle = Math.atan2(dy, dx);
        this.distanceTravelled += step;
        this.updateAltitude();
      }
    } else {
      // The gameplay update no longer maintains an allocation-heavy array of
      // point objects. The renderer consumes the typed ring below directly.
      this.trailLength = 0;
      try {
        baseProjectileUpdate120.call(this, dt);
      } finally {
        this.trailLength = desiredTrailLength;
      }
    }

    if (desiredTrailLength > 0 && (this.x !== previousX || this.y !== previousY)) {
      recordTrail120(this, previousX, previousY, previousAltitude);
      combat.metrics.trailPoints += 1;
    }
  };

  // Classic mass-RTS rule: bullets and fast direct cannon rounds are resolved
  // as logical shots, not as independently simulated entities.  Missiles,
  // bombs, artillery and every interceptable munition retain full physics.
  const virtualDirectProjectile120 = (projectile) => {
    if (!projectile || projectile.interceptability > .001 || projectile.ballistic) return false;
    if (guidedTrajectories120.has(projectile.trajectory)) return false;
    if (!['straight', 'direct', 'beam', 'plasma'].includes(projectile.trajectory)) return false;
    return projectile.speed >= 650 && projectile.splash <= 48;
  };

  const recordVirtualTracer120 = (game, projectile) => {
    const combat = ensureCombatScale120(game);
    const ring = combat.virtualTracers;
    const index = ring.head;
    ring.x1[index] = projectile.startX;
    ring.y1[index] = projectile.startY;
    ring.z1[index] = projectile.launchAltitude || 0;
    ring.x2[index] = projectile.targetX;
    ring.y2[index] = projectile.targetY;
    ring.z2[index] = Number.isFinite(projectile.targetAltitude) ? projectile.targetAltitude : 0;
    ring.expires[index] = (Number(game.time) || 0) + .13;
    ring.team[index] = projectile.team === 'player' ? 1 : 2;
    ring.size[index] = clamp120(Math.round(projectile.visualSize || 3), 1, 8);
    ring.head = (index + 1) % ring.capacity;
    ring.count = Math.min(ring.capacity, ring.count + 1);
    combat.metrics.virtualDirectShots += 1;
  };

  const resolveVirtualProjectiles120 = (game, firstIndex) => {
    const list = game.projectiles;
    for (let index = list.length - 1; index >= firstIndex; index -= 1) {
      const projectile = list[index];
      if (!virtualDirectProjectile120(projectile)) continue;
      list.splice(index, 1);
      recordVirtualTracer120(game, projectile);
      projectile.x = projectile.targetX;
      projectile.y = projectile.targetY;
      projectile.distanceTravelled = projectile.totalDistance;
      projectile.updateAltitude?.();
      const target = game.getEntity(projectile.targetId);
      const validPrimary = target?.alive && Math.hypot(target.x - projectile.x, target.y - projectile.y) <=
        target.radius + Math.max(12, projectile.splash * .18);
      projectile.hit(validPrimary ? target : null);
      game.spatial?.remove?.(projectile, 'projectiles');
      resetTrail120(projectile);
      if (game._v9ProjectilePool?.length < 4096) game._v9ProjectilePool.push(projectile);
    }
  };

  if (UnitClass?.prototype?.fire) {
    const baseUnitFire120 = UnitClass.prototype.fire;
    UnitClass.prototype.fire = function(target) {
      const firstIndex = this.game.projectiles.length;
      const result = baseUnitFire120.call(this, target);
      if (this.game.projectiles.length > firstIndex) resolveVirtualProjectiles120(this.game, firstIndex);
      return result;
    };
  }

  if (BuildingClass?.prototype?.fire) {
    const baseBuildingFire120 = BuildingClass.prototype.fire;
    BuildingClass.prototype.fire = function(target) {
      const firstIndex = this.game.projectiles.length;
      const result = baseBuildingFire120.call(this, target);
      if (this.game.projectiles.length > firstIndex) resolveVirtualProjectiles120(this.game, firstIndex);
      return result;
    };
  }

  const drawVirtualTracers120 = (game) => {
    const ring = ensureCombatScale120(game).virtualTracers;
    if (!ring.count) return;
    const now = Number(game.time) || 0;
    const batches = new Map();
    for (let logical = 0; logical < ring.count; logical += 1) {
      const index = (ring.head - ring.count + logical + ring.capacity) % ring.capacity;
      const remaining = ring.expires[index] - now;
      if (remaining <= 0) continue;
      const start = game.worldToScreen(ring.x1[index], ring.y1[index], ring.z1[index]);
      const end = game.worldToScreen(ring.x2[index], ring.y2[index], ring.z2[index]);
      const band = remaining > .075 ? 1 : 0;
      const key = `${ring.team[index]}:${band}:${ring.size[index]}`;
      let batch = batches.get(key);
      if (!batch) {
        batch = { team: ring.team[index], band, size: ring.size[index], path: typeof Path2D !== 'undefined' ? new Path2D() : [] };
        batches.set(key, batch);
      }
      if (Array.isArray(batch.path)) batch.path.push(start.x, start.y, end.x, end.y);
      else {
        batch.path.moveTo(start.x, start.y);
        batch.path.lineTo(end.x, end.y);
      }
    }
    context120.save();
    context120.globalCompositeOperation = 'lighter';
    context120.lineCap = 'round';
    for (const batch of batches.values()) {
      context120.globalAlpha = batch.band ? .72 : .34;
      context120.strokeStyle = batch.team === 1 ? '#d8fff0' : '#ffd0ba';
      context120.lineWidth = Math.max(.8, batch.size * (game.camera.zoom || 1) * .34);
      if (Array.isArray(batch.path)) {
        context120.beginPath();
        for (let index = 0; index < batch.path.length; index += 4) {
          context120.moveTo(batch.path[index], batch.path[index + 1]);
          context120.lineTo(batch.path[index + 2], batch.path[index + 3]);
        }
        context120.stroke();
      } else context120.stroke(batch.path);
    }
    context120.restore();
  };

  const canvas120 = document.getElementById('game-canvas');
  const context120 = canvas120?.getContext?.('2d');
  const baseDrawProjectiles120 = GameClass.prototype.drawProjectiles3D;
  if (context120 && baseDrawProjectiles120) {
    GameClass.prototype.drawProjectiles3D = function() {
      const list = this.renderSnapshot?.projectiles || this.projectiles;
      const batches = new Map();
      for (const projectile of list) {
        const ring = projectile?._trailRing120;
        if (!projectile?.alive || !ring?.count || !this.isOnScreen(projectile.x, projectile.y, 240)) continue;
        const count = ring.count;
        let previousScreen = null;
        for (let logical = 0; logical < count; logical += 1) {
          const index = (ring.head - count + logical + ring.capacity) % ring.capacity;
          const screen = this.worldToScreen(ring.x[index], ring.y[index], ring.z[index]);
          if (previousScreen) {
            const life = logical / Math.max(1, count - 1);
            const band = Math.min(TRAIL_BANDS - 1, Math.floor(life * TRAIL_BANDS));
            const width = Math.max(.7, (projectile.visualSize || 3) * this.camera.zoom * (.22 + life * .30));
            const widthBucket = Math.round(width * 2) / 2;
            const key = `${projectile.trailColor}|${band}|${widthBucket}`;
            let batch = batches.get(key);
            if (!batch) {
              batch = {
                color: projectile.trailColor,
                alpha: .12 + band * .22,
                width: widthBucket,
                path: typeof Path2D !== 'undefined' ? new Path2D() : [],
              };
              batches.set(key, batch);
            }
            if (Array.isArray(batch.path)) batch.path.push(previousScreen.x, previousScreen.y, screen.x, screen.y);
            else {
              batch.path.moveTo(previousScreen.x, previousScreen.y);
              batch.path.lineTo(screen.x, screen.y);
            }
          }
          previousScreen = screen;
        }
        if (previousScreen) {
          const current = this.worldToScreen(projectile.x, projectile.y, projectile.altitude || 0);
          const width = Math.max(1, (projectile.visualSize || 3) * this.camera.zoom * .48);
          const widthBucket = Math.round(width * 2) / 2;
          const key = `${projectile.trailColor}|${TRAIL_BANDS - 1}|${widthBucket}`;
          let batch = batches.get(key);
          if (!batch) {
            batch = {
              color: projectile.trailColor,
              alpha: .68,
              width: widthBucket,
              path: typeof Path2D !== 'undefined' ? new Path2D() : [],
            };
            batches.set(key, batch);
          }
          if (Array.isArray(batch.path)) batch.path.push(previousScreen.x, previousScreen.y, current.x, current.y);
          else {
            batch.path.moveTo(previousScreen.x, previousScreen.y);
            batch.path.lineTo(current.x, current.y);
          }
        }
      }

      context120.save();
      context120.lineCap = 'round';
      context120.lineJoin = 'round';
      for (const batch of batches.values()) {
        context120.globalAlpha = batch.alpha;
        context120.strokeStyle = batch.color || '#fff1ba';
        context120.lineWidth = batch.width;
        if (Array.isArray(batch.path)) {
          context120.beginPath();
          for (let index = 0; index < batch.path.length; index += 4) {
            context120.moveTo(batch.path[index], batch.path[index + 1]);
            context120.lineTo(batch.path[index + 2], batch.path[index + 3]);
          }
          context120.stroke();
        } else {
          context120.stroke(batch.path);
        }
      }
      context120.restore();

      let result;
      if (list.length < 36) {
        // Preserve the full individual missile body in small engagements.
        for (const projectile of list) {
          projectile._trailLengthBackup120 = projectile.trailLength;
          projectile.trailLength = 0;
          if (projectile.trail?.length) projectile.trail.length = 0;
        }
        try {
          result = baseDrawProjectiles120.call(this);
        } finally {
          for (const projectile of list) {
            projectile.trailLength = projectile._trailLengthBackup120 || 0;
            projectile._trailLengthBackup120 = undefined;
          }
        }
      } else {
        // In a saturated air-defense exchange the tiny body polygons are
        // visually indistinguishable but used several Canvas calls each.
        // Batch the same bright directional silhouettes by colour/size while
        // retaining every physical projectile and its full typed trail.
        const headBatches = new Map();
        const flamePath = typeof Path2D !== 'undefined' ? new Path2D() : null;
        for (const projectile of list) {
          if (!projectile?.alive || !this.isOnScreen(projectile.x, projectile.y, 220)) continue;
          const point = this.worldToScreen(projectile.x, projectile.y, projectile.altitude || 0);
          const ahead = this.worldToScreen(
            projectile.x + Math.cos(projectile.angle || 0) * 18,
            projectile.y + Math.sin(projectile.angle || 0) * 18,
            projectile.altitude || 0,
          );
          const dx = ahead.x - point.x;
          const dy = ahead.y - point.y;
          const inverse = 1 / (Math.hypot(dx, dy) || 1);
          const ux = dx * inverse;
          const uy = dy * inverse;
          const px = -uy;
          const py = ux;
          const size = Math.max(2, (projectile.visualSize || 3) * this.camera.zoom * .78);
          const sizeBand = Math.max(2, Math.round(size));
          const color = projectile.color || '#fff0b0';
          const key = `${color}:${sizeBand}`;
          let batch = headBatches.get(key);
          if (!batch) {
            batch = { color, path: typeof Path2D !== 'undefined' ? new Path2D() : [] };
            headBatches.set(key, batch);
          }
          const nose = [point.x + ux * size * 2.15, point.y + uy * size * 2.15];
          const left = [point.x - ux * size * 1.5 + px * size * .68, point.y - uy * size * 1.5 + py * size * .68];
          const right = [point.x - ux * size * 1.8 - px * size * .68, point.y - uy * size * 1.8 - py * size * .68];
          if (Array.isArray(batch.path)) batch.path.push(...nose, ...left, ...right);
          else {
            batch.path.moveTo(nose[0], nose[1]);
            batch.path.lineTo(left[0], left[1]);
            batch.path.lineTo(right[0], right[1]);
            batch.path.closePath();
          }
          if (flamePath) {
            flamePath.moveTo(point.x - ux * size * 1.3, point.y - uy * size * 1.3);
            flamePath.arc(point.x - ux * size * 1.55, point.y - uy * size * 1.55, size * .55, 0, Math.PI * 2);
          }
        }
        context120.save();
        context120.lineJoin = 'round';
        for (const batch of headBatches.values()) {
          context120.fillStyle = batch.color;
          context120.strokeStyle = 'rgba(255,255,255,.34)';
          context120.lineWidth = .8;
          if (Array.isArray(batch.path)) {
            context120.beginPath();
            for (let index = 0; index < batch.path.length; index += 6) {
              context120.moveTo(batch.path[index], batch.path[index + 1]);
              context120.lineTo(batch.path[index + 2], batch.path[index + 3]);
              context120.lineTo(batch.path[index + 4], batch.path[index + 5]);
              context120.closePath();
            }
            context120.fill();
            context120.stroke();
          } else {
            context120.fill(batch.path);
            context120.stroke(batch.path);
          }
        }
        if (flamePath) {
          context120.globalCompositeOperation = 'lighter';
          context120.globalAlpha = .52;
          context120.fillStyle = '#ffad58';
          context120.fill(flamePath);
        }
        context120.restore();
      }
      drawVirtualTracers120(this);
      return result;
    };
  }

  // Preserve a busy battle while bounding expensive Canvas effects. Repeated
  // events in one small screen region are represented by one stronger event;
  // intercept labels explicitly show their multiplicity.
  const baseAddEffect120 = GameClass.prototype.addEffect;
  GameClass.prototype.addEffect = function(effect) {
    const combat = ensureCombatScale120(this);
    const current = Number(this.time) || 0;
    if (effect?.type === 'text' && effect.text === 'ПЕРЕХВАТ') {
      const windowId = Math.floor(current / .24);
      if (combat.interceptTextWindow !== windowId) {
        combat.interceptTextWindow = windowId;
        combat.interceptTextCells.clear();
      }
      const colorCode = hash120(effect.color || '') & 15;
      const key = colorCode * 1048576 + (Math.floor((effect.y || 0) / 180) + 512) * 1024 + Math.floor((effect.x || 0) / 180) + 512;
      const existing = combat.interceptTextCells.get(key);
      if (existing && existing.age < existing.duration) {
        existing.multiplicity120 = (existing.multiplicity120 || 1) + 1;
        existing.text = `ПЕРЕХВАТ ×${existing.multiplicity120}`;
        existing.x = existing.x * .76 + (effect.x || 0) * .24;
        existing.y = existing.y * .76 + (effect.y || 0) * .24;
        existing.z = Math.max(existing.z || 0, effect.z || 0);
        existing.age = Math.min(existing.age, .16);
        combat.metrics.effectsMerged += 1;
        return existing;
      }
      const created = baseAddEffect120.call(this, effect);
      if (created) combat.interceptTextCells.set(key, created);
      return created;
    }

    if (['muzzle', 'interceptMiss', 'explosion'].includes(effect?.type)) {
      const windowId = Math.floor(current / .08);
      if (combat.effectWindow !== windowId) {
        combat.effectWindow = windowId;
        combat.effectCells.clear();
      }
      const cell = effect.type === 'explosion' ? 86 : 64;
      const typeCode = effect.type === 'explosion' ? 1 : effect.type === 'muzzle' ? 2 : 3;
      const key = typeCode * 1048576 + (Math.floor((effect.y || 0) / cell) + 512) * 1024 + Math.floor((effect.x || 0) / cell) + 512;
      const count = combat.effectCells.get(key) || 0;
      const allowance = effect.type === 'explosion' ? 5 : effect.type === 'muzzle' ? 4 : 3;
      if (count >= allowance) {
        combat.metrics.effectsSuppressed += 1;
        return undefined;
      }
      combat.effectCells.set(key, count + 1);
    }
    return baseAddEffect120.call(this, effect);
  };

  const massApi120 = window.__FD_MASS_SCALE__;
  if (massApi120?.metrics && !massApi120._combatScale120) {
    massApi120._combatScale120 = true;
    const baseMetrics = massApi120.metrics.bind(massApi120);
    massApi120.metrics = () => {
      const base = baseMetrics();
      return base ? { ...base, combatScale: metricsSnapshot120(debug.game) } : base;
    };
  }

  async function spawnCombatStress120(options = {}) {
    const game = debug.game;
    const UnitClass = debug.Unit;
    if (!game || !UnitClass) throw new Error('Сначала запустите матч');
    ensureCombatScale120(game);
    const perSide = clamp120(Math.floor(Number(options.perSide) || 90), 12, 10000);
    const requestedMissiles = options.missiles == null
      ? (perSide >= 1000 ? Math.ceil(perSide * .08) : 160)
      : Number(options.missiles);
    const missileCount = clamp120(Math.floor(requestedMissiles || 160), 20, 1200);
    const armedTypes = Object.entries(debug.UNIT_TYPES || {})
      .filter(([, stats]) => stats?.weapon && !stats.air && stats.speed > 0)
      .map(([typeId]) => typeId);
    const playerType = debug.UNIT_TYPES?.v_mbt ? 'v_mbt' : armedTypes[0];
    const enemyType = debug.UNIT_TYPES?.d_mbt ? 'd_mbt' : armedTypes[1] || armedTypes[0];
    if (!playerType || !enemyType) throw new Error('Нет наземных боевых типов для стресс-теста');
    const worldWidth = debug.WORLD?.width || 32000;
    const worldHeight = debug.WORLD?.height || 22000;
    const centerX = worldWidth * .5;
    const centerY = worldHeight * .5;
    const players = [];
    const enemies = [];
    const columns = Math.ceil(Math.sqrt(perSide));
    const spacing = clamp120(Math.min(worldWidth * .24 / columns, worldHeight * .68 / columns), 46, 76);
    const rows = Math.ceil(perSide / columns);
    const interceptorCount = Math.max(12, Math.floor(perSide * .015));
    const startedCreating = now120();
    const wasPaused = game.paused;
    game.paused = true;
    game._v94StressAdding = true;
    const makeSide = async (team, typeId, direction, output) => {
      for (let start = 0; start < perSide; start += 500) {
        const end = Math.min(perSide, start + 500);
        for (let index = start; index < end; index += 1) {
          const row = Math.floor(index / columns);
          const column = index % columns;
          const unit = new UnitClass(game, {
            typeId,
            team,
            x: clamp120(centerX + direction * (640 + column * spacing), 60, worldWidth - 60),
            y: clamp120(centerY + (row - (rows - 1) / 2) * spacing, 60, worldHeight - 60),
            rotation: direction < 0 ? 0 : Math.PI,
          });
          unit._combatStress120 = true;
          if (index < interceptorCount) {
            unit.stats = {
              ...unit.stats,
              interceptPower: 72,
              interceptRange: 760,
              interceptReload: .42,
              interceptQuality: .82,
              interceptorCost: 1,
              interceptClasses: ['drone', 'low', 'medium', 'high'],
            };
          }
          // The benchmark deliberately bypasses per-unit A*: all members of a
          // legion share the same attack axis, matching normal formation orders.
          unit.commandQueue = [{
            type: 'attackMove',
            x: centerX - direction * 520,
            y: centerY,
            legionStress120: true,
          }];
          game.addEntity(unit);
          output.push(unit);
        }
        // Yield to input/paint without depending on rAF. Background or cloud
        // tabs may throttle rAF to 1 Hz, which would make the benchmark itself
        // take forty seconds even though object creation is fast.
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    };
    try {
      await makeSide('player', playerType, -1, players);
      await makeSide('enemy', enemyType, 1, enemies);
    } finally {
      game._v94StressAdding = false;
      game.paused = wasPaused;
    }
    game.teams.player.credits = Math.max(game.teams.player.credits, 25000000);
    game.teams.enemy.credits = Math.max(game.teams.enemy.credits, 25000000);

    const weapon = {
      damage: 76,
      range: 2400,
      reload: .5,
      projectileSpeed: 780,
      targets: ['ground'],
      splash: 12,
      bonus: {},
      profile: 'guidedMissile',
      trajectory: 'homing',
      interceptability: .82,
      projectileHp: 42,
      projectileSignature: .92,
      projectileEvasion: 1,
      accuracy: .98,
      projectileColor: '#fff0b0',
      trailColor: '#ff8b45',
      visualSize: 4.4,
      trailLength: 72,
      turnRate: 3.2,
      defenseClass: 'medium',
    };
    for (let index = 0; index < missileCount; index += 1) {
      const fromPlayer = index % 2 === 0;
      const sources = fromPlayer ? players : enemies;
      const targets = fromPlayer ? enemies : players;
      const source = sources[index % sources.length];
      const target = targets[(index * 7) % targets.length];
      const projectile = game.acquireProjectileV9({
        sourceId: source.id,
        team: source.team,
        x: source.x,
        y: source.y,
        targetId: target.id,
        targetX: target.x,
        targetY: target.y,
        speed: weapon.projectileSpeed * (.92 + (index % 9) * .018),
        damage: weapon.damage,
        splash: weapon.splash,
        weapon,
        preserveAim: true,
      });
      game.projectiles.push(projectile);
      game.spatial?.update?.(projectile, 'projectiles');
    }
    game.rebuildSpatialIndexes?.();
    await new Promise((resolve) => requestAnimationFrame(resolve));
    game.centerCamera?.(centerX, centerY);
    if (game.camera) game.camera.zoom = Math.min(game.camera.zoom || 1, .34);
    return { units: players.length + enemies.length, missiles: missileCount, createMs: now120() - startedCreating };
  }

  window.__FD_COMBAT_SCALE__ = {
    version: VERSION,
    architecture: 'shared-target-cells + virtual-direct-fire + centralized-interception + typed-trails',
    metrics: () => metricsSnapshot120(debug.game),
    ensure: () => debug.game ? ensureCombatScale120(debug.game) : null,
    spawnStressBattle: spawnCombatStress120,
  };

  const stressValue120 = Number(new URLSearchParams(location.search).get('fdCombatStress')) || 0;
  if (stressValue120 > 0) {
    const panel = document.createElement('div');
    panel.id = 'fd-combat-stress120';
    panel.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:100000;padding:9px 11px;border:1px solid rgba(126,238,181,.65);border-radius:8px;background:rgba(4,12,9,.94);color:#d9f6e5;font:12px/1.4 ui-monospace,SFMono-Regular,Consolas,monospace;pointer-events:none';
    panel.textContent = 'COMBAT-STRESS: ожидается запуск матча';
    document.body.appendChild(panel);
    document.getElementById('start-game')?.addEventListener('click', () => setTimeout(async () => {
      try {
        panel.dataset.state = 'creating';
        panel.dataset.requestedPerSide = String(stressValue120);
        panel.textContent = `COMBAT-STRESS: создаются ${stressValue120.toLocaleString('ru-RU')} × 2 юнитов…`;
        const result = await spawnCombatStress120({ perSide: stressValue120 });
        const game = debug.game;
        if (game?.perf) {
          game.perf.benchmarking = true;
          game.perf._v125MaxRenderMs = 0;
        }
        if (game) game._v94MaxSimMs = 0;
        if (game) game._v94PerfMax = Object.create(null);
        panel.dataset.state = 'warming';
        panel.textContent = `COMBAT-STRESS: ${result.units.toLocaleString('ru-RU')} юнитов · ${result.missiles} ракет · прогрев 4 с…`;
        await new Promise((resolve) => setTimeout(resolve, 4000));
        panel.dataset.state = 'sampling';
        panel.textContent = `COMBAT-STRESS: ${result.units.toLocaleString('ru-RU')} юнитов · инструментальный замер 8 с…`;
        let frames = 0;
        const frameIntervals = [];
        let previousFrameAt = now120();
        const longTasks = [];
        let longTaskObserver = null;
        try {
          if (typeof PerformanceObserver !== 'undefined' && PerformanceObserver.supportedEntryTypes?.includes('longtask')) {
            longTaskObserver = new PerformanceObserver((list) => {
              for (const entry of list.getEntries()) longTasks.push(entry.duration);
            });
            longTaskObserver.observe({ entryTypes: ['longtask'] });
          }
        } catch (_) { longTaskObserver = null; }
        const started = now120();
        const legionRenderPassesAtStart = Number(window.__FD_LEGION_RENDER__?.metrics?.().renderPasses || 0);
        await new Promise((resolve) => {
          const sample = () => {
            const frameAt = now120();
            frameIntervals.push(frameAt - previousFrameAt);
            previousFrameAt = frameAt;
            frames += 1;
            if (frameAt - started >= 8000) resolve();
            else requestAnimationFrame(sample);
          };
          requestAnimationFrame(sample);
        });
        longTaskObserver?.disconnect();
        frameIntervals.sort((left, right) => left - right);
        const p95Frame = frameIntervals[Math.min(frameIntervals.length - 1, Math.floor(frameIntervals.length * .95))] || 0;
        const maxFrame = frameIntervals.at(-1) || 0;
        const maxLongTask = longTasks.length ? Math.max(...longTasks) : 0;
        const fps = frames / Math.max(.001, (now120() - started) / 1000);
        const legionRenderPasses = Number(window.__FD_LEGION_RENDER__?.metrics?.().renderPasses || 0) - legionRenderPassesAtStart;
        const renderHz = legionRenderPasses / Math.max(.001, (now120() - started) / 1000);
        const profile = game?.perf?.summary?.() || {};
        const mass = window.__FD_MASS_SCALE__?.metrics?.() || {};
        const combat = metricsSnapshot120(game) || {};
        if (game?.perf) game.perf.benchmarking = false;
        panel.dataset.state = 'complete';
        panel.dataset.fps = fps.toFixed(1);
        panel.dataset.renderHz = renderHz.toFixed(1);
        panel.dataset.units = String(result.units);
        panel.dataset.missiles = String(result.missiles);
        panel.dataset.createMs = result.createMs.toFixed(1);
        panel.dataset.simHz = Number(profile.tps || 0).toFixed(1);
        panel.dataset.simulationMs = Number(profile.simulationMs || 0).toFixed(2);
        panel.dataset.renderMs = Number(profile.renderMs || 0).toFixed(2);
        panel.dataset.maxRenderMs = Number(game?.perf?._v125MaxRenderMs || 0).toFixed(2);
        panel.dataset.maxSimulationMs = Number(game?._v94MaxSimMs || 0).toFixed(2);
        panel.dataset.p95FrameMs = p95Frame.toFixed(2);
        panel.dataset.maxFrameMs = maxFrame.toFixed(2);
        panel.dataset.longTasks = String(longTasks.length);
        panel.dataset.maxLongTaskMs = maxLongTask.toFixed(2);
        panel.dataset.maxLegionUnitsMs = Number(game?._v94PerfMax?.legionUnits || 0).toFixed(2);
        panel.dataset.maxLegionBuildingsMs = Number(game?._v94PerfMax?.legionBuildings || 0).toFixed(2);
        panel.dataset.maxLegionProjectilesMs = Number(game?._v94PerfMax?.legionProjectiles || 0).toFixed(2);
        panel.dataset.maxLegionInterceptionMs = Number(game?._v94PerfMax?.legionInterception || 0).toFixed(2);
        panel.dataset.maxLegionSchedulerMs = Number(game?._v94PerfMax?.legionScheduler || 0).toFixed(2);
        panel.dataset.maxAiMs = Number(game?._v94PerfMax?.ai || 0).toFixed(2);
        panel.dataset.maxFogMs = Number(game?._v94PerfMax?.fog || 0).toFixed(2);
        panel.dataset.maxCombatMs = Number(game?._v94PerfMax?.combat || 0).toFixed(2);
        panel.dataset.maxCollisionMs = Number(game?._v94PerfMax?.collision || 0).toFixed(2);
        panel.dataset.maxSchedulerUiMs = Number(game?._v94PerfMax?.['schedulerTask:ui'] || 0).toFixed(2);
        panel.dataset.maxSchedulerAiMs = Number(game?._v94PerfMax?.['schedulerTask:ai'] || 0).toFixed(2);
        panel.dataset.maxSchedulerFogMs = Number(game?._v94PerfMax?.['schedulerTask:fog'] || 0).toFixed(2);
        panel.dataset.maxSchedulerCleanupMs = Number(game?._v94PerfMax?.['schedulerTask:cleanup'] || 0).toFixed(2);
        panel.dataset.maxSchedulerSensorsMs = Number(game?._v94PerfMax?.['schedulerTask:sensors'] || 0).toFixed(2);
        panel.dataset.maxSchedulerPowerMs = Number(game?._v94PerfMax?.['schedulerTask:power'] || 0).toFixed(2);
        panel.dataset.maxUiPowersMs = Number(game?._v94PerfMax?.['ui:renderPowersUI'] || 0).toFixed(2);
        panel.dataset.maxUiSelectionMs = Number(game?._v94PerfMax?.['ui:renderSelectionUI'] || 0).toFixed(2);
        panel.dataset.maxUiActionsMs = Number(game?._v94PerfMax?.['ui:renderActionUI'] || 0).toFixed(2);
        panel.dataset.maxRenderSnapshotMs = Number(game?._v94PerfMax?.legionRenderSnapshot || 0).toFixed(2);
        panel.dataset.maxRenderSpritesMs = Number(game?._v94PerfMax?.legionRenderSprites || 0).toFixed(2);
        panel.dataset.maxRenderFogMs = Number(game?._v94PerfMax?.legionRenderFog || 0).toFixed(2);
        panel.dataset.maxRenderCombatMs = Number(game?._v94PerfMax?.legionRenderCombat || 0).toFixed(2);
        panel.dataset.maxRenderMinimapMs = Number(game?._v94PerfMax?.legionRenderMinimap || 0).toFixed(2);
        panel.dataset.combatMs = Number(profile.combatMs || 0).toFixed(2);
        panel.dataset.collisionMs = Number(profile.collisionMs || 0).toFixed(2);
        panel.dataset.navigationMs = Number(profile.navigationMs || 0).toFixed(2);
        panel.dataset.spatialMs = Number(profile.spatialMs || 0).toFixed(2);
        const perfFields = game?.perf?.ewma || game?.perf?.last || {};
        panel.dataset.legionUnitsMs = Number(perfFields.legionUnits || 0).toFixed(2);
        panel.dataset.legionBuildingsMs = Number(perfFields.legionBuildings || 0).toFixed(2);
        panel.dataset.legionProjectilesMs = Number(perfFields.legionProjectiles || 0).toFixed(2);
        panel.dataset.legionInterceptionMs = Number(perfFields.legionInterception || perfFields.interception || 0).toFixed(2);
        panel.dataset.legionSchedulerMs = Number(perfFields.legionScheduler || 0).toFixed(2);
        panel.dataset.updatedPerTick = Number(profile.updatedUnitsPerTick || 0).toFixed(1);
        panel.dataset.detailedUnits = String(mass.detailedUnits || 0);
        panel.dataset.clusters = String(mass.armyClusters || 0);
        panel.dataset.targetChecks = String(combat.targetCandidateChecks || 0);
        panel.dataset.targetCulled = String(combat.targetCandidatesCulled || 0);
        panel.textContent = `COMBAT-STRESS ГОТОВ · ${result.units.toLocaleString('ru-RU')} юнитов · sim ${Number(profile.tps || 0).toFixed(1)}/25 Гц · кадр ${Number(profile.renderMs || 0).toFixed(1)} мс · симуляция ${Number(profile.simulationMs || 0).toFixed(1)} мс · подробно ${mass.detailedUnits || 0} · боевых групп ${mass.armyClusters || 0}`;
      } catch (error) {
        panel.dataset.state = 'failed';
        panel.textContent = `COMBAT-STRESS ОШИБКА: ${error?.message || error}`;
      }
    }, 180), { once: true });
  }

  void 0;
  const eyebrow = document.querySelector('#start-screen .eyebrow');
  if (eyebrow) void 0;
  const lead = document.querySelector('#start-screen .lead');
  if (lead) void 0;
  const strip = document.querySelector('#start-screen .feature-strip');
  if (strip && !strip.querySelector('[data-combat-scale120]')) {
    void 0;
  }
})();
