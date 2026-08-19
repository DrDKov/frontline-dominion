import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const url = process.env.FD_GAME_URL || 'http://127.0.0.1:8765/frontline-dominion/frontline-dominion.html?build=197';
const outDir = process.env.FD_DIAG_DIR || 'diagnostics-building197';
await fs.mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const waitFor = async (fn, timeout = 30000) => {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const value = await fn();
    if (value) return value;
    await page.waitForTimeout(80);
  }
  throw new Error(`timeout ${timeout}`);
};

await page.goto(url, { waitUntil: 'load', timeout: 60000 });
await waitFor(() => page.evaluate(() => Boolean(globalThis.__FD_DEBUG__?.startGame && !document.getElementById('start-game')?.disabled)));
await page.locator('#start-game').click();
await waitFor(() => page.evaluate(() => Boolean(globalThis.__FD_DEBUG__?.game && globalThis.__FD_STABLE_STATE165__?.bridge?.ready)));

await page.evaluate(() => {
  const root = globalThis;
  const proto = root.CanvasRenderingContext2D?.prototype;
  const game = root.__FD_DEBUG__?.game;
  if (!proto || !game) throw new Error('runtime missing');
  const state = root.__FD_BUILDING_STACK_197__ = { active: false, calls: [] };
  const original = proto.drawImage;
  proto.drawImage = function(image, ...args) {
    const source = String(image?.currentSrc || image?.src || '');
    if (state.active && this.canvas?.id === 'game-canvas' && /\/b-02-views\.webp/i.test(source)) {
      state.calls.push({
        source,
        args: args.map(value => Number.isFinite(Number(value)) ? Number(value) : String(value)),
        stack: String(new Error('B02 draw').stack || '').split('\n').slice(1, 16).map(line => line.trim()),
      });
    }
    return original.call(this, image, ...args);
  };
});

const fixture = await page.evaluate(() => {
  const game = globalThis.__FD_DEBUG__?.game;
  const canvas = document.getElementById('game-canvas');
  const rect = canvas.getBoundingClientRect();
  const building = game.buildings.find(item => item?.alive && item.team === 'player' && item.typeId === 'power');
  game.clearSelection?.();
  game.centerCamera?.(building.x, building.y);
  game.camera.zoom = 0.82;
  globalThis.__FD_CLASSIC_RENDER__?.invalidate?.();
  game.render?.();
  const bounds = game.getBuildingFigureScreenBounds193(building);
  let point = null;
  for (let yi = 2; yi <= 10 && !point; yi += 1) for (let xi = 2; xi <= 10; xi += 1) {
    const sx = bounds.x1 + bounds.width * xi / 12;
    const sy = bounds.y1 + bounds.height * yi / 12;
    const world = game.screenToWorld(sx, sy, 0);
    if (game.getBuildingFigureHits193(world.x, world.y)?.[0]?.building?.id === building.id) {
      point = { sx, sy };
      break;
    }
  }
  return {
    id: building.id,
    cssX: rect.left + point.sx * rect.width / canvas.width,
    cssY: rect.top + point.sy * rect.height / canvas.height,
  };
});

await page.evaluate(() => { globalThis.__FD_BUILDING_STACK_197__.active = true; });
await page.mouse.click(fixture.cssX, fixture.cssY, { button: 'left' });
await waitFor(() => page.evaluate(id => globalThis.__FD_DEBUG__?.game?.selected?.some(item => item?.id === id), fixture.id), 6000);
await page.waitForTimeout(350);
await page.evaluate(() => { globalThis.__FD_BUILDING_STACK_197__.active = false; });
const report = await page.evaluate(() => ({ calls: globalThis.__FD_BUILDING_STACK_197__.calls }));
await fs.writeFile(path.join(outDir, 'building-stack197.json'), JSON.stringify(report, null, 2));
console.log('FD197_BUILDING_STACK ' + JSON.stringify(report));
await browser.close();
