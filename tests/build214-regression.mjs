import { chromium } from 'playwright';

const url=process.env.FD_GAME_URL||'http://127.0.0.1:8765/frontline-dominion/frontline-dominion.html?build=214';
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1});
const page=await context.newPage();
const errors=[];
page.on('pageerror',e=>errors.push(String(e?.stack||e)));
page.on('console',m=>{if(m.type()==='error'&&!/favicon|404|audio|autoplay|Failed to load resource:.*503/i.test(m.text()))errors.push(`console:${m.text()}`);});
const waitFor=async(fn,arg=undefined,timeout=60000,interval=100)=>{const started=Date.now();let last=null;while(Date.now()-started<timeout){if(errors.length)throw new Error(`browser errors ${JSON.stringify(errors)}`);last=await page.evaluate(fn,arg);if(last&&!last.__pending)return last;await page.waitForTimeout(interval);}throw new Error(`Timed out ${timeout}ms; last=${JSON.stringify(last)}; errors=${JSON.stringify(errors)}`);};

const I={ground:'fd214_ground_transport',groundPassenger:'fd214_ground_passenger',groundTarget:'fd214_ground_target',air:'fd214_air_transport',airPassenger:'fd214_air_passenger',airTarget:'fd214_air_target',storage:'fd214_ai_storage',extractor:'fd214_ai_extractor',trucks:['fd214_ai_truck_1','fd214_ai_truck_2','fd214_ai_truck_3']};

await page.goto(url,{waitUntil:'load',timeout:60000});
await waitFor(()=>{const b=document.getElementById('start-game');return b&&!b.disabled&&globalThis.__FD_RUNTIME_SHELL_214__?.state?.installed&&globalThis.__FD_SAVE_SLOTS_214__?.state?.ready&&globalThis.__FD_TRANSPORT_FIRE_214__?.build===214&&globalThis.__FD_AI_ECONOMY_LOGISTICS_214__?.build===214&&globalThis.__FD_EXTRACTOR_VISIBILITY_HAUL_213__?true:null;},undefined,45000);

const installed=await page.evaluate(I=>{
  const D=globalThis.__FD_DEBUG__,L=globalThis.__FD_LOGISTICS206__;if(!D?.Game||!D?.Unit||!D?.Building||!L)return{ok:false};
  const base=D.Game.prototype.initializeBattle;
  D.Game.prototype.initializeBattle=function(...args){
    const result=base.apply(this,args);
    const U=(id,typeId,team,x,y)=>{const u=new D.Unit(this,{id,typeId,team,x,y,rotation:0});this.addEntity(u);return u;};
    const B=(id,typeId,team,x,y)=>{const b=new D.Building(this,{id,typeId,team,x,y,construction:1,rotation:0});this.addEntity(b);return b;};
    const gx=12600,gy=9300;
    const ground=U(I.ground,'armoredTransport','player',gx,gy),gp=U(I.groundPassenger,'rifle','player',gx+28,gy),gt=U(I.groundTarget,D.UNIT_TYPES?.tank?'tank':'rifle','enemy',gx+150,gy);
    const ax=12600,ay=10800;
    const air=U(I.air,'transportHelicopter','player',ax,ay),ap=U(I.airPassenger,'rifle','player',ax+28,ay),at=U(I.airTarget,D.UNIT_TYPES?.tank?'tank':'rifle','enemy',ax+150,ay);
    if(typeof this.loadIntoTransport78!=='function')throw new Error('transport API missing');
    if(this.loadIntoTransport78(ground,[gp])!==1)throw new Error('ground embark failed');
    if(this.loadIntoTransport78(air,[ap])!==1)throw new Error('air embark failed');
    gp.weaponCooldown=0;ap.weaponCooldown=0;

    const baseX=(this.enemyBase?.x||27000)-900,baseY=(this.enemyBase?.y||11000)+900;
    const storage=B(I.storage,'logisticsHub','enemy',baseX+700,baseY),node=L.ensureNode(storage);for(const k of L.STOCK_KEYS)if(node?.stock)node.stock[k]=0;
    const extractor=B(I.extractor,'oilPump','enemy',baseX,baseY),ex=L.ensureExtractor(extractor);extractor.resourceBuffer83=Math.max(15000,Number(extractor.stats?.bufferCapacity||18000)*.92);extractor.resourceBufferMax206=Math.max(Number(extractor.resourceBufferMax206)||0,Number(extractor.stats?.bufferCapacity)||18000);
    // Make the fixture the unique urgent extraction backlog; this tests the
    // dispatch logic rather than map-generation luck.
    for(const b of this.buildings){if(b!==extractor&&b.team==='enemy'&&L.ensureExtractor(b))b.resourceBuffer83=0;}
    I.trucks.forEach((id,index)=>{const t=U(id,'resourceTruck','enemy',baseX+180+index*65,baseY+180),s=L.ensureUnit(t,true);Object.assign(s,{fuelMax:720,fuel:720,missionType:'AUTO',phase206:'PLAN',homeNodeId:I.storage,sourceNodeId:null,destinationNodeId:null,status:'WAITING_DEMAND'});for(const k of L.STOCK_KEYS)s.cargo[k]=0;const cmd={type:'logistics206',missionType:'AUTO'};if(typeof t.setCommand==='function')t.setCommand(cmd,false);else t.commandQueue=[cmd];});
    globalThis.__FD214_FIXTURE__={groundTargetStartHp:gt.hp,airTargetStartHp:at.hp,extractorStart:extractor.resourceBuffer83};
    return result;
  };
  return{ok:true};
},I);
if(!installed.ok)throw new Error('fixture install failed');

await page.locator('#start-game').click();
await waitFor(I=>{const g=globalThis.__FD_DEBUG__?.game,b=globalThis.__FD_STABLE_STATE165__?.bridge;return g?.getEntity?.(I.groundPassenger)?.embarkedIn===I.ground&&g?.getEntity?.(I.airPassenger)?.embarkedIn===I.air&&g?.getEntity?.(I.extractor)?.alive&&b?.ready&&!b.failed&&Number(b.workerTick)>12?{tick:b.workerTick}:{__pending:true,tick:Number(b?.workerTick||0),failed:Boolean(b?.failed),error:b?.lastError||null};},I,50000);

const passengerFire=await waitFor(I=>{
  const g=globalThis.__FD_DEBUG__.game,gp=g.getEntity(I.groundPassenger),ap=g.getEntity(I.airPassenger),gt=g.getEntity(I.groundTarget),at=g.getEntity(I.airTarget),ground=g.getEntity(I.ground),air=g.getEntity(I.air);
  const out={ground:{embarked:gp?.embarkedIn,shots:Number(gp?._embarkedShots214||0),lastShot:Number(gp?.lastShotAt||0),targetHp:Number(gt?.hp||0),transportShots:Number(ground?._passengerShots214||0)},air:{embarked:ap?.embarkedIn,shots:Number(ap?._embarkedShots214||0),lastShot:Number(ap?.lastShotAt||0),targetHp:Number(at?.hp||0),transportShots:Number(air?._passengerShots214||0)}};
  return out.ground.shots>0?out:{__pending:true,...out};
},I,20000);
if(passengerFire.ground.embarked!==I.ground)throw new Error(`ground passenger disembarked ${JSON.stringify(passengerFire)}`);
if(passengerFire.air.embarked!==I.air)throw new Error(`air passenger disembarked ${JSON.stringify(passengerFire)}`);
if(passengerFire.air.shots!==0||passengerFire.air.transportShots!==0)throw new Error(`aviation passenger fired ${JSON.stringify(passengerFire.air)}`);

const reserveIsolation=await page.evaluate(I=>{
  const g=globalThis.__FD_DEBUG__.game,api=globalThis.__FD_AI_ECONOMY_LOGISTICS_214__,ex=g.getEntity(I.extractor);const before=api.usableReserve214(g,'enemy');const original=ex.resourceBuffer83;ex.resourceBuffer83=original+777;const after=api.usableReserve214(g,'enemy');ex.resourceBuffer83=original;return{before,after,unchanged:JSON.stringify(before)===JSON.stringify(after)};
},I);
if(!reserveIsolation.unchanged)throw new Error(`extractor buffer leaked into usable reserve ${JSON.stringify(reserveIsolation)}`);

const aiDispatch=await waitFor(I=>{
  const g=globalThis.__FD_DEBUG__.game,L=globalThis.__FD_LOGISTICS206__,ex=g.getEntity(I.extractor),storage=L.ensureNode(g.getEntity(I.storage)),trucks=I.trucks.map(id=>{const u=g.getEntity(id),s=L.ensureUnit(u,false);return{id,mission:s?.missionType,source:s?.sourceNodeId||null,destination:s?.destinationNodeId||null,status:s?.status,phase:s?.phase206,cargo:{...s?.cargo}};});
  const hauler=trucks.find(t=>t.mission==='EXTRACT_RESOURCE'&&t.source===I.extractor);const stored=Number(storage?.stock?.fuel||0);const buffer=Number(ex?.resourceBuffer83||0);return hauler?{hauler,trucks,stored,buffer}:{__pending:true,trucks,stored,buffer,tick:Number(globalThis.__FD_STABLE_STATE165__?.bridge?.workerTick||0)};
},I,35000);

const aiDelivery=await waitFor(I=>{
  const g=globalThis.__FD_DEBUG__.game,L=globalThis.__FD_LOGISTICS206__,ex=g.getEntity(I.extractor),n=L.ensureNode(g.getEntity(I.storage));const stored=Number(n?.stock?.fuel||0),buffer=Number(ex?.resourceBuffer83||0);return stored>60?{stored,buffer}:{__pending:true,stored,buffer};
},I,45000);

const beforeSave=await page.evaluate(I=>{const g=globalThis.__FD_DEBUG__.game,p=g.getEntity(I.groundPassenger);return{shots:Number(p?._embarkedShots214||0),embarked:p?.embarkedIn};},I);
const save=await page.evaluate(async()=>{const r=await globalThis.__FD_SAVE_SLOTS_214__.saveNamed('Build 214 embarked fire');return{id:r.id};});
const load=await page.evaluate(async id=>{try{const r=await globalThis.__FD_SAVE_SLOTS_214__.loadSlot(id);return{ok:true,id:r.id};}catch(e){return{ok:false,error:String(e?.stack||e)};}},save.id);
if(!load.ok)throw new Error(`build214 save load failed ${JSON.stringify(load)}`);
const postLoad=await waitFor(({I,saveId,beforeShots})=>{
  const g=globalThis.__FD_DEBUG__?.game,p=g?.getEntity?.(I.groundPassenger),b=globalThis.__FD_STABLE_STATE165__?.bridge,slots=globalThis.__FD_SAVE_SLOTS_214__;const out={shots:Number(p?._embarkedShots214||0),embarked:p?.embarkedIn,lastLoadedId:slots?.state?.lastLoadedId||null,tick:Number(b?.workerTick||0),failed:Boolean(b?.failed)};return out.embarked===I.ground&&out.lastLoadedId===saveId&&out.shots>=beforeShots&&b?.ready&&!b.failed&&out.tick>5?out:{__pending:true,...out};
},{I,saveId:save.id,beforeShots:beforeSave.shots},60000);

const final=await page.evaluate(()=>({transport:globalThis.__FD_TRANSPORT_FIRE_214__,ai:globalThis.__FD_AI_ECONOMY_LOGISTICS_214__,aiPriority:globalThis.__FD_AI_EXTRACTION_PRIORITY_214__,fog:globalThis.__FD_EXTRACTOR_VISIBILITY_HAUL_213__,dock:globalThis.__FD_TRUCK_DOCK_HOTFIX_213__,bridge:{ready:Boolean(globalThis.__FD_STABLE_STATE165__?.bridge?.ready),failed:Boolean(globalThis.__FD_STABLE_STATE165__?.bridge?.failed),tick:Number(globalThis.__FD_STABLE_STATE165__?.bridge?.workerTick||0),recoveries:Number(globalThis.__FD_STABLE_STATE165__?.bridge?.recoveryAttempts201||0)}}));
if(!final.transport?.groundPassengersFire||!final.transport?.aviationExcluded||!final.ai?.extractionHauling||!final.ai?.storedReservePlanning||!final.aiPriority?.saturatedExtractorCanPreemptSupplyTruck)throw new Error(`build214 markers incomplete ${JSON.stringify(final)}`);
if(final.bridge.failed||final.bridge.recoveries)throw new Error(`authoritative bridge unhealthy ${JSON.stringify(final.bridge)}`);
if(errors.length)throw new Error(`browser errors ${JSON.stringify(errors)}`);
console.log(JSON.stringify({ok:true,passengerFire,reserveIsolation,aiDispatch,aiDelivery,beforeSave,save,load,postLoad,final},null,2));
await browser.close();
