from pathlib import Path

BUILD = 205
test_path = Path('tests/multiplayer205.mjs')
paths = {
    'multiplayer': Path('dist/multiplayer-game-v96.js'),
    'bridge': Path('dist/authoritative-simulation-v174.js'),
    'worker': Path('dist/authoritative-simulation-worker-v174.js'),
}
for name, path in paths.items():
    if not path.exists():
        raise RuntimeError(f'build {BUILD} {name} file missing: {path}')

text = test_path.read_text('utf-8')

diag_anchor = """            tick: message.tick,
            networkHash: message.networkHash,
            multiplayer: message.multiplayer,
            aiEnabled: message.aiEnabled,
            counts: message.counts,
            actionQueue: message.performance?.actionQueue,
"""
diag_replacement = """            tick: message.tick,
            time: message.time,
            paused: message.paused,
            running: message.running,
            manualMode: message.manualMode,
            stateHash: message.stateHash,
            subsystemHashes: message.subsystemHashes,
            networkHash: message.networkHash,
            networkHashTick: message.networkHashTick,
            unitCheckpointHistory205: message.unitCheckpointHistory205 || [],
            multiplayer: message.multiplayer,
            aiEnabled: message.aiEnabled,
            deterministicRandomCalls205: message.deterministicRandomCalls205,
            rngSeed205: message.rngSeed205,
            counts: message.counts,
            performance: message.performance,
            actionQueue: message.performance?.actionQueue,
"""
if text.count(diag_anchor) != 1:
    raise RuntimeError('build 205 Worker diagnostic projection anchor missing')
text = text.replace(diag_anchor, diag_replacement, 1)

pre_anchor = """const coopHostMove = await issueMove(coop.host, { x: 410, y: 130 });
"""
pre_instrumented = """const startupCheckpoint205 = {
  hostLobby: await coop.host.evaluate(() => globalThis.__FD_MULTIPLAYER_LOBBY_205__?.diagnostics?.()),
  guestLobby: await coop.guest.evaluate(() => globalThis.__FD_MULTIPLAYER_LOBBY_205__?.diagnostics?.()),
  hostWorker: await workerDiagnostics(coop.host),
  guestWorker: await workerDiagnostics(coop.guest),
  hostPage: await coop.host.evaluate(() => ({ visibility: document.visibilityState, now: performance.now() })),
  guestPage: await coop.guest.evaluate(() => ({ visibility: document.visibilityState, now: performance.now() })),
};
console.log('FD205_CHECKPOINT_BEFORE_FIRST_COMMAND ' + JSON.stringify(startupCheckpoint205));

// Stop on the first real mismatch, before the production two-strike resync can
// replace the guest Worker and erase the exact divergent checkpoint history.
const preCommandStable205 = await waitFor(coop.host, () => {
  const diag = globalThis.__FD_MULTIPLAYER_LOBBY_205__?.diagnostics?.();
  const checks = Number(diag?.hashChecks || 0);
  const mismatches = Number(diag?.hashMismatches || 0);
  return mismatches >= 1 || checks >= 6
    ? {
        hashChecks: checks,
        hashMismatches: mismatches,
        mismatchStreak: Number(diag.mismatchStreak || 0),
        resyncsRequested: Number(diag.resyncsRequested || 0),
        hostTick: Number(diag.hostTick || 0),
        remoteTick: Number(diag.remoteTick || 0),
        lastStatus: diag.lastStatus || null,
        remoteStatus: diag.remoteStatus || null,
        lastHashPair205: diag.lastHashPair205 || null,
        lastMismatch205: diag.lastMismatch205 || null,
      }
    : null;
}, undefined, 16000, 40);
const preCommandCheckpoint205 = {
  sync: preCommandStable205,
  hostLobby: await coop.host.evaluate(() => globalThis.__FD_MULTIPLAYER_LOBBY_205__?.diagnostics?.()),
  guestLobby: await coop.guest.evaluate(() => globalThis.__FD_MULTIPLAYER_LOBBY_205__?.diagnostics?.()),
  hostWorker: await workerDiagnostics(coop.host),
  guestWorker: await workerDiagnostics(coop.guest),
};
console.log('FD205_CHECKPOINT_PRE_COMMAND_STABILITY ' + JSON.stringify(preCommandCheckpoint205));
if (preCommandStable205.hashMismatches || preCommandStable205.mismatchStreak || preCommandStable205.resyncsRequested) {
  throw new Error(`Co-op first unit divergence before any player command: ${JSON.stringify(preCommandCheckpoint205)}`);
}
if (preCommandStable205.hashChecks < 6) {
  throw new Error(`Co-op did not reach six clean checkpoints: ${JSON.stringify(preCommandCheckpoint205)}`);
}

const coopHostMove = await issueMove(coop.host, { x: 410, y: 130 });
"""
if text.count(pre_anchor) != 1:
    raise RuntimeError('build 205 startup checkpoint test anchor missing')
text = text.replace(pre_anchor, pre_instrumented, 1)

anchor = """const coopApplied2 = await waitApplied(coop, guestEvent.seq);
const coopSync = await synchronization(coop, 3);
"""
instrumented = """const coopApplied2 = await waitApplied(coop, guestEvent.seq);
const checkpoint205 = {
  hostLobby: await coop.host.evaluate(() => globalThis.__FD_MULTIPLAYER_LOBBY_205__?.diagnostics?.()),
  guestLobby: await coop.guest.evaluate(() => globalThis.__FD_MULTIPLAYER_LOBBY_205__?.diagnostics?.()),
  hostWorker: await workerDiagnostics(coop.host),
  guestWorker: await workerDiagnostics(coop.guest),
  applied: { first: coopApplied1, second: coopApplied2 },
  events: { hostEvent, guestEvent },
};
console.log('FD205_CHECKPOINT_BEFORE_SYNC ' + JSON.stringify(checkpoint205));
const coopSync = await synchronization(coop, 3);
"""
if text.count(anchor) != 1:
    raise RuntimeError('build 205 multiplayer checkpoint test anchor missing')
test_path.write_text(text.replace(anchor, instrumented, 1), 'utf-8')

queries = {
    'multiplayer': ['function replay', "case 'fd:mp-snapshot'", "case 'fd:mp-resynced'"],
    'bridge': ['actionErrors', 'postMessage({ type: \'action\'', "type: 'action'", 'lastAck'],
    'worker': ['actionQueue', "case 'action'", 'function subsystemHashes', 'function networkStateHash', 'unitCheckpointHistory205', 'deterministicRandomCalls205', 'function startClock'],
}
for label, path in paths.items():
    lines = path.read_text('utf-8').splitlines()
    for pattern in queries[label]:
        hits = [i for i, line in enumerate(lines) if pattern in line]
        tag = pattern.replace(':', '_').replace('-', '_').replace(' ', '_').replace("'", '').replace('{', '').replace('}', '')
        if not hits:
            print(f'FD205_{label}_{tag}_SOURCE_MISSING')
            continue
        for occurrence, index in enumerate(hits[:3], 1):
            lo = max(0, index - 34)
            hi = min(len(lines), index + 125)
            print(f'FD205_{label}_{tag}_{occurrence}_SOURCE_BEGIN')
            for number in range(lo, hi):
                print(f'{number + 1}: {lines[number]}')
            print(f'FD205_{label}_{tag}_{occurrence}_SOURCE_END')

print('Build 205 first-divergent-unit, Worker clock and resync diagnostics instrumented')
