import { chromium } from 'playwright';
import { multiplayerUrl } from './lib/fd-env.mjs';

const baseUrl = multiplayerUrl();
const SOAK_MS = Number(process.env.FD_MULTIPLAYER_SOAK_MS || process.env.FD205_SOAK_MS || 90000);

const waitFor = async (page, fn, arg = undefined, timeout = 30000, interval = 100) => {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < timeout) {
    last = await page.evaluate(fn, arg);
    if (last && !last.__pending) return last;
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
    if (!/favicon|404|audio|autoplay|Failed to load resource:.*503/i.test(value)) browserErrors.push(`${label}:console:${value}`);
  });
};

function lobbyExpression() {
  const entries = Object.keys(globalThis)
    .filter(key => /^__FD_MULTIPLAYER_LOBBY_\d+__$/.test(key))
    .map(key => ({ key, api: globalThis[key] }))
    .filter(entry => entry.api?.state && typeof entry.api?.createOffer === 'function' && typeof entry.api?.diagnostics === 'function')
    .sort((a, b) => Number(b.api?.build || 0) - Number(a.api?.build || 0));
  return entries[0] || null;
}

async function snapshot(page) {
  return page.evaluate(() => {
    const entry = (function(){
      const entries = Object.keys(globalThis).filter(key => /^__FD_MULTIPLAYER_LOBBY_\d+__$/.test(key)).map(key => ({key,api:globalThis[key]})).filter(e => e.api?.state && typeof e.api?.diagnostics === 'function').sort((a,b)=>Number(b.api?.build||0)-Number(a.api?.build||0));
      return entries[0] || null;
    })();
    const lobby = entry?.api;
    const d = lobby?.diagnostics?.() || {};
    const win = document.getElementById('mp-game-frame205')?.contentWindow;
    const bridge = win?.__FD_STABLE_STATE165__?.bridge;
    const mp = win?.__FD_MULTIPLAYER__;
    return {
      lobbyKey: entry?.key || null,
      lobbyBuild: Number(lobby?.build || 0),
      connected: Boolean(d.connected),
      dataState: d.dataState,
      connectionState: d.connectionState,
      frameReady: Boolean(d.frameReady),
      remoteReady: Boolean(d.remoteReady),
      started: Boolean(d.started),
      hashChecks: Number(d.hashChecks || 0),
      hashMismatches: Number(d.hashMismatches || 0),
      mismatchStreak: Number(d.mismatchStreak || 0),
      resyncsRequested: Number(d.resyncsRequested || 0),
      snapshotsSent: Number(d.snapshotsSent || 0),
      snapshotsReceived: Number(d.snapshotsReceived || 0),
      hostTick: Number(d.hostTick || 0),
      remoteTick: Number(d.remoteTick || 0),
      tickDrift: Number(d.tickDrift || 0),
      packetsSent: Number(d.packetsSent || 0),
      packetsReceived: Number(d.packetsReceived || 0),
      workerTick: Number(bridge?.workerTick || 0),
      appliedNetworkSeq: Number(bridge?.appliedNetworkSeq || 0),
      actionErrors: Number(bridge?.actionErrors || 0),
      bridgeReady: Boolean(bridge?.ready),
      bridgeFailed: Boolean(bridge?.failed),
      role: mp?.role || null,
      mode: mp?.mode || null,
      lastError: d.lastError || null,
    };
  });
}

async function workerDiagnostics(page) {
  return page.evaluate(() => {
    const win = document.getElementById('mp-game-frame205')?.contentWindow;
    const bridge = win?.__FD_STABLE_STATE165__?.bridge;
    if (!bridge?.worker || !bridge?.pendingSaves) return null;
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
      const b = document.getElementById('mp-game-frame205')?.contentWindow?.__FD_STABLE_STATE165__?.bridge;
      return Number(b?.appliedNetworkSeq || 0) >= minimum
        ? { tick:Number(b.workerTick||0), applied:Number(b.appliedNetworkSeq), errors:Number(b.actionErrors||0), failed:Boolean(b.failed) }
        : { __pending:true, applied:Number(b?.appliedNetworkSeq||0), tick:Number(b?.workerTick||0) };
    }, seq, 18000, 80),
    waitFor(guest, minimum => {
      const b = document.getElementById('mp-game-frame205')?.contentWindow?.__FD_STABLE_STATE165__?.bridge;
      return Number(b?.appliedNetworkSeq || 0) >= minimum
        ? { tick:Number(b.workerTick||0), applied:Number(b.appliedNetworkSeq), errors:Number(b.actionErrors||0), failed:Boolean(b.failed) }
        : { __pending:true, applied:Number(b?.appliedNetworkSeq||0), tick:Number(b?.workerTick||0) };
    }, seq, 18000, 80),
  ]);
}

let hostBrowser, guestBrowser, hostContext, guestContext;
try {
  [hostBrowser, guestBrowser] = await Promise.all([chromium.launch({ headless:true }), chromium.launch({ headless:true })]);
  hostContext = await hostBrowser.newContext({ viewport:{width:1360,height:820}, deviceScaleFactor:1 });
  guestContext = await guestBrowser.newContext({ viewport:{width:1360,height:820}, deviceScaleFactor:1 });
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();
  addDiagnostics(host, 'multiplayer:host');
  addDiagnostics(guest, 'multiplayer:guest');

  await Promise.all([
    host.goto(baseUrl, { waitUntil:'load', timeout:60000 }),
    guest.goto(baseUrl, { waitUntil:'load', timeout:60000 }),
  ]);

  const ready = await Promise.all([
    waitFor(host, () => {
      const entries=Object.keys(globalThis).filter(k=>/^__FD_MULTIPLAYER_LOBBY_\d+__$/.test(k)).map(k=>({key:k,api:globalThis[k]})).filter(e=>e.api?.state&&typeof e.api?.createOffer==='function').sort((a,b)=>Number(b.api?.build||0)-Number(a.api?.build||0));
      const e=entries[0], win=document.getElementById('mp-game-frame205')?.contentWindow;
      return e?.api?.state?.frameReady && win ? { key:e.key, build:Number(e.api.build||0), frameReady:true } : { __pending:true, key:e?.key||null, build:Number(e?.api?.build||0), frameReady:Boolean(e?.api?.state?.frameReady) };
    }, undefined, 45000),
    waitFor(guest, () => {
      const entries=Object.keys(globalThis).filter(k=>/^__FD_MULTIPLAYER_LOBBY_\d+__$/.test(k)).map(k=>({key:k,api:globalThis[k]})).filter(e=>e.api?.state&&typeof e.api?.createOffer==='function').sort((a,b)=>Number(b.api?.build||0)-Number(a.api?.build||0));
      const e=entries[0], win=document.getElementById('mp-game-frame205')?.contentWindow;
      return e?.api?.state?.frameReady && win ? { key:e.key, build:Number(e.api.build||0), frameReady:true } : { __pending:true, key:e?.key||null, build:Number(e?.api?.build||0), frameReady:Boolean(e?.api?.state?.frameReady) };
    }, undefined, 45000),
  ]);
  if (!ready[0].lobbyKey && !ready[0].key) throw new Error(`No current multiplayer lobby API: ${JSON.stringify(ready)}`);

  await host.locator('#mp-host-role205').click();
  await guest.locator('#mp-guest-role205').click();
  await host.locator('#mp-mode205').selectOption('coop');

  const offer = await host.evaluate(async () => {
    const api=Object.keys(globalThis).filter(k=>/^__FD_MULTIPLAYER_LOBBY_\d+__$/.test(k)).map(k=>globalThis[k]).filter(x=>typeof x?.createOffer==='function').sort((a,b)=>Number(b.build||0)-Number(a.build||0))[0];
    return api.createOffer();
  });
  const answer = await guest.evaluate(async code => {
    const api=Object.keys(globalThis).filter(k=>/^__FD_MULTIPLAYER_LOBBY_\d+__$/.test(k)).map(k=>globalThis[k]).filter(x=>typeof x?.acceptOffer==='function').sort((a,b)=>Number(b.build||0)-Number(a.build||0))[0];
    return api.acceptOffer(code);
  }, offer);
  await host.evaluate(async code => {
    const api=Object.keys(globalThis).filter(k=>/^__FD_MULTIPLAYER_LOBBY_\d+__$/.test(k)).map(k=>globalThis[k]).filter(x=>typeof x?.acceptAnswer==='function').sort((a,b)=>Number(b.build||0)-Number(a.build||0))[0];
    return api.acceptAnswer(code);
  }, answer);

  const connected = await Promise.all([
    waitFor(host, () => {
      const api=Object.keys(globalThis).filter(k=>/^__FD_MULTIPLAYER_LOBBY_\d+__$/.test(k)).map(k=>globalThis[k]).filter(x=>x?.state).sort((a,b)=>Number(b.build||0)-Number(a.build||0))[0];
      const s=api?.state;
      return s?.connected&&s.frameReady&&s.remoteReady ? {connected:true,dataState:s.dataState,remoteReady:s.remoteReady} : {__pending:true,connected:Boolean(s?.connected),dataState:s?.dataState,frameReady:Boolean(s?.frameReady),remoteReady:Boolean(s?.remoteReady),error:s?.lastError||null};
    }, undefined, 45000),
    waitFor(guest, () => {
      const api=Object.keys(globalThis).filter(k=>/^__FD_MULTIPLAYER_LOBBY_\d+__$/.test(k)).map(k=>globalThis[k]).filter(x=>x?.state).sort((a,b)=>Number(b.build||0)-Number(a.build||0))[0];
      const s=api?.state;
      return s?.connected&&s.frameReady&&s.remoteReady ? {connected:true,dataState:s.dataState,remoteReady:s.remoteReady} : {__pending:true,connected:Boolean(s?.connected),dataState:s?.dataState,frameReady:Boolean(s?.frameReady),remoteReady:Boolean(s?.remoteReady),error:s?.lastError||null};
    }, undefined, 45000),
  ]);

  const started = await host.evaluate(() => {
    const api=Object.keys(globalThis).filter(k=>/^__FD_MULTIPLAYER_LOBBY_\d+__$/.test(k)).map(k=>globalThis[k]).filter(x=>typeof x?.startMatch==='function').sort((a,b)=>Number(b.build||0)-Number(a.build||0))[0];
    return api.startMatch();
  });
  if (!started) throw new Error(`Host refused current co-op start: ${JSON.stringify(connected)}`);

  await Promise.all([
    waitFor(host, () => {
      const win=document.getElementById('mp-game-frame205')?.contentWindow,b=win?.__FD_STABLE_STATE165__?.bridge,mp=win?.__FD_MULTIPLAYER__;
      return mp?.active&&mp.mode==='coop'&&b?.ready&&!b.failed&&Number(b.workerTick||0)>15 ? {tick:Number(b.workerTick),role:mp.role} : {__pending:true,tick:Number(b?.workerTick||0),active:Boolean(mp?.active),mode:mp?.mode||null,failed:Boolean(b?.failed)};
    }, undefined, 60000),
    waitFor(guest, () => {
      const win=document.getElementById('mp-game-frame205')?.contentWindow,b=win?.__FD_STABLE_STATE165__?.bridge,mp=win?.__FD_MULTIPLAYER__;
      return mp?.active&&mp.mode==='coop'&&b?.ready&&!b.failed&&Number(b.workerTick||0)>6 ? {tick:Number(b.workerTick),role:mp.role} : {__pending:true,tick:Number(b?.workerTick||0),active:Boolean(mp?.active),mode:mp?.mode||null,failed:Boolean(b?.failed)};
    }, undefined, 60000),
  ]);

  const baseline = await waitFor(host, () => {
    const api=Object.keys(globalThis).filter(k=>/^__FD_MULTIPLAYER_LOBBY_\d+__$/.test(k)).map(k=>globalThis[k]).filter(x=>typeof x?.diagnostics==='function').sort((a,b)=>Number(b.build||0)-Number(a.build||0))[0];
    const d=api?.diagnostics?.(), b=document.getElementById('mp-game-frame205')?.contentWindow?.__FD_STABLE_STATE165__?.bridge;
    return Number(d?.hashChecks||0)>=6&&Number(d?.hashMismatches||0)===0&&Number(d?.resyncsRequested||0)===0&&b?.ready&&!b.failed
      ? {hashChecks:Number(d.hashChecks),workerTick:Number(b.workerTick||0),lobbyBuild:Number(api.build||0)}
      : {__pending:true,hashChecks:Number(d?.hashChecks||0),hashMismatches:Number(d?.hashMismatches||0),resyncsRequested:Number(d?.resyncsRequested||0),tick:Number(b?.workerTick||0)};
  }, undefined, 45000, 100);
  const guestBaseline = await snapshot(guest);
  const initialWorkers = await Promise.all([workerDiagnostics(host), workerDiagnostics(guest)]);
  if (!initialWorkers[0]?.aiEnabled || !initialWorkers[1]?.aiEnabled) throw new Error(`Co-op AI disabled at soak start: ${JSON.stringify(initialWorkers)}`);

  const offsets=[{x:360,y:120},{x:-280,y:330},{x:190,y:-310},{x:-340,y:-110},{x:420,y:210},{x:-160,y:390},{x:260,y:-240},{x:-410,y:170}];
  const soakStarted=Date.now();
  let previousSeq=0, commands=0;
  const commandProof=[];

  while(Date.now()-soakStarted<SOAK_MS){
    const actor=commands%2===0?host:guest;
    const move=await issueMove(actor,offsets[commands%offsets.length]);
    if(move.error||!move.issued)throw new Error(`Soak move ${commands+1} not issued: ${JSON.stringify(move)}`);
    const event=await waitFor(host,previous=>{
      const api=Object.keys(globalThis).filter(k=>/^__FD_MULTIPLAYER_LOBBY_\d+__$/.test(k)).map(k=>globalThis[k]).filter(x=>x?.state).sort((a,b)=>Number(b.build||0)-Number(a.build||0))[0];
      const value=api?.state?.lastEvent;
      return Number(value?.seq||0)>previous?value:{__pending:true,seq:Number(value?.seq||0)};
    },previousSeq,8000,50);
    previousSeq=Number(event.seq);
    const applied=await waitApplied(host,guest,previousSeq);
    if(applied.some(item=>item.failed||item.errors))throw new Error(`Network action failed: ${JSON.stringify({event,applied})}`);
    commandProof.push({seq:previousSeq,actor:commands%2===0?'host':'guest',atTick:Number(event.atTick||0),applied});
    commands+=1;
    const live=await snapshot(host);
    if(!live.connected||live.dataState!=='open'||live.bridgeFailed||live.actionErrors||live.hashMismatches||live.mismatchStreak||live.resyncsRequested||live.snapshotsSent)throw new Error(`Soak health degraded after seq ${previousSeq}: ${JSON.stringify(live)}`);
    await host.waitForTimeout(6500);
  }

  await host.waitForTimeout(1500);
  const [hostFinal,guestFinal]=await Promise.all([snapshot(host),snapshot(guest)]);
  const finalWorkers=await Promise.all([workerDiagnostics(host),workerDiagnostics(guest)]);
  const tickAdvanceHost=hostFinal.workerTick-baseline.workerTick;
  const tickAdvanceGuest=guestFinal.workerTick-guestBaseline.workerTick;
  const hashAdvance=hostFinal.hashChecks-baseline.hashChecks;
  const hashMismatches=hostFinal.hashMismatches+guestFinal.hashMismatches;
  const resyncsRequested=hostFinal.resyncsRequested+guestFinal.resyncsRequested;
  const failures=[];
  if(commands<8)failures.push(`only ${commands} commands completed`);
  if(hashAdvance<30)failures.push(`only ${hashAdvance} new checksum pairs`);
  if(tickAdvanceHost<300)failures.push(`host advanced only ${tickAdvanceHost} ticks`);
  if(tickAdvanceGuest<250)failures.push(`guest advanced only ${tickAdvanceGuest} ticks`);
  for(const [label,value] of [['host',hostFinal],['guest',guestFinal]]){
    if(!value.connected||value.dataState!=='open')failures.push(`${label} DataChannel not open`);
    if(!value.bridgeReady||value.bridgeFailed)failures.push(`${label} bridge unhealthy`);
    if(value.actionErrors)failures.push(`${label} actionErrors=${value.actionErrors}`);
    if(value.hashMismatches||value.mismatchStreak)failures.push(`${label} checksum mismatch detected`);
    if(value.resyncsRequested||value.snapshotsSent||value.snapshotsReceived)failures.push(`${label} entered recovery during soak`);
  }
  if(!finalWorkers[0]?.aiEnabled||!finalWorkers[1]?.aiEnabled)failures.push('co-op AI became disabled');
  if(browserErrors.length)failures.push(`browser errors: ${browserErrors.join(' | ')}`);
  if(failures.length)throw new Error(`Current multiplayer soak failed: ${failures.join('; ')} :: ${JSON.stringify({baseline,guestBaseline,hostFinal,guestFinal,initialWorkers,finalWorkers,commands,lastCommands:commandProof.slice(-4)})}`);

  console.log(JSON.stringify({ok:true,durationMs:Date.now()-soakStarted,commands,hashAdvance,hashMismatches,resyncsRequested,tickAdvanceHost,tickAdvanceGuest,lobbyBuild:baseline.lobbyBuild,baseline,final:{host:hostFinal,guest:guestFinal},workers:{initial:initialWorkers,final:finalWorkers},lastCommands:commandProof.slice(-4)}));
} finally {
  await Promise.allSettled([hostContext?.close(),guestContext?.close()].filter(Boolean));
  await Promise.allSettled([hostBrowser?.close(),guestBrowser?.close()].filter(Boolean));
}
