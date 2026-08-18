from pathlib import Path
import re

ROOT = Path('.')
OUT = ROOT / 'dist'
BUILD = 194
VERSION = '16.8.10'

html_path = OUT / 'frontline-dominion.html'
bridge_path = OUT / 'authoritative-simulation-v174.js'
worker_path = OUT / 'authoritative-simulation-worker-v174.js'
ui193 = OUT / 'runtime-ui-v193.js'
shell193 = OUT / 'runtime-shell-v193.js'
profiler_path = OUT / 'simulation-profiler-v166.js'
source = ROOT / 'src' / 'v194' / 'performance-observability-v194.js'

for path in (html_path, bridge_path, worker_path, ui193, shell193, profiler_path, source):
    if not path.exists():
        raise RuntimeError(f'build 194 required file missing: {path}')

(OUT / 'performance-observability-v194.js').write_text(source.read_text('utf-8'), 'utf-8')

ui = ui193.read_text('utf-8')
ui = ui.replace("const VERSION = '16.8.9';", f"const VERSION = '{VERSION}';", 1)
ui = ui.replace('const BUILD = 193;', f'const BUILD = {BUILD};', 1)
ui = ui.replace('__FD_RUNTIME_UI_193__', '__FD_RUNTIME_UI_194__').replace('[FD193]', '[FD194]')
(OUT / 'runtime-ui-v194.js').write_text(ui, 'utf-8')

shell = shell193.read_text('utf-8')
shell = shell.replace("const VERSION = '16.8.9';", f"const VERSION = '{VERSION}';", 1)
shell = shell.replace('const BUILD = 193;', f'const BUILD = {BUILD};', 1)
shell = shell.replace('__FD_RUNTIME_SHELL_193__', '__FD_RUNTIME_SHELL_194__')
shell = shell.replace('__FD_BOOT_193__', '__FD_BOOT_194__').replace('[FD193]', '[FD194]')
shell = shell.replace('fd-loading193', 'fd-loading194').replace('fd-ready193', 'fd-ready194').replace('fd-running193', 'fd-running194')
(OUT / 'runtime-shell-v194.js').write_text(shell, 'utf-8')

for path in (bridge_path, worker_path):
    text = path.read_text('utf-8')
    text = re.sub(r'const BUILD = \d+;', f'const BUILD = {BUILD};', text, count=1)
    text = re.sub(r"const VERSION = '16\.8\.[0-9]+';", f"const VERSION = '{VERSION}';", text, count=1)
    text = re.sub(r'authoritative-simulation-worker-v174\.js\?build=\d+', f'authoritative-simulation-worker-v174.js?build={BUILD}', text)
    text = re.sub(r"version: '16\.8\.[0-9]+', build: \d+", f"version: '{VERSION}', build: {BUILD}", text)
    path.write_text(text, 'utf-8')

# Extend the existing F10 profiler with frame/event-loop/snapshot metrics without
# introducing another overlay or another simulation owner.
profiler = profiler_path.read_text('utf-8')
profiler = re.sub(r"const VERSION = '16\.8\.[0-9]+';", f"const VERSION = '{VERSION}';", profiler, count=1)
profiler = re.sub(r'const BUILD = \d+;', f'const BUILD = {BUILD};', profiler, count=1)
if 'performance194:' not in profiler:
    profiler = profiler.replace(
        '      sharedFallbacks: bridge?.sharedFallbacks165,\n',
        '      sharedFallbacks: bridge?.sharedFallbacks165,\n'
        '      performance194: window.__FD_PERFORMANCE_194__?.snapshot?.() || {},\n',
        1,
    )
if 'const p194 = s.performance194' not in profiler:
    profiler = profiler.replace(
        '    const ob = s.objective || {};\n',
        '    const ob = s.objective || {};\n'
        '    const p194 = s.performance194 || {};\n',
        1,
    )
if '`Frame avg / p95' not in profiler:
    profiler = profiler.replace(
        '      `Worker avg / max      ${fmt(p.averageTickMs)} / ${fmt(p.maxTickMs)} ms`,\n',
        '      `Worker avg / max      ${fmt(p.averageTickMs)} / ${fmt(p.maxTickMs)} ms`,\n'
        '      `Frame avg / p95       ${fmt(p194.raf?.averageMs)} / ${fmt(p194.raf?.p95Ms)} ms`,\n'
        '      `Frame p99 / max       ${fmt(p194.raf?.p99Ms)} / ${fmt(p194.raf?.maxMs)} ms`,\n'
        '      `Event-loop p95 / max  ${fmt(p194.eventLoop?.p95Ms)} / ${fmt(p194.eventLoop?.maxMs)} ms`,\n'
        '      `Render snapshot p95   ${fmt(p194.renderSnapshot?.p95Ms)} ms · calls ${int(p194.renderSnapshot?.calls)}`,\n'
        '      `Long frames >50/>100  ${int(p194.raf?.over50ms)} / ${int(p194.raf?.over100ms)}`,\n',
        1,
    )
profiler_path.write_text(profiler, 'utf-8')

# One immutable cache generation for every browser-loaded runtime asset.
asset_pattern = re.compile(r"(/frontline-dominion/[^\s\'\"`)]+\.(?:js|json|webp))\?build=\d+")
for path in sorted(OUT.glob('*.js')):
    text = path.read_text('utf-8')
    text = asset_pattern.sub(rf'\1?build={BUILD}', text)
    path.write_text(text, 'utf-8')

html = html_path.read_text('utf-8')
html = re.sub(
    r'\s*<script\b[^>]*src=["\'](?:\./|/frontline-dominion/)(?:runtime-ui-v19[34]|runtime-shell-v19[34]|performance-observability-v194)\.js(?:\?build=\d+)?["\'][^>]*></script>',
    '', html, flags=re.I,
)
html = html.replace('fd-boot193-script', 'fd-boot194-script').replace('fd-boot193-style', 'fd-boot194-style')
html = html.replace('__FD_BOOT_193__', '__FD_BOOT_194__')
html = html.replace('fd-loading193', 'fd-loading194').replace('fd-ready193', 'fd-ready194').replace('fd-running193', 'fd-running194')
html = re.sub(r"const VERSION = '16\.8\.[0-9]+', BUILD = \d+;", f"const VERSION = '{VERSION}', BUILD = {BUILD};", html, count=1)
html = re.sub(r'data-fd-canonical-build="\d+"', f'data-fd-canonical-build="{BUILD}"', html, count=1)
html = re.sub(r'<title>.*?</title>', f'<title>Frontline Dominion v{VERSION} — Performance Baseline</title>', html, count=1, flags=re.S)
html = re.sub(r'ОПЕРАТИВНО-ТАКТИЧЕСКАЯ RTS · v16\.8\.\d+ BUILD \d+', f'ОПЕРАТИВНО-ТАКТИЧЕСКАЯ RTS · v{VERSION} BUILD {BUILD}', html, count=1)
html = re.sub(
    r'<p class=["\']lead["\']>.*?</p>',
    '<p class="lead">Измеряем реальный кадр, event-loop и authoritative Worker; игровая логика build 193 сохранена без изменений.</p>',
    html, count=1, flags=re.S,
)

def cache_bust(match):
    return f'{match.group(1)}?build={BUILD}{match.group(2)}'

html = re.sub(
    r'(<script\b[^>]*\bsrc=["\'](?:\./|/frontline-dominion/)[^"\']+\.js)(?:\?build=\d+)?(["\'][^>]*></script>)',
    cache_bust, html, flags=re.I,
)

profiler_tag = re.search(
    rf'<script\b[^>]*src=["\'](?:\./|/frontline-dominion/)simulation-profiler-v166\.js\?build={BUILD}["\'][^>]*></script>',
    html, flags=re.I,
)
if not profiler_tag:
    raise RuntimeError('build 194 profiler HTML anchor missing')
block = (
    f'<script src="./performance-observability-v194.js?build={BUILD}"></script>\n'
    f'<script src="./runtime-ui-v194.js?build={BUILD}"></script>\n'
)
html = html[:profiler_tag.start()] + block + html[profiler_tag.start():]
html = html.replace('</body>', f'<script src="./runtime-shell-v194.js?build={BUILD}"></script>\n</body>', 1)
html_path.write_text(html, 'utf-8')

# Re-bust internal URLs after all generated runtime files exist.
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
<p>Performance Baseline: измерение RAF, event-loop, render snapshot и authoritative Worker без изменения боевой логики.</p>
<a id="launch" href="./frontline-dominion.html?build={BUILD}">Запустить игру</a><p>v{VERSION} · build {BUILD} · GitHub Pages</p>
</main></body></html>'''
(OUT / 'index.html').write_text(launcher, 'utf-8')

final_html = html_path.read_text('utf-8')
required = [
    f'building-selection-v193.js?build={BUILD}',
    f'performance-observability-v194.js?build={BUILD}',
    f'runtime-ui-v194.js?build={BUILD}',
    f'simulation-profiler-v166.js?build={BUILD}',
    f'runtime-shell-v194.js?build={BUILD}',
]
for item in required:
    if final_html.count(item) != 1:
        raise RuntimeError(f'build 194 owner count invalid: {item}')
if 'runtime-ui-v193.js?build=194' in final_html or 'runtime-shell-v193.js?build=194' in final_html:
    raise RuntimeError('build 194 historical runtime owner remains connected')
if final_html.index(f'performance-observability-v194.js?build={BUILD}') > final_html.index(f'simulation-profiler-v166.js?build={BUILD}'):
    raise RuntimeError('build 194 performance observability must load before profiler')
if final_html.index(f'performance-observability-v194.js?build={BUILD}') > final_html.index(f'runtime-ui-v194.js?build={BUILD}'):
    raise RuntimeError('build 194 performance observability must load before runtime UI')
perf = (OUT / 'performance-observability-v194.js').read_text('utf-8')
if '__FD_PERFORMANCE_194__' not in perf or 'enableRenderStress' not in perf:
    raise RuntimeError('build 194 performance API missing')
profiler_check = profiler_path.read_text('utf-8')
for marker in ('performance194:', 'Frame avg / p95', 'Render snapshot p95'):
    if marker not in profiler_check:
        raise RuntimeError(f'build 194 profiler metric missing: {marker}')

print(f'Frontline Dominion v{VERSION} build {BUILD} performance baseline assembled')
