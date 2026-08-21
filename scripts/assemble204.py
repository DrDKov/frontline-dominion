from pathlib import Path
import re

ROOT = Path('.')
OUT = ROOT / 'dist'
BUILD = 204
VERSION = '16.8.20'

html_path = OUT / 'frontline-dominion.html'
bridge_path = OUT / 'authoritative-simulation-v174.js'
worker_path = OUT / 'authoritative-simulation-worker-v174.js'
ui203_path = OUT / 'runtime-ui-v203.js'
shell203_path = OUT / 'runtime-shell-v203.js'
profiler_path = OUT / 'simulation-profiler-v166.js'
visible_hit_source = ROOT / 'src' / 'v204' / 'building-visible-hit-v204.js'
rally_source = ROOT / 'src' / 'v204' / 'rally-point-authority-v204.js'
visible_hit_path = OUT / visible_hit_source.name
rally_path = OUT / rally_source.name

for path in [
    html_path, bridge_path, worker_path, ui203_path, shell203_path,
    profiler_path, visible_hit_source, rally_source,
]:
    if not path.exists():
        raise RuntimeError(f'build 204 required file missing: {path}')

visible_hit_path.write_text(visible_hit_source.read_text('utf-8'), 'utf-8')
rally_path.write_text(rally_source.read_text('utf-8'), 'utf-8')

ui = ui203_path.read_text('utf-8')
ui = re.sub(r"const VERSION = '16\.8\.[0-9]+';", f"const VERSION = '{VERSION}';", ui, count=1)
ui = re.sub(r'const BUILD = \d+;', f'const BUILD = {BUILD};', ui, count=1)
ui = ui.replace('__FD_RUNTIME_UI_203__', '__FD_RUNTIME_UI_204__').replace('[FD203]', '[FD204]')
(OUT / 'runtime-ui-v204.js').write_text(ui, 'utf-8')

shell = shell203_path.read_text('utf-8')
shell = re.sub(r"const VERSION = '16\.8\.[0-9]+';", f"const VERSION = '{VERSION}';", shell, count=1)
shell = re.sub(r'const BUILD = \d+;', f'const BUILD = {BUILD};', shell, count=1)
shell = shell.replace('__FD_RUNTIME_SHELL_203__', '__FD_RUNTIME_SHELL_204__')
shell = shell.replace('__FD_BOOT_203__', '__FD_BOOT_204__').replace('[FD203]', '[FD204]')
shell = shell.replace('fd-loading203', 'fd-loading204').replace('fd-ready203', 'fd-ready204').replace('fd-running203', 'fd-running204')
(OUT / 'runtime-shell-v204.js').write_text(shell, 'utf-8')

for path in (bridge_path, worker_path, profiler_path):
    text = path.read_text('utf-8')
    text = re.sub(r'const BUILD = \d+;', f'const BUILD = {BUILD};', text, count=1)
    text = re.sub(r"const VERSION = '16\.8\.[0-9]+';", f"const VERSION = '{VERSION}';", text, count=1)
    text = re.sub(r'authoritative-simulation-worker-v174\.js\?build=\d+', f'authoritative-simulation-worker-v174.js?build={BUILD}', text)
    text = re.sub(r"version: '16\.8\.[0-9]+', build: \d+", f"version: '{VERSION}', build: {BUILD}", text)
    path.write_text(text, 'utf-8')

asset_pattern = re.compile(r"(/frontline-dominion/[^\s\'\"`)]+\.(?:js|json|webp))\?build=\d+")
for path in sorted(OUT.glob('*.js')):
    text = path.read_text('utf-8')
    text = asset_pattern.sub(rf'\1?build={BUILD}', text)
    path.write_text(text, 'utf-8')

html = html_path.read_text('utf-8')
html = re.sub(
    r'\s*<script\b[^>]*src=["\'](?:\./|/frontline-dominion/)(?:runtime-ui-v(?:203|204)|runtime-shell-v(?:203|204)|building-visible-hit-v204|rally-point-authority-v204)\.js(?:\?build=\d+)?["\'][^>]*></script>',
    '', html, flags=re.I,
)
html = html.replace('fd-boot203-script', 'fd-boot204-script').replace('fd-boot203-style', 'fd-boot204-style')
html = html.replace('__FD_BOOT_203__', '__FD_BOOT_204__')
html = html.replace('fd-loading203', 'fd-loading204').replace('fd-ready203', 'fd-ready204').replace('fd-running203', 'fd-running204')
html = re.sub(r"const VERSION = '16\.8\.[0-9]+', BUILD = \d+;", f"const VERSION = '{VERSION}', BUILD = {BUILD};", html, count=1)
html = re.sub(r'data-fd-canonical-build="\d+"', f'data-fd-canonical-build="{BUILD}"', html, count=1)
html = re.sub(r'<title>.*?</title>', f'<title>Frontline Dominion v{VERSION} — Exact Building Input &amp; Rally Flags</title>', html, count=1, flags=re.S)
html = re.sub(
    r'ОПЕРАТИВНО-ТАКТИЧЕСКАЯ RTS · v16\.8\.\d+ BUILD \d+',
    f'ОПЕРАТИВНО-ТАКТИЧЕСКАЯ RTS · v{VERSION} BUILD {BUILD}', html, count=1,
)
html = re.sub(
    r'<p class=["\']lead["\']>.*?</p>',
    '<p class="lead">ПКМ по производственному зданию ставит точку сбора и видимый флаг; ЛКМ выбирает только непрозрачные пиксели модели без мигания.</p>',
    html, count=1, flags=re.S,
)


def cache_bust(match):
    return f'{match.group(1)}?build={BUILD}{match.group(2)}'


html = re.sub(
    r'(<script\b[^>]*\bsrc=["\'](?:\./|/frontline-dominion/)[^"\']+\.js)(?:\?build=\d+)?(["\'][^>]*></script>)',
    cache_bust, html, flags=re.I,
)

recon_tag = f'<script src="./recon-memory-production-v203.js?build={BUILD}"></script>'
if html.count(recon_tag) != 1:
    raise RuntimeError(f'build 204 recon HTML anchor invalid: {html.count(recon_tag)}')
html = html.replace(
    recon_tag,
    recon_tag + f'\n<script src="./runtime-ui-v204.js?build={BUILD}"></script>',
    1,
)

reset_tag = f'<script src="./interaction-reset-v199.js?build={BUILD}"></script>'
if html.count(reset_tag) != 1:
    raise RuntimeError(f'build 204 interaction-reset anchor invalid: {html.count(reset_tag)}')
html = html.replace(
    reset_tag,
    reset_tag +
    f'\n<script src="./building-visible-hit-v204.js?build={BUILD}"></script>' +
    f'\n<script src="./rally-point-authority-v204.js?build={BUILD}"></script>',
    1,
)
html = html.replace('</body>', f'<script src="./runtime-shell-v204.js?build={BUILD}"></script>\n</body>', 1)
html_path.write_text(html, 'utf-8')

for path in sorted(OUT.glob('*.js')):
    text = path.read_text('utf-8')
    text = asset_pattern.sub(rf'\1?build={BUILD}', text)
    path.write_text(text, 'utf-8')

launcher = f'''<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="color-scheme" content="dark"><title>Frontline Dominion v{VERSION}</title><style>*{{box-sizing:border-box}}html,body{{margin:0;min-height:100%;background:#050b10;color:#dcecf4;font-family:system-ui,sans-serif}}body{{display:grid;place-items:center;min-height:100vh;padding:24px;background:#071019}}main{{width:min(720px,100%);padding:36px;border:1px solid #365363;border-radius:18px;background:#0a151d}}a{{display:inline-flex;min-height:54px;align-items:center;padding:0 24px;border-radius:10px;background:#d9edf7;color:#071019;text-decoration:none;font-weight:900}}</style></head><body><main><div>ЕДИНСТВЕННАЯ АКТУАЛЬНАЯ СБОРКА · BUILD {BUILD}</div><h1>Frontline Dominion</h1><p>Точный выбор здания совпадает с видимыми пикселями модели. ПКМ по земле при выбранном производственном здании устанавливает синхронизированную точку сбора и флаг.</p><a id="launch" href="./frontline-dominion.html?build={BUILD}">Запустить игру</a><p>v{VERSION} · build {BUILD} · GitHub Pages</p></main></body></html>'''
(OUT / 'index.html').write_text(launcher, 'utf-8')

final_html = html_path.read_text('utf-8')
required = [
    f'recon-memory-production-v203.js?build={BUILD}',
    f'building-visible-hit-v204.js?build={BUILD}',
    f'rally-point-authority-v204.js?build={BUILD}',
    f'runtime-ui-v204.js?build={BUILD}',
    f'runtime-shell-v204.js?build={BUILD}',
]
for item in required:
    if final_html.count(item) != 1:
        raise RuntimeError(f'build 204 owner count invalid: {item}')
if 'runtime-shell-v203.js?build=204' in final_html or 'runtime-ui-v203.js?build=204' in final_html:
    raise RuntimeError('build 204 still loads obsolete runtime owner')
if final_html.index(f'right-click-authority-v197.js?build={BUILD}') > final_html.index(f'rally-point-authority-v204.js?build={BUILD}'):
    raise RuntimeError('build 204 rally authority loaded before its right-click owner')

print(f'Frontline Dominion v{VERSION} build {BUILD} exact building input and rally flags assembled')
