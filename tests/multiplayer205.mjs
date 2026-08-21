import { chromium } from 'playwright';

const baseUrl = process.env.FD_MULTIPLAYER_URL || 'http://127.0.0.1:8765/frontline-dominion/multiplayer.html?build=205';
const browser = await chromium.launch({ headless: true });

const waitFor = async (page, fn, arg = undefined, timeout = 20000, interval = 100) => {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < timeout) {
    last = await page.evaluate(fn, arg);
    if (last) return last;
    await page.waitForTimeout(interval);
  }
  throw new Error(`Timed out after ${timeout} ms; last=${JSON.stringify(last)}`);
};

const addDiagnostics = (page, label, errors) => {
  page.on('pageerror', error => errors.push(`${label}:page:${String(error?.stack || error)}`));
  page.on('console', message => {
    if (message.type() !== 'error') return;
    const value = message.text();
    if (!/favicon|404|audio|autoplay|Failed to load resource:.*503/i.test(value)) errors.push(`${label}:console:${value}`);
  });
};

async function createPair(mode) {
  const hostContext = await browser.newContext({ viewport: { width: 1360, height: 820 }, deviceScaleFactor: 1 });
  const guestContext = await browser.newContext({ viewport: { width: 1360, height: 820 }, deviceScaleFactor: 1 });
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();
  const errors = [];
  addDiagnostics(host, `${mode}:host`, errors);
  addDiagnostics(guest, `${mode}:guest`, errors);

  await Promise.all([
    host.goto(baseUrl, { waitUntil: 'load', timeout: 60000 }),
    guest.goto(baseUrl, { waitUntil: 'load', timeout: 60000 }),
  ]);
  await Promise.all([
    waitFor(host, () => {
      const lobby = globalThis.__FD_MULTIPLAYER_LOBBY_205__;
      const win = document.getElementById('mp-game-frame205')?.contentWindow;
      return lobby?.build === 205 && win?.document?.body?.dataset?.fdMultiplayerReady === '10.1';
    }, undefined, 30000),
    waitFor(guest, () => {
      const lobby = globalThis.__FD_MULTIPLAYER_LOBBY_205__;
      const win = document.getElementById('mp-game-frame205')?.contentWindow;
      return lobby?.build === 205 && win?.document?.body?.dataset?.fdMultiplayerReady === '10.1';
    }, undefined, 30000),
  ]);

  await host.locator('#mp-host-role205').click();
  await guest.locator('#mp-guest-role205').click();
  await host.locator('#mp-mode205').selectOption(mode);

  const offer = await host.evaluate(() => globalThis.__FD_MULTIPLAYER_LOBBY_205__.createOffer());
  const answer = await guest.evaluate(code => globalThis.__FD_MULTIPLAYER_LOBBY_205__.acceptOffer(code), offer);
  await host.evaluate(code => globalThis.__FD_MULTIPLAYER_LOBBY_205__.acceptAnswer(code), answer);

  const connected = await Promise.all([
    waitFor(host, () => {
      const state = globalThis.__FD_MULTIPLAYER_LOBBY_205__?.state;
      return state?.connected && state.frameReady && state.remoteReady
        ? { room: state.roomCode, role: state.role, connection: state.connectionState, data: state.dataState }
        : null;
    }, undefined, 30000),
    waitFor(guest, () => {
      const state = globalThis.__FD_MULTIPLAYER_LOBBY_205__?.state;
      return state?.connected && state.frameReady && state.remoteReady
        ? { room: state.roomCode, role: state.role, connection: state.connectionState, data: state.dataState }
        : null;
    }, undefined, 30000),
  ]);
  if (connected[0].room !== connected[1].room || connected[0].role !== 'host' || connected[1].role !== 'guest') {
    throw new Error(`${mode}: peers did not join the same room: ${JSON.stringify(connected)}`);
  }

  const startAccepted = await host.evaluate(() => globalThis.__FD_MULTIPLAYER_LOBBY_205__.startMatch());
  if (!startAccepted) throw new Error(`${mode}: host refused to start a ready match`);

  const playing = await Promise.all([
    waitFor(host, expectedMode => {
      const win = document.getElementById('mp-game-frame205')?.contentWindow;
      const bridge = win?.__FD_STABLE_STATE165__?.bridge;
      const multiplayer = win?.__FD_MULTIPLAYER__;
      return multiplayer?.active && multiplayer.mode === expectedMode && multiplayer.role === 'host' &&
        bridge?.ready && !bridge.failed && Number(bridge.workerTick || 0) > 12
        ? { tick: Number(bridge.workerTick), role: multiplayer.role, mode: multiplayer.mode, canonicalTeam: multiplayer.canonicalTeam }
        : null;
    }, mode, 45000),
    waitFor(guest, expectedMode => {
      const win = document.getElementById('mp-game-frame205')?.contentWindow;
      const bridge = win?.__FD_STABLE_STATE165__?.bridge;
      const multiplayer = win?.__FD_MULTIPLAYER__;
      return multiplayer?.active && multiplayer.mode === expectedMode && multiplayer.role === 'guest' &&
        bridge?.ready && !bridge.failed && Number(bridge.workerTick || 0) > 4
        ? { tick: Number(bridge.workerTick), role: multiplayer.role, mode: multiplayer.mode, canonicalTeam: multiplayer.canonicalTeam }
        : null;
    }, mode, 45000),
  ]);

  return { hostContext, guestContext, host, guest, errors, connected, playing };
}

async function workerDiagnostics(page) {
  return page.evaluate(() => {
    const win = document.getElementById('mp-game-frame205')?.contentWindow;
    const bridge = win?.__FD_STABLE_STATE165__?.bridge;
    if (!bridge?.worker) return null;
    return new Promise((resolve, reject) => {
      const requestId = 800000 + Math.floor(Math.random() * 100000);
      const timer = setTimeout(() => {
        bridge.pendingSaves.delete(`diag:${requestId}`);
        reject(new Error('Worker diagnostics timed out'));
      }, 5000);
      bridge.pendingSaves.set(`diag:${requestId}`, {
        resolve(message) {
          clearTimeout(timer);
          resolve({
            tick: message.tick,
            networkHash: message.networkHash,
            multiplayer: message.multiplayer,
            aiEnabled: message.aiEnabled,
            counts: message.counts,
            actionQueue: message.performance?.actionQueue,
          });
        },
      });
      bridge.worker.postMessage({ type: 'diagnosticsRequest', requestId });
    });
  });
}

async function issueMove(page, offset) {
  return page.evaluate(delta => {
    const win = document.getElementById('mp-game-frame205')?.contentWindow;
    const D = win?.__FD_DEBUG__;
    const game = D?.game;
    const bridge = win?.__FD_STABLE_STATE165__?.bridge;
    const unit = game?.units?.find(item => item?.alive && item.team === 'player' && !item.embarkedIn && !item.air);
    if (!unit || !bridge) return { error: 'movable-unit-missing' };
    game.setSelection([unit], false);
    const target = {
      x: Math.max(120, Math.min(D.WORLD.width - 120, unit.x + delta.x)),
      y: Math.max(120, Math.min(D.WORLD.height - 120, unit.y + delta.y)),
    };
    const before = { x: unit.x, y: unit.y, applied: Number(bridge.appliedNetworkSeq || 0) };
    const issued = game.issueMove(target.x, target.y, false);
    return { unitId: unit.id, target, before, issued };
  }, offset);
}

async function waitApplied(pair, minimumSeq) {
  const [hostApplied, guestApplied] = await Promise.all([
    waitFor(pair.host, seq => {
      const win = document.getElementById('mp-game-frame205')?.contentWindow;
      const bridge = win?.__FD_STABLE_STATE165__?.bridge;
      return Number(bridge?.appliedNetworkSeq || 0) >= seq
        ? { applied: Number(bridge.appliedNetworkSeq), tick: Number(bridge.workerTick), errors: Number(bridge.actionErrors || 0), failed: Boolean(bridge.failed) }
        : null;
    }, minimumSeq, 15000),
    waitFor(pair.guest, seq => {
      const win = document.getElementById('mp-game-frame205')?.contentWindow;
      const bridge = win?.__FD_STABLE_STATE165__?.bridge;
      return Number(bridge?.appliedNetworkSeq || 0) >= seq
        ? { applied: Number(bridge.appliedNetworkSeq), tick: Number(bridge.workerTick), errors: Number(bridge.actionErrors || 0), failed: Boolean(bridge.failed) }
        : null;
    }, minimumSeq, 15000),
  ]);
  if (hostApplied.errors || guestApplied.errors || hostApplied.failed || guestApplied.failed) {
    throw new Error(`Network event ${minimumSeq} failed: ${JSON.stringify({ hostApplied, guestApplied })}`);
  }
  return { hostApplied, guestApplied };
}

async function synchronization(pair, minimumChecks = 2) {
  return waitFor(pair.host, checks => {
    const host = globalThis.__FD_MULTIPLAYER_LOBBY_205__?.diagnostics?.();
    const win = document.getElementById('mp-game-frame205')?.contentWindow;
    const bridge = win?.__FD_STABLE_STATE165__?.bridge;
    return Number(host?.hashChecks || 0) >= checks && Number(host?.mismatchStreak || 0) === 0 && bridge?.ready && !bridge.failed
      ? {
          hashChecks: host.hashChecks,
          hashMismatches: host.hashMismatches,
          mismatchStreak: host.mismatchStreak,
          hostTick: host.hostTick,
          remoteTick: host.remoteTick,
          rtt: host.rtt,
          packetsSent: host.packetsSent,
          packetsReceived: host.packetsReceived,
        }
      : null;
  }, minimumChecks, 20000, 120);
}

const coop = await createPair('coop');
const coopHostDiag = await workerDiagnostics(coop.host);
const coopGuestDiag = await workerDiagnostics(coop.guest);
if (!coopHostDiag?.aiEnabled || !coopGuestDiag?.aiEnabled || coopHostDiag.multiplayer?.mode !== 'coop' || coopGuestDiag.multiplayer?.role !== 'guest') {
  throw new Error(`Co-op Worker configuration is wrong: ${JSON.stringify({ coopHostDiag, coopGuestDiag })}`);
}

const coopHostMove = await issueMove(coop.host, { x: 410, y: 130 });
if (coopHostMove.error || !coopHostMove.issued) throw new Error(`Host co-op command was not issued: ${JSON.stringify(coopHostMove)}`);
const hostEvent = await waitFor(coop.host, () => {
  const event = globalThis.__FD_MULTIPLAYER_LOBBY_205__?.state?.lastEvent;
  return Number(event?.seq || 0) >= 1 ? event : null;
}, undefined, 5000);
if (hostEvent.team !== 'player') throw new Error(`Host co-op command used the wrong team: ${JSON.stringify(hostEvent)}`);
const coopApplied1 = await waitApplied(coop, hostEvent.seq);

const coopGuestMove = await issueMove(coop.guest, { x: -280, y: 360 });
if (coopGuestMove.error || !coopGuestMove.issued) throw new Error(`Guest co-op command was not issued: ${JSON.stringify(coopGuestMove)}`);
const guestEvent = await waitFor(coop.host, previous => {
  const event = globalThis.__FD_MULTIPLAYER_LOBBY_205__?.state?.lastEvent;
  return Number(event?.seq || 0) > previous ? event : null;
}, hostEvent.seq, 5000);
if (guestEvent.team !== 'player') throw new Error(`Guest co-op command used the wrong team: ${JSON.stringify(guestEvent)}`);
const coopApplied2 = await waitApplied(coop, guestEvent.seq);
const coopSync = await synchronization(coop, 3);

await waitFor(coop.host, () => {
  const at = Number(globalThis.__FD_MULTIPLAYER_LOBBY_205__?.state?.lastResyncAt || 0);
  return !at || Date.now() - at > 8200;
}, undefined, 12000, 200);
const snapshotsBefore = await coop.host.evaluate(() => globalThis.__FD_MULTIPLAYER_LOBBY_205__.state.snapshotsSent);
const receivedBefore = await coop.guest.evaluate(() => globalThis.__FD_MULTIPLAYER_LOBBY_205__.state.snapshotsReceived);
await coop.guest.evaluate(() => {
  const win = document.getElementById('mp-game-frame205')?.contentWindow;
  win?.__FD_MULTIPLAYER__?.requestResync?.('physical build-205 gate');
});
const resynced = await waitFor(coop.guest, before => {
  const lobby = globalThis.__FD_MULTIPLAYER_LOBBY_205__?.diagnostics?.();
  const win = document.getElementById('mp-game-frame205')?.contentWindow;
  const bridge = win?.__FD_STABLE_STATE165__?.bridge;
  return Number(lobby?.snapshotsReceived || 0) > before && bridge?.ready && !bridge.failed && Number(bridge.workerTick || 0) > 0
    ? {
        snapshotsReceived: lobby.snapshotsReceived,
        bytesReceived: lobby.bytesReceived,
        fragments: lobby.fragments,
        tick: Number(bridge.workerTick),
        applied: Number(bridge.appliedNetworkSeq || 0),
      }
    : null;
}, receivedBefore, 30000, 150);
const hostAfterResync = await waitFor(coop.host, before => {
  const state = globalThis.__FD_MULTIPLAYER_LOBBY_205__?.state;
  return Number(state?.snapshotsSent || 0) > before && Number(state?.mismatchStreak || 0) === 0
    ? { snapshotsSent: state.snapshotsSent, mismatchStreak: state.mismatchStreak, resyncsRequested: state.resyncsRequested }
    : null;
}, snapshotsBefore, 10000);

const postResyncMove = await issueMove(coop.guest, { x: 190, y: -260 });
if (postResyncMove.error || !postResyncMove.issued) throw new Error(`Command after resync was not issued: ${JSON.stringify(postResyncMove)}`);
const postResyncEvent = await waitFor(coop.host, previous => {
  const event = globalThis.__FD_MULTIPLAYER_LOBBY_205__?.state?.lastEvent;
  return Number(event?.seq || 0) > previous ? event : null;
}, guestEvent.seq, 5000);
const coopAppliedAfterResync = await waitApplied(coop, postResyncEvent.seq);
const coopSyncAfterResync = await synchronization(coop, coopSync.hashChecks + 2);

if (coop.errors.length) throw new Error(`Co-op browser errors: ${JSON.stringify(coop.errors)}`);
await Promise.all([coop.hostContext.close(), coop.guestContext.close()]);

const versus = await createPair('versus');
const versusHostDiag = await workerDiagnostics(versus.host);
const versusGuestDiag = await workerDiagnostics(versus.guest);
if (versusHostDiag?.aiEnabled !== false || versusGuestDiag?.aiEnabled !== false ||
    versusHostDiag.multiplayer?.mode !== 'versus' || versusGuestDiag.multiplayer?.perspectiveSwapped !== true ||
    versus.playing[0].canonicalTeam !== 'player' || versus.playing[1].canonicalTeam !== 'enemy') {
  throw new Error(`Versus Worker/perspective configuration is wrong: ${JSON.stringify({ versusHostDiag, versusGuestDiag, playing: versus.playing })}`);
}

const versusHostMove = await issueMove(versus.host, { x: 360, y: 170 });
if (versusHostMove.error || !versusHostMove.issued) throw new Error(`Versus host command was not issued: ${JSON.stringify(versusHostMove)}`);
const versusEvent1 = await waitFor(versus.host, () => {
  const event = globalThis.__FD_MULTIPLAYER_LOBBY_205__?.state?.lastEvent;
  return Number(event?.seq || 0) >= 1 ? event : null;
}, undefined, 5000);
if (versusEvent1.team !== 'player') throw new Error(`Versus host command team is wrong: ${JSON.stringify(versusEvent1)}`);
const versusApplied1 = await waitApplied(versus, versusEvent1.seq);

const versusGuestMove = await issueMove(versus.guest, { x: -330, y: 210 });
if (versusGuestMove.error || !versusGuestMove.issued) throw new Error(`Versus guest command was not issued: ${JSON.stringify(versusGuestMove)}`);
const versusEvent2 = await waitFor(versus.host, previous => {
  const event = globalThis.__FD_MULTIPLAYER_LOBBY_205__?.state?.lastEvent;
  return Number(event?.seq || 0) > previous ? event : null;
}, versusEvent1.seq, 5000);
if (versusEvent2.team !== 'enemy') throw new Error(`Versus guest did not control the second army: ${JSON.stringify(versusEvent2)}`);
const versusApplied2 = await waitApplied(versus, versusEvent2.seq);
const versusSync = await synchronization(versus, 3);

if (versus.errors.length) throw new Error(`Versus browser errors: ${JSON.stringify(versus.errors)}`);

console.log(JSON.stringify({
  ok: true,
  coop: {
    connected: coop.connected,
    playing: coop.playing,
    worker: { host: coopHostDiag, guest: coopGuestDiag },
    events: [hostEvent, guestEvent, postResyncEvent],
    applied: [coopApplied1, coopApplied2, coopAppliedAfterResync],
    synchronization: [coopSync, coopSyncAfterResync],
    resync: { guest: resynced, host: hostAfterResync },
  },
  versus: {
    connected: versus.connected,
    playing: versus.playing,
    worker: { host: versusHostDiag, guest: versusGuestDiag },
    events: [versusEvent1, versusEvent2],
    applied: [versusApplied1, versusApplied2],
    synchronization: versusSync,
  },
}));

await Promise.all([versus.hostContext.close(), versus.guestContext.close()]);
await browser.close();
