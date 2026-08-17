import process from 'node:process';

const port = process.env.FD_DEBUG_PORT || '9222';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function targetList() {
  const response = await fetch(`http://127.0.0.1:${port}/json`);
  if (!response.ok) throw new Error(`CDP targets ${response.status}`);
  return response.json();
}
let targets = [];
for (let i = 0; i < 50; i += 1) {
  try { targets = await targetList(); if (targets.length) break; } catch {}
  await sleep(200);
}
const target = targets.find(item => item.type === 'page' && item.url.includes('frontline-dominion')) || targets.find(item => item.type === 'page');
if (!target?.webSocketDebuggerUrl) throw new Error('No Chromium page target');

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
let seq = 1;
const pending = new Map();
const exceptions = [];
ws.onmessage = event => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(JSON.stringify(message.error)));
    else resolve(message.result);
  } else if (message.method === 'Runtime.exceptionThrown') {
    const detail = message.params?.exceptionDetails;
    exceptions.push(detail?.exception?.description || detail?.text || 'Runtime exception');
  }
};
function call(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = seq++;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) {
    const detail = result.exceptionDetails;
    throw new Error(detail.exception?.description || detail.text || 'evaluation failed');
  }
  return result.result?.value;
}
await call('Runtime.enable');
await call('Page.enable');

for (let i = 0; i < 60; i += 1) {
  if (await evaluate(`document.readyState === 'complete' && !!document.querySelector('#start-game')`)) break;
  await sleep(100);
}
const initial = await evaluate(`({
  title: document.title,
  start: !!document.querySelector('#start-screen'),
  button: !!document.querySelector('#start-game'),
  ui186: !!window.__FD_RUNTIME_UI_186__,
  ui185: !!window.__FD_RUNTIME_UI_185__,
  bridge: !!window.__FD_V172__,
  authScript: [...document.scripts].filter(s => String(s.src).includes('authoritative-simulation-v174.js')).length,
  mainAction184: !!window.__FD_ACTION_GROUP_184__,
  mainObjective184: !!window.__FD_CONSTRUCTION_VICTORY_184__
})`);
console.log('SMOKE186_INITIAL ' + JSON.stringify(initial));
if (!initial.start || !initial.button || !initial.ui186 || initial.ui185 || !initial.bridge || initial.authScript !== 1) {
  throw new Error(`Build 186 shell invalid: ${JSON.stringify(initial)}`);
}
if (initial.mainAction184 || initial.mainObjective184) throw new Error('Authoritative modules leaked onto main thread');

await evaluate(`document.querySelector('#start-game').click(); true`);
let state = null;
for (let i = 0; i < 80; i += 1) {
  state = await evaluate(`({
    game: !!window.__FD_DEBUG__?.game,
    stable: !!window.__FD_STABLE_STATE165__,
    workerTick: Number(window.__FD_STABLE_STATE165__?.bridge?.workerTick || 0),
    bridgeBuild: Number(window.__FD_STABLE_STATE165__?.build || 0),
    failed: !!window.__FD_STABLE_STATE165__?.bridge?.failed,
    paused: !!window.__FD_DEBUG__?.game?.paused
  })`);
  if (state.game && state.stable && state.workerTick > 0) break;
  await sleep(100);
}
console.log('SMOKE186_STARTED ' + JSON.stringify(state));
if (!state?.game || !state?.stable || state.workerTick <= 0 || state.bridgeBuild !== 186 || state.failed || state.paused) {
  throw new Error(`Build 186 Worker did not start correctly: ${JSON.stringify(state)}`);
}

const progress0 = await evaluate(`(()=>{const g=window.__FD_DEBUG__.game,b=window.__FD_STABLE_STATE165__.bridge;return {tick:g.simTick,time:g.time,workerTick:b.workerTick};})()`);
await sleep(600);
const progress1 = await evaluate(`(()=>{const g=window.__FD_DEBUG__.game,b=window.__FD_STABLE_STATE165__.bridge;return {tick:g.simTick,time:g.time,workerTick:b.workerTick};})()`);
console.log('SMOKE186_PROGRESS ' + JSON.stringify({ progress0, progress1 }));
if (!(progress1.tick > progress0.tick) || !(progress1.time > progress0.time)) throw new Error('World did not advance after start');

// Real movement command through the public Game API -> bridge -> Worker -> mirrored position.
const move = await evaluate(`(()=>{
  const D=window.__FD_DEBUG__,g=D.game,b=window.__FD_STABLE_STATE165__.bridge;
  const u=g.units.find(x=>x?.alive&&x.team==='player'&&!x.embarkedIn);
  if(!u)return {error:'no player unit'};
  for(const e of g.selected||[])e.selected=false; g.selected=[u]; u.selected=true;
  const tx=u.x+160, ty=u.y+70, before={x:u.x,y:u.y}, seq0=b.seq;
  const ok=g.issueMove(tx,ty,false);
  return {id:u.id,before,target:{x:tx,y:ty},ok,seq0,seq1:b.seq};
})()`);
if (move.error || !move.ok || move.seq1 <= move.seq0) throw new Error(`Move was not routed: ${JSON.stringify(move)}`);
let moved = null;
for (let i = 0; i < 50; i += 1) {
  moved = await evaluate(`(()=>{const g=window.__FD_DEBUG__.game,b=window.__FD_STABLE_STATE165__.bridge,u=g.getEntity(${JSON.stringify(move.id)});return {x:u?.x||0,y:u?.y||0,lastAck:b.lastAck,errors:b.actionErrors,failed:b.failed,tick:g.simTick};})()`);
  if (moved.lastAck >= move.seq1 && Math.hypot(moved.x - move.before.x, moved.y - move.before.y) > 2) break;
  await sleep(80);
}
console.log('SMOKE186_MOVE ' + JSON.stringify({ move, moved }));
if (moved.lastAck < move.seq1 || moved.errors || moved.failed || Math.hypot(moved.x - move.before.x, moved.y - move.before.y) <= 2) {
  throw new Error(`Move execution failed: ${JSON.stringify({ move, moved })}`);
}

// Select a real producer, force its UI to render, then click the actual production button.
const producer = await evaluate(`(()=>{
  const D=window.__FD_DEBUG__,g=D.game,b=window.__FD_STABLE_STATE165__.bridge;
  const building=g.buildings.find(x=>x?.alive&&x.team==='player'&&x.completed!==false&&(x.stats?.produces||[]).length);
  if(!building)return {error:'no production building'};
  for(const e of g.selected||[])e.selected=false; g.selected=[building]; building.selected=true; g.uiDirty=true; g.updateUI?.();
  const itemId=building.stats.produces[0];
  const button=[...document.querySelectorAll('button')].find(el=>!el.disabled&&el.dataset?.actionKind==='unit'&&el.dataset?.typeId===itemId);
  if(!button)return {error:'production button missing',buildingId:building.id,itemId};
  const before={queue:(building.queue||[]).length,credits:g.teams.player.credits,seq:b.seq};
  button.click();
  return {buildingId:building.id,itemId,before,seq1:b.seq,buttonText:(button.textContent||'').trim().replace(/\\s+/g,' ').slice(0,120)};
})()`);
console.log('SMOKE186_PRODUCTION_SENT ' + JSON.stringify(producer));
if (producer.error || producer.seq1 <= producer.before.seq) throw new Error(`Production click was not routed: ${JSON.stringify(producer)}`);
let produced = null;
for (let i = 0; i < 50; i += 1) {
  produced = await evaluate(`(()=>{const g=window.__FD_DEBUG__.game,b=window.__FD_STABLE_STATE165__.bridge,x=g.getEntity(${JSON.stringify(producer.buildingId)});return {queue:(x?.queue||[]).length,credits:g.teams.player.credits,lastAck:b.lastAck,errors:b.actionErrors,failed:b.failed};})()`);
  if (produced.lastAck >= producer.seq1 && produced.queue > producer.before.queue) break;
  await sleep(80);
}
console.log('SMOKE186_PRODUCTION_RESULT ' + JSON.stringify(produced));
if (produced.lastAck < producer.seq1 || produced.errors || produced.failed || produced.queue <= producer.before.queue || !(produced.credits < producer.before.credits)) {
  throw new Error(`Production execution failed: ${JSON.stringify({ producer, produced })}`);
}

// Reproduce the user's regression deliberately: pause Worker only, leave UI/game running,
// then issue another move. Build 186 must self-heal the stale Worker pause.
const stale = await evaluate(`(()=>{
  const D=window.__FD_DEBUG__,g=D.game,b=window.__FD_STABLE_STATE165__.bridge;
  const u=g.units.find(x=>x?.alive&&x.team==='player'&&!x.embarkedIn);
  b.worker.postMessage({type:'pause',paused:true});
  return {id:u.id,x:u.x,y:u.y,mainPaused:g.paused,workerTick:b.workerTick};
})()`);
await sleep(260);
const frozen = await evaluate(`(()=>{const g=window.__FD_DEBUG__.game,b=window.__FD_STABLE_STATE165__.bridge;return {mainPaused:g.paused,workerTick:b.workerTick,tick:g.simTick};})()`);
const recovery = await evaluate(`(()=>{
  const g=window.__FD_DEBUG__.game,b=window.__FD_STABLE_STATE165__.bridge,u=g.getEntity(${JSON.stringify(stale.id)});
  for(const e of g.selected||[])e.selected=false; g.selected=[u]; u.selected=true;
  const before={x:u.x,y:u.y,seq:b.seq,lastAck:b.lastAck,workerTick:b.workerTick};
  const ok=g.issueMove(u.x+190,u.y-60,false);
  return {before,ok,seq1:b.seq};
})()`);
if (!recovery.ok || recovery.seq1 <= recovery.before.seq) throw new Error(`Recovery action was not routed: ${JSON.stringify(recovery)}`);
let recovered = null;
for (let i = 0; i < 70; i += 1) {
  recovered = await evaluate(`(()=>{const g=window.__FD_DEBUG__.game,b=window.__FD_STABLE_STATE165__.bridge,u=g.getEntity(${JSON.stringify(stale.id)});return {x:u?.x||0,y:u?.y||0,lastAck:b.lastAck,workerTick:b.workerTick,tick:g.simTick,time:g.time,mainPaused:g.paused,errors:b.actionErrors,failed:b.failed};})()`);
  if (recovered.lastAck >= recovery.seq1 && recovered.workerTick > frozen.workerTick && Math.hypot(recovered.x - recovery.before.x, recovered.y - recovery.before.y) > 2) break;
  await sleep(80);
}
console.log('SMOKE186_STALE_PAUSE_RECOVERY ' + JSON.stringify({ stale, frozen, recovery, recovered }));
if (stale.mainPaused || frozen.mainPaused || recovered.mainPaused || recovered.lastAck < recovery.seq1 || recovered.workerTick <= frozen.workerTick || recovered.errors || recovered.failed || Math.hypot(recovered.x - recovery.before.x, recovered.y - recovery.before.y) <= 2) {
  throw new Error(`Stale pause did not recover: ${JSON.stringify({ stale, frozen, recovery, recovered })}`);
}

// Objective text must have one writer: never expose remaining building count and never flicker.
const objectiveSamples = [];
for (let i = 0; i < 30; i += 1) {
  objectiveSamples.push(await evaluate(`document.querySelector('#objective-text')?.textContent || ''`));
  await sleep(40);
}
const uniqueObjective = [...new Set(objectiveSamples)];
console.log('SMOKE186_OBJECTIVE ' + JSON.stringify(uniqueObjective));
if (uniqueObjective.length !== 1 || !uniqueObjective[0] || /осталось\s*:/i.test(uniqueObjective[0])) {
  throw new Error(`Objective flickers or exposes building count: ${JSON.stringify(uniqueObjective)}`);
}
if (exceptions.length) throw new Error(`Runtime exceptions: ${exceptions.join(' | ')}`);

console.log(JSON.stringify({ ok:true, build:186, progress:{progress0,progress1}, moved, produced, recovered, objective:uniqueObjective[0], exceptions }));
ws.close();
