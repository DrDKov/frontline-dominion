from pathlib import Path
import re, runpy

ROOT = Path('.')
OUT = ROOT / 'dist'
VERSION = '16.8.2'
BUILD = 186

if not (OUT / 'frontline-dominion.html').exists():
    runpy.run_path('scripts/assemble185.py', run_name='__main__')


def replace_once(text, old, new, label):
    if old not in text:
        raise RuntimeError(f'build 186 patch anchor missing: {label}')
    return text.replace(old, new, 1)

# UI: one synchronous owner of the objective text. No interval fighting the legacy UI.
runtime_src = ROOT / 'src' / 'v186' / 'runtime-ui-v186.js'
if not runtime_src.exists():
    raise RuntimeError('runtime UI v186 source missing')
(OUT / 'runtime-ui-v186.js').write_text(runtime_src.read_text('utf-8'), 'utf-8')

html_path = OUT / 'frontline-dominion.html'
html = html_path.read_text('utf-8')
html = re.sub(r'\s*<script[^>]+src=["\']\./runtime-ui-v185\.js\?build=\d+["\'][^>]*></script>', '', html, flags=re.I)
html = re.sub(r'\s*<script[^>]+src=["\']\./runtime-ui-v186\.js\?build=\d+["\'][^>]*></script>', '', html, flags=re.I)
html = re.sub(r'<title>.*?</title>', '<title>Frontline Dominion v16.8.2 — Command Recovery</title>', html, count=1, flags=re.S)
prof = re.search(r'<script src=["\']\./simulation-profiler-v166\.js\?build=\d+["\']></script>', html)
if not prof:
    raise RuntimeError('profiler tag missing')
html = html[:prof.start()] + '<script src="./runtime-ui-v186.js?build=186"></script>\n<script src="./simulation-profiler-v166.js?build=186"></script>' + html[prof.end():]
html = re.sub(r'(authoritative-simulation-v174\.js)\?build=\d+', r'\1?build=186', html)
html_path.write_text(html, 'utf-8')

# Main bridge: live UI pause state is authoritative. Every real action carries a resume hint
# so a stale paused Worker from an old save cannot swallow commands forever.
p = OUT / 'authoritative-simulation-v174.js'
s = p.read_text('utf-8')
s = replace_once(s, "const BUILD = 185;\nconst VERSION = '16.8.1';", "const BUILD = 186;\nconst VERSION = '16.8.2';", 'bridge version')
s, n = re.subn(r"new Worker\('/frontline-dominion/authoritative-simulation-worker-v174\.js\?build=\d+'\)", "new Worker('/frontline-dominion/authoritative-simulation-worker-v174.js?build=186')", s, count=1)
if n != 1:
    raise RuntimeError('bridge worker URL anchor missing')
s = s.replace("window.__FD_STABLE_STATE165__ = { version: '16.8.1', build: 185, bridge: this, transport: this.transportMode165, counts: {} };", "window.__FD_STABLE_STATE165__ = { version: '16.8.2', build: 186, bridge: this, transport: this.transportMode165, counts: {} };")
ready_old = """      this.worker.postMessage({ type: 'multiplayer', multiplayer: this.multiplayerState() });
      const hostTick = window.__FD_MULTIPLAYER__?.hostTick;"""
ready_new = """      // Reconcile Worker pause from the live UI state. Persisted pause flags are never authoritative.
      this.worker.postMessage({ type: 'pause', paused: Boolean(this.game?.paused) });
      this.worker.postMessage({ type: 'multiplayer', multiplayer: this.multiplayerState() });
      const hostTick = window.__FD_MULTIPLAYER__?.hostTick;"""
s = replace_once(s, ready_old, ready_new, 'bridge ready pause sync')
action_old = """      type: 'action', seq, atTick: Math.max(this.workerTick + 1, finite(this.game.simTick) + 1),
      action, payload: clonePlain(payload), selectedIds: ids
"""
action_new = """      type: 'action', seq, atTick: Math.max(this.workerTick + 1, finite(this.game.simTick) + 1),
      action, payload: clonePlain(payload), selectedIds: ids,
      resumeIfMainRunning: !Boolean(this.game?.paused)
"""
s = replace_once(s, action_old, action_new, 'bridge action resume hint')
p.write_text(s, 'utf-8')

# Worker: do not resurrect a saved pause flag. If main UI is running and a command arrives,
# self-heal a stale pause before queuing that command.
p = OUT / 'authoritative-simulation-worker-v174.js'
s = p.read_text('utf-8')
s = replace_once(s, "const BUILD = 185;\nconst VERSION = '16.8.1';", "const BUILD = 186;\nconst VERSION = '16.8.2';", 'worker version')
s = replace_once(s, "  paused = Boolean(extension.paused || message.paused);", "  paused = Boolean(message.paused);", 'worker init pause source')
s = replace_once(s, "    paused: Boolean(paused),", "    paused: false,", 'saved authoritative pause')
action_case_old = """      case 'action': {
        actionSequence = Math.max(actionSequence, message.seq || 0);"""
action_case_new = """      case 'action': {
        if (message.resumeIfMainRunning && paused && !game?.ended) {
          paused = false;
          if (game) game.paused = false;
          nextTickAt = performance.now();
        }
        actionSequence = Math.max(actionSequence, message.seq || 0);"""
s = replace_once(s, action_case_old, action_case_new, 'worker action pause recovery')
p.write_text(s, 'utf-8')

# Profiler/version metadata.
p = OUT / 'simulation-profiler-v166.js'
s = p.read_text('utf-8')
s = s.replace("const VERSION = '16.8.1';\n  const BUILD = 185;", "const VERSION = '16.8.2';\n  const BUILD = 186;", 1)
p.write_text(s, 'utf-8')

launcher = """<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Frontline Dominion v16.8.2</title><style>
*{box-sizing:border-box}html,body{margin:0;min-height:100%;background:#050b10;color:#dcecf4;font-family:system-ui,sans-serif}
body{display:grid;place-items:center;min-height:100vh;padding:24px;background:#071019}
main{width:min(720px,100%);padding:36px;border:1px solid #365363;border-radius:18px;background:#0a151d}
a{display:inline-flex;min-height:54px;align-items:center;padding:0 24px;border-radius:10px;background:#d9edf7;color:#071019;text-decoration:none;font-weight:900}
</style></head><body><main>
<div>ЕДИНСТВЕННАЯ АКТУАЛЬНАЯ СБОРКА · BUILD 186</div><h1>Frontline Dominion</h1>
<p>Command Recovery: исправлена рассинхронизация паузы Worker, восстановлено выполнение приказов и производства после старых сохранений, цель захвата больше не показывает число зданий.</p>
<a id="launch" href="./frontline-dominion.html?build=186">Запустить игру</a><p>v16.8.2 · build 186 · GitHub Pages</p>
</main></body></html>"""
(OUT / 'index.html').write_text(launcher, 'utf-8')
print('Frontline Dominion v16.8.2 build 186 assembled')
