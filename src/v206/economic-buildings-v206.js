(() => {
  'use strict';
  const root=typeof window!=='undefined'?window:self;
  const D=root.__FD_DEBUG__,L=root.__FD_LOGISTICS206__;
  if(!D?.BUILDING_TYPES||!D?.BUILD_CATEGORIES||!D?.Building||!D?.Game||!L)return;
  if(root.__FD_ECONOMIC_BUILDINGS206__)return;
  const B=D.BUILDING_TYPES,C=D.BUILD_CATEGORIES,Building=D.Building,Game=D.Game;

  const defs={
    financialCenter:{name:'Финансовый центр',icon:'₽',cost:3200,time:34,hp:2450,radius:34,powerUse:42,category:'economy',incomePerCycle206:42,role:'Стабильный источник Money. Несколько центров дают убывающую, но положительную дополнительную отдачу.'},
    financialTradeCenter:{name:'Финансово-торговый центр',icon:'⇄',cost:4200,time:42,hp:2700,radius:37,powerUse:54,category:'economy',incomePerCycle206:16,dropoff:true,produces:['resourceTruck'],role:'Товарная биржа: доход, детерминированный импорт Fuel/Ammo во внутренний буфер и собственные транспортные слоты.'},
    industrialCommercialCenter:{name:'Промышленно-коммерческий центр',icon:'▤',cost:3900,time:40,hp:2850,radius:38,powerUse:58,category:'economy',incomePerCycle206:18,role:'Умеренный Money income и ограниченный суммируемый бонус скорости промышленного производства.'},
    logisticsCommercialTerminal:{name:'Логистико-коммерческий терминал',icon:'▰',cost:4600,time:46,hp:3400,radius:43,powerUse:48,category:'economy',incomePerCycle206:11,dropoff:true,produces:['resourceTruck'],role:'Крупный тыловой распределительный узел: большой физический запас, высокая скорость погрузки и несколько транспортных слотов.'},
    forwardSupplyCenter:{name:'ПМТО · передовой центр снабжения',icon:'✚',cost:3500,time:38,hp:3150,radius:42,powerUse:24,category:'support',dropoff:true,produces:['resourceTruck'],role:'Передовой физический узел Fuel/Ammo/Support. Не создаёт ресурсы; хранит, принимает и распределяет их, сокращая плечо подвоза.'},
  };
  for(const [id,def] of Object.entries(defs)){
    if(B[id])Object.assign(B[id],def);else B[id]={...def};
    if(!Array.isArray(B[id].requires))B[id].requires=[];
    if(!Array.isArray(B[id].produces))B[id].produces=[];
  }
  const pushUnique=(arr,id)=>{if(Array.isArray(arr)&&!arr.includes(id))arr.push(id);};
  for(const id of ['financialCenter','financialTradeCenter','industrialCommercialCenter','logisticsCommercialTerminal'])pushUnique(C.economy?.types,id);
  pushUnique(C.support?.types,'forwardSupplyCenter');

  // Existing storage/logistics structures also become valid truck factories, preserving the low-micromanagement loop.
  for(const id of ['logisticsHub','resourceSilo','refinery','supplyBeacon']){
    const stats=B[id];if(!stats)continue;stats.produces ||= [];pushUnique(stats.produces,'resourceTruck');stats.dropoff=true;
  }

  const baseQueueUpdate206=Building.prototype.updateQueue;
  if(typeof baseQueueUpdate206==='function')Building.prototype.updateQueue=function(dt){
    const bonus=this.completed?this.game.getIndustrialBonus206?.(this.team)?.speed||0:0;
    const eligible=this.stats?.category==='production'||['airfield','advancedAirfield','barracks'].includes(this.typeId);
    return baseQueueUpdate206.call(this,eligible?dt*(1+bonus):dt);
  };

  // New structures use the same build/selection/identity path as every existing building; no visual clone objects are created.
  Game.prototype.logisticsBuildingDescriptor206=function(typeId){return defs[typeId]?{...defs[typeId]}:null;};
  root.__FD_ECONOMIC_BUILDINGS206__={version:'20.6',definitions:defs};
})();
