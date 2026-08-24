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
