from pathlib import Path

BUILD = 205
path = Path('dist/authoritative-simulation-worker-v174.js')
if not path.exists():
    raise RuntimeError(f'build {BUILD} authoritative Worker missing: {path}')

text = path.read_text('utf-8')
if 'duplicateNetworkEvent205' in text:
    print('Build 205 network event idempotency already patched')
    raise SystemExit(0)

anchor = """function applyAction(event) {
  if (!game || !event) return false;
  const payload = event.payload || {};
"""
replacement = """function applyAction(event) {
  if (!game || !event) return false;
  const networkSeq205 = Number(event.networkSeq) || 0;
  if (networkSeq205 && networkSeq205 <= Number(multiplayer.appliedSeq || 0)) {
    // Resync replay and reliable transport may legitimately redeliver an event
    // whose sequence is already contained in the authoritative snapshot. ACK
    // it as a duplicate, but never execute the command a second time.
    postMessage({
      type: 'actionAck', seq: event.seq, networkSeq: networkSeq205,
      tick: game.simTick, ok: true, action: event.action, duplicateNetworkEvent205: true,
    });
    return true;
  }
  const payload = event.payload || {};
"""
if text.count(anchor) != 1:
    raise RuntimeError('build 205 applyAction idempotency anchor missing')
text = text.replace(anchor, replacement, 1)

path.write_text(text, 'utf-8')
print('Build 205 authoritative Worker now ignores duplicate applied network sequences')
