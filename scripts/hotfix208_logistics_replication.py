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
# node. No Fuel is created; the reserve is simply unavailable to refuelling.
old_fuel_store = "    if(node?.stock&&Number(node.stock.fuelMax)>0)return {get:()=>Math.max(0,Number(node.stock.fuel)||0),set:v=>{node.stock.fuel=round(Math.max(0,v));}};"
new_fuel_store = "    if(node?.stock&&Number(node.stock.fuelMax)>0){const reserve=entity.stats?.tiedSupplyTransport208?Math.min(TRUCK_TANK,Math.max(0,Number(node.stock.fuel)||0)):0;return {get:()=>Math.max(0,(Number(node.stock.fuel)||0)-reserve),set:v=>{node.stock.fuel=round(Math.max(0,v)+reserve);}};}"
if single.count(old_fuel_store) != 1:
    raise RuntimeError(f'build 208 protected truck reserve anchor count={single.count(old_fuel_store)}')
single = single.replace(old_fuel_store, new_fuel_store, 1)
SINGLEPLAYER207.write_text(single, 'utf-8')

# Mark only units that actually received physical resources. This gives the
# presentation bridge a short replication window without making every unit a
# permanent high-detail snapshot participant.
supply = SUPPLY.read_text('utf-8')
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

print('Build 208 logistics replication fixed; legacy truck fuel bootstrap, protected replacement reserve and authoritative mission ACK diagnostics installed')
