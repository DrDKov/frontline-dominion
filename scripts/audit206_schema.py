from pathlib import Path

p=Path('dist/authoritative-simulation-bundle-v172.js')
text=p.read_text('utf-8',errors='replace')
needles=['const BUILD_CATEGORIES','BUILD_CATEGORIES =','const BUILDING_TYPES','BUILDING_TYPES =','class Unit','moveToward(','processMove(','serialize(){','hydrate(data)','class Building','placeBuilding(','queueProduction(']
out=['BUILD206 SCHEMA AUDIT']
for needle in needles:
    out.append(f'\n## {needle}')
    low=text.lower(); nl=needle.lower(); cur=0; n=0
    while n<8:
        pos=low.find(nl,cur)
        if pos<0: break
        n+=1; cur=pos+len(nl)
        ls=text.rfind('\n',0,max(0,pos-3000)); le=text.find('\n',min(len(text),pos+5000))
        if ls<0: ls=max(0,pos-3000)
        if le<0: le=min(len(text),pos+5000)
        out.append(f'-- occurrence {n}, line {text.count(chr(10),0,pos)+1}, offset {pos} --')
        out.append(text[ls+1:le])
Path('audit206-schema.txt').write_text('\n'.join(out),'utf-8')
print('audit206-schema.txt',Path('audit206-schema.txt').stat().st_size)
