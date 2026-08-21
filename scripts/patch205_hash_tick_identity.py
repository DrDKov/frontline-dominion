from pathlib import Path

BUILD = 205
path = Path('dist/authoritative-simulation-v174.js')
if not path.exists():
    raise RuntimeError(f'build {BUILD} authoritative bridge missing: {path}')

text = path.read_text('utf-8')
if 'clockTick: snapshotTick205' in text:
    print('Build 205 network-hash tick identity already patched')
    raise SystemExit(0)

old = """  postMultiplayerStatus(message) {
    const mp = window.__FD_MULTIPLAYER__;
    if (!window.__FD_MULTIPLAYER_ACTIVE__ || !mp?.active) return;
    const tick = Number(message.tick) || 0;
    if (tick === this.lastStatusTick || tick % 5 !== 0) return;
    this.lastStatusTick = tick;
    window.parent.postMessage({ type: 'fd:mp-status', status: {
      tick, hash: message.networkHash || this.networkHash,
      units: message.counts?.units || 0, buildings: message.counts?.buildings || 0,
      gameTime: Number(message.time) || 0, ended: Boolean(this.game.ended)
    } }, window.location.origin);
  }
"""
new = """  postMultiplayerStatus(message) {
    const mp = window.__FD_MULTIPLAYER__;
    if (!window.__FD_MULTIPLAYER_ACTIVE__ || !mp?.active) return;

    // networkHash may be reused across several presentation snapshots. Pair it
    // by the tick on which the Worker actually calculated that hash, never by
    // the later snapshot tick that happened to carry it to the main thread.
    const snapshotTick205 = Number(message.tick) || 0;
    const rawHashTick205 = Number(message.networkHashTick);
    const hashTick205 = Number.isFinite(rawHashTick205) && rawHashTick205 >= 0
      ? rawHashTick205
      : snapshotTick205;
    const hash205 = message.networkHash || this.networkHash;
    if (!hash205 || hashTick205 === this.lastStatusTick) return;
    this.lastStatusTick = hashTick205;

    window.parent.postMessage({ type: 'fd:mp-status', status: {
      tick: hashTick205,
      hashTick: hashTick205,
      clockTick: snapshotTick205,
      hash: hash205,
      stateHash: Number(message.stateHash ?? this.stateHash) >>> 0,
      subsystemHashes: message.subsystemHashes || this.subsystemHashes || null,
      rngSeed: Number(message.rngSeed ?? this.latestRngSeed) >>> 0,
      appliedSeq: Number(message.appliedSeq ?? this.appliedNetworkSeq) || 0,
      units: message.counts?.units || 0, buildings: message.counts?.buildings || 0,
      gameTime: Number(message.time) || 0, ended: Boolean(this.game.ended)
    } }, window.location.origin);
  }
"""
if text.count(old) != 1:
    raise RuntimeError('build 205 multiplayer status publication anchor missing')
text = text.replace(old, new, 1)
path.write_text(text, 'utf-8')
print('Build 205 multiplayer hash identity now uses networkHashTick')
