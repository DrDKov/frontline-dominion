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

  Game.prototype.buildExtractorFromResource83 = function buildExtractorFromResource190(node) {
    diagnostics.attempts += 1;
    const typeId = TYPE_FOR_RESOURCE[node?.variant];
    diagnostics.lastType = typeId || null;
    if (!nodeAvailable(this, node) || !typeId) {
      diagnostics.rejected += 1;
      this.alert?.('На этом месторождении уже работает добывающее предприятие.', 'warning', node?.x, node?.y);
      return false;
    }

    const team = this.teams?.player;
    const stats = getStats(typeId, team);
    if (!team || !stats) {
      diagnostics.rejected += 1;
      return false;
    }

    const workers = (this.units || [])
      .filter(unit => unit?.alive && unit.team === 'player' && unit.typeId === 'worker' && !unit.embarkedIn)
      .sort((left, right) => distance(left, node) - distance(right, node));
    if (!workers.length) {
      diagnostics.rejected += 1;
      this.alert?.('Нужен хотя бы один свободный инженер для строительства добывающего предприятия.', 'warning', node.x, node.y);
      return false;
    }
    if (this.requirementsMet?.('player', stats.requires || [], stats.rank || 1) === false) {
      diagnostics.rejected += 1;
      this.alert?.('Сначала постройте необходимую энергетическую и технологическую инфраструктуру.', 'warning', node.x, node.y);
      return false;
    }
    if ((team.credits || 0) < (stats.cost || 0)) {
      diagnostics.rejected += 1;
      this.alert?.('Недостаточно ресурсов для строительства добывающего предприятия.', 'warning', node.x, node.y);
      return false;
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
      if (valid) {
        rotation = candidate;
        break;
      }
    }
    if (!Number.isFinite(rotation)) {
      diagnostics.rejected += 1;
      this.alert?.('Контур месторождения заблокирован другим зданием или рельефом.', 'warning', node.x, node.y);
      return false;
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
      placed = this.placeBuilding?.(node.x, node.y, false, rotation) !== false;
    } finally {
      if (this.buildMode?.typeId === typeId) this.buildMode = previousMode || null;
    }
    if (!placed) {
      diagnostics.rejected += 1;
      return false;
    }

    diagnostics.placed += 1;
    diagnostics.lastRotation = rotation;
    const building = node.extractorBuildingId ? this.getEntity?.(node.extractorBuildingId) : null;
    if (building?.alive) this.setSelection?.([building], false);
    this.uiDirty = true;

    // A construction command must never consume or delete an engineer. The
    // runtime-stability owner performs the deeper collection repair; this is a
    // cheap invariant alarm for the actual user command path.
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
    diagnostics: () => ({ ...diagnostics }),
  };
})();
