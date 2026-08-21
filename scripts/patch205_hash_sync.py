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

    // Consume each tick exactly once. Network delivery and the local frame
    // callback are asynchronous, so either side may arrive first.
    hostStatuses.delete(key);
    remoteStatuses.delete(key);
    state.hashChecks += 1;
    if (local.hash === remote.hash) state.mismatchStreak = 0;
    else {
      state.hashMismatches += 1;
      state.mismatchStreak += 1;
      if (state.mismatchStreak >= 2) requestResync('контрольная сумма симуляции различается');
    }
    updateUI();
    return true;
  }

  function compareRemoteStatus(status) {
    if (state.role !== 'host' || !status || !Number.isFinite(Number(status.tick))) return;
    state.remoteStatus = status;
    state.remoteTick = Number(status.tick) || 0;
    remoteStatuses.set(state.remoteTick, status);
    trimStatusHistory();
    compareStatusTick(state.remoteTick);
  }
"""
if text.count(old_compare) != 1:
    raise RuntimeError('build 205 hash-sync comparison anchor missing')
text = text.replace(old_compare, new_compare, 1)

old_local = """          hostStatuses.set(state.hostTick, status);
          trimStatusHistory();
          sendPacket({ kind: 'clock', tick: state.hostTick });
"""
new_local = """          hostStatuses.set(state.hostTick, status);
          trimStatusHistory();
          compareStatusTick(state.hostTick);
          sendPacket({ kind: 'clock', tick: state.hostTick });
"""
if text.count(old_local) != 1:
    raise RuntimeError('build 205 hash-sync local status anchor missing')
text = text.replace(old_local, new_local, 1)

path.write_text(text, 'utf-8')
print('Build 205 hash checkpoint matching patched')
