from pathlib import Path
import re

SUPPLY = Path('dist/supply-transport-v206.js')
if not SUPPLY.exists():
    raise RuntimeError('build 213 supply transport missing')

text = SUPPLY.read_text('utf-8')
pattern = re.compile(
    r"  function stableDockAngle213\(truck,target,interaction\) \{.*?\n  function resupplyUnit206",
    re.S,
)
replacement = """  function moveTruck206(truck,target,dt,interaction='logistics') {
    if(!target)return false;
    // The collision defect is specific to extractor footprints: their rendered
    // footprint can be wider/asymmetric relative to target.radius. Use the
    // canonical footprint-aware interaction planner for extractors only.
    // Ordinary warehouses/logistics hubs keep the proven build-212 approach so
    // SUPPLY_AREA / SUPPLY_GROUP source loading semantics remain unchanged.
    if(target.kind==='building'&&L.ensureExtractor(target)){
      if(typeof truck.moveTowardInteraction==='function'&&target.id){
        return Boolean(truck.moveTowardInteraction(target,truck.currentCommand,dt,interaction));
      }
      if(truck.game?.isBuildingInteractionReady117?.(truck,target,interaction))return true;
      const extractorRange=Math.max(58,Number(truck.radius||20)+(Number(target.radius)||0)+18);
      if(dist(truck,target)<=extractorRange)return true;
      if(typeof truck.moveToward==='function')return Boolean(truck.moveToward(target.x,target.y,dt,.92));
      return false;
    }
    const range=Math.max(34,Number(truck.radius||20)+(Number(target.radius)||0)+12);
    if(dist(truck,target)<=range)return true;
    if(typeof truck.moveTowardInteraction==='function'&&target.id)return Boolean(truck.moveTowardInteraction(target,truck.currentCommand,dt,interaction));
    if(typeof truck.moveToward==='function')return Boolean(truck.moveToward(target.x,target.y,dt,.92));
    return false;
  }

  function resupplyUnit206"""
text, count = pattern.subn(replacement, text, count=1)
if count != 1:
    raise RuntimeError(f'build 213 footprint dock anchor count={count}')

text += "\n;(() => { const root=typeof window!=='undefined'?window:self; root.__FD_TRUCK_DOCK_HOTFIX_213__=Object.freeze({build:213,footprintAware:true,extractorScoped:true,noCenterDistanceShortcut:true}); })();\n"
SUPPLY.write_text(text, 'utf-8')
print('Build 213 extractor loading uses footprint-aware interaction; ordinary supply nodes preserve build-212 service geometry')
