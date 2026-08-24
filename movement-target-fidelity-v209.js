(() => {
  'use strict';

  const root = globalThis;
  const D = root.__FD_DEBUG__;
  const Game = D?.Game;
  if (!Game?.prototype || root.__FD_MOVEMENT_TARGET_FIDELITY_209__) return;

  const VERSION = '16.9.3';
  const BUILD = 209;
  const WORLD = D?.WORLD || { width: 32000, height: 22000 };
  const isWorker = typeof importScripts === 'function';
  const hasDocument = typeof document !== 'undefined';
  const state = {
    translatedOrders: 0,
    translatedCommands: 0,
    correctedOppositeEndpoints: 0,
    bridgeDelegations: 0,
    formationDelegations: 0,
    lastType: null,
    lastTarget: null,
    lastCenter: null,
    lastDelta: null,
    lastEndpoints: [],
  };

  const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const installMethod = (prototype, name, value) => {
    try {
      Object.defineProperty(prototype, name, { configurable: true, writable: true, value });
      return prototype[name] === value;
    } catch (_) {
      try { prototype[name] = value; return prototype[name] === value; }
      catch (_) { return false; }
    }
  };

  const bridgeReady = game => {
    if (!hasDocument || isWorker || root.__FD_MULTIPLAYER_ACTIVE__) return false;
    const bridge = root.__FD_STABLE_STATE165__?.bridge;
    return Boolean(bridge && bridge.game === game && bridge.ready && !bridge.failed && !bridge.applying && bridge.worker);
  };

  const formationEnabled = game => Boolean(
    game?.formationEnabled201 ||
    game?.formationSettings?.enabled
  );

  const selectedUnits = (game, type) => (game?.getSelectedUnits?.() || [])
    .filter(unit => unit?.alive && unit.kind === 'unit' && !unit.embarkedIn && !unit.air && (type !== 'attackMove' || unit.stats?.weapon));

  const centerOf = units => units.reduce(
    (acc, unit) => ({ x: acc.x + finite(unit.x) / units.length, y: acc.y + finite(unit.y) / units.length }),
    { x: 0, y: 0 },
  );

  const safeEndpoint = (game, unit, desired, delta) => {
    const radius = Math.max(4, finite(unit?.radius, 8));
    const bounded = {
      x: clamp(desired.x, radius + 5, finite(WORLD.width, 32000) - radius - 5),
      y: clamp(desired.y, radius + 5, finite(WORLD.height, 22000) - radius - 5),
    };
    let candidate = bounded;
    try {
      candidate = game.findReachablePoint?.(bounded.x, bounded.y, radius + 3) || bounded;
    } catch (_) {
      candidate = bounded;
    }
    candidate = {
      x: clamp(finite(candidate?.x, bounded.x), radius + 5, finite(WORLD.width, 32000) - radius - 5),
      y: clamp(finite(candidate?.y, bounded.y), radius + 5, finite(WORLD.height, 22000) - radius - 5),
    };

    // A reachability helper is allowed to nudge the destination around an obstacle,
    // but never to turn a user's group order into an endpoint behind that unit.
    const fromUnit = { x: candidate.x - finite(unit.x), y: candidate.y - finite(unit.y) };
    const projection = fromUnit.x * delta.x + fromUnit.y * delta.y;
    if (projection <= 0 && Math.hypot(delta.x, delta.y) > 1) {
      state.correctedOppositeEndpoints += 1;
      return bounded;
    }
    return candidate;
  };

  const issueTranslatedOrder = (game, type, x, y, append = false, finalRotation = NaN) => {
    const units = selectedUnits(game, type);
    if (units.length < 2) return null;
    const center = centerOf(units);
    const delta = { x: finite(x) - center.x, y: finite(y) - center.y };
    if (!Number.isFinite(delta.x) || !Number.isFinite(delta.y)) return false;

    game._fdFreeOrderCounter209 = Math.max(0, finite(game._fdFreeOrderCounter209)) + 1;
    const tick = Math.max(0, finite(game.simTick, Math.round(finite(game.time) * 25)) | 0);
    const orderId = `free209-${tick}-${game._fdFreeOrderCounter209}`;
    const endpoints = [];

    // "Free movement" means translation, not re-formation. Preserve each unit's
    // current offset from the group centre and translate the whole footprint so
    // every member receives the same commanded displacement vector.
    for (const unit of [...units].sort((a, b) => String(a.id).localeCompare(String(b.id), 'en'))) {
      const desired = { x: finite(unit.x) + delta.x, y: finite(unit.y) + delta.y };
      const endpoint = safeEndpoint(game, unit, desired, delta);
      const shared = {
        _fdFreeGroup201: true,
        _fdTranslatedFree209: true,
        freeGroupId201: orderId,
        freeGroupId209: orderId,
        _fdRequestedGroupTarget201: { x: finite(x), y: finite(y) },
        _fdRequestedGroupTarget209: { x: finite(x), y: finite(y) },
      };
      const command = {
        type,
        x: endpoint.x,
        y: endpoint.y,
        ...(Number.isFinite(finalRotation) ? { finalRotation } : {}),
        ...shared,
      };
      if (typeof unit.setCommand === 'function') unit.setCommand(command, Boolean(append));
      else {
        if (!Array.isArray(unit.commandQueue)) unit.commandQueue = [];
        if (!append) unit.commandQueue.length = 0;
        unit.commandQueue.push(command);
      }
      endpoints.push({ id: unit.id, x: endpoint.x, y: endpoint.y, fromX: finite(unit.x), fromY: finite(unit.y) });
      state.translatedCommands += 1;
    }

    const colors = { move: '#8fe6b2', attackMove: '#ffb06c' };
    game.addEffect?.({ type: 'marker', x: finite(x), y: finite(y), color: colors[type] || '#8fe6b2', duration: 0.9 });
    game.sound?.click?.();
    state.translatedOrders += 1;
    state.lastType = type;
    state.lastTarget = { x: finite(x), y: finite(y) };
    state.lastCenter = center;
    state.lastDelta = delta;
    state.lastEndpoints = endpoints.slice(0, 64);
    game.uiDirty = true;
    game.renderSnapshotDirty = true;
    return true;
  };

  const wrapOrder = (name, type) => {
    const original = Game.prototype[name];
    if (typeof original !== 'function') return false;
    const wrapped = function movementTargetFidelity209(x, y, append = false, ...rest) {
      const units = selectedUnits(this, type);
      if (units.length < 2 || formationEnabled(this)) {
        if (units.length >= 2 && formationEnabled(this)) state.formationDelegations += 1;
        return original.call(this, x, y, append, ...rest);
      }
      // On the presentation thread the authoritative bridge owns command routing.
      // Do not bypass it. In the Worker (and in a true fallback main-thread sim)
      // replace v201's compact re-layout with offset-preserving translation.
      if (bridgeReady(this)) {
        state.bridgeDelegations += 1;
        return original.call(this, x, y, append, ...rest);
      }
      const translated = issueTranslatedOrder(this, type, x, y, append);
      return translated == null ? original.call(this, x, y, append, ...rest) : translated;
    };
    Object.defineProperty(wrapped, '__fdMovementTargetFidelity209', { value: name });
    return installMethod(Game.prototype, name, wrapped);
  };

  const moveInstalled = wrapOrder('issueMove', 'move');
  const attackMoveInstalled = wrapOrder('issueAttackMove', 'attackMove');

  root.__FD_MOVEMENT_TARGET_FIDELITY_209__ = {
    version: VERSION,
    build: BUILD,
    installed: Boolean(moveInstalled),
    moveInstalled,
    attackMoveInstalled,
    state,
    diagnostics: () => ({
      ...state,
      lastTarget: state.lastTarget ? { ...state.lastTarget } : null,
      lastCenter: state.lastCenter ? { ...state.lastCenter } : null,
      lastDelta: state.lastDelta ? { ...state.lastDelta } : null,
      lastEndpoints: state.lastEndpoints.map(item => ({ ...item })),
    }),
  };
})();
