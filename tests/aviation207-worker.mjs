import { chromium } from 'playwright';

const url=process.env.FD_GAME_URL||'http://127.0.0.1:8765/frontline-dominion/frontline-dominion.html?build=207';
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1});
const page=await context.newPage();
const errors=[];
const consoleErrors=[];
page.on('pageerror',error=>errors.push(String(error?.stack||error)));
page.on('console',message=>{if(message.type()==='error'&&!/favicon|404|audio|autoplay|Failed to load resource:.*503/i.test(message.text()))consoleErrors.push(message.text());});

const waitFor=async(fn,arg=undefined,timeout=30000,interval=100)=>{const started=Date.now();let last=null;while(Date.now()-started<timeout){last=await page.evaluate(fn,arg);if(last)return last;await page.waitForTimeout(interval);}throw new Error(`Timed out after ${timeout}ms; last=${JSON.stringify(last)}`);};

await page.goto(url,{waitUntil:'load',timeout:60000});
await waitFor(()=>{const b=document.getElementById('start-game'),s=globalThis.__FD_RUNTIME_SHELL_207__,slots=globalThis.__FD_SAVE_SLOTS_207__;return b&&!b.disabled&&s?.state?.installed&&slots?.state?.ready&&globalThis.__FD_SINGLEPLAYER_207__&&globalThis.__FD_LOGISTICS_UI207__?true:null;});

const fixturePlan=await page.evaluate(()=>{
  const D=globalThis.__FD_DEBUG__,L=globalThis.__FD_LOGISTICS206__,S=globalThis.__FD_SINGLEPLAYER_207__;
  if(!D?.Game||!D?.Unit||!D?.Building||!D?.ResourceNode||!L||!S) return {ok:false,reason:'constructors-or-logistics-missing'};
  const airEntry=Object.entries(D.UNIT_TYPES||{}).find(([,stats])=>stats?.air&&stats.mobilityClass==='fixedWing'&&!/helicopter|gunship/i.test(`${stats?.visualRole||''}`));
  if(!airEntry)return{ok:false,reason:'fixed-wing-type-missing'};
  const [airType]=airEntry;
  const baseInit=D.Game.prototype.initializeBattle;
  if(typeof baseInit!=='function')return{ok:false,reason:'initializeBattle-missing'};
  if(D.Game.prototype.__fdAviationFixture207Installed)return{ok:true,airType,reused:true};
  Object.defineProperty(D.Game.prototype,'__fdAviationFixture207Installed',{value:true,configurable:true});
  D.Game.prototype.initializeBattle=function(...args){
    const result=baseInit.apply(this,args);
    const base=this.playerBase||{x:1400,y:10500};
    const fx=base.x+760,fy=base.y-620;
    const field=new D.Building(this,{id:'fd207-airfield-fixture',typeId:'airfield',team:'player',x:fx,y:fy,construction:1,autoConstruct:true,rotation:0});
    field.construction=1;field.buildProgress=1;
    this.addEntity(field);
    const node=L.ensureNode(field);
    if(node?.stock){node.stock.fuel=Math.max(Number(node.stock.fuel)||0,16000);node.stock.ammo=Math.max(Number(node.stock.ammo)||0,12000);node.stock.support=Math.max(Number(node.stock.support)||0,9000);}
    const plane=new D.Unit(this,{id:'fd207-aircraft-fixture',typeId:airType,team:'player',x:fx+250,y:fy+80,rotation:0});
    plane.airServiceTargetId=field.id;
    plane.sortieFuelMax=Math.max(320,Number(plane.sortieFuelMax)||0);plane.sortieFuel=plane.sortieFuelMax;
    if(Number.isFinite(plane.airAmmoMax))plane.airAmmo=plane.airAmmoMax;
    this.addEntity(plane);L.ensureUnit(plane,true);

    const resource=new D.ResourceNode(this,{id:'fd207-oil-resource-fixture',variant:'oil',x:fx-520,y:fy+220,amount:650000,maxAmount:650000,regenRate:0});
    this.addEntity(resource);
    const extractor=new D.Building(this,{id:'fd207-oil-extractor-fixture',typeId:'oilPump',team:'player',x:resource.x,y:resource.y,construction:1,autoConstruct:true,rotation:0});
    extractor.construction=1;extractor.buildProgress=1;extractor.resourceNodeId=resource.id;extractor.resourceBuffer83=5400;resource.extractorBuildingId=extractor.id;
    this.addEntity(extractor);
    S.normalizeWorld207(this);
    this.recalculatePower?.();
    this.invalidateTeamAirFleetState93?.('player');
    return result;
  };
  return{ok:true,airType,reused:false};
});
if(!fixturePlan.ok)throw new Error(`Could not install authoritative fixture: ${JSON.stringify(fixturePlan)}`);

await page.locator('#start-game').click();
const ready=await waitFor(()=>{const game=globalThis.__FD_DEBUG__?.game,b=globalThis.__FD_STABLE_STATE165__?.bridge,plane=game?.getEntity?.('fd207-aircraft-fixture'),field=game?.getEntity?.('fd207-airfield-fixture'),extractor=game?.getEntity?.('fd207-oil-extractor-fixture');return game&&b?.ready&&!b.failed&&Number(b.workerTick||0)>15&&plane?.alive&&field?.alive&&extractor?.alive?{tick:Number(b.workerTick),recoveries:Number(b.recoveryAttempts201||0),units:game.units.filter(u=>u?.alive).length,buildings:game.buildings.filter(x=>x?.alive).length,plane:{id:plane.id,typeId:plane.typeId,x:plane.x,y:plane.y,fuel:plane.logistics206?.fuel,fuelMax:plane.logistics206?.fuelMax},field:{id:field.id,nodeType:field.logistics206?.nodeType,fuel:field.logistics206?.stock?.fuel},extractor:{id:extractor.id,buffer:extractor.resourceBuffer83,max:extractor.resourceBufferMax206}}:null;},undefined,45000);

// The extractor must expose real finite-deposit information in the third Logistics tab.
const extractorTab=await page.evaluate(()=>{const game=globalThis.__FD_DEBUG__.game,e=game.getEntity('fd207-oil-extractor-fixture');game.setSelection([e],false);game.renderSelectionUI();globalThis.__FD_LOGISTICS_UI207__?.open?.();const r=game.getEntity(e.resourceNodeId);return{name:e.stats?.name,buffer:e.resourceBuffer83,bufferMax:e.resourceBufferMax206,deposit:r?.amount,depositMax:r?.maxAmount,variant:r?.variant,kind:r?.resourceKind207,regen:r?.regenRate};});
const extractorUi=await waitFor(()=>{const tab=document.querySelector('[data-selection-tab="logistics"]'),pane=document.getElementById('selection-logistics-pane'),text=document.getElementById('fd-logistics-panel207')?.textContent||'';return tab&&!tab.disabled&&pane?.classList.contains('active')&&/Остаток месторождения/.test(text)&&/Локальный склад/.test(text)&&/Скорость добычи/.test(text)?text:null;});
if(extractorTab.name!=='Нефтеперерабатывающий комплекс'||extractorTab.variant!=='oil'||extractorTab.kind!=='fuel'||extractorTab.regen!==0||!(extractorTab.depositMax>=2_000_000)||!(extractorTab.bufferMax>=36000))throw new Error(`Extractor fixture not canonical: ${JSON.stringify(extractorTab)}`);

// Select the real authoritative aircraft and verify its logistics tab.
const airUiState=await page.evaluate(()=>{const game=globalThis.__FD_DEBUG__.game,u=game.getEntity('fd207-aircraft-fixture');game.setSelection([u],false);game.renderSelectionUI();globalThis.__FD_LOGISTICS_UI207__?.open?.();return{id:u.id,x:u.x,y:u.y,fuel:u.logistics206?.fuel,fuelMax:u.logistics206?.fuelMax,ammo:u.logistics206?.ammoReady,ammoMax:u.logistics206?.ammoReadyMax};});
const airUi=await waitFor(()=>{const pane=document.getElementById('selection-logistics-pane'),text=document.getElementById('fd-logistics-panel207')?.textContent||'';return pane?.classList.contains('active')&&/Авиационное снабжение/.test(text)&&/Топливо/.test(text)&&/Боекомплект/.test(text)?text:null;});

const beforeMove=await page.evaluate(()=>{const game=globalThis.__FD_DEBUG__.game,b=globalThis.__FD_STABLE_STATE165__.bridge,u=game.getEntity('fd207-aircraft-fixture');game.setSelection([u],false);const seq=Number(b.seq||0),tick=Number(b.workerTick||0),recoveries=Number(b.recoveryAttempts201||0),units=game.units.filter(x=>x?.alive).length;const x=u.x,y=u.y;const issued=game.issueMove(x+620,y+240,false);return{issued,beforeSeq:seq,sent:Number(b.seq||0),tick,recoveries,units,x,y};});
if(!beforeMove.issued||beforeMove.sent<=beforeMove.beforeSeq)throw new Error(`Aircraft move did not enter authoritative Worker: ${JSON.stringify(beforeMove)}`);
await waitFor(seq=>Number(globalThis.__FD_STABLE_STATE165__?.bridge?.lastAck||0)>=seq,beforeMove.sent,15000);
const moved=await waitFor(({x,y})=>{const u=globalThis.__FD_DEBUG__?.game?.getEntity?.('fd207-aircraft-fixture'),b=globalThis.__FD_STABLE_STATE165__?.bridge;if(!u?.alive||!b?.ready||b.failed)return null;const distance=Math.hypot(u.x-x,u.y-y);return distance>35?{x:u.x,y:u.y,distance,tick:Number(b.workerTick),fuel:u.logistics206?.fuel}:null;},{x:beforeMove.x,y:beforeMove.y},20000,100);

// The second command exercises the fixed-wing hangar/return path that originally produced the user's Worker failure.
const returnCommand=await page.evaluate(()=>{const game=globalThis.__FD_DEBUG__.game,b=globalThis.__FD_STABLE_STATE165__.bridge,u=game.getEntity('fd207-aircraft-fixture');game.setSelection([u],false);const before=Number(b.seq||0),recoveries=Number(b.recoveryAttempts201||0),tick=Number(b.workerTick||0);const issued=game.issueAirReturn93?.();return{issued,before,sent:Number(b.seq||0),recoveries,tick};});
if(!returnCommand.issued||returnCommand.sent<=returnCommand.before)throw new Error(`Aircraft return did not enter authoritative Worker: ${JSON.stringify(returnCommand)}`);
await waitFor(seq=>Number(globalThis.__FD_STABLE_STATE165__?.bridge?.lastAck||0)>=seq,returnCommand.sent,15000);
await page.waitForTimeout(4500);

const after=await page.evaluate(({recoveries,tick,units})=>{const game=globalThis.__FD_DEBUG__.game,b=globalThis.__FD_STABLE_STATE165__.bridge,u=game.getEntity('fd207-aircraft-fixture'),field=game.getEntity('fd207-airfield-fixture');return{ready:Boolean(b.ready),failed:Boolean(b.failed),tick:Number(b.workerTick||0),recoveries:Number(b.recoveryAttempts201||0),lastError:b.lastError||null,lastRecoveryReason:b.lastRecoveryReason201||null,units:game.units.filter(x=>x?.alive).length,planeAlive:Boolean(u?.alive),command:u?.currentCommand?{type:u.currentCommand.type,stage:u.currentCommand.stage}:null,airState:u?.airServiceState||null,fieldFuel:field?.logistics206?.stock?.fuel,expected:{recoveries,tick,units}};},{recoveries:beforeMove.recoveries,tick:returnCommand.tick,units:beforeMove.units});
if(!after.ready||after.failed||after.tick<=returnCommand.tick||after.recoveries!==beforeMove.recoveries||!after.planeAlive||after.units<Math.max(1,beforeMove.units-2))throw new Error(`Aircraft control destabilized authoritative world: ${JSON.stringify(after)}`);
if(errors.length||consoleErrors.length)throw new Error(`Browser errors during aviation fixture: ${JSON.stringify({errors,consoleErrors})}`);

console.log(JSON.stringify({ok:true,fixturePlan,ready,extractorTab,extractorUi:true,airUiState,airUi:true,beforeMove,moved,returnCommand,after}));
await context.close();
await browser.close();
