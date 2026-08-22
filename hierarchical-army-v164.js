(() => {
'use strict';
const D = globalThis.__FD_DEBUG__;
if (!D?.Game || !D?.WORLD) return;
const Game = D.Game, WORLD = D.WORLD;
const VERSION='16.4', BUILD=174;
const MIN_COMPANY=12, MAX_COMPANY=84, REBUILD_PHASES=16, COMPANY_PHASES=16;
const CELL=1400, GOAL_CELL=560, ROUTE_CELL=720;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const hash=(s)=>{let h=2166136261>>>0;for(const c of String(s)){h^=c.charCodeAt(0);h=Math.imul(h,16777619)>>>0;}return h>>>0;};
const commandGoal=(game,u)=>{const c=u?.currentCommand;if(!c)return null;if(Number.isFinite(c.x)&&Number.isFinite(c.y))return{x:c.x,y:c.y};if(c.targetId){const t=game.getEntity?.(c.targetId);if(t?.alive)return{x:t.x,y:t.y};}return null;};
const movementClass=(game,u)=>game.movementClassV9?.(u)||u?.stats?.mobilityClass||(u?.vehicle?'vehicle':'infantry');
const isSupport=u=>u?.typeId==='worker'||u?.stats?.healer||u?.stats?.repairRate||/repair|medic|engineer/i.test(`${u?.typeId||''} ${u?.stats?.visualRole||''}`);
const eligible=(game,u)=>{
  if(!u?.alive||u.air||u.embarkedIn||u.selected||isSupport(u))return false;
  if((u._v164ExactUntil||0)>game.time)return false;
  const c=u.currentCommand;if(!c||!['move','attackMove'].includes(c.type))return false;
  if(game.time-Math.max(u.lastDamagedAt||-999,u.lastShotAt||-999)<4)return false;
  if(u.weaponTargetId||c.combatTargetId||c.engagedTargetId)return false;
  return !!commandGoal(game,u);
};
const groupKey=(game,u)=>{const g=commandGoal(game,u);if(!g)return null;const px=clamp(Math.floor(u.x/CELL),0,99),py=clamp(Math.floor(u.y/CELL),0,99),gx=Math.floor(g.x/GOAL_CELL),gy=Math.floor(g.y/GOAL_CELL);return `${u.team}|${movementClass(game,u)}|${u.currentCommand.type}|${px},${py}|${gx},${gy}`;};

class CompanyManager164 {
  constructor(game){
    this.game=game;this.threatCell=700;this.threatW=Math.ceil(WORLD.width/this.threatCell);this.threatH=Math.ceil(WORLD.height/this.threatCell);this.threatPlayer=new Uint32Array(this.threatW*this.threatH);this.threatEnemy=new Uint32Array(this.threatW*this.threatH);this.companies=new Map();this.memberToCompany=new Map();this.staging=new Map();this.rebuildCursor=0;this.rebuildActive=false;this.commitJob=null;this.companyCursor=0;this.nextId=1;this.routeCache=new Map();this.routeCacheHits=0;this.routeCacheMisses=0;this.lastCommitTick=0;this.metrics={rebuilds:0,companySteps:0,aggregatedMembers:0,deaggregations:0,combatExpansions:0,routeBuilds:0,routeHits:0,routeMisses:0,maxCompany:0};
  }
  beginRebuild(){this.staging.clear();this.threatPlayer.fill(0);this.threatEnemy.fill(0);this.rebuildCursor=0;this.rebuildActive=true;}
  rebuildSlice(){
    const units=this.game.units||[];if(!this.rebuildActive)this.beginRebuild();
    const budget=Math.max(1,Math.ceil(units.length/REBUILD_PHASES)),end=Math.min(units.length,this.rebuildCursor+budget);
    for(let i=this.rebuildCursor;i<end;i++){const u=units[i];if(u?.alive&&!u.air&&!u.embarkedIn&&!isSupport(u)&&(u.team==='player'||u.team==='enemy')){const gx=clamp(Math.floor(u.x/this.threatCell),0,this.threatW-1),gy=clamp(Math.floor(u.y/this.threatCell),0,this.threatH-1),arr=u.team==='player'?this.threatPlayer:this.threatEnemy;arr[gy*this.threatW+gx]++;}if(!eligible(this.game,u))continue;const key=groupKey(this.game,u);if(!key)continue;let a=this.staging.get(key);if(!a){a=[];this.staging.set(key,a);}a.push(u);}
    this.rebuildCursor=end;if(end<units.length)return false;this.rebuildActive=false;this.commitJob={keys:[...this.staging.keys()].sort(),cursor:0,next:new Map(),memberTo:new Map(),aggregated:0,maxCompany:0,old:this.companies};return true;
  }
  commitSlice(){
    const job=this.commitJob;if(!job)return true;const slices=(this.game._v94AliveUnits||this.game.units.length)>=80000?16:8,budget=Math.max(1,Math.ceil(job.keys.length/slices)),end=Math.min(job.keys.length,job.cursor+budget);
    for(let ki=job.cursor;ki<end;ki++){const key=job.keys[ki],members=(this.staging.get(key)||[]).filter(u=>eligible(this.game,u));if(members.length<MIN_COMPANY)continue;
      for(let s=0;s<members.length;s+=MAX_COMPANY){const chunk=members.slice(s,s+MAX_COMPANY);if(chunk.length<MIN_COMPANY)break;const stable=`${key}#${Math.floor(s/MAX_COMPANY)}`;let c=job.old.get(stable);if(!c)c={id:`company-${this.nextId++}`,stableKey:stable,route:[],routeIndex:0,routeRevision:-1,routeSig:'',phase:hash(stable)%COMPANY_PHASES,createdAt:this.game.time};c.members=chunk;c.team=chunk[0].team;c.commandType=chunk[0].currentCommand.type;c.mobility=movementClass(this.game,chunk[0]);this.recompute(c);job.next.set(stable,c);for(const u of chunk){job.memberTo.set(u.id,c);u._v164CompanyId=c.id;}job.aggregated+=chunk.length;job.maxCompany=Math.max(job.maxCompany,chunk.length);}
    }
    job.cursor=end;if(end<job.keys.length)return false;this.companies=job.next;this.memberToCompany=job.memberTo;this.staging.clear();this.lastCommitTick=this.game.simTick||0;this.metrics.rebuilds++;this.metrics.aggregatedMembers=job.aggregated;this.metrics.maxCompany=job.maxCompany;this.commitJob=null;return true;
  }
  recompute(c){let x=0,y=0,speed=0,hp=0,maxHp=0,supply=0,cohesion=0,n=0;for(const u of c.members){if(!u.alive)continue;x+=u.x;y+=u.y;speed+=Math.max(1,Number(u.stats?.speed)||1);hp+=u.hp||0;maxHp+=u.maxHp||1;supply+=Number.isFinite(u.supply160)?u.supply160:1;cohesion+=Number.isFinite(u.cohesion160)?u.cohesion160:1;n++;}c.count=n;c.x=n?x/n:0;c.y=n?y/n:0;c.speed=n?speed/n:0;c.hpRatio=maxHp?hp/maxHp:0;c.supply=n?supply/n:1;c.cohesion=n?cohesion/n:1;const g=n?commandGoal(this.game,c.members[0]):null;c.goalX=g?.x;c.goalY=g?.y;return n;}
  owns(u){const c=u?this.memberToCompany.get(u.id):null;return !!(c&&u._v164CompanyId===c.id&&eligible(this.game,u));}
  release(c,reason='combat',seconds=5){if(!c)return;for(const u of c.members){if(!u?.alive)continue;u._v164CompanyId=null;u._v164ExactUntil=Math.max(u._v164ExactUntil||0,this.game.time+seconds);this.memberToCompany.delete(u.id);this.game.spatial?.update?.(u,'units');this.game._v94SyncMini164?.(u);}for(const [k,v] of this.companies)if(v===c){this.companies.delete(k);break;}this.metrics.deaggregations++;if(reason==='combat')this.metrics.combatExpansions++;}
  enemyClose(c){
    const grid=c.team==='player'?this.threatEnemy:this.threatPlayer,cx=clamp(Math.floor(c.x/this.threatCell),0,this.threatW-1),cy=clamp(Math.floor(c.y/this.threatCell),0,this.threatH-1),reach=2;for(let dy=-reach;dy<=reach;dy++){const y=cy+dy;if(y<0||y>=this.threatH)continue;for(let dx=-reach;dx<=reach;dx++){const x=cx+dx;if(x<0||x>=this.threatW)continue;if(grid[y*this.threatW+x])return true;}}
    for(const b of this.game.buildings||[]){if(!b?.alive||b.team===c.team||b.team==='neutral')continue;const dx=b.x-c.x,dy=b.y-c.y;if(dx*dx+dy*dy<900*900&&b.stats?.weapon)return true;}
    return false;
  }
  routeFor(c){
    if(!Number.isFinite(c.goalX)||!Number.isFinite(c.goalY))return [];
    const sx=Math.floor(c.x/ROUTE_CELL),sy=Math.floor(c.y/ROUTE_CELL),gx=Math.floor(c.goalX/ROUTE_CELL),gy=Math.floor(c.goalY/ROUTE_CELL),rev=this.game.navRevision||0,key=`${rev}|${c.mobility}|${sx},${sy}|${gx},${gy}`;
    const cached=this.routeCache.get(key);if(cached&&this.game.time-cached.time<8){this.routeCacheHits++;this.metrics.routeHits++;return cached.path;}
    const sample=c.members.find(u=>u?.alive);if(!sample)return [];
    const virtual={id:`formation-${c.id}`,x:c.x,y:c.y,radius:Math.max(18,Math.min(48,Math.sqrt(c.count||1)*4)),stats:sample.stats,vehicle:sample.vehicle,infantry:sample.infantry,currentCommand:sample.currentCommand};
    const path=(this.game.planGroundPath?.(virtual,c.goalX,c.goalY,null,{wide:true,movementClass:c.mobility})||[]).map(p=>({x:p.x,y:p.y}));
    this.routeCache.set(key,{time:this.game.time,path});if(this.routeCache.size>1024){let i=0;for(const k of this.routeCache.keys()){this.routeCache.delete(k);if(++i>128)break;}}
    this.routeCacheMisses++;this.metrics.routeMisses++;this.metrics.routeBuilds++;return path;
  }
  advanceCompany(c,elapsed){
    if(this.recompute(c)<MIN_COMPANY){this.release(c,'small',2);return 0;}
    if(c.members.some(u=>!eligible(this.game,u))){this.release(c,'state',3);return 0;}
    if(this.enemyClose(c)){this.release(c,'combat',6);return 0;}
    const goalSig=`${this.game.navRevision||0}:${Math.round(c.goalX/90)},${Math.round(c.goalY/90)}`;
    if(c.routeSig!==goalSig){c.routeSig=goalSig;c.route=this.routeFor(c);c.routeIndex=0;c.routeRevision=this.game.navRevision||0;}
    const route=c.route||[];let waypoint=route[c.routeIndex]||{x:c.goalX,y:c.goalY};let dx=waypoint.x-c.x,dy=waypoint.y-c.y,dist=Math.hypot(dx,dy);const arrival=90;
    if(route.length&&dist<110){c.routeIndex=Math.min(route.length,c.routeIndex+1);waypoint=route[c.routeIndex]||{x:c.goalX,y:c.goalY};dx=waypoint.x-c.x;dy=waypoint.y-c.y;dist=Math.hypot(dx,dy);}
    const finalDist=Math.hypot(c.goalX-c.x,c.goalY-c.y);if(finalDist<arrival){for(const u of c.members){if(u?.currentCommand&&['move','attackMove'].includes(u.currentCommand.type)){u.commandQueue.shift();u.invalidateNavigation?.();u._v164CompanyId=null;}}this.release(c,'arrived',1);return 0;}
    if(dist<.001)return 0;
    const condition=(.55+.45*c.hpRatio)*(.72+.28*c.supply)*(.72+.28*c.cohesion);c.stepSeq=(c.stepSeq||0)+1;const step=Math.min(dist,c.speed*Math.max(.35,condition)*elapsed);const mx=dx/dist*step,my=dy/dist*step,angle=Math.atan2(dy,dx);c.x+=mx;c.y+=my;
    let moved=0;for(const u of c.members){if(!u?.alive)continue;u._v9PrevX=u.x;u._v9PrevY=u.y;u._v9PrevRot=u.rotation;u.x=clamp(u.x+mx,(u.radius||10)+4,WORLD.width-(u.radius||10)-4);u.y=clamp(u.y+my,(u.radius||10)+4,WORLD.height-(u.radius||10)-4);u.rotation=angle;u.visualSpeed=step/Math.max(.001,elapsed);u.renderX=u.x;u.renderY=u.y;u.renderRotation=u.rotation;u.lastPositionX=u.x;u.lastPositionY=u.y;u.weaponCooldown=Math.max(-12,(u.weaponCooldown||0)-elapsed);u.navRepathTimer=Math.max(0,(u.navRepathTimer||0)-elapsed);if(((hash(u.id)+c.stepSeq)&3)===0){this.game.spatial?.update?.(u,'units');this.game._v94SyncMini164?.(u);}moved++;}
    this.metrics.companySteps++;return moved;
  }
  step(dt){
    const alive=this.game._v94AliveUnits||this.game.units?.length||0;if(alive<6000){if(this.companies.size){for(const c of [...this.companies.values()])this.release(c,'scale',0);}return 0;}
    const rebuildCadence=alive>=80000?100:alive>=40000?90:alive>=12000?75:alive>=6000?70:50;if(!this.rebuildActive&&!this.commitJob&&((this.game.simTick||0)-this.lastCommitTick>=rebuildCadence||!this.companies.size))this.beginRebuild();if(this.rebuildActive)this.rebuildSlice();if(this.commitJob)this.commitSlice();
    if(!this.companies.size)return 0;let moved=0;const phase=(this.game.simTick||0)%COMPANY_PHASES;for(const c of [...this.companies.values()])if(c.phase===phase)moved+=this.advanceCompany(c,dt*COMPANY_PHASES);return moved;
  }
  diagnostics(){const sizes=[...this.companies.values()].map(c=>c.count||0);const members=sizes.reduce((a,b)=>a+b,0);return{version:VERSION,build:BUILD,companies:this.companies.size,aggregatedMembers:members,averageCompanySize:sizes.length?members/sizes.length:0,maxCompanySize:sizes.length?Math.max(...sizes):0,routeCache:this.routeCache.size,routeCacheHits:this.routeCacheHits,routeCacheMisses:this.routeCacheMisses,rebuildActive:this.rebuildActive,commitActive:!!this.commitJob,metrics:{...this.metrics}};}
}

function ensure164(game){if(game._v164Manager)return game._v164Manager;const m=new CompanyManager164(game);game._v164Manager=m;game._v164CompanyStep=(dt)=>m.step(dt);game._v164CompanyOwns=u=>m.owns(u);return m;}

const baseSim=Game.prototype.simulateFixed;if(baseSim&&!baseSim._v164Ensure){const wrapped=function(dt){ensure164(this);return baseSim.call(this,dt);};wrapped._v164Ensure=true;Game.prototype.simulateFixed=wrapped;}
const baseUpdate=Game.prototype.update;if(baseUpdate&&!baseUpdate._v164Ensure){const wrapped=function(dt){ensure164(this);return baseUpdate.call(this,dt);};wrapped._v164Ensure=true;Game.prototype.update=wrapped;}

// Shared hierarchical route cache for non-company remote marchers. This keeps
// exact/local pathfinding intact while avoiding thousands of identical long
// A* requests from distant members of the same column.
const basePlan=Game.prototype.planGroundPath;
if(basePlan&&!basePlan._v164SharedRoutes){const wrapped=function(unit,tx,ty,ignored=null,options={}){const alive=this._v94AliveUnits||this.units?.length||0;if(alive<6000||!unit||unit.selected||unit.air||unit.currentCommand?.formationGroupId||unit.currentCommand?.formationId||this.time-Math.max(unit.lastDamagedAt||-999,unit.lastShotAt||-999)<4)return basePlan.call(this,unit,tx,ty,ignored,options);const manager=ensure164(this),mc=movementClass(this,unit),sx=Math.floor(unit.x/ROUTE_CELL),sy=Math.floor(unit.y/ROUTE_CELL),gx=Math.floor(tx/ROUTE_CELL),gy=Math.floor(ty/ROUTE_CELL),key=`unit:${this.navRevision||0}|${mc}|${sx},${sy}|${gx},${gy}|${options.wide?1:0}`;const old=manager.routeCache.get(key);if(old&&this.time-old.time<5){manager.routeCacheHits++;manager.metrics.routeHits++;return old.path;}const path=basePlan.call(this,unit,tx,ty,ignored,options)||[];manager.routeCache.set(key,{time:this.time,path});manager.routeCacheMisses++;manager.metrics.routeMisses++;return path;};wrapped._v164SharedRoutes=true;Game.prototype.planGroundPath=wrapped;}

Game.prototype.hierarchicalDiagnostics164=function(){return ensure164(this).diagnostics();};
globalThis.__FD_HIERARCHICAL_164__={version:VERSION,build:BUILD,ensure:ensure164};
})();
