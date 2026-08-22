from pathlib import Path

path = Path('dist/multiplayer-game-v96.js')
if not path.exists():
    raise RuntimeError('build 206 multiplayer runtime missing')
text = path.read_text('utf-8')
needle = "    mix(game.networkLogisticsHash206?.(state.localPerspectiveSwapped) || 0);\n"
count = text.count(needle)
if count != 1:
    raise RuntimeError(f'build 206 presentation logistics hash anchor count={count}')
text = text.replace(needle, '', 1)
path.write_text(text, 'utf-8')

worker_path = Path('dist/authoritative-simulation-worker-v174.js')
if not worker_path.exists():
    raise RuntimeError('build 206 authoritative Worker missing')
worker = worker_path.read_text('utf-8')
old_lod = """    if (recentDamage || recentShot || hasCombatTarget) return 0;
    if (command) return 1;
    if (unit.aiSquadId || unit.air) return 2;
"""
new_lod = """    if (recentDamage || recentShot || hasCombatTarget) return 0;
    // Active authoritative commands must advance on every fixed network tick.
    // Tier 1 phase-skips movement/update work and can drift between peers.
    if (command) return 0;
    if (unit.aiSquadId || unit.air) return 2;
"""
count = worker.count(old_lod)
if count != 1:
    raise RuntimeError(f'build 206 multiplayer active LOD anchor count={count}')
worker_path.write_text(worker.replace(old_lod, new_lod, 1), 'utf-8')

print('Build 206 multiplayer presentation checksum restored; active-command Worker simulation is full-rate and authoritative logistics hash remains enabled')
