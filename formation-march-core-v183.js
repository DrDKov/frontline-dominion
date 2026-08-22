(() => {
  'use strict';

  const root = globalThis;
  const debug = root.__FD_DEBUG__;
  const GameClass = debug?.Game;
  const UnitClass = debug?.Unit;
  const WORLD = debug?.WORLD || { width: 32000, height: 22000 };
  if (!GameClass || !UnitClass) return;
  if (GameClass.prototype.__fdFormationMarch183Installed) return;
  Object.defineProperty(GameClass.prototype, '__fdFormationMarch183Installed', {
    value: true,
    configurable: true,
  });

  const VERSION = '16.8.7';
  const BUILD = 191;
  const FINAL_TYPES = new Set(['move', 'attackMove']);
  const clamp183 = (value, min, max) => Math.max(min, Math.min(max, value));
  const finite183 = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const distance183 = (left, right) => Math.hypot(finite183(left?.x) - finite183(right?.x), finite183(left?.y) - finite183(right?.y));
  const approachAngle183 = (current, desired, maxDelta) => {
    let delta = Math.atan2(Math.sin(desired - current), Math.cos(desired - current));
    delta = clamp183(delta, -Math.abs(maxDelta), Math.abs(maxDelta));
    return current + delta;
  };

  const diagnostics183 = {
    groupsCreated: 0,
    activeGroups: 0,
    activeMembers: 0,
    sharedSteps: 0,
    individualMovementAvoided: 0,
    formingFrames: 0,
    regroupFrames: 0,
    blockedFrames: 0,
    compressionEvents: 0,
    routeFallbackSteps: 0,
    lastSharedSpeed: 0,
    maxCohesionError: 0,
  };

  const liveMembers183 = (game, group) => (group?.unitIds || [])
    .map(id => game.getEntity?.(id))
    .filter(unit => unit?.alive && unit.kind === 'unit' && !unit.air && !unit.embarkedIn &&
      (unit.currentCommand?.formationGroupId === group.id || unit.currentCommand?.formationId === group.id));

  const localSlot183 = (group, unit) => {
    const slot = group?.slots?.[unit.id] || group?.slots?.get?.(unit.id) || null;
    if (slot) return {
      forward: finite183(slot.forward ?? slot.x),
      lateral: finite183(slot.lateral ?? slot.y),
    };
    const index = Math.max(0, (group?.unitIds || []).indexOf(unit.id));
    const spacing = Math.max(24, finite183(group?.lateralSpacing || group?.spacing, (unit.radius || 8) * 2.4));
    const count = Math.max(1, group?.unitIds?.length || 1);
    const columns = group?.formation === 'line' ? count : group?.formation === 'column' ? 1 : Math.ceil(Math.sqrt(count));
    const row = Math.floor(index / columns);
    const column = index % columns;
    return {
      forward: (row - Math.floor((count - 1) / Math.max(1, columns)) * .5) * spacing,
      lateral: (column - (Math.min(columns, count) - 1) * .5) * spacing,
    };
  };

  const worldSlot183 = (group, unit, anchorX, anchorY, angle, compression = 1) => {
    const slot = localSlot183(group, unit);
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const forward = slot.forward * compression;
    const lateral = slot.lateral * compression;
    const radius = finite183(unit.radius, 6) + 4;
    return {
      x: clamp183(anchorX + c * forward - s * lateral, radius, WORLD.width - radius),
      y: clamp183(anchorY + s * forward + c * lateral, radius, WORLD.height - radius),
    };
  };

  const groupCenter183 = (members, fallbackX = 0, fallbackY = 0) => {
    if (!members.length) return { x: fallbackX, y: fallbackY };
    let x = 0;
    let y = 0;
    for (const member of members) { x += finite183(member.x); y += finite183(member.y); }
    return { x: x / members.length, y: y / members.length };
  };

  const effectiveSpeed183 = unit => {
    const base = Math.max(1, finite183(unit?.stats?.speed, finite183(unit?.maxSpeed, 1)));
    const condition = clamp183(finite183(unit?.healthRatio, 1), .30, 1);
    const supply = clamp183(finite183(unit?.supply160, 1), .35, 1);
    const cohesion = clamp183(finite183(unit?.cohesion160, 1), .45, 1);
    return base * (.72 + condition * .28) * (.78 + supply * .22) * (.84 + cohesion * .16);
  };

  const sharedSpeed183 = (members, group) => {
    if (!members.length) return 0;
    let speed = Infinity;
    for (const member of members) speed = Math.min(speed, effectiveSpeed183(member));
    const doctrineRatio = clamp183(finite183(group?.speedRatio138, 1), .45, 1);
    const declared = finite183(group?.maxSpeed138, Infinity);
    return Math.max(1, Math.min(speed * doctrineRatio, declared));
  };

  function ensureState183(game, group) {
    if (!group) return null;
    if (!group.march183) {
      const members = liveMembers183(game, group);
      const center = groupCenter183(members, finite183(group.anchorX ?? group.ax), finite183(group.anchorY ?? group.ay));
      const angle = finite183(group.angle, finite183(group.finalAngle, 0));
      group.march183 = {
        version: VERSION,
        build: BUILD,
        phase: 'forming',
        batchTick: -1,
        anchorX: finite183(group.anchorX ?? group.ax, center.x),
        anchorY: finite183(group.anchorY ?? group.ay, center.y),
        angle,
        compression: 1,
        memberSignature: '',
        blockedTicks: 0,
        formingTicks189: 0,
        lastMovedAt: finite183(game.time),
      };
      group.anchorX = group.march183.anchorX;
      group.anchorY = group.march183.anchorY;
      group.angle = angle;
      diagnostics183.groupsCreated += 1;
    }
    return group.march183;
  }

  const staticNavigable183 = (game, unit, point, angle) => {
    try {
      if (typeof game.isNavigableUnitPoint133 === 'function') {
        return game.isNavigableUnitPoint133(unit, point.x, point.y, angle, false) !== false;
      }
      if (typeof game.findBuildingCollision === 'function') {
        return !game.findBuildingCollision(point.x, point.y, finite183(unit.radius, 6) + 4);
      }
    } catch (_) {}
    return true;
  };

  const clearIndividualNavigation183 = unit => {
    unit.navTarget = null;
    unit.navProgressGoal = null;
    unit.recoveryWaypoint = null;
    unit.navRecoveryPoint = null;
    unit.navBlockedTimer = 0;
    unit.navNoProgressTimer = 0;
    unit.stuckTimer = 0;
    unit.stuckStage = 0;
    unit.v71TrafficPressure = 0;
    unit.v71TrafficSpeedFactor = 1;
    unit.navYieldFactor = 1;
    if (Array.isArray(unit.navPath)) unit.navPath.length = 0;
    if (Array.isArray(unit.navTrail)) unit.navTrail.length = 0;
    unit.navPathIndex = 0;
  };

  const applyMemberPosition183 = (game, unit, point, angle, sharedSpeed, dt, moving) => {
    unit._v9PrevX = finite183(unit.x);
    unit._v9PrevY = finite183(unit.y);
    unit._v9PrevRot = finite183(unit.rotation);
    unit.x = point.x;
    unit.y = point.y;
    unit.rotation = angle;
    unit.renderX = point.x;
    unit.renderY = point.y;
    unit.renderRotation = angle;
    unit.lastPositionX = point.x;
    unit.lastPositionY = point.y;
    unit.visualSpeed = moving ? sharedSpeed : 0;
    unit.motionSpeed = moving ? sharedSpeed : 0;
    unit.attemptedMove = moving;
    unit.isPivoting = false;
    clearIndividualNavigation183(unit);
    if (((game.simTick || 0) + Number.parseInt(String(unit.id || '').replace(/\D/g, ''), 10)) % 2 === 0) {
      game.spatial?.update?.(unit, 'units');
      game._v94SyncMini164?.(unit);
    }
    unit.weaponCooldown = Math.max(-12, finite183(unit.weaponCooldown) - dt);
  };

  const nextAnchorTarget183 = group => {
    const path = Array.isArray(group?.path) ? group.path : [];
    let index = Math.max(0, finite183(group?.pathIndex, 0) | 0);
    while (index < path.length) {
      const point = path[index];
      if (point && Number.isFinite(point.x) && Number.isFinite(point.y)) return { point, index };
      index += 1;
    }
    return {
      point: {
        x: finite183(group?.finalAnchorX138, finite183(group?.targetX, finite183(group?.requestedTargetX138))),
        y: finite183(group?.finalAnchorY138, finite183(group?.targetY, finite183(group?.requestedTargetY138))),
      },
      index,
    };
  };

  const manualAnchorAdvance183 = (group, state, speed, dt) => {
    const resolved = nextAnchorTarget183(group);
    let target = resolved.point;
    if (!Number.isFinite(target.x) || !Number.isFinite(target.y)) return { x: state.anchorX, y: state.anchorY, moved: 0 };
    let dx = target.x - state.anchorX;
    let dy = target.y - state.anchorY;
    let distance = Math.hypot(dx, dy);
    if (distance < Math.max(36, finite183(group.maxRadius, 8) * .6) && Array.isArray(group.path) && resolved.index < group.path.length - 1) {
      group.pathIndex = resolved.index + 1;
      target = group.path[group.pathIndex];
      dx = target.x - state.anchorX;
      dy = target.y - state.anchorY;
      distance = Math.hypot(dx, dy);
    }
    if (distance < .001) return { x: state.anchorX, y: state.anchorY, moved: 0 };
    const step = Math.min(distance, speed * Math.max(.001, dt));
    diagnostics183.routeFallbackSteps += 1;
    return {
      x: state.anchorX + dx / distance * step,
      y: state.anchorY + dy / distance * step,
      moved: step,
    };
  };

  const memberTurnRate189 = member => {
    if (member?.infantry) return 12.0;
    if (member?.vehicle) return 8.5;
    return 9.5;
  };

  const errorPercentile189 = (errors, ratio) => {
    if (!errors.length) return 0;
    const sorted = [...errors].sort((a, b) => a - b);
    const index = Math.max(0, Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * ratio)));
    return sorted[index];
  };

  const approachMemberSlot189 = (game, member, target, finalAngle, dt, speed, slotTolerance) => {
    const x = finite183(member.x);
    const y = finite183(member.y);
    const dx = target.x - x;
    const dy = target.y - y;
    const distance = Math.hypot(dx, dy);
    const desiredHeading = distance > slotTolerance * 1.25 ? Math.atan2(dy, dx) : finalAngle;
    const currentHeading = finite183(member.rotation, finite183(member.renderRotation, desiredHeading));
    const heading = approachAngle183(currentHeading, desiredHeading, memberTurnRate189(member) * Math.max(.001, dt));
    const maxStep = speed * Math.max(.001, dt);
    const step = Math.min(distance, maxStep);
    const point = distance > .001
      ? { x: x + dx / distance * step, y: y + dy / distance * step }
      : target;
    applyMemberPosition183(game, member, point, heading, step > .001 ? step / Math.max(.001, dt) : 0, dt, step > .001);
    return { distance, remaining: Math.max(0, distance - step), step };
  };

  function formAtAnchor183(game, group, state, members, dt, speed, anchorX, anchorY, angle, regroup = false) {
    const spacing = Math.max(24, finite183(group.lateralSpacing || group.depthSpacing, 32));
    const errors = [];
    let maxError = 0;
    let settled = 0;
    let near = 0;
    state.formingTicks189 = finite183(state.formingTicks189, 0) + 1;

    for (const member of members) {
      const target = worldSlot183(group, member, anchorX, anchorY, angle, 1);
      // Form-up is a rendezvous manoeuvre, not a march. Each unit may use its own
      // mobility instead of being throttled by the slowest vehicle in the group.
      const ownSpeed = effectiveSpeed183(member);
      const assemblyFactor = regroup ? 1.60 : 2.25;
      const assemblySpeed = Math.max(speed, ownSpeed * assemblyFactor);
      const slotTolerance = Math.max(9, finite183(member.radius, 6) * .78, spacing * .18);
      const motion = approachMemberSlot189(game, member, target, angle, dt, assemblySpeed, slotTolerance);
      const remaining = motion.remaining;
      errors.push(remaining);
      maxError = Math.max(maxError, remaining);
      if (remaining <= slotTolerance) settled += 1;
      if (remaining <= Math.max(18, spacing * .70)) near += 1;
    }

    diagnostics183.maxCohesionError = Math.max(diagnostics183.maxCohesionError, maxError);
    if (regroup) diagnostics183.regroupFrames += 1;
    else diagnostics183.formingFrames += 1;

    const nearRatio = near / Math.max(1, members.length);
    const p80 = errorPercentile189(errors, .80);
    const p88 = errorPercentile189(errors, .88);
    const practicalTolerance = Math.max(18, spacing * .70);
    // Do not wait for one truck at the edge of a large group. Once the body of
    // the formation is assembled, start the march and let stragglers merge while
    // moving. A short fallback prevents tiny residual slot corrections from
    // stalling the whole column indefinitely.
    const ready = settled === members.length ||
      (state.formingTicks189 >= 5 && nearRatio >= .72 && p80 <= Math.max(24, spacing * .92)) ||
      (state.formingTicks189 >= 12 && nearRatio >= .58) ||
      state.formingTicks189 >= 24;

    if (ready) {
      state.phase = 'marching';
      state.compression = 1;
      state.memberSignature = members.map(member => member.id).join('|');
      state.formingTicks189 = 0;
      // Intentionally no exact-slot snap here. Residual errors are consumed by
      // the moving-slot follower below, so figures never teleport into formation.
    }
    return ready;
  }
  function sharedMarchBatch183(game, group, command, dt) {
    const members = liveMembers183(game, group);
    if (!members.length) return false;
    const state = ensureState183(game, group);
    const memberSignature = members.map(member => member.id).join('|');
    if (state.memberSignature && state.memberSignature !== memberSignature) {
      state.phase = 'forming';
      state.formingTicks189 = 0;
    }

    const speed = sharedSpeed183(members, group);
    group.sharedSpeed = speed;
    diagnostics183.lastSharedSpeed = speed;
    diagnostics183.activeMembers += members.length;

    const tick = Number.isFinite(game.simTick) ? game.simTick : Math.floor(finite183(game.time) * 25);
    if (state.batchTick === tick) return true;
    state.batchTick = tick;

    const previousAnchorX = finite183(state.anchorX, finite183(group.anchorX));
    const previousAnchorY = finite183(state.anchorY, finite183(group.anchorY));
    const previousAngle = finite183(state.angle, finite183(group.angle));
    const spacing = Math.max(24, finite183(group.lateralSpacing || group.depthSpacing, 42));
    let maxError = 0;
    const cohesionErrors189 = [];
    for (const member of members) {
      const expected = worldSlot183(group, member, previousAnchorX, previousAnchorY, previousAngle, state.compression || 1);
      const error = distance183(member, expected);
      cohesionErrors189.push(error);
      maxError = Math.max(maxError, error);
    }
    diagnostics183.maxCohesionError = Math.max(diagnostics183.maxCohesionError, maxError);

    const p70Error189 = errorPercentile189(cohesionErrors189, .70);
    const outliers189 = cohesionErrors189.filter(error => error > spacing * 1.18).length;
    const tooManyOutliers189 = outliers189 > Math.max(3, Math.floor(members.length * .34));
    const cohesionBroken189 = state.phase === 'marching' && p70Error189 > spacing * 1.18 && tooManyOutliers189;

    if (state.phase !== 'marching' || cohesionBroken189) {
      if (cohesionBroken189) {
        state.phase = 'regrouping';
        state.formingTicks189 = 0;
      } else if (state.phase !== 'regrouping') {
        state.phase = 'forming';
      }
      group.anchorX = previousAnchorX;
      group.anchorY = previousAnchorY;
      group.angle = previousAngle;
      formAtAnchor183(game, group, state, members, dt, speed, previousAnchorX, previousAnchorY, previousAngle, state.phase === 'regrouping');
      diagnostics183.individualMovementAvoided += members.length;
      return true;
    }

    // Let the existing formation navigator advance the shared anchor/path once.
    try { game.ensureFormationGroupUpdated?.(group, dt); } catch (_) {}
    let proposedX = finite183(group.anchorX ?? group.ax, previousAnchorX);
    let proposedY = finite183(group.anchorY ?? group.ay, previousAnchorY);
    let rawDx = proposedX - previousAnchorX;
    let rawDy = proposedY - previousAnchorY;
    let rawDistance = Math.hypot(rawDx, rawDy);

    // Some legacy formation layers only update the anchor inside the individual
    // mover. In that case advance the shared route here, once for the whole group.
    if (rawDistance < .001) {
      const manual = manualAnchorAdvance183(group, state, speed, dt);
      proposedX = manual.x;
      proposedY = manual.y;
      rawDx = proposedX - previousAnchorX;
      rawDy = proposedY - previousAnchorY;
      rawDistance = manual.moved;
    }

    const maxStep = speed * Math.max(.001, dt) * 1.08;
    if (rawDistance > maxStep && rawDistance > .001) {
      proposedX = previousAnchorX + rawDx / rawDistance * maxStep;
      proposedY = previousAnchorY + rawDy / rawDistance * maxStep;
      rawDx = proposedX - previousAnchorX;
      rawDy = proposedY - previousAnchorY;
      rawDistance = maxStep;
    }

    const desiredAngle = rawDistance > .001
      ? Math.atan2(rawDy, rawDx)
      : finite183(group.angle, previousAngle);
    const maxRadius = Math.max(32, ...members.map(member => {
      const slot = localSlot183(group, member);
      return Math.hypot(slot.forward, slot.lateral) + finite183(member.radius, 6);
    }));
    const maxTurn = Math.max(.015, speed * Math.max(.001, dt) / maxRadius * .82);
    const angle = approachAngle183(previousAngle, desiredAngle, maxTurn);

    let selectedCompression = null;
    let selectedPoints = null;
    for (const compression of [1, .86, .72, .58]) {
      const points = members.map(member => worldSlot183(group, member, proposedX, proposedY, angle, compression));
      const clear = points.every((point, index) => staticNavigable183(game, members[index], point, angle));
      if (clear) {
        selectedCompression = compression;
        selectedPoints = points;
        break;
      }
    }

    if (!selectedPoints) {
      group.anchorX = previousAnchorX;
      group.anchorY = previousAnchorY;
      group.angle = previousAngle;
      state.blockedTicks += 1;
      diagnostics183.blockedFrames += 1;
      for (const member of members) applyMemberPosition183(
        game,
        member,
        worldSlot183(group, member, previousAnchorX, previousAnchorY, previousAngle, state.compression || 1),
        previousAngle,
        0,
        dt,
        false,
      );
      if (state.blockedTicks > 10) {
        group.pathIndex = 0;
        group.pathRevision = -1;
        group._v183RepathRequested = true;
      }
      diagnostics183.individualMovementAvoided += members.length;
      return true;
    }

    state.blockedTicks = 0;
    if (selectedCompression < .999) diagnostics183.compressionEvents += 1;
    state.compression = selectedCompression;
    state.anchorX = proposedX;
    state.anchorY = proposedY;
    state.angle = angle;
    state.lastMovedAt = finite183(game.time);
    state.memberSignature = memberSignature;
    group.anchorX = proposedX;
    group.anchorY = proposedY;
    group.angle = angle;
    group.compression = selectedCompression;

    selectedPoints.forEach((point, index) => {
      const member = members[index];
      const distance = Math.hypot(point.x - finite183(member.x), point.y - finite183(member.y));
      const snapTolerance = Math.max(7, finite183(member.radius, 6) * .58, spacing * .14);
      if (distance <= snapTolerance) {
        // Tiny residuals may be absorbed, but rotate into the march direction
        // progressively so tracked/wheeled sprites do not slide sideways.
        const currentHeading = finite183(member.rotation, finite183(member.renderRotation, angle));
        const heading = approachAngle183(currentHeading, angle, memberTurnRate189(member) * Math.max(.001, dt));
        applyMemberPosition183(game, member, point, heading, speed, dt, rawDistance > .001);
      } else {
        // A straggler follows its moving slot with its own catch-up speed. This
        // avoids the former one-frame teleport when the formation was released.
        const catchupSpeed = Math.max(speed * 1.15, effectiveSpeed183(member) * 1.58);
        approachMemberSlot189(game, member, point, angle, dt, catchupSpeed, snapTolerance);
      }
    });
    diagnostics183.sharedSteps += 1;
    diagnostics183.individualMovementAvoided += members.length;
    return true;
  }

  const optimizeFormationSlots189 = (game, group, units) => {
    if (!group || group.air) return group;
    const members = (units || [])
      .filter(unit => unit?.alive && unit.kind === 'unit' && !unit.air && !unit.embarkedIn);
    if (members.length < 2) return group;
    const available = members.map(unit => {
      const slot = group.slots?.[unit.id] || group.slots?.get?.(unit.id);
      return slot ? { ...slot } : localSlot183(group, unit);
    });
    if (available.length !== members.length) return group;

    const center = groupCenter183(members, finite183(group.anchorX ?? group.ax), finite183(group.anchorY ?? group.ay));
    const angle = finite183(group.angle, finite183(group.finalAngle138, finite183(group.finalAngle, 0)));
    const c = Math.cos(angle);
    const sin = Math.sin(angle);
    const localUnits = members.map(unit => {
      const dx = finite183(unit.x) - center.x;
      const dy = finite183(unit.y) - center.y;
      return {
        unit,
        forward: dx * c + dy * sin,
        lateral: -dx * sin + dy * c,
        radial: dx * dx + dy * dy,
      };
    }).sort((left, right) => right.radial - left.radial || String(left.unit.id).localeCompare(String(right.unit.id)));

    const assigned = {};
    for (const entry of localUnits) {
      let bestIndex = 0;
      let bestCost = Infinity;
      for (let index = 0; index < available.length; index += 1) {
        const slot = available[index];
        const df = finite183(slot.forward ?? slot.x) - entry.forward;
        const dl = finite183(slot.lateral ?? slot.y) - entry.lateral;
        const cost = df * df + dl * dl;
        if (cost < bestCost) { bestCost = cost; bestIndex = index; }
      }
      assigned[entry.unit.id] = available.splice(bestIndex, 1)[0];
    }
    group.slots = assigned;
    group._v138FinalSignature = '';
    group.slotAssignment189 = true;
    try { game.syncFormationFinalSlots138?.(group, true); } catch (_) {}
    return group;
  };

  const baseCreateFormation183 = GameClass.prototype.createFormationGroup;
  if (typeof baseCreateFormation183 === 'function') {
    GameClass.prototype.createFormationGroup = function(units, type, targetX, targetY, options = {}) {
      const group = baseCreateFormation183.call(this, units, type, targetX, targetY, options);
      if (group && !group.air && (group.unitIds?.length || units?.length || 0) >= 2) {
        optimizeFormationSlots189(this, group, units || []);
        ensureState183(this, group);
      }
      return group;
    };
  }

  const baseEnsureFormation183 = GameClass.prototype.ensureFormationGroupUpdated;
  if (typeof baseEnsureFormation183 === 'function') {
    GameClass.prototype.ensureFormationGroupUpdated = function(group, dt, ...rest) {
      if (!group || group.air) return baseEnsureFormation183.call(this, group, dt, ...rest);
      const members = liveMembers183(this, group);
      if (members.length >= 2) {
        const speed = sharedSpeed183(members, group);
        group.sharedSpeed = speed;
        group.maxSpeed = speed;
      }
      const result = baseEnsureFormation183.call(this, group, dt, ...rest);
      if (members.length >= 2) {
        const speed = sharedSpeed183(members, group);
        group.sharedSpeed = speed;
        group.maxSpeed = speed;
      }
      return result;
    };
  }

  const baseFormationCommand183 = UnitClass.prototype.processFormationCommand;
  if (typeof baseFormationCommand183 === 'function') {
    UnitClass.prototype.processFormationCommand = function(command, dt) {
      const groupId = command?.formationGroupId || command?.formationId;
      const group = groupId ? this.game.formations?.get?.(groupId) : null;
      if (!group || group.air || this.air || !FINAL_TYPES.has(command?.type) || (group.unitIds?.length || 0) < 2) {
        return baseFormationCommand183.call(this, command, dt);
      }
      ensureState183(this.game, group);
      const finalX = finite183(group.finalAnchorX138, finite183(group.targetX, finite183(command.x)));
      const finalY = finite183(group.finalAnchorY138, finite183(group.targetY, finite183(command.y)));
      const closeToFinal = Number.isFinite(finalX) && Number.isFinite(finalY) &&
        Math.hypot(finite183(group.anchorX) - finalX, finite183(group.anchorY) - finalY) <
          Math.max(44, finite183(group.maxRadius, 10) * .75);
      if (group.arrived || group.completed || closeToFinal) {
        return baseFormationCommand183.call(this, command, dt);
      }
      return sharedMarchBatch183(this.game, group, command, dt);
    };
  }

  GameClass.prototype.formationMarchDiagnostics183 = function() {
    let activeGroups = 0;
    let activeMembers = 0;
    for (const group of this.formations?.values?.() || []) {
      if (!group?.march183 || group.completed) continue;
      const count = liveMembers183(this, group).length;
      if (count < 2) continue;
      activeGroups += 1;
      activeMembers += count;
    }
    diagnostics183.activeGroups = activeGroups;
    diagnostics183.activeMembers = activeMembers;
    return { version: VERSION, build: BUILD, ...diagnostics183 };
  };

  root.__FD_FORMATION_MARCH_183__ = {
    version: VERSION,
    build: BUILD,
    diagnostics: () => debug.game?.formationMarchDiagnostics183?.() || null,
  };
})();
