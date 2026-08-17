from pathlib import Path
import re

ROOT = Path('.')
OUT = ROOT / 'dist'
VERSION = '16.8.7'
BUILD = 191


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise RuntimeError(f'build 191 patch anchor missing: {label}')
    return text.replace(old, new, 1)


required = [
    OUT / 'frontline-dominion.html',
    OUT / 'model-pilot-v101.js',
    OUT / 'authoritative-simulation-v174.js',
    OUT / 'authoritative-simulation-worker-v174.js',
    ROOT / 'src' / 'v191' / 'engineer-rocket-parity-v191.js',
    ROOT / 'src' / 'v191' / 'command-watchdog-v191.js',
    ROOT / 'src' / 'v190' / 'runtime-shell-v190.js',
]
for path in required:
    if not path.exists():
        raise RuntimeError(f'build 191 required file missing: {path}')

for source_name in ('engineer-rocket-parity-v191.js', 'command-watchdog-v191.js'):
    (OUT / source_name).write_text((ROOT / 'src' / 'v191' / source_name).read_text('utf-8'), 'utf-8')

# Canonical shell/UI are generated from the last stable owners, with a clean
# build namespace so no previous launch handler can remain active.
shell = (ROOT / 'src' / 'v190' / 'runtime-shell-v190.js').read_text('utf-8')
shell = shell.replace("const VERSION = '16.8.6';", f"const VERSION = '{VERSION}';", 1)
shell = shell.replace('const BUILD = 190;', f'const BUILD = {BUILD};', 1)
shell = shell.replace('__FD_RUNTIME_SHELL_190__', '__FD_RUNTIME_SHELL_191__')
shell = shell.replace('__FD_BOOT_190__', '__FD_BOOT_191__')
shell = shell.replace('[FD190]', '[FD191]')
shell = shell.replace('fd-loading190', 'fd-loading191').replace('fd-ready190', 'fd-ready191').replace('fd-running190', 'fd-running191')
(OUT / 'runtime-shell-v191.js').write_text(shell, 'utf-8')

ui_source = OUT / 'runtime-ui-v190.js'
if not ui_source.exists():
    ui_source = OUT / 'runtime-ui-v189.js'
ui = ui_source.read_text('utf-8')
ui = re.sub(r"const VERSION = '16\.8\.[56]';", f"const VERSION = '{VERSION}';", ui, count=1)
ui = re.sub(r'const BUILD = (?:189|190);', f'const BUILD = {BUILD};', ui, count=1)
ui = ui.replace('__FD_RUNTIME_UI_189__', '__FD_RUNTIME_UI_191__').replace('__FD_RUNTIME_UI_190__', '__FD_RUNTIME_UI_191__')
ui = ui.replace('[FD189]', '[FD191]').replace('[FD190]', '[FD191]')
(OUT / 'runtime-ui-v191.js').write_text(ui, 'utf-8')

# ---------------------------------------------------------------------------
# Model rendering: retain the full catalog-building recovery from build 190,
# but replace its ineffective engineer hook with the build 191 rocket-equivalent
# geometry owner. All model assets receive the same cache generation.
# ---------------------------------------------------------------------------
model_path = OUT / 'model-pilot-v101.js'
model = model_path.read_text('utf-8')
model = model.replace("const VERSION = '12.5';", "const VERSION = '12.6';", 1)
model = model.replace('getInfantryRenderGeometry190', 'getInfantryRenderGeometry191')
model = re.sub(
    r"const MANIFEST_URL = '/frontline-dominion/models/pilot/manifest\.json\?build=\d+';",
    f"const MANIFEST_URL = '/frontline-dominion/models/pilot/manifest.json?build={BUILD}';",
    model,
    count=1,
)
model = re.sub(r'(models/(?:pilot|canvas)/[^\s\'"`)]+)\?build=\d+', rf'\1?build={BUILD}', model)
model_path.write_text(model, 'utf-8')

for relative in ('unit-footprints-v115.js', 'unit-formation-refinement-v138.js', 'sprite-scale-v123.js'):
    path = OUT / relative
    if not path.exists():
        continue
    text = path.read_text('utf-8')
    text = re.sub(r'(models/(?:pilot|canvas)/[^\s\'"`)]+)\?build=\d+', rf'\1?build={BUILD}', text)
    path.write_text(text, 'utf-8')

# ---------------------------------------------------------------------------
# Authoritative simulation: start from build 190 but remove its broad runtime
# stability module from the Worker. The known-good command bridge remains, and
# only the side-effect-free engineer geometry module is loaded before Game init.
# ---------------------------------------------------------------------------
bridge_path = OUT / 'authoritative-simulation-v174.js'
bridge = bridge_path.read_text('utf-8')
bridge = re.sub(r'const BUILD = \d+;', f'const BUILD = {BUILD};', bridge, count=1)
bridge = re.sub(r"const VERSION = '16\.8\.[0-9]+';", f"const VERSION = '{VERSION}';", bridge, count=1)
bridge = re.sub(
    r"new Worker\('/frontline-dominion/authoritative-simulation-worker-v174\.js\?build=\d+'\)",
    f"new Worker('/frontline-dominion/authoritative-simulation-worker-v174.js?build={BUILD}')",
    bridge,
    count=1,
)
bridge = re.sub(r"version: '16\.8\.[0-9]+', build: \d+", f"version: '{VERSION}', build: {BUILD}", bridge)
bridge_path.write_text(bridge, 'utf-8')

worker_path = OUT / 'authoritative-simulation-worker-v174.js'
worker = worker_path.read_text('utf-8')
worker = re.sub(
    r"\s*importScripts\('/frontline-dominion/(?:engineer-infantry-parity-v189|runtime-stability-v190|engineer-rocket-parity-v191)\.js(?:\?build=\d+)?'\);",
    '',
    worker,
)
bundle = re.search(r"importScripts\('/frontline-dominion/authoritative-simulation-bundle-v172\.js\?build=\d+'\);", worker)
if not bundle:
    raise RuntimeError('build 191 Worker bundle import missing')
worker = worker.replace(
    bundle.group(0),
    bundle.group(0) + f"\nimportScripts('/frontline-dominion/engineer-rocket-parity-v191.js?build={BUILD}');",
    1,
)
worker = re.sub(r'const BUILD = \d+;', f'const BUILD = {BUILD};', worker, count=1)
worker = re.sub(r"const VERSION = '16\.8\.[0-9]+';", f"const VERSION = '{VERSION}';", worker, count=1)
worker = re.sub(
    r"(importScripts\('/frontline-dominion/[^']+\.js)\?build=\d+('\);)",
    rf"\1?build={BUILD}\2",
    worker,
)
worker_path.write_text(worker, 'utf-8')

for relative in ('formation-march-core-v183.js', 'simulation-profiler-v166.js'):
    path = OUT / relative
    if not path.exists():
        continue
    text = path.read_text('utf-8')
    text = re.sub(r"const VERSION = '16\.8\.[0-9]+';", f"const VERSION = '{VERSION}';", text, count=1)
    text = re.sub(r'const BUILD = \d+;', f'const BUILD = {BUILD};', text, count=1)
    path.write_text(text, 'utf-8')

# Every internal JS, manifest and atlas URL belongs to one immutable generation.
asset_pattern = re.compile(r"(/frontline-dominion/[^\s\'\"`)]+\.(?:js|json|webp))\?build=\d+")
for path in sorted(OUT.glob('*.js')):
    text = path.read_text('utf-8')
    text = asset_pattern.sub(rf'\1?build={BUILD}', text)
    path.write_text(text, 'utf-8')

# ---------------------------------------------------------------------------
# One HTML boot owner, one command bridge, one engineer-size owner.
# ---------------------------------------------------------------------------
html_path = OUT / 'frontline-dominion.html'
html = html_path.read_text('utf-8')
html = re.sub(
    r'\s*<script[^>]+src=["\'](?:\./|/frontline-dominion/)(?:engineer-infantry-parity-v189|runtime-stability-v190|engineer-rocket-parity-v191|command-watchdog-v191|runtime-ui-v18[5-9]|runtime-ui-v19[01]|runtime-shell-v18[7-9]|runtime-shell-v19[01])\.js(?:\?build=\d+)?["\'][^>]*></script>',
    '',
    html,
    flags=re.I,
)
html = re.sub(r'<script id="fd-boot(?:189|190)-script">.*?</script>', '', html, flags=re.S)
html = re.sub(r'<style id="fd-boot(?:189|190)-style">.*?</style>', '', html, flags=re.S)
html = re.sub(r'<title>.*?</title>', f'<title>Frontline Dominion v{VERSION} — Command & Scale Recovery</title>', html, count=1, flags=re.S)

canonical_eyebrow = f'ОПЕРАТИВНО-ТАКТИЧЕСКАЯ RTS · v{VERSION} BUILD {BUILD}'
canonical_lead = 'Восстановлено выполнение приказов; инженер физически и визуально равен ракетчику, включая выделение и индикаторы.'
features = [
    'Реальные приказы через canvas',
    'Authoritative Worker 25 Гц',
    'Инженер = ракетчик по размеру',
    'Единая область выделения',
    'Полный рендер рудника',
    'Надёжная загрузка сохранения',
]
feature_html = ''.join(f'<span>{label}</span>' for label in features)
html, count = re.subn(
    r'(<div id=["\']start-screen["\'][^>]*>.*?<div class=["\']eyebrow["\']>).*?(</div>)',
    rf'\1{canonical_eyebrow}\2',
    html,
    count=1,
    flags=re.S,
)
if count != 1:
    raise RuntimeError('build 191 start eyebrow patch failed')
html, count = re.subn(r'(<p class=["\']lead["\']>).*?(</p>)', rf'\1{canonical_lead}\2', html, count=1, flags=re.S)
if count != 1:
    raise RuntimeError('build 191 start lead patch failed')
html, count = re.subn(
    r'<div class=["\']feature-strip["\'][^>]*>.*?</div>',
    f'<div class="feature-strip" data-fd-canonical-build="{BUILD}">{feature_html}</div>',
    html,
    count=1,
    flags=re.S,
)
if count != 1:
    raise RuntimeError('build 191 feature strip patch failed')
html, count = re.subn(
    r'(<button id=["\']start-game["\'][^>]*)(>).*?(</button>)',
    r'\1 disabled aria-disabled="true"\2ЗАГРУЗКА…\3',
    html,
    count=1,
    flags=re.S,
)
if count != 1:
    raise RuntimeError('build 191 start button patch failed')

boot_script = f'''<script id="fd-boot191-script">
(() => {{
  const VERSION = '{VERSION}', BUILD = {BUILD};
  const FEATURES = {features!r};
  const state = {{ ready: false, launching: false, loadAvailable: false, stopped: false }};
  const config = {{ childList: true, subtree: true, characterData: true }};
  let observer = null;
  const apply = () => {{
    if (state.stopped) return;
    observer?.disconnect();
    const start = document.getElementById('start-screen');
    const button = document.getElementById('start-game');
    const load = document.getElementById('load-game');
    if (start) {{
      const eyebrow = start.querySelector('.eyebrow');
      const lead = start.querySelector('.lead');
      const strip = start.querySelector('.feature-strip');
      if (eyebrow) eyebrow.textContent = '{canonical_eyebrow}';
      if (lead) lead.textContent = '{canonical_lead}';
      if (strip && strip.dataset.fdCanonicalBuild !== String(BUILD)) {{
        strip.replaceChildren(...FEATURES.map(label => {{ const span = document.createElement('span'); span.textContent = label; return span; }}));
        strip.dataset.fdCanonicalBuild = String(BUILD);
      }}
    }}
    if (button) {{
      button.textContent = state.launching ? 'ЗАПУСК…' : state.ready ? 'НАЧАТЬ СРАЖЕНИЕ' : 'ЗАГРУЗКА…';
      button.disabled = !state.ready || state.launching;
      button.setAttribute('aria-disabled', String(button.disabled));
    }}
    if (load) {{
      load.disabled = !state.ready || state.launching || !state.loadAvailable;
      load.setAttribute('aria-disabled', String(load.disabled));
    }}
    document.documentElement.classList.toggle('fd-loading191', !state.ready);
    document.documentElement.classList.toggle('fd-ready191', state.ready);
    observer?.observe(document.documentElement, config);
  }};
  observer = new MutationObserver(apply);
  observer.observe(document.documentElement, config);
  document.addEventListener('DOMContentLoaded', apply, {{ once: true }});
  globalThis.__FD_BOOT_191__ = {{
    version: VERSION, build: BUILD, state, apply,
    setReady(value) {{ state.ready = Boolean(value); apply(); }},
    setLaunching(value) {{ state.launching = Boolean(value); apply(); }},
    setLoadAvailable(value) {{ state.loadAvailable = Boolean(value); apply(); }},
    stop() {{ state.stopped = true; observer?.disconnect(); }},
  }};
}})();
</script>
<style id="fd-boot191-style">
html.fd-loading191 #start-screen button{{pointer-events:none!important}}
html.fd-loading191 #start-game,html.fd-loading191 #load-game{{opacity:.58!important;filter:saturate(.6)}}
</style>'''
html = html.replace('</head>', boot_script + '</head>', 1)

# All external scripts use build 191.
def cache_bust(match):
    return f'{match.group(1)}?build={BUILD}{match.group(2)}'
html = re.sub(
    r'(<script\b[^>]*\bsrc=["\'](?:\./|/frontline-dominion/)[^"\']+\.js)(?:\?build=\d+)?(["\'][^>]*></script>)',
    cache_bust,
    html,
    flags=re.I,
)

bridge_tag = f'<script src="./authoritative-simulation-v174.js?build={BUILD}"></script>'
if bridge_tag not in html:
    raise RuntimeError('build 191 authoritative bridge tag missing')
html = html.replace(
    bridge_tag,
    f'<script src="./engineer-rocket-parity-v191.js?build={BUILD}"></script>\n' + bridge_tag +
    f'\n<script src="./command-watchdog-v191.js?build={BUILD}"></script>',
    1,
)

profiler = re.search(
    rf'<script\b[^>]*src=["\'](?:\./|/frontline-dominion/)simulation-profiler-v166\.js\?build={BUILD}["\'][^>]*></script>',
    html,
    flags=re.I,
)
if not profiler:
    raise RuntimeError('build 191 profiler tag missing')
html = html[:profiler.start()] + f'<script src="./runtime-ui-v191.js?build={BUILD}"></script>\n' + html[profiler.start():]
html = html.replace('</body>', f'<script src="./runtime-shell-v191.js?build={BUILD}"></script>\n</body>', 1)
html_path.write_text(html, 'utf-8')

launcher = f'''<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="color-scheme" content="dark"><title>Frontline Dominion v{VERSION}</title><style>
*{{box-sizing:border-box}}html,body{{margin:0;min-height:100%;background:#050b10;color:#dcecf4;font-family:system-ui,sans-serif}}
body{{display:grid;place-items:center;min-height:100vh;padding:24px;background:#071019}}
main{{width:min(720px,100%);padding:36px;border:1px solid #365363;border-radius:18px;background:#0a151d}}
a{{display:inline-flex;min-height:54px;align-items:center;padding:0 24px;border-radius:10px;background:#d9edf7;color:#071019;text-decoration:none;font-weight:900}}
</style></head><body><main>
<div>ЕДИНСТВЕННАЯ АКТУАЛЬНАЯ СБОРКА · BUILD {BUILD}</div><h1>Frontline Dominion</h1>
<p>Command &amp; Scale Recovery: реальные приказы, инженер размером с ракетчика и полный рендер добывающих зданий.</p>
<a id="launch" href="./frontline-dominion.html?build={BUILD}">Запустить игру</a><p>v{VERSION} · build {BUILD} · GitHub Pages</p>
</main></body></html>'''
(OUT / 'index.html').write_text(launcher, 'utf-8')

print(f'Frontline Dominion v{VERSION} build {BUILD} assembled')
