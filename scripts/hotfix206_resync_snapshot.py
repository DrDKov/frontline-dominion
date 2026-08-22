from pathlib import Path
import runpy

BRIDGE = Path('dist/authoritative-simulation-v174.js')
if not BRIDGE.exists():
    raise RuntimeError('build 206 authoritative bridge missing')

text = BRIDGE.read_text('utf-8')

def once(old: str, new: str, label: str) -> None:
    global text
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'build 206 {label} anchor count={count}')
    text = text.replace(old, new, 1)

# A multiplayer resync is already an authoritative Worker save.  The old
# bridge hydrated that snapshot into a presentation Game and immediately
# serialized the presentation Game again before starting its replacement
# Worker.  Unknown/versioned entity fields (including physical logistics) and
# the root __mp watermark can be lost in that intermediate round trip.
# Preserve the exact incoming snapshot on the temporary main-thread Game.
once(
    "Game.prototype.hydrate = function(data) {\n  this._fdLoadedAuthoritative172 = data?.authoritative172 || null;\n  return legacy.hydrate.call(this, data);\n};\n",
    "Game.prototype.hydrate = function(data) {\n"
    "  this._fdLoadedAuthoritative172 = data?.authoritative172 || null;\n"
    "  this._fdLoadedMultiplayerSnapshot206 = data?.__mp ? data : null;\n"
    "  return legacy.hydrate.call(this, data);\n"
    "};\n",
    'bridge hydrate multiplayer snapshot preservation',
)

# On replacement-Worker launch, bypass legacy.save entirely for a preserved
# resync snapshot.  The source bytes came from the host authoritative Worker,
# so this is both the most exact and the safest representation to hydrate.
once(
    "function captureInitialState(game) {\n  const previous = D.storageGet(D.SAVE_KEY);\n",
    "function captureInitialState(game) {\n"
    "  const preservedResync206 = game?._fdLoadedMultiplayerSnapshot206;\n"
    "  if (preservedResync206?.__mp && preservedResync206?.authoritative172) {\n"
    "    const saveData = clonePlain(preservedResync206);\n"
    "    const authoritative = clonePlain(saveData.authoritative172);\n"
    "    const projectiles = Array.isArray(authoritative?.projectiles) ? clonePlain(authoritative.projectiles) : [];\n"
    "    return { saveData, authoritative, projectiles };\n"
    "  }\n"
    "  const previous = D.storageGet(D.SAVE_KEY);\n",
    'bridge exact resync handoff',
)

BRIDGE.write_text(text, 'utf-8')
print('Build 206 resync snapshots bypass lossy presentation reserialization')

# Keep Unit.update byte-for-byte on the deterministic legacy path. Finite
# ammunition reconciliation belongs to a world post-phase, not inside each
# unit's navigation/collision update.
runpy.run_path('scripts/hotfix206_reload_phase.py', run_name='__main__')
