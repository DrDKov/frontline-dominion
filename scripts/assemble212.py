from pathlib import Path
import re

ROOT = Path('.')
OUT = ROOT / 'dist'
BUILD = 212
VERSION = '16.9.6'
HTML = OUT / 'frontline-dominion.html'
SUPPLY = OUT / 'supply-transport-v206.js'
WORKER = OUT / 'authoritative-simulation-worker-v174.js'
BRIDGE = OUT / 'authoritative-simulation-v174.js'

required = [
    HTML, SUPPLY, WORKER, BRIDGE,
    OUT / 'runtime-ui-v211.js',
    OUT / 'runtime-shell-v211.js',
    OUT / 'save-slots-v211.js',
]
for path in required:
    if not path.exists():
        raise RuntimeError(f'build 212 inherited output missing: {path}')


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'build 212 {label}: expected one anchor, got {count}')
    return text.replace(old, new, 1)


def sub_once(text, pattern, repl, label, flags=0):
    updated, count = re.subn(pattern, repl, text, count=1, flags=flags)
    if count != 1:
        raise RuntimeError(f'build 212 {label}: expected one anchor, got {count}')
    return updated


def clone_owner(source_name, target_name, replacements, alias_line):
    text = (OUT / source_name).read_text('utf-8')
    text = sub_once(text, r'const BUILD = 211;', f'const BUILD = {BUILD};', f'{source_name} BUILD')
    text = re.sub(r"const VERSION = '[^']+';", f"const VERSION = '{VERSION}';", text, count=1)
    for old, new in replacements:
        text = text.replace(old, new)
    text = text.replace('?build=211', '?build=212')
    text += '\n' + alias_line + '\n'
    (OUT / target_name).write_text(text, 'utf-8')


# ---------------------------------------------------------------------------
# Logistics: local node service, storage-only extraction routes and reserve-only
# automatic supply sources.
# ---------------------------------------------------------------------------
supply = SUPPLY.read_text('utf-8')

anchor = """  const EPS = 1e-6;
  const dist = (a,b) => Math.hypot((Number(a?.x)||0)-(Number(b?.x)||0),(Number(a?.y)||0)-(Number(b?.y)||0));
"""
insert = """  const EPS = 1e-6;
  const dist = (a,b) => Math.hypot((Number(a?.x)||0)-(Number(b?.x)||0),(Number(a?.y)||0)-(Number(b?.y)||0));
  const STORAGE_NODE_TYPES212 = new Set(['central','warehouse','pmto','terminal']);
  const GENERAL_SUPPLY_NODE_TYPES212 = new Set(['central','warehouse','pmto','terminal','trade']);

  function isStorageNode212(building) {
    if(!building?.alive || L.ensureExtractor(building)) return false;
    const node=L.ensureNode(building);
    return Boolean(node?.stock && STORAGE_NODE_TYPES212.has(node.nodeType));
  }

  function isGeneralSupplySource212(building) {
    if(!building?.alive || L.ensureExtractor(building)) return false;
    const node=L.ensureNode(building);
    return Boolean(node?.stock && GENERAL_SUPPLY_NODE_TYPES212.has(node.nodeType));
  }
"""
supply = replace_once(supply, anchor, insert, 'storage/supply node classifiers')

old_find = """  Game.prototype.findSupplySource206=function(truck,demand,excludeId=null){
    const candidates=[];
    for(const b of this.buildings||[]){if(!b?.alive||!b.completed||b.team!==truck.team||b.id===excludeId)continue;if(!L.ensureNode(b)&&!L.ensureExtractor(b))continue;const score=sourceScore206(this,truck,b,demand);if(Number.isFinite(score))candidates.push({b,score});}
    candidates.sort((a,b)=>a.score-b.score||String(a.b.id).localeCompare(String(b.b.id),'en'));
    return candidates[0]?.b||null;
  };
"""
new_find = """  Game.prototype.findSupplySource206=function(truck,demand,excludeId=null){
    const candidates=[];
    for(const b of this.buildings||[]){
      if(!b?.alive||!b.completed||b.team!==truck.team||b.id===excludeId||!isGeneralSupplySource212(b))continue;
      const score=sourceScore206(this,truck,b,demand);if(Number.isFinite(score))candidates.push({b,score});
    }
    candidates.sort((a,b)=>a.score-b.score||String(a.b.id).localeCompare(String(b.b.id),'en'));
    return candidates[0]?.b||null;
  };
"""
supply = replace_once(supply, old_find, new_find, 'automatic supply sources must be reserve nodes')

old_extract_dest = """  function chooseExtractionDestination206(game,truck,source) {
    const candidates=(game.buildings||[]).filter(b=>b?.alive&&b.completed&&b.team===truck.team&&b.id!==source?.id&&L.ensureNode(b)?.stock)
      .map(b=>({b,score:dist(truck,b)+(SOURCE_TYPE_PENALTY[L.ensureNode(b).nodeType]??240)+routeRisk206(game,truck,b)*850}))
      .sort((a,b)=>a.score-b.score||String(a.b.id).localeCompare(String(b.b.id),'en'));
    return candidates[0]?.b||null;
  }
"""
new_extract_dest = """  function chooseExtractionDestination206(game,truck,source) {
    const key=L.extractorResourceType(source);
    const candidates=(game.buildings||[]).filter(b=>{
      if(!b?.alive||!b.completed||b.team!==truck.team||b.id===source?.id||!isStorageNode212(b))return false;
      const node=L.ensureNode(b);if(!node?.stock||!key)return false;
      return Number(node.stock[`${key}Max`]||0)-Number(node.stock[key]||0)>EPS;
    })
      .map(b=>({b,score:dist(truck,b)+(SOURCE_TYPE_PENALTY[L.ensureNode(b).nodeType]??240)+routeRisk206(game,truck,b)*850}))
      .sort((a,b)=>a.score-b.score||String(a.b.id).localeCompare(String(b.b.id),'en'));
    return candidates[0]?.b||null;
  }
"""
supply = replace_once(supply, old_extract_dest, new_extract_dest, 'extraction destination storage only')

old_auto_node = """      const node=L.ensureNode(building);if(!node?.stock)continue;
      const demand=nodeDemand206(building),total=L.manifestTotal(demand);if(total<=1)continue;
"""
new_auto_node = """      const node=L.ensureNode(building);if(!node?.stock||L.ensureExtractor(building))continue;
      const demand=nodeDemand206(building),total=L.manifestTotal(demand);if(total<=1)continue;
"""
supply = replace_once(supply, old_auto_node, new_auto_node, 'AUTO destination excludes extractors')

old_resupply_stamp = """    if(moved>EPS){s.resupplySourceId=truck.id;s.resupplyProgress=L.clamp(s.resupplyProgress+dt*.45,0,1);unit.supply160=L.unitReadiness(unit).supply;unit._fdLogisticsDetailUntil208=(Number(game.time)||0)+2.5;}
"""
new_resupply_stamp = """    if(moved>EPS){s.resupplySourceId=truck.id;s.lastResupplyAt206=Number(game.time)||0;s.resupplyProgress=L.clamp(s.resupplyProgress+dt*.45,0,1);unit.supply160=L.unitReadiness(unit).supply;unit._fdLogisticsDetailUntil208=(Number(game.time)||0)+2.5;}
"""
supply = replace_once(supply, old_resupply_stamp, new_resupply_stamp, 'truck resupply timestamp')

local_service = r"""
  function resupplyUnitFromNode212(game,building,node,unit,dt,budget) {
    if(!unit?.alive||L.isAir(unit)||unit.team!==building.team||budget<=EPS)return 0;
    const s=L.ensureUnit(unit,false);if(!s)return 0;
    if(L.isTruck(unit)&&s.fuelMax<=0){s.fuelMax=720;s.fuel=Math.max(0,Number(s.fuel)||0);}
    let left=Math.max(0,budget),moved=0;
    const transfer=(key,need,apply)=>{
      if(left<=EPS||need<=EPS)return;
      const available=Math.max(0,Number(node.stock?.[key])||0);
      const amount=L.round(Math.min(left,available,need));if(amount<=EPS)return;
      node.stock[key]=L.round(available-amount);apply(amount);left-=amount;moved+=amount;
    };
    if(s.fuelMax>0)transfer('fuel',Math.max(0,s.fuelMax*.92-s.fuel),a=>{s.fuel=L.round(Math.min(s.fuelMax,s.fuel+a));});
    if(s.ammoReserveMax>0)transfer('ammo',Math.max(0,s.ammoReserveMax*.92-s.ammoReserve),a=>{s.ammoReserve=L.round(Math.min(s.ammoReserveMax,s.ammoReserve+a));});
    if(s.supportMax>0)transfer('support',Math.max(0,s.supportMax*.88-s.support),a=>{s.support=L.round(Math.min(s.supportMax,s.support+a));});
    if(moved>EPS){
      s.resupplySourceId=building.id;s.lastResupplyAt206=Number(game.time)||0;
      s.resupplyProgress=L.clamp((Number(s.resupplyProgress)||0)+dt*.65,0,1);
      unit.supply160=L.unitReadiness(unit).supply;unit._fdLogisticsDetailUntil208=(Number(game.time)||0)+2.5;
    }
    return moved;
  }

  function localNodeService212(dt) {
    const buildings=(this.buildings||[]).filter(b=>b?.alive&&b.completed&&isGeneralSupplySource212(b))
      .sort((a,b)=>String(a.id).localeCompare(String(b.id),'en'));
    let totalMoved=0;
    for(const building of buildings){
      const node=L.ensureNode(building);if(!node?.stock)continue;
      const radius=Math.max(0,Number(node.supplyRadius)||0);if(radius<=EPS)continue;
      let budget=Math.max(0,Number(node.throughput)||0)*dt;if(budget<=EPS)continue;
      const nearby=unitsNear206(this,building.team,building.x,building.y,radius)
        .filter(unit=>unit?.alive&&!L.isAir(unit))
        .sort((a,b)=>L.unitReadiness(a).supply-L.unitReadiness(b).supply||String(a.id).localeCompare(String(b.id),'en'));
      for(const unit of nearby){
        if(budget<=EPS)break;
        const moved=resupplyUnitFromNode212(this,building,node,unit,dt,budget);
        budget-=moved;totalMoved+=moved;
      }
    }
    if(totalMoved>EPS){
      const state=L.ensureGame(this);state.telemetry.transfers=L.round(Number(state.telemetry.transfers)+totalMoved);this.uiDirty=true;
    }
  }
  Game.prototype.registerLogisticsHook206('post',localNodeService212,54);

"""
anchor_loss = "  function truckLossWatch206(dt){\n"
if supply.count(anchor_loss) != 1:
    raise RuntimeError(f'build 212 local node service anchor count={supply.count(anchor_loss)}')
supply = supply.replace(anchor_loss, local_service + anchor_loss, 1)
supply += "\n;(() => { const root=typeof window!=='undefined'?window:self; root.__FD_LOGISTICS_INTEGRITY_212__=Object.freeze({build:212,version:'16.9.6',localNodeAutoService:true,emptyTruckNodeRescue:true,extractionToStorageOnly:true,reserveSourcesOnly:true,autoDeficitDispatch:true}); })();\n"
SUPPLY.write_text(supply, 'utf-8')


# ---------------------------------------------------------------------------
# Runtime shell: load IndexedDB slot payload directly. The old build copied the
# entire payload into localStorage first; large but valid saves could hit quota and
# fail with "Не удалось подготовить сохранение к загрузке".
# ---------------------------------------------------------------------------
clone_owner(
    'runtime-ui-v211.js', 'runtime-ui-v212.js',
    [('__FD_RUNTIME_UI_211__', '__FD_RUNTIME_UI_212__'), ('[FD211]', '[FD212]')],
    'globalThis.__FD_RUNTIME_UI_211__ ||= globalThis.__FD_RUNTIME_UI_212__; globalThis.__FD_RUNTIME_UI_210__ ||= globalThis.__FD_RUNTIME_UI_212__;',
)
clone_owner(
    'runtime-shell-v211.js', 'runtime-shell-v212.js',
    [
        ('__FD_RUNTIME_SHELL_211__', '__FD_RUNTIME_SHELL_212__'),
        ('__FD_BOOT_211__', '__FD_BOOT_212__'),
        ('fd-loading211', 'fd-loading212'),
        ('fd-ready211', 'fd-ready212'),
        ('fd-running211', 'fd-running212'),
        ('[FD211]', '[FD212]'),
    ],
    'globalThis.__FD_RUNTIME_SHELL_211__ ||= globalThis.__FD_RUNTIME_SHELL_212__; globalThis.__FD_RUNTIME_SHELL_210__ ||= globalThis.__FD_RUNTIME_SHELL_212__; globalThis.__FD_BOOT_211__ ||= globalThis.__FD_BOOT_212__; globalThis.__FD_BOOT_210__ ||= globalThis.__FD_BOOT_212__;',
)

shell_path = OUT / 'runtime-shell-v212.js'
shell = shell_path.read_text('utf-8')
load_payload_fn = r"""
  const launchSavedPayload212 = (raw, event = null) => {
    event?.preventDefault?.();
    event?.stopImmediatePropagation?.();
    if (state.launching) return false;
    const api = debug();
    if (typeof api?.startGame !== 'function') {
      showLaunchError('Игровое ядро ещё не готово.');
      return false;
    }
    const candidate = parseSave190(raw, 'indexeddb-slot');
    if (!candidate) {
      showLaunchError('Выбранное сохранение повреждено или имеет несовместимый формат.');
      return false;
    }
    beginLaunch190('saved');
    state.saveSourceKey = 'indexeddb-slot';
    console.info('[FD212] Starting saved game directly from slot payload');
    try {
      api.startGame({
        loadData: candidate.data,
        faction: candidate.data.teams?.player?.faction || 'vanguard',
        difficulty: candidate.data.difficultyKey || 'normal',
      });
      verifyLaunch();
      return true;
    } catch (error) {
      console.error('[FD212] direct saved start threw', error);
      showLaunchError(`Сохранение не запустилось, но осталось в списке: ${error?.message || error}`);
      return false;
    }
  };

"""
shell = replace_once(shell, "  const install = () => {\n", load_payload_fn + "  const install = () => {\n", 'direct slot launch insertion')
shell = replace_once(
    shell,
    "    launchNewGame,\n    launchSavedGame,\n    findSavedGame: () => findSavedGame190(debug(), false),\n",
    "    launchNewGame,\n    launchSavedGame,\n    launchSavedPayload: launchSavedPayload212,\n    findSavedGame: () => findSavedGame190(debug(), false),\n",
    'runtime shell direct payload export',
)
shell_path.write_text(shell, 'utf-8')

clone_owner(
    'save-slots-v211.js', 'save-slots-v212.js',
    [
        ('__FD_SAVE_SLOTS_211__', '__FD_SAVE_SLOTS_212__'),
        ('__FD_RUNTIME_SHELL_211__', '__FD_RUNTIME_SHELL_212__'),
        ('__FD_BOOT_211__', '__FD_BOOT_212__'),
    ],
    'globalThis.__FD_SAVE_SLOTS_211__ ||= globalThis.__FD_SAVE_SLOTS_212__; globalThis.__FD_SAVE_SLOTS_210__ ||= globalThis.__FD_SAVE_SLOTS_212__;',
)
save_path = OUT / 'save-slots-v212.js'
saves = save_path.read_text('utf-8')
load_pattern = r"  async function loadSlot\(id\) \{.*?\n  \}\n\n  async function deleteSlot"
load_replacement = r"""  async function loadSlot(id) {
    const record = await recordGet(id);
    if (!record || !safeParse(record.payload)) throw new Error('Выбранное сохранение не найдено или повреждено');
    state.activeManualId = record.kind === 'autosave' ? null : record.id;
    state.sessionId = `loaded-${record.id}`;
    state.lastLoadedId = record.id;
    state.loads += 1;
    storageSet(ACTIVE_SLOT_KEY, state.activeManualId || '');
    storageSet(SESSION_KEY, state.sessionId);
    closeModal();
    const shell = root.__FD_RUNTIME_SHELL_212__;
    if (typeof shell?.launchSavedPayload === 'function') {
      const launched = shell.launchSavedPayload(record.payload, { preventDefault() {}, stopImmediatePropagation() {} });
      if (launched === false) throw new Error('Не удалось запустить выбранное сохранение');
      return record;
    }
    // Compatibility fallback only. Build 212 does not require this localStorage
    // mirror when the canonical runtime shell is present.
    const currentKey = root.__FD_DEBUG__?.SAVE_KEY || CURRENT_KEY;
    if (!storageSet(currentKey, record.payload)) throw new Error('Не удалось подготовить сохранение к загрузке');
    if (typeof shell?.launchSavedGame !== 'function') throw new Error('Модуль загрузки ещё не готов');
    shell.launchSavedGame({ preventDefault() {}, stopImmediatePropagation() {} });
    return record;
  }

  async function deleteSlot"""
saves = sub_once(saves, load_pattern, load_replacement, 'save-slot direct payload load', flags=re.S)
save_path.write_text(saves, 'utf-8')


# ---------------------------------------------------------------------------
# Authoritative worker/bridge and public identity.
# ---------------------------------------------------------------------------
for path in [WORKER, BRIDGE]:
    text = path.read_text('utf-8')
    text = sub_once(text, r'const BUILD = 211;', f'const BUILD = {BUILD};', f'{path.name} BUILD')
    text = re.sub(r"const VERSION = '[^']+';", f"const VERSION = '{VERSION}';", text, count=1)
    text = text.replace('?build=211', '?build=212')
    path.write_text(text, 'utf-8')

for path in sorted(OUT.glob('*.js')):
    text = path.read_text('utf-8')
    if '?build=211' in text:
        path.write_text(text.replace('?build=211', '?build=212'), 'utf-8')

html = HTML.read_text('utf-8')
html = html.replace('?build=211', '?build=212')
html = re.sub(r'data-fd-canonical-build="211"', 'data-fd-canonical-build="212"', html, count=1)
html = html.replace('Frontline Dominion v16.9.5', 'Frontline Dominion v16.9.6')
html = html.replace('v16.9.5', 'v16.9.6')
html = html.replace('BUILD 211', 'BUILD 212').replace('build 211', 'build 212')
html = html.replace('runtime-ui-v211.js?build=212', 'runtime-ui-v212.js?build=212')
html = html.replace('runtime-shell-v211.js?build=212', 'runtime-shell-v212.js?build=212')
html = html.replace('save-slots-v211.js?build=212', 'save-slots-v212.js?build=212')
old_boot = '<script id="fd-boot-bridge211">globalThis.__FD_BOOT_211__ ||= globalThis.__FD_BOOT_210__ || globalThis.__FD_BOOT_209__ || globalThis.__FD_BOOT_208__ || globalThis.__FD_BOOT_207__ || globalThis.__FD_BOOT_206__;</script>'
new_boot = '<script id="fd-boot-bridge212">globalThis.__FD_BOOT_212__ ||= globalThis.__FD_BOOT_211__ || globalThis.__FD_BOOT_210__ || globalThis.__FD_BOOT_209__ || globalThis.__FD_BOOT_208__ || globalThis.__FD_BOOT_207__ || globalThis.__FD_BOOT_206__;</script>'
html = replace_once(html, old_boot, new_boot, 'boot bridge')
HTML.write_text(html, 'utf-8')

index = OUT / 'index.html'
if index.exists():
    text = index.read_text('utf-8')
    text = text.replace('?build=211', '?build=212')
    text = text.replace('build 211', 'build 212').replace('Build 211', 'Build 212')
    text = text.replace('v16.9.5', 'v16.9.6')
    text = re.sub(r'data-fd-canonical-build="211"', 'data-fd-canonical-build="212"', text, count=1)
    index.write_text(text, 'utf-8')

print('Frontline Dominion v16.9.6 build 212 local supply, extraction routing and direct slot loading assembled')
