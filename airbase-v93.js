(() => {
  'use strict';
  const debug = window.__FD_DEBUG__;
  const GameClass = debug?.Game;
  const UnitClass = debug?.Unit;
  const BuildingClass = debug?.Building;
  if (!GameClass || !UnitClass || !BuildingClass) return;

  const AIRFIELD_TYPES93 = new Set(['airfield', 'advancedAirfield']);
  const HANGAR_CAPACITY93 = 12;
  const MIN_SORTIE_RESOURCE93 = 320;
  const clamp93 = (value, min, max) => Math.max(min, Math.min(max, value));
  const isFixedWingStats93 = (stats, typeId = '') => Boolean(
    stats?.air && stats.mobilityClass === 'fixedWing' &&
    !/helicopter|lightGunship/i.test(`${typeId} ${stats.visualRole || ''}`)
  );
  const isFixedWing93 = (unit) => Boolean(unit?.alive && isFixedWingStats93(unit.stats, unit.typeId));
  const isAirfield93 = (field) => Boolean(field?.alive && field.completed && AIRFIELD_TYPES93.has(field.typeId));
  const isHangarCommand93 = (unit) => unit?.currentCommand?.type === 'airHangar93';
  const isStoredReady93 = (unit) => isHangarCommand93(unit) && unit.currentCommand.stage === 'ready';
  const isPersistentAirMission93 = (unit, command) => {
    if (command?.type === 'patrol' || command?.type === 'guard') return true;
    if (command?.type !== 'formation') return false;
    return unit?.game?.formations?.get(command.formationId)?.mode === 'patrol';
  };
  const hasPersistentAirMission93 = (unit) => unit?.commandQueue?.some((command) =>
    command?.type !== 'airService' && command?.type !== 'airHangar93' && isPersistentAirMission93(unit, command));
  const escapeHTML93 = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);

  const style93 = document.createElement('style');
  style93.id = 'v93-airbase-style';
  style93.textContent = `
    .v93-airbase-ready strong { color: #9feac2; }
    .v93-airbase-service strong { color: #ffd98a; }
    .v93-airbase-away strong { color: #9fd8ff; }
    .command-button[data-air-wing93] { border-color: rgba(124,205,255,.46); background: rgba(76,151,197,.12); }
    .command-button[data-air-return93] { border-color: rgba(158,230,187,.42); }
    .v93-fleet-capacity { color: #a9d7bf; }
    .v93-fleet-capacity.is-full strong { color: #ffd27d; }
    .v93-air-roster {
      grid-column: 1 / -1; order: -5; display: grid; gap: 6px; padding: 7px;
      border: 1px solid rgba(126,195,162,.28); border-radius: 8px;
      background: linear-gradient(145deg, rgba(41,72,57,.32), rgba(10,19,15,.58));
    }
    .v93-air-roster-head { display: flex; justify-content: space-between; align-items: center; gap: 9px; }
    .v93-air-roster-head span { color: #b7cfc2; font-size: 9px; font-weight: 900; letter-spacing: .11em; }
    .v93-air-roster-head strong { color: #e5f2ea; font-size: 10px; text-align: right; }
    .v93-air-roster-empty { color: #82988c; font-size: 10px; line-height: 1.3; padding: 4px 2px; }
    .v93-air-type-list { display: grid; gap: 5px; }
    .v93-air-type {
      display: grid; grid-template-columns: minmax(132px,1fr) auto; gap: 5px 8px; align-items: center;
      padding: 5px; border: 1px solid rgba(146,185,165,.19); border-radius: 6px; background: rgba(6,13,10,.34);
    }
    .v93-air-type-name { min-width: 0; }
    .v93-air-type-name strong { display: block; color: #e4eee8; font-size: 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .v93-air-type-name small { display: block; margin-top: 2px; color: #89a095; font-size: 8.5px; }
    .v93-air-quantity { display: grid; grid-template-columns: 30px 42px 30px minmax(72px,auto) 42px; gap: 4px; align-items: center; }
    .v93-air-quantity button, .v93-air-unit-chip {
      min-height: 30px; border: 1px solid rgba(137,202,168,.32); border-radius: 5px;
      background: rgba(76,124,96,.15); color: #dfede4; cursor: pointer; touch-action: manipulation;
    }
    .v93-air-quantity button:hover, .v93-air-unit-chip:hover { border-color: rgba(164,235,192,.72); background: rgba(82,151,106,.28); }
    .v93-air-quantity button[data-air-select-type93], .v93-air-quantity button[data-air-select-all93] { padding: 3px 7px; color: #c7f1d6; font-size: 9px; font-weight: 900; }
    .v93-air-quantity output { color: #f0f7f3; font-size: 10px; font-weight: 900; text-align: center; font-variant-numeric: tabular-nums; }
    .v93-air-unit-list { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: 4px; }
    .v93-air-unit-chip { min-height: 28px; padding: 3px 7px; font-size: 8.5px; color: #b9cfc3; }
    .v93-air-unit-chip[data-air-stage93="ready"] { border-color: rgba(108,223,155,.42); color: #bff0d1; }
    .v93-air-unit-chip[data-air-stage93="service"] { border-color: rgba(244,197,105,.42); color: #f1d39a; }
    .v93-air-unit-chip[data-air-stage93="return"], .v93-air-unit-chip[data-air-stage93="launch"] { border-color: rgba(113,188,231,.42); color: #b7dff4; }
    #action-panel.production-layout.v93-airfield-layout #action-buttons {
      overflow-y: auto !important; grid-template-rows: none !important; grid-auto-rows: auto !important; align-content: start !important;
    }
    #action-panel.production-layout.v93-airfield-layout .action-button[data-action-kind="unit"] { min-height: 50px !important; height: 50px !important; }
    @media (max-width: 920px), (pointer: coarse) {
      .v93-air-type { grid-template-columns: 1fr; }
      .v93-air-quantity { grid-template-columns: 34px 44px 34px minmax(92px,1fr) 46px; }
      .v93-air-quantity button, .v93-air-unit-chip { min-height: 34px; }
    }
  `;
  document.head.appendChild(style93);

  function ensureSortieResource93(unit) {
    if (!isFixedWing93(unit)) return false;
    debug.v74EnsureAircraftLogistics?.(unit);
    const previousMax = Math.max(1, Number(unit.sortieFuelMax) || MIN_SORTIE_RESOURCE93);
    const previousFuel = clamp93(Number(unit.sortieFuel) || 0, 0, previousMax);
    if (previousMax < MIN_SORTIE_RESOURCE93) {
      unit.sortieFuelMax = MIN_SORTIE_RESOURCE93;
      unit.sortieFuel = clamp93(previousFuel / previousMax * unit.sortieFuelMax, 0, unit.sortieFuelMax);
    }
    return true;
  }

  if (debug.UPGRADES?.airfieldExpansion) {
    debug.UPGRADES.airfieldExpansion.name = 'Усиленная аэродромная служба';
    debug.UPGRADES.airfieldExpansion.description = 'Ускоряет ремонт, заправку и подготовку самолётов на 35%. Вместимость каждого аэродрома уже составляет 12 самолётов.';
  }

  GameClass.prototype.getAirfieldCapacity = function(field) {
    return isAirfield93(field) ? HANGAR_CAPACITY93 : 0;
  };

  GameClass.prototype.getTeamAirFleetState93 = function(teamKey, force = false) {
    const tick = Math.floor((Number(this.time) || 0) * 4);
    const cached = this._teamAirFleetState93?.[teamKey];
    if (!force && cached?.tick === tick) return cached;
    let capacity = 0;
    let queued = 0;
    for (const building of this.buildings) {
      if (!building.alive || building.team !== teamKey) continue;
      if (isAirfield93(building)) capacity += HANGAR_CAPACITY93;
      if (!AIRFIELD_TYPES93.has(building.typeId) || !Array.isArray(building.queue)) continue;
      for (const item of building.queue) {
        if (item?.kind !== 'unit') continue;
        const stats = debug.getUnitStats?.(item.id, this.teams[teamKey]);
        if (isFixedWingStats93(stats, item.id)) queued += 1;
      }
    }
    let aircraft = 0;
    for (const unit of this.units) {
      if (unit.alive && unit.team === teamKey && isFixedWing93(unit)) aircraft += 1;
    }
    const state = { tick, capacity, aircraft, queued, committed: aircraft + queued };
    this._teamAirFleetState93 ||= Object.create(null);
    this._teamAirFleetState93[teamKey] = state;
    return state;
  };

  GameClass.prototype.invalidateTeamAirFleetState93 = function(teamKey = null) {
    if (!this._teamAirFleetState93) return;
    if (teamKey) delete this._teamAirFleetState93[teamKey];
    else this._teamAirFleetState93 = Object.create(null);
  };

  GameClass.prototype.getAirfieldAircraftState93 = function(field) {
    if (!field) return { assigned: [], ready: [], service: [], away: [], hangar: [] };
    const tick = Math.floor((Number(this.time) || 0) * 5);
    const cache = this._airfieldAircraftState93;
    if (cache?.fieldId === field.id && cache.tick === tick) return cache.state;
    const assigned = [];
    for (const unit of this.units) {
      if (unit.alive && unit.team === field.team && isFixedWing93(unit) && unit.airServiceTargetId === field.id) assigned.push(unit);
    }
    const hangar = assigned.filter(isHangarCommand93);
    const ready = hangar.filter(isStoredReady93);
    const service = hangar.filter((unit) => ['return', 'service', 'launch'].includes(unit.currentCommand.stage));
    const away = assigned.filter((unit) => !isHangarCommand93(unit) && !unit.airServiceState);
    const state = { assigned, ready, service, away, hangar };
    this._airfieldAircraftState93 = { fieldId: field.id, tick, state };
    return state;
  };

  GameClass.prototype.getAirfieldOccupancy = function(field, excludeUnitId = null) {
    if (!field) return 0;
    return this.units.filter((unit) => unit.alive && unit.id !== excludeUnitId && isFixedWing93(unit) &&
      unit.airServiceTargetId === field.id).length;
  };

  GameClass.prototype.getAirfieldQueuedAircraft93 = function(field) {
    if (!field || !Array.isArray(field.queue)) return 0;
    return field.queue.filter((item) => {
      if (item?.kind !== 'unit') return false;
      const stats = debug.getUnitStats?.(item.id, this.teams[field.team]);
      return isFixedWingStats93(stats, item.id);
    }).length;
  };

  GameClass.prototype.getAirfieldReadyAircraft93 = function(field) {
    return this.getAirfieldAircraftState93(field).ready;
  };

  GameClass.prototype.getAirfieldServiceAircraft93 = function(field) {
    return this.getAirfieldAircraftState93(field).service;
  };

  GameClass.prototype.getAirfieldAircraftAway93 = function(field) {
    return this.getAirfieldAircraftState93(field).away;
  };

  GameClass.prototype.findOperationalAirfield = function(teamKey, x, y, excludeUnitId = null) {
    const team = this.teams[teamKey];
    const fields = this.buildings.filter((field) => isAirfield93(field) && field.team === teamKey &&
      field.sabotagedUntil <= this.time && this.getAirfieldOccupancy(field, excludeUnitId) < this.getAirfieldCapacity(field));
    if (!fields.length) return null;
    return fields.sort((a, b) => {
      const powerPenalty = team?.powerProduced > 0 && team?.powerFactor >= .38 ? 0 : 700;
      const loadA = this.getAirfieldOccupancy(a, excludeUnitId) / HANGAR_CAPACITY93;
      const loadB = this.getAirfieldOccupancy(b, excludeUnitId) / HANGAR_CAPACITY93;
      return Math.hypot(a.x - x, a.y - y) + powerPenalty + loadA * 620 -
        (Math.hypot(b.x - x, b.y - y) + powerPenalty + loadB * 620);
    })[0] || null;
  };

  GameClass.prototype.getAirHangarPosition93 = function(field, unit, command = unit.currentCommand) {
    const occupied = new Set(this.units.filter((other) => other.alive && other !== unit && isFixedWing93(other) &&
      other.airServiceTargetId === field.id && isHangarCommand93(other) && Number.isInteger(other.currentCommand.slot))
      .map((other) => other.currentCommand.slot));
    let slot = Number.isInteger(command?.slot) ? command.slot : -1;
    if (slot < 0 || slot >= HANGAR_CAPACITY93 || occupied.has(slot)) {
      let hash = 0;
      for (const char of String(unit.id || 'aircraft')) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
      const preferred = hash % HANGAR_CAPACITY93;
      slot = preferred;
      for (let step = 0; step < HANGAR_CAPACITY93; step += 1) {
        const candidate = (preferred + step) % HANGAR_CAPACITY93;
        if (!occupied.has(candidate)) { slot = candidate; break; }
      }
      if (command) command.slot = slot;
    }
    const column = slot % 4;
    const row = Math.floor(slot / 4);
    const localForward = (row - 1) * field.radius * .27;
    const localSide = (column - 1.5) * field.radius * .20;
    const rotation = Number.isFinite(field.rotation) ? field.rotation : (field.team === 'player' ? 0 : Math.PI);
    return {
      x: field.x + Math.cos(rotation) * localForward - Math.sin(rotation) * localSide,
      y: field.y + Math.sin(rotation) * localForward + Math.cos(rotation) * localSide,
      rotation,
      slot
    };
  };

  UnitClass.prototype.requestAirHangar93 = function(reason = 'возврат на базу', preferredField = null, keepCurrentOrders = false) {
    if (!ensureSortieResource93(this) || isHangarCommand93(this)) return false;
    const preferred = typeof preferredField === 'string' ? this.game.getEntity(preferredField) : preferredField;
    const home = this.game.getEntity(this.airServiceTargetId);
    const canReceive = (field) => isAirfield93(field) && field.team === this.team && field.sabotagedUntil <= this.game.time &&
      this.game.getAirfieldOccupancy(field, this.id) < this.game.getAirfieldCapacity(field);
    const field = canReceive(preferred) ? preferred : canReceive(home) ? home :
      this.game.findOperationalAirfield(this.team, this.x, this.y, this.id);
    if (!field) {
      if (this.team === 'player' && this.game.time - (this.airServiceWarningAt || -999) > 8) {
        this.airServiceWarningAt = this.game.time;
        this.game.alert(`${this.stats.name}: все 12 мест на доступных аэродромах заняты`, 'warning', this.x, this.y);
      }
      return false;
    }
    this.airSavedCommands = keepCurrentOrders
      ? this.commandQueue.filter((command) => command?.type !== 'airService' && command?.type !== 'airHangar93').map((command) => ({ ...command }))
      : [];
    this.airServiceState = 'return';
    this.airServiceReason = reason;
    this.airServiceTargetId = field.id;
    this.airServiceTimer = 0;
    this.commandQueue = [{
      type: 'airHangar93',
      airfieldId: field.id,
      stage: 'return',
      reason,
      temporaryService93: Boolean(keepCurrentOrders)
    }];
    this.invalidateNavigation();
    this.game.uiDirty = true;
    if (this.team === 'player') {
      const place = this.game.getAirfieldOccupancy(field) + 1;
      this.game.alert(`${this.stats.name}: возвращается на ${field.stats.name} · место ${place}/12`, 'info', this.x, this.y);
    }
    return true;
  };

  const baseRequestAirService93 = UnitClass.prototype.requestAirService;
  UnitClass.prototype.requestAirService = function(reason = 'боезапас') {
    if (isFixedWing93(this)) {
      // Patrol and guard are persistent missions. An automatic logistics stop must
      // preserve the whole route and relaunch the aircraft after full servicing.
      return this.requestAirHangar93(reason, null, hasPersistentAirMission93(this));
    }
    return baseRequestAirService93.call(this, reason);
  };

  const baseSetCommand93 = UnitClass.prototype.setCommand;
  UnitClass.prototype.setCommand = function(command, append = false) {
    if (isFixedWing93(this) && isHangarCommand93(this) && command?.type !== 'airHangar93') {
      if (!append) this.airSavedCommands = [];
      this.airSavedCommands.push({ ...command });
      this.currentCommand.temporaryService93 = true;
      if (this.currentCommand.stage === 'ready') {
        this.currentCommand.stage = 'launch';
        this.airServiceState = 'launch';
        this.airServiceTimer = 0;
      }
      this.game.uiDirty = true;
      return;
    }
    return baseSetCommand93.call(this, command, append);
  };

  const baseStop93 = UnitClass.prototype.stop;
  UnitClass.prototype.stop = function() {
    if (isFixedWing93(this) && isHangarCommand93(this)) {
      this.airSavedCommands = [];
      this.currentCommand.temporaryService93 = false;
      if (this.currentCommand.stage === 'launch') {
        this.currentCommand.stage = 'return';
        this.airServiceState = 'return';
      }
      this.game.uiDirty = true;
      return;
    }
    return baseStop93.call(this);
  };

  const baseProcessCommand93 = UnitClass.prototype.processCommand;
  UnitClass.prototype.processCommand = function(command, dt) {
    if (command?.type !== 'airHangar93') return baseProcessCommand93.call(this, command, dt);
    if (!ensureSortieResource93(this)) { this.finishCommand(); return; }
    let field = this.game.getEntity(command.airfieldId || this.airServiceTargetId);
    if (!isAirfield93(field) || field.team !== this.team) {
      field = this.game.findOperationalAirfield(this.team, this.x, this.y, this.id);
      if (!field) {
        const resume = this.airSavedCommands.map((saved) => ({ ...saved }));
        this.airSavedCommands = [];
        this.airServiceState = null;
        this.airServiceTargetId = null;
        this.commandQueue = resume;
        this.invalidateNavigation();
        return;
      }
      command.airfieldId = field.id;
      command.stage = 'return';
      delete command.slot;
      this.airServiceTargetId = field.id;
    }

    const pad = this.game.getAirHangarPosition93(field, this, command);
    const runway = pad.rotation;
    if (command.stage === 'return') {
      this.airServiceState = 'return';
      const approachDistance = Math.max(18, this.radius * .72);
      if (this.moveToward(pad.x, pad.y, dt, .95) || Math.hypot(this.x - pad.x, this.y - pad.y) <= approachDistance) {
        command.stage = 'service';
        this.airServiceState = 'servicing';
        this.airServiceTimer = 0;
        this.x = pad.x;
        this.y = pad.y;
        this.rotation = runway;
        this.renderX = pad.x;
        this.renderY = pad.y;
        this.renderRotation = runway;
        this.game.uiDirty = true;
      }
      return;
    }

    if (command.stage === 'service' || command.stage === 'ready') {
      this.airServiceState = 'servicing';
      this.rotation = runway;
      this.x += (pad.x - this.x) * clamp93(dt * 5, 0, 1);
      this.y += (pad.y - this.y) * clamp93(dt * 5, 0, 1);
      const team = this.game.teams[this.team];
      const powered = team?.powerProduced > 0 && team?.powerFactor >= .38;
      const upgrade = team?.upgrades?.has('airfieldExpansion') ? 1.35 : 1;
      const serviceRate = (powered ? 1 : .38) * upgrade;
      this.airServiceTimer += dt * serviceRate;
      this.heal(this.maxHp * .16 * dt * serviceRate);
      this.sortieFuel = Math.min(this.sortieFuelMax, this.sortieFuel + this.sortieFuelMax * .28 * dt * serviceRate);
      if (Number.isFinite(this.airAmmoMax)) this.airAmmo = Math.min(this.airAmmoMax, this.airAmmo + Math.max(1, this.airAmmoMax * .42 * dt * serviceRate));
      if (this.ensureCountermeasures92?.()) {
        this.countermeasureCharges92 = Math.min(this.countermeasureMax92, this.countermeasureCharges92 + 2.8 * dt * serviceRate);
      }
      const fullyReady = this.healthRatio >= .999 && this.sortieFuel >= this.sortieFuelMax * .999 &&
        (this.airAmmoMax <= 0 || this.airAmmo >= this.airAmmoMax - .01) &&
        (!Number.isFinite(this.countermeasureMax92) || this.countermeasureCharges92 >= this.countermeasureMax92 - .01);
      if (command.stage === 'service' && this.airServiceTimer >= 2.4 && fullyReady) {
        this.hp = this.maxHp;
        this.sortieFuel = this.sortieFuelMax;
        this.airAmmo = this.airAmmoMax;
        if (Number.isFinite(this.countermeasureMax92)) this.countermeasureCharges92 = this.countermeasureMax92;
        command.stage = this.airSavedCommands.length ? 'launch' : 'ready';
        this.airServiceState = command.stage === 'launch' ? 'launch' : 'servicing';
        this.game.uiDirty = true;
        if (command.stage === 'ready' && this.team === 'player') {
          this.game.alert(`${this.stats.name}: в ангаре · готовность 100%`, 'info', field.x, field.y);
        }
      } else if (command.stage === 'ready') {
        this.hp = this.maxHp;
        this.sortieFuel = this.sortieFuelMax;
        this.airAmmo = this.airAmmoMax;
        if (Number.isFinite(this.countermeasureMax92)) this.countermeasureCharges92 = this.countermeasureMax92;
        if (this.airSavedCommands.length) {
          command.stage = 'launch';
          this.airServiceState = 'launch';
          this.airServiceTimer = 0;
          this.game.uiDirty = true;
        }
      }
      return;
    }

    this.airServiceState = 'launch';
    const lateral = (pad.slot % 4 - 1.5) * 13;
    const exitDistance = field.radius + 250 + Math.floor(pad.slot / 4) * 18;
    const exitX = field.x + Math.cos(runway) * exitDistance - Math.sin(runway) * lateral;
    const exitY = field.y + Math.sin(runway) * exitDistance + Math.cos(runway) * lateral;
    if (this.moveToward(exitX, exitY, dt, .88) || Math.hypot(this.x - exitX, this.y - exitY) < 26) {
      const mission = this.airSavedCommands.map((saved) => ({ ...saved }));
      this.airSavedCommands = [];
      this.airServiceState = null;
      this.airServiceReason = null;
      this.commandQueue = mission;
      this.invalidateNavigation();
      this.game.uiDirty = true;
      if (this.team === 'player') this.game.alert(`${this.stats.name}: взлёт · ресурс и вооружение 100%`, 'info', this.x, this.y);
    }
  };

  const baseUnitUpdate93 = UnitClass.prototype.update;
  UnitClass.prototype.update = function(dt) {
    if (isFixedWing93(this)) ensureSortieResource93(this);
    const result = baseUnitUpdate93.call(this, dt);
    // A completed point-to-point order is not an order to land. The fixed-wing
    // flight model below this wrapper already enters a safe holding orbit when
    // the queue becomes empty. Logistics still orders a return when fuel,
    // ammunition or hull condition reaches its service threshold.
    return result;
  };

  const baseSpawnUnit93 = BuildingClass.prototype.spawnUnit;
  BuildingClass.prototype.spawnUnit = function(typeId) {
    const before = this.game.units.length;
    const result = baseSpawnUnit93.call(this, typeId);
    const created = this.game.units.slice(before).find((unit) => unit.typeId === typeId && unit.team === this.team);
    if (isAirfield93(this) && isFixedWing93(created)) {
      this.game.invalidateTeamAirFleetState93(this.team);
      created.commandQueue = [];
      created.airSavedCommands = [];
      ensureSortieResource93(created);
      created.sortieFuel = created.sortieFuelMax;
      created.airAmmo = created.airAmmoMax;
      created.hp = created.maxHp;
      if (created.ensureCountermeasures92?.()) created.countermeasureCharges92 = created.countermeasureMax92;
      created.requestAirHangar93('новый самолёт', this, false);
    }
    return result;
  };

  const baseQueueProduction93 = GameClass.prototype.queueProduction;
  GameClass.prototype.queueProduction = function(building, itemId, kind = 'unit', silent = false) {
    if (kind === 'unit' && isAirfield93(building)) {
      const stats = debug.getUnitStats?.(itemId, this.teams[building.team]);
      if (isFixedWingStats93(stats, itemId)) {
        const fleet = this.getTeamAirFleetState93(building.team, true);
        if (fleet.committed >= fleet.capacity) {
          if (!silent && building.team === 'player') {
            const message = fleet.capacity > 0
              ? `Авиапарк заполнен: ${fleet.committed} / ${fleet.capacity}. Постройте дополнительный аэродром для нового самолёта.`
              : 'Для производства самолёта нужен хотя бы один полностью построенный аэродром.';
            this.alert(message, 'warning', building.x, building.y);
          }
          return false;
        }
      }
    }
    const accepted = baseQueueProduction93.call(this, building, itemId, kind, silent);
    if (accepted && kind === 'unit') this.invalidateTeamAirFleetState93(building.team);
    return accepted;
  };

  const baseCancelQueueItem93 = GameClass.prototype.cancelQueueItem;
  GameClass.prototype.cancelQueueItem = function(building, index) {
    const result = baseCancelQueueItem93.call(this, building, index);
    if (building?.team) this.invalidateTeamAirFleetState93(building.team);
    return result;
  };

  const baseUnitDie93 = UnitClass.prototype.die;
  UnitClass.prototype.die = function(...args) {
    const wasFixedWing = isFixedWing93(this);
    const result = baseUnitDie93.apply(this, args);
    if (wasFixedWing) this.game.invalidateTeamAirFleetState93(this.team);
    return result;
  };

  GameClass.prototype.getAirfieldRosterAircraft93 = function(field) {
    return this.getAirfieldAircraftState93(field).hangar.slice().sort((a, b) => {
      const stageOrder = { ready: 0, service: 1, return: 2, launch: 3 };
      const stageA = stageOrder[a.currentCommand?.stage] ?? 9;
      const stageB = stageOrder[b.currentCommand?.stage] ?? 9;
      return stageA - stageB || String(a.stats.name).localeCompare(String(b.stats.name), 'ru') || String(a.id).localeCompare(String(b.id));
    });
  };

  GameClass.prototype.getAircraftReadiness93 = function(unit) {
    const ratios = [unit.healthRatio];
    if (Number.isFinite(unit.sortieFuelMax) && unit.sortieFuelMax > 0) ratios.push(unit.sortieFuel / unit.sortieFuelMax);
    if (Number.isFinite(unit.airAmmoMax) && unit.airAmmoMax > 0) ratios.push(unit.airAmmo / unit.airAmmoMax);
    if (Number.isFinite(unit.countermeasureMax92) && unit.countermeasureMax92 > 0) ratios.push(unit.countermeasureCharges92 / unit.countermeasureMax92);
    return Math.round(clamp93(Math.min(...ratios), 0, 1) * 100);
  };

  GameClass.prototype.getAircraftRosterStatus93 = function(unit) {
    const stage = unit.currentCommand?.stage || 'ready';
    const readiness = this.getAircraftReadiness93(unit);
    if (stage === 'ready') return { stage, short: 'готов 100%', detail: 'готовность 100%' };
    if (stage === 'service') return { stage, short: `сервис ${readiness}%`, detail: `обслуживание · готовность ${readiness}%` };
    if (stage === 'return') return { stage, short: 'посадка', detail: 'заходит на посадку' };
    return { stage: 'launch', short: 'взлёт', detail: 'выполняет взлёт' };
  };

  GameClass.prototype.selectAirRosterUnits93 = function(fieldId, typeId, count = 1, unitId = null) {
    const field = this.getEntity(fieldId);
    if (!isAirfield93(field) || field.team !== 'player') return false;
    const candidates = this.getAirfieldRosterAircraft93(field).filter((unit) => unit.typeId === typeId);
    const selected = unitId ? candidates.filter((unit) => String(unit.id) === String(unitId)) : candidates.slice(0, clamp93(count | 0, 1, candidates.length));
    if (!selected.length) {
      this.alert('Выбранных самолётов сейчас нет на этом аэродроме', 'warning', field.x, field.y);
      return false;
    }
    this.setSelection(selected, false);
    this.updateUI(true);
    this.sound?.click?.();
    this.alert(selected.length === 1
      ? `${selected[0].stats.name}: выбран отдельный борт`
      : `${selected[0].stats.name}: выбрана группа ${selected.length}`, 'info', field.x, field.y);
    return true;
  };

  GameClass.prototype.renderAirfieldRoster93 = function(field) {
    const actionButtons = document.getElementById('action-buttons');
    if (!actionButtons || !isAirfield93(field)) return;
    let roster = actionButtons.querySelector('[data-air-roster93]');
    if (!roster) {
      roster = document.createElement('section');
      roster.className = 'v93-air-roster';
      roster.dataset.airRoster93 = 'true';
      roster.setAttribute('aria-label', 'Состав самолётов выбранного аэродрома');
      actionButtons.prepend(roster);
    }

    this.airRosterSelectionCounts93 ||= new Map();
    const aircraft = this.getAirfieldRosterAircraft93(field);
    const assigned = this.getAirfieldAircraftState93(field).assigned.length;
    const groups = new Map();
    for (const unit of aircraft) {
      if (!groups.has(unit.typeId)) groups.set(unit.typeId, []);
      groups.get(unit.typeId).push(unit);
    }
    const sortedGroups = [...groups.entries()].sort((a, b) => String(a[1][0]?.stats.name).localeCompare(String(b[1][0]?.stats.name), 'ru'));
    const signature = `${field.id}:${assigned}:${aircraft.map((unit) => `${unit.id}:${unit.currentCommand?.stage}:${this.getAircraftReadiness93(unit)}`).join('|')}:${sortedGroups.map(([typeId, units]) => `${typeId}:${this.airRosterSelectionCounts93.get(`${field.id}:${typeId}`) || 1}:${units.length}`).join('|')}`;
    if (roster.dataset.signature93 === signature) return;
    roster.dataset.signature93 = signature;

    const away = this.getAirfieldAircraftState93(field).away.length;
    const heading = `<div class="v93-air-roster-head"><span>СОСТАВ АЭРОДРОМА</span><strong>на аэродроме ${aircraft.length} · на заданиях ${away}</strong></div>`;
    if (!aircraft.length) {
      roster.innerHTML = `${heading}<div class="v93-air-roster-empty">В ангарах сейчас нет самолётов. Назначенные этому аэродрому борта на задании: ${away}.</div>`;
      return;
    }

    const rows = sortedGroups.map(([typeId, units]) => {
      const key = `${field.id}:${typeId}`;
      const requested = clamp93(this.airRosterSelectionCounts93.get(key) || 1, 1, units.length);
      this.airRosterSelectionCounts93.set(key, requested);
      const ready = units.filter(isStoredReady93).length;
      const service = units.length - ready;
      const chips = units.map((unit, index) => {
        const status = this.getAircraftRosterStatus93(unit);
        return `<button type="button" class="v93-air-unit-chip" data-air-unit93="${escapeHTML93(unit.id)}" data-air-type93="${escapeHTML93(typeId)}" data-air-stage93="${status.stage}" title="${escapeHTML93(`${unit.stats.name} · борт ${String(index + 1).padStart(2, '0')} · ${status.detail}. Нажмите, чтобы выбрать только этот самолёт.`)}">Борт ${String(index + 1).padStart(2, '0')} · ${escapeHTML93(status.short)}</button>`;
      }).join('');
      return `<div class="v93-air-type" data-air-roster-type93="${escapeHTML93(typeId)}"><div class="v93-air-type-name"><strong>${escapeHTML93(`${units[0].stats.icon || '✈'} ${units[0].stats.name}`)}</strong><small>всего ${units.length} · готово ${ready}${service ? ` · обслуживание/манёвр ${service}` : ''}</small></div><div class="v93-air-quantity"><button type="button" data-air-quantity93="-1" data-air-type93="${escapeHTML93(typeId)}" aria-label="Уменьшить количество">−</button><output data-air-count93="${escapeHTML93(typeId)}">${requested}/${units.length}</output><button type="button" data-air-quantity93="1" data-air-type93="${escapeHTML93(typeId)}" aria-label="Увеличить количество">+</button><button type="button" data-air-select-type93="${escapeHTML93(typeId)}">Выбрать ${requested}</button><button type="button" data-air-select-all93="${escapeHTML93(typeId)}">Все</button></div><div class="v93-air-unit-list">${chips}</div></div>`;
    }).join('');
    roster.innerHTML = `${heading}<div class="v93-air-type-list">${rows}</div>`;

    for (const button of roster.querySelectorAll('[data-air-quantity93]')) {
      button.addEventListener('click', () => {
        const typeId = button.dataset.airType93;
        const group = groups.get(typeId) || [];
        if (!group.length) return;
        const key = `${field.id}:${typeId}`;
        const next = clamp93((this.airRosterSelectionCounts93.get(key) || 1) + Number(button.dataset.airQuantity93), 1, group.length);
        this.airRosterSelectionCounts93.set(key, next);
        roster.dataset.signature93 = '';
        this.renderAirfieldRoster93(field);
      });
    }
    for (const button of roster.querySelectorAll('[data-air-select-type93]')) {
      button.addEventListener('click', () => {
        const typeId = button.dataset.airSelectType93;
        this.selectAirRosterUnits93(field.id, typeId, this.airRosterSelectionCounts93.get(`${field.id}:${typeId}`) || 1);
      });
    }
    for (const button of roster.querySelectorAll('[data-air-select-all93]')) {
      button.addEventListener('click', () => {
        const typeId = button.dataset.airSelectAll93;
        const count = groups.get(typeId)?.length || 0;
        if (count) this.selectAirRosterUnits93(field.id, typeId, count);
      });
    }
    for (const button of roster.querySelectorAll('[data-air-unit93]')) {
      button.addEventListener('click', () => this.selectAirRosterUnits93(field.id, button.dataset.airType93, 1, button.dataset.airUnit93));
    }
  };

  const baseRefreshActionUI93 = GameClass.prototype.refreshActionUI;
  GameClass.prototype.refreshActionUI = function(primary) {
    const result = baseRefreshActionUI93.call(this, primary);
    document.getElementById('action-panel')?.classList.toggle('v93-airfield-layout', isAirfield93(primary));
    if (isAirfield93(primary)) {
      const fleet = this.getTeamAirFleetState93(primary.team);
      const actionTitle = document.getElementById('action-title');
      if (actionTitle) actionTitle.textContent = `Аэродром · авиапарк ${fleet.committed}/${fleet.capacity}`;
      this.renderAirfieldRoster93(primary);
      if (fleet.committed >= fleet.capacity) {
        for (const button of document.querySelectorAll('#action-buttons [data-action-kind="unit"]')) {
          const stats = debug.getUnitStats?.(button.dataset.typeId, this.teams.player);
          if (isFixedWingStats93(stats, button.dataset.typeId)) {
            button.disabled = true;
            button.title = `${stats.role}\nАвиапарк заполнен: ${fleet.committed}/${fleet.capacity}. Для нового самолёта постройте дополнительный аэродром.`;
          }
        }
      }
    }
    return result;
  };

  GameClass.prototype.selectAirWing93 = function(field) {
    const ready = this.getAirfieldReadyAircraft93(field);
    if (!ready.length) {
      this.alert('На этом аэродроме пока нет самолётов с готовностью 100%', 'warning', field.x, field.y);
      return false;
    }
    this.setSelection(ready, false);
    this.updateUI(true);
    this.alert(`Авиагруппа выбрана: ${ready.length}. Укажите цель или маршрут — самолёты сразу начнут взлёт`, 'info', field.x, field.y);
    return true;
  };

  GameClass.prototype.issueAirReturn93 = function() {
    const aircraft = this.getSelectedUnits().filter(isFixedWing93);
    let accepted = 0;
    for (const unit of aircraft) {
      if (isHangarCommand93(unit)) {
        const command = unit.currentCommand;
        const wasTemporary = Boolean(command.temporaryService93 || unit.airSavedCommands.length || command.stage === 'launch');
        if (!wasTemporary) continue;
        unit.airSavedCommands = [];
        command.temporaryService93 = false;
        command.reason = 'приказ на возвращение';
        unit.airServiceReason = command.reason;
        if (command.stage === 'launch') {
          command.stage = 'return';
          unit.airServiceState = 'return';
          unit.airServiceTimer = 0;
          delete command.slot;
        }
        unit.invalidateNavigation();
        unit.game.uiDirty = true;
        accepted += 1;
      } else if (unit.requestAirHangar93('приказ на возвращение', null, false)) accepted += 1;
    }
    if (accepted) this.updateUI(true);
    if (accepted) this.alert(`Возврат на базу: ${accepted} самолётов · задания отменены`, 'info');
    return accepted;
  };

  GameClass.prototype.ensureAirbaseCommandButtons93 = function() {
    const commandButtons = document.getElementById('command-buttons');
    if (!commandButtons) return;
    const primary = this.getPrimarySelection?.();
    const field = this.selected?.length === 1 && primary?.kind === 'building' && primary.team === 'player' && isAirfield93(primary) ? primary : null;
    let wingButton = commandButtons.querySelector('[data-air-wing93]');
    if (!field) wingButton?.remove();
    else {
      if (!wingButton || wingButton.dataset.fieldId !== String(field.id)) {
        wingButton?.remove();
        wingButton = document.createElement('button');
        wingButton.type = 'button';
        wingButton.className = 'action-button command-button';
        wingButton.dataset.airWing93 = 'true';
        wingButton.dataset.fieldId = field.id;
        wingButton.addEventListener('click', () => {
          const liveField = this.getEntity(wingButton.dataset.fieldId);
          if (liveField) this.selectAirWing93(liveField);
        });
        commandButtons.prepend(wingButton);
      }
      const ready = this.getAirfieldReadyAircraft93(field).length;
      wingButton.disabled = ready === 0;
      wingButton.textContent = `✈ · Авиагруппа ${ready}/12`;
      wingButton.title = ready ? `Выбрать ${ready} полностью готовых самолётов. Затем укажите цель или маршрут.` : 'Нет полностью готовых самолётов';
    }

    const selectedFixed = this.getSelectedUnits?.().filter(isFixedWing93) || [];
    const returning = selectedFixed.filter((unit) => !isHangarCommand93(unit) ||
      unit.currentCommand.temporaryService93 || unit.airSavedCommands.length || unit.currentCommand.stage === 'launch');
    let returnButton = commandButtons.querySelector('[data-air-return93]');
    if (!selectedFixed.length) returnButton?.remove();
    else {
      if (!returnButton) {
        returnButton = document.createElement('button');
        returnButton.type = 'button';
        returnButton.className = 'action-button command-button';
        returnButton.dataset.airReturn93 = 'true';
        returnButton.addEventListener('click', () => this.issueAirReturn93());
        commandButtons.appendChild(returnButton);
      }
      returnButton.disabled = returning.length === 0;
      returnButton.textContent = returning.length ? `⌂ · На аэродром · ${returning.length}` : '⌂ · Уже в ангарах';
      returnButton.title = 'Ручной возврат: отменить патруль или охрану и оставить самолёты на аэродроме после обслуживания';
    }
  };

  const baseRenderSelectionUI93 = GameClass.prototype.renderSelectionUI;
  GameClass.prototype.renderSelectionUI = function(...args) {
    const result = baseRenderSelectionUI93.apply(this, args);
    const primary = this.selected?.length === 1 ? this.selected[0] : null;
    const details = document.getElementById('selection-details');
    if (primary?.kind === 'building' && isAirfield93(primary) && details) {
      const oldCapacity = details.querySelector('.v76-airfield-capacity');
      if (oldCapacity) {
        const expansion = oldCapacity.nextElementSibling;
        oldCapacity.remove();
        if (expansion?.textContent?.includes('Расширение')) expansion.remove();
      }
      details.querySelector('[data-airbase93]')?.remove();
      const ready = this.getAirfieldReadyAircraft93(primary).length;
      const service = this.getAirfieldServiceAircraft93(primary).length;
      const away = this.getAirfieldAircraftAway93(primary).length;
      const queued = this.getAirfieldQueuedAircraft93(primary);
      const fleet = this.getTeamAirFleetState93(primary.team);
      const accelerated = this.teams[primary.team]?.upgrades?.has('airfieldExpansion');
      const free = Math.max(0, fleet.capacity - fleet.committed);
      details.insertAdjacentHTML('beforeend', `<div data-airbase93><div class="stat-line v93-airbase-ready"><span>В ангарах · готовность 100%</span><strong>${ready} / 12</strong></div><div class="stat-line v93-airbase-service"><span>Посадка / взлёт / обслуживание / производство</span><strong>${service + queued}</strong></div><div class="stat-line v93-airbase-away"><span>На боевых заданиях</span><strong>${away}</strong></div><div class="stat-line v93-fleet-capacity${free === 0 ? ' is-full' : ''}"><span>Общий авиапарк</span><strong>${fleet.committed} / ${fleet.capacity} · свободно ${free}</strong></div><div class="stat-line"><span>Аэродромная служба</span><strong>${accelerated ? 'ускоренная +35%' : 'штатная'}</strong></div></div>`);
    } else if (primary?.kind === 'unit' && isFixedWing93(primary) && details) {
      const priceLine = [...details.querySelectorAll('.stat-line')].find((line) => line.querySelector('span')?.textContent === 'Цена пополнения');
      if (priceLine) priceLine.innerHTML = '<span>Подготовка в ангаре</span><strong>полное пополнение</strong>';
      const badge = [...details.querySelectorAll('.air-service-badge')].find((line) => line.querySelector('span')?.textContent === 'Авиационная логистика');
      if (badge && isStoredReady93(primary)) badge.querySelector('strong').textContent = 'в ангаре · готовность 100%';
      else if (badge && isHangarCommand93(primary) && primary.currentCommand.temporaryService93 && primary.airSavedCommands.length) {
        const mission = primary.airSavedCommands.some((command) => command.type === 'guard') ? 'охрана' : 'патруль';
        badge.querySelector('strong').textContent = `обслуживание · затем ${mission}`;
      }
    }
    this.ensureAirbaseCommandButtons93();
    return result;
  };

  const baseDrawAirUnit93 = GameClass.prototype.drawAirUnit3D;
  GameClass.prototype.drawAirUnit3D = function(unit) {
    if (isStoredReady93(unit)) return;
    return baseDrawAirUnit93.call(this, unit);
  };

  const baseHitTest93 = GameClass.prototype.hitTest;
  GameClass.prototype.hitTest = function(...args) {
    const hit = baseHitTest93.apply(this, args);
    if (isStoredReady93(hit)) {
      const field = this.getEntity(hit.airServiceTargetId);
      if (field?.alive) return field;
    }
    return hit;
  };

  const eyebrow93 = document.querySelector('#start-screen .eyebrow');
  if (eyebrow93) eyebrow93.textContent = 'ОРИГИНАЛЬНАЯ БРАУЗЕРНАЯ RTS · v9.3';
  const lead93 = document.querySelector('#start-screen .lead');
  if (lead93) {
    lead93.textContent = lead93.textContent
      .replace('В v7.7 тактические', 'Тактические')
      .replace('аэродромы обслуживают 6 самолётов одновременно с расширением до 12', 'каждый аэродром хранит в ангарах до 12 полностью готовых самолётов');
  }
  const featureStrip93 = document.querySelector('#start-screen .feature-strip');
  const legacyAirfieldFeature93 = [...(featureStrip93?.querySelectorAll('span') || [])].find((span) => span.textContent.includes('Аэродромы 6→12'));
  if (legacyAirfieldFeature93) legacyAirfieldFeature93.textContent = 'Аэродромы: 12 самолётов';
  if (featureStrip93 && !featureStrip93.querySelector('[data-airbase93-feature]')) {
    featureStrip93.insertAdjacentHTML('beforeend', '<span data-airbase93-feature>Авиагруппы из ангаров</span><span data-airbase93-feature>Полная подготовка к вылету</span>');
  }

  window.__FD_AIRBASE__ = {
    version: '9.3.2',
    capacity: HANGAR_CAPACITY93,
    minSortieResource: MIN_SORTIE_RESOURCE93,
    get game() { return debug.game; },
    getAirfieldState(fieldId) {
      const game = debug.game;
      const field = game?.getEntity(fieldId);
      if (!field) return null;
      return {
        capacity: game.getAirfieldCapacity(field),
        occupied: game.getAirfieldOccupancy(field),
        ready: game.getAirfieldReadyAircraft93(field).length,
        servicing: game.getAirfieldServiceAircraft93(field).length,
        away: game.getAirfieldAircraftAway93(field).length,
        queued: game.getAirfieldQueuedAircraft93(field),
        roster: game.getAirfieldRosterAircraft93(field).map((unit) => ({
          id: unit.id,
          typeId: unit.typeId,
          name: unit.stats.name,
          stage: unit.currentCommand?.stage,
          readiness: game.getAircraftReadiness93(unit)
        })),
        fleet: game.getTeamAirFleetState93(field.team, true)
      };
    }
  };

})();
