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

# Mission-lifecycle gate: RETURN_TO_SOURCE must use the same footprint-aware
# building interaction predicate as authoritative navigation. Building centre
# distance is not a valid completion oracle for large/non-circular footprints.
# Cargo remains physically unchanged by RETURN_TO_SOURCE itself.
mission_src = Path('tests/logistics211-missions.mjs')
mission_out = Path('tests/logistics211-missions.generated.mjs')
mission = mission_src.read_text('utf-8')
old_before = "const returnBefore=await page.evaluate(I=>{const g=globalThis.__FD_DEBUG__.game,t=g.getEntity(I.returnTruck),s=t.logistics206;return{x:t.x,y:t.y,cargo:{...s.cargo}};},I);"
new_before = "const returnBefore=await page.evaluate(I=>{const g=globalThis.__FD_DEBUG__.game,t=g.getEntity(I.returnTruck),src=g.getEntity(I.returnSource),s=t.logistics206,d=Math.hypot((t?.x||0)-(src?.x||0),(t?.y||0)-(src?.y||0)),surface=Number(g.getBuildingSurfaceDistance117?.(t,src)),ready=Boolean(g.isBuildingInteractionReady117?.(t,src,'logistics-return'));return{x:t.x,y:t.y,distance:d,surface:Number.isFinite(surface)?surface:null,ready,cargo:{...s.cargo}};},I);"
old_return = "const returned=await waitFor(I=>{const g=globalThis.__FD_DEBUG__.game,t=g.getEntity(I.returnTruck),src=g.getEntity(I.returnSource),s=t?.logistics206,d=Math.hypot((t?.x||0)-(src?.x||0),(t?.y||0)-(src?.y||0));if(d<120&&s?.status==='WAITING')return{distance:d,cargo:{...s.cargo},status:s.status,mission:s.missionType};return{__pending:true,distance:d,cargo:{...s?.cargo},status:s?.status,phase:s?.phase206};},I,40000);"
new_return = "const returned=await waitFor(({I,beforeDistance})=>{const g=globalThis.__FD_DEBUG__.game,t=g.getEntity(I.returnTruck),src=g.getEntity(I.returnSource),s=t?.logistics206,d=Math.hypot((t?.x||0)-(src?.x||0),(t?.y||0)-(src?.y||0)),surface=Number(g.getBuildingSurfaceDistance117?.(t,src)),ready=Boolean(g.isBuildingInteractionReady117?.(t,src,'logistics-return'));if(s?.status==='WAITING'&&ready&&d<=beforeDistance+1)return{distance:d,surface:Number.isFinite(surface)?surface:null,ready,cargo:{...s.cargo},status:s.status,mission:s.missionType};return{__pending:true,distance:d,beforeDistance,surface:Number.isFinite(surface)?surface:null,ready,cargo:{...s?.cargo},status:s?.status,phase:s?.phase206};},{I,beforeDistance:returnBefore.distance},40000);"
if mission.count(old_before) != 1:
    raise RuntimeError(f'build211 return-before anchor count={mission.count(old_before)}')
if mission.count(old_return) != 1:
    raise RuntimeError(f'build211 return interaction anchor count={mission.count(old_return)}')
mission = mission.replace(old_before, new_before, 1).replace(old_return, new_return, 1)
mission_out.write_text(mission, 'utf-8')
print('generated logistics211-missions.generated.mjs with footprint-aware return predicate')

# The screen-direction behavior is still owned by build 210, but build 211 clones
# the runtime shell and aliases __FD_RUNTIME_SHELL_210__ to the current shell.
# Therefore the inherited behavioral test must accept shell.build=211 while still
# requiring the build-210 HiDPI input owner itself to be present and unchanged.
screen_src = Path('tests/screen-direction210.mjs')
screen_out = Path('tests/screen-direction211.generated.mjs')
screen = screen_src.read_text('utf-8')
old_gate = "globalThis.__FD_RUNTIME_SHELL_210__?.build === 210 && globalThis.__FD_SCREEN_INPUT_FIDELITY_210__?.build === 210"
new_gate = "globalThis.__FD_RUNTIME_SHELL_210__?.build === 211 && globalThis.__FD_SCREEN_INPUT_FIDELITY_210__?.build === 210"
if screen.count(old_gate) != 1:
    raise RuntimeError(f'build211 screen owner gate count={screen.count(old_gate)}')
screen = screen.replace(old_gate, new_gate, 1)
screen = screen.replace("console.log(JSON.stringify({ ok: true, build: 210,", "console.log(JSON.stringify({ ok: true, build: 211, inheritedInputBuild: 210,", 1)
screen_out.write_text(screen, 'utf-8')
print('generated screen-direction211.generated.mjs with inherited build-210 input owner')
