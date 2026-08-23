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
    // Buildings must use the canonical footprint-aware interaction planner.
    // The previous center-distance short circuit could declare a truck ready
    // while its rendered/navigation footprint was still inside the structure.
    if(target.kind==='building'){
      if(typeof truck.moveTowardInteraction==='function'&&target.id){
        return Boolean(truck.moveTowardInteraction(target,truck.currentCommand,dt,interaction));
      }
      if(truck.game?.isBuildingInteractionReady117?.(truck,target,interaction))return true;
      const fallbackRange=Math.max(48,Number(truck.radius||20)+(Number(target.radius)||0)+30);
      if(dist(truck,target)<=fallbackRange)return true;
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

text += "\n;(() => { const root=typeof window!=='undefined'?window:self; root.__FD_TRUCK_DOCK_HOTFIX_213__=Object.freeze({build:213,footprintAware:true,noCenterDistanceShortcut:true}); })();\n"
SUPPLY.write_text(text, 'utf-8')
print('Build 213 truck loading/unloading now uses canonical footprint-aware interaction approach')
