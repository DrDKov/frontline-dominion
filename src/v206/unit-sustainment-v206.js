(() => {
  'use strict';
  const root = typeof window !== 'undefined' ? window : self;
  const L = root.__FD_LOGISTICS206__;
  const D = root.__FD_DEBUG__;
  if (!L || !D?.Game || !D?.Unit || !D?.Building) return;
  const { Game, Unit, Building } = D;
  if (Game.prototype.__fdUnitSustainment206Installed) return;
  Object.defineProperty(Game.prototype, '__fdUnitSustainment206Installed', { value: true, configurable: true });
  const EPS = 1e-6;

  function readyField206(unit) {
    if (Number.isFinite(unit?.ammoMax) && unit.ammoMax > 0) return ['ammo', 'ammoMax'];
    if (Number.isFinite(unit?.weaponAmmoMax) && unit.weaponAmmoMax > 0) return ['weaponAmmo', 'weaponAmmoMax'];
    if (Number.isFinite(unit?.munitionAmmoMax) && unit.munitionAmmoMax > 0) return ['munitionAmmo', 'munitionAmmoMax'];
    if (Number.isFinite(unit?.magazineAmmoMax139) && unit.magazineAmmoMax139 > 0) return ['magazineAmmo139', 'magazineAmmoMax139'];
    const declared = Number(unit?.stats?.magazineCapacity) || 0;
    if (declared <= 0) return null;
    unit.magazineAmmoMax139 = Math.max(1, Math.floor(declared));
    if (!Number.isFinite(unit.magazineAmmo139)) unit.magazineAmmo139 = unit.magazineAmmoMax139;
    return ['magazineAmmo139', 'magazineAmmoMax139'];
  }

  function syncReadyToLegacy206(unit, state) {
    const field = readyField206(unit);
    if (!field) return;
    const max = Math.max(0, Number(state.ammoReadyMax) || Number(unit[field[1]]) || 0);
    unit[field[1]] = max;
    unit[field[0]] = L.round(L.clamp(state.ammoReady, 0, max));
  }

  function syncReadyFromLegacy206(unit, state) {
    const field = readyField206(unit);
    if (!field) return;
    state.ammoReadyMax = Math.max(0, Number(unit[field[1]]) || state.ammoReadyMax || 0);
    state.ammoReady = L.round(L.clamp(unit[field[0]], 0, state.ammoReadyMax));
  }

  function reloadDuration206(unit) {
    const raw = Number(unit?.stats?.magazineReload ?? unit?.stats?.limitedAmmoReload);
    return Number.isFinite(raw) && raw > 0 ? L.clamp(raw, 1.5, 30) : 6.4;
  }

  function startReload206(unit, state) {
    if (!state || state.ammoReadyMax <= 0 || state.ammoReady > EPS) return false;
    if (state.reloadRemaining206 > EPS) return true;
    if (state.ammoReserve <= EPS) {
      unit.magazineReloadRemaining139 = 0;
      return false;
    }
    state.reloadRemaining206 = reloadDuration206(unit);
    // v139 sees a positive timer but can never count Infinity down to zero,
    // therefore it cannot refill the magazine from nothing.
    unit.magazineReloadRemaining139 = Infinity;
    return true;
  }

  function processReload206(unit, state, dt) {
    if (!(state.reloadRemaining206 > EPS)) return;
    state.reloadRemaining206 = Math.max(0, state.reloadRemaining206 - dt);
    unit.magazineReloadRemaining139 = Infinity;
    if (state.reloadRemaining206 > EPS) return;
    const amount = L.round(Math.min(state.ammoReadyMax, Math.max(0, state.ammoReserve)));
    state.ammoReserve = L.round(Math.max(0, state.ammoReserve - amount));
    state.ammoReady = amount;
    unit.magazineReloadRemaining139 = 0;
    syncReadyToLegacy206(unit, state);
    unit.weaponCooldown = Math.max(0, Number(unit.weaponCooldown) || 0);
    unit.game.uiDirty = true;
  }

  const baseFire206 = Unit.prototype.fire;
  Unit.prototype.fire = function(target) {
    if (L.isAir(this)) return baseFire206.call(this, target);
    const state = L.ensureUnit(this, false);
    if (!state || state.ammoReadyMax <= 0) return baseFire206.call(this, target);
    syncReadyToLegacy206(this, state);
    if (state.reloadRemaining206 > EPS || state.ammoReady <= EPS) {
      startReload206(this, state);
      return false;
    }
    const beforeReady = state.ammoReady;
    const beforeShot = this.lastShotAt;
    const beforeProjectiles = this.game?.projectiles?.length || 0;
    const result = baseFire206.call(this, target);
    syncReadyFromLegacy206(this, state);
    const committed = state.ammoReady < beforeReady - EPS || this.lastShotAt !== beforeShot ||
      (this.game?.projectiles?.length || 0) > beforeProjectiles;
    if (committed && state.ammoReady >= beforeReady - EPS) {
      state.ammoReady = L.round(Math.max(0, beforeReady - 1));
      syncReadyToLegacy206(this, state);
    }
    if (state.ammoReady <= EPS) startReload206(this, state);
    return result;
  };

  const baseUpdate206 = Unit.prototype.update;
  Unit.prototype.update = function(dt) {
    const state = L.ensureUnit(this, false);
    if (state && !L.isAir(this) && state.ammoReadyMax > 0) {
      // v139 may have started its old field reload through an aggregated attack.
      // Convert that event into the reserve-backed v206 reload before v139 runs.
      if (Number.isFinite(this.magazineReloadRemaining139) && this.magazineReloadRemaining139 > 0 &&
          !(state.reloadRemaining206 > EPS) && state.ammoReady <= EPS) {
        startReload206(this, state);
      }
      if (this.magazineReloadRemaining139 > 0 && state.reloadRemaining206 > EPS) this.magazineReloadRemaining139 = Infinity;
      syncReadyToLegacy206(this, state);
    }
    const result = baseUpdate206.call(this, dt);
    if (state && !L.isAir(this) && state.ammoReadyMax > 0) {
      syncReadyFromLegacy206(this, state);
      if (state.ammoReady <= EPS && !(state.reloadRemaining206 > EPS)) startReload206(this, state);
      processReload206(this, state, dt);
    }
    return result;
  };

  function vehicleConsumptionRate206(unit) {
    const text = `${unit.typeId || ''} ${unit.stats?.role || ''}`.toLowerCase();
    let rate = .055;
    if (/tank|heavy|mbt|танк|тяж/.test(text)) rate = .085;
    else if (/artillery|howitzer|mlrs|артилл|рсзо/.test(text)) rate = .075;
    else if (/truck|resourceTruck|транспорт|груз/i.test(text)) rate = .045;
    const terrain = Number(unit.terrainSpeedMultiplier || unit._terrainSpeedMultiplier) || 1;
    if (terrain < .8) rate *= 1.12;
    return rate;
  }

  function fuelState206(state) {
    if (!state || state.fuelMax <= 0) return 'NORMAL';
    const ratio = state.fuel / state.fuelMax;
    if (ratio <= EPS) return 'EMPTY';
    if (ratio <= .10) return 'CRITICAL_FUEL';
    if (ratio <= .25) return 'LOW_FUEL';
    return 'NORMAL';
  }

  function groundMovementFuel206() {
    this._logisticsVehicles206 ||= [];
    const tick = Number(this.simTick) || 0;
    if (!this._logisticsVehicleScanTick206 || tick - this._logisticsVehicleScanTick206 >= 25) {
      this._logisticsVehicleScanTick206 = tick;
      this._logisticsVehicles206 = (this.units || [])
        .filter(unit => unit?.alive && !L.isAir(unit) && (L.isTruck(unit) || L.isMotorized(unit)))
        .sort((a, b) => String(a.id).localeCompare(String(b.id), 'en'));
    }
    const telemetry = L.ensureGame(this).telemetry;
    for (const unit of this._logisticsVehicles206) {
      if (!unit?.alive) continue;
      const state = L.ensureUnit(unit, false);
      if (!state) continue;
      if (L.isTruck(unit) && state.fuelMax <= 0) { state.fuelMax = 720; state.fuel = 720; }
      if (state.fuelMax <= 0) continue;
      if (!Number.isFinite(state.lastX206)) {
        state.lastX206 = unit.x; state.lastY206 = unit.y; state.fuelState206 = fuelState206(state); continue;
      }
      const dx = unit.x - state.lastX206;
      const dy = unit.y - state.lastY206;
      const distance = Math.hypot(dx, dy);
      if (distance > EPS) {
        const needed = distance * vehicleConsumptionRate206(unit);
        if (state.fuel <= EPS) {
          unit.x = state.lastX206; unit.y = state.lastY206;
          if (Number.isFinite(unit.renderX)) unit.renderX = unit.x;
          if (Number.isFinite(unit.renderY)) unit.renderY = unit.y;
          unit.speedCurrent = 0; unit.velocityX = 0; unit.velocityY = 0;
        } else if (needed > state.fuel + EPS) {
          const ratio = L.clamp(state.fuel / needed, 0, 1);
          unit.x = state.lastX206 + dx * ratio; unit.y = state.lastY206 + dy * ratio;
          if (Number.isFinite(unit.renderX)) unit.renderX = unit.x;
          if (Number.isFinite(unit.renderY)) unit.renderY = unit.y;
          telemetry.fuelConsumed = L.round(Number(telemetry.fuelConsumed) + state.fuel);
          state.fuel = 0;
        } else {
          state.fuel = L.round(state.fuel - needed);
          telemetry.fuelConsumed = L.round(Number(telemetry.fuelConsumed) + needed);
        }
      }
      state.lastX206 = unit.x; state.lastY206 = unit.y; state.fuelState206 = fuelState206(state);
      if (state.fuelState206 === 'EMPTY' && unit.team === 'player' && this.time > (state.lastFuelAlert206 || -999) + 12) {
        state.lastFuelAlert206 = this.time;
        this.logisticsEvent206?.('critical-shortage', { unitId: unit.id, resource: 'fuel', state: 'EMPTY' });
      }
    }
  }

  function supportAndReadiness206(dt) {
    const gameState = L.ensureGame(this);
    gameState._supportTick206 = (Number(gameState._supportTick206) || 0) + dt;
    if (gameState._supportTick206 < .5) return;
    const elapsed = gameState._supportTick206;
    gameState._supportTick206 = 0;
    for (const unit of this.units || []) {
      if (!unit?.alive || L.isTruck(unit)) continue;
      const state = L.ensureUnit(unit, false);
      if (!state) continue;
      const moving = Number.isFinite(state.lastSupportX206)
        ? Math.hypot(unit.x - state.lastSupportX206, unit.y - state.lastSupportY206) > 8 : false;
      const fighting = this.time - Math.max(Number(unit.lastShotAt) || -999, Number(unit.lastDamagedAt) || -999) < 6;
      state.lastSupportX206 = unit.x; state.lastSupportY206 = unit.y;
      if (state.supportMax > 0) {
        const rate = (fighting ? .024 : moving ? .012 : .004) * elapsed;
        const used = Math.min(state.support, rate);
        state.support = L.round(Math.max(0, state.support - used));
        gameState.telemetry.supportConsumed = L.round(Number(gameState.telemetry.supportConsumed) + used);
      }
      const readiness = L.unitReadiness(unit);
      unit.supply160 = readiness.supply;
      state.readiness206 = readiness;
      if (state.resupplySourceId && this.time - (state.lastResupplyAt206 || this.time) > 4) {
        state.resupplySourceId = null; state.resupplyProgress = 0;
      }
    }
  }

  const DEFENSE_READY = Object.freeze({ missileBattery: 6, abmBattery: 4, orbitalDefense: 4, aaTurret: 36, counterUASTower: 24 });
  function ensureDefenseAmmo206(building) {
    const max = DEFENSE_READY[building?.typeId];
    if (!max) return null;
    const node = L.ensureNode(building);
    if (!node) return null;
    const state = building.logistics206;
    if (!Number.isFinite(state.weaponReadyMax206)) state.weaponReadyMax206 = max;
    if (!Number.isFinite(state.weaponReady206)) state.weaponReady206 = state.weaponReadyMax206;
    if (!Number.isFinite(state.weaponReloadRemaining206)) state.weaponReloadRemaining206 = 0;
    return state;
  }

  const baseBuildingFire206 = Building.prototype.fire;
  Building.prototype.fire = function(target) {
    const state = ensureDefenseAmmo206(this);
    if (!state) return baseBuildingFire206.call(this, target);
    if (state.weaponReady206 <= EPS) {
      if (!(state.weaponReloadRemaining206 > 0)) state.weaponReloadRemaining206 = 4.8;
      return false;
    }
    const before = state.weaponReady206;
    const beforeCooldown = Number(this.weaponCooldown) || 0;
    const beforeProjectiles = this.game?.projectiles?.length || 0;
    const result = baseBuildingFire206.call(this, target);
    const committed = (Number(this.weaponCooldown) || 0) > beforeCooldown + EPS ||
      (this.game?.projectiles?.length || 0) > beforeProjectiles;
    if (committed) {
      state.weaponReady206 = L.round(Math.max(0, before - 1));
      if (state.weaponReady206 <= EPS) state.weaponReloadRemaining206 = 4.8;
    }
    return result;
  };

  const baseBuildingUpdate206 = Building.prototype.update;
  Building.prototype.update = function(dt) {
    const result = baseBuildingUpdate206.call(this, dt);
    const state = ensureDefenseAmmo206(this);
    if (!state || state.weaponReady206 >= state.weaponReadyMax206) return result;
    state.weaponReloadRemaining206 = Math.max(0, Number(state.weaponReloadRemaining206 || 0) - dt);
    if (state.weaponReloadRemaining206 > EPS) return result;
    const need = state.weaponReadyMax206 - state.weaponReady206;
    const available = Math.max(0, Number(state.stock?.ammo) || 0);
    const take = L.round(Math.min(need, available));
    if (take > EPS) {
      state.stock.ammo = L.round(available - take);
      state.weaponReady206 = L.round(state.weaponReady206 + take);
      const telemetry = L.ensureGame(this.game).telemetry;
      telemetry.ammoConsumed = L.round(Number(telemetry.ammoConsumed) + take);
    }
    if (state.weaponReady206 < state.weaponReadyMax206) state.weaponReloadRemaining206 = 4.8;
    return result;
  };

  function sustainmentPost206(dt) {
    groundMovementFuel206.call(this);
    supportAndReadiness206.call(this, dt);
  }
  Game.prototype.registerLogisticsHook206('post', sustainmentPost206, 45);
  Game.prototype.fuelState206 = function(unit) { return fuelState206(L.ensureUnit(unit, false)); };
  Game.prototype.consumeReserveMagazine206 = function(unit) {
    const state = L.ensureUnit(unit, false);
    if (!state) return false;
    if (state.ammoReady > EPS) return true;
    startReload206(unit, state);
    return state.ammoReserve > EPS;
  };
  root.__FD_UNIT_SUSTAINMENT206__ = { version: '20.6', fuelState206, readyField206 };
})();
