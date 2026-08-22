from pathlib import Path
import re
import shutil

ROOT=Path('.')
OUT=ROOT/'dist'
BUILD=208
VERSION='16.9.2'
HTML=OUT/'frontline-dominion.html'
WORKER=OUT/'authoritative-simulation-worker-v174.js'
BRIDGE=OUT/'authoritative-simulation-v174.js'
GAMEPLAY='gameplay-v208.js'
UI='logistics-ui-v208.js'

for path in (HTML,WORKER,BRIDGE,OUT/'logistics-ui-v207.js',OUT/'runtime-ui-v207.js',OUT/'runtime-shell-v207.js',OUT/'save-slots-v207.js'):
    if not path.exists(): raise RuntimeError(f'build 208 inherited output missing: {path}')
source=ROOT/'src'/'v208'/GAMEPLAY
if not source.exists(): raise RuntimeError(f'build 208 source missing: {source}')
shutil.copy2(source,OUT/GAMEPLAY)

def sub_once(text,pattern,repl,label,flags=0):
    updated,count=re.subn(pattern,repl,text,count=1,flags=flags)
    if count!=1: raise RuntimeError(f'build 208 {label}: expected one anchor, got {count}')
    return updated

def owner(source_name,target_name,replacements,aliases=''):
    text=(OUT/source_name).read_text('utf-8')
    text=sub_once(text,r'const BUILD = 207;',f'const BUILD = {BUILD};',f'{source_name} BUILD')
    text=re.sub(r"const VERSION = '[^']+';",f"const VERSION = '{VERSION}';",text,count=1)
    for old,new in replacements: text=text.replace(old,new)
    text=text.replace('?build=207','?build=208')
    if aliases: text += '\n'+aliases+'\n'
    (OUT/target_name).write_text(text,'utf-8')

owner('runtime-ui-v207.js','runtime-ui-v208.js',[
    ('__FD_RUNTIME_UI_207__','__FD_RUNTIME_UI_208__'),('[FD207]','[FD208]')
], "globalThis.__FD_RUNTIME_UI_207__ ||= globalThis.__FD_RUNTIME_UI_208__; globalThis.__FD_RUNTIME_UI_206__ ||= globalThis.__FD_RUNTIME_UI_208__;" )
owner('runtime-shell-v207.js','runtime-shell-v208.js',[
    ('__FD_RUNTIME_SHELL_207__','__FD_RUNTIME_SHELL_208__'),('__FD_BOOT_207__','__FD_BOOT_208__'),
    ('fd-loading207','fd-loading208'),('fd-ready207','fd-ready208'),('fd-running207','fd-running208'),('[FD207]','[FD208]')
], "globalThis.__FD_RUNTIME_SHELL_207__ ||= globalThis.__FD_RUNTIME_SHELL_208__; globalThis.__FD_RUNTIME_SHELL_206__ ||= globalThis.__FD_RUNTIME_SHELL_208__; globalThis.__FD_BOOT_207__ ||= globalThis.__FD_BOOT_208__; globalThis.__FD_BOOT_206__ ||= globalThis.__FD_BOOT_208__;" )
owner('save-slots-v207.js','save-slots-v208.js',[
    ('__FD_SAVE_SLOTS_207__','__FD_SAVE_SLOTS_208__'),('__FD_RUNTIME_SHELL_207__','__FD_RUNTIME_SHELL_208__'),
    ('__FD_BOOT_207__','__FD_BOOT_208__'),('fd:authoritative-save207','fd:authoritative-save208')
], "globalThis.__FD_SAVE_SLOTS_207__ ||= globalThis.__FD_SAVE_SLOTS_208__; globalThis.__FD_SAVE_SLOTS_206__ ||= globalThis.__FD_SAVE_SLOTS_208__;" )

# Build 208 owns the logistics card. Keep its proven stable DOM layout but repair target semantics.
ui=(OUT/'logistics-ui-v207.js').read_text('utf-8')
ui=ui.replace('__fdLogisticsUI207Installed','__fdLogisticsUI208Installed')
ui=ui.replace('__FD_LOGISTICS_UI207__','__FD_LOGISTICS_UI208__')
ui=ui.replace("if(action==='manual'&&L.isTruck(one))game.setLogisticsMission206?.({truckIds:selectedTruckIds(game),missionType:'MANUAL_TRANSFER'});",
              "if(action==='manual'&&L.isTruck(one)){beginTarget(game,'manual');return;}")
old_group="else if(mode==='group'&&target?.kind==='unit'&&target.team===first?.team){const groupId=target.currentCommand?.formationGroupId||target.currentCommand?.formationId||target.aiSquadId;if(groupId)game.setLogisticsMission206?.({truckIds:state.truckIds,missionType:'SUPPLY_GROUP',targetGroupId:groupId,serviceRadius:620});else game.alert?.('У подразделения нет группы/формации','warning');}"
new_group="else if(mode==='group'&&target?.kind==='unit'&&target.team===first?.team){const groupId=target.currentCommand?.formationGroupId||target.currentCommand?.formationId||target.aiSquadId;if(groupId)game.setLogisticsMission206?.({truckIds:state.truckIds,missionType:'SUPPLY_GROUP',targetGroupId:groupId,serviceRadius:620});else{const nearby=(game.units||[]).filter(u=>u?.alive&&u.team===first?.team&&!L.isAir(u)&&!L.isTruck(u)&&Math.hypot(u.x-target.x,u.y-target.y)<=520).sort((a,b)=>String(a.id).localeCompare(String(b.id),'en')).map(u=>u.id);game.setLogisticsMission206?.({truckIds:state.truckIds,missionType:'SUPPLY_GROUP',targetUnitIds208:nearby,targetX:target.x,targetY:target.y,serviceRadius:620});}}else if(mode==='manual'&&target?.kind==='building'&&target.team===first?.team&&L.ensureNode(target))game.setLogisticsMission206?.({truckIds:state.truckIds,missionType:'MANUAL_TRANSFER',destinationNodeId:target.id});"
if old_group not in ui: raise RuntimeError('build 208 group target anchor missing')
ui=ui.replace(old_group,new_group,1)
ui=ui.replace("function beginTarget(game,mode){const ids=selectedTruckIds(game);if(!ids.length)return false;state.targetMode=mode;state.truckIds=ids;state.sourceEntityId=selectedOne(game)?.id||null;document.body.classList.add('fd-logistics-target207');game.alert?.(mode==='area'?'Укажите район снабжения':mode==='group'?'Укажите подразделение группы':'Укажите снабжаемое здание','info');return true;}",
              "function beginTarget(game,mode){const ids=selectedTruckIds(game);if(!ids.length)return false;state.targetMode=mode;state.truckIds=ids;state.sourceEntityId=selectedOne(game)?.id||null;document.body.classList.add('fd-logistics-target207');game.alert?.(mode==='area'?'Укажите район снабжения':mode==='group'?'Укажите подразделение группы':mode==='manual'?'Укажите здание назначения для ручного переноса':'Укажите снабжаемое здание','info');return true;}",1)
ui=ui.replace("if(mode==='building'&&target?.kind==='building'&&target.team===first?.team)game.setLogisticsMission206?.({truckIds:state.truckIds,missionType:'SUPPLY_BUILDING',destinationNodeId:target.id});",
              "if(mode==='building'&&target?.kind==='building'&&target.team===first?.team&&L.ensureNode(target))game.setLogisticsMission206?.({truckIds:state.truckIds,missionType:'SUPPLY_BUILDING',destinationNodeId:target.id});else if(mode==='building'&&target?.kind==='building')game.alert?.('Это здание не использует локальный физический запас','warning');",1)
ui=ui.replace("${field('rate','Скорость добычи')}${field('haul','Вывоз')}","${field('rate','Скорость добычи')}${field('moneyIncome','Денежный доход')}${field('haul','Вывоз')}",1)
ui=ui.replace("setField(panel,'rate',`${amount(entity.stats?.extractPerTick||0)} ед./с`);setField(panel,'haul','грузовик или инженер');",
              "setField(panel,'rate',`${amount(entity.stats?.extractPerTick||0)} ед./с`);setField(panel,'moneyIncome',`+${amount(entity.stats?.moneyIncomePerSecond208||0)} ¤/с`);setField(panel,'haul','грузовик автоматически · инженер только по приказу');",1)
ui += "\nglobalThis.__FD_LOGISTICS_UI207__ ||= globalThis.__FD_LOGISTICS_UI208__;\n"
(OUT/UI).write_text(ui,'utf-8')

worker=WORKER.read_text('utf-8')
worker=sub_once(worker,r'const BUILD = 207;',f'const BUILD = {BUILD};','Worker BUILD')
worker=re.sub(r"const VERSION = '[^']+';",f"const VERSION = '{VERSION}';",worker,count=1)
worker=worker.replace('?build=207','?build=208')
anchor="importScripts('/frontline-dominion/hook-context-v207.js?build=208');"
if worker.count(anchor)!=1: raise RuntimeError(f'build 208 Worker hook anchor count={worker.count(anchor)}')
worker=worker.replace(anchor,anchor+f"\nimportScripts('/frontline-dominion/{GAMEPLAY}?build=208');",1)
WORKER.write_text(worker,'utf-8')

bridge=BRIDGE.read_text('utf-8')
bridge=sub_once(bridge,r'const BUILD = 207;',f'const BUILD = {BUILD};','bridge BUILD')
bridge=re.sub(r"const VERSION = '[^']+';",f"const VERSION = '{VERSION}';",bridge,count=1)
bridge=bridge.replace('?build=207','?build=208').replace('fd:authoritative-save207','fd:authoritative-save208')
BRIDGE.write_text(bridge,'utf-8')

html=HTML.read_text('utf-8')
html=html.replace('?build=207','?build=208')
html=re.sub(r'data-fd-canonical-build="207"','data-fd-canonical-build="208"',html)
html=html.replace('Frontline Dominion v16.9.1','Frontline Dominion v16.9.2')
html=html.replace('<script src="./hook-context-v207.js?build=208"></script>\n<script src="./logistics-ui-v207.js?build=208"></script>',
                  '<script src="./hook-context-v207.js?build=208"></script>\n'
                  '<script src="./gameplay-v208.js?build=208"></script>\n'
                  '<script src="./logistics-ui-v208.js?build=208"></script>',1)
html=html.replace('runtime-ui-v207.js?build=208','runtime-ui-v208.js?build=208')
html=html.replace('runtime-shell-v207.js?build=208','runtime-shell-v208.js?build=208')
html=html.replace('save-slots-v207.js?build=208','save-slots-v208.js?build=208')
old_boot='<script id="fd-boot-bridge207">globalThis.__FD_BOOT_207__ ||= globalThis.__FD_BOOT_206__;</script>'
new_boot='<script id="fd-boot-bridge208">globalThis.__FD_BOOT_208__ ||= globalThis.__FD_BOOT_207__ || globalThis.__FD_BOOT_206__;</script>'
if old_boot not in html: raise RuntimeError('build 208 boot bridge anchor missing')
html=html.replace(old_boot,new_boot,1)
if html.count('gameplay-v208.js?build=208')!=1: raise RuntimeError('build 208 gameplay owner not unique')
if html.count('logistics-ui-v208.js?build=208')!=1: raise RuntimeError('build 208 logistics UI owner not unique')
if 'logistics-ui-v207.js?build=208' in html: raise RuntimeError('build 208 inherited logistics UI still loaded')
HTML.write_text(html,'utf-8')

index=OUT/'index.html'
if index.exists():
    text=index.read_text('utf-8').replace('?build=207','?build=208').replace('build 207','build 208').replace('v16.9.1','v16.9.2')
    text=re.sub(r'data-fd-canonical-build="207"','data-fd-canonical-build="208"',text)
    index.write_text(text,'utf-8')

print('Frontline Dominion v16.9.2 build 208 logistics controls, tied transport and construction authority assembled')
