from pathlib import Path

BUILD = 205
path = Path('dist/authoritative-simulation-worker-v174.js')
if not path.exists():
    raise RuntimeError(f'build {BUILD} authoritative Worker missing: {path}')

text = path.read_text('utf-8')
if 'unitCheckpointHistory205' in text:
    print('Build 205 unit checkpoint history already patched')
    raise SystemExit(0)

global_anchor = """let lastNetworkHashTick = -1;
let lastNetworkHash = '00000000';
let multiplayer = { active: false, role: null, mode: 'coop', perspectiveSwapped: false, hostTick: null, hostTickReceivedAt: 0, appliedSeq: 0 };
"""
global_replacement = """let lastNetworkHashTick = -1;
let lastNetworkHash = '00000000';
let unitCheckpointHistory205 = [];
let multiplayer = { active: false, role: null, mode: 'coop', perspectiveSwapped: false, hostTick: null, hostTickReceivedAt: 0, appliedSeq: 0 };
"""
if text.count(global_anchor) != 1:
    raise RuntimeError('build 205 unit history global anchor missing')
text = text.replace(global_anchor, global_replacement, 1)

hash_anchor = """  lastNetworkHash = (hash >>> 0).toString(16).padStart(8, '0');
  lastNetworkHashTick = tick;
  return lastNetworkHash;
}
"""
hash_replacement = """  lastNetworkHash = (hash >>> 0).toString(16).padStart(8, '0');
  lastNetworkHashTick = tick;

  // Keep an exact, bounded fingerprint of the authoritative unit state at the
  // same tick as the network hash. This is observational only and lets CI
  // identify the first divergent unit without forcing another hash or touching
  // simulation cadence. Small matches retain every unit; mass battles retain
  // the first 64 stable IDs plus aggregate count.
  const canonicalUnit205 = unit => ({
    id: String(unit.id || ''),
    team: canonicalTeamCode(unit.team),
    x4: Math.round(finite(unit.x) * 4),
    y4: Math.round(finite(unit.y) * 4),
    hp10: Math.round(finite(unit.hp) * 10),
    suppression1000: Math.round(finite(unit.suppression160) * 1000),
    cohesion1000: Math.round(finite(unit.cohesion160, 1) * 1000),
    supply1000: Math.round(finite(unit.supply160, 1) * 1000),
    morale1000: Math.round(finite(unit.morale160, 1) * 1000),
    command: String(unit.currentCommand?.type || ''),
    targetId: String(unit.currentCommand?.targetId || unit.currentCommand?.buildingId || unit.currentCommand?.resourceId || ''),
    commandX4: Number.isFinite(unit.currentCommand?.x) ? Math.round(unit.currentCommand.x * 4) : null,
    commandY4: Number.isFinite(unit.currentCommand?.y) ? Math.round(unit.currentCommand.y * 4) : null,
  });
  const aliveUnits205 = game.units.filter(unit => unit?.alive).slice().sort((a, b) => String(a.id).localeCompare(String(b.id)));
  unitCheckpointHistory205.push({
    tick,
    hash: lastNetworkHash,
    rngSeed: Number(game.rng?.seed || game.seed) >>> 0,
    count: aliveUnits205.length,
    units: aliveUnits205.slice(0, 64).map(canonicalUnit205),
  });
  if (unitCheckpointHistory205.length > 16) unitCheckpointHistory205.splice(0, unitCheckpointHistory205.length - 16);
  return lastNetworkHash;
}
"""
if text.count(hash_anchor) != 1:
    raise RuntimeError('build 205 network hash history anchor missing')
text = text.replace(hash_anchor, hash_replacement, 1)

init_anchor = """  lastHashTick = -1; lastNetworkHashTick = -1; lastNetworkHash = '00000000';
  running = true;
"""
init_replacement = """  lastHashTick = -1; lastNetworkHashTick = -1; lastNetworkHash = '00000000'; unitCheckpointHistory205 = [];
  running = true;
"""
if text.count(init_anchor) != 1:
    raise RuntimeError('build 205 unit history reset anchor missing')
text = text.replace(init_anchor, init_replacement, 1)

diag_anchor = """        networkHash: lastNetworkHash,
        networkHashTick: lastNetworkHashTick, diagnosticReadOnly205: true,
        multiplayer: { ...multiplayer },
"""
diag_replacement = """        networkHash: lastNetworkHash,
        networkHashTick: lastNetworkHashTick, diagnosticReadOnly205: true,
        unitCheckpointHistory205: unitCheckpointHistory205.map(entry => ({
          ...entry,
          units: entry.units.map(unit => ({ ...unit }))
        })),
        multiplayer: { ...multiplayer },
"""
if text.count(diag_anchor) != 1:
    raise RuntimeError('build 205 read-only diagnostics history anchor missing')
text = text.replace(diag_anchor, diag_replacement, 1)

path.write_text(text, 'utf-8')
print('Build 205 exact unit checkpoint history added')
