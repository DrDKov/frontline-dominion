from pathlib import Path

BUILD = 205
path = Path('dist/multiplayer-lobby-v205.js')
if not path.exists():
    raise RuntimeError(f'build {BUILD} multiplayer lobby missing: {path}')

text = path.read_text('utf-8')
if 'readyAdvertisements205' in text:
    print('Build 205 idempotent readiness handshake already patched')
    raise SystemExit(0)

state_anchor = """  let statusTimer = 0;
  let lastClockSentTick205 = -1;
  let clockPacketsSent205 = 0;
  let lastResyncAt = 0;
"""
state_replacement = """  let statusTimer = 0;
  let lastClockSentTick205 = -1;
  let clockPacketsSent205 = 0;
  let lastReadyAdvertisedAt205 = -Infinity;
  let readyAdvertisements205 = 0;
  let remoteReadyPackets205 = 0;
  let lastResyncAt = 0;
"""
if text.count(state_anchor) != 1:
    raise RuntimeError('build 205 readiness state anchor missing; run clock pacing patch first')
text = text.replace(state_anchor, state_replacement, 1)

close_anchor = """    statusTimer = 0;
    lastClockSentTick205 = -1;
    try { channel?.close(); } catch (_) {}
"""
close_replacement = """    statusTimer = 0;
    lastClockSentTick205 = -1;
    lastReadyAdvertisedAt205 = -Infinity;
    readyAdvertisements205 = 0;
    remoteReadyPackets205 = 0;
    try { channel?.close(); } catch (_) {}
"""
if text.count(close_anchor) != 1:
    raise RuntimeError('build 205 readiness close/reset anchor missing')
text = text.replace(close_anchor, close_replacement, 1)

function_anchor = """  function pumpLiveClock205() {
"""
function_replacement = """  function advertiseReady205(force = false) {
    if (channel?.readyState !== 'open') return false;
    // Read the iframe directly before every advertisement. This closes the
    // narrow race where the physical test/user observes the game iframe ready
    // before the lobby's periodic updateUI() has copied that fact into state.
    try {
      if (gameWindow()?.document?.body?.dataset?.fdMultiplayerReady === '10.1') state.frameReady = true;
    } catch (_) {}
    const now = performance.now();
    if (!force && now - lastReadyAdvertisedAt205 < 500) return false;
    lastReadyAdvertisedAt205 = now;
    readyAdvertisements205 += 1;
    sendPacket({
      kind: 'game-ready', ready: Boolean(state.frameReady), build: BUILD,
      clientId: state.clientId, advertisement: readyAdvertisements205,
    });
    return true;
  }

  function pumpLiveClock205() {
"""
if text.count(function_anchor) != 1:
    raise RuntimeError('build 205 readiness function anchor missing')
text = text.replace(function_anchor, function_replacement, 1)

timer_anchor = """    statusTimer = setInterval(() => {
      pumpLiveClock205();
      updateUI();
    }, 125);
"""
timer_replacement = """    statusTimer = setInterval(() => {
      pumpLiveClock205();
      updateUI();
      // Readiness is a protocol state, not a one-shot UI edge. Repeat the
      // advertisement until the peer has positively acknowledged readiness;
      // send a few redundant confirmations afterwards so simultaneous iframe
      // boot/channel-open ordering cannot strand one side at remoteReady=false.
      if (!state.remoteReady || readyAdvertisements205 < 3) advertiseReady205();
    }, 125);
"""
if text.count(timer_anchor) != 1:
    raise RuntimeError('build 205 readiness status timer anchor missing')
text = text.replace(timer_anchor, timer_replacement, 1)

open_anchor = """      ensureStatusTimer205();
      updateUI();
"""
open_replacement = """      ensureStatusTimer205();
      updateUI();
      advertiseReady205(true);
"""
# The exact sequence is unique inside channel.onopen after the clock patch.
if text.count(open_anchor) < 1:
    raise RuntimeError('build 205 readiness channel-open anchor missing')
text = text.replace(open_anchor, open_replacement, 1)

hello_anchor = """      case 'hello':
        if (Number(packet.build) !== BUILD) { setError('У второго игрока открыта другая сборка'); return; }
        state.remoteReady = Boolean(packet.frameReady);
        if (!state.remoteReady) sendPacket({ kind: 'ready-query' });
        updateUI();
        break;
      case 'ready-query':
        sendPacket({ kind: 'game-ready', ready: state.frameReady });
        break;
      case 'game-ready':
        state.remoteReady = Boolean(packet.ready);
        updateUI();
        break;
"""
hello_replacement = """      case 'hello':
        if (Number(packet.build) !== BUILD) { setError('У второго игрока открыта другая сборка'); return; }
        // Never let a stale/early false hello erase a later positive readiness
        // observation. Both peers continue advertising until ready=true is
        // observed, making the handshake idempotent across independent browsers.
        state.remoteReady = state.remoteReady || Boolean(packet.frameReady);
        updateUI();
        advertiseReady205(true);
        if (!state.remoteReady) sendPacket({ kind: 'ready-query' });
        break;
      case 'ready-query':
        updateUI();
        advertiseReady205(true);
        break;
      case 'game-ready':
        if (packet.build != null && Number(packet.build) !== BUILD) { setError('У второго игрока открыта другая сборка'); return; }
        remoteReadyPackets205 += 1;
        state.remoteReady = state.remoteReady || Boolean(packet.ready);
        updateUI();
        if (!state.remoteReady) advertiseReady205(true);
        break;
"""
if text.count(hello_anchor) != 1:
    raise RuntimeError('build 205 readiness packet-handler anchor missing')
text = text.replace(hello_anchor, hello_replacement, 1)

diag_anchor = """      lastClockSentTick205,
      clockPacketsSent205,
      peerConnectionState: peer?.connectionState || null,
"""
diag_replacement = """      lastClockSentTick205,
      clockPacketsSent205,
      readyAdvertisements205,
      remoteReadyPackets205,
      lastReadyAdvertisedAt205,
      peerConnectionState: peer?.connectionState || null,
"""
if text.count(diag_anchor) != 1:
    raise RuntimeError('build 205 readiness diagnostics anchor missing')
text = text.replace(diag_anchor, diag_replacement, 1)

path.write_text(text, 'utf-8')
print('Build 205 readiness handshake is idempotent across independent browser processes')
