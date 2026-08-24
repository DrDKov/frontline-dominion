(() => {
  'use strict';

  const root = globalThis;
  const D = root.__FD_DEBUG__;
  const Game = D?.Game;
  if (!Game?.prototype || root.__FD_POST_LOAD_COMMAND_RECOVERY_196__) return;

  const VERSION = '16.8.12';
  const BUILD = 196;
  const hasDocument = typeof document !== 'undefined';
  const state = {
    hydrateRepairs: 0,
    launchRepairs: 0,
    loadButtonRepairs: 0,
    entitiesRebound: 0,
    selectionsCanonicalized: 0,
    orphanFormationCommandsRepaired: 0,
    formationCountersRaised: 0,
    transientModesCleared: 0,
    bridgeRebinds: 0,
    bridgeUnpauses: 0,
    routedActions: 0,
    routeFallbacks: 0,
    lastAction: null,
    lastSelectedIds: [],
    lastSeq: 0,
    lastRepairReason: null,
    lastLoadedAt: null,
  };

  const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const clonePlain = value => {
    if (typeof structuredClone === 'function') {
      try { return structuredClone(value); } catch (_) {}
    }
    try { return JSON.parse(JSON.stringify(value)); } catch (_) { return value; }
  };
  const idNumber = value => {
    const match = String(value ?? '').match(/(\d+)(?!.*\d)/);
    return match ? Number(match[1]) || 0 : 0;
  };

  const formationMap = game => {
    const source = game?.formations;
    if (source instanceof Map) return source;
    const map = new Map();
    if (Array.isArray(source)) {
      for (const group of source) {
        if (group?.id != null) map.set(group.id, group);
      }
    } else if (source && typeof source === 'object') {
      for (const [key, group] of Object.entries(source)) {
        if (!group || typeof group !== 'object') continue;
        if (group.id == null) group.id = key;
        map.set(group.id, group);
      }
    }
    if (game && source != null) game.formations = map;
    return map;
  };

  const canonicalEntity = (game, entity) => {
    if (!entity) return null;
    if (entity.id != null && typeof game?.getEntity === 'function') return game.getEntity(entity.id) || entity;
    return entity;
  };

  const canonicalizeSelected = game => {
    if (!game) return [];
    const seen = new Set();
    const selected = [];
    for (const entity of game.selected || []) {
      const current = canonicalEntity(game, entity);
      if (!current?.alive) continue;
      const key = current.id ?? current;
      if (seen.has(key)) continue;
      seen.add(key);
      selected.push(current);
    }
    if (Array.isArray(game.units)) for (const unit of game.units) if (unit) unit.selected = false;
    if (Array.isArray(game.buildings)) for (const building of game.buildings) if (building) building.selected = false;
    if (Array.isArray(game.resources)) for (const resource of game.resources) if (resource) resource.selected = false;
    game.selected = selected;
    for (const entity of selected) {
      // Buildings deliberately remain flag-free. Build 196 owns their visual
      // outline through game.selected so no historical renderer can repaint a
      // second enlarged model.
      if (entity.kind !== 'building') entity.selected = true;
    }
    state.selectionsCanonicalized += 1;
    return selected;
  };

  const normalizeFormationCommand = (command, validIds) => {
    if (!command || typeof command !== 'object') return command;
    const groupId = command.formationGroupId ?? command.formationId;
    if (groupId == null || validIds.has(String(groupId))) return command;
    delete command.formationGroupId;
    delete command.formationId;
    delete command.formationSlot;
    delete command.formationFinalX140;
    delete command.formationFinalY140;
    delete command._formationSettled140;
    delete command._fdObstacleRecovery196;
    if (command.type === 'formation') {
      if (Number.isFinite(command.x) && Number.isFinite(command.y)) command.type = 'move';
      else return null;
    }
    state.orphanFormationCommandsRepaired += 1;
    return command;
  };

  const repairFormationState = game => {
    const formations = formationMap(game);
    const validIds = new Set();
    let maxId = 0;
    for (const [key, group] of formations) {
      if (!group || typeof group !== 'object') continue;
      const id = group.id ?? key;
      group.id = id;
      validIds.add(String(id));
      maxId = Math.max(maxId, idNumber(id));
      if (!Array.isArray(group.unitIds)) group.unitIds = [];
      group.unitIds = [...new Set(group.unitIds.filter(Boolean))];
      if (group._fdObstacleRecovery196) {
        try { delete group._fdObstacleRecovery196; } catch (_) { group._fdObstacleRecovery196 = null; }
      }
      if (group.march183) {
        group.march183.blockedTicks = 0;
        group.march183.formingTicks189 = 0;
      }
    }

    for (const unit of game?.units || []) {
      if (!unit) continue;
      unit.game = game;
      state.entitiesRebound += 1;
      // currentCommand is a getter derived from commandQueue in the canonical
      // Unit class. Restore and normalize the queue only; assigning the getter
      // aborts Game construction while loading a save.
      if (!Array.isArray(unit.commandQueue)) unit.commandQueue = [];
      unit.commandQueue = unit.commandQueue
        .map(command => normalizeFormationCommand(command, validIds))
        .filter(Boolean);
      const currentCommand = unit.currentCommand;
      const ids = [
        currentCommand?.formationGroupId,
        currentCommand?.formationId,
        ...unit.commandQueue.flatMap(command => [command?.formationGroupId, command?.formationId]),
      ];
      for (const id of ids) maxId = Math.max(maxId, idNumber(id));
    }
    for (const entity of [...(game?.buildings || []), ...(game?.resources || [])]) {
      if (!entity) continue;
      entity.game = game;
      state.entitiesRebound += 1;
    }

    const requiredCounter = maxId + 1;
    if (requiredCounter > finite(game?.formationCounter, 1)) {
      game.formationCounter = requiredCounter;
      state.formationCountersRaised += 1;
    }
  };

  const clearTransientModes = game => {
    if (!game) return;
    const fields = ['buildMode', 'commandMode', 'pendingAbility', 'selectedPower', 'contextTarget'];
    for (const field of fields) {
      if (game[field] != null) {
        game[field] = null;
        state.transientModesCleared += 1;
      }
    }
    const input = game.input;
    if (input) {
      input.game = game;
      for (const field of ['dragging', 'selecting', 'rightDragging', 'pointerDown', 'contextActive']) {
        if (input[field]) {
          input[field] = false;
          state.transientModesCleared += 1;
        }
      }
      if (input.buildPlacementDrag != null) {
        input.buildPlacementDrag = null;
        state.transientModesCleared += 1;
      }
      if (input.mouse && typeof input.mouse === 'object') {
        input.mouse.down = false;
        input.mouse.rightDown = false;
      }
    }
  };

  // A loaded game can be a freshly hydrated Game instance while the stable
  // bridge still retains the pre-load instance in bridge.game. In that state
  // every recovered action falls back before it ever reaches the Worker. Only
  // rebind when this is the currently exported game and the bridge itself is
  // healthy; the Worker/transport are kept intact.
  const bindBridgeToGame = game => {
    const bridge = root.__FD_STABLE_STATE165__?.bridge || null;
    if (!game || !bridge || bridge.failed) return null;
    if (hasDocument && D?.game && D.game !== game) return null;
    if (bridge.game !== game) {
      try {
        bridge.game = game;
        state.bridgeRebinds += 1;
      } catch (_) {
        return null;
      }
    }
    return bridge;
  };

  const currentBridge = game => {
    const bridge = bindBridgeToGame(game);
    if (!bridge || bridge.applying) return null;
    return bridge;
  };

  const unpause = game => {
    if (!game) return;
    try { game.paused = false; } catch (_) {}
    const bridge = bindBridgeToGame(game);
    if (!bridge) return;
    try {
      bridge._paused = false;
      bridge.worker?.postMessage?.({ type: 'pause', paused: false });
      state.bridgeUnpauses += 1;
    } catch (_) {}
  };

  const repairLoadedGame = (game, reason = 'load') => {
    if (!game) return false;
    repairFormationState(game);
    canonicalizeSelected(game);
    clearTransientModes(game);
    bindBridgeToGame(game);
    unpause(game);
    game.uiDirty = true;
    try { game.rebuildSpatialIndexes?.(); } catch (_) {}
    try { game.updateUI?.(true); } catch (_) {}
    state.lastRepairReason = reason;
    state.lastLoadedAt = Date.now();
    return true;
  };

  const baseHydrate = Game.prototype.hydrate;
  if (hasDocument && typeof baseHydrate === 'function') {
    const repairedHydrate196 = function repairedHydrate196(data, ...rest) {
      const result = baseHydrate.call(this, data, ...rest);
      repairLoadedGame(this, 'hydrate');
      state.hydrateRepairs += 1;
      return result;
    };
    try {
      Object.defineProperty(Game.prototype, 'hydrate', {
        configurable: true,
        writable: true,
        value: repairedHydrate196,
      });
      Object.defineProperty(repairedHydrate196, '__fdPostLoadRepair196', { value: true });
    } catch (_) {
      // Runtime load-button repair still rebinds the newly exported Game even
      // when a historical layer made hydrate non-configurable.
    }
  }

  const selectedUnitIds = game => {
    const selected = canonicalizeSelected(game);
    return selected
      .filter(entity => entity?.alive && entity.kind === 'unit' && !entity.embarkedIn)
      .map(entity => entity.id)
      .filter(Boolean);
  };

  const marker = color => function(payload) {
    if (Number.isFinite(payload?.x) && Number.isFinite(payload?.y)) {
      this.addEffect?.({ type: 'marker', x: payload.x, y: payload.y, color, duration: 0.9 });
    }
    this.sound?.click?.();
  };

  const routeAction = (name, action, encoder, present = null) => {
    if (!hasDocument) return;
    const original = Game.prototype[name];
    if (typeof original !== 'function') return;
    Game.prototype[name] = function recoveredActionRoute196(...args) {
      const bridge = currentBridge(this);
      const ids = selectedUnitIds(this);
      if (!bridge || !bridge.ready || !ids.length || root.__FD_MULTIPLAYER_ACTIVE__) {
        state.routeFallbacks += 1;
        return original.apply(this, args);
      }
      const encoded = encoder.call(this, args);
      if (!encoded) return false;
      const payload = clonePlain(encoded);
      const sent = bridge.sendAction?.(action, payload, ids) === true;
      if (!sent) {
        state.routeFallbacks += 1;
        return original.apply(this, args);
      }
      state.routedActions += 1;
      state.lastAction = action;
      state.lastSelectedIds = [...ids];
      state.lastSeq = finite(bridge.seq);
      if (present) present.call(this, payload);
      return true;
    };
    Object.defineProperty(Game.prototype[name], '__fdPostLoadRoute196', { value: action });
  };

  routeAction('issueMove', 'move', function([x, y, append]) {
    return { x, y, append: Boolean(append), formationSettings: clonePlain(this.formationSettings) };
  }, marker('#8fe6b2'));
  routeAction('issueAttackMove', 'attackMove', function([x, y, append]) {
    return { x, y, append: Boolean(append), formationSettings: clonePlain(this.formationSettings) };
  }, marker('#ffb06c'));
  routeAction('issuePatrol', 'patrol', function([x, y, append]) {
    return { x, y, append: Boolean(append), formationSettings: clonePlain(this.formationSettings) };
  }, marker('#7ecbff'));
  routeAction('issueAttack', 'attack', function([target, append]) {
    return target?.id ? { targetId: target.id, append: Boolean(append) } : null;
  });
  routeAction('issueStop', 'stop', () => ({}));
  routeAction('issueHold', 'hold', () => ({}));

  const scheduleLoadRepairs = reasonPrefix => {
    const runRepair = suffix => {
      const game = D?.game;
      if (repairLoadedGame(game, `${reasonPrefix}-${suffix}`)) state.launchRepairs += 1;
    };
    queueMicrotask(() => runRepair('microtask'));
    setTimeout(() => runRepair('80ms'), 80);
    setTimeout(() => runRepair('320ms'), 320);
    setTimeout(() => runRepair('1100ms'), 1100);
  };

  if (hasDocument && typeof D.startGame === 'function') {
    const baseStartGame = D.startGame;
    D.startGame = function repairedStartGame196(options = {}, ...rest) {
      const result = baseStartGame.call(this, options, ...rest);
      if (options?.loadData) scheduleLoadRepairs('start');
      return result;
    };
    Object.defineProperty(D.startGame, '__fdPostLoadStart196', { value: true });
  }

  // Some historical UI layers captured the old startGame function when their
  // click listener was registered. A capture listener gives the load button an
  // independent repair schedule even if that closure bypasses D.startGame's
  // later wrapper.
  if (hasDocument) {
    document.addEventListener('click', event => {
      const load = event.target?.closest?.('#load-game');
      if (!load) return;
      state.loadButtonRepairs += 1;
      scheduleLoadRepairs('load-button');
    }, true);
  }

  root.__FD_POST_LOAD_COMMAND_RECOVERY_196__ = {
    version: VERSION,
    build: BUILD,
    state,
    repairLoadedGame,
    canonicalizeSelected,
    bindBridgeToGame,
  };
})();
