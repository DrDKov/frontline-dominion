from pathlib import Path

src = Path('tests/logistics211-service.mjs')
out = Path('tests/logistics211-service.generated.mjs')
text = src.read_text('utf-8')
old_wait = "if(receiver.fuel>100 && tank.fuel>100 && (infantry.ammo>10||infantry.support>10)) return {receiver,tank,infantry,outside,air,provider,tick:b.workerTick};"
new_wait = "if(receiver.fuel>=receiver.fuelMax*.90 && tank.fuel>=tank.fuelMax*.80 && (infantry.ammo>10||infantry.support>10)) return {receiver,tank,infantry,outside,air,provider,tick:b.workerTick};"
old_assert = "if(area.receiver.fuel < area.receiver.fuelMax*.80) throw new Error(`receiver truck tank insufficiently refuelled ${JSON.stringify(area.receiver)}`);"
new_assert = "if(area.receiver.fuel < area.receiver.fuelMax*.90) throw new Error(`receiver truck tank insufficiently refuelled ${JSON.stringify(area.receiver)}`);"
if text.count(old_wait) != 1:
    raise RuntimeError(f'build211 service wait anchor count={text.count(old_wait)}')
if text.count(old_assert) != 1:
    raise RuntimeError(f'build211 service assert anchor count={text.count(old_assert)}')
text = text.replace(old_wait, new_wait, 1).replace(old_assert, new_assert, 1)
out.write_text(text, 'utf-8')
print('generated logistics211-service.generated.mjs with full target-level wait')
