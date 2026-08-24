(() => {
  'use strict';

  const debug = window.__FD_DEBUG__;
  const GameClass = debug?.Game;
  const UnitClass = debug?.Unit;
  const BuildingClass = debug?.Building;
  const ProjectileClass = debug?.Projectile;
  const TacticalAIClass = debug?.TacticalAI;
  const WORLD = debug?.WORLD || { width: 32000, height: 22000 };
  if (!GameClass || !UnitClass || !BuildingClass) return;

  const VERSION = '13.3';
  const TERRAIN_CELL = 720;
  const TERRAIN_PAD = 7;
  const TERRAIN_AUDIT_PER_TICK = 56;
  const AIR_SCAN_LIMIT = 112;
  const AIR_SCAN_RANGE = 2450;
  const AIR_MIN_ORBIT = 270;
  const AIR_MAX_ORBIT = 470;
  const AIR_TOUCH_PAD = 24;
  const TAU = Math.PI * 2;
  const canvas = typeof document !== 'undefined' ? document.getElementById('game-canvas') : null;
  const context = canvas?.getContext?.('2d') || null;
  const now133 = () => typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
  const clamp133 = (value, min, max) => Math.max(min, Math.min(max, value));
  const angleDelta133 = (from, to) => Math.atan2(Math.sin(to - from), Math.cos(to - from));
  const distance133 = (left, right) => Math.hypot((left?.x || 0) - (right?.x || 0), (left?.y || 0) - (right?.y || 0));
  const hash133 = (value) => {
    let hash = 2166136261;
    for (const char of String(value || 'entity')) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
    return hash >>> 0;
  };
  const isFixedWing133 = (unit) => Boolean(
    unit?.alive && unit.air && unit.stats?.mobilityClass === 'fixedWing' &&
    !/helicopter|lightGunship|transportHelicopter/i.test(`${unit.typeId || ''} ${unit.stats?.visualRole || ''}`),
  );
  const isAirborne133 = (unit) => Boolean(
    isFixedWing133(unit) && unit.airServiceState !== 'servicing' &&
    !['ready', 'service'].includes(unit.currentCommand?.stage),
  );
  const airRole133 = (game, unit) => game.unitVisualRole?.(unit) || unit?.stats?.visualRole || '';
  const terrainKey133 = (col, row) => `${col}:${row}`;
  const terrainRadius133 = (obstacle) => Math.max(0, Number(obstacle?.radius) || 0);
  const worldToModel133 = (originX, originY, rotation, worldX, worldY) => {
    const dx = worldX - originX;
    const dy = worldY - originY;
    const cosine = Math.cos(rotation || 0);
    const sine = Math.sin(rotation || 0);
    return { x: dx * cosine + dy * sine, y: dx * sine - dy * cosine };
  };
  const pointGapToFootprint133 = (x, y, footprint) => {
    const point = worldToModel133(footprint.x, footprint.y, footprint.rotation || 0, x, y);
    const dx = Math.max(footprint.minX - point.x, 0, point.x - footprint.maxX);
    const dy = Math.max(footprint.minY - point.y, 0, point.y - footprint.maxY);
    return Math.hypot(dx, dy);
  };
  const segmentAabbHitT133 = (x1, y1, x2, y2, minX, minY, maxX, maxY) => {
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
    return high >= 0 && low <= 1 ? clamp133(low, 0, 1) : null;
  };
  const segmentFootprintHitT133 = (x1, y1, x2, y2, footprint) => {
    const start = worldToModel133(footprint.x, footprint.y, footprint.rotation || 0, x1, y1);
    const end = worldToModel133(footprint.x, footprint.y, footprint.rotation || 0, x2, y2);
    return segmentAabbHitT133(start.x, start.y, end.x, end.y, footprint.minX, footprint.minY, footprint.maxX, footprint.maxY);
  };
  const segmentCircleHitT133 = (x1, y1, x2, y2, cx, cy, radius) => {
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

  // -----------------------------------------------------------------------
  // Authoritative terrain navigation: spawn, tactical movement and macro LOD
  // all use the same measured unit hull against the same rock grid.
  // -----------------------------------------------------------------------
  GameClass.prototype.rebuildTerrainNavigation133 = function(force = false) {
    const obstacles = this.terrainObstacles || [];
    const signature = `${obstacles.length}:${this.navRevision || 0}`;
    if (!force && this._terrainSignature133 === signature && this._terrainGrid133) return this._terrainGrid133;
    const grid = new Map();
    for (const obstacle of obstacles) {
      const radius = terrainRadius133(obstacle);
      if (!radius) continue;
      const minCol = Math.floor((obstacle.x - radius - 180) / TERRAIN_CELL);
      const maxCol = Math.floor((obstacle.x + radius + 180) / TERRAIN_CELL);
      const minRow = Math.floor((obstacle.y - radius - 180) / TERRAIN_CELL);
      const maxRow = Math.floor((obstacle.y + radius + 180) / TERRAIN_CELL);
      for (let row = minRow; row <= maxRow; row += 1) {
        for (let col = minCol; col <= maxCol; col += 1) {
          const key = terrainKey133(col, row);
          let cell = grid.get(key);
          if (!cell) grid.set(key, cell = []);
          cell.push(obstacle);
        }
      }
    }
    this._terrainGrid133 = grid;
    this._terrainSignature133 = signature;
    return grid;
  };

  GameClass.prototype.getTerrainObstaclesNear133 = function(x, y, radius = 0) {
    const grid = this.rebuildTerrainNavigation133();
    const minCol = Math.floor((x - radius) / TERRAIN_CELL);
    const maxCol = Math.floor((x + radius) / TERRAIN_CELL);
    const minRow = Math.floor((y - radius) / TERRAIN_CELL);
    const maxRow = Math.floor((y + radius) / TERRAIN_CELL);
    const result = [];
    const seen = new Set();
    for (let row = minRow; row <= maxRow; row += 1) {
      for (let col = minCol; col <= maxCol; col += 1) {
        for (const obstacle of grid.get(terrainKey133(col, row)) || []) {
          if (seen.has(obstacle)) continue;
          seen.add(obstacle);
          result.push(obstacle);
        }
      }
    }
    return result;
  };

  // v11.7 supplied exact building envelopes, but its terrain half still
  // walked every rock on every probe. Keep the same exact geometry while
  // sourcing both point and segment rock candidates from the v13.3 grid.
  GameClass.prototype.findBuildingCollision = function(x, y, radius = 0, ignored = null) {
    radius = Math.max(0, Number(radius) || 0);
    let nearest = null;
    let nearestGap = Infinity;
    const buildings = this.spatial?.queryRadius?.('buildings', x, y, radius + 430)
      || this.querySpatial?.(this.buildingSpatial, x, y, radius + 430)
      || this.buildings || [];
    for (const building of buildings) {
      if (!building?.alive || building === ignored) continue;
      const footprint = this.getEntityBuildingFootprintAt?.(building, 3);
      const gap = footprint
        ? pointGapToFootprint133(x, y, footprint) - radius
        : Math.hypot(building.x - x, building.y - y) - ((building.radius || 0) + radius + 5);
      if (gap < 0 && gap < nearestGap) {
        nearest = building;
        nearestGap = gap;
      }
    }
    for (const obstacle of this.getTerrainObstaclesNear133(x, y, radius + 430)) {
      if (!terrainRadius133(obstacle) || obstacle === ignored) continue;
      const gap = Math.hypot(obstacle.x - x, obstacle.y - y) - (terrainRadius133(obstacle) + radius + TERRAIN_PAD);
      if (gap < 0 && gap < nearestGap) {
        nearest = obstacle;
        nearestGap = gap;
      }
    }
    return nearest;
  };

  GameClass.prototype.findFirstBuildingOnSegment = function(x1, y1, x2, y2, clearance = 0, ignored = null) {
    clearance = Math.max(0, Number(clearance) || 0);
    const length = Math.hypot(x2 - x1, y2 - y1);
    if (length < .001) return this.findBuildingCollision(x1, y1, clearance, ignored);
    const midX = (x1 + x2) * .5;
    const midY = (y1 + y2) * .5;
    const broadRadius = length * .5 + clearance + 430;
    let best = null;
    let bestT = Infinity;
    const buildings = this.spatial?.queryRadius?.('buildings', midX, midY, broadRadius)
      || this.querySpatial?.(this.buildingSpatial, midX, midY, broadRadius)
      || this.buildings || [];
    for (const building of buildings) {
      if (!building?.alive || building === ignored) continue;
      const footprint = this.getEntityBuildingFootprintAt?.(building, clearance + 3);
      const hitT = footprint
        ? segmentFootprintHitT133(x1, y1, x2, y2, footprint)
        : segmentCircleHitT133(x1, y1, x2, y2, building.x, building.y, (building.radius || 0) + clearance + 5);
      if (hitT != null && hitT < bestT) {
        best = building;
        bestT = hitT;
      }
    }
    for (const obstacle of this.getTerrainObstaclesNear133(midX, midY, broadRadius)) {
      if (!terrainRadius133(obstacle) || obstacle === ignored) continue;
      const hitT = segmentCircleHitT133(x1, y1, x2, y2, obstacle.x, obstacle.y, terrainRadius133(obstacle) + clearance + TERRAIN_PAD);
      if (hitT != null && hitT < bestT) {
        best = obstacle;
        bestT = hitT;
      }
    }
    return best;
  };

  GameClass.prototype.findTerrainCollisionForUnit133 = function(unit, x = unit?.x, y = unit?.y, rotation = unit?.rotation || 0) {
    if (!unit?.alive || unit.air) return null;
    const broadRadius = this.getUnitNavigationRadius117?.(unit) || Math.max(8, Number(unit.radius) || 12);
    let closest = null;
    let closestGap = Infinity;
    for (const obstacle of this.getTerrainObstaclesNear133(x, y, broadRadius + 430)) {
      const angle = Math.atan2(obstacle.y - y, obstacle.x - x);
      const support = this.unitSupportRadius115?.(unit, angle, rotation) || broadRadius;
      const gap = Math.hypot(obstacle.x - x, obstacle.y - y) - (terrainRadius133(obstacle) + support + TERRAIN_PAD);
      if (gap < 0 && gap < closestGap) {
        closest = obstacle;
        closestGap = gap;
      }
    }
    return closest;
  };

  GameClass.prototype.isNavigableUnitPoint133 = function(unit, x, y, rotation = unit?.rotation || 0, checkUnits = false) {
    if (!unit || unit.air || !Number.isFinite(x) || !Number.isFinite(y)) return Boolean(unit?.air);
    const navigationRadius = this.getUnitNavigationRadius117?.(unit) || Math.max(8, Number(unit.radius) || 12);
    if (x < navigationRadius + 4 || y < navigationRadius + 4 || x > WORLD.width - navigationRadius - 4 || y > WORLD.height - navigationRadius - 4) return false;
    if (this.findTerrainCollisionForUnit133(unit, x, y, rotation)) return false;
    if (this.unitCollidesWithBuilding115?.(unit, x, y, rotation)) return false;
    if (!checkUnits) return true;
    const nearby = this.querySpatial?.(this.unitSpatial, x, y, navigationRadius + 220) || [];
    for (const other of nearby) {
      if (!other?.alive || other === unit || other.air || other.embarkedIn) continue;
      const angle = Math.atan2(other.y - y, other.x - x);
      const required = this.unitPairClearance115?.(unit, other, angle)
        || navigationRadius + (this.getUnitNavigationRadius117?.(other) || other.radius || 10) + 4;
      if (Math.hypot(other.x - x, other.y - y) < required) return false;
    }
    return true;
  };

  // navigation-footprint-v117 deliberately calls this method dynamically from
  // its swept-hull mover. Rebinding it here replaces its old full-array rock
  // scan with the same exact hull test backed by the v13.3 terrain grid.
  GameClass.prototype.isUnitPositionFree117 = function(unit, x, y, rotation = unit?.rotation || 0, checkUnits = true) {
    return this.isNavigableUnitPoint133(unit, x, y, rotation, checkUnits);
  };

  GameClass.prototype.relocateUnitFromTerrain133 = function(unit, maxRadius = 920, checkUnits = true) {
    if (!unit?.alive || unit.air) return true;
    this.rebuildSpatialIndexes?.();
    const originX = unit.x;
    const originY = unit.y;
    const radius = this.getUnitNavigationRadius117?.(unit) || Math.max(10, unit.radius || 12);
    const step = Math.max(28, radius * .72);
    for (let ring = step; ring <= maxRadius; ring += step) {
      const samples = Math.max(18, Math.ceil(TAU * ring / Math.max(34, radius * .82)));
      const phase = (hash133(unit.id) % 1009) / 1009 * TAU;
      for (let index = 0; index < samples; index += 1) {
        const angle = phase + index / samples * TAU;
        const x = clamp133(originX + Math.cos(angle) * ring, radius + 5, WORLD.width - radius - 5);
        const y = clamp133(originY + Math.sin(angle) * ring, radius + 5, WORLD.height - radius - 5);
        if (!this.isNavigableUnitPoint133(unit, x, y, unit.rotation || angle, checkUnits)) continue;
        unit.x = x;
        unit.y = y;
        unit.renderX = Number.isFinite(unit.renderX) ? unit.renderX : originX;
        unit.renderY = Number.isFinite(unit.renderY) ? unit.renderY : originY;
        unit.lastPositionX = x;
        unit.lastPositionY = y;
        unit.navNoProgressTimer = 0;
        unit.stuckTimer = 0;
        unit.stuckStage = 0;
        unit.recoveryWaypoint = null;
        unit.invalidateNavigation?.();
        this._v133Metrics ||= Object.create(null);
        this._v133Metrics.terrainRecoveries = (this._v133Metrics.terrainRecoveries || 0) + 1;
        return true;
      }
    }
    return this.relocateUnitToNearestFree?.(unit, maxRadius) || false;
  };

  const baseGenerateTerrain133 = GameClass.prototype.generateTerrain;
  if (baseGenerateTerrain133) GameClass.prototype.generateTerrain = function(...args) {
    const result = baseGenerateTerrain133.apply(this, args);
    this._terrainSignature133 = '';
    this.rebuildTerrainNavigation133(true);
    return result;
  };

  const baseFindSpawnPoint133 = GameClass.prototype.findSpawnPoint;
  if (baseFindSpawnPoint133) GameClass.prototype.findSpawnPoint = function(building, typeId = 'worker') {
    const original = baseFindSpawnPoint133.call(this, building, typeId);
    let stats;
    try { stats = debug.getUnitStats?.(typeId, this.teams?.[building?.team || 'player']) || debug.UNIT_TYPES?.[typeId]; }
    catch { stats = debug.UNIT_TYPES?.[typeId]; }
    if (!stats) return original;
    const probe = {
      id: `spawn-probe:${typeId}`, alive: true, kind: 'unit', typeId, stats,
      radius: stats.radius || 12, infantry: Boolean(stats.infantry), vehicle: Boolean(stats.vehicle),
      air: Boolean(stats.air), rotation: building?.rotation || 0,
    };
    if (probe.air || original && this.isNavigableUnitPoint133(probe, original.x, original.y, probe.rotation, true)) return original;
    const radius = this.getUnitNavigationRadius117?.(probe) || probe.radius;
    const start = Math.max((building?.radius || 40) + radius + 30, radius * 2.2);
    const heading = Math.atan2((building?.rallyPoint?.y ?? building?.y) - building.y, (building?.rallyPoint?.x ?? building.x + 100) - building.x);
    for (let ring = 0; ring < 16; ring += 1) {
      const distance = start + ring * Math.max(42, radius * 1.35);
      const samples = 24 + ring * 4;
      for (let index = 0; index < samples; index += 1) {
        const zigzag = index % 2 ? Math.ceil(index / 2) : -Math.ceil(index / 2);
        const angle = heading + zigzag * TAU / samples;
        const x = clamp133(building.x + Math.cos(angle) * distance, radius + 5, WORLD.width - radius - 5);
        const y = clamp133(building.y + Math.sin(angle) * distance, radius + 5, WORLD.height - radius - 5);
        if (this.isNavigableUnitPoint133(probe, x, y, angle, true)) return { x, y };
      }
    }
    return original;
  };

  const baseAddEntity133 = GameClass.prototype.addEntity;
  GameClass.prototype.addEntity = function(entity) {
    const result = baseAddEntity133.call(this, entity);
    if (entity?.kind === 'unit' && entity.alive && !entity.air && !this.isNavigableUnitPoint133(entity, entity.x, entity.y, entity.rotation || 0, true)) {
      this.relocateUnitFromTerrain133(entity, 980, true);
    }
    return result;
  };

  const baseResolveOverlap133 = GameClass.prototype.resolveUnitBuildingOverlap;
  if (baseResolveOverlap133) GameClass.prototype.resolveUnitBuildingOverlap = function(unit) {
    const result = baseResolveOverlap133.call(this, unit);
    if (unit?.alive && !unit.air && this.findTerrainCollisionForUnit133(unit)) this.relocateUnitFromTerrain133(unit, 760, false);
    return result;
  };

  const baseTrackStuck133 = UnitClass.prototype.trackStuck;
  if (baseTrackStuck133) UnitClass.prototype.trackStuck = function(dt) {
    if (!this.air && this.game.findTerrainCollisionForUnit133?.(this)) {
      this.game.relocateUnitFromTerrain133(this, 820, false);
      return;
    }
    const result = baseTrackStuck133.call(this, dt);
    if (!this.air && Math.max(this.navNoProgressTimer || 0, this.stuckTimer || 0) > 3.2) {
      this.game.relocateUnitFromTerrain133(this, 620, true);
      this.invalidateNavigation?.();
    }
    return result;
  };

  GameClass.prototype.moveRemoteGround133 = function(unit, tx, ty, elapsed, speedFactor = 1, arrival = 10) {
    if (!unit?.alive || unit.air) return undefined;
    if (this.findTerrainCollisionForUnit133(unit) || this.unitCollidesWithBuilding115?.(unit, unit.x, unit.y, unit.rotation || 0)) {
      this.relocateUnitFromTerrain133(unit, 820, false);
    }
    const targetChanged = !unit._remoteGoal133 || Math.hypot(unit._remoteGoal133.x - tx, unit._remoteGoal133.y - ty) > 150;
    if (targetChanged || (unit._remoteRouteUntil133 || 0) <= (this.time || 0) || unit._remoteRouteRevision133 !== this.navRevision) {
      unit._remoteGoal133 = { x: tx, y: ty };
      unit._remoteRouteRevision133 = this.navRevision;
      unit._remoteRouteUntil133 = (this.time || 0) + .75 + (hash133(unit.id) % 31) / 100;
      const clearance = (this.getUnitNavigationRadius117?.(unit) || unit.radius || 10) + 3;
      const blocker = this.findFirstBuildingOnSegment?.(unit.x, unit.y, tx, ty, clearance, null);
      if (blocker) {
        const detour = this.findDetourWaypoint?.(unit, blocker, tx, ty, null);
        if (detour && this.isNavigableUnitPoint133(unit, detour.x, detour.y, unit.rotation || 0, false)) unit._remoteRoute133 = [{ x: detour.x, y: detour.y }, { x: tx, y: ty }];
        else unit._remoteRoute133 = (this.planGroundPath?.(unit, tx, ty, null, { wide: true }) || []).slice(0, 5);
      } else unit._remoteRoute133 = [];
      unit._remoteRouteIndex133 = 0;
    }
    const route = unit._remoteRoute133 || [];
    let goal = route[unit._remoteRouteIndex133] || { x: tx, y: ty };
    const goalDistance = Math.hypot(goal.x - unit.x, goal.y - unit.y);
    if (route.length && goalDistance <= Math.max(arrival, (unit.radius || 10) * .9)) {
      unit._remoteRouteIndex133 = Math.min(route.length, (unit._remoteRouteIndex133 || 0) + 1);
      goal = route[unit._remoteRouteIndex133] || { x: tx, y: ty };
    }
    const dx = goal.x - unit.x;
    const dy = goal.y - unit.y;
    const distance = Math.hypot(dx, dy);
    const finalDistance = Math.hypot(tx - unit.x, ty - unit.y);
    if (finalDistance <= arrival) return true;
    if (distance < .01) return false;
    const desired = Math.atan2(dy, dx);
    const turnRate = unit.stats?.turnRate || (unit.vehicle ? 3.1 : 7.2);
    unit.rotation = (unit.rotation || 0) + clamp133(angleDelta133(unit.rotation || 0, desired), -turnRate * elapsed, turnRate * elapsed);
    const movementAngle = unit.vehicle ? unit.rotation : desired;
    const speed = Math.max(0, Number(unit.stats?.speed) || 0) * speedFactor * (unit.healthRatio < .25 ? .78 : 1);
    const step = Math.min(distance, speed * elapsed);
    const oldX = unit.x;
    const oldY = unit.y;
    const moved = step > 0 && this.moveGroundUnit?.(
      unit,
      unit.x + Math.cos(movementAngle) * step,
      unit.y + Math.sin(movementAngle) * step,
      { x: tx, y: ty },
    );
    if (moved) {
      unit._remoteBlockedFor133 = 0;
      unit.visualSpeed = Math.hypot(unit.x - oldX, unit.y - oldY) / Math.max(.001, elapsed);
      unit.renderX = unit.x;
      unit.renderY = unit.y;
      unit.renderRotation = unit.rotation;
      unit.lastPositionX = unit.x;
      unit.lastPositionY = unit.y;
      return Math.hypot(tx - unit.x, ty - unit.y) <= arrival;
    }
    unit._remoteBlockedFor133 = (unit._remoteBlockedFor133 || 0) + elapsed;
    unit._remoteRouteUntil133 = 0;
    if (unit._remoteBlockedFor133 > 2.4) {
      this.relocateUnitFromTerrain133(unit, 520, true);
      unit._remoteBlockedFor133 = 0;
    }
    return false;
  };

  // -----------------------------------------------------------------------
  // Exact aircraft selection at rendered altitude, including overlap cycling.
  // -----------------------------------------------------------------------
  const aircraftSpriteSpec133 = (unit) => {
    const pilot = window.__FD_MODEL_PILOT__;
    const code = pilot?.modelForType?.(unit.typeId, 'unit');
    return code ? pilot.canvasSprites?.[code]?.spec : null;
  };

  GameClass.prototype.getAircraftScreenShape133 = function(unit) {
    if (!unit?.alive || !unit.air) return null;
    const x = unit.renderX ?? unit.x;
    const y = unit.renderY ?? unit.y;
    const rotation = unit.rotation ?? unit.renderRotation ?? 0;
    const altitude = this.getAircraftVisualAltitude137?.(unit) ??
      this.getAircraftFlightAltitude119?.(unit) ?? Math.max(30, unit.radius * 5.2);
    const center = this.worldToScreen(x, y, altitude);
    const exact = this.getUnitFootprintAt?.(unit, x, y, rotation);
    const worldWidth = exact ? Math.max(exact.halfLength * 2, exact.halfWidth * 2) : unit.radius * (unit.stats?.visualScale || 1) * 2.85;
    const spec = aircraftSpriteSpec133(unit);
    const atlas = spec?.canvasSprite || {};
    const aspect = (Number(atlas.cellHeight) || 144) / Math.max(1, Number(atlas.cellWidth) || 192);
    const width = Math.max(18, worldWidth * (this.camera?.zoom || 1) * 1.34);
    const height = Math.max(14, width * aspect);
    const anchorX = Number.isFinite(atlas.anchorX) ? atlas.anchorX : .5;
    const baseline = Number.isFinite(atlas.groundBaseline) ? atlas.groundBaseline : .79;
    return {
      unit, center, rotation, altitude, width, height,
      x1: center.x - width * anchorX,
      y1: center.y - height * baseline,
      x2: center.x + width * (1 - anchorX),
      y2: center.y + height * (1 - baseline),
    };
  };

  GameClass.prototype.aircraftHitsAt133 = function(worldX, worldY) {
    const pointer = this.worldToScreen(worldX, worldY, 0);
    const hits = [];
    // Selection is an input-rate operation, not a frame-rate operation. Scan
    // the authoritative unit array so a friendly aircraft that was omitted by
    // fog/mass culling is still clickable over its entire visible sprite.
    for (const unit of this.units || []) {
      if (!unit?.alive || !unit.air || unit.embarkedIn) continue;
      if (unit.team === 'enemy' && !this.isTargetableBy?.(unit, 'player')) continue;
      const shape = this.getAircraftScreenShape133(unit);
      if (!shape) continue;
      const pad = Math.max(9, AIR_TOUCH_PAD - Math.min(shape.width, shape.height) * .08);
      if (pointer.x < shape.x1 - pad || pointer.x > shape.x2 + pad || pointer.y < shape.y1 - pad || pointer.y > shape.y2 + pad) continue;
      const cx = (shape.x1 + shape.x2) * .5;
      const cy = (shape.y1 + shape.y2) * .5;
      const nx = (pointer.x - cx) / Math.max(12, shape.width * .5 + pad);
      const ny = (pointer.y - cy) / Math.max(10, shape.height * .5 + pad);
      hits.push({ unit, score: nx * nx + ny * ny, area: shape.width * shape.height, shape });
    }
    hits.sort((left, right) => left.score - right.score || left.area - right.area || String(left.unit.id).localeCompare(String(right.unit.id)));
    return hits;
  };

  const baseHitTest133 = GameClass.prototype.hitTest;
  GameClass.prototype.hitTest = function(worldX, worldY, selectableOnly = true) {
    return this.aircraftHitsAt133(worldX, worldY)[0]?.unit || baseHitTest133.call(this, worldX, worldY, selectableOnly);
  };
  const baseContextHit133 = GameClass.prototype.hitTestForContext;
  if (baseContextHit133) GameClass.prototype.hitTestForContext = function(worldX, worldY) {
    return this.aircraftHitsAt133(worldX, worldY)[0]?.unit || baseContextHit133.call(this, worldX, worldY);
  };
  const baseSelectAt133 = GameClass.prototype.selectAt;
  GameClass.prototype.selectAt = function(worldX, worldY, additive = false) {
    const hits = this.aircraftHitsAt133(worldX, worldY);
    if (!hits.length) return baseSelectAt133.call(this, worldX, worldY, additive);
    const pointer = this.worldToScreen(worldX, worldY, 0);
    const stamp = now133();
    const signature = hits.map((hit) => hit.unit.id).join('|');
    const previous = this._airClickCycle133;
    const repeat = previous && stamp - previous.at < 720 && Math.hypot(pointer.x - previous.x, pointer.y - previous.y) < 18 && previous.signature === signature;
    const index = repeat ? (previous.index + 1) % hits.length : 0;
    this._airClickCycle133 = { at: stamp, x: pointer.x, y: pointer.y, signature, index };
    this.setSelection([hits[index].unit], additive);
    this.sound?.click?.();
    return hits[index].unit;
  };

  // -----------------------------------------------------------------------
  // Coherent fixed-wing FSM: transit / search / ingress / release / egress /
  // evade / RTB. The aircraft always advances along its hull heading.
  // -----------------------------------------------------------------------
  const AIR_STATES_RU133 = {
    hangar: 'в ангаре', prep: 'подготовка', launch: 'взлёт', transit: 'следование',
    search: 'поиск', hold: 'ожидание в воздухе', ingress: 'боевой заход', release: 'применение оружия',
    egress: 'выход из атаки', evade: 'уклонение', rtb: 'возвращение', landing: 'посадка', service: 'обслуживание',
  };
  const ORDER_RU133 = {
    move: 'удерживать район', attackMove: 'наступление с поиском целей', attack: 'атака цели',
    patrol: 'патрулирование', guard: 'охрана', hold: 'удержание', airHangar93: 'возвращение на аэродром', airService: 'обслуживание',
  };

  const ensureAirFsm133 = (unit) => {
    if (!unit._airFsm133) {
      unit._airFsm133 = {
        state: 'search', enteredAt: unit.game.time || 0, targetId: null,
        anchorX: unit.x, anchorY: unit.y, orbitAngle: unit.rotation || 0,
        lastDistance: Infinity, lastProgressAt: unit.game.time || 0,
      };
    }
    return unit._airFsm133;
  };
  const setAirState133 = (unit, state) => {
    const fsm = ensureAirFsm133(unit);
    if (fsm.state !== state) {
      fsm.state = state;
      fsm.enteredAt = unit.game.time || 0;
      fsm.lastDistance = Infinity;
      fsm.lastProgressAt = unit.game.time || 0;
      unit.game.uiDirty = true;
    }
    return fsm;
  };

  const targetLayerAllowed133 = (unit, target) => {
    if (!target?.alive || target.team === unit.team || target.team === 'neutral' || !unit.stats?.weapon) return false;
    const layer = target.air ? 'air' : 'ground';
    return unit.stats.weapon.targets?.includes(layer);
  };
  const roleAllowsTarget133 = (game, unit, target, explicit = false) => {
    if (!targetLayerAllowed133(unit, target)) return false;
    const role = airRole133(game, unit);
    if (['bomber', 'heavyBomber', 'stealthStriker', 'aerialArtillery'].includes(role) && target.air) return false;
    if (role === 'interceptor' && !target.air && !explicit) return false;
    return true;
  };
  const targetPriority133 = (game, unit, target, range) => {
    const role = airRole133(game, unit);
    const d = distance133(unit, target);
    let score = 1500 - d / Math.max(1, range) * 620;
    const stats = target.stats || {};
    if (role === 'interceptor') {
      score += target.air ? 900 : -900;
      const targetRole = airRole133(game, target);
      if (['bomber', 'heavyBomber', 'aerialArtillery'].includes(targetRole)) score += 460;
    } else if (role === 'multirole') score += target.air ? 520 : 210;
    else if (['bomber', 'heavyBomber'].includes(role)) {
      if (target.kind === 'building') score += 520 + Math.min(520, (stats.cost || 0) * .08);
      if (!target.completed && target.kind === 'building') score += 180;
      if (stats.power || stats.powerUse || ['airfield', 'advancedAirfield', 'factory', 'heavyFactory', 'hq'].includes(target.typeId)) score += 380;
      if (target.vehicle) score += 170;
    } else if (role === 'aerialArtillery') score += target.kind === 'building' ? 430 : target.vehicle ? 260 : 60;
    else score += target.kind === 'building' ? 180 : target.vehicle ? 260 : 120;
    const airDefense = stats.weapon?.targets?.includes('air') || stats.interceptPower > 0;
    if (airDefense && !unit.currentCommand?.directPlayerOrder133) score -= 260;
    score += (hash133(`${unit.id}:${target.id}`) % 1000) / 10000;
    return score;
  };

  GameClass.prototype.findAircraftTarget133 = function(unit, macro = false) {
    if (!isFixedWing133(unit) || !unit.stats?.weapon || unit.airServiceState) return null;
    const weapon = unit.stats.weapon;
    const range = Math.min(AIR_SCAN_RANGE, Math.max(760, Number(unit.vision) || 0, (Number(weapon.range) || 0) * (macro ? 1.55 : 1.82)));
    const units = this.spatial?.queryRadius?.('units', unit.x, unit.y, range) || this.querySpatial?.(this.unitSpatial, unit.x, unit.y, range) || this.units || [];
    const buildings = weapon.targets?.includes('ground')
      ? this.spatial?.queryRadius?.('buildings', unit.x, unit.y, range) || this.querySpatial?.(this.buildingSpatial, unit.x, unit.y, range) || this.buildings || []
      : [];
    const source = [...units, ...buildings];
    const stride = Math.max(1, Math.ceil(source.length / AIR_SCAN_LIMIT));
    const offset = source.length ? hash133(unit.id) % stride : 0;
    let best = null;
    let bestScore = -Infinity;
    let examined = 0;
    for (let index = offset; index < source.length && examined < AIR_SCAN_LIMIT; index += stride) {
      const target = source[index];
      examined += 1;
      if (!roleAllowsTarget133(this, unit, target, false) || target.embarkedIn) continue;
      if (distance133(unit, target) > range + (target.radius || 0)) continue;
      if (this.isTargetableBy && !this.isTargetableBy(target, unit.team, unit)) continue;
      const score = targetPriority133(this, unit, target, range);
      if (score > bestScore) { best = target; bestScore = score; }
    }
    this._v133Metrics ||= Object.create(null);
    this._v133Metrics.airCandidatesExamined = (this._v133Metrics.airCandidatesExamined || 0) + examined;
    return best;
  };

  const normalizeAircraftWeapon133 = (unit) => {
    const role = airRole133(unit.game, unit);
    if (!['bomber', 'heavyBomber'].includes(role) || !unit.stats?.weapon || unit.stats.weapon._bomb133) return;
    const weapon = unit.stats.weapon;
    weapon.profile = 'glideBomb';
    weapon.trajectory = 'topAttack';
    weapon.ballistic = true;
    weapon.splash = Math.max(Number(weapon.splash) || 0, role === 'heavyBomber' ? 150 : 108);
    weapon.targets = ['ground'];
    weapon._bomb133 = true;
  };

  GameClass.prototype.findIncomingAircraftThreat133 = function(unit) {
    const now = this.time || 0;
    if (now < (unit._airThreatScanAt133 || 0)) return unit._airThreat133?.alive ? unit._airThreat133 : null;
    unit._airThreatScanAt133 = now + .16 + (hash133(unit.id) % 11) * .013;
    const candidates = this.spatial?.queryRadius?.('projectiles', unit.x, unit.y, 1150) || this.projectiles || [];
    let closest = null;
    let closestDistance = Infinity;
    let examined = 0;
    for (const projectile of candidates) {
      if (++examined > 48) break;
      if (!projectile?.alive || projectile.team === unit.team) continue;
      if (projectile.targetId !== unit.id && projectile.targetId) continue;
      const d = distance133(unit, projectile);
      if (d < closestDistance) { closest = projectile; closestDistance = d; }
    }
    unit._airThreat133 = closest;
    return closest;
  };

  GameClass.prototype.getSafeAircraftEgress133 = function(unit, target = null, threat = null) {
    let vx = Math.cos(unit.rotation || 0) * 1.6;
    let vy = Math.sin(unit.rotation || 0) * 1.6;
    if (threat) {
      const d = Math.max(1, distance133(unit, threat));
      vx += (unit.x - threat.x) / d * 2.1;
      vy += (unit.y - threat.y) / d * 2.1;
      const side = hash133(unit.id) & 1 ? 1 : -1;
      vx += -(unit.y - threat.y) / d * side * 1.15;
      vy += (unit.x - threat.x) / d * side * 1.15;
    } else if (target) {
      const d = Math.max(1, distance133(unit, target));
      vx += (unit.x - target.x) / d * .72;
      vy += (unit.y - target.y) / d * .72;
    }
    const defenses = this.spatial?.queryRadius?.('buildings', unit.x, unit.y, 1450) || [];
    let checked = 0;
    for (const defense of defenses) {
      if (++checked > 24 || !defense?.alive || defense.team === unit.team) continue;
      if (!defense.stats?.weapon?.targets?.includes('air') && !defense.stats?.interceptPower) continue;
      if (this.isTargetableBy && !this.isTargetableBy(defense, unit.team, unit)) continue;
      const d = Math.max(120, distance133(unit, defense));
      vx += (unit.x - defense.x) / d * clamp133(1100 / d, .2, 1.6);
      vy += (unit.y - defense.y) / d * clamp133(1100 / d, .2, 1.6);
    }
    const length = Math.hypot(vx, vy) || 1;
    const travel = Math.max(680, (unit.stats?.speed || 280) * 2.65);
    return {
      x: clamp133(unit.x + vx / length * travel, 180, WORLD.width - 180),
      y: clamp133(unit.y + vy / length * travel, 180, WORLD.height - 180),
    };
  };

  GameClass.prototype.adjustAircraftPoint133 = function(unit, point) {
    const nearby = this.spatial?.queryRadius?.('units', unit.x, unit.y, Math.max(150, unit.radius * 5.5)) || [];
    let x = point.x;
    let y = point.y;
    let examined = 0;
    for (const other of nearby) {
      if (++examined > 14 || !other?.alive || !other.air || other === unit || other.team !== unit.team) continue;
      const d = Math.max(1, distance133(unit, other));
      const separation = Math.max(75, (unit.radius + other.radius) * 2.15);
      if (d >= separation) continue;
      const force = (separation - d) / separation * 125;
      x += (unit.x - other.x) / d * force;
      y += (unit.y - other.y) / d * force;
    }
    return { x: clamp133(x, 170, WORLD.width - 170), y: clamp133(y, 170, WORLD.height - 170) };
  };

  UnitClass.prototype.flyHoldingPattern133 = function(dt, center = null) {
    const fsm = ensureAirFsm133(this);
    const radius = clamp133(Math.max(AIR_MIN_ORBIT, (this.stats?.speed || 280) * 1.05), AIR_MIN_ORBIT, AIR_MAX_ORBIT);
    if (center) {
      fsm.anchorX = clamp133(center.x, radius + 40, WORLD.width - radius - 40);
      fsm.anchorY = clamp133(center.y, radius + 40, WORLD.height - radius - 40);
    }
    if (!Number.isFinite(fsm.anchorX) || !Number.isFinite(fsm.anchorY)) { fsm.anchorX = this.x; fsm.anchorY = this.y; }
    const currentAngle = Math.atan2(this.y - fsm.anchorY, this.x - fsm.anchorX);
    const clockwise = hash133(this.id) & 1 ? 1 : -1;
    const lead = clockwise * clamp133((this.stats?.speed || 280) / radius * .92, .62, 1.18);
    const point = this.game.adjustAircraftPoint133(this, {
      x: fsm.anchorX + Math.cos(currentAngle + lead) * radius,
      y: fsm.anchorY + Math.sin(currentAngle + lead) * radius,
    });
    this.moveToward(point.x, point.y, dt, .88, { dynamic: true });
    this.motionSpeed = Math.max(this.motionSpeed || 0, (this.stats?.speed || 260) * .58);
    return false;
  };

  const missionAnchor133 = (unit, command) => {
    if (!command) return { x: unit.x, y: unit.y };
    const formationId = command.formationGroupId || command.formationId;
    if (formationId) {
      const group = unit.game.formations?.get?.(formationId);
      const slot = group && (unit.game.getFormationSlotWorld?.(group, unit)
        || unit.game.getFormationSlotTarget?.(formationId, unit.id));
      if (slot && Number.isFinite(slot.x) && Number.isFinite(slot.y)) return { x: slot.x, y: slot.y };
    }
    if (command.type === 'guard') {
      const guarded = unit.game.getEntity?.(command.targetId);
      if (guarded?.alive) return { x: guarded.x, y: guarded.y };
    }
    if (command.type === 'patrol') return command.phase
      ? { x: command.ax ?? command.x ?? unit.x, y: command.ay ?? command.y ?? unit.y }
      : { x: command.bx ?? command.x ?? unit.x, y: command.by ?? command.y ?? unit.y };
    if (Number.isFinite(command.x) && Number.isFinite(command.y)) return { x: command.x, y: command.y };
    const target = unit.game.getEntity?.(command.targetId);
    return target?.alive ? { x: target.x, y: target.y } : { x: unit.x, y: unit.y };
  };

  UnitClass.prototype.processFixedWingMission133 = function(command, dt) {
    normalizeAircraftWeapon133(this);
    const fsm = ensureAirFsm133(this);
    if (this.healthRatio < .34 && !this.airServiceState) {
      this.requestAirService?.('критическое повреждение');
      return;
    }
    if (Number.isFinite(this.airAmmoMax) && this.airAmmoMax > 0 && this.airAmmo <= 0 && !this.airServiceState) {
      this.requestAirService?.('боезапас исчерпан');
      return;
    }
    const threat = this.game.findIncomingAircraftThreat133(this);
    if (threat && fsm.state !== 'evade') {
      Object.assign(fsm, this.game.getSafeAircraftEgress133(this, null, threat));
      fsm.evadeUntil = (this.game.time || 0) + 2.4;
      setAirState133(this, 'evade');
    }
    if (fsm.state === 'evade') {
      const point = this.game.adjustAircraftPoint133(this, { x: fsm.x, y: fsm.y });
      this.moveToward(point.x, point.y, dt, 1.08, { dynamic: true });
      if ((this.game.time || 0) >= (fsm.evadeUntil || 0) || distance133(this, point) < 110) setAirState133(this, fsm.targetId ? 'ingress' : 'search');
      return;
    }

    let target = this.game.getEntity?.(fsm.targetId);
    const directTarget = command?.type === 'attack' ? this.game.getEntity?.(command.targetId) : null;
    if (directTarget?.alive && roleAllowsTarget133(this.game, this, directTarget, true) &&
      (!this.game.isTargetableBy || this.game.isTargetableBy(directTarget, this.team, this))) {
      target = directTarget;
      fsm.targetId = target.id;
      command.directPlayerOrder133 = this.team === 'player';
    }
    if (!target?.alive || !roleAllowsTarget133(this.game, this, target, Boolean(command?.directPlayerOrder133)) ||
      (this.game.isTargetableBy && !this.game.isTargetableBy(target, this.team, this))) {
      target = null;
      fsm.targetId = null;
    }
    const currentTime = this.game.time || 0;
    if (!target && currentTime >= (this._airScanAt133 || 0)) {
      this._airScanAt133 = currentTime + .32 + (hash133(this.id) % 29) / 100;
      target = this.game.findAircraftTarget133(this, false);
      if (target) {
        fsm.targetId = target.id;
        setAirState133(this, 'ingress');
      }
    }

    if (fsm.state === 'egress' || fsm.state === 'release') {
      const point = this.game.adjustAircraftPoint133(this, { x: fsm.x, y: fsm.y });
      this.moveToward(point.x, point.y, dt, 1.04, { dynamic: true });
      if (currentTime >= (fsm.egressUntil || 0) || distance133(this, point) < 120) setAirState133(this, target ? 'ingress' : 'search');
      return;
    }

    if (target) {
      setAirState133(this, 'ingress');
      const weapon = this.stats.weapon;
      const range = Math.max(120, Number(weapon.range) || 400) * (this.game.getJammingFactor?.(this) || 1);
      const minRange = Math.max(0, Number(weapon.minRange) || 0);
      const d = Math.max(0, distance133(this, target) - (this.radius || 0) - (target.radius || 0));
      const desired = Math.atan2(target.y - this.y, target.x - this.x);
      const headingError = Math.abs(angleDelta133(this.rotation || 0, desired));
      const ahead = Math.cos(this.rotation || 0) * (target.x - this.x) + Math.sin(this.rotation || 0) * (target.y - this.y);
      const role = airRole133(this.game, this);
      const releaseTolerance = ['bomber', 'heavyBomber'].includes(role) ? .34 : .55;
      const canRelease = d <= range && d >= minRange && ahead > -(this.radius || 20) && headingError <= releaseTolerance;
      const targetBehind = ahead < -(this.radius || 20) * 1.35;
      let attackPoint = { x: target.x, y: target.y };
      if (targetBehind) {
        // A fixed-wing aircraft cannot reverse in place. The old branch sent
        // it straight away from a rear contact, then repeated the same egress
        // forever. Build a forward/lateral turn-in point so the nose comes
        // around while the aircraft continuously retains the combat target.
        const turnSide = angleDelta133(this.rotation || 0, desired) >= 0 ? 1 : -1;
        const turnRadius = clamp133(Math.max(330, (this.stats?.speed || 280) * 1.18), 330, 620);
        const headingX = Math.cos(this.rotation || 0);
        const headingY = Math.sin(this.rotation || 0);
        attackPoint = {
          x: this.x + headingX * turnRadius * .62 - headingY * turnRadius * turnSide,
          y: this.y + headingY * turnRadius * .62 + headingX * turnRadius * turnSide,
        };
      }
      const point = this.game.adjustAircraftPoint133(this, attackPoint);
      this.moveToward(point.x, point.y, dt, 1, { dynamic: true });
      if (canRelease && (this.weaponCooldown || 0) <= 0) {
        const ammoBefore = this.airAmmo;
        const projectilesBefore = this.game.projectiles?.length || 0;
        this.fire(target);
        if ((this.game.projectiles?.length || 0) > projectilesBefore || this.airAmmo !== ammoBefore || this.lastShotAt === currentTime) {
          const egress = this.game.getSafeAircraftEgress133(this, target, null);
          fsm.x = egress.x;
          fsm.y = egress.y;
          fsm.egressUntil = currentTime + clamp133(1.8 + (this.stats?.speed || 280) / 360, 2.1, 3.2);
          setAirState133(this, 'release');
          this.game._v133Metrics ||= Object.create(null);
          this.game._v133Metrics.airWeaponReleases = (this.game._v133Metrics.airWeaponReleases || 0) + 1;
        }
      } else if (!targetBehind && d < Math.max(minRange * .72, 90)) {
        const egress = this.game.getSafeAircraftEgress133(this, target, null);
        Object.assign(fsm, egress, { egressUntil: currentTime + 1.8 });
        setAirState133(this, 'egress');
      }
      if (d + 20 < fsm.lastDistance) {
        fsm.lastDistance = d;
        fsm.lastProgressAt = currentTime;
      } else if (currentTime - (fsm.lastProgressAt || currentTime) > 11) {
        fsm.targetId = null;
        setAirState133(this, 'search');
      }
      return;
    }

    const anchor = missionAnchor133(this, command);
    const anchorDistance = distance133(this, anchor);
    if (command?.type === 'patrol' && anchorDistance < 150) {
      command.phase = !command.phase;
      const next = missionAnchor133(this, command);
      setAirState133(this, 'transit');
      this.moveToward(next.x, next.y, dt, .94, { dynamic: true });
      return;
    }
    if (['move', 'attackMove', 'patrol'].includes(command?.type) && anchorDistance > AIR_MIN_ORBIT * .62) {
      setAirState133(this, 'transit');
      const point = this.game.adjustAircraftPoint133(this, anchor);
      this.moveToward(point.x, point.y, dt, .94, { dynamic: true });
      return;
    }
    setAirState133(this, 'hold');
    this.flyHoldingPattern133(dt, anchor);
  };

  const baseProcessCommand133 = UnitClass.prototype.processCommand;
  UnitClass.prototype.processCommand = function(command, dt) {
    if (!isFixedWing133(this) || this.airServiceState || ['airHangar93', 'airService', 'returnToAirfield'].includes(command?.type)) {
      return baseProcessCommand133.call(this, command, dt);
    }
    if (['move', 'attackMove', 'attack', 'patrol', 'guard', 'hold', 'formation'].includes(command?.type)) {
      return this.processFixedWingMission133(command, dt);
    }
    return baseProcessCommand133.call(this, command, dt);
  };

  const baseIdleBehavior133 = UnitClass.prototype.idleBehavior;
  UnitClass.prototype.idleBehavior = function(dt) {
    if (isFixedWing133(this) && !this.airServiceState) return this.processFixedWingMission133(null, dt);
    return baseIdleBehavior133.call(this, dt);
  };

  // Automatic servicing preserves every mission, not only patrol/guard.
  const baseRequestAirService133 = UnitClass.prototype.requestAirService;
  UnitClass.prototype.requestAirService = function(reason = 'боезапас') {
    if (isFixedWing133(this) && !this.airServiceState && this.requestAirHangar93) return this.requestAirHangar93(reason, null, true);
    return baseRequestAirService133.call(this, reason);
  };

  const baseUnitUpdate133 = UnitClass.prototype.update;
  UnitClass.prototype.update = function(dt) {
    const startX = this.x;
    const startY = this.y;
    const result = baseUnitUpdate133.call(this, dt);
    if (isAirborne133(this)) {
      const moved = Math.hypot(this.x - startX, this.y - startY);
      const minSpeed = Math.max(120, (this.stats?.speed || 260) * .54);
      this.motionSpeed = Math.max(this.motionSpeed || 0, minSpeed);
      if (moved < Math.max(.02, minSpeed * dt * .08)) {
        const margin = Math.max(120, this.radius * 4);
        if (this.x < margin || this.x > WORLD.width - margin || this.y < margin || this.y > WORLD.height - margin) {
          const centerAngle = Math.atan2(WORLD.height * .5 - this.y, WORLD.width * .5 - this.x);
          this.rotation += clamp133(angleDelta133(this.rotation || 0, centerAngle), -(this.stats?.turnRate || 2.8) * dt, (this.stats?.turnRate || 2.8) * dt);
        }
        const step = minSpeed * dt;
        this.x = clamp133(this.x + Math.cos(this.rotation || 0) * step, margin, WORLD.width - margin);
        this.y = clamp133(this.y + Math.sin(this.rotation || 0) * step, margin, WORLD.height - margin);
      }
    }
    return result;
  };

  // Bombs stay physical even in the mass renderer. Direct bullets may remain
  // virtual, but a visible bomber release creates a real Projectile and the
  // existing entity-ID splash solver applies armour, falloff and team checks.
  const baseUnitFire133 = UnitClass.prototype.fire;
  UnitClass.prototype.fire = function(target) {
    normalizeAircraftWeapon133(this);
    const before = this.game.projectiles?.length || 0;
    const result = baseUnitFire133.call(this, target);
    if (isFixedWing133(this)) {
      const role = airRole133(this.game, this);
      for (let index = before; index < (this.game.projectiles?.length || 0); index += 1) {
        const projectile = this.game.projectiles[index];
        if (!projectile || projectile.sourceId !== this.id) continue;
        projectile.aircraftOrdnance133 = true;
        projectile.impactEntityId133 = target?.id || null;
        if (['bomber', 'heavyBomber'].includes(role)) {
          projectile.ordnanceKind133 = 'bomb';
          projectile.trajectory = 'topAttack';
          projectile.ballistic = true;
          projectile.targetAltitude = target?.air ? this.game.getEntityAimAltitude?.(target) || 0 : 0;
        }
      }
    }
    return result;
  };

  if (ProjectileClass?.prototype?.hit) {
    const baseProjectileHit133 = ProjectileClass.prototype.hit;
    ProjectileClass.prototype.hit = function(primaryTarget) {
      const source = this.game.getEntity?.(this.sourceId);
      const before = primaryTarget?.hp;
      const result = baseProjectileHit133.call(this, primaryTarget);
      if (this.aircraftOrdnance133) {
        this.game._v133Metrics ||= Object.create(null);
        this.game._v133Metrics.airOrdnanceImpacts = (this.game._v133Metrics.airOrdnanceImpacts || 0) + 1;
        if (Number.isFinite(before) && primaryTarget?.hp < before) this.game._v133Metrics.airOrdnanceDamage = (this.game._v133Metrics.airOrdnanceDamage || 0) + (before - primaryTarget.hp);
        this.impactSourceType133 = source?.typeId || null;
      }
      return result;
    };
  }

  GameClass.prototype.resolveMacroAircraftAttack133 = function(attacker, target) {
    if (!isFixedWing133(attacker)) return undefined;
    if ((attacker.weaponCooldown || 0) > 0) return true;
    const visible = Boolean(attacker.selected || this.isOnScreen?.(attacker.x, attacker.y, 320));
    if (!visible || (this._airVisualOrdnanceBudget133 || 0) <= 0) return undefined;
    this._airVisualOrdnanceBudget133 -= 1;
    normalizeAircraftWeapon133(attacker);
    attacker.fire(target);
    return true;
  };

  // Ground combatants also regard a real, placed enemy foundation as a valid
  // target. Abstract build-menu plans do not exist as entities and are never
  // attacked.
  const baseFindNearestEnemy133 = GameClass.prototype.findNearestEnemy;
  if (baseFindNearestEnemy133) GameClass.prototype.findNearestEnemy = function(x, y, team, radius, layers = ['ground'], observer = null) {
    const result = baseFindNearestEnemy133.call(this, x, y, team, radius, layers, observer);
    if (result || !observer?.stats?.weapon || !layers.includes('ground')) return result;
    const candidates = this.spatial?.queryRadius?.('buildings', x, y, radius) || this.querySpatial?.(this.buildingSpatial, x, y, radius) || [];
    let best = null;
    let bestDistance = radius;
    for (const building of candidates) {
      if (!building?.alive || building.completed || building.team === team || building.team === 'neutral') continue;
      if (this.isTargetableBy && !this.isTargetableBy(building, team, observer)) continue;
      const d = Math.hypot(building.x - x, building.y - y);
      if (d < bestDistance) { best = building; bestDistance = d; }
    }
    return best;
  };

  // -----------------------------------------------------------------------
  // Own aircraft are presentation-visible above fog. This does not mark any
  // terrain cell visible and therefore grants no reconnaissance information.
  // -----------------------------------------------------------------------
  const baseBuildSnapshot133 = GameClass.prototype.buildRenderSnapshotV9;
  if (baseBuildSnapshot133) GameClass.prototype.buildRenderSnapshotV9 = function(...args) {
    const snapshot = baseBuildSnapshot133.apply(this, args);
    if (!snapshot?.units) return snapshot;
    const frame = snapshot.frame || 0;
    if (this._ownAircraftSnapshotFrame133 === frame) return snapshot;
    this._ownAircraftSnapshotFrame133 = frame;
    const seen = new Set(snapshot.units.map((unit) => unit.id));
    const bounds = this.visibleWorldBounds?.(1100);
    const queryRadius = bounds
      ? Math.hypot(bounds.right - bounds.left, bounds.bottom - bounds.top) * .58 + 1300
      : Infinity;
    const candidates = Number.isFinite(queryRadius) && this.spatial?.queryRadius
      ? this.spatial.queryRadius('units', this.camera.x, this.camera.y, queryRadius)
      : this.units || [];
    let added = 0;
    for (const unit of candidates) {
      if (!unit?.alive || unit.team !== 'player' || !unit.air || unit.embarkedIn || seen.has(unit.id)) continue;
      const shape = this.getAircraftScreenShape133(unit);
      if (!shape || shape.x2 < -40 || shape.y2 < -40 || shape.x1 > this.viewport.width + 40 || shape.y1 > this.viewport.height + 40) continue;
      snapshot.units.push(unit);
      seen.add(unit.id);
      added += 1;
    }
    if (added && snapshot.clusters94) snapshot.clusters94 = snapshot.clusters94.filter((cluster) => !(cluster.team === 'player' && cluster.air));
    return snapshot;
  };

  const baseDrawFog133 = GameClass.prototype.drawFog;
  if (baseDrawFog133 && context) GameClass.prototype.drawFog = function(...args) {
    const result = baseDrawFog133.apply(this, args);
    const alive = this._v94AliveUnits || this.units?.length || 0;
    if (alive >= 3000) return result; // Legion sprite overlay is already above its separate fog layer.
    const redraw = (this.units || []).filter((unit) => unit?.alive && unit.team === 'player' && unit.air && !unit.embarkedIn && !this.isVisibleAt(unit.x, unit.y));
    if (!redraw.length) return result;
    context.save();
    context.setTransform(this.viewport?.dpr || 1, 0, 0, this.viewport?.dpr || 1, 0, 0);
    for (const unit of redraw) this.drawUnit3D?.(unit);
    context.restore();
    return result;
  };

  const baseRenderSelection133 = GameClass.prototype.renderSelectionUI;
  GameClass.prototype.renderSelectionUI = function(...args) {
    const result = baseRenderSelection133.apply(this, args);
    const details = typeof document !== 'undefined' ? document.getElementById('selection-details') : null;
    details?.querySelector?.('[data-air-fsm133]')?.remove?.();
    const unit = this.selected?.length === 1 ? this.selected[0] : null;
    if (!details || unit?.kind !== 'unit' || !unit.air) return result;
    const fsm = ensureAirFsm133(unit);
    let state = fsm.state;
    if (unit.airServiceState === 'return') state = 'rtb';
    else if (unit.airServiceState === 'servicing') state = 'service';
    else if (unit.airServiceState === 'launch') state = 'launch';
    else if (unit.currentCommand?.stage === 'ready') state = 'hangar';
    const target = this.getEntity?.(fsm.targetId || unit.currentCommand?.targetId);
    const ammo = Number.isFinite(unit.airAmmoMax) ? `${Math.round(unit.airAmmo || 0)} / ${Math.round(unit.airAmmoMax || 0)}` : 'не ограничен';
    const fuel = Number.isFinite(unit.sortieFuelMax) && unit.sortieFuelMax > 0 ? `${Math.round(unit.sortieFuel / unit.sortieFuelMax * 100)}%` : 'не ограничен';
    const order = ORDER_RU133[unit.currentCommand?.type] || unit.currentCommand?.type || 'ожидание в воздухе';
    const ownership = unit.team === 'player' ? '' : '<div class="stat-line"><span>Управление</span><strong>только разведданные · команды запрещены</strong></div>';
    details.insertAdjacentHTML('beforeend', `<div data-air-fsm133><div class="stat-line"><span>Состояние полёта</span><strong>${AIR_STATES_RU133[state] || state}</strong></div><div class="stat-line"><span>Боекомплект</span><strong>${ammo}</strong></div><div class="stat-line"><span>Ресурс вылета</span><strong>${fuel}</strong></div><div class="stat-line"><span>Текущий приказ</span><strong>${order}</strong></div><div class="stat-line"><span>Выбранная цель</span><strong>${target?.stats?.name || target?.stats?.canonicalName || target?.typeId || 'нет'}</strong></div><div class="stat-line"><span>Возврат / обслуживание</span><strong>${unit.airServiceState || 'не требуется'}</strong></div>${ownership}</div>`);
    return result;
  };

  // -----------------------------------------------------------------------
  // Fair reactive defense and coordinated air packages. No units or credits
  // are created: the AI commits only existing, observed and serviceable units.
  // -----------------------------------------------------------------------
  const baseBuildingDamage133 = BuildingClass.prototype.takeDamage;
  BuildingClass.prototype.takeDamage = function(rawDamage, source = null, damageType = null) {
    const before = this.hp;
    const result = baseBuildingDamage133.call(this, rawDamage, source, damageType);
    if (this.hp < before && this.team === 'enemy' && source?.alive && source.team === 'player') {
      this.game._enemySectorAlarm133 = {
        x: this.x, y: this.y, buildingId: this.id, sourceId: source.id,
        sourceAir: Boolean(source.air), at: this.game.time || 0,
        priority: ['hq', 'power', 'fusionPlant', 'airfield', 'advancedAirfield', 'factory', 'heavyFactory'].includes(this.typeId) ? 2 : 1,
      };
      if (this.game.ai) this.game.ai._defensePulseAt133 = 0;
    }
    return result;
  };

  if (TacticalAIClass) {
    TacticalAIClass.prototype.respondToSectorThreat133 = function() {
      const alarm = this.game._enemySectorAlarm133;
      if (!alarm || this.game.time - alarm.at > 16) return false;
      const source = this.game.getEntity?.(alarm.sourceId);
      const nearby = this.game.spatial?.queryRadius?.('units', alarm.x, alarm.y, alarm.priority > 1 ? 4600 : 3400) || this.game.units || [];
      const activeIds = new Set((this.squads || []).flatMap((squad) => squad.unitIds || []));
      const defenders = nearby.filter((unit) => {
        if (!unit?.alive || unit.team !== 'enemy' || unit.embarkedIn || !unit.stats?.weapon) return false;
        if (unit.airServiceState === 'servicing') return false;
        if (source?.alive && !targetLayerAllowed133(unit, source)) return false;
        return true;
      });
      const totalEnemyCombat = Math.max(defenders.length, Number(this.game._v94AliveByTeam?.enemy) || defenders.length);
      const reserveRatio = this.game.difficultyKey === 'hard' ? .22 : this.game.difficultyKey === 'easy' ? .38 : .29;
      const dispatchCap = Math.max(2, Math.min(defenders.length, Math.ceil(totalEnemyCombat * (1 - reserveRatio) * .22), alarm.priority > 1 ? 26 : 16));
      defenders.sort((left, right) => {
        const layer = source?.air ? 'air' : 'ground';
        const leftFit = Number(Boolean(left.stats.weapon.targets?.includes(layer)));
        const rightFit = Number(Boolean(right.stats.weapon.targets?.includes(layer)));
        // Suitable, nearby and currently uncommitted defenders go first. Keep
        // the order deterministic so replays and multiplayer simulations agree.
        return rightFit - leftFit
          || Number(activeIds.has(left.id)) - Number(activeIds.has(right.id))
          || distance133(left, alarm) - distance133(right, alarm)
          || String(left.id).localeCompare(String(right.id));
      });
      let ordered = 0;
      for (const unit of defenders.slice(0, dispatchCap)) {
        if ((unit._defenseOrderAt133 || 0) > this.game.time) continue;
        unit._defenseOrderAt133 = this.game.time + 1.8;
        if (source?.alive && targetLayerAllowed133(unit, source)) unit.setCommand({ type: 'attack', targetId: source.id, aiDefense133: true, anchorX98: alarm.x, anchorY98: alarm.y });
        else unit.setCommand({ type: 'attackMove', x: alarm.x, y: alarm.y, aiDefense133: true });
        ordered += 1;
      }
      this._lastDefenseResponse133 = { ...alarm, ordered, reserveRatio, at: this.game.time };
      return ordered > 0;
    };

    TacticalAIClass.prototype.launchAirOperation133 = function() {
      const purposeCycle = ['power', 'supply', 'production', 'weak', 'airfield'];
      const purpose = purposeCycle[(this._airOperationCycle133 || 0) % purposeCycle.length];
      const target = this.pickOperationTarget129?.(purpose, new Set(), null, true) || this.pickWarTarget126?.(purpose);
      if (!target) return false;
      const assigned = new Set((this._airOperations133 || []).flatMap((operation) => operation.unitIds || []));
      const aircraft = (this.game.units || []).filter((unit) => isFixedWing133(unit) && unit.team === 'enemy' && !unit.airServiceState && !assigned.has(unit.id));
      const strike = aircraft.filter((unit) => ['bomber', 'heavyBomber', 'stealthStriker', 'aerialArtillery', 'multirole'].includes(airRole133(this.game, unit)));
      const escorts = aircraft.filter((unit) => ['interceptor', 'multirole'].includes(airRole133(this.game, unit)) && !strike.includes(unit));
      const desired = this.game.difficultyKey === 'hard' ? 6 : this.game.difficultyKey === 'easy' ? 2 : 4;
      if (!strike.length) return false;
      const packageUnits = [...strike.slice(0, desired), ...escorts.slice(0, Math.max(1, Math.ceil(desired * .5)))];
      const actual = target.id ? this.game.getEntity?.(target.id) : null;
      const lead = packageUnits[0];
      for (const unit of packageUnits) {
        if (unit === lead || !['interceptor', 'multirole'].includes(airRole133(this.game, unit))) {
          if (actual?.alive && this.game.isTargetableBy?.(actual, 'enemy', unit) && targetLayerAllowed133(unit, actual)) unit.setCommand({ type: 'attack', targetId: actual.id, aiAirOperation133: true });
          else unit.setCommand({ type: 'attackMove', x: target.x, y: target.y, aiAirOperation133: true });
        } else unit.setCommand({ type: 'guard', targetId: lead.id, aiAirOperation133: true });
      }
      this._airOperations133 ||= [];
      this._airOperations133.push({ id: `air-op-${this.game.simTick || 0}-${this._airOperationCycle133 || 0}`, purpose, targetId: target.id || null, x: target.x, y: target.y, unitIds: packageUnits.map((unit) => unit.id), at: this.game.time });
      this._airOperations133 = this._airOperations133.filter((operation) => this.game.time - operation.at < 160 && operation.unitIds.some((id) => this.game.getEntity?.(id)?.alive));
      this._airOperationCycle133 = (this._airOperationCycle133 || 0) + 1;
      return true;
    };

    const baseAIUpdate133 = TacticalAIClass.prototype.update;
    TacticalAIClass.prototype.update = function(dt) {
      const result = baseAIUpdate133.call(this, dt);
      this._defensePulseAt133 = (this._defensePulseAt133 || 0) - dt;
      if (this._defensePulseAt133 <= 0) {
        this._defensePulseAt133 = .72;
        const reacted = this.respondToSectorThreat133();
        const alarm = this.game._enemySectorAlarm133;
        if (!reacted && alarm && this.game.time - alarm.at > 9 && !alarm.counterattack133) {
          alarm.counterattack133 = true;
          this.ensurePersistentPressure129?.(true);
        }
      }
      this._airOperationTimer133 = (this._airOperationTimer133 ?? (this.game.difficultyKey === 'hard' ? 28 : this.game.difficultyKey === 'easy' ? 82 : 48)) - dt;
      if (this._airOperationTimer133 <= 0) {
        const launched = this.launchAirOperation133();
        const interval = this.game.difficultyKey === 'hard' ? 34 : this.game.difficultyKey === 'easy' ? 92 : 56;
        this._airOperationTimer133 = launched ? interval : Math.min(18, interval * .34);
      }
      return result;
    };
  }

  // Save-compatible FSM, terrain extraction after hydrate and bounded safety
  // auditing for old saves. This never scans the whole army in one tick.
  const baseUnitSerialize133 = UnitClass.prototype.serialize;
  if (baseUnitSerialize133) UnitClass.prototype.serialize = function() {
    const data = baseUnitSerialize133.call(this);
    if (this._airFsm133) data.airFsm133 = { ...this._airFsm133 };
    return data;
  };

  const baseHydrate133 = GameClass.prototype.hydrate;
  if (baseHydrate133) GameClass.prototype.hydrate = function(data) {
    const result = baseHydrate133.call(this, data);
    this.rebuildTerrainNavigation133(true);
    const saved = new Map((data?.entities || []).map((entity) => [entity.id, entity]));
    for (const unit of this.units || []) {
      const raw = saved.get(unit.id);
      if (raw?.airFsm133) unit._airFsm133 = { ...raw.airFsm133 };
      if (!unit.air && !this.isNavigableUnitPoint133(unit, unit.x, unit.y, unit.rotation || 0, false)) this.relocateUnitFromTerrain133(unit, 980, false);
    }
    return result;
  };

  const baseSimulate133 = GameClass.prototype.simulateFixed;
  if (baseSimulate133) GameClass.prototype.simulateFixed = function(dt) {
    this._airVisualOrdnanceBudget133 = (this._v94AliveUnits || this.units?.length || 0) >= 16000 ? 6 : 18;
    const result = baseSimulate133.call(this, dt);
    const units = this.units || [];
    if (units.length) {
      let checked = 0;
      let cursor = this._terrainAuditCursor133 || 0;
      while (checked < Math.min(TERRAIN_AUDIT_PER_TICK, units.length)) {
        const unit = units[cursor++ % units.length];
        checked += 1;
        if (unit?.alive && !unit.air && this.findTerrainCollisionForUnit133(unit)) this.relocateUnitFromTerrain133(unit, 760, false);
      }
      this._terrainAuditCursor133 = cursor % units.length;
    }
    return result;
  };

  // Keep old previews and cached resolved stats on the same vehicle-class
  // radius as fresh engineers. The approved narrow atlas supplies readability;
  // the physical hull must not be a 30-unit giant.
  for (const unit of debug.game?.units || []) {
    if (unit?.typeId !== 'worker') continue;
    unit.radius = 17;
    if (unit.stats) {
      unit.stats.radius = 17;
      unit.stats.visualScale = .90;
    }
  }

  if (typeof document !== 'undefined') {
    void 0;
    const eyebrow = document.querySelector?.('#start-screen .eyebrow');
    if (eyebrow) void 0;
    const lead = document.querySelector?.('#start-screen .lead');
    if (lead) void 0;
    const strip = document.querySelector?.('#start-screen .feature-strip');
    if (strip && !strip.querySelector?.('[data-air-war133-feature]')) void 0;
  }

  window.__FD_AIR_WAR_NAVIGATION_V133__ = {
    version: VERSION,
    constants: { TERRAIN_CELL, TERRAIN_AUDIT_PER_TICK, AIR_SCAN_LIMIT, AIR_MIN_ORBIT, AIR_TOUCH_PAD },
    isFixedWing: isFixedWing133,
    get metrics() { return debug.game?._v133Metrics || null; },
    get defense() { return debug.game?.ai?._lastDefenseResponse133 || null; },
    get airOperations() { return debug.game?.ai?._airOperations133 || []; },
  };
})();
