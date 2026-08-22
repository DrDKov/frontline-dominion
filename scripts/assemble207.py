from pathlib import Path
import re
import shutil

ROOT=Path('.')
OUT=ROOT/'dist'
BUILD=207
VERSION='16.9.1'
GAMEPLAY='singleplayer-gameplay-v207.js'
UI='logistics-ui-v207.js'
HTML=OUT/'frontline-dominion.html'
WORKER=OUT/'authoritative-simulation-worker-v174.js'
BRIDGE=OUT/'authoritative-simulation-v174.js'

for name in (GAMEPLAY,UI):
    source=ROOT/'src'/'v207'/name
    if not source.exists(): raise RuntimeError(f'build 207 source missing: {source}')
    shutil.copy2(source,OUT/name)
for path in (HTML,WORKER,BRIDGE):
    if not path.exists(): raise RuntimeError(f'build 207 inherited output missing: {path}')

def sub_once(text,pattern,repl,label,flags=0):
    updated,count=re.subn(pattern,repl,text,count=1,flags=flags)
    if count!=1: raise RuntimeError(f'build 207 {label}: expected one anchor, got {count}')
    return updated

def owner(source_name,target_name,replacements,aliases=''):
    source=OUT/source_name
    if not source.exists(): raise RuntimeError(f'build 207 owner source missing: {source_name}')
    text=source.read_text('utf-8')
    text=sub_once(text,r'const BUILD = 206;',f'const BUILD = {BUILD};',f'{source_name} BUILD')
    text=re.sub(r"const VERSION = '[^']+';",f"const VERSION = '{VERSION}';",text,count=1)
    for old,new in replacements: text=text.replace(old,new)
    text=text.replace('?build=206','?build=207')
    if aliases:
        text += '\n' + aliases + '\n'
    (OUT/target_name).write_text(text,'utf-8')

owner('runtime-ui-v206.js','runtime-ui-v207.js',[
    ('__FD_RUNTIME_UI_206__','__FD_RUNTIME_UI_207__'),('[FD206]','[FD207]')
], "globalThis.__FD_RUNTIME_UI_206__ ||= globalThis.__FD_RUNTIME_UI_207__;" )
owner('runtime-shell-v206.js','runtime-shell-v207.js',[
    ('__FD_RUNTIME_SHELL_206__','__FD_RUNTIME_SHELL_207__'),('__FD_BOOT_206__','__FD_BOOT_207__'),
    ('fd-loading206','fd-loading207'),('fd-ready206','fd-ready207'),('fd-running206','fd-running207'),('[FD206]','[FD207]')
], "globalThis.__FD_RUNTIME_SHELL_206__ ||= globalThis.__FD_RUNTIME_SHELL_207__; globalThis.__FD_BOOT_206__ ||= globalThis.__FD_BOOT_207__;" )
owner('save-slots-v206.js','save-slots-v207.js',[
    ('__FD_SAVE_SLOTS_206__','__FD_SAVE_SLOTS_207__'),('__FD_RUNTIME_SHELL_206__','__FD_RUNTIME_SHELL_207__'),
    ('__FD_BOOT_206__','__FD_BOOT_207__'),('fd:authoritative-save206','fd:authoritative-save207')
], "globalThis.__FD_SAVE_SLOTS_206__ ||= globalThis.__FD_SAVE_SLOTS_207__;" )

worker=WORKER.read_text('utf-8')
worker=sub_once(worker,r'const BUILD = 206;',f'const BUILD = {BUILD};','Worker BUILD')
worker=re.sub(r"const VERSION = '[^']+';",f"const VERSION = '{VERSION}';",worker,count=1)
worker=worker.replace('?build=206','?build=207')
anchor='let game = null;'
if worker.count(anchor)!=1: raise RuntimeError(f'build 207 Worker game anchor count={worker.count(anchor)}')
worker=worker.replace(anchor,f"importScripts('/frontline-dominion/{GAMEPLAY}?build=207');\n\n{anchor}",1)
WORKER.write_text(worker,'utf-8')

bridge=BRIDGE.read_text('utf-8')
bridge=sub_once(bridge,r'const BUILD = 206;',f'const BUILD = {BUILD};','bridge BUILD')
bridge=re.sub(r"const VERSION = '[^']+';",f"const VERSION = '{VERSION}';",bridge,count=1)
bridge=bridge.replace('?build=206','?build=207').replace('fd:authoritative-save206','fd:authoritative-save207')
BRIDGE.write_text(bridge,'utf-8')

html=HTML.read_text('utf-8')
html=html.replace('?build=206','?build=207')
html=re.sub(r'data-fd-canonical-build="206"','data-fd-canonical-build="207"',html)
html=html.replace('Frontline Dominion v16.9.0','Frontline Dominion v16.9.1')
old_ui='<script src="./logistics-ui-v206.js?build=207"></script>'
html=html.replace(old_ui,'')
html=html.replace('<script src="./runtime-ui-v206.js?build=207"></script>',
                  '<script src="./singleplayer-gameplay-v207.js?build=207"></script>\n'
                  '<script src="./logistics-ui-v207.js?build=207"></script>\n'
                  '<script src="./runtime-ui-v207.js?build=207"></script>',1)
html=html.replace('runtime-shell-v206.js?build=207','runtime-shell-v207.js?build=207')
html=html.replace('save-slots-v206.js?build=207','save-slots-v207.js?build=207')
if html.count('logistics-ui-v207.js?build=207')!=1: raise RuntimeError('build 207 UI owner not unique')
if 'logistics-ui-v206.js?build=207' in html: raise RuntimeError('build 207 inherited volatile logistics UI still loaded')
if 'runtime-ui-v207.js?build=207' not in html or 'runtime-shell-v207.js?build=207' not in html or 'save-slots-v207.js?build=207' not in html:
    raise RuntimeError('build 207 presentation owner transformation incomplete')
HTML.write_text(html,'utf-8')

index=OUT/'index.html'
if index.exists():
    text=index.read_text('utf-8').replace('?build=206','?build=207').replace('build 206','build 207').replace('v16.9.0','v16.9.1')
    text=re.sub(r'data-fd-canonical-build="206"','data-fd-canonical-build="207"',text)
    index.write_text(text,'utf-8')

print('Frontline Dominion v16.9.1 build 207 single-player logistics/UI fixes assembled with 206 compatibility aliases')
