(() => {
  'use strict';

  const debug = window.__FD_DEBUG__;
  const GameClass = debug?.Game;
  if (!GameClass) return;

  const VERSION = '11.9';
  const NETWORK_TICK_RATE = 5;
  const FIXED_WING_MIN_ALTITUDE = 430;
  const ROTARY_MIN_ALTITUDE = 310;
  const BUILDING_CLEARANCE = 105;
  const clamp119 = (value, min, max) => Math.max(min, Math.min(max, value));
  const unique119 = (entities) => [...new Set(entities)];

  const isFixedWing119 = (unit) => Boolean(
    unit?.alive && unit.air && unit.stats?.mobilityClass === 'fixedWing' &&
    !/helicopter|lightGunship/i.test(`${unit.typeId || ''} ${unit.stats?.visualRole || ''}`),
  );

  const isAirDefense119 = (entity) => Boolean(
    entity?.alive && (
      entity.stats?.interceptPower > 0 ||
      entity.stats?.softKillPower > 0 ||
      entity.stats?.weapon?.targets?.includes('air')
    ),
  );

  const isNetworkSensor119 = (entity) => Boolean(
    entity?.alive && (entity.stats?.radarRelay || isAirDefense119(entity) || entity.typeId === 'awacs'),
  );

  const isPoweredBuilding119 = (game, building) => {
    if (building?.kind !== 'building') return true;
    if (!building.alive || !building.completed || building.sabotagedUntil > game.time) return false;
    if (typeof game.isStationaryDefensePowered === 'function') return game.isStationaryDefensePowered(building);
    const team = game.teams?.[building.team];
    return Boolean(team?.powerProduced > 0 && team?.powerFactor >= .60);
  };

  GameClass.prototype.getIntegratedAirDefenseState119 = function(teamKey, force = false) {
    const tick = Math.floor((Number(this.time) || 0) * NETWORK_TICK_RATE);
    this._integratedAirDefense119 ||= Object.create(null);
    const cached = this._integratedAirDefense119[teamKey];
    if (!force && cached?.tick === tick) return cached;

    const radarNodes = this.buildings.filter((building) =>
      building.alive && building.team === teamKey && building.typeId === 'radar' && isPoweredBuilding119(this, building));
    const online = radarNodes.length > 0;
    const sensors = online
      ? unique119([...this.units, ...this.buildings].filter((entity) =>
          entity.alive && entity.team === teamKey && isNetworkSensor119(entity) && isPoweredBuilding119(this, entity)))
      : [];
    const team = this.teams?.[teamKey];
    const state = {
      tick,
      online,
      radarNodes,
      sensors,
      reason: online ? 'online' : team?.powerProduced > 0 && team?.powerFactor >= .60 ? 'no-radar' : 'no-power',
    };
    this._integratedAirDefense119[teamKey] = state;
    return state;
  };

  GameClass.prototype.getIntegratedSensorRange119 = function(source, target = null) {
    if (!source?.alive) return 0;
    const stats = source.stats || {};
    const ordinaryRange = Math.max(
      Number(stats.sensorRange) || 0,
      Number(source.vision || stats.vision) || 0,
      Number(source.detector || stats.detector) || 0,
    );
    const detectorRange = Math.max(Number(source.detector || stats.detector) || 0, Number(stats.counterIntelRange) || 0);
    const uncloakedRange = ordinaryRange || Number(stats.weapon?.range) || Number(stats.interceptRange) || 0;
    const requestedRange = target?.cloaked ? detectorRange : uncloakedRange;
    return Math.max(0, requestedRange * (this.getJammingFactor?.(source) || 1));
  };

  GameClass.prototype.getIntegratedTrackQuality119 = function(teamKey, x, y, target = null) {
    const state = this.getIntegratedAirDefenseState119(teamKey);
    if (!state.online) return 0;
    if (target?.kind === 'unit' && this.isUndercoverTo?.(target, teamKey)) return 0;
    let best = 0;
    for (const source of state.sensors) {
      const range = this.getIntegratedSensorRange119(source, target);
      if (range <= 0) continue;
      const d = Math.hypot(source.x - x, source.y - y);
      if (d > range + (target?.radius || 0)) continue;
      const edgeFactor = .30 + .70 * (1 - clamp119(d / Math.max(1, range), 0, 1));
      const sourceQuality = Number(source.stats?.trackQuality) || (source.stats?.radarRelay ? .72 : .58);
      best = Math.max(best, sourceQuality * edgeFactor);
    }
    return clamp119(best, 0, 1.35);
  };

  const baseGetSensorSources119 = GameClass.prototype.getSensorSources;
  GameClass.prototype.getSensorSources = function(teamKey) {
    const local = baseGetSensorSources119?.call(this, teamKey) || [];
    const state = this.getIntegratedAirDefenseState119(teamKey);
    return state.online ? unique119([...local, ...state.sensors]) : local;
  };

  const baseUpdateVisibility119 = GameClass.prototype.updateVisibility;
  GameClass.prototype.updateVisibility = function(force = false) {
    const result = baseUpdateVisibility119.call(this, force);
    const state = this.getIntegratedAirDefenseState119('player');
    if (state.online) {
      for (const sensor of state.sensors) {
        const range = this.getIntegratedSensorRange119(sensor);
        if (range > (sensor.vision || 0) + 1) this.markVision(sensor.x, sensor.y, range);
      }
      for (let index = 0; index < this.visible.length; index += 1) {
        if (this.visible[index]) this.explored[index] = 1;
      }
    }
    return result;
  };

  const baseIsTargetableBy119 = GameClass.prototype.isTargetableBy;
  GameClass.prototype.isTargetableBy = function(entity, viewerTeam, observer = null) {
    if (baseIsTargetableBy119.call(this, entity, viewerTeam, observer)) return true;
    if (!observer || observer.team !== viewerTeam || !isAirDefense119(observer)) return false;
    if (!entity?.alive || entity.embarkedIn || entity.team === viewerTeam || entity.team === 'neutral') return false;
    return this.getIntegratedTrackQuality119(viewerTeam, entity.x, entity.y, entity) > .02;
  };

  const baseDefenderTracking119 = GameClass.prototype.getDefenderTrackingQuality;
  GameClass.prototype.getDefenderTrackingQuality = function(defender, projectile) {
    if (!defender?.stats?.requiresRadarTrack) return baseDefenderTracking119.call(this, defender, projectile);
    const d = Math.hypot(defender.x - projectile.x, defender.y - projectile.y);
    const directRange = defender.stats.directTrackRange || Math.min(defender.stats.interceptRange || 500, defender.vision || 340);
    if (d <= directRange) return .64 + .24 * (1 - d / Math.max(1, directRange));
    const networkQuality = this.getIntegratedTrackQuality119(defender.team, projectile.x, projectile.y, projectile);
    return networkQuality > .02 ? networkQuality : baseDefenderTracking119.call(this, defender, projectile);
  };

  GameClass.prototype.getTallestBuildingHeight119 = function() {
    const tick = Math.floor((Number(this.time) || 0) * .5);
    if (this._tallestBuildingHeight119?.tick === tick) return this._tallestBuildingHeight119.height;
    let height = 0;
    for (const [typeId, stats] of Object.entries(debug.BUILDING_TYPES || {})) {
      const footprint = this.getBuildingFootprint?.(typeId, 0, 'player');
      const fallback = (Number(stats.radius) || 32) * (Number(stats.visualScale) || 1) * 2.25;
      height = Math.max(height, Number(footprint?.height) || fallback);
    }
    height = Math.max(220, height);
    this._tallestBuildingHeight119 = { tick, height };
    return height;
  };

  GameClass.prototype.getAircraftCruiseAltitude119 = function(unit) {
    if (!unit?.air) return 0;
    const tallest = this.getTallestBuildingHeight119();
    const role = this.unitVisualRole?.(unit) || unit.stats?.visualRole || '';
    if (isFixedWing119(unit)) {
      const roleBonus = role === 'awacs' ? 85 : ['heavyBomber', 'strategicAirlifter'].includes(role) ? 35 : 0;
      return Math.max(FIXED_WING_MIN_ALTITUDE, tallest + BUILDING_CLEARANCE) + roleBonus;
    }
    return Math.max(ROTARY_MIN_ALTITUDE, tallest + 65);
  };

  GameClass.prototype.getAircraftFlightAltitude119 = function(unit) {
    if (!unit?.air) return 0;
    const radius = Math.max(4, unit.radius * (unit.stats?.visualScale || 1));
    if (unit.airServiceState === 'servicing' || unit.currentCommand?.stage === 'ready' || unit.currentCommand?.stage === 'service') {
      return radius * .72;
    }
    const cruise = this.getAircraftCruiseAltitude119(unit);
    if (unit.airServiceState === 'launch') {
      const field = this.getEntity?.(unit.airServiceTargetId);
      if (field?.alive) {
        const distance = Math.hypot(unit.x - field.x, unit.y - field.y);
        const start = Math.max(20, field.radius * .35);
        const end = Math.max(start + 1, field.radius + 230);
        const progress = clamp119((distance - start) / (end - start), 0, 1);
        const eased = progress * progress * (3 - 2 * progress);
        return radius * .72 + (cruise - radius * .72) * eased;
      }
    }
    return cruise;
  };

  const baseAimAltitude119 = GameClass.prototype.getEntityAimAltitude;
  GameClass.prototype.getEntityAimAltitude = function(entity) {
    if (entity?.kind === 'unit' && entity.air) return this.getAircraftFlightAltitude119(entity);
    return baseAimAltitude119.call(this, entity);
  };

  const baseWeaponMuzzle119 = GameClass.prototype.getUnitWeaponMuzzle;
  GameClass.prototype.getUnitWeaponMuzzle = function(unit, target = null) {
    const muzzle = baseWeaponMuzzle119.call(this, unit, target);
    if (unit?.air && muzzle) muzzle.z = this.getAircraftFlightAltitude119(unit) + Math.max(2, unit.radius * .05);
    return muzzle;
  };

  const baseRenderSelection119 = GameClass.prototype.renderSelectionUI;
  GameClass.prototype.renderSelectionUI = function(...args) {
    const result = baseRenderSelection119.apply(this, args);
    const details = document.getElementById('selection-details');
    details?.querySelector('[data-integrated-air119]')?.remove();
    const primary = this.selected?.length === 1 ? this.selected[0] : null;
    if (!details || !primary) return result;

    const lines = [];
    if (primary.typeId === 'radar' || primary.typeId === 'awacs' || isAirDefense119(primary)) {
      const state = this.getIntegratedAirDefenseState119(primary.team, true);
      const status = state.online ? 'АКТИВЕН' : state.reason === 'no-power' ? 'НЕТ ЭЛЕКТРИЧЕСТВА' : 'НУЖЕН РАДИОЛОКАЦИОННЫЙ УЗЕЛ';
      lines.push(`<div class="stat-line"><span>Единый контур ПВО</span><strong>${status}</strong></div>`);
      if (state.online) lines.push(`<div class="stat-line"><span>Объединено средств обнаружения</span><strong>${state.sensors.length}</strong></div>`);
    }
    if (primary.kind === 'unit' && primary.air && primary.airServiceState !== 'servicing') {
      lines.push(`<div class="stat-line"><span>Высота полёта</span><strong>${Math.round(this.getAircraftFlightAltitude119(primary))} · выше высотной отметки базы</strong></div>`);
    }
    if (lines.length) details.insertAdjacentHTML('beforeend', `<div data-integrated-air119>${lines.join('')}</div>`);
    return result;
  };

  void 0;
  const eyebrow = document.querySelector('#start-screen .eyebrow');
  if (eyebrow) void 0;
  const lead = document.querySelector('#start-screen .lead');
  if (lead) void 0;
  const strip = document.querySelector('#start-screen .feature-strip');
  if (strip && !strip.querySelector('[data-integrated-air119-feature]')) {
    void 0;
  }

  window.__FD_INTEGRATED_AIR_OPERATIONS_V119__ = {
    version: VERSION,
    isAirDefense: isAirDefense119,
    isFixedWing: isFixedWing119,
    get state() {
      const game = debug.game;
      return game?.getIntegratedAirDefenseState119('player', true) || null;
    },
  };
})();
