// requires: __FD_DEBUG__, __FD_LOGISTICS206__
// provides: __FD_AI_ECONOMY_LOGISTICS__
(() => {
  'use strict';
  const root = typeof window !== 'undefined' ? window : self;
  const L = root.__FD_LOGISTICS206__, D = root.__FD_DEBUG__;
  if (!L || !D?.Game || !D?.TacticalAI || root.__FD_AI_ECONOMY_LOGISTICS__) return;
  const TacticalAI = D.TacticalAI;
  if (TacticalAI.prototype.__fdEconomyLogisticsInstalled) return;
  Object.defineProperty(TacticalAI.prototype, '__fdEconomyLogisticsInstalled', { value:true, configurable:true });

  const EPS = 1e-6;
  const STORAGE_TYPES = new Set(['central','warehouse','pmto','terminal']);
  const PROTECTED_MISSIONS = new Set(['SUPPLY_AREA','SUPPLY_GROUP','MANUAL_TRANSFER']);
  const CFG = Object.freeze({
    easy:   Object.freeze({ haulShare:.38, saturation:.72, truckCap:11, reserveTruck:1, storageTarget:.58, infraCooldown:28, operationFloor:.58, emergency:.13, criticalDemand:2200 }),
    normal: Object.freeze({ haulShare:.52, saturation:.58, truckCap:17, reserveTruck:1, storageTarget:.68, infraCooldown:18, operationFloor:.52, emergency:.18, criticalDemand:1750 }),
    hard:   Object.freeze({ haulShare:.68, saturation:.44, truckCap:23, reserveTruck:2, storageTarget:.78, infraCooldown:11, operationFloor:.46, emergency:.24, criticalDemand:1350 }),
  });
  const cfg = game => CFG[game?.difficultyKey] || CFG.normal;
  const dist = (a,b) => Math.hypot((Number(a?.x)||0)-(Number(b?.x)||0),(Number(a?.y)||0)-(Number(b?.y)||0));
  const round = v => L.round?.(v) ?? Math.round((Number(v)||0)*1000)/1000;
  const manifest = () => ({fuel:0,ammo:0,support:0});

  function nodeList(game, team='enemy') {
    return (game.buildings||[]).filter(b=>b?.alive&&b.completed&&b.team===team&&!L.ensureExtractor(b)&&L.ensureNode(b)?.stock);
  }
  function storageNodes(game, team='enemy') {
    return nodeList(game,team).filter(b=>STORAGE_TYPES.has(L.ensureNode(b).nodeType));
  }
  function usableReserve(game, team='enemy') {
    const out=manifest();
    for(const b of storageNodes(game,team)){
      const n=L.ensureNode(b);for(const k of L.STOCK_KEYS)out[k]+=Math.max(0,Number(n.stock[k])||0);
    }
    for(const k of L.STOCK_KEYS)out[k]=round(out[k]);
    return out;
  }
  function storageCapacity(game, team='enemy') {
    const out=manifest();
    for(const b of storageNodes(game,team)){
      const n=L.ensureNode(b);for(const k of L.STOCK_KEYS)out[k]+=Math.max(0,Number(n.stock[`${k}Max`])||0);
    }
    return out;
  }
  function storageRoom(game, team, key) {
    return storageNodes(game,team).reduce((sum,b)=>{const s=L.ensureNode(b).stock;return sum+Math.max(0,(Number(s[`${key}Max`])||0)-(Number(s[key])||0));},0);
  }
  function extractorRows(game, team='enemy') {
    return (game.buildings||[]).filter(b=>b?.alive&&b.completed&&b.team===team&&L.ensureExtractor(b)).map(b=>{
      const ex=L.ensureExtractor(b),key=ex?.resourceType||L.extractorResourceType?.(b),amount=Math.max(0,Number(b.resourceBuffer83)||0);
      const cap=Math.max(1,Number(b.resourceBufferMax206||b.stats?.bufferCapacity)||1);
      return {b,key,amount,cap,ratio:amount/cap};
    }).filter(r=>r.key&&r.amount>EPS);
  }
  function backlog(game, team='enemy') {
    const out=manifest();for(const r of extractorRows(game,team))out[r.key]+=r.amount;for(const k of L.STOCK_KEYS)out[k]=round(out[k]);return out;
  }
  function nodeDemand(b) {
    const n=L.ensureNode(b);return n?.stock?L.computeDemand(n.stock,n.thresholds,n.priority):manifest();
  }
  const demandTotal = b => b ? L.manifestTotal(nodeDemand(b)) : 0;
  const ratio = (reserve,cap,key) => cap[key]>EPS ? Math.max(0,Math.min(1,reserve[key]/cap[key])) : 0;

  function strategicWeight(b) {
    const n=L.ensureNode(b); if(!n) return 0;
    let weight = ({airfield:5,pmto:4.7,central:3.4,warehouse:2.8,terminal:2.6,trade:1.2}[n.nodeType]||2.1);
    if((b.stats?.produces||[]).length) weight += 2.1;
    if(String(n.priority||b.priority||'').toUpperCase()==='CRITICAL') weight += 3;
    else if(String(n.priority||b.priority||'').toUpperCase()==='HIGH') weight += 1.4;
    return weight;
  }

  function activeExtractionAssignments(game) {
    const map=new Map();
    for(const u of game.units||[]){
      if(!u?.alive||u.team!=='enemy'||!L.isTruck(u))continue;
      const s=L.ensureUnit(u,false);if(s?.missionType!=='EXTRACT_RESOURCE'||!s.sourceNodeId)continue;
      const key=String(s.sourceNodeId);if(!map.has(key))map.set(key,[]);map.get(key).push(u);
    }
    return map;
  }
  function protectedFieldMission(truck) {
    const s=L.ensureUnit(truck,false);return Boolean(s&&PROTECTED_MISSIONS.has(s.missionType));
  }
  function reassignableTruck(game,truck,urgent=false) {
    const s=L.ensureUnit(truck,false);if(!s||protectedFieldMission(truck)||s.missionType==='EXTRACT_RESOURCE')return false;
    if(['WAITING','WAITING_DEMAND','WAITING_DESTINATION','IDLE','ASSIGNED'].includes(s.status))return true;
    if(s.missionType==='AUTO'||s.missionType==='RETURN_TO_SOURCE')return true;
    if(s.missionType==='SUPPLY_BUILDING'){
      const d=game.getEntity?.(s.destinationNodeId);return urgent ? demandTotal(d)<900 : demandTotal(d)<160;
    }
    return false;
  }

  function ensureStorageInfrastructure(ai,snapshot) {
    const game=ai.game,c=cfg(game),team=game.teams?.enemy;if(!team)return null;
    if((Number(game.time)||0)<(Number(ai._nextEconomyInfra)||0))return null;
    const stores=storageNodes(game,'enemy'),capacity=storageCapacity(game,'enemy'),reserve=usableReserve(game,'enemy'),back=snapshot.backlog;
    const totalCap=capacity.fuel+capacity.ammo+capacity.support,totalStock=reserve.fuel+reserve.ammo+reserve.support;
    const fill=totalCap>0?totalStock/totalCap:1;
    const blocked=(back.fuel>200&&storageRoom(game,'enemy','fuel')<200)||(back.ammo>200&&storageRoom(game,'enemy','ammo')<200)||(back.support>200&&storageRoom(game,'enemy','support')<200);
    let type=null;
    if(!stores.length) type=game.hasBuilding?.('enemy','refinery',true)?'logisticsHub':'refinery';
    else if(blocked||fill>.84){
      if(D.BUILDING_TYPES?.resourceSilo&&game.requirementsMet?.('enemy',D.BUILDING_TYPES.resourceSilo.requires||[],D.BUILDING_TYPES.resourceSilo.rank||1))type='resourceSilo';
      else type='logisticsHub';
    }
    if(!type||typeof ai.buildPlanned79!=='function')return {type:null,built:false,fill:round(fill),blocked,stores:stores.length};
    const built=Boolean(ai.buildPlanned79(type));
    ai._nextEconomyInfra=(Number(game.time)||0)+(built?c.infraCooldown:Math.max(5,c.infraCooldown*.45));
    return {type,built,fill:round(fill),blocked,stores:stores.length};
  }

  function ensureTruckFleet(ai,extractors,nodes) {
    const game=ai.game,c=cfg(game);
    const trucks=(game.units||[]).filter(u=>u?.alive&&u.team==='enemy'&&L.isTruck(u));
    const criticalNodes=nodes.filter(b=>demandTotal(b)>c.criticalDemand*.65).length;
    const routeLoad=Math.ceil(extractors.length*1.15)+Math.ceil(nodes.length/3.2)+Math.ceil(criticalNodes/2);
    const desired=Math.max(3,Math.min(c.truckCap,routeLoad+c.reserveTruck));
    const queued=(game.buildings||[]).filter(b=>b?.alive&&b.completed&&b.team==='enemy'&&Array.isArray(b.queue)).reduce((sum,b)=>sum+b.queue.filter(q=>(q?.typeId||q?.id)==='resourceTruck').length,0);
    let queuedNow=false,producerId=null;
    if(trucks.length+queued<desired){
      const producer=(game.buildings||[]).filter(b=>b?.alive&&b.completed&&b.team==='enemy'&&b.stats?.produces?.includes('resourceTruck')).sort((a,b)=>(a.queue?.length||0)-(b.queue?.length||0)||String(a.id).localeCompare(String(b.id),'en'))[0];
      if(producer&&(producer.queue?.length||0)<3){producerId=producer.id;queuedNow=Boolean(game.queueProduction?.(producer,'resourceTruck','unit',true));}
    }
    const protectedCount=trucks.filter(protectedFieldMission).length;
    return {current:trucks.length,queued,desired,queuedNow,producerId,reserveRequired:c.reserveTruck,protectedCount};
  }

  function assignExtraction(ai,rows) {
    const game=ai.game,c=cfg(game),active=activeExtractionAssignments(game);
    const allTrucks=(game.units||[]).filter(u=>u?.alive&&u.team==='enemy'&&L.isTruck(u)).sort((a,b)=>String(a.id).localeCompare(String(b.id),'en'));
    const availableForHaul=Math.max(0,allTrucks.length-c.reserveTruck-allTrucks.filter(protectedFieldMission).length);
    const maxDedicated=Math.max(0,Math.min(availableForHaul,Math.ceil(allTrucks.length*c.haulShare)));
    let dedicated=[...active.values()].reduce((s,a)=>s+a.length,0),assigned=0;
    const decisions=[];
    const ordered=[...rows].sort((a,b)=>(b.ratio-a.ratio)||(b.amount-a.amount)||String(a.b.id).localeCompare(String(b.b.id),'en'));
    for(const row of ordered){
      if(dedicated>=maxDedicated)break;
      if(row.ratio<c.saturation&&dedicated>0)continue;
      const room=storageRoom(game,'enemy',row.key);if(room<=EPS){decisions.push({extractorId:row.b.id,reason:'NO_STORAGE_ROOM'});continue;}
      const assignedHere=active.get(String(row.b.id))?.length||0;
      const wanted=Math.min(2,Math.max(1,Math.ceil(row.amount/5600)));
      if(assignedHere>=wanted)continue;
      const urgent=row.ratio>=c.saturation;
      const candidates=allTrucks.filter(t=>reassignableTruck(game,t,urgent)).sort((a,b)=>dist(a,row.b)-dist(b,row.b)||String(a.id).localeCompare(String(b.id),'en'));
      const truck=candidates[0];if(!truck){decisions.push({extractorId:row.b.id,reason:'NO_FREE_TRUCK'});continue;}
      const ok=Boolean(game.setLogisticsMission206?.({truckIds:[truck.id],missionType:'EXTRACT_RESOURCE',sourceNodeId:row.b.id,destinationNodeId:null,homeNodeId:L.ensureUnit(truck,false)?.homeNodeId||null}));
      if(ok){assigned++;dedicated++;if(!active.has(String(row.b.id)))active.set(String(row.b.id),[]);active.get(String(row.b.id)).push(truck);decisions.push({extractorId:row.b.id,truckId:truck.id,resource:row.key,ratio:round(row.ratio)});}
    }
    return {assigned,dedicated,maxDedicated,reserveProtected:c.reserveTruck,decisions};
  }

  function reinforceDeficitDispatch(ai,nodes) {
    const game=ai.game,c=cfg(game);
    const targets=nodes.filter(b=>L.ensureNode(b).nodeType!=='trade'&&demandTotal(b)>5).map(b=>({b,demand:demandTotal(b),score:demandTotal(b)*strategicWeight(b)})).sort((a,b)=>b.score-a.score||String(a.b.id).localeCompare(String(b.b.id),'en'));
    const trucks=(game.units||[]).filter(u=>u?.alive&&u.team==='enemy'&&L.isTruck(u));
    const free=trucks.filter(u=>reassignableTruck(game,u,false));
    const preserve=Math.max(c.reserveTruck,PROTECTED_MISSIONS.size?1:0);
    let assigned=0;
    const decisions=[];
    for(const row of targets){
      if(free.length<=preserve)break;
      const dest=row.b,n=L.ensureNode(dest);
      const severity=Math.max(...L.STOCK_KEYS.map(k=>n.stock[`${k}Max`]>0?1-L.stockRatio(n.stock,k):0));
      if(severity<.22&&row.demand<c.criticalDemand)continue;
      free.sort((a,b)=>dist(a,dest)-dist(b,dest)||String(a.id).localeCompare(String(b.id),'en'));
      const truck=free.shift();
      const ok=Boolean(game.setLogisticsMission206?.({truckIds:[truck.id],missionType:'SUPPLY_BUILDING',destinationNodeId:dest.id,homeNodeId:L.ensureUnit(truck,false)?.homeNodeId||dest.id}));
      if(ok){assigned++;decisions.push({truckId:truck.id,destinationId:dest.id,nodeType:n.nodeType,severity:round(severity),demand:round(row.demand),weight:round(strategicWeight(dest))});}
    }
    return {assigned,freeRemaining:free.length,decisions,targets:targets.slice(0,10).map(r=>({id:r.b.id,nodeType:L.ensureNode(r.b).nodeType,demand:round(r.demand),score:round(r.score)}))};
  }

  function tuneTrade(ai,reserve,capacity) {
    const game=ai.game,c=cfg(game),result=[];
    for(const b of nodeList(game,'enemy').filter(b=>L.ensureNode(b).nodeType==='trade')){
      const t=game.ensureTradeState206?.(b);if(!t)continue;
      for(const key of ['fuel','ammo']){
        const strategicCap=Math.max(1,capacity[key]||1),r=(reserve[key]||0)/strategicCap,contract=t[key];if(!contract)continue;
        contract.mode=r<c.emergency?'EMERGENCY_PURCHASE':'MAINTAIN_STOCK';
        contract.targetAmount=Math.max(contract.targetAmount||0,Math.round(strategicCap*(r<c.emergency?Math.max(.48,c.storageTarget):c.storageTarget)));
        if(r<c.emergency)contract.nextExecution=Math.min(Number(contract.nextExecution)||game.time,game.time);
        result.push({id:b.id,key,mode:contract.mode,target:contract.targetAmount,ratio:round(r)});
      }
    }
    return result;
  }

  function computeEndurance(game,reserve) {
    const telemetry=L.ensureGame(game)?.telemetry||{},time=Math.max(1,Number(game.time)||1);
    return {
      fuel:reserve.fuel/Math.max(.01,(Number(telemetry.fuelConsumed)||0)/time),
      ammo:reserve.ammo/Math.max(.01,(Number(telemetry.ammoConsumed)||0)/time),
      support:reserve.support/Math.max(.01,(Number(telemetry.supportConsumed)||0)/time),
    };
  }

  const baseManage=TacticalAI.prototype.managePhysicalLogistics206;
  TacticalAI.prototype.managePhysicalLogistics206=function(){
    const baseMetrics=typeof baseManage==='function'?baseManage.call(this):{};
    const game=this.game;
    this.ensureExtractors80?.();
    L.scanEntities(game,true);
    const nodes=nodeList(game,'enemy'),rows=extractorRows(game,'enemy');
    const reserve=usableReserve(game,'enemy'),capacity=storageCapacity(game,'enemy'),back=backlog(game,'enemy');
    const snapshot={reserve,capacity,backlog:back,extractors:rows.map(r=>({id:r.b.id,resource:r.key,amount:round(r.amount),capacity:round(r.cap),ratio:round(r.ratio)}))};
    const infrastructure=ensureStorageInfrastructure(this,snapshot);
    const fleet=ensureTruckFleet(this,rows,nodes);
    const extraction=assignExtraction(this,rows);
    const deficits=reinforceDeficitDispatch(this,nodes);
    const trade=tuneTrade(this,reserve,capacity);
    const usableEndurance=computeEndurance(game,reserve);
    const reserveRatios={fuel:round(ratio(reserve,capacity,'fuel')),ammo:round(ratio(reserve,capacity,'ammo')),support:round(ratio(reserve,capacity,'support'))};
    this.logisticsMetrics206={...(this.logisticsMetrics206||baseMetrics),usableStoredFuel:reserve.fuel,usableStoredAmmo:reserve.ammo,usableStoredSupport:reserve.support,extractorBacklogFuel:back.fuel,extractorBacklogAmmo:back.ammo,usableFuelEndurance:usableEndurance.fuel,usableAmmoEndurance:usableEndurance.ammo,reserveRatios};
    game.__aiEconomyLogistics={tick:Number(game.simTick)||0,time:round(game.time),difficulty:game.difficultyKey||'normal',snapshot,infrastructure,fleet,extraction,deficits,trade,usableEndurance,reserveRatios};
    return this.logisticsMetrics206;
  };

  if(typeof TacticalAI.prototype.launchWarOperations126==='function'){
    const baseLaunch=TacticalAI.prototype.launchWarOperations126;
    TacticalAI.prototype.launchWarOperations126=function(...args){
      const c=cfg(this.game),m=this.logisticsMetrics206||{},readiness=Math.min(Number(m.armyFuelReadiness??1),Number(m.armyAmmoReadiness??1),Number(m.armySupportReadiness??1),Number(m.regionalSupplyReadiness??1));
      const reserve=usableReserve(this.game,'enemy'),cap=storageCapacity(this.game,'enemy');
      const reserveRatio=Math.min(cap.fuel>0?reserve.fuel/cap.fuel:0,cap.ammo>0?reserve.ammo/cap.ammo:0);
      const blocked=readiness<c.operationFloor||reserveRatio<.08;
      this.game.__aiOperationLogisticsGate={blocked,readiness:round(readiness),reserveRatio:round(reserveRatio),floor:c.operationFloor,storedReserve:{...reserve}};
      if(blocked){this.operationTimer126=Math.min(Number(this.operationTimer126)||8,8);return false;}
      return baseLaunch.apply(this,args);
    };
  }

  root.__FD_AI_ECONOMY_LOGISTICS__=Object.freeze({
    extractionHauling:true,
    storedReservePlanning:true,
    deficitDispatch:true,
    fleetRecovery:true,
    storageRecovery:true,
    tradeEmergency:true,
    supportPhysicalOnly:true,
    difficultyScaled:true,
    operationReadinessGate:true,
    protectedFieldMissions:true,
    reserveTrucks:true,
    configurations:CFG,
    usableReserve,
    storageCapacity,
    backlog,
    diagnostics(game){return game?.__aiEconomyLogistics||null;},
  });
})();
