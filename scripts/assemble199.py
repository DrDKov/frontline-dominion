from pathlib import Path
import re

ROOT = Path('.')
OUT = ROOT / 'dist'
BUILD = 199
VERSION = '16.8.15'

html_path = OUT / 'frontline-dominion.html'
bridge_path = OUT / 'authoritative-simulation-v174.js'
worker_path = OUT / 'authoritative-simulation-worker-v174.js'
ui198 = OUT / 'runtime-ui-v198.js'
shell198 = OUT / 'runtime-shell-v198.js'
profiler_path = OUT / 'simulation-profiler-v166.js'
sources = [
    ROOT / 'src' / 'v199' / 'gameplay-reliability-v199.js',
    ROOT / 'src' / 'v199' / 'building-render-authority-v199.js',
    ROOT / 'src' / 'v199' / 'interaction-reset-v199.js',
]

for path in [html_path, bridge_path, worker_path, ui198, shell198, profiler_path, *sources]:
    if not path.exists():
        raise RuntimeError(f'build 199 required file missing: {path}')
for source in sources:
    (OUT / source.name).write_text(source.read_text('utf-8'), 'utf-8')

# Remove the square/corner building selection brackets. Selection remains in the
# data model and UI; only the four large screen-space corners are disabled.
invariance_path = OUT / 'building-selection-invariance-v197.js'
invariance = invariance_path.read_text('utf-8')
count = invariance.count('drawBracketOverlay(this, building);')
if count != 1:
    raise RuntimeError(f'build 199 bracket call count invalid: {count}')
invariance = invariance.replace('drawBracketOverlay(this, building);', 'void building; // build 199: no square/corner building frame', 1)
invariance_path.write_text(invariance, 'utf-8')

# A refit changes typeId and all derived presentation/gameplay fields in the
# Worker. The old mirror deliberately protected those fields and therefore kept
# showing the pre-refit unit. Synchronize them before applying the remaining
# detailed state.
bridge = bridge_path.read_text('utf-8')
anchor = "function applyEntityDetail(entity, data) {\n  if (!entity || !data) return;\n  const protectedKeys = new Set(['id', 'kind', 'typeId', 'game', 'stats', 'radius', 'armor', 'vision', 'detector']);"
replacement = """function applyEntityDetail(entity, data) {
  if (!entity || !data) return;
  if (data.kind === 'unit' && data.typeId && data.typeId !== entity.typeId) {
    entity.typeId = data.typeId;
    const teamState = entity.game?.teams?.[entity.team];
    let stats = null;
    try { stats = typeof D.getUnitStats === 'function' ? D.getUnitStats(data.typeId, teamState) : null; } catch (_) {}
    stats ||= D.UNIT_TYPES?.[data.typeId] || entity.stats;
    if (stats) {
      entity.stats = stats;
      entity.radius = Number(stats.radius) || entity.radius;
      entity.armor = stats.armor || entity.armor;
      entity.vision = Number(stats.vision) || 0;
      entity.detector = Number(stats.detector) || 0;
      entity.air = Boolean(stats.air);
      entity.infantry = Boolean(stats.infantry);
      entity.vehicle = Boolean(stats.vehicle);
      entity.speed = Number(stats.speed) || entity.speed;
    }
  }
  const protectedKeys = new Set(['id', 'kind', 'typeId', 'game', 'stats', 'radius', 'armor', 'vision', 'detector']);"""
if anchor not in bridge:
    raise RuntimeError('build 199 mirror refit anchor missing')
bridge = bridge.replace(anchor, replacement, 1)
bridge_path.write_text(bridge, 'utf-8')

# Gameplay reliability is core logic: load it before the bridge wraps public
# actions on the main thread and directly after the real bundle in the Worker.
worker = worker_path.read_text('utf-8')
worker_import = "importScripts('/frontline-dominion/gameplay-reliability-v199.js?build=199');"
worker = re.sub(r"\nimportScripts\('/frontline-dominion/gameplay-reliability-v199\.js\?build=\d+'\);", '', worker)
bundle_import = re.search(r"importScripts\('/frontline-dominion/authoritative-simulation-bundle-v172\.js\?build=\d+'\);", worker)
if not bundle_import:
    raise RuntimeError('build 199 Worker bundle import anchor missing')
worker = worker[:bundle_import.end()] + '\n' + worker_import + worker[bundle_import.end():]
worker_path.write_text(worker, 'utf-8')

ui = ui198.read_text('utf-8')
ui = re.sub(r"const VERSION = '16\.8\.[0-9]+';", f"const VERSION = '{VERSION}';", ui, count=1)
ui = re.sub(r'const BUILD = \d+;', f'const BUILD = {BUILD};', ui, count=1)
ui = ui.replace('__FD_RUNTIME_UI_198__', '__FD_RUNTIME_UI_199__').replace('[FD198]', '[FD199]')
(OUT / 'runtime-ui-v199.js').write_text(ui, 'utf-8')

shell = shell198.read_text('utf-8')
shell = re.sub(r"const VERSION = '16\.8\.[0-9]+';", f"const VERSION = '{VERSION}';", shell, count=1)
shell = re.sub(r'const BUILD = \d+;', f'const BUILD = {BUILD};', shell, count=1)
shell = shell.replace('__FD_RUNTIME_SHELL_198__', '__FD_RUNTIME_SHELL_199__')
shell = shell.replace('__FD_BOOT_198__', '__FD_BOOT_199__').replace('[FD198]', '[FD199]')
shell = shell.replace('fd-loading198', 'fd-loading199').replace('fd-ready198', 'fd-ready199').replace('fd-running198', 'fd-running199')
listener_anchor = """    const startButton = document.getElementById('start-game');
    const loadButton = document.getElementById('load-game');
    if (typeof api?.startGame !== 'function' || !startButton || !loadButton) return false;

    startButton.addEventListener('click', launchNewGame, { capture: true });
    loadButton.addEventListener('click', launchSavedGame, { capture: true });
"""
listener_replacement = """    let startButton = document.getElementById('start-game');
    let loadButton = document.getElementById('load-game');
    if (typeof api?.startGame !== 'function' || !startButton || !loadButton) return false;

    // Historical builds registered their own start/load handlers before the
    // canonical runtime shell. Replace both nodes once so a saved-game click
    // cannot be intercepted and converted into a new game by an older owner.
    const cleanStart = startButton.cloneNode(true);
    const cleanLoad = loadButton.cloneNode(true);
    startButton.replaceWith(cleanStart);
    loadButton.replaceWith(cleanLoad);
    startButton = cleanStart;
    loadButton = cleanLoad;
    startButton.addEventListener('click', launchNewGame, { capture: true });
    loadButton.addEventListener('click', launchSavedGame, { capture: true });
"""
if listener_anchor not in shell:
    raise RuntimeError('build 199 canonical launch button anchor missing')
shell = shell.replace(listener_anchor, listener_replacement, 1)
(OUT / 'runtime-shell-v199.js').write_text(shell, 'utf-8')

for path in (bridge_path, worker_path):
    text = path.read_text('utf-8')
    text = re.sub(r'const BUILD = \d+;', f'const BUILD = {BUILD};', text, count=1)
    text = re.sub(r"const VERSION = '16\.8\.[0-9]+';", f"const VERSION = '{VERSION}';", text, count=1)
    text = re.sub(r'authoritative-simulation-worker-v174\.js\?build=\d+', f'authoritative-simulation-worker-v174.js?build={BUILD}', text)
    text = re.sub(r"version: '16\.8\.[0-9]+', build: \d+", f"version: '{VERSION}', build: {BUILD}", text)
    path.write_text(text, 'utf-8')

profiler = profiler_path.read_text('utf-8')
profiler = re.sub(r"const VERSION = '16\.8\.[0-9]+';", f"const VERSION = '{VERSION}';", profiler, count=1)
profiler = re.sub(r'const BUILD = \d+;', f'const BUILD = {BUILD};', profiler, count=1)
profiler_path.write_text(profiler, 'utf-8')

asset_pattern = re.compile(r"(/frontline-dominion/[^\s\'\"`)]+\.(?:js|json|webp))\?build=\d+")
for path in sorted(OUT.glob('*.js')):
    text = path.read_text('utf-8')
    text = asset_pattern.sub(rf'\1?build={BUILD}', text)
    path.write_text(text, 'utf-8')

html = html_path.read_text('utf-8')
html = re.sub(
    r'\s*<script\b[^>]*src=["\'](?:\./|/frontline-dominion/)(?:runtime-ui-v19[89]|runtime-shell-v19[89]|building-single-render-v198|gameplay-reliability-v199|building-render-authority-v199|interaction-reset-v199)\.js(?:\?build=\d+)?["\'][^>]*></script>',
    '', html, flags=re.I,
)
html = html.replace('fd-boot198-script', 'fd-boot199-script').replace('fd-boot198-style', 'fd-boot199-style')
html = html.replace('__FD_BOOT_198__', '__FD_BOOT_199__')
html = html.replace('fd-loading198', 'fd-loading199').replace('fd-ready198', 'fd-ready199').replace('fd-running198', 'fd-running199')
html = re.sub(r"const VERSION = '16\.8\.[0-9]+', BUILD = \d+;", f"const VERSION = '{VERSION}', BUILD = {BUILD};", html, count=1)
html = re.sub(r'data-fd-canonical-build="\d+"', f'data-fd-canonical-build="{BUILD}"', html, count=1)
html = re.sub(r'<title>.*?</title>', f'<title>Frontline Dominion v{VERSION} — Reliability Core</title>', html, count=1, flags=re.S)
html = re.sub(r'ОПЕРАТИВНО-ТАКТИЧЕСКАЯ RTS · v16\.8\.\d+ BUILD \d+', f'ОПЕРАТИВНО-ТАКТИЧЕСКАЯ RTS · v{VERSION} BUILD {BUILD}', html, count=1)
html = re.sub(r'<p class=["\']lead["\']>.*?</p>', '<p class="lead">Стабильное выделение без моргания и рамок, рабочие транспорты, переоснащение и загрузка сохранений.</p>', html, count=1, flags=re.S)

def cache_bust(match):
    return f'{match.group(1)}?build={BUILD}{match.group(2)}'
html = re.sub(r'(<script\b[^>]*\bsrc=["\'](?:\./|/frontline-dominion/)[^"\']+\.js)(?:\?build=\d+)?(["\'][^>]*></script>)', cache_bust, html, flags=re.I)

bridge_tag = re.search(rf'<script\b[^>]*src=["\'](?:\./|/frontline-dominion/)authoritative-simulation-v174\.js\?build={BUILD}["\'][^>]*></script>', html, flags=re.I)
if not bridge_tag:
    raise RuntimeError('build 199 bridge HTML anchor missing')
gameplay_tag = f'<script src="./gameplay-reliability-v199.js?build={BUILD}"></script>\n'
html = html[:bridge_tag.start()] + gameplay_tag + html[bridge_tag.start():]

invariance_tag = f'<script src="./building-selection-invariance-v197.js?build={BUILD}"></script>'
if invariance_tag not in html:
    raise RuntimeError('build 199 invariance tag missing')
html = html.replace(invariance_tag, invariance_tag + f'\n<script src="./building-render-authority-v199.js?build={BUILD}"></script>', 1)

right_click_tag = f'<script src="./right-click-authority-v197.js?build={BUILD}"></script>'
if right_click_tag not in html:
    raise RuntimeError('build 199 right-click tag missing')
html = html.replace(right_click_tag, right_click_tag + f'\n<script src="./interaction-reset-v199.js?build={BUILD}"></script>', 1)

profiler_tag = re.search(rf'<script\b[^>]*src=["\'](?:\./|/frontline-dominion/)simulation-profiler-v166\.js\?build={BUILD}["\'][^>]*></script>', html, flags=re.I)
if not profiler_tag:
    raise RuntimeError('build 199 profiler HTML anchor missing')
html = html[:profiler_tag.start()] + f'<script src="./runtime-ui-v199.js?build={BUILD}"></script>\n' + html[profiler_tag.start():]
html = html.replace('</body>', f'<script src="./runtime-shell-v199.js?build={BUILD}"></script>\n</body>', 1)
html_path.write_text(html, 'utf-8')

for path in sorted(OUT.glob('*.js')):
    text = path.read_text('utf-8')
    text = asset_pattern.sub(rf'\1?build={BUILD}', text)
    path.write_text(text, 'utf-8')

launcher = f'''<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="color-scheme" content="dark"><title>Frontline Dominion v{VERSION}</title><style>*{{box-sizing:border-box}}html,body{{margin:0;min-height:100%;background:#050b10;color:#dcecf4;font-family:system-ui,sans-serif}}body{{display:grid;place-items:center;min-height:100vh;padding:24px;background:#071019}}main{{width:min(720px,100%);padding:36px;border:1px solid #365363;border-radius:18px;background:#0a151d}}a{{display:inline-flex;min-height:54px;align-items:center;padding:0 24px;border-radius:10px;background:#d9edf7;color:#071019;text-decoration:none;font-weight:900}}</style></head><body><main><div>ЕДИНСТВЕННАЯ АКТУАЛЬНАЯ СБОРКА · BUILD {BUILD}</div><h1>Frontline Dominion</h1><p>Исправлены моргание зданий, транспорт, переоснащение, пустой клик и загрузка сохранённой игры.</p><a id="launch" href="./frontline-dominion.html?build={BUILD}">Запустить игру</a><p>v{VERSION} · build {BUILD} · GitHub Pages</p></main></body></html>'''
(OUT / 'index.html').write_text(launcher, 'utf-8')

final_html = html_path.read_text('utf-8')
required = [
    f'gameplay-reliability-v199.js?build={BUILD}',
    f'building-selection-invariance-v197.js?build={BUILD}',
    f'building-render-authority-v199.js?build={BUILD}',
    f'formation-target-fidelity-v197.js?build={BUILD}',
    f'right-click-authority-v197.js?build={BUILD}',
    f'interaction-reset-v199.js?build={BUILD}',
    f'runtime-ui-v199.js?build={BUILD}',
    f'simulation-profiler-v166.js?build={BUILD}',
    f'runtime-shell-v199.js?build={BUILD}',
]
for item in required:
    if final_html.count(item) != 1:
        raise RuntimeError(f'build 199 owner count invalid: {item}')
if 'building-single-render-v198.js?build=199' in final_html:
    raise RuntimeError('build 199 still loads obsolete selected-only render guard')
if 'drawBracketOverlay(this, building);' in invariance_path.read_text('utf-8'):
    raise RuntimeError('build 199 square building brackets still active')
if worker_path.read_text('utf-8').count(worker_import) != 1:
    raise RuntimeError('build 199 Worker gameplay reliability owner count invalid')
if 'fd-boot199-script' not in final_html or '__FD_BOOT_199__' not in final_html:
    raise RuntimeError('build 199 boot owner missing')
if final_html.rfind(required[-1]) < final_html.rfind('</body>') - 200:
    raise RuntimeError('build 199 runtime shell is not final')
for marker, path in [
    ('__FD_GAMEPLAY_RELIABILITY_199__', OUT / 'gameplay-reliability-v199.js'),
    ('__FD_BUILDING_RENDER_AUTHORITY_199__', OUT / 'building-render-authority-v199.js'),
    ('__FD_INTERACTION_RESET_199__', OUT / 'interaction-reset-v199.js'),
]:
    if marker not in path.read_text('utf-8'):
        raise RuntimeError(f'build 199 marker missing: {marker}')
print(f'Frontline Dominion v{VERSION} build {BUILD} reliability core assembled')
