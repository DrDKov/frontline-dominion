(() => {
  'use strict';

  const debug = window.__FD_DEBUG__;
  const Game = debug?.Game;
  const BUILDING_TYPES = debug?.BUILDING_TYPES;
  const getBuildingStats = debug?.getBuildingStats;
  const WORLD = debug?.WORLD;
  const canvas = document.getElementById('game-canvas');
  const ctx = canvas?.getContext('2d');
  if (!Game || !BUILDING_TYPES || !getBuildingStats || !WORLD || !ctx) return;

  const VERSION = '11.4';
  const PLACEMENT_CLEARANCE = 12;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  const normalizedEnvelope = (value, bounds) => {
    if (value && [value.minX, value.minY, value.maxX, value.maxY].every(Number.isFinite)) return value;
    const width = Math.max(0.01, Number(bounds?.[0]) || 1);
    const depth = Math.max(0.01, Number(bounds?.[1]) || 1);
    return { minX: -width / 2, minY: -depth / 2, maxX: width / 2, maxY: depth / 2 };
  };

  const computeFootprint = (baseStats, resolvedStats = baseStats) => {
    const bounds = baseStats?.modelBoundsMeters || resolvedStats?.modelBoundsMeters || null;
    const visualRadius = Math.max(1, (resolvedStats?.radius || baseStats?.radius || 24) * (resolvedStats?.visualScale || baseStats?.visualScale || 1));
    const compact = resolvedStats?.category === 'defense' || baseStats?.category === 'defense';
    const factor = Number(baseStats?.modelWorldWidthFactor || resolvedStats?.modelWorldWidthFactor) || (compact ? 2.9 : 3.2);

    if (!bounds) {
      const width = visualRadius * factor;
      const depth = width * (compact ? 0.88 : 0.78);
      return {
        minX: -width / 2, minY: -depth / 2, maxX: width / 2, maxY: depth / 2,
        width, depth, height: visualRadius * (compact ? 1.0 : 1.45), scale: 1,
        source: 'radius-fallback',
      };
    }

    const modelWidth = Math.max(0.01, Number(bounds[0]) || 1);
    const modelDepth = Math.max(0.01, Number(bounds[1]) || 1);
    const scale = visualRadius * factor / Math.max(modelWidth, modelDepth);
    const envelope = normalizedEnvelope(
      baseStats?.modelPlacementFootprintMeters || resolvedStats?.modelPlacementFootprintMeters,
      bounds,
    );
    const minX = envelope.minX * scale;
    const minY = envelope.minY * scale;
    const maxX = envelope.maxX * scale;
    const maxY = envelope.maxY * scale;
    return {
      minX, minY, maxX, maxY,
      width: maxX - minX,
      depth: maxY - minY,
      height: Math.max(1, Number(bounds[2]) || 1) * scale,
      scale,
      source: baseStats?.modelPlacementFootprintMeters ? 'model-envelope' : 'model-bounds',
    };
  };

  const modelPointToWorld = (x, y, rotation, modelX, modelY) => {
    const c = Math.cos(rotation);
    const s = Math.sin(rotation);
    // GLB +Y is mirrored into the game's downward world Y by the WebGL layer.
    return {
      x: x + modelX * c + modelY * s,
      y: y + modelX * s - modelY * c,
    };
  };

  const footprintAt = (footprint, x, y, rotation = 0, expansion = 0) => {
    const minX = footprint.minX - expansion;
    const minY = footprint.minY - expansion;
    const maxX = footprint.maxX + expansion;
    const maxY = footprint.maxY + expansion;
    const corners = [
      modelPointToWorld(x, y, rotation, minX, minY),
      modelPointToWorld(x, y, rotation, maxX, minY),
      modelPointToWorld(x, y, rotation, maxX, maxY),
      modelPointToWorld(x, y, rotation, minX, maxY),
    ];
    return {
      ...footprint, x, y, rotation, minX, minY, maxX, maxY, corners,
      maxRadius: Math.max(...[[minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY]].map(([px, py]) => Math.hypot(px, py))),
    };
  };

  const projectPolygon = (polygon, axis) => {
    let min = Infinity;
    let max = -Infinity;
    for (const point of polygon) {
      const value = point.x * axis.x + point.y * axis.y;
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
    return { min, max };
  };

  const polygonsOverlap = (left, right) => {
    const polygons = [left, right];
    for (const polygon of polygons) {
      for (let index = 0; index < polygon.length; index += 1) {
        const current = polygon[index];
        const next = polygon[(index + 1) % polygon.length];
        const edgeX = next.x - current.x;
        const edgeY = next.y - current.y;
        const length = Math.hypot(edgeX, edgeY) || 1;
        const axis = { x: -edgeY / length, y: edgeX / length };
        const a = projectPolygon(left, axis);
        const b = projectPolygon(right, axis);
        if (a.max <= b.min + 0.001 || b.max <= a.min + 0.001) return false;
      }
    }
    return true;
  };

  const circleIntersectsFootprint = (circleX, circleY, radius, footprint) => {
    const dx = circleX - footprint.x;
    const dy = circleY - footprint.y;
    const c = Math.cos(footprint.rotation);
    const s = Math.sin(footprint.rotation);
    const localX = dx * c + dy * s;
    const localY = dx * s - dy * c;
    const closestX = clamp(localX, footprint.minX, footprint.maxX);
    const closestY = clamp(localY, footprint.minY, footprint.maxY);
    return (localX - closestX) ** 2 + (localY - closestY) ** 2 < radius ** 2;
  };

  Game.prototype.getBuildingFootprint = function(typeId, rotation = 0, teamKey = 'player') {
    const teamState = this.teams?.[teamKey] || this.teams?.player;
    const baseStats = BUILDING_TYPES[typeId];
    if (!baseStats || !teamState) return null;
    return { ...computeFootprint(baseStats, getBuildingStats(typeId, teamState)), rotation };
  };

  Game.prototype.getBuildingFootprintAt = function(typeId, x, y, rotation = 0, teamKey = 'player', expansion = 0) {
    const footprint = this.getBuildingFootprint(typeId, rotation, teamKey);
    return footprint ? footprintAt(footprint, x, y, rotation, expansion) : null;
  };

  Game.prototype.getEntityBuildingFootprintAt = function(building, expansion = 0) {
    if (!building?.alive || building.kind !== 'building') return null;
    return this.getBuildingFootprintAt(
      building.typeId,
      building.x,
      building.y,
      Number.isFinite(building.rotation) ? building.rotation : 0,
      building.team || 'player',
      expansion,
    );
  };

  Game.prototype.isBuildPlacementValid = function(typeId, requestedX, requestedY, requestedRotation = 0, explicitResourceNode = null, teamKey = 'player') {
    const baseStats = BUILDING_TYPES[typeId];
    if (!baseStats) return false;
    const rotation = Number.isFinite(requestedRotation) ? requestedRotation : 0;
    let x = requestedX;
    let y = requestedY;
    let resourceAnchor = null;
    if (baseStats.placeOnResource) {
      resourceAnchor = explicitResourceNode?.alive ? explicitResourceNode : this.findResourceAnchor80?.(typeId, requestedX, requestedY);
      if (!resourceAnchor?.alive) return false;
      const variants = Array.isArray(baseStats.placeOnResource) ? baseStats.placeOnResource : [baseStats.placeOnResource];
      if (!variants.includes(resourceAnchor.variant)) return false;
      if (resourceAnchor.extractorBuildingId && this.getEntity(resourceAnchor.extractorBuildingId)?.alive) return false;
      x = resourceAnchor.x;
      y = resourceAnchor.y;
    }

    const footprint = this.getBuildingFootprintAt(typeId, x, y, rotation, teamKey, 0);
    const clearance = this.getBuildingFootprintAt(typeId, x, y, rotation, teamKey, PLACEMENT_CLEARANCE);
    if (!footprint || !clearance) return false;
    if (clearance.corners.some((corner) => corner.x < 20 || corner.y < 20 || corner.x > WORLD.width - 20 || corner.y > WORLD.height - 20)) return false;
    if (teamKey === 'player' && !this.isVisibleAt(x, y)) return false;

    for (const building of this.buildings) {
      if (!building.alive) continue;
      const occupied = this.getEntityBuildingFootprintAt(building, 0);
      if (occupied && polygonsOverlap(clearance.corners, occupied.corners)) return false;
    }

    for (const resource of this.resources) {
      if (!resource.alive || resource === resourceAnchor) continue;
      if (circleIntersectsFootprint(resource.x, resource.y, (resource.radius || 42) + 18, footprint)) return false;
    }
    for (const feature of this.decorations || []) {
      if (feature.type !== 'rock' || feature.radius < 13) continue;
      if (circleIntersectsFootprint(feature.x, feature.y, feature.radius + 10, footprint)) return false;
    }
    for (const obstacle of this.terrainObstacles || []) {
      if (!obstacle?.radius) continue;
      if (circleIntersectsFootprint(obstacle.x, obstacle.y, obstacle.radius + 8, footprint)) return false;
    }

    if (resourceAnchor) return true;
    return [...this.units, ...this.buildings].some((entity) =>
      entity.alive && entity.team === 'player' && Math.hypot(entity.x - x, entity.y - y) <= 980
    );
  };

  // The original construction pass uses a circular evacuation routine. Feed it
  // the exact envelope's bounding radius so no unit is left under a wide apron.
  const baseEvacuateUnits = Game.prototype.evacuateUnitsFromConstructionSite;
  Game.prototype.evacuateUnitsFromConstructionSite = function(x, y, legacyRadius) {
    const typeId = this.buildMode?.typeId;
    const rotation = this.buildMode?.rotation || 0;
    const footprint = typeId ? this.getBuildingFootprintAt(typeId, x, y, rotation, 'player', PLACEMENT_CLEARANCE) : null;
    return baseEvacuateUnits.call(this, x, y, Math.max(legacyRadius || 0, footprint?.maxRadius || 0));
  };

  const drawScreenPolygon = (points, fill, stroke, width = 2) => {
    if (!points.length) return;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let index = 1; index < points.length; index += 1) ctx.lineTo(points[index].x, points[index].y);
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
  };

  Game.prototype.drawBuildGhost3D = function() {
    if (!this.buildMode) return;
    const drag = this.input.buildPlacementDrag;
    const typeId = this.buildMode.typeId;
    const baseStats = BUILDING_TYPES[typeId];
    let x = drag ? drag.x : this.input.mouse.worldX;
    let y = drag ? drag.y : this.input.mouse.worldY;
    const rotation = drag ? drag.rotation : (this.buildMode.rotation || 0);
    let resourceAnchor = null;
    if (baseStats?.placeOnResource) {
      resourceAnchor = this.findResourceAnchor80?.(typeId, x, y) || null;
      if (resourceAnchor) { x = resourceAnchor.x; y = resourceAnchor.y; }
    }
    const stats = getBuildingStats(typeId, this.teams.player);
    const exact = this.getBuildingFootprintAt(typeId, x, y, rotation, 'player', 0);
    const safety = this.getBuildingFootprintAt(typeId, x, y, rotation, 'player', PLACEMENT_CLEARANCE);
    if (!exact || !safety) return;
    const valid = this.isBuildPlacementValid(typeId, x, y, rotation, resourceAnchor) && this.teams.player.credits >= stats.cost;
    const color = valid ? '#65e2a1' : '#f06c65';
    const light = valid ? '#c8ffe1' : '#ffc2bd';
    const screenExact = exact.corners.map((point) => this.worldToScreen(point.x, point.y, 0.05));
    const screenSafety = safety.corners.map((point) => this.worldToScreen(point.x, point.y, 0.035));

    ctx.save();
    ctx.globalAlpha = 0.96;
    drawScreenPolygon(screenExact, valid ? 'rgba(101,226,161,.18)' : 'rgba(240,108,101,.18)', color, Math.max(2, this.camera.zoom * 2.2));
    ctx.setLineDash([7, 6]);
    ctx.globalAlpha = 0.58;
    drawScreenPolygon(screenSafety, null, color, Math.max(1, this.camera.zoom * 1.35));
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    for (const corner of screenExact) {
      ctx.fillStyle = light;
      ctx.beginPath();
      ctx.arc(corner.x, corner.y, Math.max(2.4, this.camera.zoom * 3.0), 0, Math.PI * 2);
      ctx.fill();
    }

    const localCenterX = (exact.minX + exact.maxX) / 2;
    const localCenterY = (exact.minY + exact.maxY) / 2;
    const center = modelPointToWorld(x, y, rotation, localCenterX, localCenterY);
    const front = modelPointToWorld(x, y, rotation, exact.maxX + 24, localCenterY);
    this.line3D({ x: center.x, y: center.y, z: 4 }, { x: front.x, y: front.y, z: 4 }, color, Math.max(2, this.camera.zoom * 2.1));
    const tip = this.worldToScreen(front.x, front.y, 4);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(tip.x, tip.y, Math.max(3, this.camera.zoom * 3.5), 0, Math.PI * 2);
    ctx.fill();

    const label = this.worldToScreen(center.x, center.y, 2);
    ctx.fillStyle = light;
    ctx.font = `800 ${Math.max(10, 11 * this.camera.zoom)}px system-ui`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,.82)';
    ctx.shadowBlur = 4;
    ctx.fillText(`${Math.round(exact.width)} × ${Math.round(exact.depth)}`, label.x, label.y);
    ctx.restore();
  };

  window.__FD_CONSTRUCTION_FOOTPRINT_V114__ = {
    version: VERSION,
    clearance: PLACEMENT_CLEARANCE,
    computeFootprint,
    footprintAt,
    modelPointToWorld,
    polygonsOverlap,
    circleIntersectsFootprint,
  };
})();
