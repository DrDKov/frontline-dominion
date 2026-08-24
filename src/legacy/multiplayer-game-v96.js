(() => {
  'use strict';

  const debug = window.__FD_DEBUG__;
  const Game = debug?.Game;
  if (!debug || !Game) return;

  const state = {
    active: false,
    applying: false,
    role: null,
    roomCode: null,
    clientId: null,
    hostTick: null,
    queue: [],
    seen: new Set(),
    startTimer: 0,
    lastStatusTick: -1,
    lastAppliedSeq: 0,
    lastResyncAt: 0,
    status: 'idle',
    matchSeed: null,
    mode: 'coop',
    controlTeam: 'player',
    canonicalTeam: 'player',
    localPerspectiveSwapped: false,
    perspectiveDepth: 0,
    hostTickReceivedAt: 0,
    config: null
  };

  const send = (type, detail = {}) => {
    window.parent.postMessage({ type, ...detail }, window.location.origin);
  };
  const idsOf = (items = []) => items.filter(Boolean).map((item) => typeof item === 'string' ? item : item.id).filter(Boolean);
  const selectedIds = (game, team = state.controlTeam) => idsOf(game?.selected?.filter((entity) => entity?.alive && entity.team === team));
  const entity = (game, id) => id ? game?.getEntity?.(id) : null;

  function flipTeam(value) {
    return value === 'player' ? 'enemy' : value === 'enemy' ? 'player' : value;
  }

  function swapPerspective(game) {
    [game.teams.player, game.teams.enemy] = [game.teams.enemy, game.teams.player];
    [game.playerBase, game.enemyBase] = [game.enemyBase, game.playerBase];
    if (game._v9SensorCache) [game._v9SensorCache.player, game._v9SensorCache.enemy] = [game._v9SensorCache.enemy, game._v9SensorCache.player];
    if (game._teamAirFleetState93) {
      [game._teamAirFleetState93.player, game._teamAirFleetState93.enemy] = [game._teamAirFleetState93.enemy, game._teamAirFleetState93.player];
    }
    if (game._v94MiniCells) {
      for (const cell of game._v94MiniCells.values()) [cell.p, cell.e] = [cell.e, cell.p];
      game._v94MiniDirty = true;
    }
    for (const group of game.formations?.values?.() || []) {
      if ('team' in group) group.team = flipTeam(group.team);
    }
    for (const collection of [game.units, game.buildings, game.projectiles, game.abilityZones, game.spyCells]) {
      for (const item of collection || []) {
        if ('team' in item) item.team = flipTeam(item.team);
        if ('ownerTeam' in item) item.ownerTeam = flipTeam(item.ownerTeam);
      }
    }
  }

  function withPerspective(game, team, operation) {
    if (!game || state.mode !== 'versus' || team !== 'enemy' || state.perspectiveDepth > 0) return operation();
    state.perspectiveDepth += 1;
    swapPerspective(game);
    try { return operation(); }
    finally {
      swapPerspective(game);
      state.perspectiveDepth -= 1;
    }
  }

  function ensureLocalPerspective(game) {
    const shouldSwap = state.mode === 'versus' && state.role === 'guest';
    if (!game || shouldSwap === state.localPerspectiveSwapped) return;
    swapPerspective(game);
    state.localPerspectiveSwapped = shouldSwap;
  }

  function localTeamFor(canonicalTeam) {
    return state.localPerspectiveSwapped ? flipTeam(canonicalTeam) : canonicalTeam;
  }

  function emitIntent(action, payload = {}, selection = null) {
    const game = debug.game;
    if (!state.active || !game) return false;
    send('fd:mp-intent', {
      intent: {
        id: `${state.clientId || 'player'}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`,
        action,
        payload,
        selectedIds: selection || selectedIds(game),
        team: state.canonicalTeam,
        tick: game.simTick || 0
      }
    });
    return true;
  }

  function withSelection(game, ids, team, operation) {
    const previous = selectedIds(game, state.controlTeam);
    const next = (ids || []).map((id) => entity(game, id)).filter((item) => item?.alive && item.team === team);
    game.setSelection?.(next, false);
    try { return withPerspective(game, team, operation); }
    finally {
      const restore = previous.map((id) => entity(game, id)).filter((item) => item?.alive && item.team === state.controlTeam);
      game.setSelection?.(restore, false);
    }
  }

  const originals = {};
  function wrap(name, intercept) {
    if (typeof Game.prototype[name] !== 'function' || originals[name]) return;
    const original = Game.prototype[name];
    originals[name] = original;
    Game.prototype[name] = function(...args) {
      if (!state.active || state.applying) return original.apply(this, args);
      return intercept.call(this, args, original);
    };
  }

  const baseGetSelectedUnits = Game.prototype.getSelectedUnits;
  Game.prototype.getSelectedUnits = function() {
    if (state.active && state.mode === 'versus' && state.controlTeam === 'enemy' && state.perspectiveDepth === 0) {
      return this.selected.filter((item) => item?.alive && item.kind === 'unit' && item.team === 'enemy');
    }
    return baseGetSelectedUnits.call(this);
  };

  function perspectiveMethod(name) {
    const original = Game.prototype[name];
    if (typeof original !== 'function') return;
    Game.prototype[name] = function(...args) {
      if (!state.active || state.mode !== 'versus' || state.controlTeam !== 'enemy' || state.perspectiveDepth > 0) {
        return original.apply(this, args);
      }
      return withPerspective(this, 'enemy', () => original.apply(this, args));
    };
  }

  for (const name of [
    'selectAt', 'selectRect', 'hitTest', 'assignControlGroup',
    'updateUI', 'updateVisibilityV9', 'render',
    'beginBuild', 'activatePower', 'activateLauncherWeapon'
  ]) perspectiveMethod(name);

  const baseEndGame = Game.prototype.endGame;
  Game.prototype.endGame = function(victory) {
    const result = baseEndGame.call(this, victory);
    if (!state.active || state.mode !== 'versus') return result;
    const localVictory = state.controlTeam === 'player' ? Boolean(victory) : !victory;
    const eyebrow = document.getElementById('end-eyebrow');
    const title = document.getElementById('end-title');
    const stats = document.getElementById('end-stats');
    if (eyebrow) void 0;
    if (title) title.textContent = localVictory ? 'Победа в противостоянии' : 'Поражение в противостоянии';
    if (stats) stats.textContent = `Бой 1×1 завершён · Время: ${Math.floor(this.time / 60).toString().padStart(2, '0')}:${Math.floor(this.time % 60).toString().padStart(2, '0')} · ${localVictory ? 'Поле боя осталось за вами' : 'Соперник сохранил боеспособную базу'}`;
    return result;
  };

  const selectionCommand = (name, action, encode = (args) => args) => wrap(name, function(args) {
    emitIntent(action, encode(args), selectedIds(this));
    return true;
  });

  selectionCommand('issueMove', 'move', ([x, y, append]) => ({ x, y, append: Boolean(append) }));
  selectionCommand('issueAttackMove', 'attackMove', ([x, y, append]) => ({ x, y, append: Boolean(append) }));
  selectionCommand('issuePatrol', 'patrol', ([x, y, append]) => ({ x, y, append: Boolean(append) }));
  selectionCommand('issueStop', 'stop', () => ({}));
  selectionCommand('issueHold', 'hold', () => ({}));
  selectionCommand('issueFireDiscipline177', 'fireDiscipline177', ([mode]) => ({ mode: mode === 'free' ? 'free' : mode === 'hold' ? 'hold' : null }));
  wrap('issueContext', function([x, y, append]) {
    const target = this.hitTestForContext?.(x, y) || this.hitTest?.(x, y, false);
    emitIntent('context', { x, y, append: Boolean(append), targetId: target?.id || null }, selectedIds(this));
    return true;
  });
  selectionCommand('issueOrientedMove78', 'orientedMove', ([x, y, angle, append]) => ({ x, y, angle, append: Boolean(append) }));
  selectionCommand('unloadSelectedTransports78', 'unload', () => ({}));
  selectionCommand('issueAirReturn93', 'airReturn', () => ({}));
  selectionCommand('sellSelectedBuilding', 'sell', () => ({}));

  const logisticsOwned206 = (game, payload = {}) => {
    const id = payload.buildingId || payload.entityId || payload.homeNodeId || payload.truckId || payload.truckIds?.[0] || payload.unitIds?.[0];
    const item = id ? game.getEntity?.(id) : null;
    return !item || item.team === state.controlTeam;
  };
  for (const [method, action] of [
    ['setLogisticsMission206','logisticsMission'], ['setSupplyPriority206','logisticsPriority'],
    ['setSupplyThreshold206','logisticsThreshold'], ['configureTradeContract206','logisticsTrade'],
    ['emergencyPurchase206','logisticsEmergencyImport'], ['createSupplyTransport206','logisticsCreateTransport']
  ]) wrap(method, function([payload = {}], original) {
    if (!logisticsOwned206(this, payload)) return original.call(this, payload);
    emitIntent(action, JSON.parse(JSON.stringify(payload || {})), selectedIds(this));
    return true;
  });

  wrap('issueAttack', function([target, append]) {
    if (!target?.id) return false;
    emitIntent('attack', { targetId: target.id, append: Boolean(append) }, selectedIds(this));
    return true;
  });

  wrap('issueCovertMission', function([target, mission, append, units]) {
    if (!target?.id) return false;
    emitIntent('covert', {
      targetId: target.id,
      mission: mission || null,
      append: Boolean(append),
      unitIds: idsOf(units)
    }, selectedIds(this));
    return true;
  });

  wrap('placeBuilding', function([x, y, append, rotation]) {
    if (!this.buildMode?.typeId) return false;
    emitIntent('build', {
      x, y, append: Boolean(append), rotation,
      typeId: this.buildMode.typeId,
      workerIds: [...(this.buildMode.workerIds || [])]
    }, selectedIds(this));
    return true;
  });

  wrap('queueProduction', function([building, itemId, kind = 'unit', silent = false], original) {
    if (silent || building?.team !== state.controlTeam) return original.apply(this, [building, itemId, kind, silent]);
    if (!building?.id) return false;
    emitIntent('produce', { buildingId: building.id, itemId, kind }, selectedIds(this));
    return true;
  });

  wrap('cancelQueueItem', function([building, index]) {
    if (!building?.id || building.team !== state.controlTeam) return false;
    emitIntent('cancelProduction', { buildingId: building.id, index }, selectedIds(this));
    return true;
  });

  wrap('executePower', function([power, x, y]) {
    emitIntent('power', { power, x, y }, selectedIds(this));
    return true;
  });

  wrap('launchStrategicWeapon', function([weapon, x, y, team = 'player', launcherId = null], original) {
    if (team !== 'player') return original.apply(this, [weapon, x, y, team, launcherId]);
    emitIntent('strategic', { weapon, x, y, launcherId }, selectedIds(this));
    return true;
  });

  wrap('setRallyPoint91', function([buildingOrId, x, y]) {
    const buildingId = typeof buildingOrId === 'string' ? buildingOrId : buildingOrId?.id;
    if (!buildingId) return false;
    emitIntent('rally', { buildingId, x, y }, selectedIds(this));
    return true;
  });

  wrap('applyUnitModification', function([unit, variant, silent = false], original) {
    if (silent || unit?.team !== state.controlTeam) return original.apply(this, [unit, variant, silent]);
    if (!unit?.id) return false;
    emitIntent('modify', { unitId: unit.id, variant }, selectedIds(this));
    return true;
  });

  wrap('issueLoadTransport95', function([transport, units, append]) {
    if (!transport?.id) return false;
    emitIntent('loadTransport', {
      transportId: transport.id,
      unitIds: idsOf(units || this.getSelectedUnits?.()),
      append: Boolean(append)
    }, selectedIds(this));
    return true;
  });

  function replayContext(game, payload) {
    const forcedTarget = entity(game, payload.targetId);
    if (!forcedTarget) return originals.issueContext?.call(game, payload.x, payload.y, payload.append);
    const previousContextHit = game.hitTestForContext;
    const previousHit = game.hitTest;
    game.hitTestForContext = () => forcedTarget;
    game.hitTest = (_x, _y, selectableOnly = true) => selectableOnly
      ? previousHit.call(game, _x, _y, selectableOnly)
      : forcedTarget;
    try {
      return originals.issueContext?.call(game, payload.x, payload.y, payload.append);
    } finally {
      game.hitTestForContext = previousContextHit;
      game.hitTest = previousHit;
    }
  }

  function replay(event) {
    const game = debug.game;
    if (!game || !event?.action) return;
    const p = event.payload || {};
    const canonicalTeam = state.mode === 'versus' && event.team === 'enemy' ? 'enemy' : 'player';
    const commandTeam = localTeamFor(canonicalTeam);
    state.applying = true;
    try {
      withSelection(game, event.selectedIds, commandTeam, () => {
        // withSelection has already entered the sender's canonical
        // perspective, therefore every entity the sender may mutate must be
        // the local `player` entity here. Targets may still be hostile.
        const owned = (id, kind = null) => {
          const item = entity(game, id);
          return item?.alive && item.team === 'player' && (!kind || item.kind === kind) ? item : null;
        };
        const ownedUnits = (ids) => (ids || []).map((id) => owned(id, 'unit')).filter(Boolean);
        switch (event.action) {
          case 'move': return originals.issueMove?.call(game, p.x, p.y, p.append);
          case 'attack': return originals.issueAttack?.call(game, entity(game, p.targetId), p.append);
          case 'attackMove': return originals.issueAttackMove?.call(game, p.x, p.y, p.append);
          case 'patrol': return originals.issuePatrol?.call(game, p.x, p.y, p.append);
          case 'stop': return originals.issueStop?.call(game);
          case 'hold': return originals.issueHold?.call(game);
          case 'fireDiscipline177': return originals.issueFireDiscipline177?.call(game, p.mode);
          case 'context': return replayContext(game, p);
          case 'orientedMove': return originals.issueOrientedMove78?.call(game, p.x, p.y, p.angle, p.append);
          case 'covert': {
            const agents = ownedUnits(p.unitIds);
            if (!agents.length) return false;
            return originals.issueCovertMission?.call(game, entity(game, p.targetId), p.mission, p.append, agents);
          }
          case 'build':
            {
              const workers = ownedUnits(p.workerIds).filter((unit) => unit.typeId === 'worker');
              if (!workers.length || workers.length !== (p.workerIds || []).length) return false;
              game.buildMode = { typeId: p.typeId, workerIds: workers.map((unit) => unit.id), rotation: p.rotation || 0 };
            }
            return originals.placeBuilding?.call(game, p.x, p.y, p.append, p.rotation);
          case 'produce': {
            const building = owned(p.buildingId, 'building');
            return building ? originals.queueProduction?.call(game, building, p.itemId, p.kind, false) : false;
          }
          case 'cancelProduction': {
            const building = owned(p.buildingId, 'building');
            return building ? originals.cancelQueueItem?.call(game, building, p.index) : false;
          }
          case 'sell': return originals.sellSelectedBuilding?.call(game);
          case 'power': return originals.executePower?.call(game, p.power, p.x, p.y);
          case 'strategic': {
            if (p.launcherId && !owned(p.launcherId)) return false;
            return originals.launchStrategicWeapon?.call(game, p.weapon, p.x, p.y, 'player', p.launcherId || null);
          }
          case 'rally': {
            const building = owned(p.buildingId, 'building');
            return building ? originals.setRallyPoint91?.call(game, building, p.x, p.y) : false;
          }
          case 'modify': {
            const unit = owned(p.unitId, 'unit');
            return unit ? originals.applyUnitModification?.call(game, unit, p.variant, false) : false;
          }
          case 'modifyBatch': return game.applyUnitModificationBatch132?.(p.unitIds || [], p.variant, false);
          case 'loadTransport': {
            const transport = owned(p.transportId, 'unit');
            const units = ownedUnits(p.unitIds);
            if (!transport || !units.length || units.length !== (p.unitIds || []).length) return false;
            return originals.issueLoadTransport95?.call(game, transport, units, p.append);
          }
          case 'unload': return originals.unloadSelectedTransports78?.call(game);
          case 'airReturn': return originals.issueAirReturn93?.call(game);
          case 'logisticsMission': return originals.setLogisticsMission206?.call(game, p);
          case 'logisticsPriority': return originals.setSupplyPriority206?.call(game, p);
          case 'logisticsThreshold': return originals.setSupplyThreshold206?.call(game, p);
          case 'logisticsTrade': return originals.configureTradeContract206?.call(game, p);
          case 'logisticsEmergencyImport': return originals.emergencyPurchase206?.call(game, p);
          case 'logisticsCreateTransport': return originals.createSupplyTransport206?.call(game, p);
          case 'ping':
            game.addEffect?.({ type: 'marker', x: p.x, y: p.y, color: '#f3d57d', duration: 2.2 });
            game.addEffect?.({ type: 'text', x: p.x, y: p.y - 30, text: p.name ? `МЕТКА · ${p.name}` : 'МЕТКА СОЮЗНИКА', color: '#f3d57d', duration: 2.2 });
            game.alert?.(`${p.name || 'Союзник'}: тактическая метка`, 'info', p.x, p.y);
            if (p.focus) game.centerCamera?.(p.x, p.y);
            return true;
          default: return undefined;
        }
      });
    } catch (error) {
      console.error('[FD multiplayer] command failed', event, error);
      requestResync('ошибка применения приказа');
    } finally {
      state.applying = false;
    }
  }

  function applyDue(nextTick) {
    if (!state.queue.length) return;
    state.queue.sort((a, b) => (a.atTick - b.atTick) || (a.seq - b.seq));
    while (state.queue.length && state.queue[0].atTick <= nextTick) {
      const event = state.queue.shift();
      replay(event);
      state.lastAppliedSeq = Math.max(state.lastAppliedSeq, Number(event?.seq) || 0);
    }
  }

  function checksum(game) {
    let hash = 2166136261;
    const mix = (value) => {
      const text = String(value);
      for (let i = 0; i < text.length; i += 1) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
      }
    };
    mix(game.simTick || 0);
    mix(Math.round(game.time * 25));
    const canonicalPlayer = state.localPerspectiveSwapped ? game.teams?.enemy : game.teams?.player;
    const canonicalEnemy = state.localPerspectiveSwapped ? game.teams?.player : game.teams?.enemy;
    mix(Math.round(canonicalPlayer?.credits || 0));
    mix(Math.round(canonicalEnemy?.credits || 0));
    mix(game.rng?.seed || 0);
    mix(`${game.units.length}:${game.buildings.length}:${game.projectiles.length}`);
    const all = [...game.units, ...game.buildings];
    const stride = Math.max(1, Math.floor(all.length / 192));
    for (let i = 0; i < all.length; i += stride) {
      const item = all[i];
      if (!item?.alive) continue;
      mix(`${item.id}:${Math.round(item.x * 2)}:${Math.round(item.y * 2)}:${Math.round(item.hp)}:${item.currentCommand?.type || ''}`);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  }

  function postStatus(game) {
    if (window.__FD_MULTIPLAYER_ACTIVE__) { void '__fdAuthoritativeStatusOnly206'; return; }
    const tick = game?.simTick || 0;
    if (tick === state.lastStatusTick || tick % 5 !== 0) return;
    state.lastStatusTick = tick;
    send('fd:mp-status', {
      status: {
        tick,
        hash: checksum(game),
        units: game.units.length,
        buildings: game.buildings.length,
        gameTime: game.time,
        ended: Boolean(game.ended)
      }
    });
  }

  const baseSimulate = Game.prototype.simulateFixed;
  if (typeof baseSimulate === 'function') {
    Game.prototype.simulateFixed = function(dt) {
      if (!state.active) return baseSimulate.call(this, dt);
      const tick = this.simTick || 0;
      const authorityAge = performance.now() - state.hostTickReceivedAt;
      const hasAuthorityClock = state.role !== 'guest' || Number.isFinite(state.hostTick);
      const authorityFresh = state.role !== 'guest' || authorityAge < 2200;
      // The guest deliberately runs six fixed ticks behind the authoritative
      // host clock. We extrapolate between clock packets, so the simulation is
      // smooth, while the buffer absorbs mobile-network jitter and guarantees
      // that ordered commands arrive before their execution tick.
      const estimatedHostTick = state.role === 'guest'
        ? Number(state.hostTick || 0) + Math.max(0, Math.floor(authorityAge / 40))
        : tick;
      const targetGuestTick = Math.max(0, estimatedHostTick - 6);
      if (state.role === 'guest' && (!hasAuthorityClock || !authorityFresh || tick >= targetGuestTick + 1)) {
        document.body.dataset.fdSyncState = authorityFresh && hasAuthorityClock ? 'buffering' : 'waiting-authority';
        return undefined;
      }
      document.body.dataset.fdSyncState = 'synchronized';
      applyDue(tick + 1);
      // Mass-scale LOD previously depended on each player's camera and current
      // selection, so two browsers simulated different "hot" units. Feed it a
      // stable entity order during the tick; rendering keeps its own snapshot.
      const runDeterministicTick = () => {
        const localSelection = this.selected;
        const renderUnits = this.renderSnapshot?.units;
        this.selected = [];
        if (this.renderSnapshot) this.renderSnapshot.units = this.units;
        try { return baseSimulate.call(this, dt); }
        finally {
          this.selected = localSelection;
          if (this.renderSnapshot) this.renderSnapshot.units = renderUnits || [];
        }
      };
      let result = runDeterministicTick();
      let catchups = 0;
      while (state.role === 'guest' && targetGuestTick - (this.simTick || 0) > 2 && catchups < 2) {
        applyDue((this.simTick || 0) + 1);
        result = runDeterministicTick();
        catchups += 1;
      }
      postStatus(this);
      return result;
    };
  }

  function projectileSnapshot(projectile) {
    const data = {};
    for (const [key, value] of Object.entries(projectile)) {
      if (key === 'game' || typeof value === 'function') continue;
      if (value == null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') data[key] = value;
      else if (key === 'weapon' || key === 'trail') data[key] = JSON.parse(JSON.stringify(value));
    }
    data.preserveAim = true;
    return data;
  }

  function makeSnapshot(target, requestId) {
    const game = debug.game;
    const bridge = window.__FD_STABLE_STATE165__?.bridge;
    if (!game || state.role !== 'host' || !bridge?.ready || bridge.failed) return;

    let workerRequestId = 0;
    let timeout = 0;
    const finish = (event) => {
      const detail = event?.detail || {};
      if (!workerRequestId || Number(detail.requestId) !== workerRequestId) return;
      clearTimeout(timeout);
      window.removeEventListener('fd:authoritative-save206', finish);
      const data = detail.data || (detail.raw ? JSON.parse(detail.raw) : null);
      if (!data) return;
      data.__mp = {
        simTick: Number(data.authoritative172?.simTick ?? detail.tick ?? 0) || 0,
        rngSeed: Number(data.authoritative172?.rngSeed ?? game.rng?.seed ?? game.seed) || 0,
        mode: state.mode,
        hostFaction: state.config?.hostFaction || state.config?.faction,
        guestFaction: state.config?.guestFaction,
        appliedSeq: state.lastAppliedSeq,
        projectiles: Array.isArray(data.authoritative172?.projectiles)
          ? data.authoritative172.projectiles
          : game.projectiles.filter((item) => item.alive).map(projectileSnapshot)
      };
      send('fd:mp-snapshot', { target, requestId, baseSeq: state.lastAppliedSeq, snapshot: data });
    };
    window.addEventListener('fd:authoritative-save206', finish);
    workerRequestId = bridge.requestSave(false);
    if (!Number.isInteger(workerRequestId) || workerRequestId < 1) {
      window.removeEventListener('fd:authoritative-save206', finish);
      requestResync('Simulation Worker не подготовил снимок');
      return;
    }
    timeout = window.setTimeout(() => {
      window.removeEventListener('fd:authoritative-save206', finish);
      console.error('[FD multiplayer] authoritative resync snapshot timed out');
    }, 7000);
  }

  function restoreSnapshot(snapshot) {
    if (!snapshot?.entities || !snapshot.__mp) return;
    const baseSeq206 = Number(snapshot.__mp.appliedSeq) || 0;
    window.__FD_MP_RESYNC_HANDOFF_206__ = {
      active: true, baseSeq: baseSeq206, snapshotTick: Number(snapshot.__mp.simTick) || 0,
      startedAt: performance.now(), events: [], flushedCount: 0
    };
    const localCamera = debug.game?.camera ? { ...debug.game.camera } : null;
    debug.startGame({
      loadData: snapshot,
      faction: snapshot.teams?.player?.faction,
      difficulty: snapshot.difficultyKey
    });
    const game = debug.game;
    if (!game) return;
    state.localPerspectiveSwapped = false;
    ensureLocalPerspective(game);
    game.simTick = snapshot.__mp.simTick || Math.round(game.time * 25);
    if (game.rng) game.rng.seed = snapshot.__mp.rngSeed >>> 0;
    state.lastAppliedSeq = Number(snapshot.__mp.appliedSeq) || 0;
    state.queue = [];
    state.seen.clear();
    if (Array.isArray(snapshot.__mp.projectiles)) {
      game.projectiles = snapshot.__mp.projectiles.map((data) => {
        const projectile = new debug.Projectile(game, { ...data, preserveAim: true });
        Object.assign(projectile, data, { game, weapon: data.weapon || projectile.weapon, trail: data.trail || [] });
        return projectile;
      });
    }
    configureGame(game, false);
    if (localCamera) game.camera = { ...game.camera, ...localCamera };
    state.queue = state.queue.filter((event) => event.atTick > game.simTick);
    state.lastStatusTick = -1;
    game.alert?.('Связь восстановлена · состояние боя синхронизировано', 'info');
    send('fd:mp-resynced', { tick: game.simTick });
  }

  function requestResync(reason) {
    if (!state.active || state.role !== 'guest' || Date.now() - state.lastResyncAt < 8000) return;
    state.lastResyncAt = Date.now();
    send('fd:mp-resync-request', { reason });
  }

  function installModeBadge(game) {
    let badge = document.getElementById('fd-mp-side-badge');
    if (state.mode !== 'versus') {
      badge?.remove();
      document.body.dataset.fdMultiplayerMode = 'coop';
      return;
    }
    if (!badge) {
      const style = document.createElement('style');
      style.id = 'fd-mp-versus-style';
      style.textContent = `#fd-mp-side-badge{position:fixed;z-index:64;left:50%;top:72px;transform:translateX(-50%);display:flex;align-items:center;gap:9px;padding:7px 13px;border:1px solid rgba(113,220,153,.42);border-radius:4px;background:rgba(8,16,12,.86);box-shadow:0 8px 28px rgba(0,0,0,.28);color:#dcebe1;font:800 9px/1.2 system-ui;letter-spacing:.12em;pointer-events:none;backdrop-filter:blur(9px)}#fd-mp-side-badge i{width:7px;height:7px;border-radius:50%;background:#70dc99;box-shadow:0 0 12px #70dc99}#fd-mp-side-badge small{color:#7f9b89;font-size:8px;letter-spacing:.08em}@media(max-width:760px){#fd-mp-side-badge{top:58px;max-width:70vw;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}}`;
      document.head.appendChild(style);
      badge = document.createElement('div');
      badge.id = 'fd-mp-side-badge';
      document.body.appendChild(badge);
    }
    const side = state.canonicalTeam === 'player' ? 'АРМИЯ I · ЛЕВАЯ БАЗА' : 'АРМИЯ II · ПРАВАЯ БАЗА';
    const faction = game.teams?.player?.faction || '';
    badge.innerHTML = `<i></i><span>ВЫ · ${side}</span><small>${String(faction).toUpperCase()}</small>`;
    document.body.dataset.fdMultiplayerMode = 'versus';
    document.body.dataset.fdControlTeam = state.controlTeam;
  }

  function configureGame(game, fresh) {
    if (!game) return;
    ensureLocalPerspective(game);
    installModeBadge(game);
    if (state.mode !== 'versus') return;
    game.objective = 'Уничтожьте всю инфраструктуру соперника';
    if (game.difficulty) game.difficulty.aiBuild = 1;
    if (fresh && game.teams?.player && game.teams?.enemy) game.teams.enemy.credits = game.teams.player.credits;
    if (!fresh) {
      game.visible?.fill(0);
      game.explored?.fill(0);
      game._v9FogCounts?.fill(0);
      game._v9FogEmitters?.clear();
      game._v9FogInitialized = true;
    }
    if (game.ai) game.ai.update = () => undefined;
    game.updateEnemyStrategicArsenal = () => undefined;
    if (fresh && state.canonicalTeam === 'enemy') {
      game.centerCamera?.(game.playerBase.x - 150, game.playerBase.y);
      game.camera.yaw = Math.PI - 0.42;
      game.clampCamera?.();
      game.updateCameraReadout?.();
    }
    game.uiDirty = true;
    game.updateVisibility?.(true);
    game.updateUI?.(true);
    game.alert?.(state.canonicalTeam === 'player'
      ? 'Противостояние 1×1 · вы командуете левой армией'
      : 'Противостояние 1×1 · вы командуете правой армией', 'info');
  }

  function startMatch(config) {
    if (state.matchSeed === config.seed && (state.status === 'countdown' || state.status === 'playing')) return;
    state.matchSeed = config.seed;
    state.config = config;
    state.status = 'countdown';
    clearTimeout(state.startTimer);
    const run = () => {
      debug.startGame({
        faction: config.hostFaction || config.faction,
        enemyFaction: config.guestFaction,
        difficulty: config.difficulty,
        seed: config.seed
      });
      const game = debug.game;
      if (game) {
        state.localPerspectiveSwapped = false;
        game.simTick = 0;
        configureGame(game, true);
        if (state.mode !== 'versus') game.alert?.('Сетевая операция началась · армия общая для обоих командиров', 'info');
      }
      state.status = 'playing';
      send('fd:mp-started', { startedAt: Date.now() });
    };
    const wait = Math.max(0, (config.startAt || Date.now()) - Date.now());
    state.startTimer = window.setTimeout(run, wait);
  }

  window.addEventListener('message', (event) => {
    if (event.origin !== window.location.origin) return;
    const message = event.data || {};
    if (typeof message.type === 'string' && message.type.startsWith('fd:mp-')) document.body.dataset.fdMultiplayerMessage = message.type;
    if (message.type === 'fd:mp-start') {
      const nextSeed = message.config?.seed;
      const sameMatch = state.matchSeed === nextSeed && (state.status === 'countdown' || state.status === 'playing');
      state.active = true;
      state.role = message.role;
      state.mode = message.config?.mode === 'versus' ? 'versus' : 'coop';
      // Both browsers now use their own army as the local `player` side. The
      // stable canonical side is carried only over the network.
      state.controlTeam = 'player';
      state.canonicalTeam = state.mode === 'versus' && message.role === 'guest' ? 'enemy' : 'player';
      state.config = message.config || null;
      state.roomCode = message.roomCode;
      state.clientId = message.clientId;
      if (!sameMatch) {
        state.hostTick = null;
        state.hostTickReceivedAt = 0;
        state.lastAppliedSeq = 0;
        state.queue = [];
        state.seen.clear();
      }
      window.__FD_MULTIPLAYER_ACTIVE__ = true;
      startMatch(message.config || {});
    } else if (message.type === 'fd:mp-event' && message.event) {
      const item = message.event;
      if (!state.seen.has(item.id)) {
        state.seen.add(item.id);
        state.queue.push(item);
        if (state.seen.size > 6000) state.seen = new Set([...state.seen].slice(-3000));
      }
    } else if (message.type === 'fd:mp-host-tick') {
      state.hostTick = Number(message.tick) || 0;
      state.hostTickReceivedAt = performance.now();
    } else if (message.type === 'fd:mp-snapshot-request') {
      makeSnapshot(message.target, message.requestId);
    } else if (message.type === 'fd:mp-snapshot') {
      restoreSnapshot(message.snapshot);
    } else if (message.type === 'fd:mp-ping-center') {
      const game = debug.game;
      if (game) emitIntent('ping', { x: game.camera.x, y: game.camera.y, name: message.name || '', focus: false }, []);
    } else if (message.type === 'fd:mp-focus') {
      const game = debug.game;
      if (game && Number.isFinite(message.x) && Number.isFinite(message.y)) game.centerCamera?.(message.x, message.y);
    }
  });

  window.__FD_MULTIPLAYER__ = {
    version: '10.1',
    get active() { return state.active; },
    get applying() { return state.applying; },
    get role() { return state.role; },
    get mode() { return state.mode; },
    get controlTeam() { return state.controlTeam; },
    get canonicalTeam() { return state.canonicalTeam; },
    get roomCode() { return state.roomCode; },
    get hostTick() { return state.hostTick; },
    get hostTickReceivedAt() { return state.hostTickReceivedAt; },
    get localPerspectiveSwapped() { return state.localPerspectiveSwapped; },
    get lastAppliedSeq() { return state.lastAppliedSeq; },
    get config() { return state.config; },
    markWorkerApplied(seq) {
      const value = Number(seq) || 0;
      state.lastAppliedSeq = Math.max(state.lastAppliedSeq, value);
      state.queue = state.queue.filter(event => (Number(event?.seq) || 0) > state.lastAppliedSeq);
    },
    emitIntent,
    requestResync
  };

  document.body.dataset.fdMultiplayerReady = '10.1';
  send('fd:mp-ready', { version: '10.1', build: 205 });
})();
