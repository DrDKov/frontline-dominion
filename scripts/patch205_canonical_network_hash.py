from pathlib import Path

BUILD = 205
path = Path('dist/authoritative-simulation-worker-v174.js')
if not path.exists():
    raise RuntimeError(f'build {BUILD} authoritative Worker missing: {path}')

text = path.read_text('utf-8')
if 'canonicalNetworkOrder205' in text:
    print('Build 205 canonical network hash ordering already patched')
    raise SystemExit(0)

anchor = """function networkStateHash(force = false) {
  if (!game) return '00000000';
"""
helper = """function canonicalNetworkOrder205(items) {
  return [...(items || [])].sort((a, b) => {
    const aNumber = idNumber(a?.id);
    const bNumber = idNumber(b?.id);
    if (aNumber !== bNumber) return aNumber - bNumber;
    const aId = String(a?.id || '');
    const bId = String(b?.id || '');
    if (aId < bId) return -1;
    if (aId > bId) return 1;
    const aKind = String(a?.kind || a?.typeId || '');
    const bKind = String(b?.kind || b?.typeId || '');
    return aKind < bKind ? -1 : aKind > bKind ? 1 : 0;
  });
}

function networkStateHash(force = false) {
  if (!game) return '00000000';
"""
if text.count(anchor) != 1:
    raise RuntimeError('build 205 networkStateHash anchor missing')
text = text.replace(anchor, helper, 1)

old_entities = """  const entities = [...game.units, ...game.buildings];
  for (const item of entities) {
"""
new_entities = """  // Entity arrays are implementation containers, not part of the network
  // protocol. Runtime insertion/removal order may differ between two Workers
  // even when their authoritative state is identical, so checksum iteration
  // must use a canonical identity order rather than local array order.
  const entities = canonicalNetworkOrder205([...game.units, ...game.buildings]);
  for (const item of entities) {
"""
if text.count(old_entities) != 1:
    raise RuntimeError('build 205 network entity hash anchor missing')
text = text.replace(old_entities, new_entities, 1)

old_projectiles = """  for (const projectile of game.projectiles) {
    if (!projectile?.alive) continue;
"""
new_projectiles = """  for (const projectile of canonicalNetworkOrder205(game.projectiles)) {
    if (!projectile?.alive) continue;
"""
if text.count(old_projectiles) != 1:
    raise RuntimeError('build 205 network projectile hash anchor missing')
text = text.replace(old_projectiles, new_projectiles, 1)

path.write_text(text, 'utf-8')
print('Build 205 network checksum now uses canonical entity/projectile identity order')
