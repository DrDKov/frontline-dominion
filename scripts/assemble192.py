from pathlib import Path
import re

ROOT = Path('.')
OUT = ROOT / 'dist'
VERSION = '16.8.8'
BUILD = 192

source = ROOT / 'src' / 'v192' / 'resource-extraction-authority-v192.js'
html_path = OUT / 'frontline-dominion.html'
bridge_path = OUT / 'authoritative-simulation-v174.js'
worker_path = OUT / 'authoritative-simulation-worker-v174.js'
shell191 = OUT / 'runtime-shell-v191.js'
ui191 = OUT / 'runtime-ui-v191.js'

for path in (source, html_path, bridge_path, worker_path, shell191, ui191):
    if not path.exists():
        raise RuntimeError(f'build 192 required file missing: {path}')

(OUT / 'resource-extraction-authority-v192.js').write_text(source.read_text('utf-8'), 'utf-8')

# Keep the proven launch/save owners, only move them into the new immutable
# generation. Engineer geometry deliberately remains the approved v191 owner.
shell = shell191.read_text('utf-8')
shell = shell.replace("const VERSION = '16.8.7';", f"const VERSION = '{VERSION}';", 1)
shell = shell.replace('const BUILD = 191;', f'const BUILD = {BUILD};', 1)
shell = shell.replace('__FD_RUNTIME_SHELL_191__', '__FD_RUNTIME_SHELL_192__')
shell = shell.replace('__FD_BOOT_191__', '__FD_BOOT_192__')
shell = shell.replace('[FD191]', '[FD192]')
shell = shell.replace('fd-loading191', 'fd-loading192').replace('fd-ready191', 'fd-ready192').replace('fd-running191', 'fd-running192')
(OUT / 'runtime-shell-v192.js').write_text(shell, 'utf-8')

ui = ui191.read_text('utf-8')
ui = ui.replace("const VERSION = '16.8.7';", f"const VERSION = '{VERSION}';", 1)
ui = ui.replace('const BUILD = 191;', f'const BUILD = {BUILD};', 1)
ui = ui.replace('__FD_RUNTIME_UI_191__', '__FD_RUNTIME_UI_192__')
ui = ui.replace('[FD191]', '[FD192]')
(OUT / 'runtime-ui-v192.js').write_text(ui, 'utf-8')

# ---------------------------------------------------------------------------
# Main authoritative bridge: normal construction must carry worker selection
# explicitly; resource construction has its own Worker-owned action.
# ---------------------------------------------------------------------------
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
old_build_encoder = "wrapGameAction('placeBuilding', 'build', function([x,y,append,rotation]) {\n  if (!this.buildMode?.typeId) return null;\n  return { x,y,append:Boolean(append),rotation,typeId:this.buildMode.typeId,workerIds:[...(this.buildMode.workerIds||[])] };\n}"
new_build_encoder = "wrapGameAction('placeBuilding', 'build', function([x,y,append,rotation]) {\n  if (!this.buildMode?.typeId) return null;\n  const workerIds = [...(this.buildMode.workerIds || [])];\n  return { x,y,append:Boolean(append),rotation,typeId:this.buildMode.typeId,workerIds,selectedIds:workerIds };\n}"
if old_build_encoder not in bridge:
    raise RuntimeError('build 192 normal construction encoder anchor missing')
bridge = bridge.replace(old_build_encoder, new_build_encoder, 1)
bridge_path.write_text(bridge, 'utf-8')

# ---------------------------------------------------------------------------
# Worker: the legacy resource helper remains useful only here, where
# placeBuilding is synchronous and authoritative. It must never run on the UI
# mirror. No unrelated unit/building may disappear during this atomic action.
# ---------------------------------------------------------------------------
worker = worker_path.read_text('utf-8')
worker = re.sub(r'const BUILD = \d+;', f'const BUILD = {BUILD};', worker, count=1)
worker = re.sub(r"const VERSION = '16\.8\.[0-9]+';", f"const VERSION = '{VERSION}';", worker, count=1)
resource_case = """      case 'buildResourceExtractor': {
        const node = game.getEntity(payload.resourceId);
        const requestedWorkerIds = [...(payload.workerIds || [])];
        const workers = requestedWorkerIds
          .map(id => game.getEntity(id))
          .filter(unit => unit?.alive && unit.team === 'player' && unit.typeId === 'worker' && !unit.embarkedIn);
        if (!node?.alive || node.kind !== 'resource' || !workers.length || workers.length !== requestedWorkerIds.length) {
          result = false;
          break;
        }
        const beforeUnits = new Map(game.units.filter(unit => unit?.alive).map(unit => [unit.id, unit]));
        const beforeBuildings = new Map(game.buildings.filter(building => building?.alive).map(building => [building.id, building]));
        result = game.buildExtractorFromResource83?.(node) ?? false;
        if (result !== false) {
          const missingUnits = [...beforeUnits.keys()].filter(id => !game.getEntity(id)?.alive);
          const missingBuildings = [...beforeBuildings.keys()].filter(id => !game.getEntity(id)?.alive);
          if (missingUnits.length || missingBuildings.length) {
            throw new Error(`Resource extractor build removed unrelated entities: units=${missingUnits.join(',')} buildings=${missingBuildings.join(',')}`);
          }
        }
        break;
      }
"""
anchor = "      case 'build': {\n"
if anchor not in worker:
    raise RuntimeError('build 192 Worker build switch anchor missing')
if "case 'buildResourceExtractor'" not in worker:
    worker = worker.replace(anchor, resource_case + anchor, 1)
worker_path.write_text(worker, 'utf-8')

# One cache generation for all imported JS/assets.
asset_pattern = re.compile(r"(/frontline-dominion/[^\s\'\"`)]+\.(?:js|json|webp))\?build=\d+")
for path in sorted(OUT.glob('*.js')):
    text = path.read_text('utf-8')
    text = asset_pattern.sub(rf'\1?build={BUILD}', text)
    path.write_text(text, 'utf-8')

# ---------------------------------------------------------------------------
# Browser shell: exactly one current boot owner. v191 engineer parity remains
# unchanged and is intentionally not renamed or regenerated.
# ---------------------------------------------------------------------------
html = html_path.read_text('utf-8')
html = re.sub(
    r'\s*<script\b[^>]*src=["\'](?:\./|/frontline-dominion/)(?:resource-extraction-authority-v192|runtime-ui-v19[12]|runtime-shell-v19[12])\.js(?:\?build=\d+)?["\'][^>]*></script>',
    '',
    html,
    flags=re.I,
)
html = html.replace('fd-boot191-script', 'fd-boot192-script')
html = html.replace('fd-boot191-style', 'fd-boot192-style')
html = html.replace('__FD_BOOT_191__', '__FD_BOOT_192__')
html = html.replace('fd-loading191', 'fd-loading192').replace('fd-ready191', 'fd-ready192')
html = html.replace("const VERSION = '16.8.7', BUILD = 191;", f"const VERSION = '{VERSION}', BUILD = {BUILD};", 1)
html = html.replace('data-fd-canonical-build="191"', f'data-fd-canonical-build="{BUILD}"', 1)
html = re.sub(r'<title>.*?</title>', f'<title>Frontline Dominion v{VERSION} — Authoritative Resource Recovery</title>', html, count=1, flags=re.S)
html = html.replace('ОПЕРАТИВНО-ТАКТИЧЕСКАЯ RTS · v16.8.7 BUILD 191', f'ОПЕРАТИВНО-ТАКТИЧЕСКАЯ RTS · v{VERSION} BUILD {BUILD}')
html = html.replace(
    'Восстановлено выполнение приказов; инженер физически и визуально равен ракетчику, включая выделение и индикаторы.',
    'Рудообогатительный рудник строится только в authoritative Worker; масштаб инженеров сохранён без изменений.'
)

# Rewrite all external script cache keys, then install the dedicated resource
# owner immediately after the authoritative bridge.
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
    raise RuntimeError('build 192 authoritative bridge tag missing')
html = html.replace(
    bridge_tag,
    bridge_tag + f'\n<script src="./resource-extraction-authority-v192.js?build={BUILD}"></script>',
    1,
)

# Replace the previous runtime UI/shell owners with the new aliases.
profiler_match = re.search(
    rf'<script\b[^>]*src=["\'](?:\./|/frontline-dominion/)simulation-profiler-v166\.js\?build={BUILD}["\'][^>]*></script>',
    html,
    flags=re.I,
)
if not profiler_match:
    raise RuntimeError('build 192 profiler tag missing')
html = html[:profiler_match.start()] + f'<script src="./runtime-ui-v192.js?build={BUILD}"></script>\n' + html[profiler_match.start():]
html = html.replace('</body>', f'<script src="./runtime-shell-v192.js?build={BUILD}"></script>\n</body>', 1)
html_path.write_text(html, 'utf-8')

# Ensure every internal Worker asset uses the same generation after HTML work.
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
<p>Authoritative Resource Recovery: безопасное строительство рудника без исчезновения армии; размер инженеров сохранён.</p>
<a id="launch" href="./frontline-dominion.html?build={BUILD}">Запустить игру</a><p>v{VERSION} · build {BUILD} · GitHub Pages</p>
</main></body></html>'''
(OUT / 'index.html').write_text(launcher, 'utf-8')

# Release invariants.
final_html = html_path.read_text('utf-8')
if final_html.count(f'resource-extraction-authority-v192.js?build={BUILD}') != 1:
    raise RuntimeError('build 192 resource authority owner count is not one')
if final_html.count(f'runtime-ui-v192.js?build={BUILD}') != 1:
    raise RuntimeError('build 192 runtime UI owner count is not one')
if final_html.count(f'runtime-shell-v192.js?build={BUILD}') != 1:
    raise RuntimeError('build 192 runtime shell owner count is not one')
if 'runtime-shell-v191.js?build=192' in final_html or 'runtime-ui-v191.js?build=192' in final_html:
    raise RuntimeError('build 192 historical runtime owner still connected')
if "case 'buildResourceExtractor'" not in worker_path.read_text('utf-8'):
    raise RuntimeError('build 192 Worker resource action missing')

print(f'Frontline Dominion v{VERSION} build {BUILD} authoritative resource recovery assembled')
