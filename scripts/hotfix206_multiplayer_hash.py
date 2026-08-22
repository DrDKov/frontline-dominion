from pathlib import Path
import re

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

# Build 205 introduced deterministic multiplayer simulation LOD, but its
# implementation returned tier 1 for ordinary active commands. The base v9
# scheduler can phase-skip tier-1 unit work, so a moving/building authoritative
# unit must be tier 0. Patch only inside deterministicNetworkLod205 to avoid
# touching unrelated command branches.
pattern = re.compile(
    r"(D\.Game\.prototype\.unitSimLodV9\s*=\s*function\s+deterministicNetworkLod205\(unit\)\s*\{.*?"
    r"if\s*\(recentDamage\s*\|\|\s*recentShot\s*\|\|\s*hasCombatTarget\)\s*return\s*0\s*;\s*)"
    r"if\s*\(command\)\s*return\s*1\s*;",
    re.S,
)
worker, count = pattern.subn(
    r"\1// Active authoritative commands advance on every fixed network tick.\n"
    r"    if (command) return 0;",
    worker,
    count=1,
)
if count != 1:
    # If an earlier build stage already carries the correct full-rate branch,
    # accept it rather than failing assembly.
    already = re.search(
        r"deterministicNetworkLod205\(unit\).*?if\s*\(command\)\s*return\s*0\s*;",
        worker,
        re.S,
    )
    if not already:
        raise RuntimeError('build 206 deterministicNetworkLod205 active-command branch not found')
worker_path.write_text(worker, 'utf-8')

print('Build 206 multiplayer presentation checksum restored; active-command Worker simulation is full-rate and authoritative logistics hash remains enabled')
