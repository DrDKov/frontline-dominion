(() => {
  'use strict';
  const root = typeof window !== 'undefined' ? window : self;
  const L = root.__FD_LOGISTICS206__;
  const D = root.__FD_DEBUG__;
  if (!L || !D?.Game) return;
  const Game = D.Game;
  if (Game.prototype.__fdAuthoritativeLogistics206Installed) return;
  Object.defineProperty(Game.prototype, '__fdAuthoritativeLogistics206Installed', { value: true, configurable: true });

  const EPS = 1e-6;
  function fnvText(hash, value) {
    const text = String(value ?? '');
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619) >>> 0;
    }
    return hash >>> 0;
  }
  function fnvNumber(hash, value, scale = 1000) {
    const number = Math.round((Number(value) || 0) * scale) >>> 0;
    hash ^= number;
    return Math.imul(hash, 16777619) >>> 0;
  }
  function localTeam(canonicalTeam, perspectiveSwapped) {
    if (!perspectiveSwapped) return canonicalTeam;
    return canonicalTeam === 'player' ? 'enemy' : canonicalTeam === 'enemy' ? 'player' : canonicalTeam;
  }
  function mixManifest(hash, manifest) {
    for (const key of L.STOCK_KEYS) hash = fnvNumber(hash, manifest?.[key]);
    return hash;
  }
  function stableEntities(game) {
    return [...(game.buildings || []), ...(game.units || [])]
      .filter(entity => entity?.alive)
      .sort((a, b) => String(a.id).localeCompare(String(b.id), 'en'));
  }

  function canonicalLogisticsHash206(game, perspectiveSwapped = false) {
    L.scanEntities(game);
    const state = L.ensureGame(game);
    let hash = 2166136261 >>> 0;
    hash = fnvNumber(hash, game.simTick || 0, 1);
    for (const canonical of ['player', 'enemy']) {
      const local = localTeam(canonical, perspectiveSwapped);
      hash = fnvText(hash, canonical);
      hash = fnvNumber(hash, game.teams?.[local]?.credits, 100);
      const teamState = state.team?.[local] || {};
      hash = fnvNumber(hash, teamState.supportSpent, 100);
      hash = fnvNumber(hash, teamState.importSpent, 100);
      const contracts = teamState.contracts || {};
      for (const id of Object.keys(contracts).sort()) {
        hash = fnvText(hash, id);
        const byResource = contracts[id] || {};
        for (const resource of ['fuel', 'ammo']) {
          const contract = byResource[resource] || {};
          hash = fnvText(hash, resource);
          for (const key of ['mode', 'destinationNodeId']) hash = fnvText(hash, contract[key]);
          for (const key of ['targetAmount', 'fixedAmount', 'interval', 'nextExecution', 'currentPrice']) hash = fnvNumber(hash, contract[key]);
        }
      }
    }

    for (const entity of stableEntities(game)) {
      const s = entity.logistics206;
      if (!s && !Number.isFinite(entity.resourceBuffer83)) continue;
      hash = fnvText(hash, entity.id);
      // Team identity is canonicalized so versus guests hash the same state.
      const canonicalTeam = perspectiveSwapped
        ? (entity.team === 'player' ? 'enemy' : entity.team === 'enemy' ? 'player' : entity.team)
        : entity.team;
      hash = fnvText(hash, canonicalTeam);
      if (s?.stock) hash = mixManifest(hash, s.stock);
      if (s?.importBuffer) hash = mixManifest(hash, s.importBuffer);
      if (s?.cargo) hash = mixManifest(hash, s.cargo);
      for (const key of [
        'fuel', 'fuelMax', 'ammoReady', 'ammoReadyMax', 'ammoReserve', 'ammoReserveMax',
        'support', 'supportMax', 'routeRisk', 'reloadRemaining206', 'weaponReady206', 'weaponReadyMax206'
      ]) {
        if (Number.isFinite(s?.[key])) hash = fnvNumber(hash, s[key]);
      }
      for (const key of ['missionType', 'status', 'phase206', 'sourceNodeId', 'destinationNodeId', 'homeNodeId', 'targetGroupId']) {
        if (s?.[key] != null) hash = fnvText(hash, s[key]);
      }
      if (Number.isFinite(entity.resourceBuffer83)) hash = fnvNumber(hash, entity.resourceBuffer83);
      if (entity.resourceType206) hash = fnvText(hash, entity.resourceType206);
    }
    return hash >>> 0;
  }

  function conservationLedger206(game, team = null) {
    const physical = L.totalPhysical(game, team);
    const telemetry = L.ensureGame(game).telemetry;
    return {
      physical,
      created: {
        fuel: Number(telemetry.fuelProduced || 0) + Number(telemetry.fuelImported || 0),
        ammo: Number(telemetry.ammoProduced || 0) + Number(telemetry.ammoImported || 0),
        support: Number(telemetry.supportProduced || 0),
      },
      consumedOrLost: {
        fuel: Number(telemetry.fuelConsumed || 0) + Number(telemetry.fuelLostInTransit || 0),
        ammo: Number(telemetry.ammoConsumed || 0) + Number(telemetry.ammoLostInTransit || 0),
        support: Number(telemetry.supportConsumed || 0) + Number(telemetry.supportLostInTransit || 0),
      },
    };
  }

  Game.prototype.networkLogisticsHash206 = function(perspectiveSwapped = false) {
    return canonicalLogisticsHash206(this, Boolean(perspectiveSwapped));
  };
  Game.prototype.logisticsConservationLedger206 = function(team = null) {
    return conservationLedger206(this, team);
  };
  root.__FD_AUTHORITATIVE_LOGISTICS206__ = {
    version: '20.6', canonicalLogisticsHash206, conservationLedger206, EPS,
  };
})();
