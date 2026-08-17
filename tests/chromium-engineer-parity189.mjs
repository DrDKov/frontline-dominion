import process from 'node:process';

const port = process.env.FD_DEBUG_PORT || '9222';
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
let targets = [];
for (let attempt = 0; attempt < 80; attempt += 1) {
  try {
    targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
    if (targets.length) break;
  } catch {}
  await sleep(100);
}
const target = targets.find(item => item.type === 'page' && item.url.includes('frontline-dominion')) || targets.find(item => item.type === 'page');
if (!target?.webSocketDebuggerUrl) throw new Error('No Chromium Frontline Dominion target');

const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.onopen = resolve;
  socket.onerror = reject;
});
let sequence = 1;
const pending = new Map();
socket.onmessage = event => {
  const message = JSON.parse(event.data);
  if (!message.id || !pending.has(message.id)) return;
  const request = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) request.reject(new Error(JSON.stringify(message.error)));
  else request.resolve(message.result);
};
const call = (method, params = {}) => new Promise((resolve, reject) => {
  const id = sequence++;
  pending.set(id, { resolve, reject });
  socket.send(JSON.stringify({ id, method, params }));
});
const evaluate = async expression => {
  const response = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text || 'Chromium evaluate failed');
  return response.result?.value;
};
await call('Runtime.enable');

let geometry = null;
for (let attempt = 0; attempt < 80; attempt += 1) {
  geometry = await evaluate(`(() => {
    const game = globalThis.__FD_DEBUG__?.game;
    const bridge = globalThis.__FD_STABLE_STATE165__?.bridge;
    const worker = game?.units?.find(unit => unit?.alive && unit.team === 'player' && unit.typeId === 'worker');
    const infantry = game?.units?.find(unit => unit?.alive && unit.team === 'player' && unit.infantry && unit.typeId !== 'worker');
    if (!game || Number(bridge?.workerTick || 0) <= 0 || !worker || !infantry) return null;
    const bounds = unit => game.getUnitFigureScreenBounds140?.(unit) || game.getInfantryScreenBounds138?.(unit) || null;
    const height = value => value ? Number(value.y2 - value.y1 || value.visibleHeight || value.height || 0) : 0;
    const workerBounds = bounds(worker);
    const infantryBounds = bounds(infantry);
    const directWorkerBounds = game.getWorkerScreenBounds115?.(worker) || null;
    return {
      build: Number(globalThis.__FD_STABLE_STATE165__?.build || 0),
      tick: Number(bridge?.workerTick || 0),
      failed: !!bridge?.failed,
      workerId: worker.id,
      infantryId: infantry.id,
      workerRadius: Number(worker.radius || 0),
      infantryRadius: Number(infantry.radius || 0),
      workerStatsRadius: Number(worker.stats?.radius ?? worker.radius ?? 0),
      infantryStatsRadius: Number(infantry.stats?.radius ?? infantry.radius ?? 0),
      workerCollisionRadius: Number(worker.collisionRadius ?? worker.stats?.collisionRadius ?? worker.radius ?? 0),
      infantryCollisionRadius: Number(infantry.collisionRadius ?? infantry.stats?.collisionRadius ?? infantry.radius ?? 0),
      workerFootprintRadius: Number(worker.footprintRadius ?? worker.stats?.footprintRadius ?? worker.radius ?? 0),
      infantryFootprintRadius: Number(infantry.footprintRadius ?? infantry.stats?.footprintRadius ?? infantry.radius ?? 0),
      workerSelectionRadius: Number(worker.selectionRadius ?? worker.stats?.selectionRadius ?? 0),
      infantrySelectionRadius: Number(infantry.selectionRadius ?? infantry.stats?.selectionRadius ?? 0),
      workerProfileRadius: Number(worker.profileRadius ?? worker.stats?.profileRadius ?? 0),
      infantryProfileRadius: Number(infantry.profileRadius ?? infantry.stats?.profileRadius ?? 0),
      workerDisplayRadius: Number(worker.displayRadius ?? worker.stats?.displayRadius ?? 0),
      infantryDisplayRadius: Number(infantry.displayRadius ?? infantry.stats?.displayRadius ?? 0),
      workerScale: Number(worker.stats?.visualScale ?? worker.visualScale ?? 1),
      infantryScale: Number(infantry.stats?.visualScale ?? infantry.visualScale ?? 1),
      workerHeight: height(workerBounds),
      infantryHeight: height(infantryBounds),
      directWorkerHeight: height(directWorkerBounds),
      parityReference: worker._fdEngineerParity189 || null,
    };
  })()`);
  if (geometry) break;
  await sleep(100);
}
if (!geometry) throw new Error('Chromium engineer/infantry comparison unavailable');
if (geometry.build !== 189 || geometry.tick <= 0 || geometry.failed) throw new Error(`Chromium build/Worker invalid: ${JSON.stringify(geometry)}`);

const checks = [
  ['radius', geometry.workerRadius, geometry.infantryRadius, 0.05],
  ['stats radius', geometry.workerStatsRadius, geometry.infantryStatsRadius, 0.05],
  ['collision radius', geometry.workerCollisionRadius, geometry.infantryCollisionRadius, 0.05],
  ['footprint radius', geometry.workerFootprintRadius, geometry.infantryFootprintRadius, 0.05],
  ['selection radius', geometry.workerSelectionRadius, geometry.infantrySelectionRadius, 0.05],
  ['profile radius', geometry.workerProfileRadius, geometry.infantryProfileRadius, 0.05],
  ['display radius', geometry.workerDisplayRadius, geometry.infantryDisplayRadius, 0.05],
  ['visual scale', geometry.workerScale, geometry.infantryScale, 0.02],
];
for (const [label, workerValue, infantryValue, tolerance] of checks) {
  if (!Number.isFinite(workerValue) || !Number.isFinite(infantryValue) || Math.abs(workerValue - infantryValue) > tolerance) {
    throw new Error(`Chromium engineer ${label} mismatch: ${JSON.stringify(geometry)}`);
  }
}
if (Number(geometry.parityReference?.build || 0) !== 189) throw new Error(`Chromium parity owner marker missing: ${JSON.stringify(geometry)}`);
const visualRatio = geometry.workerHeight / Math.max(1, geometry.infantryHeight);
if (visualRatio < 0.82 || visualRatio > 1.18) throw new Error(`Chromium engineer visible height mismatch: ratio=${visualRatio} ${JSON.stringify(geometry)}`);
if (Math.abs(geometry.directWorkerHeight - geometry.workerHeight) > 1.5) throw new Error(`Chromium engineer indicator bounds mismatch: ${JSON.stringify(geometry)}`);

console.log('CHROMIUM189_ENGINEER_PARITY ' + JSON.stringify({ ok: true, visualRatio, geometry }));
socket.close();
