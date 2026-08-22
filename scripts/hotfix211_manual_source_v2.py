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
text += "\n;(() => { const root=typeof window!=='undefined'?window:self; root.__FD_LOGISTICS_INTEGRITY_211__=Object.freeze({...root.__FD_LOGISTICS_INTEGRITY_211__,manualSourceAuthoritative:true}); })();\n"
SUPPLY.write_text(text, 'utf-8')
print('Build 211 explicit manual-transfer source authority installed independently')
