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
    if (/artillery|howitzer|anti.?air|\baa\b|\bsam\b|missile|heavy|mbt|tank/.test(role)) return 8;
    return 5;
  };
  const canCarry = (transport, unit) => {
    if (!isTransport(transport) || !unit?.alive || unit.kind !== 'unit') return false;
    if (unit === transport || unit.team !== transport.team || unit.embarkedIn || isTransport(unit) || unit.air) return false;
    if (transport.stats?.transportRule === 'infantry') return Boolean(unit.infantry || unit.typeId === 'worker');
    return true;
  };

  const ensureTransport = transport => {
    if (!transport) return transport;
    if (!Array.isArray(transport.transportCargoIds)) transport.transportCargoIds = [];
    const game = transport.game;
    transport.transportCargoIds = [...new Set(transport.transportCargoIds)].filter(id => {
      const unit = game?.getEntity?.(id);
      return Boolean(unit?.alive && unit.embarkedIn === transport.id);
    });
    transport.transportCapacity = finite(transport.stats?.transportCapacity, finite(transport.transportCapacity));
    return transport;
  };
  const reservations = transport => {
    if (!(transport?._cargoReservations95 instanceof Map)) transport._cargoReservations95 = new Map();
    const game = transport.game;
    for (const [unitId] of transport._cargoReservations95) {
      const unit = game?.getEntity?.(unitId);
      const active = unit?.alive && !unit.embarkedIn && unit.commandQueue?.some?.(
        command => command?.type === 'loadTransport' && command.transportId === transport.id,
      );
      if (!active) transport._cargoReservations95.delete(unitId);
    }
    return transport._cargoReservations95;
  };
  const usedCapacity = (game, transport) => {
    ensureTransport(transport);
    return transport.transportCargoIds.reduce((sum, id) => sum + cargoCost(game?.getEntity?.(id)), 0);
  };
  const reservedCapacity = transport => [...reservations(transport).values()].reduce((sum, value) => sum + finite(value), 0);
  const freeCapacity = (game, transport) => Math.max(
    0,
    finite(transport.stats?.transportCapacity, transport.transportCapacity) - usedCapacity(game, transport) - reservedCapacity(transport),
  );
  const boardingRange = (transport, unit) => Math.max(
    56,
    finite(transport.radius, 20) + finite(unit.radius, 14) + (transport.air ? 30 : 18),
  );

  const clearPassengerCommand = unit => {
    unit.currentCommand = null;
    if (Array.isArray(unit.commandQueue)) unit.commandQueue.length = 0;
    unit.target = null;
    unit.targetId = null;
    try { unit.invalidateNavigation?.(); } catch (_) {}
  };
  const releaseReservation = (transport, unitId) => {
    try { reservations(transport).delete(unitId); } catch (_) {}
  };

  const embark = (game, transport, unit) => {
    if (!canCarry(transport, unit)) return false;
    ensureTransport(transport);
    const weight = cargoCost(unit);
    const map = reservations(transport);
    const ownReservation = finite(map.get(unit.id));
    const available = freeCapacity(game, transport) + ownReservation;
    if (!Number.isFinite(weight) || weight > available) {
      state.rejectedCargo += 1;
      releaseReservation(transport, unit.id);
      return false;
    }

    releaseReservation(transport, unit.id);
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
    game.renderSnapshotDirty = true;
    return true;
  };

  const restorePassenger = (game, transport, unit, index, reserved) => {
    const count = Math.max(1, transport.transportCargoIds?.length || 1);
    const angle = finite(transport.rotation) + Math.PI * 2 * (index / count);
    const distance = finite(transport.radius, 24) + finite(unit.radius, 14) + 34 + Math.floor(index / 8) * 36;
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

  const issueBoarding = (game, transport, units, append = false) => {
    if (!isTransport(transport) || transport.team !== 'player') return 0;
    ensureTransport(transport);
    const map = reservations(transport);
    const candidates = [...new Set(units || [])]
      .filter(unit => canCarry(transport, unit))
      .sort((left, right) => Math.hypot(left.x - transport.x, left.y - transport.y) - Math.hypot(right.x - transport.x, right.y - transport.y));
    let available = freeCapacity(game, transport);
    let accepted = 0;
    let sequence = 0;

    for (const unit of candidates) {
      const alreadyQueued = unit.commandQueue?.some?.(
        command => command?.type === 'loadTransport' && command.transportId === transport.id,
      );
      if (alreadyQueued) {
        accepted += 1;
        continue;
      }
      const weight = cargoCost(unit);
      if (!Number.isFinite(weight) || weight > available) continue;
      available -= weight;

      const distance = Math.hypot(unit.x - transport.x, unit.y - transport.y);
      if (distance <= boardingRange(transport, unit)) {
        map.set(unit.id, weight);
        if (embark(game, transport, unit)) accepted += 1;
        continue;
      }

      const hash = [...String(unit.id)].reduce(
        (value, char) => Math.imul(value ^ char.charCodeAt(0), 16777619),
        2166136261,
      ) >>> 0;
      const command = {
        type: 'loadTransport',
        transportId: transport.id,
        targetId: transport.id,
        cargoCost95: weight,
        approachAngle95: (hash % 6283) / 1000 + sequence * 0.61,
        issuedAt95: finite(game.time),
        issuedAt199: finite(game.time),
      };
      if (typeof unit.setCommand === 'function') unit.setCommand(command, Boolean(append));
      else {
        if (!Array.isArray(unit.commandQueue)) unit.commandQueue = [];
        if (!append) unit.commandQueue.length = 0;
        unit.commandQueue.push(command);
      }
      map.set(unit.id, weight);
      accepted += 1;
      sequence += 1;
    }

    if (accepted) {
      state.loadOrders += 1;
      state.lastTransportType = transport.typeId;
      game.uiDirty = true;
      game.renderSnapshotDirty = true;
    }
    return accepted;
  };

  const baseUnitSerialize = Unit.prototype.serialize;
  if (typeof baseUnitSerialize === 'function') {
    Unit.prototype.serialize = function serializeTransport199() {
      const data = baseUnitSerialize.call(this);
      if (this.embarkedIn) data.embarkedIn = this.embarkedIn;
      if (isTransport(this)) data.transportCargoIds = [...ensureTransport(this).transportCargoIds];
      return data;
    };
  }

  const baseHydrate = Game.prototype.hydrate;
  if (typeof baseHydrate === 'function') {
    Game.prototype.hydrate = function hydrateTransport199(data) {
      const result = baseHydrate.call(this, data);
      const saved = new Map((data?.entities || []).filter(entity => entity?.kind === 'unit').map(entity => [entity.id, entity]));
      for (const unit of this.units || []) {
        const raw = saved.get(unit.id) || {};
        if (raw.embarkedIn) unit.embarkedIn = raw.embarkedIn;
        if (Array.isArray(raw.transportCargoIds)) unit.transportCargoIds = [...raw.transportCargoIds];
      }
      for (const transport of (this.units || []).filter(isTransport)) ensureTransport(transport);
      for (const unit of this.units || []) {
        if (!unit.embarkedIn) continue;
        const transport = this.getEntity?.(unit.embarkedIn);
        if (!isTransport(transport)) {
          unit.embarkedIn = null;
          unit.inTransport = false;
          unit.air = Boolean(unit.stats?.air);
          unit.vision = finite(unit.stats?.vision);
          unit.detector = finite(unit.stats?.detector);
          continue;
        }
        ensureTransport(transport);
        if (!transport.transportCargoIds.includes(unit.id)) transport.transportCargoIds.push(unit.id);
        unit.inTransport = true;
        unit.selected = false;
        unit.air = false;
        unit.vision = 0;
        unit.detector = 0;
        unit.x = transport.x;
        unit.y = transport.y;
        unit.renderX = transport.renderX ?? transport.x;
        unit.renderY = transport.renderY ?? transport.y;
      }
      this.selected = (this.selected || []).filter(entity => !entity?.embarkedIn);
      return result;
    };
  }

  Unit.prototype.ensureTransport78 = function ensureTransport199() {
    if (isTransport(this)) ensureTransport(this);
    return this;
  };

  Game.prototype.loadIntoTransport78 = function loadNearbyTransport199(transport, candidates = null) {
    if (!isTransport(transport)) return 0;
    const radius = Math.max(260, finite(transport.radius, 24) * 10);
    const pool = (candidates || this.units || []).filter(
      unit => canCarry(transport, unit) && Math.hypot(unit.x - transport.x, unit.y - transport.y) <= radius,
    );
    const accepted = issueBoarding(this, transport, pool, false);
    if (accepted) {
      state.nearbyLoads += 1;
      this.addEffect?.({ type: 'text', x: transport.x, y: transport.y, text: `Погрузка: ${accepted}`, color: '#b9e7c8', duration: 1 });
    } else this.alert?.('Рядом нет подходящих юнитов или транспорт заполнен', 'warning');
    return accepted;
  };

  Game.prototype.issueLoadTransport95 = function issueLoadTransport199(transport, units = null, append = false) {
    const selected = units || this.getSelectedUnits?.() || [];
    const accepted = issueBoarding(this, transport, selected, append);
    if (!accepted) {
      const compatible = (selected || []).some(unit => canCarry(transport, unit));
      this.alert?.(compatible ? 'В транспорте нет места для выбранной группы' : 'Этот транспорт не подходит выбранным юнитам', 'warning');
      return false;
    }
    this.addEffect?.({ type: 'marker', x: transport.x, y: transport.y, color: '#8ce0aa', duration: 0.75 });
    return true;
  };

  Game.prototype.loadSelectedTransports78 = function loadSelectedTransports199() {
    const transports = (this.getSelectedUnits?.() || []).filter(isTransport);
    if (!transports.length) return false;
    let issued = false;
    for (const transport of transports) {
      const radius = Math.max(260, finite(transport.radius, 24) * 10);
      const candidates = (this.units || []).filter(
        unit => canCarry(transport, unit) && Math.hypot(unit.x - transport.x, unit.y - transport.y) <= radius,
      );
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
      this.renderSnapshotDirty = true;
    } else this.alert?.('Транспорт пуст или нет места для выгрузки', 'info');
    return unloaded;
  };

  Game.prototype.unloadSelectedTransports78 = function unloadSelectedTransports199() {
    let total = 0;
    for (const transport of (this.getSelectedUnits?.() || []).filter(isTransport)) total += this.unloadTransport78(transport);
    return total;
  };

  const baseIssueContext = Game.prototype.issueContext;
  if (typeof baseIssueContext === 'function') {
    Game.prototype.issueContext = function transportContext199(x, y, append = false) {
      const target = this.hitTestForContext?.(x, y) || this.hitTest?.(x, y, false);
      const selected = this.getSelectedUnits?.() || [];
      if (isTransport(target) && target.team === 'player' && selected.some(unit => canCarry(target, unit))) {
        return this.issueLoadTransport95(target, selected, append);
      }
      return baseIssueContext.call(this, x, y, append);
    };
  }

  const baseProcessCommand = Unit.prototype.processCommand;
  if (typeof baseProcessCommand === 'function') {
    Unit.prototype.processCommand = function processTransportCommand199(command, dt) {
      if (command?.type !== 'loadTransport') return baseProcessCommand.call(this, command, dt);
      const transport = this.game?.getEntity?.(command.transportId || command.targetId);
      if (!isTransport(transport) || transport.team !== this.team || !canCarry(transport, this)) {
        releaseReservation(transport, this.id);
        this.finishCommand?.();
        return;
      }
      ensureTransport(transport);
      const map = reservations(transport);
      if (!map.has(this.id)) map.set(this.id, finite(command.cargoCost95, cargoCost(this)));
      const distance = Math.hypot(this.x - transport.x, this.y - transport.y);
      if (distance <= boardingRange(transport, this)) {
        if (!embark(this.game, transport, this)) {
          releaseReservation(transport, this.id);
          this.finishCommand?.();
        }
        return;
      }
      const angle = finite(command.approachAngle95);
      const ring = Math.max(boardingRange(transport, this) - 5, finite(transport.radius, 20) + finite(this.radius, 14) + 8);
      const targetX = transport.x + Math.cos(angle) * ring;
      const targetY = transport.y + Math.sin(angle) * ring;
      this.moveToward?.(targetX, targetY, dt, distance > 500 ? 1.16 : 1.06);
    };
  }

  const baseUnitUpdate = Unit.prototype.update;
  if (typeof baseUnitUpdate === 'function') {
    Unit.prototype.update = function transportUnitUpdate199(dt, ...rest) {
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
      const waitingForCargo = isTransport(this) && this.air && !this.currentCommand && reservations(this).size > 0;
      if (!waitingForCargo) return baseUnitUpdate.call(this, dt, ...rest);
      const position = {
        x: this.x,
        y: this.y,
        renderX: this.renderX,
        renderY: this.renderY,
        rotation: this.rotation,
        renderRotation: this.renderRotation,
      };
      const result = baseUnitUpdate.call(this, dt, ...rest);
      Object.assign(this, position);
      return result;
    };
  }

  const baseTakeDamage = Unit.prototype.takeDamage;
  if (typeof baseTakeDamage === 'function') {
    Unit.prototype.takeDamage = function protectedPassenger199(...args) {
      if (this.embarkedIn) return 0;
      return baseTakeDamage.apply(this, args);
    };
  }

  const baseDie = Unit.prototype.die;
  if (typeof baseDie === 'function') {
    Unit.prototype.die = function transportDeath199(source = null) {
      if (this.embarkedIn) {
        const carrier = this.game?.getEntity?.(this.embarkedIn);
        if (carrier?.transportCargoIds) carrier.transportCargoIds = carrier.transportCargoIds.filter(id => id !== this.id);
        this.embarkedIn = null;
      }
      if (isTransport(this) && this.transportCargoIds?.length) {
        for (const id of [...this.transportCargoIds]) {
          const passenger = this.game?.getEntity?.(id);
          if (!passenger?.alive) continue;
          passenger.embarkedIn = null;
          passenger.inTransport = false;
          passenger.air = Boolean(passenger.stats?.air);
          passenger.vision = finite(passenger.stats?.vision);
          baseDie.call(passenger, source);
        }
        this.transportCargoIds.length = 0;
      }
      return baseDie.call(this, source);
    };
  }

  const baseTargetable = Game.prototype.isTargetableBy;
  if (typeof baseTargetable === 'function') {
    Game.prototype.isTargetableBy = function passengerTargetability199(attacker, target, ...rest) {
      if (target?.embarkedIn) return false;
      return baseTargetable.call(this, attacker, target, ...rest);
    };
  }

  const baseApplyModification = Game.prototype.applyUnitModification;
  if (typeof baseApplyModification === 'function') {
    Game.prototype.applyUnitModification = function reliableUnitModification199(unit, variantKey, silent = false) {
      const beforeType = unit?.typeId || null;
      const result = baseApplyModification.call(this, unit, variantKey, silent);
      if (result === false || !unit?.alive || unit.typeId === beforeType) return result;
      let stats = unit.stats;
      try { stats = D.getUnitStats?.(unit.typeId, this.teams?.[unit.team]) || stats; } catch (_) {}
      stats ||= D.UNIT_TYPES?.[unit.typeId];
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
        unit.cloaked = Boolean(stats.stealth) && finite(unit.revealTimer) <= 0;
        if (Number.isFinite(stats.transportCapacity)) {
          unit.transportCapacity = stats.transportCapacity;
          ensureTransport(unit);
        } else {
          unit.transportCapacity = 0;
          if (Array.isArray(unit.transportCargoIds) && unit.transportCargoIds.length) {
            const reserved = [];
            for (let index = 0; index < unit.transportCargoIds.length; index += 1) {
              const passenger = this.getEntity?.(unit.transportCargoIds[index]);
              if (passenger?.alive) restorePassenger(this, unit, passenger, index, reserved);
            }
            unit.transportCargoIds.length = 0;
          }
        }
      }
      this.rebuildSpatialIndexes?.();
      this.recalculatePower?.();
      this.uiDirty = true;
      this.renderSnapshotDirty = true;
      if (this.uiCache) {
        this.uiCache.commandKey = '';
        this.uiCache.selectionKey = '';
      }
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
    reservedCapacity,
    freeCapacity: transport => freeCapacity(D?.game || transport?.game, transport),
    embark: (transport, unit) => embark(D?.game || transport?.game, transport, unit),
  };
})();
