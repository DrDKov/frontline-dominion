from pathlib import Path
import re

ROOT = Path('.')
OUT = ROOT / 'dist'
BUILD = 203
VERSION = '16.8.19'

html_path = OUT / 'frontline-dominion.html'
bridge_path = OUT / 'authoritative-simulation-v174.js'
worker_path = OUT / 'authoritative-simulation-worker-v174.js'
ui202_path = OUT / 'runtime-ui-v202.js'
shell202_path = OUT / 'runtime-shell-v202.js'
profiler_path = OUT / 'simulation-profiler-v166.js'
feature_source = ROOT / 'src' / 'v203' / 'recon-memory-production-v203.js'
feature_path = OUT / feature_source.name

for path in [
    html_path, bridge_path, worker_path, ui202_path, shell202_path,
    profiler_path, feature_source,
]:
    if not path.exists():
        raise RuntimeError(f'build 203 required file missing: {path}')

feature_path.write_text(feature_source.read_text('utf-8'), 'utf-8')

# The Worker previously hashed only eight queue entries and used legacy field
# names that are absent from the current queue item. Delegate the complete
# ten-slot signature to the v203 owner imported in both runtimes.
worker = worker_path.read_text('utf-8')
worker = re.sub(
    r"\nimportScripts\('/frontline-dominion/recon-memory-production-v203\.js\?build=\d+'\);",
    '', worker,
)
power_import_pattern = re.compile(
    r"importScripts\('/frontline-dominion/command-power-authority-v202\.js\?build=\d+'\);"
)
power_import_match = power_import_pattern.search(worker)
if not power_import_match:
    raise RuntimeError('build 203 Worker command-power import anchor missing')
feature_import = f"importScripts('/frontline-dominion/recon-memory-production-v203.js?build={BUILD}');"
worker = worker[:power_import_match.end()] + '\n' + feature_import + worker[power_import_match.end():]

signature_pattern = re.compile(
    r"function buildingDetailSignature165\(building\) \{.*?\n\}\n\nfunction sendBuildingState165",
    re.S,
)
signature_replacement = """function buildingDetailSignature165(building) {
  const authority203 = self.__FD_RECON_MEMORY_QUEUE_203__;
  if (!authority203?.queueSignature) throw new Error('Build 203 production queue authority is unavailable');
  return authority203.queueSignature(building);
}

function sendBuildingState165"""
worker, signature_count = signature_pattern.subn(signature_replacement, worker, count=1)
if signature_count != 1:
    raise RuntimeError(f'build 203 queue signature anchor invalid: {signature_count}')

worker_diag_anchor = "        commandPower202: self.__FD_COMMAND_POWER_AUTHORITY_202__?.diagnostics?.() || null,\n"
worker_diag_replacement = worker_diag_anchor + "        reconMemoryQueue203: self.__FD_RECON_MEMORY_QUEUE_203__?.diagnostics?.() || null,\n"
worker = worker.replace("        reconMemoryQueue203: self.__FD_RECON_MEMORY_QUEUE_203__?.diagnostics?.() || null,\n", '')
if worker.count(worker_diag_anchor) != 1:
    raise RuntimeError('build 203 Worker diagnostics anchor missing')
worker = worker.replace(worker_diag_anchor, worker_diag_replacement, 1)
worker_path.write_text(worker, 'utf-8')

ui = ui202_path.read_text('utf-8')
ui = re.sub(r"const VERSION = '16\.8\.[0-9]+';", f"const VERSION = '{VERSION}';", ui, count=1)
ui = re.sub(r'const BUILD = \d+;', f'const BUILD = {BUILD};', ui, count=1)
ui = ui.replace('__FD_RUNTIME_UI_202__', '__FD_RUNTIME_UI_203__').replace('[FD202]', '[FD203]')
(OUT / 'runtime-ui-v203.js').write_text(ui, 'utf-8')

shell = shell202_path.read_text('utf-8')
shell = re.sub(r"const VERSION = '16\.8\.[0-9]+';", f"const VERSION = '{VERSION}';", shell, count=1)
shell = re.sub(r'const BUILD = \d+;', f'const BUILD = {BUILD};', shell, count=1)
shell = shell.replace('__FD_RUNTIME_SHELL_202__', '__FD_RUNTIME_SHELL_203__')
shell = shell.replace('__FD_BOOT_202__', '__FD_BOOT_203__').replace('[FD202]', '[FD203]')
shell = shell.replace('fd-loading202', 'fd-loading203').replace('fd-ready202', 'fd-ready203').replace('fd-running202', 'fd-running203')
(OUT / 'runtime-shell-v203.js').write_text(shell, 'utf-8')

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
    r'\s*<script\b[^>]*src=["\'](?:\./|/frontline-dominion/)(?:runtime-ui-v(?:202|203)|runtime-shell-v(?:202|203)|recon-memory-production-v203)\.js(?:\?build=\d+)?["\'][^>]*></script>',
    '', html, flags=re.I,
)
html = html.replace('fd-boot202-script', 'fd-boot203-script').replace('fd-boot202-style', 'fd-boot203-style')
html = html.replace('__FD_BOOT_202__', '__FD_BOOT_203__')
html = html.replace('fd-loading202', 'fd-loading203').replace('fd-ready202', 'fd-ready203').replace('fd-running202', 'fd-running203')
html = re.sub(r"const VERSION = '16\.8\.[0-9]+', BUILD = \d+;", f"const VERSION = '{VERSION}', BUILD = {BUILD};", html, count=1)
html = re.sub(r'data-fd-canonical-build="\d+"', f'data-fd-canonical-build="{BUILD}"', html, count=1)
html = re.sub(r'<title>.*?</title>', f'<title>Frontline Dominion v{VERSION} — Fog Memory &amp; Production Queue</title>', html, count=1, flags=re.S)
html = re.sub(
    r'ОПЕРАТИВНО-ТАКТИЧЕСКАЯ RTS · v16\.8\.\d+ BUILD \d+',
    f'ОПЕРАТИВНО-ТАКТИЧЕСКАЯ RTS · v{VERSION} BUILD {BUILD}', html, count=1,
)
html = re.sub(
    r'<p class=["\']lead["\']>.*?</p>',
    '<p class="lead">Разведка запоминает точные снимки обнаруженных зданий; очередь производства синхронизирует все 10 слотов.</p>',
    html, count=1, flags=re.S,
)

def cache_bust(match):
    return f'{match.group(1)}?build={BUILD}{match.group(2)}'

html = re.sub(
    r'(<script\b[^>]*\bsrc=["\'](?:\./|/frontline-dominion/)[^"\']+\.js)(?:\?build=\d+)?(["\'][^>]*></script>)',
    cache_bust, html, flags=re.I,
)

power_tag = f'<script src="./command-power-authority-v202.js?build={BUILD}"></script>'
if power_tag not in html:
    raise RuntimeError('build 203 command-power HTML anchor missing')
html = html.replace(
    power_tag,
    power_tag + f'\n<script src="./recon-memory-production-v203.js?build={BUILD}"></script>\n<script src="./runtime-ui-v203.js?build={BUILD}"></script>',
    1,
)
html = html.replace('</body>', f'<script src="./runtime-shell-v203.js?build={BUILD}"></script>\n</body>', 1)
html_path.write_text(html, 'utf-8')

for path in sorted(OUT.glob('*.js')):
    text = path.read_text('utf-8')
    text = asset_pattern.sub(rf'\1?build={BUILD}', text)
    path.write_text(text, 'utf-8')

launcher = f'''<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="color-scheme" content="dark"><title>Frontline Dominion v{VERSION}</title><style>*{{box-sizing:border-box}}html,body{{margin:0;min-height:100%;background:#050b10;color:#dcecf4;font-family:system-ui,sans-serif}}body{{display:grid;place-items:center;min-height:100vh;padding:24px;background:#071019}}main{{width:min(720px,100%);padding:36px;border:1px solid #365363;border-radius:18px;background:#0a151d}}a{{display:inline-flex;min-height:54px;align-items:center;padding:0 24px;border-radius:10px;background:#d9edf7;color:#071019;text-decoration:none;font-weight:900}}</style></head><body><main><div>ЕДИНСТВЕННАЯ АКТУАЛЬНАЯ СБОРКА · BUILD {BUILD}</div><h1>Frontline Dominion</h1><p>Туман войны хранит неподвижный снимок разведанных зданий, скрывает юниты и не раскрывает изменения без повторной разведки. Очередь производства отображает все 10 заказов.</p><a id="launch" href="./frontline-dominion.html?build={BUILD}">Запустить игру</a><p>v{VERSION} · build {BUILD} · GitHub Pages</p></main></body></html>'''
(OUT / 'index.html').write_text(launcher, 'utf-8')

final_html = html_path.read_text('utf-8')
required = [
    f'command-power-authority-v202.js?build={BUILD}',
    f'recon-memory-production-v203.js?build={BUILD}',
    f'runtime-ui-v203.js?build={BUILD}',
    f'runtime-shell-v203.js?build={BUILD}',
]
for item in required:
    if final_html.count(item) != 1:
        raise RuntimeError(f'build 203 owner count invalid: {item}')
if 'runtime-shell-v202.js?build=203' in final_html or 'runtime-ui-v202.js?build=203' in final_html:
    raise RuntimeError('build 203 still loads obsolete runtime owner')
worker_final = worker_path.read_text('utf-8')
if worker_final.count(feature_import) != 1:
    raise RuntimeError('build 203 Worker feature owner count invalid')
if 'authority203.queueSignature(building)' not in worker_final:
    raise RuntimeError('build 203 complete production queue signature missing')
if 'reconMemoryQueue203:' not in worker_final:
    raise RuntimeError('build 203 Worker diagnostics missing')

print(f'Frontline Dominion v{VERSION} build {BUILD} fog memory and production queue assembled')
