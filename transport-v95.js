(() => {
  'use strict';

  const debug = window.__FD_DEBUG__;
  const transportApi = window.__FD_V78__;
  const GameClass = debug?.Game;
  const UnitClass = debug?.Unit;
  const canvas = document.getElementById('game-canvas');
  const shell = document.getElementById('game-shell');
  const details = document.getElementById('selection-details');
  if (!GameClass || !UnitClass || !canvas || !transportApi) return;

  const isTransport = transportApi.isTransport78;
  const cargoCost = transportApi.cargoCost78;
  const canCarry = transportApi.canCarry78;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const commandType = 'loadTransport';

  const style = document.createElement('style');
  style.id = 'fd-transport-context-v95-style';
  style.textContent = `
    #game-canvas.fd-load-ready {
      cursor: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='34' height='34' viewBox='0 0 34 34'%3E%3Ccircle cx='17' cy='17' r='14' fill='%23162920' stroke='%238ce0aa' stroke-width='2'/%3E%3Cpath d='M7 17h16m-6-6 6 6-6 6M26 9v16' fill='none' stroke='%23e8fff0' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") 17 17, copy !important;
    }
    #game-canvas.fd-load-full { cursor: not-allowed !important; }
    #fd-transport-cue-v95 {
      position: absolute; z-index: 42; display: none; pointer-events: none;
      transform: translate(18px, -44px); min-width: 132px; padding: 7px 9px;
      border: 1px solid rgba(139, 226, 170, .72); border-radius: 7px;
      background: rgba(12, 25, 18, .94); color: #e8fff0;
      box-shadow: 0 6px 24px rgba(0, 0, 0, .38);
      font: 800 11px/1.2 system-ui, sans-serif; letter-spacing: .055em;
      white-space: nowrap;
    }
    #fd-transport-cue-v95 strong { color: #8fe0ad; font-size: 12px; }
    #fd-transport-cue-v95 span { display: block; margin-top: 3px; color: #b8c9be; font-weight: 650; letter-spacing: .02em; }
    #fd-transport-cue-v95.full { border-color: rgba(235, 154, 116, .75); }
    #fd-transport-cue-v95.full strong { color: #ffb08a; }
    .transport-context-v95 { color: #cfe8d7; }
  `;
  document.head.append(style);

  const cue = document.createElement('div');
  cue.id = 'fd-transport-cue-v95';
  cue.setAttribute('aria-hidden', 'true');
  shell?.append(cue);

  function cargoIds(transport) {
    transport.ensureTransport78?.();
    const valid = [];
    const seen = new Set();
    for (const id of transport.transportCargoIds || []) {
      if (seen.has(id)) continue;
      const unit = transport.game?.getEntity?.(id);
      if (!unit?.alive || unit.embarkedIn !== transport.id) continue;
      seen.add(id);
      valid.push(id);
    }
    if (valid.length !== (transport.transportCargoIds || []).length) transport.transportCargoIds = valid;
    return valid;
  }

  function occupiedPoints(transport) {
    return cargoIds(transport).reduce((sum, id) => {
      const cost = cargoCost(transport.game.getEntity(id));
      return sum + (Number.isFinite(cost) ? cost : 0);
    }, 0);
  }

  function reservations(transport) {
    if (!(transport._cargoReservations95 instanceof Map)) transport._cargoReservations95 = new Map();
    for (const [unitId] of transport._cargoReservations95) {
      const unit = transport.game?.getEntity?.(unitId);
      const active = unit?.alive && !unit.embarkedIn && unit.commandQueue?.some(
        (command) => command?.type === commandType && command.transportId === transport.id
      );
      if (!active) transport._cargoReservations95.delete(unitId);
    }
    return transport._cargoReservations95;
  }

  function reservedPoints(transport) {
    let total = 0;
    for (const cost of reservations(transport).values()) total += Number.isFinite(cost) ? cost : 0;
    return total;
  }

  function freePoints(transport) {
    return Math.max(0, (transport.stats.transportCapacity || 0) - occupiedPoints(transport) - reservedPoints(transport));
  }

  function releaseCommandReservation(unit, command) {
    if (command?.type !== commandType || !command.transportId) return;
    const transport = unit.game?.getEntity?.(command.transportId);
    transport?._cargoReservations95?.delete(unit.id);
    if (transport) transport.game.uiDirty = true;
  }

  function releaseQueuedReservations(unit, commands = unit.commandQueue) {
    for (const command of commands || []) releaseCommandReservation(unit, command);
  }

  const baseSetCommand95 = UnitClass.prototype.setCommand;
  UnitClass.prototype.setCommand = function(command, append = false) {
    if (!append) releaseQueuedReservations(this);
    return baseSetCommand95.call(this, command, append);
  };

  const baseStop95 = UnitClass.prototype.stop;
  UnitClass.prototype.stop = function(...args) {
    releaseQueuedReservations(this);
    return baseStop95.apply(this, args);
  };

  const baseFinishCommand95 = UnitClass.prototype.finishCommand;
  UnitClass.prototype.finishCommand = function(...args) {
    releaseCommandReservation(this, this.currentCommand);
    return baseFinishCommand95.apply(this, args);
  };

  function compatibleSelected(game, transport, units = game.getSelectedUnits?.() || []) {
    return units.filter((unit) => unit !== transport && canCarry(transport, unit));
  }

  function statusFor(game, transport, units = game.getSelectedUnits?.() || []) {
    if (!isTransport(transport) || !transport.alive || transport.team !== 'player') return null;
    const compatible = compatibleSelected(game, transport, units);
    if (!compatible.length) return null;
    const used = occupiedPoints(transport);
    const reserved = reservedPoints(transport);
    const capacity = transport.stats.transportCapacity || 0;
    const available = Math.max(0, capacity - used - reserved);
    const canFit = compatible.some((unit) => cargoCost(unit) <= available);
    return { transport, compatible, used, reserved, capacity, available, canFit };
  }

  function releaseSelectedReservations(transport, units) {
    const map = reservations(transport);
    for (const unit of units) map.delete(unit.id);
  }

  // Preserve places promised to approaching passengers even if the legacy
  // "load nearby" button is used while they are still on the way.
  const baseLoadNearby95 = GameClass.prototype.loadIntoTransport78;
  if (typeof baseLoadNearby95 === 'function') {
    GameClass.prototype.loadIntoTransport78 = function(transport, candidates = null) {
      if (!isTransport(transport)) return baseLoadNearby95.call(this, transport, candidates);
      const map = reservations(transport);
      const capacity = transport.stats.transportCapacity || 0;
      let used = occupiedPoints(transport);
      let protectedPoints = reservedPoints(transport);
      const pool = (candidates || this.units)
        .filter((unit) => canCarry(transport, unit) && Math.hypot(unit.x - transport.x, unit.y - transport.y) <= 290)
        .sort((a, b) => Number(map.has(b.id)) - Number(map.has(a.id)) || Math.hypot(a.x - transport.x, a.y - transport.y) - Math.hypot(b.x - transport.x, b.y - transport.y));
      const accepted = [];
      for (const unit of pool) {
        const cost = cargoCost(unit);
        const ownReservation = map.get(unit.id) || 0;
        if (!Number.isFinite(cost) || used + protectedPoints - ownReservation + cost > capacity) continue;
        accepted.push(unit);
        used += cost;
        protectedPoints -= ownReservation;
      }
      const loaded = baseLoadNearby95.call(this, transport, accepted);
      reservations(transport);
      return loaded;
    };
  }

  GameClass.prototype.issueLoadTransport95 = function(transport, units = null, append = false) {
    if (!isTransport(transport) || !transport.alive || transport.team !== 'player') return false;
    const selected = (units || this.getSelectedUnits?.() || []).filter((unit) => unit?.alive && !unit.embarkedIn);
    let candidates = compatibleSelected(this, transport, selected);
    if (!candidates.length) {
      this.alert?.('Этот транспорт не подходит выбранным юнитам', 'warning');
      return true;
    }

    // A replacement order also replaces the old reservation made by this group.
    if (!append) releaseSelectedReservations(transport, candidates);
    const map = reservations(transport);
    let available = freePoints(transport);
    candidates = [...candidates].sort((a, b) => {
      const da = Math.hypot(a.x - transport.x, a.y - transport.y);
      const db = Math.hypot(b.x - transport.x, b.y - transport.y);
      return da - db || cargoCost(a) - cargoCost(b) || String(a.id).localeCompare(String(b.id));
    });

    const accepted = [];
    let sequence = 0;
    for (const unit of candidates) {
      if (unit.commandQueue?.some((command) => command?.type === commandType && command.transportId === transport.id)) continue;
      const cost = cargoCost(unit);
      if (!Number.isFinite(cost) || cost > available) continue;
      const hash = [...String(unit.id)].reduce((value, char) => Math.imul(value ^ char.charCodeAt(0), 16777619), 2166136261) >>> 0;
      const approachAngle = (hash % 6283) / 1000 + sequence * 0.61;
      unit.setCommand({
        type: commandType,
        transportId: transport.id,
        cargoCost95: cost,
        approachAngle95: approachAngle,
        issuedAt95: this.time
      }, append);
      map.set(unit.id, cost);
      available -= cost;
      accepted.push(unit);
      sequence += 1;
    }

    if (!accepted.length) {
      this.alert?.('В транспорте недостаточно свободного места', 'warning');
      this.addEffect?.({ type: 'text', x: transport.x, y: transport.y, z: transport.air ? (this.getAircraftFlightAltitude119?.(transport) ?? transport.radius * 5.2) : 18, text: 'ТРАНСПОРТ ЗАПОЛНЕН', color: '#ffaf88', duration: 1.2 });
      return true;
    }

    transport._boardingPulse95 = this.time + 1.3;
    this.addEffect?.({ type: 'marker', x: transport.x, y: transport.y, color: '#86e8aa', duration: 1.05 });
    this.addEffect?.({
      type: 'text', x: transport.x, y: transport.y,
      z: transport.air ? (this.getAircraftFlightAltitude119?.(transport) ?? transport.radius * 5.5) : 22,
      text: `⇥ ПОГРУЗКА: ${accepted.length}`, color: '#b6f3ca', duration: 1.25
    });
    if (accepted.length < candidates.length) {
      this.alert?.(`К погрузке направлено ${accepted.length}; остальные не помещаются`, 'warning');
    } else {
      this.alert?.(`К транспорту направлено: ${accepted.length}`, 'info');
    }
    this.sound?.click?.();
    this.uiDirty = true;
    return true;
  };

  function embarkUnit(game, unit, transport) {
    const cost = cargoCost(unit);
    const capacity = transport.stats.transportCapacity || 0;
    if (!canCarry(transport, unit) || occupiedPoints(transport) + cost > capacity) return false;

    reservations(transport).delete(unit.id);
    unit.embarkedIn = transport.id;
    unit._v78OriginalAir = Boolean(unit.stats.air);
    unit._v78OriginalVision = unit.vision;
    unit.air = true;
    unit.vision = 0;
    unit.commandQueue.length = 0;
    unit.invalidateNavigation?.();
    unit.selected = false;
    unit.x = transport.x;
    unit.y = transport.y;
    unit.renderX = transport.renderX ?? transport.x;
    unit.renderY = transport.renderY ?? transport.y;
    if (!transport.transportCargoIds.includes(unit.id)) transport.transportCargoIds.push(unit.id);
    game.selected = game.selected.filter((entity) => entity !== unit && !entity.embarkedIn);
    game.addEffect?.({
      type: 'text', x: transport.x, y: transport.y,
      z: transport.air ? transport.radius * 5.4 : 18,
      text: `ВНУТРИ ${occupiedPoints(transport)}/${capacity}`, color: '#b9e7c8', duration: .9
    });
    game.uiDirty = true;
    return true;
  }

  const baseProcessCommand95 = UnitClass.prototype.processCommand;
  UnitClass.prototype.processCommand = function(command, dt) {
    if (command?.type !== commandType) return baseProcessCommand95.call(this, command, dt);
    const transport = this.game.getEntity(command.transportId);
    if (!transport?.alive || transport.team !== this.team || !canCarry(transport, this)) {
      this.finishCommand();
      return;
    }

    const map = reservations(transport);
    if (!map.has(this.id)) map.set(this.id, Number.isFinite(command.cargoCost95) ? command.cargoCost95 : cargoCost(this));
    const boardingRange = this.radius + transport.radius + (transport.air ? 24 : 15);
    const centreDistance = Math.hypot(this.x - transport.x, this.y - transport.y);
    if (centreDistance <= boardingRange) {
      if (!embarkUnit(this.game, this, transport)) this.finishCommand();
      return;
    }

    const angle = Number.isFinite(command.approachAngle95) ? command.approachAngle95 : 0;
    const ring = Math.max(boardingRange - 5, transport.radius + this.radius + 7);
    const targetX = transport.x + Math.cos(angle) * ring;
    const targetY = transport.y + Math.sin(angle) * ring;
    this.moveToward(targetX, targetY, dt, centreDistance > 500 ? 1.16 : 1.06);
  };

  // An idle strategic transport lands and waits while passengers approach.
  // A transport that already has a player-issued movement order keeps moving,
  // so the passengers continue to chase its current position instead.
  const baseUpdate95 = UnitClass.prototype.update;
  UnitClass.prototype.update = function(dt) {
    const waiting = isTransport(this) && this.typeId === 'strategicAirlifter' && !this.currentCommand && reservations(this).size > 0;
    if (!waiting) return baseUpdate95.call(this, dt);
    const position = { x: this.x, y: this.y, renderX: this.renderX, renderY: this.renderY, rotation: this.rotation, renderRotation: this.renderRotation };
    const result = baseUpdate95.call(this, dt);
    this.x = position.x;
    this.y = position.y;
    this.renderX = position.renderX;
    this.renderY = position.renderY;
    this.rotation = position.rotation;
    this.renderRotation = position.renderRotation;
    this.airOrbitCenter = null;
    return result;
  };

  const baseIssueContext95 = GameClass.prototype.issueContext;
  GameClass.prototype.issueContext = function(x, y, append = false) {
    const target = this.hitTestForContext?.(x, y) || this.hitTest?.(x, y, false);
    const selected = this.getSelectedUnits?.() || [];
    if (target && isTransport(target) && target.team === 'player' && compatibleSelected(this, target, selected).length) {
      this._v91LastCanvasOrderAt = performance.now();
      return this.issueLoadTransport95(target, selected, append);
    }
    return baseIssueContext95.call(this, x, y, append);
  };

  function findHoveredTransport(game, worldX, worldY) {
    const target = game.hitTestForContext?.(worldX, worldY) || game.hitTest?.(worldX, worldY, false);
    return statusFor(game, target);
  }

  function hideCue(game = debug.game) {
    canvas.classList.remove('fd-load-ready', 'fd-load-full');
    if (cue) cue.style.display = 'none';
    if (game) game._transportHover95 = null;
  }

  canvas.addEventListener('pointermove', (event) => {
    if (event.pointerType === 'touch') return;
    const game = debug.game;
    if (!game || game.paused || game.ended || !game.getSelectedUnits?.().length) return hideCue(game);
    const rect = canvas.getBoundingClientRect();
    const sx = event.clientX - rect.left;
    const sy = event.clientY - rect.top;
    const world = game.screenToWorld(sx, sy);
    const status = findHoveredTransport(game, world.x, world.y);
    if (!status) return hideCue(game);

    const ready = status.canFit;
    canvas.classList.toggle('fd-load-ready', ready);
    canvas.classList.toggle('fd-load-full', !ready);
    game._transportHover95 = { targetId: status.transport.id, ready };
    if (cue) {
      cue.style.display = 'block';
      cue.style.left = `${sx}px`;
      cue.style.top = `${sy}px`;
      cue.classList.toggle('full', !ready);
      const occupied = status.used + status.reserved;
      cue.innerHTML = ready
        ? `<strong>⇥ ПОГРУЗИТЬ</strong><span>${status.compatible.length} выбрано · ${occupied}/${status.capacity} мест</span>`
        : `<strong>ТРАНСПОРТ ЗАПОЛНЕН</strong><span>${occupied}/${status.capacity} мест</span>`;
    }
  }, true);
  canvas.addEventListener('pointerleave', () => hideCue(), true);

  const baseRender95 = GameClass.prototype.render;
  GameClass.prototype.render = function(...args) {
    const result = baseRender95.apply(this, args);
    const hover = this._transportHover95;
    const transport = hover && this.getEntity(hover.targetId);
    if (!transport?.alive || !canvas) return result;
    const ctx = canvas.getContext('2d');
    const dpr = this.viewport?.dpr || window.devicePixelRatio || 1;
    const altitude = transport.air ? transport.radius * 4.9 : transport.radius * .45;
    const point = this.worldToScreen(transport.x, transport.y, altitude);
    const radius = Math.max(24, transport.radius * this.camera.zoom * 1.45);
    const color = hover.ready ? '#8ce0aa' : '#ff9e79';
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.strokeStyle = color;
    ctx.fillStyle = hover.ready ? 'rgba(83, 190, 119, .13)' : 'rgba(220, 104, 76, .12)';
    ctx.lineWidth = 2;
    ctx.setLineDash([7, 5]);
    ctx.beginPath();
    ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = color;
    ctx.font = `900 ${clamp(17 * this.camera.zoom, 15, 24)}px system-ui`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(hover.ready ? '⇥' : '×', point.x, point.y);
    ctx.restore();
    return result;
  };

  const baseRenderSelection95 = GameClass.prototype.renderSelectionUI;
  GameClass.prototype.renderSelectionUI = function(...args) {
    const result = baseRenderSelection95.apply(this, args);
    if (this.selected?.length !== 1 || !isTransport(this.selected[0]) || !details || details.querySelector('[data-transport-context-v95]')) return result;
    const transport = this.selected[0];
    const ids = cargoIds(transport);
    const waiting = reservations(transport).size;
    const groups = new Map();
    for (const id of ids) {
      const unit = this.getEntity(id);
      const label = unit?.stats?.name || 'Юнит';
      groups.set(label, (groups.get(label) || 0) + 1);
    }
    const manifest = [...groups.entries()].map(([name, count]) => `${name} ×${count}`).join(' · ') || 'отсек пуст';
    details.insertAdjacentHTML('beforeend', `<div class="unit-role transport-context-v95" data-transport-context-v95>ПКМ по транспорту — погрузить выбранных. Груз: ${manifest}${waiting ? ` · в пути ${waiting}` : ''}</div>`);
    return result;
  };

  const featureStrip = document.querySelector('#start-screen .feature-strip');
  if (featureStrip && !featureStrip.querySelector('[data-context-load-v95]')) {
    featureStrip.insertAdjacentHTML('beforeend', '<span data-context-load-v95>ПКМ по транспорту: погрузка группы</span>');
  }

  window.__FD_TRANSPORT_CONTEXT__ = {
    version: '9.5',
    commandType,
    status(transport, units) { return statusFor(debug.game, transport, units); },
    issue(transport, units, append = false) { return debug.game?.issueLoadTransport95(transport, units, append); },
    occupiedPoints,
    reservedPoints
  };
})();
