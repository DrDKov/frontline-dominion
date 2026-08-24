(() => {
  'use strict';

  const debug = window.__FD_DEBUG__;
  const GameClass = debug?.Game;
  const BuildingClass = debug?.Building;
  const buildingTypes = debug?.BUILDING_TYPES;
  if (!GameClass || !BuildingClass || !buildingTypes) return;

  const VERSION = '13.6';
  const clamp136 = (value, min, max) => Math.max(min, Math.min(max, value));
  const SALVO_CONFIG136 = Object.freeze({
    // Eight ready rounds reproduce the visible multi-rail battery: launchers
    // ripple-fire one missile at a time, then the whole rack is replenished.
    missileBattery: Object.freeze({ capacity: 8, interval: .28, reload: 6.8, label: '8-ракетный пакет' }),
    // The high-altitude installation carries three large, expensive effectors.
    orbitalDefense: Object.freeze({ capacity: 3, interval: .44, reload: 5.4, label: '3 высотных перехватчика' }),
    // The ABM battery has eight ready canisters and a slower handling cycle.
    abmBattery: Object.freeze({ capacity: 8, interval: .38, reload: 7.6, label: '8 противоракет' }),
  });

  for (const [typeId, config] of Object.entries(SALVO_CONFIG136)) {
    const stats = buildingTypes[typeId];
    if (!stats) continue;
    stats.salvoCapacity = config.capacity;
    stats.salvoInterval = config.interval;
    stats.salvoReload = config.reload;
    stats.salvoLabel = config.label;
  }

  const configFor136 = (building) => SALVO_CONFIG136[building?.typeId] || null;

  function ensureLauncher136(building) {
    const config = configFor136(building);
    if (!config) return null;
    building.missileRackCapacity136 = config.capacity;
    if (!Number.isFinite(building.missilesReady136)) building.missilesReady136 = config.capacity;
    building.missilesReady136 = clamp136(Math.floor(building.missilesReady136), 0, config.capacity);
    if (!Number.isFinite(building.missileSalvoCooldown136)) building.missileSalvoCooldown136 = 0;
    if (!Number.isFinite(building.missileRackReload136)) building.missileRackReload136 = 0;
    building.missileSalvoCooldown136 = Math.max(0, building.missileSalvoCooldown136);
    building.missileRackReload136 = Math.max(0, building.missileRackReload136);
    if (building.missilesReady136 <= 0 && building.missileRackReload136 <= 0) {
      building.missileRackReload136 = config.reload;
    }
    return config;
  }

  const launcherPowered136 = (building) => {
    if (!building?.alive || !building.completed || building.sabotagedUntil > building.game.time) return false;
    if (typeof building.game.isStationaryDefensePowered === 'function') {
      return building.game.isStationaryDefensePowered(building);
    }
    const team = building.game.teams?.[building.team];
    return Boolean(team?.powerProduced > 0 && team.powerProduced + .001 >= (team.powerUsed || 0));
  };

  function launcherCanFire136(building) {
    const config = ensureLauncher136(building);
    return Boolean(config && launcherPowered136(building) && building.missilesReady136 > 0 &&
      building.missileRackReload136 <= 0 && building.missileSalvoCooldown136 <= 0);
  }

  function consumeLauncherRound136(building) {
    const config = ensureLauncher136(building);
    if (!config || building.missilesReady136 <= 0) return false;
    building.missilesReady136 -= 1;
    building.missileSalvoCooldown136 = config.interval;
    if (building.missilesReady136 <= 0) {
      building.missilesReady136 = 0;
      building.missileRackReload136 = config.reload;
    }
    building.game.uiDirty = true;
    return true;
  }

  function updateLauncher136(building, dt) {
    const config = ensureLauncher136(building);
    if (!config || !launcherPowered136(building)) return;
    building.missileSalvoCooldown136 = Math.max(0, building.missileSalvoCooldown136 - dt);
    if (building.missileRackReload136 <= 0) return;
    const oldSecond = Math.ceil(building.missileRackReload136);
    building.missileRackReload136 = Math.max(0, building.missileRackReload136 - dt);
    if (building.missileRackReload136 <= 0) {
      building.missilesReady136 = config.capacity;
      building.missileSalvoCooldown136 = 0;
      building.game.uiDirty = true;
      if (building.selected && building.team === 'player') {
        building.game.addEffect?.({
          type: 'text', x: building.x, y: building.y - building.radius,
          text: 'ПАКЕТ ГОТОВ', color: '#9ff1bf', duration: .9,
        });
      }
    } else if (building.selected && Math.ceil(building.missileRackReload136) !== oldSecond) {
      building.game.uiDirty = true;
    }
  }

  // The rack clock advances before the legacy building update, allowing a
  // freshly replenished launcher to engage on the exact completion tick.
  const baseBuildingUpdate136 = BuildingClass.prototype.update;
  BuildingClass.prototype.update = function(dt) {
    if (configFor136(this)) updateLauncher136(this, dt);
    return baseBuildingUpdate136.call(this, dt);
  };

  // Ordinary anti-air/ground fire and projectile interception draw from the
  // same physical rack. A missile cannot be spent twice in one simulation tick.
  const baseBuildingFire136 = BuildingClass.prototype.fire;
  BuildingClass.prototype.fire = function(target) {
    const config = configFor136(this);
    if (!config) return baseBuildingFire136.call(this, target);
    if (!launcherCanFire136(this)) return false;
    const previousReload = this.stats.weapon?.reload;
    const previousSequence = this.shotSequence || 0;
    if (this.stats.weapon) this.stats.weapon.reload = config.interval;
    let result;
    try {
      result = baseBuildingFire136.call(this, target);
    } finally {
      if (this.stats.weapon) this.stats.weapon.reload = previousReload;
    }
    if ((this.shotSequence || 0) !== previousSequence) consumeLauncherRound136(this);
    return result;
  };

  // The centralized v12.5 fire-control allocator owns interception. Temporarily
  // mask an empty/busy rack, then detect its authoritative launch sequence and
  // debit exactly one ready interceptor after the allocator has committed it.
  const baseInterception136 = GameClass.prototype.updateProjectileInterception;
  GameClass.prototype.updateProjectileInterception = function(dt) {
    const launchers = [];
    for (const building of this.buildings || []) {
      const config = configFor136(building);
      if (!config || !building.alive || !building.stats?.interceptPower) continue;
      ensureLauncher136(building);
      const record = {
        building,
        config,
        sequence: building.shotSequence || 0,
        interceptCooldown: building.interceptCooldown || 0,
        interceptReload: building.stats.interceptReload,
        blocked: !launcherCanFire136(building),
      };
      if (record.blocked) building.interceptCooldown = Number.MAX_SAFE_INTEGER;
      else building.stats.interceptReload = config.interval;
      launchers.push(record);
    }

    let result;
    try {
      result = baseInterception136.call(this, dt);
    } finally {
      for (const record of launchers) {
        const { building } = record;
        building.stats.interceptReload = record.interceptReload;
        if (record.blocked) building.interceptCooldown = record.interceptCooldown;
        else if ((building.shotSequence || 0) !== record.sequence) consumeLauncherRound136(building);
      }
    }
    return result;
  };

  // Save files and multiplayer snapshots retain partial racks and reload
  // progress instead of silently granting a full magazine after reconnect.
  const baseBuildingSerialize136 = BuildingClass.prototype.serialize;
  BuildingClass.prototype.serialize = function() {
    const data = baseBuildingSerialize136.call(this);
    if (ensureLauncher136(this)) {
      Object.assign(data, {
        missilesReady136: this.missilesReady136,
        missileRackCapacity136: this.missileRackCapacity136,
        missileRackReload136: this.missileRackReload136,
        missileSalvoCooldown136: this.missileSalvoCooldown136,
      });
    }
    return data;
  };

  const baseHydrate136 = GameClass.prototype.hydrate;
  if (baseHydrate136) GameClass.prototype.hydrate = function(data) {
    const result = baseHydrate136.call(this, data);
    const saved = new Map((data?.entities || []).map((entity) => [entity.id, entity]));
    for (const building of this.buildings || []) {
      const config = configFor136(building);
      if (!config) continue;
      const raw = saved.get(building.id) || {};
      building.missilesReady136 = Number.isFinite(raw.missilesReady136) ? raw.missilesReady136 : config.capacity;
      building.missileRackReload136 = Number.isFinite(raw.missileRackReload136) ? raw.missileRackReload136 : 0;
      building.missileSalvoCooldown136 = Number.isFinite(raw.missileSalvoCooldown136) ? raw.missileSalvoCooldown136 : 0;
      ensureLauncher136(building);
    }
    return result;
  };

  const baseRenderSelection136 = GameClass.prototype.renderSelectionUI;
  if (baseRenderSelection136) GameClass.prototype.renderSelectionUI = function(...args) {
    const result = baseRenderSelection136.apply(this, args);
    if (this.selected?.length !== 1) return result;
    const building = this.selected[0];
    const config = configFor136(building);
    if (!config || !ensureLauncher136(building)) return result;
    const details = document.getElementById?.('selection-details');
    if (!details || details.querySelector?.('[data-missile-salvo136]')) return result;
    const reloading = building.missileRackReload136 > 0;
    const status = reloading
      ? `перезарядка ${Math.ceil(building.missileRackReload136)} с`
      : building.missileSalvoCooldown136 > 0 ? 'следующий пуск' : 'готов к залпу';
    details.insertAdjacentHTML('beforeend',
      `<div data-missile-salvo136><div class="stat-line"><span>Готовые ракеты</span><strong>${building.missilesReady136} / ${config.capacity}</strong></div>` +
      `<div class="stat-line"><span>Пакетный огонь</span><strong>${status}</strong></div></div>`);
    return result;
  };

  if (typeof document !== 'undefined') {
    void 0;
    const eyebrow = document.querySelector?.('#start-screen .eyebrow');
    if (eyebrow) void 0;
    const lead = document.querySelector?.('#start-screen .lead');
    if (lead) void 0;
    const strip = document.querySelector?.('#start-screen .feature-strip');
    if (strip && !strip.querySelector?.('[data-missile-salvo136-feature]')) {
      void 0;
    }
  }

  window.__FD_MISSILE_SALVO__ = Object.freeze({
    version: VERSION,
    configs: SALVO_CONFIG136,
    ensure: ensureLauncher136,
    canFire: launcherCanFire136,
    consume: consumeLauncherRound136,
    update: updateLauncher136,
    snapshot(building) {
      const config = ensureLauncher136(building);
      return config ? {
        typeId: building.typeId,
        ready: building.missilesReady136,
        capacity: config.capacity,
        salvoCooldown: building.missileSalvoCooldown136,
        reloadRemaining: building.missileRackReload136,
      } : null;
    },
  });
})();
