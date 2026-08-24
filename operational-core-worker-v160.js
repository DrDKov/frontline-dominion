'use strict';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function fnv1a(h,v){h^=v>>>0; return Math.imul(h,16777619)>>>0;}
function q(v,s=10){return Math.round((Number(v)||0)*s)>>>0;}
self.onmessage=(ev)=>{
  const m=ev.data||{};
  if(m.type!=='snapshot') return;
  let h=2166136261>>>0;
  const sectors=(m.sectors||[]).map(s=>({...s,playerPower:0,enemyPower:0}));
  const cols=m.cols||3, rows=m.rows||3, w=m.worldWidth||32000, ht=m.worldHeight||22000;
  for(const u of m.units||[]){
    if(!u || !u.alive) continue;
    h=fnv1a(h,u.idHash||0); h=fnv1a(h,q(u.x)); h=fnv1a(h,q(u.y)); h=fnv1a(h,q(u.hp)); h=fnv1a(h,q(u.suppression,100)); h=fnv1a(h,q(u.cohesion,100));
    const cx=clamp(Math.floor(u.x/(w/cols)),0,cols-1), cy=clamp(Math.floor(u.y/(ht/rows)),0,rows-1), idx=cy*cols+cx;
    const power=(u.value||1)*(0.35+0.65*clamp(u.hpRatio||1,0,1))*(0.45+0.55*clamp(u.cohesion??1,0,1));
    if(sectors[idx]) { if(u.team==='player') sectors[idx].playerPower+=power; else if(u.team==='enemy') sectors[idx].enemyPower+=power; }
  }
  for(const s of sectors){
    const total=s.playerPower+s.enemyPower;
    const bias=total>0?(s.playerPower-s.enemyPower)/total:0;
    s.control=clamp((Number(s.control)||0)*0.82+bias*0.18,-1,1);
    h=fnv1a(h,q(s.control,10000));
  }
  postMessage({type:'result',tick:m.tick||0,hash:h>>>0,sectors:sectors.map(s=>({id:s.id,control:s.control,playerPower:s.playerPower,enemyPower:s.enemyPower}))});
};
