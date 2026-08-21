from pathlib import Path

BUILD = 205
worker_path = Path('dist/authoritative-simulation-worker-v174.js')
mp_path = Path('dist/multiplayer-game-v96.js')
for path in (worker_path, mp_path):
    if not path.exists():
        raise RuntimeError(f'build {BUILD} required runtime missing: {path}')

worker = worker_path.read_text('utf-8')
if 'networkAppliedSeq205' not in worker:
    old = """    formationCounter: game.formationCounter,
    stateHash: stateHash()
"""
    new = """    formationCounter: game.formationCounter,
    stateHash: stateHash(),
    // Frozen in the same Worker turn as the save payload. A resync snapshot
    // must never be labelled with a later main-thread sequence watermark.
    networkAppliedSeq205: Number(multiplayer.appliedSeq || 0)
"""
    if worker.count(old) != 1:
        raise RuntimeError('build 205 Worker save watermark anchor missing')
    worker = worker.replace(old, new, 1)
    worker_path.write_text(worker, 'utf-8')

mp = mp_path.read_text('utf-8')
if 'snapshotBaseSeq205' not in mp:
    old = """      data.__mp = {
        simTick: Number(data.authoritative172?.simTick ?? detail.tick ?? 0) || 0,
        rngSeed: Number(data.authoritative172?.rngSeed ?? game.rng?.seed ?? game.seed) || 0,
        mode: state.mode,
        hostFaction: state.config?.hostFaction || state.config?.faction,
        guestFaction: state.config?.guestFaction,
        appliedSeq: state.lastAppliedSeq,
        projectiles: Array.isArray(data.authoritative172?.projectiles)
          ? data.authoritative172.projectiles
          : game.projectiles.filter((item) => item.alive).map(projectileSnapshot)
      };
      send('fd:mp-snapshot', { target, requestId, baseSeq: state.lastAppliedSeq, snapshot: data });
"""
    new = """      const snapshotBaseSeq205 = Number(data.authoritative172?.networkAppliedSeq205 ?? 0) || 0;
      data.__mp = {
        simTick: Number(data.authoritative172?.simTick ?? detail.tick ?? 0) || 0,
        rngSeed: Number(data.authoritative172?.rngSeed ?? game.rng?.seed ?? game.seed) || 0,
        mode: state.mode,
        hostFaction: state.config?.hostFaction || state.config?.faction,
        guestFaction: state.config?.guestFaction,
        appliedSeq: snapshotBaseSeq205,
        projectiles: Array.isArray(data.authoritative172?.projectiles)
          ? data.authoritative172.projectiles
          : game.projectiles.filter((item) => item.alive).map(projectileSnapshot)
      };
      send('fd:mp-snapshot', { target, requestId, baseSeq: snapshotBaseSeq205, snapshot: data });
"""
    if mp.count(old) != 1:
        raise RuntimeError('build 205 multiplayer atomic snapshot watermark anchor missing')
    mp = mp.replace(old, new, 1)
    mp_path.write_text(mp, 'utf-8')

print('Build 205 resync snapshot now carries the Worker-frozen applied sequence watermark')
