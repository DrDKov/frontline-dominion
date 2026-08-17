import { webkit } from 'playwright';

const url = process.env.FD_GAME_URL || 'http://127.0.0.1:8765/frontline-dominion/frontline-dominion.html?build=187';
const browser = await webkit.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1024, height: 768 }, hasTouch: true, isMobile: false, deviceScaleFactor: 2 });
const page = await context.newPage();
const errors = [], failed = [], consoles = [], navigations = [];
page.on('pageerror', error => errors.push(String(error?.stack || error)));
page.on('requestfailed', request => failed.push({ url: request.url(), error: request.failure()?.errorText || 'failed' }));
page.on('console', message => {
  const record = { type: message.type(), text: message.text(), at: Date.now() };
  consoles.push(record);
  if (/FD187|Simulation Worker|Frontline Dominion/i.test(record.text) || ['error', 'warning'].includes(record.type)) console.log('WEBKIT187_CONSOLE ' + JSON.stringify(record));
});
page.on('framenavigated', frame => { if (frame === page.mainFrame()) navigations.push(frame.url()); });

await page.goto(url, { waitUntil: 'load', timeout: 30000 });
await page.waitForTimeout(700);
const initial = await page.evaluate(() => {
  const button = document.getElementById('start-game');
  const start = document.getElementById('start-screen');
  const rect = element => {
    if (!element) return null;
    const r = element.getBoundingClientRect(), s = getComputedStyle(element);
    return { width: r.width, height: r.height, display: s.display, visibility: s.visibility, opacity: s.opacity, pointerEvents: s.pointerEvents };
  };
  return {
    href: location.href, title: document.title, htmlClass: document.documentElement.className,
    buildData: document.documentElement.dataset.fdBuild || null, start: rect(start),
    button: { ...rect(button), disabled: !!button?.disabled }, shell187: !!globalThis.__FD_RUNTIME_SHELL_187__,
    ui187: !!globalThis.__FD_RUNTIME_UI_187__, ui186: !!globalThis.__FD_RUNTIME_UI_186__,
    scripts: [...document.scripts].filter(s => s.src).map(s => new URL(s.src).pathname.split('/').pop() + new URL(s.src).search),
  };
});
console.log('WEBKIT187_INITIAL ' + JSON.stringify(initial));
if (!initial.shell187 || !initial.ui187 || initial.ui186) throw new Error(`WebKit canonical shell invalid: ${JSON.stringify(initial)}`);
if (!/v16\.8\.3/i.test(initial.title) || initial.buildData !== '187') throw new Error(`WebKit stale version owner survived: ${JSON.stringify(initial)}`);
if (/fd-boot183|fd-ready183/.test(initial.htmlClass)) throw new Error(`WebKit orphan boot class survived: ${initial.htmlClass}`);
if (!initial.button || initial.button.display === 'none' || initial.button.visibility === 'hidden' || Number(initial.button.opacity) <= 0 || initial.button.width < 20 || initial.button.height < 20 || initial.button.disabled) throw new Error(`WebKit start button is not actionable: ${JSON.stringify(initial.button)}`);
if (initial.scripts.some(src => /\.js\?build=(?!187(?:\D|$))/.test(src))) throw new Error(`Mixed main-thread cache generations: ${JSON.stringify(initial.scripts)}`);

const clickStarted = Date.now();
let clickError = null;
try {
  await page.locator('#start-game').click({ timeout: 45000 });
} catch (error) {
  clickError = String(error?.stack || error);
}
const clickMs = Date.now() - clickStarted;
console.log('WEBKIT187_CLICK ' + JSON.stringify({ clickMs, clickError, consoles: consoles.filter(x => /FD187/i.test(x.text)) }));
if (clickError) {
  try {
    const phase = await page.evaluate(() => globalThis.__FD_START_PHASE187__ || null);
    console.log('WEBKIT187_PHASE_AFTER_CLICK_ERROR ' + JSON.stringify(phase));
  } catch (error) {
    console.log('WEBKIT187_PHASE_UNREADABLE ' + String(error));
  }
  await browser.close();
  throw new Error(`WebKit start click did not return in ${clickMs}ms: ${clickError}`);
}

await page.waitForFunction(() => !!globalThis.__FD_DEBUG__?.game && Number(globalThis.__FD_STABLE_STATE165__?.bridge?.workerTick || 0) > 0, { timeout: 20000 });
await page.waitForTimeout(1200);
const state = await page.evaluate(() => {
  const g = globalThis.__FD_DEBUG__?.game, b = globalThis.__FD_STABLE_STATE165__?.bridge;
  const c = document.getElementById('game-canvas'), ctx = c?.getContext('2d');
  let pixels = null;
  try {
    const sw = Math.min(c.width, 160), sh = Math.min(c.height, 100), sx = Math.max(0, Math.floor((c.width - sw) / 2)), sy = Math.max(0, Math.floor((c.height - sh) / 2));
    const d = ctx.getImageData(sx, sy, sw, sh).data;
    let lit = 0, max = 0, sum = 0; const bins = new Set();
    for (let i = 0; i < d.length; i += 16) { const r = d[i], gg = d[i + 1], bb = d[i + 2], v = Math.max(r, gg, bb); if (v > 12) lit += 1; max = Math.max(max, v); sum += v; bins.add((r >> 4) + ',' + (gg >> 4) + ',' + (bb >> 4)); }
    pixels = { lit, max, avg: sum / Math.max(1, d.length / 16), bins: bins.size };
  } catch (error) { pixels = { error: String(error) }; }
  const rect = element => { if (!element) return null; const r = element.getBoundingClientRect(), s = getComputedStyle(element); return { x: r.x, y: r.y, width: r.width, height: r.height, display: s.display, visibility: s.visibility, opacity: s.opacity, z: s.zIndex }; };
  return {
    href: location.href, title: document.title, htmlClass: document.documentElement.className,
    phase: globalThis.__FD_START_PHASE187__ || null,
    worker: { tick: Number(b?.workerTick || 0), ready: !!b?.ready, failed: !!b?.failed, build: Number(globalThis.__FD_STABLE_STATE165__?.build || 0), transport: b?.transportMode165 || null },
    game: { time: g?.time, tick: g?.simTick, paused: g?.paused, selected: (g?.selected || []).length, render: g?.renderSnapshot ? { frame: g.renderSnapshot.frame, units: g.renderSnapshot.units?.length, buildings: g.renderSnapshot.buildings?.length, resources: g.renderSnapshot.resources?.length } : null },
    canvas: { width: c?.width, height: c?.height, rect: rect(c), pixels },
    selection: rect(document.getElementById('selection-panel')), action: rect(document.getElementById('action-panel')), start: rect(document.getElementById('start-screen')),
  };
});
console.log('WEBKIT187_STATE ' + JSON.stringify({ clickMs, state }));
const titleSamples = [];
for (let i = 0; i < 20; i += 1) { titleSamples.push(await page.title()); await page.waitForTimeout(30); }
const uniqueTitles = [...new Set(titleSamples)];
console.log('WEBKIT187_METADATA ' + JSON.stringify({ uniqueTitles, navigations }));
console.log('WEBKIT187_ERRORS ' + JSON.stringify({ errors, failed: failed.slice(0, 20), consoles: consoles.filter(x => ['error','warning'].includes(x.type)).slice(0, 20) }));
await page.screenshot({ path: '/tmp/webkit187.png', fullPage: true });
await browser.close();

if (state.worker.failed || state.worker.tick <= 0 || state.worker.build !== 187) throw new Error(`WebKit Worker failed: ${JSON.stringify(state.worker)}`);
if (!state.canvas.rect || state.canvas.rect.width < 100 || state.canvas.rect.height < 100) throw new Error('WebKit canvas hidden');
if (state.canvas.pixels?.lit < 20 || state.canvas.pixels?.bins < 3) throw new Error(`WebKit canvas black/blank: ${JSON.stringify(state.canvas.pixels)}`);
if (uniqueTitles.length !== 1 || !/v16\.8\.3/i.test(uniqueTitles[0])) throw new Error(`WebKit title is unstable: ${JSON.stringify(uniqueTitles)}`);
if (navigations.some(value => !value.includes('build=187'))) throw new Error(`WebKit navigated to another build: ${JSON.stringify(navigations)}`);
if (errors.length) throw new Error('WebKit page errors: ' + errors.join(' | '));
