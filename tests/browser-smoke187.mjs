import process from 'node:process';

const port = process.env.FD_DEBUG_PORT || '9222';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let targets = [];
for (let i = 0; i < 60; i += 1) {
  try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (targets.length) break; } catch {}
  await sleep(100);
}
const target = targets.find(x => x.type === 'page' && x.url.includes('frontline-dominion')) || targets.find(x => x.type === 'page');
if (!target?.webSocketDebuggerUrl) throw new Error('No Chromium target');
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
let seq = 1; const pending = new Map(), exceptions = [], navigations = [];
ws.onmessage = event => {
  const m = JSON.parse(event.data);
  if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); }
  else if (m.method === 'Runtime.exceptionThrown') exceptions.push(m.params?.exceptionDetails?.exception?.description || m.params?.exceptionDetails?.text || 'Runtime exception');
  else if (m.method === 'Page.frameNavigated' && !m.params?.frame?.parentId) navigations.push(m.params.frame.url);
};
const call = (method, params = {}) => new Promise((resolve, reject) => { const id = seq++; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })); });
async function ev(expression) { const r = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text || 'eval failed'); return r.result?.value; }
await call('Runtime.enable'); await call('Page.enable');
for (let i = 0; i < 60; i += 1) { if (await ev(`document.readyState==='complete'&&!!document.querySelector('#start-game')`)) break; await sleep(100); }

const initial = await ev(`(()=>{const b=document.getElementById('start-game'),s=getComputedStyle(b);return{href:location.href,title:document.title,htmlClass:document.documentElement.className,buildData:document.documentElement.dataset.fdBuild||null,shell187:!!window.__FD_RUNTIME_SHELL_187__,ui187:!!window.__FD_RUNTIME_UI_187__,ui186:!!window.__FD_RUNTIME_UI_186__,button:{display:s.display,visibility:s.visibility,opacity:s.opacity,width:b.getBoundingClientRect().width,height:b.getBoundingClientRect().height,disabled:b.disabled},scripts:[...document.scripts].filter(x=>x.src).map(x=>new URL(x.src).pathname.split('/').pop()+new URL(x.src).search)};})()`);
console.log('SMOKE187_INITIAL ' + JSON.stringify(initial));
if (!initial.shell187 || !initial.ui187 || initial.ui186 || initial.buildData !== '187' || !/v16\.8\.3/i.test(initial.title) || /fd-boot183|fd-ready183/.test(initial.htmlClass)) throw new Error(`Build 187 shell invalid: ${JSON.stringify(initial)}`);
if (initial.button.display === 'none' || initial.button.visibility === 'hidden' || Number(initial.button.opacity) <= 0 || initial.button.width < 20 || initial.button.height < 20 || initial.button.disabled) throw new Error(`Start button hidden: ${JSON.stringify(initial.button)}`);
if (initial.scripts.some(src => /\.js\?build=(?!187(?:\D|$))/.test(src))) throw new Error(`Mixed cache generations: ${JSON.stringify(initial.scripts)}`);

await ev(`document.querySelector('#start-game').click();true`);
let started = null;
for (let i = 0; i < 100; i += 1) {
  started = await ev(`(()=>{const g=window.__FD_DEBUG__?.game,b=window.__FD_STABLE_STATE165__?.bridge;return{game:!!g,workerTick:Number(b?.workerTick||0),bridgeBuild:Number(window.__FD_STABLE_STATE165__?.build||0),failed:!!b?.failed,paused:!!g?.paused,tick:g?.simTick||0,time:g?.time||0};})()`);
  if (started.game && started.workerTick > 0) break;
  await sleep(80);
}
console.log('SMOKE187_STARTED ' + JSON.stringify(started));
if (!started?.game || started.workerTick <= 0 || started.bridgeBuild !== 187 || started.failed || started.paused) throw new Error(`Worker start failed: ${JSON.stringify(started)}`);
const tick0 = started.workerTick; await sleep(500);
const progress = await ev(`(()=>{const g=window.__FD_DEBUG__.game,b=window.__FD_STABLE_STATE165__.bridge;return{workerTick:b.workerTick,tick:g.simTick,time:g.time};})()`);
if (progress.workerTick <= tick0 || progress.tick <= started.tick || progress.time <= started.time) throw new Error(`World not advancing: ${JSON.stringify({started,progress})}`);

const canvas = await ev(`(()=>{const c=document.getElementById('game-canvas'),ctx=c.getContext('2d'),sw=Math.min(c.width,160),sh=Math.min(c.height,100),d=ctx.getImageData(Math.max(0,(c.width-sw)>>1),Math.max(0,(c.height-sh)>>1),sw,sh).data;let lit=0,max=0;const bins=new Set();for(let i=0;i<d.length;i+=16){const r=d[i],g=d[i+1],b=d[i+2],v=Math.max(r,g,b);if(v>12)lit++;max=Math.max(max,v);bins.add((r>>4)+','+(g>>4)+','+(b>>4));}return{width:c.clientWidth,height:c.clientHeight,lit,max,bins:bins.size};})()`);
console.log('SMOKE187_CANVAS ' + JSON.stringify(canvas));
if (canvas.width < 100 || canvas.height < 100 || canvas.lit < 20 || canvas.bins < 3) throw new Error(`Canvas blank: ${JSON.stringify(canvas)}`);

const move = await ev(`(()=>{const g=window.__FD_DEBUG__.game,b=window.__FD_STABLE_STATE165__.bridge,u=g.units.find(x=>x?.alive&&x.team==='player'&&!x.embarkedIn);if(!u)return{error:'no unit'};for(const e of g.selected||[])e.selected=false;g.selected=[u];u.selected=true;const before={x:u.x,y:u.y,seq:b.seq},ok=g.issueMove(u.x+170,u.y+65,false);return{id:u.id,before,ok,seq1:b.seq};})()`);
if (move.error || !move.ok || move.seq1 <= move.before.seq) throw new Error(`Move not routed: ${JSON.stringify(move)}`);
let moved = null;
for (let i = 0; i < 60; i += 1) { moved = await ev(`(()=>{const g=window.__FD_DEBUG__.game,b=window.__FD_STABLE_STATE165__.bridge,u=g.getEntity(${JSON.stringify(move.id)});return{x:u?.x||0,y:u?.y||0,lastAck:b.lastAck,errors:b.actionErrors,failed:b.failed};})()`); if (moved.lastAck >= move.seq1 && Math.hypot(moved.x-move.before.x,moved.y-move.before.y)>2) break; await sleep(70); }
console.log('SMOKE187_MOVE ' + JSON.stringify({move,moved}));
if (moved.lastAck < move.seq1 || moved.errors || moved.failed || Math.hypot(moved.x-move.before.x,moved.y-move.before.y)<=2) throw new Error(`Move failed: ${JSON.stringify({move,moved})}`);

const production = await ev(`(()=>{const g=window.__FD_DEBUG__.game,b=window.__FD_STABLE_STATE165__.bridge,x=g.buildings.find(v=>v?.alive&&v.team==='player'&&v.completed!==false&&(v.stats?.produces||[]).length);if(!x)return{error:'no producer'};for(const e of g.selected||[])e.selected=false;g.selected=[x];x.selected=true;g.uiDirty=true;g.updateUI?.();const itemId=x.stats.produces[0],button=[...document.querySelectorAll('button')].find(el=>!el.disabled&&el.dataset?.actionKind==='unit'&&el.dataset?.typeId===itemId);if(!button)return{error:'button missing'};const before={queue:(x.queue||[]).length,credits:g.teams.player.credits,seq:b.seq};button.click();return{id:x.id,itemId,before,seq1:b.seq};})()`);
if (production.error || production.seq1 <= production.before.seq) throw new Error(`Production not routed: ${JSON.stringify(production)}`);
let produced = null;
for (let i = 0; i < 60; i += 1) { produced = await ev(`(()=>{const g=window.__FD_DEBUG__.game,b=window.__FD_STABLE_STATE165__.bridge,x=g.getEntity(${JSON.stringify(production.id)});return{queue:(x?.queue||[]).length,credits:g.teams.player.credits,lastAck:b.lastAck,errors:b.actionErrors,failed:b.failed};})()`); if (produced.lastAck>=production.seq1&&produced.queue>production.before.queue) break; await sleep(70); }
console.log('SMOKE187_PRODUCTION ' + JSON.stringify({production,produced}));
if (produced.lastAck < production.seq1 || produced.errors || produced.failed || produced.queue <= production.before.queue || produced.credits >= production.before.credits) throw new Error(`Production failed: ${JSON.stringify({production,produced})}`);

const stale = await ev(`(()=>{const g=window.__FD_DEBUG__.game,b=window.__FD_STABLE_STATE165__.bridge,u=g.units.find(x=>x?.alive&&x.team==='player'&&!x.embarkedIn);b.worker.postMessage({type:'pause',paused:true});return{id:u.id,workerTick:b.workerTick};})()`);await sleep(250);
const frozen = await ev(`window.__FD_STABLE_STATE165__.bridge.workerTick`);
const recovery = await ev(`(()=>{const g=window.__FD_DEBUG__.game,b=window.__FD_STABLE_STATE165__.bridge,u=g.getEntity(${JSON.stringify(stale.id)});for(const e of g.selected||[])e.selected=false;g.selected=[u];u.selected=true;const before={x:u.x,y:u.y,seq:b.seq},ok=g.issueMove(u.x+180,u.y-55,false);return{before,ok,seq1:b.seq};})()`);
let recovered = null;
for (let i = 0; i < 70; i += 1) { recovered = await ev(`(()=>{const g=window.__FD_DEBUG__.game,b=window.__FD_STABLE_STATE165__.bridge,u=g.getEntity(${JSON.stringify(stale.id)});return{x:u?.x||0,y:u?.y||0,lastAck:b.lastAck,workerTick:b.workerTick,paused:g.paused,errors:b.actionErrors,failed:b.failed};})()`); if (recovered.lastAck>=recovery.seq1&&recovered.workerTick>frozen&&Math.hypot(recovered.x-recovery.before.x,recovered.y-recovery.before.y)>2) break; await sleep(70); }
console.log('SMOKE187_RECOVERY ' + JSON.stringify({stale,frozen,recovery,recovered}));
if (!recovery.ok || recovered.lastAck < recovery.seq1 || recovered.workerTick <= frozen || recovered.paused || recovered.errors || recovered.failed || Math.hypot(recovered.x-recovery.before.x,recovered.y-recovery.before.y)<=2) throw new Error(`Stale pause recovery failed: ${JSON.stringify({stale,frozen,recovery,recovered})}`);

const objectives=[];const titles=[];const hrefs=[];
for(let i=0;i<30;i+=1){objectives.push(await ev(`document.querySelector('#objective-text')?.textContent||''`));titles.push(await ev(`document.title`));hrefs.push(await ev(`location.href`));await sleep(30);}
const uniqueObjectives=[...new Set(objectives)],uniqueTitles=[...new Set(titles)],uniqueHrefs=[...new Set(hrefs)];
console.log('SMOKE187_STABILITY '+JSON.stringify({uniqueObjectives,uniqueTitles,uniqueHrefs,navigations}));
if(uniqueObjectives.length!==1||!uniqueObjectives[0]||/осталось\s*:/i.test(uniqueObjectives[0]))throw new Error(`Objective unstable: ${JSON.stringify(uniqueObjectives)}`);
if(uniqueTitles.length!==1||!/v16\.8\.3/i.test(uniqueTitles[0]))throw new Error(`Title unstable: ${JSON.stringify(uniqueTitles)}`);
if(uniqueHrefs.length!==1||!uniqueHrefs[0].includes('build=187'))throw new Error(`URL unstable: ${JSON.stringify(uniqueHrefs)}`);
if(navigations.some(x=>!x.includes('build=187')))throw new Error(`Navigated to another build: ${JSON.stringify(navigations)}`);
if(exceptions.length)throw new Error(`Runtime exceptions: ${exceptions.join(' | ')}`);
console.log(JSON.stringify({ok:true,build:187,canvas,moved,produced,recovered,objective:uniqueObjectives[0],title:uniqueTitles[0]}));
ws.close();
