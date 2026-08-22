from pathlib import Path

OUT = Path('dist')
SUPPLY = OUT / 'supply-transport-v206.js'
WORKER = OUT / 'authoritative-simulation-worker-v174.js'
BRIDGE = OUT / 'authoritative-simulation-v174.js'
SINGLEPLAYER207 = OUT / 'singleplayer-gameplay-v207.js'

for path in (SUPPLY, WORKER, BRIDGE, SINGLEPLAYER207):
    if not path.exists():
        raise RuntimeError(f'build 208 replication input missing: {path}')

# Build 207 introduced physical truck refuelling, while build 206 sustainment
# already had a legacy migration rule that gave old trucks a 720-unit tank and
# an initial full load. The order of the two post hooks caused the 207 hook to
# set fuelMax first but leave fuel at zero, preventing the 206 migration from
# ever filling the tank. Preserve the intended migration atomically.
single = SINGLEPLAYER207.read_text('utf-8')
old_bootstrap = "      if(!(Number(s.fuelMax)>0))s.fuelMax=TRUCK_TANK;\n      s.fuel=Math.max(0,Math.min(s.fuelMax,Number(s.fuel)||0));"
new_bootstrap = "      if(!(Number(s.fuelMax)>0)){s.fuelMax=TRUCK_TANK;s.fuel=TRUCK_TANK;}\n      s.fuel=Math.max(0,Math.min(s.fuelMax,Number(s.fuel)||0));"
if single.count(old_bootstrap) != 1:
    raise RuntimeError(f'build 208 truck fuel bootstrap anchor count={single.count(old_bootstrap)}')
single = single.replace(old_bootstrap, new_bootstrap, 1)

# Build 208 allows every supply-consuming production building to order a tied
# resource truck. Keep one truck-equipment load (720 Fuel) physically reserved
# at those buildings: an operating truck may refuel from surplus Fuel but must
# not consume the last replacement-truck package and deadlock its own logistics
# node. Resolve capability both from the live instance and the authoritative
# type catalogue because hydrated instance stats can omit v208 marker fields.
old_fuel_store = "    if(node?.stock&&Number(node.stock.fuelMax)>0)return {get:()=>Math.max(0,Number(node.stock.fuel)||0),set:v=>{node.stock.fuel=round(Math.max(0,v));}};"
new_fuel_store = "    if(node?.stock&&Number(node.stock.fuelMax)>0){const typeStats=D.BUILDING_TYPES?.[entity.typeId],tied=Boolean(entity.stats?.tiedSupplyTransport208||typeStats?.tiedSupplyTransport208||entity.stats?.produces?.includes?.('resourceTruck')||typeStats?.produces?.includes?.('resourceTruck'));const reserve=tied?Math.min(TRUCK_TANK,Math.max(0,Number(node.stock.fuel)||0)):0;return {get:()=>Math.max(0,(Number(node.stock.fuel)||0)-reserve),set:v=>{node.stock.fuel=round(Math.max(0,v)+reserve);}};}"
if single.count(old_fuel_store) != 1:
    raise RuntimeError(f'build 208 protected truck reserve anchor count={single.count(old_fuel_store)}')
single = single.replace(old_fuel_store, new_fuel_store, 1)
SINGLEPLAYER207.write_text(single, 'utf-8')

supply = SUPPLY.read_text('utf-8')

# Production nodes are consumers, not free frontline depots. Once build 208
# gives such a node its own tied resource-truck capability, other logistics
# missions may use only stock above one physical replacement-truck package.
# Otherwise an Area/Group mission standing next to a barracks can drain its
# Support/Fuel and permanently prevent the barracks from producing the truck
# needed to resupply itself. The reserve is derived from the authoritative
# production package instead of duplicating its constants.
old_available_stock = "    return Math.max(0, Number(node.stock?.[key]) || 0);"
new_available_stock = "    const typeStats=D.BUILDING_TYPES?.[source.typeId],tied=Boolean(source.stats?.tiedSupplyTransport208||typeStats?.tiedSupplyTransport208);const reserve=tied?Math.max(0,Number(source.game?.productionMaterialPackage206?.(source,'resourceTruck')?.[key])||0):0;return Math.max(0,(Number(node.stock?.[key])||0)-reserve);"
if supply.count(old_available_stock) != 1:
    raise RuntimeError(f'build 208 tied dispatch availability anchor count={supply.count(old_available_stock)}')
supply = supply.replace(old_available_stock, new_available_stock, 1)

old_source_stock = "    if (node.stock && Number(node.stock[`${key}Max`]) > 0) return { kind:'stock', get:()=>Number(node.stock[key])||0, set:v=>{node.stock[key]=L.round(Math.max(0,v));} };"
new_source_stock = "    if (node.stock && Number(node.stock[`${key}Max`]) > 0) { const typeStats=D.BUILDING_TYPES?.[source.typeId],tied=Boolean(source.stats?.tiedSupplyTransport208||typeStats?.tiedSupplyTransport208);const reserve=tied?Math.max(0,Number(source.game?.productionMaterialPackage206?.(source,'resourceTruck')?.[key])||0):0;return { kind:'stock', get:()=>Math.max(0,(Number(node.stock[key])||0)-reserve), set:v=>{node.stock[key]=L.round(Math.max(0,v)+reserve);} }; }"
if supply.count(old_source_stock) != 1:
    raise RuntimeError(f'build 208 tied dispatch source-store anchor count={supply.count(old_source_stock)}')
supply = supply.replace(old_source_stock, new_source_stock, 1)

# LOAD must work against residual demand. The inherited loop recalculated the
# same destination deficit every tick without subtracting cargo already loaded,
# so a 700-unit frontline demand could fill a 5600-unit truck. That inflated
# travel/rebalance time and distorted the physical resource economy.
old_load_demand = "      const freshDemand=missionDemand206(game,truck);const demand=L.manifestTotal(freshDemand)>1?freshDemand:(s.plannedDemand206||freshDemand);\n      const weights={fuel:1,ammo:1.15,support:.75};\n      const manifest=L.allocateManifest(demand,Math.max(0,s.cargoCapacity-L.manifestTotal(s.cargo)),weights);"
new_load_demand = "      const freshDemand=missionDemand206(game,truck);const rawDemand=L.manifestTotal(freshDemand)>1?freshDemand:(s.plannedDemand206||freshDemand);const demand=L.copyManifest(rawDemand);\n      for(const key of L.STOCK_KEYS)demand[key]=L.round(Math.max(0,(Number(demand[key])||0)-(Number(s.cargo[key])||0)));\n      const weights={fuel:1,ammo:1.15,support:.75};\n      const manifest=L.allocateManifest(demand,Math.max(0,s.cargoCapacity-L.manifestTotal(s.cargo)),weights);"
if supply.count(old_load_demand) != 1:
    raise RuntimeError(f'build 208 residual demand anchor count={supply.count(old_load_demand)}')
supply = supply.replace(old_load_demand, new_load_demand, 1)

# A manual mission change must not reinterpret arbitrary leftover cargo as the
# correct manifest for the new mission. Keep missionType equal to the user's
# newly selected mission (so UI/ACK remain truthful), but first run an internal
# REBALANCE208 phase that physically returns incompatible cargo to its source.
old_return_block = "    if(s.missionType==='RETURN_TO_SOURCE') {\n      const src=game.getEntity?.(s.sourceNodeId||s.homeNodeId);if(!src?.alive){s.status='IDLE';return;}s.status='RETURNING';\n      if(moveTruck206(truck,src,dt,'logistics-return')){s.status='WAITING';}return;\n    }"
new_return_block = "    if(s.phase206==='REBALANCE208') {\n      const src=game.getEntity?.(s.rebalanceSourceNodeId208||s.sourceNodeId||s.homeNodeId);\n      if(!src?.alive){s.rebalanceSourceNodeId208=null;s.phase206='PLAN';s.status='ASSIGNED';return;}\n      s.status='REBALANCING';\n      if(moveTruck206(truck,src,dt,'logistics-return')){\n        let budget=UNLOAD_RATE*dt,moved=0;const node=L.ensureNode(src),ex=L.ensureExtractor(src);\n        for(const key of L.STOCK_KEYS){if(budget<=EPS)break;let amount=0;\n          if(node?.nodeType==='trade'&&node.importBuffer&&Number(s.cargo[key])>EPS){const available=Math.max(0,Number(s.cargo[key])||0);amount=L.round(Math.min(available,budget));node.importBuffer[key]=L.round((Number(node.importBuffer[key])||0)+amount);s.cargo[key]=L.round(available-amount);}\n          else if(node?.stock)amount=unloadToNode206(s,node,key,Math.min(Number(s.cargo[key])||0,budget));\n          else if(ex?.resourceType===key&&Number(s.cargo[key])>EPS){const max=Math.max(0,Number(src.resourceBufferMax206||src.stats?.bufferCapacity)||0),have=Math.max(0,Number(src.resourceBuffer83)||0),available=Math.max(0,Number(s.cargo[key])||0);amount=L.round(Math.min(available,Math.max(0,max-have),budget));if(amount>EPS){src.resourceBuffer83=L.round(have+amount);s.cargo[key]=L.round(available-amount);}}\n          budget-=amount;moved+=amount;\n        }\n        truck.cargo=L.round(L.manifestTotal(s.cargo));\n        if(truck.cargo<=EPS||moved<=EPS){s.rebalanceSourceNodeId208=null;s.phase206='PLAN';s.status='ASSIGNED';s.waitUntil206=0;}\n      }return;\n    }\n    if(s.missionType==='RETURN_TO_SOURCE') {\n      const src=game.getEntity?.(s.sourceNodeId||s.homeNodeId);if(!src?.alive){s.status='IDLE';return;}s.status='RETURNING';\n      if(moveTruck206(truck,src,dt,'logistics-return')){s.status='WAITING';}return;\n    }"
if supply.count(old_return_block) != 1:
    raise RuntimeError(f'build 208 rebalance return anchor count={supply.count(old_return_block)}')
supply = supply.replace(old_return_block, new_return_block, 1)

old_mission_start = "    for(const id of ids){const truck=this.getEntity?.(id);if(!truck?.alive||!L.isTruck(truck))continue;const s=L.ensureUnit(truck,false);const mission=MISSIONS.includes(payload.missionType)?payload.missionType:'AUTO';\n      s.missionType=mission;"
new_mission_start = "    for(const id of ids){const truck=this.getEntity?.(id);if(!truck?.alive||!L.isTruck(truck))continue;const s=L.ensureUnit(truck,false);const mission=MISSIONS.includes(payload.missionType)?payload.missionType:'AUTO';const previousMission208=s.missionType;\n      s.missionType=mission;"
if supply.count(old_mission_start) != 1:
    raise RuntimeError(f'build 208 mission previous-state anchor count={supply.count(old_mission_start)}')
supply = supply.replace(old_mission_start, new_mission_start, 1)

# hotfix206_truck_commands.py has already converted this path to Unit.setCommand.
# Rebalance only when the new mission cannot consume a meaningful amount of the
# old manifest. Compatible Ammo/Support may continue Area→Group directly.
old_mission_phase = "      s.phase206=L.manifestTotal(s.cargo)>EPS?'TO_DEST':'PLAN';s.status='ASSIGNED';\n      const command206={type:'logistics206',missionType:mission};\n      if(typeof truck.setCommand==='function')truck.setCommand(command206,false);\n      else{truck.commandQueue=[command206];try{truck.currentCommand=command206;}catch(_){}}\n      truck.invalidateNavigation?.();changed+=1;"
new_mission_phase = "      const nextDemand208=missionDemand206(this,truck),cargoTotal208=L.manifestTotal(s.cargo);\n      const incompatibleCargo208=L.STOCK_KEYS.reduce((sum,key)=>sum+((Number(nextDemand208[key])||0)>EPS?0:Math.max(0,Number(s.cargo[key])||0)),0);\n      const rebalanceLimit208=Math.min(300,Math.max(1,s.cargoCapacity*.08));\n      const rebalance208=previousMission208&&previousMission208!==mission&&cargoTotal208>EPS&&mission!=='RETURN_TO_SOURCE'&&incompatibleCargo208>rebalanceLimit208;\n      if(rebalance208){s.rebalanceSourceNodeId208=s.sourceNodeId||s.homeNodeId||null;s.phase206='REBALANCE208';s.status='REBALANCING';}\n      else{s.rebalanceSourceNodeId208=null;s.phase206=cargoTotal208>EPS?'TO_DEST':'PLAN';s.status='ASSIGNED';}\n      const command206={type:'logistics206',missionType:s.missionType};\n      if(typeof truck.setCommand==='function')truck.setCommand(command206,false);\n      else{truck.commandQueue=[command206];try{truck.currentCommand=command206;}catch(_){}}\n      truck.invalidateNavigation?.();changed+=1;"
if supply.count(old_mission_phase) != 1:
    raise RuntimeError(f'build 208 mission rebalance anchor count={supply.count(old_mission_phase)}')
supply = supply.replace(old_mission_phase, new_mission_phase, 1)

# Mark only units that actually received physical resources. This gives the
# presentation bridge a short replication window without making every unit a
# permanent high-detail snapshot participant.
old_resupply = "if(moved>EPS){s.resupplySourceId=truck.id;s.resupplyProgress=L.clamp(s.resupplyProgress+dt*.45,0,1);unit.supply160=L.unitReadiness(unit).supply;}"
new_resupply = "if(moved>EPS){s.resupplySourceId=truck.id;s.resupplyProgress=L.clamp(s.resupplyProgress+dt*.45,0,1);unit.supply160=L.unitReadiness(unit).supply;unit._fdLogisticsDetailUntil208=(Number(game.time)||0)+2.5;}"
if supply.count(old_resupply) != 1:
    raise RuntimeError(f'build 208 resupply replication anchor count={supply.count(old_resupply)}')
supply = supply.replace(old_resupply, new_resupply, 1)
SUPPLY.write_text(supply, 'utf-8')

# dynamicDetails historically omitted off-screen/unselected units. That is
# valid for ordinary combat presentation, but not for player-owned logistics:
# a mission button must visibly change the truck state even when it is outside
# the camera, and a unit that has just received supply must publish its new
# finite stock. Always replicate supply trucks; replicate actual recipients
# only during the short window stamped above.
worker = WORKER.read_text('utf-8')
old_filter = "    if (!force && !selected.has(unit.id) && !inView) continue;\n    records.push(serializeEntity(unit));"
new_filter = "    const logisticsCritical208 = Boolean(\n      unit.currentCommand?.type === 'logistics206' ||\n      self.__FD_LOGISTICS206__?.isTruck?.(unit) ||\n      (Number(unit._fdLogisticsDetailUntil208) || 0) >= (Number(game.time) || 0)\n    );\n    if (!force && !selected.has(unit.id) && !inView && !logisticsCritical208) continue;\n    records.push(serializeEntity(unit));"
if worker.count(old_filter) != 1:
    raise RuntimeError(f'build 208 dynamic detail filter anchor count={worker.count(old_filter)}')
worker = worker.replace(old_filter, new_filter, 1)

# Attach a compact authoritative post-action snapshot to logistics ACKs. This is
# diagnostic state only and does not participate in simulation or hashing. It
# makes command-path regressions observable without mutating the presentation
# mirror optimistically.
old_ack = "  postMessage({ type: 'actionAck', seq: event.seq, networkSeq: event.networkSeq || 0, tick: game.simTick, ok: result !== false, action: event.action });"
new_ack = "  const debug208 = event.action === 'logisticsMission' ? (() => { const ids=(payload.truckIds||payload.unitIds||[payload.truckId]).filter(Boolean); return { payload:plainClone(payload), trucks:ids.map(id=>{const unit=game.getEntity?.(id),s=unit?.logistics206;return {id:String(id),alive:Boolean(unit?.alive),team:unit?.team||null,missionType:s?.missionType||null,targetGroupId:s?.targetGroupId||null,phase206:s?.phase206||null,status:s?.status||null};}) }; })() : null;\n  postMessage({ type: 'actionAck', seq: event.seq, networkSeq: event.networkSeq || 0, tick: game.simTick, ok: result !== false, action: event.action, debug208 });"
if worker.count(old_ack) != 1:
    raise RuntimeError(f'build 208 action ACK anchor count={worker.count(old_ack)}')
worker = worker.replace(old_ack, new_ack, 1)
WORKER.write_text(worker, 'utf-8')

bridge = BRIDGE.read_text('utf-8')
old_bridge_ack = "    if (message.type === 'actionAck') {\n      this.lastAck = Math.max(this.lastAck, message.seq || 0);"
new_bridge_ack = "    if (message.type === 'actionAck') {\n      this.lastActionAck208 = clonePlain(message);\n      this.lastAck = Math.max(this.lastAck, message.seq || 0);"
if bridge.count(old_bridge_ack) != 1:
    raise RuntimeError(f'build 208 bridge ACK anchor count={bridge.count(old_bridge_ack)}')
bridge = bridge.replace(old_bridge_ack, new_bridge_ack, 1)
BRIDGE.write_text(bridge, 'utf-8')

print('Build 208 logistics replication fixed; truck bootstrap, tied production reserves, residual loading, selective cargo rebalance and authoritative mission diagnostics installed')
