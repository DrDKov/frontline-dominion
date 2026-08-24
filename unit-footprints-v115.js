(() => {
  'use strict';

  const debug = window.__FD_DEBUG__;
  const Game = debug?.Game;
  const Unit = debug?.Unit;
  const UNIT_TYPES = debug?.UNIT_TYPES;
  const WORLD = debug?.WORLD || { width: 32000, height: 22000 };
  if (!Game || !Unit || !UNIT_TYPES) return;

  const VERSION = '11.6';
  const MANIFEST_URL = '/frontline-dominion/models/pilot/manifest.json?build=206';
  const ENGINEER_DISPLAY_SCALE = 1;
  const INFANTRY_REFERENCE_VISIBLE_HEIGHT = 40.5;
  // Alpha envelopes measured from the eight approved 192x144 C-U01 atlas
  // frames. They exclude transparent cell padding so an engineer cannot be
  // selected a whole body-height above or below the visible model.
  const ENGINEER_ALPHA_BOUNDS = [
    { x: 56, y: 26, width: 76, height: 97 },
    { x: 74, y: 29, width: 71, height: 95 },
    { x: 64, y: 25, width: 95, height: 103 },
    { x: 71, y: 24, width: 84, height: 113 },
    { x: 60, y: 25, width: 76, height: 119 },
    { x: 47, y: 29, width: 71, height: 114 },
    { x: 33, y: 26, width: 95, height: 105 },
    { x: 37, y: 25, width: 84, height: 93 },
  ];
  const infantryDisplayScale = (game, unit, worldWidth, cellAspect = .75) => {
    if (!unit?.infantry) return 1;
    const authoritative = game?.getUnitPresentationScale138?.(unit, worldWidth, cellAspect);
    if (Number.isFinite(authoritative)) return authoritative;
    return clamp(INFANTRY_REFERENCE_VISIBLE_HEIGHT / Math.max(1, worldWidth * cellAspect * .78), .85, 14);
  };
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const constructionApi = () => window.__FD_CONSTRUCTION_FOOTPRINT_V114__;
  const unitModels = new Map();

  const normalizedEnvelope = (value, bounds) => {
    if (value && [value.minX, value.minY, value.maxX, value.maxY].every(Number.isFinite)) return value;
    const length = Math.max(.01, Number(bounds?.[0]) || 1);
    const width = Math.max(.01, Number(bounds?.[1]) || 1);
    return { minX: -length / 2, minY: -width / 2, maxX: length / 2, maxY: width / 2 };
  };

  const modelScale = (stats, radius) => {
    const bounds = stats?.modelBoundsMeters;
    if (!Array.isArray(bounds)) return 1;
    const scaleConfig = stats.modelUnitScale || { mode: stats.infantry ? 'height' : 'length', factor: stats.infantry ? 2.99 : stats.air ? 5.246 : 5.217 };
    const basis = scaleConfig.mode === 'height'
      ? Math.max(.01, Number(bounds[2]) || 1)
      : Math.max(.01, Number(bounds[0]) || 1);
    return Math.max(1, radius || stats.radius || 12) * (stats.visualScale || 1) * (Number(scaleConfig.factor) || 1) / basis;
  };

  const footprintFromStats = (stats, radius = stats?.radius || 12) => {
    const bounds = stats?.modelBoundsMeters;
    if (!Array.isArray(bounds)) {
      const fallback = Math.max(8, Number(radius) || 12);
      return {
        minX: -fallback, maxX: fallback, minY: -fallback * .78, maxY: fallback * .78,
        halfLength: fallback, halfWidth: fallback * .78, height: fallback * 1.45,
        maxRadius: Math.hypot(fallback, fallback * .78),
        scale: 1, collision: stats?.infantry ? 'capsule' : stats?.air ? 'ellipse' : 'box', source: 'radius-fallback',
      };
    }
    const scale = modelScale(stats, radius);
    const envelope = normalizedEnvelope(stats.modelCollisionFootprintMeters, bounds);
    const minX = envelope.minX * scale;
    const maxX = envelope.maxX * scale;
    const minY = envelope.minY * scale;
    const maxY = envelope.maxY * scale;
    return {
      minX, maxX, minY, maxY,
      halfLength: Math.max(Math.abs(minX), Math.abs(maxX)),
      halfWidth: Math.max(Math.abs(minY), Math.abs(maxY)),
      maxRadius: Math.hypot(Math.max(Math.abs(minX), Math.abs(maxX)), Math.max(Math.abs(minY), Math.abs(maxY))),
      height: Math.max(1, Number(bounds[2]) || 1) * scale,
      scale,
      collision: stats.modelCollision || (stats.infantry ? 'capsule' : stats.air ? 'ellipse' : 'box'),
      source: 'approved-model',
    };
  };

  const footprintForUnit = (unit) => footprintFromStats(unit?.stats || {}, unit?.radius || 12);

  const footprintAt = (footprint, x, y, rotation = 0) => {
    const c = Math.cos(rotation);
    const s = Math.sin(rotation);
    const point = (along, across) => ({ x: x + along * c - across * s, y: y + along * s + across * c });
    const corners = [
      point(footprint.minX, footprint.minY), point(footprint.maxX, footprint.minY),
      point(footprint.maxX, footprint.maxY), point(footprint.minX, footprint.maxY),
    ];
    return { ...footprint, x, y, rotation, corners, maxRadius: Math.hypot(footprint.halfLength, footprint.halfWidth) };
  };

  const supportRadius = (unitOrFootprint, worldAngle, rotationOverride) => {
    const unit = unitOrFootprint?.stats ? unitOrFootprint : null;
    const footprint = unit ? footprintForUnit(unit) : unitOrFootprint;
    const rotation = Number.isFinite(rotationOverride) ? rotationOverride : (unit?.rotation || 0);
    const local = worldAngle - rotation;
    const along = Math.abs(Math.cos(local));
    const across = Math.abs(Math.sin(local));
    if (footprint.collision === 'ellipse') {
      const a = Math.max(1, footprint.halfLength);
      const b = Math.max(1, footprint.halfWidth);
      return 1 / Math.sqrt((along / a) ** 2 + (across / b) ** 2);
    }
    if (footprint.collision === 'capsule') {
      const radius = Math.min(footprint.halfLength, footprint.halfWidth);
      return radius + Math.max(0, footprint.halfLength - radius) * along;
    }
    return footprint.halfLength * along + footprint.halfWidth * across;
  };

  const massFor = (unit) => {
    const footprint = footprintForUnit(unit);
    const volume = footprint.halfLength * footprint.halfWidth * Math.max(4, footprint.height);
    const classFactor = unit.infantry ? .28 : unit.air ? .55 : unit.stats?.damageReduction ? 1.30 : 1;
    return Math.max(1, volume * classFactor);
  };

  Game.prototype.getUnitFootprint = function(unitOrType, radius = null) {
    const stats = typeof unitOrType === 'string' ? UNIT_TYPES[unitOrType] : unitOrType?.stats;
    if (!stats) return null;
    return footprintFromStats(stats, radius || unitOrType?.radius || stats.radius);
  };

  Game.prototype.getUnitFootprintAt = function(unit, x = unit?.x, y = unit?.y, rotation = unit?.rotation || 0) {
    if (!unit?.alive && unit?.alive !== undefined) return null;
    return footprintAt(footprintForUnit(unit), x, y, rotation);
  };

  Game.prototype.unitSupportRadius115 = function(unit, worldAngle, rotationOverride) {
    return supportRadius(unit, worldAngle, rotationOverride);
  };

  Game.prototype.unitPairClearance115 = function(unit, other, angle = Math.atan2(other.y - unit.y, other.x - unit.x)) {
    const base = supportRadius(unit, angle) + supportRadius(other, angle + Math.PI);
    const smaller = Math.min(footprintForUnit(unit).halfWidth, footprintForUnit(other).halfWidth);
    return base + Math.max(5, smaller * .16);
  };

  Game.prototype.unitCollidesWithBuilding115 = function(unit, x = unit.x, y = unit.y, rotation = unit.rotation || 0) {
    if (!unit || unit.air) return null;
    const exact = footprintAt(footprintForUnit(unit), x, y, rotation);
    const api = constructionApi();
    if (!api?.polygonsOverlap || !this.getEntityBuildingFootprintAt) return this.findBuildingCollision(x, y, Math.max(unit.radius, exact.halfWidth));
    const candidates = this.querySpatial(this.buildingSpatial, x, y, exact.maxRadius + 360);
    for (const building of candidates) {
      if (!building?.alive) continue;
      const occupied = this.getEntityBuildingFootprintAt(building, 2);
      if (occupied?.corners && api.polygonsOverlap(exact.corners, occupied.corners)) return building;
    }
    return null;
  };

  const baseAvoidance = Game.prototype.computeUnitAvoidance;
  Game.prototype.computeUnitAvoidance = function(unit, desiredVx, desiredVy) {
    const output = baseAvoidance.call(this, unit, desiredVx, desiredVy) || { x: 0, y: 0 };
    if (!unit?.alive || unit.air) return output;
    const footprint = footprintForUnit(unit);
    const nominalSpeed = Math.max(16, unit.stats?.speed || 60);
    const searchRadius = footprint.maxRadius + nominalSpeed * 1.20 + 150;
    const nearby = this.querySpatial(this.unitSpatial, unit.x, unit.y, searchRadius);
    const desiredLength = Math.hypot(desiredVx, desiredVy) || 1;
    const fx = desiredVx / desiredLength;
    const fy = desiredVy / desiredLength;
    const rightX = -fy;
    const rightY = fx;
    const ownVelocity = Math.max(unit.motionSpeed || 0, nominalSpeed * .56);
    let extraX = 0;
    let extraY = 0;
    let speedFactor = Number.isFinite(unit.v71TrafficSpeedFactor) ? unit.v71TrafficSpeedFactor : 1;
    let examined = 0;
    for (const other of nearby) {
      if (!other?.alive || other === unit || other.air || other.embarkedIn || examined++ > 30) continue;
      const dx = other.x - unit.x;
      const dy = other.y - unit.y;
      const distance = Math.hypot(dx, dy) || .001;
      const angle = Math.atan2(dy, dx);
      const required = this.unitPairClearance115(unit, other, angle);
      const otherSpeed = Math.max(other.motionSpeed || 0, (other.stats?.speed || 50) * .42);
      const otherVx = Math.cos(other.rotation || 0) * otherSpeed;
      const otherVy = Math.sin(other.rotation || 0) * otherSpeed;
      const relVx = otherVx - fx * ownVelocity;
      const relVy = otherVy - fy * ownVelocity;
      const relSpeedSq = relVx * relVx + relVy * relVy;
      const t = relSpeedSq > 1 ? clamp(-(dx * relVx + dy * relVy) / relSpeedSq, 0, 1.8) : 0;
      const closestX = dx + relVx * t;
      const closestY = dy + relVy * t;
      const closest = Math.hypot(closestX, closestY);
      const influence = required + Math.max(44, ownVelocity * .55);
      if (distance > influence && closest > required * 1.25) continue;
      const threat = clamp((required * 1.25 - closest) / Math.max(1, required * 1.25), 0, 1) * (1 - t / 2.2);
      const overlap = clamp((required - distance) / Math.max(1, required), 0, 1);
      const lateral = dx * rightX + dy * rightY;
      const forward = dx * fx + dy * fy;
      const sameGroup = Boolean(unit.currentCommand?.formationGroupId && unit.currentCommand?.formationGroupId === other.currentCommand?.formationGroupId);
      const pairKey = String(unit.id) < String(other.id) ? `${unit.id}:${other.id}` : `${other.id}:${unit.id}`;
      const deterministicSide = [...pairKey].reduce((sum, char) => (sum * 33 + char.charCodeAt(0)) >>> 0, 5381) & 1 ? 1 : -1;
      if (overlap > 0) {
        extraX -= dx / distance * (.38 + overlap * .92);
        extraY -= dy / distance * (.38 + overlap * .92);
      }
      if (forward > -required * .25 && (threat > .02 || Math.abs(lateral) < required * 1.15)) {
        const headingDot = fx * Math.cos(other.rotation || 0) + fy * Math.sin(other.rotation || 0);
        const side = headingDot < -.25 ? 1 : deterministicSide;
        const steer = (sameGroup ? .18 : .32) + threat * (sameGroup ? .34 : .72);
        extraX += rightX * side * steer;
        extraY += rightY * side * steer;
        const ownMass = massFor(unit);
        const otherMass = massFor(other);
        const yieldShare = otherMass / Math.max(1, ownMass + otherMass);
        speedFactor = Math.min(speedFactor, 1 - threat * (.12 + yieldShare * .24));
      }
    }
    const magnitude = Math.hypot(extraX, extraY);
    if (magnitude > .88) { extraX = extraX / magnitude * .88; extraY = extraY / magnitude * .88; }
    output.x += extraX;
    output.y += extraY;
    unit.v71TrafficSpeedFactor = clamp(speedFactor, unit.infantry ? .66 : .58, 1);
    return output;
  };

  const baseMoveGroundUnit = Game.prototype.moveGroundUnit;
  Game.prototype.moveGroundUnit = function(unit, nx, ny, finalGoal = null) {
    const startX = unit.x;
    const startY = unit.y;
    const startRotation = unit.rotation || 0;
    const result = baseMoveGroundUnit.call(this, unit, nx, ny, finalGoal);
    if (!result || !this.unitCollidesWithBuilding115(unit, unit.x, unit.y, unit.rotation || startRotation)) return result;

    unit.x = startX;
    unit.y = startY;
    // Keep the whole oriented hull out of exact building envelopes. Binary
    // clipping retains smooth forward progress up to the true contact point.
    let low = 0;
    let high = 1;
    for (let pass = 0; pass < 9; pass += 1) {
      const mid = (low + high) / 2;
      const x = startX + (nx - startX) * mid;
      const y = startY + (ny - startY) * mid;
      if (this.unitCollidesWithBuilding115(unit, x, y, unit.rotation || startRotation)) high = mid;
      else low = mid;
    }
    if (low > .04) {
      unit.x = startX + (nx - startX) * low;
      unit.y = startY + (ny - startY) * low;
      return true;
    }
    return false;
  };

  const baseNudgeUnit = Game.prototype.nudgeUnit;
  Game.prototype.nudgeUnit = function(unit, dx, dy) {
    const x = unit.x;
    const y = unit.y;
    const moved = baseNudgeUnit.call(this, unit, dx, dy);
    if (!moved || !this.unitCollidesWithBuilding115(unit, unit.x, unit.y, unit.rotation || 0)) return moved;
    unit.x = x;
    unit.y = y;
    return false;
  };

  Game.prototype.resolveUnitOverlaps = function(passes = 1) {
    for (let pass = 0; pass < passes; pass += 1) {
      this.rebuildSpatialIndexes?.();
      for (const unit of this.units) {
        if (!unit?.alive || unit.air || unit.embarkedIn) continue;
        const footprint = footprintForUnit(unit);
        const nearby = this.querySpatial(this.unitSpatial, unit.x, unit.y, footprint.maxRadius + 180);
        for (const other of nearby) {
          if (!other?.alive || other.air || other.embarkedIn || other === unit || String(other.id) <= String(unit.id)) continue;
          let dx = unit.x - other.x;
          let dy = unit.y - other.y;
          let distance = Math.hypot(dx, dy);
          if (distance < .01) {
            const phase = String(unit.id).localeCompare(String(other.id)) < 0 ? .78 : -.78;
            dx = Math.cos(phase);
            dy = Math.sin(phase);
            distance = 1;
          }
          const angle = Math.atan2(-dy, -dx);
          const required = this.unitPairClearance115(unit, other, angle);
          if (distance >= required) continue;
          const overlap = required - distance + .25;
          const unitMass = massFor(unit);
          const otherMass = massFor(other);
          const total = unitMass + otherMass;
          const ux = dx / distance;
          const uy = dy / distance;
          const movedUnit = this.nudgeUnit(unit, ux * overlap * otherMass / total, uy * overlap * otherMass / total);
          const movedOther = this.nudgeUnit(other, -ux * overlap * unitMass / total, -uy * overlap * unitMass / total);
          if (movedUnit) this.spatial?.update?.(unit, 'units');
          if (movedOther) this.spatial?.update?.(other, 'units');
        }
        if (this.unitCollidesWithBuilding115(unit)) this.resolveUnitBuildingOverlap?.(unit);
      }
    }
  };

  // v9.1 already routes every formation through this hook. Replacing its
  // heuristic dimensions makes balanced, column, wedge and choke-point layouts
  // all use the approved model's measured hull.
  Game.prototype.getFormationFootprint91 = function(unit) {
    const footprint = footprintForUnit(unit);
    return {
      halfLength: footprint.halfLength,
      halfWidth: footprint.halfWidth,
      clearance: Math.max(unit.infantry ? 7 : 10, footprint.halfWidth * (unit.air ? .32 : .22)),
      source: footprint.source,
    };
  };

  const baseFindSpawnPoint = Game.prototype.findSpawnPoint;
  Game.prototype.findSpawnPoint = function(building, typeId = 'worker') {
    const stats = UNIT_TYPES[typeId];
    if (!stats?.modelBoundsMeters) return baseFindSpawnPoint.call(this, building, typeId);
    const footprint = footprintFromStats(stats, stats.radius);
    const radius = Math.max(stats.radius, footprint.halfWidth);
    const baseAngle = Math.atan2((building.rallyPoint?.y ?? building.y) - building.y, (building.rallyPoint?.x ?? building.x + 100) - building.x);
    this.rebuildSpatialIndexes?.();
    for (let ring = 0; ring < 12; ring += 1) {
      const samples = 20 + ring * 4;
      for (let i = 0; i < samples; i += 1) {
        const signed = i % 2 ? 1 : -1;
        const angle = baseAngle + signed * Math.ceil(i / 2) * Math.PI * 2 / samples;
        const distance = building.radius + footprint.halfLength + 22 + ring * (footprint.halfLength * .68 + 14);
        const x = clamp(building.x + Math.cos(angle) * distance, footprint.maxRadius + 5, WORLD.width - footprint.maxRadius - 5);
        const y = clamp(building.y + Math.sin(angle) * distance, footprint.maxRadius + 5, WORLD.height - footprint.maxRadius - 5);
        const probe = { alive: true, x, y, rotation: angle, radius: stats.radius, stats, infantry: stats.infantry, air: stats.air };
        if (this.unitCollidesWithBuilding115(probe, x, y, angle)) continue;
        const nearby = this.querySpatial(this.unitSpatial, x, y, footprint.maxRadius + 110);
        if (nearby.some((other) => other?.alive && !other.air && Math.hypot(other.x - x, other.y - y) < supportRadius(footprint, Math.atan2(other.y - y, other.x - x), angle) + supportRadius(other, Math.atan2(y - other.y, x - other.x)) + 5)) continue;
        return { x, y };
      }
    }
    return baseFindSpawnPoint.call(this, building, typeId);
  };

  const workerScreenBounds = (game, unit) => {
    const x = unit.renderX ?? unit.x;
    const y = unit.renderY ?? unit.y;
    const rotation = unit.renderRotation ?? unit.rotation ?? 0;
    const exact = footprintAt(footprintForUnit(unit), x, y, rotation);
    const worldWidth = Math.max(exact.halfLength * 2, exact.halfWidth * 2);
    const displayScale = game.getUnitPresentationScale138?.(unit, worldWidth, .75) || ENGINEER_DISPLAY_SCALE;
    const targetWidth = worldWidth * (game.camera?.zoom || 1) * 1.34 * displayScale;
    const targetHeight = targetWidth * .75;
    const heading = ((rotation % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const frame = Math.round(heading / (Math.PI * 2 / 8)) % 8;
    const alpha = ENGINEER_ALPHA_BOUNDS[frame] || ENGINEER_ALPHA_BOUNDS[0];
    const center = game.worldToScreen(x, y, 0);
    const imageX = center.x - targetWidth * .5;
    const imageY = center.y - targetHeight * .79;
    const pad = clamp(targetWidth * .035, 2, 4);
    const x1 = imageX + targetWidth * alpha.x / 192 - pad;
    const y1 = imageY + targetHeight * alpha.y / 144 - pad;
    const x2 = imageX + targetWidth * (alpha.x + alpha.width) / 192 + pad;
    const y2 = imageY + targetHeight * (alpha.y + alpha.height) / 144 + pad;
    return {
      x1, y1, x2, y2, footprint: exact, frame,
      renderedWidth: targetWidth,
      renderedHeight: targetHeight,
      visibleWidth: x2 - x1,
      visibleHeight: y2 - y1,
    };
  };

  const unitScreenBounds = (game, unit) => {
    if (unit?.infantry && typeof game.getInfantryScreenBounds138 === 'function') {
      const tight = game.getInfantryScreenBounds138(unit);
      if (tight) return tight;
    }
    if (unit?.typeId === 'worker') return workerScreenBounds(game, unit);
    const x = unit.renderX ?? unit.x;
    const y = unit.renderY ?? unit.y;
    const rotation = unit.renderRotation ?? unit.rotation ?? 0;
    const footprint = footprintAt(footprintForUnit(unit), x, y, rotation);
    const points = [];
    for (const z of [0, footprint.height]) {
      for (const corner of footprint.corners) points.push(game.worldToScreen(corner.x, corner.y, z));
    }
    const center = game.worldToScreen(x, y, footprint.height * .5);
    points.push(center);
    const rawX1 = Math.min(...points.map((point) => point.x));
    const rawY1 = Math.min(...points.map((point) => point.y));
    const rawX2 = Math.max(...points.map((point) => point.x));
    const rawY2 = Math.max(...points.map((point) => point.y));
    // Selection follows the same constant world-space enlargement as the
    // sprite. The small fixed padding is only touch forgiveness; it never
    // changes the rendered model or its collision capsule.
    const horizontalWorldSpan = Math.max(footprint.halfLength * 2, footprint.halfWidth * 2);
    const visibleScale = 1.34 * infantryDisplayScale(game, unit, horizontalWorldSpan, .75);
    const desiredWidth = (rawX2 - rawX1) * visibleScale;
    const desiredHeight = (rawY2 - rawY1) * visibleScale;
    const padX = Math.max(8, (desiredWidth - (rawX2 - rawX1)) * .5);
    const padY = Math.max(8, (desiredHeight - (rawY2 - rawY1)) * .5);
    return {
      x1: rawX1 - padX,
      y1: rawY1 - padY,
      x2: rawX2 + padX,
      y2: rawY2 + padY,
      footprint,
    };
  };

  Game.prototype.getUnitScreenBounds116 = function(unit) {
    return unitScreenBounds(this, unit);
  };

  Game.prototype.getWorkerScreenBounds115 = function(unit) {
    if (unit?.typeId !== 'worker') return null;
    return this.getInfantryScreenBounds138?.(unit) || workerScreenBounds(this, unit);
  };

  const exactUnitHit = (game, worldX, worldY) => {
    const click = game.worldToScreen(worldX, worldY, 0);
    const hits = [];
    for (const unit of game.units || []) {
      if (!unit?.alive || (unit.team === 'enemy' && !game.isTargetableBy?.(unit, 'player'))) continue;
      const bounds = unitScreenBounds(game, unit);
      if (click.x < bounds.x1 || click.x > bounds.x2 || click.y < bounds.y1 || click.y > bounds.y2) continue;
      const cx = (bounds.x1 + bounds.x2) * .5;
      const cy = (bounds.y1 + bounds.y2) * .5;
      const nx = (click.x - cx) / Math.max(1, (bounds.x2 - bounds.x1) * .5);
      const ny = (click.y - cy) / Math.max(1, (bounds.y2 - bounds.y1) * .5);
      hits.push({ unit, score: nx * nx + ny * ny, area: (bounds.x2 - bounds.x1) * (bounds.y2 - bounds.y1) });
    }
    hits.sort((left, right) => left.score - right.score || left.area - right.area);
    return hits[0]?.unit || null;
  };

  const baseHitTest = Game.prototype.hitTest;
  if (baseHitTest) Game.prototype.hitTest = function(worldX, worldY, selectableOnly = true) {
    const exact = exactUnitHit(this, worldX, worldY);
    if (exact) return exact;
    const fallback = baseHitTest.call(this, worldX, worldY, selectableOnly);
    // The legacy infantry picker is a tall world-space segment. Never let it
    // reintroduce the old one-engineer margin above and below the measured
    // atlas silhouette after the exact picker has rejected that point.
    return fallback?.typeId === 'worker' ? null : fallback;
  };

  const baseContextHitTest = Game.prototype.hitTestForContext;
  if (baseContextHitTest) Game.prototype.hitTestForContext = function(worldX, worldY) {
    const exact = exactUnitHit(this, worldX, worldY);
    if (exact) return exact;
    const fallback = baseContextHitTest.call(this, worldX, worldY);
    return fallback?.typeId === 'worker' ? null : fallback;
  };

  if (Game.prototype.selectRect) Game.prototype.selectRect = function(screenRect, additive = false) {
    const x1 = Math.min(screenRect.x1, screenRect.x2);
    const y1 = Math.min(screenRect.y1, screenRect.y2);
    const x2 = Math.max(screenRect.x1, screenRect.x2);
    const y2 = Math.max(screenRect.y1, screenRect.y2);
    const entities = (this.units || []).filter((unit) => {
      if (!unit?.alive || unit.team !== 'player') return false;
      const bounds = unitScreenBounds(this, unit);
      return bounds.x2 >= x1 && bounds.x1 <= x2 && bounds.y2 >= y1 && bounds.y1 <= y2;
    });
    this.setSelection(entities, additive);
  };

  const applyManifest = (manifest) => {
    for (const spec of manifest?.models || []) {
      if (spec.type !== 'unit') continue;
      for (const typeId of spec.gameTypeIds || []) {
        unitModels.set(typeId, spec.code);
        const stats = UNIT_TYPES[typeId];
        if (!stats) continue;
        Object.assign(stats, {
          modelCode: spec.code,
          modelManifest: MANIFEST_URL,
          modelLods: spec.lods?.length || 3,
          modelBoundsMeters: Array.isArray(spec.boundsMeters) ? [...spec.boundsMeters] : null,
          modelCollisionFootprintMeters: spec.collisionFootprintMeters ? { ...spec.collisionFootprintMeters } : null,
          modelUnitScale: spec.unitScale ? { ...spec.unitScale } : null,
          modelCollision: spec.collision || null,
        });
      }
    }
    return manifest;
  };

  const ready = fetch(MANIFEST_URL, { cache: 'no-cache' })
    .then((response) => {
      if (!response.ok) throw new Error(`Unit manifest HTTP ${response.status}`);
      return response.json();
    })
    .then(applyManifest)
    .catch((error) => {
      console.warn('[Frontline Dominion] unit footprint manifest unavailable', error);
      return null;
    });

  window.__FD_UNIT_FOOTPRINTS_V115__ = {
    version: VERSION,
    ready,
    modelForType(typeId) { return unitModels.get(typeId) || null; },
    footprintFromStats,
    footprintForUnit,
    footprintAt,
    supportRadius,
    unitScreenBounds,
    workerScreenBounds,
    massFor,
  };
})();
