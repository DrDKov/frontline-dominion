import process from 'node:process';
const port=process.env.FD_DEBUG_PORT||'9222';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let targets=[];for(let i=0;i<50;i++){try{const r=await fetch(`http://127.0.0.1:${port}/json`);targets=await r.json();if(targets.length)break;}catch{}await sleep(200);}
const target=targets.find(t=>t.type==='page'&&t.url.includes('frontline-dominion'))||targets.find(t=>t.type==='page');
if(!target?.webSocketDebuggerUrl)throw new Error('no page');
const ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((res,rej)=>{ws.onopen=res;ws.onerror=rej});
let n=1;const pending=new Map();ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id);}};
const call=(method,params={})=>new Promise(resolve=>{const id=n++;pending.set(id,resolve);ws.send(JSON.stringify({id,method,params}));});
const evalJs=async expression=>{const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.error)throw new Error(JSON.stringify(r.error));if(r.result?.exceptionDetails){const d=r.result.exceptionDetails;throw new Error([d.text,d.exception?.description,d.exception?.value,`line=${d.lineNumber}`,`col=${d.columnNumber}`].filter(Boolean).join(' | '));}return r.result?.result?.value;};
await call('Runtime.enable');
for(let i=0;i<50;i++){if(await evalJs(`!!document.querySelector('#start-game')`))break;await sleep(100);}
await evalJs(`document.querySelector('#start-game')?.click();true`);
for(let i=0;i<60;i++){if(await evalJs(`!!window.__FD_DEBUG__?.game && Number(window.__FD_STABLE_STATE165__?.bridge?.workerTick||0)>0`))break;await sleep(100);}
const prepared=await evalJs(`(()=>{let stage='begin';try{const D=window.__FD_DEBUG__,g=D.game,b=window.__FD_STABLE_STATE165__?.bridge;stage='find-building';const building=g.buildings.find(x=>x?.alive&&x.team==='player'&&x.completed!==false&&(x.stats?.produces||[]).length);if(!building)return {stage,error:'no-production-building'};const itemId=building.stats.produces[0];stage='select';for(const e of g.selected||[])e.selected=false;g.selected=[building];building.selected=true;g.uiDirty=true;stage='updateUI';g.updateUI?.();stage='find-button';const button=[...document.querySelectorAll('button')].find(el=>!el.disabled&&el.dataset?.actionKind==='unit'&&el.dataset?.typeId===itemId);return {stage:button?'ok':'button-missing',building:{id:building.id,typeId:building.typeId,itemId,queue:(building.queue||[]).length},bridge:{seq:b?.seq,lastAck:b?.lastAck,actionErrors:b?.actionErrors},button:button?{text:(button.textContent||'').trim().replace(/\\s+/g,' ').slice(0,180),dataset:Object.fromEntries(Object.entries(button.dataset||{}))}:null};}catch(e){return {stage,error:String(e?.message||e),stack:String(e?.stack||'')};}})()`);
console.log('UI_PREPARED '+JSON.stringify(prepared));
if(prepared.error||!prepared.button)throw new Error('production button missing '+JSON.stringify(prepared));
const clicked=await evalJs(`(()=>{let stage='begin';try{const D=window.__FD_DEBUG__,g=D.game,b=window.__FD_STABLE_STATE165__?.bridge,building=g.getEntity(${JSON.stringify(prepared.building.id)});stage='find-button';const button=[...document.querySelectorAll('button')].find(el=>!el.disabled&&el.dataset?.actionKind==='unit'&&el.dataset?.typeId===${JSON.stringify(prepared.building.itemId)});if(!button)return {stage,error:'button-disappeared'};const before={seq:b.seq,lastAck:b.lastAck,actionErrors:b.actionErrors,queue:(building.queue||[]).length,credits:g.teams.player.credits};stage='click';button.click();return {stage:'clicked',before,after:{seq:b.seq,lastAck:b.lastAck,actionErrors:b.actionErrors,queue:(building.queue||[]).length,credits:g.teams.player.credits}};}catch(e){return {stage,error:String(e?.message||e),stack:String(e?.stack||'')};}})()`);
console.log('UI_CLICKED '+JSON.stringify(clicked));
await sleep(500);
const after=await evalJs(`(()=>{const g=window.__FD_DEBUG__.game,b=window.__FD_STABLE_STATE165__?.bridge,x=g.getEntity(${JSON.stringify(prepared.building.id)});return {seq:b.seq,lastAck:b.lastAck,actionErrors:b.actionErrors,queue:(x?.queue||[]).length,credits:g.teams.player.credits,paused:g.paused,simTick:g.simTick,time:g.time,workerTick:b.workerTick};})()`);
console.log('UI_AFTER '+JSON.stringify(after));
ws.close();
