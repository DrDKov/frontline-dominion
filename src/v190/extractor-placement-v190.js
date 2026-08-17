(() => {
  'use strict';

  const root = globalThis;
  const debug = root.__FD_DEBUG__;
  const Game = debug?.Game;
  if (!Game?.prototype || Game.prototype.__fdExtractorPlacement190Installed) return;
  Object.defineProperty(Game.prototype, '__fdExtractorPlacement190Installed', { value: true, configurable: true });

  const VERSION = '16.8.6';
  const BUILD = 190;
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
    const towardBase = base
      ? Math.atan2(base.y - node.y, base.x - node.x)
      : 0;
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
      let valid = false;
      try {
        valid = this.isBuildPlacementValid?.(typeId, node.x, node.y, candidate, node) !== false;
      } catch (_) {}
      diagnostics.lastCandidateResults.push({ rotation: candidate, valid });
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
    diagnostics: () => ({
      ...diagnostics,
      lastCandidateResults: diagnostics.lastCandidateResults.map(item => ({ ...item })),
    }),
  };
})();
