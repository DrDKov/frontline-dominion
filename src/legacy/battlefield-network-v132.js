(() => {
  'use strict';

  const debug = window.__FD_DEBUG__;
  const GameClass = debug?.Game;
  const UnitClass = debug?.Unit;
  const BuildingClass = debug?.Building;
  if (!GameClass || !UnitClass || !BuildingClass) return;

  const VERSION = '13.2';
  const TRACK_CELL = 720;
  const TRACKS_PER_CELL = 10;
  const MAX_TRACKS_PER_QUERY = 160;
  const DIRECT_TRACK_TTL = 2.8;
  const DAMAGE_TRACK_TTL = 4.4;
  const LOCAL_STATIC_LINK = 980;
  const SENSOR_BUDGET_PER_TICK = 42;
  const MOD_VARIANTS = ['standard', 'recon', 'assault', 'precision'];
  const MOD_META = {
    standard: { icon: '●', label: 'Штатная', summary: 'Сбалансированная конфигурация.' },
    recon: { icon: '⌖', label: 'Разведывательная', summary: 'Больше скорости и обзора.' },
    assault: { icon: '⬟', label: 'Штурмовая', summary: 'Больше живучести и огневой мощи.' },
    precision: { icon: '▻', label: 'Дальнобойная', summary: 'Больше дальности и урона.' },
  };
  const formatter132 = new Intl.NumberFormat('ru-RU');
  const clamp132 = (value, min, max) => Math.max(min, Math.min(max, value));
  const distance132 = (left, right) => Math.hypot((left?.x || 0) - (right?.x || 0), (left?.y || 0) - (right?.y || 0));
  const hash132 = (value) => {
    let hash = 2166136261;
    for (const char of String(value || 'entity')) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
    return hash >>> 0;
  };
  const cloneCommands132 = (commands) => (commands || []).map((command) => ({ ...command }));
  const isFixedWing132 = (unit) => Boolean(
    unit?.alive && unit.air && unit.stats?.mobilityClass === 'fixedWing' &&
    !/helicopter|lightGunship/i.test(`${unit.typeId || ''} ${unit.stats?.visualRole || ''}`),
  );
  const isProtectedWork132 = (command) => Boolean(command && [
    'build', 'repair', 'harvest', 'capture', 'infiltrate', 'infiltrateBuilding',
    'airService', 'airHangar', 'returnToAirfield', 'loadTransport', 'unloadTransport',
  ].includes(command.type));

  function resolveUnits132(game, values) {
    const source = Array.isArray(values) ? values : game.selected || [];
    const resolved = [];
    const seen = new Set();
    for (const value of source) {
      const unit = typeof value === 'string' ? game.getEntity?.(value) : value;
      if (!unit?.alive || unit.kind !== 'unit' || unit.team !== 'player' || seen.has(unit.id)) continue;
      seen.add(unit.id);
      resolved.push(unit);
    }
    return resolved;
  }

  GameClass.prototype.planUnitModificationBatch132 = function(values, variantKey) {
    const units = resolveUnits132(this, values);
    const compatible = [];
    const ready = [];
    const already = [];
    const locked = [];
    const incompatible = [];
    let totalCost = 0;
    let teamKey = null;

    for (const unit of units) {
      if (teamKey == null) teamKey = unit.team;
      if (unit.team !== teamKey) {
        incompatible.push(unit);
        continue;
      }
      const group = this.getUnitModificationGroup?.(unit);
      const targetId = group?.[variantKey];
      if (!targetId) {
        incompatible.push(unit);
        continue;
      }
      compatible.push(unit);
      if (unit.typeId === targetId || unit.stats?.variant === variantKey) {
        already.push(unit);
        continue;
      }
      const targetStats = debug.getUnitStats(targetId, this.teams[unit.team]);
      const cost = this.getUnitModificationCost(unit, variantKey);
      const item = { unit, targetId, targetStats, cost };
      totalCost += cost;
      if (this.requirementsMet(unit.team, targetStats.requires || [], targetStats.rank || 1)) ready.push(item);
      else locked.push(item);
    }

    return {
      variantKey,
      units,
      teamKey,
      compatible,
      ready,
      already,
      locked,
      incompatible,
      totalCost,
      affordable: Boolean(teamKey && (this.teams[teamKey]?.credits || 0) >= totalCost),
    };
  };

  GameClass.prototype.applyUnitModificationBatch132 = function(values, variantKey, silent = false) {
    const plan = this.planUnitModificationBatch132(values, variantKey);
    if (!plan.compatible.length || !plan.ready.length || plan.locked.length) {
      if (!silent && plan.teamKey === 'player') {
        const text = plan.locked.length
          ? `Не выполнены требования для ${plan.locked.length} ед.`
          : 'Нет юнитов, которым нужно это переоснащение';
        this.alert?.(text, 'warning');
      }
      return false;
    }
    if (!plan.affordable) {
      if (!silent && plan.teamKey === 'player') this.alert?.('Недостаточно ресурсов для группового переоснащения', 'warning');
      return false;
    }

    const multiplayer = window.__FD_MULTIPLAYER__;
    if (multiplayer?.active && !multiplayer.applying && typeof multiplayer.emitIntent === 'function') {
      const unitIds = plan.ready.map((item) => item.unit.id);
      return multiplayer.emitIntent('modifyBatch', { unitIds, variant: variantKey }, unitIds);
    }

    // The complete transaction was validated above. The existing single-unit
    // refit remains the authoritative stat migration and save-compatible path.
    let applied = 0;
    for (const item of plan.ready) {
      if (this.applyUnitModification(item.unit, variantKey, true)) applied += 1;
    }
    if (applied !== plan.ready.length) return false;
    this._battlefieldMetrics132 ||= Object.create(null);
    this._battlefieldMetrics132.batchRefits = (this._battlefieldMetrics132.batchRefits || 0) + applied;
    this.uiDirty = true;
    if (!silent && plan.teamKey === 'player') {
      const meta = MOD_META[variantKey] || { label: variantKey };
      const center = plan.ready.reduce((sum, item) => ({ x: sum.x + item.unit.x, y: sum.y + item.unit.y }), { x: 0, y: 0 });
      this.alert?.(
        `${meta.label}: переоснащено ${applied} ед. · −${formatter132.format(plan.totalCost)}`,
        'info', center.x / applied, center.y / applied,
      );
    }
    return true;
  };

  GameClass.prototype.renderUnitModificationBatch132 = function(force = false) {
    const units = resolveUnits132(this, this.selected).filter((unit) => this.getUnitModificationGroup?.(unit));
    if (!units.length) return false;
    const actionPanel = document.getElementById('action-panel');
    const actionTitle = document.getElementById('action-title');
    const actionButtons = document.getElementById('action-buttons');
    const queuePanel = document.getElementById('queue-panel');
    if (!actionPanel || !actionTitle || !actionButtons || !queuePanel) return false;
    const key = `v132-mod:${units.map((unit) => `${unit.id}:${unit.typeId}`).join('|')}:${this.teams[units[0].team]?.credits || 0}:${this.teams[units[0].team]?.rank || 0}`;
    if (!force && actionButtons.dataset.v132ModKey === key) return true;

    actionPanel.classList.remove('production-layout', 'research-layout');
    actionPanel.classList.add('modification-layout');
    actionTitle.textContent = units.length === 1
      ? `Модификация · ${units[0].stats.canonicalName || units[0].stats.name}`
      : `Групповое переоснащение · ${units.length} ед.`;
    actionButtons.replaceChildren();
    queuePanel.replaceChildren();
    actionButtons.dataset.v132ModKey = key;
    const unitIds = units.map((unit) => unit.id);

    for (const variantKey of MOD_VARIANTS) {
      const plan = this.planUnitModificationBatch132(units, variantKey);
      if (!plan.compatible.length) continue;
      const meta = MOD_META[variantKey];
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `action-button v76-mod-card${plan.ready.length === 0 && plan.already.length ? ' current' : ''}`;
      button.dataset.modVariant = variantKey;
      const blocked = plan.locked.length > 0;
      button.disabled = plan.ready.length === 0 || blocked || !plan.affordable;
      const state = plan.ready.length
        ? `${plan.ready.length} ед. · ${formatter132.format(plan.totalCost)} ¤`
        : `Установлено: ${plan.already.length}`;
      const note = blocked
        ? `Требования не выполнены для ${plan.locked.length} ед.`
        : !plan.affordable ? 'Недостаточно ресурсов' : `Совместимо: ${plan.compatible.length} из ${units.length}`;
      button.innerHTML = `<strong>${meta.icon} ${meta.label}</strong><span>${meta.summary}</span><div class="v76-mod-effects">${note}</div><div class="v76-mod-cost">${state}</div>`;
      button.title = `${meta.label}. ${note}`;
      button.addEventListener('click', () => {
        this.applyUnitModificationBatch132(unitIds, variantKey, false);
        this.sound?.click?.();
      });
      actionButtons.appendChild(button);
    }

    const summary = document.createElement('div');
    summary.className = 'v132-batch-summary';
    summary.textContent = units.length > 1
      ? 'Один выбор переоснащает все совместимые юниты; цена считается одной транзакцией.'
      : 'Полевое переоснащение сохраняет опыт, здоровье и боезапас.';
    queuePanel.appendChild(summary);
    return true;
  };

  const baseRenderAction132 = GameClass.prototype.renderActionUI;
  GameClass.prototype.renderActionUI = function(force = false) {
    const result = baseRenderAction132.call(this, force);
    if (this.renderUnitModificationBatch132(force)) return result;
    document.getElementById('action-panel')?.classList.remove('modification-layout');
    const buttons = document.getElementById('action-buttons');
    if (buttons) delete buttons.dataset.v132ModKey;
    return result;
  };

  const baseRefreshAction132 = GameClass.prototype.refreshActionUI;
  GameClass.prototype.refreshActionUI = function(primary) {
    const result = baseRefreshAction132.call(this, primary);
    this.renderUnitModificationBatch132(false);
    return result;
  };

  function networkState132(game, teamKey) {
    game._battlefieldNetwork132 ||= Object.create(null);
    game._battlefieldNetwork132[teamKey] ||= {
      cells: new Map(),
      byTarget: new Map(),
      cleanupAt: 0,
    };
    game._battlefieldMetrics132 ||= {
      tracksPublished: 0,
      sharedAcquisitions: 0,
      maxTracksExamined: 0,
      returnsOrdered: 0,
      retaliations: 0,
      batchRefits: 0,
    };
    return game._battlefieldNetwork132[teamKey];
  }

  function cellKey132(x, y) {
    return `${Math.floor(x / TRACK_CELL)}:${Math.floor(y / TRACK_CELL)}`;
  }

  function removeTrack132(state, track) {
    state.byTarget.delete(track.targetId);
    const cell = state.cells.get(track.cellKey);
    cell?.delete(track.targetId);
    if (cell?.size === 0) state.cells.delete(track.cellKey);
  }

  GameClass.prototype.pruneBattlefieldNetwork132 = function(teamKey, force = false) {
    const state = networkState132(this, teamKey);
    const now = Number(this.time) || 0;
    if (!force && now < state.cleanupAt) return state;
    state.cleanupAt = now + 1.05;
    for (const track of state.byTarget.values()) {
      const target = this.getEntity?.(track.targetId);
      if (!target?.alive || target.team === teamKey || target.team === 'neutral' || track.expiresAt <= now) removeTrack132(state, track);
    }
    return state;
  };

  GameClass.prototype.isDirectCombatContact132 = function(observer, target) {
    if (!observer?.alive || !target?.alive || observer.team === target.team || target.team === 'neutral') return false;
    if (observer.kind === 'building') {
      if (!observer.completed || observer.sabotagedUntil > this.time) return false;
      if (Number(observer.stats?.powerUse) > 0 && this.isStationaryDefensePowered && !this.isStationaryDefensePowered(observer)) return false;
    }
    const targetConcealed = Boolean(target.cloaked || (target.kind === 'unit' && this.isUndercoverTo?.(target, observer.team)));
    const detector = Math.max(Number(observer.detector) || 0, Number(observer.stats?.detector) || 0, Number(observer.stats?.counterIntelRange) || 0);
    const ordinary = Math.max(Number(observer.vision) || 0, Number(observer.stats?.sensorRange) || 0, Number(observer.stats?.vision) || 0);
    const range = (targetConcealed ? detector : ordinary) * (this.getJammingFactor?.(observer) || 1);
    if (range <= 0 || distance132(observer, target) > range + (target.radius || 0)) return false;
    if (!targetConcealed) return true;
    if (detector >= distance132(observer, target) - (target.radius || 0)) return true;
    return Boolean(this.hasReconContact127?.(observer.team, target, observer));
  };

  GameClass.prototype.publishCombatContact132 = function(observer, target, options = {}) {
    const teamKey = options.teamKey || observer?.team;
    if (!teamKey || !target?.alive || target.team === teamKey || target.team === 'neutral') return null;
    if (!options.force && !this.isDirectCombatContact132(observer, target)) return null;
    const state = this.pruneBattlefieldNetwork132(teamKey);
    const now = Number(this.time) || 0;
    const nextCellKey = cellKey132(target.x, target.y);
    let track = state.byTarget.get(target.id);
    const targetConcealed = Boolean(target.cloaked || (target.kind === 'unit' && this.isUndercoverTo?.(target, teamKey)));
    const reconVerified = options.forceReveal || !targetConcealed || Boolean(this.hasReconContact127?.(teamKey, target, observer));
    const ttl = Math.max(.5, Number(options.ttl) || (options.damage ? DAMAGE_TRACK_TTL : DIRECT_TRACK_TTL));
    const quality = clamp132(Number(options.quality) || (options.damage ? .92 : 1), .08, 1.2);

    if (!track) {
      const cell = state.cells.get(nextCellKey) || new Set();
      if (!state.cells.has(nextCellKey)) state.cells.set(nextCellKey, cell);
      if (cell.size >= TRACKS_PER_CELL) {
        let weakest = null;
        for (const targetId of cell) {
          const candidate = state.byTarget.get(targetId);
          if (!candidate) continue;
          if (!weakest || candidate.expiresAt < weakest.expiresAt || candidate.quality < weakest.quality) weakest = candidate;
        }
        if (weakest && weakest.quality <= quality) removeTrack132(state, weakest);
        else return null;
      }
      track = { targetId: target.id };
      state.byTarget.set(target.id, track);
      (state.cells.get(nextCellKey) || cell).add(target.id);
      this._battlefieldMetrics132.tracksPublished += 1;
    } else if (track.cellKey !== nextCellKey) {
      const next = state.cells.get(nextCellKey) || new Set();
      if (!state.cells.has(nextCellKey)) state.cells.set(nextCellKey, next);
      if (next.size >= TRACKS_PER_CELL && !next.has(track.targetId)) {
        let weakest = null;
        for (const targetId of next) {
          const candidate = state.byTarget.get(targetId);
          if (!candidate) continue;
          if (!weakest || candidate.expiresAt < weakest.expiresAt || candidate.quality < weakest.quality) weakest = candidate;
        }
        if (weakest && weakest.quality <= quality) removeTrack132(state, weakest);
        else return track;
      }
      const previous = state.cells.get(track.cellKey);
      previous?.delete(track.targetId);
      if (previous?.size === 0) state.cells.delete(track.cellKey);
      next.add(track.targetId);
    }

    Object.assign(track, {
      cellKey: nextCellKey,
      x: target.x,
      y: target.y,
      observedAt: now,
      expiresAt: Math.max(track.expiresAt || 0, now + ttl),
      quality: Math.max(track.quality || 0, quality),
      reconVerified: Boolean(track.reconVerified || reconVerified),
      sourceId: observer?.id || null,
      sourceKind: observer?.kind || options.sourceKind || 'unknown',
      sourceTypeId: observer?.typeId || null,
      sourceX: Number(observer?.x) || target.x,
      sourceY: Number(observer?.y) || target.y,
      damageContact: Boolean(options.damage || track.damageContact),
    });
    return track;
  };

  GameClass.prototype.getCombatContact132 = function(teamKey, targetOrId) {
    const state = this.pruneBattlefieldNetwork132(teamKey);
    const target = typeof targetOrId === 'string' ? this.getEntity?.(targetOrId) : targetOrId;
    const track = target?.id ? state.byTarget.get(target.id) : null;
    if (!track || !target?.alive) return null;
    const now = Number(this.time) || 0;
    const drift = Math.hypot(target.x - track.x, target.y - track.y);
    const driftLimit = Math.max(220, (Number(target.stats?.speed) || 0) * Math.min(1.8, now - track.observedAt) + 130);
    if (track.expiresAt <= now || drift > driftLimit || (target.cloaked && !track.reconVerified)) {
      removeTrack132(state, track);
      return null;
    }
    return track;
  };

  GameClass.prototype.getCombatSupportRadius132 = function(observer) {
    const weaponRange = Number(observer?.stats?.weapon?.range) || 0;
    if (observer?.kind === 'building') return Math.max(weaponRange, 120);
    const awareness = Number(observer?.awarenessRadius98?.()) || 0;
    return clamp132(Math.max(760, weaponRange * 1.42, awareness * 1.08), 760, 1780);
  };

  GameClass.prototype.findSharedCombatTarget132 = function(observer, center = observer, options = {}) {
    if (!observer?.alive || !observer.stats?.weapon || !center) return null;
    const teamKey = observer.team;
    const state = this.pruneBattlefieldNetwork132(teamKey);
    const maxRadius = clamp132(Number(options.maxRadius) || this.getCombatSupportRadius132(observer), 80, 2200);
    const targetLayers = options.targetLayers || observer.stats.weapon.targets || ['ground'];
    const minCellX = Math.floor((center.x - maxRadius) / TRACK_CELL);
    const maxCellX = Math.floor((center.x + maxRadius) / TRACK_CELL);
    const minCellY = Math.floor((center.y - maxRadius) / TRACK_CELL);
    const maxCellY = Math.floor((center.y + maxRadius) / TRACK_CELL);
    const integrated = observer.kind === 'building' ? this.getIntegratedAirDefenseState119?.(teamKey) : null;
    let best = null;
    let bestScore = Infinity;
    let bestTrack = null;
    let examined = 0;

    outer:
    for (let cy = minCellY; cy <= maxCellY; cy += 1) {
      for (let cx = minCellX; cx <= maxCellX; cx += 1) {
        const cell = state.cells.get(`${cx}:${cy}`);
        if (!cell) continue;
        for (const targetId of cell) {
          examined += 1;
          if (examined > MAX_TRACKS_PER_QUERY) break outer;
          const target = this.getEntity?.(targetId);
          const track = this.getCombatContact132(teamKey, target);
          if (!track || !target || !observer.canAttack?.(target) && observer.kind !== 'building') continue;
          const layer = target.air ? 'air' : 'ground';
          if (!targetLayers.includes(layer)) continue;
          if (observer.kind === 'building') {
            if (!observer.stats.weapon.targets?.includes(layer)) continue;
            const sourceDistance = Math.hypot(observer.x - track.sourceX, observer.y - track.sourceY);
            if (!integrated?.online && sourceDistance > LOCAL_STATIC_LINK) continue;
          }
          const d = Math.hypot(target.x - center.x, target.y - center.y) - (target.radius || 0);
          if (d > maxRadius) continue;
          const quality = track.quality * clamp132(1 - d / Math.max(1, maxRadius) * .24, .58, 1);
          const score = d + (1 - quality) * 240 + (target.healthRatio || 1) * 24;
          if (score < bestScore) {
            best = target;
            bestTrack = track;
            bestScore = score;
          }
        }
      }
    }
    this._battlefieldMetrics132.maxTracksExamined = Math.max(this._battlefieldMetrics132.maxTracksExamined || 0, examined);
    if (best) {
      observer._sharedTrack132 = {
        targetId: best.id,
        quality: bestTrack.quality,
        expiresAt: bestTrack.expiresAt,
      };
      this._battlefieldMetrics132.sharedAcquisitions += 1;
    }
    return best;
  };

  GameClass.prototype.isCombatEngagementValid132 = function(unit, target, command) {
    if (!target?.alive || !unit?.canAttack?.(target)) return false;
    const anchorX = Number.isFinite(command?.anchorX98) ? command.anchorX98 : unit.x;
    const anchorY = Number.isFinite(command?.anchorY98) ? command.anchorY98 : unit.y;
    const leash = Number(command?.leash132) || clamp132(Math.max(760, (unit.awarenessRadius98?.() || 0) * 1.82), 760, 2200);
    if (Math.hypot(target.x - anchorX, target.y - anchorY) > leash) return false;
    if (this.isDirectCombatContact132(unit, target)) return true;
    if (this.getCombatContact132(unit.team, target)) return true;
    return (Number(this.time) || 0) - (Number(command?.acquiredAt98) || 0) <= .85;
  };

  const baseFindEnemy132 = GameClass.prototype.findNearestEnemy;
  GameClass.prototype.findNearestEnemy = function(x, y, team, radius, targetLayers = ['ground'], observer = null) {
    const target = baseFindEnemy132.call(this, x, y, team, radius, targetLayers, observer);
    if (target && observer && this.isDirectCombatContact132(observer, target)) {
      this.publishCombatContact132(observer, target);
      observer._networkFire132 = null;
      return target;
    }
    if (target && observer?.kind === 'building') {
      const contact = this.getCombatContact132(team, target);
      const integratedQuality = this.getIntegratedTrackQuality119?.(team, target.x, target.y, target) || 0;
      if (contact || integratedQuality > .02) {
        observer._networkFire132 = {
          targetId: target.id,
          quality: Math.max(contact?.quality || 0, integratedQuality),
          expiresAt: Math.max(contact?.expiresAt || 0, (Number(this.time) || 0) + .3),
        };
      }
      return target;
    }
    if (target || observer?.kind !== 'building' || !observer.stats?.weapon) return target;
    if (observer.stats.category === 'defense' && this.isStationaryDefensePowered && !this.isStationaryDefensePowered(observer)) return null;
    const now = Number(this.time) || 0;
    if (now < (observer._networkScanAt132 || 0)) return null;
    observer._networkScanAt132 = now + .24 + (hash132(observer.id) % 11) * .013;
    const airCapable = targetLayers.includes('air');
    const extension = airCapable ? 1.24 : 1.12;
    const extendedRadius = Math.min(radius * extension, radius + (airCapable ? 300 : 190));
    let shared = this.findSharedCombatTarget132(observer, observer, { maxRadius: extendedRadius, targetLayers });
    if (!shared && this.getIntegratedAirDefenseState119?.(team)?.online) {
      shared = baseFindEnemy132.call(this, x, y, team, extendedRadius, targetLayers, observer);
      if (shared) {
        const quality = this.getIntegratedTrackQuality119?.(team, shared.x, shared.y, shared) || 0;
        if (quality <= .02) shared = null;
        else observer._sharedTrack132 = { targetId: shared.id, quality, expiresAt: now + .3 };
      }
    }
    if (shared) observer._networkFire132 = { ...(observer._sharedTrack132 || {}), targetId: shared.id };
    return shared;
  };

  const baseAcquireVisible132 = UnitClass.prototype.acquireVisibleTarget98;
  if (baseAcquireVisible132) {
    UnitClass.prototype.acquireVisibleTarget98 = function(center = this) {
      const direct = baseAcquireVisible132.call(this, center);
      if (direct) {
        if (this.game.isDirectCombatContact132(this, direct)) this.game.publishCombatContact132(this, direct);
        return direct;
      }
      const now = Number(this.game.time) || 0;
      const cached = this.game.getEntity?.(this.sharedCombatTargetId132);
      if (cached?.alive && this.canAttack(cached) && this.game.getCombatContact132(this.team, cached)) return cached;
      if (now < (this.sharedCombatScanAt132 || 0)) return null;
      this.sharedCombatScanAt132 = now + .38 + (hash132(this.id) % 9) * .021;
      const shared = this.game.findSharedCombatTarget132(this, center);
      this.sharedCombatTargetId132 = shared?.id || null;
      return shared;
    };
  }

  const baseMovingTarget132 = UnitClass.prototype.findMovingFireTarget91;
  if (baseMovingTarget132) {
    UnitClass.prototype.findMovingFireTarget91 = function(profile) {
      const direct = baseMovingTarget132.call(this, profile);
      if (direct) return direct;
      const now = Number(this.game.time) || 0;
      if (now < (this.sharedMovingScanAt132 || 0)) return null;
      this.sharedMovingScanAt132 = now + .31 + (hash132(this.id) % 7) * .019;
      const range = (Number(this.stats?.weapon?.range) || 0) * (this.game.getJammingFactor?.(this) || 1);
      return this.game.findSharedCombatTarget132(this, this, { maxRadius: range });
    };
  }

  const baseSetCommand132 = UnitClass.prototype.setCommand;
  UnitClass.prototype.setCommand = function(command, append = false) {
    if (command?.type === 'attack' && command.autoEngage98) {
      if (!Number.isFinite(command.anchorX98)) command.anchorX98 = this.x;
      if (!Number.isFinite(command.anchorY98)) command.anchorY98 = this.y;
      command.acquiredAt98 ||= Number(this.game.time) || 0;
      command.returnToPost132 = true;
    }
    return baseSetCommand132.call(this, command, append);
  };

  UnitClass.prototype.beginReturnToPost132 = function(command = this.currentCommand) {
    if (!command) return false;
    const x = Number(command.anchorX98);
    const y = Number(command.anchorY98);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      this.finishCommand?.();
      return false;
    }
    this.commandQueue[0] = {
      type: 'returnPost132',
      x,
      y,
      resumeCommands132: cloneCommands132(command.resumeCommands132),
      engagementReason132: command.engagementReason132 || 'support',
    };
    this.invalidateNavigation?.();
    this.game._battlefieldMetrics132 ||= Object.create(null);
    this.game._battlefieldMetrics132.returnsOrdered = (this.game._battlefieldMetrics132.returnsOrdered || 0) + 1;
    return true;
  };

  UnitClass.prototype.completeReturnToPost132 = function(command = this.currentCommand) {
    const resume = cloneCommands132(command?.resumeCommands132);
    this.commandQueue.shift();
    if (resume.length) this.commandQueue.unshift(...resume);
    this.invalidateNavigation?.();
    if (this.selected) this.game.uiDirty = true;
    return true;
  };

  UnitClass.prototype.orderCombatResponse132 = function(target, reason = 'support', resumeCurrent = false) {
    if (!target?.alive || !this.canAttack?.(target) || isFixedWing132(this) || isProtectedWork132(this.currentCommand)) return false;
    const current = this.currentCommand;
    const existingAuto = current?.type === 'attack' && current.autoEngage98;
    const resume = resumeCurrent && !existingAuto ? cloneCommands132(this.commandQueue) : cloneCommands132(current?.resumeCommands132);
    const anchorX = existingAuto && Number.isFinite(current.anchorX98) ? current.anchorX98 : this.x;
    const anchorY = existingAuto && Number.isFinite(current.anchorY98) ? current.anchorY98 : this.y;
    this.setCommand({
      type: 'attack',
      targetId: target.id,
      autoEngage98: true,
      anchorX98: anchorX,
      anchorY98: anchorY,
      acquiredAt98: Number(this.game.time) || 0,
      leash132: reason === 'retaliation' ? 2200 : undefined,
      engagementReason132: reason,
      resumeCommands132: resume,
    });
    return true;
  };

  const baseProcessCommand132 = UnitClass.prototype.processCommand;
  UnitClass.prototype.processCommand = function(command, dt) {
    if (command?.type === 'returnPost132') {
      if (this.moveToward(command.x, command.y, dt)) this.completeReturnToPost132(command);
      return;
    }
    if (command?.type === 'hold' && this.stats?.weapon) {
      let retaliator = this.game.getEntity?.(this.retaliationTargetId132);
      const range = this.stats.weapon.range * (this.game.getJammingFactor?.(this) || 1);
      if (!retaliator?.alive || !this.canAttack(retaliator) || distance132(this, retaliator) - this.radius - retaliator.radius > range ||
          !this.game.getCombatContact132(this.team, retaliator)) {
        this.retaliationTargetId132 = null;
        retaliator = null;
      }
      if (!retaliator && (Number(this.game.time) || 0) >= (this.holdSharedScanAt132 || 0)) {
        this.holdSharedScanAt132 = (Number(this.game.time) || 0) + .34 + (hash132(this.id) % 5) * .022;
        retaliator = this.game.findSharedCombatTarget132(this, this, { maxRadius: range });
      }
      if (retaliator) {
        this.engageTarget(retaliator, dt, false, false);
        return;
      }
    }
    if (command?.type === 'attack' && command.autoEngage98 && !isFixedWing132(this)) {
      const target = this.game.getEntity?.(command.targetId);
      if (!this.game.isCombatEngagementValid132(this, target, command)) {
        this.beginReturnToPost132(command);
        return;
      }
      this.engageTarget(target, dt, true);
      return;
    }
    return baseProcessCommand132.call(this, command, dt);
  };

  function respondToDamage132(entity, source) {
    if (!entity || !source?.alive || source.team === entity.team || source.team === 'neutral') return;
    const game = entity.game;
    game.publishCombatContact132(entity, source, { force: true, forceReveal: true, damage: true, quality: .96 });
    if (!entity.alive || entity.kind !== 'unit' || !entity.stats?.weapon || !entity.canAttack?.(source) || isFixedWing132(entity)) return;
    const command = entity.currentCommand;
    if (command?.type === 'hold') {
      entity.retaliationTargetId132 = source.id;
      return;
    }
    if (command?.type === 'patrol' || command?.type === 'guard' || command?.type === 'formation') {
      command.combatTargetId = source.id;
      return;
    }
    if (isProtectedWork132(command) || command?.type === 'attack' && !command.autoEngage98) return;
    const now = Number(game.time) || 0;
    if (now < (entity.retaliationOrderAt132 || 0) && command?.targetId === source.id) return;
    entity.retaliationOrderAt132 = now + .45;
    if (entity.orderCombatResponse132(source, 'retaliation', Boolean(command && !command.autoEngage98))) {
      game._battlefieldMetrics132.retaliations = (game._battlefieldMetrics132.retaliations || 0) + 1;
    }
  }

  const baseUnitDamage132 = UnitClass.prototype.takeDamage;
  UnitClass.prototype.takeDamage = function(rawDamage, source = null, damageType = null) {
    const hpBefore = this.hp;
    const result = baseUnitDamage132.call(this, rawDamage, source, damageType);
    if (this.hp < hpBefore) respondToDamage132(this, source);
    return result;
  };

  const baseBuildingDamage132 = BuildingClass.prototype.takeDamage;
  BuildingClass.prototype.takeDamage = function(rawDamage, source = null, damageType = null) {
    const hpBefore = this.hp;
    const result = baseBuildingDamage132.call(this, rawDamage, source, damageType);
    if (this.hp < hpBefore) respondToDamage132(this, source);
    return result;
  };

  function remoteAccuracy132(entity, target) {
    if (entity.game.isDirectCombatContact132(entity, target)) return null;
    const now = Number(entity.game.time) || 0;
    const networkMarker = entity._networkFire132?.targetId === target.id && entity._networkFire132.expiresAt > now
      ? entity._networkFire132
      : null;
    const sharedMarker = entity._sharedTrack132?.targetId === target.id && entity._sharedTrack132.expiresAt > now
      ? entity._sharedTrack132
      : null;
    const marker = networkMarker || sharedMarker;
    const contact = entity.game.getCombatContact132(entity.team, target);
    const quality = clamp132(Math.max(marker?.quality || 0, contact?.quality || 0), .08, 1);
    if (!marker && !contact) return null;
    const weapon = entity.stats?.weapon;
    const range = Math.max(1, Number(weapon?.range) || 1);
    const extension = clamp132((distance132(entity, target) - range) / range, 0, .35);
    const scale = clamp132(.66 + quality * .25 - extension * .42, .48, .92);
    return clamp132((Number(weapon.accuracy) || .96) * scale, .25, .97);
  }

  function wrapNetworkAccuracy132(Class, methodName) {
    const base = Class.prototype[methodName];
    if (typeof base !== 'function') return;
    Class.prototype[methodName] = function(target, ...rest) {
      const accuracy = target ? remoteAccuracy132(this, target) : null;
      if (accuracy == null || !this.stats?.weapon) return base.call(this, target, ...rest);
      const originalStats = this.stats;
      this.stats = { ...originalStats, weapon: { ...originalStats.weapon, accuracy } };
      try { return base.call(this, target, ...rest); }
      finally { this.stats = originalStats; }
    };
  }
  wrapNetworkAccuracy132(UnitClass, 'fire');
  wrapNetworkAccuracy132(BuildingClass, 'fire');

  const baseUnitUpdate132 = UnitClass.prototype.update;
  UnitClass.prototype.update = function(dt) {
    const result = baseUnitUpdate132.call(this, dt);
    if (!this.alive || this.embarkedIn || !this.stats || isProtectedWork132(this.currentCommand)) return result;
    const signature = `${this.typeId || ''} ${this.stats.variant || ''} ${this.stats.visualRole || ''} ${this.stats.role || ''}`;
    const sensor = this.typeId === 'awacs' || this.stats.radarRelay || this.stats.variant === 'recon' || Number(this.stats.counterIntel) > 0 || /recon|scout|awacs|drlo|развед/i.test(signature);
    if (!sensor) return result;
    const now = Number(this.game.time) || 0;
    if (now < (this.combatSensorScanAt132 || 0)) return result;
    const tick = Math.floor(now * 5);
    if (this.game._combatSensorBudgetTick132 !== tick) {
      this.game._combatSensorBudgetTick132 = tick;
      this.game._combatSensorBudget132 = SENSOR_BUDGET_PER_TICK;
    }
    if ((this.game._combatSensorBudget132 || 0) <= 0) return result;
    this.game._combatSensorBudget132 -= 1;
    this.combatSensorScanAt132 = now + .52 + (hash132(this.id) % 13) * .017;
    const range = clamp132(Math.max(Number(this.vision) || 0, Number(this.detector) || 0, Number(this.stats.sensorRange) || 0), 240, 1900);
    const target = baseFindEnemy132.call(this.game, this.x, this.y, this.team, range, ['ground', 'air'], this);
    if (target && this.game.isDirectCombatContact132(this, target)) this.game.publishCombatContact132(this, target, { quality: this.typeId === 'awacs' ? 1.08 : .94 });
    return result;
  };

  const baseRenderSelection132 = GameClass.prototype.renderSelectionUI;
  GameClass.prototype.renderSelectionUI = function(...args) {
    const result = baseRenderSelection132.apply(this, args);
    const details = document.getElementById('selection-details');
    details?.querySelector('[data-battlefield-network132]')?.remove();
    const selected = resolveUnits132(this, this.selected).filter((unit) => unit.stats?.weapon);
    if (!details || !selected.length) return result;
    const returning = selected.filter((unit) => unit.currentCommand?.type === 'returnPost132').length;
    const linked = selected.filter((unit) => unit._sharedTrack132?.expiresAt > (Number(this.time) || 0)).length;
    details.insertAdjacentHTML('beforeend', `<div data-battlefield-network132><div class="stat-line"><span>Боевая сеть</span><strong>поддержка ${linked} · возврат ${returning}</strong></div></div>`);
    return result;
  };

  const style = document.createElement('style');
  style.id = 'fd-battlefield-network-v132-style';
  style.textContent = '.v132-batch-summary{padding:9px 11px;border:1px solid rgba(132,208,164,.22);border-radius:7px;background:rgba(83,151,112,.08);color:#a9c5b5;font:700 10px/1.45 system-ui;letter-spacing:.025em}';
  document.head?.appendChild(style);

  void 0;
  const eyebrow = document.querySelector('#start-screen .eyebrow');
  if (eyebrow) void 0;
  const lead = document.querySelector('#start-screen .lead');
  if (lead) void 0;
  const strip = document.querySelector('#start-screen .feature-strip');
  if (strip && !strip.querySelector('[data-battlefield-network132-feature]')) {
    void 0;
  }

  window.__FD_BATTLEFIELD_NETWORK_V132__ = {
    version: VERSION,
    constants: { TRACK_CELL, TRACKS_PER_CELL, MAX_TRACKS_PER_QUERY, DIRECT_TRACK_TTL, DAMAGE_TRACK_TTL },
    get metrics() { return debug.game?._battlefieldMetrics132 || null; },
  };
})();
