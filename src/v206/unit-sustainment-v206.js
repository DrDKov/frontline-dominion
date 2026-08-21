(() => {
  'use strict';
  const root=typeof window!=='undefined'?window:self;
  const L=root.__FD_LOGISTICS206__,D=root.__FD_DEBUG__;
  if(!L||!D?.Game||!D?.Unit||!D?.Building)return;
  const Game=D.Game,Unit=D.Unit,Building=D.Building;
  if(Game.prototype.__fdUnitSustainment206Installed)return;
  Object.defineProperty(Game.prototype,'__fdUnitSustainment206Installed',{value:true,configurable:true});
  const EPS=1e-6;

  function readyField206(unit){
    if(Number.isFinite(unit?.ammoMax)&&unit.ammoMax>0)return ['ammo','ammoMax'];
    if(Number.isFinite(unit?.weaponAmmoMax)&&unit.weaponAmmoMax>0)return ['weaponAmmo','weaponAmmoMax'];
    if(Number.isFinite(unit?.munitionAmmoMax)&&unit.munitionAmmoMax>0)return ['munitionAmmo','munitionAmmoMax'];
    if(Number.isFinite(unit?.magazineAmmoMax139)&&unit.magazineAmmoMax139>0)return ['magazineAmmo139','magazineAmmoMax139'];
    if(Number(unit?.stats?.magazineCapacity)>0){unit.magazineAmmoMax139=Math.max(1,Math.floor(Number(unit.stats.magazineCapacity)));if(!Number.isFinite(unit.magazineAmmo139))unit.magazineAmmo139=unit.magazineAmmoMax139;return ['magazineAmmo139','magazineAmmoMax139'];}
    return null;
  }
  function syncReadyToLegacy206(unit,state){const f=readyField206(unit);if(!f)return;unit[f[1]]=Math.max(0,Number(state.ammoReadyMax)||Number(unit[f[1]])||0);unit[f[0]]=L.round(L.clamp(state.ammoReady,0,unit[f[1]]));}
  function syncReadyFromLegacy206(unit,state){const f=readyField206(unit);if(!f)return;state.ammoReadyMax=Math.max(0,Number(unit[f[1]])||state.ammoReadyMax||0);state.ammoReady=L.round(L.clamp(unit[f[0]],0,state.ammoReadyMax));}
  function reloadDuration206(unit){const raw=Number(unit?.stats?.magazineReload??unit?.stats?.limitedAmmoReload);return Number.isFinite(raw)&&raw>0?L.clamp(raw,1.5,30):6.4;}
  function startReload206(unit,state){if(state.ammoReadyMax<=0||state.ammoReady>EPS)return false;if(state.reloadRemaining206>0)return true;if(state.ammoReserve<=EPS)return false;state.reloadRemaining206=reloadDuration206(unit);unit.magazineReloadRemaining139=Infinity;return true;}
  function processReload206(unit,state,dt){
    if(!(state.reloadRemaining206>0))return;
    state.reloadRemaining206=Math.max(0,state.reloadRemaining206-dt);
    unit.magazineReloadRemaining139=Infinity;
    if(state.reloadRemaining206>EPS)return;
    const amount=L.round(Math.min(state.ammoReadyMax,Math.max(0,state.ammoReserve)));
    state.ammoReserve=L.round(Math.max(0,state.ammoReserve-amount));state.ammoReady=amount;
    unit.magazineReloadRemaining139=0;syncReadyToLegacy206(unit,state);unit.weaponCooldown=Math.max(0,Number(unit.weaponCooldown)||0);unit.game.uiDirty=true;
  }

  const baseFire206=Unit.prototype.fire;
  Unit.prototype.fire=function(target){
    if(L.isAir(this))return baseFire206.call(this,target);
    const s=L.ensureUnit(this,false);if(!s||s.ammoReadyMax<=0)return baseFire206.call(this,target);
    syncReadyToLegacy206(this,s);
    if(s.reloadRemaining206>EPS||s.ammoReady<=EPS){startReload206(this,s);return false;}
    const beforeReady=s.ammoReady,beforeShot=this.lastShotAt,beforeProjectiles=this.game?.projectiles?.length||0;
    const result=baseFire206.call(this,target);syncReadyFromLegacy206(this,s);
    const committed=s.ammoReady<beforeReady-EPS||this.lastShotAt!==beforeShot||(this.game?.projectiles?.length||0)>beforeProjectiles;
    if(committed&&s.ammoReady>=beforeReady-EPS){s.ammoReady=L.round(Math.max(0,beforeReady-1));syncReadyToLegacy206(this,s);}
    if(s.ammoReady<=EPS)startReload206(this,s);
    return result;
  };

  const baseUpdate206=Unit.prototype.update;
  Unit.prototype.update=function(dt){
    const s=L.ensureUnit(this,false);
    if(s&&!L.isAir(this)&&s.ammoReadyMax>0){
      if(Number.isFinite(this.magazineReloadRemaining139)&&this.magazineReloadRemaining139>0&&!Number.isFinite(s.reloadRemaining206))s.reloadRemaining206=reloadDuration206(this);
      if(this.magazineReloadRemaining139>0)this.magazineReloadRemaining139=Infinity;
      syncReadyToLegacy206(this,s);
    }
    const result=baseUpdate206.call(this,dt);
    if(s&&!L.isAir(this)&&s.ammoReadyMax>0){syncReadyFromLegacy206(this,s);if(this.magazineReloadRemaining139>0&&this.magazineReloadRemaining139!==Infinity&&s.ammoReady<=EPS)startReload206(this,s);processReload206(this,s,dt);}
    return result;
  };

  function vehicleConsumptionRate206(unit){
    const text=`${unit.typeId||''} ${unit.stats?.role||''}`.toLowerCase();
    let rate=.055;
    if(/tank|heavy|mbt|танк|тяж/.test(text))rate=.085;
    else if(/artillery|howitzer|mlrs|артилл|рсзо/.test(text))rate=.075;
    else if(/truck|resourceTruck|транспорт|груз/.test(text))rate=.045;
    const terrain=Number(unit.terrainSpeedMultiplier||unit._terrainSpeedMultiplier)||1;
    if(terrain<.8)rate*=1.12;
    return rate;
  }

  function fuelState206(state){if(!state||state.fuelMax<=0)return 'NORMAL';const r=state.fuel/state.fuelMax;if(r<=EPS)return 'EMPTY';if(r<=.10)return 'CRITICAL_FUEL';if(r<=.25)return 'LOW_FUEL';return 'NORMAL';}

  function groundMovementFuel206(){
    this._logisticsVehicles206 ||= [];
    const tick=Number(this.simTick)||0;
    if(!this._logisticsVehicleScanTick206||tick-this._logisticsVehicleScanTick206>=25){
      this._logisticsVehicleScanTick206=tick;
      this._logisticsVehicles206=(this.units||[]).filter(u=>u?.alive&&!L.isAir(u)&&(L.isTruck(u)||L.isMotorized(u))).sort((a,b)=>String(a.id).localeCompare(String(b.id),'en'));
    }
    const telemetry=L.ensureGame(this).telemetry;
    for(const unit of this._logisticsVehicles206){if(!unit?.alive)continue;const s=L.ensureUnit(unit,false);if(!s)continue;
      if(L.isTruck(unit)&&s.fuelMax<=0){s.fuelMax=720;s.fuel=720;}
      if(s.fuelMax<=0)continue;
      if(!Number.isFinite(s.lastX206)){s.lastX206=unit.x;s.lastY206=unit.y;s.fuelState206=fuelState206(s);continue;}
      const dx=unit.x-s.lastX206,dy=unit.y-s.lastY206,distance=Math.hypot(dx,dy);
      if(distance>EPS){
        const rate=vehicleConsumptionRate206(unit),needed=distance*rate;
        if(s.fuel<=EPS){unit.x=s.lastX206;unit.y=s.lastY206;if(Number.isFinite(unit.renderX))unit.renderX=unit.x;if(Number.isFinite(unit.renderY))unit.renderY=unit.y;unit.speedCurrent=0;unit.velocityX=0;unit.velocityY=0;}
        else if(needed>s.fuel+EPS){const ratio=L.clamp(s.fuel/needed,0,1);unit.x=s.lastX206+dx*ratio;unit.y=s.lastY206+dy*ratio;if(Number.isFinite(unit.renderX))unit.renderX=unit.x;if(Number.isFinite(unit.renderY))unit.renderY=unit.y;telemetry.fuelConsumed=L.round(Number(telemetry.fuelConsumed)+s.fuel);s.fuel=0;}
        else{s.fuel=L.round(s.fuel-needed);telemetry.fuelConsumed=L.round(Number(telemetry.fuelConsumed)+needed);}
      }
      s.lastX206=unit.x;s.lastY206=unit.y;s.fuelState206=fuelState206(s);
      if(s.fuelState206==='EMPTY'&&unit.team==='player'&&this.time>(s.lastFuelAlert206||-999)+12){s.lastFuelAlert206=this.time;this.logisticsEvent206?.('critical-shortage',{unitId:unit.id,resource:'fuel',state:'EMPTY'});}
    }
  }

  function supportAndReadiness206(dt){
    const state=L.ensureGame(this);state._supportTick206=(Number(state._supportTick206)||0)+dt;if(state._supportTick206<.5)return;const elapsed=state._supportTick206;state._supportTick206=0;
    for(const unit of this.units||[]){if(!unit?.alive||L.isTruck(unit))continue;const s=L.ensureUnit(unit,false);if(!s)continue;
      const moving=Number.isFinite(s.lastSupportX206)?Math.hypot(unit.x-s.lastSupportX206,unit.y-s.lastSupportY206)>8:false;const fighting=this.time-Math.max(Number(unit.lastShotAt)||-999,Number(unit.lastDamagedAt)||-999)<6;
      s.lastSupportX206=unit.x;s.lastSupportY206=unit.y;
      if(s.supportMax>0){const rate=(fighting?.024:moving?.012:.004)*elapsed;const used=Math.min(s.support,rate);s.support=L.round(Math.max(0,s.support-used));state.telemetry.supportConsumed=L.round(Number(state.telemetry.supportConsumed)+used);}
      const readiness=L.unitReadiness(unit);unit.supply160=readiness.supply;s.readiness206=readiness;
      if(s.resupplySourceId&&this.time-(s.lastResupplyAt206||this.time)>4){s.resupplySourceId=null;s.resupplyProgress=0;}
    }
  }

  const DEFENSE_READY=Object.freeze({missileBattery:6,abmBattery:4,orbitalDefense:4,aaTurret:36,counterUASTower:24});
  function ensureDefenseAmmo206(building){const max=DEFENSE_READY[building?.typeId];if(!max)return null;const node=L.ensureNode(building);if(!node)return null;const s=building.logistics206;if(!Number.isFinite(s.weaponReadyMax206))s.weaponReadyMax206=max;if(!Number.isFinite(s.weaponReady206))s.weaponReady206=s.weaponReadyMax206;if(!Number.isFinite(s.weaponReloadRemaining206))s.weaponReloadRemaining206=0;return s;}
  const baseBuildingFire206=Building.prototype.fire;
  Building.prototype.fire=function(target){const s=ensureDefenseAmmo206(this);if(!s)return baseBuildingFire206.call(this,target);if(s.weaponReady206<=EPS){if(!(s.weaponReloadRemaining206>0))s.weaponReloadRemaining206=4.8;return false;}
    const before=s.weaponReady206,beforeCd=Number(this.weaponCooldown)||0,beforeP=this.game?.projectiles?.length||0;const result=baseBuildingFire206.call(this,target);const committed=(Number(this.weaponCooldown)||0)>beforeCd+EPS||(this.game?.projectiles?.length||0)>beforeP;
    if(committed){s.weaponReady206=L.round(Math.max(0,before-1));if(s.weaponReady206<=EPS)s.weaponReloadRemaining206=4.8;}return result;};

  const baseBuildingUpdate206=Building.prototype.update;
  Building.prototype.update=function(dt){const result=baseBuildingUpdate206.call(this,dt);const s=ensureDefenseAmmo206(this);if(!s)return result;
    if(s.weaponReady206<s.weaponReadyMax206){s.weaponReloadRemaining206=Math.max(0,Number(s.weaponReloadRemaining206||0)-dt);if(s.weaponReloadRemaining206<=EPS){const need=s.weaponReadyMax206-s.weaponReady206,available=Math.max(0,Number(s.stock?.ammo)||0),take=L.round(Math.min(need,available));if(take>EPS){s.stock.ammo=L.round(available-take);s.weaponReady206=L.round(s.weaponReady206+take);L.ensureGame(this.game).telemetry.ammoConsumed=L.round(Number(L.ensureGame(this.game).telemetry.ammoConsumed)+take);}if(s.weaponReady206<s.weaponReadyMax206)s.weaponReloadRemaining206=4.8;}}
    return result;};

  function sustainmentPost206(dt){groundMovementFuel206.call(this);supportAndReadiness206.call(this,dt);}
  Game.prototype.registerLogisticsHook206('post',sustainmentPost206,45);
  Game.prototype.fuelState206=function(unit){return fuelState206(L.ensureUnit(unit,false));};
  Game.prototype.consumeReserveMagazine206=function(unit){const s=L.ensureUnit(unit,false);if(!s)return false;if(s.ammoReady>EPS)return true;startReload206(unit,s);return s.ammoReserve>EPS;};
  root.__FD_UNIT_SUSTAINMENT206__={version:'20.6',fuelState206,readyField206};
})();
