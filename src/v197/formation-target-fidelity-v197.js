(() => {
  'use strict';

  const root = globalThis;
  const D = root.__FD_DEBUG__;
  const Game = D?.Game;
  const Unit = D?.Unit;
  if (!Game?.prototype || !Unit?.prototype || root.__FD_FORMATION_TARGET_FIDELITY_197__) return;

  const VERSION = '16.8.13';
  const BUILD = 197;
  const ORDER_TYPES = new Set(['move', 'attackMove', 'formation']);
  const state = {
    ordersCaptured: 0,
    commandsTagged: 0,
    groupsTagged: 0,
    pathsCorrected: 0,
    slotAliasesCreated: 0,
    slotBiasCorrections: 0,
    prematureCompletionsPrevented: 0,
    commandsRestored: 0,
    processSteps: 0,
    lastTargetX: null,
    lastTargetY: null,
    lastCenterX: null,
    lastCenterY: null,
    lastDistance: null,
    lastGroupId: null,
  };

  const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const distance = (a, b) => Math.hypot(finite(a?.x) - finite(b?.x), finite(a?.y) - finite(b?.y));
  const targetOf = value => {
    if (!value || !Number.isFinite(Number(value.x)) || !Number.isFinite(Number(value.y))) return null;
    return { x: Number(value.x), y: Number(value.y) };
  };
  const defineHidden = (object, key, value) => {
    if (!object) return false;
    try {
      Object.defineProperty(object, key, { configurable: true, writable: true, enumerable: false, value });
      return true;
    } catch (_) {
      try { object[key] = value; return true; } catch (_) { return false; }
    }
  };

  const formationMap = game => game?.formations;
  const groupFor = (game, id) => {
    if (id == null) return null;
    const formations = formationMap(game);
    if (typeof formations?.get === 'function') return formations.get(id) || formations.get(String(id)) || null;
    return formations?.[id] || formations?.[String(id)] || null;
  };
  const groupIdFor = command => command?.formationGroupId ?? command?.formationId ?? null;
  const liveMembers = (game, group) => (group?.unitIds || [])
    .map(id => game?.getEntity?.(id))
    .filter(unit => unit?.alive && unit.kind === 'unit' && !unit.air && !unit.embarkedIn);
  const centerOf = members => {
    if (!members.length) return null;
    let x = 0;
    let y = 0;
    for (const unit of members) { x += finite(unit.x); y += finite(unit.y); }
    return { x: x / members.length, y: y / members.length };
  };

  const targetFor = (command, group) => targetOf(command?._fdRequestedTarget197) ||
    targetOf(group?._fdRequestedTarget197) || null;

  const slotEntries = group => {
    const slots = group?.slots;
    if (!slots) return [];
    if (typeof slots.entries === 'function') return [...slots.entries()].map(([id, slot]) => ({ id, slot }));
    return Object.entries(slots).map(([id, slot]) => ({ id, slot }));
  };

  const normalizeSlots = group => {
    const entries = slotEntries(group).filter(entry => entry.slot && typeof entry.slot === 'object');
    if (!entries.length) return;
    const values = entries.map(({ slot }) => ({
      slot,
      forward: finite(slot.forward, finite(slot.along, finite(slot.x))),
      lateral: finite(slot.lateral, finite(slot.y)),
    }));
    const meanForward = values.reduce((sum, item) => sum + item.forward, 0) / values.length;
    const meanLateral = values.reduce((sum, item) => sum + item.lateral, 0) / values.length;
    if (Math.abs(meanForward) > 0.001 || Math.abs(meanLateral) > 0.001) state.slotBiasCorrections += 1;

    for (const item of values) {
      const forward = item.forward - meanForward;
      const lateral = item.lateral - meanLateral;
      const slot = item.slot;
      try {
        if (!Object.prototype.hasOwnProperty.call(slot, 'forward')) state.slotAliasesCreated += 1;
        slot.forward = forward;
        slot.lateral = lateral;
        if ('along' in slot) slot.along = forward;
        if ('x' in slot) slot.x = forward;
        if ('y' in slot) slot.y = lateral;
      } catch (_) {}
    }
  };

  const ensureExactPathEnd = (group, target) => {
    if (!group || !target) return;
    group.targetX = target.x;
    group.targetY = target.y;
    group.finalAnchorX138 = target.x;
    group.finalAnchorY138 = target.y;
    if (group.march183) {
      group.march183.finalAnchorX = target.x;
      group.march183.finalAnchorY = target.y;
    }

    if (!Array.isArray(group.path)) group.path = [];
    const last = group.path[group.path.length - 1];
    if (!last || distance(last, target) > 0.5) {
      group.path.push({ x: target.x, y: target.y, fdExactTarget197: true });
      state.pathsCorrected += 1;
    } else {
      last.x = target.x;
      last.y = target.y;
    }
    if (finite(group.pathIndex) >= group.path.length) group.pathIndex = Math.max(0, group.path.length - 1);
    normalizeSlots(group);
  };

  const tagCommand = (game, command, target) => {
    if (!command || !ORDER_TYPES.has(command.type) || !target) return null;
    defineHidden(command, '_fdRequestedTarget197', { x: target.x, y: target.y });
    command.x = target.x;
    command.y = target.y;
    state.commandsTagged += 1;
    const group = groupFor(game, groupIdFor(command));
    if (group) {
      const first = !targetOf(group._fdRequestedTarget197);
      defineHidden(group, '_fdRequestedTarget197', { x: target.x, y: target.y });
      ensureExactPathEnd(group, target);
      if (first) state.groupsTagged += 1;
    }
    return group;
  };

  const selectedGroundUnits = game => {
    const seen = new Set();
    const result = [];
    for (const entity of game?.selected || []) {
      const unit = entity?.id != null ? (game.getEntity?.(entity.id) || entity) : entity;
      if (!unit?.alive || unit.kind !== 'unit' || unit.air || unit.embarkedIn) continue;
      const key = unit.id || unit;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(unit);
    }
    return result;
  };

  const candidateCommands = unit => {
    const list = [];
    if (unit?.currentCommand) list.push(unit.currentCommand);
    if (Array.isArray(unit?.commandQueue)) list.push(...unit.commandQueue);
    return list.filter(command => command && ORDER_TYPES.has(command.type));
  };

  const tagIssuedOrder = (game, unitIds, target, append) => {
    let tagged = 0;
    for (const id of unitIds || []) {
      const unit = game?.getEntity?.(id);
      if (!unit) continue;
      const commands = candidateCommands(unit);
      const exact = commands.filter(command => Math.hypot(finite(command.x) - target.x, finite(command.y) - target.y) <= 2);
      const chosen = exact.length ? exact : commands.length ? [append ? commands[commands.length - 1] : commands[0]] : [];
      for (const command of chosen) {
        tagCommand(game, command, target);
        tagged += 1;
      }
    }
    return tagged;
  };

  const installMethod = (prototype, name, value) => {
    try {
      Object.defineProperty(prototype, name, { configurable: true, writable: true, value });
      return prototype[name] === value;
    } catch (_) {
      return false;
    }
  };

  const wrapIssue = name => {
    const original = Game.prototype[name];
    if (typeof original !== 'function') return false;
    const wrapped = function exactFormationTargetIssue197(x, y, append = false, ...rest) {
      const target = targetOf({ x, y });
      const ids = selectedGroundUnits(this).map(unit => unit.id);
      const result = original.call(this, x, y, append, ...rest);
      if (!target || !ids.length) return result;
      state.ordersCaptured += 1;
      state.lastTargetX = target.x;
      state.lastTargetY = target.y;
      tagIssuedOrder(this, ids, target, Boolean(append));
      queueMicrotask(() => tagIssuedOrder(this, ids, target, Boolean(append)));
      return result;
    };
    Object.defineProperty(wrapped, '__fdFormationTarget197', { value: name });
    return installMethod(Game.prototype, name, wrapped);
  };

  const issueMoveInstalled = wrapIssue('issueMove');
  const issueAttackMoveInstalled = wrapIssue('issueAttackMove');

  const baseProcessFormationCommand = Unit.prototype.processFormationCommand;
  let processInstalled = false;
  if (typeof baseProcessFormationCommand === 'function') {
    const wrappedProcess = function exactFormationTargetProcess197(command, dt) {
      const group = groupFor(this.game, groupIdFor(command));
      const target = targetFor(command, group);
      if (!group || !target || !ORDER_TYPES.has(command?.type)) {
        return baseProcessFormationCommand.call(this, command, dt);
      }

      tagCommand(this.game, command, target);
      ensureExactPathEnd(group, target);
      state.processSteps += 1;
      const result = baseProcessFormationCommand.call(this, command, dt);
      ensureExactPathEnd(group, target);

      const tick = Math.max(0, finite(this.game?.simTick, Math.round(finite(this.game?.time) * 25)) | 0);
      if (group._fdTargetFidelityTick197 !== tick) {
        defineHidden(group, '_fdTargetFidelityTick197', tick);
        const members = liveMembers(this.game, group);
        const center = centerOf(members);
        if (center) {
          const remaining = distance(center, target);
          const tolerance = Math.max(28, finite(group.maxRadius, 0) * 0.35);
          state.lastCenterX = center.x;
          state.lastCenterY = center.y;
          state.lastDistance = remaining;
          state.lastGroupId = group.id || groupIdFor(command);

          if ((group.arrived || group.completed) && remaining > tolerance) {
            group.arrived = false;
            group.completed = false;
            ensureExactPathEnd(group, target);
            group.pathIndex = Math.max(0, group.path.length - 1);
            if (group.march183) {
              group.march183.phase = 'marching';
              group.march183.blockedTicks = 0;
              group.march183.formingTicks189 = 0;
              group.march183.memberSignature = '';
            }
            for (const member of members) {
              if (member.currentCommand) {
                tagCommand(this.game, member.currentCommand, target);
                continue;
              }
              const restored = { ...command, x: target.x, y: target.y };
              defineHidden(restored, '_fdRequestedTarget197', { x: target.x, y: target.y });
              try {
                member.currentCommand = restored;
                state.commandsRestored += 1;
              } catch (_) {}
            }
            state.prematureCompletionsPrevented += 1;
          }
        }
      }
      return result;
    };
    Object.defineProperty(wrappedProcess, '__fdFormationTarget197', { value: true });
    processInstalled = installMethod(Unit.prototype, 'processFormationCommand', wrappedProcess);
  }

  root.__FD_FORMATION_TARGET_FIDELITY_197__ = {
    version: VERSION,
    build: BUILD,
    installed: Boolean(processInstalled && issueMoveInstalled),
    issueMoveInstalled,
    issueAttackMoveInstalled,
    processInstalled,
    state,
    repairGroup(group, target) {
      const exact = targetOf(target) || targetOf(group?._fdRequestedTarget197);
      if (!group || !exact) return false;
      defineHidden(group, '_fdRequestedTarget197', exact);
      ensureExactPathEnd(group, exact);
      return true;
    },
  };
})();
