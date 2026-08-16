from pathlib import Path
import hashlib,re,subprocess
R=Path(__file__).resolve().parents[1]; O=R/'dist'
def rep(s,a,b,label):
    if a not in s: raise RuntimeError('v16.6 anchor missing: '+label)
    return s.replace(a,b,1)
subprocess.run(['python','scripts/assemble165.py'],cwd=R,check=True)
parts=[f'combat166.js.{index}' for index in range(8)]
combat=''.join((R/'scripts'/name).read_text('utf-8') for name in parts).encode('utf-8')
if hashlib.sha256(combat).hexdigest()!='b3d68fe458e964b05b65823079ea4673538fc044e054eb5fb811df4eabbfa108':
    raise RuntimeError('v16.6 combat module checksum mismatch')
(O/'combat-scale-core-v166.js').write_bytes(combat)

p=O/'frontline-dominion.html'; s=p.read_text('utf-8')
s=re.sub(r'<title>.*?</title>','<title>Frontline Dominion v16.6 — Combat Scale Core</title>',s,count=1,flags=re.S)
s=re.sub(r'((?:/|\./|/frontline-dominion/)?authoritative-simulation-v174\.js)\?build=\d+',r'\1?build=180',s)
tag=re.compile(r'<script[^>]+src=["\'][^"\']*stable-state-core-v165\.js\?build=\d+[^"\']*["\'][^>]*></script>')
new='<script src="./combat-scale-core-v166.js?build=180"></script>\n<script src="./simulation-profiler-v166.js?build=180"></script>'
if tag.search(s): s=tag.sub(new,s,count=1)
elif 'combat-scale-core-v166.js?build=180' not in s: s=s.replace('</body>','\n'+new+'\n</body>',1)
p.write_text(s,'utf-8')

p=O/'authoritative-simulation-v174.js'; s=p.read_text('utf-8')
s=rep(s,'const BUILD = 179;','const BUILD = 180;','main build')
s=rep(s,"const VERSION = '16.5';","const VERSION = '16.6';",'main version')
s=re.sub(r"new Worker\('/frontline-dominion/authoritative-simulation-worker-v174\.js\?build=\d+'\)","new Worker('/frontline-dominion/authoritative-simulation-worker-v174.js?build=180')",s,count=1)
p.write_text(s,'utf-8')

p=O/'authoritative-simulation-worker-v174.js'; s=p.read_text('utf-8')
s=rep(s,'const BUILD = 179;','const BUILD = 180;','worker build')
s=rep(s,"const VERSION = '16.5';","const VERSION = '16.6';",'worker version')
s=re.sub(r'/authoritative-simulation-bundle-v172\.js\?build=\d+','/authoritative-simulation-bundle-v172.js?build=180',s,count=1)
imp="importScripts('/frontline-dominion/combat-scale-core-v166.js?build=180');"
if imp not in s:
    a="importScripts('/frontline-dominion/fire-discipline-v177.js?build=177');"; s=rep(s,a,a+'\n'+imp,'worker import')
a="transport165: sharedSlot165 >= 0 ? 'shared-triple' : 'transfer-fallback'"
s=rep(s,a,a+", combat166: game.combatScaleDiagnostics166?.() || null",'worker perf')
a="performance: { ticksExecuted, averageTickMs: ticksExecuted ? totalTickMs / ticksExecuted : 0, maxTickMs, actionQueue: actionQueue.length }"
b="performance: { ticksExecuted, averageTickMs: ticksExecuted ? totalTickMs / ticksExecuted : 0, maxTickMs, actionQueue: actionQueue.length, combat166: game?.combatScaleDiagnostics166?.() || null }"
s=rep(s,a,b,'worker diagnostics'); p.write_text(s,'utf-8')

old=O/'stable-state-core-v165.js'; s=old.read_text('utf-8')
s=rep(s,"const VERSION = '16.5';","const VERSION = '16.6';",'profiler version')
s=rep(s,'const BUILD = 179;','const BUILD = 180;','profiler build')
s=rep(s,'      state, bridge, perf, game, counts,','      state, bridge, perf, game, counts, combat: perf.combat166 || game?.combatScaleDiagnostics166?.() || {},','profiler snapshot')
a='      `Projectiles           ${int(s.projectiles)}`,'
b='''      `Projectiles           ${int(s.projectiles)}`,
      `Combat cells          ${int(s.combat?.combatCells)} · indexed ${int(s.combat?.indexedUnits)}`,
      `Target queries        ${int(s.combat?.targetQueries)} · cache ${int(s.combat?.targetCacheHits)}`,
      `Fire-control groups   ${int(s.combat?.fireControlBuilds)} · reused ${int(s.combat?.fireControlHits)}`,
      `Candidate checks      ${int(s.combat?.candidateChecks)} · fallback ${int(s.combat?.fallbackQueries)}`,
      `Virtual small arms    ${int(s.combat?.virtualShots)} · hits ${int(s.combat?.virtualHits)}`,
      `Projectiles avoided   ${int(s.combat?.physicalProjectilesAvoided)}`,
      `Damage events/batches ${int(s.combat?.damageEvents)} / ${int(s.combat?.damageBatches)}`,
      `Combat ms last        cell ${fmt(s.combat?.lastIndexMs)} · target ${fmt(s.combat?.lastTargetingMs)} · batch ${fmt(s.combat?.lastBatchMs)}`,'''
s=rep(s,a,b,'profiler lines').replace('window.__FD_PROFILER165__','window.__FD_PROFILER166__').replace('fd-profiler-v165','fd-profiler-v166').replace('Stable frame:','Stable state:')
(O/'simulation-profiler-v166.js').write_text(s,'utf-8'); old.unlink()
(O/'index.html').write_text('<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Frontline Dominion v16.6</title><meta http-equiv="refresh" content="0; url=./frontline-dominion.html?build=180"></head><body><a href="./frontline-dominion.html?build=180">Запустить Frontline Dominion v16.6</a></body></html>','utf-8')
print('Combat Scale Core v16.6 build 180 assembled')
