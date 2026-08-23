from pathlib import Path

# Build 211 service-phase safety: a truck whose remaining cargo cannot satisfy
# any remaining demand key (e.g. only fuel left after every tank is full while
# the area still needs ammo/support) previously idled in SERVICE forever —
# the exit condition only checked total cargo volume and total demand. Add a
# per-key deliverability check so the truck replans and reloads instead.
# Also marks the build-211 integrity manifest with the new behaviour.

SUPPLY = Path('dist/supply-transport-v206.js')
if not SUPPLY.exists():
    raise RuntimeError('build 211 service replan: dist/supply-transport-v206.js missing')

text = SUPPLY.read_text('utf-8')

old_exit = "      if(truck.cargo<=Math.min(300,s.cargoCapacity*.08)||L.manifestTotal(remainingDemand)<=1){s.phase206='PLAN';s.status=truck.cargo<=1?'RETURNING':'WAITING_DEMAND';s.waitUntil206=game.time+(L.manifestTotal(remainingDemand)<=1?2.4:0);}"
new_exit = """      // A truck whose remaining cargo cannot satisfy any remaining demand key
      // must replan and reload instead of idling in SERVICE forever.
      let deliverable211=0;for(const key of L.STOCK_KEYS)deliverable211+=Math.min(Math.max(0,Number(s.cargo[key])||0),Math.max(0,Number(remainingDemand[key])||0));
      if(truck.cargo<=Math.min(300,s.cargoCapacity*.08)||L.manifestTotal(remainingDemand)<=1||deliverable211<=1){s.phase206='PLAN';s.status=truck.cargo<=1?'RETURNING':'WAITING_DEMAND';s.waitUntil206=game.time+(L.manifestTotal(remainingDemand)<=1?2.4:0);}"""

count = text.count(old_exit)
if count != 1:
    raise RuntimeError(f'build 211 service replan exit anchor count={count}')
text = text.replace(old_exit, new_exit, 1)

old_marker = 'receiverCargoIsolation:true });'
new_marker = 'receiverCargoIsolation:true, serviceReplanOnUndeliverable:true });'
count = text.count(old_marker)
if count != 1:
    raise RuntimeError(f'build 211 service replan marker anchor count={count}')
text = text.replace(old_marker, new_marker, 1)

SUPPLY.write_text(text, 'utf-8')
print('build 211 service replan hotfix applied')
