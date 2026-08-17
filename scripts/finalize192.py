from pathlib import Path

OUT = Path('dist')
BUILD = 192
worker_path = OUT / 'authoritative-simulation-worker-v174.js'
placement_path = OUT / 'extractor-placement-v190.js'

for path in (worker_path, placement_path):
    if not path.exists():
        raise RuntimeError(f'build 192 finalizer missing: {path}')

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

print('Frontline Dominion build 192 Worker extractor placement finalizer installed')
