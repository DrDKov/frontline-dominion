import { chromium } from 'playwright';
import { gameUrl } from './lib/fd-env.mjs';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport:{ width:1360, height:820 }, deviceScaleFactor:1 });
const page = await context.newPage();
const errors=[];
page.on('pageerror',e=>errors.push(String(e?.stack||e)));
page.on('console',m=>{if(m.type()==='error'&&!/favicon|404|audio|autoplay|Failed to load resource/i.test(m.text()))errors.push(`console:${m.text()}`);});
const waitFor=async(fn,arg=undefined,timeout=30000,interval=80)=>{const t=Date.now();let last=null;while(Date.now()-t<timeout){if(errors.length)throw new Error(`Browser errors ${JSON.stringify(errors)}`);last=await page.evaluate(fn,arg);if(last&&!last.__pending)return last;await page.waitForTimeout(interval);}throw new Error(`Timed out ${timeout} ms; last=${JSON.stringify(last)}`);};

await page.goto(gameUrl(),{waitUntil:'load',timeout:60000});
await waitFor(()=>{const b=document.getElementById('start-game');return b&&!b.disabled&&globalThis.__FD_DEBUG__?.Game?true:null;});
await page.locator('#start-game').click();
const ready=await waitFor(()=>{const g=globalThis.__FD_DEBUG__?.game,b=globalThis.__FD_STABLE_STATE165__?.bridge;return g&&b?.ready&&!b.failed&&Number(b.workerTick)>10?{tick:Number(b.workerTick),seq:Number(b.seq||0),errors:Number(b.actionErrors||0),recoveries:Number(b.recoveryAttempts201||0)}:{__pending:true,tick:Number(b?.workerTick||0),failed:Boolean(b?.failed),error:b?.lastError||null};});

const issued=await page.evaluate(()=>{const D=globalThis.__FD_DEBUG__,g=D.game,b=globalThis.__FD_STABLE_STATE165__.bridge;const u=(g.units||[]).find(x=>x?.alive&&x.team==='player'&&!x.embarkedIn&&!x.air);if(!u)return{error:'movable-unit-missing'};g.setSelection([u],false);const before={x:u.x,y:u.y,seq:Number(b.seq||0),ack:Number(b.lastAck||0),errors:Number(b.actionErrors||0)};const target={x:Math.max(120,Math.min(D.WORLD.width-120,u.x+360)),y:Math.max(120,Math.min(D.WORLD.height-120,u.y+120))};const ok=g.issueMove(target.x,target.y,false);return{id:u.id,before,target,ok,sentSeq:Number(b.seq||0)};});
if(issued.error||!issued.ok||issued.sentSeq<=issued.before.seq)throw new Error(`Authoritative move not routed ${JSON.stringify(issued)}`);

const applied=await waitFor(expected=>{const g=globalThis.__FD_DEBUG__?.game,b=globalThis.__FD_STABLE_STATE165__?.bridge,u=g?.getEntity?.(expected.id);if(!u||Number(b?.lastAck||0)<expected.sentSeq||Math.hypot(u.x-expected.before.x,u.y-expected.before.y)<3)return{__pending:true,ack:Number(b?.lastAck||0),tick:Number(b?.workerTick||0),x:u?.x,y:u?.y};return{ack:Number(b.lastAck),tick:Number(b.workerTick),distance:Math.hypot(u.x-expected.before.x,u.y-expected.before.y),errors:Number(b.actionErrors||0),recoveries:Number(b.recoveryAttempts201||0),failed:Boolean(b.failed)};},issued,12000);
if(applied.failed||applied.errors!==issued.before.errors||applied.recoveries!==ready.recoveries)throw new Error(`Authoritative bridge unhealthy ${JSON.stringify({ready,issued,applied})}`);
console.log(JSON.stringify({ok:true,ready,issued,applied}));
await context.close();await browser.close();
