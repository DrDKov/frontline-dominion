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
  debugKeys:Object.keys(window.__FD_DEBUG__||{}).sort(),
  required:{Game:!!window.__FD_DEBUG__?.Game,Unit:!!window.__FD_DEBUG__?.Unit,Building:!!window.__FD_DEBUG__?.Building,ResourceNode:!!window.__FD_DEBUG__?.ResourceNode,Projectile:!!window.__FD_DEBUG__?.Projectile},
  authScript:[...document.scripts].some(s=>String(s.src).includes('authoritative-simulation-v174.js')),
  authResources:performance.getEntriesByType('resource').filter(r=>String(r.name).includes('authoritative-simulation')).map(r=>({name:r.name,duration:r.duration,transferSize:r.transferSize}))
})`);
console.log('SMOKE_INITIAL '+JSON.stringify(initial));
if(!initial.start||!initial.button||initial.body<100)throw new Error('Game start screen did not render');
if(!initial.ui185)throw new Error('Runtime UI 185 missing');
if(initial.mainAction184||initial.mainObjective184)throw new Error('Authoritative simulation leaked onto main thread');
await evaluate(`document.querySelector('#start-game').click(); true`);
let state=null;for(let i=0;i<50;i++){state=await evaluate(`({
  game:!!window.__FD_DEBUG__?.game,stable:!!window.__FD_STABLE_STATE165__,workerTick:Number(window.__FD_STABLE_STATE165__?.bridge?.workerTick||0),transport:window.__FD_STABLE_STATE165__?.bridge?.transportMode165||null,
  mainAction184:!!window.__FD_ACTION_GROUP_184__,mainObjective184:!!window.__FD_CONSTRUCTION_VICTORY_184__,ui185:!!window.__FD_RUNTIME_UI_185__,bridgeExport:!!window.__FD_V172__,
  debugKeys:Object.keys(window.__FD_DEBUG__||{}).sort(),required:{Game:!!window.__FD_DEBUG__?.Game,Unit:!!window.__FD_DEBUG__?.Unit,Building:!!window.__FD_DEBUG__?.Building,ResourceNode:!!window.__FD_DEBUG__?.ResourceNode,Projectile:!!window.__FD_DEBUG__?.Projectile}
})`);if(state.game&&state.stable&&state.workerTick>0)break;await sleep(200);}
console.log('SMOKE_AFTER_START '+JSON.stringify(state));
if(!state?.game||!state?.stable||state.workerTick<=0)throw new Error(`Authoritative Worker failed to start: ${JSON.stringify(state)}`);
if(state.mainAction184||state.mainObjective184)throw new Error('Simulation modules appeared on main thread after match start');
if(exceptions.length)throw new Error(`Runtime exceptions: ${exceptions.join(' | ')}`);
console.log(JSON.stringify({ok:true,initial,state,exceptions}));ws.close();
