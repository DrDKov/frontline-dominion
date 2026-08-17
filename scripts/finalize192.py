from pathlib import Path
import re

ROOT = Path('.')
OUT = ROOT / 'dist'
BUILD = 192
worker_path = OUT / 'authoritative-simulation-worker-v174.js'
placement_path = OUT / 'extractor-placement-v190.js'
html_path = OUT / 'frontline-dominion.html'
ui_source = ROOT / 'src' / 'v192' / 'resource-ui-stability-v192.js'
ui_path = OUT / 'resource-ui-stability-v192.js'

for path in (worker_path, placement_path, html_path, ui_source):
    if not path.exists():
        raise RuntimeError(f'build 192 finalizer missing: {path}')

# Install the resource action-panel stability owner. The legacy resource UI
# rebuilds its button on every renderActionUI call, which can detach the
# element while a real pointer click is in flight. The wrapper keeps the same
# DOM controls while the selected resource state is unchanged.
ui_path.write_text(ui_source.read_text('utf-8'), 'utf-8')
html = html_path.read_text('utf-8')
html = re.sub(
    r'\s*<script\b[^>]*src=["\'](?:\./|/frontline-dominion/)resource-ui-stability-v192\.js(?:\?build=\d+)?["\'][^>]*></script>',
    '',
    html,
    flags=re.I,
)
authority_tag = f'<script src="./resource-extraction-authority-v192.js?build={BUILD}"></script>'
ui_tag = f'<script src="./resource-ui-stability-v192.js?build={BUILD}"></script>'
if authority_tag not in html:
    raise RuntimeError('build 192 resource authority HTML anchor missing')
html = html.replace(authority_tag, authority_tag + '\n' + ui_tag, 1)
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
if final_html.count(ui_tag) != 1:
    raise RuntimeError('build 192 resource UI stability owner count is not one')
if '__FD_RESOURCE_UI_STABILITY_192__' not in ui_path.read_text('utf-8'):
    raise RuntimeError('build 192 resource UI stability API missing')

print('Frontline Dominion build 192 Worker extractor placement and stable resource UI installed')
