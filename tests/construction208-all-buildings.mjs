import { chromium } from 'playwright';

const url=process.env.FD_GAME_URL||'http://127.0.0.1:8765/frontline-dominion/frontline-dominion.html?build=208';
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1});
const page=await context.newPage();
const errors=[];
page.on('pageerror',e=>errors.push(String(e?.stack||e)));
page.on('console',m=>{if(m.type()==='error'&&!/favicon|404|audio|autoplay|Failed to load resource:.*503/i.test(m.text()))errors.push(`console:${m.text()}`);});
const waitFor=async(fn,arg=undefined,timeout=30000,interval=100)=>{const start=Date.now();let last=null;while(Date.now()-start<timeout){last=await page.evaluate(fn,arg);if(last)return last;await page.waitForTimeout(interval);}throw new Error(`Timed out ${timeout}ms; last=${JSON.stringify(last)}`);};

await page.goto(url,{waitUntil:'load',timeout:60000});
await waitFor(()=>{const b=document.getElementById('start-game');return b&&!b.disabled&&globalThis.__FD_GAMEPLAY_208__&&globalThis.__FD_RUNTIME_SHELL_208__?.state?.installed?true:null;});
const plan=await page.evaluate(()=>{
  const D=globalThis.__FD_DEBUG__;
  const typeIds=[...new Set(Object.values(D.BUILD_CATEGORIES||{}).flatMap(c=>Array.isArray(c?.types)?c.types:[]))].filter(id=>D.BUILDING_TYPES?.[id]);
  if(!typeIds.includes('financialCenter'))typeIds.push('financialCenter');
  typeIds.sort();
  const base=D.Game.prototype.initializeBattle;
  D.Game.prototype.initializeBattle=function(...args){
    const result=base.apply(this,args);this.teams.player.credits=2_000_000;
    const fixtures=[];const cols=10,spacingX=720,spacingY=720,startX=14200,startY=2800;
    typeIds.forEach((typeId,index)=>{
      const col=index%cols,row=Math.floor(index/cols),x=startX+col*spacingX,y=startY+row*spacingY;
      const b=new D.Building(this,{id:`fd208-build-${index}`,typeId,team:'player',x,y,construction:.12,autoConstruct:false,rotation:0});b.autoConstruct=false;this.addEntity(b);
      const u=new D.Unit(this,{id:`fd208-builder-${index}`,typeId:'worker',team:'player',x:x+(Number(b.radius)||40)+24,y,rotation:Math.PI});u.commandQueue=[{type:'hold',fixture208:true}];this.addEntity(u);
      fixtures.push({typeId,buildingId:b.id,workerId:u.id,initial:b.construction});
    });
    const ix=26200,iy=17600;
    const autoB=new D.Building(this,{id:'fd208-auto-financial',typeId:'financialCenter',team:'player',x:ix,y:iy,construction:.14,autoConstruct:false,rotation:0});autoB.autoConstruct=false;this.addEntity(autoB);
    const autoU=new D.Unit(this,{id:'fd208-auto-builder',typeId:'worker',team:'player',x:ix+(Number(autoB.radius)||40)+24,y:iy,rotation:Math.PI});autoU.commandQueue=[];this.addEntity(autoU);
    this.__fdConstructionFixtures208=fixtures;
    return result;
  };
  return{count:typeIds.length,typeIds};
});
if(plan.count<20)throw new Error(`Unexpectedly small building catalog: ${JSON.stringify(plan)}`);
await page.locator('#start-game').click();
const ready=await waitFor(()=>{const g=globalThis.__FD_DEBUG__?.game,b=globalThis.__FD_STABLE_STATE165__?.bridge;return g&&b?.ready&&!b.failed&&Number(b.workerTick)>12&&g.getEntity('fd208-build-0')?{tick:Number(b.workerTick),recoveries:Number(b.recoveryAttempts201||0)}:null;},undefined,45000);

const directOrders=await page.evaluate(()=>{
  const g=globalThis.__FD_DEBUG__.game,b=globalThis.__FD_STABLE_STATE165__.bridge;
  const pairs=[];let failures=[];let finalSeq=Number(b.seq||0);
  for(let index=0;index<500;index++){
    const building=g.getEntity(`fd208-build-${index}`),worker=g.getEntity(`fd208-builder-${index}`);if(!building||!worker)break;
    const before=Number(b.seq||0);g.setSelection([worker],false);const issued=g.issueContext(building.x,building.y,false);const after=Number(b.seq||0);
    pairs.push({index,typeId:building.typeId,buildingId:building.id,workerId:worker.id,initial:Number(building.construction),issued:Boolean(issued),before,after});
    if(issued===false||after<=before)failures.push({index,typeId:building.typeId,issued, before,after});
    finalSeq=Math.max(finalSeq,after);
  }
  return{pairs,failures,finalSeq};
});
if(directOrders.pairs.length!==plan.count)throw new Error(`Fixture count mismatch: planned=${plan.count} actual=${directOrders.pairs.length}`);
if(directOrders.failures.length)throw new Error(`Some build context orders did not enter Worker: ${JSON.stringify(directOrders.failures)}`);
await waitFor(seq=>Number(globalThis.__FD_STABLE_STATE165__?.bridge?.lastAck||0)>=seq,directOrders.finalSeq,30000);

const progress=await waitFor(pairs=>{const g=globalThis.__FD_DEBUG__.game;const rows=pairs.map(p=>{const b=g.getEntity(p.buildingId),u=g.getEntity(p.workerId);return{typeId:p.typeId,id:p.buildingId,initial:p.initial,construction:Number(b?.construction)||0,completed:Boolean(b?.completed),alive:Boolean(b?.alive),workerAlive:Boolean(u?.alive),command:u?.currentCommand?.type||null,target:u?.currentCommand?.buildingId||u?.currentCommand?.targetId||null};});const progressed=rows.filter(r=>r.construction>r.initial+.002||r.completed);return progressed.length===rows.length?rows:null;},directOrders.pairs,30000,150);

const financial=progress.find(r=>r.typeId==='financialCenter');if(!financial||financial.construction<=financial.initial)throw new Error(`Financial center did not build: ${JSON.stringify(financial)}`);

// Historical engineer initiative remains active independently of resource hauling.
const initiative=await waitFor(()=>{const g=globalThis.__FD_DEBUG__.game,b=g.getEntity('fd208-auto-financial'),u=g.getEntity('fd208-auto-builder');return Number(b?.construction)>.145?{construction:Number(b.construction),command:u?.currentCommand?.type||null,target:u?.currentCommand?.buildingId||u?.currentCommand?.targetId||null}:null;},undefined,15000);

const bad=progress.filter(r=>!r.alive||!r.workerAlive||(!(r.construction>r.initial+.002)&&!r.completed));
if(bad.length)throw new Error(`Construction failures: ${JSON.stringify(bad)}`);
const finalState=await page.evaluate(()=>{const b=globalThis.__FD_STABLE_STATE165__.bridge;return{ready:b.ready,failed:b.failed,tick:Number(b.workerTick),recoveries:Number(b.recoveryAttempts201||0),lastError:b.lastError||null,initiativePreserved:Boolean(globalThis.__FD_GAMEPLAY_208__?.initiativePreserved)};});
if(!finalState.ready||finalState.failed||finalState.recoveries!==ready.recoveries||!finalState.initiativePreserved)throw new Error(`Worker unstable after construction matrix: ${JSON.stringify(finalState)}`);
if(errors.length)throw new Error(`Browser errors: ${JSON.stringify(errors)}`);
console.log(JSON.stringify({ok:true,buildingTypes:plan.count,financial,initiative,progressed:progress.length,finalState}));
await context.close();await browser.close();
