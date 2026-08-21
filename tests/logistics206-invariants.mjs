import { chromium } from 'playwright';

const base = process.env.FD_BASE_URL || 'http://127.0.0.1:8765/frontline-dominion';
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();
await page.goto(`${base}/index.html?build=206`, { waitUntil: 'domcontentloaded', timeout: 60000 });

await page.evaluate(() => {
  class ResourceNode {
    constructor(game, data = {}) { Object.assign(this, { game, kind:'resource', alive:true, id:data.id, variant:data.variant, amount:data.amount ?? 100000, x:data.x||0, y:data.y||0, radius:35 }, data); }
    extract(amount) { const moved=Math.max(0,Math.min(this.amount,Number(amount)||0));this.amount-=moved;return moved; }
  }
  class Unit {
    constructor(game, data = {}) {
      const stats = game.debug.UNIT_TYPES[data.typeId] || {};
      Object.assign(this, { game, kind:'unit', alive:true, id:data.id, typeId:data.typeId, team:data.team||'player', x:data.x||0, y:data.y||0,
        hp:stats.hp||100, maxHp:stats.hp||100, radius:stats.radius||15, stats:{...stats}, air:Boolean(stats.air), infantry:Boolean(stats.infantry), vehicle:Boolean(stats.vehicle),
        currentCommand:null, commandQueue:[], lastShotAt:-999, lastDamagedAt:-999, weaponCooldown:0, selected:false }, data);
      this.stats={...stats,...(data.stats||{})};this.air=Boolean(this.stats.air);this.infantry=Boolean(this.stats.infantry);this.vehicle=Boolean(this.stats.vehicle);
      if (Number(this.stats.magazineCapacity)>0){this.magazineAmmoMax139=Number(this.stats.magazineCapacity);this.magazineAmmo139=this.magazineAmmoMax139;}
      if (this.air){this.sortieFuelMax=Number(this.stats.sortieFuelMax)||320;this.sortieFuel=this.sortieFuelMax;this.airAmmoMax=Number(this.stats.sortieAmmoMax)||8;this.airAmmo=this.airAmmoMax;}
    }
    serialize(){return {id:this.id,kind:this.kind,typeId:this.typeId,team:this.team,x:this.x,y:this.y,hp:this.hp};}
    setCommand(command){this.currentCommand={...command};this.commandQueue=[this.currentCommand];return true;}
    finishCommand(){this.currentCommand=null;this.commandQueue=[];}
    invalidateNavigation(){}
    stop(){this.finishCommand();return true;}
    heal(amount){this.hp=Math.min(this.maxHp,this.hp+(Number(amount)||0));}
    canAttack(target){return Boolean(target?.alive && target.team!==this.team && this.stats.weapon);}
    fire(target){if(!this.canAttack(target)||this.weaponCooldown>0)return false;this.lastShotAt=this.game.time;this.weaponCooldown=.2;this.game.projectiles.push({id:`p${this.game.projectiles.length+1}`,alive:true,team:this.team,sourceId:this.id});return true;}
    update(dt){this.weaponCooldown=Math.max(0,this.weaponCooldown-dt);if(Number.isFinite(this.magazineReloadRemaining139)&&this.magazineReloadRemaining139>0){this.magazineReloadRemaining139-=dt;if(this.magazineReloadRemaining139<=0)this.magazineAmmo139=this.magazineAmmoMax139;}}
    processCommand(command,dt){
      // Deliberately emulate the old free fixed-wing service; v206 must undo it
      // and reapply only what the physical airfield can provide.
      if(command?.type==='airHangar93'&&(command.stage==='service'||command.stage==='ready')){
        this.sortieFuel=Math.min(this.sortieFuelMax,this.sortieFuel+this.sortieFuelMax*.35*dt);
        this.airAmmo=Math.min(this.airAmmoMax,this.airAmmo+this.airAmmoMax*.5*dt);
        this.hp=Math.min(this.maxHp,this.hp+this.maxHp*.2*dt);
        if(this.sortieFuel>=this.sortieFuelMax&&this.airAmmo>=this.airAmmoMax&&this.hp>=this.maxHp)command.stage='ready';
        return true;
      }
      return false;
    }
    moveTowardInteraction(target){this.x=target.x;this.y=target.y;return true;}
    moveToward(x,y){this.x=x;this.y=y;return true;}
  }
  class Building {
    constructor(game,data={}){const stats=game.debug.BUILDING_TYPES[data.typeId]||{};Object.assign(this,{game,kind:'building',alive:true,completed:true,buildProgress:1,construction:1,id:data.id,typeId:data.typeId,team:data.team||'player',x:data.x||0,y:data.y||0,radius:stats.radius||30,hp:stats.hp||1000,maxHp:stats.hp||1000,stats:{...stats},queue:[],sabotagedUntil:-999,weaponCooldown:0},data);this.stats={...stats,...(data.stats||{})};}
    serialize(){return {id:this.id,kind:this.kind,typeId:this.typeId,team:this.team,x:this.x,y:this.y,hp:this.hp};}
    update(dt){
      if(this.completed&&this.stats.logisticsExtractor&&this.resourceNodeId){const node=this.game.getEntity(this.resourceNodeId);if(node?.alive){this.resourceBuffer83=Number(this.resourceBuffer83)||0;const cap=Number(this.stats.bufferCapacity)||16000;if(this.resourceBuffer83<cap){const got=node.extract(Math.min(Number(this.stats.extractPerTick)||40,cap-this.resourceBuffer83));this.resourceBuffer83+=got;}}}
      this.weaponCooldown=Math.max(0,this.weaponCooldown-dt);
    }
    updateQueue(dt){const item=this.queue?.[0];if(!item)return;item.progress=(item.progress||0)+dt;if(item.progress>=(item.time||.5)){this.spawnUnit(item.id);this.queue.shift();}}
    spawnUnit(typeId){const unit=new Unit(this.game,{id:`u${++this.game.idCounter}`,typeId,team:this.team,x:this.x+20,y:this.y});this.game.addEntity(unit);return unit;}
    fire(target){if(this.weaponCooldown>0||!target?.alive)return false;this.weaponCooldown=.25;this.game.projectiles.push({id:`p${this.game.projectiles.length+1}`,alive:true,team:this.team,sourceId:this.id});return true;}
  }
  class TacticalAI { constructor(game){this.game=game;this.squads=[];} update(){} serialize(){return {};} launchWarOperations126(){this._launched=(this._launched||0)+1;return true;} }
  class Game {
    constructor(debug){this.debug=debug;this.units=[];this.buildings=[];this.resources=[];this.projectiles=[];this.formations=new Map();this.teams={player:{credits:50000,powerFactor:1,powerProduced:100,powerUsed:20,upgrades:new Set(),faction:'vanguard'},enemy:{credits:50000,powerFactor:1,powerProduced:100,powerUsed:20,upgrades:new Set(),faction:'dominion'}};this.stats={resourcesCollected:0};this.time=0;this.simTick=0;this.idCounter=100;this.playerBase={x:0,y:0};this.enemyBase={x:5000,y:0};this.operationalCore160={subsystemHashes:()=>({units:1,buildings:2,projectiles:3,economy:4,operations:5,sectors:6})};this.ai=new TacticalAI(this);}
    getEntity(id){return [...this.units,...this.buildings,...this.resources].find(e=>String(e.id)===String(id))||null;}
    addEntity(e){e.game=this;if(e.kind==='unit')this.units.push(e);else if(e.kind==='building')this.buildings.push(e);else if(e.kind==='resource')this.resources.push(e);return e;}
    removeEntity(e){e.alive=false;this.units=this.units.filter(x=>x!==e);this.buildings=this.buildings.filter(x=>x!==e);}
    queueProduction(building,itemId,kind='unit'){building.queue.push({id:itemId,kind,time:.2,progress:0});return true;}
    simulateFixed(dt){for(const b of [...this.buildings])if(b.alive){b.update(dt);b.updateQueue(dt);}for(const u of [...this.units])if(u.alive){u.update(dt);if(u.currentCommand)u.processCommand(u.currentCommand,dt);}this.time+=dt;this.simTick+=1;return true;}
    hydrate(data){this.logistics206=data?.logistics206||this.logistics206;return true;}
    save(){return true;}
    alert(){}
    addEffect(){}
  }
  const BUILDING_TYPES={
    hq:{name:'HQ',hp:5000,radius:50,produces:['resourceTruck'],dropoff:true},logisticsHub:{name:'Log Hub',hp:2500,radius:40,produces:['resourceTruck'],dropoff:true},resourceSilo:{name:'Silo',hp:2000,radius:35,dropoff:true},supplyBeacon:{name:'Supply Beacon',hp:2000,radius:35,dropoff:true},refinery:{name:'Warehouse',hp:2200,radius:35,dropoff:true},
    oilPump:{name:'Oil',hp:1400,radius:30,placeOnResource:'oil',logisticsExtractor:true,bufferCapacity:18000,extractPerTick:50},gasPump:{name:'Gas',hp:1400,radius:30,placeOnResource:'gas',logisticsExtractor:true,bufferCapacity:18000,extractPerTick:46},mineralQuarry:{name:'Mine',hp:1400,radius:30,placeOnResource:'crystal',logisticsExtractor:true,bufferCapacity:17000,extractPerTick:44},oreMine:{name:'Ore',hp:1400,radius:30,placeOnResource:'alloy',logisticsExtractor:true,bufferCapacity:19000,extractPerTick:50},deepMine:{name:'Deep',hp:1400,radius:30,placeOnResource:'relic',logisticsExtractor:true,bufferCapacity:22000,extractPerTick:56},coreDrill:{name:'Core',hp:1400,radius:30,placeOnResource:'core',logisticsExtractor:true,bufferCapacity:24000,extractPerTick:60},
    airfield:{name:'Airfield',hp:3000,radius:55,produces:[]},advancedAirfield:{name:'Advanced Airfield',hp:3400,radius:60,produces:[]},factory:{name:'Factory',hp:2600,radius:40,category:'production',produces:['tank','resourceTruck']},vehicleDepot:{name:'Vehicle Depot',hp:2400,radius:38,category:'production',produces:['tank','resourceTruck']},heavyFactory:{name:'Heavy Factory',hp:3200,radius:45,category:'production',produces:['tank']},artilleryFoundry:{name:'Artillery Foundry',hp:2800,radius:42,category:'production',produces:['artillery']},barracks:{name:'Barracks',hp:1800,radius:32,category:'production',produces:['infantry']},
    missileBattery:{name:'SAM',hp:1800,radius:28,weapon:{damage:50,targets:['air']}},abmBattery:{name:'ABM',hp:1900,radius:30,weapon:{damage:80,targets:['air']}},orbitalDefense:{name:'Orbital',hp:2200,radius:30,weapon:{damage:100,targets:['air']}},aaTurret:{name:'AA',hp:1200,radius:22,weapon:{damage:20,targets:['air']}},counterUASTower:{name:'CUAS',hp:1200,radius:22,weapon:{damage:20,targets:['air']}},repairBay:{name:'Repair',hp:1800,radius:30},
  };
  const UNIT_TYPES={
    resourceTruck:{name:'Truck',hp:700,speed:170,radius:18,vehicle:true,resourceHauler:true,cargoCapacity:5600,cost:900},
    tank:{name:'Tank',hp:1500,speed:90,radius:20,vehicle:true,cost:2200,magazineCapacity:12,weapon:{damage:80,range:300}},
    infantry:{name:'Infantry',hp:120,speed:70,radius:8,infantry:true,cost:300,magazineCapacity:30,weapon:{damage:12,range:150}},
    artillery:{name:'Artillery',hp:900,speed:65,radius:18,vehicle:true,cost:2600,magazineCapacity:6,weapon:{damage:180,range:800},role:'artillery howitzer'},
    fighter:{name:'Fighter',hp:700,speed:300,radius:18,air:true,mobilityClass:'fixedWing',sortieFuelMax:320,sortieAmmoMax:8,weapon:{damage:70,range:450}},
    helicopter:{name:'Helicopter',hp:900,speed:180,radius:18,air:true,mobilityClass:'rotaryWing',visualRole:'helicopter gunship',sortieFuelMax:420,sortieAmmoMax:12,weapon:{damage:45,range:320}},
    worker:{name:'Worker',hp:100,speed:70,radius:8,cost:200},
  };
  const BUILD_CATEGORIES={economy:{types:['refinery','logisticsHub','resourceSilo']},production:{types:['factory','heavyFactory','artilleryFoundry','airfield','advancedAirfield','barracks']},support:{types:['supplyBeacon','repairBay']},defense:{types:['missileBattery','abmBattery','orbitalDefense','aaTurret','counterUASTower']},technology:{types:[]},strategy:{types:[]}};
  const debug={Game,Unit,Building,TacticalAI,ResourceNode,BUILDING_TYPES,UNIT_TYPES,BUILD_CATEGORIES,getUnitStats:(id)=>UNIT_TYPES[id],getBuildingStats:(id)=>BUILDING_TYPES[id],SAVE_KEY:'test',storageGet:()=>null,storageSet:()=>{},WORLD:{width:10000,height:8000}};
  window.__FD_DEBUG__=debug;
  Game.prototype.debug=debug;
});

for (const file of [
  'logistics-core-v206.js','economic-buildings-v206.js','resource-economy-v206.js','supply-transport-v206.js',
  'unit-sustainment-v206.js','air-logistics-v206.js','production-logistics-v206.js','authoritative-logistics-v206.js','ai-logistics-v206.js'
]) await page.addScriptTag({ url:`${base}/${file}?build=206` });

const report = await page.evaluate(() => {
  const D=window.__FD_DEBUG__,L=window.__FD_LOGISTICS206__;
  const results=[];
  const assert=(condition,message='assertion failed')=>{if(!condition)throw new Error(message);};
  const near=(a,b,eps=.01)=>Math.abs(Number(a)-Number(b))<=eps;
  const run=(id,name,fn)=>{try{fn();results.push({id,name,ok:true});}catch(error){results.push({id,name,ok:false,error:String(error?.message||error)});}};
  const game=()=>new D.Game(D);
  const resource=(g,id,variant,amount=10000,x=0,y=0)=>g.addEntity(new D.ResourceNode(g,{id,variant,amount,x,y}));
  const building=(g,id,typeId,team='player',x=0,y=0)=>g.addEntity(new D.Building(g,{id,typeId,team,x,y}));
  const unit=(g,id,typeId,team='player',x=0,y=0)=>g.addEntity(new D.Unit(g,{id,typeId,team,x,y}));
  const node=(b,fill=0)=>{const n=L.ensureNode(b);for(const k of L.STOCK_KEYS)if(n.stock[`${k}Max`]>0)n.stock[k]=L.round(n.stock[`${k}Max`]*fill);return n;};
  const truck=(g,id,team='player',x=0,y=0)=>{const u=unit(g,id,'resourceTruck',team,x,y),s=L.ensureUnit(u,true);s.cargoCapacity=6000;s.fuelMax=720;s.fuel=720;return u;};
  const stepTruck=(g,t,n=8,dt=1)=>{for(let i=0;i<n;i++){if(!t.currentCommand)t.currentCommand={type:'logistics206'};t.processCommand(t.currentCommand,dt);g.time+=dt;g.simTick++;}};
  const hook=(g,name)=>g.logisticsHooks206().post.find(entry=>entry.fn.name===name)?.fn;

  run(1,'Oil buffer does not teleport Fuel',()=>{const g=game(),r=resource(g,'r1','oil',5000),oil=building(g,'b1','oilPump'),wh=building(g,'w1','resourceSilo', 'player',500,0);oil.resourceNodeId=r.id;node(wh,0);oil.update(1);assert(oil.resourceBuffer83>0,'oil buffer did not grow');assert(wh.logistics206.stock.fuel===0,'warehouse fuel changed without truck');});

  run(2,'Truck moves Fuel extractor→warehouse with conservation',()=>{const g=game(),oil=building(g,'o','oilPump'),wh=building(g,'w','resourceSilo','player',500,0),t=truck(g,'t');node(wh,0);oil.resourceBuffer83=1800;oil.resourceType206='fuel';const before=oil.resourceBuffer83+wh.logistics206.stock.fuel+L.ensureUnit(t).cargo.fuel;g.setLogisticsMission206({truckIds:[t.id],missionType:'EXTRACT_RESOURCE',sourceNodeId:oil.id,destinationNodeId:wh.id});stepTruck(g,t,10);const after=oil.resourceBuffer83+wh.logistics206.stock.fuel+L.ensureUnit(t).cargo.fuel;assert(wh.logistics206.stock.fuel>0,'no delivered fuel');assert(near(before,after),'fuel not conserved');});

  run(3,'Destroyed truck loses current cargo',()=>{const g=game(),t=truck(g,'t');const s=L.ensureUnit(t);s.cargo.fuel=500;s.cargo.ammo=300;s.cargo.support=100;const watch=hook(g,'truckLossWatch206');assert(watch,'loss hook missing');watch.call(g,.1);t.alive=false;g.units=[];watch.call(g,.1);assert(g.logistics206.telemetry.fuelLostInTransit>=500,'fuel loss not recorded');assert(g.logistics206.telemetry.ammoLostInTransit>=300,'ammo loss not recorded');assert(g.logistics206.telemetry.trucksDestroyed===1,'truck loss not counted');});

  run(4,'Iron mine buffer→Ammo warehouse',()=>{const g=game(),mine=building(g,'m','oreMine'),wh=building(g,'w','resourceSilo','player',500,0),t=truck(g,'t');node(wh,0);mine.resourceBuffer83=1600;mine.resourceType206='ammo';const before=mine.resourceBuffer83+wh.logistics206.stock.ammo;g.setLogisticsMission206({truckIds:[t.id],missionType:'EXTRACT_RESOURCE',sourceNodeId:mine.id,destinationNodeId:wh.id});stepTruck(g,t,10);const after=mine.resourceBuffer83+wh.logistics206.stock.ammo+L.ensureUnit(t).cargo.ammo;assert(wh.logistics206.stock.ammo>0,'no delivered ammo');assert(near(before,after),'ammo not conserved');});

  run(5,'Trade purchase spends Money and fills only import buffer',()=>{const g=game(),trade=building(g,'x','financialTradeCenter');const n=node(trade,0);g.teams.player.credits=10000;const money=g.teams.player.credits;const bought=g.executeImport206(trade,'fuel',1000,false);assert(bought>0,'purchase failed');assert(g.teams.player.credits<money,'money not spent');assert(n.importBuffer.fuel===bought,'fuel not in import buffer');assert(n.stock.fuel===0,'fuel teleported into stock');});

  run(6,'Import cannot reach warehouse without truck',()=>{const g=game(),trade=building(g,'x','financialTradeCenter'),wh=building(g,'w','resourceSilo','player',600,0);node(trade,0);node(wh,0);g.executeImport206(trade,'ammo',900,false);assert(wh.logistics206.stock.ammo===0,'warehouse received import without transport');});

  run(7,'Supply Building truck delivers demanded mix',()=>{const g=game(),src=building(g,'s','logisticsHub'),dest=building(g,'d','forwardSupplyCenter','player',600,0),t=truck(g,'t');node(src,1);node(dest,0);g.setLogisticsMission206({truckIds:[t.id],missionType:'SUPPLY_BUILDING',destinationNodeId:dest.id,homeNodeId:dest.id});stepTruck(g,t,12);assert(dest.logistics206.stock.fuel>0&&dest.logistics206.stock.ammo>0&&dest.logistics206.stock.support>0,'building not supplied');assert(src.logistics206.stock.fuel<src.logistics206.stock.fuelMax,'source not debited');});

  run(8,'Supply Area serves units and returns to planning',()=>{const g=game(),t=truck(g,'t', 'player',100,100),tank=unit(g,'v','tank','player',100,100),s=L.ensureUnit(tank,true),ts=L.ensureUnit(t);s.fuel=0;s.ammoReserve=0;s.support=0;ts.cargo.fuel=900;ts.cargo.ammo=900;ts.cargo.support=500;ts.missionType='SUPPLY_AREA';ts.targetX=100;ts.targetY=100;ts.serviceRadius=680;ts.phase206='SERVICE';t.currentCommand={type:'logistics206'};const before=L.manifestTotal(ts.cargo);t.processCommand(t.currentCommand,1);assert(s.fuel>0&&s.ammoReserve>0&&s.support>0,'area did not resupply unit');assert(L.manifestTotal(ts.cargo)<before,'truck cargo not debited');});

  run(9,'Supply Group holds rear standoff',()=>{const g=game(),t=truck(g,'t','player',0,0),a=unit(g,'a','tank','player',1000,1000),b=unit(g,'b','tank','player',1200,1000),ts=L.ensureUnit(t);g.formations.set('G',{unitIds:[a.id,b.id]});ts.missionType='SUPPLY_GROUP';ts.targetGroupId='G';ts.phase206='TO_DEST';ts.cargo.fuel=100;t.currentCommand={type:'logistics206'};t.processCommand(t.currentCommand,1);const cx=1100,cy=1000;assert(t.x<cx,'truck not behind group relative to friendly base');assert(Math.hypot(t.x-cx,t.y-cy)>250,'standoff too small');});

  run(10,'Ground vehicle consumes Fuel by distance',()=>{const g=game(),v=unit(g,'v','tank'),s=L.ensureUnit(v,true),post=hook(g,'sustainmentPost206');assert(post,'sustainment hook missing');post.call(g,.1);const before=s.fuel;v.x+=120;post.call(g,.1);assert(s.fuel<before,'movement did not consume fuel');});

  run(11,'Fuel EMPTY blocks movement but not weapon state',()=>{const g=game(),v=unit(g,'v','tank'),s=L.ensureUnit(v,true),post=hook(g,'sustainmentPost206');post.call(g,.1);s.fuel=0;const ammo=s.ammoReady;const x=v.x;v.x+=100;post.call(g,.1);assert(near(v.x,x),'empty vehicle still moved');assert(s.ammoReady===ammo&&s.ammoReady>0,'fuel shortage altered ammo');assert(!/fuel/i.test(D.Unit.prototype.fire.toString()),'fire path directly blocks on fuel');});

  run(12,'Ammo EMPTY blocks fire but not movement',()=>{const g=game(),v=unit(g,'v','tank'),s=L.ensureUnit(v,true),post=hook(g,'sustainmentPost206');s.ammoReady=0;s.ammoReserve=0;v.magazineAmmo139=0;const target=unit(g,'e','tank','enemy',50,0);assert(v.fire(target)===false,'ammo-empty unit fired');post.call(g,.1);const fuel=s.fuel;v.x+=90;post.call(g,.1);assert(v.x>0&&s.fuel<fuel,'ammo-empty unit could not move');});

  run(13,'Reload cannot create Ammo from nothing',()=>{const g=game(),v=unit(g,'v','tank'),s=L.ensureUnit(v,true);s.ammoReady=0;s.ammoReserve=0;v.magazineAmmo139=0;assert(g.consumeReserveMagazine206(v)===false,'reload accepted zero reserve');for(let i=0;i<20;i++)v.update(1);assert(s.ammoReady===0&&v.magazineAmmo139===0,'reload created ammo');});

  run(14,'External resupply debits Ammo source',()=>{const g=game(),t=truck(g,'t', 'player',0,0),v=unit(g,'v','tank','player',0,0),ts=L.ensureUnit(t),vs=L.ensureUnit(v,true);vs.ammoReserve=0;ts.cargo.ammo=700;ts.missionType='SUPPLY_AREA';ts.targetX=0;ts.targetY=0;ts.phase206='SERVICE';t.currentCommand={type:'logistics206'};const before=ts.cargo.ammo;t.processCommand(t.currentCommand,1);assert(vs.ammoReserve>0,'unit did not receive ammo');assert(ts.cargo.ammo<before,'source ammo not debited');});

  run(15,'Fixed-wing service consumes airfield Fuel/Ammo/Support',()=>{const g=game(),field=building(g,'af','airfield'),n=node(field,1),f=unit(g,'f','fighter','player',field.x,field.y);f.sortieFuel=100;f.airAmmo=1;f.hp=f.maxHp*.5;const fs=L.ensureUnit(f,false);fs.support=0;f.airServiceTargetId=field.id;f.airServiceState='servicing';const command={type:'airHangar93',airfieldId:field.id,stage:'service'};const before={fuel:n.stock.fuel,ammo:n.stock.ammo,support:n.stock.support};f.processCommand(command,1);assert(n.stock.fuel<before.fuel,'airfield fuel not debited');assert(n.stock.ammo<before.ammo,'airfield ammo not debited');assert(n.stock.support<before.support,'airfield support not debited');assert(f.sortieFuel>100&&f.airAmmo>1,'aircraft not serviced');});

  run(16,'Aircraft cannot resupply from field truck radius',()=>{const g=game(),t=truck(g,'t'),f=unit(g,'f','fighter','player',0,0),ts=L.ensureUnit(t),fs=L.ensureUnit(f,false);fs.fuel=0;fs.ammoReady=0;ts.cargo.fuel=500;ts.cargo.ammo=500;ts.cargo.support=500;ts.missionType='SUPPLY_AREA';ts.targetX=0;ts.targetY=0;ts.phase206='SERVICE';t.currentCommand={type:'logistics206'};t.processCommand(t.currentCommand,1);assert(fs.fuel===0&&fs.ammoReady===0,'truck resupplied aircraft in field');});

  run(17,'Helicopter uses the same airfield physical stocks',()=>{const g=game(),field=building(g,'af','airfield'),n=node(field,1),h=unit(g,'h','helicopter','player',0,0),hs=L.ensureUnit(h,false);h.sortieFuel=80;h.airAmmo=2;h.hp=h.maxHp*.7;hs.fuel=80;hs.ammoReady=2;hs.support=0;h.airServiceTargetId=field.id;const command={type:'airService206',airfieldId:field.id,stage:'service'};const before=n.stock.fuel;g.processHelicopterService206(h,command,1);assert(n.stock.fuel<before,'helicopter service did not consume field fuel');assert(h.sortieFuel>80,'helicopter did not refuel');});

  run(18,'AD/ABM reload requires local Ammo stock',()=>{const source=D.Building.prototype.update.toString()+D.Building.prototype.fire.toString();assert(/weaponReady206/.test(source),'finite ready missiles absent');assert(/stock\.ammo/.test(source),'defense reload not tied to local ammo');assert(!/credits/.test(source),'defense reload still tied directly to money');});

  run(19,'Money zero does not erase existing Fuel/Ammo',()=>{const g=game(),wh=building(g,'w','resourceSilo'),n=node(wh,.5);g.teams.player.credits=0;const before={fuel:n.stock.fuel,ammo:n.stock.ammo};const econ=hook(g,'economyPost206');econ.call(g,1);assert(n.stock.fuel===before.fuel&&n.stock.ammo===before.ammo,'physical stock disappeared at Money=0');});

  run(20,'Support production stops without Money',()=>{const g=game(),wh=building(g,'w','resourceSilo'),n=node(wh,0);g.teams.player.credits=0;const econ=hook(g,'economyPost206');const before=n.stock.support;for(let i=0;i<5;i++)econ.call(g,1);assert(n.stock.support===before,'Support created without Money');});

  run(21,'Route break does not instantly disable local autonomy',()=>{const g=game(),v=unit(g,'v','tank'),s=L.ensureUnit(v,true);const before=L.unitReadiness(v);g.buildings=[];for(const t of g.units.filter(L.isTruck))t.alive=false;const after=L.unitReadiness(v);assert(after.supply>.8&&near(after.supply,before.supply),'unit lost supply instantly after route break');});

  run(22,'Save/load preserves exact logistics quantities',()=>{const g=game(),wh=building(g,'w','resourceSilo'),t=truck(g,'t'),wn=node(wh,.4),ts=L.ensureUnit(t);ts.cargo={fuel:123,ammo:456,support:78,fuelMax:6000,ammoMax:6000,supportMax:6000};ts.missionType='SUPPLY_BUILDING';ts.destinationNodeId=wh.id;const raw={root:g.exportLogistics206(),entities:[wh.serialize(),t.serialize()]};const clone=JSON.parse(JSON.stringify(raw));assert(clone.entities[0].logistics206.stock.fuel===wn.stock.fuel,'node stock changed in serialization');assert(clone.entities[1].logistics206.cargo.ammo===456,'cargo lost in serialization');assert(clone.entities[1].logistics206.missionType==='SUPPLY_BUILDING','mission lost in serialization');});

  run(23,'Two canonical simulations hash identical logistics state',()=>{const make=()=>{const g=game(),wh=building(g,'w','resourceSilo'),t=truck(g,'t');node(wh,.37);const s=L.ensureUnit(t);s.cargo.fuel=111;s.cargo.ammo=222;s.missionType='SUPPLY_BUILDING';s.destinationNodeId=wh.id;return g;};const a=make(),b=make();assert(a.networkLogisticsHash206(false)===b.networkLogisticsHash206(false),'canonical logistics hash differs');});

  run(24,'Save/reconnect import causes no resource duplication',()=>{const g=game(),wh=building(g,'w','resourceSilo'),t=truck(g,'t');node(wh,.5);const s=L.ensureUnit(t);s.cargo.fuel=400;s.cargo.ammo=250;const before=L.totalPhysical(g,'player'),root=g.exportLogistics206();g.importLogistics206(JSON.parse(JSON.stringify(root)));const after=L.totalPhysical(g,'player');for(const k of L.STOCK_KEYS)assert(near(before[k],after[k]),`${k} duplicated after import`);});

  run(25,'AI builds/operates production→warehouse→PMTO→frontline chain',()=>{const g=game(),central=building(g,'c','logisticsHub','enemy',4500,0),pmto=building(g,'p','forwardSupplyCenter','enemy',3500,0),trade=building(g,'x','financialTradeCenter','enemy',4700,200),mine=building(g,'m','oreMine','enemy',4800,-200),t=truck(g,'t','enemy',4500,0),front=unit(g,'v','tank','enemy',2500,0);node(central,.9);node(pmto,.05);node(trade,0);mine.resourceBuffer83=1200;mine.resourceType206='ammo';const fs=L.ensureUnit(front,true);fs.fuel*=.4;fs.ammoReserve*=.3;fs.support*=.5;const ai=new D.TacticalAI(g);const metrics=ai.managePhysicalLogistics206();assert(trade.logistics206.trade.fuel.mode==='MAINTAIN_STOCK'&&trade.logistics206.trade.ammo.mode==='MAINTAIN_STOCK','AI did not configure import');assert(['HIGH','CRITICAL'].includes(pmto.logistics206.priority),'AI did not prioritize PMTO');assert(L.ensureUnit(t).missionType==='SUPPLY_BUILDING','AI did not assign truck');assert(metrics.nodeCount>=3&&metrics.truckCount>=1,'AI logistics aggregates invalid');});

  return results;
});

const failures = report.filter(test => !test.ok);
for (const test of report) console.log(`${test.ok ? 'PASS' : 'FAIL'} TEST ${test.id}: ${test.name}${test.error ? ` — ${test.error}` : ''}`);
if (report.length !== 25) throw new Error(`Expected 25 tests, got ${report.length}`);
if (failures.length) throw new Error(`${failures.length} logistics invariant tests failed: ${JSON.stringify(failures)}`);
console.log(JSON.stringify({ ok:true, passed:report.length, report }));
await context.close();
await browser.close();
