(() => {
  'use strict';

  const debug = window.__FD_DEBUG__;
  const GameClass = debug?.Game;
  const UnitClass = debug?.Unit;
  if (!GameClass || !UnitClass) return;

  const VERSION = '14.0';
  const clamp140 = (value, min, max) => Math.max(min, Math.min(max, value));
  const isFinalGroundMove140 = (command) => ['move', 'attackMove'].includes(command?.type);

  const spriteAtlas140 = (unit) => {
    const pilot = window.__FD_MODEL_PILOT__;
    const code = pilot?.modelForType?.(unit?.typeId, 'unit');
    return code ? pilot?.canvasSprites?.[code]?.spec?.canvasSprite || null : null;
  };

  // This is the same projected rectangle that the fixed-isometric sprite
  // renderer paints. It deliberately uses the aircraft's visual altitude,
  // not the invisible point on the terrain below it.
  GameClass.prototype.getUnitFigureScreenBounds140 = function(unit) {
    if (!unit?.alive || unit.embarkedIn) return null;
    if (unit.air) {
      const aircraft = this.getAircraftScreenShape133?.(unit);
      if (aircraft) return { ...aircraft, source: 'aircraft-sprite' };
    }
    if (unit.infantry) {
      const infantry = this.getInfantryScreenBounds138?.(unit);
      if (infantry) return { ...infantry, source: 'infantry-alpha' };
    }

    const x = unit.renderX ?? unit.x;
    const y = unit.renderY ?? unit.y;
    const rotation = unit.vehicle || unit.air
      ? (unit.rotation ?? unit.renderRotation ?? 0)
      : (unit.renderRotation ?? unit.rotation ?? 0);
    const exact = this.getUnitFootprintAt?.(unit, x, y, rotation);
    const atlas = spriteAtlas140(unit);
    if (atlas) {
      const radius = (unit.radius || 5) * (unit.stats?.visualScale || 1);
      const worldWidth = exact
        ? Math.max(exact.halfLength * 2, exact.halfWidth * 2)
        : radius * 2.85;
      const aspect = (Number(atlas.cellHeight) || 144) / Math.max(1, Number(atlas.cellWidth) || 192);
      const displayScale = unit.infantry
        ? (this.getUnitPresentationScale138?.(unit, worldWidth, aspect) || 1)
        : 1;
      const width = Math.max(2, worldWidth * (this.camera?.zoom || 1) * 1.34 * displayScale);
      const height = Math.max(2, width * aspect);
      const altitude = unit.air
        ? (this.getAircraftVisualAltitude137?.(unit) ?? this.getAircraftFlightAltitude119?.(unit) ?? radius * 5.2)
        : 0;
      const center = this.worldToScreen(x, y, altitude);
      const anchorX = Number.isFinite(atlas.anchorX) ? atlas.anchorX : .5;
      const baseline = Number.isFinite(atlas.groundBaseline) ? atlas.groundBaseline : .79;
      return {
        unit,
        x1: center.x - width * anchorX,
        y1: center.y - height * baseline,
        x2: center.x + width * (1 - anchorX),
        y2: center.y + height * (1 - baseline),
        width,
        height,
        source: 'atlas-sprite',
      };
    }

    const measured = this.getUnitScreenBounds116?.(unit);
    if (measured) return { ...measured, source: 'measured-hull' };
    const center = this.worldToScreen(x, y, 0);
    const fallbackRadius = Math.max(4, (unit.radius || 5) * (this.camera?.zoom || 1));
    return {
      unit,
      x1: center.x - fallbackRadius,
      y1: center.y - fallbackRadius * .75,
      x2: center.x + fallbackRadius,
      y2: center.y + fallbackRadius * .75,
      width: fallbackRadius * 2,
      height: fallbackRadius * 1.5,
      source: 'fallback',
    };
  };

  GameClass.prototype.getUnitFigureHits140 = function(worldX, worldY) {
    const pointer = this.worldToScreen(worldX, worldY, 0);
    const hits = [];
    for (const unit of this.units || []) {
      if (!unit?.alive || unit.embarkedIn) continue;
      if (unit.team === 'enemy' && !this.isTargetableBy?.(unit, 'player')) continue;
      const bounds = this.getUnitFigureScreenBounds140(unit);
      if (!bounds) continue;
      const width = Math.max(1, bounds.x2 - bounds.x1);
      const height = Math.max(1, bounds.y2 - bounds.y1);
      // A few pixels compensate for antialiasing and touch imprecision, but
      // never recreate the old screen-high selection column.
      const pad = clamp140(Math.min(width, height) * .045, 2, unit.air ? 7 : 5);
      if (pointer.x < bounds.x1 - pad || pointer.x > bounds.x2 + pad ||
          pointer.y < bounds.y1 - pad || pointer.y > bounds.y2 + pad) continue;
      const centerX = (bounds.x1 + bounds.x2) * .5;
      const centerY = (bounds.y1 + bounds.y2) * .5;
      const nx = (pointer.x - centerX) / Math.max(1, width * .5 + pad);
      const ny = (pointer.y - centerY) / Math.max(1, height * .5 + pad);
      hits.push({
        unit,
        bounds,
        score: nx * nx + ny * ny,
        area: width * height,
      });
    }
    hits.sort((left, right) => left.score - right.score || left.area - right.area ||
      String(left.unit.id).localeCompare(String(right.unit.id)));
    return hits;
  };

  const baseHitTest140 = GameClass.prototype.hitTest;
  GameClass.prototype.hitTest = function(worldX, worldY, selectableOnly = true) {
    const figure = this.getUnitFigureHits140(worldX, worldY)[0]?.unit;
    if (figure) return figure;
    const fallback = baseHitTest140.call(this, worldX, worldY, selectableOnly);
    // Older pickers used terrain centres and tall approximate columns. Once a
    // visible unit figure rejects the point, only buildings/resources may use
    // the legacy fallback.
    return fallback?.kind === 'unit' ? null : fallback;
  };

  const baseContextHit140 = GameClass.prototype.hitTestForContext;
  if (baseContextHit140) GameClass.prototype.hitTestForContext = function(worldX, worldY) {
    const figure = this.getUnitFigureHits140(worldX, worldY)[0]?.unit;
    if (figure) return figure;
    const fallback = baseContextHit140.call(this, worldX, worldY);
    return fallback?.kind === 'unit' ? null : fallback;
  };

  GameClass.prototype.selectAt = function(worldX, worldY, additive = false) {
    const hits = this.getUnitFigureHits140(worldX, worldY);
    const pointer = this.worldToScreen(worldX, worldY, 0);
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    let entity = null;
    if (hits.length) {
      const signature = hits.map((hit) => hit.unit.id).join('|');
      const previous = this._figureClickCycle140;
      const repeated = previous && now - previous.at < 720 && previous.signature === signature &&
        Math.hypot(pointer.x - previous.x, pointer.y - previous.y) < 18;
      const index = repeated ? (previous.index + 1) % hits.length : 0;
      this._figureClickCycle140 = { at: now, x: pointer.x, y: pointer.y, signature, index };
      entity = hits[index].unit;
    } else {
      entity = this.hitTest(worldX, worldY, true);
      this._figureClickCycle140 = null;
    }

    const last = this.input?.lastClick || {};
    const isDouble = hits.length <= 1 && entity && now - (last.time || -Infinity) < 330 &&
      last.typeId === entity.typeId && last.kind === entity.kind;
    if (this.input) this.input.lastClick = {
      time: now,
      typeId: entity?.typeId || null,
      kind: entity?.kind || null,
    };
    if (!entity) {
      if (!additive) this.clearSelection?.();
      return null;
    }
    if (isDouble && entity.team === 'player' && entity.kind === 'unit') {
      const visible = (this.units || []).filter((unit) => unit?.alive && unit.team === 'player' &&
        unit.typeId === entity.typeId && this.isOnScreen?.(unit.x, unit.y, 40));
      this.setSelection(visible, additive);
    } else this.setSelection([entity], additive);
    this.sound?.click?.();
    return entity;
  };

  GameClass.prototype.selectRect = function(screenRect, additive = false) {
    const x1 = Math.min(screenRect.x1, screenRect.x2);
    const y1 = Math.min(screenRect.y1, screenRect.y2);
    const x2 = Math.max(screenRect.x1, screenRect.x2);
    const y2 = Math.max(screenRect.y1, screenRect.y2);
    const selected = [];
    for (const unit of this.units || []) {
      if (!unit?.alive || unit.team !== 'player' || unit.embarkedIn) continue;
      const bounds = this.getUnitFigureScreenBounds140(unit);
      if (!bounds) continue;
      if (bounds.x2 < x1 || bounds.x1 > x2 || bounds.y2 < y1 || bounds.y1 > y2) continue;
      selected.push(unit);
    }
    this.setSelection(selected, additive);
    return selected;
  };

  const stopAtFormationPost140 = (unit) => {
    unit.motionSpeed = 0;
    unit.attemptedMove = false;
    unit.isPivoting = false;
    unit.recoveryWaypoint = null;
    unit.navRecoveryPoint = null;
    unit.navTarget = null;
    unit.navProgressGoal = null;
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

  const formationMembers140 = (game, group) => (group?.unitIds || [])
    .map((id) => game.getEntity?.(id))
    .filter((unit) => unit?.alive && unit.kind === 'unit' && !unit.air && !unit.embarkedIn &&
      unit.currentCommand?.formationGroupId === group.id);

  const finalSlot140 = (game, group, unit) => {
    game.syncFormationFinalSlots138?.(group);
    return group?.finalSlots138?.[unit.id] || game.getFormationSlotWorld?.(group, unit) || null;
  };

  const lockFinalFormationFrame140 = (group) => {
    if (Number.isFinite(group.finalAnchorX138)) group.anchorX = group.finalAnchorX138;
    if (Number.isFinite(group.finalAnchorY138)) group.anchorY = group.finalAnchorY138;
    if (Number.isFinite(group.finalAngle138)) group.angle = group.finalAngle138;
    else if (Number.isFinite(group.finalAngle)) group.angle = group.finalAngle;
    group.compression = 1;
    group.arrived = true;
    if (Array.isArray(group.path)) group.pathIndex = group.path.length;
  };

  const finalMemberDistance140 = (game, group, unit) => {
    const slot = finalSlot140(game, group, unit);
    return slot ? Math.hypot(slot.x - unit.x, slot.y - unit.y) : Infinity;
  };

  const parkFormationMembers140 = (game, group, members) => {
    group.completed = true;
    group._stableFormation140 = true;
    for (const member of members) {
      const memberSlot = finalSlot140(game, group, member);
      stopAtFormationPost140(member);
      if ((member.commandQueue?.length || 1) <= 1) {
        member._formationParked140 = {
          x: member.x,
          y: member.y,
          slotX: memberSlot?.x ?? member.x,
          slotY: memberSlot?.y ?? member.y,
          groupId: group.id,
          at: game.time || 0,
        };
      }
    }
  };

  const baseFormationCommand140 = UnitClass.prototype.processFormationCommand;
  if (baseFormationCommand140) UnitClass.prototype.processFormationCommand = function(command, dt) {
    const group = this.game.formations?.get(command?.formationGroupId);
    if (Number(group?.march183?.build || 0) >= 189) {
      return baseFormationCommand140.call(this, command, dt);
    }
    if (!group || group.air || this.air || !isFinalGroundMove140(command)) {
      return baseFormationCommand140.call(this, command, dt);
    }

    const closeToFinalAnchor = Number.isFinite(group.finalAnchorX138) && Number.isFinite(group.finalAnchorY138) &&
      Math.hypot((group.anchorX || 0) - group.finalAnchorX138, (group.anchorY || 0) - group.finalAnchorY138) <
        Math.max(24, (group.maxRadius || 8) * .55);
    if (!group.arrived && !group.completed && !closeToFinalAnchor) {
      return baseFormationCommand140.call(this, command, dt);
    }

    lockFinalFormationFrame140(group);
    const slot = finalSlot140(this.game, group, this);
    if (!slot) return baseFormationCommand140.call(this, command, dt);
    let distance = Math.hypot(slot.x - this.x, slot.y - this.y);
    const capture = Math.max(7, (this.radius || 5) * .58);
    const tether = Math.max(14, (this.radius || 5) * 1.08);

    if (command._formationSettled140 && distance <= tether) {
      stopAtFormationPost140(this);
    } else if (distance <= capture) {
      const canSnap = typeof this.game.isUnitPositionFree117 !== 'function' ||
        this.game.isUnitPositionFree117(this, slot.x, slot.y, this.rotation || 0, true);
      if (canSnap) {
        this.x = slot.x;
        this.y = slot.y;
        this.game.spatial?.update?.(this, 'units');
        distance = 0;
      }
      command._formationSettled140 = true;
      command.formationFinalX140 = slot.x;
      command.formationFinalY140 = slot.y;
      stopAtFormationPost140(this);
    } else {
      command._formationSettled140 = false;
      this.moveToward(slot.x, slot.y, dt, .72, { dynamic: false });
      return true;
    }

    const members = formationMembers140(this.game, group);
    const allSettled = members.length > 0 && members.every((member) => {
      const memberSlot = finalSlot140(this.game, group, member);
      if (!memberSlot) return false;
      const memberDistance = Math.hypot(memberSlot.x - member.x, memberSlot.y - member.y);
      return Boolean(member.currentCommand?._formationSettled140) && memberDistance <= Math.max(14, (member.radius || 5) * 1.08);
    });
    if (!allSettled) return true;

    parkFormationMembers140(this.game, group, members);
    // The existing atomic completion wrapper will release every member on the
    // first call. The guard keeps this loop safe in lightweight test runtimes
    // where finishCommand releases one member at a time.
    for (const member of members) {
      if (member.currentCommand?.formationGroupId === group.id) member.finishCommand?.();
    }
    return true;
  };

  // Completion may be requested by an older wrapped formation layer during
  // the exact frame in which the anchor reaches its destination. Intercept
  // that path as well: no member is released until the whole surviving group
  // is inside its persistent personal endpoint.
  const baseFinishCommand140 = UnitClass.prototype.finishCommand;
  if (baseFinishCommand140) UnitClass.prototype.finishCommand = function(...args) {
    const command = this.currentCommand;
    const group = command?.formationGroupId ? this.game.formations?.get(command.formationGroupId) : null;
    if (Number(group?.march183?.build || 0) >= 189) {
      return baseFinishCommand140.apply(this, args);
    }
    if (group && !group.air && !this.air && isFinalGroundMove140(command) && (group.arrived || group.completed)) {
      lockFinalFormationFrame140(group);
      const members = formationMembers140(this.game, group);
      const allAtPosts = members.length > 0 && members.every((member) => {
        const distance = finalMemberDistance140(this.game, group, member);
        const tether = Math.max(14, (member.radius || 5) * 1.08);
        if (distance <= tether && member.currentCommand) {
          member.currentCommand._formationSettled140 = true;
          stopAtFormationPost140(member);
        }
        return distance <= tether;
      });
      if (!allAtPosts) return false;
      parkFormationMembers140(this.game, group, members);
    }
    return baseFinishCommand140.apply(this, args);
  };

  const baseSetCommand140 = UnitClass.prototype.setCommand;
  if (baseSetCommand140) UnitClass.prototype.setCommand = function(command, append = false) {
    if (!append || !this.currentCommand) this._formationParked140 = null;
    return baseSetCommand140.call(this, command, append);
  };

  const baseNudge140 = GameClass.prototype.nudgeUnit;
  if (baseNudge140) GameClass.prototype.nudgeUnit = function(unit, dx, dy) {
    if (unit?._formationParked140 && !unit.currentCommand) return false;
    return baseNudge140.call(this, unit, dx, dy);
  };

  if (typeof document !== 'undefined') {
    void 0;
    const eyebrow = document.querySelector?.('#start-screen .eyebrow');
    if (eyebrow) void 0;
    const lead = document.querySelector?.('#start-screen .lead');
    if (lead) void 0;
    const strip = document.querySelector?.('#start-screen .feature-strip');
    if (strip && !strip.querySelector?.('[data-screen-selection140-feature]')) {
      void 0;
    }
  }

  window.__FD_SCREEN_SELECTION_FORMATION_V140__ = Object.freeze({
    version: VERSION,
    bounds(unit) { return unit?.game?.getUnitFigureScreenBounds140?.(unit) || null; },
    parked(unit) { return unit?._formationParked140 ? { ...unit._formationParked140 } : null; },
  });
})();
