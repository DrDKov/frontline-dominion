from pathlib import Path
import re

ROOT = Path('.')
OUT = ROOT / 'dist'
BUILD = 197
VERSION = '16.8.13'

html_path = OUT / 'frontline-dominion.html'
bridge_path = OUT / 'authoritative-simulation-v174.js'
worker_path = OUT / 'authoritative-simulation-worker-v174.js'
ui196 = OUT / 'runtime-ui-v196.js'
shell196 = OUT / 'runtime-shell-v196.js'
profiler_path = OUT / 'simulation-profiler-v166.js'
building_source = ROOT / 'src' / 'v197' / 'building-selection-invariance-v197.js'
target_source = ROOT / 'src' / 'v197' / 'formation-target-fidelity-v197.js'

required_paths = (
    html_path, bridge_path, worker_path, ui196, shell196, profiler_path,
    building_source, target_source,
)
for path in required_paths:
    if not path.exists():
        raise RuntimeError(f'build 197 required file missing: {path}')

for source in (building_source, target_source):
    (OUT / source.name).write_text(source.read_text('utf-8'), 'utf-8')

ui = ui196.read_text('utf-8')
ui = re.sub(r"const VERSION = '16\.8\.[0-9]+';", f"const VERSION = '{VERSION}';", ui, count=1)
ui = re.sub(r'const BUILD = \d+;', f'const BUILD = {BUILD};', ui, count=1)
ui = ui.replace('__FD_RUNTIME_UI_196__', '__FD_RUNTIME_UI_197__').replace('[FD196]', '[FD197]')
(OUT / 'runtime-ui-v197.js').write_text(ui, 'utf-8')

shell = shell196.read_text('utf-8')
shell = re.sub(r"const VERSION = '16\.8\.[0-9]+';", f"const VERSION = '{VERSION}';", shell, count=1)
shell = re.sub(r'const BUILD = \d+;', f'const BUILD = {BUILD};', shell, count=1)
shell = shell.replace('__FD_RUNTIME_SHELL_196__', '__FD_RUNTIME_SHELL_197__')
shell = shell.replace('__FD_BOOT_196__', '__FD_BOOT_197__').replace('[FD196]', '[FD197]')
shell = shell.replace('fd-loading196', 'fd-loading197').replace('fd-ready196', 'fd-ready197').replace('fd-running196', 'fd-running197')
(OUT / 'runtime-shell-v197.js').write_text(shell, 'utf-8')

for path in (bridge_path, worker_path):
    text = path.read_text('utf-8')
    text = re.sub(r'const BUILD = \d+;', f'const BUILD = {BUILD};', text, count=1)
    text = re.sub(r"const VERSION = '16\.8\.[0-9]+';", f"const VERSION = '{VERSION}';", text, count=1)
    text = re.sub(r'authoritative-simulation-worker-v174\.js\?build=\d+', f'authoritative-simulation-worker-v174.js?build={BUILD}', text)
    text = re.sub(r"version: '16\.8\.[0-9]+', build: \d+", f"version: '{VERSION}', build: {BUILD}", text)
    path.write_text(text, 'utf-8')

worker = worker_path.read_text('utf-8')
worker = re.sub(
    r"\nimportScripts\('/frontline-dominion/formation-target-fidelity-v197\.js\?build=\d+'\);",
    '',
    worker,
)
anchor_pattern = r"importScripts\('/frontline-dominion/formation-obstacle-recovery-v196\.js\?build=\d+'\);"
if not re.search(anchor_pattern, worker):
    raise RuntimeError('build 197 Worker v196 formation anchor missing')
formation_anchor = f"importScripts('/frontline-dominion/formation-obstacle-recovery-v196.js?build={BUILD}');"
target_import = f"importScripts('/frontline-dominion/formation-target-fidelity-v197.js?build={BUILD}');"
worker = re.sub(anchor_pattern, f'{formation_anchor}\n{target_import}', worker, count=1)
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
    r'\s*<script\b[^>]*src=["\'](?:\./|/frontline-dominion/)(?:runtime-ui-v19[67]|runtime-shell-v19[67]|building-selection-invariance-v197|formation-target-fidelity-v197)\.js(?:\?build=\d+)?["\'][^>]*></script>',
    '',
    html,
    flags=re.I,
)
html = html.replace('fd-boot196-script', 'fd-boot197-script').replace('fd-boot196-style', 'fd-boot197-style')
html = html.replace('__FD_BOOT_196__', '__FD_BOOT_197__')
html = html.replace('fd-loading196', 'fd-loading197').replace('fd-ready196', 'fd-ready197').replace('fd-running196', 'fd-running197')
html = re.sub(r"const VERSION = '16\.8\.[0-9]+', BUILD = \d+;", f"const VERSION = '{VERSION}', BUILD = {BUILD};", html, count=1)
html = re.sub(r'data-fd-canonical-build="\d+"', f'data-fd-canonical-build="{BUILD}"', html, count=1)
html = re.sub(r'<title>.*?</title>', f'<title>Frontline Dominion v{VERSION} — Exact Selection and Orders</title>', html, count=1, flags=re.S)
html = re.sub(
    r'ОПЕРАТИВНО-ТАКТИЧЕСКАЯ RTS · v16\.8\.\d+ BUILD \d+',
    f'ОПЕРАТИВНО-ТАКТИЧЕСКАЯ RTS · v{VERSION} BUILD {BUILD}',
    html,
    count=1,
)
html = re.sub(
    r'<p class=["\']lead["\']>.*?</p>',
    '<p class="lead">Выбор здания больше не изменяет его геометрию, а центр построения завершает движение точно в указанной точке.</p>',
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
    raise RuntimeError('build 197 profiler HTML anchor missing')
block = (
    f'<script src="./building-selection-invariance-v197.js?build={BUILD}"></script>\n'
    f'<script src="./formation-target-fidelity-v197.js?build={BUILD}"></script>\n'
    f'<script src="./runtime-ui-v197.js?build={BUILD}"></script>\n'
)
html = html[:profiler_tag.start()] + block + html[profiler_tag.start():]
html = html.replace('</body>', f'<script src="./runtime-shell-v197.js?build={BUILD}"></script>\n</body>', 1)
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
<p>Размер здания неизменен при выборе. Групповые приказы сохраняют точную мировую координату назначения.</p>
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
    f'building-selection-invariance-v197.js?build={BUILD}',
    f'formation-target-fidelity-v197.js?build={BUILD}',
    f'runtime-ui-v197.js?build={BUILD}',
    f'simulation-profiler-v166.js?build={BUILD}',
    f'runtime-shell-v197.js?build={BUILD}',
]
for item in required:
    if final_html.count(item) != 1:
        raise RuntimeError(f'build 197 owner count invalid: {item}')
if 'runtime-ui-v196.js?build=197' in final_html or 'runtime-shell-v196.js?build=197' in final_html:
    raise RuntimeError('build 197 historical runtime owner remains connected')
if 'fd-boot197-script' not in final_html or '__FD_BOOT_197__' not in final_html:
    raise RuntimeError('build 197 boot owner missing')
order = [final_html.index(item) for item in required[:-1]]
if order != sorted(order):
    raise RuntimeError('build 197 runtime owner load order invalid')
if final_html.rfind(required[-1]) < final_html.rfind('</body>') - 200:
    raise RuntimeError('build 197 runtime shell is not the final body owner')

worker_check = worker_path.read_text('utf-8')
if worker_check.count(target_import) != 1:
    raise RuntimeError('build 197 Worker target fidelity owner count invalid')
if 'post-load-command-recovery-v196.js' in worker_check:
    raise RuntimeError('build 197 Worker still imports main-thread post-load recovery')
for path, markers in (
    (OUT / building_source.name, ('__FD_BUILDING_SELECTION_INVARIANCE_197__', 'restoreGeometry', 'drawBracketOverlay')),
    (OUT / target_source.name, ('__FD_FORMATION_TARGET_FIDELITY_197__', 'ensureExactPathEnd', 'normalizeSlots')),
):
    text = path.read_text('utf-8')
    for marker in markers:
        if marker not in text:
            raise RuntimeError(f'build 197 marker missing in {path.name}: {marker}')

print(f'Frontline Dominion v{VERSION} build {BUILD} selection/target fidelity assembled')
