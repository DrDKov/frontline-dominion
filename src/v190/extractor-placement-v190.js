(() => {
  'use strict';

  const root = globalThis;
  const debug = root.__FD_DEBUG__;
  const Game = debug?.Game;
  if (!Game?.prototype || Game.prototype.__fdExtractorPlacement190Installed) return;
  Object.defineProperty(Game.prototype, '__fdExtractorPlacement190Installed', { value: true, configurable: true });

  const VERSION = '16.8.6';
  const BUILD = 190;
  const SITE_CLEARANCE = 12;
  const TYPE_FOR_RESOURCE = Object.freeze({
    oil: 'oilPump',
    gas: 'gasPump',
    crystal: 'mineralQuarry',
    alloy: 'oreMine',
    relic: 'deepMine',
    core: 'coreDrill',
  });
  const distance = (a, b) => Math.hypot((a?.x || 0) - (b?.x || 0), (a?.y || 0) - (b?.y || 0));
  const normalizeAngle = angle => Math.atan2(Math.sin(angle), Math.cos(angle));

  const diagnostics = {
    attempts: 0,
    placed: 0,
    rejected: 0,
    lastType: null,
    lastRotation: null,
    rotationsTested: 0,
    lastRejectReason: null,
    lastNodeId: null,
    lastWorkerCount: 0,
    lastCandidateResults: [],
    lastSiteCheck: null,
  };

  const reject = (reason, game, node, message = null) => {
    diagnostics.rejected += 1;
    diagnostics.lastRejectReason = reason;
    console.warn('[FD190] extractor placement rejected', {
      reason,
      nodeId: node?.id || null,
      variant: node?.variant || null,
      typeId: diagnostics.lastType,
      rotationsTested: diagnostics.rotationsTested,
      candidates: diagnostics.lastCandidateResults,
      site: diagnostics.lastSiteCheck,
    });
    if (message) game?.alert?.(message, 'warning', node?.x, node?.y);
    return false;
  };

  const getStats = (typeId, team) => {
    try {
      const stats = debug?.getBuildingStats?.(typeId, team);
      if (stats) return stats;
    } catch (_) {}
    return debug?.BUILDING_TYPES?.[typeId] || null;
  };

  const nodeAvailable = (game, node) => {
    if (!node?.alive || node.kind !== 'resource' || !TYPE_FOR_RESOURCE[node.variant]) return false;
    if (!node.extractorBuildingId) return true;
    return !game.getEntity?.(node.extractorBuildingId)?.alive;
  };

  const candidateRotations = (game, node) => {
    const base = game.playerBase || game.buildings?.find?.(building => building?.alive && building.team === 'player' && building.typeId === 'hq');
    const towardBase = base ? Math.atan2(base.y - node.y, base.x - node.x) : 0;
    const raw = [
      towardBase,
      towardBase + Math.PI,
      towardBase + Math.PI / 2,
      towardBase - Math.PI / 2,
      0,
      Math.PI / 2,
      Math.PI,
      -Math.PI / 2,
    ];
    const result = [];
    for (const value of raw) {
      const angle = normalizeAngle(value);
      if (result.some(existing => Math.abs(normalizeAngle(existing - angle)) < 0.001)) continue;
      result.push(angle);
    }
    return result;
  };

  const constructionApi = () => root.__FD_CONSTRUCTION_FOOTPRINT_V114__ || null;
  const originalPlacementValid190 = Game.prototype.isBuildPlacementValid;

  const extractorSiteValid190 = (game, typeId, requestedX, requestedY, requestedRotation = 0, explicitNode = null, teamKey = 'player') => {
    const stats = debug?.BUILDING_TYPES?.[typeId];
    if (!stats?.placeOnResource) return null;
    const expectedVariants = Array.isArray(stats.placeOnResource) ? stats.placeOnResource : [stats.placeOnResource];
    const pinned = game._fdPinnedExtractorNode190;
    const node = explicitNode?.alive
      ? explicitNode
      : pinned?.alive && TYPE_FOR_RESOURCE[pinned.variant] === typeId
        ? pinned
        : game.findResourceAnchor80?.(typeId, requestedX, requestedY) || null;
    const check = {
      typeId,
      nodeId: node?.id || null,
      rotation: Number.isFinite(requestedRotation) ? requestedRotation : 0,
      blockedBy: null,
      clearedDecorations: 0,
    };
    diagnostics.lastSiteCheck = check;
    if (!node?.alive || !expectedVariants.includes(node.variant) || !nodeAvailable(game, node)) {
      check.blockedBy = 'resource';
      return false;
    }

    const rotation = check.rotation;
    const footprint = game.getBuildingFootprintAt?.(typeId, node.x, node.y, rotation, teamKey, 0);
    const clearance = game.getBuildingFootprintAt?.(typeId, node.x, node.y, rotation, teamKey, SITE_CLEARANCE);
    const api = constructionApi();
    if (!footprint || !clearance || !api?.polygonsOverlap || !api?.circleIntersectsFootprint) {
      // If exact geometry is unavailable, preserve the established game path.
      return originalPlacementValid190.call(game, typeId, node.x, node.y, rotation, node, teamKey);
    }

    const world = debug?.WORLD || { width: 32000, height: 22000 };
    if (clearance.corners.some(corner => corner.x < 20 || corner.y < 20 || corner.x > world.width - 20 || corner.y > world.height - 20)) {
      check.blockedBy = 'world-edge';
      return false;
    }
    if (teamKey === 'player' && game.isVisibleAt?.(node.x, node.y) === false) {
      check.blockedBy = 'fog';
      return false;
    }

    for (const building of game.buildings || []) {
      if (!building?.alive) continue;
      const occupied = game.getEntityBuildingFootprintAt?.(building, 0);
      if (occupied?.corners && api.polygonsOverlap(clearance.corners, occupied.corners)) {
        check.blockedBy = `building:${building.id || building.typeId}`;
        return false;
      }
    }

    for (const resource of game.resources || []) {
      if (!resource?.alive || resource === node) continue;
      if (api.circleIntersectsFootprint(resource.x, resource.y, (resource.radius || 42) + 18, footprint)) {
        check.blockedBy = `resource:${resource.id || resource.variant}`;
        return false;
      }
    }

    // Deposits intentionally contain rubble/rocks. A mine, quarry or drill
    // clears those decorations as site preparation; they are not permanent
    // terrain and must not make every resource node impossible to exploit.
    for (const feature of game.decorations || []) {
      if (feature?.type !== 'rock' || (feature.radius || 0) < 13) continue;
      if (!api.circleIntersectsFootprint(feature.x, feature.y, feature.radius + 10, footprint)) continue;
      const belongsToSite = distance(feature, node) <= (node.radius || 42) + (feature.radius || 0) + 96;
      if (belongsToSite) {
        check.clearedDecorations += 1;
        continue;
      }
      check.blockedBy = 'rock';
      return false;
    }

    for (const obstacle of game.terrainObstacles || []) {
      if (!obstacle?.radius) continue;
      if (!api.circleIntersectsFootprint(obstacle.x, obstacle.y, obstacle.radius + 8, footprint)) continue;
      // Small rock-like terrain generated as part of the deposit is cleared;
      // large cliffs/immovable terrain still block construction.
      const siteDistance = distance(obstacle, node);
      if ((obstacle.radius || 0) <= 34 && siteDistance <= (node.radius || 42) + (obstacle.radius || 0) + 72) {
        check.clearedDecorations += 1;
        continue;
      }
      check.blockedBy = 'terrain';
      return false;
    }

    return true;
  };

  Game.prototype.isBuildPlacementValid = function extractorAwarePlacement190(typeId, x, y, rotation = 0, explicitResourceNode = null, teamKey = 'player') {
    const special = extractorSiteValid190(this, typeId, x, y, rotation, explicitResourceNode, teamKey);
    if (special !== null) return special;
    return originalPlacementValid190.call(this, typeId, x, y, rotation, explicitResourceNode, teamKey);
  };

  const withPinnedResource190 = (game, node, callback) => {
    const own = Object.prototype.hasOwnProperty.call(game, 'findResourceAnchor80');
    const previous = game.findResourceAnchor80;
    const inherited = typeof previous === 'function' ? previous.bind(game) : null;
    game._fdPinnedExtractorNode190 = node;
    game.findResourceAnchor80 = function(typeId, x, y) {
      const pinned = this._fdPinnedExtractorNode190;
      const expected = TYPE_FOR_RESOURCE[pinned?.variant];
      if (pinned?.alive && expected === typeId && nodeAvailable(this, pinned)) return pinned;
      return inherited?.(typeId, x, y) || null;
    };
    try {
      return callback();
    } finally {
      delete game._fdPinnedExtractorNode190;
      if (own) game.findResourceAnchor80 = previous;
      else delete game.findResourceAnchor80;
    }
  };

  Game.prototype.buildExtractorFromResource83 = function buildExtractorFromResource190(node) {
    diagnostics.attempts += 1;
    diagnostics.lastRejectReason = null;
    diagnostics.lastCandidateResults = [];
    diagnostics.lastSiteCheck = null;
    diagnostics.lastNodeId = node?.id || null;
    const typeId = TYPE_FOR_RESOURCE[node?.variant];
    diagnostics.lastType = typeId || null;
    if (!nodeAvailable(this, node) || !typeId) {
      return reject('node-unavailable', this, node, 'На этом месторождении уже работает добывающее предприятие.');
    }

    const team = this.teams?.player;
    const stats = getStats(typeId, team);
    if (!team || !stats) return reject('stats-missing', this, node);

    const workers = (this.units || [])
      .filter(unit => unit?.alive && unit.team === 'player' && unit.typeId === 'worker' && !unit.embarkedIn)
      .sort((left, right) => distance(left, node) - distance(right, node));
    diagnostics.lastWorkerCount = workers.length;
    if (!workers.length) {
      return reject('workers-missing', this, node, 'Нужен хотя бы один свободный инженер для строительства добывающего предприятия.');
    }

    const requirements = stats.requires || [];
    let requirementsOk = this.requirementsMet?.('player', requirements, stats.rank || 1) !== false;
    if (!requirementsOk && requirements.length && requirements.every(requirement => requirement === 'power')) {
      requirementsOk = (this.buildings || []).some(building =>
        building?.alive && building.team === 'player' && building.completed &&
        ['power', 'solarArray', 'fusionPlant', 'geothermalPlant'].includes(building.typeId)
      );
    }
    if (!requirementsOk) {
      return reject('requirements', this, node, 'Сначала постройте необходимую энергетическую и технологическую инфраструктуру.');
    }
    if ((team.credits || 0) < (stats.cost || 0)) {
      return reject('credits', this, node, 'Недостаточно ресурсов для строительства добывающего предприятия.');
    }

    let rotation = null;
    const rotations = candidateRotations(this, node);
    diagnostics.rotationsTested = 0;
    for (const candidate of rotations) {
      diagnostics.rotationsTested += 1;
      const valid = this.isBuildPlacementValid?.(typeId, node.x, node.y, candidate, node) !== false;
      diagnostics.lastCandidateResults.push({
        rotation: candidate,
        valid,
        blockedBy: diagnostics.lastSiteCheck?.blockedBy || null,
        clearedDecorations: diagnostics.lastSiteCheck?.clearedDecorations || 0,
      });
      if (valid) {
        rotation = candidate;
        break;
      }
    }
    if (!Number.isFinite(rotation)) {
      return reject('placement', this, node, 'Контур месторождения заблокирован другим зданием или рельефом.');
    }

    const beforeUnits = (this.units || []).filter(unit => unit?.alive).length;
    const previousMode = this.buildMode;
    this.buildMode = {
      typeId,
      workerIds: workers.slice(0, 3).map(worker => worker.id),
      rotation,
    };

    let placed = false;
    try {
      placed = withPinnedResource190(this, node, () => this.placeBuilding?.(node.x, node.y, false, rotation) !== false);
    } finally {
      if (this.buildMode?.typeId === typeId) this.buildMode = previousMode || null;
    }
    if (!placed) return reject('place-building', this, node);

    diagnostics.placed += 1;
    diagnostics.lastRotation = rotation;
    const building = node.extractorBuildingId ? this.getEntity?.(node.extractorBuildingId) : null;
    if (building?.alive) this.setSelection?.([building], false);
    this.uiDirty = true;

    const afterUnits = (this.units || []).filter(unit => unit?.alive).length;
    if (afterUnits < beforeUnits) {
      console.error('[FD190] extractor placement reduced live unit count', { beforeUnits, afterUnits, typeId });
    }
    return true;
  };

  root.__FD_EXTRACTOR_PLACEMENT_190__ = {
    version: VERSION,
    build: BUILD,
    candidateRotations,
    siteValid: extractorSiteValid190,
    diagnostics: () => ({
      ...diagnostics,
      lastCandidateResults: diagnostics.lastCandidateResults.map(item => ({ ...item })),
      lastSiteCheck: diagnostics.lastSiteCheck ? { ...diagnostics.lastSiteCheck } : null,
    }),
  };
})();
