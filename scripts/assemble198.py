from pathlib import Path
import re

ROOT = Path('.')
OUT = ROOT / 'dist'
BUILD = 198
VERSION = '16.8.14'

html_path = OUT / 'frontline-dominion.html'
bridge_path = OUT / 'authoritative-simulation-v174.js'
worker_path = OUT / 'authoritative-simulation-worker-v174.js'
ui197 = OUT / 'runtime-ui-v197.js'
shell197 = OUT / 'runtime-shell-v197.js'
profiler_path = OUT / 'simulation-profiler-v166.js'
single_render_source = ROOT / 'src' / 'v198' / 'building-single-render-v198.js'

for path in (html_path, bridge_path, worker_path, ui197, shell197, profiler_path, single_render_source):
    if not path.exists():
        raise RuntimeError(f'build 198 required file missing: {path}')

(OUT / single_render_source.name).write_text(single_render_source.read_text('utf-8'), 'utf-8')

ui = ui197.read_text('utf-8')
ui = re.sub(r"const VERSION = '16\.8\.[0-9]+';", f"const VERSION = '{VERSION}';", ui, count=1)
ui = re.sub(r'const BUILD = \d+;', f'const BUILD = {BUILD};', ui, count=1)
ui = ui.replace('__FD_RUNTIME_UI_197__', '__FD_RUNTIME_UI_198__').replace('[FD197]', '[FD198]')
(OUT / 'runtime-ui-v198.js').write_text(ui, 'utf-8')

shell = shell197.read_text('utf-8')
shell = re.sub(r"const VERSION = '16\.8\.[0-9]+';", f"const VERSION = '{VERSION}';", shell, count=1)
shell = re.sub(r'const BUILD = \d+;', f'const BUILD = {BUILD};', shell, count=1)
shell = shell.replace('__FD_RUNTIME_SHELL_197__', '__FD_RUNTIME_SHELL_198__')
shell = shell.replace('__FD_BOOT_197__', '__FD_BOOT_198__').replace('[FD197]', '[FD198]')
shell = shell.replace('fd-loading197', 'fd-loading198').replace('fd-ready197', 'fd-ready198').replace('fd-running197', 'fd-running198')
(OUT / 'runtime-shell-v198.js').write_text(shell, 'utf-8')

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
    r'\s*<script\b[^>]*src=["\'](?:\./|/frontline-dominion/)(?:runtime-ui-v19[78]|runtime-shell-v19[78]|building-single-render-v198)\.js(?:\?build=\d+)?["\'][^>]*></script>',
    '',
    html,
    flags=re.I,
)
html = html.replace('fd-boot197-script', 'fd-boot198-script').replace('fd-boot197-style', 'fd-boot198-style')
html = html.replace('__FD_BOOT_197__', '__FD_BOOT_198__')
html = html.replace('fd-loading197', 'fd-loading198').replace('fd-ready197', 'fd-ready198').replace('fd-running197', 'fd-running198')
html = re.sub(r"const VERSION = '16\.8\.[0-9]+', BUILD = \d+;", f"const VERSION = '{VERSION}', BUILD = {BUILD};", html, count=1)
html = re.sub(r'data-fd-canonical-build="\d+"', f'data-fd-canonical-build="{BUILD}"', html, count=1)
html = re.sub(r'<title>.*?</title>', f'<title>Frontline Dominion v{VERSION} — Single Building Render</title>', html, count=1, flags=re.S)
html = re.sub(
    r'ОПЕРАТИВНО-ТАКТИЧЕСКАЯ RTS · v16\.8\.\d+ BUILD \d+',
    f'ОПЕРАТИВНО-ТАКТИЧЕСКАЯ RTS · v{VERSION} BUILD {BUILD}',
    html,
    count=1,
)
html = re.sub(
    r'<p class=["\']lead["\']>.*?</p>',
    '<p class="lead">Выбранное здание отрисовывается один раз без увеличенной копии. Точные приказы движения build 197 сохранены.</p>',
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

invariance_tag = f'<script src="./building-selection-invariance-v197.js?build={BUILD}"></script>'
if invariance_tag not in html:
    raise RuntimeError('build 198 building invariance HTML anchor missing')
single_render_tag = f'<script src="./building-single-render-v198.js?build={BUILD}"></script>'
html = html.replace(invariance_tag, invariance_tag + '\n' + single_render_tag, 1)

profiler_tag = re.search(
    rf'<script\b[^>]*src=["\'](?:\./|/frontline-dominion/)simulation-profiler-v166\.js\?build={BUILD}["\'][^>]*></script>',
    html,
    flags=re.I,
)
if not profiler_tag:
    raise RuntimeError('build 198 profiler HTML anchor missing')
ui_tag = f'<script src="./runtime-ui-v198.js?build={BUILD}"></script>\n'
html = html[:profiler_tag.start()] + ui_tag + html[profiler_tag.start():]
html = html.replace('</body>', f'<script src="./runtime-shell-v198.js?build={BUILD}"></script>\n</body>', 1)
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
<p>Выбранные здания не дублируются. Физический правый клик сохраняет точную мировую точку назначения.</p>
<a id="launch" href="./frontline-dominion.html?build={BUILD}">Запустить игру</a><p>v{VERSION} · build {BUILD} · GitHub Pages</p>
</main></body></html>'''
(OUT / 'index.html').write_text(launcher, 'utf-8')

final_html = html_path.read_text('utf-8')
required = [
    f'building-selection-v193.js?build={BUILD}',
    f'adaptive-visual-lod-v195.js?build={BUILD}',
    f'building-selection-owner-v196.js?build={BUILD}',
    f'building-selection-invariance-v197.js?build={BUILD}',
    f'building-single-render-v198.js?build={BUILD}',
    f'formation-target-fidelity-v197.js?build={BUILD}',
    f'right-click-authority-v197.js?build={BUILD}',
    f'runtime-ui-v198.js?build={BUILD}',
    f'simulation-profiler-v166.js?build={BUILD}',
    f'runtime-shell-v198.js?build={BUILD}',
]
for item in required:
    if final_html.count(item) != 1:
        raise RuntimeError(f'build 198 owner count invalid: {item}')
if 'runtime-ui-v197.js?build=198' in final_html or 'runtime-shell-v197.js?build=198' in final_html:
    raise RuntimeError('build 198 historical runtime owner remains connected')
if 'fd-boot198-script' not in final_html or '__FD_BOOT_198__' not in final_html:
    raise RuntimeError('build 198 boot owner missing')
if final_html.index(required[3]) > final_html.index(required[4]):
    raise RuntimeError('build 198 single-render gate loads before invariance owner')
if final_html.rfind(required[-1]) < final_html.rfind('</body>') - 200:
    raise RuntimeError('build 198 runtime shell is not the final body owner')

single_render = (OUT / single_render_source.name).read_text('utf-8')
for marker in ('__FD_BUILDING_SINGLE_RENDER_198__', 'suppressedOutsideCanonical', 'buildingDrawDepth', 'selectedSpritePaths'):
    if marker not in single_render:
        raise RuntimeError(f'build 198 single-render marker missing: {marker}')

print(f'Frontline Dominion v{VERSION} build {BUILD} selected-building single-render assembled')
