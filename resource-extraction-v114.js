(() => {
  'use strict';

  const debug = window.__FD_DEBUG__;
  const Game = debug?.Game;
  const Building = debug?.Building;
  const TacticalAI = debug?.TacticalAI;
  const BUILDING_TYPES = debug?.BUILDING_TYPES;
  const BUILD_CATEGORIES = debug?.BUILD_CATEGORIES;
  const getBuildingStats = debug?.getBuildingStats;
  if (!Game || !Building || !TacticalAI || !BUILDING_TYPES || !getBuildingStats) return;

  const VERSION = '11.4';
  const RESOURCE_EXTRACTOR_TYPES = Object.freeze({
    oil: 'oilPump',
    gas: 'gasPump',
    crystal: 'mineralQuarry',
    alloy: 'oreMine',
    relic: 'deepMine',
    core: 'coreDrill',
  });
  const RESOURCE_PRESENTATION = Object.freeze({
    oil: { name: 'Нефтяная скважина', icon: '🛢' },
    gas: { name: 'Газовое месторождение', icon: '⛽' },
    crystal: { name: 'Минеральное месторождение', icon: '◇' },
    alloy: { name: 'Рудное месторождение', icon: '◆' },
    relic: { name: 'Месторождение редких материалов', icon: '⬙' },
    core: { name: 'Ключевое глубинное месторождение', icon: '◈' },
  });

  Object.assign(BUILDING_TYPES, {
    mineralQuarry: {
      name: 'Минеральный карьер', icon: '◇', cost: 1750, time: 22, hp: 1950, radius: 39,
      powerUse: 12, vision: 285, category: 'economy', placeOnResource: 'crystal',
      extractor: false, logisticsExtractor: true, requires: ['power'],
      role: 'Открытая разработка минерального пласта с дробильным узлом и погрузочным конвейером.',
    },
    oreMine: {
      name: 'Рудообогатительный рудник', icon: '⛏', cost: 1950, time: 25, hp: 2180, radius: 41,
      powerUse: 15, vision: 300, category: 'economy', placeOnResource: 'alloy',
      extractor: false, logisticsExtractor: true, requires: ['power'],
      role: 'Шахтный копёр, подъёмная машина и обогатительная линия для рудных залежей.',
    },
    deepMine: {
      name: 'Глубокая шахта редких материалов', icon: '⬙', cost: 2400, time: 30, hp: 2480, radius: 43,
      powerUse: 20, vision: 315, category: 'economy', placeOnResource: 'relic',
      extractor: false, logisticsExtractor: true, requires: ['power'],
      role: 'Бронированный глубокий ствол с герметичной сортировкой редких материалов.',
    },
    coreDrill: {
      name: 'Буровой комплекс ключевого ресурса', icon: '◈', cost: 2950, time: 35, hp: 2850, radius: 45,
      powerUse: 26, vision: 340, category: 'economy', placeOnResource: 'core',
      extractor: false, logisticsExtractor: true, requires: ['power'],
      role: 'Сверхглубокая роторная буровая с охлаждением и защищённым приёмным колодцем.',
    },
  });

  const LOGISTICS_PROFILES = Object.freeze({
    oilPump: {
      bufferCapacity: 16800, extractPerTick: 46, incomeInterval: 1.15,
      role: 'Добывает нефть в локальный резервуар. Сырьё доставляется грузовиком или инженером в пункт разгрузки.',
    },
    gasPump: {
      bufferCapacity: 19600, extractPerTick: 54, incomeInterval: 1.25,
      role: 'Сжимает добытый газ в локальном накопителе. Для получения ресурсов нужна доставка на базу.',
    },
    mineralQuarry: {
      bufferCapacity: 18500, extractPerTick: 52, incomeInterval: 1.20,
      role: 'Дробит минеральную породу и накапливает концентрат для последующей перевозки.',
    },
    oreMine: {
      bufferCapacity: 20800, extractPerTick: 58, incomeInterval: 1.25,
      role: 'Поднимает и обогащает руду; готовый концентрат необходимо доставлять в пункт разгрузки.',
    },
    deepMine: {
      bufferCapacity: 16200, extractPerTick: 64, incomeInterval: 1.35,
      role: 'Извлекает редкие материалы с глубины и хранит их в защищённом перегрузочном бункере.',
    },
    coreDrill: {
      bufferCapacity: 14800, extractPerTick: 72, incomeInterval: 1.45,
      role: 'Бурит ключевой пласт и выдаёт ценный материал малыми защищёнными партиями для перевозки.',
    },
  });

  const extractorTypeIds = Object.values(RESOURCE_EXTRACTOR_TYPES);
  for (const typeId of extractorTypeIds) {
    const stats = BUILDING_TYPES[typeId];
    const profile = LOGISTICS_PROFILES[typeId];
    if (!stats || !profile) continue;
    Object.assign(stats, profile, { extractor: false, logisticsExtractor: true });
    if (BUILD_CATEGORIES?.economy && !BUILD_CATEGORIES.economy.types.includes(typeId)) {
      BUILD_CATEGORIES.economy.types.push(typeId);
    }
  }

  window.__FD_RESOURCE_EXTRACTORS__ = RESOURCE_EXTRACTOR_TYPES;
  debug.RESOURCE_EXTRACTOR_TYPES = RESOURCE_EXTRACTOR_TYPES;

  const distance = (left, right) => Math.hypot((left?.x || 0) - (right?.x || 0), (left?.y || 0) - (right?.y || 0));
  const extractorTypeFor = (variant) => RESOURCE_EXTRACTOR_TYPES[variant] || null;
  const extractorNodeAvailable = (game, node, claimantId = null) => {
    if (!node?.alive || node.kind !== 'resource' || !extractorTypeFor(node.variant)) return false;
    if (!node.extractorBuildingId || node.extractorBuildingId === claimantId) return true;
    const existing = game.getEntity(node.extractorBuildingId);
    return !existing?.alive;
  };

  // Prevent two restored or newly created extractors from claiming the same node.
  const baseBuildingUpdate = Building.prototype.update;
  Building.prototype.update = function(dt) {
    let pendingLink = false;
    if (this.stats?.logisticsExtractor) {
      const linked = this.resourceNodeId ? this.game.getEntity(this.resourceNodeId) : null;
      const linkValid = linked?.alive && linked.kind === 'resource' && linked.variant === this.stats.placeOnResource &&
        (!linked.extractorBuildingId || linked.extractorBuildingId === this.id || !this.game.getEntity(linked.extractorBuildingId)?.alive);
      if (!linkValid) this.resourceNodeId = null;
      if (!this.resourceNodeId) {
        const node = this.game.resources
          .filter((candidate) => candidate.alive && candidate.variant === this.stats.placeOnResource && extractorNodeAvailable(this.game, candidate, this.id))
          .sort((left, right) => distance(left, this) - distance(right, this))[0];
        if (node && distance(node, this) < 150) {
          this.resourceNodeId = node.id;
          node.extractorBuildingId = this.id;
        } else {
          // The older generic update would otherwise grab an already occupied nearest node.
          this.resourceNodeId = '__fd_unlinked_extractor_v114__';
          pendingLink = true;
        }
      }
    }
    const result = baseBuildingUpdate.call(this, dt);
    if (pendingLink && this.resourceNodeId === '__fd_unlinked_extractor_v114__') this.resourceNodeId = null;
    return result;
  };

  // Rebuild the derived node→extractor links synchronously during hydration so
  // the resource card cannot offer a duplicate before the first simulation tick.
  const baseHydrate = Game.prototype.hydrate;
  Game.prototype.hydrate = function(data) {
    const result = baseHydrate.call(this, data);
    const rawById = new Map((data?.entities || []).map((raw) => [raw.id, raw]));
    for (const node of this.resources) node.extractorBuildingId = null;
    const claimed = new Set();
    for (const building of this.buildings) {
      if (!building.alive || !building.stats?.logisticsExtractor) continue;
      const raw = rawById.get(building.id);
      building.resourceBuffer83 = Number(raw?.resourceBuffer83) || 0;
      building.extractTimer83 = Number(raw?.extractTimer83) || 0;
      let node = raw?.resourceNodeId ? this.getEntity(raw.resourceNodeId) : null;
      if (!node?.alive || node.kind !== 'resource' || node.variant !== building.stats.placeOnResource || claimed.has(node.id) || distance(node, building) >= 180) node = null;
      if (!node) {
        node = this.resources
          .filter((candidate) => candidate.alive && candidate.variant === building.stats.placeOnResource && !claimed.has(candidate.id))
          .sort((left, right) => distance(left, building) - distance(right, building))[0];
        if (node && distance(node, building) >= 180) node = null;
      }
      building.resourceNodeId = node?.id || null;
      if (node) {
        claimed.add(node.id);
        node.extractorBuildingId = building.id;
      }
    }
    return result;
  };

  // Use the standard placement command. This keeps costs, unit evacuation,
  // build orders, snapping and multiplayer intents on the same authoritative path.
  Game.prototype.buildExtractorFromResource83 = function(node) {
    const typeId = extractorTypeFor(node?.variant);
    if (!node?.alive || node.kind !== 'resource' || !typeId) return false;
    if (!extractorNodeAvailable(this, node)) {
      this.alert('На этом месторождении уже работает добывающее предприятие.', 'warning', node.x, node.y);
      return false;
    }
    const stats = getBuildingStats(typeId, this.teams.player);
    const workers = this.units
      .filter((unit) => unit.alive && unit.team === 'player' && unit.typeId === 'worker' && !unit.embarkedIn)
      .sort((left, right) => distance(left, node) - distance(right, node));
    if (!workers.length) {
      this.alert('Нужен хотя бы один свободный инженер для строительства добывающего предприятия.', 'warning', node.x, node.y);
      return false;
    }
    if (!this.requirementsMet('player', stats.requires || [], stats.rank || 1)) {
      this.alert('Сначала постройте необходимую энергетическую и технологическую инфраструктуру.', 'warning', node.x, node.y);
      return false;
    }
    if (this.teams.player.credits < stats.cost) {
      this.alert('Недостаточно ресурсов для строительства добывающего предприятия.', 'warning', node.x, node.y);
      return false;
    }
    const rotation = Math.atan2((this.playerBase?.y ?? node.y) - node.y, (this.playerBase?.x ?? node.x + 1) - node.x);
    if (!this.isBuildPlacementValid(typeId, node.x, node.y, rotation, node)) {
      this.alert('Контур месторождения заблокирован другим зданием или рельефом.', 'warning', node.x, node.y);
      return false;
    }

    const previousMode = this.buildMode;
    this.buildMode = { typeId, workerIds: workers.slice(0, 3).map((worker) => worker.id), rotation };
    const placed = this.placeBuilding(node.x, node.y, false, rotation);
    if (this.buildMode?.typeId === typeId) this.buildMode = previousMode || null;
    if (!placed) return false;

    const building = node.extractorBuildingId ? this.getEntity(node.extractorBuildingId) : null;
    if (building?.alive) this.setSelection([building], false);
    this.uiDirty = true;
    return true;
  };

  const actionPanel = document.getElementById('action-panel');
  const actionTitle = document.getElementById('action-title');
  const actionButtons = document.getElementById('action-buttons');
  const queuePanel = document.getElementById('queue-panel');
  const baseRenderActionUI = Game.prototype.renderActionUI;
  Game.prototype.renderActionUI = function(force = false) {
    const result = baseRenderActionUI.call(this, force);
    const node = this.getPrimarySelection();
    if (node?.kind !== 'resource' || !actionButtons || !queuePanel) return result;

    const typeId = extractorTypeFor(node.variant);
    const stats = typeId ? getBuildingStats(typeId, this.teams.player) : null;
    const presentation = RESOURCE_PRESENTATION[node.variant] || { name: 'Месторождение', icon: '◆' };
    const existing = node.extractorBuildingId ? this.getEntity(node.extractorBuildingId) : null;
    const hasExtractor = Boolean(existing?.alive);
    actionPanel?.classList.remove('production-layout', 'research-layout', 'modification-layout');
    if (actionTitle) actionTitle.textContent = 'Освоение месторождения';
    actionButtons.replaceChildren();
    queuePanel.replaceChildren();

    const card = document.createElement('div');
    card.className = 'resource-site-card';
    const status = hasExtractor
      ? `${existing.completed ? 'добыча запущена' : `строительство ${Math.round((existing.construction || 0) * 100)}%`}`
      : stats ? `требуется: ${stats.name}` : 'тип месторождения не поддерживается';
    card.innerHTML = `<div class="resource-site-icon">${presentation.icon}</div><div><strong>${presentation.name}</strong><small>Запас: ${Math.round(node.amount).toLocaleString('ru-RU')} · ${status}</small></div>`;
    actionButtons.appendChild(card);
    if (!stats) return result;

    const workerCount = this.units.filter((unit) => unit.alive && unit.team === 'player' && unit.typeId === 'worker' && !unit.embarkedIn).length;
    const unlocked = this.requirementsMet('player', stats.requires || [], stats.rank || 1);
    const affordable = this.teams.player.credits >= stats.cost;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'resource-build-button';
    button.disabled = hasExtractor || !workerCount || !unlocked || !affordable;
    button.textContent = hasExtractor
      ? `✓ ${stats.name}: ${existing.completed ? 'работает' : 'строится'}`
      : `Построить: ${stats.name} · ${Math.round(stats.cost).toLocaleString('ru-RU')} ¤`;
    button.title = hasExtractor
      ? 'На этом месторождении уже есть добывающее предприятие.'
      : !workerCount ? 'Нет доступных инженеров.'
      : !unlocked ? 'Не выполнены технологические требования.'
      : !affordable ? 'Недостаточно ресурсов.'
      : 'Установить точный фундамент на месторождении и направить до трёх ближайших инженеров.';
    button.addEventListener('click', () => this.buildExtractorFromResource83(node));
    actionButtons.appendChild(button);
    return result;
  };

  // The opponent uses the same six-way mapping and the same physical logistics.
  TacticalAI.prototype.ensureExtractors80 = function() {
    const game = this.game;
    const team = game.teams.enemy;
    if (!team) return;
    const nodes = game.resources
      .filter((node) => extractorNodeAvailable(game, node) && distance(node, this.base) < 2300)
      .sort((left, right) => distance(left, this.base) - distance(right, this.base));
    for (const node of nodes) {
      const typeId = extractorTypeFor(node.variant);
      const stats = getBuildingStats(typeId, team);
      if (team.credits < stats.cost || !game.requirementsMet('enemy', stats.requires || [], stats.rank || 1)) continue;
      const rotation = this.ensureBasePlan79 ? this.ensureBasePlan79().heading : Math.PI;
      if (!game.isBuildPlacementValid(typeId, node.x, node.y, rotation, node, 'enemy')) continue;
      const building = new Building(game, {
        typeId, team: 'enemy', x: node.x, y: node.y, rotation, weaponRotation: rotation,
        construction: 0.03, autoConstruct: true,
      });
      building.resourceNodeId = node.id;
      building.resourceBuffer83 = 0;
      building.extractTimer83 = 0;
      node.extractorBuildingId = building.id;
      team.credits -= stats.cost;
      game.addEntity(building);
      break;
    }
  };

  window.__FD_RESOURCE_EXTRACTION_V114__ = {
    version: VERSION,
    extractorTypes: RESOURCE_EXTRACTOR_TYPES,
    presentations: RESOURCE_PRESENTATION,
    profiles: LOGISTICS_PROFILES,
    typeForVariant: extractorTypeFor,
  };
})();
