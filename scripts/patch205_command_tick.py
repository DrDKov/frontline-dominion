from pathlib import Path

path = Path('dist/multiplayer-lobby-v205.js')
text = path.read_text('utf-8')

anchor = """  function postGame(type, detail = {}) {
    const target = gameWindow();
    if (!target) return false;
    target.postMessage({ type, ...detail }, location.origin);
    return true;
  }

"""
replacement = anchor + """  function dispatchNetworkEvent(event) {
    const target = gameWindow();
    if (!target || !event?.action) return false;
    if (event.action !== 'ping') {
      const bridge = target.__FD_STABLE_STATE165__?.bridge || target.__FD_DEBUG__?.game?.authoritativeBridge172;
      if (typeof bridge?.sendNetworkEvent === 'function') {
        try {
          if (bridge.sendNetworkEvent(event)) return true;
        } catch (error) {
          console.error('[FD205] network command dispatch failed', error);
        }
      }
    }
    return postGame('fd:mp-event', { event });
  }

"""
if text.count(anchor) != 1:
    raise RuntimeError('postGame anchor missing')
text = text.replace(anchor, replacement, 1)

host = """    postGame('fd:mp-event', { event });
    sendPacket({ kind: 'event', event });
"""
if text.count(host) != 1:
    raise RuntimeError('host event anchor missing')
text = text.replace(host, """    dispatchNetworkEvent(event);
    sendPacket({ kind: 'event', event });
""", 1)

guest = """          postGame('fd:mp-event', { event: packet.event });
"""
if text.count(guest) != 1:
    raise RuntimeError('guest event anchor missing')
text = text.replace(guest, """          dispatchNetworkEvent(packet.event);
""", 1)

path.write_text(text, 'utf-8')
print('Build 205 network command routing patched')
