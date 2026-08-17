import process from 'node:process';

const debugPort = process.env.FD_DEBUG_PORT || '9222';
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function targets(){const r=await fetch(`http://127.0.0.1:${debugPort}/json`);if(!r.ok)throw new Error(`CDP target list ${r.status}`);return await r.json();}
let list=[];for(let i=0;i<40;i++){try{list=await targets();if(list.length)break;}catch{}await sleep(250);}
const target=list.find(t=>t.type==='page'&&t.url.includes('frontline-dominion'))||list.find(t=>t.type==='page');
if(!target?.webSocketDebuggerUrl)throw new Error('No Chromium page target');
const ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
let seq=1;const pending=new Map();const exceptions=[];
ws.onmessage=ev=>{const msg=JSON.parse(ev.data);if(msg.id&&pending.has(msg.id)){const {resolve,reject}=pending.get(msg.id);pending.delete(msg.id);if(msg.error)reject(new Error(JSON.stringify(msg.error)));else resolve(msg.result);}else if(msg.method==='Runtime.exceptionThrown'){exceptions.push(msg.params?.exceptionDetails?.text||'Runtime exception');}};
function call(method,params={}){return new Promise((resolve,reject)=>{const id=seq++;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});}
async function evaluate(expression){const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.text||'evaluation failed');return r.result?.value;}
await call('Runtime.enable');await call('Page.enable');
for(let i=0;i<50;i++){if(await evaluate(`document.readyState === 'complete' && !!document.querySelector('#start-game')`))break;await sleep(200);}
const initial=await evaluate(`({
  title:document.title,body:document.body.innerText.length,start:!!document.querySelector('#start-screen'),button:!!document.querySelector('#start-game'),
  ui185:!!window.__FD_RUNTIME_UI_185__,mainAction184:!!window.__FD_ACTION_GROUP_184__,mainObjective184:!!window.__FD_CONSTRUCTION_VICTORY_184__,
  bridgeExport:!!window.__FD_V172__,stable:!!window.__FD_STABLE_STATE165__,
  authScript:[...document.scripts].some(s=>String(s.src).includes('authoritative-simulation-v174.js'))
})`);
console.log('SMOKE_INITIAL '+JSON.stringify(initial));
if(!initial.start||!initial.button||initial.body<100)throw new Error('Game start screen did not render');
if(!initial.ui185)throw new Error('Runtime UI 185 missing');
if(initial.mainAction184||initial.mainObjective184)throw new Error('Authoritative simulation leaked onto main thread');
await evaluate(`document.querySelector('#start-game').click(); true`);
let state=null;for(let i=0;i<60;i++){state=await evaluate(`({
  game:!!window.__FD_DEBUG__?.game,stable:!!window.__FD_STABLE_STATE165__,workerTick:Number(window.__FD_STABLE_STATE165__?.bridge?.workerTick||0),transport:window.__FD_STABLE_STATE165__?.bridge?.transportMode165||null,
  mainAction184:!!window.__FD_ACTION_GROUP_184__,mainObjective184:!!window.__FD_CONSTRUCTION_VICTORY_184__,ui185:!!window.__FD_RUNTIME_UI_185__,bridgeExport:!!window.__FD_V172__
})`);if(state.game&&state.stable&&state.workerTick>0)break;await sleep(200);}
console.log('SMOKE_AFTER_START '+JSON.stringify(state));
if(!state?.game||!state?.stable||state.workerTick<=0)throw new Error(`Authoritative Worker failed to start: ${JSON.stringify(state)}`);
if(state.mainAction184||state.mainObjective184)throw new Error('Simulation modules appeared on main thread after match start');

const progress0=await evaluate(`(()=>{const g=window.__FD_DEBUG__.game,b=window.__FD_STABLE_STATE165__.bridge;return {paused:g.paused,simTick:g.simTick,time:g.time,workerTick:b.workerTick,lastAck:b.lastAck,seq:b.seq,actionErrors:b.actionErrors,failed:b.failed,units:g.units.length,buildings:g.buildings.length};})()`);
await sleep(900);
const progress1=await evaluate(`(()=>{const g=window.__FD_DEBUG__.game,b=window.__FD_STABLE_STATE165__.bridge;return {paused:g.paused,simTick:g.simTick,time:g.time,workerTick:b.workerTick,lastAck:b.lastAck,seq:b.seq,actionErrors:b.actionErrors,failed:b.failed};})()`);
console.log('SMOKE_PROGRESS '+JSON.stringify({before:progress0,after:progress1}));
if(progress1.paused)throw new Error(`Game unexpectedly paused after start: ${JSON.stringify(progress1)}`);
if(!(progress1.simTick>progress0.simTick) || !(progress1.time>progress0.time))throw new Error(`Authoritative world is not advancing: ${JSON.stringify({progress0,progress1})}`);

const move=await evaluate(`(()=>{const D=window.__FD_DEBUG__,g=D.game,b=window.__FD_STABLE_STATE165__.bridge;const u=g.units.find(x=>x?.alive&&x.team==='player'&&!x.embarkedIn);if(!u)return {error:'no-player-unit'};for(const e of g.selected||[])e.selected=false;g.selected=[u];u.selected=true;const W=D.WORLD||{width:10000,height:10000};const tx=u.x<(W.width||10000)-260?u.x+180:Math.max(80,u.x-180);const ty=u.y<(W.height||10000)-180?u.y+80:Math.max(80,u.y-80);const before={x:u.x,y:u.y,command:u.currentCommand?.type||null,queue:u.commandQueue?.length||0};const seq0=b.seq;const ok=g.issueMove(tx,ty,false);return {id:u.id,typeId:u.typeId,before,target:{x:tx,y:ty},ok,seq0,seq1:b.seq};})()`);
console.log('SMOKE_MOVE_SENT '+JSON.stringify(move));
if(move.error||!move.ok||!(move.seq1>move.seq0))throw new Error(`Move command was not routed: ${JSON.stringify(move)}`);
let moved=null;for(let i=0;i<40;i++){moved=await evaluate(`(()=>{const g=window.__FD_DEBUG__.game,b=window.__FD_STABLE_STATE165__.bridge,u=g.getEntity(${JSON.stringify(move.id)});return {x:u?.x,y:u?.y,command:u?.currentCommand?.type||null,commandCode:u?._fdCommandCode172||0,queue:u?.commandQueue?.length||0,lastAck:b.lastAck,seq:b.seq,actionErrors:b.actionErrors,paused:g.paused,simTick:g.simTick,time:g.time,workerTick:b.workerTick,failed:b.failed};})()`);if(moved.lastAck>=move.seq1&&Math.hypot(moved.x-move.before.x,moved.y-move.before.y)>2)break;await sleep(100);}
console.log('SMOKE_MOVE_RESULT '+JSON.stringify(moved));
if(moved.lastAck<move.seq1)throw new Error(`Move command never acknowledged by Worker: ${JSON.stringify({move,moved})}`);
if(moved.actionErrors)throw new Error(`Worker rejected an action: ${JSON.stringify({move,moved})}`);
if(Math.hypot(moved.x-move.before.x,moved.y-move.before.y)<=2)throw new Error(`Unit acknowledged move but did not move: ${JSON.stringify({move,moved})}`);

const production=await evaluate(`(()=>{const g=window.__FD_DEBUG__.game;return g.buildings.filter(b=>b?.alive&&b.team==='player'&&b.completed!==false).slice(0,20).map(b=>({id:b.id,typeId:b.typeId,queue:(b.queue||[]).length,statsKeys:Object.keys(b.stats||{}).filter(k=>/produc|unit|build|train|queue/i.test(k)),produces:b.stats?.produces||b.produces||null}));})()`);
console.log('SMOKE_PRODUCTION_CANDIDATES '+JSON.stringify(production));
const objectiveSamples=[];for(let i=0;i<16;i++){objectiveSamples.push(await evaluate(`document.querySelector('#objective-text')?.textContent||''`));await sleep(50);}console.log('SMOKE_OBJECTIVE_SAMPLES '+JSON.stringify([...new Set(objectiveSamples)]));

if(exceptions.length)throw new Error(`Runtime exceptions: ${exceptions.join(' | ')}`);
console.log(JSON.stringify({ok:true,initial,state,progress0,progress1,move,moved,production,objectiveSamples:[...new Set(objectiveSamples)],exceptions}));ws.close();
