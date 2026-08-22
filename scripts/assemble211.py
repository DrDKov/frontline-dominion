from pathlib import Path
import re

ROOT = Path('.')
OUT = ROOT / 'dist'
BUILD = 211
VERSION = '16.9.5'
HTML = OUT / 'frontline-dominion.html'
WORKER = OUT / 'authoritative-simulation-worker-v174.js'
BRIDGE = OUT / 'authoritative-simulation-v174.js'
SUPPLY = OUT / 'supply-transport-v206.js'

required = [
    HTML, WORKER, BRIDGE, SUPPLY,
    OUT / 'runtime-ui-v210.js',
    OUT / 'runtime-shell-v210.js',
    OUT / 'save-slots-v210.js',
    OUT / 'logistics-ui-v208.js',
    OUT / 'gameplay-v208.js',
]
for path in required:
    if not path.exists():
        raise RuntimeError(f'build 211 inherited output missing: {path}')


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'build 211 {label}: expected one anchor, got {count}')
    return text.replace(old, new, 1)


def sub_once(text, pattern, repl, label, flags=0):
    updated, count = re.subn(pattern, repl, text, count=1, flags=flags)
    if count != 1:
        raise RuntimeError(f'build 211 {label}: expected one anchor, got {count}')
    return updated


def clone_owner(source_name, target_name, replacements, alias_line):
    text = (OUT / source_name).read_text('utf-8')
    text = sub_once(text, r'const BUILD = 210;', f'const BUILD = {BUILD};', f'{source_name} BUILD')
    text = re.sub(r"const VERSION = '[^']+';", f"const VERSION = '{VERSION}';", text, count=1)
    for old, new in replacements:
        text = text.replace(old, new)
    text = text.replace('?build=210', '?build=211')
    text += '\n' + alias_line + '\n'
    (OUT / target_name).write_text(text, 'utf-8')


# ---------------------------------------------------------------------------
# Authoritative physical logistics integrity
# ---------------------------------------------------------------------------
supply = SUPPLY.read_text('utf-8')

# A supply truck is itself a fuel-consuming ground unit. Build 206 deliberately
# excluded trucks from area demand/service, which leaves an empty-tank truck
# impossible to rescue in the field. Admit friendly trucks as recipients while
# excluding the servicing truck itself. Air remains airfield-serviced.
old_deficit = """  function unitDeficit206(unit) {
    if(!unit?.alive || L.isAir(unit) || L.isTruck(unit))return L.emptyManifest();
    const s=L.ensureUnit(unit,false), out=L.emptyManifest(); if(!s)return out;
    if(s.fuelMax>0) out.fuel=Math.max(0,s.fuelMax*.92-s.fuel);
    if(s.ammoReserveMax>0) out.ammo=Math.max(0,s.ammoReserveMax*.92-s.ammoReserve);
    if(s.supportMax>0) out.support=Math.max(0,s.supportMax*.88-s.support);
    return out;
  }

  function unitsNear206(game,team,x,y,radius) {
    const list=[];
    const spatial=game.querySpatial?.(game.unitSpatial,x,y,radius) || game.querySpatial?.(game.spatial?.units,x,y,radius) || null;
    const source=Array.isArray(spatial)?spatial:(game.units||[]);
    const seen=new Set();
    for(const unit of source) {
      if(!unit?.alive||unit.team!==team||L.isAir(unit)||L.isTruck(unit)||seen.has(unit.id))continue;
      if(Math.hypot(unit.x-x,unit.y-y)>radius)continue; seen.add(unit.id);list.push(unit);
    }
    return list.sort((a,b)=>String(a.id).localeCompare(String(b.id),'en'));
  }

  function areaDemand206(game,team,x,y,radius) {
    const sum=L.emptyManifest();
    for(const unit of unitsNear206(game,team,x,y,radius)) { const d=unitDeficit206(unit); for(const k of L.STOCK_KEYS)sum[k]+=d[k]; }
    for(const k of L.STOCK_KEYS)sum[k]=L.round(sum[k]); return sum;
  }
"""
new_deficit = """  function unitDeficit206(unit, excludeId=null) {
    if(!unit?.alive || L.isAir(unit) || (excludeId!=null && String(unit.id)===String(excludeId)))return L.emptyManifest();
    const s=L.ensureUnit(unit,false), out=L.emptyManifest(); if(!s)return out;
    if(s.fuelMax>0) out.fuel=Math.max(0,s.fuelMax*.92-s.fuel);
    if(s.ammoReserveMax>0) out.ammo=Math.max(0,s.ammoReserveMax*.92-s.ammoReserve);
    if(s.supportMax>0) out.support=Math.max(0,s.supportMax*.88-s.support);
    return out;
  }

  function unitsNear206(game,team,x,y,radius,excludeId=null) {
    const list=[];
    const spatial=game.querySpatial?.(game.unitSpatial,x,y,radius) || game.querySpatial?.(game.spatial?.units,x,y,radius) || null;
    const source=Array.isArray(spatial)?spatial:(game.units||[]);
    const seen=new Set();
    for(const unit of source) {
      if(!unit?.alive||unit.team!==team||L.isAir(unit)||seen.has(unit.id)||(excludeId!=null&&String(unit.id)===String(excludeId)))continue;
      if(Math.hypot(unit.x-x,unit.y-y)>radius)continue; seen.add(unit.id);list.push(unit);
    }
    return list.sort((a,b)=>String(a.id).localeCompare(String(b.id),'en'));
  }

  function areaDemand206(game,team,x,y,radius,excludeId=null) {
    const sum=L.emptyManifest();
    for(const unit of unitsNear206(game,team,x,y,radius,excludeId)) { const d=unitDeficit206(unit,excludeId); for(const k of L.STOCK_KEYS)sum[k]+=d[k]; }
    for(const k of L.STOCK_KEYS)sum[k]=L.round(sum[k]); return sum;
  }
"""
supply = replace_once(supply, old_deficit, new_deficit, 'truck recipient/area eligibility')

old_area_demand = "    if(s.missionType==='SUPPLY_AREA') return areaDemand206(game,truck.team,Number(s.targetX)||truck.x,Number(s.targetY)||truck.y,Math.max(320,Number(s.serviceRadius)||680));"
new_area_demand = "    if(s.missionType==='SUPPLY_AREA') return areaDemand206(game,truck.team,Number(s.targetX)||truck.x,Number(s.targetY)||truck.y,Math.max(320,Number(s.serviceRadius)||680),truck.id);"
supply = replace_once(supply, old_area_demand, new_area_demand, 'area demand excludes provider')

# A group mission must load only for members that are physically serviceable from
# the current 360-unit rear standoff. Otherwise a widely spread formation creates
# phantom demand forever. Keep logistics trucks out of combat formations; they can
# rescue one another through SUPPLY_AREA.
old_group_demand = """    if(s.missionType==='SUPPLY_GROUP') {
      const point=groupPoint206(game,s,truck.team), sum=L.emptyManifest(); if(!point)return sum;
      for(const unit of point.units){const d=unitDeficit206(unit);for(const k of L.STOCK_KEYS)sum[k]+=d[k];}return sum;
    }
"""
new_group_demand = """    if(s.missionType==='SUPPLY_GROUP') {
      const point=groupPoint206(game,s,truck.team), sum=L.emptyManifest(); if(!point)return sum;
      const radius=Math.max(330,Number(s.serviceRadius)||620);
      for(const unit of point.units){if(dist(unit,point)>radius)continue;const d=unitDeficit206(unit,truck.id);for(const k of L.STOCK_KEYS)sum[k]+=d[k];}
      for(const k of L.STOCK_KEYS)sum[k]=L.round(sum[k]);return sum;
    }
"""
supply = replace_once(supply, old_group_demand, new_group_demand, 'group reachable demand')

# Direct service must satisfy the same 92/92/88 target used to calculate demand,
# not silently fill recipients to 100%. The receiver truck's tank is just `fuel`;
# its cargo manifest is deliberately never touched here.
old_resupply = """  function resupplyUnit206(game,truck,unit,dt,budget) {
    const cargo=truck.logistics206.cargo, s=L.ensureUnit(unit,false); if(!s)return 0;
    let left=Math.max(0,budget),moved=0;
    const transfer=(key,need,apply)=>{if(left<=EPS||need<=EPS)return;const amount=L.round(Math.min(left,Math.max(0,Number(cargo[key])||0),need));if(amount<=EPS)return;cargo[key]=L.round(Number(cargo[key])-amount);apply(amount);left-=amount;moved+=amount;};
    if(s.fuelMax>0)transfer('fuel',Math.max(0,s.fuelMax-s.fuel),a=>{s.fuel=L.round(s.fuel+a);});
    if(s.ammoReserveMax>0)transfer('ammo',Math.max(0,s.ammoReserveMax-s.ammoReserve),a=>{s.ammoReserve=L.round(s.ammoReserve+a);});
    if(s.supportMax>0)transfer('support',Math.max(0,s.supportMax-s.support),a=>{s.support=L.round(s.support+a);});
    if(moved>EPS){s.resupplySourceId=truck.id;s.resupplyProgress=L.clamp(s.resupplyProgress+dt*.45,0,1);unit.supply160=L.unitReadiness(unit).supply;unit._fdLogisticsDetailUntil208=(Number(game.time)||0)+2.5;}
    return moved;
  }
"""
new_resupply = """  function resupplyUnit206(game,truck,unit,dt,budget) {
    const cargo=truck.logistics206.cargo, s=L.ensureUnit(unit,false); if(!s||unit===truck)return 0;
    let left=Math.max(0,budget),moved=0;
    const transfer=(key,need,apply)=>{if(left<=EPS||need<=EPS)return;const amount=L.round(Math.min(left,Math.max(0,Number(cargo[key])||0),need));if(amount<=EPS)return;cargo[key]=L.round(Number(cargo[key])-amount);apply(amount);left-=amount;moved+=amount;};
    if(s.fuelMax>0)transfer('fuel',Math.max(0,s.fuelMax*.92-s.fuel),a=>{s.fuel=L.round(Math.min(s.fuelMax,s.fuel+a));});
    if(s.ammoReserveMax>0)transfer('ammo',Math.max(0,s.ammoReserveMax*.92-s.ammoReserve),a=>{s.ammoReserve=L.round(Math.min(s.ammoReserveMax,s.ammoReserve+a));});
    if(s.supportMax>0)transfer('support',Math.max(0,s.supportMax*.88-s.support),a=>{s.support=L.round(Math.min(s.supportMax,s.support+a));});
    if(moved>EPS){s.resupplySourceId=truck.id;s.resupplyProgress=L.clamp(s.resupplyProgress+dt*.45,0,1);unit.supply160=L.unitReadiness(unit).supply;unit._fdLogisticsDetailUntil208=(Number(game.time)||0)+2.5;}
    return moved;
  }
"""
supply = replace_once(supply, old_resupply, new_resupply, 'target-capped direct resupply')

# The mission stores serviceRadius=680/620, but inherited SERVICE used the truck's
# unrelated default supplyRadius (~310). Use the declared mission radius end to end.
# A moving group also needs the rear-echelon truck to reacquire its recomputed
# standoff point rather than servicing forever from an obsolete position.
old_service = """    if(s.phase206==='SERVICE') {
      const point=destinationPoint206(game,truck);if(!point){s.phase206='PLAN';return;}
      let units=[];
      if(s.missionType==='SUPPLY_GROUP'&&point.group)units=point.group.units.filter(u=>dist(u,truck)<=Math.max(300,s.supplyRadius));
      else units=unitsNear206(game,truck.team,truck.x,truck.y,Math.max(260,s.supplyRadius));
      serviceUnits206(game,truck,units,dt);
      truck.cargo=L.round(L.manifestTotal(s.cargo));
      const remainingDemand=missionDemand206(game,truck);
      if(truck.cargo<=Math.min(300,s.cargoCapacity*.08)||L.manifestTotal(remainingDemand)<=1){s.phase206='PLAN';s.status=truck.cargo<=1?'RETURNING':'WAITING_DEMAND';s.waitUntil206=game.time+(L.manifestTotal(remainingDemand)<=1?2.4:0);}
      return;
    }
"""
new_service = """    if(s.phase206==='SERVICE') {
      const point=destinationPoint206(game,truck);if(!point){s.phase206='PLAN';return;}
      const effectiveRadius211=Math.max(180,Number(point.radius)||Number(s.serviceRadius)||Number(s.supplyRadius)||310);
      if(s.missionType==='SUPPLY_GROUP'&&point.group&&dist(truck,point)>Math.max(140,effectiveRadius211*.35)){
        s.phase206='TO_DEST';s.status='REPOSITIONING';return;
      }
      let units=[];
      if(s.missionType==='SUPPLY_GROUP'&&point.group)units=point.group.units.filter(u=>u?.alive&&u.team===truck.team&&!L.isAir(u)&&u.id!==truck.id&&dist(u,truck)<=effectiveRadius211);
      else units=unitsNear206(game,truck.team,truck.x,truck.y,effectiveRadius211,truck.id);
      serviceUnits206(game,truck,units,dt);
      truck.cargo=L.round(L.manifestTotal(s.cargo));
      const remainingDemand=missionDemand206(game,truck);
      if(truck.cargo<=Math.min(300,s.cargoCapacity*.08)||L.manifestTotal(remainingDemand)<=1){s.phase206='PLAN';s.status=truck.cargo<=1?'RETURNING':'WAITING_DEMAND';s.waitUntil206=game.time+(L.manifestTotal(remainingDemand)<=1?2.4:0);}
      return;
    }
"""
supply = replace_once(supply, old_service, new_service, 'effective service radius and group follow')

# AUTO remains an autonomous node-sustainment mission instead of mutating itself
# permanently into SUPPLY_BUILDING on the first tick. Select the most urgent
# friendly logistics node deterministically; Area/Group remain explicit frontline
# direct-service modes.
auto_anchor = """  function processTruck206(game,truck,dt) {
    const s=L.ensureUnit(truck,false);if(!s||!truck.alive)return;
    truck.cargo=L.round(L.manifestTotal(s.cargo));
    if(!MISSIONS.includes(s.missionType))s.missionType='AUTO';
    if(s.missionType==='AUTO'&&!s.homeNodeId){s.status='IDLE';return;}
    if(s.missionType==='AUTO'){s.destinationNodeId=s.homeNodeId;s.missionType='SUPPLY_BUILDING';}
"""
auto_replacement = """  function chooseAutoDestination211(game,truck) {
    const s=L.ensureUnit(truck,false),candidates=[];
    for(const building of game.buildings||[]){
      if(!building?.alive||!building.completed||building.team!==truck.team)continue;
      const node=L.ensureNode(building);if(!node?.stock)continue;
      const demand=nodeDemand206(building),total=L.manifestTotal(demand);if(total<=1)continue;
      const homeBonus=building.id===s?.homeNodeId?-240:0;
      const score=-(total*Math.max(.1,L.priorityMultiplier(node.priority)))+dist(truck,building)*.22+homeBonus;
      candidates.push({building,score});
    }
    candidates.sort((a,b)=>a.score-b.score||String(a.building.id).localeCompare(String(b.building.id),'en'));
    return candidates[0]?.building||null;
  }

  function processTruck206(game,truck,dt) {
    const s=L.ensureUnit(truck,false);if(!s||!truck.alive)return;
    truck.cargo=L.round(L.manifestTotal(s.cargo));
    if(!MISSIONS.includes(s.missionType))s.missionType='AUTO';
    if(s.missionType==='AUTO'){
      const autoDestination211=chooseAutoDestination211(game,truck);
      if(!autoDestination211){s.status='WAITING_DEMAND';s.waitUntil206=game.time+2.5;return;}
      s.destinationNodeId=autoDestination211.id;
    }
"""
supply = replace_once(supply, auto_anchor, auto_replacement, 'AUTO mission integrity')

marker = """

  root.__FD_LOGISTICS_INTEGRITY_211__ = Object.freeze({
    build: 211,
    version: '16.9.5',
    truckToTruckTankService: true,
    missionRadiusAuthoritative: true,
    groupRearFollow: true,
    autoNodeSustainment: true,
    receiverCargoIsolation: true,
  });
"""
close = '\n})();\n'
if supply.count(close) != 1:
    raise RuntimeError(f'build 211 supply close anchor count={supply.count(close)}')
supply = supply.replace(close, marker + close, 1)
SUPPLY.write_text(supply, 'utf-8')

# ---------------------------------------------------------------------------
# Build 211 runtime identity; save storage remains backward compatible.
# ---------------------------------------------------------------------------
clone_owner(
    'runtime-ui-v210.js', 'runtime-ui-v211.js',
    [('__FD_RUNTIME_UI_210__', '__FD_RUNTIME_UI_211__'), ('[FD210]', '[FD211]')],
    'globalThis.__FD_RUNTIME_UI_210__ ||= globalThis.__FD_RUNTIME_UI_211__; globalThis.__FD_RUNTIME_UI_209__ ||= globalThis.__FD_RUNTIME_UI_211__; globalThis.__FD_RUNTIME_UI_208__ ||= globalThis.__FD_RUNTIME_UI_211__;',
)
clone_owner(
    'runtime-shell-v210.js', 'runtime-shell-v211.js',
    [
        ('__FD_RUNTIME_SHELL_210__', '__FD_RUNTIME_SHELL_211__'),
        ('__FD_BOOT_210__', '__FD_BOOT_211__'),
        ('fd-loading210', 'fd-loading211'),
        ('fd-ready210', 'fd-ready211'),
        ('fd-running210', 'fd-running211'),
        ('[FD210]', '[FD211]'),
    ],
    'globalThis.__FD_RUNTIME_SHELL_210__ ||= globalThis.__FD_RUNTIME_SHELL_211__; globalThis.__FD_RUNTIME_SHELL_209__ ||= globalThis.__FD_RUNTIME_SHELL_211__; globalThis.__FD_BOOT_210__ ||= globalThis.__FD_BOOT_211__; globalThis.__FD_BOOT_209__ ||= globalThis.__FD_BOOT_211__;',
)
clone_owner(
    'save-slots-v210.js', 'save-slots-v211.js',
    [
        ('__FD_SAVE_SLOTS_210__', '__FD_SAVE_SLOTS_211__'),
        ('__FD_RUNTIME_SHELL_210__', '__FD_RUNTIME_SHELL_211__'),
        ('__FD_BOOT_210__', '__FD_BOOT_211__'),
    ],
    'globalThis.__FD_SAVE_SLOTS_210__ ||= globalThis.__FD_SAVE_SLOTS_211__; globalThis.__FD_SAVE_SLOTS_209__ ||= globalThis.__FD_SAVE_SLOTS_211__; globalThis.__FD_SAVE_SLOTS_208__ ||= globalThis.__FD_SAVE_SLOTS_211__;',
)

worker = WORKER.read_text('utf-8')
worker = sub_once(worker, r'const BUILD = 210;', f'const BUILD = {BUILD};', 'Worker BUILD')
worker = re.sub(r"const VERSION = '[^']+';", f"const VERSION = '{VERSION}';", worker, count=1)
worker = worker.replace('?build=210', '?build=211')
WORKER.write_text(worker, 'utf-8')

bridge = BRIDGE.read_text('utf-8')
bridge = sub_once(bridge, r'const BUILD = 210;', f'const BUILD = {BUILD};', 'bridge BUILD')
bridge = re.sub(r"const VERSION = '[^']+';", f"const VERSION = '{VERSION}';", bridge, count=1)
bridge = bridge.replace('?build=210', '?build=211')
BRIDGE.write_text(bridge, 'utf-8')

for path in sorted(OUT.glob('*.js')):
    text = path.read_text('utf-8')
    if '?build=210' in text:
        path.write_text(text.replace('?build=210', '?build=211'), 'utf-8')

html = HTML.read_text('utf-8')
html = html.replace('?build=210', '?build=211')
html = re.sub(r'data-fd-canonical-build="210"', 'data-fd-canonical-build="211"', html, count=1)
html = html.replace('Frontline Dominion v16.9.4', 'Frontline Dominion v16.9.5')
html = html.replace('v16.9.4', 'v16.9.5')
html = html.replace('BUILD 210', 'BUILD 211').replace('build 210', 'build 211')
html = html.replace('runtime-ui-v210.js?build=211', 'runtime-ui-v211.js?build=211')
html = html.replace('runtime-shell-v210.js?build=211', 'runtime-shell-v211.js?build=211')
html = html.replace('save-slots-v210.js?build=211', 'save-slots-v211.js?build=211')
old_boot = '<script id="fd-boot-bridge210">globalThis.__FD_BOOT_210__ ||= globalThis.__FD_BOOT_209__ || globalThis.__FD_BOOT_208__ || globalThis.__FD_BOOT_207__ || globalThis.__FD_BOOT_206__;</script>'
new_boot = '<script id="fd-boot-bridge211">globalThis.__FD_BOOT_211__ ||= globalThis.__FD_BOOT_210__ || globalThis.__FD_BOOT_209__ || globalThis.__FD_BOOT_208__ || globalThis.__FD_BOOT_207__ || globalThis.__FD_BOOT_206__;</script>'
html = replace_once(html, old_boot, new_boot, 'boot bridge')
HTML.write_text(html, 'utf-8')

index = OUT / 'index.html'
if index.exists():
    text = index.read_text('utf-8')
    text = text.replace('?build=210', '?build=211')
    text = re.sub(r'data-fd-canonical-build="210"', 'data-fd-canonical-build="211"', text, count=1)
    text = text.replace('v16.9.4', 'v16.9.5')
    text = re.sub(r'build\s+\d+', 'build 211', text, flags=re.IGNORECASE)
    index.write_text(text, 'utf-8')

print('Frontline Dominion v16.9.5 build 211 logistics integrity assembled')
