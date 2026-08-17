import { webkit } from 'playwright';

const url = process.env.FD_GAME_URL || 'http://127.0.0.1:8765/frontline-dominion/frontline-dominion.html?build=190';
const browser = await webkit.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1180, height: 820 },
  hasTouch: true,
  isMobile: false,
  deviceScaleFactor: 2,
});
const page = await context.newPage();
const pageErrors = [];
const consoleErrors = [];
page.on('pageerror', error => pageErrors.push(String(error?.stack || error)));
page.on('console', message => {
  if (message.type() === 'error') consoleErrors.push(message.text());
  if (['error', 'warning'].includes(message.type()) || /FD190|Frontline Dominion/i.test(message.text())) {
    console.log('WEBKIT190_CONSOLE ' + JSON.stringify({ type: message.type(), text: message.text() }));
  }
});

const runtimeState = () => page.evaluate(() => {
  const bridge = globalThis.__FD_STABLE_STATE165__?.bridge;
  const game = globalThis.__FD_DEBUG__?.game;
  const start = document.getElementById('start-screen');
  const startButton = document.getElementById('start-game');
  const loadButton = document.getElementById('load-game');
  return {
    href: location.href,
    title: document.title,
    buildData: document.documentElement.dataset.fdBuild || null,
    startDisplay: start ? getComputedStyle(start).display : null,
    startButton: startButton ? { disabled: startButton.disabled, text: startButton.textContent } : null,
    loadButton: loadButton ? { disabled: loadButton.disabled, text: loadButton.textContent } : null,
    boot: globalThis.__FD_BOOT_190__?.state || null,
    shell: globalThis.__FD_RUNTIME_SHELL_190__?.state || null,
    stability: globalThis.__FD_RUNTIME_STABILITY_190__?.diagnostics?.() || null,
    game: game ? {
      tick: Number(game.simTick || 0),
      units: game.units?.length || 0,
      buildings: game.buildings?.length || 0,
    } : null,
    bridge: bridge ? {
      build: Number(globalThis.__FD_STABLE_STATE165__?.build || 0),
      tick: Number(bridge.workerTick || 0),
      failed: !!bridge.failed,
      lastError: bridge.lastError || null,
    } : null,
  };
});

await page.goto(url, { waitUntil: 'commit', timeout: 30000 });
await page.waitForFunction(
  () => globalThis.__FD_RUNTIME_SHELL_190__?.state?.installed === true &&
    globalThis.__FD_BOOT_190__?.state?.ready === true &&
    document.getElementById('start-game')?.disabled === false,
  null,
  { timeout: 45000 },
);
const ready = await runtimeState();
console.log('WEBKIT190_READY ' + JSON.stringify(ready));
if (ready.buildData !== '190' || !/v16\.8\.6/i.test(ready.title)) throw new Error(`wrong canonical build: ${JSON.stringify(ready)}`);
if (!ready.loadButton?.disabled) throw new Error('load button should be disabled before the first checkpoint in a clean browser context');

await page.locator('#start-game').click({ timeout: 10000 });
await page.waitForFunction(
  () => !!globalThis.__FD_DEBUG__?.game &&
    Number(globalThis.__FD_STABLE_STATE165__?.bridge?.workerTick || 0) > 0 &&
    !globalThis.__FD_STABLE_STATE165__?.bridge?.failed,
  null,
  { timeout: 30000 },
);
await page.waitForTimeout(700);

await page.evaluate(async () => {
  const pilot = globalThis.__FD_MODEL_PILOT__;
  if (!pilot?.ready) throw new Error('model pilot unavailable');
  const manifest = await pilot.ready;
  if (!manifest) throw new Error('model manifest did not load');
});

const engineer = await page.evaluate(() => {
  const debug = globalThis.__FD_DEBUG__;
  const game = debug.game;
  let worker = game.units.find(unit => unit?.alive && unit.team === 'player' && unit.typeId === 'worker');
  if (!worker) throw new Error('initial engineer missing');
  let rocket = game.units.find(unit => unit?.alive && unit.team === 'player' && unit.typeId === 'rocket');
  if (!rocket) {
    rocket = new debug.Unit(game, {
      typeId: 'rocket', team: 'player',
      x: worker.x + 95, y: worker.y + 35,
      rotation: worker.rotation || 0,
    });
    game.addEntity(rocket);
  }
  globalThis.__FD_RUNTIME_STABILITY_190__.syncEngineers(game);
  worker = game.getEntity(worker.id);
  rocket = game.getEntity(rocket.id);
  const workerBounds = game.getInfantryScreenBounds138(worker);
  const rocketBounds = game.getInfantryScreenBounds138(rocket);
  const size = bounds => ({
    width: Number(bounds?.visibleWidth || bounds?.x2 - bounds?.x1 || 0),
    height: Number(bounds?.visibleHeight || bounds?.y2 - bounds?.y1 || 0),
    source: bounds?.source || null,
  });
  const workerSize = size(workerBounds);
  const rocketSize = size(rocketBounds);
  return {
    workerId: worker.id,
    rocketId: rocket.id,
    workerType: worker.typeId,
    rocketType: rocket.typeId,
    workerRadius: Number(worker.radius || 0),
    rocketRadius: Number(rocket.radius || 0),
    workerStatsRadius: Number(worker.stats?.radius || 0),
    rocketStatsRadius: Number(rocket.stats?.radius || 0),
    workerScale: Number(worker.stats?.visualScale || 0),
    rocketScale: Number(rocket.stats?.visualScale || 0),
    workerSize,
    rocketSize,
    widthRatio: workerSize.width / Math.max(1, rocketSize.width),
    heightRatio: workerSize.height / Math.max(1, rocketSize.height),
    workerModel: globalThis.__FD_MODEL_PILOT__?.modelForType?.('worker', 'unit') || null,
    rocketModel: globalThis.__FD_MODEL_PILOT__?.modelForType?.('rocket', 'unit') || null,
    workerRole: worker.stats?.role || null,
    workerWeapon: !!worker.stats?.weapon,
    marker: worker._fdEngineerRocketSize190 || null,
    diagnostics: globalThis.__FD_RUNTIME_STABILITY_190__.diagnostics(),
  };
});
console.log('WEBKIT190_ENGINEER ' + JSON.stringify(engineer));
if (engineer.workerType !== 'worker' || engineer.rocketType !== 'rocket') throw new Error(`unit identity corrupted: ${JSON.stringify(engineer)}`);
if (Math.abs(engineer.workerRadius - engineer.rocketRadius) > 0.01 || Math.abs(engineer.workerStatsRadius - engineer.rocketStatsRadius) > 0.01) {
  throw new Error(`engineer physical radius differs from rocket: ${JSON.stringify(engineer)}`);
}
if (Math.abs(engineer.workerScale - engineer.rocketScale) > 0.01) throw new Error(`engineer visualScale differs from rocket: ${JSON.stringify(engineer)}`);
if (engineer.widthRatio < 0.90 || engineer.widthRatio > 1.10 || engineer.heightRatio < 0.90 || engineer.heightRatio > 1.10) {
  throw new Error(`engineer visible envelope differs from rocket: ${JSON.stringify(engineer)}`);
}
if (engineer.workerSize.source !== 'rocket-equivalent-engineer-190') throw new Error(`engineer UI bounds use another scale: ${JSON.stringify(engineer)}`);
if (engineer.workerModel !== 'C-U01' || engineer.rocketModel !== 'C-U03' || !engineer.workerWeapon || !engineer.marker) {
  throw new Error(`engineer model/function identity invalid: ${JSON.stringify(engineer)}`);
}

const resourceBuild = await page.evaluate(() => {
  const debug = globalThis.__FD_DEBUG__;
  const game = debug.game;
  game.teams.player.credits = Math.max(999999, game.teams.player.credits || 0);
  const nodes = (game.resources || []).filter(node => node?.alive && node.kind === 'resource' && node.variant === 'alloy' && !node.extractorBuildingId);
  if (!nodes.length) throw new Error('alloy resource node missing');
  const node = nodes.find(candidate => {
    try {
      return game.isBuildPlacementValid('oreMine', candidate.x, candidate.y, 0, candidate) !== false;
    } catch (_) {
      return true;
    }
  }) || nodes[0];
  const before = {
    unitIds: game.units.filter(unit => unit?.alive).map(unit => unit.id),
    workerIds: game.units.filter(unit => unit?.alive && unit.team === 'player' && unit.typeId === 'worker').map(unit => unit.id),
    buildingIds: game.buildings.filter(building => building?.alive).map(building => building.id),
    barracksIds: game.buildings.filter(building => building?.alive && building.typeId === 'barracks').map(building => building.id),
    credits: game.teams.player.credits,
  };
  const ok = game.buildExtractorFromResource83(node);
  return { ok, nodeId: node.id, before };
});
console.log('WEBKIT190_RESOURCE_COMMAND ' + JSON.stringify(resourceBuild));
if (!resourceBuild.ok) throw new Error(`ore mine command rejected: ${JSON.stringify(resourceBuild)}`);

await page.waitForFunction(
  nodeId => {
    const game = globalThis.__FD_DEBUG__?.game;
    const node = game?.getEntity?.(nodeId);
    const building = node?.extractorBuildingId ? game.getEntity(node.extractorBuildingId) : null;
    return !!building?.alive && building.typeId === 'oreMine';
  },
  resourceBuild.nodeId,
  { timeout: 15000 },
);
await page.waitForTimeout(900);

const resourceState = await page.evaluate(async ({ nodeId, before }) => {
  const game = globalThis.__FD_DEBUG__.game;
  const node = game.getEntity(nodeId);
  const mine = node?.extractorBuildingId ? game.getEntity(node.extractorBuildingId) : null;
  if (!mine) throw new Error('ore mine missing after command');
  game.centerCamera?.(mine.x, mine.y);
  if (game.camera) game.camera.zoom = Math.max(0.85, game.camera.zoom || 0.85);
  await new Promise(resolve => setTimeout(resolve, 700));

  const lostUnits = before.unitIds.filter(id => {
    const unit = game.getEntity(id);
    return !unit?.alive || !game.units.includes(unit);
  });
  const lostWorkers = before.workerIds.filter(id => {
    const unit = game.getEntity(id);
    return !unit?.alive || unit.typeId !== 'worker' || !game.units.includes(unit);
  });
  const lostBuildings = before.buildingIds.filter(id => {
    const building = game.getEntity(id);
    return !building?.alive || !game.buildings.includes(building);
  });
  const lostBarracks = before.barracksIds.filter(id => {
    const building = game.getEntity(id);
    return !building?.alive || building.typeId !== 'barracks' || !game.buildings.includes(building);
  });

  const pilot = globalThis.__FD_MODEL_PILOT__;
  await pilot.ready;
  const sprite = pilot.canvasSprites?.['B-51'];
  if (!sprite?.image) throw new Error('B-51 sprite was not preloaded');
  try { await sprite.image.decode?.(); } catch (_) {}
  const width = sprite.image.naturalWidth || 0;
  const height = sprite.image.naturalHeight || 0;
  const analysis = { width, height, alphaWidthRatio: 0, alphaHeightRatio: 0, alphaPixels: 0 };
  if (width > 0 && height > 0) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(sprite.image, 0, 0);
    const data = ctx.getImageData(0, 0, width, height).data;
    let minX = width, minY = height, maxX = -1, maxY = -1, alphaPixels = 0;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (data[(y * width + x) * 4 + 3] <= 4) continue;
        alphaPixels += 1;
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      }
    }
    analysis.alphaPixels = alphaPixels;
    analysis.alphaWidthRatio = maxX >= minX ? (maxX - minX + 1) / width : 0;
    analysis.alphaHeightRatio = maxY >= minY ? (maxY - minY + 1) / height : 0;
  }

  const footprint = game.getEntityBuildingFootprintAt?.(mine, 0) || null;
  return {
    mineId: mine.id,
    mineType: mine.typeId,
    mineAlive: mine.alive,
    mineConstruction: Number(mine.construction || 0),
    mineModel: pilot.modelForType?.('oreMine', 'building') || mine.stats?.modelCode || null,
    spriteReady: !!sprite?.ready,
    spriteUri: sprite?.uri || null,
    sprite: analysis,
    footprint: footprint ? {
      halfLength: Number(footprint.halfLength || 0),
      halfWidth: Number(footprint.halfWidth || 0),
      height: Number(footprint.height || 0),
    } : null,
    lostUnits,
    lostWorkers,
    lostBuildings,
    lostBarracks,
    workerCount: game.units.filter(unit => unit?.alive && unit.team === 'player' && unit.typeId === 'worker').length,
    diagnostics: globalThis.__FD_RUNTIME_STABILITY_190__?.diagnostics?.() || null,
  };
}, { nodeId: resourceBuild.nodeId, before: resourceBuild.before });
console.log('WEBKIT190_RESOURCE_STATE ' + JSON.stringify(resourceState));
if (!resourceState.mineAlive || resourceState.mineType !== 'oreMine' || resourceState.mineModel !== 'B-51') throw new Error(`ore mine identity/model invalid: ${JSON.stringify(resourceState)}`);
if (resourceState.lostUnits.length || resourceState.lostWorkers.length || resourceState.lostBuildings.length || resourceState.lostBarracks.length) {
  throw new Error(`resource construction removed existing entities: ${JSON.stringify(resourceState)}`);
}
if (!resourceState.workerCount || !resourceState.spriteReady || !/build=190/.test(resourceState.spriteUri || '')) throw new Error(`ore mine/engineer render assets unavailable: ${JSON.stringify(resourceState)}`);
if (resourceState.sprite.width < 100 || resourceState.sprite.height < 100 || resourceState.sprite.alphaWidthRatio < 0.45 || resourceState.sprite.alphaHeightRatio < 0.45) {
  throw new Error(`ore mine sprite is blank or severely cropped: ${JSON.stringify(resourceState.sprite)}`);
}
if (!resourceState.footprint || resourceState.footprint.halfLength <= 0 || resourceState.footprint.halfWidth <= 0) throw new Error(`ore mine footprint missing: ${JSON.stringify(resourceState)}`);

const checkpoint = await page.evaluate(() => {
  const debug = globalThis.__FD_DEBUG__;
  const game = debug.game;
  const ok = game.save(false);
  const raw = debug.storageGet(debug.SAVE_KEY);
  const parsed = raw ? JSON.parse(raw) : null;
  const mine = game.buildings.find(building => building?.alive && building.typeId === 'oreMine');
  return {
    ok,
    key: debug.SAVE_KEY,
    rawLength: raw?.length || 0,
    valid: !!parsed && Array.isArray(parsed.entities),
    mineId: mine?.id || null,
    workerCount: game.units.filter(unit => unit?.alive && unit.team === 'player' && unit.typeId === 'worker').length,
    unitCount: game.units.filter(unit => unit?.alive).length,
    buildingCount: game.buildings.filter(building => building?.alive).length,
  };
});
console.log('WEBKIT190_CHECKPOINT ' + JSON.stringify(checkpoint));
if (!checkpoint.ok || !checkpoint.valid || checkpoint.rawLength < 5000 || !checkpoint.mineId) throw new Error(`checkpoint creation failed: ${JSON.stringify(checkpoint)}`);

await page.reload({ waitUntil: 'commit', timeout: 30000 });
await page.waitForFunction(
  () => globalThis.__FD_RUNTIME_SHELL_190__?.state?.installed === true &&
    globalThis.__FD_BOOT_190__?.state?.ready === true &&
    document.getElementById('load-game')?.disabled === false,
  null,
  { timeout: 45000 },
);
const reloadReady = await runtimeState();
console.log('WEBKIT190_RELOAD_READY ' + JSON.stringify(reloadReady));
if (reloadReady.loadButton?.disabled) throw new Error(`saved game was not detected after reload: ${JSON.stringify(reloadReady)}`);

await page.locator('#load-game').click({ timeout: 10000 });
await page.waitForFunction(
  () => !!globalThis.__FD_DEBUG__?.game &&
    Number(globalThis.__FD_STABLE_STATE165__?.bridge?.workerTick || 0) > 0 &&
    !globalThis.__FD_STABLE_STATE165__?.bridge?.failed,
  null,
  { timeout: 35000 },
);
await page.waitForTimeout(900);

const loaded = await page.evaluate(({ mineId, workerCount, unitCount, buildingCount }) => {
  const debug = globalThis.__FD_DEBUG__;
  const game = debug.game;
  const raw = debug.storageGet(debug.SAVE_KEY);
  let parsed = null;
  try { parsed = raw ? JSON.parse(raw) : null; } catch (_) {}
  const mine = game.getEntity(mineId) || game.buildings.find(building => building?.alive && building.typeId === 'oreMine');
  const workers = game.units.filter(unit => unit?.alive && unit.team === 'player' && unit.typeId === 'worker');
  return {
    saveStillPresent: !!parsed,
    rawLength: raw?.length || 0,
    mineId: mine?.id || null,
    mineAlive: !!mine?.alive,
    mineType: mine?.typeId || null,
    workerCount: workers.length,
    unitCount: game.units.filter(unit => unit?.alive).length,
    buildingCount: game.buildings.filter(building => building?.alive).length,
    shell: globalThis.__FD_RUNTIME_SHELL_190__?.state || null,
    bridgeTick: Number(globalThis.__FD_STABLE_STATE165__?.bridge?.workerTick || 0),
    failed: !!globalThis.__FD_STABLE_STATE165__?.bridge?.failed,
    expected: { workerCount, unitCount, buildingCount },
  };
}, checkpoint);
console.log('WEBKIT190_LOADED ' + JSON.stringify(loaded));
if (!loaded.saveStillPresent || loaded.rawLength < 5000) throw new Error(`load deleted the save: ${JSON.stringify(loaded)}`);
if (!loaded.mineAlive || loaded.mineType !== 'oreMine') throw new Error(`ore mine was not restored: ${JSON.stringify(loaded)}`);
if (loaded.workerCount < checkpoint.workerCount || loaded.unitCount < checkpoint.unitCount || loaded.buildingCount < checkpoint.buildingCount) {
  throw new Error(`loaded state lost entities: ${JSON.stringify(loaded)}`);
}
if (loaded.failed || loaded.bridgeTick <= 0 || loaded.shell?.lastError) throw new Error(`saved game did not become stable: ${JSON.stringify(loaded)}`);

if (pageErrors.length) throw new Error(`WebKit page errors: ${pageErrors.join(' | ')}`);
const materialConsoleErrors = consoleErrors.filter(text => !/favicon|Failed to load resource/i.test(text));
if (materialConsoleErrors.length) throw new Error(`WebKit console errors: ${materialConsoleErrors.join(' | ')}`);

console.log(JSON.stringify({
  ok: true,
  build: 190,
  engineer,
  resource: resourceState,
  checkpoint,
  loaded,
}));
await browser.close();
