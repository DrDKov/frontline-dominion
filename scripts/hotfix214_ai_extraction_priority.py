from pathlib import Path

PATH=Path('dist/ai-economy-logistics-v214.js')
if not PATH.exists(): raise RuntimeError('build 214 AI logistics owner missing')
text=PATH.read_text('utf-8')
old="const d=game.getEntity?.(s.destinationNodeId);return urgent ? demandTotal(d)<900 : demandTotal(d)<160;"
new="const d=game.getEntity?.(s.destinationNodeId);return urgent ? true : demandTotal(d)<160;"
if text.count(old)!=1: raise RuntimeError(f'build 214 urgent extraction dispatch anchor count={text.count(old)}')
text=text.replace(old,new,1)
text+="\n;(() => { const root=typeof window!=='undefined'?window:self; root.__FD_AI_EXTRACTION_PRIORITY_214__=Object.freeze({build:214,saturatedExtractorCanPreemptSupplyTruck:true,reserveFleetPreserved:true}); })();\n"
PATH.write_text(text,'utf-8')
print('Build 214 saturated extractors can claim the dedicated haul share before empty-node supply deadlocks')

# The Stage-1 SERVICE replan owner is part of src/legacy and is copied into
# dist by scripts/build.py. Canonical 214 must also execute it in both realms;
# otherwise an undeliverable SERVICE mission can remain SERVICING forever.
REPLAN=Path('dist/logistics-service-replan.js')
HTML=Path('dist/frontline-dominion.html')
WORKER=Path('dist/authoritative-simulation-worker-v174.js')
for p in [REPLAN,HTML,WORKER]:
    if not p.exists(): raise RuntimeError(f'build 214 SERVICE replan input missing: {p}')
html=HTML.read_text('utf-8')
replan_tag='<script src="./logistics-service-replan.js?build=214"></script>'
transport_tag='<script src="./transport-fire-v214.js?build=214"></script>'
if transport_tag not in html: raise RuntimeError('build 214 transport script anchor missing')
if replan_tag not in html: html=html.replace(transport_tag,replan_tag+'\n'+transport_tag,1)
HTML.write_text(html,'utf-8')

worker=WORKER.read_text('utf-8')
replan_import="importScripts('/frontline-dominion/logistics-service-replan.js?build=214');"
transport_import="importScripts('/frontline-dominion/transport-fire-v214.js?build=214');"
if transport_import not in worker: raise RuntimeError('build 214 Worker transport import anchor missing')
if replan_import not in worker: worker=worker.replace(transport_import,replan_import+'\n'+transport_import,1)
WORKER.write_text(worker,'utf-8')
print('Build 214 SERVICE replan owner executes in page and authoritative Worker')

MP=Path('dist/multiplayer.html')
if not MP.exists(): raise RuntimeError('build 214 multiplayer entry missing')
mp=MP.read_text('utf-8')
replacements=[
    ('data-fd-canonical-build="206"','data-fd-canonical-build="214"'),
    ('BUILD 205','BUILD 214'),
    ('frontline-dominion.html?build=206&amp;multiplayer=1','frontline-dominion.html?build=214&amp;multiplayer=1'),
    ('multiplayer-lobby-v206.js?build=206','multiplayer-lobby-v206.js?build=214'),
]
for old,new in replacements:
    count=mp.count(old)
    if count!=1: raise RuntimeError(f'build 214 multiplayer anchor {old!r} count={count}')
    mp=mp.replace(old,new,1)
MP.write_text(mp,'utf-8')
print('Build 214 multiplayer entry routes to canonical runtime 214 while retaining lobby protocol v206')

# Native GitHub merge trigger for release214 workflow.
