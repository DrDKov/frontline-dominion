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
