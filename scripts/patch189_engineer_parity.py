from pathlib import Path
import re

ROOT = Path('.')
OUT = ROOT / 'dist'
BUILD = 189
MODULE = 'engineer-infantry-parity-v189.js'


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise RuntimeError(f'engineer parity patch anchor missing: {label}')
    return text.replace(old, new, 1)


source = ROOT / 'src' / 'v189' / MODULE
if not source.exists():
    raise RuntimeError(f'missing source module: {source}')
(OUT / MODULE).write_text(source.read_text('utf-8'), 'utf-8')

# Main thread: one final parity owner, loaded after all historical footprint and
# selection refinements but before the authoritative bridge starts the Worker.
html_path = OUT / 'frontline-dominion.html'
html = html_path.read_text('utf-8')
html = re.sub(
    rf'\s*<script[^>]+src=["\'](?:\./|/frontline-dominion/){re.escape(MODULE)}(?:\?build=\d+)?["\'][^>]*></script>',
    '',
    html,
    flags=re.I,
)
bridge_tag = '<script src="./authoritative-simulation-v174.js?build=189"></script>'
if bridge_tag not in html:
    raise RuntimeError('authoritative bridge tag missing for engineer parity insertion')
html = html.replace(
    bridge_tag,
    f'<script src="./{MODULE}?build={BUILD}"></script>\n' + bridge_tag,
    1,
)
html_path.write_text(html, 'utf-8')

# Worker: install the same geometry owner before Game construction so movement,
# collision and navigation use the same infantry body from the first tick.
worker_path = OUT / 'authoritative-simulation-worker-v174.js'
worker = worker_path.read_text('utf-8')
worker = re.sub(
    rf"\s*importScripts\('/frontline-dominion/{re.escape(MODULE)}(?:\?build=\d+)?'\);",
    '',
    worker,
)
bundle_import = "importScripts('/frontline-dominion/authoritative-simulation-bundle-v172.js?build=189');"
if bundle_import not in worker:
    raise RuntimeError('Worker bundle import missing for engineer parity insertion')
worker = worker.replace(
    bundle_import,
    bundle_import + f"\nimportScripts('/frontline-dominion/{MODULE}?build={BUILD}');",
    1,
)
worker_path.write_text(worker, 'utf-8')

# Generate the strict WebKit test from the existing launch gate. The assertion
# compares the engineer to the actual ordinary infantry geometry in that build;
# it does not rely on a hard-coded radius that may describe an indicator rather
# than the body used by navigation and collision.
webkit_source = (ROOT / 'tests' / 'webkit-gate189.mjs').read_text('utf-8')
webkit_source = replace_once(
    webkit_source,
    """      workerRadius: Number(worker?.radius || 0),
      infantryRadius: Number(infantry?.radius || 0),
      workerHeight: height(workerBounds),""",
    """      workerRadius: Number(worker?.radius || 0),
      infantryRadius: Number(infantry?.radius || 0),
      workerStatsRadius: Number(worker?.stats?.radius ?? worker?.radius ?? 0),
      infantryStatsRadius: Number(infantry?.stats?.radius ?? infantry?.radius ?? 0),
      workerCollisionRadius: Number(worker?.collisionRadius ?? worker?.stats?.collisionRadius ?? worker?.radius ?? 0),
      infantryCollisionRadius: Number(infantry?.collisionRadius ?? infantry?.stats?.collisionRadius ?? infantry?.radius ?? 0),
      workerFootprintRadius: Number(worker?.footprintRadius ?? worker?.stats?.footprintRadius ?? worker?.radius ?? 0),
      infantryFootprintRadius: Number(infantry?.footprintRadius ?? infantry?.stats?.footprintRadius ?? infantry?.radius ?? 0),
      workerSelectionRadius: Number(worker?.selectionRadius ?? worker?.stats?.selectionRadius ?? 0),
      infantrySelectionRadius: Number(infantry?.selectionRadius ?? infantry?.stats?.selectionRadius ?? 0),
      workerProfileRadius: Number(worker?.profileRadius ?? worker?.stats?.profileRadius ?? 0),
      infantryProfileRadius: Number(infantry?.profileRadius ?? infantry?.stats?.profileRadius ?? 0),
      workerDisplayRadius: Number(worker?.displayRadius ?? worker?.stats?.displayRadius ?? 0),
      infantryDisplayRadius: Number(infantry?.displayRadius ?? infantry?.stats?.displayRadius ?? 0),
      workerScale: Number(worker?.stats?.visualScale ?? worker?.visualScale ?? 1),
      infantryScale: Number(infantry?.stats?.visualScale ?? infantry?.visualScale ?? 1),
      parityReference: worker?._fdEngineerParity189 || null,
      workerHeight: height(workerBounds),""",
    'WebKit engineer geometry payload',
)
webkit_source = replace_once(
    webkit_source,
    """if (engineer.workerRadius !== 14 || Math.abs(engineer.workerRadius - engineer.infantryRadius) > 1) throw new Error(`engineer physical radius mismatch: ${JSON.stringify(engineer)}`);
const visualRatio = engineer.workerHeight / Math.max(1, engineer.infantryHeight);""",
    """const parityChecks = [
  ['radius', engineer.workerRadius, engineer.infantryRadius, 0.05],
  ['stats radius', engineer.workerStatsRadius, engineer.infantryStatsRadius, 0.05],
  ['collision radius', engineer.workerCollisionRadius, engineer.infantryCollisionRadius, 0.05],
  ['footprint radius', engineer.workerFootprintRadius, engineer.infantryFootprintRadius, 0.05],
  ['selection radius', engineer.workerSelectionRadius, engineer.infantrySelectionRadius, 0.05],
  ['profile radius', engineer.workerProfileRadius, engineer.infantryProfileRadius, 0.05],
  ['display radius', engineer.workerDisplayRadius, engineer.infantryDisplayRadius, 0.05],
  ['visual scale', engineer.workerScale, engineer.infantryScale, 0.02],
];
for (const [label, workerValue, infantryValue, tolerance] of parityChecks) {
  if (!Number.isFinite(workerValue) || !Number.isFinite(infantryValue) || Math.abs(workerValue - infantryValue) > tolerance) {
    throw new Error(`engineer ${label} mismatch: ${JSON.stringify(engineer)}`);
  }
}
if (Number(engineer.parityReference?.build || 0) !== 189) throw new Error(`engineer parity owner did not normalize the unit: ${JSON.stringify(engineer)}`);
const visualRatio = engineer.workerHeight / Math.max(1, engineer.infantryHeight);""",
    'WebKit engineer parity assertion',
)
webkit_source = replace_once(
    webkit_source,
    "if (pageErrors.length) throw new Error(`WebKit page errors: ${pageErrors.join(' | ')}`);",
    """if (pageErrors.length) throw new Error(`WebKit page errors: ${pageErrors.join(' | ')}`);
console.log('WEBKIT189_OK ' + JSON.stringify({ build: startup.build, engineer, visualRatio, canonical }));
await browser.close();""",
    'WebKit clean shutdown',
)
(ROOT / 'tests' / 'webkit-gate189.generated.mjs').write_text(webkit_source, 'utf-8')

# Generate a static/VM gate without the obsolete hard-coded radius assumption.
verify_source = (ROOT / 'tests' / 'verify189.js').read_text('utf-8')
verify_source = replace_once(
    verify_source,
    "const refinement = read('unit-formation-refinement-v138.js');\n",
    "const refinement = read('unit-formation-refinement-v138.js');\nconst engineerParity = read('engineer-infantry-parity-v189.js');\n",
    'static parity module source',
)
verify_source = replace_once(
    verify_source,
    """if (!/worker\\s*:\\s*\\{\\s*name\\s*:\\s*'Инженер'[\\s\\S]{0,420}?radius\\s*:\\s*14\\b/.test(html)) throw new Error('main-thread engineer radius is not 14');
if (!/worker\\s*:\\s*\\{\\s*name\\s*:\\s*'Инженер'[\\s\\S]{0,420}?radius\\s*:\\s*14\\b/.test(bundle)) throw new Error('Worker engineer radius is not 14');""",
    """if (!html.includes('engineer-infantry-parity-v189.js?build=189')) throw new Error('main-thread engineer parity owner missing');
if (!workerSource.includes("importScripts('/frontline-dominion/engineer-infantry-parity-v189.js?build=189')")) throw new Error('Worker engineer parity owner missing');
if (!engineerParity.includes('syncEngineerParity189') || !engineerParity.includes('copyEngineerGeometry189')) throw new Error('engineer parity implementation incomplete');""",
    'static hard-coded engineer radius assertions',
)
parity_vm_test = r'''
class ParityUnit189 { update() {} }
class ParityGame189 {
  constructor() { this.units = []; this.time = 0; }
  addEntity(entity) { entity.game = this; this.units.push(entity); return entity; }
  update() { this.time += 0.04; }
}
globalThis.__FD_DEBUG__ = { Game: ParityGame189, Unit: ParityUnit189, game: null };
new Function(engineerParity)();
const parityGame189 = new ParityGame189();
globalThis.__FD_DEBUG__.game = parityGame189;
const parityWorker189 = Object.assign(new ParityUnit189(), {
  id: 'worker189', kind: 'unit', alive: true, typeId: 'worker', team: 'player', infantry: true,
  radius: 17, collisionRadius: 17, selectionRadius: 14, profileRadius: 14, displayRadius: 14,
  stats: { radius: 14, collisionRadius: 17, selectionRadius: 14, profileRadius: 14, displayRadius: 14, visualScale: 1 },
});
const parityRifle189 = Object.assign(new ParityUnit189(), {
  id: 'rifle189', kind: 'unit', alive: true, typeId: 'rifle', team: 'player', infantry: true,
  radius: 5.389, collisionRadius: 5.389, selectionRadius: 6, profileRadius: 7, displayRadius: 8,
  stats: { radius: 5.389, collisionRadius: 5.389, selectionRadius: 6, profileRadius: 7, displayRadius: 8, visualScale: 1, footprint: { width: 7, length: 9 } },
});
parityGame189.addEntity(parityWorker189);
parityGame189.addEntity(parityRifle189);
globalThis.__FD_ENGINEER_PARITY_189__.sync(parityGame189);
for (const key of ['radius', 'collisionRadius', 'selectionRadius', 'profileRadius', 'displayRadius']) {
  if (Math.abs(Number(parityWorker189[key]) - Number(parityRifle189[key])) > 0.001) {
    throw new Error(`engineer parity VM mismatch for ${key}: ${parityWorker189[key]} vs ${parityRifle189[key]}`);
  }
}
if (Math.abs(Number(parityWorker189.stats.radius) - Number(parityRifle189.stats.radius)) > 0.001) throw new Error('engineer stats radius parity failed');
if (parityWorker189._fdEngineerParity189?.build !== 189) throw new Error('engineer parity marker missing');
'''
verify_source = replace_once(
    verify_source,
    'class Unit {\n',
    parity_vm_test + '\nclass Unit {\n',
    'static engineer parity VM test',
)
(ROOT / 'tests' / 'verify189.generated.js').write_text(verify_source, 'utf-8')

print('Build 189 engineer/infantry geometry parity patched and strict gates generated')
