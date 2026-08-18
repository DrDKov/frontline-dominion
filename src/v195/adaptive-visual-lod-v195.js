(() => {
  'use strict';

  if (typeof document === 'undefined') return;
  const root = globalThis;
  const D = root.__FD_DEBUG__;
  const Game = D?.Game;
  if (!Game?.prototype || root.__FD_ADAPTIVE_LOD_195__) return;

  const VERSION = '16.8.11';
  const BUILD = 195;
  const TOUCH = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
  const TIER_NAMES = Object.freeze(['emergency', 'performance', 'balanced', 'quality']);
  const BUDGETS = Object.freeze({
    desktop: Object.freeze([100, 180, 320, 520]),
    touch: Object.freeze([80, 130, 220, 320]),
  });
  const CELL_SIZE = Object.freeze([520, 440, 360, 300]);
  const PRESSURE_INTERVAL_MS = 600;
  const DROP_SAMPLES = 2;
  const RECOVER_SAMPLES = 5;
  const COMBAT_HOLD_SECONDS = 1.6;
  const MIN_ACTIVATION_MULTIPLIER = 1.10;

  const state = {
    installed: false,
    installedAt: performance.now(),
    tier: TOUCH ? 2 : 3,
    tierName: TIER_NAMES[TOUCH ? 2 : 3],
    budget: 0,
    pressureTier: TOUCH ? 2 : 3,
    pressureReason: 'initial',
    badSamples: 0,
    goodSamples: 0,
    tierChanges: 0,
    frames: 0,
    activeFrames: 0,
    inputUnits: 0,
    importantUnits: 0,
    detailedUnits: 0,
    omittedUnits: 0,
    clusters: 0,
    totalOmitted: 0,
    totalClusters: 0,
    maxInputUnits: 0,
    lastLodMs: 0,
    maxLodMs: 0,
    lastPressureAt: 0,
    lastTransitionAt: 0,
    lastTransitionReason: 'initial',
    lastEventLoopP95: 0,
    lastRenderSnapshotP95: 0,
    lastEventLoopMax: 0,
    lastRenderSnapshotMax: 0,
  };

  const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const stableHash = value => {
    let h = 2166136261 >>> 0;
    const text = String(value ?? '');
    for (let index = 0; index < text.length; index += 1) {
      h ^= text.charCodeAt(index);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  };

  function effectiveBudget(game, tier = state.tier) {
    const table = TOUCH ? BUDGETS.touch : BUDGETS.desktop;
    let budget = table[clamp(Math.round(tier), 0, 3)];
    const zoom = finite(game?.camera?.zoom, 1);
    if (zoom < .62) budget = Math.round(budget * .78);
    else if (zoom > 1.15) budget = Math.round(budget * 1.14);
    return Math.max(48, budget);
  }

  function isImportant(game, unit) {
    if (!unit || unit.alive === false) return true;
    if (unit.air) return true; // aircraft remain individually visible/selectable
    if (unit.selected || unit.hovered) return true;
    const now = finite(game?.time);
    const hotAt = Math.max(
      finite(unit.lastShotAt, -9999),
      finite(unit.lastDamagedAt, -9999),
      finite(unit.lastHitAt, -9999),
    );
    return now - hotAt <= COMBAT_HOLD_SECONDS;
  }

  function pressureFromPerformance() {
    const perf = root.__FD_PERFORMANCE_194__?.snapshot?.();
    const eventP95 = finite(perf?.eventLoop?.p95Ms);
    const eventMax = finite(perf?.eventLoop?.maxMs);
    const renderP95 = finite(perf?.renderSnapshot?.p95Ms);
    const renderMax = finite(perf?.renderSnapshot?.maxMs);
    state.lastEventLoopP95 = eventP95;
    state.lastEventLoopMax = eventMax;
    state.lastRenderSnapshotP95 = renderP95;
    state.lastRenderSnapshotMax = renderMax;

    // Deliberately ignore RAF cadence here: headless WebKit throttles RAF and,
    // in production, display refresh rate is not the same thing as JS pressure.
    // Event-loop drift + render snapshot time are browser-independent signals.
    if (eventP95 >= 32 || renderP95 >= 12 || eventMax >= 180 || renderMax >= 90) {
      return { tier: 0, reason: 'severe-main-thread-pressure' };
    }
    if (eventP95 >= 18 || renderP95 >= 6 || eventMax >= 110 || renderMax >= 55) {
      return { tier: 1, reason: 'main-thread-pressure' };
    }
    if (eventP95 >= 9 || renderP95 >= 3 || eventMax >= 70 || renderMax >= 32) {
      return { tier: 2, reason: 'moderate-main-thread-pressure' };
    }
    return { tier: 3, reason: 'healthy' };
  }

  function updatePressure(force = false) {
    const now = performance.now();
    if (!force && now - state.lastPressureAt < PRESSURE_INTERVAL_MS) return state.tier;
    state.lastPressureAt = now;
    const pressure = pressureFromPerformance();
    state.pressureTier = pressure.tier;
    state.pressureReason = pressure.reason;

    if (pressure.tier < state.tier) {
      state.badSamples += 1;
      state.goodSamples = 0;
      if (state.badSamples >= DROP_SAMPLES) {
        const before = state.tier;
        state.tier = Math.max(pressure.tier, state.tier - 1);
        state.tierName = TIER_NAMES[state.tier];
        state.tierChanges += 1;
        state.badSamples = 0;
        state.lastTransitionAt = now;
        state.lastTransitionReason = `${pressure.reason}:${before}->${state.tier}`;
      }
    } else if (pressure.tier > state.tier) {
      state.goodSamples += 1;
      state.badSamples = 0;
      if (state.goodSamples >= RECOVER_SAMPLES) {
        const before = state.tier;
        state.tier = Math.min(pressure.tier, state.tier + 1);
        state.tierName = TIER_NAMES[state.tier];
        state.tierChanges += 1;
        state.goodSamples = 0;
        state.lastTransitionAt = now;
        state.lastTransitionReason = `recovery:${before}->${state.tier}`;
      }
    } else {
      state.badSamples = 0;
      state.goodSamples = 0;
    }
    return state.tier;
  }

  function clusterKey(unit, cellSize) {
    const x = Math.floor(finite(unit.x) / cellSize);
    const y = Math.floor(finite(unit.y) / cellSize);
    return `${unit.team || 'neutral'}|${unit.typeId || 'unit'}|${x}:${y}`;
  }

  function makeCluster(group) {
    let x = 0;
    let y = 0;
    let hp = 0;
    let dirX = 0;
    let dirY = 0;
    for (const unit of group) {
      x += finite(unit.x);
      y += finite(unit.y);
      hp += clamp(finite(unit.healthRatio, finite(unit.hp, 1)), 0, 1);
      const rotation = finite(unit.renderRotation, finite(unit.rotation));
      dirX += Math.cos(rotation);
      dirY += Math.sin(rotation);
    }
    const count = Math.max(1, group.length);
    const sample = group[0];
    return {
      team: sample.team,
      air: false,
      typeId: sample.typeId,
      x: x / count,
      y: y / count,
      count,
      hp: hp / count,
      rotation: Math.atan2(dirY, dirX),
      lod195: true,
    };
  }

  function applyLod(game, snapshot) {
    const started = performance.now();
    state.frames += 1;
    updatePressure(false);

    const units = snapshot?.units;
    if (!Array.isArray(units) || units.length === 0) {
      state.inputUnits = 0;
      state.importantUnits = 0;
      state.detailedUnits = 0;
      state.omittedUnits = 0;
      state.clusters = 0;
      state.lastLodMs = performance.now() - started;
      return snapshot;
    }

    const budget = effectiveBudget(game);
    state.budget = budget;
    state.inputUnits = units.length;
    state.maxInputUnits = Math.max(state.maxInputUnits, units.length);

    const important = [];
    const candidates = [];
    for (const unit of units) {
      if (isImportant(game, unit)) important.push(unit);
      else candidates.push(unit);
    }
    state.importantUnits = important.length;

    const candidateBudget = Math.max(0, budget - important.length);
    const activationCount = Math.ceil(Math.max(budget, 1) * MIN_ACTIVATION_MULTIPLIER);
    if (units.length <= activationCount || candidates.length <= candidateBudget) {
      state.detailedUnits = units.length;
      state.omittedUnits = 0;
      state.clusters = 0;
      state.lastLodMs = performance.now() - started;
      state.maxLodMs = Math.max(state.maxLodMs, state.lastLodMs);
      return snapshot;
    }

    state.activeFrames += 1;
    const cellSize = CELL_SIZE[state.tier];
    const groups = new Map();
    for (const unit of candidates) {
      const key = clusterKey(unit, cellSize);
      let group = groups.get(key);
      if (!group) groups.set(key, group = []);
      group.push(unit);
    }

    const groupEntries = [...groups.entries()];
    for (const entry of groupEntries) {
      entry[1].sort((left, right) => stableHash(left.id) - stableHash(right.id));
    }
    // First pass preserves spatial/type coverage. Larger cells get first claim
    // on the detail budget, but every kept representative is deterministic.
    groupEntries.sort((left, right) => right[1].length - left[1].length || left[0].localeCompare(right[0]));

    const kept = [...important];
    const keptIds = new Set(important.map(unit => unit.id));
    let remaining = candidateBudget;
    for (const [, group] of groupEntries) {
      if (remaining <= 0) break;
      const unit = group[0];
      if (!keptIds.has(unit.id)) {
        kept.push(unit);
        keptIds.add(unit.id);
        remaining -= 1;
      }
    }

    // Round-robin fill avoids rendering only one corner/type when spare budget
    // remains after coverage representatives.
    let depth = 1;
    while (remaining > 0) {
      let added = 0;
      for (const [, group] of groupEntries) {
        if (remaining <= 0) break;
        const unit = group[depth];
        if (!unit || keptIds.has(unit.id)) continue;
        kept.push(unit);
        keptIds.add(unit.id);
        remaining -= 1;
        added += 1;
      }
      if (!added) break;
      depth += 1;
    }

    const omittedGroups = [];
    let omitted = 0;
    for (const [, group] of groupEntries) {
      const hidden = group.filter(unit => !keptIds.has(unit.id));
      if (!hidden.length) continue;
      omitted += hidden.length;
      omittedGroups.push(hidden);
    }

    if (omitted > 0) {
      snapshot.units.length = 0;
      snapshot.units.push(...kept);
      snapshot.clusters94 ||= [];
      for (const group of omittedGroups) snapshot.clusters94.push(makeCluster(group));
    }

    state.detailedUnits = snapshot.units.length;
    state.omittedUnits = omitted;
    state.clusters = omittedGroups.length;
    state.totalOmitted += omitted;
    state.totalClusters += omittedGroups.length;
    state.lastLodMs = performance.now() - started;
    state.maxLodMs = Math.max(state.maxLodMs, state.lastLodMs);
    return snapshot;
  }

  const originalSnapshot = Game.prototype.buildRenderSnapshotV9;
  if (typeof originalSnapshot === 'function' && !originalSnapshot.__fdAdaptiveLod195Wrapped) {
    const wrapped = function(...args) {
      const snapshot = originalSnapshot.apply(this, args);
      return applyLod(this, snapshot);
    };
    Object.defineProperty(wrapped, '__fdAdaptiveLod195Wrapped', { value: true });
    Object.defineProperty(wrapped, '__fdAdaptiveLod195Original', { value: originalSnapshot });
    Game.prototype.buildRenderSnapshotV9 = wrapped;
    state.installed = true;
  }

  function diagnostics() {
    return {
      version: VERSION,
      build: BUILD,
      installed: state.installed,
      touch: TOUCH,
      tier: state.tier,
      tierName: state.tierName,
      pressureTier: state.pressureTier,
      pressureReason: state.pressureReason,
      budget: state.budget,
      badSamples: state.badSamples,
      goodSamples: state.goodSamples,
      tierChanges: state.tierChanges,
      lastTransitionReason: state.lastTransitionReason,
      frames: state.frames,
      activeFrames: state.activeFrames,
      inputUnits: state.inputUnits,
      importantUnits: state.importantUnits,
      detailedUnits: state.detailedUnits,
      omittedUnits: state.omittedUnits,
      clusters: state.clusters,
      totalOmitted: state.totalOmitted,
      totalClusters: state.totalClusters,
      maxInputUnits: state.maxInputUnits,
      lastLodMs: state.lastLodMs,
      maxLodMs: state.maxLodMs,
      eventLoopP95: state.lastEventLoopP95,
      eventLoopMax: state.lastEventLoopMax,
      renderSnapshotP95: state.lastRenderSnapshotP95,
      renderSnapshotMax: state.lastRenderSnapshotMax,
    };
  }

  root.__FD_ADAPTIVE_LOD_195__ = {
    version: VERSION,
    build: BUILD,
    state,
    diagnostics,
    updatePressure: () => updatePressure(true),
    effectiveBudget: game => effectiveBudget(game),
  };
})();
