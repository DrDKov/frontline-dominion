from pathlib import Path

BUILD = 205
path = Path('dist/authoritative-simulation-worker-v174.js')
if not path.exists():
    raise RuntimeError(f'build {BUILD} authoritative Worker missing: {path}')

text = path.read_text('utf-8')
marker = '__fdDeterministicNetworkLod205'
if marker in text:
    print('Build 205 deterministic multiplayer simulation LOD already patched')
    raise SystemExit(0)

anchor = """const SERVICE_CODES = Object.freeze({ '': 0, approach: 1, landing: 2, servicing: 3, launch: 4, hangar: 5, ready: 6 });

let game = null;
"""
replacement = """const SERVICE_CODES = Object.freeze({ '': 0, approach: 1, landing: 2, servicing: 3, launch: 4, hangar: 5, ready: 6 });

// Presentation visibility is local to each computer. The inherited mass-
// simulation LOD used Game.isOnScreen() to decide whether a unit updated every
// tick or every second tick. That is valid in standalone play but makes two
// authoritative Workers diverge as soon as their cameras differ. In network
// play choose LOD only from deterministic simulation state. Active commands
// always update at 25 Hz; inactive cohorts may still use deterministic LOD.
const baseUnitSimLod205 = D.Game.prototype.unitSimLodV9;
if (typeof baseUnitSimLod205 === 'function') {
  D.Game.prototype.unitSimLodV9 = function deterministicNetworkLod205(unit) {
    if (!self.__FD_NETWORK_SIM_ACTIVE_205__) return baseUnitSimLod205.call(this, unit);
    if (!unit?.alive || unit.embarkedIn) return 3;
    const command = unit.currentCommand;
    const recentDamage = this.time - (unit.lastDamagedAt || -999) < 2.2;
    const recentShot = this.time - (unit.lastShotAt || -999) < 1.0;
    const hasCombatTarget = Boolean(
      unit.weaponTargetId || command?.combatTargetId || command?.engagedTargetId ||
      (command?.type === 'attack' && command?.targetId)
    );
    if (recentDamage || recentShot || hasCombatTarget) return 0;
    if (command) return 1;
    if (unit.aiSquadId || unit.air) return 2;
    return 3;
  };
  Object.defineProperty(D.Game.prototype.unitSimLodV9, '__fdDeterministicNetworkLod205', { value: true });
}

let game = null;
"""
if text.count(anchor) != 1:
    raise RuntimeError('build 205 deterministic LOD install anchor missing')
text = text.replace(anchor, replacement, 1)

# Activate the deterministic LOD before the first multiplayer simulation tick.
init_anchor = """  multiplayer = {
    active: Boolean(options?.multiplayer?.active),
"""
init_replacement = """  multiplayer = {
    active: Boolean(options?.multiplayer?.active),
"""
if text.count(init_anchor) != 1:
    raise RuntimeError('build 205 multiplayer init anchor missing')
# Keep the object construction unchanged; attach activation immediately after
# its closing assignment using the role field that follows in the canonical Worker.
role_anchor = """    appliedSeq: Number(options?.multiplayer?.appliedSeq) || 0,
  };
"""
role_replacement = """    appliedSeq: Number(options?.multiplayer?.appliedSeq) || 0,
  };
  self.__FD_NETWORK_SIM_ACTIVE_205__ = multiplayer.active;
"""
if text.count(role_anchor) != 1:
    raise RuntimeError('build 205 multiplayer activation anchor missing')
text = text.replace(role_anchor, role_replacement, 1)

path.write_text(text, 'utf-8')
print('Build 205 multiplayer Simulation LOD is camera-independent and deterministic')
