from pathlib import Path
import re

ROOT = Path('.')
OUT = ROOT / 'dist'
BUILD = 195
VERSION = '16.8.11'

html_path = OUT / 'frontline-dominion.html'
bridge_path = OUT / 'authoritative-simulation-v174.js'
worker_path = OUT / 'authoritative-simulation-worker-v174.js'
ui194 = OUT / 'runtime-ui-v194.js'
shell194 = OUT / 'runtime-shell-v194.js'
profiler_path = OUT / 'simulation-profiler-v166.js'
perf194 = OUT / 'performance-observability-v194.js'
source = ROOT / 'src' / 'v195' / 'adaptive-visual-lod-v195.js'

for path in (html_path, bridge_path, worker_path, ui194, shell194, profiler_path, perf194, source):
    if not path.exists():
        raise RuntimeError(f'build 195 required file missing: {path}')

(OUT / 'adaptive-visual-lod-v195.js').write_text(source.read_text('utf-8'), 'utf-8')

ui = ui194.read_text('utf-8')
ui = re.sub(r"const VERSION = '16\.8\.[0-9]+';", f"const VERSION = '{VERSION}';", ui, count=1)
ui = re.sub(r'const BUILD = \d+;', f'const BUILD = {BUILD};', ui, count=1)
ui = ui.replace('__FD_RUNTIME_UI_194__', '__FD_RUNTIME_UI_195__').replace('[FD194]', '[FD195]')
(OUT / 'runtime-ui-v195.js').write_text(ui, 'utf-8')

shell = shell194.read_text('utf-8')
shell = re.sub(r"const VERSION = '16\.8\.[0-9]+';", f"const VERSION = '{VERSION}';", shell, count=1)
shell = re.sub(r'const BUILD = \d+;', f'const BUILD = {BUILD};', shell, count=1)
shell = shell.replace('__FD_RUNTIME_SHELL_194__', '__FD_RUNTIME_SHELL_195__')
shell = shell.replace('__FD_BOOT_194__', '__FD_BOOT_195__').replace('[FD194]', '[FD195]')
shell = shell.replace('fd-loading194', 'fd-loading195').replace('fd-ready194', 'fd-ready195').replace('fd-running194', 'fd-running195')
(OUT / 'runtime-shell-v195.js').write_text(shell, 'utf-8')

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
if 'lod195:' not in profiler:
    profiler = profiler.replace(
        '      performance194: window.__FD_PERFORMANCE_194__?.snapshot?.() || {},\n',
        '      performance194: window.__FD_PERFORMANCE_194__?.snapshot?.() || {},\n'
        '      lod195: window.__FD_ADAPTIVE_LOD_195__?.diagnostics?.() || {},\n',
        1,
    )
if 'const lod = s.lod195' not in profiler:
    profiler = profiler.replace(
        '    const p194 = s.performance194 || {};\n',
        '    const p194 = s.performance194 || {};\n'
        '    const lod = s.lod195 || {};\n',
        1,
    )
if '`Visual LOD' not in profiler:
    profiler = profiler.replace(
        '      `Long frames >50/>100  ${int(p194.raf?.over50ms)} / ${int(p194.raf?.over100ms)}`,\n',
        '      `Long frames >50/>100  ${int(p194.raf?.over50ms)} / ${int(p194.raf?.over100ms)}`,\n'
        '      `Visual LOD             ${lod.tierName || \'—\'} · tier ${int(lod.tier)} · budget ${int(lod.budget)}`,\n'
        '      `LOD detail/omitted     ${int(lod.detailedUnits)} / ${int(lod.omittedUnits)} · clusters ${int(lod.clusters)}`,\n'
        '      `LOD pressure           ${lod.pressureReason || \'—\'} · changes ${int(lod.tierChanges)} · ${fmt(lod.lastLodMs)} ms`,\n',
        1,
    )
profiler_path.write_text(profiler, 'utf-8')

asset_pattern = re.compile(r"(/frontline-dominion/[^\s\'\"`)]+\.(?:js|json|webp))\?build=\d+")
for path in sorted(OUT.glob('*.js')):
    text = path.read_text('utf-8')
    text = asset_pattern.sub(rf'\1?build={BUILD}', text)
    path.write_text(text, 'utf-8')

html = html_path.read_text('utf-8')
html = re.sub(
    r'\s*<script\b[^>]*src=["\'](?:\./|/frontline-dominion/)(?:runtime-ui-v19[45]|runtime-shell-v19[45]|adaptive-visual-lod-v195)\.js(?:\?build=\d+)?["\'][^>]*></script>',
    '', html, flags=re.I,
)
html = html.replace('fd-boot194-script', 'fd-boot195-script').replace('fd-boot194-style', 'fd-boot195-style')
html = html.replace('__FD_BOOT_194__', '__FD_BOOT_195__')
html = html.replace('fd-loading194', 'fd-loading195').replace('fd-ready194', 'fd-ready195').replace('fd-running194', 'fd-running195')
html = re.sub(r"const VERSION = '16\.8\.[0-9]+', BUILD = \d+;", f"const VERSION = '{VERSION}', BUILD = {BUILD};", html, count=1)
html = re.sub(r'data-fd-canonical-build="\d+"', f'data-fd-canonical-build="{BUILD}"', html, count=1)
html = re.sub(r'<title>.*?</title>', f'<title>Frontline Dominion v{VERSION} — Adaptive Visual LOD</title>', html, count=1, flags=re.S)
html = re.sub(r'ОПЕРАТИВНО-ТАКТИЧЕСКАЯ RTS · v16\.8\.\d+ BUILD \d+', f'ОПЕРАТИВНО-ТАКТИЧЕСКАЯ RTS · v{VERSION} BUILD {BUILD}', html, count=1)
html = re.sub(
    r'<p class=["\']lead["\']>.*?</p>',
    '<p class="lead">Адаптивная визуальная детализация снижает нагрузку больших армий; authoritative Worker и игровая логика остаются неизменными.</p>',
    html, count=1, flags=re.S,
)

def cache_bust(match):
    return f'{match.group(1)}?build={BUILD}{match.group(2)}'

html = re.sub(
    r'(<script\b[^>]*\bsrc=["\'](?:\./|/frontline-dominion/)[^"\']+\.js)(?:\?build=\d+)?(["\'][^>]*></script>)',
    cache_bust, html, flags=re.I,
)

perf_tag = re.search(
    rf'<script\b[^>]*src=["\'](?:\./|/frontline-dominion/)performance-observability-v194\.js\?build={BUILD}["\'][^>]*></script>',
    html, flags=re.I,
)
profiler_tag = re.search(
    rf'<script\b[^>]*src=["\'](?:\./|/frontline-dominion/)simulation-profiler-v166\.js\?build={BUILD}["\'][^>]*></script>',
    html, flags=re.I,
)
if not perf_tag or not profiler_tag:
    raise RuntimeError('build 195 runtime HTML anchors missing')
if perf_tag.start() > profiler_tag.start():
    raise RuntimeError('build 195 performance layer is not before profiler')
block = (
    f'<script src="./adaptive-visual-lod-v195.js?build={BUILD}"></script>\n'
    f'<script src="./runtime-ui-v195.js?build={BUILD}"></script>\n'
)
html = html[:profiler_tag.start()] + block + html[profiler_tag.start():]
html = html.replace('</body>', f'<script src="./runtime-shell-v195.js?build={BUILD}"></script>\n</body>', 1)
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
<p>Adaptive Visual LOD: большие массы агрегируются только визуально; выбранные, боевые и воздушные юниты остаются детальными.</p>
<a id="launch" href="./frontline-dominion.html?build={BUILD}">Запустить игру</a><p>v{VERSION} · build {BUILD} · GitHub Pages</p>
</main></body></html>'''
(OUT / 'index.html').write_text(launcher, 'utf-8')

final_html = html_path.read_text('utf-8')
required = [
    f'building-selection-v193.js?build={BUILD}',
    f'performance-observability-v194.js?build={BUILD}',
    f'adaptive-visual-lod-v195.js?build={BUILD}',
    f'runtime-ui-v195.js?build={BUILD}',
    f'simulation-profiler-v166.js?build={BUILD}',
    f'runtime-shell-v195.js?build={BUILD}',
]
for item in required:
    if final_html.count(item) != 1:
        raise RuntimeError(f'build 195 owner count invalid: {item}')
if 'runtime-ui-v194.js?build=195' in final_html or 'runtime-shell-v194.js?build=195' in final_html:
    raise RuntimeError('build 195 historical runtime owner remains connected')
order = [final_html.index(item) for item in required[1:5]]
if order != sorted(order):
    raise RuntimeError('build 195 performance/LOD/runtime/profiler load order invalid')
lod = (OUT / 'adaptive-visual-lod-v195.js').read_text('utf-8')
for marker in ('__FD_ADAPTIVE_LOD_195__', 'if (unit.air) return true', 'clusters94', 'RECOVER_SAMPLES'):
    if marker not in lod:
        raise RuntimeError(f'build 195 LOD marker missing: {marker}')
profiler_check = profiler_path.read_text('utf-8')
for marker in ('lod195:', 'Visual LOD', 'LOD detail/omitted'):
    if marker not in profiler_check:
        raise RuntimeError(f'build 195 profiler LOD metric missing: {marker}')

print(f'Frontline Dominion v{VERSION} build {BUILD} adaptive visual LOD assembled')
