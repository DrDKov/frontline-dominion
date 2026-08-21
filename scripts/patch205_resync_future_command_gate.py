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
post_resync_replacement = """const pendingAppliedAfterResync205 = await waitApplied(coop, pendingResyncEvent205.seq);

const postResyncMove = await issueMove(coop.guest, { x: 190, y: -260 });
"""
if text.count(post_resync_anchor) != 1:
    raise RuntimeError('build 205 post-resync command anchor missing')
text = text.replace(post_resync_anchor, post_resync_replacement, 1)

previous_anchor = """}, guestEvent.seq, 5000);
const coopAppliedAfterResync = await waitApplied(coop, postResyncEvent.seq);
"""
previous_replacement = """}, pendingResyncEvent205.seq, 5000);
const coopAppliedAfterResync = await waitApplied(coop, postResyncEvent.seq);
"""
if text.count(previous_anchor) != 1:
    raise RuntimeError('build 205 post-resync sequence anchor missing')
text = text.replace(previous_anchor, previous_replacement, 1)

output_events_anchor = """    events: [hostEvent, guestEvent, postResyncEvent],
    applied: [coopApplied1, coopApplied2, coopAppliedAfterResync],
"""
output_events_replacement = """    events: [hostEvent, guestEvent, pendingResyncEvent205, postResyncEvent],
    applied: [coopApplied1, coopApplied2, pendingAppliedAfterResync205, coopAppliedAfterResync],
    futureCommandResync: { event: pendingResyncEvent205, before: pendingWindow205, applied: pendingAppliedAfterResync205 },
"""
if text.count(output_events_anchor) != 1:
    raise RuntimeError('build 205 multiplayer output anchor missing')
text = text.replace(output_events_anchor, output_events_replacement, 1)

path.write_text(text, 'utf-8')
print('Build 205 resync gate now preserves an agreed future command across Worker replacement')
