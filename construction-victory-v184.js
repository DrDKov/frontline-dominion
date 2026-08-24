(() => {
  'use strict';

  const root = globalThis;
  const D = root.__FD_DEBUG__;
  const Game = D?.Game;
  const Unit = D?.Unit;
  const Building = D?.Building;
  if (!Game || !Unit || !Building) return;
  if (Game.prototype.__fdConstructionVictory184Installed) return;
  Object.defineProperty(Game.prototype, '__fdConstructionVictory184Installed', { value: true, configurable: true });

  const VERSION = '16.8';
  const BUILD = 184;
  const HQ_TYPES = new Set(['hq', 'commandCenter', 'commandCentre']);
  const SENSOR_TYPES = new Set(['radar', 'sensorTower', 'commandRelay']);
  const AIRFIELD_TYPES = new Set(['airfield', 'advancedAirfield', 'droneBay']);
  const POWER_TYPES = new Set(['power', 'fusionPlant', 'solarArray', 'geothermalPlant']);
  const CAPTURE_SECONDS = 8;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const finite = (v, fallback = 0) => Number.isFinite(Number(v)) ? Number(v) : fallback;
  const progress = building => building?.completed ? 1 : clamp(finite(building?.buildProgress ?? building?.construction, 0), 0, 1);
  const isHQ = building => Boolean(building?.kind === 'building' && (HQ_TYPES.has(building.typeId) || building.stats?.isHQ || /command\s*center|командн.*центр/i.test(`${building.stats?.name || ''} ${building.stats?.role || ''}`)));
  const isInfantry = unit => Boolean(unit?.alive && unit.kind === 'unit' && !unit.air && !unit.embarkedIn && (unit.infantry || unit.stats?.infantry || unit.stats?.movementClass === 'infantry'));
  const dist = (a, b) => Math.hypot(finite(a?.x) - finite(b?.x), finite(a?.y) - finite(b?.y));

  const stats184 = {
    constructionRejected: 0,
    sensorSpamRejected: 0,
    scaffoldsCancelled: 0,
    maxPendingSeen: 0,
    legacyEndsSuppressed: 0,
    captureTicks: 0,
    capturesCompleted: 0,
    realBuildings: 0,
  };

  const role184 = building => {
    const type = building?.typeId;
    if (SENSOR_TYPES.has(type) || building?.stats?.radarRelay) return 'sensor';
    if (AIRFIELD_TYPES.has(type) || /airfield|drone bay|аэродром/i.test(`${type || ''} ${building?.stats?.name || ''}`)) return 'airfield';
    if (POWER_TYPES.has(type) || finite(building?.stats?.power) > 0) return 'power';
    if (building?.stats?.category === 'defense' || /turret|bunker|missile|abm|mine|tower/i.test(type || '')) return 'defense';
    return 'other';
  };

  function pendingBuildings184(game, team = 'enemy') {
    return (game.buildings || []).filter(building => building?.alive && building.team === team && !building._everCompleted184 && progress(building) < .999);
  }

  function constructionCaps184(game) {
    const difficulty = game.difficultyKey || 'normal';
    const threat = finite(game.ai?.fortressState183?.threatLevel);
    const global = difficulty === 'hard' ? 8 : difficulty === 'easy' ? 4 : 6;
    return {
      global: global + (threat >= 3 ? 2 : 0),
      sensor: 1,
      power: 1,
      airfield: difficulty === 'hard' ? 2 : 1,
      defense: threat >= 2 ? 3 : 2,
      other: 2,
    };
  }

  function markConstruction184(building, game) {
    if (!building || building.kind !== 'building') return;
    if (progress(building) >= .999 || building.completed) building._everCompleted184 = true;
    if (!building._everCompleted184) {
      building._constructionCreatedAt184 ??= finite(game.time);
      building._constructionLastProgress184 ??= progress(building);
      building._constructionLastChangedAt184 ??= finite(game.time);
    }
    if (isHQ(building) && !building._originalTeam184) building._originalTeam184 = building.team;
  }

  const baseAddEntity184 = Game.prototype.addEntity;
  Game.prototype.addEntity = function(entity) {
    if (entity?.kind === 'building' && entity.team === 'enemy' && progress(entity) < .999 && !entity.completed) {
      const pending = pendingBuildings184(this, 'enemy');
      const caps = constructionCaps184(this);
      const role = role184(entity);
      const sameRole = pending.filter(building => role184(building) === role).length;
      stats184.maxPendingSeen = Math.max(stats184.maxPendingSeen, pending.length);
      if (pending.length >= caps.global || sameRole >= finite(caps[role], caps.other)) {
        stats184.constructionRejected += 1;
        if (role === 'sensor') stats184.sensorSpamRejected += 1;
        entity._constructionRejected184 = true;
        entity.alive = false;
        if (entity.autoConstruct || entity.fortressDefense183 || entity.deepDefense182) {
          const team = this.teams?.enemy;
          const refund = finite(entity.stats?.cost);
          if (team && refund > 0) team.credits += refund;
        }
        return false;
      }
    }
    const result = baseAddEntity184.call(this, entity);
    if (entity?.kind === 'building') markConstruction184(entity, this);
    return result;
  };

  const baseBuildingUpdate184 = Building.prototype.update;
  if (typeof baseBuildingUpdate184 === 'function') {
    Building.prototype.update = function(dt) {
      const before = progress(this);
      const result = baseBuildingUpdate184.call(this, dt);
      const after = progress(this);
      if (after >= .999 || this.completed) this._everCompleted184 = true;
      if (after > before + .0001) {
        this._constructionLastProgress184 = after;
        this._constructionLastChangedAt184 = finite(this.game?.time);
      }
      return result;
    };
  }

  // The command center is an objective, not another structure to erase. It can
  // be suppressed to 1 HP but must remain physically present for infantry capture.
  const baseBuildingDamage184 = Building.prototype.takeDamage;
  if (typeof baseBuildingDamage184 === 'function') {
    Building.prototype.takeDamage = function(amount, ...rest) {
      if (!isHQ(this) || this._captured184) return baseBuildingDamage184.call(this, amount, ...rest);
      const safe = Math.max(0, Math.min(finite(amount), Math.max(0, finite(this.hp, 1) - 1)));
      if (safe <= 0) return false;
      return baseBuildingDamage184.call(this, safe, ...rest);
    };
  }

  function initializeBuildings184(game) {
    for (const building of game.buildings || []) markConstruction184(building, game);
  }

  function cleanupScaffolds184(game) {
    const now = finite(game.time);
    if (now < finite(game._nextScaffoldCleanup184)) return;
    game._nextScaffoldCleanup184 = now + 3;
    const pending = pendingBuildings184(game, 'enemy');
    stats184.maxPendingSeen = Math.max(stats184.maxPendingSeen, pending.length);
    const caps = constructionCaps184(game);
    const byRole = new Map();
    for (const building of pending) {
      const role = role184(building);
      let list = byRole.get(role); if (!list) byRole.set(role, list = []);
      list.push(building);
      const p = progress(building);
      if (p > finite(building._constructionLastProgress184) + .0001) {
        building._constructionLastProgress184 = p;
        building._constructionLastChangedAt184 = now;
      }
    }
    const cancel = building => {
      if (!building?.alive || building._everCompleted184) return;
      building.alive = false;
      building._constructionCancelled184 = true;
      game.spatial?.remove?.(building, 'buildings');
      game.spatial?.remove?.(building, 'sensors');
      if (game.entityMap?.get?.(building.id) === building) game.entityMap.delete(building.id);
      stats184.scaffoldsCancelled += 1;
    };
    for (const [role, list] of byRole) {
      list.sort((a, b) => finite(a._constructionCreatedAt184) - finite(b._constructionCreatedAt184));
      const roleCap = finite(caps[role], caps.other);
      for (const excess of list.slice(roleCap)) cancel(excess);
    }
    const survivors = pendingBuildings184(game, 'enemy').sort((a, b) => finite(a._constructionCreatedAt184) - finite(b._constructionCreatedAt184));
    for (const excess of survivors.slice(caps.global)) cancel(excess);
    for (const building of survivors.slice(0, caps.global)) {
      const age = now - finite(building._constructionCreatedAt184, now);
      const stalled = now - finite(building._constructionLastChangedAt184, now);
      if (age > 150 && stalled > 105 && progress(building) < .25) cancel(building);
    }
  }

  function realBuildings184(game, team) {
    const result = (game.buildings || []).filter(building => building?.alive && building.team === team && (building.completed || building._everCompleted184));
    stats184.realBuildings = result.length;
    return result;
  }

  function hqFor184(game, originalTeam) {
    const cacheKey = originalTeam === 'enemy' ? '_enemyHQ184' : '_playerHQ184';
    const cached = game[cacheKey];
    if (cached?.alive && isHQ(cached)) return cached;
    const found = (game.buildings || []).find(building => building?.alive && isHQ(building) && (building._originalTeam184 || building.team) === originalTeam) || null;
    game[cacheKey] = found;
    return found;
  }

  function unitsNear184(game, hq, radius) {
    try { return game.spatial?.queryRadius?.('units', hq.x, hq.y, radius) || []; }
    catch (_) { return (game.units || []).filter(unit => dist(unit, hq) <= radius); }
  }

  function updateCapture184(game, dt) {
    if (game._hqCaptureResolved184) return;
    initializeBuildings184(game);
    for (const originalTeam of ['enemy', 'player']) {
      const hq = hqFor184(game, originalTeam);
      if (!hq?.alive) continue;
      const attackerTeam = originalTeam === 'enemy' ? 'player' : 'enemy';
      const radius = Math.max(125, finite(hq.radius, 45) + 88);
      const nearby = unitsNear184(game, hq, radius + 60).filter(unit => unit?.alive && !unit.embarkedIn);
      const attackers = nearby.filter(unit => unit.team === attackerTeam && isInfantry(unit) && dist(unit, hq) <= radius);
      const defenders = nearby.filter(unit => unit.team === originalTeam && unit.stats?.weapon && dist(unit, hq) <= radius + 45);
      hq.captureProgress184 = finite(hq.captureProgress184);
      hq.captureTeam184 = attackerTeam;
      if (attackers.length && defenders.length < attackers.length) {
        const pressure = clamp(Math.sqrt(attackers.length) * (1 - defenders.length / Math.max(1, attackers.length)) * .75 + .25, .35, 3.0);
        hq.captureProgress184 = clamp(hq.captureProgress184 + dt / CAPTURE_SECONDS * pressure, 0, 1);
        stats184.captureTicks += 1;
        for (const unit of attackers) unit._capturingHQ184 = hq.id;
      } else if (!attackers.length) {
        hq.captureProgress184 = Math.max(0, hq.captureProgress184 - dt * .045);
      } else {
        hq.captureProgress184 = Math.max(0, hq.captureProgress184 - dt * .02);
      }
      if (hq.captureProgress184 >= 1) {
        completeCapture184(game, hq, attackerTeam);
        return;
      }
    }
  }

  function suppressLegacyEnd184(game) {
    if (!game?.ended || game._hqCaptureResolved184) return;
    game.ended = false;
    if (game.paused && !game._manualPause184) game.paused = false;
    game.winner = null;
    game.result = null;
    stats184.legacyEndsSuppressed += 1;
  }

  function outcomeText184(winner) {
    return winner === 'player'
      ? 'КОМАНДНЫЙ ЦЕНТР ПРОТИВНИКА ЗАХВАЧЕН — ПОБЕДА'
      : 'ВАШ КОМАНДНЫЙ ЦЕНТР ЗАХВАЧЕН — ПОРАЖЕНИЕ';
  }

  function completeCapture184(game, hq, winner) {
    if (game._hqCaptureResolved184) return;
    hq._captured184 = true;
    hq.capturedBy184 = winner;
    hq.captureProgress184 = 1;
    hq.team = winner;
    hq.completed = true;
    hq._everCompleted184 = true;
    hq.hp = Math.max(1, finite(hq.maxHp, 100) * .35);
    game._hqCaptureResolved184 = true;
    game._hqWinner184 = winner;
    game._hqCapturedId184 = hq.id;
    game.ended = true;
    game.paused = true;
    game.winner = winner;
    game.result = winner === 'player' ? 'victory' : 'defeat';
    game.objective = outcomeText184(winner);
    try { game.recalculatePower?.(); } catch (_) {}
    try { game.alert?.(outcomeText184(winner), winner === 'player' ? 'success' : 'danger', hq.x, hq.y); } catch (_) {}
    stats184.capturesCompleted += 1;
  }

  // Known legacy end/check hooks are allowed only after HQ capture. The post-tick
  // guard below additionally catches inline building-count victory code.
  for (const name of ['endGame', 'finishGame', 'finishMatch', 'endMatch', 'completeMatch', 'declareVictory', 'declareDefeat']) {
    const base = Game.prototype[name];
    if (typeof base !== 'function' || base._hq184Wrapped) continue;
    const wrapped = function(...args) {
      if (!this._hqCaptureResolved184) {
        stats184.legacyEndsSuppressed += 1;
        this.ended = false;
        return false;
      }
      return base.apply(this, args);
    };
    wrapped._hq184Wrapped = true;
    Game.prototype[name] = wrapped;
  }
  for (const name of ['checkVictory', 'checkDefeat', 'checkWinCondition', 'checkVictoryCondition', 'checkVictoryConditions', 'checkEndCondition', 'checkEndConditions']) {
    const base = Game.prototype[name];
    if (typeof base !== 'function' || base._hq184Wrapped) continue;
    const wrapped = function(...args) {
      if (!this._hqCaptureResolved184) return false;
      return base.apply(this, args);
    };
    wrapped._hq184Wrapped = true;
    Game.prototype[name] = wrapped;
  }

  const baseSimulate184 = Game.prototype.simulateFixed;
  Game.prototype.simulateFixed = function(dt) {
    suppressLegacyEnd184(this);
    initializeBuildings184(this);
    cleanupScaffolds184(this);
    const result = baseSimulate184.call(this, dt);
    suppressLegacyEnd184(this);
    updateCapture184(this, finite(dt, 1 / 25));
    if (!this._hqCaptureResolved184) this.objective = 'Захватите командный центр противника пехотой';
    return result;
  };

  function showOutcome184(game, winner) {
    if (typeof document === 'undefined' || document.getElementById('fd-hq-outcome184')) return;
    const overlay = document.createElement('div');
    overlay.id = 'fd-hq-outcome184';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;background:rgba(3,8,12,.82);backdrop-filter:blur(5px);color:#eef8fc;font-family:system-ui,sans-serif';
    const panel = document.createElement('div');
    panel.style.cssText = 'max-width:680px;margin:24px;padding:34px 38px;border:1px solid rgba(170,215,236,.42);border-radius:16px;background:rgba(7,18,26,.96);text-align:center;box-shadow:0 24px 90px rgba(0,0,0,.58)';
    panel.innerHTML = `<div style="font-size:12px;letter-spacing:.16em;color:#9fc6d9;font-weight:800">FRONTLINE DOMINION · BUILD ${BUILD}</div><div style="margin:14px 0 8px;font-size:clamp(30px,6vw,58px);font-weight:900;line-height:1">${winner === 'player' ? 'ПОБЕДА' : 'ПОРАЖЕНИЕ'}</div><div style="color:#bed1da;font-size:16px;line-height:1.55">${outcomeText184(winner)}</div>`;
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
  }

  if (typeof document !== 'undefined') {
    const uiTick = () => {
      const game = D.game;
      if (game) {
        const enemyHQ = hqFor184(game, 'enemy');
        const playerHQ = hqFor184(game, 'player');
        let winner = game._hqWinner184 || null;
        if (!winner && enemyHQ?._originalTeam184 === 'enemy' && enemyHQ.team === 'player') winner = 'player';
        if (!winner && playerHQ?._originalTeam184 === 'player' && playerHQ.team === 'enemy') winner = 'enemy';
        const objective = document.getElementById('objective-text');
        if (!winner && objective) {
          const pct = enemyHQ ? Math.round(finite(enemyHQ.captureProgress184) * 100) : 0;
          objective.textContent = pct > 0
            ? `Захватите командный центр противника · захват ${pct}%`
            : 'Захватите командный центр противника пехотой';
        }
        if (winner) showOutcome184(game, winner);
      }
      requestAnimationFrame(uiTick);
    };
    requestAnimationFrame(uiTick);
  }

  Game.prototype.realObjectiveBuildings184 = function(team = 'enemy') { return realBuildings184(this, team); };
  Game.prototype.constructionVictoryDiagnostics184 = function() {
    const pending = pendingBuildings184(this, 'enemy');
    const enemyHQ = hqFor184(this, 'enemy');
    return {
      version: '16.8.1', build: 185, ...stats184,
      pending: pending.length,
      pendingSensors: pending.filter(building => role184(building) === 'sensor').length,
      caps: constructionCaps184(this),
      objective: 'capture-command-center',
      winner: this._hqWinner184 || null,
      captureResolved: Boolean(this._hqCaptureResolved184),
      captureProgress: finite(enemyHQ?.captureProgress184, 0),
      commandCenterId: enemyHQ?.id || null,
    };
  };

  root.__FD_CONSTRUCTION_VICTORY_184__ = { version: VERSION, build: BUILD, isHQ, progress, pendingBuildings: pendingBuildings184 };
})();
