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
const initial=await evaluate(`({title:document.title,body:document.body.innerText.length,start:!!document.querySelector('#start-screen'),button:!!document.querySelector('#start-game'),ui185:!!window.__FD_RUNTIME_UI_185__,bridgeExport:!!window.__FD_V172__,authScript:[...document.scripts].some(s=>String(s.src).includes('authoritative-simulation-v174.js'))})`);
console.log('SMOKE_INITIAL '+JSON.stringify(initial));
if(!initial.start||!initial.button||initial.body<100||!initial.ui185||!initial.bridgeExport||!initial.authScript)throw new Error(`Start/runtime shell invalid: ${JSON.stringify(initial)}`);
await evaluate(`document.querySelector('#start-game').click(); true`);
let state=null;for(let i=0;i<60;i++){state=await evaluate(`({game:!!window.__FD_DEBUG__?.game,stable:!!window.__FD_STABLE_STATE165__,workerTick:Number(window.__FD_STABLE_STATE165__?.bridge?.workerTick||0),mainAction184:!!window.__FD_ACTION_GROUP_184__,mainObjective184:!!window.__FD_CONSTRUCTION_VICTORY_184__})`);if(state.game&&state.stable&&state.workerTick>0)break;await sleep(200);}
console.log('SMOKE_AFTER_START '+JSON.stringify(state));
if(!state?.game||!state?.stable||state.workerTick<=0)throw new Error(`Authoritative Worker failed to start: ${JSON.stringify(state)}`);
if(state.mainAction184||state.mainObjective184)throw new Error('Authoritative simulation leaked onto main thread');

const progress0=await evaluate(`(()=>{const g=window.__FD_DEBUG__.game,b=window.__FD_STABLE_STATE165__.bridge;return {paused:g.paused,simTick:g.simTick,time:g.time,workerTick:b.workerTick,lastAck:b.lastAck,seq:b.seq,actionErrors:b.actionErrors,failed:b.failed};})()`);
await sleep(900);
const progress1=await evaluate(`(()=>{const g=window.__FD_DEBUG__.game,b=window.__FD_STABLE_STATE165__.bridge;return {paused:g.paused,simTick:g.simTick,time:g.time,workerTick:b.workerTick,lastAck:b.lastAck,seq:b.seq,actionErrors:b.actionErrors,failed:b.failed};})()`);
console.log('SMOKE_PROGRESS '+JSON.stringify({before:progress0,after:progress1}));
if(progress1.paused||!(progress1.simTick>progress0.simTick)||!(progress1.time>progress0.time))throw new Error(`Authoritative world is not advancing: ${JSON.stringify({progress0,progress1})}`);

const move=await evaluate(`(()=>{const D=window.__FD_DEBUG__,g=D.game,b=window.__FD_STABLE_STATE165__.bridge;const u=g.units.find(x=>x?.alive&&x.team==='player'&&!x.embarkedIn);if(!u)return {error:'no-player-unit'};for(const e of g.selected||[])e.selected=false;g.selected=[u];u.selected=true;const W=D.WORLD||{width:10000,height:10000};const tx=u.x<(W.width||10000)-260?u.x+180:Math.max(80,u.x-180);const ty=u.y<(W.height||10000)-180?u.y+80:Math.max(80,u.y-80);const before={x:u.x,y:u.y};const seq0=b.seq;const ok=g.issueMove(tx,ty,false);return {id:u.id,typeId:u.typeId,before,target:{x:tx,y:ty},ok,seq0,seq1:b.seq};})()`);
console.log('SMOKE_MOVE_SENT '+JSON.stringify(move));
if(move.error||!move.ok||!(move.seq1>move.seq0))throw new Error(`Move command was not routed: ${JSON.stringify(move)}`);
let moved=null;for(let i=0;i<40;i++){moved=await evaluate(`(()=>{const g=window.__FD_DEBUG__.game,b=window.__FD_STABLE_STATE165__.bridge,u=g.getEntity(${JSON.stringify(move.id)});return {x:u?.x,y:u?.y,command:u?.currentCommand?.type||null,lastAck:b.lastAck,seq:b.seq,actionErrors:b.actionErrors,paused:g.paused,simTick:g.simTick};})()`);if(moved.lastAck>=move.seq1&&Math.hypot(moved.x-move.before.x,moved.y-move.before.y)>2)break;await sleep(100);}
console.log('SMOKE_MOVE_RESULT '+JSON.stringify(moved));
if(moved.lastAck<move.seq1||moved.actionErrors||Math.hypot(moved.x-move.before.x,moved.y-move.before.y)<=2)throw new Error(`Move execution failed: ${JSON.stringify({move,moved})}`);

const uiProduction=await evaluate(`(()=>{const D=window.__FD_DEBUG__,g=D.game,b=window.__FD_STABLE_STATE165__.bridge;const building=g.buildings.find(x=>x?.alive&&x.team==='player'&&x.completed!==false&&(x.stats?.produces||[]).length);if(!building)return {error:'no-production-building'};for(const e of g.selected||[])e.selected=false;g.selected=[building];building.selected=true;g.uiDirty=true;g.updateUI?.();const itemId=building.stats.produces[0];const unitName=D.getUnitStats?.(itemId,g.teams.player.faction)?.name||itemId;const buttons=[...document.querySelectorAll('button')].map((el,index)=>({index,text:(el.textContent||'').trim().replace(/\s+/g,' ').slice(0,160),disabled:el.disabled,dataset:{...el.dataset},id:el.id||'',className:String(el.className||'')}));const needle=String(itemId).toLowerCase();const nameNeedle=String(unitName).toLowerCase();let button=[...document.querySelectorAll('button')].find(el=>{const hay=((el.textContent||'')+' '+JSON.stringify(el.dataset||{})).toLowerCase();return !el.disabled&&(hay.includes(needle)||hay.includes(nameNeedle));});if(!button)return {error:'production-button-not-found',buildingId:building.id,typeId:building.typeId,itemId,unitName,buttons:buttons.slice(-40)};const queue0=(building.queue||[]).length,seq0=b.seq,text=(button.textContent||'').trim().replace(/\s+/g,' ').slice(0,160);button.click();return {buildingId:building.id,typeId:building.typeId,itemId,unitName,queue0,seq0,seq1:b.seq,buttonText:text,buttonDataset:{...button.dataset}};})()`);
console.log('SMOKE_UI_PRODUCTION_SENT '+JSON.stringify(uiProduction));
if(uiProduction.error||!(uiProduction.seq1>uiProduction.seq0))throw new Error(`Production button did not route command: ${JSON.stringify(uiProduction)}`);
let produced=null;for(let i=0;i<40;i++){produced=await evaluate(`(()=>{const g=window.__FD_DEBUG__.game,b=window.__FD_STABLE_STATE165__.bridge,x=g.getEntity(${JSON.stringify(uiProduction.buildingId)});return {queue:(x?.queue||[]).length,lastAck:b.lastAck,seq:b.seq,actionErrors:b.actionErrors,paused:g.paused,simTick:g.simTick,credits:g.teams.player.credits};})()`);if(produced.lastAck>=uiProduction.seq1&&produced.queue>uiProduction.queue0)break;await sleep(100);}
console.log('SMOKE_UI_PRODUCTION_RESULT '+JSON.stringify(produced));
if(produced.lastAck<uiProduction.seq1||produced.actionErrors||produced.queue<=uiProduction.queue0)throw new Error(`Production UI execution failed: ${JSON.stringify({uiProduction,produced})}`);

const objectiveSamples=[];for(let i=0;i<24;i++){objectiveSamples.push(await evaluate(`document.querySelector('#objective-text')?.textContent||''`));await sleep(50);}const uniqueObjective=[...new Set(objectiveSamples)];console.log('SMOKE_OBJECTIVE_SAMPLES '+JSON.stringify(uniqueObjective));
if(uniqueObjective.length!==1||/осталось\s*:/i.test(uniqueObjective[0]))throw new Error(`Objective text flickers or exposes building count: ${JSON.stringify(uniqueObjective)}`);
if(exceptions.length)throw new Error(`Runtime exceptions: ${exceptions.join(' | ')}`);
console.log(JSON.stringify({ok:true,initial,state,progress0,progress1,move,moved,uiProduction,produced,objective:uniqueObjective[0],exceptions}));ws.close();
