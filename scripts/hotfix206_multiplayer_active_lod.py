from pathlib import Path

WORKER = Path('dist/authoritative-simulation-worker-v174.js')
if not WORKER.exists():
    raise RuntimeError('build 206 Worker missing before active LOD hotfix')

text = WORKER.read_text('utf-8')
old = """    if (recentDamage || recentShot || hasCombatTarget) return 0;
    if (command) return 1;
    if (unit.aiSquadId || unit.air) return 2;
"""
new = """    if (recentDamage || recentShot || hasCombatTarget) return 0;
    // Any active authoritative command must advance every fixed simulation tick.
    // Tier 1 can phase-skip movement/update work and two network Workers do not
    // necessarily enter that phase on the same wall-clock pump iteration.
    if (command) return 0;
    if (unit.aiSquadId || unit.air) return 2;
"""
count = text.count(old)
if count != 1:
    raise RuntimeError(f'build 206 multiplayer active LOD anchor count={count}')
WORKER.write_text(text.replace(old, new, 1), 'utf-8')
print('Build 206 multiplayer active-command units now simulate at full fixed-tick rate')
