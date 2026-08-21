from pathlib import Path

BUILD = 205
path = Path('dist/authoritative-simulation-worker-v174.js')
if not path.exists():
    raise RuntimeError(f'build {BUILD} authoritative Worker missing: {path}')

text = path.read_text('utf-8')
if 'networkHashInputHistory205' in text:
    print('Build 205 network hash input diagnostics already instrumented')
    raise SystemExit(0)

state_anchor = """let lastNetworkHashTick = -1;
let lastNetworkHash = '00000000';
"""
state_replacement = """let lastNetworkHashTick = -1;
let lastNetworkHash = '00000000';
let networkHashInputHistory205 = [];
"""
if text.count(state_anchor) != 1:
    raise RuntimeError('build 205 network hash diagnostic state anchor missing')
text = text.replace(state_anchor, state_replacement, 1)

hash_anchor = """  const entities = canonicalNetworkOrder205([...game.units, ...game.buildings]);
  for (const item of entities) {
"""
hash_replacement = """  const entities = canonicalNetworkOrder205([...game.units, ...game.buildings]);
  const networkHashInput205 = {
    tick,
    timeTick: Math.round(game.time * SIM_HZ),
    rngSeed: Number(game.rng?.seed || 0) >>> 0,
    credits: [
      Math.round((canonicalPlayer?.credits || 0) * 10),
      Math.round((canonicalEnemy?.credits || 0) * 10),
    ],
    entities: entities.filter(item => item?.alive).map(item => [
      String(item.id || ''),
      canonicalTeamCode(item.team),
      Math.round(item.x * 4),
      Math.round(item.y * 4),
      Math.round(item.hp * 10),
      String(item.currentCommand?.type || ''),
    ]),
    projectiles: canonicalNetworkOrder205(game.projectiles).filter(item => item?.alive).map(item => [
      String(item.id || ''),
      canonicalTeamCode(item.team),
      Math.round(item.x * 4),
      Math.round(item.y * 4),
      Math.round((item.altitude || 0) * 4),
    ]),
  };
  for (const item of entities) {
"""
if text.count(hash_anchor) != 1:
    raise RuntimeError('build 205 network hash entity diagnostic anchor missing')
text = text.replace(hash_anchor, hash_replacement, 1)

finish_anchor = """  lastNetworkHash = (hash >>> 0).toString(16).padStart(8, '0');
  lastNetworkHashTick = tick;
  return lastNetworkHash;
"""
finish_replacement = """  lastNetworkHash = (hash >>> 0).toString(16).padStart(8, '0');
  lastNetworkHashTick = tick;
  networkHashInputHistory205.push({ ...networkHashInput205, hash: lastNetworkHash });
  if (networkHashInputHistory205.length > 8) networkHashInputHistory205.splice(0, networkHashInputHistory205.length - 8);
  return lastNetworkHash;
"""
if text.count(finish_anchor) != 1:
    raise RuntimeError('build 205 network hash diagnostic completion anchor missing')
text = text.replace(finish_anchor, finish_replacement, 1)

reset_anchor = """  lastHashTick = -1; lastNetworkHashTick = -1; lastNetworkHash = '00000000';
"""
reset_replacement = """  lastHashTick = -1; lastNetworkHashTick = -1; lastNetworkHash = '00000000'; networkHashInputHistory205 = [];
"""
if text.count(reset_anchor) != 1:
    raise RuntimeError('build 205 network hash diagnostic reset anchor missing')
text = text.replace(reset_anchor, reset_replacement, 1)

diag_anchor = """        networkHash: lastNetworkHash,
        networkHashTick: lastNetworkHashTick, diagnosticReadOnly205: true,
"""
diag_replacement = """        networkHash: lastNetworkHash,
        networkHashTick: lastNetworkHashTick, diagnosticReadOnly205: true,
        networkHashInputHistory205: networkHashInputHistory205.map(entry => ({
          ...entry,
          entities: entry.entities.map(tuple => [...tuple]),
          projectiles: entry.projectiles.map(tuple => [...tuple]),
        })),
"""
if text.count(diag_anchor) != 1:
    raise RuntimeError('build 205 network hash diagnostic response anchor missing')
text = text.replace(diag_anchor, diag_replacement, 1)

path.write_text(text, 'utf-8')
print('Build 205 network hash inputs instrumented without changing checksum cadence')
