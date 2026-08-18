(() => {
  'use strict';

  const root = globalThis;
  const D = root.__FD_DEBUG__;
  const Game = D?.Game;
  const Unit = D?.Unit;
  if (!Game?.prototype || !Unit?.prototype || root.__FD_FORMATION_OBSTACLE_RECOVERY_196__) return;

  const VERSION = '16.8.12';
  const BUILD = 196;
  const FINAL_TYPES = new Set(['move', 'attackMove']);
  const BLOCKED_TRIGGER_TICKS = 4;
  const NO_PROGRESS_TRIGGER_TICKS = 12;
  const MIN_RECOVERY_TICKS = 8;
  const ALT_WAYPOINT_TICKS = 28;
  const WORLD = D?.WORLD || { width: 32000, height: 22000 };
  const baseProcessFormationCommand = Unit.prototype.processFormationCommand;
  if (typeof baseProcessFormationCommand !== 'function') return;

  const diagnostics = {
    activations: 0,
    activeGroups: 0,
    memberRecoverySteps: 0,
    dynamicMoveCalls: 0,
    alternateWaypoints: 0,
    rejoins: 0,
    orphanGroupsIgnored: 0,
    maxBlockedTicks: 0,
    lastGroupId: null,
    lastReason: null,
  };

  const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const tickOf = game => Math.max(0, finite(game?.simTick, Math.round(finite(game?.time) * 25)) | 0);
  const distance = (a, b) => Math.hypot(finite(a?.x) - finite(b?.x), finite(a?.y) - finite(b?.y));

  const groupFor = (game, id) => {
    if (!id) return null;
    const formations = game?.formations;
    if (typeof formations?.get === 'function') return formations.get(id) || formations.get(String(id)) || null;
    return formations?.[id] || formations?.[String(id)] || null;
  };

  const liveMembers = (game, group) => (group?.unitIds || [])
    .map(id => game?.getEntity?.(id))
    .filter(unit => unit?.alive && unit.kind === 'unit' && !unit.air && !unit.embarkedIn);

  const centerOf = (members, fallback = { x: 0, y: 0 }) => {
    if (!members.length) return { x: finite(fallback.x), y: finite(fallback.y) };
    let x = 0;
    let y = 0;
    for (const member of members) {
      x += finite(member.x);
      y += finite(member.y);
    }
    return { x: x / members.length, y: y / members.length };
  };

  const localSlot = (group, unit) => {
    const slots = group?.slots;
    const slot = slots?.get?.(unit.id) || slots?.[unit.id] || null;
    if (slot) {
      return {
        forward: finite(slot.forward ?? slot.x),
        lateral: finite(slot.lateral ?? slot.y),
      };
    }
    const ids = group?.unitIds || [];
    const index = Math.max(0, ids.indexOf(unit.id));
    const spacing = Math.max(22, finite(group?.lateralSpacing || group?.spacing, (finite(unit.radius, 6) + 4) * 2.35));
    const columns = group?.formation === 'column' ? 1 : Math.max(1, Math.ceil(Math.sqrt(Math.max(1, ids.length))));
    const row = Math.floor(index / columns);
    const column = index % columns;
    return {
      forward: row * spacing,
      lateral: (column - (Math.min(columns, ids.length) - 1) * 0.5) * spacing,
    };
  };

  const desiredAnchor = (game, group, command, center, minimumDistance) => {
    const path = Array.isArray(group?.path) ? group.path : [];
    const startIndex = Math.max(0, finite(group?.pathIndex) | 0);
    let fallback = null;
    for (let index = startIndex; index < path.length; index += 1) {
      const point = path[index];
      if (!Number.isFinite(point?.x) || !Number.isFinite(point?.y)) continue;
      fallback = { x: point.x, y: point.y, index };
      if (distance(point, center) >= minimumDistance) return fallback;
    }
    const finalPoint = {
      x: finite(group?.finalAnchorX138, finite(group?.targetX, finite(command?.x, center.x))),
      y: finite(group?.finalAnchorY138, finite(group?.targetY, finite(command?.y, center.y))),
      index: fallback?.index ?? startIndex,
    };
    if (Number.isFinite(finalPoint.x) && Number.isFinite(finalPoint.y)) return finalPoint;
    return fallback || { x: center.x, y: center.y, index: startIndex };
  };

  const setRecovery = (group, recovery) => {
    try {
      Object.defineProperty(group, '_fdObstacleRecovery196', {
        configurable: true,
        writable: true,
        enumerable: false,
        value: recovery,
      });
    } catch (_) {
      group._fdObstacleRecovery196 = recovery;
    }
    return recovery;
  };

  const clearRecovery = group => {
    try { delete group._fdObstacleRecovery196; }
    catch (_) { group._fdObstacleRecovery196 = null; }
  };

  const beginRecovery = (game, group, command, reason) => {
    if (group?._fdObstacleRecovery196?.active) return group._fdObstacleRecovery196;
    const members = liveMembers(game, group);
    if (members.length < 2) return null;
    const center = centerOf(members, { x: group.anchorX, y: group.anchorY });
    const clearance = Math.max(110, finite(group.maxRadius, 12) * 1.35);
    const target = desiredAnchor(game, group, command, center, clearance * 1.45);
    const tick = tickOf(game);
    const recovery = setRecovery(group, {
      active: true,
      reason,
      startedTick: tick,
      lastBatchTick: -1,
      lastProgressTick: tick,
      startX: center.x,
      startY: center.y,
      lastCenterX: center.x,
      lastCenterY: center.y,
      targetX: target.x,
      targetY: target.y,
      originalTargetX: target.x,
      originalTargetY: target.y,
      pathIndex: target.index,
      clearance,
      alternate: 0,
    });
    if (Number.isFinite(target.index) && target.index >= finite(group.pathIndex)) group.pathIndex = target.index;
    diagnostics.activations += 1;
    diagnostics.activeGroups += 1;
    diagnostics.lastGroupId = group.id || command?.formationGroupId || command?.formationId || null;
    diagnostics.lastReason = reason;
    return recovery;
  };

  const navigable = (game, unit, x, y, angle) => {
    try {
      if (typeof game?.isNavigableUnitPoint133 === 'function') {
        return game.isNavigableUnitPoint133(unit, x, y, angle, false) !== false;
      }
      if (typeof game?.findBuildingCollision === 'function') {
        return !game.findBuildingCollision(x, y, finite(unit?.radius, 6) + 5);
      }
    } catch (_) {}
    return true;
  };

  const chooseAlternateWaypoint = (game, group, recovery, center, members) => {
    const dx = recovery.originalTargetX - center.x;
    const dy = recovery.originalTargetY - center.y;
    const length = Math.max(1, Math.hypot(dx, dy));
    const ux = dx / length;
    const uy = dy / length;
    const sideSeed = String(group?.id || '').split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
    const side = ((sideSeed + recovery.alternate) & 1) ? 1 : -1;
    const lateral = Math.max(150, finite(group?.maxRadius, 12) * 1.55);
    const forward = Math.max(180, recovery.clearance * 1.25);
    const candidates = [side, -side].map(direction => ({
      x: clamp(center.x + ux * forward - uy * lateral * direction, 40, WORLD.width - 40),
      y: clamp(center.y + uy * forward + ux * lateral * direction, 40, WORLD.height - 40),
    }));
    const probe = members[0];
    const angle = Math.atan2(dy, dx);
    const selected = candidates.find(point => navigable(game, probe, point.x, point.y, angle)) || candidates[0];
    recovery.targetX = selected.x;
    recovery.targetY = selected.y;
    recovery.alternate += 1;
    recovery.lastProgressTick = tickOf(game);
    diagnostics.alternateWaypoints += 1;
  };

  const finishRecovery = (game, group, recovery, members, center) => {
    const march = group?.march183;
    group.anchorX = center.x;
    group.anchorY = center.y;
    if (march) {
      march.anchorX = center.x;
      march.anchorY = center.y;
      march.blockedTicks = 0;
      march.phase = 'forming';
      march.formingTicks189 = 0;
      march.memberSignature = '';
    }
    group.arrived = false;
    group.completed = false;
    for (const member of members) {
      if (member?.currentCommand) delete member.currentCommand._fdObstacleRecovery196;
      delete member._fdFormationRecovery196;
    }
    clearRecovery(group);
    diagnostics.activeGroups = Math.max(0, diagnostics.activeGroups - 1);
    diagnostics.rejoins += 1;
  };

  const updateRecoveryBatch = (game, group, command, recovery, members) => {
    const tick = tickOf(game);
    if (recovery.lastBatchTick === tick) return;
    recovery.lastBatchTick = tick;
    const center = centerOf(members, { x: recovery.lastCenterX, y: recovery.lastCenterY });
    const moved = Math.hypot(center.x - recovery.lastCenterX, center.y - recovery.lastCenterY);
    if (moved > 1.5) {
      recovery.lastCenterX = center.x;
      recovery.lastCenterY = center.y;
      recovery.lastProgressTick = tick;
    }
    group.anchorX = center.x;
    group.anchorY = center.y;
    if (group.march183) {
      group.march183.anchorX = center.x;
      group.march183.anchorY = center.y;
    }

    if (tick - recovery.lastProgressTick >= ALT_WAYPOINT_TICKS) {
      chooseAlternateWaypoint(game, group, recovery, center, members);
    }

    const elapsed = tick - recovery.startedTick;
    const clearedOrigin = Math.hypot(center.x - recovery.startX, center.y - recovery.startY) >= recovery.clearance;
    const reachedWaypoint = Math.hypot(center.x - recovery.targetX, center.y - recovery.targetY) <= recovery.clearance * 0.62;
    if (elapsed >= MIN_RECOVERY_TICKS && (clearedOrigin || reachedWaypoint)) {
      finishRecovery(game, group, recovery, members, center);
    }
  };

  const recoveryTargetFor = (group, unit, recovery, center) => {
    const dx = recovery.targetX - center.x;
    const dy = recovery.targetY - center.y;
    const angle = Math.atan2(dy, dx);
    const slot = localSlot(group, unit);
    const compression = 0.52;
    const forward = slot.forward * compression;
    const lateral = slot.lateral * compression;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const radius = finite(unit.radius, 6) + 5;
    return {
      x: clamp(recovery.targetX + c * forward - s * lateral, radius, WORLD.width - radius),
      y: clamp(recovery.targetY + s * forward + c * lateral, radius, WORLD.height - radius),
    };
  };

  const recoverMember = (unit, command, dt, group, recovery) => {
    const game = unit.game;
    const members = liveMembers(game, group);
    if (members.length < 2) {
      diagnostics.orphanGroupsIgnored += 1;
      clearRecovery(group);
      return baseProcessFormationCommand.call(unit, command, dt);
    }
    updateRecoveryBatch(game, group, command, recovery, members);
    const current = group._fdObstacleRecovery196;
    if (!current?.active) return baseProcessFormationCommand.call(unit, command, dt);
    const center = centerOf(members, { x: current.lastCenterX, y: current.lastCenterY });
    const target = recoveryTargetFor(group, unit, current, center);
    unit._fdFormationRecovery196 = true;
    command._fdObstacleRecovery196 = true;
    diagnostics.memberRecoverySteps += 1;
    let moved = false;
    if (typeof unit.moveToward === 'function') {
      diagnostics.dynamicMoveCalls += 1;
      moved = unit.moveToward(target.x, target.y, dt, 0.92, {
        dynamic: true,
        formationRecovery196: true,
      }) !== false;
    } else {
      const dx = target.x - finite(unit.x);
      const dy = target.y - finite(unit.y);
      const length = Math.max(1, Math.hypot(dx, dy));
      const speed = Math.max(1, finite(unit.stats?.speed, finite(unit.maxSpeed, 60))) * 0.75;
      const step = Math.min(length, speed * Math.max(0.001, finite(dt, 0.04)));
      unit.x += dx / length * step;
      unit.y += dy / length * step;
      game?.spatial?.update?.(unit, 'units');
      moved = step > 0;
    }
    unit.attemptedMove = true;
    if (!moved) unit.navBlockedTimer = Math.max(finite(unit.navBlockedTimer), 0.25);
    return true;
  };

  Unit.prototype.processFormationCommand = function obstacleRecoveringFormation196(command, dt) {
    const groupId = command?.formationGroupId || command?.formationId;
    const group = groupFor(this.game, groupId);
    if (!group || group.air || this.air || !FINAL_TYPES.has(command?.type) || (group.unitIds?.length || 0) < 2) {
      return baseProcessFormationCommand.call(this, command, dt);
    }
    if (group.arrived || group.completed) return baseProcessFormationCommand.call(this, command, dt);

    const march = group.march183;
    const blockedTicks = Math.max(0, finite(march?.blockedTicks) | 0);
    diagnostics.maxBlockedTicks = Math.max(diagnostics.maxBlockedTicks, blockedTicks);

    let recovery = group._fdObstacleRecovery196;
    if (!recovery?.active && blockedTicks >= BLOCKED_TRIGGER_TICKS) {
      recovery = beginRecovery(this.game, group, command, 'shared-footprint-blocked');
    }
    if (recovery?.active) return recoverMember(this, command, dt, group, recovery);

    const tick = tickOf(this.game);
    const progress = command._fdFormationProgress196 || {
      tick,
      x: finite(this.x),
      y: finite(this.y),
    };
    const result = baseProcessFormationCommand.call(this, command, dt);
    const moved = Math.hypot(finite(this.x) - progress.x, finite(this.y) - progress.y);
    if (moved > 1.5) {
      progress.tick = tick;
      progress.x = finite(this.x);
      progress.y = finite(this.y);
    }
    command._fdFormationProgress196 = progress;

    const nextBlocked = Math.max(0, finite(group.march183?.blockedTicks) | 0);
    if (nextBlocked >= BLOCKED_TRIGGER_TICKS) {
      beginRecovery(this.game, group, command, 'shared-footprint-blocked-after-step');
    } else if (group.march183?.phase === 'marching' && tick - progress.tick >= NO_PROGRESS_TRIGGER_TICKS) {
      const finalX = finite(group.finalAnchorX138, finite(group.targetX, finite(command.x, this.x)));
      const finalY = finite(group.finalAnchorY138, finite(group.targetY, finite(command.y, this.y)));
      if (Math.hypot(finalX - finite(this.x), finalY - finite(this.y)) > Math.max(150, finite(group.maxRadius, 12))) {
        beginRecovery(this.game, group, command, 'member-no-progress');
      }
    }
    return result;
  };
  Object.defineProperty(Unit.prototype.processFormationCommand, '__fdObstacleRecovery196', { value: true });

  root.__FD_FORMATION_OBSTACLE_RECOVERY_196__ = {
    version: VERSION,
    build: BUILD,
    diagnostics,
  };
})();
