from pathlib import Path
import re

ROOT = Path('.')
OUT = ROOT / 'dist'
BUILD = 193
VERSION = '16.8.9'

html_path = OUT / 'frontline-dominion.html'
bridge_path = OUT / 'authoritative-simulation-v174.js'
worker_path = OUT / 'authoritative-simulation-worker-v174.js'
ui192 = OUT / 'runtime-ui-v192.js'
shell192 = OUT / 'runtime-shell-v192.js'
source = ROOT / 'src' / 'v193' / 'building-selection-v193.js'

for path in (html_path, bridge_path, worker_path, ui192, shell192, source):
    if not path.exists():
        raise RuntimeError(f'build 193 required file missing: {path}')

(OUT / 'building-selection-v193.js').write_text(source.read_text('utf-8'), 'utf-8')

ui = ui192.read_text('utf-8')
ui = ui.replace("const VERSION = '16.8.8';", f"const VERSION = '{VERSION}';", 1)
ui = ui.replace('const BUILD = 192;', f'const BUILD = {BUILD};', 1)
ui = ui.replace('__FD_RUNTIME_UI_192__', '__FD_RUNTIME_UI_193__').replace('[FD192]', '[FD193]')
(OUT / 'runtime-ui-v193.js').write_text(ui, 'utf-8')

shell = shell192.read_text('utf-8')
shell = shell.replace("const VERSION = '16.8.8';", f"const VERSION = '{VERSION}';", 1)
shell = shell.replace('const BUILD = 192;', f'const BUILD = {BUILD};', 1)
shell = shell.replace('__FD_RUNTIME_SHELL_192__', '__FD_RUNTIME_SHELL_193__')
shell = shell.replace('__FD_BOOT_192__', '__FD_BOOT_193__').replace('[FD192]', '[FD193]')
shell = shell.replace('fd-loading192', 'fd-loading193').replace('fd-ready192', 'fd-ready193').replace('fd-running192', 'fd-running193')
(OUT / 'runtime-shell-v193.js').write_text(shell, 'utf-8')

for path in (bridge_path, worker_path):
    text = path.read_text('utf-8')
    text = re.sub(r'const BUILD = \d+;', f'const BUILD = {BUILD};', text, count=1)
    text = re.sub(r"const VERSION = '16\.8\.[0-9]+';", f"const VERSION = '{VERSION}';", text, count=1)
    text = re.sub(r'authoritative-simulation-worker-v174\.js\?build=\d+', f'authoritative-simulation-worker-v174.js?build={BUILD}', text)
    text = re.sub(r"version: '16\.8\.[0-9]+', build: \d+", f"version: '{VERSION}', build: {BUILD}", text)
    path.write_text(text, 'utf-8')

# Keep all runtime resources on one immutable cache generation.
asset_pattern = re.compile(r"(/frontline-dominion/[^\s\'\"`)]+\.(?:js|json|webp))\?build=\d+")
for path in sorted(OUT.glob('*.js')):
    text = path.read_text('utf-8')
    text = asset_pattern.sub(rf'\1?build={BUILD}', text)
    path.write_text(text, 'utf-8')

html = html_path.read_text('utf-8')
html = re.sub(
    r'\s*<script\b[^>]*src=["\'](?:\./|/frontline-dominion/)(?:runtime-ui-v19[23]|runtime-shell-v19[23]|building-selection-v193)\.js(?:\?build=\d+)?["\'][^>]*></script>',
    '', html, flags=re.I,
)
html = html.replace('fd-boot192-script', 'fd-boot193-script').replace('fd-boot192-style', 'fd-boot193-style')
html = html.replace('__FD_BOOT_192__', '__FD_BOOT_193__')
html = html.replace('fd-loading192', 'fd-loading193').replace('fd-ready192', 'fd-ready193').replace('fd-running192', 'fd-running193')
html = re.sub(r"const VERSION = '16\.8\.[0-9]+', BUILD = \d+;", f"const VERSION = '{VERSION}', BUILD = {BUILD};", html, count=1)
html = re.sub(r'data-fd-canonical-build="\d+"', f'data-fd-canonical-build="{BUILD}"', html, count=1)
html = re.sub(r'<title>.*?</title>', f'<title>Frontline Dominion v{VERSION} — Building Selection Recovery</title>', html, count=1, flags=re.S)
html = re.sub(r'ОПЕРАТИВНО-ТАКТИЧЕСКАЯ RTS · v16\.8\.\d+ BUILD \d+', f'ОПЕРАТИВНО-ТАКТИЧЕСКАЯ RTS · v{VERSION} BUILD {BUILD}', html, count=1)
html = html.replace(
    'Рудообогатительный рудник строится только в authoritative Worker; масштаб инженеров сохранён без изменений.',
    'Надёжное выделение зданий одним кликом; один building-id отрисовывается один раз за кадр.'
)

def cache_bust(match):
    return f'{match.group(1)}?build={BUILD}{match.group(2)}'
html = re.sub(
    r'(<script\b[^>]*\bsrc=["\'](?:\./|/frontline-dominion/)[^"\']+\.js)(?:\?build=\d+)?(["\'][^>]*></script>)',
    cache_bust, html, flags=re.I,
)

runtime_anchor = re.search(
    rf'<script\b[^>]*src=["\'](?:\./|/frontline-dominion/)runtime-ui-v192\.js\?build={BUILD}["\'][^>]*></script>',
    html, flags=re.I,
)
# assemble192's runtime tag may have been removed by the cleanup above. Anchor
# on the profiler instead and install the final selection owner immediately
# before the new runtime UI.
profiler = re.search(
    rf'<script\b[^>]*src=["\'](?:\./|/frontline-dominion/)simulation-profiler-v166\.js\?build={BUILD}["\'][^>]*></script>',
    html, flags=re.I,
)
if not profiler:
    raise RuntimeError('build 193 profiler HTML anchor missing')
block = (
    f'<script src="./building-selection-v193.js?build={BUILD}"></script>\n'
    f'<script src="./runtime-ui-v193.js?build={BUILD}"></script>\n'
)
html = html[:profiler.start()] + block + html[profiler.start():]
html = html.replace('</body>', f'<script src="./runtime-shell-v193.js?build={BUILD}"></script>\n</body>', 1)
html_path.write_text(html, 'utf-8')

# One cache generation after the final shell edits.
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
<p>Building Selection Recovery: здания выбираются по видимой фигуре одним кликом; дубли полной модели в одном кадре блокируются.</p>
<a id="launch" href="./frontline-dominion.html?build={BUILD}">Запустить игру</a><p>v{VERSION} · build {BUILD} · GitHub Pages</p>
</main></body></html>'''
(OUT / 'index.html').write_text(launcher, 'utf-8')

final_html = html_path.read_text('utf-8')
required = [
    f'building-selection-v193.js?build={BUILD}',
    f'runtime-ui-v193.js?build={BUILD}',
    f'runtime-shell-v193.js?build={BUILD}',
]
for item in required:
    if final_html.count(item) != 1:
        raise RuntimeError(f'build 193 owner count invalid: {item}')
if 'runtime-ui-v192.js?build=193' in final_html or 'runtime-shell-v192.js?build=193' in final_html:
    raise RuntimeError('build 193 historical runtime owner remains connected')
if final_html.index(f'building-selection-v193.js?build={BUILD}') > final_html.index(f'runtime-ui-v193.js?build={BUILD}'):
    raise RuntimeError('build 193 building selection must load before runtime UI')
if '__FD_BUILDING_SELECTION_193__' not in (OUT / 'building-selection-v193.js').read_text('utf-8'):
    raise RuntimeError('build 193 selection API missing')

print(f'Frontline Dominion v{VERSION} build {BUILD} building selection recovery assembled')
