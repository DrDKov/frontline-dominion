(() => {
  'use strict';
  const root = typeof window !== 'undefined' ? window : self;
  const L = root.__FD_LOGISTICS206__;
  const D = root.__FD_DEBUG__;
  if (!L || !D?.Game || !D?.Unit) return;
  const Game = D.Game, Unit = D.Unit;
  if (Game.prototype.__fdSupplyTransport206Installed) return;
  Object.defineProperty(Game.prototype, '__fdSupplyTransport206Installed', { value: true, configurable: true });

  const MISSIONS = Object.freeze(['AUTO','EXTRACT_RESOURCE','SUPPLY_BUILDING','SUPPLY_AREA','SUPPLY_GROUP','MANUAL_TRANSFER','RETURN_TO_SOURCE']);
  const SOURCE_TYPE_PENALTY = Object.freeze({ pmto: 0, terminal: 55, warehouse: 110, central: 165, trade: 210, airfield: 230, production: 340, barracks: 420, repair: 300, defense: 480 });
  const LOAD_RATE = 2500;
  const UNLOAD_RATE = 2200;
  const UNIT_SERVICE_RATE = 1250;
  const GROUP_STANDOFF = 360;
  const ROUTE_CELL = 800;
  const EPS = 1e-6;
  const dist = (a,b) => Math.hypot((Number(a?.x)||0)-(Number(b?.x)||0),(Number(a?.y)||0)-(Number(b?.y)||0));

  function routeCell206(x,y) { return `${Math.floor((Number(x)||0)/ROUTE_CELL)}:${Math.floor((Number(y)||0)/ROUTE_CELL)}`; }
  function routeRisk206(game, a, b) {
    const risk = L.ensureGame(game).routeRisk || {};
    const distance = Math.max(1, dist(a,b));
    const steps = Math.max(1, Math.min(20, Math.ceil(distance / ROUTE_CELL)));
    let total = 0;
    for (let i=0;i<=steps;i+=1) {
      const t=i/steps, x=a.x+(b.x-a.x)*t, y=a.y+(b.y-a.y)*t;
      total += Number(risk[routeCell206(x,y)]) || 0;
    }
    return L.round(total / (steps+1));
  }

  function decayRouteRisk206(game, dt) {
    const state=L.ensureGame(game); state._riskDecay206=(Number(state._riskDecay206)||0)+dt;
    if(state._riskDecay206<5)return; const elapsed=state._riskDecay206; state._riskDecay206=0;
    for(const key of Object.keys(state.routeRisk)) {
      state.routeRisk[key]=L.round(Math.max(0,Number(state.routeRisk[key]||0)-elapsed*.012));
      if(state.routeRisk[key]<=.001) delete state.routeRisk[key];
    }
  }

  function availableAtSource206(source, key) {
    if (!source?.alive) return 0;
    const extracted = L.ensureExtractor(source);
    if (extracted?.resourceType === key) return Math.max(0, Number(source.resourceBuffer83) || 0);
    const node = L.ensureNode(source);
    if (!node) return 0;
    if (node.nodeType === 'trade' && node.importBuffer) return Math.max(0, Number(node.importBuffer[key]) || 0);
    return Math.max(0, Number(node.stock?.[key]) || 0);
  }

  function sourceStore206(source, key) {
    const extracted = L.ensureExtractor(source);
    if (extracted?.resourceType === key) return { kind:'extractor', get:()=>Math.max(0,Number(source.resourceBuffer83)||0), set:v=>{source.resourceBuffer83=L.round(Math.max(0,v));} };
    const node = L.ensureNode(source);
    if (!node) return null;
    if (node.nodeType === 'trade' && node.importBuffer && Number(node.importBuffer[key]) > EPS) return { kind:'import', get:()=>Number(node.importBuffer[key])||0, set:v=>{node.importBuffer[key]=L.round(Math.max(0,v));} };
    if (node.stock && Number(node.stock[`${key}Max`]) > 0) return { kind:'stock', get:()=>Number(node.stock[key])||0, set:v=>{node.stock[key]=L.round(Math.max(0,v));} };
    return null;
  }

  function loadResource206(source, truckState, key, requested) {
    const store=sourceStore206(source,key); if(!store)return 0;
    const total=L.manifestTotal(truckState.cargo), room=Math.max(0,truckState.cargoCapacity-total);
    const available=Math.max(0,store.get()); const amount=L.round(Math.min(Math.max(0,Number(requested)||0),room,available));
    if(amount<=EPS)return 0; store.set(available-amount); truckState.cargo[key]=L.round(Number(truckState.cargo[key])+amount); return amount;
  }

  function unloadToNode206(truckState, node, key, requested) {
    if(!node?.stock)return 0; const room=Math.max(0,Number(node.stock[`${key}Max`])-Number(node.stock[key]));
    const available=Math.max(0,Number(truckState.cargo[key])); const amount=L.round(Math.min(Math.max(0,Number(requested)||0),room,available));
    if(amount<=EPS)return 0; truckState.cargo[key]=L.round(available-amount); node.stock[key]=L.round(Number(node.stock[key])+amount); return amount;
  }

  function nodeDemand206(building) {
    const node=L.ensureNode(building); if(!node)return L.emptyManifest();
    return L.computeDemand(node.stock,node.thresholds,node.priority);
  }

  function unitDeficit206(unit) {
    if(!unit?.alive || L.isAir(unit) || L.isTruck(unit))return L.emptyManifest();
    const s=L.ensureUnit(unit,false), out=L.emptyManifest(); if(!s)return out;
    if(s.fuelMax>0) out.fuel=Math.max(0,s.fuelMax*.92-s.fuel);
    if(s.ammoReserveMax>0) out.ammo=Math.max(0,s.ammoReserveMax*.92-s.ammoReserve);
    if(s.supportMax>0) out.support=Math.max(0,s.supportMax*.88-s.support);
    return out;
  }

  function unitsNear206(game,team,x,y,radius) {
    const list=[];
    const spatial=game.querySpatial?.(game.unitSpatial,x,y,radius) || game.querySpatial?.(game.spatial?.units,x,y,radius) || null;
    const source=Array.isArray(spatial)?spatial:(game.units||[]);
    const seen=new Set();
    for(const unit of source) {
      if(!unit?.alive||unit.team!==team||L.isAir(unit)||L.isTruck(unit)||seen.has(unit.id))continue;
      if(Math.hypot(unit.x-x,unit.y-y)>radius)continue; seen.add(unit.id);list.push(unit);
    }
    return list.sort((a,b)=>String(a.id).localeCompare(String(b.id),'en'));
  }

  function areaDemand206(game,team,x,y,radius) {
    const sum=L.emptyManifest();
    for(const unit of unitsNear206(game,team,x,y,radius)) { const d=unitDeficit206(unit); for(const k of L.STOCK_KEYS)sum[k]+=d[k]; }
    for(const k of L.STOCK_KEYS)sum[k]=L.round(sum[k]); return sum;
  }

  function groupUnits206(game,team,groupId) {
    if(!groupId)return [];
    const formation=game.formations?.get?.(groupId);
    const ids=formation?.unitIds || formation?.members?.map?.(u=>u.id) || formation?.units || [];
    const idSet=new Set(Array.isArray(ids)?ids.map(x=>typeof x==='object'?x.id:x):[]);
    let units=(game.units||[]).filter(u=>u?.alive&&u.team===team&&!L.isAir(u)&&!L.isTruck(u)&&(
      idSet.has(u.id)||u.aiSquadId===groupId||u.currentCommand?.formationId===groupId||u.currentCommand?.formationGroupId===groupId));
    return units.sort((a,b)=>String(a.id).localeCompare(String(b.id),'en'));
  }

  function groupPoint206(game,truckState,team) {
    const units=groupUnits206(game,team,truckState.targetGroupId); if(!units.length)return null;
    const center=units.reduce((s,u)=>({x:s.x+u.x,y:s.y+u.y}),{x:0,y:0}); center.x/=units.length;center.y/=units.length;
    const base=team==='enemy'?(game.enemyBase||{x:center.x+1,y:center.y}):(game.playerBase||{x:center.x-1,y:center.y});
    let dx=(base.x-center.x),dy=(base.y-center.y),len=Math.hypot(dx,dy)||1; dx/=len;dy/=len;
    return {x:center.x+dx*GROUP_STANDOFF,y:center.y+dy*GROUP_STANDOFF,center,units};
  }

  function missionDemand206(game,truck) {
    const s=L.ensureUnit(truck,false); if(!s)return L.emptyManifest();
    if(s.missionType==='EXTRACT_RESOURCE') {
      const source=game.getEntity?.(s.sourceNodeId); const key=L.extractorResourceType(source); const d=L.emptyManifest();
      if(key)d[key]=Math.min(s.cargoCapacity,availableAtSource206(source,key)); return d;
    }
    if(s.missionType==='SUPPLY_BUILDING'||s.missionType==='AUTO'||s.missionType==='MANUAL_TRANSFER') {
      const destination=game.getEntity?.(s.destinationNodeId||s.homeNodeId); return destination?nodeDemand206(destination):L.emptyManifest();
    }
    if(s.missionType==='SUPPLY_AREA') return areaDemand206(game,truck.team,Number(s.targetX)||truck.x,Number(s.targetY)||truck.y,Math.max(320,Number(s.serviceRadius)||680));
    if(s.missionType==='SUPPLY_GROUP') {
      const point=groupPoint206(game,s,truck.team), sum=L.emptyManifest(); if(!point)return sum;
      for(const unit of point.units){const d=unitDeficit206(unit);for(const k of L.STOCK_KEYS)sum[k]+=d[k];}return sum;
    }
    return L.emptyManifest();
  }

  function sourceScore206(game,truck,source,demand) {
    if(!source?.alive||source.team!==truck.team)return Infinity;
    let useful=0,missing=0; for(const key of L.STOCK_KEYS){const need=Math.max(0,Number(demand[key])||0);if(need<=EPS)continue;const have=availableAtSource206(source,key); useful+=Math.min(need,have);missing+=Math.max(0,need-have);}
    if(useful<=EPS)return Infinity;
    const node=L.ensureNode(source), profile=node?.nodeType || (L.ensureExtractor(source)?'extractor':'warehouse');
    const distanceCost=dist(truck,source);
    const risk=routeRisk206(game,truck,source)*850;
    const stockPenalty=missing*.18;
    const congestion=(node?.transportIds?.length||0)*75;
    const typePenalty=SOURCE_TYPE_PENALTY[profile]??260;
    const priorityPenalty=node ? (3-L.priorityMultiplier(node.priority))*45 : 0;
    return distanceCost+risk+stockPenalty+congestion+typePenalty+priorityPenalty;
  }

  Game.prototype.findSupplySource206=function(truck,demand,excludeId=null){
    const candidates=[];
    for(const b of this.buildings||[]){if(!b?.alive||!b.completed||b.team!==truck.team||b.id===excludeId)continue;if(!L.ensureNode(b)&&!L.ensureExtractor(b))continue;const score=sourceScore206(this,truck,b,demand);if(Number.isFinite(score))candidates.push({b,score});}
    candidates.sort((a,b)=>a.score-b.score||String(a.b.id).localeCompare(String(b.b.id),'en'));
    return candidates[0]?.b||null;
  };

  function chooseExtractionDestination206(game,truck,source) {
    const candidates=(game.buildings||[]).filter(b=>b?.alive&&b.completed&&b.team===truck.team&&b.id!==source?.id&&L.ensureNode(b)?.stock)
      .map(b=>({b,score:dist(truck,b)+(SOURCE_TYPE_PENALTY[L.ensureNode(b).nodeType]??240)+routeRisk206(game,truck,b)*850}))
      .sort((a,b)=>a.score-b.score||String(a.b.id).localeCompare(String(b.b.id),'en'));
    return candidates[0]?.b||null;
  }

  function setTruckMove206(truck,x,y) {
    const command=truck.currentCommand;
    // The logistics command owns the unit; moveToward is invoked by processLogisticsTruck206 itself.
    if(command?.type==='logistics206'){command.lastTargetX=x;command.lastTargetY=y;}
  }

  function moveTruck206(truck,target,dt,interaction='logistics') {
    if(!target)return false;
    const range=Math.max(34,Number(truck.radius||20)+(Number(target.radius)||0)+12);
    if(dist(truck,target)<=range)return true;
    if(typeof truck.moveTowardInteraction==='function'&&target.id) return Boolean(truck.moveTowardInteraction(target,truck.currentCommand,dt,interaction));
    if(typeof truck.moveToward==='function') return Boolean(truck.moveToward(target.x,target.y,dt,.92));
    return false;
  }

  function resupplyUnit206(game,truck,unit,dt,budget) {
    const cargo=truck.logistics206.cargo, s=L.ensureUnit(unit,false); if(!s)return 0;
    let left=Math.max(0,budget),moved=0;
    const transfer=(key,need,apply)=>{if(left<=EPS||need<=EPS)return;const amount=L.round(Math.min(left,Math.max(0,Number(cargo[key])||0),need));if(amount<=EPS)return;cargo[key]=L.round(Number(cargo[key])-amount);apply(amount);left-=amount;moved+=amount;};
    if(s.fuelMax>0)transfer('fuel',Math.max(0,s.fuelMax-s.fuel),a=>{s.fuel=L.round(s.fuel+a);});
    if(s.ammoReserveMax>0)transfer('ammo',Math.max(0,s.ammoReserveMax-s.ammoReserve),a=>{s.ammoReserve=L.round(s.ammoReserve+a);});
    if(s.supportMax>0)transfer('support',Math.max(0,s.supportMax-s.support),a=>{s.support=L.round(s.support+a);});
    if(moved>EPS){s.resupplySourceId=truck.id;s.resupplyProgress=L.clamp(s.resupplyProgress+dt*.45,0,1);unit.supply160=L.unitReadiness(unit).supply;}
    return moved;
  }

  function serviceUnits206(game,truck,units,dt) {
    const s=truck.logistics206;let budget=UNIT_SERVICE_RATE*dt,moved=0;
    const ordered=[...units].sort((a,b)=>{const ra=L.unitReadiness(a).supply,rb=L.unitReadiness(b).supply;return ra-rb||String(a.id).localeCompare(String(b.id),'en');});
    for(const unit of ordered){if(budget<=EPS||L.manifestTotal(s.cargo)<=EPS)break;const amount=resupplyUnit206(game,truck,unit,dt,budget);budget-=amount;moved+=amount;}
    if(moved>EPS){L.ensureGame(game).telemetry.transfers=L.round(Number(L.ensureGame(game).telemetry.transfers)+moved);game.uiDirty=true;}
    return moved;
  }

  function destinationPoint206(game,truck) {
    const s=truck.logistics206;
    if(s.missionType==='SUPPLY_AREA')return {x:Number(s.targetX)||truck.x,y:Number(s.targetY)||truck.y,radius:Math.max(320,Number(s.serviceRadius)||680)};
    if(s.missionType==='SUPPLY_GROUP'){const p=groupPoint206(game,s,truck.team);return p?{x:p.x,y:p.y,radius:Math.max(330,Number(s.serviceRadius)||620),group:p}:null;}
    const b=game.getEntity?.(s.destinationNodeId||s.homeNodeId);return b?.alive?b:null;
  }

  function processTruck206(game,truck,dt) {
    const s=L.ensureUnit(truck,false);if(!s||!truck.alive)return;
    truck.cargo=L.round(L.manifestTotal(s.cargo));
    if(!MISSIONS.includes(s.missionType))s.missionType='AUTO';
    if(s.missionType==='AUTO'&&!s.homeNodeId){s.status='IDLE';return;}
    if(s.missionType==='AUTO'){s.destinationNodeId=s.homeNodeId;s.missionType='SUPPLY_BUILDING';}
    if(s.missionType==='RETURN_TO_SOURCE') {
      const src=game.getEntity?.(s.sourceNodeId||s.homeNodeId);if(!src?.alive){s.status='IDLE';return;}s.status='RETURNING';
      if(moveTruck206(truck,src,dt,'logistics-return')){s.status='WAITING';}return;
    }

    if(!s.phase206)s.phase206=L.manifestTotal(s.cargo)>EPS?'TO_DEST':'PLAN';
    if(s.phase206==='PLAN') {
      const demand=missionDemand206(game,truck);
      if(L.manifestTotal(demand)<=1) {s.status='WAITING_DEMAND';s.waitUntil206=game.time+2.5;return;}
      if(s.waitUntil206&&game.time<s.waitUntil206)return;
      let source=null;
      if(s.missionType==='EXTRACT_RESOURCE'&&s.sourceNodeId)source=game.getEntity?.(s.sourceNodeId);
      else source=game.findSupplySource206(truck,demand,s.destinationNodeId||s.homeNodeId);
      if(!source){s.status='WAITING_SOURCE';s.waitUntil206=game.time+2;return;}
      s.sourceNodeId=source.id;s.plannedDemand206=L.copyManifest(demand);s.phase206='TO_SOURCE';s.status='TO_SOURCE';s.waitUntil206=0;
      game.logisticsEvent206?.('route-assignment',{truckId:truck.id,sourceId:source.id,mission:s.missionType});
    }

    if(s.phase206==='TO_SOURCE') {
      const source=game.getEntity?.(s.sourceNodeId);if(!source?.alive){s.phase206='PLAN';game.logisticsEvent206?.('source-switch',{truckId:truck.id,reason:'source-lost'});return;}
      s.routeRisk=routeRisk206(game,truck,source);
      if(moveTruck206(truck,source,dt,'logistics-source')){s.phase206='LOAD';s.status='LOADING';s.loadAccumulator206=0;}return;
    }

    if(s.phase206==='LOAD') {
      const source=game.getEntity?.(s.sourceNodeId);if(!source?.alive){s.phase206='PLAN';return;}
      const freshDemand=missionDemand206(game,truck);const demand=L.manifestTotal(freshDemand)>1?freshDemand:(s.plannedDemand206||freshDemand);
      const weights={fuel:1,ammo:1.15,support:.75};
      const manifest=L.allocateManifest(demand,Math.max(0,s.cargoCapacity-L.manifestTotal(s.cargo)),weights);
      let budget=LOAD_RATE*dt,moved=0;
      for(const key of L.STOCK_KEYS){if(budget<=EPS)break;const amount=loadResource206(source,s,key,Math.min(manifest[key],budget));budget-=amount;moved+=amount;}
      truck.cargo=L.round(L.manifestTotal(s.cargo));
      const sourceHasUseful=L.STOCK_KEYS.some(k=>Number(demand[k])>EPS&&availableAtSource206(source,k)>EPS);
      const full=truck.cargo>=s.cargoCapacity-1;
      if(full||(!sourceHasUseful&&truck.cargo>EPS)||moved<=EPS&&truck.cargo>EPS){
        if(s.missionType==='EXTRACT_RESOURCE'&&!s.destinationNodeId){const dest=chooseExtractionDestination206(game,truck,source);if(dest)s.destinationNodeId=dest.id;}
        s.phase206='TO_DEST';s.status='TO_DEST';
      } else if(!sourceHasUseful&&truck.cargo<=EPS){s.status='WAITING_SOURCE';s.waitUntil206=game.time+1.5;s.phase206='PLAN';}
      return;
    }

    if(s.phase206==='TO_DEST') {
      let target=destinationPoint206(game,truck);
      if(!target){s.phase206='PLAN';s.status='WAITING_DESTINATION';return;}
      if(s.missionType==='SUPPLY_AREA'||s.missionType==='SUPPLY_GROUP') {
        const pseudo={x:target.x,y:target.y,radius:0};s.routeRisk=routeRisk206(game,truck,pseudo);
        if(moveTruck206(truck,pseudo,dt,'logistics-area')||dist(truck,pseudo)<60){s.phase206='SERVICE';s.status='SERVICING';}
      } else {
        s.routeRisk=routeRisk206(game,truck,target);
        if(moveTruck206(truck,target,dt,'logistics-destination')){s.phase206='UNLOAD';s.status='UNLOADING';}
      }
      return;
    }

    if(s.phase206==='UNLOAD') {
      const dest=game.getEntity?.(s.destinationNodeId||s.homeNodeId);const node=L.ensureNode(dest);
      if(!dest?.alive||!node){s.phase206='PLAN';return;}
      let budget=UNLOAD_RATE*dt,moved=0;
      for(const key of L.STOCK_KEYS){if(budget<=EPS)break;const amount=unloadToNode206(s,node,key,Math.min(Number(s.cargo[key])||0,budget));budget-=amount;moved+=amount;}
      truck.cargo=L.round(L.manifestTotal(s.cargo));
      if(moved>EPS)L.ensureGame(game).telemetry.transfers=L.round(Number(L.ensureGame(game).telemetry.transfers)+moved);
      if(truck.cargo<=EPS||moved<=EPS){s.phase206='PLAN';s.status='RETURNING';s.destinationNodeId=s.missionType==='EXTRACT_RESOURCE'?null:s.destinationNodeId;}
      return;
    }

    if(s.phase206==='SERVICE') {
      const point=destinationPoint206(game,truck);if(!point){s.phase206='PLAN';return;}
      let units=[];
      if(s.missionType==='SUPPLY_GROUP'&&point.group)units=point.group.units.filter(u=>dist(u,truck)<=Math.max(300,s.supplyRadius));
      else units=unitsNear206(game,truck.team,truck.x,truck.y,Math.max(260,s.supplyRadius));
      serviceUnits206(game,truck,units,dt);
      truck.cargo=L.round(L.manifestTotal(s.cargo));
      const remainingDemand=missionDemand206(game,truck);
      if(truck.cargo<=Math.min(300,s.cargoCapacity*.08)||L.manifestTotal(remainingDemand)<=1){s.phase206='PLAN';s.status=truck.cargo<=1?'RETURNING':'WAITING_DEMAND';s.waitUntil206=game.time+(L.manifestTotal(remainingDemand)<=1?2.4:0);}
      return;
    }
  }

  Game.prototype.setLogisticsMission206=function(payload={}){
    const ids=(payload.truckIds||payload.unitIds||[payload.truckId]).filter(Boolean);let changed=0;
    for(const id of ids){const truck=this.getEntity?.(id);if(!truck?.alive||!L.isTruck(truck))continue;const s=L.ensureUnit(truck,false);const mission=MISSIONS.includes(payload.missionType)?payload.missionType:'AUTO';
      s.missionType=mission;
      if(payload.homeNodeId!==undefined)s.homeNodeId=payload.homeNodeId||null;
      if(payload.sourceNodeId!==undefined)s.sourceNodeId=payload.sourceNodeId||null;
      if(payload.destinationNodeId!==undefined)s.destinationNodeId=payload.destinationNodeId||null;
      if(payload.targetGroupId!==undefined)s.targetGroupId=payload.targetGroupId||null;
      if(Number.isFinite(payload.targetX))s.targetX=payload.targetX;if(Number.isFinite(payload.targetY))s.targetY=payload.targetY;
      if(Number.isFinite(payload.serviceRadius))s.serviceRadius=Math.max(180,payload.serviceRadius);
      s.phase206=L.manifestTotal(s.cargo)>EPS?'TO_DEST':'PLAN';s.status='ASSIGNED';
      truck.commandQueue=[{type:'logistics206',missionType:mission}];truck.invalidateNavigation?.();changed+=1;
      this.logisticsEvent206?.('mission-assignment',{truckId:truck.id,mission,sourceId:s.sourceNodeId,destinationId:s.destinationNodeId});
    }
    this.uiDirty=true;return changed>0;
  };

  Game.prototype.setSupplyPriority206=function(payload={}){
    const entity=this.getEntity?.(payload.entityId||payload.buildingId);if(!entity?.alive)return false;const node=L.ensureNode(entity);if(node)node.priority=L.priorityName(payload.priority);
    else {const s=L.ensureUnit(entity,false);if(!s)return false;s.supplyPriority206=L.priorityName(payload.priority);}this.uiDirty=true;return true;
  };

  Game.prototype.setSupplyThreshold206=function(payload={}){
    const building=this.getEntity?.(payload.buildingId);const node=L.ensureNode(building);const resource=L.STOCK_KEYS.includes(payload.resource)?payload.resource:null;if(!node||!resource)return false;
    const max=node.stock[`${resource}Max`];if(Number.isFinite(payload.target))node.thresholds.target[resource]=L.round(L.clamp(payload.target,0,max));
    if(Number.isFinite(payload.low))node.thresholds.low[resource]=L.round(L.clamp(payload.low,0,node.thresholds.target[resource]));
    if(Number.isFinite(payload.critical))node.thresholds.critical[resource]=L.round(L.clamp(payload.critical,0,node.thresholds.low[resource]));this.uiDirty=true;return true;
  };

  Game.prototype.createSupplyTransport206=function(payload={}){
    const home=this.getEntity?.(payload.buildingId||payload.homeNodeId);if(!home?.alive||home.team==='neutral')return false;
    const node=L.ensureNode(home);if(!node)return false;
    const active=(this.units||[]).filter(u=>u?.alive&&L.isTruck(u)&&u.logistics206?.homeNodeId===home.id).length;
    if(active>=node.transportSlots)return false;
    let producer=home;
    if(!Array.isArray(producer.stats?.produces)||!producer.stats.produces.includes('resourceTruck'))producer=(this.buildings||[]).filter(b=>b?.alive&&b.completed&&b.team===home.team&&Array.isArray(b.stats?.produces)&&b.stats.produces.includes('resourceTruck')).sort((a,b)=>dist(a,home)-dist(b,home)||String(a.id).localeCompare(String(b.id),'en'))[0];
    if(!producer)return false;
    producer._fdPendingTruckHome206 ||= [];producer._fdPendingTruckHome206.push(home.id);
    const result=this.queueProduction?.(producer,'resourceTruck','unit',false);if(result===false)producer._fdPendingTruckHome206.pop();return result!==false;
  };

  const baseSpawnUnit206=D.Building?.prototype?.spawnUnit;
  if(typeof baseSpawnUnit206==='function')D.Building.prototype.spawnUnit=function(typeId){
    const before=new Set((this.game.units||[]).map(u=>u.id));const result=baseSpawnUnit206.call(this,typeId);
    if(typeId==='resourceTruck'){
      const spawned=(this.game.units||[]).filter(u=>u?.alive&&!before.has(u.id)&&L.isTruck(u)).sort((a,b)=>String(a.id).localeCompare(String(b.id),'en'))[0];
      if(spawned){const homeId=this._fdPendingTruckHome206?.shift?.()||this.id;const s=L.ensureUnit(spawned,true);s.homeNodeId=homeId;s.missionType='SUPPLY_BUILDING';s.destinationNodeId=homeId;s.phase206='PLAN';spawned.commandQueue=[{type:'logistics206',missionType:'SUPPLY_BUILDING'}];}
    }
    return result;
  };

  const baseProcessCommand206=Unit.prototype.processCommand;
  Unit.prototype.processCommand=function(command,dt){if(command?.type==='logistics206'&&L.isTruck(this)){processTruck206(this.game,this,dt);return;}return baseProcessCommand206.call(this,command,dt);};

  function truckLossWatch206(dt){
    const state=L.ensureGame(this);state._truckWatch206 ||= new Map();const alive=new Set();
    for(const truck of (this.units||[]).filter(u=>u?.alive&&L.isTruck(u))){alive.add(truck.id);const s=L.ensureUnit(truck,false);state._truckWatch206.set(truck.id,{x:truck.x,y:truck.y,team:truck.team,cargo:L.copyManifest(s.cargo),capacity:s.cargoCapacity});}
    for(const [id,last] of [...state._truckWatch206.entries()]){if(alive.has(id))continue;state._truckWatch206.delete(id);const lost=L.manifestTotal(last.cargo);if(lost<=EPS)continue;
      const key=routeCell206(last.x,last.y);state.routeRisk[key]=L.round(Math.min(6,(Number(state.routeRisk[key])||0)+.85+lost/Math.max(1000,last.capacity)*.55));state.telemetry.fuelLostInTransit=L.round(Number(state.telemetry.fuelLostInTransit)+Number(last.cargo.fuel));state.telemetry.ammoLostInTransit=L.round(Number(state.telemetry.ammoLostInTransit)+Number(last.cargo.ammo));state.telemetry.supportLostInTransit=L.round(Number(state.telemetry.supportLostInTransit)+Number(last.cargo.support));state.telemetry.trucksDestroyed=(Number(state.telemetry.trucksDestroyed)||0)+1;this.logisticsEvent206?.('route-failure',{truckId:id,x:last.x,y:last.y,cargoLost:L.round(lost),risk:state.routeRisk[key]});}
    decayRouteRisk206(this,dt);
  }
  Game.prototype.registerLogisticsHook206('post',truckLossWatch206,65);

  root.__FD_SUPPLY_TRANSPORT206__={version:'20.6',MISSIONS,routeRisk206,availableAtSource206,areaDemand206,groupUnits206};
})();
