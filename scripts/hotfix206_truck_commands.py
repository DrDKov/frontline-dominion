from pathlib import Path

path = Path('dist/supply-transport-v206.js')
if not path.exists():
    raise RuntimeError('build 206 supply transport runtime missing')
text = path.read_text('utf-8')

old = "      truck.commandQueue=[{type:'logistics206',missionType:mission}];truck.invalidateNavigation?.();changed+=1;\n"
new = "      const command206={type:'logistics206',missionType:mission};\n      if(typeof truck.setCommand==='function')truck.setCommand(command206,false);\n      else{truck.commandQueue=[command206];try{truck.currentCommand=command206;}catch(_){}}\n      truck.invalidateNavigation?.();changed+=1;\n"
if text.count(old) != 1:
    raise RuntimeError(f'build 206 mission command anchor count={text.count(old)}')
text = text.replace(old, new, 1)

old_spawn = "s.homeNodeId=homeId;s.missionType='SUPPLY_BUILDING';s.destinationNodeId=homeId;s.phase206='PLAN';spawned.commandQueue=[{type:'logistics206',missionType:'SUPPLY_BUILDING'}];}"
new_spawn = "s.homeNodeId=homeId;s.missionType='SUPPLY_BUILDING';s.destinationNodeId=homeId;s.phase206='PLAN';const command206={type:'logistics206',missionType:'SUPPLY_BUILDING'};if(typeof spawned.setCommand==='function')spawned.setCommand(command206,false);else{spawned.commandQueue=[command206];try{spawned.currentCommand=command206;}catch(_){}}}"
if text.count(old_spawn) != 1:
    raise RuntimeError(f'build 206 spawned truck command anchor count={text.count(old_spawn)}')
text = text.replace(old_spawn, new_spawn, 1)

path.write_text(text, 'utf-8')
print('Build 206 truck logistics missions now use Unit.setCommand with safe fallback')
