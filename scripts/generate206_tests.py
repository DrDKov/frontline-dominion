from pathlib import Path

ROOT = Path('.')
TESTS = ROOT / 'tests'


def generate(source_name, target_name, replacements):
    source = TESTS / source_name
    if not source.exists():
        raise RuntimeError(f'missing inherited test: {source}')
    text = source.read_text('utf-8')
    for old, new in replacements:
        text = text.replace(old, new)
    (TESTS / target_name).write_text(text, 'utf-8')
    print(f'generated {target_name}')

common = [
    ('?build=205', '?build=206'),
    ('__FD_SAVE_SLOTS_205__', '__FD_SAVE_SLOTS_206__'),
    ('__FD_RUNTIME_SHELL_205__', '__FD_RUNTIME_SHELL_206__'),
    ('__FD_MULTIPLAYER_LOBBY_205__', '__FD_MULTIPLAYER_LOBBY_206__'),
    ('lobby?.build === 205', 'lobby?.build === 206'),
    ('menu.build !== 205', 'menu.build !== 206'),
    ('build-205 gate', 'build-206 gate'),
    ('build 205', 'build 206'),
    ('build-205', 'build-206'),
]

generate('save-slots205.mjs', 'save-slots206.generated.mjs', common)
generate('multiplayer205.mjs', 'multiplayer206.generated.mjs', common)
generate('multiplayer205-soak.mjs', 'multiplayer206-soak.generated.mjs', common)

# Surface the matched-tick component hashes recorded by the build-206 lobby.
# This is diagnostic-only and never relaxes an inherited deterministic gate.
mp_path = TESTS / 'multiplayer206.generated.mjs'
mp = mp_path.read_text('utf-8')
anchor = "        lastEvent: diag.lastEvent || null,\n"
if mp.count(anchor) != 1:
    raise RuntimeError(f'build 206 multiplayer diagnostic anchor count={mp.count(anchor)}')
mp = mp.replace(
    anchor,
    anchor
    + "        firstHashMismatch206: diag.firstHashMismatch206 || null,\n"
    + "        lastHashMismatch206: diag.lastHashMismatch206 || null,\n",
    1,
)

# Do not spend the full synchronization timeout once a real matched-tick
# mismatch is known. Report the first divergent epoch, before secondary
# economic/logistics feedback can contaminate every component.
sync_anchor = "    const host = globalThis.__FD_MULTIPLAYER_LOBBY_206__?.diagnostics?.();\n    const win = document.getElementById('mp-game-frame205')?.contentWindow;\n"
if mp.count(sync_anchor) != 1:
    raise RuntimeError(f'build 206 synchronization diagnostic anchor count={mp.count(sync_anchor)}')
sync_diag = (
    "    const host = globalThis.__FD_MULTIPLAYER_LOBBY_206__?.diagnostics?.();\n"
    "    if (Number(host?.hashMismatches || 0) > 0) {\n"
    "      throw new Error(`Build 206 matched-tick divergence: ${JSON.stringify({\n"
    "        hashChecks: host.hashChecks, hashMismatches: host.hashMismatches, mismatchStreak: host.mismatchStreak,\n"
    "        firstHashMismatch206: host.firstHashMismatch206 || null, lastHashMismatch206: host.lastHashMismatch206 || null,\n"
    "        lastEvent: host.lastEvent || null,\n"
    "      })}`);\n"
    "    }\n"
    "    const win = document.getElementById('mp-game-frame205')?.contentWindow;\n"
)
mp = mp.replace(sync_anchor, sync_diag, 1)

# A post-resync timeout needs lifecycle evidence from both clients. The normal
# gate remains unchanged; this only enriches the thrown error if seq delivery
# or Worker execution stalls after the explicit recovery snapshot.
post_anchor = "const coopAppliedAfterResync = await waitApplied(coop, postResyncEvent.seq);\n"
if mp.count(post_anchor) != 1:
    raise RuntimeError(f'build 206 post-resync diagnostic anchor count={mp.count(post_anchor)}')
post_diag = r"""let coopAppliedAfterResync;
try {
  coopAppliedAfterResync = await waitApplied(coop, postResyncEvent.seq);
} catch (error) {
  const inspect = page => page.evaluate(() => {
    const lobby = globalThis.__FD_MULTIPLAYER_LOBBY_206__?.diagnostics?.() || null;
    const win = document.getElementById('mp-game-frame205')?.contentWindow;
    const bridge = win?.__FD_STABLE_STATE165__?.bridge || null;
    const mp = win?.__FD_MULTIPLAYER__ || null;
    const handoff = win?.__FD_MP_RESYNC_HANDOFF_206__ || null;
    return {
      lobby: lobby ? {
        role: lobby.role, hostTick: lobby.hostTick, remoteTick: lobby.remoteTick,
        hashChecks: lobby.hashChecks, hashMismatches: lobby.hashMismatches,
        mismatchStreak: lobby.mismatchStreak, eventsSent: lobby.eventsSent,
        eventsReceived: lobby.eventsReceived, packetsSent: lobby.packetsSent,
        packetsReceived: lobby.packetsReceived, snapshotsSent: lobby.snapshotsSent,
        snapshotsReceived: lobby.snapshotsReceived, lastEvent: lobby.lastEvent || null,
      } : null,
      bridge: bridge ? {
        id: bridge.id, ready: Boolean(bridge.ready), failed: Boolean(bridge.failed),
        worker: Boolean(bridge.worker), workerTick: Number(bridge.workerTick || 0),
        appliedNetworkSeq: Number(bridge.appliedNetworkSeq || 0), seq: Number(bridge.seq || 0),
        lastAck: Number(bridge.lastAck || 0), actionErrors: Number(bridge.actionErrors || 0),
      } : null,
      multiplayer: mp ? {
        active: Boolean(mp.active), role: mp.role, mode: mp.mode,
        lastAppliedSeq: Number(mp.lastAppliedSeq || 0), hostTick: Number(mp.hostTick || 0),
        hostTickAgeMs: Number.isFinite(mp.hostTickReceivedAt) ? performance.now() - Number(mp.hostTickReceivedAt) : null,
      } : null,
      handoff: handoff ? JSON.parse(JSON.stringify(handoff)) : null,
      gameTick: Number(win?.__FD_DEBUG__?.game?.simTick || 0),
    };
  });
  const [hostState, guestState, hostWorker, guestWorker] = await Promise.all([
    inspect(coop.host), inspect(coop.guest), workerDiagnostics(coop.host), workerDiagnostics(coop.guest),
  ]);
  throw new Error(`Build 206 post-resync command ${postResyncEvent.seq} did not apply: ${JSON.stringify({
    original: String(error?.message || error), postResyncEvent, hostState, guestState, hostWorker, guestWorker,
  })}`);
}
"""
mp = mp.replace(post_anchor, post_diag, 1)

mp_path.write_text(mp, 'utf-8')
print('instrumented multiplayer206.generated.mjs first matched-tick and post-resync diagnostics')
