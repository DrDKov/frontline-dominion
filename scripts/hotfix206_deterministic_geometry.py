from pathlib import Path
import json

BUILD = 206
OUT = Path('dist')
worker_path = OUT / 'authoritative-simulation-worker-v174.js'
manifest_path = OUT / 'models' / 'pilot' / 'manifest.json'

if not worker_path.exists():
    raise RuntimeError('build 206 Worker missing before deterministic geometry hotfix')
if not manifest_path.exists():
    raise RuntimeError('build 206 pilot manifest missing before deterministic geometry hotfix')

manifest = json.loads(manifest_path.read_text('utf-8'))
models = manifest.get('models')
if not isinstance(models, list):
    raise RuntimeError('build 206 pilot manifest models missing')

geometry = {}
for model in models:
    if not isinstance(model, dict) or model.get('type') != 'unit':
        continue
    ids = model.get('gameTypeIds') or []
    if not isinstance(ids, list):
        continue
    record = {
        'modelCode': model.get('code'),
        'modelBoundsMeters': model.get('boundsMeters'),
        'modelCollisionFootprintMeters': model.get('collisionFootprintMeters'),
        'modelUnitScale': model.get('unitScale'),
        'modelCollision': model.get('collision'),
    }
    for type_id in ids:
        if not isinstance(type_id, str) or not type_id:
            continue
        geometry[type_id] = record

if len(geometry) < 40:
    raise RuntimeError(f'build 206 deterministic unit geometry unexpectedly small: {len(geometry)}')
if 'resourceTruck' not in geometry:
    raise RuntimeError('build 206 deterministic unit geometry missing resourceTruck')

payload = json.dumps(geometry, ensure_ascii=False, sort_keys=True, separators=(',', ':'))
block = f'''\n// Multiplayer physics must not depend on asynchronous model-manifest timing.\n// Freeze every unit collision/model footprint from the assembled build manifest\n// synchronously before the first authoritative simulation tick.\nconst deterministicUnitGeometry206 = {payload};\n(function installDeterministicUnitGeometry206() {{\n  const types = D.UNIT_TYPES || {{}};\n  for (const [typeId, geometry] of Object.entries(deterministicUnitGeometry206)) {{\n    const stats = types[typeId];\n    if (!stats) continue;\n    Object.assign(stats, {{\n      modelCode: geometry.modelCode || null,\n      modelManifest: '/frontline-dominion/models/pilot/manifest.json?build=206',\n      modelBoundsMeters: Array.isArray(geometry.modelBoundsMeters) ? [...geometry.modelBoundsMeters] : null,\n      modelCollisionFootprintMeters: geometry.modelCollisionFootprintMeters ? {{ ...geometry.modelCollisionFootprintMeters }} : null,\n      modelUnitScale: geometry.modelUnitScale ? {{ ...geometry.modelUnitScale }} : null,\n      modelCollision: geometry.modelCollision || null,\n    }});\n  }}\n  Object.defineProperty(self, '__fdDeterministicUnitGeometry206', {{ value: true, configurable: false }});\n}})();\n'''

worker = worker_path.read_text('utf-8')
marker = "Object.defineProperty(self, '__fdDeterministicUnitGeometry206'"
if marker not in worker:
    anchor = 'let game = null;\n'
    if worker.count(anchor) != 1:
        raise RuntimeError(f'build 206 deterministic geometry Worker anchor count={worker.count(anchor)}')
    worker = worker.replace(anchor, block + '\n' + anchor, 1)
worker_path.write_text(worker, 'utf-8')

print(f'Build 206 Worker deterministic unit geometry frozen from assembled manifest for {len(geometry)} unit type ids')
