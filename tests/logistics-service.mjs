import { chromium } from 'playwright';
import { gameUrl } from './lib/fd-env.mjs';

const url = gameUrl();
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const page = await context.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e?.stack || e)));
page.on('console', m => { if (m.type() === 'error' && !/favicon|404|audio|autoplay|Failed to load resource:.*503/i.test(m.text())) errors.push(`console:${m.text()}`); });

const waitFor = async (fn, arg = undefined, timeout = 45000, interval = 100) => {
  const started = Date.now(); let last = null;
  while (Date.now() - started < timeout) {
    if (errors.length) throw new Error(`Browser error: ${JSON.stringify(errors)}`);
    last = await page.evaluate(fn, arg);
    if (last && !last.__pending) return last;
    await page.waitForTimeout(interval);
  }
  throw new Error(`Timed out ${timeout}ms; last=${JSON.stringify(last)}; errors=${JSON.stringify(errors)}`);
};

const latestGlobal = prefix => page.evaluate(prefix => {
  const key = Object.keys(globalThis).filter(k => k.startsWith(prefix)).sort((a, b) => {
    const na = Number(a.match(/_(\d+)__$/)?.[1] || 0);
    const nb = Number(b.match(/_(\d+)__$/)?.[1] || 0);
    return nb - na;
  })[0] || null;
  return key ? { key, value: globalThis[key] } : null;
}, prefix);

const I = {
  source: 'e211001', provider: 'e211002', receiver: 'e211003', tank: 'e211004', infantry: 'e211005', outside: 'e211006', air: 'e211007',
  groupSource: 'e211010', groupTruck: 'e211011', group: ['e211012','e211013','e211014'],
};

await page.goto(url, { waitUntil: 'load', timeout: 60000 });
await waitFor(() => {
  const b = document.getElementById('start-game');
  const globals = Object.keys(globalThis);
  const logistics = globals.some(k => k.startsWith('__FD_LOGISTICS_INTEGRITY_'));
  const shell = globals.map(k => globalThis[k]).find((v, i) => globals[i].startsWith('__FD_RUNTIME_SHELL_') && v?.state?.installed);
  return b && !b.disabled && logistics && shell ? true : null;
});

const fixture = await page.evaluate(I => {
  const D = globalThis.__FD_DEBUG__, L = globalThis.__FD_LOGISTICS206__;
  if (!D?.Game || !L) return { ok: false };
  const base = D.Game.prototype.initializeBattle;
  D.Game.prototype.initializeBattle = function(...args) {
    const result = base.apply(this, args);
    const B = (id,typeId,x,y) => { const b = new D.Building(this,{id,typeId,team:'player',x,y,construction:1,rotation:0}); this.addEntity(b); return b; };
    const U = (id,typeId,x,y) => { const u = new D.Unit(this,{id,typeId,team:'player',x,y,rotation:0}); this.addEntity(u); return u; };
    const fillNode = b => { const n=L.ensureNode(b); for(const k of L.STOCK_KEYS){ if(n?.stock) n.stock[k]=n.stock[`${k}Max`]; } return n; };
    const drain = s => { if(!s)return; if(Number(s.fuelMax)>0)s.fuel=0; if(Number(s.ammoReserveMax)>0)s.ammoReserve=0; if(Number(s.supportMax)>0)s.support=0; };

    const source = B(I.source,'logisticsHub',14000,14500); fillNode(source);
    const provider = U(I.provider,'resourceTruck',14080,14500), ps=L.ensureUnit(provider,true);
    Object.assign(ps,{homeNodeId:I.source,sourceNodeId:null,destinationNodeId:null,missionType:'AUTO',phase206:'PLAN',fuelMax:720,fuel:720});
    for(const k of L.STOCK_KEYS) ps.cargo[k]=0;
    provider.commandQueue=[{type:'logistics206',missionType:'AUTO'}];

    const receiver = U(I.receiver,'resourceTruck',15100,14500), rs=L.ensureUnit(receiver,true);
    Object.assign(rs,{fuelMax:720,fuel:0,supportMax:45,support:0,missionType:'RETURN_TO_SOURCE',phase206:'PLAN'});
    rs.cargo.fuel=0; rs.cargo.ammo=321; rs.cargo.support=0; receiver.cargo=L.manifestTotal(rs.cargo);

    const vehicleType = D.UNIT_TYPES?.tank ? 'tank' : Object.keys(D.UNIT_TYPES||{}).find(id=>{const s=D.UNIT_TYPES[id];return s?.vehicle&&!s?.air&&id!=='resourceTruck';});
    const infantryType = D.UNIT_TYPES?.rifle ? 'rifle' : Object.keys(D.UNIT_TYPES||{}).find(id=>D.UNIT_TYPES[id]?.infantry&&id!=='worker');
    const airType = D.UNIT_TYPES?.helicopter ? 'helicopter' : Object.keys(D.UNIT_TYPES||{}).find(id=>D.UNIT_TYPES[id]?.air);
    if(!vehicleType||!infantryType||!airType) throw new Error(`fixture types missing vehicle=${vehicleType} infantry=${infantryType} air=${airType}`);

    const tank=U(I.tank,vehicleType,15120,14540), ts=L.ensureUnit(tank,true); drain(ts);
    const infantry=U(I.infantry,infantryType,15080,14430), is=L.ensureUnit(infantry,true); drain(is);
    const outside=U(I.outside,vehicleType,15340,14500), os=L.ensureUnit(outside,true); drain(os);
    const air=U(I.air,airType,14650,14560), as=L.ensureUnit(air,true); drain(as);

    const groupSource=B(I.groupSource,'logisticsHub',15800,15800); fillNode(groupSource);
    const groupTruck=U(I.groupTruck,'resourceTruck',15850,15800), gs=L.ensureUnit(groupTruck,true);
    Object.assign(gs,{homeNodeId:I.groupSource,missionType:'AUTO',phase206:'PLAN',fuelMax:720,fuel:720}); for(const k of L.STOCK_KEYS)gs.cargo[k]=0;
    groupTruck.commandQueue=[{type:'logistics206',missionType:'AUTO'}];
    I.group.forEach((id,i)=>{const u=U(id,vehicleType,16600+(i-1)*55,15800+(i-1)*35),s=L.ensureUnit(u,true);drain(s);});

    globalThis.__FD_SERVICE_FIXTURE_TYPES__={vehicleType,infantryType,airType};
    return result;
  };
  return { ok: true };
}, I);
if (!fixture.ok) throw new Error('fixture installation failed');

await page.locator('#start-game').click();
await waitFor(I => {
  const g=globalThis.__FD_DEBUG__?.game,b=globalThis.__FD_STABLE_STATE165__?.bridge;
  return g?.getEntity?.(I.provider)?.alive && g?.getEntity?.(I.receiver)?.alive && b?.ready && !b.failed && Number(b.workerTick)>12
    ? { tick:b.workerTick, recoveries:Number(b.recoveryAttempts201||0), types:globalThis.__FD_SERVICE_FIXTURE_TYPES__ }
    : { __pending:true, tick:Number(b?.workerTick||0), failed:Boolean(b?.failed), error:b?.lastError||null };
}, I);

const send = async payload => {
  const seq = await page.evaluate(p => { const g=globalThis.__FD_DEBUG__.game,b=globalThis.__FD_STABLE_STATE165__.bridge,before=Number(b.seq||0);g.setLogisticsMission206(p);return Number(b.seq)>before?Number(b.seq):0; }, payload);
  if(!seq) throw new Error(`mission not routed ${JSON.stringify(payload)}`);
  await waitFor(s=>Number(globalThis.__FD_STABLE_STATE165__?.bridge?.lastAck||0)>=s?true:null,seq,15000);
};

const initial = await page.evaluate(I => {
  const g=globalThis.__FD_DEBUG__.game,L=globalThis.__FD_LOGISTICS206__;
  const state=id=>{const u=g.getEntity(id),s=L.ensureUnit(u,false);return{id,fuel:s?.fuel||0,fuelMax:s?.fuelMax||0,ammo:s?.ammoReserve||0,ammoMax:s?.ammoReserveMax||0,support:s?.support||0,supportMax:s?.supportMax||0,cargo:{...s?.cargo},x:u?.x,y:u?.y};};
  return {provider:state(I.provider),receiver:state(I.receiver),tank:state(I.tank),infantry:state(I.infantry),outside:state(I.outside),air:state(I.air)};
}, I);
if(initial.receiver.cargo.ammo!==321) throw new Error(`receiver cargo fixture corrupt ${JSON.stringify(initial.receiver)}`);

await send({truckIds:[I.provider],missionType:'SUPPLY_AREA',targetX:14600,targetY:14500,serviceRadius:680});
const area = await waitFor(I => {
  const g=globalThis.__FD_DEBUG__.game,L=globalThis.__FD_LOGISTICS206__,b=globalThis.__FD_STABLE_STATE165__.bridge;
  const state=id=>{const u=g.getEntity(id),s=L.ensureUnit(u,false);return{id,fuel:Number(s?.fuel||0),fuelMax:Number(s?.fuelMax||0),ammo:Number(s?.ammoReserve||0),ammoMax:Number(s?.ammoReserveMax||0),support:Number(s?.support||0),supportMax:Number(s?.supportMax||0),cargo:{...s?.cargo},resupplySourceId:s?.resupplySourceId||null};};
  const receiver=state(I.receiver),tank=state(I.tank),infantry=state(I.infantry),outside=state(I.outside),air=state(I.air),provider=state(I.provider);
  const complete = receiver.fuel>=receiver.fuelMax*.92-1 &&
    tank.fuel>=tank.fuelMax*.92-1 &&
    tank.ammo>=60*.92-1 &&
    tank.support>=180*.88-1 &&
    infantry.ammo>=150*.92-1 &&
    infantry.support>=95*.88-1;
  if(complete) return {receiver,tank,infantry,outside,air,provider,tick:b.workerTick};
  return {__pending:true,receiver,tank,infantry,outside,air,provider,truckStatus:g.getEntity(I.provider)?.logistics206?.status,phase:g.getEntity(I.provider)?.logistics206?.phase206};
}, I, 60000);

if(area.receiver.fuel>area.receiver.fuelMax*.92+1) throw new Error(`receiver truck overfilled ${JSON.stringify(area.receiver)}`);
if(area.receiver.cargo.ammo!==321 || area.receiver.cargo.fuel!==0) throw new Error(`truck-to-truck service mutated receiver cargo ${JSON.stringify(area.receiver)}`);
if(area.receiver.resupplySourceId!==I.provider) throw new Error(`truck recipient missing physical source ${JSON.stringify(area.receiver)}`);
if(area.outside.fuel>1 || area.outside.ammo>1 || area.outside.support>1) throw new Error(`outside-radius unit was serviced ${JSON.stringify(area.outside)}`);
if(area.air.fuel>1 || area.air.ammo>1 || area.air.support>1) throw new Error(`air unit was directly area-serviced ${JSON.stringify(area.air)}`);
if(area.receiver.fuel < area.receiver.fuelMax*.92-1) throw new Error(`receiver truck tank insufficiently refuelled ${JSON.stringify(area.receiver)}`);
if(area.tank.fuel < area.tank.fuelMax*.92-1 || area.tank.ammo < 60*.92-1 || area.tank.support < 180*.88-1) throw new Error(`tank demand not satisfied ${JSON.stringify(area.tank)}`);
if(area.infantry.ammo < 150*.92-1 || area.infantry.support < 95*.88-1) throw new Error(`infantry demand not satisfied ${JSON.stringify(area.infantry)}`);

const groupInitial = await page.evaluate(I=>I.group.map(id=>{const s=globalThis.__FD_LOGISTICS206__.ensureUnit(globalThis.__FD_DEBUG__.game.getEntity(id),false);return{id,total:Number(s.fuel||0)+Number(s.ammoReserve||0)+Number(s.support||0)};}),I);
await send({truckIds:[I.groupTruck],missionType:'SUPPLY_GROUP',targetUnitIds208:I.group,targetX:16600,targetY:15800,serviceRadius:620});
const group = await waitFor(({I,base}) => {
  const g=globalThis.__FD_DEBUG__.game,L=globalThis.__FD_LOGISTICS206__,truck=g.getEntity(I.groupTruck),s=truck?.logistics206;
  const units=base.map(row=>{const u=g.getEntity(row.id),ls=L.ensureUnit(u,false);return{...row,now:Number(ls?.fuel||0)+Number(ls?.ammoReserve||0)+Number(ls?.support||0),source:ls?.resupplySourceId||null,x:u?.x,y:u?.y};});
  if(units.every(u=>u.now>u.total+10)) return {units,truck:{x:truck.x,y:truck.y,phase:s?.phase206,status:s?.status,group:s?.targetGroupId}};
  return {__pending:true,units,truck:{x:truck?.x,y:truck?.y,phase:s?.phase206,status:s?.status,group:s?.targetGroupId,cargo:{...s?.cargo}}};
},{I,base:groupInitial},60000);
if(group.units.some(u=>u.source!==I.groupTruck)) throw new Error(`group recipient source mismatch ${JSON.stringify(group)}`);

const final = await page.evaluate(I=>{
  const g=globalThis.__FD_DEBUG__.game,L=globalThis.__FD_LOGISTICS206__,b=globalThis.__FD_STABLE_STATE165__.bridge;
  const r=L.ensureUnit(g.getEntity(I.receiver),false),p=L.ensureUnit(g.getEntity(I.provider),false);
  const markerKey=Object.keys(globalThis).filter(k=>k.startsWith('__FD_LOGISTICS_INTEGRITY_')).sort((a,b)=>Number(b.match(/_(\d+)__$/)?.[1]||0)-Number(a.match(/_(\d+)__$/)?.[1]||0))[0];
  return {receiver:{fuel:r.fuel,fuelMax:r.fuelMax,cargo:{...r.cargo}},provider:{cargo:{...p.cargo},mission:p.missionType,phase:p.phase206,status:p.status},bridge:{ready:b.ready,failed:b.failed,tick:b.workerTick,recoveries:Number(b.recoveryAttempts201||0),error:b.lastError||null},markerKey,marker:markerKey?globalThis[markerKey]:null};
},I);
if(final.bridge.failed || final.bridge.recoveries) throw new Error(`authoritative bridge unhealthy ${JSON.stringify(final.bridge)}`);
if(!final.marker?.truckToTruckTankService || !final.marker?.missionRadiusAuthoritative || !final.marker?.receiverCargoIsolation) throw new Error(`logistics service marker missing ${JSON.stringify(final)}`);
if(errors.length) throw new Error(`browser errors ${JSON.stringify(errors)}`);

console.log(JSON.stringify({ok:true,initial,area,group,final,capability:await latestGlobal('__FD_LOGISTICS_INTEGRITY_')},null,2));
await browser.close();
