from pathlib import Path

BUILD = 205
path = Path('dist/multiplayer-lobby-v205.js')
if not path.exists():
    raise RuntimeError(f'build {BUILD} multiplayer lobby missing: {path}')

text = path.read_text('utf-8')

old_maps = """  const fragments = new Map();
  const hostStatuses = new Map();
"""
new_maps = """  const fragments = new Map();
  const hostStatuses = new Map();
  const remoteStatuses = new Map();
"""
if text.count(old_maps) != 1:
    raise RuntimeError('build 205 hash-sync map anchor missing')
text = text.replace(old_maps, new_maps, 1)

old_reset = """    state.eventSequence = 0;
    state.mismatchStreak = 0;
    hostStatuses.clear();
"""
new_reset = """    state.eventSequence = 0;
    state.mismatchStreak = 0;
    hostStatuses.clear();
    remoteStatuses.clear();
"""
if text.count(old_reset) != 1:
    raise RuntimeError('build 205 hash-sync reset anchor missing')
text = text.replace(old_reset, new_reset, 1)

old_compare = """  function trimStatusHistory() {
    while (hostStatuses.size > STATUS_HISTORY) hostStatuses.delete(hostStatuses.keys().next().value);
  }

  function compareRemoteStatus(status) {
    if (state.role !== 'host' || !status || !Number.isFinite(Number(status.tick))) return;
    state.remoteStatus = status;
    state.remoteTick = Number(status.tick) || 0;
    const local = hostStatuses.get(state.remoteTick);
    if (!local || !local.hash || !status.hash) return;
    state.hashChecks += 1;
    if (local.hash === status.hash) state.mismatchStreak = 0;
    else {
      state.hashMismatches += 1;
      state.mismatchStreak += 1;
      if (state.mismatchStreak >= 2) requestResync('контрольная сумма симуляции различается');
    }
    updateUI();
  }
"""
new_compare = """  function trimStatusHistory() {
    while (hostStatuses.size > STATUS_HISTORY) hostStatuses.delete(hostStatuses.keys().next().value);
    while (remoteStatuses.size > STATUS_HISTORY) remoteStatuses.delete(remoteStatuses.keys().next().value);
  }

  function compareStatusTick(tick) {
    if (state.role !== 'host' || !Number.isFinite(Number(tick))) return false;
    const key = Number(tick) || 0;
    const local = hostStatuses.get(key);
    const remote = remoteStatuses.get(key);
    if (!local || !remote || !local.hash || !remote.hash) return false;

    // Consume each authoritative hash tick exactly once. The transport clock
    // is intentionally separate: status.clockTick may be newer than the tick
    // whose network hash is being carried by that snapshot.
    hostStatuses.delete(key);
    remoteStatuses.delete(key);
    state.hashChecks += 1;
    state.lastHashPair205 = {
      tick: key,
      localHash: local.hash,
      remoteHash: remote.hash,
      localClockTick: Number(local.clockTick ?? key) || key,
      remoteClockTick: Number(remote.clockTick ?? key) || key,
      localRngSeed: Number(local.rngSeed) >>> 0,
      remoteRngSeed: Number(remote.rngSeed) >>> 0,
      localSubsystemHashes: local.subsystemHashes || null,
      remoteSubsystemHashes: remote.subsystemHashes || null,
    };
    if (local.hash === remote.hash) state.mismatchStreak = 0;
    else {
      state.hashMismatches += 1;
      state.mismatchStreak += 1;
      state.lastMismatch205 = { ...state.lastHashPair205 };
      if (state.mismatchStreak >= 2) requestResync('контрольная сумма симуляции различается');
    }
    updateUI();
    return true;
  }

  function compareRemoteStatus(status) {
    if (state.role !== 'host' || !status || !Number.isFinite(Number(status.tick))) return;
    state.remoteStatus = status;
    const checkpointTick = Number(status.tick) || 0;
    state.remoteTick = Number(status.clockTick ?? checkpointTick) || checkpointTick;
    remoteStatuses.set(checkpointTick, status);
    trimStatusHistory();
    compareStatusTick(checkpointTick);
  }
"""
if text.count(old_compare) != 1:
    raise RuntimeError('build 205 hash-sync comparison anchor missing')
text = text.replace(old_compare, new_compare, 1)

old_local = """          state.hostTick = Number(status.tick) || 0;
          state.remoteTick = Number(state.remoteStatus?.tick) || 0;
          hostStatuses.set(state.hostTick, status);
          trimStatusHistory();
          sendPacket({ kind: 'clock', tick: state.hostTick });
"""
new_local = """          const checkpointTick205 = Number(status.tick) || 0;
          state.hostTick = Number(status.clockTick ?? checkpointTick205) || checkpointTick205;
          state.remoteTick = Number(state.remoteStatus?.clockTick ?? state.remoteStatus?.tick) || 0;
          hostStatuses.set(checkpointTick205, status);
          trimStatusHistory();
          compareStatusTick(checkpointTick205);
          sendPacket({ kind: 'clock', tick: state.hostTick });
"""
if text.count(old_local) != 1:
    raise RuntimeError('build 205 hash-sync local status anchor missing')
text = text.replace(old_local, new_local, 1)

old_guest = """        } else {
          state.remoteTick = Number(status.tick) || 0;
          sendPacket({ kind: 'status', status });
        }
"""
new_guest = """        } else {
          state.remoteTick = Number(status.clockTick ?? status.tick) || 0;
          sendPacket({ kind: 'status', status });
        }
"""
if text.count(old_guest) != 1:
    raise RuntimeError('build 205 guest status clock anchor missing')
text = text.replace(old_guest, new_guest, 1)

path.write_text(text, 'utf-8')
print('Build 205 hash checkpoint matching patched with independent clock ticks')
