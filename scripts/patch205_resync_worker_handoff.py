from pathlib import Path

BUILD = 205
bridge_path = Path('dist/authoritative-simulation-v174.js')
mp_path = Path('dist/multiplayer-game-v96.js')
for path in (bridge_path, mp_path):
    if not path.exists():
        raise RuntimeError(f'build {BUILD} required runtime missing: {path}')

bridge = bridge_path.read_text('utf-8')
if 'loadedAuthoritativeTick205' not in bridge:
    old = """  const authoritative = {
    version: VERSION, build: BUILD,
    simTick: finite(game.simTick, Math.round(game.time * SIM_HZ)),
    rngSeed: finite(game.rng?.seed, game.seed),
"""
    new = """  // A loaded authoritative snapshot already owns its simulation identity.
  // ensureArchV9 initializes a fresh main-thread Game with simTick=0 before the
  // Worker bridge launches; never overwrite a loaded resync/save tick with that
  // transient bootstrap value.
  const loadedAuthoritativeTick205 = Number(loadedExtension?.simTick);
  const loadedAuthoritativeRng205 = Number(loadedExtension?.rngSeed);
  const authoritative = {
    version: VERSION, build: BUILD,
    simTick: Number.isFinite(loadedAuthoritativeTick205)
      ? loadedAuthoritativeTick205
      : finite(game.simTick, Math.round(game.time * SIM_HZ)),
    rngSeed: Number.isFinite(loadedAuthoritativeRng205)
      ? loadedAuthoritativeRng205
      : finite(game.rng?.seed, game.seed),
"""
    if bridge.count(old) != 1:
        raise RuntimeError('build 205 loaded authoritative identity anchor missing')
    bridge = bridge.replace(old, new, 1)
    bridge_path.write_text(bridge, 'utf-8')

mp = mp_path.read_text('utf-8')
if 'snapshotAppliedSeq205' not in mp:
    old_start = """  function restoreSnapshot(snapshot) {
    if (!snapshot?.entities || !snapshot.__mp) return;
    const localCamera = debug.game?.camera ? { ...debug.game.camera } : null;
    debug.startGame({
"""
    new_start = """  function restoreSnapshot(snapshot) {
    if (!snapshot?.entities || !snapshot.__mp) return;
    const localCamera = debug.game?.camera ? { ...debug.game.camera } : null;
    // The replacement bridge reads multiplayerState() during debug.startGame().
    // Install the snapshot watermark before that launch, not afterwards.
    const snapshotAppliedSeq205 = Number(snapshot.__mp.appliedSeq) || 0;
    state.lastAppliedSeq = snapshotAppliedSeq205;
    state.queue = [];
    state.seen.clear();
    debug.startGame({
"""
    if mp.count(old_start) != 1:
        raise RuntimeError('build 205 restoreSnapshot pre-launch anchor missing')
    mp = mp.replace(old_start, new_start, 1)

    old_late = """    state.lastAppliedSeq = Number(snapshot.__mp.appliedSeq) || 0;
    state.queue = [];
    state.seen.clear();
"""
    new_late = """    // snapshotAppliedSeq205 was installed before the replacement Worker
    // launched; keep the main-thread mirror on the same frozen watermark.
    state.lastAppliedSeq = snapshotAppliedSeq205;
"""
    if mp.count(old_late) != 1:
        raise RuntimeError('build 205 restoreSnapshot late watermark anchor missing')
    mp = mp.replace(old_late, new_late, 1)

    old_finish = """    state.lastStatusTick = -1;
    game.alert?.('Связь восстановлена · состояние боя синхронизировано', 'info');
    send('fd:mp-resynced', { tick: game.simTick });
  }
"""
    new_finish = """    state.lastStatusTick = -1;
    game.alert?.('Связь восстановлена · состояние боя синхронизировано', 'info');

    // Do not tell the lobby to replay the journal until the replacement
    // authoritative Worker has actually accepted the snapshot. Dispatching
    // replay during bridge bootstrap made delivery depend on Worker startup
    // timing and could strand all commands after a resync.
    const handoffStarted205 = performance.now();
    const finishWorkerHandoff205 = () => {
      const bridge = window.__FD_STABLE_STATE165__?.bridge || debug.game?.authoritativeBridge172;
      if (bridge?.ready && !bridge.failed) {
        bridge.appliedNetworkSeq = Math.max(Number(bridge.appliedNetworkSeq || 0), snapshotAppliedSeq205);
        if (Number.isFinite(state.hostTick)) bridge.sendClock?.(Number(state.hostTick));
        send('fd:mp-resynced', {
          tick: Number(bridge.workerTick || game.simTick || snapshot.__mp.simTick || 0),
          baseSeq: snapshotAppliedSeq205,
        });
        return;
      }
      if (performance.now() - handoffStarted205 < 8000) {
        setTimeout(finishWorkerHandoff205, 25);
        return;
      }
      game.alert?.('Не удалось восстановить authoritative Worker', 'error');
      send('fd:mp-resync-failed', { baseSeq: snapshotAppliedSeq205 });
    };
    finishWorkerHandoff205();
  }
"""
    if mp.count(old_finish) != 1:
        raise RuntimeError('build 205 restoreSnapshot handoff completion anchor missing')
    mp = mp.replace(old_finish, new_finish, 1)
    mp_path.write_text(mp, 'utf-8')

print('Build 205 resync now preserves snapshot tick/RNG and waits for replacement Worker readiness')
