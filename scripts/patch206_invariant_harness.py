from pathlib import Path

path = Path('tests/logistics206-invariants.mjs')
if not path.exists():
    raise RuntimeError('build 206 invariant harness missing')
text = path.read_text('utf-8')

def replace(old, new, label):
    global text
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label} anchor count={count}')
    text = text.replace(old, new, 1)

truck_diag = "currentCommand:t.currentCommand,isTruck:L.isTruck(t),processCommand:String(t.processCommand).slice(0,260)"
replace(
    "assert(wh.logistics206.stock.fuel>0,'no delivered fuel');assert(near(before,after),'fuel not conserved');",
    f"assert(wh.logistics206.stock.fuel>0,`no delivered fuel: ${{JSON.stringify({{{truck_diag},truck:L.ensureUnit(t,false),warehouse:wh.logistics206,extractor:oil.resourceBuffer83}})}}`);assert(near(before,after),'fuel not conserved');",
    'test 2 diagnostics',
)
replace(
    "assert(wh.logistics206.stock.ammo>0,'no delivered ammo');assert(near(before,after),'ammo not conserved');",
    f"assert(wh.logistics206.stock.ammo>0,`no delivered ammo: ${{JSON.stringify({{{truck_diag},truck:L.ensureUnit(t,false),warehouse:wh.logistics206,extractor:mine.resourceBuffer83}})}}`);assert(near(before,after),'ammo not conserved');",
    'test 4 diagnostics',
)
replace(
    "assert(dest.logistics206.stock.fuel>0&&dest.logistics206.stock.ammo>0&&dest.logistics206.stock.support>0,'building not supplied');",
    f"assert(dest.logistics206.stock.fuel>0&&dest.logistics206.stock.ammo>0&&dest.logistics206.stock.support>0,`building not supplied: ${{JSON.stringify({{{truck_diag},truck:L.ensureUnit(t,false),source:src.logistics206,destination:dest.logistics206}})}}`);",
    'test 7 diagnostics',
)
replace(
    "assert(s.fuel>0&&s.ammoReserve>0&&s.support>0,'area did not resupply unit');assert(L.manifestTotal(ts.cargo)<before,'truck cargo not debited');",
    "const after=L.ensureUnit(tank,false);const truckAfter=L.ensureUnit(t,false);assert(after.fuel>0&&after.ammoReserve>0&&after.support>0,'area did not resupply unit');assert(L.manifestTotal(truckAfter.cargo)<before,'truck cargo not debited');",
    'test 8 stale state',
)
replace(
    "assert(s.fuel<before,'movement did not consume fuel');",
    "assert(L.ensureUnit(v,false).fuel<before,'movement did not consume fuel');",
    'test 10 stale state',
)
replace(
    "post.call(g,.1);s.fuel=0;const ammo=s.ammoReady;",
    "post.call(g,.1);const live=L.ensureUnit(v,false);live.fuel=0;const ammo=live.ammoReady;",
    'test 11 stale write',
)
replace(
    "assert(near(v.x,x),'empty vehicle still moved');assert(s.ammoReady===ammo&&s.ammoReady>0,'fuel shortage altered ammo');",
    "const after=L.ensureUnit(v,false);assert(near(v.x,x),'empty vehicle still moved');assert(after.ammoReady===ammo&&after.ammoReady>0,'fuel shortage altered ammo');",
    'test 11 stale state',
)
replace(
    "const fuel=s.fuel;v.x+=90;post.call(g,.1);assert(v.x>0&&s.fuel<fuel,'ammo-empty unit could not move');",
    "const fuel=s.fuel;v.x+=90;post.call(g,.1);assert(v.x>0&&L.ensureUnit(v,false).fuel<fuel,'ammo-empty unit could not move');",
    'test 12 stale state',
)
replace(
    "assert(vs.ammoReserve>0,'unit did not receive ammo');assert(ts.cargo.ammo<before,'source ammo not debited');",
    "const after=L.ensureUnit(v,false),truckAfter=L.ensureUnit(t,false);assert(after.ammoReserve>0,'unit did not receive ammo');assert(truckAfter.cargo.ammo<before,'source ammo not debited');",
    'test 14 stale state',
)
path.write_text(text, 'utf-8')
print('Build 206 invariant harness state and truck-command diagnostics enabled')
