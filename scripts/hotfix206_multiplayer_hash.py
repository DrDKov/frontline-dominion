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

# multiplayer-game-v96 historically publishes a presentation-mirror checksum
# every five ticks. The authoritative bridge now publishes the Worker's
# matched-tick network hash through the same fd:mp-status channel. Keeping both
# producers makes the lobby compare Worker hashes with presentation hashes and
# can manufacture false desyncs even when both Workers are identical. Build 206
# gives network-hash ownership exclusively to the authoritative Worker.
status_anchor = "  function postStatus(game) {\n"
status_guard = (
    "  function postStatus(game) {\n"
    "    if (window.__FD_MULTIPLAYER_ACTIVE__) { void '__fdAuthoritativeStatusOnly206'; return; }\n"
)
if '__fdAuthoritativeStatusOnly206' not in text:
    if text.count(status_anchor) != 1:
        raise RuntimeError(f'build 206 legacy multiplayer status anchor count={text.count(status_anchor)}')
    text = text.replace(status_anchor, status_guard, 1)
path.write_text(text, 'utf-8')

worker_path = Path('dist/authoritative-simulation-worker-v174.js')
if not worker_path.exists():
    raise RuntimeError('build 206 authoritative Worker missing')
worker = worker_path.read_text('utf-8')

# A deterministic network LOD exists in the currently deployed build 205, but
# it is not part of every historical source-assembly path. Build 206 therefore
# owns this rule explicitly instead of depending on a deploy-only ancestor.
# Presentation visibility/camera must never select simulation cadence.
if '__fdDeterministicNetworkLod206' not in worker:
    service_match = re.search(r"const SERVICE_CODES = Object\.freeze\(\{.*?\}\);\n", worker, re.S)
    if not service_match:
        raise RuntimeError('build 206 Worker SERVICE_CODES insertion anchor missing')
    lod_block = r'''

// Build 206 deterministic authoritative unit simulation cadence.
// Network physics may not depend on local camera/render visibility. Any unit
// executing a command advances at full fixed-tick rate; inactive cohorts keep
// deterministic simulation LOD for large-army scalability.
const baseUnitSimLod206 = D.Game.prototype.unitSimLodV9;
if (typeof baseUnitSimLod206 === 'function') {
  D.Game.prototype.unitSimLodV9 = function deterministicNetworkLod206(unit) {
    if (!multiplayer.active) return baseUnitSimLod206.call(this, unit);
    if (!unit?.alive || unit.embarkedIn) return 3;
    const command = unit.currentCommand;
    const recentDamage = this.time - (unit.lastDamagedAt || -999) < 2.2;
    const recentShot = this.time - (unit.lastShotAt || -999) < 1.0;
    const hasCombatTarget = Boolean(
      unit.weaponTargetId || command?.combatTargetId || command?.engagedTargetId ||
      (command?.type === 'attack' && command?.targetId)
    );
    if (recentDamage || recentShot || hasCombatTarget || command) return 0;
    if (unit.aiSquadId || unit.air) return 2;
    return 3;
  };
  Object.defineProperty(D.Game.prototype.unitSimLodV9, '__fdDeterministicNetworkLod206', { value: true });
}
'''
    worker = worker[:service_match.end()] + lod_block + worker[service_match.end():]
else:
    # Normalize an existing 206 rule if this script is applied twice.
    worker = re.sub(
        r"(function deterministicNetworkLod206\(unit\).*?)if\s*\(command\)\s*return\s*1\s*;",
        r"\1if (command) return 0;",
        worker,
        count=1,
        flags=re.S,
    )

worker_path.write_text(worker, 'utf-8')
print('Build 206 multiplayer hash ownership is Worker-only; deterministic Worker LOD uses full-rate active commands')
