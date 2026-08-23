from pathlib import Path

path = Path('scripts/assemble211.py')
source = path.read_text('utf-8')
old = """close = '\\n})();\\n'
if supply.count(close) != 1:
    raise RuntimeError(f'build 211 supply close anchor count={supply.count(close)}')
supply = supply.replace(close, marker + close, 1)
SUPPLY.write_text(supply, 'utf-8')
"""
new = """# The assembled transport file is a composition of more than one IIFE. Keep
# the build-211 identity marker independent from internal wrapper counts.
supply += \"\\n;(() => { const root = typeof window !== 'undefined' ? window : self; root.__FD_LOGISTICS_INTEGRITY_211__ = Object.freeze({ build:211, version:'16.9.5', truckToTruckTankService:true, missionRadiusAuthoritative:true, groupRearFollow:true, autoNodeSustainment:true, receiverCargoIsolation:true }); })();\\n\"
SUPPLY.write_text(supply, 'utf-8')
"""
if source.count(old) != 1:
    raise RuntimeError(f'assemble211 runner anchor count={source.count(old)}')
patched = source.replace(old, new, 1)
exec(compile(patched, str(path), 'exec'), {'__name__': '__main__', '__file__': str(path)})

# --- build 211 service-replan safety ---------------------------------------
# A truck whose remaining cargo cannot satisfy any remaining demand key (e.g.
# only fuel left after every tank is full while the area still needs
# ammo/support) previously idled in SERVICE forever: the exit condition only
# checked total cargo volume and total demand. Add a per-key deliverability
# check so the truck replans and reloads instead, and mark the integrity
# manifest accordingly.
supply_path = Path('dist/supply-transport-v206.js')
text = supply_path.read_text('utf-8')

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
supply_path.write_text(text.replace(old_marker, new_marker, 1), 'utf-8')
print('build 211 service replan safety applied')
