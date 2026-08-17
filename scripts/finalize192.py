from pathlib import Path
import re

ROOT = Path('.')
OUT = ROOT / 'dist'
BUILD = 192
worker_path = OUT / 'authoritative-simulation-worker-v174.js'
placement_path = OUT / 'extractor-placement-v190.js'
html_path = OUT / 'frontline-dominion.html'
authority_source = ROOT / 'src' / 'v192' / 'resource-extraction-authority-v192.js'
authority_path = OUT / 'resource-extraction-authority-v192.js'
ui_source = ROOT / 'src' / 'v192' / 'resource-ui-stability-v192.js'
ui_path = OUT / 'resource-ui-stability-v192.js'
render_source = ROOT / 'src' / 'v192' / 'render-state-guard-v192.js'
render_path = OUT / 'render-state-guard-v192.js'

for path in (worker_path, placement_path, html_path, authority_source, ui_source, render_source):
    if not path.exists():
        raise RuntimeError(f'build 192 finalizer missing: {path}')

# Refresh build192 sources after assemble192 copied its initial generation.
authority_path.write_text(authority_source.read_text('utf-8'), 'utf-8')
ui_path.write_text(ui_source.read_text('utf-8'), 'utf-8')
render_path.write_text(render_source.read_text('utf-8'), 'utf-8')

# Resource ownership order is strict: resource-extraction-v114 defines the
# resource UI and legacy helper first; then build192 replaces only the build
# dispatch; then the stable resource UI wraps the final renderer. Loading the
# 192 owners beside the authoritative bridge was too early and let v114 replace
# them later, so a real click never reached sendAction().
html = html_path.read_text('utf-8')
html = re.sub(
    r'\s*<script\b[^>]*src=["\'](?:\./|/frontline-dominion/)(?:resource-extraction-authority-v192|resource-ui-stability-v192|render-state-guard-v192)\.js(?:\?build=\d+)?["\'][^>]*></script>',
    '',
    html,
    flags=re.I,
)
resource_core_match = re.search(
    rf'<script\b[^>]*src=["\'](?:\./|/frontline-dominion/)resource-extraction-v114\.js\?build={BUILD}["\'][^>]*></script>',
    html,
    flags=re.I,
)
if not resource_core_match:
    raise RuntimeError('build 192 resource extraction core HTML anchor missing')
authority_tag = f'<script src="./resource-extraction-authority-v192.js?build={BUILD}"></script>'
ui_tag = f'<script src="./resource-ui-stability-v192.js?build={BUILD}"></script>'
owner_block = resource_core_match.group(0) + '\n' + authority_tag + '\n' + ui_tag
html = html[:resource_core_match.start()] + owner_block + html[resource_core_match.end():]

# The render-state guard must be the last gameplay render wrapper. Authoritative
# snapshots can expose a unit for one presentation frame before its derived
# stats reference is attached; the guard reconstructs only that missing derived
# reference and otherwise leaves all visualScale/radius values untouched.
render_tag = f'<script src="./render-state-guard-v192.js?build={BUILD}"></script>'
runtime_ui_match = re.search(
    rf'<script\b[^>]*src=["\'](?:\./|/frontline-dominion/)runtime-ui-v192\.js\?build={BUILD}["\'][^>]*></script>',
    html,
    flags=re.I,
)
if not runtime_ui_match:
    raise RuntimeError('build 192 runtime UI HTML anchor missing')
html = html[:runtime_ui_match.start()] + render_tag + '\n' + html[runtime_ui_match.start():]
html_path.write_text(html, 'utf-8')

worker = worker_path.read_text('utf-8')
placement_import = f"importScripts('/frontline-dominion/extractor-placement-v190.js?build={BUILD}');"
engineer_import = f"importScripts('/frontline-dominion/engineer-rocket-parity-v191.js?build={BUILD}');"
if placement_import not in worker:
    if engineer_import not in worker:
        raise RuntimeError('build 192 engineer import anchor missing')
    worker = worker.replace(engineer_import, engineer_import + '\n' + placement_import, 1)

old = """        const beforeUnits = new Map(game.units.filter(unit => unit?.alive).map(unit => [unit.id, unit]));
        const beforeBuildings = new Map(game.buildings.filter(building => building?.alive).map(building => [building.id, building]));
        result = game.buildExtractorFromResource83?.(node) ?? false;
        if (result !== false) {
          const missingUnits = [...beforeUnits.keys()].filter(id => !game.getEntity(id)?.alive);
          const missingBuildings = [...beforeBuildings.keys()].filter(id => !game.getEntity(id)?.alive);
          if (missingUnits.length || missingBuildings.length) {
            throw new Error(`Resource extractor build removed unrelated entities: units=${missingUnits.join(',')} buildings=${missingBuildings.join(',')}`);
          }
        }
"""
new = """        if (payload.resourceKnown !== true) {
          result = false;
          break;
        }
        const beforeUnits = new Map(game.units.filter(unit => unit?.alive).map(unit => [unit.id, unit]));
        const beforeBuildings = new Map(game.buildings.filter(building => building?.alive).map(building => [building.id, building]));
        const originalVisibleAt = game.isVisibleAt;
        const originalExploredAt = game.isExploredAt;
        const resourceKnownRadius = Math.max(160, Number(node.radius || 42) + 110);
        const knownPoint = (x, y) => Math.hypot(Number(x || 0) - node.x, Number(y || 0) - node.y) <= resourceKnownRadius;
        if (payload.resourceKnown) {
          if (typeof originalVisibleAt === 'function') {
            game.isVisibleAt = function(x, y, ...rest) {
              if (knownPoint(x, y)) return true;
              return originalVisibleAt.call(this, x, y, ...rest);
            };
          }
          if (typeof originalExploredAt === 'function') {
            game.isExploredAt = function(x, y, ...rest) {
              if (knownPoint(x, y)) return true;
              return originalExploredAt.call(this, x, y, ...rest);
            };
          }
        }
        try {
          result = game.buildExtractorFromResource83?.(node) ?? false;
        } finally {
          if (typeof originalVisibleAt === 'function') game.isVisibleAt = originalVisibleAt;
          if (typeof originalExploredAt === 'function') game.isExploredAt = originalExploredAt;
        }
        if (result !== false) {
          const missingUnits = [...beforeUnits.keys()].filter(id => !game.getEntity(id)?.alive);
          const missingBuildings = [...beforeBuildings.keys()].filter(id => !game.getEntity(id)?.alive);
          if (missingUnits.length || missingBuildings.length) {
            throw new Error(`Resource extractor build removed unrelated entities: units=${missingUnits.join(',')} buildings=${missingBuildings.join(',')}`);
          }
        }
"""
if old not in worker:
    raise RuntimeError('build 192 resource action finalizer anchor missing')
worker = worker.replace(old, new, 1)
worker_path.write_text(worker, 'utf-8')

if worker.count(placement_import) != 1:
    raise RuntimeError('build 192 extractor placement Worker owner count is not one')
if 'payload.resourceKnown !== true' not in worker:
    raise RuntimeError('build 192 resource-known gate missing')
if 'resourceKnownRadius' not in worker:
    raise RuntimeError('build 192 scoped resource visibility missing')
final_html = html_path.read_text('utf-8')
for tag in (authority_tag, ui_tag, render_tag):
    if final_html.count(tag) != 1:
        raise RuntimeError(f'build 192 owner count is not one: {tag}')
core_index = final_html.index('resource-extraction-v114.js?build=192')
authority_index = final_html.index('resource-extraction-authority-v192.js?build=192')
ui_index = final_html.index('resource-ui-stability-v192.js?build=192')
render_index = final_html.index('render-state-guard-v192.js?build=192')
runtime_ui_index = final_html.index('runtime-ui-v192.js?build=192')
model_index = final_html.index('model-pilot-v101.js?build=192')
if not core_index < authority_index < ui_index:
    raise RuntimeError('build 192 resource owner load order is invalid')
if not model_index < render_index < runtime_ui_index:
    raise RuntimeError('build 192 render guard load order is invalid')
if '__fdResourceAuthority192' not in authority_path.read_text('utf-8'):
    raise RuntimeError('build 192 resource authority handler marker missing')
if '__FD_RESOURCE_UI_STABILITY_192__' not in ui_path.read_text('utf-8'):
    raise RuntimeError('build 192 resource UI stability API missing')
if '__FD_RENDER_STATE_GUARD_192__' not in render_path.read_text('utf-8'):
    raise RuntimeError('build 192 render-state guard API missing')

print('Frontline Dominion build 192 resource authority, Worker placement, stable UI and render-state guard installed')
