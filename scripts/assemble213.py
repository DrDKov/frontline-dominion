from pathlib import Path
import re

ROOT = Path('.')
OUT = ROOT / 'dist'
BUILD = 213
VERSION = '16.9.7'
HTML = OUT / 'frontline-dominion.html'
SUPPLY = OUT / 'supply-transport-v206.js'
LOG_UI = OUT / 'logistics-ui-v208.js'
WORKER = OUT / 'authoritative-simulation-worker-v174.js'
BRIDGE = OUT / 'authoritative-simulation-v174.js'
FEATURE_SOURCE = ROOT / 'src' / 'v213' / 'friendly-extractor-visibility-v213.js'
FEATURE = OUT / FEATURE_SOURCE.name

required = [
    HTML, SUPPLY, LOG_UI, WORKER, BRIDGE, FEATURE_SOURCE,
    OUT / 'runtime-ui-v212.js', OUT / 'runtime-shell-v212.js', OUT / 'save-slots-v212.js',
]
for path in required:
    if not path.exists():
        raise RuntimeError(f'build 213 inherited output missing: {path}')


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'build 213 {label}: expected one anchor, got {count}')
    return text.replace(old, new, 1)


def sub_once(text, pattern, repl, label, flags=0):
    updated, count = re.subn(pattern, repl, text, count=1, flags=flags)
    if count != 1:
        raise RuntimeError(f'build 213 {label}: expected one anchor, got {count}')
    return updated


def clone_runtime(source_name, target_name, replacements, alias_line):
    text = (OUT / source_name).read_text('utf-8')
    text = sub_once(text, r'const BUILD = 212;', 'const BUILD = 213;', f'{source_name} build')
    text = re.sub(r"const VERSION = '[^']+';", "const VERSION = '16.9.7';", text, count=1)
    for old, new in replacements:
        text = text.replace(old, new)
    text = text.replace('?build=212', '?build=213')
    text += '\n' + alias_line + '\n'
    (OUT / target_name).write_text(text, 'utf-8')


# ---------------------------------------------------------------------------
# Resource trucks: interact with a deterministic external dock instead of the
# centre of a building.  This prevents trucks from physically entering mines,
# pumps, warehouses and production structures while loading/unloading.
# ---------------------------------------------------------------------------
supply = SUPPLY.read_text('utf-8')
old_move = """  function moveTruck206(truck,target,dt,interaction='logistics') {
    if(!target)return false;
    const range=Math.max(34,Number(truck.radius||20)+(Number(target.radius)||0)+12);
    if(dist(truck,target)<=range)return true;
    if(typeof truck.moveTowardInteraction==='function'&&target.id) return Boolean(truck.moveTowardInteraction(target,truck.currentCommand,dt,interaction));
    if(typeof truck.moveToward==='function') return Boolean(truck.moveToward(target.x,target.y,dt,.92));
    return false;
  }
"""
new_move = """  function stableDockAngle213(truck,target,interaction) {
    const key=`${truck?.id||''}|${target?.id||''}|${interaction||''}`;let h=2166136261;
    for(let i=0;i<key.length;i+=1){h^=key.charCodeAt(i);h=Math.imul(h,16777619)>>>0;}
    return (h%6283)/1000;
  }

  function buildingDockPoint213(truck,target,interaction='logistics') {
    if(!truck||!target||target.kind!=='building')return target;
    const cache=truck._fdLogisticsDock213;
    if(cache&&String(cache.targetId)===String(target.id)&&cache.interaction===interaction&&Number.isFinite(cache.x)&&Number.isFinite(cache.y))return cache;
    let dx=(Number(truck.x)||0)-(Number(target.x)||0),dy=(Number(truck.y)||0)-(Number(target.y)||0),len=Math.hypot(dx,dy);
    let angle=len>1?Math.atan2(dy,dx):stableDockAngle213(truck,target,interaction);
    // Give simultaneous trucks slightly different apron slots without allowing
    // the target to drift from frame to frame.
    const slot=((String(truck.id||'').split('').reduce((s,c)=>s+c.charCodeAt(0),0)%5)-2)*0.075;
    angle+=slot;
    const clearance=Math.max(76,(Number(target.radius)||38)+(Number(truck.radius)||20)+42);
    const worldW=Number(D.WORLD?.width)||32000,worldH=Number(D.WORLD?.height)||22000;
    const point={
      targetId:target.id,interaction,
      x:L.clamp((Number(target.x)||0)+Math.cos(angle)*clearance,24,worldW-24),
      y:L.clamp((Number(target.y)||0)+Math.sin(angle)*clearance,24,worldH-24),
      radius:0,_fdDock213:true,
    };
    truck._fdLogisticsDock213=point;
    return point;
  }

  function moveTruck206(truck,target,dt,interaction='logistics') {
    if(!target)return false;
    if(target.kind==='building'){
      const dock=buildingDockPoint213(truck,target,interaction);
      const tolerance=Math.max(26,(Number(truck.radius)||20)+8);
      if(dist(truck,dock)<=tolerance)return true;
      if(typeof truck.moveToward==='function')return Boolean(truck.moveToward(dock.x,dock.y,dt,.92));
      return false;
    }
    truck._fdLogisticsDock213=null;
    const range=Math.max(34,Number(truck.radius||20)+(Number(target.radius)||0)+12);
    if(dist(truck,target)<=range)return true;
    if(typeof truck.moveTowardInteraction==='function'&&target.id) return Boolean(truck.moveTowardInteraction(target,truck.currentCommand,dt,interaction));
    if(typeof truck.moveToward==='function') return Boolean(truck.moveToward(target.x,target.y,dt,.92));
    return false;
  }
"""
supply = replace_once(supply, old_move, new_move, 'external logistics dock')
supply += "\n;(() => { const root=typeof window!=='undefined'?window:self; root.__FD_LOGISTICS_INTEGRITY_213__=Object.freeze({...root.__FD_LOGISTICS_INTEGRITY_212__,build:213,version:'16.9.7',externalBuildingDock:true,extractorManualAssignment:true}); })();\n"
SUPPLY.write_text(supply, 'utf-8')


# ---------------------------------------------------------------------------
# Logistics UI: a truck can explicitly select a friendly extractor as its haul
# source.  EXTRACT_RESOURCE then preserves the build-212 storage-only delivery
# rule and automatically chooses a valid storage destination.
# ---------------------------------------------------------------------------
ui = LOG_UI.read_text('utf-8')
old_actions = "['area','СНАБЖАТЬ ОБЛАСТЬ'],['group','СНАБЖАТЬ ГРУППУ'],['building','СНАБЖАТЬ ЗДАНИЕ'],['return','ВЕРНУТЬСЯ НА СКЛАД'],['auto','АВТОМАТИЧЕСКИЙ РЕЖИМ'],['manual','РУЧНОЙ ПЕРЕНОС']"
new_actions = "['area','СНАБЖАТЬ ОБЛАСТЬ'],['group','СНАБЖАТЬ ГРУППУ'],['building','СНАБЖАТЬ ЗДАНИЕ'],['extract','ВЫВОЗИТЬ ДОБЫЧУ'],['return','ВЕРНУТЬСЯ НА СКЛАД'],['auto','АВТОМАТИЧЕСКИЙ РЕЖИМ'],['manual','РУЧНОЙ ПЕРЕНОС']"
ui = replace_once(ui, old_actions, new_actions, 'extract haul button')
old_target_actions = "if(['area','group','building'].includes(action)){beginTarget(game,action);return;}"
ui = replace_once(ui, old_target_actions, "if(['area','group','building','extract'].includes(action)){beginTarget(game,action);return;}", 'extract target action')
old_prompt = "game.alert?.(mode==='area'?'Укажите район снабжения':mode==='group'?'Укажите подразделение группы':mode==='manual'?'Укажите здание назначения для ручного переноса':'Укажите снабжаемое здание','info');"
new_prompt = "game.alert?.(mode==='area'?'Укажите район снабжения':mode==='group'?'Укажите подразделение группы':mode==='extract'?'Укажите добывающее здание для вывоза ресурсов':mode==='manual'?'Укажите здание назначения для ручного переноса':'Укажите снабжаемое здание','info');"
ui = replace_once(ui, old_prompt, new_prompt, 'extract targeting prompt')
old_manual_branch = "else if(mode==='manual'&&target?.kind==='building'&&target.team===first?.team&&L.ensureNode(target))game.setLogisticsMission206?.({truckIds:state.truckIds,missionType:'MANUAL_TRANSFER',destinationNodeId:target.id});"
new_manual_branch = "else if(mode==='extract'&&target?.kind==='building'&&target.team===first?.team&&L.ensureExtractor(target)){const assigned=game.assignExtractorHaul213?.({truckIds:state.truckIds,extractorId:target.id});if(assigned===undefined)game.setLogisticsMission206?.({truckIds:state.truckIds,missionType:'EXTRACT_RESOURCE',sourceNodeId:target.id,destinationNodeId:null});}else if(mode==='extract')game.alert?.('Выберите своё добывающее здание','warning');else if(mode==='manual'&&target?.kind==='building'&&target.team===first?.team&&L.ensureNode(target))game.setLogisticsMission206?.({truckIds:state.truckIds,missionType:'MANUAL_TRANSFER',destinationNodeId:target.id});"
ui = replace_once(ui, old_manual_branch, new_manual_branch, 'extract target dispatch')
LOG_UI.write_text(ui, 'utf-8')


# ---------------------------------------------------------------------------
# Friendly extractor visibility repair + contextual extraction haul authority.
# Loaded last among simulation extensions in both the main runtime and Worker.
# ---------------------------------------------------------------------------
FEATURE.write_text(FEATURE_SOURCE.read_text('utf-8'), 'utf-8')
worker = WORKER.read_text('utf-8')
worker_import = "importScripts('/frontline-dominion/friendly-extractor-visibility-v213.js?build=213');"
worker = re.sub(r"\nimportScripts\('/frontline-dominion/friendly-extractor-visibility-v213\.js\?build=\d+'\);", '', worker)
owner_anchor = '\n\nconst D = self.__FD_DEBUG__;'
if owner_anchor not in worker:
    raise RuntimeError('build 213 worker final-owner anchor missing')
worker = worker.replace(owner_anchor, '\n' + worker_import + owner_anchor, 1)
worker = sub_once(worker, r'const BUILD = 212;', 'const BUILD = 213;', 'worker build')
worker = re.sub(r"const VERSION = '16\.9\.6';", "const VERSION = '16.9.7';", worker, count=1)
worker = worker.replace('?build=212', '?build=213')
WORKER.write_text(worker, 'utf-8')

bridge = BRIDGE.read_text('utf-8')
bridge = sub_once(bridge, r'const BUILD = 212;', 'const BUILD = 213;', 'bridge build')
bridge = re.sub(r"const VERSION = '16\.9\.6';", "const VERSION = '16.9.7';", bridge, count=1)
bridge = bridge.replace('?build=212', '?build=213')
BRIDGE.write_text(bridge, 'utf-8')


# ---------------------------------------------------------------------------
# Canonical runtime owners for build 213. Preserve aliases so inherited tests
# and older UI extensions keep resolving the current owner.
# ---------------------------------------------------------------------------
clone_runtime(
    'runtime-ui-v212.js', 'runtime-ui-v213.js',
    [('__FD_RUNTIME_UI_212__', '__FD_RUNTIME_UI_213__'), ('[FD212]', '[FD213]')],
    'globalThis.__FD_RUNTIME_UI_212__ ||= globalThis.__FD_RUNTIME_UI_213__; globalThis.__FD_RUNTIME_UI_211__ ||= globalThis.__FD_RUNTIME_UI_213__; globalThis.__FD_RUNTIME_UI_210__ ||= globalThis.__FD_RUNTIME_UI_213__;',
)
clone_runtime(
    'runtime-shell-v212.js', 'runtime-shell-v213.js',
    [
        ('__FD_RUNTIME_SHELL_212__', '__FD_RUNTIME_SHELL_213__'),
        ('__FD_BOOT_212__', '__FD_BOOT_213__'),
        ('fd-loading212', 'fd-loading213'), ('fd-ready212', 'fd-ready213'), ('fd-running212', 'fd-running213'),
        ('[FD212]', '[FD213]'), ('launchSavedPayload212', 'launchSavedPayload213'),
    ],
    'globalThis.__FD_RUNTIME_SHELL_212__ ||= globalThis.__FD_RUNTIME_SHELL_213__; globalThis.__FD_RUNTIME_SHELL_211__ ||= globalThis.__FD_RUNTIME_SHELL_213__; globalThis.__FD_RUNTIME_SHELL_210__ ||= globalThis.__FD_RUNTIME_SHELL_213__; globalThis.__FD_BOOT_212__ ||= globalThis.__FD_BOOT_213__; globalThis.__FD_BOOT_211__ ||= globalThis.__FD_BOOT_213__; globalThis.__FD_BOOT_210__ ||= globalThis.__FD_BOOT_213__;',
)
clone_runtime(
    'save-slots-v212.js', 'save-slots-v213.js',
    [
        ('__FD_SAVE_SLOTS_212__', '__FD_SAVE_SLOTS_213__'),
        ('__FD_RUNTIME_SHELL_212__', '__FD_RUNTIME_SHELL_213__'),
        ('__FD_BOOT_212__', '__FD_BOOT_213__'),
    ],
    'globalThis.__FD_SAVE_SLOTS_212__ ||= globalThis.__FD_SAVE_SLOTS_213__; globalThis.__FD_SAVE_SLOTS_211__ ||= globalThis.__FD_SAVE_SLOTS_213__; globalThis.__FD_SAVE_SLOTS_210__ ||= globalThis.__FD_SAVE_SLOTS_213__;',
)


# ---------------------------------------------------------------------------
# HTML/index cache-busting and feature insertion.
# ---------------------------------------------------------------------------
html = HTML.read_text('utf-8')
html = html.replace('?build=212', '?build=213')
html = re.sub(r'data-fd-canonical-build="212"', 'data-fd-canonical-build="213"', html, count=1)
html = html.replace('Frontline Dominion v16.9.6', 'Frontline Dominion v16.9.7')
html = html.replace('v16.9.6', 'v16.9.7')
html = html.replace('BUILD 212', 'BUILD 213').replace('build 212', 'build 213')
html = html.replace('runtime-ui-v212.js?build=213', 'runtime-ui-v213.js?build=213')
html = html.replace('runtime-shell-v212.js?build=213', 'runtime-shell-v213.js?build=213')
html = html.replace('save-slots-v212.js?build=213', 'save-slots-v213.js?build=213')
feature_tag = '<script src="./friendly-extractor-visibility-v213.js?build=213"></script>'
if feature_tag not in html:
    runtime_tag = '<script src="./runtime-ui-v213.js?build=213"></script>'
    if runtime_tag not in html:
        raise RuntimeError('build 213 runtime-ui insertion anchor missing')
    html = html.replace(runtime_tag, feature_tag + '\n' + runtime_tag, 1)
HTML.write_text(html, 'utf-8')

for path in [OUT / 'runtime-ui-v213.js', OUT / 'runtime-shell-v213.js', OUT / 'save-slots-v213.js']:
    text = path.read_text('utf-8')
    if '?build=212' in text:
        path.write_text(text.replace('?build=212', '?build=213'), 'utf-8')

index = OUT / 'index.html'
if index.exists():
    text = index.read_text('utf-8')
    text = text.replace('?build=212', '?build=213')
    text = text.replace('build 212', 'build 213').replace('Build 212', 'Build 213')
    text = text.replace('v16.9.6', 'v16.9.7')
    text = re.sub(r'data-fd-canonical-build="212"', 'data-fd-canonical-build="213"', text, count=1)
    index.write_text(text, 'utf-8')

print('Frontline Dominion v16.9.7 build 213 friendly extractor visibility and external haul docking assembled')
