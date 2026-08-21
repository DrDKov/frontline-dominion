import { chromium } from 'playwright';

const baseUrl = process.env.FD_MULTIPLAYER_URL || 'http://127.0.0.1:8765/frontline-dominion/multiplayer.html?build=205';
const SOAK_MS = Number(process.env.FD205_SOAK_MS || 90000);

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

const browserErrors = [];
const addDiagnostics = (page, label) => {
  page.on('pageerror', error => browserErrors.push(`${label}:page:${String(error?.stack || error)}`));
  page.on('console', message => {
    if (message.type() !== 'error') return;
    const value = message.text();
    if (!/favicon|404|audio|autoplay|Failed to load resource:.*503/i.test(value)) {
      browserErrors.push(`${label}:console:${value}`);
    }
  });
};

async function snapshot(page) {
  return page.evaluate(() => {
    const lobby = globalThis.__FD_MULTIPLAYER_LOBBY_205__?.diagnostics?.() || {};
    const win = document.getElementById('mp-game-frame205')?.contentWindow;
    const bridge = win?.__FD_STABLE_STATE165__?.bridge;
    const mp = win?.__FD_MULTIPLAYER__;
    return {
      connected: Boolean(lobby.connected),
      dataState: lobby.dataState,
      connectionState: lobby.connectionState,
      frameReady: Boolean(lobby.frameReady),
      remoteReady: Boolean(lobby.remoteReady),
      started: Boolean(lobby.started),
      hashChecks: Number(lobby.hashChecks || 0),
      hashMismatches: Number(lobby.hashMismatches || 0),
      mismatchStreak: Number(lobby.mismatchStreak || 0),
      resyncsRequested: Number(lobby.resyncsRequested || 0),
      snapshotsSent: Number(lobby.snapshotsSent || 0),
      snapshotsReceived: Number(lobby.snapshotsReceived || 0),
      hostTick: Number(lobby.hostTick || 0),
      remoteTick: Number(lobby.remoteTick || 0),
      tickDrift: Number(lobby.tickDrift || 0),
      packetsSent: Number(lobby.packetsSent || 0),
      packetsReceived: Number(lobby.packetsReceived || 0),
      workerTick: Number(bridge?.workerTick || 0),
      appliedNetworkSeq: Number(bridge?.appliedNetworkSeq || 0),
      actionErrors: Number(bridge?.actionErrors || 0),
      bridgeReady: Boolean(bridge?.ready),
      bridgeFailed: Boolean(bridge?.failed),
      role: mp?.role || null,
      mode: mp?.mode || null,
    };
  });
}

async function workerDiagnostics(page) {
  return page.evaluate(() => {
    const win = document.getElementById('mp-game-frame205')?.contentWindow;
    const bridge = win?.__FD_STABLE_STATE165__?.bridge;
    if (!bridge?.worker) return null;
    return new Promise((resolve, reject) => {
      const requestId = 950000 + Math.floor(Math.random() * 40000);
      const key = `diag:${requestId}`;
      const timer = setTimeout(() => {
        bridge.pendingSaves.delete(key);
        reject(new Error('Worker diagnostics timed out'));
      }, 5000);
      bridge.pendingSaves.set(key, {
        resolve(message) {
          clearTimeout(timer);
          resolve({
            tick: Number(message.tick || 0),
            networkHash: message.networkHash,
            networkHashTick: Number(message.networkHashTick || 0),
            aiEnabled: Boolean(message.aiEnabled),
            multiplayer: message.multiplayer || null,
            actionQueue: Number(message.performance?.actionQueue || 0),
            counts: message.counts || null,
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
    const candidates = game?.units?.filter(item => item?.alive && item.team === 'player' && !item.embarkedIn && !item.air) || [];
    const unit = candidates.find(item => item.typeId !== 'worker') || candidates[0];
    if (!unit || !bridge) return { error: 'movable-unit-missing' };
    game.setSelection([unit], false);
    const target = {
      x: Math.max(120, Math.min(D.WORLD.width - 120, unit.x + delta.x)),
      y: Math.max(120, Math.min(D.WORLD.height - 120, unit.y + delta.y)),
    };
    const issued = game.issueMove(target.x, target.y, false);
    return { unitId: unit.id, target, issued, tick: Number(bridge.workerTick || 0) };
  }, offset);
}

async function waitApplied(host, guest, seq) {
  return Promise.all([
    waitFor(host, minimum => {
      const win = document.getElementById('mp-game-frame205')?.contentWindow;
      const bridge = win?.__FD_STABLE_STATE165__?.bridge;
      return Number(bridge?.appliedNetworkSeq || 0) >= minimum
        ? { tick: Number(bridge.workerTick || 0), applied: Number(bridge.appliedNetworkSeq), errors: Number(bridge.actionErrors || 0), failed: Boolean(bridge.failed) }
        : null;
    }, seq, 16000, 80),
    waitFor(guest, minimum => {
      const win = document.getElementById('mp-game-frame205')?.contentWindow;
      const bridge = win?.__FD_STABLE_STATE165__?.bridge;
      return Number(bridge?.appliedNetworkSeq || 0) >= minimum
        ? { tick: Number(bridge.workerTick || 0), applied: Number(bridge.appliedNetworkSeq), errors: Number(bridge.actionErrors || 0), failed: Boolean(bridge.failed) }
        : null;
    }, seq, 16000, 80),
  ]);
}

let hostBrowser;
let guestBrowser;
let hostContext;
let guestContext;
try {
  [hostBrowser, guestBrowser] = await Promise.all([
    chromium.launch({ headless: true }),
    chromium.launch({ headless: true }),
  ]);
  hostContext = await hostBrowser.newContext({ viewport: { width: 1360, height: 820 }, deviceScaleFactor: 1 });
  guestContext = await guestBrowser.newContext({ viewport: { width: 1360, height: 820 }, deviceScaleFactor: 1 });
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();
  addDiagnostics(host, 'soak:host');
  addDiagnostics(guest, 'soak:guest');

  await Promise.all([
    host.goto(baseUrl, { waitUntil: 'load', timeout: 60000 }),
    guest.goto(baseUrl, { waitUntil: 'load', timeout: 60000 }),
  ]);
  await Promise.all([
    waitFor(host, () => {
      const win = document.getElementById('mp-game-frame205')?.contentWindow;
      return globalThis.__FD_MULTIPLAYER_LOBBY_205__?.build === 205 && win?.document?.body?.dataset?.fdMultiplayerReady === '10.1';
    }, undefined, 30000),
    waitFor(guest, () => {
      const win = document.getElementById('mp-game-frame205')?.contentWindow;
      return globalThis.__FD_MULTIPLAYER_LOBBY_205__?.build === 205 && win?.document?.body?.dataset?.fdMultiplayerReady === '10.1';
    }, undefined, 30000),
  ]);

  await host.locator('#mp-host-role205').click();
  await guest.locator('#mp-guest-role205').click();
  await host.locator('#mp-mode205').selectOption('coop');
  const offer = await host.evaluate(() => globalThis.__FD_MULTIPLAYER_LOBBY_205__.createOffer());
  const answer = await guest.evaluate(code => globalThis.__FD_MULTIPLAYER_LOBBY_205__.acceptOffer(code), offer);
  await host.evaluate(code => globalThis.__FD_MULTIPLAYER_LOBBY_205__.acceptAnswer(code), answer);

  await Promise.all([
    waitFor(host, () => {
      const s = globalThis.__FD_MULTIPLAYER_LOBBY_205__?.state;
      return s?.connected && s.frameReady && s.remoteReady ? true : null;
    }, undefined, 35000),
    waitFor(guest, () => {
      const s = globalThis.__FD_MULTIPLAYER_LOBBY_205__?.state;
      return s?.connected && s.frameReady && s.remoteReady ? true : null;
    }, undefined, 35000),
  ]);

  const started = await host.evaluate(() => globalThis.__FD_MULTIPLAYER_LOBBY_205__.startMatch());
  if (!started) throw new Error('Soak host refused to start co-op');
  await Promise.all([
    waitFor(host, () => {
      const win = document.getElementById('mp-game-frame205')?.contentWindow;
      const b = win?.__FD_STABLE_STATE165__?.bridge;
      const mp = win?.__FD_MULTIPLAYER__;
      return mp?.active && mp.mode === 'coop' && b?.ready && !b.failed && Number(b.workerTick || 0) > 15 ? true : null;
    }, undefined, 45000),
    waitFor(guest, () => {
      const win = document.getElementById('mp-game-frame205')?.contentWindow;
      const b = win?.__FD_STABLE_STATE165__?.bridge;
      const mp = win?.__FD_MULTIPLAYER__;
      return mp?.active && mp.mode === 'coop' && b?.ready && !b.failed && Number(b.workerTick || 0) > 6 ? true : null;
    }, undefined, 45000),
  ]);

  const baseline = await waitFor(host, () => {
    const d = globalThis.__FD_MULTIPLAYER_LOBBY_205__?.diagnostics?.();
    const win = document.getElementById('mp-game-frame205')?.contentWindow;
    const b = win?.__FD_STABLE_STATE165__?.bridge;
    return Number(d?.hashChecks || 0) >= 6 && Number(d?.hashMismatches || 0) === 0 && Number(d?.resyncsRequested || 0) === 0 && b?.ready && !b.failed
      ? { hashChecks: Number(d.hashChecks), workerTick: Number(b.workerTick || 0) }
      : null;
  }, undefined, 30000, 100);
  const guestBaseline = await snapshot(guest);
  const initialWorkers = await Promise.all([workerDiagnostics(host), workerDiagnostics(guest)]);
  if (!initialWorkers[0]?.aiEnabled || !initialWorkers[1]?.aiEnabled) {
    throw new Error(`Co-op AI disabled at soak start: ${JSON.stringify(initialWorkers)}`);
  }

  const offsets = [
    { x: 360, y: 120 }, { x: -280, y: 330 }, { x: 190, y: -310 }, { x: -340, y: -110 },
    { x: 420, y: 210 }, { x: -160, y: 390 }, { x: 260, y: -240 }, { x: -410, y: 170 },
  ];
  const soakStarted = Date.now();
  let previousSeq = 0;
  let commands = 0;
  const commandProof = [];

  while (Date.now() - soakStarted < SOAK_MS) {
    const actor = commands % 2 === 0 ? host : guest;
    const move = await issueMove(actor, offsets[commands % offsets.length]);
    if (move.error || !move.issued) throw new Error(`Soak move ${commands + 1} was not issued: ${JSON.stringify(move)}`);
    const event = await waitFor(host, previous => {
      const value = globalThis.__FD_MULTIPLAYER_LOBBY_205__?.state?.lastEvent;
      return Number(value?.seq || 0) > previous ? value : null;
    }, previousSeq, 6000, 50);
    previousSeq = Number(event.seq);
    const applied = await waitApplied(host, guest, previousSeq);
    if (applied.some(item => item.failed || item.errors)) {
      throw new Error(`Soak network action failed: ${JSON.stringify({ event, applied })}`);
    }
    commandProof.push({ seq: previousSeq, actor: commands % 2 === 0 ? 'host' : 'guest', atTick: Number(event.atTick || 0), applied });
    commands += 1;

    const live = await snapshot(host);
    if (!live.connected || live.dataState !== 'open' || live.bridgeFailed || live.actionErrors ||
        live.hashMismatches || live.mismatchStreak || live.resyncsRequested || live.snapshotsSent) {
      throw new Error(`Soak health degraded after seq ${previousSeq}: ${JSON.stringify(live)}`);
    }
    await host.waitForTimeout(6500);
  }

  await host.waitForTimeout(1500);
  const [hostFinal, guestFinal] = await Promise.all([snapshot(host), snapshot(guest)]);
  const finalWorkers = await Promise.all([workerDiagnostics(host), workerDiagnostics(guest)]);
  const tickAdvanceHost = hostFinal.workerTick - baseline.workerTick;
  const tickAdvanceGuest = guestFinal.workerTick - guestBaseline.workerTick;
  const hashAdvance = hostFinal.hashChecks - baseline.hashChecks;

  const failures = [];
  if (commands < 8) failures.push(`only ${commands} commands completed`);
  if (hashAdvance < 30) failures.push(`only ${hashAdvance} new checksum pairs`);
  if (tickAdvanceHost < 300) failures.push(`host advanced only ${tickAdvanceHost} ticks`);
  if (tickAdvanceGuest < 250) failures.push(`guest advanced only ${tickAdvanceGuest} ticks`);
  for (const [label, value] of [['host', hostFinal], ['guest', guestFinal]]) {
    if (!value.connected || value.dataState !== 'open') failures.push(`${label} DataChannel is not open`);
    if (!value.bridgeReady || value.bridgeFailed) failures.push(`${label} bridge unhealthy`);
    if (value.actionErrors) failures.push(`${label} actionErrors=${value.actionErrors}`);
    if (value.hashMismatches || value.mismatchStreak) failures.push(`${label} checksum mismatch detected`);
    if (value.resyncsRequested || value.snapshotsSent || value.snapshotsReceived) failures.push(`${label} entered recovery during soak`);
  }
  if (!finalWorkers[0]?.aiEnabled || !finalWorkers[1]?.aiEnabled) failures.push('co-op AI became disabled');
  if (browserErrors.length) failures.push(`browser errors: ${browserErrors.join(' | ')}`);
  if (failures.length) {
    throw new Error(`Build 205 soak failed: ${failures.join('; ')} :: ${JSON.stringify({ baseline, guestBaseline, hostFinal, guestFinal, initialWorkers, finalWorkers, commands, commandProof: commandProof.slice(-4) })}`);
  }

  console.log(JSON.stringify({
    ok: true,
    durationMs: Date.now() - soakStarted,
    commands,
    hashAdvance,
    tickAdvanceHost,
    tickAdvanceGuest,
    baseline,
    final: { host: hostFinal, guest: guestFinal },
    workers: { initial: initialWorkers, final: finalWorkers },
    lastCommands: commandProof.slice(-4),
  }));
} finally {
  await Promise.allSettled([hostContext?.close(), guestContext?.close()].filter(Boolean));
  await Promise.allSettled([hostBrowser?.close(), guestBrowser?.close()].filter(Boolean));
}
