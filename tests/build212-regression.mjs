import { chromium } from 'playwright';

const url = process.env.FD_GAME_URL || 'http://127.0.0.1:8765/frontline-dominion/frontline-dominion.html?build=212';
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
  warehouse: 'e212001', receiverTruck: 'e212002', consumer: 'e212003', autoTruck: 'e212004',
  extractor: 'e212005', extractor2: 'e212006', extractionStorage: 'e212007', extractionTruck: 'e212008',
};

await page.goto(url, { waitUntil: 'load', timeout: 60000 });
await waitFor(() => {
  const start = document.getElementById('start-game');
  return start && !start.disabled && globalThis.__FD_LOGISTICS_INTEGRITY_212__ &&
    globalThis.__FD_RUNTIME_SHELL_212__?.state?.installed && globalThis.__FD_SAVE_SLOTS_212__?.state?.ready
    ? true : null;
});

const fixture = await page.evaluate(I => {
  const D = globalThis.__FD_DEBUG__, L = globalThis.__FD_LOGISTICS206__;
  if (!D?.Game || !D?.Building || !D?.Unit || !L) return { ok: false, reason: 'debug/logistics missing' };
  const base = D.Game.prototype.initializeBattle;
  D.Game.prototype.initializeBattle = function(...args) {
    const result = base.apply(this, args);
    const buildingTypes = D.BUILDING_TYPES || {};
    const extractorType = buildingTypes.oilPump ? 'oilPump' : Object.keys(buildingTypes).find(id => {
      const s = buildingTypes[id] || {};
      return s.placeOnResource === 'oil' || /oil.*pump|нефт/i.test(`${id} ${s.name || ''}`);
    });
    const consumerType = buildingTypes.vehicleFactory ? 'vehicleFactory' : Object.keys(buildingTypes).find(id => {
      const s = buildingTypes[id] || {};
      return Array.isArray(s.produces) && s.produces.some(v => v && v !== 'resourceTruck');
    });
    if (!extractorType || !consumerType || !buildingTypes.logisticsHub) {
      throw new Error(`fixture building types missing extractor=${extractorType} consumer=${consumerType} logisticsHub=${Boolean(buildingTypes.logisticsHub)}`);
    }
    const B = (id,typeId,x,y) => { const b = new D.Building(this,{id,typeId,team:'player',x,y,construction:1,rotation:0}); this.addEntity(b); return b; };
    const U = (id,typeId,x,y) => { const u = new D.Unit(this,{id,typeId,team:'player',x,y,rotation:0}); this.addEntity(u); return u; };
    const fillNode = b => { const n=L.ensureNode(b); for(const k of L.STOCK_KEYS){ if(n?.stock)n.stock[k]=n.stock[`${k}Max`]; } return n; };
    const emptyNode = b => { const n=L.ensureNode(b); for(const k of L.STOCK_KEYS){ if(n?.stock)n.stock[k]=0; } return n; };
    const logisticsCommand = unit => { const c={type:'logistics206',missionType:unit.logistics206?.missionType||'AUTO'}; if(typeof unit.setCommand==='function')unit.setCommand(c,false);else{unit.commandQueue=[c];try{unit.currentCommand=c;}catch(_){}} };

    const warehouse=B(I.warehouse,'logisticsHub',14000,14000), warehouseNode=fillNode(warehouse);
    warehouseNode.priority='NORMAL';

    const receiver=U(I.receiverTruck,'resourceTruck',14100,14000), receiverState=L.ensureUnit(receiver,true);
    Object.assign(receiverState,{fuelMax:720,fuel:0,missionType:'AUTO',homeNodeId:null,sourceNodeId:null,destinationNodeId:null,phase206:'PLAN'});
    for(const k of L.STOCK_KEYS) receiverState.cargo[k]=0;
    receiver.commandQueue=[]; try{receiver.currentCommand=null;}catch(_){}

    const consumer=B(I.consumer,consumerType,14700,14000), consumerNode=emptyNode(consumer);
    consumerNode.priority='CRITICAL';

    const autoTruck=U(I.autoTruck,'resourceTruck',14300,14040), autoState=L.ensureUnit(autoTruck,true);
    Object.assign(autoState,{fuelMax:720,fuel:720,missionType:'AUTO',homeNodeId:I.warehouse,sourceNodeId:null,destinationNodeId:null,phase206:'PLAN',waitUntil206:0});
    for(const k of L.STOCK_KEYS)autoState.cargo[k]=0;
    logisticsCommand(autoTruck);

    const extractor=B(I.extractor,extractorType,15500,14000); L.ensureExtractor(extractor); extractor.resourceBuffer83=2600;
    const extractor2=B(I.extractor2,extractorType,15740,14000); L.ensureExtractor(extractor2); extractor2.resourceBuffer83=0;
    const extractionStorage=B(I.extractionStorage,'logisticsHub',16000,14000), storageNode=emptyNode(extractionStorage);
    for(const k of L.STOCK_KEYS){storageNode.thresholds.target[k]=0;storageNode.thresholds.low[k]=0;storageNode.thresholds.critical[k]=0;}

    const extractionTruck=U(I.extractionTruck,'resourceTruck',15560,14020), extractionState=L.ensureUnit(extractionTruck,true);
    Object.assign(extractionState,{fuelMax:720,fuel:720,missionType:'EXTRACT_RESOURCE',homeNodeId:I.extractionStorage,sourceNodeId:I.extractor,destinationNodeId:null,phase206:'PLAN',waitUntil206:0});
    for(const k of L.STOCK_KEYS)extractionState.cargo[k]=0;
    logisticsCommand(extractionTruck);

    globalThis.__FD212_FIXTURE__={extractorType,consumerType,warehouseFuelStart:Number(warehouseNode.stock.fuel)||0};
    return result;
  };
  return { ok: true };
}, I);
if (!fixture.ok) throw new Error(`fixture installation failed: ${JSON.stringify(fixture)}`);

await page.locator('#start-game').click();
await waitFor(I => {
  const g=globalThis.__FD_DEBUG__?.game,b=globalThis.__FD_STABLE_STATE165__?.bridge;
  return g?.getEntity?.(I.receiverTruck)?.alive && g?.getEntity?.(I.extractionTruck)?.alive && b?.ready && !b.failed && Number(b.workerTick)>12
    ? {tick:b.workerTick}
    : {__pending:true,tick:Number(b?.workerTick||0),failed:Boolean(b?.failed),error:b?.lastError||null};
}, I);

// 1) A depleted supply truck inside a storage node's radius must refuel directly
// from the node without needing a second truck or a manual command.
const localService = await waitFor(I => {
  const g=globalThis.__FD_DEBUG__.game,L=globalThis.__FD_LOGISTICS206__,f=globalThis.__FD212_FIXTURE__;
  const warehouse=g.getEntity(I.warehouse),node=L.ensureNode(warehouse),receiver=g.getEntity(I.receiverTruck),s=L.ensureUnit(receiver,false);
  const out={fuel:Number(s?.fuel||0),fuelMax:Number(s?.fuelMax||0),source:s?.resupplySourceId||null,warehouseFuel:Number(node?.stock?.fuel||0),start:Number(f?.warehouseFuelStart||0)};
  return out.fuel>600 && out.source===I.warehouse && out.warehouseFuel<out.start ? out : {__pending:true,...out};
}, I, 30000);
if (localService.fuel>localService.fuelMax*.92+1) throw new Error(`local node overfilled truck ${JSON.stringify(localService)}`);

// 2) AUTO trucks must source ordinary building replenishment from reserve nodes,
// never directly from extraction buffers, and must deliver to a deficient building.
const autoSupply = await waitFor(I => {
  const g=globalThis.__FD_DEBUG__.game,L=globalThis.__FD_LOGISTICS206__,truck=g.getEntity(I.autoTruck),s=L.ensureUnit(truck,false),consumer=g.getEntity(I.consumer),n=L.ensureNode(consumer);
  const total=Number(n?.stock?.fuel||0)+Number(n?.stock?.ammo||0)+Number(n?.stock?.support||0);
  const out={total,source:s?.sourceNodeId||null,destination:s?.destinationNodeId||null,phase:s?.phase206,status:s?.status};
  return total>20 ? out : {__pending:true,...out};
}, I, 45000);
if (autoSupply.source===I.extractor || autoSupply.source===I.extractor2) throw new Error(`AUTO supply illegally sourced extractor ${JSON.stringify(autoSupply)}`);

const directSourceChoice = await page.evaluate(I => {
  const g=globalThis.__FD_DEBUG__.game,t=g.getEntity(I.autoTruck);
  const src=g.findSupplySource206?.(t,{fuel:100,ammo:0,support:0},I.consumer);
  return src?{id:src.id,typeId:src.typeId}:null;
}, I);
if (!directSourceChoice || directSourceChoice.id===I.extractor || directSourceChoice.id===I.extractor2) {
  throw new Error(`reserve source classifier failed ${JSON.stringify(directSourceChoice)}`);
}

// 3) Extraction hauling may unload only into a storage-class node. A second
// extractor is deliberately closer than the storage and must never become the destination.
const extractionRoute = await waitFor(I => {
  const g=globalThis.__FD_DEBUG__.game,L=globalThis.__FD_LOGISTICS206__,truck=g.getEntity(I.extractionTruck),s=L.ensureUnit(truck,false),storage=L.ensureNode(g.getEntity(I.extractionStorage));
  const out={destination:s?.destinationNodeId||null,phase:s?.phase206,status:s?.status,storageFuel:Number(storage?.stock?.fuel||0),cargoFuel:Number(s?.cargo?.fuel||0)};
  if(out.destination || out.storageFuel>10) return out;
  return {__pending:true,...out};
}, I, 30000);
if (extractionRoute.destination && extractionRoute.destination!==I.extractionStorage) throw new Error(`extraction chose non-storage destination ${JSON.stringify(extractionRoute)}`);
if (extractionRoute.destination===I.extractor2) throw new Error(`extractor-to-extractor route detected ${JSON.stringify(extractionRoute)}`);
const extractionDelivered = await waitFor(I => {
  const g=globalThis.__FD_DEBUG__.game,L=globalThis.__FD_LOGISTICS206__,n=L.ensureNode(g.getEntity(I.extractionStorage)),truck=g.getEntity(I.extractionTruck),s=L.ensureUnit(truck,false);
  const out={storageFuel:Number(n?.stock?.fuel||0),destination:s?.destinationNodeId||null,phase:s?.phase206,status:s?.status};
  return out.storageFuel>100 ? out : {__pending:true,...out};
}, I, 45000);

// 4) A slot created by this build must load even when writing the payload to the
// legacy localStorage current-save key throws QuotaExceededError. Build 212 loads
// the IndexedDB payload directly through the runtime shell.
const saveRecord = await page.evaluate(async () => {
  const slots=globalThis.__FD_SAVE_SLOTS_212__;
  if(!slots?.saveNamed) throw new Error('save slots API missing');
  const record=await slots.saveNamed('Build 212 regression');
  return {id:record.id,name:record.name,build:record.build};
});
if (!saveRecord?.id) throw new Error(`manual save creation failed ${JSON.stringify(saveRecord)}`);

const loadAttempt = await page.evaluate(async id => {
  const slots=globalThis.__FD_SAVE_SLOTS_212__,shell=globalThis.__FD_RUNTIME_SHELL_212__,D=globalThis.__FD_DEBUG__;
  const currentKey=D?.SAVE_KEY||'frontline-dominion-save-v5';
  const original=Storage.prototype.setItem;
  Storage.prototype.setItem=function(key,value){
    if(String(key)===String(currentKey)) throw new DOMException('simulated quota for legacy current save','QuotaExceededError');
    return original.call(this,key,value);
  };
  try {
    const record=await slots.loadSlot(id);
    return {ok:true,id:record.id,lastLoadedId:slots.state.lastLoadedId,shellError:shell.state.lastError};
  } catch(error) {
    return {ok:false,error:String(error?.stack||error),lastError:slots?.state?.lastError||null,shellError:shell?.state?.lastError||null};
  } finally {
    Storage.prototype.setItem=original;
  }
}, saveRecord.id);
if (!loadAttempt.ok) throw new Error(`same-build direct slot load failed ${JSON.stringify(loadAttempt)}`);

const postLoad = await waitFor(id => {
  const D=globalThis.__FD_DEBUG__,slots=globalThis.__FD_SAVE_SLOTS_212__,shell=globalThis.__FD_RUNTIME_SHELL_212__,b=globalThis.__FD_STABLE_STATE165__?.bridge;
  const out={game:Boolean(D?.game),lastLoadedId:slots?.state?.lastLoadedId||null,shellError:shell?.state?.lastError||null,ready:Boolean(b?.ready),failed:Boolean(b?.failed),tick:Number(b?.workerTick||0)};
  return out.game&&out.lastLoadedId===id&&!out.shellError&&out.ready&&!out.failed&&out.tick>5?out:{__pending:true,...out};
}, saveRecord.id, 60000);

const marker = await page.evaluate(() => globalThis.__FD_LOGISTICS_INTEGRITY_212__);
if(!marker?.localNodeAutoService||!marker?.emptyTruckNodeRescue||!marker?.extractionToStorageOnly||!marker?.reserveSourcesOnly||!marker?.autoDeficitDispatch){
  throw new Error(`build 212 marker incomplete ${JSON.stringify(marker)}`);
}
if(errors.length) throw new Error(`browser errors ${JSON.stringify(errors)}`);
console.log(JSON.stringify({ok:true,localService,autoSupply,directSourceChoice,extractionRoute,extractionDelivered,saveRecord,loadAttempt,postLoad,marker},null,2));
await browser.close();
