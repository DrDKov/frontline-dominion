from pathlib import Path

BUILD = 205
test_path = Path('tests/multiplayer205.mjs')
module_path = Path('dist/multiplayer-game-v96.js')

if not test_path.exists():
    raise RuntimeError(f'build {BUILD} multiplayer test missing: {test_path}')
if not module_path.exists():
    raise RuntimeError(f'build {BUILD} multiplayer game module missing: {module_path}')

# Expose the exact state at the first deterministic-hash barrier. This is kept
# in the gate until the protocol is green so failures identify whether the
# clients publish different ticks or genuinely different hashes.
text = test_path.read_text('utf-8')
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

module = module_path.read_text('utf-8').splitlines()
for index, line in enumerate(module):
    if 'fd:mp-status' in line:
        lo = max(0, index - 14)
        hi = min(len(module), index + 15)
        print('FD205_MP_STATUS_SOURCE_BEGIN')
        for number in range(lo, hi):
            print(f'{number + 1}: {module[number]}')
        print('FD205_MP_STATUS_SOURCE_END')
        break
else:
    print('FD205_MP_STATUS_SOURCE_MISSING')

print('Build 205 multiplayer checkpoint diagnostics instrumented')
