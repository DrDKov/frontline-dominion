(() => {
  'use strict';
  const root=typeof window!=='undefined'?window:self;
  const L=root.__FD_LOGISTICS206__,D=root.__FD_DEBUG__;
  if(!L||!D?.Building||!D?.Game)return;
  const Building=D.Building,Game=D.Game;
  if(Game.prototype.__fdProductionLogistics206Installed)return;
  Object.defineProperty(Game.prototype,'__fdProductionLogistics206Installed',{value:true,configurable:true});

  function statsFor206(building,typeId){try{return D.getUnitStats?.(typeId,building.game.teams?.[building.team])||D.UNIT_TYPES?.[typeId]||null;}catch(_){return D.UNIT_TYPES?.[typeId]||null;}}
  function packageFor206(building,typeId){const stats=statsFor206(building,typeId)||{},cost=Math.max(0,Number(stats.cost)||0);const text=`${typeId||''} ${stats.role||''} ${stats.visualRole||''}`.toLowerCase();const air=Boolean(stats.air),heli=air&&/helicopter|gunship|rotary/.test(text),truck=typeId==='resourceTruck'||stats.resourceHauler,vehicle=truck||Boolean(stats.vehicle)||/tank|vehicle|armor|apc|ifv|mobile|самоход|танк|броне/.test(text);
    let fuel=0;if(truck)fuel=720;else if(air)fuel=heli?420:320;else if(vehicle)fuel=Math.max(600,Math.min(1800,cost*.55));
    let ready=0;if(stats.weapon){ready=Math.max(1,Math.floor(Number(stats.magazineCapacity)||((stats.infantry||/infantry|пехот/.test(text))?30:/artillery|howitzer|mlrs|артилл|рсзо/.test(text)?6:/missile|sam|abm|rocket|пво|про/.test(text)?4:12));}
    const ammo=air?ready:ready*(/artillery|howitzer|mlrs|артилл|рсзо/.test(text)?5:/missile|sam|abm|rocket|пво|про/.test(text)?4:6);
    const support=air?120:vehicle?180:(stats.infantry||/infantry|пехот/.test(text))?95:45;
    return {fuel:L.round(fuel),ammo:L.round(ammo),support:L.round(support)};
  }
  function hasPackage206(node,pkg){return Boolean(node?.stock&&L.STOCK_KEYS.every(k=>(Number(node.stock[k])||0)+1e-6>=(Number(pkg[k])||0)));}
  function deductPackage206(node,pkg){if(!hasPackage206(node,pkg))return false;for(const k of L.STOCK_KEYS)node.stock[k]=L.round(Number(node.stock[k])-Number(pkg[k]||0));return true;}

  const previousQueueUpdate206=Building.prototype.updateQueue;
  if(typeof previousQueueUpdate206==='function')Building.prototype.updateQueue=function(dt){
    const head=this.queue?.[0];if(this.completed&&head?.kind==='unit'){
      const node=L.ensureNode(this);if(node){const pkg=packageFor206(this,head.id);this.logistics206.productionDemand206=pkg;if(!hasPackage206(node,pkg)){this.logistics206.productionBlocked206=true;this.logistics206.priority=this.logistics206.priority==='LOW'?'NORMAL':this.logistics206.priority;return;}this.logistics206.productionBlocked206=false;}
    }
    return previousQueueUpdate206.call(this,dt);
  };

  const previousSpawn206=Building.prototype.spawnUnit;
  if(typeof previousSpawn206==='function')Building.prototype.spawnUnit=function(typeId){
    const node=L.ensureNode(this),pkg=packageFor206(this,typeId);if(node&&!hasPackage206(node,pkg)){this.logistics206.productionBlocked206=true;return false;}
    const before=new Set((this.game.units||[]).map(u=>u.id));const result=previousSpawn206.call(this,typeId);
    const spawned=(this.game.units||[]).filter(u=>u?.alive&&!before.has(u.id)).sort((a,b)=>String(a.id).localeCompare(String(b.id),'en'))[0];
    if(spawned){const s=L.ensureUnit(spawned,true);if(L.isTruck(spawned)&&s.fuelMax<=0){s.fuelMax=720;s.fuel=720;}const actual={fuel:s.fuel,ammo:s.ammoReady+s.ammoReserve,support:s.support};
      if(node){const paid={fuel:Math.max(pkg.fuel,actual.fuel),ammo:Math.max(pkg.ammo,actual.ammo),support:Math.max(pkg.support,actual.support)};if(!hasPackage206(node,paid)){// The preflight estimate is intentionally conservative; this branch protects conservation if a modded unit exceeds it.
          spawned.alive=false;this.game.removeEntity?.(spawned);this.logistics206.productionBlocked206=true;return false;}deductPackage206(node,paid);}
      this.game.logisticsEvent206?.('unit-equipped',{buildingId:this.id,unitId:spawned.id,typeId,package:pkg});
    }
    return result;
  };

  Game.prototype.productionMaterialPackage206=function(building,typeId){return packageFor206(building,typeId);};
  root.__FD_PRODUCTION_LOGISTICS206__={version:'20.6',packageFor206};
})();
