(() => {
  'use strict';

  const debug = window.__FD_DEBUG__;
  const GameClass = debug?.Game;
  const canvas = document.getElementById('game-canvas');
  const context = canvas?.getContext('2d');
  if (!GameClass || !canvas || !context || typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined') return;

  const VERSION = '12.5';
  const MASS_THRESHOLD = 3000;
  const ENGINEER_DISPLAY_SCALE = 2.85;
  const INFANTRY_REFERENCE_VISIBLE_HEIGHT = 40.5;
  const infantryDisplayScale = (game, unit, worldWidth, cellAspect = .75) => {
    if (!unit?.infantry) return 1;
    if (unit.typeId === 'worker') return ENGINEER_DISPLAY_SCALE;
    const authoritative = game?.getUnitPresentationScale138?.(unit, worldWidth, cellAspect);
    if (Number.isFinite(authoritative)) return authoritative;
    return clamp(INFANTRY_REFERENCE_VISIBLE_HEIGHT / Math.max(1, worldWidth * cellAspect * .78), .85, 14);
  };
  const BEAM_EFFECT_TYPES = new Set(['beam', 'interceptBeam', 'jamBeam']);
  const states = new WeakMap();
  const metrics = { framesRequested: 0, framesReceived: 0, framesDrawn: 0, renderPasses: 0, workerErrors: 0, lastWorkerMs: 0, lastCommands: 0 };
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  const makeSpriteOverlay = () => {
    const overlay = document.createElement('canvas');
    overlay.dataset.legionSpriteLayer = 'true';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.style.cssText = [
      'position:absolute',
      'pointer-events:none',
      'display:block',
      'visibility:hidden',
      'z-index:3',
      'background:transparent',
      'contain:strict',
    ].join(';');
    const parent = canvas.parentElement || document.body;
    if (getComputedStyle(parent).position === 'static') parent.style.position = 'relative';
    parent.appendChild(overlay);
    const bitmapContext = overlay.getContext('bitmaprenderer');
    const fallbackContext = bitmapContext ? null : overlay.getContext('2d', { alpha: true, desynchronized: true });
    return { overlay, bitmapContext, fallbackContext };
  };

  const makeCombatOverlay = () => {
    const overlay = document.createElement('canvas');
    overlay.dataset.legionCombatLayer = 'true';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.style.cssText = [
      'position:absolute',
      'pointer-events:none',
      'display:block',
      'visibility:hidden',
      'z-index:4',
      'background:transparent',
      'contain:strict',
    ].join(';');
    const parent = canvas.parentElement || document.body;
    if (getComputedStyle(parent).position === 'static') parent.style.position = 'relative';
    parent.appendChild(overlay);
    return { overlay, context: overlay.getContext('2d', { alpha: true, desynchronized: true }) };
  };

  const makeFogOverlay = () => {
    const overlay = document.createElement('canvas');
    overlay.dataset.legionFogLayer = 'true';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.style.cssText = [
      'position:absolute',
      'pointer-events:none',
      'display:block',
      'visibility:hidden',
      'z-index:2',
      'background:transparent',
      'contain:strict',
    ].join(';');
    const parent = canvas.parentElement || document.body;
    if (getComputedStyle(parent).position === 'static') parent.style.position = 'relative';
    parent.appendChild(overlay);
    return { overlay, context: overlay.getContext('2d', { alpha: true, desynchronized: true }) };
  };

  const cameraKey = (game) => [
    canvas.width, canvas.height,
    Number(game.camera?.x || 0).toFixed(2),
    Number(game.camera?.y || 0).toFixed(2),
    Number(game.camera?.zoom || 1).toFixed(4),
    Number(game.camera?.yaw || 0).toFixed(4),
    Number(game.camera?.pitch || 0).toFixed(4),
  ].join(':');

  const ensureState = (game) => {
    let state = states.get(game);
    if (state) return state;
    const worker = new Worker('/frontline-dominion/legion-render-worker-v125.js?build=206');
    const layer = makeSpriteOverlay();
    const combatLayer = makeCombatOverlay();
    const fogLayer = makeFogOverlay();
    state = {
      worker,
      sequence: 0,
      inFlight: false,
      disabled: false,
      overlay: layer.overlay,
      bitmapContext: layer.bitmapContext,
      fallbackContext: layer.fallbackContext,
      combatOverlay: combatLayer.overlay,
      combatContext: combatLayer.context,
      fogOverlay: fogLayer.overlay,
      fogContext: fogLayer.context,
      bitmapKey: '',
      loadedUris: new Set(),
      lastRequestAt: -Infinity,
      lastDynamicAt: -Infinity,
      lastCombatDrawAt: -Infinity,
      lastBackgroundAt: -Infinity,
      backgroundKey: '',
      renderAttempt: 0,
      lastBackgroundFrame: -Infinity,
      lastFogDrawAt: -Infinity,
      interactionActive: false,
      trailGroups: new Map(),
      blastGroups: new Map(),
      commandPool: [],
      commands: [],
      commandEntities: [],
      fallbackUnits: [],
      fallbackBuildings: [],
      fallbackClusters: [],
      projector: {},
    };
    worker.addEventListener('message', (event) => {
      const message = event.data;
      state.inFlight = false;
      if (message?.type === 'error') {
        state.disabled = true;
        metrics.workerErrors += 1;
        return;
      }
      if (message?.type !== 'frame' || !message.bitmap) return;
      const cssScaleX = canvas.clientWidth / Math.max(1, game.viewport?.width || canvas.clientWidth);
      const cssScaleY = canvas.clientHeight / Math.max(1, game.viewport?.height || canvas.clientHeight);
      const cssX = (canvas.offsetLeft || 0) + (Number(message.cropX) || 0) * cssScaleX;
      const cssY = (canvas.offsetTop || 0) + (Number(message.cropY) || 0) * cssScaleY;
      const cssWidth = Math.max(1, (Number(message.cssWidth) || message.bitmap.width / Math.max(1, message.dpr || 1)) * cssScaleX);
      const cssHeight = Math.max(1, (Number(message.cssHeight) || message.bitmap.height / Math.max(1, message.dpr || 1)) * cssScaleY);
      if (state.overlay.width !== message.bitmap.width) state.overlay.width = message.bitmap.width;
      if (state.overlay.height !== message.bitmap.height) state.overlay.height = message.bitmap.height;
      state.overlay.style.left = `${cssX}px`;
      state.overlay.style.top = `${cssY}px`;
      state.overlay.style.width = `${cssWidth}px`;
      state.overlay.style.height = `${cssHeight}px`;
      if (state.bitmapContext) state.bitmapContext.transferFromImageBitmap(message.bitmap);
      else {
        state.fallbackContext.setTransform(1, 0, 0, 1, 0, 0);
        state.fallbackContext.globalCompositeOperation = 'copy';
        state.fallbackContext.drawImage(message.bitmap, 0, 0);
        message.bitmap.close?.();
      }
      state.bitmapKey = message.cameraKey;
      state.loadedUris.clear();
      for (const uri of message.loadedUris || []) state.loadedUris.add(uri);
      metrics.framesReceived += 1;
      metrics.framesDrawn += 1;
      metrics.lastWorkerMs = Number(message.drawMs) || 0;
    });
    worker.addEventListener('error', () => {
      state.disabled = true;
      state.inFlight = false;
      metrics.workerErrors += 1;
    });
    states.set(game, state);
    return state;
  };

  const spriteFor = (typeId, kind) => {
    const pilot = window.__FD_MODEL_PILOT__;
    const code = pilot?.modelForType?.(typeId, kind);
    const sprite = code ? pilot?.canvasSprites?.[code] : null;
    if (!sprite?.uri || !sprite.spec?.canvasSprite) return null;
    return { code, sprite, atlas: sprite.spec.canvasSprite };
  };

  const writeAtlasFields = (command, resolved, rotation = 0) => {
    const { sprite, atlas } = resolved;
    const columns = Math.max(1, atlas.columns || (sprite.spec?.type === 'building' ? 2 : 4));
    const rows = Math.max(1, atlas.rows || 2);
    const directions = Math.max(1, atlas.directions || columns * rows || 8);
    const heading = ((rotation % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    command.uri = sprite.uri;
    command.columns = columns;
    command.rows = rows;
    command.frame = sprite.spec?.type === 'building' ? 0 : Math.round(heading / (Math.PI * 2 / directions)) % directions;
    command.anchorX = Number.isFinite(atlas.anchorX) ? atlas.anchorX : .5;
    command.baseline = Number.isFinite(atlas.groundBaseline) ? atlas.groundBaseline : .79;
    command.cellAspect = (atlas.cellHeight || 144) / Math.max(1, atlas.cellWidth || 192);
    return command;
  };

  const projectCommand = (x, y, altitude, command, projector) => {
    const dx = x - projector.cameraX;
    const dy = y - projector.cameraY;
    command.x = projector.centerX + (projector.c * dx - projector.s * dy) * projector.zoom;
    command.y = projector.centerY + (projector.s * dx + projector.c * dy) * projector.zoom * projector.pitch - altitude * projector.altitudeScale;
  };

  const resetOptionalCommandFields = (command) => {
    command.selection = null;
    command.progress = null;
    command.label = '';
    command.count = 0;
    command.healthX = null;
    command.healthY = null;
    command.healthWidth = null;
  };

  const unitCommand = (game, unit, command, projector) => {
    const resolved = spriteFor(unit.typeId, 'unit');
    if (!resolved) return null;
    const rotation = (unit.vehicle || unit.air) ? (unit.rotation ?? unit.renderRotation ?? 0) : (unit.renderRotation ?? unit.rotation ?? 0);
    const x = unit.renderX ?? unit.x;
    const y = unit.renderY ?? unit.y;
    const radius = unit.radius * (unit.stats?.visualScale || 1);
    const altitude = unit.air
      ? (game.getAircraftVisualAltitude137?.(unit) ?? game.getAircraftFlightAltitude119?.(unit) ?? radius * 5.2)
      : 0;
    projectCommand(x, y, altitude, command, projector);
    const visualScale = unit.stats?.visualScale || 1;
    if (unit._v125WorldWidthType !== unit.typeId || unit._v125WorldWidthRadius !== unit.radius || unit._v125WorldWidthVisualScale !== visualScale) {
      const exact = game.getUnitFootprintAt?.(unit, x, y, rotation);
      unit._v125WorldWidth = exact ? Math.max(exact.halfLength * 2, exact.halfWidth * 2) : radius * 2.85;
      unit._v125WorldWidthType = unit.typeId;
      unit._v125WorldWidthRadius = unit.radius;
      unit._v125WorldWidthVisualScale = visualScale;
    }
    writeAtlasFields(command, resolved, rotation);
    const worldWidth = unit._v125WorldWidth || radius * 2.85;
    const width = worldWidth * (game.camera?.zoom || 1) * 1.34 * infantryDisplayScale(game, unit, worldWidth, command.cellAspect);
    const height = width * command.cellAspect;
    const selected = Boolean(unit.selected && game.displayedTeamForUnit?.(unit, 'player') === unit.team);
    resetOptionalCommandFields(command);
    command.kind = 'unit';
    command.w = width;
    command.h = height;
    command.depth = command.y + (unit.air ? 10000 : 0);
    command.alpha = 1;
    command.selected = selected;
    command.teamColor = game.teamColor(unit.team);
    command.health = unit.healthRatio;
    command.showHealth = selected || unit.healthRatio < .72 || game.time - (unit.lastDamagedAt || -999) < 2.5;
    if (unit.infantry) {
      const tight = game.getInfantryScreenBounds138?.(unit) || game.getWorkerScreenBounds115?.(unit);
      if (tight) {
        command.healthX = (tight.x1 + tight.x2) * .5;
        command.healthY = tight.y1 - 5;
        command.healthWidth = clamp(tight.visibleWidth * .82, 30, 54);
      }
    }
    return command;
  };

  const buildingCommand = (game, building, command, projector) => {
    const resolved = spriteFor(building.typeId, 'building');
    if (!resolved) return null;
    const radius = building.radius * (building.stats?.visualScale || 1);
    projectCommand(building.x, building.y, 0, command, projector);
    writeAtlasFields(command, resolved, 0);
    const width = radius * (game.camera?.zoom || 1) * (resolved.atlas.worldWidthFactor || 3.2) * 1.34;
    const height = width * command.cellAspect;
    const exact = building.selected ? game.getEntityBuildingFootprintAt?.(building, 0) : null;
    const selection = exact?.corners?.flatMap((point) => {
      const screen = game.worldToScreen(point.x, point.y, .02);
      return [screen.x, screen.y];
    });
    const progress = building.completed ? 1 : clamp(building.construction, .05, 1);
    resetOptionalCommandFields(command);
    command.kind = 'building';
    command.w = width;
    command.h = height;
    command.depth = command.y + radius * (game.camera?.zoom || 1) * .24;
    command.alpha = building.completed ? 1 : .46 + progress * .54;
    command.progress = progress;
    command.selected = Boolean(building.selected);
    command.selection = selection;
    command.teamColor = game.teamColor(building.team);
    command.health = building.healthRatio;
    command.showHealth = building.selected || building.healthRatio < .74 || game.time - (building.lastDamagedAt || -999) < 2.5;
    return command;
  };

  const clusterCommand = (game, cluster, command, projector) => {
    const resolved = spriteFor(cluster.typeId, 'unit');
    if (!resolved) return null;
    const altitude = cluster.air ? Math.max(310, (game.getTallestBuildingHeight119?.() || 245) + 65) : 0;
    projectCommand(cluster.x, cluster.y, altitude, command, projector);
    writeAtlasFields(command, resolved, cluster.rotation || 0);
    const zoom = game.camera?.zoom || 1;
    const width = clamp((66 + Math.log2(cluster.count + 1) * 17) * Math.sqrt(zoom), 40, cluster.air ? 118 : 148);
    resetOptionalCommandFields(command);
    command.kind = 'cluster';
    command.w = width;
    command.h = width * .70;
    command.depth = command.y + (cluster.air ? 10000 : 0);
    command.alpha = 1;
    command.selected = false;
    command.count = cluster.count;
    command.health = cluster.hp;
    command.showHealth = false;
    command.teamColor = game.teamColor(cluster.team);
    command.label = cluster.count >= 12 && zoom <= .72
      ? (cluster.count >= 1000 ? `${(cluster.count / 1000).toFixed(cluster.count >= 10000 ? 0 : 1)}k` : String(cluster.count))
      : '';
    return command;
  };

  const syncFullOverlay = (overlay) => {
    if (overlay.width !== canvas.width) overlay.width = canvas.width;
    if (overlay.height !== canvas.height) overlay.height = canvas.height;
    overlay.style.left = `${canvas.offsetLeft || 0}px`;
    overlay.style.top = `${canvas.offsetTop || 0}px`;
    overlay.style.width = `${canvas.clientWidth}px`;
    overlay.style.height = `${canvas.clientHeight}px`;
  };

  const drawCombatLayer = (game, state, force = false) => {
    const now = performance.now();
    if (!force && now - state.lastCombatDrawAt < 33) return;
    state.lastCombatDrawAt = now;
    syncFullOverlay(state.combatOverlay);
    const target = state.combatContext;
    const dpr = game.viewport?.dpr || 1;
    target.setTransform(1, 0, 0, 1, 0, 0);
    target.clearRect(0, 0, state.combatOverlay.width, state.combatOverlay.height);
    target.setTransform(dpr, 0, 0, dpr, 0, 0);
    const projectiles = game.renderSnapshot?.projectiles || [];
    const effects = game.effects || [];
    if (!projectiles.length && !effects.length) {
      state.combatOverlay.style.visibility = 'hidden';
      return;
    }
    state.combatOverlay.style.visibility = 'visible';

    // Dense missile exchanges retain every visible warhead, but each trail is
    // a single batched directional stroke. At tactical zoom this is visually
    // the same bright moving ribbon while avoiding tens of thousands of old
    // trail-point projections and individual Canvas calls.
    const { c, s, pitch, zoom } = game.cameraBasis();
    const cameraX = game.camera.x;
    const cameraY = game.camera.y;
    const screenCenterX = game.viewport.width / 2;
    const screenCenterY = game.viewport.height / 2;
    const altitudeScale = zoom * (.98 + (1 - pitch) * .55);
    for (const group of state.trailGroups.values()) {
      group.segments.length = 0;
      group.heads.length = 0;
    }
    for (const projectile of projectiles) {
      if (!projectile?.alive) continue;
      const dx = projectile.x - cameraX;
      const dy = projectile.y - cameraY;
      const headX = screenCenterX + (c * dx - s * dy) * zoom;
      const headY = screenCenterY + (s * dx + c * dy) * zoom * pitch - (projectile.altitude || 0) * altitudeScale;
      if (headX < -220 || headY < -220 || headX > game.viewport.width + 220 || headY > game.viewport.height + 220) continue;
      const trailWorld = clamp((projectile.speed || 500) * .105, 20, 92);
      const tailWorldX = projectile.x - Math.cos(projectile.angle || 0) * trailWorld;
      const tailWorldY = projectile.y - Math.sin(projectile.angle || 0) * trailWorld;
      const tailDx = tailWorldX - cameraX;
      const tailDy = tailWorldY - cameraY;
      const tailX = screenCenterX + (c * tailDx - s * tailDy) * zoom;
      const tailY = screenCenterY + (s * tailDx + c * tailDy) * zoom * pitch - Math.max(0, (projectile.altitude || 0) * .94) * altitudeScale;
      const color = projectile.trailColor || projectile.color || '#ffd28a';
      const width = Math.max(1, Math.round(Math.max(1, (projectile.visualSize || 3) * zoom * .42) * 2) / 2);
      let group = projectile._v125TrailGroup;
      if (!group || group.color !== color || group.width !== width) {
        const key = `${color}:${width}`;
        group = state.trailGroups.get(key);
        if (!group) {
          group = { color, width, segments: [], heads: [] };
          state.trailGroups.set(key, group);
        }
        projectile._v125TrailGroup = group;
      }
      group.segments.push(tailX, tailY, headX, headY);
      group.heads.push(headX, headY);
    }
    target.save();
    target.globalCompositeOperation = 'lighter';
    target.lineCap = 'round';
    for (const batch of state.trailGroups.values()) {
      if (!batch.segments.length) continue;
      target.globalAlpha = .76;
      target.strokeStyle = batch.color;
      target.lineWidth = batch.width;
      target.beginPath();
      for (let index = 0; index < batch.segments.length; index += 4) {
        target.moveTo(batch.segments[index], batch.segments[index + 1]);
        target.lineTo(batch.segments[index + 2], batch.segments[index + 3]);
      }
      target.stroke();
      target.globalAlpha = .88;
      target.fillStyle = batch.color;
      target.beginPath();
      const radius = Math.max(1.5, batch.width * .9);
      for (let index = 0; index < batch.heads.length; index += 2) {
        target.moveTo(batch.heads[index] + radius, batch.heads[index + 1]);
        target.arc(batch.heads[index], batch.heads[index + 1], radius, 0, Math.PI * 2);
      }
      target.fill();
    }

    // Effects are also batched into luminous screen-space geometry. Beams keep
    // exact endpoints; blast rings keep radius, colour and lifetime.
    for (const group of state.blastGroups.values()) group.circles.length = 0;
    for (const effect of effects) {
      if (!effect) continue;
      const age = clamp(effect.age / Math.max(.001, effect.duration || .1), 0, 1);
      const effectDx = effect.x - cameraX;
      const effectDy = effect.y - cameraY;
      const pointX = screenCenterX + (c * effectDx - s * effectDy) * zoom;
      const pointY = screenCenterY + (s * effectDx + c * effectDy) * zoom * pitch - (effect.z || 0) * altitudeScale;
      if (pointX < -180 || pointY < -180 || pointX > game.viewport.width + 180 || pointY > game.viewport.height + 180) continue;
      if (BEAM_EFFECT_TYPES.has(effect.type)) {
        const endDx = effect.x2 - cameraX;
        const endDy = effect.y2 - cameraY;
        const endX = screenCenterX + (c * endDx - s * endDy) * zoom;
        const endY = screenCenterY + (s * endDx + c * endDy) * zoom * pitch - (effect.z2 || 0) * altitudeScale;
        target.globalAlpha = 1 - age;
        target.strokeStyle = effect.color || '#9fffe1';
        target.lineWidth = effect.type === 'jamBeam' ? 2.8 : 1.8;
        target.beginPath();
        target.moveTo(pointX, pointY);
        target.lineTo(endX, endY);
        target.stroke();
        continue;
      }
      if (effect.type === 'text') {
        target.globalAlpha = 1 - age;
        target.fillStyle = effect.color || '#fff';
        target.font = `800 ${Math.max(10, 13 * (game.camera?.zoom || 1))}px system-ui`;
        target.textAlign = 'center';
        target.fillText(effect.text || '', pointX, pointY);
        continue;
      }
      const color = effect.color || (effect.type === 'intercept' ? '#8fffe1' : effect.type === 'jam' ? '#83a8ff' : '#ff9a52');
      const radius = Math.max(3, (effect.radius || 20) * zoom * (.32 + age * .95));
      const alphaBand = Math.round((1 - age) * 3);
      let blast = effect._v125BlastGroup;
      if (!blast || blast.color !== color || blast.alphaBand !== alphaBand) {
        const key = `${color}:${alphaBand}`;
        blast = state.blastGroups.get(key);
        if (!blast) {
          blast = { color, alphaBand, alpha: Math.max(.12, alphaBand / 3 * .68), circles: [] };
          state.blastGroups.set(key, blast);
        }
        effect._v125BlastGroup = blast;
      }
      blast.circles.push(pointX, pointY, radius);
    }
    for (const blast of state.blastGroups.values()) {
      if (!blast.circles.length) continue;
      target.globalAlpha = blast.alpha;
      target.fillStyle = blast.color;
      target.beginPath();
      for (let index = 0; index < blast.circles.length; index += 3) {
        target.moveTo(blast.circles[index] + blast.circles[index + 2], blast.circles[index + 1]);
        target.arc(blast.circles[index], blast.circles[index + 1], blast.circles[index + 2], 0, Math.PI * 2);
      }
      target.fill();
    }
    target.restore();
    target.globalAlpha = 1;
  };

  const drawFogLayer = (game, state, force = false) => {
    const now = performance.now();
    if (!force && now - state.lastFogDrawAt < 250) return;
    state.lastFogDrawAt = now;
    syncFullOverlay(state.fogOverlay);
    const target = state.fogContext;
    const dpr = game.viewport?.dpr || 1;
    target.setTransform(1, 0, 0, 1, 0, 0);
    target.clearRect(0, 0, state.fogOverlay.width, state.fogOverlay.height);
    target.setTransform(dpr, 0, 0, dpr, 0, 0);
    const baseCell = debug.WORLD?.cell || 64;
    // At the strategic zoom used by 20k battles, four base fog cells project
    // to less than a formation tile. Merge them before projection just as a
    // classic RTS uses a coarse shroud mip; zooming in restores 2x or exact
    // cells. This changes no visibility decision for individual entities.
    const zoom = game.camera?.zoom || 1;
    const fogFactor = zoom <= .45 ? 4 : zoom <= .72 ? 2 : 1;
    const cell = baseCell * fogFactor;
    const bounds = game.visibleWorldBounds(cell);
    const coarseCols = Math.ceil(game.fogCols / fogFactor);
    const coarseRows = Math.ceil(game.fogRows / fogFactor);
    const minCol = clamp(Math.floor(bounds.left / cell), 0, coarseCols - 1);
    const maxCol = clamp(Math.ceil(bounds.right / cell), 0, coarseCols - 1);
    const minRow = clamp(Math.floor(bounds.top / cell), 0, coarseRows - 1);
    const maxRow = clamp(Math.ceil(bounds.bottom / cell), 0, coarseRows - 1);
    const exploredPath = new Path2D();
    const unknownPath = new Path2D();
    let covered = 0;
    for (let row = minRow; row <= maxRow; row += 1) {
      for (let col = minCol; col <= maxCol; col += 1) {
        let visible = false;
        let explored = false;
        for (let offsetRow = 0; offsetRow < fogFactor; offsetRow += 1) {
          const sourceRow = row * fogFactor + offsetRow;
          if (sourceRow >= game.fogRows) break;
          for (let offsetCol = 0; offsetCol < fogFactor; offsetCol += 1) {
            const sourceCol = col * fogFactor + offsetCol;
            if (sourceCol >= game.fogCols) break;
            const index = sourceRow * game.fogCols + sourceCol;
            visible ||= Boolean(game.visible[index]);
            explored ||= Boolean(game.explored[index]);
          }
        }
        if (visible) continue;
        const path = explored ? exploredPath : unknownPath;
        const left = col * cell - 1;
        const top = row * cell - 1;
        const right = left + cell + 2;
        const bottom = top + cell + 2;
        const a = game.worldToScreen(left, top, 0);
        const b = game.worldToScreen(right, top, 0);
        const c = game.worldToScreen(right, bottom, 0);
        const d = game.worldToScreen(left, bottom, 0);
        path.moveTo(a.x, a.y);
        path.lineTo(b.x, b.y);
        path.lineTo(c.x, c.y);
        path.lineTo(d.x, d.y);
        path.closePath();
        covered += 1;
      }
    }
    if (covered) {
      target.fillStyle = 'rgba(4,8,6,.56)';
      target.fill(exploredPath);
      target.fillStyle = 'rgba(2,4,3,.94)';
      target.fill(unknownPath);
      state.fogOverlay.style.visibility = 'visible';
    } else state.fogOverlay.style.visibility = 'hidden';
  };

  const baseDrawWorld = GameClass.prototype.drawWorldObjects3D;
  GameClass.prototype.drawWorldObjects3D = function() {
    const alive = this._v94AliveUnits || this.units?.length || 0;
    const snapshot = this.renderSnapshot;
    if (alive < MASS_THRESHOLD || !snapshot || !window.__FD_MODEL_PILOT__?.manifest) return baseDrawWorld.call(this);
    const state = ensureState(this);
    if (state.disabled) {
      state.overlay.style.visibility = 'hidden';
      return baseDrawWorld.call(this);
    }

    const key = cameraKey(this);
    const commands = state.commands;
    const commandEntities = state.commandEntities;
    const fallbackUnits = state.fallbackUnits;
    const fallbackBuildings = state.fallbackBuildings;
    const fallbackClusters = state.fallbackClusters;
    commands.length = 0;
    commandEntities.length = 0;
    fallbackUnits.length = 0;
    fallbackBuildings.length = 0;
    fallbackClusters.length = 0;
    const projector = state.projector;
    const yaw = this.camera?.yaw || 0;
    projector.c = Math.cos(yaw);
    projector.s = Math.sin(yaw);
    projector.pitch = clamp(this.camera?.pitch || .58, .30, .88);
    projector.zoom = Math.max(.18, this.camera?.zoom || 1);
    projector.cameraX = this.camera.x;
    projector.cameraY = this.camera.y;
    projector.centerX = this.viewport.width / 2;
    projector.centerY = this.viewport.height / 2;
    projector.altitudeScale = projector.zoom * (.98 + (1 - projector.pitch) * .55);
    let poolIndex = 0;
    const addCommand = (entity, builder, fallback) => {
      const pooled = state.commandPool[poolIndex] || (state.commandPool[poolIndex] = {});
      const command = builder(this, entity, pooled, projector);
      if (!command) {
        fallback.push(entity);
        return;
      }
      poolIndex += 1;
      commands.push(command);
      commandEntities.push(entity);
    };
    for (const entity of snapshot.buildings) addCommand(entity, buildingCommand, fallbackBuildings);
    for (const entity of snapshot.units) addCommand(entity, unitCommand, fallbackUnits);
    for (const entity of snapshot.clusters94 || []) addCommand(entity, clusterCommand, fallbackClusters);

    // No worker surface is useful for an empty tactical view, and avoiding it
    // also keeps the crop bounds well-defined during loading/teleports.
    if (!commands.length) {
      state.overlay.style.visibility = 'hidden';
      return baseDrawWorld.call(this);
    }

    let cropLeft = this.viewport.width;
    let cropTop = this.viewport.height;
    let cropRight = 0;
    let cropBottom = 0;
    for (const command of commands) {
      const padX = command.w * .62 + 20;
      const padY = command.h * .88 + 24;
      cropLeft = Math.min(cropLeft, command.x - padX);
      cropTop = Math.min(cropTop, command.y - padY);
      cropRight = Math.max(cropRight, command.x + padX);
      cropBottom = Math.max(cropBottom, command.y + padY * .55);
    }
    cropLeft = clamp(Math.floor(cropLeft), 0, this.viewport.width);
    cropTop = clamp(Math.floor(cropTop), 0, this.viewport.height);
    cropRight = clamp(Math.ceil(cropRight), cropLeft + 1, this.viewport.width);
    cropBottom = clamp(Math.ceil(cropBottom), cropTop + 1, this.viewport.height);
    const dpr = this.viewport?.dpr || 1;

    const now = performance.now();
    if (!state.inFlight && now - state.lastRequestAt >= 50) {
      state.inFlight = true;
      state.lastRequestAt = now;
      state.sequence += 1;
      metrics.framesRequested += 1;
      metrics.lastCommands = commands.length;
      state.worker.postMessage({
        type: 'frame',
        sequence: state.sequence,
        cameraKey: key,
        width: Math.max(1, Math.ceil((cropRight - cropLeft) * dpr)),
        height: Math.max(1, Math.ceil((cropBottom - cropTop) * dpr)),
        dpr,
        cropX: cropLeft,
        cropY: cropTop,
        offsetX: Math.floor(cropLeft * dpr),
        offsetY: Math.floor(cropTop * dpr),
        cssWidth: cropRight - cropLeft,
        cssHeight: cropBottom - cropTop,
        commands,
      });
    }

    const usable = Boolean(state.bitmapKey === key && state.loadedUris.size);
    state.overlay.style.visibility = usable ? 'visible' : 'hidden';
    const oldUnits = snapshot.units;
    const oldBuildings = snapshot.buildings;
    const oldClusters = snapshot.clusters94;
    if (this._v125BackgroundOnly) {
      snapshot.units = [];
      snapshot.buildings = [];
      snapshot.clusters94 = [];
    } else if (usable) {
      for (let index = 0; index < commands.length; index += 1) {
        const command = commands[index];
        if (state.loadedUris.has(command.uri)) continue;
        const entity = commandEntities[index];
        if (command.kind === 'unit') fallbackUnits.push(entity);
        else if (command.kind === 'building') fallbackBuildings.push(entity);
        else fallbackClusters.push(entity);
      }
      snapshot.units = fallbackUnits;
      snapshot.buildings = fallbackBuildings;
      snapshot.clusters94 = fallbackClusters;
    }
    try {
      if (!this._v125LayerOnly) baseDrawWorld.call(this);
    } finally {
      snapshot.units = oldUnits;
      snapshot.buildings = oldBuildings;
      snapshot.clusters94 = oldClusters;
    }
    if (((this.simTick || 0) % 24) === 0) {
      canvas.dataset.legionWorkerFramesRequested = String(metrics.framesRequested);
      canvas.dataset.legionWorkerFramesReceived = String(metrics.framesReceived);
      canvas.dataset.legionWorkerFramesDrawn = String(metrics.framesDrawn);
      canvas.dataset.legionWorkerMs = metrics.lastWorkerMs.toFixed(2);
      canvas.dataset.legionWorkerCommands = String(metrics.lastCommands);
      canvas.dataset.legionWorkerErrors = String(metrics.workerErrors);
    }
  };

  const baseDrawProjectiles125 = GameClass.prototype.drawProjectiles3D;
  GameClass.prototype.drawProjectiles3D = function(...args) {
    if (this._v125BackgroundOnly) return;
    return baseDrawProjectiles125.apply(this, args);
  };

  const baseDrawEffects125 = GameClass.prototype.drawEffects3D;
  GameClass.prototype.drawEffects3D = function(...args) {
    if (this._v125BackgroundOnly) return;
    return baseDrawEffects125.apply(this, args);
  };

  const baseDrawCommands125 = GameClass.prototype.drawSelectedCommands;
  GameClass.prototype.drawSelectedCommands = function(...args) {
    if (this._v125BackgroundOnly) return;
    return baseDrawCommands125.apply(this, args);
  };

  const baseDrawFog125 = GameClass.prototype.drawFog;
  GameClass.prototype.drawFog = function(...args) {
    if (this._v125BackgroundOnly) return;
    return baseDrawFog125.apply(this, args);
  };

  const baseRender125 = GameClass.prototype.render;
  GameClass.prototype.render = function(alpha = 1, snapshot = null) {
    const alive = this._v94AliveUnits || this.units?.length || 0;
    if (alive < MASS_THRESHOLD || !this.perf || !this.renderSnapshot) {
      const existing = states.get(this);
      if (existing) {
        existing.overlay.style.visibility = 'hidden';
        existing.combatOverlay.style.visibility = 'hidden';
        existing.fogOverlay.style.visibility = 'hidden';
      }
      return baseRender125.call(this, alpha, snapshot);
    }
    const state = ensureState(this);
    state.renderAttempt += 1;
    if (!this.perf._v125EndFrameWrapped) {
      this.perf._v125EndFrameWrapped = true;
      const baseEndFrame = this.perf.endFrame.bind(this.perf);
      this.perf.endFrame = () => {
        const milliseconds = baseEndFrame();
        if (this.perf.benchmarking) this.perf._v125MaxRenderMs = Math.max(this.perf._v125MaxRenderMs || 0, milliseconds || 0);
        return milliseconds;
      };
    }
    const key = cameraKey(this);
    const now = performance.now();
    const cameraMoved = state.backgroundKey !== key;
    const interactionActive = Boolean(this.buildMode || this.input?.drag);
    const interactionChanged = interactionActive !== state.interactionActive;
    state.interactionActive = interactionActive;
    const needsBackground = state.lastBackgroundFrame === -Infinity || cameraMoved || interactionActive || interactionChanged;
    const backgroundInterval = interactionActive ? 50 : cameraMoved ? 80 : Infinity;
    const minimumFrameGap = interactionActive ? 3 : cameraMoved ? 3 : 1;
    if (needsBackground && now - state.lastBackgroundAt >= backgroundInterval && state.renderAttempt - state.lastBackgroundFrame >= minimumFrameGap) {
      metrics.renderPasses += 1;
      state.lastBackgroundAt = now;
      state.lastBackgroundFrame = state.renderAttempt;
      state.backgroundKey = key;
      this._v125BackgroundOnly = true;
      try {
        const result = baseRender125.call(this, alpha, snapshot);
        drawFogLayer(this, state, true);
        drawCombatLayer(this, state, true);
        return result;
      } finally {
        this._v125BackgroundOnly = false;
      }
    }

    // A classic mass-battle renderer presents a stable native-resolution
    // frame at a fixed cadence instead of rebuilding identical layers on every
    // monitor callback. The browser keeps compositing the latest bitmaps while
    // simulation continues at 25 Hz; this removes rAF bursts without changing
    // sprite resolution, atlas choice or the number of visible formations.
    const dynamicInterval = alive >= 16000 ? 50 : alive >= 8000 ? 40 : 33;
    if (now - state.lastDynamicAt < dynamicInterval) return undefined;
    state.lastDynamicAt = now;
    metrics.renderPasses += 1;

    // Between 4 Hz background/fog refreshes only dynamic overlay layers are
    // advanced. This is the classic dirty-layer architecture: terrain is not
    // copied again merely because a tank or missile moved.
    const perf = this.perf;
    perf.beginFrame();
    const timing = perf.wantsTiming?.();
    let sectionAt = timing ? performance.now() : 0;
    this.prepareInterpolationV9(alpha);
    this.buildRenderSnapshotV9(alpha);
    if (timing) {
      perf.add('legionRenderSnapshot', performance.now() - sectionAt);
      sectionAt = performance.now();
    }
    this._v125LayerOnly = true;
    try {
      this.drawWorldObjects3D();
      if (timing) {
        perf.add('legionRenderSprites', performance.now() - sectionAt);
        sectionAt = performance.now();
      }
      drawFogLayer(this, state);
      if (timing) {
        perf.add('legionRenderFog', performance.now() - sectionAt);
        sectionAt = performance.now();
      }
      drawCombatLayer(this, state);
      if (timing) {
        perf.add('legionRenderCombat', performance.now() - sectionAt);
        sectionAt = performance.now();
      }
      this.renderMinimap?.();
      if (timing) perf.add('legionRenderMinimap', performance.now() - sectionAt);
    } finally {
      this._v125LayerOnly = false;
      this.restoreInterpolationV9();
    }
    perf.acc.drawCalls = (perf.acc.drawCalls || 0) + perf.frameDrawCalls;
    return perf.endFrame();
  };

  window.__FD_LEGION_RENDER__ = {
    version: VERSION,
    architecture: 'off-main-thread isometric sprite compositor + transferable ImageBitmap',
    metrics: () => ({ ...metrics }),
  };
})();
