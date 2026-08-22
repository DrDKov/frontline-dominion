import { chromium } from 'playwright';

const url=process.env.FD_GAME_URL||'http://127.0.0.1:8765/frontline-dominion/frontline-dominion.html?build=211';
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1});
const page=await context.newPage();const errors=[];
page.on('pageerror',e=>errors.push(String(e?.stack||e)));
page.on('console',m=>{if(m.type()==='error'&&!/favicon|404|audio|autoplay|Failed to load resource:.*503/i.test(m.text()))errors.push(`console:${m.text()}`);});
const waitFor=async(fn,arg=undefined,timeout=50000,interval=100)=>{const t=Date.now();let last=null;while(Date.now()-t<timeout){if(errors.length)throw new Error(`Browser error ${JSON.stringify(errors)}`);last=await page.evaluate(fn,arg);if(last&&!last.__pending)return last;await page.waitForTimeout(interval);}throw new Error(`Timed out ${timeout}ms last=${JSON.stringify(last)} errors=${JSON.stringify(errors)}`);};

const I={
  common:'e211101', manualSource:'e211102', alternate:'e211103', manualDest:'e211104', manualTruck:'e211105',
  resource:'e211110', extractor:'e211111', extractDest:'e211112', extractTruck:'e211113',
  autoDest:'e211120', autoTruck:'e211121', returnSource:'e211130', returnTruck:'e211131'
};

await page.goto(url,{waitUntil:'load',timeout:60000});
await waitFor(()=>{const b=document.getElementById('start-game');return b&&!b.disabled&&globalThis.__FD_LOGISTICS_INTEGRITY_211__&&globalThis.__FD_RUNTIME_SHELL_211__?.state?.installed?true:null;});
const installed=await page.evaluate(I=>{const D=globalThis.__FD_DEBUG__,L=globalThis.__FD_LOGISTICS206__,S=globalThis.__FD_SINGLEPLAYER_207__;if(!D?.Game||!L||!S)return false;const base=D.Game.prototype.initializeBattle;D.Game.prototype.initializeBattle=function(...args){const result=base.apply(this,args);this.teams.player.credits=500000;const B=(id,type,x,y)=>{const b=new D.Building(this,{id,typeId:type,team:'player',x,y,construction:1,rotation:0});this.addEntity(b);return b;};const U=(id,type,x,y)=>{const u=new D.Unit(this,{id,typeId:type,team:'player',x,y,rotation:0});this.addEntity(u);return u;};const fill=(b,ratio=1)=>{const n=L.ensureNode(b);for(const k of L.STOCK_KEYS)if(n?.stock)n.stock[k]=L.round(n.stock[`${k}Max`]*ratio);return n;};

const common=B(I.common,'logisticsHub',11800,11200);fill(common,1);
const manualSource=B(I.manualSource,'logisticsHub',12800,11200),ms=fill(manualSource,1);ms.stock.fuel=1200;
const alternate=B(I.alternate,'logisticsHub',12700,11200);fill(alternate,1);
const manualDest=B(I.manualDest,'resourceSilo',13300,11200),md=fill(manualDest,.80);md.stock.fuel=L.round(md.thresholds.target.fuel-300);md.stock.ammo=L.round(md.stock.ammoMax*.8);md.stock.support=L.round(md.stock.supportMax*.8);
const manualTruck=U(I.manualTruck,'resourceTruck',12850,11200),mts=L.ensureUnit(manualTruck,true);Object.assign(mts,{homeNodeId:I.manualSource,sourceNodeId:I.manualSource,missionType:'RETURN_TO_SOURCE',fuelMax:720,fuel:720});for(const k of L.STOCK_KEYS)mts.cargo[k]=0;manualTruck.commandQueue=[{type:'logistics206',missionType:'RETURN_TO_SOURCE'}];

const r=new D.ResourceNode(this,{id:I.resource,variant:'oil',x:12800,y:12350,amount:3000000,maxAmount:3000000,regenRate:0});this.addEntity(r);
const ex=B(I.extractor,'oilPump',12800,12350);ex.resourceNodeId=r.id;r.extractorBuildingId=ex.id;ex.resourceBuffer83=1800;S.normalizeWorld207(this);
const extractDest=B(I.extractDest,'resourceSilo',13400,12350),ed=fill(extractDest,.80);ed.stock.fuel=L.round(ed.stock.fuelMax*.80);
const extractTruck=U(I.extractTruck,'resourceTruck',12850,12350),ets=L.ensureUnit(extractTruck,true);Object.assign(ets,{homeNodeId:I.extractDest,sourceNodeId:I.extractor,missionType:'RETURN_TO_SOURCE',fuelMax:720,fuel:720});for(const k of L.STOCK_KEYS)ets.cargo[k]=0;extractTruck.commandQueue=[{type:'logistics206',missionType:'RETURN_TO_SOURCE'}];

const autoDest=B(I.autoDest,'barracks',12400,13400),ad=fill(autoDest,0);ad.priority='CRITICAL';
const autoTruck=U(I.autoTruck,'resourceTruck',11850,13400),ats=L.ensureUnit(autoTruck,true);Object.assign(ats,{homeNodeId:I.autoDest,sourceNodeId:null,destinationNodeId:null,missionType:'RETURN_TO_SOURCE',fuelMax:720,fuel:720});for(const k of L.STOCK_KEYS)ats.cargo[k]=0;autoTruck.commandQueue=[{type:'logistics206',missionType:'RETURN_TO_SOURCE'}];
const autoSource=B('e211122','logisticsHub',11800,13400);fill(autoSource,1);

const returnSource=B(I.returnSource,'logisticsHub',14100,13400);fill(returnSource,1);
const returnTruck=U(I.returnTruck,'resourceTruck',14650,13400),rts=L.ensureUnit(returnTruck,true);Object.assign(rts,{homeNodeId:I.returnSource,sourceNodeId:I.returnSource,missionType:'RETURN_TO_SOURCE',fuelMax:720,fuel:720});for(const k of L.STOCK_KEYS)rts.cargo[k]=0;rts.cargo.ammo=400;returnTruck.cargo=400;returnTruck.commandQueue=[{type:'logistics206',missionType:'RETURN_TO_SOURCE'}];
return result;};return true;},I);if(!installed)throw new Error('fixture install failed');
await page.locator('#start-game').click();
await waitFor(I=>{const g=globalThis.__FD_DEBUG__?.game,b=globalThis.__FD_STABLE_STATE165__?.bridge;return g?.getEntity?.(I.manualTruck)?.alive&&b?.ready&&!b.failed&&Number(b.workerTick)>12?{tick:b.workerTick}:null;},I,45000);
const send=async payload=>{const seq=await page.evaluate(p=>{const g=globalThis.__FD_DEBUG__.game,b=globalThis.__FD_STABLE_STATE165__.bridge,n=Number(b.seq||0);g.setLogisticsMission206(p);return Number(b.seq)>n?Number(b.seq):0;},payload);if(!seq)throw new Error(`mission route failed ${JSON.stringify(payload)}`);await waitFor(s=>Number(globalThis.__FD_STABLE_STATE165__?.bridge?.lastAck||0)>=s?true:null,seq,15000);};

// MANUAL_TRANSFER: explicit source must beat a closer, fuller alternate source.
const manualBefore=await page.evaluate(I=>{const g=globalThis.__FD_DEBUG__.game,L=globalThis.__FD_LOGISTICS206__,a=L.ensureNode(g.getEntity(I.manualSource)),d=L.ensureNode(g.getEntity(I.manualDest));return{source:a.stock.fuel,dest:d.stock.fuel,target:d.thresholds.target.fuel};},I);
await send({truckIds:[I.manualTruck],missionType:'MANUAL_TRANSFER',sourceNodeId:I.manualSource,destinationNodeId:I.manualDest});
const manual=await waitFor(({I,before})=>{const g=globalThis.__FD_DEBUG__.game,L=globalThis.__FD_LOGISTICS206__,a=L.ensureNode(g.getEntity(I.manualSource)),d=L.ensureNode(g.getEntity(I.manualDest)),t=g.getEntity(I.manualTruck)?.logistics206;if(d.stock.fuel>=before.target-1&&a.stock.fuel<before.source)return{source:a.stock.fuel,dest:d.stock.fuel,target:before.target,truckSource:t?.sourceNodeId,mission:t?.missionType,status:t?.status};return{__pending:true,source:a.stock.fuel,dest:d.stock.fuel,truckSource:t?.sourceNodeId,phase:t?.phase206,status:t?.status,cargo:{...t?.cargo}};},{I,before:manualBefore});
if(manual.truckSource!==I.manualSource||manual.mission!=='MANUAL_TRANSFER')throw new Error(`manual source authority failed ${JSON.stringify(manual)}`);

// EXTRACT_RESOURCE: extractor buffer -> truck -> explicitly selected node, physically conserved.
const extractBefore=await page.evaluate(I=>{const g=globalThis.__FD_DEBUG__.game,L=globalThis.__FD_LOGISTICS206__,e=g.getEntity(I.extractor),d=L.ensureNode(g.getEntity(I.extractDest));return{buffer:Number(e.resourceBuffer83),dest:Number(d.stock.fuel)};},I);
await send({truckIds:[I.extractTruck],missionType:'EXTRACT_RESOURCE',sourceNodeId:I.extractor,destinationNodeId:I.extractDest});
const extracted=await waitFor(({I,before})=>{const g=globalThis.__FD_DEBUG__.game,L=globalThis.__FD_LOGISTICS206__,e=g.getEntity(I.extractor),d=L.ensureNode(g.getEntity(I.extractDest)),t=g.getEntity(I.extractTruck)?.logistics206;if(Number(d.stock.fuel)>before.dest+100&&Number(e.resourceBuffer83)<before.buffer-100)return{buffer:Number(e.resourceBuffer83),dest:Number(d.stock.fuel),cargo:{...t?.cargo},mission:t?.missionType,status:t?.status};return{__pending:true,buffer:Number(e.resourceBuffer83),dest:Number(d.stock.fuel),cargo:{...t?.cargo},phase:t?.phase206,status:t?.status};},{I,before:extractBefore},55000);
const extractedDelta=extractBefore.buffer-extracted.buffer,destDelta=extracted.dest-extractBefore.dest,cargoFuel=Number(extracted.cargo.fuel||0);if(Math.abs(extractedDelta-(destDelta+cargoFuel))>5)throw new Error(`extract conservation failed ${JSON.stringify({extractBefore,extracted,extractedDelta,destDelta,cargoFuel})}`);

// RETURN_TO_SOURCE: physical return, no cargo teleport/unload side effect.
const returnBefore=await page.evaluate(I=>{const g=globalThis.__FD_DEBUG__.game,t=g.getEntity(I.returnTruck),s=t.logistics206;return{x:t.x,y:t.y,cargo:{...s.cargo}};},I);
await send({truckIds:[I.returnTruck],missionType:'RETURN_TO_SOURCE',sourceNodeId:I.returnSource});
const returned=await waitFor(I=>{const g=globalThis.__FD_DEBUG__.game,t=g.getEntity(I.returnTruck),src=g.getEntity(I.returnSource),s=t?.logistics206,d=Math.hypot((t?.x||0)-(src?.x||0),(t?.y||0)-(src?.y||0));if(d<120&&s?.status==='WAITING')return{distance:d,cargo:{...s.cargo},status:s.status,mission:s.missionType};return{__pending:true,distance:d,cargo:{...s?.cargo},status:s?.status,phase:s?.phase206};},I,40000);
if(returned.cargo.ammo!==returnBefore.cargo.ammo)throw new Error(`return mission teleported cargo ${JSON.stringify({returnBefore,returned})}`);

// AUTO: remain AUTO and autonomously replenish the only below-target logistics node.
const autoBefore=await page.evaluate(I=>{const g=globalThis.__FD_DEBUG__.game,L=globalThis.__FD_LOGISTICS206__,n=L.ensureNode(g.getEntity(I.autoDest));return{fuel:n.stock.fuel,ammo:n.stock.ammo,support:n.stock.support};},I);
await send({truckIds:[I.autoTruck],missionType:'AUTO',homeNodeId:I.autoDest});
const auto=await waitFor(({I,before})=>{const g=globalThis.__FD_DEBUG__.game,L=globalThis.__FD_LOGISTICS206__,n=L.ensureNode(g.getEntity(I.autoDest)),s=g.getEntity(I.autoTruck)?.logistics206;const now=Number(n.stock.fuel)+Number(n.stock.ammo)+Number(n.stock.support),base=Number(before.fuel)+Number(before.ammo)+Number(before.support);if(now>base+100)return{stock:{fuel:n.stock.fuel,ammo:n.stock.ammo,support:n.stock.support},mission:s?.missionType,destination:s?.destinationNodeId,status:s?.status,phase:s?.phase206};return{__pending:true,stock:{fuel:n.stock.fuel,ammo:n.stock.ammo,support:n.stock.support},mission:s?.missionType,destination:s?.destinationNodeId,status:s?.status,phase:s?.phase206,cargo:{...s?.cargo}};},{I,before:autoBefore},60000);
if(auto.mission!=='AUTO'||auto.destination!==I.autoDest)throw new Error(`AUTO mission mutated or wrong destination ${JSON.stringify(auto)}`);

const final=await page.evaluate(()=>{const b=globalThis.__FD_STABLE_STATE165__.bridge;return{marker:globalThis.__FD_LOGISTICS_INTEGRITY_211__,bridge:{ready:b.ready,failed:b.failed,tick:b.workerTick,recoveries:Number(b.recoveryAttempts201||0),error:b.lastError||null}};});
if(!final.marker?.manualSourceAuthoritative||!final.marker?.autoNodeSustainment)throw new Error(`integrity marker incomplete ${JSON.stringify(final.marker)}`);if(final.bridge.failed||final.bridge.recoveries)throw new Error(`bridge unhealthy ${JSON.stringify(final.bridge)}`);if(errors.length)throw new Error(`browser errors ${JSON.stringify(errors)}`);
console.log(JSON.stringify({ok:true,manualBefore,manual,extractBefore,extracted,returnBefore,returned,autoBefore,auto,final},null,2));
await browser.close();
