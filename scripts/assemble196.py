from pathlib import Path
import re

ROOT = Path('.')
OUT = ROOT / 'dist'
BUILD = 196
VERSION = '16.8.12'

html_path = OUT / 'frontline-dominion.html'
bridge_path = OUT / 'authoritative-simulation-v174.js'
worker_path = OUT / 'authoritative-simulation-worker-v174.js'
ui195 = OUT / 'runtime-ui-v195.js'
shell195 = OUT / 'runtime-shell-v195.js'
profiler_path = OUT / 'simulation-profiler-v166.js'
formation_source = ROOT / 'src' / 'v196' / 'formation-obstacle-recovery-v196.js'
load_source = ROOT / 'src' / 'v196' / 'post-load-command-recovery-v196.js'
building_source = ROOT / 'src' / 'v196' / 'building-selection-owner-v196.js'
bootstrap_source = ROOT / 'src' / 'v196' / 'recovery-bootstrap-v196.js'

required_paths = (
    html_path, bridge_path, worker_path, ui195, shell195, profiler_path,
    formation_source, load_source, building_source, bootstrap_source,
)
for path in required_paths:
    if not path.exists():
        raise RuntimeError(f'build 196 required file missing: {path}')

for source in (formation_source, load_source, building_source, bootstrap_source):
    (OUT / source.name).write_text(source.read_text('utf-8'), 'utf-8')

ui = ui195.read_text('utf-8')
ui = re.sub(r"const VERSION = '16\.8\.[0-9]+';", f"const VERSION = '{VERSION}';", ui, count=1)
ui = re.sub(r'const BUILD = \d+;', f'const BUILD = {BUILD};', ui, count=1)
ui = ui.replace('__FD_RUNTIME_UI_195__', '__FD_RUNTIME_UI_196__').replace('[FD195]', '[FD196]')
(OUT / 'runtime-ui-v196.js').write_text(ui, 'utf-8')

shell = shell195.read_text('utf-8')
shell = re.sub(r"const VERSION = '16\.8\.[0-9]+';", f"const VERSION = '{VERSION}';", shell, count=1)
shell = re.sub(r'const BUILD = \d+;', f'const BUILD = {BUILD};', shell, count=1)
shell = shell.replace('__FD_RUNTIME_SHELL_195__', '__FD_RUNTIME_SHELL_196__')
shell = shell.replace('__FD_BOOT_195__', '__FD_BOOT_196__').replace('[FD195]', '[FD196]')
shell = shell.replace('fd-loading195', 'fd-loading196').replace('fd-ready195', 'fd-ready196').replace('fd-running195', 'fd-running196')
(OUT / 'runtime-shell-v196.js').write_text(shell, 'utf-8')

for path in (bridge_path, worker_path):
    text = path.read_text('utf-8')
    text = re.sub(r'const BUILD = \d+;', f'const BUILD = {BUILD};', text, count=1)
    text = re.sub(r"const VERSION = '16\.8\.[0-9]+';", f"const VERSION = '{VERSION}';", text, count=1)
    text = re.sub(r'authoritative-simulation-worker-v174\.js\?build=\d+', f'authoritative-simulation-worker-v174.js?build={BUILD}', text)
    text = re.sub(r"version: '16\.8\.[0-9]+', build: \d+", f"version: '{VERSION}', build: {BUILD}", text)
    path.write_text(text, 'utf-8')

worker = worker_path.read_text('utf-8')
formation_import = f"importScripts('/frontline-dominion/formation-obstacle-recovery-v196.js?build={BUILD}');"
load_import = f"importScripts('/frontline-dominion/post-load-command-recovery-v196.js?build={BUILD}');"
worker = re.sub(
    r"\nimportScripts\('/frontline-dominion/(?:formation-obstacle-recovery-v196|post-load-command-recovery-v196)\.js\?build=\d+'\);",
    '',
    worker,
)
anchor_pattern = r"importScripts\('/frontline-dominion/formation-march-core-v183\.js\?build=\d+'\);"
if not re.search(anchor_pattern, worker):
    raise RuntimeError('build 196 Worker formation import anchor missing')
formation_anchor = f"importScripts('/frontline-dominion/formation-march-core-v183.js?build={BUILD}');"
worker = re.sub(anchor_pattern, f"{formation_anchor}\n{formation_import}\n{load_import}", worker, count=1)
worker_path.write_text(worker, 'utf-8')

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
    r'\s*<script\b[^>]*src=["\'](?:\./|/frontline-dominion/)(?:runtime-ui-v19[456]|runtime-shell-v19[56]|formation-obstacle-recovery-v196|post-load-command-recovery-v196|building-selection-owner-v196|recovery-bootstrap-v196)\.js(?:\?build=\d+)?["\'][^>]*></script>',
    '',
    html,
    flags=re.I,
)
html = html.replace('fd-boot195-script', 'fd-boot196-script').replace('fd-boot195-style', 'fd-boot196-style')
html = html.replace('__FD_BOOT_195__', '__FD_BOOT_196__')
html = html.replace('fd-loading195', 'fd-loading196').replace('fd-ready195', 'fd-ready196').replace('fd-running195', 'fd-running196')
html = re.sub(r"const VERSION = '16\.8\.[0-9]+', BUILD = \d+;", f"const VERSION = '{VERSION}', BUILD = {BUILD};", html, count=1)
html = re.sub(r'data-fd-canonical-build="\d+"', f'data-fd-canonical-build="{BUILD}"', html, count=1)
html = re.sub(r'<title>.*?</title>', f'<title>Frontline Dominion v{VERSION} — Command and Navigation Recovery</title>', html, count=1, flags=re.S)
html = re.sub(
    r'ОПЕРАТИВНО-ТАКТИЧЕСКАЯ RTS · v16\.8\.\d+ BUILD \d+',
    f'ОПЕРАТИВНО-ТАКТИЧЕСКАЯ RTS · v{VERSION} BUILD {BUILD}',
    html,
    count=1,
)
html = re.sub(
    r'<p class=["\']lead["\']>.*?</p>',
    '<p class="lead">Колонны временно расцепляются для обхода препятствий, загруженные сохранения восстанавливают командный контур, а выбранное здание рисуется одной моделью.</p>',
    html,
    count=1,
    flags=re.S,
)

def cache_bust(match):
    return f'{match.group(1)}?build={BUILD}{match.group(2)}'

html = re.sub(
    r'(<script\b[^>]*\bsrc=["\'](?:\./|/frontline-dominion/)[^"\']+\.js)(?:\?build=\d+)?(["\'][^>]*></script>)',
    cache_bust,
    html,
    flags=re.I,
)

profiler_tag = re.search(
    rf'<script\b[^>]*src=["\'](?:\./|/frontline-dominion/)simulation-profiler-v166\.js\?build={BUILD}["\'][^>]*></script>',
    html,
    flags=re.I,
)
if not profiler_tag:
    raise RuntimeError('build 196 profiler HTML anchor missing')
block = (
    f'<script src="./formation-obstacle-recovery-v196.js?build={BUILD}"></script>\n'
    f'<script src="./post-load-command-recovery-v196.js?build={BUILD}"></script>\n'
    f'<script src="./building-selection-owner-v196.js?build={BUILD}"></script>\n'
    f'<script src="./recovery-bootstrap-v196.js?build={BUILD}"></script>\n'
    f'<script src="./runtime-ui-v196.js?build={BUILD}"></script>\n'
)
html = html[:profiler_tag.start()] + block + html[profiler_tag.start():]
html = html.replace('</body>', f'<script src="./runtime-shell-v196.js?build={BUILD}"></script>\n</body>', 1)
html_path.write_text(html, 'utf-8')

for path in sorted(OUT.glob('*.js')):
    text = path.read_text('utf-8')
    text = asset_pattern.sub(rf'\1?build={BUILD}', text)
    path.write_text(text, 'utf-8')

launcher = f'''<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="color-scheme" content="dark"><title>Frontline Dominion v{VERSION}</title><style>
*{{box-sizing:border-box}}html,body{{margin:0;min-height:100%;background:#050b10;color:#dcecf4;font-family:system-ui,sans-serif}}
body{{display:grid;place-items:center;min-height:100vh;padding:24px;background:#071019}}
main{{width:min(720px,100%);padding:36px;border:1px solid #365363;border-radius:18px;background:#0a151d}}
a{{display:inline-flex;min-height:54px;align-items:center;padding:0 24px;border-radius:10px;background:#d9edf7;color:#071019;text-decoration:none;font-weight:900}}
</style></head><body><main>
<div>ЕДИНСТВЕННАЯ АКТУАЛЬНАЯ СБОРКА · BUILD {BUILD}</div><h1>Frontline Dominion</h1>
<p>Восстановлены обход препятствий колоннами, управление после загрузки и однократная отрисовка выбранных зданий.</p>
<a id="launch" href="./frontline-dominion.html?build={BUILD}">Запустить игру</a><p>v{VERSION} · build {BUILD} · GitHub Pages</p>
</main></body></html>'''
(OUT / 'index.html').write_text(launcher, 'utf-8')

final_html = html_path.read_text('utf-8')
required = [
    f'building-selection-v193.js?build={BUILD}',
    f'performance-observability-v194.js?build={BUILD}',
    f'adaptive-visual-lod-v195.js?build={BUILD}',
    f'formation-obstacle-recovery-v196.js?build={BUILD}',
    f'post-load-command-recovery-v196.js?build={BUILD}',
    f'building-selection-owner-v196.js?build={BUILD}',
    f'recovery-bootstrap-v196.js?build={BUILD}',
    f'runtime-ui-v196.js?build={BUILD}',
    f'simulation-profiler-v166.js?build={BUILD}',
    f'runtime-shell-v196.js?build={BUILD}',
]
for item in required:
    if final_html.count(item) != 1:
        raise RuntimeError(f'build 196 owner count invalid: {item}')
if 'runtime-ui-v195.js?build=196' in final_html or 'runtime-shell-v195.js?build=196' in final_html:
    raise RuntimeError('build 196 historical runtime owner remains connected')
if 'fd-boot196-script' not in final_html or '__FD_BOOT_196__' not in final_html:
    raise RuntimeError('build 196 boot owner missing')
order = [final_html.index(item) for item in required[:-1]]
if order != sorted(order):
    raise RuntimeError('build 196 runtime owner load order invalid')
if final_html.rfind(required[-1]) < final_html.rfind('</body>') - 200:
    raise RuntimeError('build 196 runtime shell is not the final body owner')

worker_check = worker_path.read_text('utf-8')
for item in (formation_import, load_import):
    if worker_check.count(item) != 1:
        raise RuntimeError(f'build 196 Worker owner count invalid: {item}')
for path, markers in (
    (OUT / formation_source.name, ('__FD_FORMATION_OBSTACLE_RECOVERY_196__', 'dynamic: true', 'blockedTicks')),
    (OUT / load_source.name, ('__FD_POST_LOAD_COMMAND_RECOVERY_196__', 'formationCounter', "routeAction('issueMove'")),
    (OUT / building_source.name, ('__FD_BUILDING_SELECTION_OWNER_196__', 'clearBuildingVisualFlags', 'overlayDraws')),
    (OUT / bootstrap_source.name, ('__FD_RECOVERY_BOOTSTRAP_196__', 'setInterval(inspect, 25)', 'fdRecoveryRetry196')),
):
    text = path.read_text('utf-8')
    for marker in markers:
        if marker not in text:
            raise RuntimeError(f'build 196 marker missing in {path.name}: {marker}')

print(f'Frontline Dominion v{VERSION} build {BUILD} command/navigation/selection recovery assembled')
