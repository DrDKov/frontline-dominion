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
await waitFor(()=>{const b=document.getElementById('start-game');return b&&!b.disabled&&globalThis.__FD_GAMEPLAY_208__&&globalThis.__FD_LOGISTICS_UI208__&&globalThis.__FD_RUNTIME_SHELL_208__?.state?.installed&&globalThis.__FD_SAVE_SLOTS_208__?.state?.ready?true:null;},undefined,30000);

const fixture=await page.evaluate(()=>{
  const D=globalThis.__FD_DEBUG__,L=globalThis.__FD_LOGISTICS206__,S=globalThis.__FD_SINGLEPLAYER_207__;
  if(!D?.Game||!D?.Unit||!D?.Building||!D?.ResourceNode||!L||!S)return{ok:false,reason:'runtime-missing'};
  const base=D.Game.prototype.initializeBattle;
  if(typeof base!=='function')return{ok:false,reason:'initialize-missing'};
  D.Game.prototype.initializeBattle=function(...args){
    const result=base.apply(this,args);this.teams.player.credits=500000;
    const makeBuilding=(id,typeId,x,y)=>{const b=new D.Building(this,{id,typeId,team:'player',x,y,construction:1,autoConstruct:true,rotation:0});b.construction=1;b.buildProgress=1;this.addEntity(b);return b;};
    const makeUnit=(id,typeId,x,y)=>{const u=new D.Unit(this,{id,typeId,team:'player',x,y,rotation:0});this.addEntity(u);return u;};
    const source=makeBuilding('fd208-source','logisticsHub',7200,6500);const sourceNode=L.ensureNode(source);if(sourceNode?.stock){for(const k of L.STOCK_KEYS){sourceNode.stock[k]=sourceNode.stock[`${k}Max`];}}
    const barracks=makeBuilding('fd208-barracks','barracks',8500,6500);const barracksNode=L.ensureNode(barracks);if(barracksNode?.stock){for(const k of L.STOCK_KEYS)barracksNode.stock[k]=0;}
    const factory=makeBuilding('fd208-factory','vehicleFactory',8500,7350);const factoryNode=L.ensureNode(factory);if(factoryNode?.stock){for(const k of L.STOCK_KEYS)factoryNode.stock[k]=0;}
    const truck=makeUnit('fd208-truck','resourceTruck',7350,6500);const ts=L.ensureUnit(truck,true);ts.homeNodeId=barracks.id;ts.destinationNodeId=barracks.id;ts.missionType='SUPPLY_BUILDING';ts.phase206='PLAN';ts.fuel=ts.fuelMax;for(const k of L.STOCK_KEYS)ts.cargo[k]=0;truck.commandQueue=[{type:'logistics206',missionType:'SUPPLY_BUILDING'}];

    const vehicleType=Object.keys(D.UNIT_TYPES||{}).find(id=>{try{const s=D.getUnitStats?.(id,this.teams.player)||D.UNIT_TYPES[id];return s?.vehicle&&!s?.air&&id!=='resourceTruck'&&s?.weapon;}catch{return false;}})||'tank';
    const areaIds=[],groupIds=[];
    for(let i=0;i<3;i++){const u=makeUnit(`fd208-area-${i}`,vehicleType,9800+i*90,6500+i*45);const s=L.ensureUnit(u,true);s.fuel=Math.min(s.fuel,10);s.ammoReserve=Math.min(s.ammoReserve,1);s.support=Math.min(s.support,2);areaIds.push(u.id);}
    for(let i=0;i<3;i++){const u=makeUnit(`fd208-group-${i}`,vehicleType,9800+i*85,7600+i*35);const s=L.ensureUnit(u,true);s.fuel=Math.min(s.fuel,8);s.ammoReserve=Math.min(s.ammoReserve,1);s.support=Math.min(s.support,2);groupIds.push(u.id);}

    const resource=new D.ResourceNode(this,{id:'fd208-oil-resource',variant:'oil',x:11200,y:6500,amount:3000000,maxAmount:3000000,regenRate:0});this.addEntity(resource);
    const extractor=makeBuilding('fd208-oil-extractor','oilPump',11200,6500);extractor.resourceNodeId=resource.id;resource.extractorBuildingId=extractor.id;extractor.resourceBuffer83=9000;S.normalizeWorld207(this);
    const idleWorker=makeUnit('fd208-idle-worker','worker',11340,6500);idleWorker.commandQueue=[];

    const initiativeBuilding=new D.Building(this,{id:'fd208-initiative-financial',typeId:'financialCenter',team:'player',x:12200,y:7600,construction:.18,autoConstruct:false,rotation:0});this.addEntity(initiativeBuilding);
    const initiativeWorker=makeUnit('fd208-initiative-worker','worker',12270,7600);initiativeWorker.commandQueue=[];
    this.recalculatePower?.();
    return result;
  };
  return{ok:true};
});
if(!fixture.ok)throw new Error(`Fixture failed: ${JSON.stringify(fixture)}`);

await page.locator('#start-game').click();
const ready=await waitFor(()=>{const g=globalThis.__FD_DEBUG__?.game,b=globalThis.__FD_STABLE_STATE165__?.bridge;return g&&b?.ready&&!b.failed&&Number(b.workerTick)>15&&g.getEntity('fd208-truck')?.alive?{tick:Number(b.workerTick),recoveries:Number(b.recoveryAttempts201||0)}:null;},undefined,45000);

const profileAudit=await page.evaluate(()=>{const D=globalThis.__FD_DEBUG__,L=globalThis.__FD_LOGISTICS206__;const rows=[];for(const [typeId,stats] of Object.entries(D.BUILDING_TYPES||{})){const produces=(Array.isArray(stats?.produces)&&stats.produces.length)||Object.values(stats?.producesByFaction||{}).some(v=>Array.isArray(v)&&v.length);if(!produces)continue;rows.push({typeId,profile:L.profileForBuilding({typeId,stats}),role:stats.role});}return rows;});
const missingProfiles=profileAudit.filter(x=>!x.profile);if(missingProfiles.length)throw new Error(`Production buildings without logistics profile: ${JSON.stringify(missingProfiles)}`);

// Idle engineers must not receive resource hauling automatically.
await page.waitForTimeout(3200);
const idleEngineer=await page.evaluate(()=>{const g=globalThis.__FD_DEBUG__.game,u=g.getEntity('fd208-idle-worker');return{command:u?.currentCommand||null,haul:u?.workerHaul207||null,cargo:u?.workerCargo207||null};});
if(idleEngineer.command?.type==='harvest'||idleEngineer.command?.autoLogistics207||idleEngineer.haul)throw new Error(`Idle engineer started hauling without order: ${JSON.stringify(idleEngineer)}`);

// Old engineer initiative must still build an unfinished building autonomously.
const initiative=await waitFor(()=>{const g=globalThis.__FD_DEBUG__.game,b=g.getEntity('fd208-initiative-financial'),u=g.getEntity('fd208-initiative-worker');return Number(b?.construction)>.185?{construction:b.construction,command:u?.currentCommand?.type||null}:null;},undefined,15000);

// Extractor adds deterministic Money income independently of its Fuel production.
const extractorIncome=await waitFor(()=>{const L=globalThis.__FD_LOGISTICS206__,g=globalThis.__FD_DEBUG__.game,t=L.ensureGame(g).telemetry;return Number(t.moneyExtractionIncome208||0)>=7?{money:Number(t.moneyExtractionIncome208),credits:Number(g.teams.player.credits)}:null;},undefined,10000);

// Supply Building must physically fill the selected node.
const buildingSeq=await page.evaluate(()=>{const g=globalThis.__FD_DEBUG__.game,b=globalThis.__FD_STABLE_STATE165__.bridge,before=Number(b.seq||0);g.setLogisticsMission206({truckIds:['fd208-truck'],missionType:'SUPPLY_BUILDING',destinationNodeId:'fd208-barracks'});return Number(b.seq)>before?Number(b.seq):0;});
if(!buildingSeq)throw new Error('SUPPLY_BUILDING did not enter Worker');
await waitFor(seq=>Number(globalThis.__FD_STABLE_STATE165__?.bridge?.lastAck||0)>=seq,buildingSeq,15000);
const buildingSupply=await waitFor(()=>{const g=globalThis.__FD_DEBUG__.game,L=globalThis.__FD_LOGISTICS206__,n=L.ensureNode(g.getEntity('fd208-barracks'));const total=(n?.stock?.ammo||0)+(n?.stock?.support||0)+(n?.stock?.fuel||0);return total>50?{total,stock:{...n.stock}}:null;},undefined,30000);

// Supply Area services all ground units around a fixed point.
const areaBefore=await page.evaluate(()=>{const g=globalThis.__FD_DEBUG__.game,L=globalThis.__FD_LOGISTICS206__;return['fd208-area-0','fd208-area-1','fd208-area-2'].map(id=>{const s=L.ensureUnit(g.getEntity(id),false);return{id,total:(s?.fuel||0)+(s?.ammoReserve||0)+(s?.support||0)}});});
const areaSeq=await page.evaluate(()=>{const g=globalThis.__FD_DEBUG__.game,b=globalThis.__FD_STABLE_STATE165__.bridge,before=Number(b.seq||0);g.setLogisticsMission206({truckIds:['fd208-truck'],missionType:'SUPPLY_AREA',targetX:9890,targetY:6545,serviceRadius:680});return Number(b.seq)>before?Number(b.seq):0;});
await waitFor(seq=>Number(globalThis.__FD_STABLE_STATE165__?.bridge?.lastAck||0)>=seq,areaSeq,15000);
const areaSupply=await waitFor(before=>{const g=globalThis.__FD_DEBUG__.game,L=globalThis.__FD_LOGISTICS206__;const now=before.map(x=>{const s=L.ensureUnit(g.getEntity(x.id),false);return{id:x.id,total:(s?.fuel||0)+(s?.ammoReserve||0)+(s?.support||0),before:x.total};});return now.some(x=>x.total>x.before+10)?now:null;},areaBefore,35000);

// Supply Group must work even when target units have no formal formation.
const groupBefore=await page.evaluate(()=>{const g=globalThis.__FD_DEBUG__.game,L=globalThis.__FD_LOGISTICS206__;return['fd208-group-0','fd208-group-1','fd208-group-2'].map(id=>{const s=L.ensureUnit(g.getEntity(id),false);return{id,total:(s?.fuel||0)+(s?.ammoReserve||0)+(s?.support||0)}});});
const groupSeq=await page.evaluate(()=>{const g=globalThis.__FD_DEBUG__.game,b=globalThis.__FD_STABLE_STATE165__.bridge,before=Number(b.seq||0);g.setLogisticsMission206({truckIds:['fd208-truck'],missionType:'SUPPLY_GROUP',targetUnitIds208:['fd208-group-0','fd208-group-1','fd208-group-2'],targetX:9890,targetY:7635,serviceRadius:620});return Number(b.seq)>before?Number(b.seq):0;});
await waitFor(seq=>Number(globalThis.__FD_STABLE_STATE165__?.bridge?.lastAck||0)>=seq,groupSeq,15000);
const groupAssigned=await waitFor(()=>{const s=globalThis.__FD_DEBUG__?.game?.getEntity('fd208-truck')?.logistics206;return s?.missionType==='SUPPLY_GROUP'&&String(s.targetGroupId||'').startsWith('supply208-')?{groupId:s.targetGroupId,status:s.status}:null;},undefined,10000);
const groupSupply=await waitFor(before=>{const g=globalThis.__FD_DEBUG__.game,L=globalThis.__FD_LOGISTICS206__;const now=before.map(x=>{const s=L.ensureUnit(g.getEntity(x.id),false);return{id:x.id,total:(s?.fuel||0)+(s?.ammoReserve||0)+(s?.support||0),before:x.total};});return now.some(x=>x.total>x.before+10)?now:null;},groupBefore,35000);

// Barracks creates a resource truck through the nearest capable producer, but the new truck belongs to the barracks.
const barracksUI=await page.evaluate(()=>{const g=globalThis.__FD_DEBUG__.game,b=g.getEntity('fd208-barracks');g.setSelection([b],false);g.renderSelectionUI();globalThis.__FD_LOGISTICS_UI208__?.open?.();return{node:Boolean(globalThis.__FD_LOGISTICS206__.ensureNode(b)),slots:b.logistics206?.transportSlots||0};});
if(!barracksUI.node||barracksUI.slots<1)throw new Error(`Barracks logistics node invalid: ${JSON.stringify(barracksUI)}`);
await waitFor(()=>document.querySelector('[data-fd-action207="create-transport"]')?true:null);
const trucksBefore=await page.evaluate(()=>globalThis.__FD_DEBUG__.game.units.filter(u=>u?.alive&&u.typeId==='resourceTruck'&&u.logistics206?.homeNodeId==='fd208-barracks').map(u=>u.id));
await page.locator('[data-fd-action207="create-transport"]').click();
const tiedTruck=await waitFor(before=>{const g=globalThis.__FD_DEBUG__.game;const list=g.units.filter(u=>u?.alive&&u.typeId==='resourceTruck'&&u.logistics206?.homeNodeId==='fd208-barracks'&&!before.includes(u.id));return list[0]?{id:list[0].id,home:list[0].logistics206.homeNodeId,mission:list[0].logistics206.missionType,destination:list[0].logistics206.destinationNodeId}:null;},trucksBefore,45000);
if(tiedTruck.home!=='fd208-barracks'||tiedTruck.destination!=='fd208-barracks')throw new Error(`Produced truck not tied to barracks: ${JSON.stringify(tiedTruck)}`);

// Every logistics button in the truck card must be actionable (target buttons enter target mode; immediate buttons change Worker state).
const buttonAudit=await page.evaluate(()=>{const g=globalThis.__FD_DEBUG__.game,u=g.getEntity('fd208-truck');g.setSelection([u],false);g.renderSelectionUI();globalThis.__FD_LOGISTICS_UI208__?.open?.();return[...document.querySelectorAll('#fd-logistics-panel207 [data-fd-action207]')].map(b=>({action:b.dataset.fdAction207,disabled:b.disabled}));});
const expected=['area','group','building','return','auto','manual'];for(const id of expected)if(!buttonAudit.some(x=>x.action===id&&!x.disabled))throw new Error(`Missing/disabled truck button ${id}: ${JSON.stringify(buttonAudit)}`);
for(const id of ['area','group','building','manual']){await page.locator(`[data-fd-action207="${id}"]`).click();const targeting=await page.evaluate(()=>document.body.classList.contains('fd-logistics-target207'));if(!targeting)throw new Error(`${id} button did not enter target mode`);await page.keyboard.press('Escape');await page.evaluate(()=>document.body.classList.remove('fd-logistics-target207'));}
await page.locator('[data-fd-action207="return"]').click();await waitFor(()=>globalThis.__FD_DEBUG__.game.getEntity('fd208-truck')?.logistics206?.missionType==='RETURN_TO_SOURCE'?true:null,undefined,10000);
await page.locator('[data-fd-action207="auto"]').click();await waitFor(()=>{const m=globalThis.__FD_DEBUG__.game.getEntity('fd208-truck')?.logistics206?.missionType;return ['AUTO','SUPPLY_BUILDING'].includes(m)?m:null;},undefined,10000);

const finalState=await page.evaluate(()=>{const b=globalThis.__FD_STABLE_STATE165__.bridge,g=globalThis.__FD_DEBUG__.game;return{ready:b.ready,failed:b.failed,tick:Number(b.workerTick),recoveries:Number(b.recoveryAttempts201||0),lastError:b.lastError||null,idleHook:globalThis.__FD_GAMEPLAY_208__?.removedIdleEngineerHooks,initiativePreserved:globalThis.__FD_GAMEPLAY_208__?.initiativePreserved,units:g.units.filter(u=>u?.alive).length};});
if(!finalState.ready||finalState.failed||finalState.recoveries!==ready.recoveries||!finalState.initiativePreserved)throw new Error(`Worker/runtime unstable: ${JSON.stringify(finalState)}`);
if(errors.length)throw new Error(`Browser errors: ${JSON.stringify(errors)}`);
console.log(JSON.stringify({ok:true,ready,profileCount:profileAudit.length,idleEngineer,initiative,extractorIncome,buildingSupply,areaSupply,groupAssigned,groupSupply,tiedTruck,buttonAudit,finalState}));
await context.close();await browser.close();
