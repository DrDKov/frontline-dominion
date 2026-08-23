(() => {
  'use strict';
  const root = typeof window !== 'undefined' ? window : self;
  const L = root.__FD_LOGISTICS206__, D = root.__FD_DEBUG__;
  if (!L || !D?.Game || !D?.TacticalAI) return;
  const TacticalAI = D.TacticalAI;
  if (TacticalAI.prototype.__fdEconomyLogistics214Installed) return;
  Object.defineProperty(TacticalAI.prototype, '__fdEconomyLogistics214Installed', { value:true, configurable:true });

  const BUILD = 214, VERSION = '16.9.8', EPS = 1e-6;
  const STORAGE_TYPES = new Set(['central','warehouse','pmto','terminal']);
  const GENERAL_TYPES = new Set(['central','warehouse','pmto','terminal','trade']);
  const CFG = Object.freeze({
    easy:   Object.freeze({ haulShare:.38, saturation:.72, truckCap:11, reserveTruck:1, storageTarget:.58, infraCooldown:28, operationFloor:.58 }),
    normal: Object.freeze({ haulShare:.52, saturation:.58, truckCap:17, reserveTruck:1, storageTarget:.68, infraCooldown:18, operationFloor:.52 }),
    hard:   Object.freeze({ haulShare:.68, saturation:.44, truckCap:23, reserveTruck:2, storageTarget:.78, infraCooldown:11, operationFloor:.46 }),
  });
  const cfg = game => CFG[game?.difficultyKey] || CFG.normal;
  const dist = (a,b) => Math.hypot((Number(a?.x)||0)-(Number(b?.x)||0),(Number(a?.y)||0)-(Number(b?.y)||0));
  const round = v => L.round?.(v) ?? Math.round((Number(v)||0)*1000)/1000;
  const manifest = () => ({fuel:0,ammo:0,support:0});

  function nodeList214(game, team='enemy') {
    return (game.buildings||[]).filter(b=>b?.alive&&b.completed&&b.team===team&&!L.ensureExtractor(b)&&L.ensureNode(b)?.stock);
  }
  function storageNodes214(game, team='enemy') {
    return nodeList214(game,team).filter(b=>STORAGE_TYPES.has(L.ensureNode(b).nodeType));
  }
  function usableReserve214(game, team='enemy') {
    const out=manifest();
    for(const b of storageNodes214(game,team)){
      const n=L.ensureNode(b);for(const k of L.STOCK_KEYS)out[k]+=Math.max(0,Number(n.stock[k])||0);
    }
    for(const k of L.STOCK_KEYS)out[k]=round(out[k]);
    return out;
  }
  function storageCapacity214(game, team='enemy') {
    const out=manifest();
    for(const b of storageNodes214(game,team)){
      const n=L.ensureNode(b);for(const k of L.STOCK_KEYS)out[k]+=Math.max(0,Number(n.stock[`${k}Max`])||0);
    }
    return out;
  }
  function storageRoom214(game, team, key) {
    return storageNodes214(game,team).reduce((sum,b)=>{const s=L.ensureNode(b).stock;return sum+Math.max(0,(Number(s[`${key}Max`])||0)-(Number(s[key])||0));},0);
  }
  function extractorRows214(game, team='enemy') {
    return (game.buildings||[]).filter(b=>b?.alive&&b.completed&&b.team===team&&L.ensureExtractor(b)).map(b=>{
      const ex=L.ensureExtractor(b),key=ex?.resourceType||L.extractorResourceType?.(b),amount=Math.max(0,Number(b.resourceBuffer83)||0);
      const cap=Math.max(1,Number(b.resourceBufferMax206||b.stats?.bufferCapacity)||1);
      return {b,key,amount,cap,ratio:amount/cap};
    }).filter(r=>r.key&&r.amount>EPS);
  }
  function backlog214(game, team='enemy') {
    const out=manifest();for(const r of extractorRows214(game,team))out[r.key]+=r.amount;for(const k of L.STOCK_KEYS)out[k]=round(out[k]);return out;
  }
  function nodeDemand214(b) {
    const n=L.ensureNode(b);return n?.stock?L.computeDemand(n.stock,n.thresholds,n.priority):manifest();
  }
  function demandTotal214(b){return L.manifestTotal(nodeDemand214(b));}
  function activeExtractionAssignments214(game) {
    const map=new Map();
    for(const u of game.units||[]){if(!u?.alive||u.team!=='enemy'||!L.isTruck(u))continue;const s=L.ensureUnit(u,false);if(s?.missionType!=='EXTRACT_RESOURCE'||!s.sourceNodeId)continue;const key=String(s.sourceNodeId);if(!map.has(key))map.set(key,[]);map.get(key).push(u);}
    return map;
  }
  function reassignableTruck214(game, truck, urgent=false) {
    const s=L.ensureUnit(truck,false);if(!s)return false;
    if(['SUPPLY_AREA','SUPPLY_GROUP','MANUAL_TRANSFER'].includes(s.missionType))return false;
    if(s.missionType==='EXTRACT_RESOURCE')return false;
    if(['WAITING','WAITING_DEMAND','WAITING_DESTINATION','IDLE','ASSIGNED'].includes(s.status))return true;
    if(s.missionType==='AUTO')return true;
    if(s.missionType==='SUPPLY_BUILDING'){
      const d=game.getEntity?.(s.destinationNodeId);return urgent ? demandTotal214(d)<900 : demandTotal214(d)<160;
    }
    return false;
  }

  function ensureStorageInfrastructure214(ai, snapshot) {
    const game=ai.game,c=cfg(game),team=game.teams?.enemy;if(!team)return null;
    if((Number(game.time)||0)<(Number(ai._nextInfra214)||0))return null;
    const stores=storageNodes214(game,'enemy'),capacity=storageCapacity214(game,'enemy'),reserve=usableReserve214(game,'enemy'),backlog=snapshot.backlog;
    const totalCap=capacity.fuel+capacity.ammo+capacity.support,totalStock=reserve.fuel+reserve.ammo+reserve.support;
    const fill=totalCap>0?totalStock/totalCap:1;
    const blocked=(backlog.fuel>200&&storageRoom214(game,'enemy','fuel')<200)||(backlog.ammo>200&&storageRoom214(game,'enemy','ammo')<200);
    let type=null;
    if(!stores.length){
      type=game.hasBuilding?.('enemy','refinery',true)?'logisticsHub':'refinery';
    }else if(blocked||fill>.84){
      if(D.BUILDING_TYPES?.resourceSilo&&game.requirementsMet?.('enemy',D.BUILDING_TYPES.resourceSilo.requires||[],D.BUILDING_TYPES.resourceSilo.rank||1))type='resourceSilo';
      else type='logisticsHub';
    }
    if(!type||typeof ai.buildPlanned79!=='function')return null;
    const built=Boolean(ai.buildPlanned79(type));
    ai._nextInfra214=(Number(game.time)||0)+(built?c.infraCooldown:Math.max(5,c.infraCooldown*.45));
    return {type,built,fill:round(fill),blocked};
  }

  function ensureTruckFleet214(ai, extractors, nodes) {
    const game=ai.game,c=cfg(game);
    const trucks=(game.units||[]).filter(u=>u?.alive&&u.team==='enemy'&&L.isTruck(u));
    const criticalNodes=nodes.filter(b=>demandTotal214(b)>1800).length;
    const routeLoad=Math.ceil(extractors.length*1.15)+Math.ceil(nodes.length/3.2)+Math.ceil(criticalNodes/2);
    const desired=Math.max(3,Math.min(c.truckCap,routeLoad+c.reserveTruck));
    const queued=(game.buildings||[]).filter(b=>b?.alive&&b.completed&&b.team==='enemy'&&Array.isArray(b.queue)).reduce((sum,b)=>sum+b.queue.filter(q=>(q?.typeId||q?.id)==='resourceTruck').length,0);
    let queuedNow=false,producerId=null;
    if(trucks.length+queued<desired){
      const producer=(game.buildings||[]).filter(b=>b?.alive&&b.completed&&b.team==='enemy'&&b.stats?.produces?.includes('resourceTruck')).sort((a,b)=>(a.queue?.length||0)-(b.queue?.length||0)||String(a.id).localeCompare(String(b.id),'en'))[0];
      if(producer&&(producer.queue?.length||0)<3){producerId=producer.id;queuedNow=Boolean(game.queueProduction?.(producer,'resourceTruck','unit',true));}
    }
    return {current:trucks.length,queued,desired,queuedNow,producerId};
  }

  function assignExtraction214(ai, rows) {
    const game=ai.game,c=cfg(game),active=activeExtractionAssignments214(game);
    const allTrucks=(game.units||[]).filter(u=>u?.alive&&u.team==='enemy'&&L.isTruck(u)).sort((a,b)=>String(a.id).localeCompare(String(b.id),'en'));
    const maxDedicated=Math.max(1,Math.min(allTrucks.length-c.reserveTruck,Math.ceil(allTrucks.length*c.haulShare)));
    let dedicated=[...active.values()].reduce((s,a)=>s+a.length,0),assigned=0;
    const decisions=[];
    const ordered=[...rows].sort((a,b)=>(b.ratio-a.ratio)||(b.amount-a.amount)||String(a.b.id).localeCompare(String(b.b.id),'en'));
    for(const row of ordered){
      if(dedicated>=maxDedicated)break;
      const room=storageRoom214(game,'enemy',row.key);if(room<=EPS){decisions.push({extractorId:row.b.id,reason:'NO_STORAGE_ROOM'});continue;}
      const assignedHere=active.get(String(row.b.id))?.length||0;
      const wanted=Math.min(2,Math.max(1,Math.ceil(row.amount/5600)));
      if(assignedHere>=wanted)continue;
      const urgent=row.ratio>=c.saturation;
      const candidates=allTrucks.filter(t=>reassignableTruck214(game,t,urgent)).sort((a,b)=>dist(a,row.b)-dist(b,row.b)||String(a.id).localeCompare(String(b.id),'en'));
      const truck=candidates[0];if(!truck){decisions.push({extractorId:row.b.id,reason:'NO_FREE_TRUCK'});continue;}
      const ok=Boolean(game.setLogisticsMission206?.({truckIds:[truck.id],missionType:'EXTRACT_RESOURCE',sourceNodeId:row.b.id,destinationNodeId:null,homeNodeId:L.ensureUnit(truck,false)?.homeNodeId||null}));
      if(ok){assigned++;dedicated++;if(!active.has(String(row.b.id)))active.set(String(row.b.id),[]);active.get(String(row.b.id)).push(truck);decisions.push({extractorId:row.b.id,truckId:truck.id,resource:row.key,ratio:round(row.ratio)});}
    }
    return {assigned,dedicated,maxDedicated,decisions};
  }

  function reinforceDeficitDispatch214(ai,nodes) {
    const game=ai.game,c=cfg(game);
    const targets=nodes.filter(b=>!['trade'].includes(L.ensureNode(b).nodeType)&&demandTotal214(b)>5).sort((a,b)=>demandTotal214(b)-demandTotal214(a)||String(a.id).localeCompare(String(b.id),'en'));
    const free=(game.units||[]).filter(u=>u?.alive&&u.team==='enemy'&&L.isTruck(u)&&reassignableTruck214(game,u,false)).sort((a,b)=>String(a.id).localeCompare(String(b.id),'en'));
    let assigned=0;
    for(const dest of targets){if(!free.length)break;const n=L.ensureNode(dest),d=nodeDemand214(dest);const severity=Math.max(...L.STOCK_KEYS.map(k=>n.stock[`${k}Max`]>0?1-L.stockRatio(n.stock,k):0));if(severity<.22)continue;
      free.sort((a,b)=>dist(a,dest)-dist(b,dest)||String(a.id).localeCompare(String(b.id),'en'));const truck=free.shift();if(game.setLogisticsMission206?.({truckIds:[truck.id],missionType:'SUPPLY_BUILDING',destinationNodeId:dest.id,homeNodeId:L.ensureUnit(truck,false)?.homeNodeId||dest.id}))assigned++;
    }
    return {assigned,targets:targets.slice(0,8).map(b=>({id:b.id,demand:round(demandTotal214(b))}))};
  }

  function tuneTrade214(ai, reserve, capacity) {
    const game=ai.game,c=cfg(game),result=[];
    for(const b of nodeList214(game,'enemy').filter(b=>L.ensureNode(b).nodeType==='trade')){
      const t=game.ensureTradeState206?.(b);if(!t)continue;
      for(const key of ['fuel','ammo']){
        const strategicCap=Math.max(1,capacity[key]||1),ratio=(reserve[key]||0)/strategicCap,contract=t[key];
        contract.mode=ratio<.18?'EMERGENCY_PURCHASE':'MAINTAIN_STOCK';
        contract.targetAmount=Math.max(contract.targetAmount||0,Math.round(strategicCap*(ratio<.18?.48:c.storageTarget)));
        if(ratio<.18)contract.nextExecution=Math.min(Number(contract.nextExecution)||game.time,game.time);
        result.push({id:b.id,key,mode:contract.mode,target:contract.targetAmount,ratio:round(ratio)});
      }
    }
    return result;
  }

  const baseManage214=TacticalAI.prototype.managePhysicalLogistics206;
  TacticalAI.prototype.managePhysicalLogistics206=function(){
    // Keep the mature 206 planner for priorities, production and frontline
    // sustainment, then close the physical-economy gaps introduced by the
    // extraction/storage model rather than replacing the whole AI stack.
    const baseMetrics=typeof baseManage214==='function'?baseManage214.call(this):{};
    const game=this.game,c=cfg(game);
    this.ensureExtractors80?.();
    L.scanEntities(game,true);
    const nodes=nodeList214(game,'enemy'),rows=extractorRows214(game,'enemy');
    const reserve=usableReserve214(game,'enemy'),capacity=storageCapacity214(game,'enemy'),backlog=backlog214(game,'enemy');
    const snapshot={reserve,capacity,backlog,extractors:rows.map(r=>({id:r.b.id,resource:r.key,amount:round(r.amount),capacity:round(r.cap),ratio:round(r.ratio)}))};
    const infrastructure=ensureStorageInfrastructure214(this,snapshot);
    const fleet=ensureTruckFleet214(this,rows,nodes);
    const extraction=assignExtraction214(this,rows);
    const deficits=reinforceDeficitDispatch214(this,nodes);
    const trade=tuneTrade214(this,reserve,capacity);

    const usableEndurance={
      fuel: reserve.fuel/Math.max(.01,(Number(L.ensureGame(game).telemetry.fuelConsumed)||0)/Math.max(1,Number(game.time)||1)),
      ammo: reserve.ammo/Math.max(.01,(Number(L.ensureGame(game).telemetry.ammoConsumed)||0)/Math.max(1,Number(game.time)||1)),
      support: reserve.support/Math.max(.01,(Number(L.ensureGame(game).telemetry.supportConsumed)||0)/Math.max(1,Number(game.time)||1)),
    };
    this.logisticsMetrics206={...(this.logisticsMetrics206||baseMetrics),usableStoredFuel214:reserve.fuel,usableStoredAmmo214:reserve.ammo,usableStoredSupport214:reserve.support,extractorBacklogFuel214:backlog.fuel,extractorBacklogAmmo214:backlog.ammo,usableFuelEndurance214:usableEndurance.fuel,usableAmmoEndurance214:usableEndurance.ammo};
    game.__aiEconomyLogistics214={tick:Number(game.simTick)||0,time:round(game.time),difficulty:game.difficultyKey||'normal',snapshot,infrastructure,fleet,extraction,deficits,trade,usableEndurance};
    return this.logisticsMetrics206;
  };

  // Final operation gate uses actually usable stored reserve/readiness, not raw
  // physical mass sitting in extractor buffers or on trucks in transit.
  if(typeof TacticalAI.prototype.launchWarOperations126==='function'){
    const baseLaunch214=TacticalAI.prototype.launchWarOperations126;
    TacticalAI.prototype.launchWarOperations126=function(...args){
      const c=cfg(this.game),m=this.logisticsMetrics206||{},readiness=Math.min(Number(m.armyFuelReadiness??1),Number(m.armyAmmoReadiness??1),Number(m.armySupportReadiness??1),Number(m.regionalSupplyReadiness??1));
      const reserve=usableReserve214(this.game,'enemy'),cap=storageCapacity214(this.game,'enemy');
      const reserveRatio=Math.min(cap.fuel>0?reserve.fuel/cap.fuel:0,cap.ammo>0?reserve.ammo/cap.ammo:0);
      if(readiness<c.operationFloor||reserveRatio<.08){this.operationTimer126=Math.min(Number(this.operationTimer126)||8,8);return false;}
      return baseLaunch214.apply(this,args);
    };
  }

  root.__FD_AI_ECONOMY_LOGISTICS_214__=Object.freeze({
    build:BUILD,version:VERSION,
    extractionHauling:true,
    storedReservePlanning:true,
    deficitDispatch:true,
    fleetRecovery:true,
    storageRecovery:true,
    difficultyScaled:true,
    operationReadinessGate:true,
    usableReserve214,
    storageCapacity214,
    backlog214,
  });
})();
