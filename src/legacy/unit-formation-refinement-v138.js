(() => {
  'use strict';

  const debug = window.__FD_DEBUG__;
  const GameClass = debug?.Game;
  const UnitClass = debug?.Unit;
  const WORLD = debug?.WORLD || { width: 32000, height: 22000 };
  if (!GameClass || !UnitClass) return;

  const VERSION = '13.8';
  const REFERENCE_VISIBLE_HEIGHT = 40.5;
  const ENGINEER_DISPLAY_SCALE = 1;
  const clamp138 = (value, min, max) => Math.max(min, Math.min(max, value));

  // Mean non-transparent bounds measured from all eight approved directions.
  // Scaling by visible human height (not atlas width) keeps a lone rocket
  // soldier, a four-person section and an engineer on one physical scale.
  const INFANTRY_ALPHA_METRICS_138 = Object.freeze({
    'V-U01': { width: 169, height: 116, x: 12, y: 28 },
    'V-U02': { width: 168, height: 119, x: 12, y: 23 },
    'V-U03': { width: 164, height: 112, x: 14, y: 28 },
    'V-U04': { width: 167, height: 122, x: 13, y: 20 },
    'V-U05': { width: 165, height: 122, x: 14, y: 19 },
    'V-U06': { width: 144, height: 108, x: 24, y: 30 },
    'V-U07': { width: 97, height: 104, x: 48, y: 27 },
    'V-U08': { width: 84, height: 100, x: 54, y: 31 },
    'V-U09': { width: 97, height: 101, x: 47, y: 31 },
    'V-U10': { width: 85, height: 100, x: 54, y: 31 },
    'D-U01': { width: 170, height: 112, x: 11, y: 31 },
    'D-U02': { width: 168, height: 115, x: 12, y: 27 },
    'D-U03': { width: 166, height: 109, x: 13, y: 32 },
    'D-U04': { width: 168, height: 117, x: 12, y: 24 },
    'D-U05': { width: 163, height: 115, x: 15, y: 26 },
    'D-U06': { width: 139, height: 102, x: 26, y: 36 },
    'D-U07': { width: 91, height: 98, x: 51, y: 33 },
    'D-U08': { width: 80, height: 94, x: 56, y: 37 },
    'D-U09': { width: 92, height: 94, x: 50, y: 37 },
    'D-U10': { width: 81, height: 94, x: 56, y: 37 },
    'S-U01': { width: 169, height: 118, x: 12, y: 26 },
    'S-U02': { width: 167, height: 121, x: 12, y: 22 },
    'S-U03': { width: 164, height: 113, x: 14, y: 27 },
    'S-U04': { width: 166, height: 123, x: 13, y: 19 },
    'S-U05': { width: 166, height: 126, x: 13, y: 16 },
    'S-U06': { width: 156, height: 121, x: 18, y: 19 },
    'S-U07': { width: 109, height: 117, x: 41, y: 16 },
    'S-U08': { width: 94, height: 112, x: 49, y: 20 },
    'S-U09': { width: 109, height: 113, x: 41, y: 20 },
    'S-U10': { width: 96, height: 112, x: 48, y: 20 },
    'C-U01': { width: 82, height: 105, x: 55, y: 26 },
    'C-U02': { width: 169, height: 116, x: 12, y: 28 },
    'C-U03': { width: 118, height: 125, x: 37, y: 15 },
    'C-U04': { width: 103, height: 105, x: 45, y: 29 },
    'C-U05': { width: 87, height: 106, x: 53, y: 25 },
    'C-U14': { width: 97, height: 104, x: 48, y: 27 },
  });

  const COMMON_INFANTRY_CODES_138 = Object.freeze({
    worker: 'C-U01', rifle: 'C-U02', rocket: 'C-U03', medic: 'C-U04',
    commando: 'C-U05', saboteur: 'C-U14',
  });
  const unitModelCode138 = (unit) => {
    const resolved = unit?.stats?.modelCode || window.__FD_MODEL_PILOT__?.modelForType?.(unit?.typeId, 'unit');
    if (resolved) return resolved;
    if (COMMON_INFANTRY_CODES_138[unit?.typeId]) return COMMON_INFANTRY_CODES_138[unit.typeId];
    const index = Number(unit?.stats?.archetypeIndex);
    if (Number.isInteger(index) && index >= 0 && index < 10) {
      const prefix = { vanguard: 'V', dominion: 'D', specter: 'S' }[unit?.stats?.faction]
        || String(unit?.typeId || '').charAt(0).toUpperCase();
      if (['V', 'D', 'S'].includes(prefix)) return `${prefix}-U${String(index + 1).padStart(2, '0')}`;
    }
    return '';
  };
  const metricsFor138 = (unit) => INFANTRY_ALPHA_METRICS_138[unitModelCode138(unit)] ||
    { width: 104, height: 108, x: 44, y: 26 };

  GameClass.prototype.getUnitPresentationScale138 = function(unit, worldWidth, cellAspect = .75) {
    if (!unit?.infantry) return 1;
    const metrics = metricsFor138(unit);
    const rawVisibleHeight = Math.max(1, Number(worldWidth) || 1) * Math.max(.2, Number(cellAspect) || .75) * metrics.height / 144;
    return clamp138(REFERENCE_VISIBLE_HEIGHT / rawVisibleHeight, .85, 14);
  };

  GameClass.prototype.getInfantryScreenBounds138 = function(unit) {
    if (!unit?.infantry) return null;
    const x = unit.renderX ?? unit.x;
    const y = unit.renderY ?? unit.y;
    const rotation = unit.renderRotation ?? unit.rotation ?? 0;
    const exact = this.getUnitFootprintAt?.(unit, x, y, rotation);
    const radius = (unit.radius || 5) * (unit.stats?.visualScale || 1);
    const worldWidth = exact ? Math.max(exact.halfLength * 2, exact.halfWidth * 2) : radius * 2.85;
    const cellAspect = .75;
    const scale = this.getUnitPresentationScale138(unit, worldWidth, cellAspect);
    const targetWidth = worldWidth * (this.camera?.zoom || 1) * 1.34 * scale;
    const targetHeight = targetWidth * cellAspect;
    const center = this.worldToScreen(x, y, 0);
    const imageX = center.x - targetWidth * .5;
    const imageY = center.y - targetHeight * .79;
    const metrics = metricsFor138(unit);
    const pad = clamp138(targetWidth * .026, 2, 4);
    const x1 = imageX + targetWidth * metrics.x / 192 - pad;
    const y1 = imageY + targetHeight * metrics.y / 144 - pad;
    const x2 = imageX + targetWidth * (metrics.x + metrics.width) / 192 + pad;
    const y2 = imageY + targetHeight * (metrics.y + metrics.height) / 144 + pad;
    return {
      x1, y1, x2, y2, footprint: exact,
      renderedWidth: targetWidth,
      renderedHeight: targetHeight,
      visibleWidth: x2 - x1,
      visibleHeight: y2 - y1,
    };
  };

  const baseScreenHealth138 = GameClass.prototype.drawScreenHealthBar;
  if (baseScreenHealth138) GameClass.prototype.drawScreenHealthBar = function(entity, centerX, y, width, ...rest) {
    if (entity?.infantry) {
      const tight = this.getInfantryScreenBounds138(entity);
      if (tight) {
        centerX = (tight.x1 + tight.x2) * .5;
        y = tight.y1 - 5;
        width = clamp138(tight.visibleWidth * .82, 30, 54);
      }
    }
    return baseScreenHealth138.call(this, entity, centerX, y, width, ...rest);
  };

  const liveGroundMembers138 = (game, group) => (group?.unitIds || [])
    .map((id) => game.getEntity?.(id))
    .filter((unit) => unit?.alive && unit.kind === 'unit' && !unit.air && !unit.embarkedIn);

  const localFinalPoint138 = (group, unit, anchorX, anchorY, angle) => {
    const slot = group.slots?.[unit.id] || { forward: 0, lateral: 0 };
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    return {
      x: clamp138(anchorX + c * (slot.forward || 0) - s * (slot.lateral || 0), (unit.radius || 5) + 5, WORLD.width - (unit.radius || 5) - 5),
      y: clamp138(anchorY + s * (slot.forward || 0) + c * (slot.lateral || 0), (unit.radius || 5) + 5, WORLD.height - (unit.radius || 5) - 5),
    };
  };

  const chooseFinalAnchor138 = (game, group, units, requestedX, requestedY, angle) => {
    if (!units.length || units.length > 256 || typeof game.findBuildingCollision !== 'function') return { x: requestedX, y: requestedY };
    const slotExtent = Math.max(36, ...units.map((unit) => {
      const slot = group.slots?.[unit.id] || { forward: 0, lateral: 0 };
      return Math.hypot(slot.forward || 0, slot.lateral || 0) + (unit.radius || 5);
    }));
    const step = clamp138(
      Math.max(group.lateralSpacing || 0, group.depthSpacing || 0) * .72,
      42,
      Math.max(42, Math.min(180, slotExtent * .35)),
    );
    const candidates = [{ x: requestedX, y: requestedY, distance: 0 }];
    for (let ring = 1; ring <= 3; ring += 1) {
      const samples = ring === 1 ? 8 : 12;
      for (let index = 0; index < samples; index += 1) {
        const a = index / samples * Math.PI * 2;
        candidates.push({
          x: requestedX + Math.cos(a) * step * ring,
          y: requestedY + Math.sin(a) * step * ring,
          distance: step * ring,
        });
      }
    }
    let best = candidates[0];
    let bestScore = Infinity;
    for (const candidate of candidates) {
      let blocked = 0;
      for (const unit of units) {
        const point = localFinalPoint138(group, unit, candidate.x, candidate.y, angle);
        const navigable = typeof game.isNavigableUnitPoint133 === 'function'
          ? game.isNavigableUnitPoint133(unit, point.x, point.y, angle, false)
          : typeof game.isUnitPositionFree117 === 'function'
            ? game.isUnitPositionFree117(unit, point.x, point.y, angle, false)
            : !game.findBuildingCollision(point.x, point.y, (unit.radius || 5) + 5);
        if (!navigable) blocked += 1;
      }
      const score = blocked * 1e6 + candidate.distance;
      if (score < bestScore) { bestScore = score; best = candidate; }
      if (score === 0) break;
    }
    return { x: best.x, y: best.y };
  };

  GameClass.prototype.syncFormationFinalSlots138 = function(group, force = false) {
    if (!group || group.air) return group;
    const units = liveGroundMembers138(this, group);
    if (!units.length) return group;
    const slotSignature = units.map((unit) => {
      const slot = group.slots?.[unit.id] || {};
      return `${unit.id}:${Math.round((slot.forward || 0) * 10)}:${Math.round((slot.lateral || 0) * 10)}`;
    }).join('|');
    const requestedX = Number.isFinite(group.requestedTargetX138) ? group.requestedTargetX138 : group.targetX;
    const requestedY = Number.isFinite(group.requestedTargetY138) ? group.requestedTargetY138 : group.targetY;
    const finalAngle = Number.isFinite(group.finalAngle) ? group.finalAngle :
      Number.isFinite(group.finalAngle138) ? group.finalAngle138 :
        Math.atan2(requestedY - (group.ay ?? group.anchorY), requestedX - (group.ax ?? group.anchorX));
    const signature = `${slotSignature}@${Math.round(requestedX)}:${Math.round(requestedY)}:${Math.round(finalAngle * 1000)}`;
    if (!force && group._v138FinalSignature === signature && group.finalSlots138) return group;
    group.requestedTargetX138 = requestedX;
    group.requestedTargetY138 = requestedY;
    group.finalAngle138 = finalAngle;
    const anchor = chooseFinalAnchor138(this, group, units, requestedX, requestedY, finalAngle);
    group.finalAnchorX138 = anchor.x;
    group.finalAnchorY138 = anchor.y;
    group.targetX = anchor.x;
    group.targetY = anchor.y;
    if (group.type === 'patrol') { group.bx = anchor.x; group.by = anchor.y; }
    group.finalSlots138 = Object.fromEntries(units.map((unit) => [unit.id, localFinalPoint138(group, unit, anchor.x, anchor.y, finalAngle)]));
    group._v138FinalSignature = signature;
    return group;
  };

  GameClass.prototype.getFormationFinalSlot138 = function(group, unit) {
    this.syncFormationFinalSlots138(group);
    return group?.finalSlots138?.[unit?.id] || null;
  };

  const applyFinalSlotToCommand138 = (unit, command) => {
    if (!command || unit?.air) return command;
    const groupId = command.formationGroupId || command.formationId;
    const group = groupId ? unit.game?.formations?.get?.(groupId) : null;
    if (!group) return command;
    unit.game.syncFormationFinalSlots138?.(group);
    const slot = group.finalSlots138?.[unit.id];
    if (!slot) return command;
    command.formationFinalX138 = slot.x;
    command.formationFinalY138 = slot.y;
    if (command.type === 'patrol') { command.bx = slot.x; command.by = slot.y; }
    else { command.x = slot.x; command.y = slot.y; }
    return command;
  };

  const baseCreateFormation138 = GameClass.prototype.createFormationGroup;
  if (baseCreateFormation138) GameClass.prototype.createFormationGroup = function(units, type, targetX, targetY, options = {}) {
    const group = baseCreateFormation138.call(this, units, type, targetX, targetY, options);
    if (group && !group.air) this.syncFormationFinalSlots138(group, true);
    return group;
  };

  const baseSetCommand138 = UnitClass.prototype.setCommand;
  UnitClass.prototype.setCommand = function(command, append = false) {
    applyFinalSlotToCommand138(this, command);
    return baseSetCommand138.call(this, command, append);
  };

  const baseEnsureFormation138 = GameClass.prototype.ensureFormationGroupUpdated;
  if (baseEnsureFormation138) GameClass.prototype.ensureFormationGroupUpdated = function(group, dt) {
    const result = baseEnsureFormation138.call(this, group, dt);
    if (result && !result.air) {
      this.syncFormationFinalSlots138(result);
      for (const unit of liveGroundMembers138(this, result)) {
        const command = unit.currentCommand?.formationGroupId === result.id
          ? unit.currentCommand
          : unit.commandQueue?.find?.((entry) => entry.formationGroupId === result.id);
        applyFinalSlotToCommand138(unit, command);
      }
    }
    return result;
  };

  const baseHydrate138 = GameClass.prototype.hydrate;
  if (baseHydrate138) GameClass.prototype.hydrate = function(data) {
    const result = baseHydrate138.call(this, data);
    for (const group of this.formations?.values?.() || []) this.syncFormationFinalSlots138(group, true);
    for (const unit of this.units || []) {
      applyFinalSlotToCommand138(unit, unit.currentCommand);
      for (const command of unit.commandQueue || []) applyFinalSlotToCommand138(unit, command);
    }
    return result;
  };

  if (typeof document !== 'undefined') {
    void 0;
    const eyebrow = document.querySelector?.('#start-screen .eyebrow');
    if (eyebrow) void 0;
    const lead = document.querySelector?.('#start-screen .lead');
    if (lead) void 0;
    const strip = document.querySelector?.('#start-screen .feature-strip');
    if (strip && !strip.querySelector?.('[data-unit-formation138-feature]')) {
      void 0;
    }
  }

  window.__FD_UNIT_FORMATION_REFINEMENT_V138__ = {
    version: VERSION,
    referenceVisibleHeight: REFERENCE_VISIBLE_HEIGHT,
    alphaMetrics: INFANTRY_ALPHA_METRICS_138,
    applyFinalSlotToCommand: applyFinalSlotToCommand138,
  };
})();
