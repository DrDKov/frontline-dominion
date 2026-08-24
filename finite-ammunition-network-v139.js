(() => {
  'use strict';

  const debug = window.__FD_DEBUG__;
  const GameClass = debug?.Game;
  const UnitClass = debug?.Unit;
  const BuildingClass = debug?.Building;
  const buildingTypes = debug?.BUILDING_TYPES;
  if (!GameClass || !UnitClass || !BuildingClass || !buildingTypes) return;

  const VERSION = '13.9';
  const MAX_PHYSICAL_FOLLOWUPS_PER_TICK = 3;
  const clamp139 = (value, min, max) => Math.max(min, Math.min(max, value));
  const distance139 = (left, right) => Math.hypot((left?.x || 0) - (right?.x || 0), (left?.y || 0) - (right?.y || 0));
  const isFixedWing139 = (unit) => Boolean(
    unit?.alive && unit.air && unit.stats?.mobilityClass === 'fixedWing' &&
    !/helicopter|lightGunship|transportHelicopter/i.test(`${unit.typeId || ''} ${unit.stats?.visualRole || ''}`),
  );

  function inferredAirCapacity139(unit) {
    const declared = Number(unit?.stats?.sortieAmmoMax);
    if (Number.isFinite(declared)) return Math.max(0, Math.floor(declared));
    if (!unit?.stats?.weapon || !isFixedWing139(unit)) return 0;
    const role = unit?.game?.unitVisualRole?.(unit) || unit?.stats?.visualRole || '';
    if (role === 'interceptor') return 10;
    if (role === 'multirole') return 8;
    if (role === 'bomber') return 6;
    if (role === 'heavyBomber') return 5;
    if (role === 'stealthStriker') return 6;
    if (role === 'aerialArtillery') return 7;
    if (role === 'aeroBallisticCarrier') return 0;
    return 8;
  }

  // Direct tracking remains deliberately shorter than the missile envelope.
  // The extended envelope is unlocked only by the existing powered integrated
  // radar picture, so a launcher always fires within its own physical range.
  const DEFENSE_RANGE139 = Object.freeze({
    missileBattery: Object.freeze({ direct: 390, network: 920, ceiling: 1050, label: 'ракетная батарея' }),
    orbitalDefense: Object.freeze({ direct: 520, network: 2100, ceiling: 2200, label: 'высотный комплекс' }),
    abmBattery: Object.freeze({ direct: 510, network: 1380, ceiling: 1500, label: 'противоракетная батарея' }),
  });

  for (const [typeId, config] of Object.entries(DEFENSE_RANGE139)) {
    const stats = buildingTypes[typeId];
    if (!stats) continue;
    stats.requiresRadarTrack = true;
    stats.directTrackRange = config.direct;
    stats.interceptRange = Math.min(config.network, config.ceiling);
    stats.networkEngagementRange139 = Math.min(config.network, config.ceiling);
    if (stats.weapon?.targets?.includes('air')) {
      stats.weapon.directRange139 = Number(stats.weapon.directRange139) || Number(stats.weapon.range) || config.direct;
      stats.weapon.networkRange139 = Math.min(config.network, config.ceiling);
    }
  }

  function ammoStore139(unit, initialize = false) {
    if (!unit) return null;
    if (initialize && (!Number.isFinite(unit.airAmmoMax) || unit.airAmmoMax < 0) && isFixedWing139(unit)) {
      unit.airAmmoMax = inferredAirCapacity139(unit);
      if (!Number.isFinite(unit.airAmmo)) unit.airAmmo = unit.airAmmoMax;
    }
    if (Number.isFinite(unit.airAmmoMax) && unit.airAmmoMax > 0) {
      if (initialize && !Number.isFinite(unit.airAmmo)) unit.airAmmo = unit.airAmmoMax;
      if (!Number.isFinite(unit.airAmmo)) return null;
      return {
        kind: 'air', key: 'airAmmo', maxKey: 'airAmmoMax',
        get value() { return Number(unit.airAmmo) || 0; },
        get max() { return Number(unit.airAmmoMax) || 0; },
        set(value) { unit.airAmmo = clamp139(value, 0, unit.airAmmoMax); },
      };
    }

    const declaredStores = [
      ['ammo', 'ammoMax'],
      ['weaponAmmo', 'weaponAmmoMax'],
      ['munitionAmmo', 'munitionAmmoMax'],
    ];
    for (const [key, maxKey] of declaredStores) {
      if (!Number.isFinite(unit[maxKey]) || unit[maxKey] <= 0) continue;
      if (initialize && !Number.isFinite(unit[key])) unit[key] = unit[maxKey];
      if (!Number.isFinite(unit[key])) continue;
      return {
        kind: 'field', key, maxKey,
        get value() { return Number(unit[key]) || 0; },
        get max() { return Number(unit[maxKey]) || 0; },
        set(value) { unit[key] = clamp139(value, 0, unit[maxKey]); },
      };
    }

    const declaredCapacity = Number(unit.stats?.magazineCapacity);
    if (!Number.isFinite(declaredCapacity) || declaredCapacity <= 0) return null;
    if (!Number.isFinite(unit.magazineAmmoMax139)) unit.magazineAmmoMax139 = Math.max(1, Math.floor(declaredCapacity));
    if (initialize && !Number.isFinite(unit.magazineAmmo139)) unit.magazineAmmo139 = unit.magazineAmmoMax139;
    if (!Number.isFinite(unit.magazineAmmo139)) return null;
    return {
      kind: 'field', key: 'magazineAmmo139', maxKey: 'magazineAmmoMax139',
      get value() { return Number(unit.magazineAmmo139) || 0; },
      get max() { return Number(unit.magazineAmmoMax139) || 0; },
      set(value) { unit.magazineAmmo139 = clamp139(value, 0, unit.magazineAmmoMax139); },
    };
  }

  function volleyInterval139(unit) {
    const explicit = Number(unit?.stats?.limitedAmmoInterval ?? unit?.stats?.weapon?.salvoInterval);
    if (Number.isFinite(explicit) && explicit > 0) return clamp139(explicit, .12, .55);
    const role = unit?.game?.unitVisualRole?.(unit) || unit?.stats?.visualRole || '';
    if (role === 'interceptor') return .18;
    if (role === 'multirole') return .21;
    if (['bomber', 'stealthStriker'].includes(role)) return .30;
    if (role === 'heavyBomber') return .36;
    if (role === 'aerialArtillery') return .26;
    return unit?.air ? .24 : .28;
  }

  function fieldReloadDuration139(unit) {
    const explicit = Number(unit?.stats?.magazineReload ?? unit?.stats?.limitedAmmoReload);
    return Number.isFinite(explicit) && explicit > 0 ? clamp139(explicit, 1.5, 30) : 6.4;
  }

  function startFollowupSalvo139(unit, target, store) {
    if (!target?.alive || store.value <= 0 || unit.airServiceState || unit._finiteSalvoFollowup139) return;
    const interval = volleyInterval139(unit);
    unit._finiteSalvo139 = {
      targetId: target.id,
      nextAt: (Number(unit.game?.time) || 0) + interval,
      interval,
      expiresAt: (Number(unit.game?.time) || 0) + Math.max(2.4, interval * (store.value + 3)),
    };
  }

  function finishFieldRack139(unit, store) {
    if (store.kind === 'air' || store.value > 0) return;
    unit.magazineReloadRemaining139 = fieldReloadDuration139(unit);
    unit._finiteSalvo139 = null;
  }

  const baseUnitFire139 = UnitClass.prototype.fire;
  UnitClass.prototype.fire = function(target) {
    const storeBefore = ammoStore139(this, true);
    if (storeBefore?.kind === 'field' && (this.magazineReloadRemaining139 > 0 || storeBefore.value <= 0)) return false;
    const beforeAmmo = storeBefore?.value;
    const beforeProjectiles = this.game?.projectiles?.length || 0;
    const beforeShotAt = this.lastShotAt;
    const result = baseUnitFire139.call(this, target);
    const storeAfterBase = ammoStore139(this, true);
    const committed = Boolean(
      (this.game?.projectiles?.length || 0) > beforeProjectiles ||
      this.lastShotAt !== beforeShotAt ||
      storeAfterBase && Number.isFinite(beforeAmmo) && storeAfterBase.value < beforeAmmo
    );
    if (!committed || !storeAfterBase) return result;

    // Aircraft logistics already debits airAmmo in the authoritative fire
    // path. Other finite stores are debited here exactly once.
    if (storeAfterBase.kind === 'field' && storeAfterBase.value >= beforeAmmo) {
      storeAfterBase.set(storeAfterBase.value - 1);
    }
    const store = ammoStore139(this, true);
    const interval = volleyInterval139(this);
    this.limitedSalvoInterval139 = interval;
    this.limitedSalvoShots139 = (this.limitedSalvoShots139 || 0) + 1;
    if (store.value > 0) {
      this.weaponCooldown = Math.min(Number.isFinite(this.weaponCooldown) ? this.weaponCooldown : interval, interval);
      startFollowupSalvo139(this, target, store);
    } else {
      this._finiteSalvo139 = null;
      finishFieldRack139(this, store);
    }
    this.game.uiDirty = true;
    return result;
  };

  function updateFieldReload139(unit, dt) {
    const store = ammoStore139(unit, true);
    if (!store || store.kind !== 'field' || !(unit.magazineReloadRemaining139 > 0)) return;
    unit.magazineReloadRemaining139 = Math.max(0, unit.magazineReloadRemaining139 - dt);
    if (unit.magazineReloadRemaining139 <= 0) {
      store.set(store.max);
      unit.weaponCooldown = 0;
      unit.game.uiDirty = true;
    }
  }

  function processFollowupSalvo139(unit) {
    const salvo = unit._finiteSalvo139;
    if (!salvo || unit.airServiceState || (Number(unit.game?.time) || 0) < salvo.nextAt) return;
    const store = ammoStore139(unit, true);
    const target = unit.game?.getEntity?.(salvo.targetId);
    const range = Math.max(1, Number(unit.stats?.weapon?.range) || 0);
    if (!store || store.value <= 0 || !target?.alive || target.team === unit.team ||
      !unit.canAttack?.(target) || distance139(unit, target) > range * 1.38 + (target.radius || 0) ||
      (Number(unit.game?.time) || 0) > salvo.expiresAt) {
      unit._finiteSalvo139 = null;
      return;
    }

    let releases = 0;
    while (unit._finiteSalvo139 && store.value > 0 &&
      (Number(unit.game?.time) || 0) + .0001 >= unit._finiteSalvo139.nextAt &&
      releases < MAX_PHYSICAL_FOLLOWUPS_PER_TICK) {
      const before = store.value;
      unit.weaponCooldown = 0;
      unit._finiteSalvoFollowup139 = true;
      try { unit.fire(target); }
      finally { unit._finiteSalvoFollowup139 = false; }
      const after = ammoStore139(unit, true)?.value ?? before;
      if (after >= before) {
        unit._finiteSalvo139 = null;
        break;
      }
      releases += 1;
      if (after <= 0 || unit.airServiceState) {
        unit._finiteSalvo139 = null;
        break;
      }
      unit._finiteSalvo139.nextAt += unit._finiteSalvo139.interval;
    }
  }

  const baseUnitUpdate139 = UnitClass.prototype.update;
  UnitClass.prototype.update = function(dt) {
    updateFieldReload139(this, dt);
    const result = baseUnitUpdate139.call(this, dt);
    processFollowupSalvo139(this);
    return result;
  };

  // The 20k army path aggregates an off-screen finite salvo into one damage
  // transaction. On-screen aircraft still create every visible missile in a
  // timed ripple. This keeps the same combat result without projectile storms.
  GameClass.prototype.resolveFiniteMagazineAttack139 = function(attacker, target, context = {}) {
    const store = ammoStore139(attacker, true);
    if (!store) return undefined;
    if (attacker.airServiceState || attacker.magazineReloadRemaining139 > 0) return true;
    if (store.value <= 0) {
      if (store.kind === 'air') attacker.requestAirService?.('боезапас исчерпан');
      else finishFieldRack139(attacker, store);
      return true;
    }
    if ((attacker.weaponCooldown || 0) > 0 || !target?.alive || !attacker.canAttack?.(target)) return true;

    const visible = Boolean(attacker.selected || this.isOnScreen?.(attacker.x, attacker.y, 360));
    if (visible && (!attacker.air || (this._airVisualOrdnanceBudget133 || 0) > 0)) {
      if (attacker.air) this._airVisualOrdnanceBudget133 -= 1;
      attacker.fire(target);
      return true;
    }

    const weapon = context.weapon || attacker.stats?.weapon;
    if (!weapon) return true;
    let shots = Math.min(8, Math.max(1, Math.floor(store.value)));
    let engagementCost = 0;
    if (target.air && typeof this.getAirEngagementCost126 === 'function') {
      engagementCost = Math.max(0, Number(this.getAirEngagementCost126(attacker)) || 0);
      if (engagementCost > 0) {
        const affordable = Math.floor(Math.max(0, Number(this.teams?.[attacker.team]?.credits) || 0) / engagementCost);
        if (affordable <= 0) {
          attacker.weaponCooldown = Math.max(attacker.weaponCooldown || 0, .45);
          return true;
        }
        shots = Math.min(shots, affordable);
      }
    }
    store.set(store.value - shots);
    attacker.lastShotAt = this.time;
    attacker.weaponCooldown = volleyInterval139(attacker);
    const veteran = 1 + ((attacker.rank || 1) - 1) * .14;
    target.takeDamage?.(Math.max(0, Number(weapon.damage) || 0) * shots * veteran, attacker, weapon);
    if (engagementCost > 0) this.recordAirEngagementSpend126?.(attacker, engagementCost * shots);
    attacker.limitedSalvoShots139 = (attacker.limitedSalvoShots139 || 0) + shots;
    this._finiteAmmunitionMetrics139 ||= { physicalReleases: 0, aggregatedReleases: 0, aggregatedRounds: 0 };
    this._finiteAmmunitionMetrics139.aggregatedReleases += 1;
    this._finiteAmmunitionMetrics139.aggregatedRounds += shots;
    if (store.value <= 0) {
      if (store.kind === 'air') attacker.requestAirService?.('боезапас исчерпан');
      else finishFieldRack139(attacker, store);
    }
    this.uiDirty = true;
    return true;
  };

  // At ordinary scale the FSM starts its safe exit after the first release;
  // the queued rounds above continue leaving the rails while the aircraft
  // remains in motion. No formation member waits for another aircraft.
  const baseMission139 = UnitClass.prototype.processFixedWingMission133;
  if (baseMission139) UnitClass.prototype.processFixedWingMission133 = function(command, dt) {
    const before = ammoStore139(this, true)?.value;
    const result = baseMission139.call(this, command, dt);
    const after = ammoStore139(this, true)?.value;
    if (isFixedWing139(this) && Number.isFinite(before) && Number.isFinite(after) && after < before && after > 0) {
      const target = this.game.getEntity?.(this._airFsm133?.targetId || command?.targetId);
      if (target?.alive) startFollowupSalvo139(this, target, ammoStore139(this, true));
    }
    return result;
  };

  const baseTracking139 = GameClass.prototype.getDefenderTrackingQuality;
  GameClass.prototype.getDefenderTrackingQuality = function(defender, projectile) {
    const config = DEFENSE_RANGE139[defender?.typeId];
    if (!config) return baseTracking139.call(this, defender, projectile);
    const d = distance139(defender, projectile);
    const maximum = Math.min(config.network, config.ceiling);
    if (d > maximum + (projectile?.radius || 0)) return 0;
    if (d <= config.direct + (projectile?.radius || 0)) {
      return Math.max(.52, Number(baseTracking139.call(this, defender, projectile)) || 0);
    }
    const state = this.getIntegratedAirDefenseState119?.(defender.team);
    if (!state?.online) return 0;
    return Math.max(0, Number(this.getIntegratedTrackQuality119?.(
      defender.team, projectile.x, projectile.y, projectile,
    )) || 0);
  };

  GameClass.prototype.getNearestAirDefenseLauncher139 = function(teamKey, x, y, target = null) {
    let best = null;
    let bestDistance = Infinity;
    for (const launcher of [...(this.buildings || []), ...(this.units || [])]) {
      if (!launcher?.alive || launcher.team !== teamKey || !launcher.stats?.interceptPower) continue;
      if (launcher.kind === 'building' && (!launcher.completed ||
        (this.isStationaryDefensePowered && !this.isStationaryDefensePowered(launcher)))) continue;
      const classes = launcher.stats.interceptClasses || ['low', 'medium'];
      if (target?.defenseClass && !classes.includes(target.defenseClass)) continue;
      const range = Number(launcher.stats.networkEngagementRange139 || launcher.stats.interceptRange) || 0;
      const d = Math.hypot(launcher.x - x, launcher.y - y);
      if (d > range + (target?.radius || 0) || d >= bestDistance) continue;
      best = launcher;
      bestDistance = d;
    }
    return best;
  };

  // Networked launchers first search the air picture out to their own bounded
  // missile envelope. If no airborne target is available, the missile battery
  // keeps its former shorter mixed ground/air behaviour.
  const baseBuildingWeapon139 = BuildingClass.prototype.updateWeapon;
  BuildingClass.prototype.updateWeapon = function(dt) {
    const config = DEFENSE_RANGE139[this.typeId];
    const weapon = this.stats?.weapon;
    if (!config || !weapon?.targets?.includes('air')) return baseBuildingWeapon139.call(this, dt);
    const directRange = Number(weapon.directRange139) || Number(buildingTypes[this.typeId]?.weapon?.directRange139) || Number(weapon.range) || config.direct;
    const state = this.game.getIntegratedAirDefenseState119?.(this.team);
    if (state?.online) {
      const oldRange = weapon.range;
      const oldTargets = weapon.targets;
      weapon.range = Math.min(config.network, config.ceiling);
      weapon.targets = ['air'];
      try { baseBuildingWeapon139.call(this, dt); }
      finally { weapon.range = oldRange; weapon.targets = oldTargets; }
      if (this.weaponTargetId) return;
    }
    const oldRange = weapon.range;
    weapon.range = directRange;
    try { return baseBuildingWeapon139.call(this, dt); }
    finally { weapon.range = oldRange; }
  };

  const baseSerialize139 = UnitClass.prototype.serialize;
  if (baseSerialize139) UnitClass.prototype.serialize = function() {
    const data = baseSerialize139.call(this);
    const store = ammoStore139(this, false);
    if (store) {
      Object.assign(data, {
        magazineAmmo139: this.magazineAmmo139,
        magazineAmmoMax139: this.magazineAmmoMax139,
        magazineReloadRemaining139: this.magazineReloadRemaining139 || 0,
        finiteSalvo139: this._finiteSalvo139 ? { ...this._finiteSalvo139 } : null,
        limitedSalvoShots139: this.limitedSalvoShots139 || 0,
      });
    }
    return data;
  };

  const baseHydrate139 = GameClass.prototype.hydrate;
  if (baseHydrate139) GameClass.prototype.hydrate = function(data) {
    const result = baseHydrate139.call(this, data);
    const saved = new Map((data?.entities || []).map((entity) => [entity.id, entity]));
    for (const unit of this.units || []) {
      const raw = saved.get(unit.id) || {};
      if (Number.isFinite(raw.magazineAmmoMax139)) unit.magazineAmmoMax139 = raw.magazineAmmoMax139;
      if (Number.isFinite(raw.magazineAmmo139)) unit.magazineAmmo139 = raw.magazineAmmo139;
      unit.magazineReloadRemaining139 = Math.max(0, Number(raw.magazineReloadRemaining139) || 0);
      unit._finiteSalvo139 = raw.finiteSalvo139 ? { ...raw.finiteSalvo139 } : null;
      unit.limitedSalvoShots139 = Number(raw.limitedSalvoShots139) || 0;
      ammoStore139(unit, true);
    }
    return result;
  };

  const baseSelection139 = GameClass.prototype.renderSelectionUI;
  if (baseSelection139) GameClass.prototype.renderSelectionUI = function(...args) {
    const result = baseSelection139.apply(this, args);
    if (this.selected?.length !== 1) return result;
    const entity = this.selected[0];
    const details = document.getElementById?.('selection-details');
    if (!details || details.querySelector?.('[data-finite-ammunition139]')) return result;
    const lines = [];
    if (entity?.kind === 'unit') {
      const store = ammoStore139(entity, false);
      if (store) {
        const status = entity.airServiceState
          ? 'перевооружение на аэродроме'
          : entity.magazineReloadRemaining139 > 0
            ? `перезарядка ${Math.ceil(entity.magazineReloadRemaining139)} с`
            : 'готов к пакетному пуску';
        lines.push(`<div class="stat-line"><span>Пакетный боезапас</span><strong>${Math.floor(store.value)} / ${Math.floor(store.max)}</strong></div>`);
        lines.push(`<div class="stat-line"><span>Интервал пуска</span><strong>${volleyInterval139(entity).toFixed(2)} с · ${status}</strong></div>`);
      }
    }
    const rangeConfig = DEFENSE_RANGE139[entity?.typeId];
    if (rangeConfig) {
      const state = this.getIntegratedAirDefenseState119?.(entity.team);
      lines.push(`<div class="stat-line"><span>Рубеж перехвата</span><strong>${state?.online ? rangeConfig.network : rangeConfig.direct} · ${state?.online ? 'по сети РЛС / ДРЛО' : 'локальное наведение'}</strong></div>`);
    }
    if (lines.length) details.insertAdjacentHTML('beforeend', `<div data-finite-ammunition139>${lines.join('')}</div>`);
    return result;
  };

  if (typeof document !== 'undefined') {
    void 0;
    const eyebrow = document.querySelector?.('#start-screen .eyebrow');
    if (eyebrow) void 0;
    const lead = document.querySelector?.('#start-screen .lead');
    if (lead) void 0;
    const strip = document.querySelector?.('#start-screen .feature-strip');
    if (strip && !strip.querySelector?.('[data-finite-ammunition139-feature]')) {
      void 0;
    }
  }

  window.__FD_FINITE_AMMUNITION_NETWORK_V139__ = Object.freeze({
    version: VERSION,
    defenseRanges: DEFENSE_RANGE139,
    ammoStore: ammoStore139,
    volleyInterval: volleyInterval139,
    snapshot(unit) {
      const store = ammoStore139(unit, false);
      return store ? {
        kind: store.kind,
        ready: store.value,
        capacity: store.max,
        interval: volleyInterval139(unit),
        reloadRemaining: unit.magazineReloadRemaining139 || 0,
        queued: Boolean(unit._finiteSalvo139),
      } : null;
    },
  });
})();
