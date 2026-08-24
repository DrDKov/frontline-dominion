(() => {
  'use strict';

  const root = globalThis;
  const debug = root.__FD_DEBUG__;
  const GameClass = debug?.Game;
  const UnitClass = debug?.Unit;
  const BuildingClass = debug?.Building;
  if (!GameClass || !UnitClass) return;
  if (GameClass.prototype.__fdCombatScale166Installed) return;
  Object.defineProperty(GameClass.prototype, '__fdCombatScale166Installed', {
    value: true, configurable: true,
  });

  const VERSION = '16.6';
  const BUILD = 180;
  const SIM_HZ = 25;
  const CELL_SIZE = 384;
  const RANGE_BAND_SIZE = 96;
  const MAX_CELL_RADIUS = 8;
  const FIRE_GROUP_LIMIT = 24;
  const MASS_FIRE_GROUP_LIMIT = 16;
  const RAW_CANDIDATE_LIMIT = 320;
  const PRIMARY_FIRE_PROBES = 4;
  const MASS_PRIMARY_FIRE_PROBES = 3;
  const PRIMARY_TARGET_POOL = 12;
  const MASS_PRIMARY_TARGET_POOL = 8;
  const TWO_PI = Math.PI * 2;
  const states = new WeakMap();
  const originalFindNearestEnemy166 = GameClass.prototype.findNearestEnemy;
  const originalUnitFire166 = UnitClass.prototype.fire;
  const originalBuildingFire166 = BuildingClass?.prototype?.fire;
  const originalSimulateFixed166 = GameClass.prototype.simulateFixed;
  const originalUpdate166 = GameClass.prototype.update;

  const clamp166 = (value, min, max) => Math.max(min, Math.min(max, value));
  const finite166 = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
  const now166 = () => typeof performance !== 'undefined' ? performance.now() : Date.now();

  function hash166(value) {
    const text = String(value ?? '');
    let hash = 2166136261 >>> 0;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619) >>> 0;
    }
    hash ^= hash >>> 16;
    hash = Math.imul(hash, 2246822507) >>> 0;
    hash ^= hash >>> 13;
    return hash >>> 0;
  }

  function entityNumber166(entity) {
    const parsed = Number.parseInt(String(entity?.id || '').replace(/^\D+/, ''), 10);
    return Number.isFinite(parsed) ? parsed >>> 0 : hash166(entity?.id);
  }

  function cellKey166(x, y) {
    const cx = Math.floor(finite166(x) / CELL_SIZE);
    const cy = Math.floor(finite166(y) / CELL_SIZE);
    return ((cy & 0xffff) << 16) | (cx & 0xffff);
  }

  function unpackCell166(key) {
    let cx = key & 0xffff;
    let cy = (key >>> 16) & 0xffff;
    if (cx & 0x8000) cx -= 0x10000;
    if (cy & 0x8000) cy -= 0x10000;
    return { cx, cy };
  }

  function emptyMetrics166() {
    return {
      indexBuilds: 0,
      indexedUnits: 0,
      indexedBuildings: 0,
      combatCells: 0,
      targetQueries: 0,
      targetCacheHits: 0,
      fireControlBuilds: 0,
      fireControlHits: 0,
      candidateChecks: 0,
      fallbackQueries: 0,
      targetsAssigned: 0,
      virtualShots: 0,
      virtualHits: 0,
      physicalProjectilesAvoided: 0,
      damageEvents: 0,
      damageBatches: 0,
      tracerEvents: 0,
      indexMs: 0,
      targetingMs: 0,
      batchMs: 0,
      lastIndexMs: 0,
      lastTargetingMs: 0,
      lastBatchMs: 0,
      lastCandidateCount: 0,
      maxCandidateCount: 0,
    };
  }

  const CELL_CLASSES166 = Object.freeze(['i', 'v', 'd', 'r', 'b', 'a']);
  const CELL_TEAMS166 = Object.freeze(['p', 'e', 'n']);
  const CELL_BUCKET_KEYS166 = Object.freeze(
    CELL_TEAMS166.flatMap(team => CELL_CLASSES166.map(kind => team + kind)),
  );

  function makeBucket166() {
    const bucket = {};
    for (const key of CELL_BUCKET_KEYS166) bucket[key] = [];
    return bucket;
  }

  function resetBucket166(bucket) {
    for (const key of CELL_BUCKET_KEYS166) bucket[key].length = 0;
    return bucket;
  }

  function stateFor166(game) {
    let state = states.get(game);
    if (state) return state;
    state = {
      version: VERSION,
      build: BUILD,
      indexEpoch: -1,
      indexSimTick: -1,
      cells: new Map(),
      bucketPool: [],
      fireGroups: new Map(),
      reservations: new Map(),
      classCounts: { i: 0, v: 0, d: 0, r: 0, b: 0, a: 0 },
      damageTargets: new Map(),
      targetEntryPool: [],
      damageBatchPool: [],
      weaponIds: new WeakMap(),
      nextWeaponId: 1,
      metrics: emptyMetrics166(),
      visualTick: -1,
      tracerCells: new Map(),
      tracerBudget: 0,
      soundBudget: 0,
      inSimulationStep: false,
    };
    states.set(game, state);
    game._combatScale166 = state;
    return state;
  }

  function cadenceTicks166(game) {
    const count = game?._v94AliveUnits || game?.units?.length || 0;
    if (count >= 80000) return 5;  // 5 Hz
    if (count >= 30000) return 4;  // 6.25 Hz
    return 3;                      // 8.33 Hz
  }

  function teamPrefix166(team) {
    return team === 'player' ? 'p' : team === 'enemy' ? 'e' : 'n';
  }

  function targetClass166(entity, isBuilding = false) {
    if (isBuilding || entity?.kind === 'building') return 'b';
    const weapon = entity?.stats?.weapon || {};
    const targets = Array.isArray(weapon.targets) ? weapon.targets : [];
    const airOnly = targets.length === 1 && targets[0] === 'air';
    const longRange = Boolean(weapon.ballistic || Number(weapon.range) >= 900);
    const armored = Boolean(entity?.vehicle || ['light', 'medium', 'heavy', 'vehicle', 'armor'].includes(String(entity?.armor || '')));
    const signature = (entity?.air ? 1 : 0) | (airOnly ? 2 : 0) | (longRange ? 4 : 0) | (armored ? 8 : 0);
    if (entity?._fdCombatClassSignature166 === signature && entity._fdCombatClass166) return entity._fdCombatClass166;
    const kind = entity?.air ? 'a' : airOnly ? 'd' : longRange ? 'r' : armored ? 'v' : 'i';
    entity._fdCombatClassSignature166 = signature;
    entity._fdCombatClass166 = kind;
    return kind;
  }

  function arrayFor166(bucket, team, targetClass) {
    return bucket[teamPrefix166(team) + targetClass];
  }

  function indexEntity166(state, entity, isBuilding = false) {
    if (!entity?.alive || entity.embarkedIn) return false;
    if (entity.airServiceState === 'hangar') return false;
    const key = cellKey166(entity.x, entity.y);
    let bucket = state.cells.get(key);
    if (!bucket) {
      bucket = resetBucket166(state.bucketPool.pop() || makeBucket166());
      state.cells.set(key, bucket);
    }
    const targetClass = targetClass166(entity, isBuilding);
    arrayFor166(bucket, entity.team, targetClass).push(entity);
    state.classCounts[targetClass] = (state.classCounts[targetClass] || 0) + 1;
    return true;
  }

  function rebuildIndex166(game, force = false) {
    const state = stateFor166(game);
    const simTick = Number.isFinite(game.simTick) ? game.simTick : Math.floor((game.time || 0) * SIM_HZ);
    const cadence = cadenceTicks166(game);
    const epoch = Math.floor(simTick / cadence);
    if (!force && epoch === state.indexEpoch) return state;

    const started = now166();
    for (const bucket of state.cells.values()) state.bucketPool.push(resetBucket166(bucket));
    state.cells.clear();
    state.fireGroups.clear();
    state.reservations.clear();
    for (const kind of CELL_CLASSES166) state.classCounts[kind] = 0;
    state.indexEpoch = epoch;
    state.indexSimTick = simTick;

    let indexedUnits = 0;
    let indexedBuildings = 0;
    for (const unit of game.units || []) if (indexEntity166(state, unit, false)) indexedUnits += 1;
    for (const building of game.buildings || []) if (indexEntity166(state, building, true)) indexedBuildings += 1;

    const elapsed = now166() - started;
    state.metrics.indexBuilds += 1;
    state.metrics.indexedUnits = indexedUnits;
    state.metrics.indexedBuildings = indexedBuildings;
    state.metrics.combatCells = state.cells.size;
    state.metrics.indexMs += elapsed;
    state.metrics.lastIndexMs = elapsed;
    return state;
  }

  function groundClassOrder166(observer) {
    const weapon = observer?.stats?.weapon || {};
    const bonus = weapon.bonus || {};
    if (Number(bonus.building || 1) > 1.1) return ['b', 'v', 'r', 'd', 'i'];
    if (Number(bonus.vehicle || bonus.heavy || bonus.armor || 1) > 1.1) return ['v', 'd', 'r', 'b', 'i'];
    if (weapon.ballistic || Number(weapon.range) >= 900) return ['r', 'd', 'b', 'v', 'i'];
    if (Number(weapon.damage) <= 48 && Number(weapon.projectileSpeed) >= 600) return ['i', 'd', 'r', 'v', 'b'];
    return ['v', 'i', 'd', 'r', 'b'];
  }

  function enemyPrefixes166(team) {
    if (team === 'player') return ['e'];
    if (team === 'enemy') return ['p'];
    return ['p', 'e'];
  }

  function targetArrays166(bucket, team, wantsGround, wantsAir, observer) {
    if (!bucket) return [];
    const arrays = [];
    const prefixes = enemyPrefixes166(team);
    if (wantsAir) for (const prefix of prefixes) arrays.push(bucket[prefix + 'a']);
    if (wantsGround) {
      const order = groundClassOrder166(observer);
      for (const kind of order) for (const prefix of prefixes) arrays.push(bucket[prefix + kind]);
    }
    return arrays;
  }

  function weaponClass166(observer, targetLayers) {
    const weapon = observer?.stats?.weapon || {};
    const wantsGround = targetLayers.includes('ground');
    const wantsAir = targetLayers.includes('air');
    let role = 0;
    const bonus = weapon.bonus || {};
    if (wantsAir && !wantsGround) role = 1;
    else if (Number(bonus.vehicle || bonus.heavy || bonus.armor || 1) > 1.12) role = 2;
    else if (weapon.ballistic || Number(weapon.range) >= 900) role = 3;
    else if (Number(weapon.damage) <= 48 && Number(weapon.projectileSpeed) >= 600) role = 4;
    const layerMask = (wantsGround ? 1 : 0) | (wantsAir ? 2 : 0);
    return (role << 2) | layerMask;
  }

  function targetPriority166(observer, target) {
    const weapon = observer?.stats?.weapon || {};
    const bonus = weapon.bonus || {};
    let priority = Number(bonus[target?.armor] ?? 1) || 1;
    if (target?.kind === 'unit' && target.stats?.weapon) priority *= 1.06;
    if (target?.vehicle && Number(bonus.vehicle || bonus.armor || 1) > 1.1) priority *= 1.18;
    if (target?.air && weapon.targets?.length === 1 && weapon.targets[0] === 'air') priority *= 1.12;
    const healthRatio = Math.max(.05, finite166(target?.hp, 1) / Math.max(1, finite166(target?.maxHp, 1)));
    priority *= 1 + (1 - healthRatio) * .08;
    return clamp166(priority, .45, 3.5);
  }

  function fireGroupKey166(observer, x, y, radius, targetLayers) {
    const cell = cellKey166(x, y);
    const radiusCells = clamp166(Math.ceil(radius / CELL_SIZE), 1, MAX_CELL_RADIUS);
    // A cell can contain weapons whose ranges differ by hundreds of units.
    // Keep them in separate 96-unit bands so a group built by the shortest-
    // ranged shooter never truncates the candidate set of longer-ranged peers.
    const rangeBand = clamp166(Math.ceil(radius / RANGE_BAND_SIZE), 1, 63);
    const groupRadius = rangeBand * RANGE_BAND_SIZE;
    const weaponClass = weaponClass166(observer, targetLayers);
    return {
      cell,
      code: (radiusCells << 12) | (rangeBand << 6) | weaponClass,
      radiusCells,
      rangeBand,
      groupRadius,
    };
  }

  function buildFireGroup166(game, state, observer, radius, targetLayers, keyData) {
    let cellGroups = state.fireGroups.get(keyData.cell);
    if (!cellGroups) {
      cellGroups = new Map();
      state.fireGroups.set(keyData.cell, cellGroups);
    }
    let group = cellGroups.get(keyData.code);
    if (group) {
      state.metrics.fireControlHits += 1;
      return group;
    }

    const { cx, cy } = unpackCell166(keyData.cell);
    const wantsGround = targetLayers.includes('ground');
    const wantsAir = targetLayers.includes('air');
    const centerX = (cx + .5) * CELL_SIZE;
    const centerY = (cy + .5) * CELL_SIZE;
    const raw = [];
    const seen = new Set();
    const maxRaw = (game._v94AliveUnits || game.units?.length || 0) >= 30000 ? RAW_CANDIDATE_LIMIT : RAW_CANDIDATE_LIMIT * 2;

    outer:
    for (let oy = -keyData.radiusCells; oy <= keyData.radiusCells; oy += 1) {
      for (let ox = -keyData.radiusCells; ox <= keyData.radiusCells; ox += 1) {
        const bucket = state.cells.get((((cy + oy) & 0xffff) << 16) | ((cx + ox) & 0xffff));
        for (const list of targetArrays166(bucket, observer.team, wantsGround, wantsAir, observer)) {
          for (const entity of list) {
            if (!entity?.alive || seen.has(entity.id)) continue;
            seen.add(entity.id);
            const dx = entity.x - centerX;
            const dy = entity.y - centerY;
            const roughRadius = keyData.groupRadius + CELL_SIZE * .78;
            if (dx * dx + dy * dy > roughRadius * roughRadius) continue;
            raw.push(entity);
            if (raw.length >= maxRaw) break outer;
          }
        }
      }
    }

    const limit = (game._v94AliveUnits || game.units?.length || 0) >= 30000 ? MASS_FIRE_GROUP_LIMIT : FIRE_GROUP_LIMIT;
    raw.sort((left, right) => {
      const ldx = left.x - centerX;
      const ldy = left.y - centerY;
      const rdx = right.x - centerX;
      const rdy = right.y - centerY;
      const ls = (ldx * ldx + ldy * ldy) / targetPriority166(observer, left);
      const rs = (rdx * rdx + rdy * rdy) / targetPriority166(observer, right);
      return ls - rs || entityNumber166(left) - entityNumber166(right);
    });

    group = {
      epoch: state.indexEpoch,
      cell: keyData.cell,
      code: keyData.code,
      radius: keyData.groupRadius,
      candidates: raw.slice(0, limit),
      overflow: raw.slice(limit),
    };
    cellGroups.set(keyData.code, group);
    state.metrics.fireControlBuilds += 1;
    state.metrics.lastCandidateCount = group.candidates.length;
    state.metrics.maxCandidateCount = Math.max(state.metrics.maxCandidateCount, group.candidates.length);
    return group;
  }

  function validTarget166(game, observer, target, x, y, team, radius, targetLayers) {
    if (!target?.alive || target.team === team || target.team === 'neutral') return false;
    const layer = target.air ? 'air' : 'ground';
    if (!targetLayers.includes(layer)) return false;
    const dx = target.x - x;
    const dy = target.y - y;
    if (dx * dx + dy * dy > radius * radius) return false;
    if (observer?.canAttack && !observer.canAttack(target)) return false;
    if (game.isTargetableBy && !game.isTargetableBy(target, team, observer)) return false;
    return true;
  }

  function publishContact166(game, observer, target) {
    if (!observer || !target) return;
    try {
      if (game.isDirectCombatContact132?.(observer, target)) {
        game.publishCombatContact132?.(observer, target);
        observer._networkFire132 = null;
      }
    } catch (_) {}
  }

  GameClass.prototype.findNearestEnemy = function(x, y, team, radius, targetLayers = ['ground'], observer = null) {
    if (!observer || !observer.stats?.weapon || !Number.isFinite(radius) || radius <= 0 || !Array.isArray(targetLayers)) {
      return originalFindNearestEnemy166.call(this, x, y, team, radius, targetLayers, observer);
    }
    const started = now166();
    const state = rebuildIndex166(this);
    state.metrics.targetQueries += 1;

    const queryCell166 = cellKey166(x, y);
    const queryWeaponClass166 = weaponClass166(observer, targetLayers);
    const cached = observer._fdTarget166;
    if (cached?.epoch === state.indexEpoch && cached.team === team && cached.radius >= radius * .92 && cached.cell === queryCell166 && cached.weaponClass === queryWeaponClass166) {
      const entity = cached.id ? this.getEntity?.(cached.id) : null;
      if (entity && validTarget166(this, observer, entity, x, y, team, radius, targetLayers)) {
        state.metrics.targetCacheHits += 1;
        state.metrics.targetingMs += now166() - started;
        state.metrics.lastTargetingMs = now166() - started;
        publishContact166(this, observer, entity);
        return entity;
      }
      if (!cached.id) {
        state.metrics.targetCacheHits += 1;
        state.metrics.targetingMs += now166() - started;
        state.metrics.lastTargetingMs = now166() - started;
        return null;
      }
    }

    const keyData = fireGroupKey166(observer, x, y, radius, targetLayers);
    const group = buildFireGroup166(this, state, observer, radius, targetLayers, keyData);
    const weaponDamage = Math.max(1, finite166(observer.stats.weapon.damage, 1));
    let best = null;
    let bestScore = Infinity;
    let checked = 0;

    const consider166 = target => {
      checked += 1;
      if (!validTarget166(this, observer, target, x, y, team, radius, targetLayers)) return;
      const dx = target.x - x;
      const dy = target.y - y;
      const distanceSquared = dx * dx + dy * dy;
      const reserved = state.reservations.get(target) || 0;
      const health = Math.max(1, finite166(target.hp, target.maxHp || 1));
      const overkill = reserved / health;
      const priority = targetPriority166(observer, target);
      const tie = ((hash166(observer.id) ^ entityNumber166(target)) & 255) * 1e-5;
      const score = distanceSquared * (1 + Math.min(3, overkill) * .42) / priority + tie;
      if (score < bestScore) {
        best = target;
        bestScore = score;
      }
    };
    const massBattle166 = (this._v94AliveUnits || this.units?.length || 0) >= 30000;
    const primaryPool166 = Math.min(
      group.candidates.length,
      massBattle166 ? MASS_PRIMARY_TARGET_POOL : PRIMARY_TARGET_POOL,
    );
    const primaryProbes166 = Math.min(
      primaryPool166,
      massBattle166 ? MASS_PRIMARY_FIRE_PROBES : PRIMARY_FIRE_PROBES,
    );
    // A fire-control group distributes its nearest shared targets between the
    // shooters. Most observers validate only three or four candidates instead
    // of repeating the whole shortlist; detector/LOS edge cases expand below.
    const primaryStart166 = primaryPool166
      ? (hash166(observer.id) ^ (state.indexEpoch * 2654435761)) >>> 0
      : 0;
    for (let probe = 0; probe < primaryProbes166; probe += 1) {
      consider166(group.candidates[(primaryStart166 + probe) % primaryPool166]);
    }
    // Only an observer that found no legal candidate expands the search. This
    // preserves stealth/detector and cell-edge range cases without making every
    // member of the fire-control group repeat the same work.
    if (!best) {
      for (const target of group.candidates) consider166(target);
      if (!best) for (const target of group.overflow || []) consider166(target);
    }

    state.metrics.candidateChecks += checked;
    if (best) {
      state.reservations.set(best, (state.reservations.get(best) || 0) + weaponDamage);
      state.metrics.targetsAssigned += 1;
      publishContact166(this, observer, best);
    } else {
      const unitCount = this._v94AliveUnits || this.units?.length || 0;
      const commandType = observer.currentCommand?.type || '';
      const preserveEdgeCase = unitCount < 3000 || observer.selected || commandType === 'attack';
      if (preserveEdgeCase) {
        state.metrics.fallbackQueries += 1;
        best = originalFindNearestEnemy166.call(this, x, y, team, radius, targetLayers, observer);
      }
    }

    observer._fdTarget166 = {
      id: best?.id || null,
      epoch: state.indexEpoch,
      team,
      radius,
      cell: queryCell166,
      weaponClass: queryWeaponClass166,
    };
    const elapsed = now166() - started;
    state.metrics.targetingMs += elapsed;
    state.metrics.lastTargetingMs = elapsed;
    return best;
  };

  function weaponId166(state, weapon) {
    let id = state.weaponIds.get(weapon);
    if (id) return id;
    id = state.nextWeaponId++;
    state.weaponIds.set(weapon, id);
    return id;
  }

  function acquireTargetEntry166(state, target) {
    let entry = state.damageTargets.get(target);
    if (entry) return entry;
    entry = state.targetEntryPool.pop() || { target: null, weapons: new Map() };
    entry.target = target;
    entry.weapons.clear();
    state.damageTargets.set(target, entry);
    return entry;
  }

  function queueDamage166(game, target, source, weapon, rawDamage, suppression, hit) {
    const state = stateFor166(game);
    const entry = acquireTargetEntry166(state, target);
    const weaponId = weaponId166(state, weapon);
    let batch = entry.weapons.get(weaponId);
    if (!batch) {
      batch = state.damageBatchPool.pop() || {
        target: null, source: null, weapon: null, damage: 0, suppression: 0, shots: 0, hits: 0,
      };
      batch.target = target;
      batch.source = null;
      batch.weapon = weapon;
      batch.damage = 0;
      batch.suppression = 0;
      batch.shots = 0;
      batch.hits = 0;
      entry.weapons.set(weaponId, batch);
    }
    batch.shots += 1;
    if (hit) {
      batch.hits += 1;
      batch.damage += rawDamage;
      // Sequential combat would credit the final contributing hit if the
      // aggregate crosses zero HP. Preserve that deterministic approximation
      // without retaining a contributor object for every bullet.
      batch.source = source;
    }
    batch.suppression += suppression;
    state.metrics.damageEvents += 1;
  }

  function flushDamage166(game) {
    const state = stateFor166(game);
    if (!state.damageTargets.size) return;
    const started = now166();
    let batches = 0;
    for (const entry of state.damageTargets.values()) {
      const target = entry.target;
      for (const batch of entry.weapons.values()) {
        batches += 1;
        if (target?.alive) {
          if (batch.damage > 0) target.takeDamage?.(batch.damage, batch.source, batch.weapon);
          if (Number.isFinite(target.suppression160) && batch.suppression > 0) {
            target.suppression160 = clamp166(target.suppression160 + batch.suppression, 0, 1);
            target.lastSuppressedAt160 = game.time;
          }
        }
        batch.target = null;
        batch.source = null;
        batch.weapon = null;
        state.damageBatchPool.push(batch);
      }
      entry.weapons.clear();
      entry.target = null;
      state.targetEntryPool.push(entry);
    }
    state.damageTargets.clear();
    const elapsed = now166() - started;
    state.metrics.damageBatches += batches;
    state.metrics.batchMs += elapsed;
    state.metrics.lastBatchMs = elapsed;
  }

  function resetVisualBudget166(game, state) {
    const tick = Number.isFinite(game.simTick) ? game.simTick : Math.floor((game.time || 0) * SIM_HZ);
    if (state.visualTick === tick) return;
    state.visualTick = tick;
    state.tracerCells.clear();
    const count = game._v94AliveUnits || game.units?.length || 0;
    state.tracerBudget = count >= 50000 ? 72 : count >= 12000 ? 144 : 360;
    state.soundBudget = count >= 12000 ? 2 : 6;
  }

  function virtualSmallArm166(attacker, weapon) {
    if (!attacker || !weapon || attacker.air) return false;
    if (Number.isFinite(attacker.airAmmo) || Number.isFinite(attacker.magazineAmmo139) ||
        Number.isFinite(attacker.magazineAmmoMax139) || Number.isFinite(attacker.stats?.magazineCapacity) ||
        attacker._finiteSalvo139 || attacker._finiteSalvoFollowup139) return false;
    const trajectory = String(weapon.trajectory || (weapon.ballistic ? 'ballistic' : 'straight')).toLowerCase();
    const profile = `${weapon.profile || ''} ${weapon.name || ''} ${weapon.label || ''} ${attacker.typeId || ''}`.toLowerCase();
    if (weapon.ballistic || Number(weapon.splash || 0) > 12) return false;
    if (Number(weapon.damage || 0) <= 0 || Number(weapon.damage) > 48) return false;
    if (Number(weapon.range || 0) > 760) return false;
    if (Number(weapon.projectileSpeed || 0) < 600) return false;
    if (Number(weapon.interceptability || 0) > 0 || Number(weapon.projectileHp || 0) > 0) return false;
    if (!['straight', 'direct', 'beam', 'plasma', ''].includes(trajectory)) return false;
    if (/missile|rocket|bomb|torpedo|artillery|mortar|howitzer|shell|cannon|птур|рак|бомб|артилл|мином|снаряд/.test(profile)) return false;
    return true;
  }

  function recordTracerEffect166(game, source, target, weapon, muzzle, aimX, aimY) {
    const state = stateFor166(game);
    resetVisualBudget166(game, state);
    if (state.tracerBudget <= 0) return;
    const key = cellKey166(source.x, source.y);
    const used = state.tracerCells.get(key) || 0;
    if (used >= 3) return;
    const deterministicSample = (hash166(source.id) + state.visualTick + used) % 3;
    if (deterministicSample !== 0 && (game._v94AliveUnits || game.units?.length || 0) >= 12000) return;
    state.tracerCells.set(key, used + 1);
    state.tracerBudget -= 1;
    state.metrics.tracerEvents += 1;
    game.addEffect?.({
      type: 'tracer166',
      x: muzzle.x,
      y: muzzle.y,
      z: muzzle.z || 0,
      x2: aimX,
      y2: aimY,
      z2: game.getEntityAimAltitude?.(target) || 0,
      color: weapon.projectileColor || weapon.trailColor || (source.team === 'player' ? '#d9f7d0' : '#ffc4a9'),
      width: clamp166(Number(weapon.visualSize || 2), 1, 3.5),
      duration: .09,
    });
    if (state.soundBudget > 0) {
      const onScreen = typeof document === 'undefined' ? used === 0 : Boolean(game.isOnScreen?.(source.x, source.y, 260));
      if (onScreen) {
        state.soundBudget -= 1;
        game.sound?.shot?.(false);
      }
    }
  }

  function resolveVirtualShot166(attacker, target, weapon, veteranMultiplier = 1, muzzle = null) {
    const game = attacker.game;
    const state = stateFor166(game);
    const origin = muzzle || game.getUnitWeaponMuzzle?.(attacker, target) || {
      x: attacker.x + Math.cos(attacker.rotation || 0) * (attacker.radius || 8),
      y: attacker.y + Math.sin(attacker.rotation || 0) * (attacker.radius || 8),
      z: 0,
    };
    const distance = Math.max(1, Math.hypot(target.x - origin.x, target.y - origin.y));
    const accuracy = clamp166(Number(weapon.accuracy ?? .96), .25, 1);
    const spread = (1 - accuracy) * (24 + distance * .16);
    let aimX = target.x;
    let aimY = target.y;
    if (spread > .25) {
      const angle = (game.rng?.next?.() ?? Math.random()) * TWO_PI;
      const magnitude = spread * Math.sqrt(game.rng?.next?.() ?? Math.random());
      aimX += Math.cos(angle) * magnitude;
      aimY += Math.sin(angle) * magnitude;
    }
    const hitRadius = (target.radius || 0) + Math.max(12, Number(weapon.splash || 0) * .18);
    const hit = target.alive && Math.hypot(target.x - aimX, target.y - aimY) <= hitRadius;
    const rawDamage = Number(weapon.damage || 0) * veteranMultiplier;
    const suppressionBase = clamp166(
      Number(weapon.suppression || 0) || rawDamage / Math.max(1, Number(target.maxHp || target.hp || 1)) * .18,
      .001,
      .028,
    );
    // Unit.takeDamage already derives shock/suppression from damage. Add only
    // explicit weapon suppression on a hit; misses still contribute near-miss
    // suppression without creating a projectile object.
    const explicitSuppression = Math.max(0, Number(weapon.suppression || 0));
    const supplementalSuppression = hit ? explicitSuppression * .25 : Math.max(explicitSuppression, suppressionBase) * .55;
    queueDamage166(game, target, attacker, weapon, rawDamage, supplementalSuppression, hit);
    recordTracerEffect166(game, attacker, target, weapon, origin, aimX, aimY);
    // Scripted/manual fire outside a simulation step must not leave damage
    // stranded until a later tick. Normal mass combat still flushes once.
    if (!state.inSimulationStep) flushDamage166(game);
    state.metrics.virtualShots += 1;
    state.metrics.physicalProjectilesAvoided += 1;
    if (hit) state.metrics.virtualHits += 1;
    return hit;
  }

  if (typeof originalUnitFire166 === 'function') {
    UnitClass.prototype.fire = function(target) {
      const weapon = this.stats?.weapon;
      if (!target?.alive) return false;
      // Never fall through to the physical fire path when combat policy (for
      // example the player's v177 hold-fire order) rejects the target.
      if (this.canAttack && !this.canAttack(target)) return false;
      if (!virtualSmallArm166(this, weapon)) return originalUnitFire166.call(this, target);
      const veteranMultiplier = 1 + (Number(this.rank || 1) - 1) * .14;
      const commandBonus = Number(this.game.getCommandAuraBonus?.(this) || 0);
      this.weaponCooldown = Number(weapon.reload || .2) / (1 + (Number(this.rank || 1) - 1) * .06 + commandBonus);
      if (this.stats.stealth) this.revealTimer = 3.2 * (this.stats.stealthRecovery || 1);
      if (this.stats.covertOps) {
        this.compromisedUntil = Math.max(this.compromisedUntil || 0, this.game.time + 10);
        this.coverIntegrity = Math.max(0, finite166(this.coverIntegrity, 1) - .14);
      }
      this.lastShotAt = this.game.time;
      const muzzle = this.game.getUnitWeaponMuzzle?.(this, target) || null;
      return resolveVirtualShot166(this, target, weapon, veteranMultiplier, muzzle);
    };
  }

  if (BuildingClass && typeof originalBuildingFire166 === 'function') {
    BuildingClass.prototype.fire = function(target) {
      const weapon = this.stats?.weapon;
      if (!target?.alive) return false;
      if (this.canAttack && !this.canAttack(target)) return false;
      if (!virtualSmallArm166(this, weapon)) return originalBuildingFire166.call(this, target);
      if (this.stats.category === 'defense' && this.game.isStationaryDefensePowered && !this.game.isStationaryDefensePowered(this)) return;
      const commandBonus = Number(this.game.getCommandAuraBonus?.(this) || 0);
      this.weaponCooldown = Number(weapon.reload || .2) / (1 + commandBonus);
      this.lastShotAt = this.game.time;
      const muzzle = this.game.getBuildingWeaponMuzzle?.(this, this.weaponRotation || 0, this.shotSequence || 0) || {
        x: this.x, y: this.y, z: 0,
      };
      const hit = resolveVirtualShot166(this, target, weapon, 1, muzzle);
      this.recoil = 1;
      this.shotSequence = ((this.shotSequence || 0) + 1) % 32;
      return hit;
    };
  }

  if (typeof originalSimulateFixed166 === 'function') {
    GameClass.prototype.simulateFixed = function(dt) {
      const state = stateFor166(this);
      state.inSimulationStep = true;
      resetVisualBudget166(this, state);
      try {
        return originalSimulateFixed166.call(this, dt);
      } finally {
        flushDamage166(this);
        state.inSimulationStep = false;
      }
    };
  } else if (typeof originalUpdate166 === 'function') {
    GameClass.prototype.update = function(dt) {
      const state = stateFor166(this);
      state.inSimulationStep = true;
      resetVisualBudget166(this, state);
      try {
        return originalUpdate166.call(this, dt);
      } finally {
        flushDamage166(this);
        state.inSimulationStep = false;
      }
    };
  }

  GameClass.prototype.combatScaleDiagnostics166 = function() {
    const state = stateFor166(this);
    const metrics = state.metrics;
    return {
      version: VERSION,
      build: BUILD,
      indexEpoch: state.indexEpoch,
      indexSimTick: state.indexSimTick,
      combatCells: state.cells.size,
      indexedUnits: metrics.indexedUnits,
      indexedBuildings: metrics.indexedBuildings,
      cellClasses: {
        infantry: state.classCounts.i,
        armor: state.classCounts.v,
        airDefense: state.classCounts.d,
        artillery: state.classCounts.r,
        buildings: state.classCounts.b,
        aircraft: state.classCounts.a,
      },
      targetQueries: metrics.targetQueries,
      targetCacheHits: metrics.targetCacheHits,
      fireControlBuilds: metrics.fireControlBuilds,
      fireControlHits: metrics.fireControlHits,
      candidateChecks: metrics.candidateChecks,
      fallbackQueries: metrics.fallbackQueries,
      targetsAssigned: metrics.targetsAssigned,
      virtualShots: metrics.virtualShots,
      virtualHits: metrics.virtualHits,
      physicalProjectilesAvoided: metrics.physicalProjectilesAvoided,
      damageEvents: metrics.damageEvents,
      damageBatches: metrics.damageBatches,
      tracerEvents: metrics.tracerEvents,
      indexMs: metrics.indexMs,
      targetingMs: metrics.targetingMs,
      batchMs: metrics.batchMs,
      lastIndexMs: metrics.lastIndexMs,
      lastTargetingMs: metrics.lastTargetingMs,
      lastBatchMs: metrics.lastBatchMs,
      lastCandidateCount: metrics.lastCandidateCount,
      maxCandidateCount: metrics.maxCandidateCount,
      pendingDamageTargets: state.damageTargets.size,
    };
  };

  if (typeof document !== 'undefined') {
    const canvas = document.getElementById('game-canvas');
    const context = canvas?.getContext?.('2d');
    const drawTracerEffects166 = game => {
      if (!context || !game?.effects?.length) return;
      for (const effect of game.effects) {
        if (effect?.type !== 'tracer166') continue;
        const fade = 1 - clamp166(finite166(effect.age) / Math.max(.001, finite166(effect.duration, .09)), 0, 1);
        if (fade <= 0) continue;
        const first = game.worldToScreen?.(effect.x, effect.y, effect.z || 0);
        const second = game.worldToScreen?.(effect.x2, effect.y2, effect.z2 || 0);
        if (!first || !second) continue;
        context.save();
        context.globalAlpha = fade;
        context.strokeStyle = effect.color || '#eaf7d0';
        context.lineWidth = clamp166(Number(effect.width || 1.4), .8, 3.2);
        context.beginPath();
        context.moveTo(first.x, first.y);
        context.lineTo(second.x, second.y);
        context.stroke();
        context.globalAlpha = fade * .7;
        context.strokeStyle = '#ffffff';
        context.lineWidth = .7;
        context.beginPath();
        context.moveTo(first.x, first.y);
        context.lineTo(second.x, second.y);
        context.stroke();
        context.restore();
      }
    };

    const baseDrawEffects3D166 = GameClass.prototype.drawEffects3D;
    if (typeof baseDrawEffects3D166 === 'function') {
      GameClass.prototype.drawEffects3D = function(...args) {
        const result = baseDrawEffects3D166.apply(this, args);
        drawTracerEffects166(this);
        return result;
      };
    } else {
      const baseDrawEffects166 = GameClass.prototype.drawEffects;
      if (typeof baseDrawEffects166 === 'function') {
        GameClass.prototype.drawEffects = function(...args) {
          const result = baseDrawEffects166.apply(this, args);
          drawTracerEffects166(this);
          return result;
        };
      }
    }
  }

  root.__FD_COMBAT_SCALE166__ = {
    version: VERSION,
    build: BUILD,
    diagnostics() {
      const game = root.__FD_DEBUG__?.game;
      return game?.combatScaleDiagnostics166?.() || null;
    },
    forceRebuild() {
      const game = root.__FD_DEBUG__?.game;
      return game ? rebuildIndex166(game, true) : null;
    },
  };
})();
