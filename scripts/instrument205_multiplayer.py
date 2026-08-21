from pathlib import Path

BUILD = 205
test_path = Path('tests/multiplayer205.mjs')
module_path = Path('dist/multiplayer-game-v96.js')

if not test_path.exists():
    raise RuntimeError(f'build {BUILD} multiplayer test missing: {test_path}')
if not module_path.exists():
    raise RuntimeError(f'build {BUILD} multiplayer game module missing: {module_path}')

text = test_path.read_text('utf-8')
pre_anchor = """const coopHostMove = await issueMove(coop.host, { x: 410, y: 130 });
"""
pre_instrumented = """const startupCheckpoint205 = {
  hostLobby: await coop.host.evaluate(() => globalThis.__FD_MULTIPLAYER_LOBBY_205__?.diagnostics?.()),
  guestLobby: await coop.guest.evaluate(() => globalThis.__FD_MULTIPLAYER_LOBBY_205__?.diagnostics?.()),
  hostWorker: await workerDiagnostics(coop.host),
  guestWorker: await workerDiagnostics(coop.guest),
};
console.log('FD205_CHECKPOINT_BEFORE_FIRST_COMMAND ' + JSON.stringify(startupCheckpoint205));
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

module = module_path.read_text('utf-8').splitlines()
patterns = ['function replay', 'function applyDue', 'function emitIntent']
for pattern in patterns:
    found = False
    for index, line in enumerate(module):
        if pattern in line:
            found = True
            lo = max(0, index - 18)
            hi = min(len(module), index + 145)
            tag = pattern.replace(':', '_').replace('-', '_').replace(' ', '_')
            print(f'FD205_{tag}_SOURCE_BEGIN')
            for number in range(lo, hi):
                print(f'{number + 1}: {module[number]}')
            print(f'FD205_{tag}_SOURCE_END')
            break
    if not found:
        print(f'FD205_SOURCE_MISSING {pattern}')

print('Build 205 multiplayer replay diagnostics instrumented')
