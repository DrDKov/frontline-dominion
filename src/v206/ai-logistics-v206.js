(() => {
  'use strict';
  const root=typeof window!=='undefined'?window:self;
  const L=root.__FD_LOGISTICS206__,D=root.__FD_DEBUG__;
  if(!L||!D?.Game||!D?.TacticalAI)return;
  const Game=D.Game,TacticalAI=D.TacticalAI;
  if(Game.prototype.__fdAILogistics206Installed)return;
  Object.defineProperty(Game.prototype,'__fdAILogistics206Installed',{value:true,configurable:true});
  const EPS=1e-6,AI_EPOCH_TICKS206=100;

  function nodeReadiness206(node){if(!node?.stock)return 1;const vals=L.STOCK_KEYS.filter(k=>node.stock[`${k}Max`]>0).map(k=>L.stockRatio(node.stock,k));return vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:1;}
  function aggregateLogistics206(game,team){
    const army=L.aggregateTeam(game,team),nodes=(game.buildings||[]).filter(b=>b?.alive&&b.completed&&b.team===team&&L.ensureNode(b));
    const pmto=nodes.filter(b=>L.ensureNode(b).nodeType==='pmto'),airfields=nodes.filter(b=>L.ensureNode(b).nodeType==='airfield');
    const trucks=(game.units||[]).filter(u=>u?.alive&&u.team===team&&L.isTruck(u));
    const physical=L.totalPhysical(game,team),telemetry=L.ensureGame(game).telemetry;
    const produced=Math.max(0,Number(telemetry.fuelProduced)||0)+Math.max(0,Number(telemetry.ammoProduced)||0),imported=Math.max(0,Number(telemetry.fuelImported)||0)+Math.max(0,Number(telemetry.ammoImported)||0);
    const consumptionFuel=Math.max(.01,Number(telemetry.fuelConsumed)||0),consumptionAmmo=Math.max(.01,Number(telemetry.ammoConsumed)||0),consumptionSupport=Math.max(.01,Number(telemetry.supportConsumed)||0);
    const elapsed=Math.max(1,Number(game.time)||1);
    const result={
      armyFuelReadiness:army.armyFuelReadiness,armyAmmoReadiness:army.armyAmmoReadiness,armySupportReadiness:army.armySupportReadiness,
      regionalSupplyReadiness:pmto.length?pmto.reduce((s,b)=>s+nodeReadiness206(L.ensureNode(b)),0)/pmto.length:Math.min(army.armyFuelReadiness,army.armyAmmoReadiness,army.armySupportReadiness),
      regionalFuelEndurance:physical.fuel/Math.max(.01,consumptionFuel/elapsed),regionalAmmoEndurance:physical.ammo/Math.max(.01,consumptionAmmo/elapsed),regionalSupportEndurance:physical.support/Math.max(.01,consumptionSupport/elapsed),
      airfieldReadiness:airfields.length?airfields.reduce((s,b)=>s+nodeReadiness206(L.ensureNode(b)),0)/airfields.length:0,
      logisticsThroughput:nodes.reduce((s,b)=>s+(Number(L.ensureNode(b).throughput)||0),0),
      routeRisk:trucks.length?trucks.reduce((s,u)=>s+(Number(u.logistics206?.routeRisk)||0),0)/trucks.length:0,
      stockpileEndurance:Math.min(physical.fuel/Math.max(.01,consumptionFuel/elapsed),physical.ammo/Math.max(.01,consumptionAmmo/elapsed)),
      importDependency:imported/Math.max(1,produced+imported),domesticProductionCoverage:produced/Math.max(1,produced+imported),
      truckCount:trucks.length,nodeCount:nodes.length,forwardNodeCount:pmto.length,
    };
    L.ensureGame(game).team[team].aggregates={...(L.ensureGame(game).team[team].aggregates||{}),...result};return result;
  }

  function demandScore206(building){const node=L.ensureNode(building);if(!node)return-Infinity;const demand=L.computeDemand(node.stock,node.thresholds,node.priority);let score=L.manifestTotal(demand)*L.priorityMultiplier(node.priority);if(node.nodeType==='airfield')score*=1.25;if(node.nodeType==='pmto')score*=1.35;if(node.nodeType==='central')score*=.9;return score;}
  function credits206(game){return{player:L.round(Number(game.teams?.player?.credits)||0),enemy:L.round(Number(game.teams?.enemy?.credits)||0)};}
  function physical206(game){return{player:L.totalPhysical(game,'player'),enemy:L.totalPhysical(game,'enemy')};}
  function queue206(building){return(building?.queue||[]).map(item=>({typeId:item?.typeId||item?.id||item?.type||null,kind:item?.kind||null,progress:L.round(Number(item?.progress)||0),remaining:L.round(Number(item?.remaining)||0),cost:L.round(Number(item?.cost)||0)}));}

  TacticalAI.prototype.managePhysicalLogistics206=function(){
    const game=this.game,team='enemy';
    const trace={tick:Number(game.simTick)||0,before:{credits:credits206(game),physical:physical206(game)},steps:[]};
    const mark=(name,extra={})=>trace.steps.push({name,credits:credits206(game),...extra});
    L.scanEntities(game,true);mark('scan');
    const metrics=aggregateLogistics206(game,team);this.logisticsMetrics206=metrics;mark('aggregate',{metrics:{fuel:L.round(metrics.armyFuelReadiness),ammo:L.round(metrics.armyAmmoReadiness),support:L.round(metrics.armySupportReadiness),regional:L.round(metrics.regionalSupplyReadiness)}});
    const nodes=(game.buildings||[]).filter(b=>b?.alive&&b.completed&&b.team===team&&L.ensureNode(b));
    const pmto=nodes.filter(b=>L.ensureNode(b).nodeType==='pmto');
    const airfields=nodes.filter(b=>L.ensureNode(b).nodeType==='airfield');
    const trade=nodes.filter(b=>['trade'].includes(L.ensureNode(b).nodeType));
    for(const b of trade){game.ensureTradeState206?.(b);const t=L.ensureNode(b).trade;if(t){t.fuel.mode='MAINTAIN_STOCK';t.fuel.targetAmount=Math.max(t.fuel.targetAmount||0,20000);t.ammo.mode='MAINTAIN_STOCK';t.ammo.targetAmount=Math.max(t.ammo.targetAmount||0,15000);}}
    mark('trade',{nodes:nodes.length,pmto:pmto.length,airfields:airfields.length,trade:trade.map(b=>String(b.id))});

    const preparing=Math.min(metrics.armyFuelReadiness,metrics.armyAmmoReadiness,metrics.armySupportReadiness,metrics.regionalSupplyReadiness)<.68;
    for(const b of pmto){const n=L.ensureNode(b);n.priority=preparing?'HIGH':(nodeReadiness206(n)<.3?'CRITICAL':'NORMAL');for(const k of L.STOCK_KEYS)n.thresholds.target[k]=L.round(n.stock[`${k}Max`]*(preparing ? .90 : .70));}
    for(const b of airfields){const n=L.ensureNode(b);if(nodeReadiness206(n)<.30)n.priority='CRITICAL';else if(nodeReadiness206(n)<.58)n.priority='HIGH';}
    mark('priorities',{preparing,pmto:pmto.map(b=>({id:String(b.id),priority:L.ensureNode(b).priority,stock:{...L.ensureNode(b).stock},target:{...L.ensureNode(b).thresholds.target}}))});

    const trucks=(game.units||[]).filter(u=>u?.alive&&u.team===team&&L.isTruck(u)).sort((a,b)=>String(a.id).localeCompare(String(b.id),'en'));
    const desired=Math.max(2,Math.min(18,Math.ceil(nodes.length/2.8)+Math.ceil((game.buildings||[]).filter(b=>b?.alive&&b.team===team&&L.ensureExtractor(b)).length/2)));
    const producer=nodes.concat(game.buildings||[]).filter(b=>b?.alive&&b.completed&&b.team===team&&Array.isArray(b.stats?.produces)&&b.stats.produces.includes('resourceTruck')).sort((a,b)=>String(a.id).localeCompare(String(b.id),'en'))[0]||null;
    trace.production={trucks:trucks.map(u=>String(u.id)),desired,producerId:producer?.id||null,queueBefore:queue206(producer),creditsBefore:credits206(game),attempted:false,result:null};
    if(trucks.length<desired&&producer&&(producer.queue?.length||0)<3){trace.production.attempted=true;trace.production.result=Boolean(game.queueProduction?.(producer,'resourceTruck','unit',false));}
    trace.production.queueAfter=queue206(producer);trace.production.creditsAfter=credits206(game);mark('production',{production:trace.production});

    const destinations=nodes.filter(b=>!['trade'].includes(L.ensureNode(b).nodeType)).sort((a,b)=>demandScore206(b)-demandScore206(a)||String(a.id).localeCompare(String(b.id),'en'));
    let cursor=0,assigned=0;
    for(const truck of trucks){const s=L.ensureUnit(truck,false);const current=game.getEntity?.(s.destinationNodeId);const stale=!current?.alive||demandScore206(current)<5||['IDLE','WAITING_DEMAND','WAITING_DESTINATION'].includes(s.status);
      if(!stale)continue;const dest=destinations[cursor++%Math.max(1,destinations.length)];if(!dest)continue;if(game.setLogisticsMission206?.({truckIds:[truck.id],missionType:'SUPPLY_BUILDING',homeNodeId:s.homeNodeId||dest.id,destinationNodeId:dest.id}))assigned++;}
    mark('missions',{assigned,destinations:destinations.slice(0,8).map(b=>({id:String(b.id),score:L.round(demandScore206(b))}))});

    const critical=Math.min(metrics.armyFuelReadiness,metrics.armyAmmoReadiness,metrics.armySupportReadiness)<.28;
    if(critical)game.logisticsEvent206?.('operation-logistics-warning',{team,metrics:{fuel:metrics.armyFuelReadiness,ammo:metrics.armyAmmoReadiness,support:metrics.armySupportReadiness}});
    trace.after={credits:credits206(game),physical:physical206(game),critical};
    game.__aiLogisticsTrace206=trace;
    return metrics;
  };

  if(typeof TacticalAI.prototype.launchWarOperations126==='function'){
    const baseLaunch206=TacticalAI.prototype.launchWarOperations126;
    TacticalAI.prototype.launchWarOperations126=function(){const m=this.logisticsMetrics206||aggregateLogistics206(this.game,'enemy');const readiness=Math.min(m.armyFuelReadiness,m.armyAmmoReadiness,m.armySupportReadiness,m.regionalSupplyReadiness);
      if(readiness<.52){this.operationTimer126=Math.min(Number(this.operationTimer126)||8,8);this.game.logisticsEvent206?.('operation-logistics-warning',{team:'enemy',readiness,decision:'WAIT'});return false;}return baseLaunch206.call(this);};
  }

  function patchOperationalCore206(game){const core=game.operationalCore160||root.__FD_V160__?.core;if(!core||core.__physicalSupply206)return;core.__physicalSupply206=true;
    core.updateSupply=function(){for(const u of this.game.units||[]){if(!u?.alive||!['player','enemy'].includes(u.team))continue;const r=L.unitReadiness(u);u.supply160=r.supply;const s=L.ensureUnit(u,false);if(s)s.readiness206=r;}};
    const oldSubsystem=core.subsystemHashes?.bind(core);if(oldSubsystem)core.subsystemHashes=function(){return{...oldSubsystem(),logistics206:this.game.logisticsHash206?.()||0};};
  }
  function aiPost206(){
    patchOperationalCore206(this);
    aggregateLogistics206(this,'player');
    aggregateLogistics206(this,'enemy');
    const tick=Number(this.simTick)||0,ai=this.ai;
    if(ai&&tick>0&&tick%AI_EPOCH_TICKS206===0&&ai._lastLogisticsEpoch206!==tick){
      ai._lastLogisticsEpoch206=tick;
      ai.managePhysicalLogistics206();
    }
  }
  Game.prototype.registerLogisticsHook206('post',aiPost206,90);

  Game.prototype.logisticsStrategicEffects206=function(){return['DEGRADE_ENEMY_FUEL','DEGRADE_ENEMY_AMMO','DEGRADE_ENEMY_SUPPORT','INTERDICT_SUPPLY_ROUTE','DESTROY_FORWARD_SUPPLY','REDUCE_AIRFIELD_READINESS','DEGRADE_IMPORT_CAPACITY','FORCE_LOGISTICS_REROUTE','ISOLATE_ENEMY_GROUP','EXHAUST_ARTILLERY_AMMO','REDUCE_OPERATIONAL_TEMPO'];};
  root.__FD_AI_LOGISTICS206__={version:'20.6',aggregateLogistics206,AI_EPOCH_TICKS206};
})();
