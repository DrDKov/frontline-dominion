import { chromium, webkit } from 'playwright';

const browserName = process.env.FD_BROWSER || 'chromium';
const launcher = browserName === 'webkit' ? webkit : chromium;
const url = process.env.FD_GAME_URL || 'http://127.0.0.1:8765/frontline-dominion/frontline-dominion.html?build=199';
const browser = await launcher.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
let page = await context.newPage();
const errors = [];
const bindErrors = target => {
  target.on('pageerror', error => errors.push(String(error?.stack || error)));
  target.on('console', message => {
    if (message.type() === 'error' && !/favicon|404/i.test(message.text())) errors.push(`console:${message.text()}`);
  });
};
bindErrors(page);

const waitFor = async (fn, timeout = 30000, interval = 100) => {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const value = await fn();
    if (value) return value;
    await page.waitForTimeout(interval);
  }
  throw new Error(`Timed out after ${timeout} ms`);
};

const waitShell = async () => waitFor(() => page.evaluate(() => Boolean(
  globalThis.__FD_RUNTIME_SHELL_199__?.build === 199 &&
  globalThis.__FD_GAMEPLAY_RELIABILITY_199__?.build === 199 &&
  globalThis.__FD_BUILDING_RENDER_AUTHORITY_199__?.build === 199 &&
  globalThis.__FD_INTERACTION_RESET_199__?.build === 199 &&
  globalThis.__FD_DEBUG__?.startGame &&
  !document.getElementById('start-game')?.disabled
)), 40000);

const waitGame = async () => waitFor(() => page.evaluate(() => {
  const game = globalThis.__FD_DEBUG__?.game;
  const bridge = globalThis.__FD_STABLE_STATE165__?.bridge;
  return Boolean(game && bridge?.ready && !bridge.failed && Number(bridge.workerTick || 0) >= 10);
}), 40000);

await page.goto(url, { waitUntil: 'load', timeout: 60000 });
await waitShell();
await page.locator('#start-game').click();
await waitGame();

const inGame = await page.evaluate(() => {
  const D = globalThis.__FD_DEBUG__;
  const game = D?.game;
  const Unit = D?.Unit;
  if (!game || !Unit) return { error: 'game-fixture-missing' };

  const buildings = (game.buildings || []).filter(item => item?.alive && item.team === 'player');
  const units = (game.units || []).filter(item => item?.alive && item.team === 'player' && !item.embarkedIn);
  if (buildings.length < 2 || units.length < 1) return { error: 'selection-fixture-missing', buildings: buildings.length, units: units.length };

  const bracketBefore = Number(globalThis.__FD_BUILDING_SELECTION_INVARIANCE_197__?.state?.bracketOverlays || 0);
  const renderState = globalThis.__FD_BUILDING_RENDER_AUTHORITY_199__?.state;
  game.setSelection?.([buildings[0]], false);
  game.render?.();
  for (let index = 0; index < 8; index += 1) {
    game.setSelection?.([units[index % units.length]], false);
    game.render?.();
    game.setSelection?.([buildings[1]], false);
    game.render?.();
    game.clearSelection?.();
    game.render?.();
    game.setSelection?.([buildings[0]], false);
    game.render?.();
  }
  const bracketAfter = Number(globalThis.__FD_BUILDING_SELECTION_INVARIANCE_197__?.state?.bracketOverlays || 0);

  // A simple primary selection click on empty terrain must clear both selection
  // and stale transient actions. Use a distant explored/open point and force the
  // fixture hit-test to be empty only for that exact point.
  const emptyX = Math.max(180, Math.min((D.WORLD?.width || 32000) - 180, buildings[0].x + 620));
  const emptyY = Math.max(180, Math.min((D.WORLD?.height || 22000) - 180, buildings[0].y + 620));
  const originalHit = game.hitTest;
  const originalUnitHits = game.getUnitFigureHits140;
  const originalBuildingHits = game.getBuildingFigureHits193;
  game.hitTest = function(x, y, ...rest) {
    if (Math.hypot(x - emptyX, y - emptyY) < 4) return null;
    return originalHit?.call(this, x, y, ...rest) || null;
  };
  if (typeof originalUnitHits === 'function') game.getUnitFigureHits140 = function(x, y, ...rest) {
    if (Math.hypot(x - emptyX, y - emptyY) < 4) return [];
    return originalUnitHits.call(this, x, y, ...rest);
  };
  if (typeof originalBuildingHits === 'function') game.getBuildingFigureHits193 = function(x, y, ...rest) {
    if (Math.hypot(x - emptyX, y - emptyY) < 4) return [];
    return originalBuildingHits.call(this, x, y, ...rest);
  };
  game.setSelection?.([units[0]], false);
  game.buildMode = null;
  game.commandMode = null;
  game.selectAt?.(emptyX, emptyY, false);
  game.hitTest = originalHit;
  if (typeof originalUnitHits === 'function') game.getUnitFigureHits140 = originalUnitHits;
  if (typeof originalBuildingHits === 'function') game.getBuildingFigureHits193 = originalBuildingHits;
  const emptyClick = {
    selected: (game.selected || []).map(item => item.id),
    buildMode: game.buildMode || null,
    commandMode: game.commandMode || null,
    diagnostics: { ...globalThis.__FD_INTERACTION_RESET_199__?.state },
  };

  // Exercise every transport type against a compatible passenger through the
  // same core methods used in the authoritative Worker. Temporarily use the
  // legacy direct path so the fixture can create synthetic entities without
  // bypassing production action routing.
  const previousLegacy = game._fdForceLegacySimulation172;
  game._fdForceLegacySimulation172 = true;
  const transportResults = [];
  const transportTypes = Object.entries(D.UNIT_TYPES || {}).filter(([, stats]) => Number(stats?.transportCapacity) > 0);
  let fixtureIndex = 0;
  for (const [typeId, stats] of transportTypes) {
    const baseX = 800 + (fixtureIndex % 6) * 420;
    const baseY = 800 + Math.floor(fixtureIndex / 6) * 420;
    const passengerType = stats.transportRule === 'infantry'
      ? ((D.UNIT_TYPES?.worker && 'worker') || Object.keys(D.UNIT_TYPES).find(id => D.UNIT_TYPES[id]?.infantry))
      : (Object.keys(D.UNIT_TYPES).find(id => D.UNIT_TYPES[id]?.vehicle && !D.UNIT_TYPES[id]?.air && !D.UNIT_TYPES[id]?.transportCapacity) || 'worker');
    const transport = new Unit(game, { typeId, team: 'player', x: baseX, y: baseY, rotation: 0 });
    const passenger = new Unit(game, { typeId: passengerType, team: 'player', x: baseX + 12, y: baseY + 10, rotation: 0 });
    game.addEntity(transport);
    game.addEntity(passenger);
    const loaded = game.loadIntoTransport78?.(transport, [passenger]) || 0;
    const embarked = passenger.embarkedIn === transport.id && transport.transportCargoIds?.includes(passenger.id);
    const unloaded = game.unloadTransport78?.(transport) || 0;
    const restored = !passenger.embarkedIn && passenger.inTransport !== true;
    transportResults.push({ typeId, passengerType, loaded, embarked, unloaded, restored });
    transport.alive = false;
    passenger.alive = false;
    fixtureIndex += 1;
  }
  game.cleanupDeadObjects?.();

  // Exercise each variant in every unique modification group. Requirements and
  // economy are bypassed only for this isolated mechanical gate; the production
  // method still performs the actual type/stat/geometry conversion.
  const originalRequirements = game.requirementsMet;
  game.requirementsMet = () => true;
  const originalCredits = game.teams.player.credits;
  game.teams.player.credits = 1_000_000_000;
  const groups = new Map();
  for (const [typeId, stats] of Object.entries(D.UNIT_TYPES || {})) {
    if (!stats?.faction || !Number.isInteger(stats.archetypeIndex)) continue;
    const probe = { typeId, stats, alive: true };
    const group = game.getUnitModificationGroup?.(probe);
    if (!group) continue;
    groups.set(`${stats.faction}:${stats.archetypeIndex}`, group);
  }
  const refitResults = [];
  let refitIndex = 0;
  for (const [groupKey, group] of groups) {
    const entries = Object.entries(group).filter(([, targetId]) => D.UNIT_TYPES?.[targetId]);
    const sourceId = group.standard || entries[0]?.[1];
    if (!sourceId) continue;
    for (const [variant, targetId] of entries) {
      if (targetId === sourceId) continue;
      const unit = new Unit(game, { typeId: sourceId, team: 'player', x: 5000 + refitIndex * 5, y: 5000, rotation: 0 });
      game.addEntity(unit);
      const ok = game.applyUnitModification?.(unit, variant, false) === true;
      const changed = unit.typeId === targetId && unit.stats?.variant === D.UNIT_TYPES[targetId]?.variant;
      refitResults.push({ groupKey, variant, sourceId, targetId, ok, changed, radius: unit.radius, expectedRadius: unit.stats?.radius });
      unit.alive = false;
      refitIndex += 1;
    }
  }
  game.cleanupDeadObjects?.();
  game.requirementsMet = originalRequirements;
  game.teams.player.credits = originalCredits;
  game._fdForceLegacySimulation172 = previousLegacy;

  return {
    bracketBefore,
    bracketAfter,
    buildingRender: { ...renderState },
    emptyClick,
    transportResults,
    refitResults,
    gameplayDiagnostics: { ...globalThis.__FD_GAMEPLAY_RELIABILITY_199__?.state },
  };
});

if (inGame.error) throw new Error(JSON.stringify(inGame));
if (inGame.bracketAfter !== inGame.bracketBefore) throw new Error(`square building brackets still draw: ${JSON.stringify(inGame)}`);
if (inGame.buildingRender?.noncanonicalBuildingSpritesAllowed !== 0) throw new Error(`noncanonical building sprite escaped: ${JSON.stringify(inGame)}`);
if (inGame.emptyClick.selected.length || inGame.emptyClick.buildMode || inGame.emptyClick.commandMode || inGame.emptyClick.diagnostics.emptyClicks < 1) {
  throw new Error(`empty primary click did not reset selection/actions: ${JSON.stringify(inGame.emptyClick)}`);
}
if (!inGame.transportResults.length || inGame.transportResults.some(item => item.loaded < 1 || !item.embarked || item.unloaded < 1 || !item.restored)) {
  throw new Error(`transport matrix failed: ${JSON.stringify(inGame.transportResults)}`);
}
if (!inGame.refitResults.length || inGame.refitResults.some(item => !item.ok || !item.changed || item.radius !== item.expectedRadius)) {
  throw new Error(`refit matrix failed: ${JSON.stringify(inGame.refitResults)}`);
}

const saved = await page.evaluate(() => {
  const shell = globalThis.__FD_RUNTIME_SHELL_199__;
  const D = globalThis.__FD_DEBUG__;
  const ok = shell?.saveNow?.('reliability199') === true;
  const raw = D?.storageGet?.(D.SAVE_KEY) || localStorage.getItem(D?.SAVE_KEY || 'frontline-dominion-save-v5');
  const data = raw ? JSON.parse(raw) : null;
  const entities = data?.entities || [...(data?.units || []), ...(data?.buildings || [])];
  const marker = entities?.find(item => item?.kind === 'building' && item.team === 'player') || entities?.[0];
  return {
    ok,
    key: D?.SAVE_KEY || 'frontline-dominion-save-v5',
    seed: data?.seed,
    entityCount: entities?.length || 0,
    marker: marker ? { id: marker.id, typeId: marker.typeId, x: marker.x, y: marker.y, hp: marker.hp } : null,
  };
});
if (!saved.ok || !saved.seed || !saved.entityCount || !saved.marker) throw new Error(`save fixture failed: ${JSON.stringify(saved)}`);

await page.reload({ waitUntil: 'load', timeout: 60000 });
await waitShell();
await waitFor(() => page.evaluate(() => !document.getElementById('load-game')?.disabled), 15000);
await page.locator('#load-game').click();
await waitGame();

const loaded = await page.evaluate(expected => {
  const game = globalThis.__FD_DEBUG__?.game;
  const shell = globalThis.__FD_RUNTIME_SHELL_199__;
  const entity = game?.getEntity?.(expected.marker.id);
  return {
    seed: game?.seed,
    entityCount: [...(game?.units || []), ...(game?.buildings || []), ...(game?.resources || [])].filter(item => item?.alive !== false).length,
    marker: entity ? { id: entity.id, typeId: entity.typeId, x: entity.x, y: entity.y, hp: entity.hp } : null,
    saveSourceKey: shell?.state?.saveSourceKey || null,
    lastError: shell?.state?.lastError || null,
    launchCount: shell?.state?.launchCount || 0,
  };
}, saved);
if (loaded.lastError || loaded.seed !== saved.seed || !loaded.marker || loaded.marker.typeId !== saved.marker.typeId ||
    Math.hypot(Number(loaded.marker.x) - Number(saved.marker.x), Number(loaded.marker.y) - Number(saved.marker.y)) > 3) {
  throw new Error(`saved game did not load faithfully: ${JSON.stringify({ saved, loaded })}`);
}
if (errors.length) throw new Error(`browser errors: ${JSON.stringify(errors)}`);

console.log(JSON.stringify({ ok: true, browserName, inGame, saved, loaded, errors }));
await context.close();
await browser.close();
