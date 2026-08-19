(() => {
  'use strict';

  const root = globalThis;
  const D = root.__FD_DEBUG__;
  const Game = D?.Game;
  const Unit = D?.Unit;
  if (!Game?.prototype || !Unit?.prototype || root.__FD_GAMEPLAY_RELIABILITY_199__) return;

  const VERSION = '16.8.15';
  const BUILD = 199;
  const state = {
    loadOrders: 0,
    nearbyLoads: 0,
    embarked: 0,
    unloaded: 0,
    rejectedCargo: 0,
    completedRefits: 0,
    normalizedRefits: 0,
    lastTransportType: null,
    lastRefit: null,
  };

  const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const isTransport = unit => Boolean(
    unit?.alive !== false && unit?.kind === 'unit' && finite(unit?.stats?.transportCapacity) > 0,
  );
  const cargoCost = unit => {
    if (!unit) return Infinity;
    if (unit.infantry || unit.typeId === 'worker') return 1;
    const role = String(unit.stats?.visualRole || unit.stats?.role || unit.typeId || '').toLowerCase();
    if (/artillery|howitzer|aa|sam|missile|heavy|mbt|tank/.test(role)) return 8;
    return 5;
  };
  const canCarry = (transport, unit) => {
    if (!isTransport(transport) || !unit?.alive || unit.kind !== 'unit') return false;
    if (unit === transport || unit.team !== transport.team || unit.embarkedIn || isTransport(unit) || unit.air) return false;
    if (transport.stats?.transportRule === 'infantry') return Boolean(unit.infantry || unit.typeId === 'worker');
    return true;
  };
  const ensureTransport = transport => {
    if (!Array.isArray(transport.transportCargoIds)) transport.transportCargoIds = [];
    transport.transportCargoIds = [...new Set(transport.transportCargoIds)].filter(id => {
      const unit = transport.game?.getEntity?.(id);
      return Boolean(unit?.alive && unit.embarkedIn === transport.id);
    });
    transport.transportCapacity = finite(transport.stats?.transportCapacity, finite(transport.transportCapacity));
    return transport;
  };
  const usedCapacity = (game, transport) => {
    ensureTransport(transport);
    return transport.transportCargoIds.reduce((sum, id) => sum + cargoCost(game.getEntity?.(id)), 0);
  };
  const dockingDistance = (transport, unit) => Math.max(54, finite(transport.radius, 20) + finite(unit.radius, 14) + 28);

  const clearPassengerCommand = unit => {
    try { unit.finishCommand?.(); } catch (_) {}
    unit.currentCommand = null;
    if (Array.isArray(unit.commandQueue)) unit.commandQueue.length = 0;
    unit.target = null;
    unit.targetId = null;
  };

  const embark = (game, transport, unit) => {
    if (!canCarry(transport, unit)) return false;
    ensureTransport(transport);
    const weight = cargoCost(unit);
    const capacity = finite(transport.stats?.transportCapacity, transport.transportCapacity);
    if (usedCapacity(game, transport) + weight > capacity) {
      state.rejectedCargo += 1;
      return false;
    }
    clearPassengerCommand(unit);
    unit._fdTransportOriginal199 = {
      air: Boolean(unit.air),
      vision: finite(unit.vision, finite(unit.stats?.vision)),
      detector: finite(unit.detector, finite(unit.stats?.detector)),
    };
    unit.embarkedIn = transport.id;
    unit.inTransport = true;
    unit.selected = false;
    unit.air = false;
    unit.vision = 0;
    unit.detector = 0;
    unit.x = transport.x;
    unit.y = transport.y;
    unit.renderX = transport.renderX ?? transport.x;
    unit.renderY = transport.renderY ?? transport.y;
    if (!transport.transportCargoIds.includes(unit.id)) transport.transportCargoIds.push(unit.id);
    game.selected = (game.selected || []).filter(entity => entity !== unit && !entity?.embarkedIn);
    try { game.spatial?.remove?.(unit); } catch (_) {}
    state.embarked += 1;
    state.lastTransportType = transport.typeId;
    game.uiDirty = true;
    return true;
  };

  const restorePassenger = (game, transport, unit, index, reserved) => {
    const angle = finite(transport.rotation) + Math.PI * 2 * (index / Math.max(1, transport.transportCargoIds.length));
    const distance = finite(transport.radius, 24) + finite(unit.radius, 14) + 32 + Math.floor(index / 8) * 34;
    const desired = {
      x: transport.x + Math.cos(angle) * distance,
      y: transport.y + Math.sin(angle) * distance,
    };
    let spot = desired;
    try { spot = game.findReachablePoint?.(desired.x, desired.y, finite(unit.radius, 14), reserved) || desired; } catch (_) {}
    const original = unit._fdTransportOriginal199 || {};
    unit.embarkedIn = null;
    unit.inTransport = false;
    unit.air = original.air ?? Boolean(unit.stats?.air);
    unit.vision = finite(original.vision, finite(unit.stats?.vision));
    unit.detector = finite(original.detector, finite(unit.stats?.detector));
    unit.x = spot.x;
    unit.y = spot.y;
    unit.renderX = spot.x;
    unit.renderY = spot.y;
    unit.rotation = finite(transport.rotation);
    unit.renderRotation = finite(transport.rotation);
    clearPassengerCommand(unit);
    delete unit._fdTransportOriginal199;
    reserved.push({ x: spot.x, y: spot.y, r: finite(unit.radius, 14) });
    try { game.spatial?.update?.(unit, 'units'); } catch (_) {}
    state.unloaded += 1;
    return true;
  };

  Unit.prototype.ensureTransport78 = function ensureTransport199() {
    if (isTransport(this)) ensureTransport(this);
    return this;
  };

  Game.prototype.loadIntoTransport78 = function loadNearbyTransport199(transport, candidates = null) {
    if (!isTransport(transport)) return 0;
    ensureTransport(transport);
    const radius = Math.max(220, finite(transport.radius, 24) * 8);
    const pool = (candidates || this.units || [])
      .filter(unit => canCarry(transport, unit))
      .sort((left, right) => Math.hypot(left.x - transport.x, left.y - transport.y) - Math.hypot(right.x - transport.x, right.y - transport.y));
    let loaded = 0;
    for (const unit of pool) {
      if (Math.hypot(unit.x - transport.x, unit.y - transport.y) > radius) continue;
      if (!embark(this, transport, unit)) continue;
      loaded += 1;
    }
    if (loaded) {
      state.nearbyLoads += 1;
      this.rebuildSpatialIndexes?.();
      this.addEffect?.({ type: 'text', x: transport.x, y: transport.y, text: `Погружено: ${loaded}`, color: '#b9e7c8', duration: 1 });
    } else this.alert?.('Рядом нет подходящих юнитов или транспорт заполнен', 'warning');
    return loaded;
  };

  Game.prototype.issueLoadTransport95 = function issueLoadTransport199(transport, units = null, append = false) {
    if (!isTransport(transport) || transport.team !== 'player') return false;
    ensureTransport(transport);
    const selected = (units || this.getSelectedUnits?.() || []).filter(unit => canCarry(transport, unit));
    if (!selected.length) {
      this.alert?.('Этот транспорт не подходит выбранным юнитам', 'warning');
      return false;
    }
    let accepted = 0;
    let reserved = usedCapacity(this, transport);
    for (const unit of selected) {
      const weight = cargoCost(unit);
      if (reserved + weight > finite(transport.stats?.transportCapacity)) continue;
      reserved += weight;
      const distance = Math.hypot(unit.x - transport.x, unit.y - transport.y);
      if (distance <= dockingDistance(transport, unit)) {
        if (embark(this, transport, unit)) accepted += 1;
        continue;
      }
      const command = {
        type: 'loadTransport',
        transportId: transport.id,
        targetId: transport.id,
        x: transport.x,
        y: transport.y,
        issuedAt: finite(this.time),
      };
      if (typeof unit.setCommand === 'function') unit.setCommand(command, Boolean(append));
      else {
        if (!append) unit.commandQueue = [];
        unit.currentCommand = command;
      }
      accepted += 1;
    }
    if (!accepted) {
      this.alert?.('В транспорте нет места для выбранной группы', 'warning');
      return false;
    }
    state.loadOrders += 1;
    state.lastTransportType = transport.typeId;
    this.uiDirty = true;
    return true;
  };

  Game.prototype.loadSelectedTransports78 = function loadSelectedTransports199() {
    const transports = (this.getSelectedUnits?.() || []).filter(isTransport);
    if (!transports.length) return false;
    let issued = false;
    for (const transport of transports) {
      const radius = Math.max(220, finite(transport.radius, 24) * 8);
      const candidates = (this.units || []).filter(unit => canCarry(transport, unit) && Math.hypot(unit.x - transport.x, unit.y - transport.y) <= radius);
      if (candidates.length && this.issueLoadTransport95(transport, candidates, false) !== false) issued = true;
    }
    return issued;
  };

  Game.prototype.unloadTransport78 = function unloadTransport199(transport) {
    if (!isTransport(transport)) return 0;
    ensureTransport(transport);
    const ids = [...transport.transportCargoIds];
    const reserved = [];
    let unloaded = 0;
    for (let index = 0; index < ids.length; index += 1) {
      const unit = this.getEntity?.(ids[index]);
      if (!unit?.alive || unit.embarkedIn !== transport.id) continue;
      if (restorePassenger(this, transport, unit, index, reserved)) unloaded += 1;
    }
    transport.transportCargoIds = transport.transportCargoIds.filter(id => this.getEntity?.(id)?.embarkedIn === transport.id);
    if (unloaded) {
      this.rebuildSpatialIndexes?.();
      this.addEffect?.({ type: 'text', x: transport.x, y: transport.y, text: `Высажено: ${unloaded}`, color: '#d8e9a8', duration: 1 });
      this.uiDirty = true;
    } else this.alert?.('Транспорт пуст или нет места для выгрузки', 'info');
    return unloaded;
  };

  Game.prototype.unloadSelectedTransports78 = function unloadSelectedTransports199() {
    let total = 0;
    for (const transport of (this.getSelectedUnits?.() || []).filter(isTransport)) total += this.unloadTransport78(transport);
    return total;
  };

  const baseUnitUpdate = Unit.prototype.update;
  if (typeof baseUnitUpdate === 'function') {
    Unit.prototype.update = function transportCommandUpdate199(dt, ...rest) {
      if (this.embarkedIn) {
        const transport = this.game?.getEntity?.(this.embarkedIn);
        if (transport?.alive) {
          this.x = transport.x;
          this.y = transport.y;
          this.renderX = transport.renderX ?? transport.x;
          this.renderY = transport.renderY ?? transport.y;
          return;
        }
        this.embarkedIn = null;
        this.inTransport = false;
        this.air = Boolean(this.stats?.air);
        this.vision = finite(this.stats?.vision);
        this.detector = finite(this.stats?.detector);
      }
      const result = baseUnitUpdate.call(this, dt, ...rest);
      const command = this.currentCommand;
      if (command?.type === 'loadTransport') {
        const transport = this.game?.getEntity?.(command.transportId || command.targetId);
        if (!isTransport(transport) || !canCarry(transport, this)) {
          clearPassengerCommand(this);
        } else if (Math.hypot(this.x - transport.x, this.y - transport.y) <= dockingDistance(transport, this)) {
          embark(this.game, transport, this);
          this.game?.rebuildSpatialIndexes?.();
        } else {
          command.x = transport.x;
          command.y = transport.y;
          command.targetX = transport.x;
          command.targetY = transport.y;
        }
      }
      return result;
    };
  }

  const baseApplyModification = Game.prototype.applyUnitModification;
  if (typeof baseApplyModification === 'function') {
    Game.prototype.applyUnitModification = function reliableUnitModification199(unit, variantKey, silent = false) {
      const beforeType = unit?.typeId || null;
      const result = baseApplyModification.call(this, unit, variantKey, silent);
      if (result === false || !unit?.alive || unit.typeId === beforeType) return result;
      const stats = unit.stats || D.getUnitStats?.(unit.typeId, this.teams?.[unit.team]) || D.UNIT_TYPES?.[unit.typeId];
      if (stats) {
        unit.stats = stats;
        unit.radius = finite(stats.radius, unit.radius);
        unit.armor = stats.armor || unit.armor;
        unit.vision = finite(stats.vision, unit.vision);
        unit.detector = finite(stats.detector);
        unit.air = Boolean(stats.air);
        unit.infantry = Boolean(stats.infantry);
        unit.vehicle = Boolean(stats.vehicle);
        unit.speed = finite(stats.speed, unit.speed);
        if (Number.isFinite(stats.transportCapacity)) {
          unit.transportCapacity = stats.transportCapacity;
          ensureTransport(unit);
        } else {
          unit.transportCapacity = 0;
          if (Array.isArray(unit.transportCargoIds) && unit.transportCargoIds.length) {
            for (const id of [...unit.transportCargoIds]) {
              const passenger = this.getEntity?.(id);
              if (passenger?.alive) restorePassenger(this, unit, passenger, 0, []);
            }
            unit.transportCargoIds.length = 0;
          }
        }
      }
      this.rebuildSpatialIndexes?.();
      this.recalculatePower?.();
      this.uiDirty = true;
      state.completedRefits += 1;
      state.normalizedRefits += 1;
      state.lastRefit = { id: unit.id, beforeType, afterType: unit.typeId, variant: variantKey };
      return true;
    };
  }

  root.__FD_GAMEPLAY_RELIABILITY_199__ = {
    version: VERSION,
    build: BUILD,
    state,
    isTransport,
    canCarry,
    cargoCost,
    usedCapacity: transport => usedCapacity(D?.game || transport?.game, transport),
    embark: (transport, unit) => embark(D?.game || transport?.game, transport, unit),
  };
})();
