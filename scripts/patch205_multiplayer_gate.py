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
            networkHashInputHistory205: message.networkHashInputHistory205 || [],
            unitDriftHistory205: message.unitDriftHistory205 || [],
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
  const mismatchTick205 = Number(preCommandStable205.lastMismatch205?.tick || preCommandStable205.lastHashPair205?.tick || 0);
  const hostInput205 = hostWorker.networkHashInputHistory205?.find(entry => Number(entry.tick) === mismatchTick205) || null;
  const guestInput205 = guestWorker.networkHashInputHistory205?.find(entry => Number(entry.tick) === mismatchTick205) || null;
  let firstDifference205 = null;
  if (!hostInput205 || !guestInput205) {
    firstDifference205 = { kind: 'missing-checkpoint', mismatchTick205, hostTicks: hostWorker.networkHashInputHistory205?.map(entry => entry.tick), guestTicks: guestWorker.networkHashInputHistory205?.map(entry => entry.tick) };
  } else {
    for (const field of ['timeTick', 'rngSeed']) {
      if (hostInput205[field] !== guestInput205[field]) { firstDifference205 = { kind: field, host: hostInput205[field], guest: guestInput205[field] }; break; }
    }
    if (!firstDifference205 && JSON.stringify(hostInput205.credits) !== JSON.stringify(guestInput205.credits)) {
      firstDifference205 = { kind: 'credits', host: hostInput205.credits, guest: guestInput205.credits };
    }
    if (!firstDifference205) {
      const count = Math.max(hostInput205.entities?.length || 0, guestInput205.entities?.length || 0);
      for (let index = 0; index < count; index += 1) {
        const hostTuple = hostInput205.entities?.[index] || null;
        const guestTuple = guestInput205.entities?.[index] || null;
        if (JSON.stringify(hostTuple) !== JSON.stringify(guestTuple)) {
          firstDifference205 = { kind: 'entity', index, host: hostTuple, guest: guestTuple };
          break;
        }
      }
    }
    if (!firstDifference205) {
      const count = Math.max(hostInput205.projectiles?.length || 0, guestInput205.projectiles?.length || 0);
      for (let index = 0; index < count; index += 1) {
        const hostTuple = hostInput205.projectiles?.[index] || null;
        const guestTuple = guestInput205.projectiles?.[index] || null;
        if (JSON.stringify(hostTuple) !== JSON.stringify(guestTuple)) {
          firstDifference205 = { kind: 'projectile', index, host: hostTuple, guest: guestTuple };
          break;
        }
      }
    }
    if (!firstDifference205 && hostInput205.hash !== guestInput205.hash) firstDifference205 = { kind: 'hash-only', host: hostInput205.hash, guest: guestInput205.hash };
  }

  let firstUnitDrift205 = null;
  const hostTraceByTick205 = new Map((hostWorker.unitDriftHistory205 || []).map(entry => [Number(entry.tick), entry]));
  const guestTraceByTick205 = new Map((guestWorker.unitDriftHistory205 || []).map(entry => [Number(entry.tick), entry]));
  for (let tick = 0; tick <= mismatchTick205 && !firstUnitDrift205; tick += 1) {
    const hostTrace = hostTraceByTick205.get(tick);
    const guestTrace = guestTraceByTick205.get(tick);
    if (!hostTrace || !guestTrace) continue;
    const hostUnits = new Map((hostTrace.units || []).map(unit => [String(unit.id), unit]));
    const guestUnits = new Map((guestTrace.units || []).map(unit => [String(unit.id), unit]));
    for (const id of [...new Set([...hostUnits.keys(), ...guestUnits.keys()])].sort()) {
      const hostUnit = hostUnits.get(id) || null;
      const guestUnit = guestUnits.get(id) || null;
      if (JSON.stringify(hostUnit) !== JSON.stringify(guestUnit)) {
        firstUnitDrift205 = { tick, id, host: hostUnit, guest: guestUnit };
        break;
      }
    }
  }
  const hostSummary205 = { ...hostWorker, networkHashInputHistory205: undefined, unitDriftHistory205: undefined };
  const guestSummary205 = { ...guestWorker, networkHashInputHistory205: undefined, unitDriftHistory205: undefined };
  throw new Error(`Co-op diverged before player input: ${JSON.stringify({ preCommandStable205, mismatchTick205, firstDifference205, firstUnitDrift205, hostInput205, guestInput205, hostWorker: hostSummary205, guestWorker: guestSummary205 })}`);
}

const coopHostMove = await issueMove(coop.host, { x: 410, y: 130 });
"""
if text.count(command_anchor) != 1:
    raise RuntimeError('build 205 pre-command gate anchor missing')
text = text.replace(command_anchor, command_replacement, 1)

path.write_text(text, 'utf-8')
print('Build 205 clean six-checkpoint pre-command determinism gate installed with first-tick unit drift diagnostics')
