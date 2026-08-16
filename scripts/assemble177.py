from pathlib import Path
from urllib.request import Request, urlopen
from concurrent.futures import ThreadPoolExecutor, as_completed
import json, os, re, time

BASE=os.environ.get('BASE_URL','https://frontline-dominion.leonardjones2017.chatgpt.site').rstrip('/')
OUT=Path('dist'); OUT.mkdir(parents=True,exist_ok=True)
UA='Mozilla/5.0 FrontlineDominion-GitHubPages/177'

def fetch(ref):
    clean=ref.split('?',1)[0].lstrip('/')
    dst=OUT/clean
    if dst.exists() and dst.stat().st_size: return dst
    dst.parent.mkdir(parents=True,exist_ok=True)
    last=None; url=BASE+'/'+ref.lstrip('/')
    for attempt in range(5):
        try:
            with urlopen(Request(url,headers={'User-Agent':UA,'Cache-Control':'no-cache'}),timeout=180) as r: data=r.read()
            dst.write_bytes(data); return dst
        except Exception as exc:
            last=exc; time.sleep(min(8,1.6**attempt))
    raise RuntimeError(f'{url}: {last}')

html=fetch('frontline-dominion.html?build=175')
jsref=re.compile(r'''["']/(?!/)([A-Za-z0-9_.-]+\.js(?:\?[^"']*)?)''')
queue=list(dict.fromkeys(jsref.findall(html.read_text('utf-8',errors='replace'))))
queue += [
 'authoritative-simulation-v174.js?build=174',
 'authoritative-simulation-worker-v174.js?build=174',
 'authoritative-simulation-shim-v172.js?build=172',
 'authoritative-simulation-bundle-v172.js?build=172',
 'mass-simulation-core-v163.js?build=173',
 'hierarchical-army-v164.js?build=174',
 'multiplayer-game-v96.js?build=158',
]
seen=set()
while queue:
    ref=queue.pop(0); clean=ref.split('?',1)[0]
    if clean in seen: continue
    seen.add(clean); p=fetch(ref)
    for dep in jsref.findall(p.read_text('utf-8',errors='replace')):
        if dep.split('?',1)[0] not in seen: queue.append(dep)

manifest=fetch('models/pilot/manifest.json?build=175')
spec=json.loads(manifest.read_text('utf-8')); assets=set()
for model in spec.get('models',[]):
    for lod in model.get('lods',[]):
        if lod.get('uri'): assets.add(lod['uri'].split('?',1)[0].lstrip('/'))
    sprite=(model.get('canvasSprite') or {}).get('uri')
    if sprite: assets.add(sprite.split('?',1)[0].lstrip('/'))
with ThreadPoolExecutor(max_workers=20) as pool:
    futures=[pool.submit(fetch,p) for p in sorted(assets)]
    for i,f in enumerate(as_completed(futures),1):
        f.result()
        if i%100==0: print(f'assets {i}/{len(futures)}')
for extra in ('file.svg','globe.svg'):
    try: fetch(extra)
    except Exception as exc: print('optional',extra,exc)

p=OUT/'frontline-dominion.html'; s=p.read_text('utf-8')
s=re.sub(r'<title>.*?</title>','<title>Frontline Dominion v16.4.2 — Fire Discipline</title>',s,count=1,flags=re.S)
if 'fire-discipline-v177.js?build=177' not in s:
    s=re.sub(r'(<script src="/multiplayer-game-v96\.js[^\"]*"></script>)','<script src="/fire-discipline-v177.js?build=177"></script>\n\\1',s,count=1)
if 'minimap-stability-v176.js?build=176' not in s:
    s=re.sub(r'(<script src="/authoritative-simulation-v174\.js[^\"]*"></script>)','<script src="/fire-discipline-v177.js?build=177"></script>\n\\1\n<script src="/minimap-stability-v176.js?build=176"></script>',s,count=1)
s=re.sub(r'/authoritative-simulation-v174\.js\?build=\d+','/authoritative-simulation-v174.js?build=177',s)
s=re.sub(r'/multiplayer-game-v96\.js\?build=\d+','/multiplayer-game-v96.js?build=177',s)
p.write_text(s,'utf-8')

p=OUT/'authoritative-simulation-v174.js'; s=p.read_text('utf-8')
s=re.sub(r"new Worker\('/authoritative-simulation-worker-v174\.js\?build=\d+'\)","new Worker('/authoritative-simulation-worker-v174.js?build=177')",s,count=1)
anchor="wrapGameAction('issueHold', 'hold', () => ({}));"
addition="""\nwrapGameAction('issueFireDiscipline177', 'fireDiscipline177', function([mode]) {\n  const units = this.getSelectedUnits?.().filter(unit => unit?.stats?.weapon) || [];\n  if (!units.length) return null;\n  const resolved = mode === 'hold' || mode === 'free' ? mode : (units.every(unit => unit.fireDiscipline177 === 'hold') ? 'free' : 'hold');\n  return { mode: resolved };\n}, { present(payload) {\n  const units = this.getSelectedUnits?.().filter(unit => unit?.stats?.weapon) || [];\n  for (const unit of units) unit.fireDiscipline177 = payload.mode;\n  this.uiDirty = true;\n  if (this.uiCache) this.uiCache.commandKey = '';\n  this.cancelModes?.();\n  this.alert?.(payload.mode === 'hold' ? `Огонь запрещён · ${units.length} ед.` : `Огонь разрешён · ${units.length} ед.`, 'info');\n} });"""
if "wrapGameAction('issueFireDiscipline177'" not in s: s=s.replace(anchor,anchor+addition,1)
p.write_text(s,'utf-8')

p=OUT/'authoritative-simulation-worker-v174.js'; s=p.read_text('utf-8')
if "importScripts('/fire-discipline-v177.js?build=177');" not in s:
    marker="importScripts('/hierarchical-army-v164.js?build=174');"
    s=s.replace(marker,marker+"\nimportScripts('/fire-discipline-v177.js?build=177');",1)
if "case 'fireDiscipline177'" not in s:
    s=s.replace("case 'hold': result = game.issueHold(); break;","case 'hold': result = game.issueHold(); break;\n      case 'fireDiscipline177': result = game.issueFireDiscipline177?.(payload.mode); break;",1)
p.write_text(s,'utf-8')

p=OUT/'multiplayer-game-v96.js'; s=p.read_text('utf-8')
if "selectionCommand('issueFireDiscipline177'" not in s:
    s=s.replace("selectionCommand('issueHold', 'hold', () => ({}));","selectionCommand('issueHold', 'hold', () => ({}));\n  selectionCommand('issueFireDiscipline177', 'fireDiscipline177', ([mode]) => ({ mode: mode === 'free' ? 'free' : mode === 'hold' ? 'hold' : null }));",1)
if "case 'fireDiscipline177'" not in s:
    s=s.replace("case 'hold': return originals.issueHold?.call(game);","case 'hold': return originals.issueHold?.call(game);\n          case 'fireDiscipline177': return originals.issueFireDiscipline177?.call(game, p.mode);",1)
p.write_text(s,'utf-8')

for name in ('fire-discipline-v177.js','minimap-stability-v176.js'):
    (OUT/name).write_bytes((Path('overrides')/name).read_bytes())

prefix='/frontline-dominion/'
root_js=re.compile(r"([\"'])/(?!/|%)([A-Za-z0-9_.-]+\.js(?:\?[^\"']*)?)")
for file in OUT.rglob('*'):
    if not file.is_file() or file.suffix.lower() not in {'.html','.js','.json','.svg'}: continue
    try: t=file.read_text('utf-8')
    except UnicodeDecodeError: continue
    u=t.replace("'/models/",f"'{prefix}models/").replace('"/models/',f'"{prefix}models/')
    u=root_js.sub(lambda m:m.group(1)+prefix+m.group(2),u)
    if u!=t: file.write_text(u,'utf-8')

(OUT/'index.html').write_text('<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Frontline Dominion v16.4.2</title><meta http-equiv="refresh" content="0; url=./frontline-dominion.html?build=177"></head><body><a href="./frontline-dominion.html?build=177">Запустить Frontline Dominion v16.4.2</a></body></html>','utf-8')
(OUT/'.nojekyll').touch()
print('JS',len(seen),'assets',len(assets))
