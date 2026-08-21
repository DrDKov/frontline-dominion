from pathlib import Path

BUILD = 205
path = Path('tests/multiplayer205.mjs')
if not path.exists():
    raise RuntimeError(f'build {BUILD} multiplayer test missing: {path}')

text = path.read_text('utf-8')
if 'compactRecoveryWorker205' in text:
    print('Build 205 compact recovery diagnostics already installed')
    raise SystemExit(0)

anchor = """async function recoveryDiagnostics205() {
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
"""
replacement = """async function compactRecoveryWorker205(page) {
  return page.evaluate(() => {
    const win = document.getElementById('mp-game-frame205')?.contentWindow;
    const bridge = win?.__FD_STABLE_STATE165__?.bridge;
    if (!bridge?.worker) return { missing: true, bridgeReady: Boolean(bridge?.ready), bridgeFailed: Boolean(bridge?.failed) };
    return new Promise((resolve, reject) => {
      const requestId = 970000 + Math.floor(Math.random() * 20000);
      const key = `diag:${requestId}`;
      const timer = setTimeout(() => {
        bridge.pendingSaves?.delete?.(key);
        reject(new Error('compact Worker diagnostics timed out'));
      }, 3500);
      bridge.pendingSaves.set(key, {
        resolve(message) {
          clearTimeout(timer);
          resolve({
            tick: Number(message.tick || 0),
            time: Number(message.time || 0),
            paused: Boolean(message.paused),
            running: Boolean(message.running),
            manualMode: Boolean(message.manualMode),
            networkHash: message.networkHash || null,
            networkHashTick: Number(message.networkHashTick || 0),
            multiplayer: message.multiplayer || null,
            pendingNetworkActions205: message.pendingNetworkActions205 || [],
            actionQueue: Number(message.performance?.actionQueue || 0),
            counts: message.counts || null,
          });
        },
        reject(error) {
          clearTimeout(timer);
          reject(error);
        },
      });
      bridge.worker.postMessage({ type: 'diagnosticsRequest', requestId });
    });
  });
}

async function compactRecoveryLobby205(page) {
  return page.evaluate(() => {
    const diag = globalThis.__FD_MULTIPLAYER_LOBBY_205__?.diagnostics?.() || {};
    return {
      role: diag.role || null,
      hostTick: Number(diag.hostTick || 0),
      remoteTick: Number(diag.remoteTick || 0),
      tickDrift: Number(diag.tickDrift || 0),
      rtt: diag.rtt == null ? null : Number(diag.rtt),
      eventHistory: Number(diag.eventHistory || 0),
      pendingReplayBaseSeq: Number(diag.pendingReplayBaseSeq || 0),
      lastSnapshotBaseSeq205: Number(diag.lastSnapshotBaseSeq205 || 0),
      lastReplayCount205: Number(diag.lastReplayCount205 || 0),
      eventsSent: Number(diag.eventsSent || 0),
      eventsReceived: Number(diag.eventsReceived || 0),
      snapshotsSent: Number(diag.snapshotsSent || 0),
      snapshotsReceived: Number(diag.snapshotsReceived || 0),
      resyncsRequested: Number(diag.resyncsRequested || 0),
      lastClockSentTick205: Number(diag.lastClockSentTick205 ?? -1),
      clockPacketsSent205: Number(diag.clockPacketsSent205 || 0),
      lastEvent: diag.lastEvent || null,
    };
  });
}

async function compactRecoveryBridge205(page) {
  return page.evaluate(() => {
    const win = document.getElementById('mp-game-frame205')?.contentWindow;
    const bridge = win?.__FD_STABLE_STATE165__?.bridge;
    const mp = win?.__FD_MULTIPLAYER__;
    return {
      ready: Boolean(bridge?.ready), failed: Boolean(bridge?.failed),
      workerTick: Number(bridge?.workerTick || 0), workerTime: Number(bridge?.workerTime || 0),
      appliedNetworkSeq: Number(bridge?.appliedNetworkSeq || 0),
      lastAck: Number(bridge?.lastAck || 0), actionErrors: Number(bridge?.actionErrors || 0),
      mpAppliedSeq: Number(mp?.lastAppliedSeq || 0), mpHostTick: Number(mp?.hostTick || 0),
      mpHostTickReceivedAt: Number(mp?.hostTickReceivedAt || 0),
    };
  });
}

async function recoveryDiagnostics205() {
  const [hostWorker, guestWorker, hostLobby, guestLobby, hostBridge, guestBridge] = await Promise.all([
    compactRecoveryWorker205(coop.host).catch(error => ({ error: String(error) })),
    compactRecoveryWorker205(coop.guest).catch(error => ({ error: String(error) })),
    compactRecoveryLobby205(coop.host),
    compactRecoveryLobby205(coop.guest),
    compactRecoveryBridge205(coop.host),
    compactRecoveryBridge205(coop.guest),
  ]);
  return { hostWorker, guestWorker, hostLobby, guestLobby, hostBridge, guestBridge };
}
"""
if text.count(anchor) != 1:
    raise RuntimeError('build 205 recovery diagnostics block missing')
text = text.replace(anchor, replacement, 1)
path.write_text(text, 'utf-8')
print('Build 205 resync failure diagnostics compacted to Worker queue/clock/watermark state')
