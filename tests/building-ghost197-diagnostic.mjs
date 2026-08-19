import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const url = process.env.FD_GAME_URL || 'http://127.0.0.1:8765/frontline-dominion/frontline-dominion.html?build=197';
const outDir = process.env.FD_DIAG_DIR || 'diagnostics-building197';
await fs.mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(String(error?.stack || error)));
page.on('console', message => {
  if (message.type() === 'error' && !/favicon|404/i.test(message.text())) errors.push(`console:${message.text()}`);
});

await page.addInitScript(() => {
  const root = globalThis;
  const state = root.__FD_CANVAS_DRAW_DIAG_197__ = {
    enabled: false,
    label: null,
    calls: [],
    maxCalls: 12000,
  };

  const imageSource = image => String(
    image?.currentSrc || image?.src || image?.dataset?.src || image?.constructor?.name || 'unknown'
  );
  const compactStack = () => String(new Error().stack || '')
    .split('\n')
    .slice(2, 10)
    .map(line => line.trim())
    .join(' | ');

  const install = prototype => {
    if (!prototype || prototype.__fdDrawDiag197Installed) return;
    const original = prototype.drawImage;
    if (typeof original !== 'function') return;
    Object.defineProperty(prototype, '__fdDrawDiag197Installed', { value: true, configurable: true });
    prototype.drawImage = function(image, ...args) {
      if (state.enabled && state.calls.length < state.maxCalls) {
        let transform = null;
        try {
          const matrix = this.getTransform?.();
          if (matrix) transform = {
            a: Number(matrix.a), b: Number(matrix.b), c: Number(matrix.c),
            d: Number(matrix.d), e: Number(matrix.e), f: Number(matrix.f),
          };
        } catch (_) {}
        state.calls.push({
          label: state.label,
          canvasId: this.canvas?.id || null,
          canvasWidth: Number(this.canvas?.width || 0),
          canvasHeight: Number(this.canvas?.height || 0),
          source: imageSource(image),
          imageWidth: Number(image?.naturalWidth || image?.videoWidth || image?.width || 0),
          imageHeight: Number(image?.naturalHeight || image?.videoHeight || image?.height || 0),
          args: args.map(value => Number.isFinite(Number(value)) ? Number(value) : String(value)),
          transform,
          alpha: Number(this.globalAlpha),
          composite: String(this.globalCompositeOperation || ''),
          stack: compactStack(),
        });
      }
      return original.call(this, image, ...args);
    };
  };

  install(root.CanvasRenderingContext2D?.prototype);
  install(root.OffscreenCanvasRenderingContext2D?.prototype);
});

const waitFor = async (fn, timeout = 30000, interval = 80) => {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const value = await fn();
    if (value) return value;
    await page.waitForTimeout(interval);
  }
  throw new Error(`Timed out after ${timeout} ms`);
};

await page.goto(url, { waitUntil: 'load', timeout: 60000 });
await waitFor(() => page.evaluate(() => Boolean(
  globalThis.__FD_RUNTIME_SHELL_197__?.build === 197 &&
  globalThis.__FD_BUILDING_SELECTION_INVARIANCE_197__?.build === 197 &&
  globalThis.__FD_DEBUG__?.startGame &&
  !document.getElementById('start-game')?.disabled
)));
await page.locator('#start-game').click();
await waitFor(() => page.evaluate(() => {
  const game = globalThis.__FD_DEBUG__?.game;
  const bridge = globalThis.__FD_STABLE_STATE165__?.bridge;
  return Boolean(game && bridge?.ready && !bridge.failed && Number(bridge.workerTick || 0) >= 10);
}));

await page.evaluate(() => {
  const game = globalThis.__FD_DEBUG__?.game;
  if (!game) throw new Error('game missing');
  game.paused = true;
  const proto = Object.getPrototypeOf(game);
  const state = globalThis.__FD_CANVAS_DRAW_DIAG_197__;
  state.buildingCalls = [];
  if (!proto.__fdBuildingDrawDiag197Installed) {
    const original = proto.drawBuilding3D;
    if (typeof original !== 'function') throw new Error('drawBuilding3D missing');
    proto.drawBuilding3D = function(ctx, building, ...args) {
      const start = state.calls.length;
      if (state.enabled) {
        state.buildingCalls.push({
          label: state.label,
          phase: 'enter',
          id: building?.id || null,
          typeId: building?.typeId || building?.type || null,
          x: Number(building?.x || 0),
          y: Number(building?.y || 0),
          selected: Boolean(building?.selected),
          alive: building?.alive !== false,
          radius: Number(building?.radius || 0),
          start,
          stack: String(new Error().stack || '').split('\n').slice(2, 9).map(line => line.trim()).join(' | '),
        });
      }
      const result = original.call(this, ctx, building, ...args);
      if (state.enabled) {
        state.buildingCalls.push({
          label: state.label,
          phase: 'exit',
          id: building?.id || null,
          typeId: building?.typeId || building?.type || null,
          end: state.calls.length,
          imageCalls: state.calls.length - start,
        });
      }
      return result;
    };
    Object.defineProperty(proto, '__fdBuildingDrawDiag197Installed', { value: true, configurable: true });
  }
});

const inventory = await page.evaluate(() => {
  const game = globalThis.__FD_DEBUG__?.game;
  const buildings = (game?.buildings || []).filter(Boolean);
  const nearDuplicates = [];
  for (let i = 0; i < buildings.length; i += 1) {
    for (let j = i + 1; j < buildings.length; j += 1) {
      const a = buildings[i];
      const b = buildings[j];
      const distance = Math.hypot(Number(a.x || 0) - Number(b.x || 0), Number(a.y || 0) - Number(b.y || 0));
      if (a.id === b.id || distance < Math.max(10, Math.min(Number(a.radius || 0), Number(b.radius || 0)) * 0.35)) {
        nearDuplicates.push({
          a: { id: a.id, typeId: a.typeId, x: a.x, y: a.y, radius: a.radius },
          b: { id: b.id, typeId: b.typeId, x: b.x, y: b.y, radius: b.radius },
          sameObject: a === b,
          distance,
        });
      }
    }
  }
  const ownKeys = Object.keys(game || {}).filter(key => /build|render|draw|sprite|model|select/i.test(key)).sort();
  const protoKeys = [];
  let proto = game;
  const seen = new Set();
  while ((proto = Object.getPrototypeOf(proto)) && proto !== Object.prototype) {
    for (const key of Object.getOwnPropertyNames(proto)) {
      if (!seen.has(key) && /build|render|draw|sprite|model|select/i.test(key)) {
        seen.add(key);
        protoKeys.push(key);
      }
    }
  }
  return {
    count: buildings.length,
    player: buildings.filter(item => item.alive !== false && item.team === 'player').map(item => ({
      id: item.id,
      typeId: item.typeId || item.type || null,
      x: item.x,
      y: item.y,
      radius: item.radius,
      visualScale: item.visualScale,
      scale: item.scale,
      selected: item.selected,
      kind: item.kind,
    })),
    allIds: buildings.map(item => item.id),
    duplicateIds: [...new Set(buildings.map(item => item.id).filter((id, index, ids) => ids.indexOf(id) !== index))],
    nearDuplicates,
    ownKeys,
    protoKeys,
  };
});

const playerBuildings = inventory.player.slice(0, 16);
const cases = [];

for (let index = 0; index < playerBuildings.length; index += 1) {
  const fixture = playerBuildings[index];
  const setup = await page.evaluate(({ id }) => {
    const game = globalThis.__FD_DEBUG__?.game;
    const building = game?.getEntity?.(id) || (game?.buildings || []).find(item => item?.id === id);
    if (!game || !building) return { error: 'missing', id };
    game.clearSelection?.();
    game.centerCamera?.(building.x, building.y);
    if (game.camera) game.camera.zoom = 0.82;
    game.render?.();
    const bounds = game.getBuildingFigureScreenBounds193?.(building) || null;
    return {
      id: building.id,
      typeId: building.typeId || building.type || null,
      x: building.x,
      y: building.y,
      radius: building.radius,
      bounds: bounds ? {
        minX: bounds.minX, minY: bounds.minY, maxX: bounds.maxX, maxY: bounds.maxY,
        width: bounds.width, height: bounds.height,
      } : null,
    };
  }, { id: fixture.id });
  if (setup.error) continue;
  await page.waitForTimeout(80);

  const capture = async (selected, isolated) => page.evaluate(({ id, selected, isolated }) => {
    const game = globalThis.__FD_DEBUG__?.game;
    const diag = globalThis.__FD_CANVAS_DRAW_DIAG_197__;
    const building = game?.getEntity?.(id) || (game?.buildings || []).find(item => item?.id === id);
    if (!game || !diag || !building) return { error: 'missing' };
    const originalBuildings = game.buildings;
    const originalSelected = Array.isArray(game.selected) ? [...game.selected] : [];
    if (isolated) game.buildings = [building];
    if (selected) game.setSelection?.([building], false);
    else game.clearSelection?.();
    diag.calls = [];
    diag.buildingCalls = [];
    diag.label = `${id}:${selected ? 'selected' : 'plain'}:${isolated ? 'isolated' : 'normal'}`;
    diag.enabled = true;
    try {
      game.render?.();
    } finally {
      diag.enabled = false;
      if (isolated) game.buildings = originalBuildings;
      game.selected = originalSelected;
    }
    const spriteCalls = diag.calls.filter(call => /models\/(?:canvas|pilot)\/b-|b-\d+.*(?:webp|glb)/i.test(call.source));
    const targetBuildingCalls = diag.buildingCalls.filter(call => call.id === id);
    const allBuildingEntries = diag.buildingCalls.filter(call => call.phase === 'enter');
    const sourceSummary = Object.entries(spriteCalls.reduce((map, call) => {
      const key = call.source;
      map[key] = (map[key] || 0) + 1;
      return map;
    }, {})).map(([source, count]) => ({ source, count }));
    return {
      label: diag.label,
      selectedInArray: game.selected?.some?.(item => item?.id === id) || selected,
      buildingSelectedFlag: building.selected,
      totalImageCalls: diag.calls.length,
      spriteCalls,
      sourceSummary,
      targetBuildingCalls,
      allBuildingEntries,
      geometry: {
        radius: building.radius,
        visualScale: building.visualScale,
        scale: building.scale,
      },
    };
  }, { id: fixture.id, selected, isolated });

  const plain = await capture(false, false);
  const selected = await capture(true, false);
  const isolatedPlain = await capture(false, true);
  const isolatedSelected = await capture(true, true);

  await page.evaluate(({ id }) => {
    const game = globalThis.__FD_DEBUG__?.game;
    const building = game?.getEntity?.(id) || (game?.buildings || []).find(item => item?.id === id);
    game?.setSelection?.([building], false);
    game?.render?.();
  }, { id: fixture.id });
  const canvas = page.locator('#game-canvas');
  await canvas.screenshot({ path: path.join(outDir, `${String(index).padStart(2, '0')}-${fixture.id}-${String(fixture.typeId || 'building').replace(/[^a-z0-9_-]+/gi, '_')}-selected.png`) });

  cases.push({ fixture: setup, plain, selected, isolatedPlain, isolatedSelected });
}

const report = {
  ok: errors.length === 0,
  url,
  inventory,
  cases,
  errors,
};
await fs.writeFile(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
console.log('FD197_BUILDING_GHOST ' + JSON.stringify(report));
await context.close();
await browser.close();
