from pathlib import Path
import json

BUILD = 205
worker_path = Path('dist/authoritative-simulation-worker-v174.js')
manifest_path = Path('dist/models/pilot/manifest.json')
if not worker_path.exists():
    raise RuntimeError(f'build {BUILD} authoritative Worker missing: {worker_path}')
if not manifest_path.exists():
    raise RuntimeError(f'build {BUILD} unit model manifest missing: {manifest_path}')

text = worker_path.read_text('utf-8')
marker = '__fdDeterministicUnitGeometry205'
if marker in text:
    print('Build 205 deterministic unit geometry already frozen')
    raise SystemExit(0)

manifest = json.loads(manifest_path.read_text('utf-8'))
geometry = {}
for spec in manifest.get('models', []):
    if spec.get('type') != 'unit':
        continue
    payload = {
        'modelCode': spec.get('code'),
        'modelBoundsMeters': spec.get('boundsMeters') if isinstance(spec.get('boundsMeters'), list) else None,
        'modelCollisionFootprintMeters': spec.get('collisionFootprintMeters') if isinstance(spec.get('collisionFootprintMeters'), dict) else None,
        'modelUnitScale': spec.get('unitScale') if isinstance(spec.get('unitScale'), dict) else None,
        'modelCollision': spec.get('collision'),
    }
    for type_id in spec.get('gameTypeIds') or []:
        if type_id:
            geometry[str(type_id)] = payload

if not geometry or 'worker' not in geometry:
    raise RuntimeError('build 205 deterministic geometry manifest has no worker mapping')

payload_js = json.dumps(geometry, ensure_ascii=False, separators=(',', ':'))
anchor = 'let game = null;\n'
replacement = f"""// Multiplayer physics must never depend on when an asynchronous visual/model
// manifest happens to finish loading in a particular browser process. Freeze
// the collision geometry from the build's own manifest synchronously before
// the first authoritative tick. unit-footprints-v115 may later resolve its
// fetch, but it can only reapply these identical values.
const deterministicUnitGeometry205 = {payload_js};
(function installDeterministicUnitGeometry205() {{
  const types = D.UNIT_TYPES || {{}};
  for (const [typeId, geometry] of Object.entries(deterministicUnitGeometry205)) {{
    const stats = types[typeId];
    if (!stats) continue;
    Object.assign(stats, {{
      modelCode: geometry.modelCode || null,
      modelManifest: '/frontline-dominion/models/pilot/manifest.json?build=205',
      modelBoundsMeters: Array.isArray(geometry.modelBoundsMeters) ? [...geometry.modelBoundsMeters] : null,
      modelCollisionFootprintMeters: geometry.modelCollisionFootprintMeters ? {{ ...geometry.modelCollisionFootprintMeters }} : null,
      modelUnitScale: geometry.modelUnitScale ? {{ ...geometry.modelUnitScale }} : null,
      modelCollision: geometry.modelCollision || null,
    }});
  }}
  Object.defineProperty(self, '__fdDeterministicUnitGeometry205', {{ value: true, configurable: false }});
}})();

let game = null;
"""
if text.count(anchor) != 1:
    raise RuntimeError('build 205 deterministic geometry Worker anchor missing')
text = text.replace(anchor, replacement, 1)
worker_path.write_text(text, 'utf-8')
print(f'Build {BUILD} authoritative Worker unit collision geometry frozen from manifest ({len(geometry)} types)')
