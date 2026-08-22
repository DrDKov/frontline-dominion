(() => {
  'use strict';

  const debug = window.__FD_DEBUG__;
  const Game = debug?.Game;
  const Unit = debug?.Unit;
  const WORLD = debug?.WORLD || { width: 32000, height: 22000 };
  if (!Game || !Unit) return;

  const VERSION = '11.7';
  const BUILDING_BROAD_PHASE = 430;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const constructionApi = () => window.__FD_CONSTRUCTION_FOOTPRINT_V114__;
  const unitApi = () => window.__FD_UNIT_FOOTPRINTS_V115__;

  const worldToModel = (originX, originY, rotation, worldX, worldY) => {
    const dx = worldX - originX;
    const dy = worldY - originY;
    const c = Math.cos(rotation || 0);
    const s = Math.sin(rotation || 0);
    return { x: dx * c + dy * s, y: dx * s - dy * c };
  };

  const modelToWorld = (originX, originY, rotation, modelX, modelY) => {
    const api = constructionApi();
    if (api?.modelPointToWorld) return api.modelPointToWorld(originX, originY, rotation || 0, modelX, modelY);
    const c = Math.cos(rotation || 0);
    const s = Math.sin(rotation || 0);
    return { x: originX + modelX * c + modelY * s, y: originY + modelX * s - modelY * c };
  };

  const pointGapToFootprint = (x, y, footprint) => {
    const local = worldToModel(footprint.x, footprint.y, footprint.rotation || 0, x, y);
    const dx = Math.max(footprint.minX - local.x, 0, local.x - footprint.maxX);
    const dy = Math.max(footprint.minY - local.y, 0, local.y - footprint.maxY);
    return Math.hypot(dx, dy);
  };

  const segmentAabbHitT = (x1, y1, x2, y2, minX, minY, maxX, maxY) => {
    const dx = x2 - x1;
    const dy = y2 - y1;
    let low = 0;
    let high = 1;
    for (const [start, delta, min, max] of [[x1, dx, minX, maxX], [y1, dy, minY, maxY]]) {
      if (Math.abs(delta) < 1e-9) {
        if (start < min || start > max) return null;
        continue;
      }
      let first = (min - start) / delta;
      let second = (max - start) / delta;
      if (first > second) [first, second] = [second, first];
      low = Math.max(low, first);
      high = Math.min(high, second);
      if (low > high) return null;
    }
    return high >= 0 && low <= 1 ? clamp(low, 0, 1) : null;
  };

  const segmentFootprintHitT = (x1, y1, x2, y2, footprint) => {
    const start = worldToModel(footprint.x, footprint.y, footprint.rotation || 0, x1, y1);
    const end = worldToModel(footprint.x, footprint.y, footprint.rotation || 0, x2, y2);
    return segmentAabbHitT(start.x, start.y, end.x, end.y, footprint.minX, footprint.minY, footprint.maxX, footprint.maxY);
  };

  const segmentCircleHitT = (x1, y1, x2, y2, cx, cy, radius) => {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const fx = x1 - cx;
    const fy = y1 - cy;
    const a = dx * dx + dy * dy;
    const c = fx * fx + fy * fy - radius * radius;
    if (c <= 0) return 0;
    if (a < 1e-9) return null;
    const b = 2 * (fx * dx + fy * dy);
    const discriminant = b * b - 4 * a * c;
    if (discriminant < 0) return null;
    const root = Math.sqrt(discriminant);
    const first = (-b - root) / (2 * a);
    const second = (-b + root) / (2 * a);
    if (first >= 0 && first <= 1) return first;
    if (second >= 0 && second <= 1) return second;
    return null;
  };

  const buildingCandidates = (game, x, y, radius) => {
    if (game.querySpatial && game.buildingSpatial) return game.querySpatial(game.buildingSpatial, x, y, radius);
    return game.buildings || [];
  };

  Game.prototype.getUnitNavigationRadius117 = function(unit) {
    if (!unit || unit.air) return Math.max(5, Number(unit?.radius) || 12);
    const footprint = this.getUnitFootprint?.(unit) || unitApi()?.footprintForUnit?.(unit);
    return Math.max(Number(unit.radius) || 12, Number(footprint?.maxRadius) + 6 || 0);
  };

  Game.prototype.findBuildingCollision = function(x, y, radius = 0, ignored = null) {
    radius = Math.max(0, Number(radius) || 0);
    let nearest = null;
    let nearestGap = Infinity;
    const candidates = buildingCandidates(this, x, y, radius + BUILDING_BROAD_PHASE);
    for (const building of candidates) {
      if (!building?.alive || building === ignored) continue;
      const footprint = this.getEntityBuildingFootprintAt?.(building, 3);
      let gap;
      if (footprint) gap = pointGapToFootprint(x, y, footprint) - radius;
      else gap = Math.hypot(building.x - x, building.y - y) - ((building.radius || 0) + radius + 5);
      if (gap < 0 && gap < nearestGap) {
        nearest = building;
        nearestGap = gap;
      }
    }
    for (const obstacle of this.terrainObstacles || []) {
      if (!obstacle?.radius || obstacle === ignored) continue;
      const gap = Math.hypot(obstacle.x - x, obstacle.y - y) - (obstacle.radius + radius + 6);
      if (gap < 0 && gap < nearestGap) {
        nearest = obstacle;
        nearestGap = gap;
      }
    }
    return nearest;
  };

  Game.prototype.findFirstBuildingOnSegment = function(x1, y1, x2, y2, clearance = 0, ignored = null) {
    const length = Math.hypot(x2 - x1, y2 - y1);
    if (length < 0.001) return this.findBuildingCollision(x1, y1, clearance, ignored);
    const midX = (x1 + x2) * .5;
    const midY = (y1 + y2) * .5;
    let best = null;
    let bestT = Infinity;
    const candidates = buildingCandidates(this, midX, midY, length * .5 + clearance + BUILDING_BROAD_PHASE);
    for (const building of candidates) {
      if (!building?.alive || building === ignored) continue;
      const footprint = this.getEntityBuildingFootprintAt?.(building, Math.max(0, clearance) + 3);
      const t = footprint
        ? segmentFootprintHitT(x1, y1, x2, y2, footprint)
        : segmentCircleHitT(x1, y1, x2, y2, building.x, building.y, (building.radius || 0) + clearance + 5);
      if (t != null && t < bestT) { best = building; bestT = t; }
    }
    for (const obstacle of this.terrainObstacles || []) {
      if (!obstacle?.radius || obstacle === ignored) continue;
      const t = segmentCircleHitT(x1, y1, x2, y2, obstacle.x, obstacle.y, obstacle.radius + clearance + 6);
      if (t != null && t < bestT) { best = obstacle; bestT = t; }
    }
    return best;
  };

  const unitTerrainCollision = (game, unit, x, y, rotation = unit.rotation || 0) => {
    for (const obstacle of game.terrainObstacles || []) {
      if (!obstacle?.radius) continue;
      const angle = Math.atan2(obstacle.y - y, obstacle.x - x);
      const support = game.unitSupportRadius115?.(unit, angle, rotation) || game.getUnitNavigationRadius117(unit);
      if (Math.hypot(obstacle.x - x, obstacle.y - y) < obstacle.radius + support + 6) return obstacle;
    }
    return null;
  };

  Game.prototype.isUnitPositionFree117 = function(unit, x, y, rotation = unit?.rotation || 0, checkUnits = true) {
    if (!unit || unit.air) return true;
    const exact = this.getUnitFootprintAt?.(unit, x, y, rotation);
    const margin = this.getUnitNavigationRadius117(unit) + 3;
    if (exact?.corners) {
      if (exact.corners.some((point) => point.x < 4 || point.y < 4 || point.x > WORLD.width - 4 || point.y > WORLD.height - 4)) return false;
    } else if (x < margin || y < margin || x > WORLD.width - margin || y > WORLD.height - margin) return false;
    if (this.unitCollidesWithBuilding115?.(unit, x, y, rotation) || unitTerrainCollision(this, unit, x, y, rotation)) return false;
    if (!checkUnits) return true;
    const radius = this.getUnitNavigationRadius117(unit);
    const nearby = this.querySpatial?.(this.unitSpatial, x, y, radius + 220) || this.units || [];
    for (const other of nearby) {
      if (!other?.alive || other.air || other.embarkedIn || other === unit) continue;
      const angle = Math.atan2(other.y - y, other.x - x);
      const required = this.unitPairClearance115?.(unit, other, angle)
        || radius + this.getUnitNavigationRadius117(other) + 4;
      if (Math.hypot(other.x - x, other.y - y) < required) return false;
    }
    return true;
  };

  const sweptUnitPositionFree = (game, unit, startX, startY, endX, endY, rotation) => {
    const length = Math.hypot(endX - startX, endY - startY);
    const samples = Math.max(1, Math.ceil(length / Math.max(7, game.getUnitNavigationRadius117(unit) * .28)));
    for (let index = 1; index <= samples; index += 1) {
      const t = index / samples;
      if (!game.isUnitPositionFree117(unit, startX + (endX - startX) * t, startY + (endY - startY) * t, rotation, false)) return false;
    }
    return true;
  };

  const baseNavigationIgnored = Unit.prototype.navigationIgnoredBuilding;
  Unit.prototype.navigationIgnoredBuilding = function() {
    const command = this.currentCommand;
    const interaction = Boolean(
      command?.interactionTargetId || command?.buildingId || command?.dropoffId
      || ['build', 'repair', 'capture', 'harvest', 'covert', 'covertMission'].includes(command?.type)
    );
    return interaction ? null : baseNavigationIgnored?.call(this) || null;
  };

  Game.prototype.getBuildingSurfaceDistance117 = function(unit, building) {
    const footprint = this.getEntityBuildingFootprintAt?.(building, 0);
    return footprint ? pointGapToFootprint(unit.x, unit.y, footprint) : Math.max(0, Math.hypot(unit.x - building.x, unit.y - building.y) - (building.radius || 0));
  };

  Game.prototype.isBuildingInteractionReady117 = function(unit, building, purpose) {
    if (!unit?.alive || !building?.alive || building.kind !== 'building') return false;
    if (this.unitCollidesWithBuilding115?.(unit, unit.x, unit.y, unit.rotation || 0)) return false;
    const padding = this.getInteractionPadding?.(purpose) ?? 34;
    return this.getBuildingSurfaceDistance117(unit, building) <= this.getUnitNavigationRadius117(unit) + Math.max(10, padding * .74);
  };

  const baseInteractionRange = Game.prototype.getInteractionRange;
  Game.prototype.getInteractionRange = function(unit, target, purpose) {
    if (target?.kind !== 'building') return baseInteractionRange?.call(this, unit, target, purpose) ?? ((unit.radius || 0) + (target?.radius || 0) + 34);
    const footprint = this.getEntityBuildingFootprintAt?.(target, 0);
    return (footprint?.maxRadius || target.radius || 0) + this.getUnitNavigationRadius117(unit) + (this.getInteractionPadding?.(purpose) ?? 34);
  };

  const perimeterCandidates = (footprint, offset) => {
    const fractions = [0, .22, -.22, .45, -.45, .68, -.68, .88, -.88];
    const points = [];
    for (const fraction of fractions) {
      const x = footprint.minX + (footprint.maxX - footprint.minX) * (.5 + fraction * .5);
      const y = footprint.minY + (footprint.maxY - footprint.minY) * (.5 + fraction * .5);
      points.push(
        { x: footprint.minX - offset, y, edge: 'left' },
        { x: footprint.maxX + offset, y, edge: 'right' },
        { x, y: footprint.minY - offset, edge: 'top' },
        { x, y: footprint.maxY + offset, edge: 'bottom' },
      );
    }
    return points;
  };

  const baseInteractionApproach = Game.prototype.getInteractionApproachPoint;
  Game.prototype.getInteractionApproachPoint = function(unit, target, command, purpose) {
    if (target?.kind !== 'building') return baseInteractionApproach.call(this, unit, target, command, purpose);
    command ||= {};
    const navigationRadius = this.getUnitNavigationRadius117(unit);
    const footprint = this.getEntityBuildingFootprintAt?.(target, 0);
    if (!footprint) return baseInteractionApproach.call(this, unit, target, command, purpose);
    const cached = command.interactionTargetId === target.id
      && command.interactionPurpose === purpose
      && Number.isFinite(command.approachX) && Number.isFinite(command.approachY)
      && (command.approachRefreshAt || 0) > (this.time || 0)
      && this.isUnitPositionFree117(unit, command.approachX, command.approachY, unit.rotation || 0, false);
    if (cached) return { x: command.approachX, y: command.approachY };

    const padding = this.getInteractionPadding?.(purpose) ?? 34;
    const offset = navigationRadius + Math.max(14, padding * .42);
    const hash = this.deterministicHash?.(`${unit.id}:${target.id}:${purpose}`) || 0;
    const candidates = [];
    for (const local of perimeterCandidates(footprint, offset)) {
      const world = modelToWorld(target.x, target.y, target.rotation || 0, local.x, local.y);
      const x = clamp(world.x, navigationRadius + 5, WORLD.width - navigationRadius - 5);
      const y = clamp(world.y, navigationRadius + 5, WORLD.height - navigationRadius - 5);
      const prospectiveRotation = Math.atan2(y - unit.y, x - unit.x);
      if (!this.isUnitPositionFree117(unit, x, y, prospectiveRotation, false)) continue;
      const blocker = this.findFirstBuildingOnSegment(unit.x, unit.y, x, y, navigationRadius + 2, null);
      if (blocker === target) continue;
      let score = Math.hypot(x - unit.x, y - unit.y) + (blocker ? 720 : 0);
      score += ((['left', 'right', 'top', 'bottom'].indexOf(local.edge) - hash) & 3) * 2.5;
      const nearby = this.querySpatial?.(this.unitSpatial, x, y, navigationRadius + 180) || [];
      for (const other of nearby) {
        if (!other?.alive || other.air || other === unit) continue;
        const preferred = navigationRadius + this.getUnitNavigationRadius117(other) + 10;
        score += Math.max(0, preferred + 42 - Math.hypot(other.x - x, other.y - y)) * 4.5;
      }
      for (const other of this.units || []) {
        if (!other?.alive || other === unit || other.air) continue;
        const otherCommand = other.currentCommand;
        if (otherCommand?.interactionTargetId !== target.id || otherCommand?.interactionPurpose !== purpose) continue;
        if (!Number.isFinite(otherCommand.approachX) || !Number.isFinite(otherCommand.approachY)) continue;
        const reserved = navigationRadius + this.getUnitNavigationRadius117(other) + 12;
        const gap = Math.hypot(otherCommand.approachX - x, otherCommand.approachY - y);
        if (gap < reserved) score += 900 + (reserved - gap) * 10;
      }
      candidates.push({ x, y, score });
    }

    candidates.sort((left, right) => left.score - right.score);
    let point = candidates[0];
    if (!point) {
      const angle = Math.atan2(unit.y - target.y, unit.x - target.x);
      const distance = footprint.maxRadius + offset + 20;
      point = this.findReachablePoint?.(target.x + Math.cos(angle) * distance, target.y + Math.sin(angle) * distance, navigationRadius)
        || { x: target.x + Math.cos(angle) * distance, y: target.y + Math.sin(angle) * distance };
    }
    command.interactionTargetId = target.id;
    command.interactionPurpose = purpose;
    command.approachX = point.x;
    command.approachY = point.y;
    command.approachRefreshAt = (this.time || 0) + .9;
    command._v117ApproachDistance = Math.hypot(unit.x - point.x, unit.y - point.y);
    command._v117ApproachProgressAt = this.time || 0;
    return point;
  };

  const baseMoveTowardInteraction = Unit.prototype.moveTowardInteraction;
  Unit.prototype.moveTowardInteraction = function(target, command, dt, purpose) {
    if (target?.kind !== 'building') return baseMoveTowardInteraction.call(this, target, command, dt, purpose);
    if (!target?.alive) return false;
    const collision = this.game.unitCollidesWithBuilding115?.(this, this.x, this.y, this.rotation || 0);
    if (collision) {
      this.game.resolveUnitBuildingOverlap(this);
      command.approachRefreshAt = 0;
    }
    if (this.game.isBuildingInteractionReady117(this, target, purpose)) return true;
    const point = this.game.getInteractionApproachPoint(this, target, command, purpose);
    this.moveToward(point.x, point.y, dt, 1, { dynamic: false });
    if (this.game.isBuildingInteractionReady117(this, target, purpose)) return true;
    const pointDistance = Math.hypot(this.x - point.x, this.y - point.y);
    if (pointDistance + 3 < (command._v117ApproachDistance ?? Infinity)) {
      command._v117ApproachDistance = pointDistance;
      command._v117ApproachProgressAt = this.game.time || 0;
    } else if ((this.game.time || 0) - (command._v117ApproachProgressAt || 0) > .72) {
      command.approachRefreshAt = 0;
    }
    if (pointDistance <= Math.max(12, this.game.getUnitNavigationRadius117(this) * .45)) command.approachRefreshAt = 0;
    return false;
  };

  const basePlanGroundPath = Game.prototype.planGroundPath;
  Game.prototype.planGroundPath = function(unit, tx, ty, ignored = null, options = {}) {
    if (!unit || unit.air) return basePlanGroundPath.call(this, unit, tx, ty, ignored, options);
    const navigationRadius = this.getUnitNavigationRadius117(unit);
    const proxy = Object.create(unit);
    proxy.radius = Math.max(unit.radius || 0, navigationRadius - 8);
    let effectiveIgnored = ignored;
    if (ignored && (unit.currentCommand?.interactionTargetId === ignored.id || unit.currentCommand?.buildingId === ignored.id)) effectiveIgnored = null;
    let path = basePlanGroundPath.call(this, proxy, tx, ty, effectiveIgnored, options) || [];
    let fromX = unit.x;
    let fromY = unit.y;
    const blocked = path.some((point) => {
      const hit = this.findFirstBuildingOnSegment(fromX, fromY, point.x, point.y, navigationRadius + 4 + (options.clearanceBoost || 0), effectiveIgnored);
      fromX = point.x;
      fromY = point.y;
      return Boolean(hit);
    });
    if (blocked && (unit.currentCommand?.formationGroupId || unit.currentCommand?.formationId)) {
      const individual = Object.create(proxy);
      Object.defineProperty(individual, 'currentCommand', {
        configurable: true,
        value: { ...unit.currentCommand, formationGroupId: null, formationId: null },
      });
      individual.id = `${unit.id}:v117`;
      path = basePlanGroundPath.call(this, individual, tx, ty, effectiveIgnored, { ...options, wide: true }) || path;
    }
    return path;
  };

  const baseFindDetour = Game.prototype.findDetourWaypoint;
  Game.prototype.findDetourWaypoint = function(unit, blocker, tx, ty, ignored = null) {
    if (!blocker || blocker.terrain || blocker.kind !== 'building') return baseFindDetour.call(this, unit, blocker, tx, ty, ignored);
    const navigationRadius = this.getUnitNavigationRadius117(unit);
    const footprint = this.getEntityBuildingFootprintAt?.(blocker, navigationRadius + 22);
    if (!footprint) return baseFindDetour.call(this, unit, blocker, tx, ty, ignored);
    const candidates = perimeterCandidates(footprint, 0).map((local) => {
      const world = modelToWorld(blocker.x, blocker.y, blocker.rotation || 0, local.x, local.y);
      const routeBlocker = this.findFirstBuildingOnSegment(world.x, world.y, tx, ty, navigationRadius + 4, ignored);
      return {
        x: world.x, y: world.y,
        score: Math.hypot(world.x - unit.x, world.y - unit.y) + Math.hypot(tx - world.x, ty - world.y) + (routeBlocker && routeBlocker !== blocker ? 640 : 0),
      };
    }).filter((point) => this.isUnitPositionFree117(unit, point.x, point.y, unit.rotation || 0, false));
    candidates.sort((left, right) => left.score - right.score);
    return candidates[0] || baseFindDetour.call(this, unit, blocker, tx, ty, ignored);
  };

  Game.prototype.moveGroundUnit = function(unit, nx, ny, finalGoal = null) {
    if (!unit?.alive || unit.air) return false;
    if (this.unitCollidesWithBuilding115?.(unit, unit.x, unit.y, unit.rotation || 0)) this.resolveUnitBuildingOverlap(unit);
    const navigationRadius = this.getUnitNavigationRadius117(unit);
    const margin = navigationRadius + 4;
    nx = clamp(nx, margin, WORLD.width - margin);
    ny = clamp(ny, margin, WORLD.height - margin);
    const startX = unit.x;
    const startY = unit.y;
    const dx = nx - startX;
    const dy = ny - startY;
    const step = Math.hypot(dx, dy);
    if (step < .01) return false;
    const rotation = unit.rotation || Math.atan2(dy, dx);
    const tryPosition = (x, y) => {
      x = clamp(x, margin, WORLD.width - margin);
      y = clamp(y, margin, WORLD.height - margin);
      if (!sweptUnitPositionFree(this, unit, startX, startY, x, y, rotation)) return false;
      unit.x = x;
      unit.y = y;
      return true;
    };
    if (tryPosition(nx, ny)) return true;

    const directAngle = Math.atan2(dy, dx);
    const preferredSide = unit._v117SlideUntil > (this.time || 0)
      ? unit._v117SlideSide
      : ((this.deterministicSign?.(`${unit.id}:slide`) || 1) > 0 ? 1 : -1);
    const offsets = [28, 48, 68, 86, 104].flatMap((degrees) => [preferredSide * degrees, -preferredSide * degrees]);
    const goal = finalGoal || { x: nx, y: ny };
    const startGoalDistance = Math.hypot(goal.x - startX, goal.y - startY);
    const candidates = [];
    for (const degrees of offsets) {
      const angle = directAngle + degrees * Math.PI / 180;
      const x = startX + Math.cos(angle) * step;
      const y = startY + Math.sin(angle) * step;
      if (!sweptUnitPositionFree(this, unit, startX, startY, x, y, rotation)) continue;
      const goalDistance = Math.hypot(goal.x - x, goal.y - y);
      if (goalDistance > startGoalDistance + step * .38) continue;
      candidates.push({ x, y, side: Math.sign(degrees), score: goalDistance + Math.abs(degrees) * .018 + (Math.sign(degrees) === preferredSide ? -2 : 0) });
    }
    if (candidates.length) {
      candidates.sort((left, right) => left.score - right.score);
      const chosen = candidates[0];
      unit.x = chosen.x;
      unit.y = chosen.y;
      unit._v117SlideSide = chosen.side || preferredSide;
      unit._v117SlideUntil = (this.time || 0) + .72;
      return true;
    }

    let low = 0;
    let high = 1;
    for (let pass = 0; pass < 8; pass += 1) {
      const mid = (low + high) * .5;
      if (sweptUnitPositionFree(this, unit, startX, startY, startX + dx * mid, startY + dy * mid, rotation)) low = mid;
      else high = mid;
    }
    if (low > .06) {
      unit.x = startX + dx * low;
      unit.y = startY + dy * low;
      return true;
    }
    return false;
  };

  Game.prototype.nudgeUnit = function(unit, dx, dy) {
    if (!unit?.alive || unit.air) return false;
    const x = unit.x + dx;
    const y = unit.y + dy;
    if (!this.isUnitPositionFree117(unit, x, y, unit.rotation || 0, false)) return false;
    unit.x = x;
    unit.y = y;
    return true;
  };

  const candidateOutsideBuilding = (game, unit, building) => {
    const navigationRadius = game.getUnitNavigationRadius117(unit);
    const footprint = game.getEntityBuildingFootprintAt?.(building, navigationRadius + 12);
    if (!footprint) return null;
    const local = worldToModel(building.x, building.y, building.rotation || 0, unit.x, unit.y);
    const entries = [
      { x: footprint.minX, y: clamp(local.y, footprint.minY, footprint.maxY), cost: Math.abs(local.x - footprint.minX) },
      { x: footprint.maxX, y: clamp(local.y, footprint.minY, footprint.maxY), cost: Math.abs(local.x - footprint.maxX) },
      { x: clamp(local.x, footprint.minX, footprint.maxX), y: footprint.minY, cost: Math.abs(local.y - footprint.minY) },
      { x: clamp(local.x, footprint.minX, footprint.maxX), y: footprint.maxY, cost: Math.abs(local.y - footprint.maxY) },
    ];
    const spread = [0, navigationRadius * .55, -navigationRadius * .55, navigationRadius * 1.1, -navigationRadius * 1.1];
    const candidates = [];
    for (const entry of entries) {
      for (const tangent of spread) {
        const verticalEdge = entry.x === footprint.minX || entry.x === footprint.maxX;
        const localX = verticalEdge ? entry.x : clamp(entry.x + tangent, footprint.minX, footprint.maxX);
        const localY = verticalEdge ? clamp(entry.y + tangent, footprint.minY, footprint.maxY) : entry.y;
        const world = modelToWorld(building.x, building.y, building.rotation || 0, localX, localY);
        if (!game.isUnitPositionFree117(unit, world.x, world.y, unit.rotation || 0, false)) continue;
        candidates.push({ ...world, score: Math.hypot(world.x - unit.x, world.y - unit.y) + entry.cost * .02 });
      }
    }
    candidates.sort((left, right) => left.score - right.score);
    return candidates[0] || null;
  };

  Game.prototype.resolveUnitBuildingOverlap = function(unit) {
    if (!unit?.alive || unit.air) return true;
    for (let iteration = 0; iteration < 5; iteration += 1) {
      const building = this.unitCollidesWithBuilding115?.(unit, unit.x, unit.y, unit.rotation || 0);
      if (!building) return true;
      const point = candidateOutsideBuilding(this, unit, building);
      if (!point) break;
      const oldX = unit.x;
      const oldY = unit.y;
      unit.x = point.x;
      unit.y = point.y;
      unit.renderX = oldX;
      unit.renderY = oldY;
      unit.lastPositionX = point.x;
      unit.lastPositionY = point.y;
      if (unit.currentCommand) unit.currentCommand.approachRefreshAt = 0;
      unit.invalidateNavigation?.();
    }
    if (this.unitCollidesWithBuilding115?.(unit, unit.x, unit.y, unit.rotation || 0)) return this.relocateUnitToNearestFree(unit, 620);
    return true;
  };

  Game.prototype.relocateUnitToNearestFree = function(unit, maxRadius = 420) {
    if (!unit?.alive || unit.air) return true;
    this.rebuildSpatialIndexes?.();
    const originX = unit.x;
    const originY = unit.y;
    const navigationRadius = this.getUnitNavigationRadius117(unit);
    const step = Math.max(24, navigationRadius * .62);
    for (let ring = step; ring <= Math.max(maxRadius, step * 3); ring += step) {
      const samples = Math.max(16, Math.ceil(Math.PI * 2 * ring / Math.max(30, navigationRadius * .72)));
      const phase = ((this.deterministicHash?.(unit.id) || 0) % 628) / 100;
      for (let index = 0; index < samples; index += 1) {
        const angle = phase + index / samples * Math.PI * 2;
        const x = originX + Math.cos(angle) * ring;
        const y = originY + Math.sin(angle) * ring;
        if (!this.isUnitPositionFree117(unit, x, y, unit.rotation || 0, true)) continue;
        unit.x = x;
        unit.y = y;
        unit.lastPositionX = x;
        unit.lastPositionY = y;
        if (unit.currentCommand) unit.currentCommand.approachRefreshAt = 0;
        unit.invalidateNavigation?.();
        return true;
      }
    }
    return false;
  };

  const baseRecoveryPoint = Game.prototype.findNavigationRecoveryPoint;
  Game.prototype.findNavigationRecoveryPoint = function(unit) {
    if (!unit || unit.air) return baseRecoveryPoint?.call(this, unit) || null;
    const goal = unit.navProgressGoal || unit.navTarget || { x: unit.x + Math.cos(unit.rotation || 0) * 100, y: unit.y + Math.sin(unit.rotation || 0) * 100 };
    const reverse = Math.atan2(goal.y - unit.y, goal.x - unit.x) + Math.PI;
    const side = (this.deterministicSign?.(`${unit.id}:${unit.stuckStage || 0}`) || 1) > 0 ? 1 : -1;
    const radius = this.getUnitNavigationRadius117(unit);
    const candidates = [];
    for (const distance of [radius * 1.5, radius * 2.4, radius * 3.6, radius * 5.2]) {
      for (const offset of [0, .42 * side, -.42 * side, .82 * side, -.82 * side, 1.28 * side, -1.28 * side]) {
        const angle = reverse + offset;
        const x = unit.x + Math.cos(angle) * distance;
        const y = unit.y + Math.sin(angle) * distance;
        if (!this.isUnitPositionFree117(unit, x, y, unit.rotation || 0, true)) continue;
        if (this.findFirstBuildingOnSegment(unit.x, unit.y, x, y, radius + 3, null)) continue;
        candidates.push({ x, y, score: Math.hypot(goal.x - x, goal.y - y) * .02 + Math.abs(offset) * 15 + distance * .025 });
      }
    }
    candidates.sort((left, right) => left.score - right.score);
    return candidates[0] || baseRecoveryPoint?.call(this, unit) || null;
  };

  const baseEvacuate = Game.prototype.evacuateUnitsFromConstructionSite;
  if (baseEvacuate) Game.prototype.evacuateUnitsFromConstructionSite = function(x, y, legacyRadius) {
    const moved = baseEvacuate.call(this, x, y, legacyRadius) || 0;
    const typeId = this.buildMode?.typeId;
    const rotation = this.buildMode?.rotation || 0;
    const planned = typeId ? this.getBuildingFootprintAt?.(typeId, x, y, rotation, 'player', 5) : null;
    const polygonsOverlap = constructionApi()?.polygonsOverlap;
    if (!planned?.corners || !polygonsOverlap) return moved;
    this.rebuildSpatialIndexes?.();
    let additional = 0;
    const reserved = [];
    for (const unit of this.units || []) {
      if (!unit?.alive || unit.air || unit.embarkedIn) continue;
      const exact = this.getUnitFootprintAt?.(unit, unit.x, unit.y, unit.rotation || 0);
      if (!exact?.corners || !polygonsOverlap(exact.corners, planned.corners)) continue;
      const navigationRadius = this.getUnitNavigationRadius117(unit);
      const candidates = [];
      for (const extra of [16, 64, 128]) {
        for (const local of perimeterCandidates(planned, navigationRadius + extra)) {
          const world = modelToWorld(x, y, rotation, local.x, local.y);
          if (!this.isUnitPositionFree117(unit, world.x, world.y, unit.rotation || 0, false)) continue;
          const candidateFootprint = this.getUnitFootprintAt?.(unit, world.x, world.y, unit.rotation || 0);
          if (candidateFootprint?.corners && polygonsOverlap(candidateFootprint.corners, planned.corners)) continue;
          if (reserved.some((point) => Math.hypot(point.x - world.x, point.y - world.y) < point.radius + navigationRadius + 6)) continue;
          candidates.push({ ...world, score: Math.hypot(world.x - unit.x, world.y - unit.y), radius: navigationRadius });
        }
        if (candidates.length) break;
      }
      candidates.sort((left, right) => left.score - right.score);
      const point = candidates[0];
      if (!point) continue;
      const oldX = unit.x;
      const oldY = unit.y;
      unit.x = point.x;
      unit.y = point.y;
      unit.renderX = oldX;
      unit.renderY = oldY;
      unit.lastPositionX = point.x;
      unit.lastPositionY = point.y;
      if (unit.currentCommand) unit.currentCommand.approachRefreshAt = 0;
      unit.invalidateNavigation?.();
      reserved.push(point);
      additional += 1;
    }
    if (additional) this.rebuildSpatialIndexes?.();
    return moved + additional;
  };

  const baseBuildFormationSlots = Game.prototype.buildFormationSlots;
  if (baseBuildFormationSlots) Game.prototype.buildFormationSlots = function(units, ...args) {
    const result = baseBuildFormationSlots.call(this, units, ...args);
    const ground = (units || []).filter((unit) => unit?.alive && !unit.air);
    if (!result || !ground.length) return result;
    const maxRadius = Math.max(...ground.map((unit) => this.getUnitNavigationRadius117(unit)));
    result.maxRadius = Math.max(result.maxRadius || 0, maxRadius);
    result.lateralSpacing = Math.max(result.lateralSpacing || 0, maxRadius * 2.08 + 8);
    result.depthSpacing = Math.max(result.depthSpacing || 0, maxRadius * 2.16 + 10);
    return result;
  };

  const baseEnsureFormation = Game.prototype.ensureFormationGroupUpdated;
  if (baseEnsureFormation) Game.prototype.ensureFormationGroupUpdated = function(group, dt) {
    const oldRadius = group?.maxRadius || 0;
    const result = baseEnsureFormation.call(this, group, dt);
    const units = group?.unitIds?.map((id) => this.getEntity(id)).filter((unit) => unit?.alive && !unit.air) || [];
    if (units.length) {
      const exactRadius = Math.max(...units.map((unit) => this.getUnitNavigationRadius117(unit)));
      if (exactRadius > (group.maxRadius || 0) + 1) group.maxRadius = exactRadius;
      if (exactRadius > oldRadius + 4 && group.path?.length) {
        group.path.length = 0;
        group.pathIndex = 0;
        group.repathTimer = 0;
      }
    }
    return result;
  };

  if (typeof document !== 'undefined') {
    void 0;
    const eyebrow = document.querySelector?.('#start-screen .eyebrow');
    if (eyebrow) void 0;
    const lead = document.querySelector?.('#start-screen .lead');
    if (lead) void 0;
  }

  window.__FD_NAVIGATION_FOOTPRINT_V117__ = {
    version: VERSION,
    worldToModel,
    modelToWorld,
    pointGapToFootprint,
    segmentAabbHitT,
    segmentFootprintHitT,
    sweptUnitPositionFree,
  };
})();
