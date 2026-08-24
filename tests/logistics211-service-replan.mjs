import { chromium } from 'playwright';

// Regression: a SERVICE-phase truck whose remaining cargo cannot satisfy any
// remaining demand key (e.g. only fuel left while the area needs ammo) must
// replan and reload instead of idling in SERVICE forever.
// Unfixed builds leave the truck in SERVICE/SERVICING indefinitely.
const url = process.env.FD_GAME_URL || 'http://127.0.0.1:8765/frontline-dominion/frontline-dominion.html?build=213';
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const page = await context.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e?.stack || e)));
page.on('console', m => { if (m.type() === 'error' && !/favicon|404|audio|autoplay|Failed to load resource/i.test(m.text())) errors.push(`console:${m.text()}`); });

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

await page.goto(url, { waitUntil: 'load', timeout: 60000 });
await waitFor(() => {
  const b = document.getElementById('start-game');
  return b && !b.disabled && globalThis.__FD_DEBUG__?.Game && globalThis.__FD_LOGISTICS206__ ? true : null;
});

const fixture = await page.evaluate(() => {
  const D = globalThis.__FD_DEBUG__, L = globalThis.__FD_LOGISTICS206__;
  const base = D.Game.prototype.initializeBattle;
  D.Game.prototype.initializeBattle = function(...args) {
    const result = base.apply(this, args);
    const B = (id, typeId, x, y) => { const b = new D.Building(this, { id, typeId, team: 'player', x, y, construction: 1, rotation: 0 }); this.addEntity(b); return b; };
    const U = (id, typeId, x, y) => { const u = new D.Unit(this, { id, typeId, team: 'player', x, y, rotation: 0 }); this.addEntity(u); return u; };
    const fillNode = b => { const n = L.ensureNode(b); for (const k of L.STOCK_KEYS) { if (n?.stock) n.stock[k] = n.stock[`${k}Max`]; } return n; };

    fillNode(B('er211hub', 'logisticsHub', 9000, 10000));
    const truck = U('er211truck', 'resourceTruck', 10000, 10000);
    const s = L.ensureUnit(truck, true);
    Object.assign(s, {
      homeNodeId: 'er211hub', sourceNodeId: 'er211hub', destinationNodeId: null,
      missionType: 'SUPPLY_AREA', phase206: 'SERVICE', status: 'SERVICING',
      targetX: 10000, targetY: 10000, serviceRadius: 680,
      fuelMax: 720, fuel: 720, cargoCapacity: 5600,
    });
    // Cargo is fuel-only while the area below demands ammo only.
    s.cargo.fuel = 3000; s.cargo.ammo = 0; s.cargo.support = 0;
    truck.cargo = 3000;
    truck.commandQueue = [{ type: 'logistics206', missionType: 'SUPPLY_AREA', targetX: 10000, targetY: 10000, serviceRadius: 680 }];

    const vehicleType = D.UNIT_TYPES?.tank ? 'tank' : Object.keys(D.UNIT_TYPES || {}).find(id => { const t = D.UNIT_TYPES[id]; return t?.vehicle && !t?.air && id !== 'resourceTruck'; });
    const tank = U('er211tank', vehicleType, 10120, 10040);
    const ts = L.ensureUnit(tank, true);
    ts.fuel = ts.fuelMax; ts.ammoReserve = 0; ts.support = ts.supportMax;
    return result;
  };
  return { ok: true };
});
if (!fixture?.ok) throw new Error(`fixture injection failed: ${JSON.stringify(fixture)}`);

await page.evaluate(() => { document.getElementById('start-game')?.click(); });

// The truck must leave SERVICE promptly: replan, drive to the hub and load the
// ammo its cargo is missing. Poll the phase; SERVICE may appear transiently.
const escaped = await waitFor(() => {
  const g = globalThis.__FD_DEBUG__.game;
  const t = g?.getEntity('er211truck');
  const s = t?.logistics206;
  if (!t || !s) return { __pending: true };
  if (s.phase206 === 'TO_SOURCE' || s.phase206 === 'LOAD' || s.phase206 === 'TO_DEST') {
    return { phase: s.phase206, status: s.status, cargo: { ...s.cargo } };
  }
  return { __pending: true, phase: s.phase206, status: s.status };
}, undefined, 30000);

// The mission must then complete: the tank's ammo reserve gets refilled.
const delivered = await waitFor(() => {
  const g = globalThis.__FD_DEBUG__.game;
  const tank = g?.getEntity('er211tank');
  const ts = tank?.logistics206;
  if (!ts) return { __pending: true };
  if (Number(ts.ammoReserve) > 1) return { ammoReserve: ts.ammoReserve };
  const t = g.getEntity('er211truck');
  return { __pending: true, phase: t?.logistics206?.phase206, ammoReserve: ts.ammoReserve };
}, undefined, 180000);

console.log(JSON.stringify({ ok: true, escaped, delivered }));
await browser.close();
