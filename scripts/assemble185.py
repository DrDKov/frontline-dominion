from pathlib import Path
import re, runpy

ROOT=Path('.'); OUT=ROOT/'dist'; VERSION='16.8.1'; BUILD=185
if not (OUT/'frontline-dominion.html').exists():
    runpy.run_path('scripts/assemble184.py', run_name='__main__')

runtime_src=ROOT/'src'/'v185'/'runtime-ui-v185.js'
if not runtime_src.exists(): raise RuntimeError('runtime UI source missing')
(OUT/'runtime-ui-v185.js').write_text(runtime_src.read_text('utf-8'),'utf-8')

html_path=OUT/'frontline-dominion.html'
html=html_path.read_text('utf-8')
html=re.sub(r'\s*<script[^>]+src=["\']\./(?:action-group-core-v184|construction-victory-v184|start-screen-stable-v184)\.js\?build=\d+["\'][^>]*></script>','',html,flags=re.I)
html=re.sub(r'\s*<script[^>]+src=["\']\./runtime-ui-v185\.js\?build=\d+["\'][^>]*></script>','',html,flags=re.I)
html=re.sub(r'<title>.*?</title>','<title>Frontline Dominion v16.8.1 — Runtime Isolation</title>',html,count=1,flags=re.S)
m=re.search(r'<script src=["\']\./simulation-profiler-v166\.js\?build=\d+["\']></script>',html)
if not m: raise RuntimeError('profiler tag missing')
html=html[:m.start()]+'<script src="./runtime-ui-v185.js?build=185"></script>\n<script src="./simulation-profiler-v166.js?build=185"></script>'+html[m.end():]
html=re.sub(r'(authoritative-simulation-v174\.js)\?build=\d+',r'\1?build=185',html)
html_path.write_text(html,'utf-8')

p=OUT/'construction-victory-v184.js'
s=p.read_text('utf-8')
old="""  Game.prototype.constructionVictoryDiagnostics184 = function() {
    const pending = pendingBuildings184(this, 'enemy');
    return {
      version: VERSION, build: BUILD, ...stats184,
      pending: pending.length,
      pendingSensors: pending.filter(building => role184(building) === 'sensor').length,
      caps: constructionCaps184(this),
      objective: 'capture-command-center',
      winner: this._hqWinner184 || null,
      captureResolved: Boolean(this._hqCaptureResolved184),
    };
  };"""
new="""  Game.prototype.constructionVictoryDiagnostics184 = function() {
    const pending = pendingBuildings184(this, 'enemy');
    const enemyHQ = hqFor184(this, 'enemy');
    return {
      version: '16.8.1', build: 185, ...stats184,
      pending: pending.length,
      pendingSensors: pending.filter(building => role184(building) === 'sensor').length,
      caps: constructionCaps184(this),
      objective: 'capture-command-center',
      winner: this._hqWinner184 || null,
      captureResolved: Boolean(this._hqCaptureResolved184),
      captureProgress: finite(enemyHQ?.captureProgress184, 0),
      commandCenterId: enemyHQ?.id || null,
    };
  };"""
if old not in s: raise RuntimeError('objective diagnostics anchor missing')
p.write_text(s.replace(old,new,1),'utf-8')

p=OUT/'authoritative-simulation-v174.js'; s=p.read_text('utf-8')
s,n=re.subn(r"const BUILD = 184;\nconst VERSION = '16\.8';","const BUILD = 185;\nconst VERSION = '16.8.1';",s,count=1)
if n!=1: raise RuntimeError('bridge version anchor missing')
s=re.sub(r"new Worker\('/frontline-dominion/authoritative-simulation-worker-v174\.js\?build=\d+'\)","new Worker('/frontline-dominion/authoritative-simulation-worker-v174.js?build=185')",s,count=1)
s=s.replace("window.__FD_STABLE_STATE165__ = { version: '16.8', build: 184, bridge: this, transport: this.transportMode165, counts: {} };","window.__FD_STABLE_STATE165__ = { version: '16.8.1', build: 185, bridge: this, transport: this.transportMode165, counts: {} };")
p.write_text(s,'utf-8')

p=OUT/'authoritative-simulation-worker-v174.js'; s=p.read_text('utf-8')
s,n=re.subn(r"const BUILD = 184;\nconst VERSION = '16\.8';","const BUILD = 185;\nconst VERSION = '16.8.1';",s,count=1)
if n!=1: raise RuntimeError('worker version anchor missing')
for tag in ["importScripts('/frontline-dominion/action-group-core-v184.js?build=184');","importScripts('/frontline-dominion/construction-victory-v184.js?build=184');"]:
    if tag not in s: raise RuntimeError('worker import missing '+tag)
p.write_text(s,'utf-8')

p=OUT/'simulation-profiler-v166.js'; s=p.read_text('utf-8')
s=s.replace("const VERSION = '16.8';\n  const BUILD = 184;","const VERSION = '16.8.1';\n  const BUILD = 185;",1)
p.write_text(s,'utf-8')

launcher="""<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Frontline Dominion v16.8.1</title><style>
*{box-sizing:border-box}html,body{margin:0;min-height:100%;background:#050b10;color:#dcecf4;font-family:system-ui,sans-serif}
body{display:grid;place-items:center;min-height:100vh;padding:24px;background:#071019}
main{width:min(720px,100%);padding:36px;border:1px solid #365363;border-radius:18px;background:#0a151d}
a{display:inline-flex;min-height:54px;align-items:center;padding:0 24px;border-radius:10px;background:#d9edf7;color:#071019;text-decoration:none;font-weight:900}
</style></head><body><main>
<div>ЕДИНСТВЕННАЯ АКТУАЛЬНАЯ СБОРКА · BUILD 185</div><h1>Frontline Dominion</h1>
<p>Runtime Isolation: групповая симуляция и захват штаба — только в authoritative Worker; главный поток отвечает за UI и облегчённый рендер.</p>
<a id="launch" href="./frontline-dominion.html?build=185">Запустить игру</a><p>v16.8.1 · build 185 · GitHub Pages</p>
</main></body></html>"""
(OUT/'index.html').write_text(launcher,'utf-8')
print('Frontline Dominion v16.8.1 build 185 assembled')
