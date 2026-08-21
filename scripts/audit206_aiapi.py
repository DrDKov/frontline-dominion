from pathlib import Path
import re
text=Path('dist/authoritative-simulation-bundle-v172.js').read_text('utf-8',errors='replace')
out=['BUILD206 AI API AUDIT']
patterns=[r'TacticalAI\.prototype\.[A-Za-z0-9_]*(?:build|construct|place|econom|resource|produce)[A-Za-z0-9_]*\s*=',r'\b(?:tryBuild|buildStructure|placeBuildingAI|buildBuilding|queueProduction)\b']
for pattern in patterns:
 out.append(f'\n## {pattern}')
 for m in list(re.finditer(pattern,text,re.I))[:80]:
  p=m.start();ls=text.rfind('\n',0,max(0,p-1200));le=text.find('\n',min(len(text),p+2600));
  if ls<0:ls=max(0,p-1200)
  if le<0:le=min(len(text),p+2600)
  out.append(f'-- L{text.count(chr(10),0,p)+1} --\n{text[ls+1:le]}')
Path('audit206-aiapi.txt').write_text('\n'.join(out),'utf-8')
print(Path('audit206-aiapi.txt').stat().st_size)
