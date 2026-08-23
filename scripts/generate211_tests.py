from pathlib import Path

# Direct-service stress gate: wait for the actual target replenishment level rather
# than the first transfer event so the test observes the whole physical cycle.
service_src = Path('tests/logistics211-service.mjs')
service_out = Path('tests/logistics211-service.generated.mjs')
service = service_src.read_text('utf-8')
old_wait = "if(receiver.fuel>100 && tank.fuel>100 && (infantry.ammo>10||infantry.support>10)) return {receiver,tank,infantry,outside,air,provider,tick:b.workerTick};"
new_wait = "if(receiver.fuel>=receiver.fuelMax*.90 && tank.fuel>=tank.fuelMax*.80 && (infantry.ammo>10||infantry.support>10)) return {receiver,tank,infantry,outside,air,provider,tick:b.workerTick};"
old_assert = "if(area.receiver.fuel < area.receiver.fuelMax*.80) throw new Error(`receiver truck tank insufficiently refuelled ${JSON.stringify(area.receiver)}`);"
new_assert = "if(area.receiver.fuel < area.receiver.fuelMax*.90) throw new Error(`receiver truck tank insufficiently refuelled ${JSON.stringify(area.receiver)}`);"
if service.count(old_wait) != 1:
    raise RuntimeError(f'build211 service wait anchor count={service.count(old_wait)}')
if service.count(old_assert) != 1:
    raise RuntimeError(f'build211 service assert anchor count={service.count(old_assert)}')
service = service.replace(old_wait, new_wait, 1).replace(old_assert, new_assert, 1)
service_out.write_text(service, 'utf-8')
print('generated logistics211-service.generated.mjs with full target-level wait')

# Mission-lifecycle gate: RETURN_TO_SOURCE completes at the same physical
# interaction perimeter used by moveTruck206. A truck that already starts inside
# that perimeter must be allowed to become WAITING without artificial centreward
# movement. Cargo must remain physically unchanged in this mission.
mission_src = Path('tests/logistics211-missions.mjs')
mission_out = Path('tests/logistics211-missions.generated.mjs')
mission = mission_src.read_text('utf-8')
old_before = "const returnBefore=await page.evaluate(I=>{const g=globalThis.__FD_DEBUG__.game,t=g.getEntity(I.returnTruck),s=t.logistics206;return{x:t.x,y:t.y,cargo:{...s.cargo}};},I);"
new_before = "const returnBefore=await page.evaluate(I=>{const g=globalThis.__FD_DEBUG__.game,t=g.getEntity(I.returnTruck),src=g.getEntity(I.returnSource),s=t.logistics206,d=Math.hypot((t?.x||0)-(src?.x||0),(t?.y||0)-(src?.y||0)),interactionLimit=Math.max(34,Number(t?.radius||20)+Number(src?.radius||0)+12);return{x:t.x,y:t.y,distance:d,interactionLimit,cargo:{...s.cargo}};},I);"
old_return = "const returned=await waitFor(I=>{const g=globalThis.__FD_DEBUG__.game,t=g.getEntity(I.returnTruck),src=g.getEntity(I.returnSource),s=t?.logistics206,d=Math.hypot((t?.x||0)-(src?.x||0),(t?.y||0)-(src?.y||0));if(d<120&&s?.status==='WAITING')return{distance:d,cargo:{...s.cargo},status:s.status,mission:s.missionType};return{__pending:true,distance:d,cargo:{...s?.cargo},status:s?.status,phase:s?.phase206};},I,40000);"
new_return = "const returned=await waitFor(({I,beforeDistance,interactionLimit})=>{const g=globalThis.__FD_DEBUG__.game,t=g.getEntity(I.returnTruck),src=g.getEntity(I.returnSource),s=t?.logistics206,d=Math.hypot((t?.x||0)-(src?.x||0),(t?.y||0)-(src?.y||0));if(s?.status==='WAITING'&&d<=interactionLimit+5&&d<=beforeDistance+1)return{distance:d,interactionLimit,cargo:{...s.cargo},status:s.status,mission:s.missionType};return{__pending:true,distance:d,beforeDistance,interactionLimit,cargo:{...s?.cargo},status:s?.status,phase:s?.phase206};},{I,beforeDistance:returnBefore.distance,interactionLimit:returnBefore.interactionLimit},40000);"
if mission.count(old_before) != 1:
    raise RuntimeError(f'build211 return-before anchor count={mission.count(old_before)}')
if mission.count(old_return) != 1:
    raise RuntimeError(f'build211 return interaction anchor count={mission.count(old_return)}')
mission = mission.replace(old_before, new_before, 1).replace(old_return, new_return, 1)
mission_out.write_text(mission, 'utf-8')
print('generated logistics211-missions.generated.mjs with exact return interaction perimeter')
