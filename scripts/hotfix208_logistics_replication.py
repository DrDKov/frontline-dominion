from pathlib import Path

OUT = Path('dist')
SUPPLY = OUT / 'supply-transport-v206.js'
WORKER = OUT / 'authoritative-simulation-worker-v174.js'
SINGLEPLAYER207 = OUT / 'singleplayer-gameplay-v207.js'

for path in (SUPPLY, WORKER, SINGLEPLAYER207):
    if not path.exists():
        raise RuntimeError(f'build 208 replication input missing: {path}')

# Build 207 introduced physical truck refuelling, while build 206 sustainment
# already had a legacy migration rule that gave old trucks a 720-unit tank and
# an initial full load.  The order of the two post hooks caused the 207 hook to
# set fuelMax first but leave fuel at zero, preventing the 206 migration from
# ever filling the tank.  Preserve the intended migration atomically.
single = SINGLEPLAYER207.read_text('utf-8')
old_bootstrap = "      if(!(Number(s.fuelMax)>0))s.fuelMax=TRUCK_TANK;\n      s.fuel=Math.max(0,Math.min(s.fuelMax,Number(s.fuel)||0));"
new_bootstrap = "      if(!(Number(s.fuelMax)>0)){s.fuelMax=TRUCK_TANK;s.fuel=TRUCK_TANK;}\n      s.fuel=Math.max(0,Math.min(s.fuelMax,Number(s.fuel)||0));"
if single.count(old_bootstrap) != 1:
    raise RuntimeError(f'build 208 truck fuel bootstrap anchor count={single.count(old_bootstrap)}')
single = single.replace(old_bootstrap, new_bootstrap, 1)
SINGLEPLAYER207.write_text(single, 'utf-8')

# Mark only units that actually received physical resources.  This gives the
# presentation bridge a short replication window without making every unit a
# permanent high-detail snapshot participant.
supply = SUPPLY.read_text('utf-8')
old_resupply = "if(moved>EPS){s.resupplySourceId=truck.id;s.resupplyProgress=L.clamp(s.resupplyProgress+dt*.45,0,1);unit.supply160=L.unitReadiness(unit).supply;}"
new_resupply = "if(moved>EPS){s.resupplySourceId=truck.id;s.resupplyProgress=L.clamp(s.resupplyProgress+dt*.45,0,1);unit.supply160=L.unitReadiness(unit).supply;unit._fdLogisticsDetailUntil208=(Number(game.time)||0)+2.5;}"
if supply.count(old_resupply) != 1:
    raise RuntimeError(f'build 208 resupply replication anchor count={supply.count(old_resupply)}')
supply = supply.replace(old_resupply, new_resupply, 1)
SUPPLY.write_text(supply, 'utf-8')

# dynamicDetails historically omitted off-screen/unselected units.  That is
# valid for ordinary combat presentation, but not for player-owned logistics:
# a mission button must visibly change the truck state even when it is outside
# the camera, and a unit that has just received supply must publish its new
# finite stock.  Always replicate supply trucks; replicate actual recipients
# only during the short window stamped above.
worker = WORKER.read_text('utf-8')
old_filter = "    if (!force && !selected.has(unit.id) && !inView) continue;\n    records.push(serializeEntity(unit));"
new_filter = "    const logisticsCritical208 = Boolean(\n      unit.currentCommand?.type === 'logistics206' ||\n      self.__FD_LOGISTICS206__?.isTruck?.(unit) ||\n      (Number(unit._fdLogisticsDetailUntil208) || 0) >= (Number(game.time) || 0)\n    );\n    if (!force && !selected.has(unit.id) && !inView && !logisticsCritical208) continue;\n    records.push(serializeEntity(unit));"
if worker.count(old_filter) != 1:
    raise RuntimeError(f'build 208 dynamic detail filter anchor count={worker.count(old_filter)}')
worker = worker.replace(old_filter, new_filter, 1)
WORKER.write_text(worker, 'utf-8')

print('Build 208 logistics replication fixed; legacy supply trucks receive the intended physical fuel bootstrap')
