from pathlib import Path

ROOT = Path('.')

smoke = (ROOT / 'tests' / 'browser-smoke187.mjs').read_text('utf-8')
smoke = smoke.replace('187', '190')
smoke = smoke.replace(r'16\.8\.3', r'16\.8\.6')
smoke = smoke.replace('16.8.3', '16.8.6')
(ROOT / 'tests' / 'browser-smoke190.generated.mjs').write_text(smoke, 'utf-8')

gate = (ROOT / 'tests' / 'webkit-gate190.mjs').read_text('utf-8')
old_engineer = """if (engineer.widthRatio < 0.90 || engineer.widthRatio > 1.10 || engineer.heightRatio < 0.90 || engineer.heightRatio > 1.10) {
  throw new Error(`engineer visible envelope differs from rocket: ${JSON.stringify(engineer)}`);
}
if (engineer.workerSize.source !== 'rocket-equivalent-engineer-190') throw new Error(`engineer UI bounds use another scale: ${JSON.stringify(engineer)}`);"""
new_engineer = """if (engineer.heightRatio < 0.96 || engineer.heightRatio > 1.04) {
  throw new Error(`engineer visible height differs from rocket: ${JSON.stringify(engineer)}`);
}
if (engineer.widthRatio < 0.70 || engineer.widthRatio > 0.98) {
  throw new Error(`engineer silhouette was stretched or collapsed: ${JSON.stringify(engineer)}`);
}
if (engineer.workerSize.source !== 'rocket-height-engineer-190') throw new Error(`engineer UI bounds use another scale: ${JSON.stringify(engineer)}`);"""
if old_engineer not in gate:
    raise RuntimeError('WebKit engineer assertion anchor missing')
gate = gate.replace(old_engineer, new_engineer, 1)

old_resource = """  const node = nodes.find(candidate => {
    try {
      return game.isBuildPlacementValid('oreMine', candidate.x, candidate.y, 0, candidate) !== false;
    } catch (_) {
      return true;
    }
  }) || nodes[0];"""
new_resource = """  const node = nodes.find(candidate => {
    try {
      const rotation = Math.atan2(
        (game.playerBase?.y ?? candidate.y) - candidate.y,
        (game.playerBase?.x ?? candidate.x + 1) - candidate.x,
      );
      return game.isBuildPlacementValid('oreMine', candidate.x, candidate.y, rotation, candidate) !== false;
    } catch (_) {
      return true;
    }
  }) || nodes[0];"""
if old_resource not in gate:
    raise RuntimeError('WebKit resource rotation anchor missing')
gate = gate.replace(old_resource, new_resource, 1)

(ROOT / 'tests' / 'webkit-gate190.generated.mjs').write_text(gate, 'utf-8')
print('Build 190 browser gates generated with real input and aligned resource rotation')
