(() => {
  'use strict';

  const root = globalThis;
  const D = root.__FD_DEBUG__;
  const L = root.__FD_LOGISTICS206__;
  const Game = D?.Game;
  if (!Game?.prototype || !L || root.__FD_EXTRACTOR_VISIBILITY_HAUL_213__) return;

  const BUILD = 213;
  const VERSION = '16.9.7';
  const state = {
    visibilityPasses: 0,
    extractorsPinned: 0,
    fogCellsPinned: 0,
    hydrateRepairs: 0,
    snapshotRepairs: 0,
    contextAssignments: 0,
    contextRejected: 0,
    lastExtractorId: null,
  };

  const finite = value => Number.isFinite(Number(value));
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  function isFriendlyExtractor213(game, building) {
    if (!game || !building?.alive || building.kind !== 'building' || building.team !== 'player') return false;
    try { return Boolean(L.ensureExtractor(building)); }
    catch (_) { return false; }
  }

  function markFogIndex213(game, index) {
    if (!Number.isInteger(index) || index < 0) return 0;
    let changed = 0;
    const visible = game?.visible;
    if (visible && index < visible.length) {
      if (!visible[index]) changed += 1;
      visible[index] = 1;
    }
    // Builds have used both explored/seen names over time.  Only touch arrays
    // that already exist; never create a parallel fog authority.
    for (const key of ['explored', 'seen']) {
      const field = game?.[key];
      if (field && typeof field.length === 'number' && index < field.length) field[index] = 1;
    }
    return changed;
  }

  function pinExtractor213(game, building) {
    if (!isFriendlyExtractor213(game, building) || typeof game.fogIndexAt !== 'function') return 0;
    const radius = Math.max(125, (Number(building.radius) || 42) + 92);
    // 72 world units is intentionally smaller than the historical fog cell.
    // It covers the complete rendered footprint without revealing a large area.
    const step = 72;
    let changed = 0;
    const samples = [[0, 0]];
    for (let dy = -radius; dy <= radius + 0.01; dy += step) {
      for (let dx = -radius; dx <= radius + 0.01; dx += step) {
        if (dx * dx + dy * dy <= radius * radius) samples.push([dx, dy]);
      }
    }
    for (const [dx, dy] of samples) {
      const x = clamp((Number(building.x) || 0) + dx, 0, Number(D.WORLD?.width) || 32000);
      const y = clamp((Number(building.y) || 0) + dy, 0, Number(D.WORLD?.height) || 22000);
      let index = -1;
      try { index = Number(game.fogIndexAt(x, y)); } catch (_) { continue; }
      changed += markFogIndex213(game, index);
    }
    state.extractorsPinned += 1;
    state.fogCellsPinned += changed;
    state.lastExtractorId = building.id || null;
    return changed;
  }

  function pinFriendlyExtractors213(game) {
    if (!game) return 0;
    state.visibilityPasses += 1;
    let changed = 0;
    for (const building of game.buildings || []) changed += pinExtractor213(game, building);
    return changed;
  }

  const baseVisibility = Game.prototype.updateVisibilityV9;
  if (typeof baseVisibility === 'function') {
    Game.prototype.updateVisibilityV9 = function updateFriendlyExtractorVisibility213(...args) {
      const result = baseVisibility.apply(this, args);
      pinFriendlyExtractors213(this);
      return result;
    };
    Object.defineProperty(Game.prototype.updateVisibilityV9, '__fdFriendlyExtractorVisibility213', { value: true });
    // Keep callers using the legacy alias on the same final owner.
    Game.prototype.updateVisibility = function updateFriendlyExtractorVisibilityAlias213(force = false) {
      return this.updateVisibilityV9(force);
    };
  }

  const baseHydrate = Game.prototype.hydrate;
  if (typeof baseHydrate === 'function') {
    Game.prototype.hydrate = function hydrateFriendlyExtractorVisibility213(data, ...args) {
      const result = baseHydrate.call(this, data, ...args);
      try { this.updateVisibilityV9?.(true); } catch (_) { pinFriendlyExtractors213(this); }
      pinFriendlyExtractors213(this);
      state.hydrateRepairs += 1;
      return result;
    };
    Object.defineProperty(Game.prototype.hydrate, '__fdFriendlyExtractorVisibility213', { value: true });
  }

  const baseSnapshot = Game.prototype.buildRenderSnapshotV9;
  if (typeof baseSnapshot === 'function') {
    Game.prototype.buildRenderSnapshotV9 = function buildFriendlyExtractorSnapshot213(...args) {
      pinFriendlyExtractors213(this);
      const snapshot = baseSnapshot.apply(this, args);
      if (!snapshot || !Array.isArray(snapshot.buildings)) return snapshot;
      const present = new Set(snapshot.buildings.filter(Boolean).map(building => String(building.id)));
      for (const building of this.buildings || []) {
        if (!isFriendlyExtractor213(this, building) || present.has(String(building.id))) continue;
        snapshot.buildings.push(building);
        present.add(String(building.id));
        state.snapshotRepairs += 1;
      }
      return snapshot;
    };
    Object.defineProperty(Game.prototype.buildRenderSnapshotV9, '__fdFriendlyExtractorVisibility213', { value: true });
  }

  // Main-thread render is a final safety net against a visibility array copied
  // from an authoritative snapshot between visibility ticks.
  const baseRender = Game.prototype.render;
  if (typeof baseRender === 'function' && typeof document !== 'undefined') {
    Game.prototype.render = function renderFriendlyExtractorVisibility213(...args) {
      pinFriendlyExtractors213(this);
      return baseRender.apply(this, args);
    };
    Object.defineProperty(Game.prototype.render, '__fdFriendlyExtractorVisibility213', { value: true });
  }

  function selectedFriendlyTrucks213(game) {
    const selected = game?.getSelectedUnits?.() || game?.selected || [];
    return (Array.isArray(selected) ? selected : []).filter(unit =>
      unit?.alive && unit.team === 'player' && L.isTruck(unit)
    );
  }

  function hitContext213(game, x, y) {
    let target = null;
    try { target = game?.hitTestForContext?.(x, y) || null; } catch (_) {}
    if (!target) {
      try { target = game?.hitTest?.(x, y, false) || null; } catch (_) {}
    }
    if (!target) {
      // Pixel hit-testing can lag one render frame immediately after load.  Use
      // a narrow physical fallback only for friendly extractors.
      const candidates = (game?.buildings || []).filter(building => isFriendlyExtractor213(game, building));
      candidates.sort((a, b) => {
        const da = Math.hypot((Number(a.x) || 0) - x, (Number(a.y) || 0) - y);
        const db = Math.hypot((Number(b.x) || 0) - x, (Number(b.y) || 0) - y);
        return da - db || String(a.id).localeCompare(String(b.id), 'en');
      });
      const candidate = candidates[0];
      const hitRadius = Math.max(70, (Number(candidate?.radius) || 0) + 54);
      if (candidate && Math.hypot((Number(candidate.x) || 0) - x, (Number(candidate.y) || 0) - y) <= hitRadius) target = candidate;
    }
    return target;
  }

  Game.prototype.assignExtractorHaul213 = function assignExtractorHaul213(payload = {}) {
    const extractor = this.getEntity?.(payload.extractorId || payload.sourceNodeId);
    const truckIds = (payload.truckIds || payload.unitIds || [payload.truckId]).filter(Boolean);
    const trucks = truckIds.map(id => this.getEntity?.(id)).filter(unit => unit?.alive && unit.team === 'player' && L.isTruck(unit));
    if (!isFriendlyExtractor213(this, extractor) || !trucks.length) {
      state.contextRejected += 1;
      return false;
    }
    const ok = this.setLogisticsMission206?.({
      truckIds: trucks.map(unit => unit.id),
      missionType: 'EXTRACT_RESOURCE',
      sourceNodeId: extractor.id,
      destinationNodeId: payload.destinationNodeId || null,
    });
    if (ok !== false) {
      state.contextAssignments += trucks.length;
      state.lastExtractorId = extractor.id;
      this.uiDirty = true;
      return true;
    }
    state.contextRejected += 1;
    return false;
  };

  const baseIssueContext = Game.prototype.issueContext;
  if (typeof baseIssueContext === 'function') {
    Game.prototype.issueContext = function issueExtractorHaulContext213(x, y, append = false, ...rest) {
      const trucks = selectedFriendlyTrucks213(this);
      if (trucks.length && finite(x) && finite(y)) {
        const target = hitContext213(this, Number(x), Number(y));
        if (isFriendlyExtractor213(this, target)) {
          return this.assignExtractorHaul213({ truckIds: trucks.map(unit => unit.id), extractorId: target.id });
        }
      }
      return baseIssueContext.call(this, x, y, append, ...rest);
    };
    Object.defineProperty(Game.prototype.issueContext, '__fdExtractorHaulContext213', { value: true });
  }

  root.__FD_EXTRACTOR_VISIBILITY_HAUL_213__ = Object.freeze({
    version: VERSION,
    build: BUILD,
    friendlyExtractorFogPinning: true,
    hydrateVisibilityRepair: true,
    snapshotFriendlyExtractorRepair: true,
    contextExtractorHaul: true,
    pinFriendlyExtractors: pinFriendlyExtractors213,
    diagnostics: () => ({ ...state }),
  });
})();
