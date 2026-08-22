import { chromium } from 'playwright';

const url = process.env.FD_GAME_URL || 'http://127.0.0.1:8765/frontline-dominion/frontline-dominion.html?build=206';
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(String(error?.stack || error)));
page.on('console', message => {
  if (message.type() !== 'error') return;
  const value = message.text();
  if (!/favicon|404|audio|autoplay|Failed to load resource:.*503/i.test(value)) errors.push(`console:${value}`);
});

const waitFor = async (fn, arg = undefined, timeout = 30000, interval = 100) => {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < timeout) {
    last = await page.evaluate(fn, arg);
    if (last) return last;
    await page.waitForTimeout(interval);
  }
  throw new Error(`Timed out after ${timeout}ms; last=${JSON.stringify(last)}`);
};

await page.goto(url, { waitUntil: 'load', timeout: 60000 });
const menu = await waitFor(() => {
  const slots = globalThis.__FD_SAVE_SLOTS_206__;
  const shell = globalThis.__FD_RUNTIME_SHELL_206__;
  return slots?.state?.ready && slots?.state?.installed && shell?.state?.installed
    ? { build: slots.build, logistics: Boolean(globalThis.__FD_LOGISTICS206__), ui: Boolean(globalThis.__FD_LOGISTICS_UI206__) }
    : null;
}, undefined, 30000);
if (menu.build !== 206 || !menu.logistics || !menu.ui) throw new Error(`Build 206 owners missing: ${JSON.stringify(menu)}`);

await page.locator('#start-game').click();
const ready = await waitFor(() => {
  const game = globalThis.__FD_DEBUG__?.game;
  const bridge = globalThis.__FD_STABLE_STATE165__?.bridge;
  return game && bridge?.ready && !bridge.failed && Number(bridge.workerTick || 0) > 10
    ? { tick:Number(bridge.workerTick), buildings:game.buildings.length, units:game.units.length, actionErrors:Number(bridge.actionErrors||0) }
    : null;
}, undefined, 45000);
if (ready.actionErrors) throw new Error(`Worker started with action errors: ${JSON.stringify(ready)}`);

const baseline = await page.evaluate(() => {
  const D = globalThis.__FD_DEBUG__, game = D.game, L = globalThis.__FD_LOGISTICS206__;
  const hq = game.buildings.find(b => b?.alive && b.completed && b.team === 'player' && b.typeId === 'hq');
  if (!hq) return { error:'hq-missing' };
  const node = hq.logistics206 || L.ensureNode(hq);
  return {
    hqId:hq.id,
    stock:{...node.stock},
    priority:node.priority,
    hash:game.networkLogisticsHash206?.(false),
    toggle:Boolean(document.getElementById('fd-logistics-toggle206')),
    oldSupplyMagic: game.operationalCore160?.updateSupply?.toString?.().includes('L.unitReadiness') || false,
  };
});
if (baseline.error || !baseline.toggle || !(baseline.stock.fuel > 0) || !(baseline.stock.ammo > 0) || !(baseline.stock.support > 0) || !baseline.hash) {
  throw new Error(`Initial physical logistics not initialized: ${JSON.stringify(baseline)}`);
}

// A logistics write must be a Worker action and must ACK before the mirror changes.
const priorityCommand = await page.evaluate(({ hqId }) => {
  const game = globalThis.__FD_DEBUG__.game;
  const bridge = globalThis.__FD_STABLE_STATE165__.bridge;
  const before = Number(bridge.seq || 0);
  const issued = game.setSupplyPriority206({ entityId:hqId, priority:'HIGH' });
  return { issued, before, sent:Number(bridge.seq || 0) };
}, baseline);
if (!priorityCommand.issued || priorityCommand.sent <= priorityCommand.before) throw new Error(`Priority did not enter Worker command path: ${JSON.stringify(priorityCommand)}`);
await waitFor(({ hqId, seq }) => {
  const game=globalThis.__FD_DEBUG__?.game, bridge=globalThis.__FD_STABLE_STATE165__?.bridge;
  return Number(bridge?.lastAck||0)>=seq && game?.getEntity?.(hqId)?.logistics206?.priority==='HIGH';
}, { hqId:baseline.hqId, seq:priorityCommand.sent }, 15000);

// Building-owned transport creation goes through production and is not a visual-only spawn.
const transportRequest = await page.evaluate(({ hqId }) => {
  const game=globalThis.__FD_DEBUG__.game, bridge=globalThis.__FD_STABLE_STATE165__.bridge;
  const before=Number(bridge.seq||0); const issued=game.createSupplyTransport206({buildingId:hqId});
  return {issued,before,sent:Number(bridge.seq||0),beforeTrucks:game.units.filter(u=>u?.alive&&u.typeId==='resourceTruck').length};
}, baseline);
if (!transportRequest.issued || transportRequest.sent <= transportRequest.before) throw new Error(`Create transport did not enter Worker: ${JSON.stringify(transportRequest)}`);
await waitFor(seq => Number(globalThis.__FD_STABLE_STATE165__?.bridge?.lastAck||0)>=seq, transportRequest.sent, 15000);
const truck = await waitFor(({ hqId, beforeTrucks }) => {
  const game=globalThis.__FD_DEBUG__?.game;
  const trucks=game?.units?.filter(u=>u?.alive&&u.typeId==='resourceTruck')||[];
  const created=trucks.find(u=>u.logistics206?.homeNodeId===hqId) || (trucks.length>beforeTrucks ? trucks.at(-1) : null);
  return created ? { id:created.id, home:created.logistics206?.homeNodeId, capacity:created.logistics206?.cargoCapacity, fuel:created.logistics206?.fuel, fuelMax:created.logistics206?.fuelMax } : null;
}, { hqId:baseline.hqId, beforeTrucks:transportRequest.beforeTrucks }, 45000, 150);
if (!(truck.capacity >= 6000) || !(truck.fuelMax > 0)) throw new Error(`Physical supply truck state invalid: ${JSON.stringify(truck)}`);

// Supply Area mission must be authoritative and visible in the selected-unit detail state.
const area = await page.evaluate(({ truckId }) => {
  const game=globalThis.__FD_DEBUG__.game, bridge=globalThis.__FD_STABLE_STATE165__.bridge;
  const u=game.getEntity(truckId); game.setSelection([u],false);
  const before=Number(bridge.seq||0);
  const issued=game.setLogisticsMission206({truckIds:[truckId],missionType:'SUPPLY_AREA',targetX:u.x+520,targetY:u.y+180,serviceRadius:680});
  return {issued,before,sent:Number(bridge.seq||0)};
}, { truckId:truck.id });
if (!area.issued || area.sent<=area.before) throw new Error(`Supply Area was not routed to Worker: ${JSON.stringify(area)}`);
const areaApplied = await waitFor(({ truckId, seq }) => {
  const game=globalThis.__FD_DEBUG__?.game, bridge=globalThis.__FD_STABLE_STATE165__?.bridge, u=game?.getEntity?.(truckId);
  return Number(bridge?.lastAck||0)>=seq && u?.logistics206?.missionType==='SUPPLY_AREA'
    ? { mission:u.logistics206.missionType, radius:u.logistics206.serviceRadius, cargo:{...u.logistics206.cargo}, source:u.logistics206.sourceNodeId, status:u.logistics206.status }
    : null;
}, {truckId:truck.id,seq:area.sent}, 15000);
if (areaApplied.radius < 600) throw new Error(`Supply Area mirror is incomplete: ${JSON.stringify(areaApplied)}`);

// The logistics overlay and selected truck panel are actual presentation state, not hidden debug-only data.
await page.locator('#fd-logistics-toggle206').click();
const ui = await waitFor(() => ({
  overlay: document.getElementById('fd-logistics-toggle206')?.classList.contains('active'),
  summary: document.getElementById('fd-logistics-summary206')?.textContent || '',
  panel: document.querySelector('[data-logistics206]')?.textContent || '',
}));
if (!ui.overlay || !/Fuel/i.test(ui.summary) || !/Грузовик снабжения/i.test(ui.panel) || !/СНАБЖАТЬ ОБЛАСТЬ/i.test(ui.panel)) {
  throw new Error(`Logistics UI/overlay missing: ${JSON.stringify(ui)}`);
}

// Fuel is consumed by actual displacement. Use a normal move order so the truck cannot remain in a supply wait state.
const movement = await page.evaluate(({ truckId }) => {
  const game=globalThis.__FD_DEBUG__.game, bridge=globalThis.__FD_STABLE_STATE165__.bridge, u=game.getEntity(truckId);
  game.setSelection([u],false); const fuel=Number(u.logistics206?.fuel); const before=Number(bridge.seq||0);
  const issued=game.issueMove(u.x+650,u.y+120,false); return {fuel,before,sent:Number(bridge.seq||0),issued,x:u.x,y:u.y};
}, {truckId:truck.id});
if (!movement.issued || movement.sent<=movement.before) throw new Error(`Truck movement not authoritative: ${JSON.stringify(movement)}`);
const moved = await waitFor(({truckId,fuel,x,y})=>{
  const u=globalThis.__FD_DEBUG__?.game?.getEntity?.(truckId); if(!u?.logistics206)return null;
  const distance=Math.hypot(u.x-x,u.y-y); const current=Number(u.logistics206.fuel);
  return distance>35 && current<fuel ? {distance,current,fuelMax:u.logistics206.fuelMax}:null;
},{truckId:truck.id,fuel:movement.fuel,x:movement.x,y:movement.y},20000,120);
if (!(moved.current < movement.fuel)) throw new Error(`Movement did not consume fuel: ${JSON.stringify({movement,moved})}`);

// Save data must contain root logistics plus exact unit/node logistics state.
const saved = await page.evaluate(async ({truckId,hqId})=>{
  const api=globalThis.__FD_SAVE_SLOTS_206__; const raw=await api.captureExactSave(); const data=JSON.parse(raw);
  const truck=data.entities?.find(e=>e.id===truckId), hq=data.entities?.find(e=>e.id===hqId);
  return {bytes:raw.length,root:Boolean(data.logistics206),truck:truck?.logistics206||null,hq:hq?.logistics206||null,tick:data.authoritative172?.simTick,hash:data.authoritative172?.stateHash};
},{truckId:truck.id,hqId:baseline.hqId});
if (!saved.root || !saved.truck || !saved.hq || !(saved.bytes>1000) || !Number.isFinite(saved.truck.fuel) || !saved.truck.cargo) {
  throw new Error(`Authoritative save omits physical logistics: ${JSON.stringify(saved)}`);
}

if (errors.length) throw new Error(`Browser errors: ${JSON.stringify(errors)}`);
console.log(JSON.stringify({ok:true,menu,ready,baseline,priorityCommand,truck,areaApplied,ui,moved,saved:{...saved,truck:'present',hq:'present'}}));
await context.close();
await browser.close();
