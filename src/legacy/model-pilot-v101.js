(() => {
  'use strict';

  const debug = window.__FD_DEBUG__;
  const GameClass = debug?.Game;
  if (!GameClass) return;

  const canvas = document.getElementById('game-canvas');
  const ctx = canvas?.getContext('2d');
  if (!ctx) return;

  const VERSION = '12.6';
  const MANIFEST_URL = '/frontline-dominion/models/pilot/manifest.json?build=206';
  // Readability is expressed only in world scale. A soldier therefore grows
  // and shrinks with the map exactly like a tank or building; zoom never
  // changes the proportions between entities. Individual people need a
  // stronger lift than multi-person squad atlases, which are already wide.
  const ENGINEER_DISPLAY_SCALE = 1;
  const INFANTRY_REFERENCE_VISIBLE_HEIGHT = 40.5;
  const infantryDisplayScale = (game, unit, worldWidth, cellAspect = .75) => {
    if (!unit?.infantry) return 1;
    const authoritative = game?.getUnitPresentationScale138?.(unit, worldWidth, cellAspect);
    if (Number.isFinite(authoritative)) return authoritative;
    // Safe pre-v13.8 fallback: normalise by projected human height instead of
    // multiplying narrow atlases by 12 and turning a rocket soldier into a
    // giant. The late authoritative layer replaces the occupancy estimate
    // with measured alpha bounds for every approved infantry atlas.
    const occupancy = .78;
    return clamp(INFANTRY_REFERENCE_VISIBLE_HEIGHT / Math.max(1, worldWidth * cellAspect * occupancy), .85, 14);
  };
  const canvasSprites = {};
  const buildingModels = new Map();
  const unitModels = new Map();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const parseHex = (hex) => {
    const value = String(hex || '#000000').replace('#', '');
    const full = value.length === 3 ? [...value].map((char) => char + char).join('') : value.padEnd(6, '0').slice(0, 6);
    return {
      r: Number.parseInt(full.slice(0, 2), 16) || 0,
      g: Number.parseInt(full.slice(2, 4), 16) || 0,
      b: Number.parseInt(full.slice(4, 6), 16) || 0,
    };
  };
  const mix = (a, b, amount = 0.5) => {
    const left = parseHex(a);
    const right = parseHex(b);
    const t = clamp(amount, 0, 1);
    const channel = (key) => Math.round(left[key] + (right[key] - left[key]) * t).toString(16).padStart(2, '0');
    return `#${channel('r')}${channel('g')}${channel('b')}`;
  };
  const shade = (color, amount = 0) => mix(color, amount >= 0 ? '#ffffff' : '#000000', Math.abs(amount));
  const rgba = (color, alpha) => {
    const value = parseHex(color);
    return `rgba(${value.r},${value.g},${value.b},${clamp(alpha, 0, 1)})`;
  };

  const MODEL_DEFINITIONS = [
    { code: 'V-U13', name: 'Танк «Паладин»', kind: 'unit', test: (id) => /^v_mbt(?:_|$)/.test(id) },
    { code: 'D-U13', name: 'Танк «Центурион»', kind: 'unit', test: (id) => /^d_mbt(?:_|$)/.test(id) },
    { code: 'S-U13', name: 'Танк «Химера»', kind: 'unit', test: (id) => /^s_mbt(?:_|$)/.test(id) },
    { code: 'V-U01', name: 'Стрелки «Оплот»', kind: 'unit', test: (id) => /^v_line(?:_|$)/.test(id) },
  ];

  const modelFor = (entity) => {
    if (!entity) return null;
    if (entity.kind === 'building') return buildingModels.get(entity.typeId) || null;
    return unitModels.get(entity.typeId) || MODEL_DEFINITIONS.find((model) => entity.kind === model.kind && (model.exact?.has(entity.typeId) || model.test?.(entity.typeId))) || null;
  };

  const modelLod = (game, entity) => {
    if (entity?.selected) return 0;
    const zoom = game.camera?.zoom || 1;
    const x = entity.renderX ?? entity.x;
    const y = entity.renderY ?? entity.y;
    const distance = Math.hypot(x - game.camera.x, y - game.camera.y);
    if (entity.kind === 'unit') {
      const footprint = game.getUnitFootprintAt?.(entity, x, y, entity.renderRotation ?? entity.rotation ?? 0);
      const worldSpan = footprint
        ? Math.max(footprint.halfLength * 2, footprint.halfWidth * 2)
        : entity.radius * (entity.stats?.visualScale || 1) * 2.8;
      const projected = worldSpan * zoom * infantryDisplayScale(game, entity, worldSpan, .75);
      // Visible units remain real models across the playable viewport. Only a
      // genuinely remote sub-five-pixel object becomes a tactical marker.
      if (projected < 5 && distance > 2400) return 3;
      if (projected >= 58) return 0;
      if (projected >= 28) return 1;
      return 2;
    }
    if (distance > 800) return 3;
    if (zoom >= 0.68) return 0;
    if (zoom >= 0.36) return 1;
    return 2;
  };

  const localPoint = (x, y, rotation, along, across, z = 0) => {
    const c = Math.cos(rotation);
    const s = Math.sin(rotation);
    return { x: x + along * c - across * s, y: y + along * s + across * c, z };
  };

  const lineLocal = (game, x, y, rotation, a1, a2, z1, b1, b2, z2, color, width = 2) => {
    game.line3D(
      localPoint(x, y, rotation, a1, a2, z1),
      localPoint(x, y, rotation, b1, b2, z2),
      color,
      width,
    );
  };

  const screenDot = (game, point, radius, fill, stroke = null) => {
    const screen = game.worldToScreen(point.x, point.y, point.z || 0);
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(screen.x, screen.y, radius, 0, Math.PI * 2);
    ctx.fill();
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = Math.max(0.7, game.camera.zoom * 0.7);
      ctx.stroke();
    }
    return screen;
  };

  const frustum3D = (game, x, y, z, bottomRadius, topRadius, height, color, segments = 12) => {
    const bottom = [];
    const top = [];
    for (let index = 0; index < segments; index += 1) {
      const angle = index / segments * Math.PI * 2;
      bottom.push(game.worldToScreen(x + Math.cos(angle) * bottomRadius, y + Math.sin(angle) * bottomRadius, z));
      top.push(game.worldToScreen(x + Math.cos(angle) * topRadius, y + Math.sin(angle) * topRadius, z + height));
    }
    const faces = [];
    for (let index = 0; index < segments; index += 1) {
      const next = (index + 1) % segments;
      const angle = (index + 0.5) / segments * Math.PI * 2;
      const points = [bottom[index], bottom[next], top[next], top[index]];
      faces.push({
        points,
        y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
        fill: shade(color, -0.17 - Math.sin(angle + (game.camera.yaw || 0)) * 0.11),
      });
    }
    faces.sort((a, b) => a.y - b.y);
    for (const face of faces) game.screenPolygon(face.points, face.fill, 'rgba(17,22,20,.52)', Math.max(0.65, game.camera.zoom * 0.58));
    game.screenPolygon(top, shade(color, 0.14), 'rgba(225,235,228,.22)', Math.max(0.7, game.camera.zoom * 0.6));
  };

  const verticalPanel = (game, x, y, rotation, along, across, width, bottomZ, topZ, color, stroke = 'rgba(20,24,22,.75)') => {
    const points = [
      localPoint(x, y, rotation, along - width / 2, across, bottomZ),
      localPoint(x, y, rotation, along + width / 2, across, bottomZ),
      localPoint(x, y, rotation, along + width / 2, across, topZ),
      localPoint(x, y, rotation, along - width / 2, across, topZ),
    ].map((point) => game.worldToScreen(point.x, point.y, point.z));
    game.screenPolygon(points, color, stroke, Math.max(0.7, game.camera.zoom * 0.65));
  };

  const buildingFinish = (game, building, radius, topZ, footprintLength, footprintDepth, rotation) => {
    if (!building.completed) {
      const top = game.worldToScreen(building.x, building.y, topZ);
      ctx.fillStyle = '#f2d58a';
      ctx.font = `800 ${Math.max(9, 10 * game.camera.zoom)}px system-ui`;
      ctx.textAlign = 'center';
      ctx.fillText(`${Math.round(building.construction * 100)}%`, top.x, top.y - 6);
    }
    if (building.selected) {
      const exact = game.getEntityBuildingFootprintAt?.(building, 0);
      const corners = exact?.corners?.length === 4
        ? exact.corners.map((point) => game.worldToScreen(point.x, point.y, 0.02))
        : [
          localPoint(building.x, building.y, rotation, -footprintLength / 2, -footprintDepth / 2, 0.02),
          localPoint(building.x, building.y, rotation, footprintLength / 2, -footprintDepth / 2, 0.02),
          localPoint(building.x, building.y, rotation, footprintLength / 2, footprintDepth / 2, 0.02),
          localPoint(building.x, building.y, rotation, -footprintLength / 2, footprintDepth / 2, 0.02),
        ].map((point) => game.worldToScreen(point.x, point.y, point.z));
      game.screenPolygon(corners, null, game.teamColor(building.team), 2);
    }
    if (building.selected || building.healthRatio < 0.74 || game.time - building.lastDamagedAt < 2.5) {
      const top = game.worldToScreen(building.x, building.y, topZ);
      game.drawScreenHealthBar(building, top.x, top.y - 12, Math.max(46, radius * game.camera.zoom * 2.05));
    }
  };

  const drawHeroBuildingSprite = (game, building, code) => {
    const sprite = ensureCanvasSprite(code);
    if (sprite?.image?.complete && sprite.image.naturalWidth > 0) sprite.ready = true;
    if (!sprite?.ready) return false;
    const radius = building.radius * (building.stats.visualScale || 1);
    const progress = building.completed ? 1 : clamp(building.construction, 0.05, 1);
    const rotation = Number.isFinite(building.rotation) ? building.rotation : 0;
    const center = game.worldToScreen(building.x, building.y, 0);
    const zoom = game.camera.zoom || 1;
    const atlas = sprite.spec?.canvasSprite || {};
    const columns = atlas.columns || 2;
    const rows = atlas.rows || 2;
    const sourceWidth = sprite.image.naturalWidth / columns;
    const sourceHeight = sprite.image.naturalHeight / rows;
    const targetWidth = radius * zoom * (atlas.worldWidthFactor || 3.2) * 1.34;
    const targetHeight = targetWidth * sourceHeight / sourceWidth;
    // Buildings use one approved baked isometric view. Their gameplay and
    // collision orientation is fixed by the sprite-scale layer as well, so the
    // visible foundation and the placement footprint remain identical.
    const frame = 0;
    const sourceX = (frame % columns) * sourceWidth;
    const sourceY = Math.floor(frame / columns) * sourceHeight;

    ctx.save();
    ctx.globalAlpha = building.completed ? 1 : 0.82 + progress * 0.18;
    // The atlas records the projected world origin. Using both coordinates is
    // what keeps asymmetric pads and their near corners inside the sprite.
    const anchorX = Number.isFinite(atlas.anchorX) ? atlas.anchorX : .5;
    const groundBaseline = Number.isFinite(atlas.groundBaseline) ? atlas.groundBaseline : 0.79;
    // Never reveal a baked sprite bottom-up: at partial construction that left
    // only the dark foundation/shadow visible as a huge triangular "corner".
    // The full silhouette stays readable while opacity and the normal progress
    // UI communicate construction state.
    ctx.drawImage(sprite.image, sourceX, sourceY, sourceWidth, sourceHeight, center.x - targetWidth * anchorX, center.y - targetHeight * groundBaseline, targetWidth, targetHeight);
    ctx.restore();

    const bounds = sprite.spec?.boundsMeters || [1, 1, 1];
    const topZ = game.getBuildingFootprint?.(building.typeId, rotation, building.team)?.height ||
      radius * Math.max(1.25, Math.min(2.25, bounds[2] / Math.max(bounds[0], bounds[1]) * 3.1));
    buildingFinish(game, building, radius, topZ, radius * 2.9, radius * 2.0, rotation);
    return true;
  };

  const unitFinish = (game, unit, radius, rotation, topZ, footprintScale = 1) => {
    const displayTeam = game.displayedTeamForUnit?.(unit, 'player') || unit.team;
    const disguised = displayTeam !== unit.team;
    const exact = game.getUnitFootprintAt?.(unit, unit.renderX ?? unit.x, unit.renderY ?? unit.y, rotation);
    if (unit.selected && !disguised) {
      if (exact?.collision === 'ellipse') {
        game.groundEllipse3D(exact.x, exact.y, exact.halfLength * footprintScale + 5, exact.halfWidth * footprintScale + 5, rotation, null, game.teamColor(displayTeam), 2);
      } else if (exact?.corners?.length === 4) {
        const visibleCorners = footprintScale === 1
          ? exact.corners
          : exact.corners.map((point) => ({
            x: exact.x + (point.x - exact.x) * footprintScale,
            y: exact.y + (point.y - exact.y) * footprintScale,
          }));
        game.screenPolygon(visibleCorners.map((point) => game.worldToScreen(point.x, point.y, .06)), null, game.teamColor(displayTeam), 2);
      } else {
        game.groundEllipse3D(unit.renderX ?? unit.x, unit.renderY ?? unit.y, (radius + 8) * footprintScale, (radius + 8) * .66 * footprintScale, rotation, null, game.teamColor(displayTeam), 2);
      }
    }
    if (!disguised && (unit.selected || unit.healthRatio < 0.72 || game.time - unit.lastDamagedAt < 2.5)) {
      const top = game.worldToScreen(unit.renderX ?? unit.x, unit.renderY ?? unit.y, topZ);
      const worldSpan = (exact ? Math.max(exact.halfLength * 2, exact.halfWidth * 2) : radius * 2.35) * footprintScale;
      game.drawScreenHealthBar(unit, top.x, top.y - 9, Math.max(48, worldSpan * game.camera.zoom * .82));
    }
  };

  const ensureCanvasSprite = (code) => {
    const sprite = canvasSprites[code];
    if (!sprite || sprite.image) return sprite;
    sprite.image = new window.Image();
    sprite.image.decoding = 'async';
    sprite.image.addEventListener('load', () => { sprite.ready = true; }, { once: true });
    sprite.image.src = sprite.uri;
    sprite.ready = sprite.image.complete && sprite.image.naturalWidth > 0;
    return sprite;
  };

  const drawHeroUnitSprite = (game, unit, code) => {
    const sprite = ensureCanvasSprite(code);
    if (sprite?.image?.complete && sprite.image.naturalWidth > 0) sprite.ready = true;
    if (!sprite?.ready) return false;
    const spec = sprite.spec;
    // Ground vehicles and aircraft move along their authoritative hull
    // heading. Using the older smoothed renderRotation made the sprite lag one
    // or two atlas sectors behind the actual movement, so a car could slide
    // sideways. Classic 8-direction sprites intentionally snap to the real
    // travel heading; infantry may keep the softer visual interpolation.
    const rotation = (unit.vehicle || unit.air)
      ? (unit.rotation ?? unit.renderRotation ?? 0)
      : (unit.renderRotation ?? unit.rotation ?? 0);
    const x = unit.renderX ?? unit.x;
    const y = unit.renderY ?? unit.y;
    const radius = unit.radius * (unit.stats.visualScale || 1);
    const flightAltitude = unit.air
      ? (game.getAircraftVisualAltitude137?.(unit) ?? game.getAircraftFlightAltitude119?.(unit) ?? radius * 5.2)
      : 0;
    const center = game.worldToScreen(x, y, flightAltitude);
    const exact = game.getUnitFootprintAt?.(unit, x, y, rotation);
    const atlas = spec.canvasSprite || {};
    const columns = atlas.columns || 2;
    const rows = atlas.rows || 2;
    const sourceWidth = sprite.image.naturalWidth / columns;
    const sourceHeight = sprite.image.naturalHeight / rows;
    const worldWidth = exact ? Math.max(exact.halfLength * 2, exact.halfWidth * 2) : radius * 2.85;
    const cellAspect = sourceHeight / sourceWidth;
    const displayScale = infantryDisplayScale(game, unit, worldWidth, cellAspect);
    const renderGeometry190 = game.getInfantryRenderGeometry191?.(unit, worldWidth, cellAspect, displayScale) || null;
    // Build 190 has one presentation owner. Engineers use a deliberately
    // non-uniform atlas correction so their visible body envelope is the same
    // width and height as the rocket soldier without changing their model.
    const targetWidth = renderGeometry190?.targetWidth ?? worldWidth * (game.camera.zoom || 1) * 1.34 * displayScale;
    const targetHeight = renderGeometry190?.targetHeight ?? targetWidth * cellAspect;
    const directions = Math.max(1, atlas.directions || columns * rows || 8);
    const heading = ((rotation % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const frame = Math.round(heading / (Math.PI * 2 / directions)) % directions;
    const sourceX = (frame % columns) * sourceWidth;
    const sourceY = Math.floor(frame / columns) * sourceHeight;
    const groundBaseline = Number.isFinite(atlas.groundBaseline) ? atlas.groundBaseline : .79;
    const anchorX = Number.isFinite(atlas.anchorX) ? atlas.anchorX : .5;

    ctx.save();
    ctx.drawImage(sprite.image, sourceX, sourceY, sourceWidth, sourceHeight, center.x - targetWidth * anchorX, center.y - targetHeight * groundBaseline, targetWidth, targetHeight);
    ctx.restore();

    unitFinish(
      game,
      unit,
      radius,
      rotation,
      flightAltitude + (exact?.height || radius * 1.5) * (renderGeometry190?.scaleY ?? displayScale),
      renderGeometry190?.footprintScale ?? displayScale,
    );
    return true;
  };

  const TANK_PALETTES = {
    vanguard: { armor: '#596244', light: '#7d8660', dark: '#31372a', metal: '#242824', accent: '#65d6dd' },
    dominion: { armor: '#67503a', light: '#8c6a45', dark: '#34291f', metal: '#292724', accent: '#f1a14b' },
    specter: { armor: '#303a40', light: '#465760', dark: '#171d21', metal: '#1d2327', accent: '#4e9cff' },
  };

  function drawPilotTank(game, unit, family, lod) {
    const palette = TANK_PALETTES[family];
    const x = unit.renderX ?? unit.x;
    const y = unit.renderY ?? unit.y;
    const rotation = unit.renderRotation ?? unit.rotation ?? 0;
    const turretRotation = Number.isFinite(unit.weaponRotation) ? unit.weaponRotation : rotation;
    const radius = unit.radius * (unit.stats.visualScale || 1);
    const heavy = family === 'dominion';
    const stealth = family === 'specter';
    const length = radius * (heavy ? 2.82 : stealth ? 2.72 : 2.66);
    const width = radius * (heavy ? 1.90 : stealth ? 1.96 : 1.72);
    const height = radius * (heavy ? 0.70 : stealth ? 0.47 : 0.58);
    const local = (along, across, z = 0) => localPoint(x, y, rotation, along, across, z);

    game.groundEllipse3D(x + 4, y + 6, length * 0.55, width * 0.54, rotation, 'rgba(0,0,0,.34)');

    if (stealth) {
      for (const along of [-length * 0.29, length * 0.29]) {
        for (const across of [-width * 0.40, width * 0.40]) {
          const pod = local(along, across);
          game.prism3D(pod.x, pod.y, radius * 0.12, length * 0.40, width * 0.23, radius * 0.40, rotation, { base: palette.dark, top: palette.light });
        }
      }
    } else {
      for (const side of [-1, 1]) {
        const track = local(0, side * width * 0.39);
        game.prism3D(track.x, track.y, radius * 0.08, length * 0.96, width * 0.19, radius * (heavy ? 0.52 : 0.44), rotation, { base: '#171a18', top: '#3b4039' });
        if (lod === 0) {
          for (let index = 0; index < (heavy ? 6 : 5); index += 1) {
            const along = -length * 0.35 + index * length * 0.70 / (heavy ? 5 : 4);
            screenDot(game, local(along, side * width * 0.50, radius * 0.30), Math.max(2, radius * game.camera.zoom * 0.18), '#242824', '#777b6f');
          }
        }
      }
    }

    game.prism3D(x, y, radius * 0.18, length * 0.91, width * 0.75, height, rotation, { base: palette.dark, top: palette.armor });
    const glacis = local(length * 0.27, 0);
    game.prism3D(glacis.x, glacis.y, radius * (stealth ? 0.48 : 0.58), length * 0.34, width * 0.68, radius * (stealth ? 0.14 : 0.20), rotation, { base: palette.armor, top: palette.light });

    if (family === 'vanguard') {
      for (const side of [-1, 1]) {
        const skirt = local(-length * 0.02, side * width * 0.39);
        game.prism3D(skirt.x, skirt.y, radius * 0.34, length * 0.70, width * 0.10, radius * 0.28, rotation, { base: palette.dark, top: palette.light });
      }
      if (lod <= 1) {
        for (const side of [-1, 1]) for (let index = 0; index < (lod === 0 ? 3 : 2); index += 1) {
          const plate = local(radius * (0.26 - index * 0.30), side * width * 0.34);
          game.prism3D(plate.x, plate.y, radius * 0.86, radius * 0.28, radius * 0.17, radius * 0.14, turretRotation, { base: palette.armor, top: palette.light });
        }
      }
    } else if (family === 'dominion') {
      for (const side of [-1, 1]) {
        const skirt = local(-length * 0.02, side * width * 0.42);
        game.prism3D(skirt.x, skirt.y, radius * 0.34, length * 0.84, width * 0.12, radius * 0.38, rotation, { base: palette.dark, top: palette.armor });
      }
      if (lod <= 1) {
        for (const side of [-1, 1]) {
          const exhaust = local(-length * 0.34, side * width * 0.22);
          game.cylinder3D(exhaust.x, exhaust.y, radius * 0.62, radius * 0.12, radius * 0.56, palette.metal, lod === 0 ? 10 : 7);
        }
      }
    } else if (lod <= 1) {
      for (const side of [-1, 1]) {
        const sensor = local(length * 0.20, side * width * 0.32, radius * 0.80);
        screenDot(game, sensor, Math.max(1.5, radius * game.camera.zoom * 0.11), palette.accent, rgba(palette.accent, 0.5));
      }
    }

    const turretCenter = local(stealth ? radius * 0.08 : -radius * 0.02, 0);
    game.prism3D(
      turretCenter.x,
      turretCenter.y,
      radius * (stealth ? 0.67 : 0.74),
      radius * (heavy ? 1.55 : stealth ? 1.34 : 1.42),
      radius * (heavy ? 1.22 : stealth ? 1.34 : 1.14),
      radius * (heavy ? 0.66 : stealth ? 0.34 : 0.50),
      turretRotation,
      { base: palette.dark, top: palette.armor },
    );

    const recoil = clamp(1 - (game.time - (unit.lastShotAt || -999)) / 0.14, 0, 1) * radius * 0.13;
    const muzzleStart = localPoint(turretCenter.x, turretCenter.y, turretRotation, radius * 0.28 - recoil, 0, radius * (heavy ? 1.12 : stealth ? 0.88 : 1.02));
    const muzzleEnd = localPoint(turretCenter.x, turretCenter.y, turretRotation, radius * (heavy ? 2.58 : stealth ? 2.42 : 2.50) - recoil, 0, muzzleStart.z);
    game.line3D(muzzleStart, muzzleEnd, palette.metal, Math.max(3, radius * game.camera.zoom * (heavy ? 0.18 : 0.14)));
    if (heavy && lod <= 1) {
      const sleeveEnd = localPoint(turretCenter.x, turretCenter.y, turretRotation, radius * 0.92 - recoil, 0, muzzleStart.z);
      game.line3D(muzzleStart, sleeveEnd, shade(palette.metal, 0.20), Math.max(5, radius * game.camera.zoom * 0.27));
    }

    if (lod === 0) {
      const hatch = localPoint(turretCenter.x, turretCenter.y, turretRotation, -radius * 0.20, radius * 0.18, radius * (heavy ? 1.42 : stealth ? 1.02 : 1.28));
      game.cylinder3D(hatch.x, hatch.y, hatch.z, radius * 0.14, radius * 0.08, palette.light, 9);
      const aerial = localPoint(turretCenter.x, turretCenter.y, turretRotation, -radius * 0.43, -radius * 0.33, radius * 1.13);
      game.line3D(aerial, { ...aerial, z: aerial.z + radius * 0.74 }, rgba(palette.accent, 0.72), Math.max(0.8, game.camera.zoom));
    }

    unitFinish(game, unit, radius, rotation, radius * (heavy ? 1.72 : 1.46));
  }

  function drawOplotSquad(game, unit, lod) {
    const x = unit.renderX ?? unit.x;
    const y = unit.renderY ?? unit.y;
    const rotation = unit.renderRotation ?? unit.rotation ?? 0;
    const radius = unit.radius * (unit.stats.visualScale || 1);
    const displayTeam = game.displayedTeamForUnit?.(unit, 'player') || unit.team;
    const disguised = displayTeam !== unit.team;
    const armor = disguised ? '#66716a' : '#596244';
    const light = disguised ? '#859087' : '#7d8660';
    const accent = disguised ? game.teamColor(displayTeam) : '#65d6dd';
    const phase = unit.walkCycle || 0;
    const moving = clamp((unit.visualSpeed || 0) / Math.max(1, unit.stats.speed), 0, 1);
    const formation = lod === 2 ? [[0.02, 0], [-0.34, -0.34], [-0.34, 0.34]] : [[0.26, 0], [-0.28, -0.45], [-0.28, 0.45]];

    game.groundEllipse3D(x + 2, y + 4, radius * 1.24, radius * 0.86, rotation, 'rgba(0,0,0,.24)');
    for (let index = formation.length - 1; index >= 0; index -= 1) {
      const [alongFactor, acrossFactor] = formation[index];
      const center = localPoint(x, y, rotation, radius * alongFactor, radius * acrossFactor);
      const gait = Math.sin(phase * 4 + index * 2.15) * moving;
      const height = radius * (lod === 2 ? 1.10 : 1.22);
      const hips = { x: center.x, y: center.y, z: height * 0.43 };
      const chest = localPoint(center.x, center.y, rotation, 0, 0, height * 0.72);
      const head = localPoint(center.x, center.y, rotation, radius * 0.025, 0, height * 0.99);
      const footA = localPoint(center.x, center.y, rotation, radius * (0.13 + gait * 0.13), radius * 0.14, 0);
      const footB = localPoint(center.x, center.y, rotation, radius * (-0.13 - gait * 0.13), -radius * 0.14, 0);
      game.line3D(hips, footA, '#2b3028', Math.max(1.7, radius * game.camera.zoom * 0.16));
      game.line3D(hips, footB, '#2b3028', Math.max(1.7, radius * game.camera.zoom * 0.16));
      game.prism3D(chest.x, chest.y, height * 0.47, radius * 0.48, radius * 0.36, height * 0.34, rotation, { base: shade(armor, -0.16), top: index === 0 ? light : armor });
      game.line3D(hips, chest, armor, Math.max(2.2, radius * game.camera.zoom * 0.22));
      game.cylinder3D(head.x, head.y, height * 0.88, radius * 0.15, height * 0.18, light, lod === 0 ? 9 : 6);
      const visor = localPoint(head.x, head.y, rotation, radius * 0.13, 0, height * 0.99);
      screenDot(game, visor, Math.max(1, game.camera.zoom * 1.05), accent);
      const shoulder = localPoint(chest.x, chest.y, rotation, radius * 0.06, -radius * 0.20, height * 0.72);
      const hand = localPoint(chest.x, chest.y, rotation, radius * 0.30, radius * 0.08, height * 0.64);
      const muzzle = localPoint(chest.x, chest.y, rotation, radius * (lod === 2 ? 0.60 : 0.76), radius * 0.08, height * 0.67);
      game.line3D(shoulder, hand, light, Math.max(1.5, radius * game.camera.zoom * 0.14));
      game.line3D(hand, muzzle, '#202522', Math.max(1.6, radius * game.camera.zoom * 0.15));
      if (lod === 0 && index === 0) {
        const pack = localPoint(chest.x, chest.y, rotation, -radius * 0.24, 0, height * 0.62);
        game.prism3D(pack.x, pack.y, height * 0.47, radius * 0.25, radius * 0.34, height * 0.29, rotation, { base: '#343b2f', top: armor });
      }
    }
    unitFinish(game, unit, radius, rotation, radius * 1.48, 1.20);
  }

  function drawPowerStation(game, building, lod) {
    const radius = building.radius * (building.stats.visualScale || 1);
    const rotation = Number.isFinite(building.rotation) ? building.rotation : 0;
    const progress = building.completed ? 1 : clamp(building.construction, 0.05, 1);
    const local = (along, across, z = 0) => localPoint(building.x, building.y, rotation, along, across, z);
    const concrete = '#737b78';
    const metal = '#434b49';
    const accent = '#e2b66c';
    const footprintLength = radius * 2.72;
    const footprintDepth = radius * 1.82;

    game.groundEllipse3D(building.x + 7, building.y + 9, footprintLength * 0.53, footprintDepth * 0.55, rotation, 'rgba(0,0,0,.27)');
    game.prism3D(building.x, building.y, 0, footprintLength, footprintDepth, radius * 0.12, rotation, { base: '#4d5350', top: '#666d69' });

    const hall = local(-radius * 0.52, 0);
    game.prism3D(hall.x, hall.y, radius * 0.12, radius * 1.18, radius * 0.82, radius * 0.68 * progress, rotation, { base: '#4c5554', top: '#7b8581' });
    const roof = local(-radius * 0.52, 0);
    game.prism3D(roof.x, roof.y, radius * (0.12 + 0.68 * progress), radius * 1.08, radius * 0.72, radius * 0.12 * progress, rotation, { base: metal, top: '#929b97' });
    if (lod <= 1) {
      for (let bay = -1; bay <= 1; bay += 1) {
        verticalPanel(game, building.x, building.y, rotation, -radius * (0.83 - bay * 0.30), -radius * 0.42, radius * 0.18, radius * 0.22, radius * 0.58 * progress, '#263536', rgba('#8fcad3', 0.55));
      }
      const pipeA = local(-radius * 0.02, -radius * 0.40, radius * 0.36);
      const pipeB = local(radius * 0.40, -radius * 0.48, radius * 0.62 * progress);
      game.line3D(pipeA, pipeB, '#afb5ad', Math.max(2.4, game.camera.zoom * 3));
    }

    const towerCenters = [local(radius * 0.43, -radius * 0.48), local(radius * 0.43, radius * 0.48)];
    for (let index = 0; index < towerCenters.length; index += 1) {
      const tower = towerCenters[index];
      const lowerHeight = radius * 0.58 * progress;
      const upperHeight = radius * 0.48 * progress;
      frustum3D(game, tower.x, tower.y, radius * 0.12, radius * 0.31, radius * 0.205, lowerHeight, concrete, lod === 0 ? 14 : lod === 1 ? 10 : 7);
      frustum3D(game, tower.x, tower.y, radius * 0.12 + lowerHeight, radius * 0.205, radius * 0.285, upperHeight, shade(concrete, 0.03), lod === 0 ? 14 : lod === 1 ? 10 : 7);
      const towerTop = radius * 0.12 + lowerHeight + upperHeight;
      game.groundEllipse3D(tower.x, tower.y, radius * 0.255, radius * 0.255, 0, '#303735', '#9ba19c', Math.max(0.8, game.camera.zoom), towerTop, lod === 0 ? 18 : 10);
      if (building.completed && lod <= 1) {
        for (let puff = 0; puff < (lod === 0 ? 3 : 2); puff += 1) {
          const phase = (game.time * 0.13 + index * 0.37 + puff * 0.29) % 1;
          const drift = Math.sin(game.time * 0.45 + index + puff) * radius * 0.07 * phase;
          const screen = game.worldToScreen(tower.x + drift, tower.y - drift * 0.45, towerTop + radius * (0.10 + phase * 0.58));
          const size = Math.max(2, radius * game.camera.zoom * (0.07 + phase * 0.10));
          ctx.fillStyle = `rgba(219,229,224,${(1 - phase) * 0.16})`;
          ctx.beginPath();
          ctx.arc(screen.x, screen.y, size, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    const yard = local(radius * 0.95, 0);
    game.prism3D(yard.x, yard.y, radius * 0.12, radius * 0.52, radius * 0.84, radius * 0.08, rotation, { base: '#555b57', top: '#6c736e' });
    const transformerCount = lod === 0 ? 3 : lod === 1 ? 2 : 1;
    for (let index = 0; index < transformerCount; index += 1) {
      const transformer = local(radius * 0.95, radius * (-0.28 + index * (transformerCount === 1 ? 0 : 0.28)), radius * 0.20);
      game.cylinder3D(transformer.x, transformer.y, transformer.z, radius * 0.10, radius * 0.34 * progress, '#747b72', lod === 0 ? 10 : 7);
    }
    if (lod <= 1) {
      for (const across of [-radius * 0.36, radius * 0.36]) {
        const mast = local(radius * 1.17, across, radius * 0.18);
        game.line3D(mast, { ...mast, z: radius * 0.94 * progress }, '#9ba19a', Math.max(1.2, game.camera.zoom * 1.4));
      }
      lineLocal(game, building.x, building.y, rotation, radius * 1.17, -radius * 0.36, radius * 0.82 * progress, radius * 1.17, radius * 0.36, radius * 0.82 * progress, accent, Math.max(1.2, game.camera.zoom * 1.6));
    }

    buildingFinish(game, building, radius, radius * 1.44, footprintLength, footprintDepth, rotation);
  }

  function drawAirfield(game, building, lod) {
    const radius = building.radius * (building.stats.visualScale || 1);
    const rotation = Number.isFinite(building.rotation) ? building.rotation : 0;
    const progress = building.completed ? 1 : clamp(building.construction, 0.05, 1);
    const local = (along, across, z = 0) => localPoint(building.x, building.y, rotation, along, across, z);
    const footprintLength = radius * 3.02;
    const footprintDepth = radius * 1.74;
    const runwayAcross = -radius * 0.43;

    game.groundEllipse3D(building.x + 8, building.y + 10, footprintLength * 0.54, footprintDepth * 0.56, rotation, 'rgba(0,0,0,.25)');
    game.prism3D(building.x, building.y, 0, footprintLength, footprintDepth, radius * 0.08, rotation, { base: '#414643', top: '#5f6661' });
    const runway = local(0, runwayAcross);
    game.prism3D(runway.x, runway.y, radius * 0.08, radius * 2.88, radius * 0.54, radius * 0.08, rotation, { base: '#252a28', top: '#3f4541' });
    const taxiway = local(-radius * 0.12, radius * 0.02);
    game.prism3D(taxiway.x, taxiway.y, radius * 0.085, radius * 2.15, radius * 0.22, radius * 0.045, rotation, { base: '#5d625d', top: '#777c75' });

    const markings = lod === 0 ? 7 : lod === 1 ? 4 : 2;
    for (let index = 0; index < markings; index += 1) {
      const along = -radius * 1.12 + index * radius * 2.24 / Math.max(1, markings - 1);
      lineLocal(game, building.x, building.y, rotation, along - radius * 0.08, runwayAcross, radius * 0.175, along + radius * 0.08, runwayAcross, radius * 0.175, '#e7e1c8', Math.max(1.2, game.camera.zoom * 1.6));
    }
    for (const edge of [-radius * 0.23, radius * 0.23]) {
      lineLocal(game, building.x, building.y, rotation, -radius * 1.38, runwayAcross + edge, radius * 0.17, radius * 1.38, runwayAcross + edge, radius * 0.17, '#b9b9aa', Math.max(0.8, game.camera.zoom));
    }

    const hangars = [
      { along: -radius * 0.69, across: radius * 0.43 },
      { along: radius * 0.12, across: radius * 0.43 },
    ];
    for (const [index, hangar] of hangars.entries()) {
      const center = local(hangar.along, hangar.across);
      game.prism3D(center.x, center.y, radius * 0.10, radius * 0.70, radius * 0.50, radius * 0.42 * progress, rotation, { base: index ? '#4e5856' : '#45504e', top: '#7a8581' });
      const roof = local(hangar.along, hangar.across);
      game.prism3D(roof.x, roof.y, radius * (0.10 + 0.42 * progress), radius * 0.74, radius * 0.54, radius * 0.12 * progress, rotation, { base: '#5e6764', top: '#969e99' });
      verticalPanel(game, building.x, building.y, rotation, hangar.along, hangar.across - radius * 0.255, radius * 0.58, radius * 0.11, radius * (0.47 * progress), '#283231', '#7c8b87');
      if (lod === 0) {
        for (const offset of [-0.17, 0, 0.17]) {
          lineLocal(game, building.x, building.y, rotation, hangar.along + radius * offset, hangar.across - radius * 0.258, radius * 0.14, hangar.along + radius * offset, hangar.across - radius * 0.258, radius * 0.43 * progress, '#65716e', Math.max(0.8, game.camera.zoom));
        }
      }
    }

    const tower = local(radius * 1.02, radius * 0.46);
    game.prism3D(tower.x, tower.y, radius * 0.10, radius * 0.28, radius * 0.27, radius * 0.78 * progress, rotation, { base: '#495452', top: '#818c88' });
    game.prism3D(tower.x, tower.y, radius * (0.10 + 0.69 * progress), radius * 0.36, radius * 0.34, radius * 0.18 * progress, rotation, { base: '#253233', top: '#6f8b8c' });
    if (building.completed) {
      const mast = { x: tower.x, y: tower.y, z: radius * 1.02 };
      game.line3D(mast, { ...mast, z: radius * 1.31 }, '#9ba5a1', Math.max(1, game.camera.zoom * 1.2));
      const radarRotation = rotation + game.time * 0.72;
      const radarA = localPoint(tower.x, tower.y, radarRotation, -radius * 0.19, 0, radius * 1.23);
      const radarB = localPoint(tower.x, tower.y, radarRotation, radius * 0.19, 0, radius * 1.23);
      game.line3D(radarA, radarB, '#8fd7de', Math.max(1.4, game.camera.zoom * 1.7));
    }

    if (lod <= 1) {
      const padCount = lod === 0 ? 6 : 3;
      for (let index = 0; index < padCount; index += 1) {
        const along = -radius * 1.02 + index * radius * 2.04 / Math.max(1, padCount - 1);
        const pad = local(along, radius * 0.05);
        game.groundEllipse3D(pad.x, pad.y, radius * 0.17, radius * 0.10, rotation, 'rgba(59,68,65,.85)', '#99a39d', Math.max(0.7, game.camera.zoom * 0.7), radius * 0.14, 12);
      }
      const lightCount = lod === 0 ? 8 : 4;
      for (let index = 0; index < lightCount; index += 1) {
        const along = -radius * 1.30 + index * radius * 2.60 / Math.max(1, lightCount - 1);
        for (const side of [-1, 1]) {
          const light = local(along, runwayAcross + side * radius * 0.26, radius * 0.19);
          screenDot(game, light, Math.max(1, game.camera.zoom * 0.95), index % 2 ? '#e5b964' : '#75d5df');
        }
      }
    }

    buildingFinish(game, building, radius, radius * 1.46, footprintLength, footprintDepth, rotation);
  }

  for (const [typeId, stats] of Object.entries(debug.UNIT_TYPES || {})) {
    const model = MODEL_DEFINITIONS.find((entry) => entry.kind === 'unit' && entry.test?.(typeId));
    if (model && stats) Object.assign(stats, { modelCode: model.code, modelManifest: MANIFEST_URL, modelLods: 3 });
  }
  const baseDrawUnit = GameClass.prototype.drawUnit3D;
  GameClass.prototype.drawUnit3D = function(unit) {
    const model = modelFor(unit);
    if (!model) return baseDrawUnit.call(this, unit);
    const lod = modelLod(this, unit);
    if (lod === 3) return baseDrawUnit.call(this, unit);
    if (drawHeroUnitSprite(this, unit, model.code)) return;
    if (model.code === 'V-U01') return drawOplotSquad(this, unit, lod);
    if (model.code === 'V-U13') return drawPilotTank(this, unit, 'vanguard', lod);
    if (model.code === 'D-U13') return drawPilotTank(this, unit, 'dominion', lod);
    return drawPilotTank(this, unit, 'specter', lod);
  };

  const drawCatalogBuildingPlaceholder190 = (game, building, model) => {
    const radius = building.radius * (building.stats?.visualScale || 1);
    const rotation = Number.isFinite(building.rotation) ? building.rotation : 0;
    const progress = building.completed ? 1 : clamp(building.construction, 0.05, 1);
    const exact = game.getEntityBuildingFootprintAt?.(building, 0) || null;
    const length = Math.max(28, (exact?.halfLength || radius * 1.45) * 2);
    const depth = Math.max(24, (exact?.halfWidth || radius) * 2);
    const bounds = model?.spec?.boundsMeters || building.stats?.modelBoundsMeters || [1, 1, 1];
    const heightRatio = Math.max(0.45, Math.min(1.35, Number(bounds[2] || 1) / Math.max(1, Number(bounds[0] || 1)) * 1.75));
    const height = Math.max(radius * 0.55, radius * heightRatio * (0.72 + progress * 0.28));
    const palette = game.getVisualPalette?.(building.team) || { armor: '#65746d', light: '#91a59b', dark: '#26302c' };
    game.prism3D?.(
      building.x,
      building.y,
      0,
      length,
      depth,
      height,
      rotation,
      { base: palette.dark || '#26302c', top: palette.armor || '#65746d' },
    );
    if (exact?.corners?.length === 4) {
      game.screenPolygon?.(
        exact.corners.map(point => game.worldToScreen(point.x, point.y, 0.03)),
        'rgba(115,150,132,.16)',
        game.teamColor?.(building.team) || '#9ee6bb',
        2,
      );
    }
    const top = game.worldToScreen(building.x, building.y, height);
    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#dcebe4';
    ctx.font = `800 ${Math.max(9, 10 * (game.camera?.zoom || 1))}px system-ui`;
    ctx.fillText(`${model?.name || building.stats?.name || building.typeId} · ${Math.round(progress * 100)}%`, top.x, top.y - 7);
    ctx.restore();
    buildingFinish(game, building, radius, height, length, depth, rotation);
    return true;
  };

  const baseDrawBuilding = GameClass.prototype.drawBuilding3D;
  GameClass.prototype.drawBuilding3D = function(building) {
    const model = modelFor(building);
    if (!model) return baseDrawBuilding.call(this, building);
    const lod = Math.min(2, modelLod(this, building));
    if (drawHeroBuildingSprite(this, building, model.code)) return;
    if (model.code === 'B-02') return drawPowerStation(this, building, lod);
    if (model.code === 'B-19') return drawAirfield(this, building, lod);
    // Never substitute an unrelated generic building while a catalog atlas is
    // decoding or unavailable. The full measured footprint remains visible.
    return drawCatalogBuildingPlaceholder190(this, building, model);
  };

  const baseRenderSelection = GameClass.prototype.renderSelectionUI;
  GameClass.prototype.renderSelectionUI = function(...args) {
    const result = baseRenderSelection.apply(this, args);
    const details = document.getElementById('selection-details');
    details?.querySelector('[data-model-pilot101]')?.remove();
    const primary = this.selected?.length === 1 ? this.selected[0] : null;
    const model = modelFor(primary);
    if (details && model) {
      const lod = Math.min(2, modelLod(this, primary));
      details.insertAdjacentHTML('beforeend', `<div data-model-pilot101><div class="stat-line"><span>Визуальная модель</span><strong>${model.code} · изометрия</strong></div><div class="stat-line"><span>Игровой ассет</span><strong>${model.kind === 'building' ? '1 статичный ракурс' : '8 направлений движения'}</strong></div></div>`);
    }
    return result;
  };

  let manifest = null;
  const ready = fetch(MANIFEST_URL, { cache: 'no-cache' })
    .then((response) => {
      if (!response.ok) throw new Error(`Model manifest HTTP ${response.status}`);
      return response.json();
    })
    .then((value) => {
      manifest = value;
      for (const spec of value.models || []) {
        const model = { code: spec.code, name: spec.name, kind: spec.type, exact: new Set(spec.gameTypeIds || []), spec };
        if (spec.type === 'building') for (const typeId of spec.gameTypeIds || []) {
          buildingModels.set(typeId, model);
          const stats = debug.BUILDING_TYPES?.[typeId];
          if (stats) Object.assign(stats, {
            modelCode: spec.code,
            modelManifest: MANIFEST_URL,
            modelLods: spec.lods?.length || 3,
            modelBoundsMeters: Array.isArray(spec.boundsMeters) ? [...spec.boundsMeters] : null,
            modelPlacementFootprintMeters: spec.placementFootprintMeters ? { ...spec.placementFootprintMeters } : null,
            modelCollisionFootprintMeters: spec.collisionFootprintMeters ? { ...spec.collisionFootprintMeters } : null,
            modelWorldWidthFactor: spec.canvasSprite?.worldWidthFactor || 3.2,
          });
        }
        if (spec.type === 'unit') for (const typeId of spec.gameTypeIds || []) {
          unitModels.set(typeId, model);
          const stats = debug.UNIT_TYPES?.[typeId];
          if (stats) Object.assign(stats, {
            modelCode: spec.code,
            modelManifest: MANIFEST_URL,
            modelLods: spec.lods?.length || 3,
            modelBoundsMeters: Array.isArray(spec.boundsMeters) ? [...spec.boundsMeters] : null,
            modelCollisionFootprintMeters: spec.collisionFootprintMeters ? { ...spec.collisionFootprintMeters } : null,
            modelUnitScale: spec.unitScale ? { ...spec.unitScale } : null,
            modelCollision: spec.collision || null,
          });
        }
        if (spec.canvasSprite?.uri) {
          // Both buildings and units load on first visibility. Eagerly decoding
          // every catalog atlas consumed hundreds of megabytes before a match.
          canvasSprites[spec.code] = { image: null, uri: `${spec.canvasSprite.uri}?build=190`, ready: false, spec };
          if (['B-11', 'B-12', 'B-50', 'B-51', 'B-52', 'B-53'].includes(spec.code)) {
            queueMicrotask(() => {
              const asset = ensureCanvasSprite(spec.code);
              asset?.image?.decode?.().catch(() => {});
            });
          }
        }
      }
      return value;
    })
    .catch((error) => {
      console.warn('[Frontline Dominion] model pilot manifest unavailable', error);
      return null;
    });

  const createShowcase = (clean = false) => {
    const game = debug.game;
    const UnitClass = debug.Unit;
    const BuildingClass = debug.Building;
    if (!game || !UnitClass || !BuildingClass) return false;
    const center = game.playerBase || { x: game.camera.x, y: game.camera.y };
    if (clean) {
      for (const entity of [...game.units, ...game.buildings]) {
        if (entity.team === 'player') entity.alive = false;
      }
      game.cleanupDeadObjects?.();
    }
    const showcase = [
      new BuildingClass(game, { typeId: 'power', team: 'player', x: center.x - 260, y: center.y - 330, rotation: 0, construction: 1 }),
      new BuildingClass(game, { typeId: 'airfield', team: 'player', x: center.x + 300, y: center.y - 330, rotation: 0, construction: 1 }),
      new UnitClass(game, { typeId: 'v_mbt', team: 'player', x: center.x - 300, y: center.y + 180, rotation: -0.12 }),
      new UnitClass(game, { typeId: 'd_mbt', team: 'player', x: center.x, y: center.y + 180, rotation: -0.12 }),
      new UnitClass(game, { typeId: 's_mbt', team: 'player', x: center.x + 300, y: center.y + 180, rotation: -0.12 }),
      new UnitClass(game, { typeId: 'v_line', team: 'player', x: center.x, y: center.y + 410, rotation: -Math.PI / 2 }),
      new UnitClass(game, { typeId: 'worker', team: 'player', x: center.x - 150, y: center.y + 410, rotation: -Math.PI / 2 }),
    ];
    for (const entity of showcase) {
      entity.modelPilotShowcase101 = true;
      game.addEntity(entity);
    }
    game.centerCamera?.(center.x, center.y + 30);
    if (game.camera) game.camera.zoom = Math.max(game.camera.zoom || 1, 1.02);
    game.recalculatePower?.();
    game.uiDirty = true;
    return true;
  };

  const createBuildingShowcase = (page = 0, clean = true) => {
    const game = debug.game;
    const BuildingClass = debug.Building;
    if (!game || !BuildingClass || buildingModels.size < 53) return false;
    const center = game.playerBase || { x: game.camera.x, y: game.camera.y };
    if (clean) {
      for (const entity of [...game.units, ...game.buildings]) if (entity.team === 'player') entity.alive = false;
      game.cleanupDeadObjects?.();
    }
    const allTypeIds = [...buildingModels.entries()].sort((left, right) => left[1].code.localeCompare(right[1].code)).map(([typeId]) => typeId);
    const slice = allTypeIds.slice(Math.max(0, page) * 12, Math.max(0, page) * 12 + 12);
    if (!slice.length) return false;
    for (const [index, typeId] of slice.entries()) {
      const column = index % 4;
      const row = Math.floor(index / 4);
      const entity = new BuildingClass(game, {
        typeId,
        team: 'player',
        x: center.x - 540 + column * 360,
        y: center.y - 420 + row * 390,
        rotation: 0,
        construction: 1,
      });
      entity.modelPilotShowcase101 = true;
      game.addEntity(entity);
    }
    game.centerCamera?.(center.x, center.y - 20);
    if (game.camera) game.camera.zoom = 0.70;
    game.recalculatePower?.();
    game.uiDirty = true;
    return true;
  };

  window.__FD_MODEL_PILOT__ = {
    version: VERSION,
    manifestUrl: MANIFEST_URL,
    ready,
    get manifest() { return manifest; },
    get codes() {
      if (manifest?.models?.length) return manifest.models.map((model) => model.code);
      return [...new Set(
        [...buildingModels.values(), ...unitModels.values()].map((model) => model.code)
          .concat(MODEL_DEFINITIONS.map((model) => model.code)),
      )];
    },
    modelForType(typeId, kind = 'unit') {
      if (kind === 'building') return buildingModels.get(typeId)?.code || null;
      return unitModels.get(typeId)?.code || MODEL_DEFINITIONS.find((model) => model.kind === kind && (model.exact?.has(typeId) || model.test?.(typeId)))?.code || null;
    },
    createShowcase,
    createBuildingShowcase,
    canvasSprites,
  };

  if (typeof URLSearchParams !== 'undefined' && new URLSearchParams(window.location.search).get('modelShowcase') === '1') {
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      if (createShowcase(true) || attempts > 240) window.clearInterval(timer);
    }, 100);
  }

  if (typeof URLSearchParams !== 'undefined' && new URLSearchParams(window.location.search).get('buildingShowcase') === '1') {
    const params = new URLSearchParams(window.location.search);
    const page = Math.max(0, Number(params.get('buildingPage')) || 0);
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      if (createBuildingShowcase(page, true) || attempts > 300) window.clearInterval(timer);
    }, 100);
  }

  void 0;
  const eyebrow = document.querySelector('#start-screen .eyebrow');
  if (eyebrow) void 0;
  const lead = document.querySelector('#start-screen .lead');
  if (lead) void 0;
  const strip = document.querySelector('#start-screen .feature-strip');
  if (strip && !strip.querySelector('[data-model-pilot101]')) {
    void 0;
  }
})();
