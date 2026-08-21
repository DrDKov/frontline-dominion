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

queries = {
    'multiplayer': ['function replay'],
    'bridge': ['actionErrors', 'postMessage({ type: \'action\'', "type: 'action'", 'lastAck'],
    'worker': ['actionQueue', "message.type === 'action'", "case 'action'", 'appliedNetworkSeq'],
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

print('Build 205 authoritative Worker action timing diagnostics instrumented')
