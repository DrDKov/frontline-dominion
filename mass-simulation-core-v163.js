(() => {
'use strict';
const D = globalThis.__FD_DEBUG__;
if (!D?.Game || !D?.WORLD) return;
const Game = D.Game, WORLD = D.WORLD;
const BUILD = 173, VERSION = '16.3';
const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
const hashString = (s)=>{let h=2166136261>>>0;for(const c of String(s)){h^=c.charCodeAt(0);h=Math.imul(h,16777619)>>>0;}return h>>>0;};
const teamCode = team => team === 'player' ? 1 : team === 'enemy' ? 2 : 0;
const isSupport = u => u?.typeId === 'worker' || u?.stats?.healer || u?.stats?.repairRate || /repair|medic|engineer/i.test(`${u?.typeId||''} ${u?.stats?.visualRole||''}`);
const combatUnit = u => u?.alive && u.kind === 'unit' && !u.embarkedIn && !isSupport(u);
const unitValue = u => Math.max(1, Number(u?.stats?.cost) || Number(u?.stats?.hp) || 100);
const detectionRadius = e => Math.max(Number(e?.detector)||Number(e?.stats?.detector)||0, Number(e?.vision)||Number(e?.stats?.vision)||0) * 1.05;

class HotState163 {
  constructor(game){this.game=game;this.capacity=0;this.count=0;this.generation=0;this.ensure(Math.max(1024,game.units?.length||0));}
  ensure(n){if(n<=this.capacity)return;let cap=Math.max(1024,this.capacity||0);while(cap<n)cap*=2;this.capacity=cap;this.power=new Float32Array(cap);this.team=new Uint8Array(cap);this.flags=new Uint8Array(cap);this.sector=new Uint8Array(cap);}
  reset(expected=0){this.ensure(expected);this.count=0;}
  push(u){const i=this.count++;this.ensure(this.count);const hpRatio=(u.hp||0)/Math.max(1,u.maxHp||1),cohesion=Number.isFinite(u.cohesion160)?u.cohesion160:1;this.power[i]=unitValue(u)*(.3+.7*hpRatio)*(.45+.55*cohesion);this.team[i]=teamCode(u.team);let flags=0;if(u.air)flags|=1;if(u.vehicle)flags|=2;if(u.infantry)flags|=4;if(isSupport(u))flags|=8;if(u.embarkedIn)flags|=16;this.flags[i]=flags;const c=clamp(Math.floor(u.x/(WORLD.width/3)),0,2),r=clamp(Math.floor(u.y/(WORLD.height/3)),0,2);this.sector[i]=r*3+c;}
}


function ensureMassCore163(game){
  if(game._v163Installed)return game._v163;
  game._v163Installed=true;
  const state={hot:new HotState163(game),nextRefresh:0,lastCoreTick:-1,metrics:{hotRefreshes:0,corePasses:0,intelQueries:0,supplyQueries:0,sectorPasses:0,moralePasses:0}};
  game._v163=state;
  patchOperationalCore163(game,state);
  return state;
}

function nearestSector(core,x,y){const c=clamp(Math.floor(x/(WORLD.width/3)),0,2),r=clamp(Math.floor(y/(WORLD.height/3)),0,2);return core.sectors[r*3+c];}

function patchOperationalCore163(game,state){
  const core=game.operationalCore160;
  if(!core||core._v163Patched)return;
  core._v163Patched=true;core._v163State=state;
  try{core.worker?.terminate?.();}catch(_){} core.worker=null;core.workerReady=false;core.sendWorker=()=>{};
  core._v163RecoveryAccum=0;

  core.updateSectors=function(){
    const units=game.units||[];
    let job=state.sectorJob;
    if(!job){state.hot.reset(units.length);job=state.sectorJob={cursor:0,pp:new Float64Array(9),ep:new Float64Array(9),startedAt:game.time};}
    const chunks=units.length>=80000?24:units.length>=50000?16:units.length>=12000?8:1,budget=Math.max(1,Math.ceil(units.length/chunks)),end=Math.min(units.length,job.cursor+budget);
    for(let i=job.cursor;i<end;i++){const u=units[i];if(!u?.alive)continue;state.hot.push(u);if(!combatUnit(u))continue;const idx=state.hot.count-1,p=state.hot.power[idx],sec=state.hot.sector[idx],team=state.hot.team[idx];if(team===1)job.pp[sec]+=p;else if(team===2)job.ep[sec]+=p;}
    job.cursor=end;
    if(job.cursor<units.length)return false;
    for(let i=0;i<9;i++){const sec=this.sectors[i],pp=job.pp[i],ep=job.ep[i];sec.playerPower=pp;sec.enemyPower=ep;const total=pp+ep,bias=total?(pp-ep)/total:0;sec.control=clamp(sec.control*.86+bias*.14,-1,1);const old=sec.owner;sec.owner=sec.control>.28?'player':sec.control<-.28?'enemy':'contested';if(old!==sec.owner){sec.lastChanged=game.time;this.metrics.sectorFlips++;}}
    state.hot.generation++;state.nextRefresh=game.time+.72;state.metrics.hotRefreshes++;state.metrics.sectorPasses++;state.sectorJob=null;return true;
  };

  core.updateIntel=function(){
    const units=game.units||[],buildings=game.buildings||[],mass=units.length>=12000,cellSize=420,gridW=Math.ceil(WORLD.width/cellSize),gridH=Math.ceil(WORLD.height/cellSize),cells=gridW*gridH;
    let job=state.intelJob;
    if(!job){job=state.intelJob={stage:'observers',cursor:0,sourceRange:new Float32Array(cells),visibleGrid:new Uint8Array(cells),seen:new Set(),groups:mass?new Map():null,observers:0,now:game.time,mass};}
    const chunks=units.length>=80000?24:units.length>=50000?16:units.length>=12000?8:1,budget=Math.max(1,Math.ceil(units.length/chunks)),specter=game.teams?.player?.faction==='specter';
    const registerObserver=o=>{const r=detectionRadius(o);if(r<=0)return;const cx=clamp(Math.floor(o.x/cellSize),0,gridW-1),cy=clamp(Math.floor(o.y/cellSize),0,gridH-1),idx=cy*gridW+cx;if(r>job.sourceRange[idx])job.sourceRange[idx]=r;job.observers++;};
    const visible=(x,y)=>job.visibleGrid[clamp(Math.floor(y/cellSize),0,gridH-1)*gridW+clamp(Math.floor(x/cellSize),0,gridW-1)]!==0;
    const touchExact=(target,kind,boost)=>{const id=target.id;job.seen.add(id);let c=this.contacts.get(id);if(!c){c={id,kind,firstSeenAt:job.now,confidence:kind==='building'?.55:.45};this.contacts.set(id,c);this.metrics.contactsCreated++;}c.x=target.x;c.y=target.y;c.typeId=target.typeId;c.lastSeenAt=job.now;c.confidence=clamp((c.confidence||0)+boost,0,1);c.value=kind==='building'?(Number(target.stats?.cost)||1000):unitValue(target);if(kind==='unit'){c.air=!!target.air;c.infantry=!!target.infantry;}};
    if(job.stage==='observers'){
      const end=Math.min(units.length,job.cursor+budget);for(let i=job.cursor;i<end;i++){const u=units[i];if(u?.alive&&u.team==='enemy'&&!u.embarkedIn)registerObserver(u);}job.cursor=end;if(job.cursor<units.length)return false;
      for(const b of buildings)if(b.alive&&b.team==='enemy'&&(b.buildProgress??b.construction??1)>=.85)registerObserver(b);job.stage='dilate';job.cursor=0;return false;
    }
    if(job.stage==='dilate'){
      // Grid is only ~4k cells, so dilation is cheap and deterministic.
      for(let sy=0;sy<gridH;sy++)for(let sx=0;sx<gridW;sx++){const range=job.sourceRange[sy*gridW+sx];if(range<=0)continue;const reach=Math.ceil(range/cellSize)+1,limit=(range+cellSize*.72)**2;for(let dy=-reach;dy<=reach;dy++){const y=sy+dy;if(y<0||y>=gridH)continue;for(let dx=-reach;dx<=reach;dx++){const x=sx+dx;if(x<0||x>=gridW)continue;const wx=Math.max(0,Math.abs(dx)*cellSize-cellSize*.72),wy=Math.max(0,Math.abs(dy)*cellSize-cellSize*.72);if(wx*wx+wy*wy<=limit)job.visibleGrid[y*gridW+x]=1;}}}
      job.stage='targets';job.cursor=0;return false;
    }
    if(job.stage==='targets'){
      const end=Math.min(units.length,job.cursor+budget),intelCell=840,iw=Math.ceil(WORLD.width/intelCell),ih=Math.ceil(WORLD.height/intelCell);
      for(let i=job.cursor;i<end;i++){const u=units[i];if(!u?.alive||u.team!=='player'||(!visible(u.x,u.y)&&job.now-(u.lastShotAt||-999)>=1.1))continue;
        if(!job.mass){touchExact(u,'unit',specter?.105:.18);continue;}
        const cx=clamp(Math.floor(u.x/intelCell),0,iw-1),cy=clamp(Math.floor(u.y/intelCell),0,ih-1),key=`G:${cy*iw+cx}`;let g=job.groups.get(key);if(!g){g={id:key,kind:'group',x:0,y:0,count:0,value:0,air:false,infantry:false,armor:false};job.groups.set(key,g);}g.x+=u.x;g.y+=u.y;g.count++;g.value+=unitValue(u);g.air||=!!u.air;g.infantry||=!!u.infantry;g.armor||=!!u.vehicle;
      }
      job.cursor=end;if(job.cursor<units.length)return false;job.stage='commit';return false;
    }
    if(job.stage==='commit'){
      if(job.mass)for(const g of job.groups.values()){g.x/=g.count;g.y/=g.count;job.seen.add(g.id);let c=this.contacts.get(g.id);if(!c){c={id:g.id,kind:'group',firstSeenAt:job.now,confidence:.42};this.contacts.set(g.id,c);this.metrics.contactsCreated++;}Object.assign(c,{x:g.x,y:g.y,lastSeenAt:job.now,count:g.count,value:g.value,air:g.air,infantry:g.infantry,armor:g.armor,typeId:g.armor?'formation-armor':g.air?'formation-air':'formation-ground'});c.confidence=clamp((c.confidence||0)+(specter?.08:.14),0,1);}
      for(const b of buildings)if(b.alive&&b.team==='player'&&visible(b.x,b.y))touchExact(b,'building',specter?.15:.22);
      for(const [id,c] of this.contacts){if(job.mass&&c.kind==='unit'&&!job.seen.has(id)){this.contacts.delete(id);continue;}if(!job.seen.has(id)){const age=job.now-(c.lastSeenAt||job.now);c.confidence=clamp(c.confidence-Math.min(.12,age*.0025),0,1);if(age>180||c.confidence<.05)this.contacts.delete(id);}}
      state.metrics.intelQueries+=job.observers;state.metrics.intelGridCells=cells;state.metrics.intelContacts=this.contacts.size;state.intelJob=null;return true;
    }
    state.intelJob=null;return true;
  };

  core.updateSupply=function(){
    const units=game.units||[];let job=state.supplyJob;
    if(!job)job=state.supplyJob={cursor:0,sources:{player:this.supplySources('player'),enemy:this.supplySources('enemy')}};
    const chunks=units.length>=80000?24:units.length>=50000?16:units.length>=12000?8:1,budget=Math.max(1,Math.ceil(units.length/chunks)),end=Math.min(units.length,job.cursor+budget),sectorW=WORLD.width/3,sectorH=WORLD.height/3;
    for(let i=job.cursor;i<end;i++){const u=units[i];if(!u?.alive||(u.team!=='player'&&u.team!=='enemy'))continue;const ci=clamp(Math.floor(u.x/sectorW),0,2),ri=clamp(Math.floor(u.y/sectorH),0,2),sec=this.sectors[ri*3+ci];let best=0,list=job.sources[u.team]||[];for(let j=0;j<list.length;j++){const sp=list[j],dx=u.x-sp.x,dy=u.y-sp.y,d2=dx*dx+dy*dy,r2=sp.r*sp.r;if(d2>=r2)continue;const v=sp.p*(1-Math.sqrt(d2)/sp.r*.45);if(v>best)best=v;}const territorial=sec?.owner===u.team?.18:sec?.owner==='contested'?.04:-.10,target=clamp(best+territorial,.12,1),cur=Number.isFinite(u.supply160)?u.supply160:1;u.supply160=clamp(cur+clamp(target-cur,-.055,.12),.12,1);}
    job.cursor=end;if(job.cursor<units.length)return false;state.metrics.supplyQueries+=(job.sources.player.length+job.sources.enemy.length);state.supplyJob=null;return true;
  };

  core.manageMorale=function(){
    state.metrics.moralePasses++;
    const candidates=game._v163MoraleCandidates||(game._v163MoraleCandidates=new Set()),retreating=game._v163Retreating||(game._v163Retreating=new Set());
    if(!candidates.size&&!retreating.size){state.metrics.moraleQueue=0;state.metrics.moraleProcessed=0;return;}
    const sources={player:this.supplySources('player'),enemy:this.supplySources('enemy')};
    const queue=[];for(const u of candidates)queue.push(u);for(const u of retreating)if(!candidates.has(u))queue.push(u);
    const budget=game.units.length>=50000?2400:game.units.length>=12000?1600:queue.length;
    let processed=0;
    for(const u of queue){if(processed++>=budget)break;if(!u?.alive||u.air||!combatUnit(u)){candidates.delete(u);retreating.delete(u);continue;}const broken=(u.suppression160||0)>.78||(u.cohesion160||1)<.24||(u.morale160||1)<.22;
      if(broken&&game.time>(u._v160RetreatUntil||0)){u._v160ResumeCommand=u.currentCommand?{...u.currentCommand}:null;let best=null,bestD=Infinity;for(const sp of sources[u.team]||[]){const dx=u.x-sp.x,dy=u.y-sp.y,d2=dx*dx+dy*dy;if(d2<bestD){bestD=d2;best=sp;}}if(!best)best=u.team==='enemy'?(game.enemyBase||{x:WORLD.width-1800,y:WORLD.height/2}):(game.playerBase||{x:1800,y:WORLD.height/2});u._v160RetreatUntil=game.time+9;u._v160Retreating=true;retreating.add(u);u.setCommand({type:'move',x:best.x+(hashString(u.id+'mx')%260)-130,y:best.y+(hashString(u.id+'my')%260)-130,v160Retreat:true});}
      else if(u._v160Retreating&&game.time>(u._v160RetreatUntil||0)&&(u.suppression160||0)<.35&&(u.cohesion160||1)>.48){const resume=u._v160ResumeCommand;u._v160Retreating=false;u._v160ResumeCommand=null;retreating.delete(u);candidates.delete(u);if(resume)u.setCommand(resume);}
      else if(!broken&&!u._v160Retreating)candidates.delete(u);
    }
    state.metrics.moraleQueue=candidates.size+retreating.size;state.metrics.moraleProcessed=processed;
  };

  core.update=function(dt){
    if(game.paused||game.ended)return;
    // Recovery is phase-sliced at legion scale: each unit still receives the
    // same ~0.20 s elapsed recovery step, but only one deterministic cohort is
    // touched per 25 Hz tick.
    const units=game.units||[];
    const recoverOne=(u,elapsed)=>{if(!u?.alive)return;const faction=game.teams?.[u.team]?.faction||'',recoveryDoctrine=faction==='vanguard'?1.18:faction==='dominion'?.96:1.04,recovery=(game.time-(u.lastSuppressedAt160||-999)>3?.095:.035)*elapsed*recoveryDoctrine;u.suppression160=clamp((u.suppression160||0)-recovery,0,1);const supply=Number.isFinite(u.supply160)?u.supply160:1,threshold=faction==='specter'?.34:.45,supplyPenalty=Math.max(0,threshold-supply),cohesionDoctrine=faction==='vanguard'?1.12:faction==='dominion'?.96:1.02,targetC=clamp(1-u.suppression160*.72-supplyPenalty*.65,.12,1);u.cohesion160=clamp((Number.isFinite(u.cohesion160)?u.cohesion160:1)+clamp(targetC-(u.cohesion160||1),-.20*.035,.20*.055*cohesionDoctrine),.08,1);u.morale160=clamp(u.cohesion160*(.72+.28*supply),0,1);};
    if(units.length>=12000){const cohorts=units.length>=50000?10:5,budget=Math.max(1,Math.ceil(units.length/cohorts)),start=this._v163RecoveryCursor||0;for(let k=0;k<budget;k++){const idx=(start+k)%Math.max(1,units.length);recoverOne(units[idx],dt*cohorts);}this._v163RecoveryCursor=(start+budget)%Math.max(1,units.length);state.metrics.corePasses++;}
    else{this._v163RecoveryAccum+=dt;if(this._v163RecoveryAccum>=.20){const elapsed=this._v163RecoveryAccum;this._v163RecoveryAccum=0;for(const u of units)recoverOne(u,elapsed);state.metrics.corePasses++;}}
    for(const k of Object.keys(this.timers))this.timers[k]-=dt;
    if(this.timers.sector<=0&&!state.sectorJob){this.timers.sector=.8;state.sectorJob={cursor:0,pp:new Float64Array(9),ep:new Float64Array(9),startedAt:game.time};state.hot.reset(units.length);}if(state.sectorJob)this.updateSectors();
    if(this.timers.intel<=0&&!state.intelJob){this.timers.intel=game.units.length>=20000?1.3:game.units.length>=8000?.95:.65;state.intelJob={stage:'observers',cursor:0,sourceRange:new Float32Array(Math.ceil(WORLD.width/420)*Math.ceil(WORLD.height/420)),visibleGrid:new Uint8Array(Math.ceil(WORLD.width/420)*Math.ceil(WORLD.height/420)),seen:new Set(),groups:game.units.length>=12000?new Map():null,observers:0,now:game.time,mass:game.units.length>=12000};}if(state.intelJob)this.updateIntel();
    if(this.timers.supply<=0&&!state.supplyJob){this.timers.supply=game.units.length>=20000?2.0:1.2;state.supplyJob={cursor:0,sources:{player:this.supplySources('player'),enemy:this.supplySources('enemy')}};}if(state.supplyJob)this.updateSupply();
    if(this.timers.morale<=0){this.timers.morale=game.units.length>=20000?.8:.4;this.manageMorale();}
    if(this.timers.income<=0){this.timers.income=2;this.applyTerritoryIncome();}
    if(this.timers.ai<=0){this.timers.ai=game.units.length>=20000?5:4;this.updateAI();}
    // The old operational mirror worker is superseded by the authoritative simulation worker.
    this.timers.worker=999999;
    this.updateOperations(dt);
  };

  for(const name of ['updateSectors','updateIntel','updateSupply','manageMorale','updateAI','updateOperations']){
    const fn=core[name];if(typeof fn!=='function'||fn._v163Timed)continue;
    const wrapped=function(...args){const t=performance.now();try{return fn.apply(this,args);}finally{const ms=performance.now()-t;state.metrics[`${name}Ms`]=(state.metrics[`${name}Ms`]||0)+ms;state.metrics[`${name}MaxMs`]=Math.max(state.metrics[`${name}MaxMs`]||0,ms);state.metrics[`${name}Calls`]=(state.metrics[`${name}Calls`]||0)+1;}};wrapped._v163Timed=true;core[name]=wrapped;
  }
  core.massDiagnostics163=()=>({version:VERSION,build:BUILD,hotCount:state.hot.count,capacity:state.hot.capacity,generation:state.hot.generation,metrics:{...state.metrics}});
}

const baseSimulate=Game.prototype.simulateFixed;
if(baseSimulate)Game.prototype.simulateFixed=function(dt){const state=ensureMassCore163(this);if(this.operationalCore160&&!this.operationalCore160._v163Patched)patchOperationalCore163(this,state);return baseSimulate.call(this,dt);};
const baseUpdate=Game.prototype.update;
if(baseUpdate)Game.prototype.update=function(dt){ensureMassCore163(this);return baseUpdate.call(this,dt);};

Game.prototype.massDiagnostics163=function(){const s=ensureMassCore163(this);return {version:VERSION,build:BUILD,alive:this._v94AliveUnits||this.units?.filter(u=>u.alive).length||0,hotCount:s.hot.count,capacity:s.hot.capacity,generation:s.hot.generation,metrics:{...s.metrics},core:this.operationalCore160?.massDiagnostics163?.()||null};};

if (D.Unit?.prototype?.takeDamage && !D.Unit.prototype.takeDamage._v163MoraleEvents) {
  const baseDamage163=D.Unit.prototype.takeDamage;
  const wrappedDamage163=function(...args){const out=baseDamage163.apply(this,args);if(this.alive&&!this.air&&combatUnit(this)&&((this.suppression160||0)>.62||(this.cohesion160||1)<.38)){const set=this.game._v163MoraleCandidates||(this.game._v163MoraleCandidates=new Set());set.add(this);}return out;};
  wrappedDamage163._v163MoraleEvents=true;D.Unit.prototype.takeDamage=wrappedDamage163;
}

// Final outer AI gate: later doctrine patches wrap the v9.4 sampler and can
// otherwise rescan the full army before control reaches the old mass wrapper.
// At legion scale every strategic pass receives the exact hot set plus a
// deterministic rotating cohort; local combat remains outside this gate.
if (D.TacticalAI?.prototype?.update && !D.TacticalAI.prototype.update._v163OuterSample) {
  const baseAI163 = D.TacticalAI.prototype.update;
  const wrappedAI163 = function(dt) {
    const g=this.game,alive=g?._v94AliveUnits||g?.units?.length||0;
    if(!g?._v94Installed||alive<5000)return baseAI163.call(this,dt);
    const all=g.units,sample=g._v163AISample||(g._v163AISample=[]);sample.length=0;
    const token=(g._v163AIToken=(g._v163AIToken||0)+1);
    const add=u=>{if(!u?.alive||u._v163AIMark===token)return;u._v163AIMark=token;sample.push(u);};
    for(const u of g._v94HotUnits||[])add(u);
    const target=alive>=80000?300:alive>=40000?360:alive>=20000?420:alive>=10000?420:560;
    const buckets=g._v94Buckets||[],bc=buckets.length||1,start=g._v163AIBucketCursor||0;
    for(let off=0;off<bc&&sample.length<target;off++){
      const b=buckets[(start+off)%bc]||[];
      if(!b.length)continue;
      const need=Math.max(1,target-sample.length),stride=Math.max(1,Math.floor(b.length/need)),phase=(g.simTick+off*13)%stride;
      for(let i=phase;i<b.length&&sample.length<target;i+=stride)add(b[i]);
    }
    g._v163AIBucketCursor=(start+1)%bc;
    g.units=sample;
    try{return baseAI163.call(this,dt);}finally{g.units=all;}
  };
  wrappedAI163._v163OuterSample=true;
  D.TacticalAI.prototype.update=wrappedAI163;
}


if (Game.prototype.updateCounterIntelligence && !Game.prototype.updateCounterIntelligence._v163MassGate) {
  const baseCounterIntel163=Game.prototype.updateCounterIntelligence;
  const wrappedCounterIntel163=function(dt){const alive=this._v94AliveUnits||this.units?.length||0;if(!this._v94Installed||alive<5000)return baseCounterIntel163.call(this,dt);const all=this.units,covert=[];for(const u of this._v94Covert||[])if(u?.alive)covert.push(u);this.units=covert;try{return baseCounterIntel163.call(this,dt);}finally{this.units=all;}};
  wrappedCounterIntel163._v163MassGate=true;Game.prototype.updateCounterIntelligence=wrappedCounterIntel163;
}

globalThis.__FD_MASS_163__={version:VERSION,build:BUILD,ensure:ensureMassCore163};
})();
