from pathlib import Path

BUILD = 205
path = Path('tests/multiplayer205.mjs')
if not path.exists():
    raise RuntimeError(f'build {BUILD} multiplayer test missing: {path}')

text = path.read_text('utf-8')
if 'pendingResyncEvent205' in text:
    print('Build 205 future-command resync gate already installed')
    raise SystemExit(0)

resync_anchor = """const snapshotsBefore = await coop.host.evaluate(() => globalThis.__FD_MULTIPLAYER_LOBBY_205__.state.snapshotsSent);
const receivedBefore = await coop.guest.evaluate(() => globalThis.__FD_MULTIPLAYER_LOBBY_205__.state.snapshotsReceived);
await coop.guest.evaluate(() => {
"""
resync_replacement = """// Schedule one command far enough in the future, then resync before its
// authoritative atTick. The replacement guest Worker must replay the already
// agreed event from the journal instead of losing it with the old actionQueue.
await coop.host.evaluate(() => { globalThis.__FD_MULTIPLAYER_LOBBY_205__.state.rtt = 480; });
const pendingResyncMove205 = await issueMove(coop.guest, { x: 145, y: 285 });
if (pendingResyncMove205.error || !pendingResyncMove205.issued) {
  throw new Error(`Pending-resync command was not issued: ${JSON.stringify(pendingResyncMove205)}`);
}
const pendingResyncEvent205 = await waitFor(coop.host, previous => {
  const event = globalThis.__FD_MULTIPLAYER_LOBBY_205__?.state?.lastEvent;
  return Number(event?.seq || 0) > previous ? event : null;
}, guestEvent.seq, 5000, 25);
const pendingWindow205 = await Promise.all([
  coop.host.evaluate(seq => {
    const win = document.getElementById('mp-game-frame205')?.contentWindow;
    const bridge = win?.__FD_STABLE_STATE165__?.bridge;
    return { tick: Number(bridge?.workerTick || 0), applied: Number(bridge?.appliedNetworkSeq || 0), seq };
  }, pendingResyncEvent205.seq),
  coop.guest.evaluate(seq => {
    const win = document.getElementById('mp-game-frame205')?.contentWindow;
    const bridge = win?.__FD_STABLE_STATE165__?.bridge;
    return { tick: Number(bridge?.workerTick || 0), applied: Number(bridge?.appliedNetworkSeq || 0), seq };
  }, pendingResyncEvent205.seq),
]);
await coop.host.evaluate(() => { globalThis.__FD_MULTIPLAYER_LOBBY_205__.state.rtt = 40; });
const latestPendingTick205 = Math.max(...pendingWindow205.map(item => item.tick));
if (pendingWindow205.some(item => item.applied >= pendingResyncEvent205.seq) || Number(pendingResyncEvent205.atTick || 0) - latestPendingTick205 < 8) {
  throw new Error(`Could not establish a future command before resync: ${JSON.stringify({ pendingResyncEvent205, pendingWindow205 })}`);
}

const snapshotsBefore = await coop.host.evaluate(() => globalThis.__FD_MULTIPLAYER_LOBBY_205__.state.snapshotsSent);
const receivedBefore = await coop.guest.evaluate(() => globalThis.__FD_MULTIPLAYER_LOBBY_205__.state.snapshotsReceived);
await coop.guest.evaluate(() => {
"""
if text.count(resync_anchor) != 1:
    raise RuntimeError('build 205 explicit resync anchor missing')
text = text.replace(resync_anchor, resync_replacement, 1)

post_resync_anchor = """const postResyncMove = await issueMove(coop.guest, { x: 190, y: -260 });
"""
post_resync_replacement = """async function recoveryDiagnostics205() {
  const [hostWorker, guestWorker, hostLobby, guestLobby, hostBridge, guestBridge] = await Promise.all([
    workerDiagnostics(coop.host).catch(error => ({ error: String(error) })),
    workerDiagnostics(coop.guest).catch(error => ({ error: String(error) })),
    coop.host.evaluate(() => globalThis.__FD_MULTIPLAYER_LOBBY_205__?.diagnostics?.() || null),
    coop.guest.evaluate(() => globalThis.__FD_MULTIPLAYER_LOBBY_205__?.diagnostics?.() || null),
    coop.host.evaluate(() => {
      const win = document.getElementById('mp-game-frame205')?.contentWindow;
      const bridge = win?.__FD_STABLE_STATE165__?.bridge;
      const mp = win?.__FD_MULTIPLAYER__;
      return { ready: Boolean(bridge?.ready), failed: Boolean(bridge?.failed), workerTick: Number(bridge?.workerTick || 0), appliedNetworkSeq: Number(bridge?.appliedNetworkSeq || 0), lastAck: Number(bridge?.lastAck || 0), actionErrors: Number(bridge?.actionErrors || 0), mpAppliedSeq: Number(mp?.lastAppliedSeq || 0), mpHostTick: Number(mp?.hostTick || 0) };
    }),
    coop.guest.evaluate(() => {
      const win = document.getElementById('mp-game-frame205')?.contentWindow;
      const bridge = win?.__FD_STABLE_STATE165__?.bridge;
      const mp = win?.__FD_MULTIPLAYER__;
      return { ready: Boolean(bridge?.ready), failed: Boolean(bridge?.failed), workerTick: Number(bridge?.workerTick || 0), appliedNetworkSeq: Number(bridge?.appliedNetworkSeq || 0), lastAck: Number(bridge?.lastAck || 0), actionErrors: Number(bridge?.actionErrors || 0), mpAppliedSeq: Number(mp?.lastAppliedSeq || 0), mpHostTick: Number(mp?.hostTick || 0) };
    }),
  ]);
  return { hostWorker, guestWorker, hostLobby, guestLobby, hostBridge, guestBridge };
}

const replayProof205 = await waitFor(coop.guest, seq => {
  const diag = globalThis.__FD_MULTIPLAYER_LOBBY_205__?.diagnostics?.();
  const baseSeq = Number(diag?.lastSnapshotBaseSeq205 || 0);
  const replayed = Number(diag?.lastReplayCount205 || 0);
  return baseSeq < seq && replayed > 0
    ? { baseSeq, replayed, eventHistory: Number(diag?.eventHistory || 0), snapshotsReceived: Number(diag?.snapshotsReceived || 0) }
    : null;
}, pendingResyncEvent205.seq, 8000, 40);
if (replayProof205.baseSeq >= pendingResyncEvent205.seq || replayProof205.replayed < 1) {
  throw new Error(`Future command was not actually journal-replayed: ${JSON.stringify({ pendingResyncEvent205, replayProof205 })}`);
}
let pendingAppliedAfterResync205;
try {
  pendingAppliedAfterResync205 = await waitApplied(coop, pendingResyncEvent205.seq);
} catch (error) {
  throw new Error(`Journal-replayed future command did not apply: ${JSON.stringify({ message: String(error?.message || error), pendingResyncEvent205, replayProof205, diagnostics: await recoveryDiagnostics205() })}`);
}

const postResyncMove = await issueMove(coop.guest, { x: 190, y: -260 });
"""
if text.count(post_resync_anchor) != 1:
    raise RuntimeError('build 205 post-resync command anchor missing')
text = text.replace(post_resync_anchor, post_resync_replacement, 1)

previous_anchor = """}, guestEvent.seq, 5000);
const coopAppliedAfterResync = await waitApplied(coop, postResyncEvent.seq);
"""
previous_replacement = """}, pendingResyncEvent205.seq, 5000);
let coopAppliedAfterResync;
try {
  coopAppliedAfterResync = await waitApplied(coop, postResyncEvent.seq);
} catch (error) {
  throw new Error(`New command after resync did not apply: ${JSON.stringify({ message: String(error?.message || error), postResyncEvent, diagnostics: await recoveryDiagnostics205() })}`);
}
"""
if text.count(previous_anchor) != 1:
    raise RuntimeError('build 205 post-resync sequence anchor missing')
text = text.replace(previous_anchor, previous_replacement, 1)

output_events_anchor = """    events: [hostEvent, guestEvent, postResyncEvent],
    applied: [coopApplied1, coopApplied2, coopAppliedAfterResync],
"""
output_events_replacement = """    events: [hostEvent, guestEvent, pendingResyncEvent205, postResyncEvent],
    applied: [coopApplied1, coopApplied2, pendingAppliedAfterResync205, coopAppliedAfterResync],
    futureCommandResync: { event: pendingResyncEvent205, before: pendingWindow205, replay: replayProof205, applied: pendingAppliedAfterResync205 },
"""
if text.count(output_events_anchor) != 1:
    raise RuntimeError('build 205 multiplayer output anchor missing')
text = text.replace(output_events_anchor, output_events_replacement, 1)

path.write_text(text, 'utf-8')
print('Build 205 resync gate now proves an agreed future command is journal-replayed across Worker replacement with exact failure diagnostics')
