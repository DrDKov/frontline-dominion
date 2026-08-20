(() => {
  'use strict';

  const root = globalThis;
  const D = root.__FD_DEBUG__;
  const Game = D?.Game;
  if (!Game?.prototype || root.__FD_GROUP_MOVEMENT_201__) return;

  const VERSION = '16.8.17';
  const BUILD = 201;
  const hasDocument = typeof document !== 'undefined';
  const WORLD = D?.WORLD || { width: 32000, height: 22000 };
  const MODE_TO_SHAPE = {
    balanced: 'wedge',
    line: 'line',
    column: 'column',
    wedge: 'wedge',
    box: 'box',
    echelon: 'echelonRight',
    custom: 'box',
  };
  const MODE_NAMES = {
    balanced: 'Боевой',
    line: 'Линия',
    column: 'Колонна',
    wedge: 'Клин',
    box: 'Коробка',
    echelon: 'Эшелон',
    custom: 'Пользовательский',
  };
  const state = {
    freeOrders: 0,
    formationOrders: 0,
    freeCommands: 0,
    uniqueEndpoints: 0,
    endpointRetries: 0,
    formationModesChosen: 0,
    freeModeChosen: 0,
    robustFormationSteps: 0,
    outlierStallsIgnored: 0,
    formationReplans: 0,
    saveWrites: 0,
    hydrateReads: 0,
    lastMode: 'free',
    lastOrderType: null,
    lastEndpoints: [],
  };

  const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const distance = (a, b) => Math.hypot(finite(a?.x) - finite(b?.x), finite(a?.y) - finite(b?.y));
  const installMethod = (prototype, name, value) => {
    try {
      Object.defineProperty(prototype, name, { configurable: true, writable: true, value });
      return prototype[name] === value;
    } catch (_) {
      try { prototype[name] = value; return prototype[name] === value; }
      catch (_) { return false; }
    }
  };

  const ensureSettings = (game, saved = null) => {
    if (!game) return false;
    if (!game.formationSettings || typeof game.formationSettings !== 'object') game.formationSettings = {};
    const settingsObject = game.formationSettings;
    const externallyReplaced = Boolean(
      game._fdOptionalFormationInitialized201 &&
      game._fdFormationSettingsObject201 &&
      game._fdFormationSettingsObject201 !== settingsObject
    );
    if (!game._fdOptionalFormationInitialized201) {
      const savedEnabled = typeof saved?.formationEnabled201 === 'boolean'
        ? saved.formationEnabled201
        : typeof saved?.formationSettings?.enabled === 'boolean'
          ? saved.formationSettings.enabled
          : typeof game.formationSettings?.enabled === 'boolean'
            ? game.formationSettings.enabled
            : false;
      game.formationEnabled201 = Boolean(savedEnabled);
      game._fdOptionalFormationInitialized201 = true;
    } else if (externallyReplaced) {
      // The presentation bridge replaces formationSettings with the action
      // payload in the Worker. Treat that new object as authoritative input;
      // ordinary local calls mutate the existing object and remain property-led.
      if (typeof settingsObject.enabled === 'boolean') game.formationEnabled201 = settingsObject.enabled;
      if (MODE_NAMES[settingsObject.mode]) game.formationMode = settingsObject.mode;
    }
    const savedMode = saved?.formationMode || saved?.formationSettings?.mode;
    if (savedMode && MODE_NAMES[savedMode]) game.formationMode = savedMode;
    if (!MODE_NAMES[game.formationMode]) game.formationMode = 'balanced';
    game.formationSettings.enabled = Boolean(game.formationEnabled201);
    game.formationSettings.mode = game.formationMode;
    game.formationSettings.shape = MODE_TO_SHAPE[game.formationMode] || game.formationSettings.shape || 'wedge';
    game._fdFormationSettingsObject201 = game.formationSettings;
    state.lastMode = game.formationEnabled201 ? game.formationMode : 'free';
    return game.formationEnabled201;
  };

  const refreshControls = game => {
    if (!hasDocument || !game) return;
    const controls = document.getElementById('formation-controls');
    if (!controls) return;
    const enabled = ensureSettings(game);
    const units = game.getSelectedUnits?.() || [];
    const status = document.getElementById('formation-status');
    if (status) status.textContent = enabled
      ? `${MODE_NAMES[game.formationMode] || 'Строй'} · ${units.length}`
      : `Свободное движение · ${units.length}`;
    for (const button of controls.querySelectorAll('[data-formation-mode]')) {
      button.classList.toggle('active', enabled && button.dataset.formationMode === game.formationMode);
      button.setAttribute('aria-pressed', String(enabled && button.dataset.formationMode === game.formationMode));
    }
    const free = controls.querySelector('[data-formation-free="true"]');
    if (free) {
      free.classList.toggle('active', !enabled);
      free.setAttribute('aria-pressed', String(!enabled));
    }
  };

  Game.prototype.setFormationEnabled201 = function(enabled, notify = true) {
    ensureSettings(this);
    this.formationEnabled201 = Boolean(enabled);
    ensureSettings(this);
    this.uiDirty = true;
    refreshControls(this);
    if (!enabled) {
      state.freeModeChosen += 1;
      if (notify) this.alert?.('Группа: свободное движение без строя', 'info');
    }
    return this.formationEnabled201;
  };

  const baseSetFormationMode = Game.prototype.setFormationMode;
  if (typeof baseSetFormationMode === 'function') {
    installMethod(Game.prototype, 'setFormationMode', function optionalFormationMode201(mode, ...rest) {
      const result = baseSetFormationMode.call(this, mode, ...rest);
      if (MODE_NAMES[this.formationMode] && this.formationMode === mode) {
        this.formationEnabled201 = true;
        ensureSettings(this);
        state.formationModesChosen += 1;
        refreshControls(this);
      }
      return result;
    });
  }

  const baseCaptureFormation = Game.prototype.captureCurrentFormation;
  if (typeof baseCaptureFormation === 'function') {
    installMethod(Game.prototype, 'captureCurrentFormation', function optionalCapturedFormation201(...args) {
      const result = baseCaptureFormation.apply(this, args);
      if (this.formationMode === 'custom') {
        this.formationEnabled201 = true;
        ensureSettings(this);
        refreshControls(this);
      }
      return result;
    });
  }

  const baseUpdateControls = Game.prototype.updateFormationControls;
  if (typeof baseUpdateControls === 'function') {
    installMethod(Game.prototype, 'updateFormationControls', function optionalFormationControls201(...args) {
      const result = baseUpdateControls.apply(this, args);
      refreshControls(this);
      return result;
    });
  }

  const selectedUnits = (game, type) => (game.getSelectedUnits?.() || [])
    .filter(unit => unit?.alive && unit.kind === 'unit' && !unit.embarkedIn && (type !== 'attackMove' || unit.stats?.weapon));

  const commandBridgeReady = game => {
    if (!hasDocument || root.__FD_MULTIPLAYER_ACTIVE__) return false;
    const bridge = root.__FD_STABLE_STATE165__?.bridge;
    return Boolean(bridge && bridge.game === game && bridge.ready && !bridge.failed && !bridge.applying && bridge.worker);
  };

  const slotOffsets = (units, angle, spacing) => {
    const forward = { x: Math.cos(angle), y: Math.sin(angle) };
    const side = { x: -forward.y, y: forward.x };
    const center = units.reduce((sum, unit) => ({ x: sum.x + unit.x / units.length, y: sum.y + unit.y / units.length }), { x: 0, y: 0 });
    const ordered = [...units].sort((left, right) => {
      const leftSide = (left.x - center.x) * side.x + (left.y - center.y) * side.y;
      const rightSide = (right.x - center.x) * side.x + (right.y - center.y) * side.y;
      const leftForward = (left.x - center.x) * forward.x + (left.y - center.y) * forward.y;
      const rightForward = (right.x - center.x) * forward.x + (right.y - center.y) * forward.y;
      return leftSide - rightSide || rightForward - leftForward || String(left.id).localeCompare(String(right.id));
    });
    const columns = Math.max(1, Math.ceil(Math.sqrt(units.length * 1.45)));
    const rows = Math.ceil(units.length / columns);
    const slots = [];
    for (let index = 0; index < units.length; index += 1) {
      const row = Math.floor(index / columns);
      const rowCount = Math.min(columns, units.length - row * columns);
      const column = index - row * columns;
      slots.push({
        lateral: (column - (rowCount - 1) * 0.5) * spacing,
        forward: ((rows - 1) * 0.5 - row) * spacing * 0.82,
      });
    }
    slots.sort((left, right) => left.lateral - right.lateral || right.forward - left.forward);
    return { ordered, slots, forward, side };
  };

  const reachable = (game, unit, x, y) => {
    const radius = Math.max(4, finite(unit.radius, 8));
    const point = unit.air ? { x, y } : game.findReachablePoint?.(x, y, radius + 3) || { x, y };
    return {
      x: clamp(finite(point?.x, x), radius + 5, WORLD.width - radius - 5),
      y: clamp(finite(point?.y, y), radius + 5, WORLD.height - radius - 5),
    };
  };

  const reserveEndpoint = (game, unit, desired, reserved, spacing) => {
    const radius = Math.max(4, finite(unit.radius, 8));
    const valid = point => reserved.every(entry => distance(point, entry) >= radius + entry.radius + 7);
    let point = reachable(game, unit, desired.x, desired.y);
    if (valid(point)) return point;
    const step = Math.max(spacing * 0.72, radius * 2 + 12);
    for (let index = 1; index <= 28; index += 1) {
      const ring = Math.ceil(index / 8);
      const angle = index * 2.399963229728653;
      point = reachable(game, unit, desired.x + Math.cos(angle) * step * ring, desired.y + Math.sin(angle) * step * ring);
      state.endpointRetries += 1;
      if (valid(point)) return point;
    }
    return point;
  };

  const issueFreeLayer = (game, units, type, x, y, append, finalRotation, orderId) => {
    if (!units.length) return [];
    const center = units.reduce((sum, unit) => ({ x: sum.x + unit.x / units.length, y: sum.y + unit.y / units.length }), { x: 0, y: 0 });
    const angle = Math.hypot(x - center.x, y - center.y) > 1 ? Math.atan2(y - center.y, x - center.x) : 0;
    const spacing = Math.max(34, ...units.map(unit => finite(unit.radius, 8) * 2 + 14));
    const layout = slotOffsets(units, angle, spacing);
    const reserved = [];
    for (let index = 0; index < layout.ordered.length; index += 1) {
      const unit = layout.ordered[index];
      const slot = layout.slots[index];
      const desired = {
        x: x + layout.forward.x * slot.forward + layout.side.x * slot.lateral,
        y: y + layout.forward.y * slot.forward + layout.side.y * slot.lateral,
      };
      const endpoint = reserveEndpoint(game, unit, desired, reserved, spacing);
      reserved.push({ ...endpoint, radius: Math.max(4, finite(unit.radius, 8)), id: unit.id });
      const shared = {
        _fdFreeGroup201: true,
        freeGroupId201: orderId,
        _fdRequestedGroupTarget201: { x, y },
      };
      if (type === 'patrol') {
        unit.setCommand?.({
          type: 'patrol', ax: unit.x, ay: unit.y, bx: endpoint.x, by: endpoint.y, phase: false, ...shared,
        }, append);
      } else {
        unit.setCommand?.({ type, x: endpoint.x, y: endpoint.y, ...(Number.isFinite(finalRotation) ? { finalRotation } : {}), ...shared }, append);
      }
      state.freeCommands += 1;
    }
    return reserved;
  };

  const issueFreeOrder = (game, type, x, y, append = false, finalRotation = NaN) => {
    const units = selectedUnits(game, type);
    if (!units.length) return false;
    game._fdFreeOrderCounter201 = Math.max(0, finite(game._fdFreeOrderCounter201)) + 1;
    const orderId = `free-${Math.max(0, finite(game.simTick, Math.round(finite(game.time) * 25)) | 0)}-${game._fdFreeOrderCounter201}`;
    const layers = [units.filter(unit => !unit.air), units.filter(unit => unit.air)].filter(layer => layer.length);
    const endpoints = [];
    for (const layer of layers) endpoints.push(...issueFreeLayer(game, layer, type, x, y, append, finalRotation, orderId));
    const colors = { move: '#8fe6b2', attackMove: '#ffb06c', patrol: '#7ecbff' };
    game.addEffect?.({ type: 'marker', x, y, color: colors[type] || '#8fe6b2', duration: 0.9 });
    game.sound?.click?.();
    state.freeOrders += 1;
    state.uniqueEndpoints += new Set(endpoints.map(point => `${Math.round(point.x)}:${Math.round(point.y)}`)).size;
    state.lastOrderType = type;
    state.lastMode = 'free';
    state.lastEndpoints = endpoints.slice(0, 32).map(point => ({ id: point.id, x: point.x, y: point.y }));
    return true;
  };

  const wrapOrder = (name, type, oriented = false) => {
    const original = Game.prototype[name];
    if (typeof original !== 'function') return false;
    const wrapped = function optionalGroupOrder201(x, y, third = false, fourth = false, ...rest) {
      const append = oriented ? Boolean(fourth) : Boolean(third);
      const finalRotation = oriented ? Number(third) : NaN;
      const units = selectedUnits(this, type);
      const enabled = ensureSettings(this);
      if (units.length < 2 || enabled) {
        if (units.length >= 2 && enabled) state.formationOrders += 1;
        return original.call(this, x, y, third, fourth, ...rest);
      }
      if (commandBridgeReady(this)) return original.call(this, x, y, third, fourth, ...rest);
      return issueFreeOrder(this, type, x, y, append, finalRotation);
    };
    Object.defineProperty(wrapped, '__fdOptionalGroupMovement201', { value: name });
    return installMethod(Game.prototype, name, wrapped);
  };

  wrapOrder('issueMove', 'move');
  wrapOrder('issueAttackMove', 'attackMove');
  wrapOrder('issuePatrol', 'patrol');
  wrapOrder('issueOrientedMove78', 'move', true);

  const baseIssueContext = Game.prototype.issueContext;
  if (typeof baseIssueContext === 'function') {
    installMethod(Game.prototype, 'issueContext', function optionalContextSettings201(...args) {
      ensureSettings(this);
      return baseIssueContext.apply(this, args);
    });
  }

  // Formation movement remains cohesive, but one obstructed outlier no longer
  // throttles every other member to 18–30% indefinitely. The existing v196
  // per-member obstacle recovery still owns the outlier's bypass manoeuvre.
  const baseEnsureFormation = Game.prototype.ensureFormationGroupUpdated;
  if (typeof baseEnsureFormation === 'function') {
    installMethod(Game.prototype, 'ensureFormationGroupUpdated', function robustFormationProgress201(group, dt) {
      const before = { x: finite(group?.anchorX), y: finite(group?.anchorY) };
      const result = baseEnsureFormation.call(this, group, dt);
      if (!group || group._fdSmartFormationTick201 === finite(this.simTick, finite(this.time) * 25)) return result;
      group._fdSmartFormationTick201 = finite(this.simTick, finite(this.time) * 25);
      const units = (group.unitIds || []).map(id => this.getEntity?.(id)).filter(unit =>
        unit?.alive && unit.kind === 'unit' && unit.currentCommand?.formationGroupId === group.id
      );
      if (units.length < 3 || group.arrived || group.completed) return result;
      const deviations = units.map(unit => {
        const slot = this.getFormationSlotWorld?.(group, unit);
        return slot ? distance(unit, slot) : 0;
      }).sort((left, right) => left - right);
      const majorityIndex = Math.max(0, Math.min(deviations.length - 1, Math.floor((deviations.length - 1) * 0.62)));
      const majorityDeviation = deviations[majorityIndex] || 0;
      const maxDeviation = deviations[deviations.length - 1] || 0;
      const threshold = Math.max(94, finite(group.depthSpacing, 48) * 1.92);
      const engaged = units.some(unit => {
        const id = unit.currentCommand?.engagedTargetId;
        const target = id ? this.getEntity?.(id) : null;
        return target?.alive && target.team !== unit.team;
      });
      if (!engaged && maxDeviation > threshold * 2.2 && majorityDeviation < threshold * 1.28) {
        group.forming = false;
        group.hasDeparted = true;
        state.outlierStallsIgnored += 1;
      }

      const waypoint = group.path?.[Math.max(0, finite(group.pathIndex) | 0)] || {
        x: finite(group.targetX, group.bx), y: finite(group.targetY, group.by),
      };
      const remaining = distance(group, waypoint);
      const moved = Math.hypot(finite(group.anchorX) - before.x, finite(group.anchorY) - before.y);
      const stepBudget = Math.max(0, finite(group.speed) * Math.max(0, finite(dt, 0.04)) * 0.68);
      if (!engaged && majorityDeviation < threshold * 1.65 && remaining > Math.max(22, finite(group.maxRadius, 10)) && moved + 0.01 < stepBudget) {
        const extra = Math.min(remaining, stepBudget - moved);
        if (extra > 0.01) {
          group.anchorX += (waypoint.x - group.anchorX) / Math.max(1, remaining) * extra;
          group.anchorY += (waypoint.y - group.anchorY) / Math.max(1, remaining) * extra;
          state.robustFormationSteps += 1;
        }
      }

      const tick = Math.max(0, finite(this.simTick, Math.round(finite(this.time) * 25)) | 0);
      const current = { x: finite(group.anchorX), y: finite(group.anchorY) };
      const progress = group._fdSmartFormationProgress201 || { tick, x: current.x, y: current.y };
      if (distance(progress, current) > 1.2) {
        progress.tick = tick;
        progress.x = current.x;
        progress.y = current.y;
      } else if (!engaged && remaining > Math.max(160, finite(group.maxRadius, 10) * 2) && tick - progress.tick >= 32) {
        group.path = [];
        group.pathIndex = 0;
        group.pathTargetX = NaN;
        group.pathTargetY = NaN;
        group.arrived = false;
        group.completed = false;
        group.forming = false;
        if (group.march183) {
          group.march183.blockedTicks = 0;
          group.march183.formingTicks189 = 0;
          group.march183.memberSignature = '';
        }
        progress.tick = tick;
        state.formationReplans += 1;
      }
      group._fdSmartFormationProgress201 = progress;
      return result;
    });
  }

  const baseSave = Game.prototype.save;
  if (typeof baseSave === 'function') {
    installMethod(Game.prototype, 'save', function optionalFormationSave201(...args) {
      ensureSettings(this);
      const result = baseSave.apply(this, args);
      if (result === false) return result;
      try {
        const raw = D?.storageGet?.(D.SAVE_KEY);
        const data = raw ? JSON.parse(raw) : null;
        if (data) {
          data.formationEnabled201 = Boolean(this.formationEnabled201);
          data.formationMode = this.formationMode;
          data.formationSettings = { ...(data.formationSettings || {}), ...(this.formationSettings || {}), enabled: Boolean(this.formationEnabled201), mode: this.formationMode };
          D.storageSet?.(D.SAVE_KEY, JSON.stringify(data));
          state.saveWrites += 1;
        }
      } catch (_) {}
      return result;
    });
  }

  const baseHydrate = Game.prototype.hydrate;
  if (typeof baseHydrate === 'function') {
    installMethod(Game.prototype, 'hydrate', function optionalFormationHydrate201(data, ...rest) {
      const result = baseHydrate.call(this, data, ...rest);
      this._fdOptionalFormationInitialized201 = false;
      ensureSettings(this, data || {});
      state.hydrateReads += 1;
      refreshControls(this);
      return result;
    });
  }

  if (hasDocument) {
    document.addEventListener('click', event => {
      const button = event.target?.closest?.('[data-formation-free="true"]');
      if (!button) return;
      const game = D?.game;
      if (!game) return;
      game.setFormationEnabled201?.(false, true);
      event.preventDefault();
    });
  }

  root.__FD_GROUP_MOVEMENT_201__ = {
    version: VERSION,
    build: BUILD,
    state,
    ensureSettings: (game = D?.game) => ensureSettings(game),
    issueFreeOrder: (type, x, y, append = false, game = D?.game) =>
      issueFreeOrder(game, type, x, y, append),
    diagnostics: () => ({ ...state, lastEndpoints: state.lastEndpoints.map(point => ({ ...point })) }),
  };
})();
