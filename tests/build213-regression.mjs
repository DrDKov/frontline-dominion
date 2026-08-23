import { chromium } from 'playwright';

const url = process.env.FD_GAME_URL || 'http://127.0.0.1:8765/frontline-dominion/frontline-dominion.html?build=213';
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const page = await context.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e?.stack || e)));
page.on('console', m => {
  if (m.type() === 'error' && !/favicon|404|audio|autoplay|Failed to load resource:.*503/i.test(m.text())) errors.push(`console:${m.text()}`);
});

const waitFor = async (fn, arg = undefined, timeout = 60000, interval = 100) => {
  const started = Date.now(); let last = null;
  while (Date.now() - started < timeout) {
    if (errors.length) throw new Error(`Browser error: ${JSON.stringify(errors)}`);
    last = await page.evaluate(fn, arg);
    if (last && !last.__pending) return last;
    await page.waitForTimeout(interval);
  }
  throw new Error(`Timed out ${timeout}ms; last=${JSON.stringify(last)}; errors=${JSON.stringify(errors)}`);
};

const I = {
  storage: 'e213001', truck: 'e213002',
  extractorIds: ['e213010','e213011','e213012','e213013','e213014','e213015','e213016'],
};

await page.goto(url, { waitUntil: 'load', timeout: 60000 });
await waitFor(() => {
  const start = document.getElementById('start-game');
  return start && !start.disabled &&
    globalThis.__FD_RUNTIME_SHELL_213__?.state?.installed &&
    globalThis.__FD_SAVE_SLOTS_213__?.state?.ready &&
    globalThis.__FD_EXTRACTOR_VISIBILITY_HAUL_213__?.build === 213 &&
    globalThis.__FD_LOGISTICS_INTEGRITY_213__?.externalBuildingDock
    ? true : null;
}, undefined, 45000);

const fixtureInstall = await page.evaluate(I => {
  const D=globalThis.__FD_DEBUG__,L=globalThis.__FD_LOGISTICS206__;
  if(!D?.Game||!D?.Building||!D?.Unit||!L)return {ok:false,reason:'debug/logistics missing'};
  const base=D.Game.prototype.initializeBattle;
  D.Game.prototype.initializeBattle=function(...args){
    const result=base.apply(this,args);
    const extractorTypes=['oilPump','gasPump','mineralQuarry','oreMine','deepMine','coreDrill','ironMine'].filter(id=>D.BUILDING_TYPES?.[id]);
    if(!extractorTypes.length||!D.BUILDING_TYPES?.logisticsHub)throw new Error(`extractor fixture types missing: ${extractorTypes.join(',')}`);
    const B=(id,typeId,x,y)=>{const b=new D.Building(this,{id,typeId,team:'player',x,y,construction:1,rotation:0});this.addEntity(b);return b;};
    const U=(id,typeId,x,y)=>{const u=new D.Unit(this,{id,typeId,team:'player',x,y,rotation:0});this.addEntity(u);return u;};
    const storage=B(I.storage,'logisticsHub',27400,18400),node=L.ensureNode(storage);
    for(const k of L.STOCK_KEYS)if(node?.stock)node.stock[k]=0;
    const ids=[];
    const positions=[];
    extractorTypes.forEach((typeId,index)=>{
      const id=I.extractorIds[index];
      const x=24500+(index%4)*560,y=16600+Math.floor(index/4)*650;
      const b=B(id,typeId,x,y);L.ensureExtractor(b);b.resourceBuffer83=index===0?6200:800+index*90;
      ids.push(id);positions.push({id,typeId,x,y});
    });
    const first=this.getEntity(ids[0]);
    const truck=U(I.truck,'resourceTruck',first.x+380,first.y+120),s=L.ensureUnit(truck,true);
    Object.assign(s,{fuelMax:720,fuel:720,missionType:'AUTO',homeNodeId:I.storage,sourceNodeId:null,destinationNodeId:null,phase206:'PLAN',waitUntil206:0});
    for(const k of L.STOCK_KEYS)s.cargo[k]=0;
    const command={type:'logistics206',missionType:'AUTO'};
    if(typeof truck.setCommand==='function')truck.setCommand(command,false);else{truck.commandQueue=[command];try{truck.currentCommand=command;}catch(_){}}
    globalThis.__FD213_FIXTURE__={extractorTypes,ids,positions};
    return result;
  };
  return {ok:true};
},I);
if(!fixtureInstall.ok)throw new Error(`fixture install failed ${JSON.stringify(fixtureInstall)}`);

await page.locator('#start-game').click();
await waitFor(I=>{
  const g=globalThis.__FD_DEBUG__?.game,b=globalThis.__FD_STABLE_STATE165__?.bridge,f=globalThis.__FD213_FIXTURE__;
  return g?.getEntity?.(I.truck)?.alive&&f?.ids?.length&&b?.ready&&!b.failed&&Number(b.workerTick)>12
    ? {tick:b.workerTick,ids:f.ids,types:f.extractorTypes}
    : {__pending:true,tick:Number(b?.workerTick||0),failed:Boolean(b?.failed),error:b?.lastError||null};
},I,50000);

const visibilityBeforeSave=await waitFor(()=>{
  const g=globalThis.__FD_DEBUG__.game,f=globalThis.__FD213_FIXTURE__;
  const rows=(f?.ids||[]).map(id=>{const e=g.getEntity(id),idx=e?g.fogIndexAt(e.x,e.y):-1;return{id,typeId:e?.typeId||null,alive:Boolean(e?.alive),idx,cell:idx>=0?Boolean(g.visible?.[idx]):false,visible:e?Boolean(g.isVisibleAt?.(e.x,e.y)):false};});
  return rows.length&&rows.every(r=>r.alive&&r.cell&&r.visible)?rows:{__pending:true,rows};
},undefined,15000);

// Exercise the real named-save path, then corrupt only the transient main-thread
// visibility cells before load. The loaded game must rebuild ownership visibility
// from entities, not inherit an accidental current frame.
const firstSave=await page.evaluate(async()=>{
  const slots=globalThis.__FD_SAVE_SLOTS_213__,g=globalThis.__FD_DEBUG__.game,f=globalThis.__FD213_FIXTURE__;
  const record=await slots.saveNamed('Build 213 extractor fog regression');
  for(const id of f.ids){const e=g.getEntity(id);const idx=g.fogIndexAt(e.x,e.y);if(g.visible&&idx>=0&&idx<g.visible.length)g.visible[idx]=0;if(g.explored&&idx>=0&&idx<g.explored.length)g.explored[idx]=0;}
  return{id:record.id,name:record.name,build:record.build};
});
if(!firstSave?.id)throw new Error(`first save failed ${JSON.stringify(firstSave)}`);
const firstLoad=await page.evaluate(async id=>{try{const record=await globalThis.__FD_SAVE_SLOTS_213__.loadSlot(id);return{ok:true,id:record.id};}catch(error){return{ok:false,error:String(error?.stack||error)};}},firstSave.id);
if(!firstLoad.ok)throw new Error(`first load failed ${JSON.stringify(firstLoad)}`);

const visibilityAfterLoad=await waitFor(({I,saveId})=>{
  const g=globalThis.__FD_DEBUG__?.game,slots=globalThis.__FD_SAVE_SLOTS_213__,b=globalThis.__FD_STABLE_STATE165__?.bridge;
  const ids=I.extractorIds.filter(id=>g?.getEntity?.(id)?.alive);
  const rows=ids.map(id=>{const e=g.getEntity(id),idx=g.fogIndexAt(e.x,e.y);return{id,typeId:e.typeId,cell:Boolean(g.visible?.[idx]),visible:Boolean(g.isVisibleAt?.(e.x,e.y)),explored:g.explored?Boolean(g.explored[idx]):null};});
  const ok=ids.length>0&&rows.every(r=>r.cell&&r.visible)&&slots?.state?.lastLoadedId===saveId&&b?.ready&&!b.failed&&Number(b.workerTick)>5;
  return ok?{rows,lastLoadedId:slots.state.lastLoadedId,tick:b.workerTick}:{__pending:true,rows,lastLoadedId:slots?.state?.lastLoadedId||null,tick:Number(b?.workerTick||0),failed:Boolean(b?.failed)};
},{I,saveId:firstSave.id},60000);

// The truck card must expose a dedicated extraction command.
const uiAction=await waitFor(I=>{
  const g=globalThis.__FD_DEBUG__.game,t=g.getEntity(I.truck);g.setSelection([t],false);g.uiDirty=true;g.updateUI?.(true);
  const button=document.querySelector('#fd-logistics-panel207 [data-fd-action207="extract"]');
  return button?{text:button.textContent.trim(),action:button.dataset.fdAction207}:null;
},I,10000);
if(!/ВЫВОЗИТЬ ДОБЫЧУ/i.test(uiAction.text))throw new Error(`extract UI action invalid ${JSON.stringify(uiAction)}`);

// Right-click/context semantics: selected resource trucks on a friendly extractor
// must become EXTRACT_RESOURCE haulers with that exact source.
const assigned=await page.evaluate(I=>{
  const g=globalThis.__FD_DEBUG__.game,L=globalThis.__FD_LOGISTICS206__,truck=g.getEntity(I.truck),extractor=g.getEntity(I.extractorIds[0]),bridge=globalThis.__FD_STABLE_STATE165__.bridge;
  g.setSelection([truck],false);const beforeSeq=Number(bridge.seq||0);const issued=g.issueContext(extractor.x,extractor.y,false);const s=L.ensureUnit(truck,false);
  return{issued,beforeSeq,sentSeq:Number(bridge.seq||0),mission:s?.missionType,source:s?.sourceNodeId,destination:s?.destinationNodeId||null,extractorId:extractor.id};
},I);
if(!assigned.issued||assigned.mission!=='EXTRACT_RESOURCE'||assigned.source!==assigned.extractorId||assigned.sentSeq<=assigned.beforeSeq)throw new Error(`context extraction assignment failed ${JSON.stringify(assigned)}`);

const loading=await waitFor(I=>{
  const g=globalThis.__FD_DEBUG__.game,L=globalThis.__FD_LOGISTICS206__,truck=g.getEntity(I.truck),ex=g.getEntity(I.extractorIds[0]),s=L.ensureUnit(truck,false);
  const distance=Math.hypot(truck.x-ex.x,truck.y-ex.y),minimum=(Number(truck.radius)||20)+(Number(ex.radius)||38)+10;
  const out={distance,minimum,buffer:Number(ex.resourceBuffer83||0),cargoFuel:Number(s?.cargo?.fuel||0),cargoAmmo:Number(s?.cargo?.ammo||0),phase:s?.phase206,status:s?.status,source:s?.sourceNodeId,destination:s?.destinationNodeId||null};
  return (out.cargoFuel+out.cargoAmmo)>50?out:{__pending:true,...out};
},I,45000);
if(loading.distance<loading.minimum)throw new Error(`truck overlapped extractor while loading ${JSON.stringify(loading)}`);

const delivered=await waitFor(I=>{
  const g=globalThis.__FD_DEBUG__.game,L=globalThis.__FD_LOGISTICS206__,n=L.ensureNode(g.getEntity(I.storage)),truck=g.getEntity(I.truck),s=L.ensureUnit(truck,false);
  const total=Number(n?.stock?.fuel||0)+Number(n?.stock?.ammo||0)+Number(n?.stock?.support||0);
  const out={total,destination:s?.destinationNodeId||null,mission:s?.missionType,status:s?.status};
  return total>100?out:{__pending:true,...out};
},I,50000);
if(delivered.destination&&delivered.destination!==I.storage)throw new Error(`extraction delivered outside storage ${JSON.stringify(delivered)}`);

// Save/load during an active extraction mission. Mission ownership and source must
// survive, and every friendly extractor must remain visible after the second load.
const activeSave=await page.evaluate(async()=>{const slots=globalThis.__FD_SAVE_SLOTS_213__;const record=await slots.saveNamed('Build 213 active haul');return{id:record.id};});
const activeLoad=await page.evaluate(async id=>{try{await globalThis.__FD_SAVE_SLOTS_213__.loadSlot(id);return{ok:true};}catch(error){return{ok:false,error:String(error?.stack||error)};}},activeSave.id);
if(!activeLoad.ok)throw new Error(`active haul load failed ${JSON.stringify(activeLoad)}`);
const postActiveLoad=await waitFor(({I,id})=>{
  const g=globalThis.__FD_DEBUG__?.game,L=globalThis.__FD_LOGISTICS206__,slots=globalThis.__FD_SAVE_SLOTS_213__,b=globalThis.__FD_STABLE_STATE165__?.bridge,truck=g?.getEntity?.(I.truck),s=L?.ensureUnit?.(truck,false);
  const extractors=I.extractorIds.map(key=>g?.getEntity?.(key)).filter(e=>e?.alive);const visibility=extractors.map(e=>{const idx=g.fogIndexAt(e.x,e.y);return{id:e.id,visible:Boolean(g.visible?.[idx])&&Boolean(g.isVisibleAt?.(e.x,e.y))};});
  const out={lastLoadedId:slots?.state?.lastLoadedId||null,mission:s?.missionType||null,source:s?.sourceNodeId||null,visibility,tick:Number(b?.workerTick||0),failed:Boolean(b?.failed)};
  return out.lastLoadedId===id&&out.mission==='EXTRACT_RESOURCE'&&out.source===I.extractorIds[0]&&visibility.length&&visibility.every(v=>v.visible)&&b?.ready&&!b.failed&&out.tick>5?out:{__pending:true,...out};
},{I,id:activeSave.id},60000);

const final=await page.evaluate(()=>({
  feature:globalThis.__FD_EXTRACTOR_VISIBILITY_HAUL_213__,
  featureDiagnostics:globalThis.__FD_EXTRACTOR_VISIBILITY_HAUL_213__?.diagnostics?.(),
  logistics:globalThis.__FD_LOGISTICS_INTEGRITY_213__,
  bridge:{ready:Boolean(globalThis.__FD_STABLE_STATE165__?.bridge?.ready),failed:Boolean(globalThis.__FD_STABLE_STATE165__?.bridge?.failed),tick:Number(globalThis.__FD_STABLE_STATE165__?.bridge?.workerTick||0),error:globalThis.__FD_STABLE_STATE165__?.bridge?.lastError||null},
}));
if(!final.feature?.friendlyExtractorFogPinning||!final.feature?.hydrateVisibilityRepair||!final.feature?.contextExtractorHaul||!final.logistics?.externalBuildingDock)throw new Error(`build 213 marker incomplete ${JSON.stringify(final)}`);
if(final.bridge.failed||!final.bridge.ready)throw new Error(`bridge unhealthy ${JSON.stringify(final.bridge)}`);
if(errors.length)throw new Error(`browser errors ${JSON.stringify(errors)}`);
console.log(JSON.stringify({ok:true,visibilityBeforeSave,firstSave,firstLoad,visibilityAfterLoad,uiAction,assigned,loading,delivered,activeSave,activeLoad,postActiveLoad,final},null,2));
await browser.close();
