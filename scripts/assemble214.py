from pathlib import Path
import re

ROOT=Path('.')
OUT=ROOT/'dist'
BUILD=214
VERSION='16.9.8'
HTML=OUT/'frontline-dominion.html'
WORKER=OUT/'authoritative-simulation-worker-v174.js'
BRIDGE=OUT/'authoritative-simulation-v174.js'
# Build 214 release identity is still produced here, but gameplay ownership now
# comes from the current patchless source modules rather than stale src/v214 copies.
TRANSPORT_SRC=ROOT/'src/legacy/transport-fire.js'
AI_SRC=ROOT/'src/legacy/ai-economy-logistics.js'
TRANSPORT=OUT/'transport-fire-v214.js'
AI=OUT/'ai-economy-logistics-v214.js'

for path in [HTML,WORKER,BRIDGE,TRANSPORT_SRC,AI_SRC,OUT/'runtime-ui-v213.js',OUT/'runtime-shell-v213.js',OUT/'save-slots-v213.js',OUT/'friendly-extractor-visibility-v213.js']:
    if not path.exists(): raise RuntimeError(f'build 214 inherited output missing: {path}')

transport_text=TRANSPORT_SRC.read_text('utf-8')
transport_text+="""
;(() => {
  const root=typeof window!=='undefined'?window:self;
  const api=root.__FD_TRANSPORT_FIRE__;
  if(api) root.__FD_TRANSPORT_FIRE_214__=Object.freeze({...api,build:214,version:'16.9.8'});
})();
"""
TRANSPORT.write_text(transport_text,'utf-8')

ai_text=AI_SRC.read_text('utf-8')
ai_text+="""
;(() => {
  const root=typeof window!=='undefined'?window:self;
  const api=root.__FD_AI_ECONOMY_LOGISTICS__;
  if(api) root.__FD_AI_ECONOMY_LOGISTICS_214__=Object.freeze({...api,build:214,version:'16.9.8',usableReserve214:api.usableReserve,storageCapacity214:api.storageCapacity,backlog214:api.backlog});
})();
"""
AI.write_text(ai_text,'utf-8')

def clone_runtime(source,target,replacements,alias):
    text=(OUT/source).read_text('utf-8')
    text,count=re.subn(r'const BUILD = 213;', 'const BUILD = 214;', text, count=1)
    if count!=1: raise RuntimeError(f'{source}: BUILD anchor count={count}')
    text=re.sub(r"const VERSION = '[^']+';", "const VERSION = '16.9.8';", text, count=1)
    for old,new in replacements: text=text.replace(old,new)
    text=text.replace('?build=213','?build=214')
    text+='\n'+alias+'\n'
    (OUT/target).write_text(text,'utf-8')

clone_runtime('runtime-ui-v213.js','runtime-ui-v214.js',[
    ('__FD_RUNTIME_UI_213__','__FD_RUNTIME_UI_214__'),('[FD213]','[FD214]')
],"globalThis.__FD_RUNTIME_UI_213__ ||= globalThis.__FD_RUNTIME_UI_214__; globalThis.__FD_RUNTIME_UI_212__ ||= globalThis.__FD_RUNTIME_UI_214__; globalThis.__FD_RUNTIME_UI_211__ ||= globalThis.__FD_RUNTIME_UI_214__; globalThis.__FD_RUNTIME_UI_210__ ||= globalThis.__FD_RUNTIME_UI_214__;")
clone_runtime('runtime-shell-v213.js','runtime-shell-v214.js',[
    ('__FD_RUNTIME_SHELL_213__','__FD_RUNTIME_SHELL_214__'),('__FD_BOOT_213__','__FD_BOOT_214__'),
    ('fd-loading213','fd-loading214'),('fd-ready213','fd-ready214'),('fd-running213','fd-running214'),
    ('[FD213]','[FD214]'),('launchSavedPayload213','launchSavedPayload214')
],"globalThis.__FD_RUNTIME_SHELL_213__ ||= globalThis.__FD_RUNTIME_SHELL_214__; globalThis.__FD_RUNTIME_SHELL_212__ ||= globalThis.__FD_RUNTIME_SHELL_214__; globalThis.__FD_RUNTIME_SHELL_211__ ||= globalThis.__FD_RUNTIME_SHELL_214__; globalThis.__FD_RUNTIME_SHELL_210__ ||= globalThis.__FD_RUNTIME_SHELL_214__; globalThis.__FD_BOOT_213__ ||= globalThis.__FD_BOOT_214__; globalThis.__FD_BOOT_212__ ||= globalThis.__FD_BOOT_214__; globalThis.__FD_BOOT_211__ ||= globalThis.__FD_BOOT_214__; globalThis.__FD_BOOT_210__ ||= globalThis.__FD_BOOT_214__;")
clone_runtime('save-slots-v213.js','save-slots-v214.js',[
    ('__FD_SAVE_SLOTS_213__','__FD_SAVE_SLOTS_214__'),('__FD_RUNTIME_SHELL_213__','__FD_RUNTIME_SHELL_214__'),('__FD_BOOT_213__','__FD_BOOT_214__'),('launchSavedPayload213','launchSavedPayload214')
],"globalThis.__FD_SAVE_SLOTS_213__ ||= globalThis.__FD_SAVE_SLOTS_214__; globalThis.__FD_SAVE_SLOTS_212__ ||= globalThis.__FD_SAVE_SLOTS_214__; globalThis.__FD_SAVE_SLOTS_211__ ||= globalThis.__FD_SAVE_SLOTS_214__; globalThis.__FD_SAVE_SLOTS_210__ ||= globalThis.__FD_SAVE_SLOTS_214__;")

# The current feature owners execute in the authoritative Worker as well as on
# the main thread so combat and AI decisions remain deterministic.
worker=WORKER.read_text('utf-8')
worker=re.sub(r"\nimportScripts\('/frontline-dominion/transport-fire-v214\.js\?build=\d+'\);",'',worker)
worker=re.sub(r"\nimportScripts\('/frontline-dominion/ai-economy-logistics-v214\.js\?build=\d+'\);",'',worker)
anchor='\n\nconst D = self.__FD_DEBUG__;'
if anchor not in worker: raise RuntimeError('build 214 worker final owner anchor missing')
imports="\nimportScripts('/frontline-dominion/transport-fire-v214.js?build=214');\nimportScripts('/frontline-dominion/ai-economy-logistics-v214.js?build=214');"
worker=worker.replace(anchor,imports+anchor,1)
worker,count=re.subn(r'const BUILD = 213;', 'const BUILD = 214;', worker, count=1)
if count!=1: raise RuntimeError(f'worker build anchor count={count}')
worker=re.sub(r"const VERSION = '16\.9\.7';", "const VERSION = '16.9.8';", worker, count=1)
worker=worker.replace('?build=213','?build=214')
WORKER.write_text(worker,'utf-8')

bridge=BRIDGE.read_text('utf-8')
bridge,count=re.subn(r'const BUILD = 213;', 'const BUILD = 214;', bridge, count=1)
if count!=1: raise RuntimeError(f'bridge build anchor count={count}')
bridge=re.sub(r"const VERSION = '16\.9\.7';", "const VERSION = '16.9.8';", bridge, count=1)
bridge=bridge.replace('?build=213','?build=214')
BRIDGE.write_text(bridge,'utf-8')

html=HTML.read_text('utf-8')
html=html.replace('?build=213','?build=214')
html,count=re.subn(r'data-fd-canonical-build="213"','data-fd-canonical-build="214"',html,count=1)
if count!=1: raise RuntimeError(f'HTML canonical build anchor count={count}')
html=html.replace('Frontline Dominion v16.9.7','Frontline Dominion v16.9.8').replace('v16.9.7','v16.9.8')
html=html.replace('BUILD 213','BUILD 214').replace('Build 213','Build 214').replace('build 213','build 214')
html=html.replace('runtime-ui-v213.js?build=214','runtime-ui-v214.js?build=214')
html=html.replace('runtime-shell-v213.js?build=214','runtime-shell-v214.js?build=214')
html=html.replace('save-slots-v213.js?build=214','save-slots-v214.js?build=214')

runtime_tag='<script src="./runtime-ui-v214.js?build=214"></script>'
if runtime_tag not in html: raise RuntimeError('build 214 runtime-ui insertion anchor missing')
for tag in [
    '<script src="./transport-fire-v214.js?build=214"></script>',
    '<script src="./ai-economy-logistics-v214.js?build=214"></script>',
]:
    if tag not in html: html=html.replace(runtime_tag,tag+'\n'+runtime_tag,1)

shell_tag='<script src="./runtime-shell-v214.js?build=214"></script>'
boot214="<script id=\"fd-boot-bridge214\">globalThis.__FD_BOOT_214__ ||= globalThis.__FD_BOOT_213__ || globalThis.__FD_BOOT_212__ || globalThis.__FD_BOOT_211__ || globalThis.__FD_BOOT_210__;</script>"
if shell_tag not in html: raise RuntimeError('build 214 runtime-shell anchor missing')
if boot214 not in html: html=html.replace(shell_tag,boot214+'\n'+shell_tag,1)
HTML.write_text(html,'utf-8')

index=OUT/'index.html'
if index.exists():
    text=index.read_text('utf-8').replace('?build=213','?build=214').replace('build=213','build=214').replace('Build 213','Build 214').replace('build 213','build 214')
    index.write_text(text,'utf-8')

(OUT/'build214-manifest.json').write_text('''{\n  "build": 214,\n  "version": "16.9.8",\n  "features": ["ground-transport-passenger-fire", "ai-extraction-hauling", "ai-stored-reserve-planning", "ai-logistics-recovery", "build213-fog-and-haul-fixes"]\n}\n''','utf-8')
print('Frontline Dominion v16.9.8 build 214 assembled from current passenger-fire and adaptive AI logistics owners')
