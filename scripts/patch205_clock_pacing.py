from pathlib import Path
import runpy

BUILD = 205
path = Path('dist/multiplayer-lobby-v205.js')
if not path.exists():
    raise RuntimeError(f'build {BUILD} multiplayer lobby missing: {path}')


def patch_ready_handshake205():
    runpy.run_path('scripts/patch205_ready_handshake.py', run_name='__main__')


text = path.read_text('utf-8')
if 'lastClockSentTick205' in text:
    print('Build 205 live clock pacing already patched')
    patch_ready_handshake205()
    raise SystemExit(0)

state_anchor = """  let pingTimer = 0;
  let statusTimer = 0;
  let lastResyncAt = 0;
"""
state_replacement = """  let pingTimer = 0;
  let statusTimer = 0;
  let lastClockSentTick205 = -1;
  let clockPacketsSent205 = 0;
  let lastResyncAt = 0;
"""
if text.count(state_anchor) != 1:
    raise RuntimeError('build 205 clock timer state anchor missing')
text = text.replace(state_anchor, state_replacement, 1)

close_anchor = """    pingTimer = 0;
    statusTimer = 0;
    try { channel?.close(); } catch (_) {}
"""
close_replacement = """    pingTimer = 0;
    statusTimer = 0;
    lastClockSentTick205 = -1;
    try { channel?.close(); } catch (_) {}
"""
if text.count(close_anchor) != 1:
    raise RuntimeError('build 205 clock reset anchor missing')
text = text.replace(close_anchor, close_replacement, 1)

function_anchor = """  function leadTicks() {
"""
clock_function = """  function pumpLiveClock205() {
    if (state.role !== 'host' || !state.started || channel?.readyState !== 'open') return false;
    const tick = authoritativeTick();
    if (!Number.isFinite(tick) || tick < 0 || tick === lastClockSentTick205) return false;
    lastClockSentTick205 = tick;
    state.hostTick = tick;
    clockPacketsSent205 += 1;
    sendPacket({ kind: 'clock', tick });
    return true;
  }

  function ensureStatusTimer205() {
    clearInterval(statusTimer);
    statusTimer = setInterval(() => {
      pumpLiveClock205();
      updateUI();
    }, 125);
  }

  function leadTicks() {
"""
if text.count(function_anchor) != 1:
    raise RuntimeError('build 205 leadTicks anchor missing')
text = text.replace(function_anchor, clock_function, 1)

open_anchor = """      clearInterval(pingTimer);
      pingTimer = setInterval(() => sendPacket({ kind: 'ping', sentAt: performance.timeOrigin + performance.now() }), 1000);
      updateUI();
"""
open_replacement = """      clearInterval(pingTimer);
      pingTimer = setInterval(() => sendPacket({ kind: 'ping', sentAt: performance.timeOrigin + performance.now() }), 1000);
      ensureStatusTimer205();
      updateUI();
"""
if text.count(open_anchor) != 1:
    raise RuntimeError('build 205 channel-open clock timer anchor missing')
text = text.replace(open_anchor, open_replacement, 1)

show_anchor = """  function showGame() {
    state.started = true;
"""
show_replacement = """  function showGame() {
    state.started = true;
    lastClockSentTick205 = -1;
    ensureStatusTimer205();
"""
if text.count(show_anchor) != 1:
    raise RuntimeError('build 205 showGame clock anchor missing')
text = text.replace(show_anchor, show_replacement, 1)

interval_anchor = """  statusTimer = setInterval(updateUI, 500);
"""
interval_replacement = """  ensureStatusTimer205();
"""
if text.count(interval_anchor) != 1:
    raise RuntimeError('build 205 status timer anchor missing')
text = text.replace(interval_anchor, interval_replacement, 1)

diag_anchor = """      channelBufferedAmount: channel?.bufferedAmount || 0,
      peerConnectionState: peer?.connectionState || null,
"""
diag_replacement = """      channelBufferedAmount: channel?.bufferedAmount || 0,
      lastClockSentTick205,
      clockPacketsSent205,
      peerConnectionState: peer?.connectionState || null,
"""
if text.count(diag_anchor) != 1:
    raise RuntimeError('build 205 clock diagnostics anchor missing')
text = text.replace(diag_anchor, diag_replacement, 1)

path.write_text(text, 'utf-8')
print('Build 205 live host clock pacing patched at 8 Hz with timer recovery')
patch_ready_handshake205()
