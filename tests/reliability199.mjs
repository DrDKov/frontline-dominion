import { chromium, webkit } from 'playwright';

const browserName = process.env.FD_BROWSER || 'chromium';
const launcher = browserName === 'webkit' ? webkit : chromium;
const url = process.env.FD_GAME_URL || 'http://127.0.0.1:8765/frontline-dominion/frontline-dominion.html?build=199';
const browser = await launcher.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(String(error?.stack || error)));
page.on('console', message => {
  if (message.type() === 'error' && !/favicon|404|audio|autoplay/i.test(message.text())) errors.push(`console:${message.text()}`);
});

await page.addInitScript(() => {
  const root = globalThis;
  const trace = root.__FD199_DRAW_TRACE__ = { active: false, phase: '', calls: [] };
  const proto = root.CanvasRenderingContext2D?.prototype;
  if (!proto || proto.__fd199TraceInstalled) return;
  Object.defineProperty(proto, '__fd199TraceInstalled', { value: true, configurable: true });
  const original = proto.drawImage;
  proto.drawImage = function tracedDraw199(image, ...args) {
    if (trace.active && this.canvas?.id === 'game-canvas') {
      const destination = args.length >= 8
        ? { x: Number(args[4]), y: Number(args[5]), width: Number(args[6]), height: Number(args[7]) }
        : { x: Number(args[0]), y: Number(args[1]), width: Number(args[2]), height: Number(args[3]) };
      const transform = this.getTransform?.();
      const cx = destination.x + destination.width * 0.5;
      const cy = destination.y + destination.height * 0.5;
      const screen = transform
        ? { x: transform.a * cx + transform.c * cy + transform.e, y: transform.b * cx + transform.d * cy + transform.f }
        : { x: cx, y: cy };
      trace.calls.push({
        phase: trace.phase,
        source: String(image?.currentSrc || image?.src || ''),
        destination,
        screen,
      });
    }
    return original.call(this, image, ...args);
  };
});

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
}), 45000);

await page.goto(url, { waitUntil: 'load', timeout: 60000 });
await waitShell();
await page.locator('#start-game').click();
await waitGame();

const buildingGate = await page.evaluate(() => {
  const D = globalThis.__FD_DEBUG__;
  const game = D?.game;
  const pilot = globalThis.__FD_MODEL_PILOT__;
  const invariance = globalThis.__FD_BUILDING_SELECTION_INVARIANCE_197__;
  const renderAuthority = globalThis.__FD_BUILDING_RENDER_AUTHORITY_199__;
  const trace = globalThis.__FD199_DRAW_TRACE__;
  const canvas = document.getElementById('game-canvas');
  const buildings = (game?.buildings || []).filter(item => item?.alive && item.team === 'player');
  const units = (game?.units || []).filter(item => item?.alive && item.team === 'player' && !item.embarkedIn);
  if (!game || !pilot || !invariance || !renderAuthority || !trace || !canvas || buildings.length < 2 || !units.length) {
    return { error: 'building-fixture-missing', buildings: buildings.length, units: units.length };
  }

  const target = buildings[0];
  const alternate = buildings[1];
  game.centerCamera?.(target.x, target.y);
  if (game.camera) game.camera.zoom = 0.82;
  game.clearSelection?.();
  game.render?.();

  const code = pilot.modelForType?.(target.typeId, 'building') || target.stats?.modelCode;
  const sprite = pilot.canvasSprites?.[code];
  const pathOf = value => {
    try { return new URL(String(value || ''), document.baseURI).pathname.toLowerCase(); }
    catch (_) { return String(value || '').split(/[?#]/, 1)[0].toLowerCase(); }
  };
  const sourcePath = pathOf(sprite?.image?.currentSrc || sprite?.image?.src || sprite?.uri);
  const beforeBounds = game.getBuildingFigureScreenBounds193?.(target);
  const beforeGeometry = invariance.geometrySignature?.(target) || {};
  const beforeScalar = {
    radius: Number(target.radius),
    visualScale: Number(target.visualScale ?? 1),
    scale: Number(target.scale ?? 1),
  };
  if (!sourcePath || !beforeBounds || !sprite?.image) return { error: 'building-sprite-fixture-missing', code, sourcePath };

  const bracketBefore = Number(invariance.state?.bracketOverlays || 0);
  const suppressedBefore = Number(renderAuthority.state?.suppressedNoncanonicalSprites || 0);
  const phases = [];
  const renderPhase = (name, selection) => {
    if (selection == null) game.clearSelection?.();
    else game.setSelection?.(selection, false);
    trace.phase = name;
    trace.active = true;
    game.render?.();
    trace.active = false;
    phases.push(name);
  };

  trace.calls = [];
  for (let index = 0; index < 10; index += 1) {
    renderPhase(`building-${index}`, [target]);
    renderPhase(`unit-${index}`, [units[index % units.length]]);
    renderPhase(`other-building-${index}`, [alternate]);
    renderPhase(`empty-${index}`, null);
  }
  renderPhase('final-building', [target]);

  // Directly attempt the historical illegal path outside Game.render. The
  // canonical owner must reject it, including delayed one-frame snapshots.
  trace.phase = 'illegal-direct-building-atlas';
  trace.active = true;
  canvas.getContext('2d').drawImage(sprite.image, 0, 0, 96, 96);
  trace.active = false;

  const afterBounds = game.getBuildingFigureScreenBounds193?.(target);
  const afterGeometry = invariance.geometrySignature?.(target) || {};
  const afterScalar = {
    radius: Number(target.radius),
    visualScale: Number(target.visualScale ?? 1),
    scale: Number(target.scale ?? 1),
  };
  const centre = { x: (beforeBounds.x1 + beforeBounds.x2) * 0.5, y: (beforeBounds.y1 + beforeBounds.y2) * 0.5 };
  const phaseCounts = Object.fromEntries(phases.map(phase => [phase, 0]));
  let illegalDraws = 0;
  for (const call of trace.calls) {
    if (pathOf(call.source) !== sourcePath) continue;
    if (call.phase === 'illegal-direct-building-atlas') {
      illegalDraws += 1;
      continue;
    }
    if (!(call.phase in phaseCounts)) continue;
    const tolerance = Math.max(beforeBounds.width, beforeBounds.height) * 0.55;
    if (Math.hypot(call.screen.x - centre.x, call.screen.y - centre.y) <= tolerance) phaseCounts[call.phase] += 1;
  }

  return {
    targetId: target.id,
    sourcePath,
    bracketBefore,
    bracketAfter: Number(invariance.state?.bracketOverlays || 0),
    suppressedBefore,
    suppressedAfter: Number(renderAuthority.state?.suppressedNoncanonicalSprites || 0),
    illegalDraws,
    phaseCounts,
    beforeBounds: { width: beforeBounds.width, height: beforeBounds.height, x1: beforeBounds.x1, y1: beforeBounds.y1 },
    afterBounds: afterBounds ? { width: afterBounds.width, height: afterBounds.height, x1: afterBounds.x1, y1: afterBounds.y1 } : null,
    beforeGeometry,
    afterGeometry,
    geometryDelta: invariance.geometryDelta?.(beforeGeometry, afterGeometry),
    beforeScalar,
    afterScalar,
    renderDiagnostics: renderAuthority.diagnostics?.() || { ...renderAuthority.state },
  };
});

if (buildingGate.error) throw new Error(`building gate fixture: ${JSON.stringify(buildingGate)}`);
if (buildingGate.bracketAfter !== buildingGate.bracketBefore) throw new Error(`building square frame was drawn: ${JSON.stringify(buildingGate)}`);
if (buildingGate.illegalDraws !== 0 || buildingGate.suppressedAfter <= buildingGate.suppressedBefore) {
  throw new Error(`delayed/noncanonical building atlas escaped: ${JSON.stringify(buildingGate)}`);
}
if (!Number.isFinite(buildingGate.geometryDelta) || buildingGate.geometryDelta > 1e-9 ||
    JSON.stringify(buildingGate.beforeScalar) !== JSON.stringify(buildingGate.afterScalar) ||
    !buildingGate.afterBounds || Math.max(
      Math.abs(buildingGate.beforeBounds.width - buildingGate.afterBounds.width),
      Math.abs(buildingGate.beforeBounds.height - buildingGate.afterBounds.height),
    ) > 0.01) {
  throw new Error(`building geometry/size changed while switching selection: ${JSON.stringify(buildingGate)}`);
}
const missingBuildingPaint = Object.entries(buildingGate.phaseCounts)
  .filter(([phase]) => phase.startsWith('building-') || phase === 'final-building')
  .some(([, count]) => count !== 1);
if (missingBuildingPaint) throw new Error(`canonical selected building was not painted exactly once: ${JSON.stringify(buildingGate.phaseCounts)}`);

const emptyFixture = await page.evaluate(() => {
  const D = globalThis.__FD_DEBUG__;
  const game = D?.game;
  const canvas = document.getElementById('game-canvas');
  const rect = canvas?.getBoundingClientRect?.();
  const unit = (game?.units || []).find(item => item?.alive && item.team === 'player' && !item.embarkedIn);
  if (!game || !canvas || !rect?.width || !rect?.height || !unit) return { error: 'empty-click-fixture-missing' };
  game.cancelModes?.();
  game.setSelection?.([unit], false);
  const before = Number(globalThis.__FD_INTERACTION_RESET_199__?.state?.emptyClicks || 0);
  for (let sy = 90; sy < canvas.height - 90; sy += 48) {
    for (let sx = 90; sx < canvas.width - 90; sx += 48) {
      const world = game.screenToWorld?.(sx, sy, 0) || game.screenToWorld?.(sx, sy);
      if (!world || !Number.isFinite(world.x) || !Number.isFinite(world.y)) continue;
      if (world.x < 100 || world.y < 100 || world.x > (D.WORLD?.width || 32000) - 100 || world.y > (D.WORLD?.height || 22000) - 100) continue;
      if (game.getUnitFigureHits140?.(world.x, world.y)?.length) continue;
      if (game.getBuildingFigureHits193?.(world.x, world.y)?.length) continue;
      if (game.hitTest?.(world.x, world.y, true)) continue;
      return {
        before,
        world,
        cssX: rect.left + sx * rect.width / canvas.width,
        cssY: rect.top + sy * rect.height / canvas.height,
      };
    }
  }
  return { error: 'open-empty-point-missing' };
});
if (emptyFixture.error) throw new Error(JSON.stringify(emptyFixture));
await page.mouse.click(emptyFixture.cssX, emptyFixture.cssY, { button: 'left' });
const emptyClick = await waitFor(() => page.evaluate(before => {
  const game = globalThis.__FD_DEBUG__?.game;
  const state = globalThis.__FD_INTERACTION_RESET_199__?.state;
  if (!game || !state || Number(state.emptyClicks || 0) <= before || game.selected?.length) return null;
  return {
    selected: (game.selected || []).map(item => item.id),
    buildMode: game.buildMode || null,
    commandMode: game.commandMode || null,
    diagnostics: { ...state },
  };
}, emptyFixture.before), 8000);
if (emptyClick.selected.length || emptyClick.buildMode || emptyClick.commandMode) throw new Error(`simple empty click did not reset selection/actions: ${JSON.stringify(emptyClick)}`);

const matrixGate = await page.evaluate(() => {
  const D = globalThis.__FD_DEBUG__;
  const registry = D?.UNIT_TYPES || {};
  const Game = D?.Game;
  const Unit = D?.Unit;
  if (!Game || !Unit || !Object.keys(registry).length) return { error: 'matrix-registry-missing' };

  const makeFakeGame = () => {
    const entities = new Map();
    const fake = {
      _fdForceLegacySimulation172: true,
      entities,
      units: [],
      selected: [],
      time: 0,
      uiDirty: false,
      renderSnapshotDirty: false,
      teams: {
        player: { faction: 'vanguard', credits: 1_000_000_000_000, rank: 9, upgrades: new Set() },
        enemy: { faction: 'vanguard', credits: 0, rank: 1, upgrades: new Set() },
        neutral: { faction: 'vanguard', credits: 0, rank: 1, upgrades: new Set() },
      },
      getEntity(id) { return entities.get(id) || null; },
      getSelectedUnits() { return this.selected.filter(item => item?.kind === 'unit'); },
      addEffect() {},
      alert() {},
      rebuildSpatialIndexes() {},
      recalculatePower() {},
      requirementsMet() { return true; },
      findReachablePoint(x, y) { return { x, y }; },
      spatial: { remove() {}, update() {} },
      uiCache: {},
    };
    fake.getUnitModificationGroup = Game.prototype.getUnitModificationGroup;
    fake.getUnitModificationCost = Game.prototype.getUnitModificationCost;
    return fake;
  };

  let idCounter = 1;
  const makeUnit = (fake, typeId, x, y) => {
    const stats = registry[typeId];
    const unit = {
      id: `matrix-${idCounter++}`,
      kind: 'unit',
      alive: true,
      team: 'player',
      typeId,
      stats,
      game: fake,
      x,
      y,
      renderX: x,
      renderY: y,
      radius: Number(stats?.radius) || 14,
      rotation: 0,
      renderRotation: 0,
      infantry: Boolean(stats?.infantry) || typeId === 'worker',
      vehicle: Boolean(stats?.vehicle),
      air: Boolean(stats?.air),
      vision: Number(stats?.vision) || 0,
      detector: Number(stats?.detector) || 0,
      armor: stats?.armor,
      speed: Number(stats?.speed) || 100,
      commandQueue: [],
      selected: false,
      rank: 1,
      maxHp: Number(stats?.hp) || 100,
      hp: Number(stats?.hp) || 100,
      revealTimer: 0,
      airAmmoMax: 0,
      airAmmo: 0,
      setCommand(command, append = false) {
        if (!append) this.commandQueue.length = 0;
        this.commandQueue.push(command);
      },
      finishCommand() { this.commandQueue.shift(); },
      invalidateNavigation() {},
      moveToward(targetX, targetY, dt, multiplier = 1) {
        const dx = targetX - this.x;
        const dy = targetY - this.y;
        const distance = Math.hypot(dx, dy);
        const step = Math.max(1, (Number(this.speed) || 100) * dt * multiplier);
        if (distance <= step) {
          this.x = targetX;
          this.y = targetY;
          return true;
        }
        this.x += dx / distance * step;
        this.y += dy / distance * step;
        return false;
      },
    };
    Object.defineProperty(unit, 'currentCommand', { configurable: true, get() { return this.commandQueue[0] || null; } });
    Object.defineProperty(unit, 'healthRatio', { configurable: true, get() { return this.maxHp > 0 ? this.hp / this.maxHp : 1; } });
    fake.entities.set(unit.id, unit);
    fake.units.push(unit);
    return unit;
  };

  const transportTypes = Object.entries(registry).filter(([, stats]) => Number(stats?.transportCapacity) > 0);
  const infantryType = registry.worker ? 'worker' : Object.keys(registry).find(id => registry[id]?.infantry && !registry[id]?.air);
  const vehicleType = Object.keys(registry).find(id => registry[id]?.vehicle && !registry[id]?.air && !registry[id]?.transportCapacity);
  const transportResults = [];

  for (const [typeId, stats] of transportTypes) {
    const fake = makeFakeGame();
    const transport = makeUnit(fake, typeId, 1000, 1000);
    transport.transportCargoIds = [];
    const passengerTypes = stats.transportRule === 'infantry'
      ? [infantryType]
      : [...new Set([infantryType, vehicleType].filter(Boolean))];
    const immediatePassengers = passengerTypes.map((passengerType, index) => makeUnit(fake, passengerType, 1012 + index * 5, 1010));
    const loaded = Game.prototype.loadIntoTransport78.call(fake, transport, immediatePassengers);
    const immediateEmbarked = immediatePassengers.every(unit => unit.embarkedIn === transport.id && transport.transportCargoIds.includes(unit.id));
    const unloaded = Game.prototype.unloadTransport78.call(fake, transport);
    const immediateRestored = immediatePassengers.every(unit => !unit.embarkedIn && unit.inTransport !== true);

    const distant = makeUnit(fake, infantryType, 1540, 1000);
    fake.selected = [distant];
    const issued = Game.prototype.issueLoadTransport95.call(fake, transport, [distant], false) !== false;
    let ticks = 0;
    while (!distant.embarkedIn && distant.currentCommand && ticks < 300) {
      Unit.prototype.processCommand.call(distant, distant.currentCommand, 0.1);
      fake.time += 0.1;
      ticks += 1;
    }
    const approached = distant.embarkedIn === transport.id;
    const unloadApproached = Game.prototype.unloadTransport78.call(fake, transport);

    const contextPassenger = makeUnit(fake, infantryType, 1520, 1040);
    fake.selected = [contextPassenger];
    fake.hitTestForContext = () => transport;
    fake.hitTest = () => transport;
    fake.issueLoadTransport95 = (...args) => Game.prototype.issueLoadTransport95.call(fake, ...args);
    const contextIssued = Game.prototype.issueContext.call(fake, transport.x, transport.y, false) !== false;
    let contextTicks = 0;
    while (!contextPassenger.embarkedIn && contextPassenger.currentCommand && contextTicks < 300) {
      Unit.prototype.processCommand.call(contextPassenger, contextPassenger.currentCommand, 0.1);
      fake.time += 0.1;
      contextTicks += 1;
    }
    const contextLoaded = contextPassenger.embarkedIn === transport.id;
    const contextUnloaded = Game.prototype.unloadTransport78.call(fake, transport);

    transportResults.push({
      typeId,
      rule: stats.transportRule || 'ground',
      capacity: stats.transportCapacity,
      passengerTypes,
      loaded,
      immediateEmbarked,
      unloaded,
      immediateRestored,
      issued,
      approached,
      ticks,
      unloadApproached,
      contextIssued,
      contextLoaded,
      contextTicks,
      contextUnloaded,
    });
  }

  const refitFake = makeFakeGame();
  const groups = new Map();
  for (const [typeId, rawStats] of Object.entries(registry)) {
    let stats = rawStats;
    try { stats = D.getUnitStats?.(typeId, refitFake.teams.player) || stats; } catch (_) {}
    if (!stats?.faction || !Number.isInteger(stats.archetypeIndex)) continue;
    const group = Game.prototype.getUnitModificationGroup.call(refitFake, { typeId, stats, alive: true });
    if (group) groups.set(`${stats.faction}:${stats.archetypeIndex}`, group);
  }

  const refitResults = [];
  for (const [groupKey, group] of groups) {
    const entries = Object.entries(group).filter(([, targetId]) => registry[targetId]);
    for (const [sourceVariant, sourceId] of entries) {
      for (const [targetVariant, targetId] of entries) {
        if (sourceId === targetId) continue;
        let sourceStats = registry[sourceId];
        let targetStats = registry[targetId];
        try {
          sourceStats = D.getUnitStats?.(sourceId, refitFake.teams.player) || sourceStats;
          targetStats = D.getUnitStats?.(targetId, refitFake.teams.player) || targetStats;
        } catch (_) {}
        const unit = makeUnit(refitFake, sourceId, 5000, 5000);
        unit.stats = sourceStats;
        unit.radius = Number(sourceStats.radius) || unit.radius;
        unit.maxHp = Number(sourceStats.hp) || unit.maxHp;
        unit.hp = unit.maxHp * 0.73;
        const ok = Game.prototype.applyUnitModification.call(refitFake, unit, targetVariant, true) === true;
        refitResults.push({
          groupKey,
          sourceVariant,
          sourceId,
          targetVariant,
          targetId,
          ok,
          actualTypeId: unit.typeId,
          actualRadius: unit.radius,
          expectedRadius: Number(targetStats.radius),
          actualVariant: unit.stats?.variant,
          expectedVariant: targetStats.variant,
        });
      }
    }
  }

  return {
    transportTypes: transportTypes.map(([typeId]) => typeId),
    transportResults,
    groupCount: groups.size,
    refitResults,
  };
});

if (matrixGate.error) throw new Error(JSON.stringify(matrixGate));
if (!matrixGate.transportTypes.length || matrixGate.transportResults.some(item =>
  item.loaded !== item.passengerTypes.length || !item.immediateEmbarked || item.unloaded !== item.passengerTypes.length || !item.immediateRestored ||
  !item.issued || !item.approached || item.unloadApproached < 1 || !item.contextIssued || !item.contextLoaded || item.contextUnloaded < 1
)) throw new Error(`transport matrix failed: ${JSON.stringify(matrixGate.transportResults)}`);
if (!matrixGate.groupCount || !matrixGate.refitResults.length || matrixGate.refitResults.some(item =>
  !item.ok || item.actualTypeId !== item.targetId || item.actualRadius !== item.expectedRadius || item.actualVariant !== item.expectedVariant
)) throw new Error(`refit matrix failed: ${JSON.stringify(matrixGate.refitResults)}`);

const liveRefit = await page.evaluate(() => {
  const game = globalThis.__FD_DEBUG__?.game;
  const bridge = globalThis.__FD_STABLE_STATE165__?.bridge;
  if (!game || !bridge) return { error: 'live-refit-game-missing' };
  for (const unit of game.units || []) {
    if (!unit?.alive || unit.team !== 'player' || unit.embarkedIn) continue;
    const group = game.getUnitModificationGroup?.(unit);
    if (!group) continue;
    for (const [variant, targetId] of Object.entries(group)) {
      if (!targetId || targetId === unit.typeId) continue;
      const targetStats = globalThis.__FD_DEBUG__?.getUnitStats?.(targetId, game.teams.player) || globalThis.__FD_DEBUG__?.UNIT_TYPES?.[targetId];
      if (!targetStats || !game.requirementsMet?.('player', targetStats.requires || [], targetStats.rank || 1)) continue;
      const cost = game.getUnitModificationCost?.(unit, variant) || 0;
      if (game.teams.player.credits < cost) continue;
      game.setSelection?.([unit], false);
      const beforeSeq = Number(bridge.seq || 0);
      const beforeErrors = Number(bridge.actionErrors || 0);
      const issued = game.applyUnitModification?.(unit, variant, false) !== false;
      return { id: unit.id, beforeType: unit.typeId, targetId, variant, issued, beforeSeq, beforeErrors, expectedRadius: Number(targetStats.radius) };
    }
  }
  return { error: 'live-refit-candidate-missing' };
});
if (liveRefit.error || !liveRefit.issued) throw new Error(`live refit fixture failed: ${JSON.stringify(liveRefit)}`);
const liveRefitResult = await waitFor(() => page.evaluate(expected => {
  const game = globalThis.__FD_DEBUG__?.game;
  const bridge = globalThis.__FD_STABLE_STATE165__?.bridge;
  const unit = game?.getEntity?.(expected.id);
  if (!game || !bridge || !unit || Number(bridge.lastAck || 0) <= expected.beforeSeq || unit.typeId !== expected.targetId) return null;
  return {
    typeId: unit.typeId,
    radius: Number(unit.radius),
    expectedRadius: expected.expectedRadius,
    ack: Number(bridge.lastAck || 0),
    errorDelta: Number(bridge.actionErrors || 0) - expected.beforeErrors,
    bridgeFailed: Boolean(bridge.failed),
  };
}, liveRefit), 12000);
if (liveRefitResult.bridgeFailed || liveRefitResult.errorDelta || liveRefitResult.radius !== liveRefitResult.expectedRadius) {
  throw new Error(`authoritative Worker refit failed: ${JSON.stringify({ liveRefit, liveRefitResult })}`);
}

const saveRequested = await page.evaluate(() => {
  const shell = globalThis.__FD_RUNTIME_SHELL_199__;
  const D = globalThis.__FD_DEBUG__;
  const bridge = globalThis.__FD_STABLE_STATE165__?.bridge;
  const ok = shell?.saveNow?.('reliability199') === true;
  return { ok, key: D?.SAVE_KEY || 'frontline-dominion-save-v5', requestedAt: Date.now(), pending: Number(bridge?.pendingSaves?.size || 0) };
});
if (!saveRequested.ok) throw new Error(`save request failed: ${JSON.stringify(saveRequested)}`);

const saved = await waitFor(() => page.evaluate(({ key, requestedAt }) => {
  const D = globalThis.__FD_DEBUG__;
  const bridge = globalThis.__FD_STABLE_STATE165__?.bridge;
  const raw = D?.storageGet?.(key) || localStorage.getItem(key);
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch (_) {}
  const entities = data?.entities || [...(data?.units || []), ...(data?.buildings || [])];
  const marker = entities?.find(item => item?.kind === 'building' && item.team === 'player');
  if (!data || !marker || !data.seed || !entities?.length || Number(bridge?.pendingSaves?.size || 0) > 0 || Number(data.savedAt || 0) < requestedAt - 2000) return null;
  return {
    key,
    seed: data.seed,
    entityCount: entities.length,
    savedAt: data.savedAt,
    marker: { id: marker.id, typeId: marker.typeId, x: marker.x, y: marker.y, hp: marker.hp },
  };
}, saveRequested), 12000, 120);

await page.reload({ waitUntil: 'load', timeout: 60000 });
await waitShell();
await waitFor(() => page.evaluate(() => !document.getElementById('load-game')?.disabled), 15000);
await page.locator('#load-game').click();
await waitGame();

const loaded = await page.evaluate(expected => {
  const game = globalThis.__FD_DEBUG__?.game;
  const shell = globalThis.__FD_RUNTIME_SHELL_199__;
  const bridge = globalThis.__FD_STABLE_STATE165__?.bridge;
  const entity = game?.getEntity?.(expected.marker.id);
  return {
    seed: game?.seed,
    marker: entity ? { id: entity.id, typeId: entity.typeId, x: entity.x, y: entity.y, hp: entity.hp } : null,
    saveSourceKey: shell?.state?.saveSourceKey || null,
    lastError: shell?.state?.lastError || null,
    launchCount: shell?.state?.launchCount || 0,
    bridgeReady: Boolean(bridge?.ready),
    bridgeFailed: Boolean(bridge?.failed),
  };
}, saved);
if (loaded.lastError || loaded.bridgeFailed || !loaded.bridgeReady || loaded.seed !== saved.seed || !loaded.marker || loaded.marker.typeId !== saved.marker.typeId ||
    Math.hypot(Number(loaded.marker.x) - Number(saved.marker.x), Number(loaded.marker.y) - Number(saved.marker.y)) > 3) {
  throw new Error(`saved game did not load faithfully: ${JSON.stringify({ saved, loaded })}`);
}
if (errors.length) throw new Error(`browser errors: ${JSON.stringify(errors)}`);

console.log(JSON.stringify({
  ok: true,
  browserName,
  buildingGate,
  emptyClick,
  transportTypes: matrixGate.transportTypes,
  transportResults: matrixGate.transportResults,
  refitGroups: matrixGate.groupCount,
  refitTransitions: matrixGate.refitResults.length,
  liveRefit,
  liveRefitResult,
  saved,
  loaded,
  errors,
}));
await context.close();
await browser.close();
