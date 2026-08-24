import { chromium } from 'playwright';
import { gameUrl, runtimeCapabilities, waitFor } from './lib/fd-env.mjs';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const page = await context.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e?.stack || e)));
page.on('console', m => { if (m.type() === 'error' && !/favicon|404|audio|autoplay|Failed to load resource/i.test(m.text())) errors.push(`console:${m.text()}`); });

await page.goto(gameUrl(), { waitUntil: 'load', timeout: 60000 });
await waitFor(page, () => {
  const start = document.getElementById('start-game');
  return start && !start.disabled && globalThis.__FD_DEBUG__?.Game && globalThis.__FD_LOGISTICS206__ ? true : null;
}, undefined, 60000, 100, errors);

const caps = await runtimeCapabilities(page);
if (!caps.logisticsIntegrity.key) throw new Error(`No logistics integrity capability owner: ${JSON.stringify(caps)}`);
if (!caps.runtimeShell.key) throw new Error(`No runtime shell capability owner: ${JSON.stringify(caps)}`);

await page.locator('#start-game').click();
const bridge = await waitFor(page, () => {
  const candidates = Object.keys(globalThis).filter(k => k.startsWith('__FD_STABLE_STATE')).sort((a, b) => Number(b.match(/(\d+)/)?.[1] || 0) - Number(a.match(/(\d+)/)?.[1] || 0));
  const state = candidates.length ? globalThis[candidates[0]] : null;
  const b = state?.bridge;
  if (b?.ready && !b.failed && Number(b.workerTick) > 10) return { key: candidates[0], ready: b.ready, failed: b.failed, tick: b.workerTick, lastAck: b.lastAck, seq: b.seq };
  return { __pending: true, key: candidates[0] || null, ready: Boolean(b?.ready), failed: Boolean(b?.failed), tick: Number(b?.workerTick || 0), error: b?.lastError || null };
}, undefined, 60000, 100, errors);

if (errors.length) throw new Error(`browser errors ${JSON.stringify(errors)}`);
console.log(JSON.stringify({ ok: true, caps, bridge }, null, 2));
await browser.close();
