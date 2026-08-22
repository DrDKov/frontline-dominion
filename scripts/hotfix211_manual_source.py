from pathlib import Path

SUPPLY = Path('dist/supply-transport-v206.js')
if not SUPPLY.exists():
    raise RuntimeError('build 211 supply transport output missing')

text = SUPPLY.read_text('utf-8')
old = """      let source=null;
      if(s.missionType==='EXTRACT_RESOURCE'&&s.sourceNodeId)source=game.getEntity?.(s.sourceNodeId);
      else source=game.findSupplySource206(truck,demand,s.destinationNodeId||s.homeNodeId);
"""
new = """      let source=null;
      if((s.missionType==='EXTRACT_RESOURCE'||s.missionType==='MANUAL_TRANSFER')&&s.sourceNodeId&&s.sourceNodeId!==s.destinationNodeId)source=game.getEntity?.(s.sourceNodeId);
      else source=game.findSupplySource206(truck,demand,s.destinationNodeId||s.homeNodeId);
"""
if text.count(old) != 1:
    raise RuntimeError(f'build 211 manual source anchor count={text.count(old)}')
text = text.replace(old, new, 1)

marker = "manualSourceAuthoritative: true,"
old_marker = "receiverCargoIsolation: true,"
if old_marker not in text:
    raise RuntimeError('build 211 integrity marker missing')
text = text.replace(old_marker, old_marker + '\n    ' + marker, 1)
SUPPLY.write_text(text, 'utf-8')
print('Build 211 explicit manual-transfer source authority installed')
