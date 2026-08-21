from pathlib import Path

BUILD = 205
path = Path('tests/multiplayer205.mjs')
if not path.exists():
    raise RuntimeError(f'build {BUILD} multiplayer test missing: {path}')

text = path.read_text('utf-8')
if 'preCommandStable205' in text:
    print('Build 205 clean pre-command determinism gate already installed')
    raise SystemExit(0)

diag_anchor = """            tick: message.tick,
            networkHash: message.networkHash,
            multiplayer: message.multiplayer,
            aiEnabled: message.aiEnabled,
            counts: message.counts,
            actionQueue: message.performance?.actionQueue,
"""
diag_replacement = """            tick: message.tick,
            time: message.time,
            stateHash: message.stateHash,
            subsystemHashes: message.subsystemHashes,
            networkHash: message.networkHash,
            networkHashTick: message.networkHashTick,
            multiplayer: message.multiplayer,
            aiEnabled: message.aiEnabled,
            rngSeed205: message.rngSeed205,
            counts: message.counts,
            actionQueue: message.performance?.actionQueue,
"""
if text.count(diag_anchor) != 1:
    raise RuntimeError('build 205 Worker diagnostic projection anchor missing')
text = text.replace(diag_anchor, diag_replacement, 1)

command_anchor = """const coopHostMove = await issueMove(coop.host, { x: 410, y: 130 });
"""
command_replacement = """// Prove autonomous co-op determinism before any player input. This catches
// AI/scheduler/RNG divergence before a command or resync can hide its origin.
const preCommandStable205 = await waitFor(coop.host, () => {
  const diag = globalThis.__FD_MULTIPLAYER_LOBBY_205__?.diagnostics?.();
  const checks = Number(diag?.hashChecks || 0);
  const mismatches = Number(diag?.hashMismatches || 0);
  if (mismatches > 0) return {
    failed: true,
    hashChecks: checks,
    hashMismatches: mismatches,
    mismatchStreak: Number(diag?.mismatchStreak || 0),
    resyncsRequested: Number(diag?.resyncsRequested || 0),
    lastHashPair205: diag?.lastHashPair205 || null,
    lastMismatch205: diag?.lastMismatch205 || null,
  };
  return checks >= 6 ? {
    failed: false,
    hashChecks: checks,
    hashMismatches: mismatches,
    mismatchStreak: Number(diag?.mismatchStreak || 0),
    resyncsRequested: Number(diag?.resyncsRequested || 0),
  } : null;
}, undefined, 18000, 50);
if (preCommandStable205.failed || preCommandStable205.hashMismatches || preCommandStable205.mismatchStreak || preCommandStable205.resyncsRequested) {
  const [hostWorker, guestWorker] = await Promise.all([workerDiagnostics(coop.host), workerDiagnostics(coop.guest)]);
  throw new Error(`Co-op diverged before player input: ${JSON.stringify({ preCommandStable205, hostWorker, guestWorker })}`);
}

const coopHostMove = await issueMove(coop.host, { x: 410, y: 130 });
"""
if text.count(command_anchor) != 1:
    raise RuntimeError('build 205 pre-command gate anchor missing')
text = text.replace(command_anchor, command_replacement, 1)

path.write_text(text, 'utf-8')
print('Build 205 clean six-checkpoint pre-command determinism gate installed')
