import process from 'node:process';

const port = process.env.FD_DEBUG_PORT || '9222';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let targets = [];
for (let attempt = 0; attempt < 80; attempt += 1) {
  try {
    targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
    if (targets.length) break;
  } catch {}
  await sleep(100);
}
const target = targets.find(item => item.type === 'page' && item.url.includes('frontline-dominion')) || targets.find(item => item.type === 'page');
if (!target?.webSocketDebuggerUrl) throw new Error('No Chromium target for real-input test');

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
let sequence = 1;
const pending = new Map();
const exceptions = [];
ws.onmessage = event => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    const handler = pending.get(message.id);
    pending.delete(message.id);
    message.error ? handler.reject(new Error(JSON.stringify(message.error))) : handler.resolve(message.result);
  } else if (message.method === 'Runtime.exceptionThrown') {
    exceptions.push(message.params?.exceptionDetails?.exception?.description || message.params?.exceptionDetails?.text || 'Runtime exception');
  }
};
const call = (method, params = {}) => new Promise((resolve, reject) => {
  const id = sequence++;
  pending.set(id, { resolve, reject });
  ws.send(JSON.stringify({ id, method, params }));
});
async function evaluate(expression) {
  const response = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text || 'Evaluation failed');
  return response.result?.value;
}

await call('Runtime.enable');
for (let attempt = 0; attempt < 100; attempt += 1) {
  const ready = await evaluate(`(()=>{const g=window.__FD_DEBUG__?.game,b=window.__FD_STABLE_STATE165__?.bridge,i=window.__FD_COMMAND_INPUT_190__;return!!g&&Number(b?.workerTick||0)>0&&!b?.failed&&!!i?.diagnostics?.().installed;})()`);
  if (ready) break;
  await sleep(80);
}

const prepared = await evaluate(`(()=>{
  const g=window.__FD_DEBUG__?.game;
  const bridge=window.__FD_STABLE_STATE165__?.bridge;
  const input=window.__FD_COMMAND_INPUT_190__;
  const canvas=document.getElementById('game-canvas');
  if(!g||!bridge||!input||!canvas)return{error:'runtime unavailable'};
  const unit=g.units.find(u=>u?.alive&&u.team==='player'&&u.kind==='unit'&&!u.air&&!u.embarkedIn);
  if(!unit)return{error:'no player ground unit'};
  for(const entity of g.selected||[])entity.selected=false;
  g.selected=[];
  g.centerCamera?.(unit.x,unit.y);
  if(g.camera){g.camera.x=unit.x;g.camera.y=unit.y;g.camera.zoom=Math.max(.9,Number(g.camera.zoom)||1);}
  const candidates=[[260,0],[0,260],[-260,0],[0,-260],[220,130],[220,-130],[-220,130],[-220,-130]];
  let target=null;
  for(const [dx,dy] of candidates){
    const x=unit.x+dx,y=unit.y+dy;
    if(x<50||y<50||x>(window.__FD_DEBUG__.WORLD?.width||32000)-50||y>(window.__FD_DEBUG__.WORLD?.height||22000)-50)continue;
    let blocked=false;
    try{blocked=!!g.findBuildingCollision?.(x,y,(unit.radius||6)+12);}catch(_){}
    if(!blocked){target={x,y};break;}
  }
  if(!target)return{error:'no clear target'};
  const rect=canvas.getBoundingClientRect();
  const client=screen=>({x:rect.left+screen.x*rect.width/Math.max(1,canvas.width),y:rect.top+screen.y*rect.height/Math.max(1,canvas.height)});
  const bounds=g.getUnitScreenBounds116?.(unit)||g.getInfantryScreenBounds138?.(unit);
  const unitScreen=bounds?{x:(bounds.x1+bounds.x2)/2,y:(bounds.y1+bounds.y2)/2}:g.worldToScreen(unit.x,unit.y,0);
  const targetScreen=g.worldToScreen(target.x,target.y,0);
  return{
    id:unit.id,
    before:{x:unit.x,y:unit.y,seq:bridge.seq,ack:bridge.lastAck,routed:input.diagnostics().routed},
    unitClient:client(unitScreen),
    targetClient:client(targetScreen),
    target,
  };
})()`);
if (prepared.error) throw new Error(`Real input setup failed: ${JSON.stringify(prepared)}`);

const mouse = async (type, point, button) => call('Input.dispatchMouseEvent', {
  type,
  x: point.x,
  y: point.y,
  button,
  buttons: type === 'mousePressed' ? (button === 'right' ? 2 : 1) : 0,
  clickCount: 1,
});

await mouse('mousePressed', prepared.unitClient, 'left');
await mouse('mouseReleased', prepared.unitClient, 'left');
await sleep(160);
const selected = await evaluate(`(()=>{const g=window.__FD_DEBUG__.game;return{ids:(g.selected||[]).map(x=>x.id),primary:g.getPrimarySelection?.()?.id||null};})()`);
if (!selected.ids.includes(prepared.id)) throw new Error(`Actual left click did not select unit: ${JSON.stringify({prepared,selected})}`);

await mouse('mousePressed', prepared.targetClient, 'right');
await mouse('mouseReleased', prepared.targetClient, 'right');
await sleep(180);
const routed = await evaluate(`(()=>{const b=window.__FD_STABLE_STATE165__.bridge,d=window.__FD_COMMAND_INPUT_190__.diagnostics();return{seq:b.seq,ack:b.lastAck,errors:b.actionErrors,failed:b.failed,diagnostics:d};})()`);
if (routed.seq <= prepared.before.seq || routed.diagnostics.routed <= prepared.before.routed || routed.diagnostics.errors) {
  throw new Error(`Actual right click was not routed: ${JSON.stringify({prepared,selected,routed})}`);
}

let moved = null;
for (let attempt = 0; attempt < 90; attempt += 1) {
  moved = await evaluate(`(()=>{const g=window.__FD_DEBUG__.game,b=window.__FD_STABLE_STATE165__.bridge,u=g.getEntity(${JSON.stringify(prepared.id)}),d=window.__FD_COMMAND_INPUT_190__.diagnostics();return{x:u?.x||0,y:u?.y||0,ack:b.lastAck,seq:b.seq,errors:b.actionErrors,failed:b.failed,tick:b.workerTick,diagnostics:d};})()`);
  if (moved.ack >= routed.seq && Math.hypot(moved.x-prepared.before.x,moved.y-prepared.before.y)>3) break;
  await sleep(70);
}
const distance = Math.hypot(moved.x - prepared.before.x, moved.y - prepared.before.y);
console.log('CHROMIUM190_REAL_INPUT ' + JSON.stringify({ prepared, selected, routed, moved, distance }));
if (moved.ack < routed.seq || moved.errors || moved.failed || distance <= 3) {
  throw new Error(`Actual canvas command failed: ${JSON.stringify({prepared,selected,routed,moved,distance})}`);
}
if (exceptions.length) throw new Error(`Runtime exceptions during real input test: ${exceptions.join(' | ')}`);
console.log(JSON.stringify({ ok: true, build: 190, unitId: prepared.id, source: moved.diagnostics.lastSource, distance, ack: moved.ack }));
ws.close();
