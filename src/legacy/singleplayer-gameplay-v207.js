(() => {
  'use strict';
  const root = typeof window !== 'undefined' ? window : self;
  const D = root.__FD_DEBUG__;
  const L = root.__FD_LOGISTICS206__;
  if (!D?.Game || !D?.Unit || !D?.Building || !L) return;
  const { Game, Unit } = D;
  if (Game.prototype.__fdSingleplayer207Installed) return;
  Object.defineProperty(Game.prototype, '__fdSingleplayer207Installed', { value: true, configurable: true });

  const BUILD = 207;
  const VERSION = '16.9.1';
  const EPS = 1e-6;
  const WORKER_CAPACITY = 450;
  const WORKER_LOAD_RATE = 220;
  const WORKER_UNLOAD_RATE = 260;
  const TRUCK_TANK = 720;
  const FUEL_DEPOT_MAX = 4_000_000;
  const IRON_DEPOT_MAX = 4_800_000;
  const LEGACY_FUEL_VARIANTS = new Set(['oil', 'gas']);
  const LEGACY_IRON_VARIANTS = new Set(['crystal', 'alloy', 'relic', 'core', 'salvage', 'mineral', 'ore', 'iron']);
  const CANONICAL_EXTRACTORS = new Set(['oilPump', 'gasPump']);
  const LEGACY_EXTRACTORS = new Set(['mineralQuarry', 'oreMine', 'deepMine', 'coreDrill', 'ironMine']);

  const round = value => L.round(Number(value) || 0);
  const dist = (a,b) => Math.hypot((Number(a?.x)||0)-(Number(b?.x)||0),(Number(a?.y)||0)-(Number(b?.y)||0));
  const isWorker = unit => Boolean(unit?.alive !== false && unit.typeId === 'worker');

  // ---------- exactly two player-facing extraction buildings ----------
  const BUILDING_TYPES = D.BUILDING_TYPES || {};
  const oilStats = BUILDING_TYPES.oilPump;
  const ironStats = BUILDING_TYPES.gasPump;
  if (oilStats) {
    oilStats.name = 'Нефтеперерабатывающий комплекс';
    oilStats.role = 'Добывает нефть, перерабатывает её в топливо и накапливает топливо в локальном резервуаре. Требует физического вывоза.';
    oilStats.extractor = false;
    oilStats.logisticsExtractor = true;
    oilStats.placeOnResource = 'oil';
    oilStats.resourceType206 = 'fuel';
    oilStats.bufferCapacity = 36000;
    oilStats.extractPerTick = 72;
    oilStats.incomeInterval = 1;
  }
  if (ironStats) {
    ironStats.name = 'Железорудный рудник';
    ironStats.role = 'Добывает железную руду и агрегированно формирует ресурс боеприпасов в локальном складе. Требует физического вывоза.';
    ironStats.extractor = false;
    ironStats.logisticsExtractor = true;
    ironStats.placeOnResource = 'crystal';
    ironStats.resourceType206 = 'ammo';
    ironStats.bufferCapacity = 30000;
    ironStats.extractPerTick = 64;
    ironStats.incomeInterval = 1;
  }
  for (const typeId of LEGACY_EXTRACTORS) {
    const stats = BUILDING_TYPES[typeId];
    if (!stats) continue;
    stats.name = 'Железорудный рудник (наследие)';
    stats.resourceType206 = 'ammo';
  }
  for (const category of Object.values(D.BUILD_CATEGORIES || {})) {
    if (!Array.isArray(category?.types)) continue;
    category.types = category.types.filter(typeId => !LEGACY_EXTRACTORS.has(typeId));
    const extraction = category.types.filter(typeId => CANONICAL_EXTRACTORS.has(typeId));
    if (extraction.length) {
      category.types = category.types.filter(typeId => !CANONICAL_EXTRACTORS.has(typeId));
      category.types.push('oilPump', 'gasPump');
      category.types = [...new Set(category.types)];
    }
  }

  function reserveClass207(node) {
    const original = Math.max(1, Number(node?.maxAmount) || Number(node?.amount) || 1);
    if (original >= 1_000_000) return 2;
    if (original >= 500_000) return 1;
    return 0;
  }

  function normalizeResourceNode207(node) {
    if (!node?.alive || node.kind !== 'resource') return null;
    const oldVariant = String(node.variant || '').toLowerCase();
    let kind = node.resourceKind207;
    if (kind !== 'fuel' && kind !== 'iron') {
      if (LEGACY_FUEL_VARIANTS.has(oldVariant)) kind = 'fuel';
      else if (LEGACY_IRON_VARIANTS.has(oldVariant)) kind = 'iron';
      else kind = ((String(node.id || '').split('').reduce((h,c)=>((h*33)^c.charCodeAt(0))>>>0,5381)&3)===0) ? 'fuel' : 'iron';
    }
    const previousMax = Math.max(1, Number(node.maxAmount) || Number(node.amount) || 1);
    const ratio = Math.max(0, Math.min(1, (Number(node.amount) || 0) / previousMax));
    const richness = reserveClass207(node);
    const base = kind === 'fuel' ? 2_000_000 : 2_400_000;
    const canonicalMax = richness === 2 ? base * 2.5 : richness === 1 ? base * 1.65 : base;
    node.resourceKind207 = kind;
    node.variant = kind === 'fuel' ? 'oil' : 'crystal';
    node.maxAmount = Math.max(canonicalMax, Number(node.maxAmount207) || 0);
    node.maxAmount207 = node.maxAmount;
    if (!node.__fdResourceNormalized207) node.amount = round(node.maxAmount * ratio);
    else node.amount = Math.min(node.maxAmount, Math.max(0, Number(node.amount)||0));
    node.regenRate = 0;
    node.__fdResourceNormalized207 = true;
    return kind;
  }

  function normalizeExtractor207(game, building) {
    if (!building?.alive || building.kind !== 'building') return;
    let resource = L.extractorResourceType(building);
    if (!resource && CANONICAL_EXTRACTORS.has(building.typeId)) resource = building.typeId === 'oilPump' ? 'fuel' : 'ammo';
    if (!resource) return;
    building.resourceType206 = resource;
    const canonical = building.typeId === 'oilPump' ? oilStats : building.typeId === 'gasPump' ? ironStats : null;
    if (canonical) {
      building.resourceBufferMax206 = Number(canonical.bufferCapacity) || (resource === 'fuel' ? 36000 : 30000);
      building.stats.name = canonical.name;
      building.stats.role = canonical.role;
    }
    if (!Number.isFinite(building.resourceBuffer83)) building.resourceBuffer83 = 0;
    building.resourceBuffer83 = Math.min(Number(building.resourceBufferMax206 || building.stats?.bufferCapacity || 30000), Math.max(0, Number(building.resourceBuffer83)||0));
    const node = game.getEntity?.(building.resourceNodeId);
    if (node?.kind === 'resource') {
      const kind = normalizeResourceNode207(node);
      if (resource === 'fuel' && kind !== 'fuel') { node.resourceKind207='fuel'; node.variant='oil'; }
      if (resource === 'ammo' && kind !== 'iron') { node.resourceKind207='iron'; node.variant='crystal'; }
      node.extractorBuildingId = building.id;
    }
  }

  function normalizeWorld207(game) {
    for (const node of game.resources || []) normalizeResourceNode207(node);
    for (const building of game.buildings || []) normalizeExtractor207(game, building);
  }

  const baseInitialize207 = Game.prototype.initializeBattle;
  if (typeof baseInitialize207 === 'function') Game.prototype.initializeBattle = function(...args) {
    const result = baseInitialize207.apply(this,args);
    normalizeWorld207(this);
    return result;
  };
  const baseHydrate207 = Game.prototype.hydrate;
  if (typeof baseHydrate207 === 'function') Game.prototype.hydrate = function(data,...args) {
    const result = baseHydrate207.call(this,data,...args);
    normalizeWorld207(this);
    if (Array.isArray(data?.entities)) {
      const byId = new Map(data.entities.map(item=>[item?.id,item]));
      for (const unit of this.units || []) {
        const saved = byId.get(unit.id);
        if (!isWorker(unit) || !saved) continue;
        if (saved.workerCargo207) unit.workerCargo207 = {
          fuel: Math.max(0,Number(saved.workerCargo207.fuel)||0),
          ammo: Math.max(0,Number(saved.workerCargo207.ammo)||0),
          support: Math.max(0,Number(saved.workerCargo207.support)||0),
        };
        if (saved.workerHaul207) unit.workerHaul207 = { ...saved.workerHaul207 };
      }
    }
    return result;
  };

  // ---------- worker physical hauling ----------
  function workerCargo207(unit) {
    unit.workerCargo207 ||= { fuel:0, ammo:0, support:0 };
    return unit.workerCargo207;
  }
  const workerTotal207 = unit => L.manifestTotal(workerCargo207(unit));
  function sourceFromCommand207(unit, command) {
    let source = unit.game?.getEntity?.(command?.resourceId || command?.sourceNodeId || command?.sourceId);
    if (source?.kind === 'resource') source = unit.game?.getEntity?.(source.extractorBuildingId) || null;
    if (!source?.alive || source.kind !== 'building' || !L.ensureExtractor(source)) return null;
    return source;
  }
  function nearestDropoff207(unit, source, resource) {
    return (unit.game?.buildings || []).filter(b=>b?.alive&&b.completed&&b.team===unit.team&&b.id!==source?.id&&L.ensureNode(b)?.stock)
      .filter(b=>Number(L.ensureNode(b).stock?.[`${resource}Max`])>0 && Number(L.ensureNode(b).stock?.[resource]) < Number(L.ensureNode(b).stock?.[`${resource}Max`])-EPS)
      .map(b=>({b, node:L.ensureNode(b), score:dist(unit,b)+({central:0,warehouse:80,production:130,pmto:160,terminal:180}[L.ensureNode(b).nodeType]??280)}))
      .sort((a,b)=>a.score-b.score||String(a.b.id).localeCompare(String(b.b.id),'en'))[0]?.b || null;
  }
  function moveWorker207(unit,target,dt) {
    if (!target) return false;
    const range = Math.max(26,Number(unit.radius||16)+Number(target.radius||0)+8);
    if (dist(unit,target)<=range) return true;
    if (typeof unit.moveTowardInteraction==='function' && target.id) return Boolean(unit.moveTowardInteraction(target,unit.currentCommand,dt,'worker-logistics207'));
    return Boolean(unit.moveToward?.(target.x,target.y,dt,.95));
  }

  const legacyProcessHarvest207 = Unit.prototype.processHarvest;
  Unit.prototype.processHarvest = function(command,dt) {
    if (!isWorker(this)) return legacyProcessHarvest207?.call(this,command,dt);
    const source = sourceFromCommand207(this,command);
    if (!source) { this.workerHaul207=null; this.finishCommand?.(); return false; }
    const resource = L.extractorResourceType(source) || 'ammo';
    const cargo = workerCargo207(this);
    this.workerHaul207 ||= { sourceId:source.id, destinationId:null, resource, phase:'load' };
    const haul = this.workerHaul207;
    haul.sourceId=source.id; haul.resource=resource;

    if (haul.phase==='load') {
      if (!moveWorker207(this,source,dt)) return true;
      const room=Math.max(0,WORKER_CAPACITY-workerTotal207(this));
      const available=Math.max(0,Number(source.resourceBuffer83)||0);
      const moved=round(Math.min(room,available,WORKER_LOAD_RATE*dt));
      if(moved>EPS){source.resourceBuffer83=round(available-moved);cargo[resource]=round(Number(cargo[resource]||0)+moved);this.game.uiDirty=true;}
      if(room<=EPS || workerTotal207(this)>=WORKER_CAPACITY-EPS || (available<=EPS&&workerTotal207(this)>EPS)){
        const destination=nearestDropoff207(this,source,resource);
        if(!destination){this.game.alert?.('Инженеру некуда выгружать ресурс: нет свободной ёмкости','warning',this.x,this.y);return true;}
        haul.destinationId=destination.id;haul.phase='unload';this.invalidateNavigation?.();
      }
      return true;
    }

    const destination=this.game.getEntity?.(haul.destinationId);
    if(!destination?.alive || !L.ensureNode(destination)?.stock){haul.destinationId=null;haul.phase='load';return true;}
    if(!moveWorker207(this,destination,dt))return true;
    const node=L.ensureNode(destination),stock=node.stock;
    const room=Math.max(0,Number(stock[`${resource}Max`])-Number(stock[resource]));
    const moved=round(Math.min(room,Number(cargo[resource])||0,WORKER_UNLOAD_RATE*dt));
    if(moved>EPS){cargo[resource]=round(Number(cargo[resource])-moved);stock[resource]=round(Number(stock[resource])+moved);const telemetry=L.ensureGame(this.game).telemetry;telemetry.transfers=round(Number(telemetry.transfers||0)+moved);this.game.uiDirty=true;}
    if((Number(cargo[resource])||0)<=EPS || room<=EPS){haul.phase='load';haul.destinationId=null;this.invalidateNavigation?.();}
    return true;
  };

  const baseUnitSerialize207 = Unit.prototype.serialize;
  if (typeof baseUnitSerialize207 === 'function') Unit.prototype.serialize = function() {
    const data=baseUnitSerialize207.call(this);
    if(isWorker(this)){
      data.workerCargo207={...workerCargo207(this)};
      data.workerHaul207=this.workerHaul207?{...this.workerHaul207}:null;
    }
    return data;
  };

  // Idle engineers automatically evacuate extractor buffers, while direct user orders always win.
  function workerAutomation207(game,dt){
    game._workerAutomation207=(Number(game._workerAutomation207)||0)+dt;
    if(game._workerAutomation207<1)return;game._workerAutomation207=0;
    const extractors=(game.buildings||[]).filter(b=>b?.alive&&b.completed&&b.team==='player'&&L.ensureExtractor(b)&&(Number(b.resourceBuffer83)||0)>80);
    if(!extractors.length)return;
    for(const unit of (game.units||[]).filter(u=>isWorker(u)&&u.team==='player').sort((a,b)=>String(a.id).localeCompare(String(b.id),'en'))){
      const cmd=unit.currentCommand;
      if(cmd && !['idle','harvest'].includes(cmd.type))continue;
      if(cmd?.type==='harvest')continue;
      const source=[...extractors].sort((a,b)=>dist(unit,a)-dist(unit,b)||String(a.id).localeCompare(String(b.id),'en'))[0];
      if(!source)continue;
      const next={type:'harvest',resourceId:source.id,sourceNodeId:source.id,autoLogistics207:true};
      if(typeof unit.setCommand==='function')unit.setCommand(next,false);else unit.commandQueue=[next];
    }
  }
  Game.prototype.registerLogisticsHook206?.('post',workerAutomation207,38);

  // ---------- physical truck tank refuelling; prevents zero-fuel deadlock ----------
  function fuelStoreAt207(entity){
    if(!entity?.alive)return null;
    const ex=L.ensureExtractor(entity);
    if(ex?.resourceType==='fuel')return {get:()=>Math.max(0,Number(entity.resourceBuffer83)||0),set:v=>{entity.resourceBuffer83=round(Math.max(0,v));}};
    const node=L.ensureNode(entity);
    if(node?.stock&&Number(node.stock.fuelMax)>0){const typeStats=D.BUILDING_TYPES?.[entity.typeId],tied=Boolean(entity.stats?.tiedSupplyTransport208||typeStats?.tiedSupplyTransport208||entity.stats?.produces?.includes?.('resourceTruck')||typeStats?.produces?.includes?.('resourceTruck'));const reserve=tied?Math.min(TRUCK_TANK,Math.max(0,Number(node.stock.fuel)||0)):0;return {get:()=>Math.max(0,(Number(node.stock.fuel)||0)-reserve),set:v=>{node.stock.fuel=round(Math.max(0,v)+reserve);}};}
    return null;
  }
  function truckRefuel207(game,dt){
    for(const truck of game.units||[]){
      if(!truck?.alive||!L.isTruck(truck))continue;
      const s=L.ensureUnit(truck,false);if(!s)continue;
      if(!(Number(s.fuelMax)>0)){s.fuelMax=TRUCK_TANK;s.fuel=TRUCK_TANK;}
      s.fuel=Math.max(0,Math.min(s.fuelMax,Number(s.fuel)||0));
      if(s.fuel>=s.fuelMax*.92)continue;
      let need=Math.max(0,s.fuelMax-s.fuel);
      const cargoFuel=Math.max(0,Number(s.cargo?.fuel)||0);
      if(cargoFuel>EPS){
        const amount=round(Math.min(need,cargoFuel,1800*dt));
        s.cargo.fuel=round(cargoFuel-amount);s.fuel=round(s.fuel+amount);need-=amount;
      }
      if(need>EPS){
        const nearby=(game.buildings||[]).filter(b=>b?.alive&&b.completed&&b.team===truck.team&&dist(truck,b)<=Math.max(80,Number(truck.radius||20)+Number(b.radius||0)+42)&&fuelStoreAt207(b))
          .sort((a,b)=>dist(truck,a)-dist(truck,b)||String(a.id).localeCompare(String(b.id),'en'))[0];
        const store=fuelStoreAt207(nearby);
        if(store){const available=store.get();const amount=round(Math.min(need,available,2100*dt));if(amount>EPS){store.set(available-amount);s.fuel=round(s.fuel+amount);}}
      }
      if(s.fuel<=EPS){s.status='ОСТАНОВЛЕН: НЕТ ТОПЛИВА';truck.motionSpeed=0;truck.speedCurrent=0;}
      else if(s.status==='ОСТАНОВЛЕН: НЕТ ТОПЛИВА')s.status='ДОЗАПРАВЛЕН';
    }
  }
  Game.prototype.registerLogisticsHook206?.('post',truckRefuel207,44);

  // Keep extractor metadata coherent even when construction completes after initial normalization.
  function extractorMaintenance207(game,dt){
    game._extractorMaintenance207=(Number(game._extractorMaintenance207)||0)+dt;
    if(game._extractorMaintenance207<.5)return;game._extractorMaintenance207=0;
    for(const building of game.buildings||[])normalizeExtractor207(game,building);
  }
  Game.prototype.registerLogisticsHook206?.('post',extractorMaintenance207,18);

  root.__FD_SINGLEPLAYER_207__={build:BUILD,version:VERSION,normalizeWorld207,normalizeResourceNode207,workerCargo207,WORKER_CAPACITY};
})();
