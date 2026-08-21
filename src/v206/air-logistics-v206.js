(() => {
  'use strict';
  const root=typeof window!=='undefined'?window:self;
  const L=root.__FD_LOGISTICS206__,D=root.__FD_DEBUG__;
  if(!L||!D?.Game||!D?.Unit)return;
  const Game=D.Game,Unit=D.Unit;
  if(Game.prototype.__fdAirLogistics206Installed)return;
  Object.defineProperty(Game.prototype,'__fdAirLogistics206Installed',{value:true,configurable:true});
  const EPS=1e-6;
  const AIRFIELD_TYPES=new Set(['airfield','advancedAirfield']);
  const dist=(a,b)=>Math.hypot((a?.x||0)-(b?.x||0),(a?.y||0)-(b?.y||0));
  const isAirfield=b=>Boolean(b?.alive&&b.completed&&AIRFIELD_TYPES.has(b.typeId));
  const isFixedWing=u=>Boolean(L.isAir(u)&&!L.isHelicopter(u)&&u.stats?.mobilityClass==='fixedWing');

  function ensureAir206(unit){
    const s=L.ensureUnit(unit,false);if(!s||!L.isAir(unit))return null;
    if(Number.isFinite(unit.sortieFuelMax)&&unit.sortieFuelMax>0){s.fuelMax=Number(unit.sortieFuelMax);if(!Number.isFinite(s.fuel)||s.fuel>s.fuelMax)s.fuel=L.clamp(unit.sortieFuel,0,s.fuelMax);}
    else if(s.fuelMax<=0){s.fuelMax=L.isHelicopter(unit)?420:320;if(!Number.isFinite(s.fuel))s.fuel=s.fuelMax;unit.sortieFuelMax=s.fuelMax;unit.sortieFuel=s.fuel;}
    if(Number.isFinite(unit.airAmmoMax)&&unit.airAmmoMax>=0){s.ammoReadyMax=Number(unit.airAmmoMax);s.ammoReady=L.clamp(Number(unit.airAmmo)||0,0,s.ammoReadyMax);}
    else if(s.ammoReadyMax>0){unit.airAmmoMax=s.ammoReadyMax;unit.airAmmo=s.ammoReady;}
    return s;
  }

  function airfieldFor206(game,unit,preferred=null){
    const fields=(game.buildings||[]).filter(b=>isAirfield(b)&&b.team===unit.team&&b.sabotagedUntil<=game.time);
    if(preferred){const p=typeof preferred==='string'?game.getEntity?.(preferred):preferred;if(fields.includes(p))return p;}
    const home=game.getEntity?.(unit.airServiceTargetId);if(fields.includes(home))return home;
    return fields.sort((a,b)=>dist(a,unit)-dist(b,unit)||String(a.id).localeCompare(String(b.id),'en'))[0]||null;
  }

  function consumeFieldStock206(game,field,key,requested){const node=L.ensureNode(field);if(!node?.stock)return 0;const available=Math.max(0,Number(node.stock[key])||0),amount=L.round(Math.min(available,Math.max(0,Number(requested)||0)));if(amount<=EPS)return 0;node.stock[key]=L.round(available-amount);return amount;}

  function applyPhysicalServiceDelta206(unit,field,before,dt){
    const s=ensureAir206(unit),game=unit.game,node=L.ensureNode(field);if(!s||!node)return {complete:false,blocked:true};
    const desiredFuel=Math.max(0,(Number(unit.sortieFuel)||0)-before.fuel);const desiredAmmo=Math.max(0,(Number(unit.airAmmo)||0)-before.ammo);const desiredHp=Math.max(0,(Number(unit.hp)||0)-before.hp);
    unit.sortieFuel=before.fuel;unit.airAmmo=before.ammo;unit.hp=before.hp;
    const fuel=consumeFieldStock206(game,field,'fuel',desiredFuel);unit.sortieFuel=L.round(Math.min(unit.sortieFuelMax,before.fuel+fuel));
    const ammo=consumeFieldStock206(game,field,'ammo',desiredAmmo);unit.airAmmo=L.round(Math.min(unit.airAmmoMax,before.ammo+ammo));
    const supportNeed=Math.max(.22*dt,desiredHp/Math.max(1,unit.maxHp)*90);const support=consumeFieldStock206(game,field,'support',supportNeed);const supportRatio=supportNeed>EPS?L.clamp(support/supportNeed,0,1):1;
    unit.hp=Math.min(unit.maxHp,before.hp+desiredHp*supportRatio);
    if(s.supportMax>0&&support>0)s.support=L.round(Math.min(s.supportMax,s.support+support*.35));
    s.fuel=Number(unit.sortieFuel)||0;s.ammoReady=Number(unit.airAmmo)||0;
    s.airMaintenance206=L.clamp(Number(s.airMaintenance206)||0 + dt*.36*supportRatio,0,1);
    const complete=unit.hp>=unit.maxHp*.999&&unit.sortieFuel>=unit.sortieFuelMax*.999&&(unit.airAmmoMax<=0||unit.airAmmo>=unit.airAmmoMax-.01)&&s.support>=s.supportMax*.55&&s.airMaintenance206>=.999;
    const telemetry=L.ensureGame(game).telemetry;telemetry.fuelConsumed=L.round(Number(telemetry.fuelConsumed)+fuel);telemetry.ammoConsumed=L.round(Number(telemetry.ammoConsumed)+ammo);telemetry.supportConsumed=L.round(Number(telemetry.supportConsumed)+support);
    const blocked=desiredFuel>fuel+EPS||desiredAmmo>ammo+EPS||supportRatio<.999;
    if(blocked&&game.time>(s.airBlockedAlert206||-999)+6){s.airBlockedAlert206=game.time;game.logisticsEvent206?.('aircraft-service-blocked',{unitId:unit.id,airfieldId:field.id,fuel:Number(node.stock.fuel),ammo:Number(node.stock.ammo),support:Number(node.stock.support)});}
    return {complete,blocked};
  }

  const baseProcessCommand206=Unit.prototype.processCommand;
  Unit.prototype.processCommand=function(command,dt){
    if(command?.type==='airHangar93'&&isFixedWing(this)&&(command.stage==='service'||command.stage==='ready')){
      const field=this.game.getEntity?.(command.airfieldId||this.airServiceTargetId);if(!isAirfield(field))return baseProcessCommand206.call(this,command,dt);
      const before={fuel:Number(this.sortieFuel)||0,ammo:Number(this.airAmmo)||0,hp:Number(this.hp)||0,stage:command.stage,state:this.airServiceState};
      const result=baseProcessCommand206.call(this,command,dt);
      const service=applyPhysicalServiceDelta206(this,field,before,dt);
      if(!service.complete&&(command.stage==='ready'||command.stage==='launch')){command.stage='service';this.airServiceState='servicing';this.airServiceTimer=Math.min(Number(this.airServiceTimer)||0,2.2);}
      return result;
    }
    if(command?.type==='airService206'&&L.isHelicopter(this)){this.game.processHelicopterService206(this,command,dt);return;}
    return baseProcessCommand206.call(this,command,dt);
  };

  Unit.prototype.requestAirfieldService206=function(reason='обслуживание',preferred=null){
    if(!L.isAir(this))return false;if(isFixedWing(this)&&typeof this.requestAirHangar93==='function')return this.requestAirHangar93(reason,preferred,true);
    if(!L.isHelicopter(this))return this.requestAirService?.(reason)??false;
    const field=airfieldFor206(this.game,this,preferred);if(!field)return false;
    const saved=(this.commandQueue||[]).filter(c=>c?.type!=='airService206').map(c=>({...c}));this.logistics206 ||= {};this.logistics206.airSavedCommands206=saved;this.airServiceTargetId=field.id;this.airServiceState='return';
    this.commandQueue=[{type:'airService206',airfieldId:field.id,stage:'return',reason}];this.invalidateNavigation?.();return true;
  };

  Game.prototype.processHelicopterService206=function(unit,command,dt){
    const field=airfieldFor206(this,unit,command.airfieldId);if(!field){unit.airServiceState=null;unit.finishCommand?.();return;}
    command.airfieldId=field.id;unit.airServiceTargetId=field.id;const angle=((String(unit.id).split('').reduce((h,c)=>(h*31+c.charCodeAt(0))>>>0,0)%360)/180)*Math.PI;const radius=Math.max(70,field.radius*.52);const pad={x:field.x+Math.cos(angle)*radius,y:field.y+Math.sin(angle)*radius};
    if(command.stage==='return'){unit.airServiceState='return';if(unit.moveToward?.(pad.x,pad.y,dt,.88)||dist(unit,pad)<30){command.stage='service';unit.airServiceState='servicing';unit.x=pad.x;unit.y=pad.y;const s=ensureAir206(unit);s.airMaintenance206=0;}return;}
    const s=ensureAir206(unit);unit.airServiceState='servicing';
    const before={fuel:Number(unit.sortieFuel)||s.fuel,ammo:Number(unit.airAmmo)||s.ammoReady,hp:Number(unit.hp)||0};
    const node=L.ensureNode(field),team=this.teams?.[unit.team],rate=(Number(team?.powerFactor)||1)>=.38?1:.35;
    unit.sortieFuel=Math.min(unit.sortieFuelMax,before.fuel+unit.sortieFuelMax*.25*dt*rate);unit.airAmmo=Math.min(unit.airAmmoMax,before.ammo+Math.max(1,unit.airAmmoMax*.36)*dt*rate);unit.hp=Math.min(unit.maxHp,before.hp+unit.maxHp*.13*dt*rate);
    const service=applyPhysicalServiceDelta206(unit,field,before,dt);
    if(!service.complete){command.stage='service';return;}
    unit.airServiceState=null;s.airMaintenance206=1;const saved=Array.isArray(s.airSavedCommands206)?s.airSavedCommands206:[];s.airSavedCommands206=[];unit.commandQueue=saved;unit.invalidateNavigation?.();this.uiDirty=true;
  };

  function airPost206(dt){
    this._airLogisticsScan206=(Number(this._airLogisticsScan206)||0)+dt;if(this._airLogisticsScan206<.12)return;const elapsed=this._airLogisticsScan206;this._airLogisticsScan206=0;
    const telemetry=L.ensureGame(this).telemetry;
    for(const unit of this.units||[]){if(!unit?.alive||!L.isAir(unit))continue;const s=ensureAir206(unit);if(!s)continue;
      if(isFixedWing(unit)){s.fuel=L.round(L.clamp(Number(unit.sortieFuel)||0,0,s.fuelMax));s.ammoReady=L.round(L.clamp(Number(unit.airAmmo)||0,0,s.ammoReadyMax));}
      else if(L.isHelicopter(unit)){
        if(!Number.isFinite(s.lastAirX206)){s.lastAirX206=unit.x;s.lastAirY206=unit.y;}
        const distance=Math.hypot(unit.x-s.lastAirX206,unit.y-s.lastAirY206);s.lastAirX206=unit.x;s.lastAirY206=unit.y;
        const used=Math.min(s.fuel,distance*.095);if(used>EPS){s.fuel=L.round(s.fuel-used);telemetry.fuelConsumed=L.round(Number(telemetry.fuelConsumed)+used);}unit.sortieFuelMax=s.fuelMax;unit.sortieFuel=s.fuel;
        if(Number.isFinite(unit.airAmmo)){s.ammoReady=L.round(L.clamp(unit.airAmmo,0,s.ammoReadyMax));}
        if(!unit.airServiceState&&(s.fuel<=s.fuelMax*.15||(s.ammoReadyMax>0&&s.ammoReady<=EPS)))unit.requestAirfieldService206?.(s.fuel<=s.fuelMax*.15?'топливо':'боезапас');
        if(s.fuel<=EPS&&!unit.airServiceState){unit.motionSpeed=0;unit.speedCurrent=0;}
      }
    }
  }
  Game.prototype.registerLogisticsHook206('post',airPost206,55);
  root.__FD_AIR_LOGISTICS206__={version:'20.6',isAirfield,ensureAir206};
})();
