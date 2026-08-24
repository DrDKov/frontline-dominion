(() => {
  'use strict';

  const debug = window.__FD_DEBUG__;
  const Game = debug?.Game;
  const canvas = document.getElementById('game-canvas');
  const context = canvas?.getContext('2d');
  if (!Game || !canvas || !context) return;

  const VERSION = '12.4';
  const FIXED_YAW = -Math.PI / 4;
  const FIXED_PITCH = 0.58;
  const DEPTH_BUCKETS = 256;
  const KIND_DECO = 0;
  const KIND_RESOURCE = 1;
  const KIND_BUILDING = 2;
  const KIND_UNIT = 3;

  const lockCamera123 = (game) => {
    if (!game?.camera) return;
    game.camera.yaw = FIXED_YAW;
    game.camera.pitch = FIXED_PITCH;
    game.cameraShake = 0;
  };

  const baseUpdateCamera123 = Game.prototype.updateCamera;
  Game.prototype.updateCamera = function(dt) {
    lockCamera123(this);
    const result = baseUpdateCamera123.call(this, dt);
    lockCamera123(this);
    return result;
  };

  const baseAdjustCamera123 = Game.prototype.adjustCamera;
  Game.prototype.adjustCamera = function(action) {
    if (action === 'zoom-in' || action === 'zoom-out') baseAdjustCamera123.call(this, action);
    else if (action === 'reset') this.camera.zoom = 1.08;
    lockCamera123(this);
    this.clampCamera?.();
    this.updateCameraReadout?.();
  };

  Game.prototype.updateCameraReadout = function() {
    const readout = document.getElementById('camera-readout');
    if (!readout) return;
    const text = `Фиксированная изометрия · ×${(this.camera?.zoom || 1).toFixed(2)}`;
    if (readout.textContent !== text) readout.textContent = text;
  };

  const baseAddEntity123 = Game.prototype.addEntity;
  Game.prototype.addEntity = function(entity) {
    if (entity?.kind === 'building') entity.rotation = 0;
    return baseAddEntity123.call(this, entity);
  };

  const basePlaceBuilding123 = Game.prototype.placeBuilding;
  Game.prototype.placeBuilding = function(x, y, append = false) {
    if (this.buildMode) this.buildMode.rotation = 0;
    if (this.input?.buildPlacementDrag) this.input.buildPlacementDrag.rotation = 0;
    return basePlaceBuilding123.call(this, x, y, append, 0);
  };

  const baseBuildGhost123 = Game.prototype.drawBuildGhost3D;
  Game.prototype.drawBuildGhost3D = function(...args) {
    if (this.buildMode) this.buildMode.rotation = 0;
    if (this.input?.buildPlacementDrag) this.input.buildPlacementDrag.rotation = 0;
    return baseBuildGhost123.apply(this, args);
  };

  const bucketsFor123 = (game) => {
    if (game._spriteDepthBuckets123) return game._spriteDepthBuckets123;
    game._spriteDepthBuckets123 = {
      ground: Array.from({ length: DEPTH_BUCKETS }, () => []),
      air: Array.from({ length: DEPTH_BUCKETS }, () => []),
    };
    return game._spriteDepthBuckets123;
  };

  const bucketIndex123 = (game, depth) => {
    const span = game.viewport.height + 1024;
    return Math.max(0, Math.min(DEPTH_BUCKETS - 1, Math.floor((depth + 512) / span * DEPTH_BUCKETS)));
  };

  const pushDepth123 = (buckets, index, kind, entity) => {
    const bucket = buckets[index];
    bucket.push(kind, entity);
  };

  const drawDepthBuckets123 = (game, buckets) => {
    for (const bucket of buckets) {
      for (let index = 0; index < bucket.length; index += 2) {
        const kind = bucket[index];
        const entity = bucket[index + 1];
        if (kind === KIND_DECO) game.drawDecoration3D(entity);
        else if (kind === KIND_RESOURCE) game.drawResource3D(entity);
        else if (kind === KIND_BUILDING) game.drawBuilding3D(entity);
        else game.drawUnit3D(entity);
      }
    }
  };

  // Old mass RTS games use a painter grid rather than allocate and comparison-
  // sort an object for every visible soldier every frame. Quantising depth to
  // 256 screen layers is visually indistinguishable at this camera angle.
  Game.prototype.drawWorldObjects3D = function() {
    const layers = bucketsFor123(this);
    for (let index = 0; index < DEPTH_BUCKETS; index += 1) {
      layers.ground[index].length = 0;
      layers.air[index].length = 0;
    }

    for (const deco of this.decorations) {
      if (!this.isExploredAt(deco.x, deco.y) || !this.isOnScreen(deco.x, deco.y, 120)) continue;
      const depth = this.worldToScreen(deco.x, deco.y).y - 10;
      pushDepth123(layers.ground, bucketIndex123(this, depth), KIND_DECO, deco);
    }
    for (const node of this.resources) {
      if (!node.alive || !this.isExploredAt(node.x, node.y) || !this.isOnScreen(node.x, node.y, node.radius + 150)) continue;
      const depth = this.worldToScreen(node.x, node.y).y;
      pushDepth123(layers.ground, bucketIndex123(this, depth), KIND_RESOURCE, node);
    }
    for (const building of this.buildings) {
      if (!building.alive || !this.isOnScreen(building.x, building.y, building.radius + 180)) continue;
      if (building.team === 'enemy' && !this.isVisibleAt(building.x, building.y)) continue;
      if (building.team === 'neutral' && !this.isExploredAt(building.x, building.y)) continue;
      const depth = this.worldToScreen(building.x, building.y).y + building.radius * this.camera.zoom * .24;
      pushDepth123(layers.ground, bucketIndex123(this, depth), KIND_BUILDING, building);
    }
    for (const unit of this.units) {
      if (!unit.alive || unit.inTransport || unit.embarkedIn || !this.isOnScreen(unit.x, unit.y, unit.radius + 180)) continue;
      if (unit.team === 'enemy') {
        if (!this.isVisibleAt(unit.x, unit.y)) continue;
        const undercover = this.isUndercoverTo(unit, 'player');
        if (!undercover && !this.isTargetableBy(unit, 'player')) continue;
      }
      const x = unit.renderX ?? unit.x;
      const y = unit.renderY ?? unit.y;
      const altitude = unit.air
        ? (this.getAircraftVisualAltitude137?.(unit) ?? this.getAircraftFlightAltitude119?.(unit) ?? unit.radius * 5.2)
        : 0;
      const depth = this.worldToScreen(x, y, altitude).y;
      const target = unit.air ? layers.air : layers.ground;
      pushDepth123(target, bucketIndex123(this, depth), KIND_UNIT, unit);
    }
    drawDepthBuckets123(this, layers.ground);
    drawDepthBuckets123(this, layers.air);
  };

  const baseDrawTerrain123 = Game.prototype.drawTerrain;
  Game.prototype.drawTerrain = function() {
    lockCamera123(this);
    let cache = this._terrainSpriteCache123;
    if (!cache) {
      const layer = document.createElement('canvas');
      cache = this._terrainSpriteCache123 = { layer, context: layer.getContext('2d'), valid: false };
    }
    const sameViewport = cache.layer.width === canvas.width && cache.layer.height === canvas.height;
    const valid = cache.valid && sameViewport &&
      Math.abs(cache.x - this.camera.x) < .01 && Math.abs(cache.y - this.camera.y) < .01 &&
      Math.abs(cache.zoom - this.camera.zoom) < .0001 && cache.roads === this.roads.length && cache.seed === this.seed;
    if (valid) {
      context.save();
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.drawImage(cache.layer, 0, 0);
      context.restore();
      return;
    }

    baseDrawTerrain123.call(this);
    if (!sameViewport) {
      cache.layer.width = canvas.width;
      cache.layer.height = canvas.height;
    }
    cache.context.setTransform(1, 0, 0, 1, 0, 0);
    cache.context.clearRect(0, 0, cache.layer.width, cache.layer.height);
    cache.context.drawImage(canvas, 0, 0);
    Object.assign(cache, {
      valid: true,
      x: this.camera.x,
      y: this.camera.y,
      zoom: this.camera.zoom,
      roads: this.roads.length,
      seed: this.seed,
    });
  };

  Game.prototype.drawCameraCompass = function() {};

  const baseRender123 = Game.prototype.render;
  Game.prototype.render = function(...args) {
    lockCamera123(this);
    return baseRender123.apply(this, args);
  };

  // Middle-drag was camera orbit. In fixed-isometric mode it is deliberately
  // consumed so a player cannot create a transient mismatched projection.
  canvas.addEventListener('pointerdown', (event) => {
    if (event.button !== 1) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);

  void 0;
  window.__FD_SPRITE_SCALE__ = {
    version: VERSION,
    fixedYaw: FIXED_YAW,
    fixedPitch: FIXED_PITCH,
    directions: 8,
    buildingViews: 1,
    webgl: false,
  };
})();
