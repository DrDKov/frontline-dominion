(() => {
'use strict';
const D = window.__FD_DEBUG__;
if (!D?.Game || !D?.Unit || !D?.Building || !D?.ResourceNode || !D?.Projectile) return;

const Game = D.Game;
const Unit = D.Unit;
const BUILD = 214;
const VERSION = '16.9.8';
const SIM_HZ = 25;
const UNIT_FLOAT_STRIDE = 22;
const UNIT_INT_STRIDE = 8;
const BUILDING_FLOAT_STRIDE = 13;
const BUILDING_INT_STRIDE = 5;
const RESOURCE_FLOAT_STRIDE = 5;
const PROJECTILE_FLOAT_STRIDE = 13;
const PROJECTILE_INT_STRIDE = 6;
const TEAM_NAMES = ['neutral', 'player', 'enemy'];
const SERVICE_NAMES = ['', 'approach', 'landing', 'servicing', 'launch', 'hangar', 'ready'];
const bridges = new WeakMap();
let bridgeCounter = 1;
let requestCounter = 1;
let activeBridge = null;

const legacy = {
  simulateFixed: Game.prototype.simulateFixed,
  update: Game.prototype.update,
  save: Game.prototype.save,
  hydrate: Game.prototype.hydrate,
  buildRenderSnapshotV9: Game.prototype.buildRenderSnapshotV9,
  prepareInterpolationV9: Game.prototype.prepareInterpolationV9,
  selectAt: Game.prototype.selectAt,
  selectRect: Game.prototype.selectRect,
  hitTest: Game.prototype.hitTest,
  hitTestForContext: Game.prototype.hitTestForContext,
  unitSetCommand: Unit.prototype.setCommand,
  unitStop: Unit.prototype.stop
};

/* Preserve v16.2/v16.3 projectile state from a loaded save until the Worker takes ownership. */
Game.prototype.hydrate = function(data) {
  this._fdLoadedAuthoritative172 = data?.authoritative172 || null;
  this._fdLoadedMultiplayerSnapshot206 = data?.__mp ? data : null;
  return legacy.hydrate.call(this, data);
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const idNumber = id => {
  const value = Number.parseInt(String(id || '').replace(/^\D+/, ''), 10);
  return Number.isFinite(value) ? value >>> 0 : 0;
};
const entityId = number => number ? `e${number >>> 0}` : null;
const projectileId = number => number ? `p${number >>> 0}` : null;
const clonePlain = value => {
  if (typeof structuredClone === 'function') {
    try { return structuredClone(value); } catch (_) {}
  }
  try { return JSON.parse(JSON.stringify(value)); } catch (_) { return value; }
};
const authoritativeAllowed = game => typeof Worker !== 'undefined' && !game?._fdForceLegacySimulation172;

const STABLE165_SLOTS = 3;
const STABLE165_META_STRIDE = 8;
const STABLE165_MAX_UNITS = 131072;
const STABLE165_MAX_PROJECTILES = 32768;
const STABLE165_MAX_RENDER_IDS = 8192;

function createSharedTransport165() {
  if (!globalThis.crossOriginIsolated || typeof SharedArrayBuffer === 'undefined' || typeof Atomics === 'undefined') return null;
  try {
    const make = bytes => new SharedArrayBuffer(bytes);
    const headerBuffer = make(Int32Array.BYTES_PER_ELEMENT * STABLE165_SLOTS * STABLE165_META_STRIDE);
    const unitIdsBuffer = make(Uint32Array.BYTES_PER_ELEMENT * STABLE165_SLOTS * STABLE165_MAX_UNITS);
    const unitFloatsBuffer = make(Float32Array.BYTES_PER_ELEMENT * STABLE165_SLOTS * STABLE165_MAX_UNITS * UNIT_FLOAT_STRIDE);
    const unitIntsBuffer = make(Int32Array.BYTES_PER_ELEMENT * STABLE165_SLOTS * STABLE165_MAX_UNITS * UNIT_INT_STRIDE);
    const projectileIdsBuffer = make(Uint32Array.BYTES_PER_ELEMENT * STABLE165_SLOTS * STABLE165_MAX_PROJECTILES);
    const projectileFloatsBuffer = make(Float32Array.BYTES_PER_ELEMENT * STABLE165_SLOTS * STABLE165_MAX_PROJECTILES * PROJECTILE_FLOAT_STRIDE);
    const projectileIntsBuffer = make(Int32Array.BYTES_PER_ELEMENT * STABLE165_SLOTS * STABLE165_MAX_PROJECTILES * PROJECTILE_INT_STRIDE);
    const renderIdsBuffer = make(Uint32Array.BYTES_PER_ELEMENT * STABLE165_SLOTS * STABLE165_MAX_RENDER_IDS);
    const descriptor = {
      version: 165, slots: STABLE165_SLOTS, metaStride: STABLE165_META_STRIDE,
      maxUnits: STABLE165_MAX_UNITS, maxProjectiles: STABLE165_MAX_PROJECTILES, maxRenderIds: STABLE165_MAX_RENDER_IDS,
      headerBuffer, unitIdsBuffer, unitFloatsBuffer, unitIntsBuffer,
      projectileIdsBuffer, projectileFloatsBuffer, projectileIntsBuffer, renderIdsBuffer
    };
    return {
      descriptor,
      local: {
        ...descriptor,
        header: new Int32Array(headerBuffer), unitIds: new Uint32Array(unitIdsBuffer),
        unitFloats: new Float32Array(unitFloatsBuffer), unitInts: new Int32Array(unitIntsBuffer),
        projectileIds: new Uint32Array(projectileIdsBuffer), projectileFloats: new Float32Array(projectileFloatsBuffer),
        projectileInts: new Int32Array(projectileIntsBuffer), renderIds: new Uint32Array(renderIdsBuffer)
      }
    };
  } catch (error) {
    console.warn('[v16.5] SharedArrayBuffer transport unavailable:', error);
    return null;
  }
}

function serializeProjectile(projectile) {
  return {
    id: projectile.id, sourceId: projectile.sourceId, sourceTypeId: projectile.sourceTypeId || null,
    team: projectile.team, x: projectile.x, y: projectile.y, targetId: projectile.targetId,
    targetX: projectile.targetX, targetY: projectile.targetY, speed: projectile.speed,
    damage: projectile.damage, splash: projectile.splash, weapon: clonePlain(projectile.weapon),
    profile: projectile.profile, trajectory: projectile.trajectory, ballistic: projectile.ballistic,
    interceptability: projectile.interceptability, maxHp: projectile.maxHp, hp: projectile.hp,
    signature: projectile.signature, evasion: projectile.evasion, turnRate: projectile.turnRate,
    weave: projectile.weave, arcHeight: projectile.arcHeight, visualSize: projectile.visualSize,
    color: projectile.color, trailColor: projectile.trailColor, trailLength: projectile.trailLength,
    accuracy: projectile.accuracy, defenseClass: projectile.defenseClass,
    ttl: projectile.ttl, age: projectile.age, phase: projectile.phase, angle: projectile.angle,
    altitude: projectile.altitude, launchAltitude: projectile.launchAltitude,
    guidanceLost: projectile.guidanceLost, preserveAim: true
  };
}

function captureInitialState(game) {
  const preservedResync206 = game?._fdLoadedMultiplayerSnapshot206;
  if (preservedResync206?.__mp && preservedResync206?.authoritative172) {
    const saveData = clonePlain(preservedResync206);
    const authoritative = clonePlain(saveData.authoritative172);
    const projectiles = Array.isArray(authoritative?.projectiles) ? clonePlain(authoritative.projectiles) : [];
    return { saveData, authoritative, projectiles };
  }
  const previous = D.storageGet(D.SAVE_KEY);
  let data = null;
  try {
    legacy.save.call(game, false);
    const raw = D.storageGet(D.SAVE_KEY);
    data = raw ? JSON.parse(raw) : null;
  } finally {
    if (previous == null) localStorage.removeItem(D.SAVE_KEY);
    else D.storageSet(D.SAVE_KEY, previous);
  }
  if (!data) throw new Error('Не удалось сформировать исходный снимок симуляции');
  const loadedExtension = game._fdLoadedAuthoritative172 || null;
  const projectiles = game.projectiles?.length
    ? game.projectiles.filter(projectile => projectile.alive).map(serializeProjectile)
    : (loadedExtension?.projectiles || []);
  const authoritative = {
    version: VERSION, build: BUILD,
    simTick: finite(game.simTick, Math.round(game.time * SIM_HZ)),
    rngSeed: finite(game.rng?.seed, game.seed),
    projectiles,
    paused: Boolean(game.paused),
    idCounter: game.idCounter,
    projectileCounter: Math.max(game.projectileCounter || 1, loadedExtension?.projectileCounter || 1),
    formationCounter: Math.max(game.formationCounter || 1, loadedExtension?.formationCounter || 1)
  };
  data.authoritative172 = authoritative;
  data.logistics206 = game.exportLogistics206?.() || data.logistics206 || null;
  data.camera = { ...game.camera };
  data.selectedIds = game.selected.map(entity => entity.id);
  return { saveData: data, authoritative, projectiles };
}

function updateTeam(target, saved) {
  if (!target || !saved) return;
  target.faction = saved.faction || target.faction;
  target.credits = finite(saved.credits);
  target.commandXp = finite(saved.commandXp);
  target.rank = finite(saved.rank, 1);
  target.powerProduced = finite(saved.powerProduced);
  target.powerUsed = finite(saved.powerUsed);
  target.powerFactor = finite(saved.powerFactor, 1);
  target.upgrades = new Set(saved.upgrades || []);
  target.powers = { ...(target.powers || {}), ...(saved.powers || {}) };
}

function applyEntityDetail(entity, data) {
  if (!entity || !data) return;
  if (data.kind === 'unit' && data.typeId && data.typeId !== entity.typeId) {
    entity.typeId = data.typeId;
    const teamState = entity.game?.teams?.[entity.team];
    let stats = null;
    try { stats = typeof D.getUnitStats === 'function' ? D.getUnitStats(data.typeId, teamState) : null; } catch (_) {}
    stats ||= D.UNIT_TYPES?.[data.typeId] || entity.stats;
    if (stats) {
      entity.stats = stats;
      entity.radius = Number(stats.radius) || entity.radius;
      entity.armor = stats.armor || entity.armor;
      entity.vision = Number(stats.vision) || 0;
      entity.detector = Number(stats.detector) || 0;
      entity.air = Boolean(stats.air);
      entity.infantry = Boolean(stats.infantry);
      entity.vehicle = Boolean(stats.vehicle);
      entity.speed = Number(stats.speed) || entity.speed;
    }
  }
  const protectedKeys = new Set(['id', 'kind', 'typeId', 'game', 'stats', 'radius', 'armor', 'vision', 'detector']);
  for (const [key, value] of Object.entries(data)) {
    if (protectedKeys.has(key)) continue;
    if (key === 'commandQueue') entity.commandQueue = Array.isArray(value) ? value.map(command => ({ ...command })) : [];
    else if (key === 'queue') entity.queue = Array.isArray(value) ? value.map(item => ({ ...item })) : [];
    else if (key === 'rallyPoint' || key === 'airOrbitCenter' || key === 'functionalDamage160') entity[key] = value ? { ...value } : value;
    else if (key === 'cargoUnits' || key === 'transportCargoIds') entity[key] = Array.isArray(value) ? [...value] : [];
    else entity[key] = value;
  }
}

function createMirrorEntity(game, data) {
  let entity = game.getEntity(data.id);
  if (entity) {
    applyEntityDetail(entity, data);
    return entity;
  }
  if (data.kind === 'unit') entity = new D.Unit(game, data);
  else if (data.kind === 'building') entity = new D.Building(game, data);
  else if (data.kind === 'resource') entity = new D.ResourceNode(game, data);
  if (!entity) return null;
  game.addEntity(entity);
  applyEntityDetail(entity, data);
  return entity;
}

function createMirrorProjectile(game, data) {
  let projectile = game.projectiles.find(item => item.id === data.id);
  if (!projectile) {
    projectile = new D.Projectile(game, { ...data, preserveAim: true });
    game.projectiles.push(projectile);
  }
  Object.assign(projectile, data);
  projectile.alive = data.alive !== false;
  projectile.trail ||= [];
  return projectile;
}

class AuthoritativeBridge172 {
  constructor(game) {
    this.id = bridgeCounter++;
    this.game = game;
    this.worker = null;
    this.ready = false;
    this.failed = false;
    this.applying = false;
    this.initialized = false;
    this.seq = 0;
    this.lastAck = 0;
    this.lastSnapshotAt = 0;
    this.previousSnapshotAt = 0;
    this.snapshotInterval = 40;
    this.lastSnapshotSequence = 0;
    this.lastViewAt = 0;
    this.lastPresentationAt = performance.now();
    this.renderUnitIds = [];
    this.renderUnitSet = new Set();
    this.clusters = [];
    this.projectileMap = new Map(game.projectiles.map(projectile => [projectile.id, projectile]));
    this.pendingSaves = new Map();
    this.workerPerformance = null;
    this.stateHash = 0;
    this.subsystemHashes = null;
    this.workerTick = finite(game.simTick);
    this.workerTime = finite(game.time);
    this.mainLegacyTicks = 0;
    this.snapshotBytes = 0;
    this.transportMode165 = 'transfer-fallback';
    this.shared165 = null;
    this.sharedSequence165 = 0;
    this.sharedFallbacks165 = 0;
    this.buildingStateSequence165 = 0;
    this.minimapStateSequence165 = 0;
    this.buildingBytes165 = 0;
    this.minimapBytes165 = 0;
    this.lastApplyMs165 = 0;
    this.lastSnapshotLatency165 = 0;
    this.actionErrors = 0;
    this.lastError = null;
    this.recovering201 = false;
    this.recoveryTimer201 = null;
    this.recoveryAttempts201 = 0;
    this.recoverySuccesses201 = 0;
    this.recoveryWindowAt201 = 0;
    this.recoveryWindowAttempts201 = 0;
    this.lastRecoveryReason201 = null;
    this.networkHash = '00000000';
    this.networkHashTick = 0;
    this.appliedNetworkSeq = 0;
    this.lastStatusTick = -1;
    this.latestRngSeed = finite(game.rng?.seed, game.seed);
    this._paused = Boolean(game.paused);
    this.installPauseProxy();
    this.disableOldWorkerMirror();
    window.__FD_STABLE_STATE165__ = { version: '16.8.20', build: 204, bridge: this, transport: this.transportMode165, counts: {} };
    this.launch();
  }

  installPauseProxy() {
    const game = this.game;
    let pausedValue = Boolean(game.paused);
    try {
      Object.defineProperty(game, 'paused', {
        configurable: true,
        enumerable: true,
        get: () => pausedValue,
        set: value => {
          const next = Boolean(value);
          if (next === pausedValue) return;
          pausedValue = next;
          this._paused = next;
          if (this.worker && !this.failed) this.worker.postMessage({ type: 'pause', paused: next });
        }
      });
    } catch (_) {}
  }

  disableOldWorkerMirror() {
    const core = this.game.operationalCore160;
    try { core?.worker?.terminate?.(); } catch (_) {}
    if (core) {
      core.worker = null;
      core.workerReady = false;
      core.sendWorker = () => {};
    }
  }

  multiplayerState() {
    const mp = window.__FD_MULTIPLAYER__;
    const active = Boolean(window.__FD_MULTIPLAYER_ACTIVE__ && mp?.active);
    return {
      active,
      role: mp?.role || null,
      mode: mp?.mode || 'coop',
      perspectiveSwapped: Boolean(mp?.localPerspectiveSwapped || (active && mp?.mode === 'versus' && mp?.role === 'guest')),
      appliedSeq: Number(mp?.lastAppliedSeq) || 0,
      hostTick: Number.isFinite(mp?.hostTick) ? Number(mp.hostTick) : null
    };
  }

  sendNetworkEvent(event) {
    if (!event?.action || !this.worker || this.failed) return false;
    const seq = ++this.seq;
    this.worker.postMessage({
      type: 'action', seq, networkSeq: Number(event.seq) || 0,
      atTick: Number.isFinite(event.atTick) ? event.atTick : Math.max(this.workerTick + 1, Number(event.tick) + 1 || 1),
      action: event.action, payload: clonePlain(event.payload || {}),
      selectedIds: [...(event.selectedIds || [])], team: event.team || 'player'
    });
    return true;
  }

  sendClock(tick) {
    if (this.worker && !this.failed) this.worker.postMessage({ type: 'clockSync', tick: Number(tick) || 0 });
  }

  postMultiplayerStatus(message) {
    const mp = window.__FD_MULTIPLAYER__;
    if (!window.__FD_MULTIPLAYER_ACTIVE__ || !mp?.active) return;
    const tick = Number(message.networkHashTick || message.tick || 0) || 0;
    if (tick === this.lastStatusTick || tick % 5 !== 0) return;
    this.lastStatusTick = tick;
    window.parent.postMessage({ type: 'fd:mp-status', status: {
      tick, hash: message.networkHash || this.networkHash,
      networkStateHash206: Number(message.stateHash || 0) >>> 0,
      networkSubsystemHashes206: message.subsystemHashes || null,
      networkRngSeed206: Number(message.rngSeed || 0) >>> 0,
      networkAppliedSeq206: Number(message.appliedSeq || 0),
      networkLogisticsHash206: Number(message.networkLogisticsHash206 || 0) >>> 0,
      networkLogisticsComponents206: message.networkLogisticsComponents206 || null,
      networkBaseComponents206: message.networkBaseComponents206 || null,
      initialNetworkHash206: message.initialNetworkHash206 || '00000000',
      initialNetworkLogisticsHash206: Number(message.initialNetworkLogisticsHash206 || 0) >>> 0,
      initialNetworkLogisticsComponents206: message.initialNetworkLogisticsComponents206 || null,
      initialNetworkBaseComponents206: message.initialNetworkBaseComponents206 || null,
      units: message.counts?.units || 0, buildings: message.counts?.buildings || 0,
      gameTime: Number(message.time) || 0, ended: Boolean(this.game.ended)
    } }, window.location.origin);
  }

  launch() {
    try {
      if (activeBridge && activeBridge !== this) activeBridge.shutdown();
      activeBridge = this;
      const initial = captureInitialState(this.game);
      const stableTransport165 = createSharedTransport165();
      this.shared165 = stableTransport165?.local || null;
      this.transportMode165 = this.shared165 ? 'shared-triple' : 'transfer-fallback';
      if (window.__FD_STABLE_STATE165__) window.__FD_STABLE_STATE165__.transport = this.transportMode165;
      this.worker = new Worker('/frontline-dominion/authoritative-simulation-worker-v174.js?build=214');
      this.worker.onmessage = event => this.onMessage(event.data || {});
      this.worker.onerror = event => this.fail(`Ошибка Simulation Worker: ${event.message || 'неизвестная ошибка'}`);
      this.worker.onmessageerror = () => this.fail('Simulation Worker вернул повреждённое сообщение');
      this.worker.postMessage({
        type: 'init', saveData: initial.saveData, authoritative: initial.authoritative,
        projectiles: initial.projectiles, paused: this._paused, manual: false, multiplayer: this.multiplayerState(),
        shared165: stableTransport165?.descriptor || null
      });
      this.initialized = true;
      this.sendView(true);
    } catch (error) {
      this.fail(error.message || String(error));
    }
  }

  onMessage(message) {
    if (message.type === 'bundleReady') return;
    if (message.type === 'ready') {
      const recovered201 = this.recovering201;
      if (this.recoveryTimer201) clearTimeout(this.recoveryTimer201);
      this.recoveryTimer201 = null;
      this.recovering201 = false;
      this.failed = false;
      this.lastError = null;
      this.recoveryWindowAttempts201 = 0;
      if (recovered201) this.recoverySuccesses201 += 1;
      this.ready = true;
      this.workerTick = message.tick || 0;
      this.workerTime = message.time || 0;
      this.stateHash = message.stateHash >>> 0;
      // Reconcile Worker pause from the live UI state. Persisted pause flags are never authoritative.
      this.worker.postMessage({ type: 'pause', paused: Boolean(this.game?.paused) });
      this.worker.postMessage({ type: 'multiplayer', multiplayer: this.multiplayerState() });
      const hostTick = window.__FD_MULTIPLAYER__?.hostTick;
      if (Number.isFinite(hostTick)) this.sendClock(hostTick);
      const handoff206 = window.__FD_MP_RESYNC_HANDOFF_206__;
      if (handoff206?.active && activeBridge === this && this.game === D.game) {
        const baseSeq206 = Number(handoff206.baseSeq) || 0;
        this.appliedNetworkSeq = Math.max(Number(this.appliedNetworkSeq || 0), baseSeq206);
        window.__FD_MULTIPLAYER__?.markWorkerApplied?.(baseSeq206);
        const buffered206 = [...(handoff206.events || [])]
          .filter(item => (Number(item?.seq) || 0) > baseSeq206)
          .sort((a, b) => (Number(a?.seq) || 0) - (Number(b?.seq) || 0));
        handoff206.active = false;
        handoff206.flushedByBridgeId = this.id;
        handoff206.flushedAtTick = Number(this.workerTick || 0);
        handoff206.flushedCount = buffered206.length;
        handoff206.events = [];
        for (const pending206 of buffered206) this.sendNetworkEvent(pending206);
      }
      if (window.__FD_STABLE_STATE165__) window.__FD_STABLE_STATE165__.transport = this.transportMode165;
      this.game.alert?.(`Action Group & Command Center Core · Worker 25 Гц · ${this.transportMode165 === 'shared-triple' ? 'SAB triple buffer' : 'transfer fallback'}`, 'info');
      return;
    }
    if (message.type === 'buildingState165') {
      this.applyBuildingState165(message);
      return;
    }
    if (message.type === 'minimapState165') {
      this.applyMinimapState165(message);
      return;
    }
    if (message.type === 'snapshot') {
      this.applySnapshot(message);
      return;
    }
    if (message.type === 'actionAck') {
      this.lastActionAck208 = clonePlain(message);
      this.lastAck = Math.max(this.lastAck, message.seq || 0);
      if (!message.ok) this.actionErrors += 1;
      if (message.networkSeq) { this.appliedNetworkSeq = Math.max(this.appliedNetworkSeq, Number(message.networkSeq) || 0); window.__FD_MULTIPLAYER__?.markWorkerApplied?.(message.networkSeq); }
      return;
    }
    if (message.type === 'saveData') {
      this.handleSaveData(message);
      return;
    }
    if (message.type === 'diagnostics') {
      const pending = this.pendingSaves.get(`diag:${message.requestId}`);
      if (pending) { this.pendingSaves.delete(`diag:${message.requestId}`); pending.resolve(message); }
      return;
    }
    if (message.type === 'fatal') this.fail(`${message.stage || 'worker'}: ${message.message || 'фатальная ошибка'}${message.stack ? `\n${message.stack}` : ''}`);
  }

  fail(reason) {
    const message201 = String(reason || 'authoritative-worker-failed');
    this.lastError = message201;
    this.lastRecoveryReason201 = message201;
    if (this.recoveryTimer201) return;
    this.failed = true;
    this.ready = false;
    try { this.worker?.terminate?.(); } catch (_) {}
    this.worker = null;
    try {
      this.game.rebuildSpatialIndexes?.();
      window.__FD_V94__?.ensure?.();
    } catch (_) {}

    const now201 = performance.now();
    if (!this.recoveryWindowAt201 || now201 - this.recoveryWindowAt201 > 15000) {
      this.recoveryWindowAt201 = now201;
      this.recoveryWindowAttempts201 = 0;
    }
    if (this.recoveryWindowAttempts201 < 3) {
      const delays201 = [120, 320, 760];
      const attempt201 = this.recoveryWindowAttempts201++;
      this.recoveryAttempts201 += 1;
      this.recovering201 = true;
      console.warn(`[FD201] Simulation Worker recovery ${attempt201 + 1}/3:`, message201);
      this.recoveryTimer201 = setTimeout(() => {
        this.recoveryTimer201 = null;
        this.failed = false;
        try { this.launch(); }
        catch (error) { this.fail(error?.message || String(error)); }
      }, delays201[attempt201]);
      return;
    }

    this.recovering201 = false;
    console.error('[Frontline Dominion v16.8.17] authoritative Worker fallback:', message201);
    this.game.alert?.(`Simulation Worker отключён: ${message201}. Включён совместимый основной поток.`, 'danger');
  }

  shutdown() {
    try { this.worker?.postMessage({ type: 'shutdown' }); } catch (_) {}
    try { this.worker?.terminate?.(); } catch (_) {}
    this.worker = null;
    this.ready = false;
    if (activeBridge === this) activeBridge = null;
  }

  sendAction(action, payload = {}, selectedIds = null) {
    if (this.failed || !this.worker) return false;
    const seq = ++this.seq;
    const ids = selectedIds || this.game.selected.filter(entity => entity?.alive).map(entity => entity.id);
    this.worker.postMessage({
      type: 'action', seq, atTick: Math.max(this.workerTick + 1, finite(this.game.simTick) + 1),
      action, payload: clonePlain(payload), selectedIds: ids,
      resumeIfMainRunning: !Boolean(this.game?.paused)
    });
    return true;
  }

  currentView() {
    const game = this.game;
    let corners = [];
    try {
      corners = [
        game.screenToWorld(0, 0), game.screenToWorld(game.viewport.width, 0),
        game.screenToWorld(game.viewport.width, game.viewport.height), game.screenToWorld(0, game.viewport.height)
      ];
    } catch (_) {}
    if (!corners.length) return { left: 0, top: 0, right: D.WORLD.width, bottom: D.WORLD.height, zoom: game.camera.zoom || 1 };
    return {
      left: Math.min(...corners.map(point => point.x)), top: Math.min(...corners.map(point => point.y)),
      right: Math.max(...corners.map(point => point.x)), bottom: Math.max(...corners.map(point => point.y)),
      zoom: game.camera.zoom || 1,
      selectedIds: game.selected.filter(entity => entity?.alive).map(entity => entity.id)
    };
  }

  sendView(force = false) {
    if (!this.worker || this.failed) return;
    const now = performance.now();
    if (!force && now - this.lastViewAt < 160) return;
    this.lastViewAt = now;
    this.worker.postMessage({ type: 'view', view: this.currentView() });
  }


  releaseSharedMessage165(message) {
    if (!this.shared165 || !Number.isInteger(message?.sharedSlot165)) return;
    const base = message.sharedSlot165 * this.shared165.metaStride;
    if (Atomics.load(this.shared165.header, base) === (message.sequence | 0)) Atomics.store(this.shared165.header, base + 5, 0);
  }

  acquireSharedFrame165(message) {
    if (!this.shared165 || !Number.isInteger(message?.sharedSlot165)) return null;
    const shared = this.shared165;
    const slot = message.sharedSlot165;
    if (slot < 0 || slot >= shared.slots) return null;
    const base = slot * shared.metaStride;
    const sequence = Atomics.load(shared.header, base);
    if (sequence !== (message.sequence | 0)) return null;
    if (Atomics.compareExchange(shared.header, base + 5, 2, 3) !== 2) return null;
    const unitCount = clamp(Atomics.load(shared.header, base + 2), 0, shared.maxUnits);
    const projectileCount = clamp(Atomics.load(shared.header, base + 3), 0, shared.maxProjectiles);
    const renderCount = clamp(Atomics.load(shared.header, base + 4), 0, shared.maxRenderIds);
    const unitBase = slot * shared.maxUnits;
    const projectileBase = slot * shared.maxProjectiles;
    const renderBase = slot * shared.maxRenderIds;
    return {
      slot, base, sequence,
      unitIds: shared.unitIds.subarray(unitBase, unitBase + unitCount),
      unitFloats: shared.unitFloats.subarray(unitBase * UNIT_FLOAT_STRIDE, (unitBase + unitCount) * UNIT_FLOAT_STRIDE),
      unitInts: shared.unitInts.subarray(unitBase * UNIT_INT_STRIDE, (unitBase + unitCount) * UNIT_INT_STRIDE),
      projectileIds: shared.projectileIds.subarray(projectileBase, projectileBase + projectileCount),
      projectileFloats: shared.projectileFloats.subarray(projectileBase * PROJECTILE_FLOAT_STRIDE, (projectileBase + projectileCount) * PROJECTILE_FLOAT_STRIDE),
      projectileInts: shared.projectileInts.subarray(projectileBase * PROJECTILE_INT_STRIDE, (projectileBase + projectileCount) * PROJECTILE_INT_STRIDE),
      renderIds: shared.renderIds.subarray(renderBase, renderBase + renderCount)
    };
  }

  releaseSharedFrame165(frame) {
    if (!frame || !this.shared165) return;
    Atomics.store(this.shared165.header, frame.base + 5, 0);
  }

  applyBuildingState165(message) {
    if ((message.sequence | 0) <= this.buildingStateSequence165) return;
    this.buildingStateSequence165 = message.sequence | 0;
    for (const record of message.details || []) {
      const entity = createMirrorEntity(this.game, record);
      applyEntityDetail(entity, record);
    }
    this.applyBuildings(message.buildingIds, message.buildingFloats, message.buildingInts);
    this.buildingBytes165 = Number(message.bytes165) || 0;
    if (window.__FD_STABLE_STATE165__) window.__FD_STABLE_STATE165__.buildingSequence = this.buildingStateSequence165;
    this.game.uiDirty = true;
  }

  applyMinimapState165(message) {
    if ((message.sequence | 0) <= this.minimapStateSequence165) return;
    const game = this.game;
    const nextCells = new Map((message.miniCells || []).map(cell => [cell.key, {
      p: cell.p, e: cell.e, n: cell.n,
      bands: (cell.bands || []).map(band => ({ ...band }))
    }]));
    if (message.visible?.length === game.visible.length) game.visible.set(message.visible);
    if (message.explored?.length === game.explored.length) game.explored.set(message.explored);
    game._v94MiniCells = nextCells;
    game._v94MiniDirty = true;
    game._fdMinimapState165 = { sequence: message.sequence | 0, tick: message.tick | 0 };
    this.minimapStateSequence165 = message.sequence | 0;
    this.minimapBytes165 = Number(message.bytes165) || 0;
    if (window.__FD_STABLE_STATE165__) window.__FD_STABLE_STATE165__.minimapSequence = this.minimapStateSequence165;
  }

  applySnapshot(message) {
    if (message.sequence <= this.lastSnapshotSequence) { this.releaseSharedMessage165(message); return; }
    this.lastSnapshotSequence = message.sequence;
    this.applying = true;
    const game = this.game;
    const applyStarted165 = performance.now();
    let sharedFrame165 = null;
    try {
      this.previousSnapshotAt = this.lastSnapshotAt || performance.now() - 40;
      this.lastSnapshotAt = performance.now();
      this.snapshotInterval = clamp(this.lastSnapshotAt - this.previousSnapshotAt, 25, 180);
      this.workerTick = message.tick;
      this.workerTime = message.time;
      this.stateHash = message.stateHash >>> 0;
      this.subsystemHashes = message.subsystemHashes;
      this.workerPerformance = message.performance;
      this.snapshotBytes = message.performance?.snapshotBytes || 0;
      this.networkHash = message.networkHash || this.networkHash;
      this.networkHashTick = message.networkHashTick || this.networkHashTick;
      this.latestRngSeed = finite(message.rngSeed, this.latestRngSeed);
      this.appliedNetworkSeq = Math.max(this.appliedNetworkSeq, Number(message.appliedSeq) || 0);
      this.lastSnapshotLatency165 = Math.max(0, Date.now() - (Number(message.wallClock165) || Date.now()));
      this.sharedFallbacks165 = Number(message.sharedFallbacks165) || this.sharedFallbacks165;
      if (window.__FD_STABLE_STATE165__) window.__FD_STABLE_STATE165__.counts = { ...(message.counts || {}) };
      game.simTick = message.tick;
      game.time = message.time;
      game.idCounter = message.counters?.idCounter || game.idCounter;
      game.projectileCounter = message.counters?.projectileCounter || game.projectileCounter;
      game.formationCounter = message.counters?.formationCounter || game.formationCounter;
      game._v94AliveUnits = message.counts?.units ?? game.units.length;
      game.stats = { ...game.stats, ...(message.stats || {}) };
      game.objective = message.objective || game.objective;
      updateTeam(game.teams.player, message.teams?.player);
      updateTeam(game.teams.enemy, message.teams?.enemy);
      if (message.logistics206) game.importLogistics206?.(message.logistics206);

      for (const record of message.createdEntities || []) createMirrorEntity(game, record);
      for (const record of message.details || []) {
        const entity = createMirrorEntity(game, record);
        applyEntityDetail(entity, record);
      }
      sharedFrame165 = this.acquireSharedFrame165(message);
      if (sharedFrame165) this.applyUnits(sharedFrame165.unitIds, sharedFrame165.unitFloats, sharedFrame165.unitInts);
      else this.applyUnits(message.unitIds, message.unitFloats, message.unitInts);
      if (message.buildingIds) this.applyBuildings(message.buildingIds, message.buildingFloats, message.buildingInts);
      this.applyResources(message.resourceIds, message.resourceFloats);

      for (const record of message.createdProjectiles || []) {
        const projectile = createMirrorProjectile(game, record);
        this.projectileMap.set(projectile.id, projectile);
        this.playShot(record);
      }
      if (sharedFrame165) this.applyProjectiles(sharedFrame165.projectileIds, sharedFrame165.projectileFloats, sharedFrame165.projectileInts);
      else this.applyProjectiles(message.projectileIds, message.projectileFloats, message.projectileInts);

      if (message.removedEntities?.length) this.removeEntities(message.removedEntities);
      if (message.removedProjectiles?.length) this.removeProjectiles(message.removedProjectiles);

      this.renderUnitIds = Array.from(sharedFrame165?.renderIds || message.renderUnitIds || [], entityId).filter(Boolean);
      this.renderUnitSet = new Set(this.renderUnitIds);
      this.clusters = Array.isArray(message.clusters) ? message.clusters : [];
      game._fdWorkerRenderUnitIds172 = this.renderUnitIds;
      game._fdWorkerClusters172 = this.clusters;

      if (message.visible?.length === game.visible.length) game.visible.set(message.visible);
      if (message.explored?.length === game.explored.length) game.explored.set(message.explored);
      if (message.miniCells) {
        game._v94MiniCells = new Map(message.miniCells.map(cell => [cell.key, {
          p: cell.p, e: cell.e, n: cell.n,
          bands: (cell.bands || []).map(band => ({ ...band }))
        }]));
        game._v94MiniDirty = true;
      }
      if (message.formations) game.formations = new Map(message.formations.map(group => [group.id, group]));
      if (message.operationalCore160 && game.operationalCore160?.hydrate) {
        game.operationalCore160.hydrate(message.operationalCore160);
        game.operationalCore160.worker = null;
        game.operationalCore160.workerReady = true;
        game.operationalCore160.workerHash = message.stateHash >>> 0;
      }
      if (message.abilityZones) game.abilityZones = message.abilityZones.map(zone => ({ ...zone, alive: zone.alive !== false }));
      if (message.spyCells) game.spyCells = message.spyCells.map(cell => ({ ...cell }));
      if (message.minefields141) game.minefields141 = message.minefields141.map(field => ({ ...field, mines: (field.mines || []).map(mine => ({ ...mine })) }));

      for (const effect of message.effects || []) {
        game.addEffect?.(effect);
        if (/explosion|impact|detonation|blast/i.test(String(effect.type || ''))) this.playExplosion(effect);
      }
      for (const alert of message.alerts || []) game.alert?.(alert.message, alert.alertType || 'info', alert.x, alert.y);
      if (message.endEvent && !game.ended) this.applyEnd(message.endEvent);

      game.selected = game.selected.filter(entity => entity?.alive && game.getEntity(entity.id) === entity);
      for (const entity of game.selected) entity.selected = true;
      game.uiDirty = true;
      this.sendView();
      this.postMultiplayerStatus(message);
    } finally {
      this.releaseSharedFrame165(sharedFrame165);
      this.lastApplyMs165 = performance.now() - applyStarted165;
      this.applying = false;
    }
  }

  applyUnits(ids, floats, ints) {
    if (!ids || !floats || !ints) return;
    const game = this.game;
    for (let index = 0; index < ids.length; index += 1) {
      const unit = game.getEntity(entityId(ids[index]));
      if (!unit || unit.kind !== 'unit') continue;
      const f = index * UNIT_FLOAT_STRIDE, n = index * UNIT_INT_STRIDE;
      unit._v9PrevX = finite(unit.x); unit._v9PrevY = finite(unit.y); unit._v9PrevRot = finite(unit.rotation);
      unit.x = floats[f]; unit.y = floats[f+1]; unit.rotation = floats[f+2];
      unit.hp = floats[f+3]; unit.maxHp = floats[f+4]; unit.weaponCooldown = floats[f+5];
      unit.visualSpeed = floats[f+6]; unit.flightAltitude = floats[f+7]; unit.altitude = floats[f+7];
      unit.airBank = floats[f+8]; unit.airPitch = floats[f+9];
      unit.airAmmo = floats[f+10] < 0 ? null : floats[f+10]; unit.airAmmoMax = floats[f+11] < 0 ? null : floats[f+11];
      unit.sortieFuel = floats[f+12] < 0 ? null : floats[f+12]; unit.sortieFuelMax = floats[f+13] < 0 ? null : floats[f+13];
      unit.suppression160 = floats[f+14]; unit.cohesion160 = floats[f+15]; unit.supply160 = floats[f+16]; unit.morale160 = floats[f+17];
      unit.coverIntegrity = floats[f+18]; unit.revealTimer = floats[f+19]; unit.lastDamagedAt = floats[f+20]; unit.lastShotAt = floats[f+21];
      unit.team = TEAM_NAMES[ints[n]] || unit.team;
      const flags = ints[n+1]; unit.alive = Boolean(flags & 1); unit.air = Boolean(flags & 2);
      unit.embarkedIn = (flags & 4) ? entityId(ints[n+7]) : null; unit.cloaked = Boolean(flags & 8); unit.undercover = Boolean(flags & 16);
      unit.vehicle = Boolean(flags & 32) || unit.vehicle; unit.infantry = Boolean(flags & 64) || unit.infantry; unit._v160Retreating = Boolean(flags & 128);
      unit.rank = ints[n+2] || unit.rank; unit.cargo = ints[n+3]; unit._fdCommandCode172 = ints[n+4];
      unit._fdCommandTargetId172 = entityId(ints[n+5]); unit.airServiceState = SERVICE_NAMES[ints[n+6]] || unit.airServiceState;
    }
  }

  applyBuildings(ids, floats, ints) {
    if (!ids || !floats || !ints) return;
    const game = this.game;
    for (let index = 0; index < ids.length; index += 1) {
      const building = game.getEntity(entityId(ids[index]));
      if (!building || building.kind !== 'building') continue;
      const f = index * BUILDING_FLOAT_STRIDE, n = index * BUILDING_INT_STRIDE;
      building.x = floats[f]; building.y = floats[f+1]; building.rotation = floats[f+2];
      building.hp = floats[f+3]; building.maxHp = floats[f+4]; building.construction = floats[f+5];
      building.weaponRotation = floats[f+6]; building.desiredWeaponRotation = floats[f+7]; building.weaponCooldown = floats[f+8];
      building.recoil = floats[f+9]; building.captureProgress = floats[f+10]; building.sabotagedUntil = floats[f+11]; building.compromisedUntil = floats[f+12];
      building.team = TEAM_NAMES[ints[n]] || building.team; building.alive = Boolean(ints[n+1]); building.weaponTargetId = entityId(ints[n+2]);
    }
  }

  applyResources(ids, floats) {
    if (!ids || !floats) return;
    const game = this.game;
    for (let index = 0; index < ids.length; index += 1) {
      const resource = game.getEntity(entityId(ids[index]));
      if (!resource || resource.kind !== 'resource') continue;
      const f = index * RESOURCE_FLOAT_STRIDE;
      resource.x = floats[f]; resource.y = floats[f+1]; resource.amount = floats[f+2]; resource.maxAmount = floats[f+3]; resource.regenTimer = floats[f+4];
    }
  }

  applyProjectiles(ids, floats, ints) {
    if (!ids || !floats || !ints) return;
    const seen = new Set();
    for (let index = 0; index < ids.length; index += 1) {
      const id = projectileId(ids[index]);
      let projectile = this.projectileMap.get(id);
      if (!projectile) {
        projectile = createMirrorProjectile(this.game, { id, team: TEAM_NAMES[ints[index*PROJECTILE_INT_STRIDE]] || 'neutral', x: floats[index*PROJECTILE_FLOAT_STRIDE], y: floats[index*PROJECTILE_FLOAT_STRIDE+1], targetX: floats[index*PROJECTILE_FLOAT_STRIDE+6], targetY: floats[index*PROJECTILE_FLOAT_STRIDE+7], preserveAim: true, weapon: { targets: ['ground'], bonus: {} } });
        this.projectileMap.set(id, projectile);
      }
      seen.add(id);
      const f = index * PROJECTILE_FLOAT_STRIDE, n = index * PROJECTILE_INT_STRIDE;
      projectile.trail ||= [];
      if (Number.isFinite(projectile.x) && Math.hypot(projectile.x - floats[f], projectile.y - floats[f+1]) > 2) {
        projectile.trail.push({ x: projectile.x, y: projectile.y, altitude: projectile.altitude || 0 });
        const maxTrail = Math.min(24, Math.max(4, Math.round((projectile.trailLength || 20) / 4)));
        if (projectile.trail.length > maxTrail) projectile.trail.splice(0, projectile.trail.length - maxTrail);
      }
      projectile._v9PrevX = finite(projectile.x); projectile._v9PrevY = finite(projectile.y); projectile._v9PrevAngle = finite(projectile.angle); projectile._v9PrevAltitude = finite(projectile.altitude);
      projectile.x = floats[f]; projectile.y = floats[f+1]; projectile.angle = floats[f+2]; projectile.altitude = floats[f+3];
      projectile.hp = floats[f+4]; projectile.maxHp = floats[f+5]; projectile.targetX = floats[f+6]; projectile.targetY = floats[f+7];
      projectile.age = floats[f+8]; projectile.ttl = floats[f+9]; projectile.visualSize = floats[f+10]; projectile.launchAltitude = floats[f+11]; projectile.distanceTravelled = floats[f+12];
      projectile.team = TEAM_NAMES[ints[n]] || projectile.team; const flags = ints[n+1]; projectile.alive = Boolean(flags & 1);
      projectile.ballistic = Boolean(flags & 2); projectile.intercepted = Boolean(flags & 4); projectile.guidanceLost = Boolean(flags & 8);
      projectile.targetId = entityId(ints[n+2]); projectile.sourceId = entityId(ints[n+4]);
    }
  }

  removeEntities(ids) {
    const remove = new Set(ids || []);
    if (!remove.size) return;
    for (const id of remove) {
      const entity = this.game.getEntity(id);
      if (entity) { entity.alive = false; entity.selected = false; }
      this.game.entityMap.delete(id);
    }
    this.game.units = this.game.units.filter(entity => !remove.has(entity.id));
    this.game.buildings = this.game.buildings.filter(entity => !remove.has(entity.id));
    this.game.resources = this.game.resources.filter(entity => !remove.has(entity.id));
    this.game.selected = this.game.selected.filter(entity => !remove.has(entity.id));
  }

  removeProjectiles(ids) {
    const remove = new Set(ids || []);
    for (const id of remove) { const projectile = this.projectileMap.get(id); if (projectile) projectile.alive = false; this.projectileMap.delete(id); }
    this.game.projectiles = this.game.projectiles.filter(projectile => !remove.has(projectile.id) && projectile.alive);
  }

  playShot(record) {
    const game = this.game;
    if (!record || !game.isOnScreen?.(record.x, record.y, 180)) return;
    if (record.team === 'enemy' && !game.isVisibleAt?.(record.x, record.y)) return;
    game.sound?.shot?.((record.damage || 0) > 85);
  }

  playExplosion(effect) {
    const game = this.game;
    if (!game.isOnScreen?.(effect.x, effect.y, 220)) return;
    if (effect.team === 'enemy' && !game.isVisibleAt?.(effect.x, effect.y)) return;
    game.sound?.explosion?.((effect.radius || effect.size || 0) > 80);
  }

  applyEnd(event) {
    const game = this.game;
    game.ended = true;
    game.paused = true;
    const endScreen = document.querySelector('#end-screen');
    const title = document.querySelector('#end-title');
    const eyebrow = document.querySelector('#end-eyebrow');
    const stats = document.querySelector('#end-stats');
    if (endScreen) endScreen.classList.remove('hidden');
    if (title) title.textContent = event.victory ? 'Победа' : 'Поражение';
    if (eyebrow) void 0;
    if (stats) stats.textContent = `Время операции: ${Math.floor(event.time / 60).toString().padStart(2, '0')}:${Math.floor(event.time % 60).toString().padStart(2, '0')}`;
  }

  presentationStep(dt) {
    this.sendView();
    const game = this.game;
    try { game.updateEffects?.(Math.min(dt, 0.08)); } catch (_) {}
    game.cameraShake = Math.max(0, (game.cameraShake || 0) - dt * 24);
    game.uiTimer = (game.uiTimer || 0) - dt;
    if (game.uiTimer <= 0 || game.uiDirty) {
      game.uiTimer = 0.18;
      try { game.updateUI?.(); } catch (error) { console.warn('[v16.4] UI mirror update', error); }
    }
  }

  requestSave(notify = true) {
    if (!this.worker || this.failed) return false;
    const requestId = requestCounter++;
    this.pendingSaves.set(requestId, { notify, requestedAt: performance.now() });
    this.worker.postMessage({ type: 'saveRequest', requestId, notify });
    return requestId;
  }

  handleSaveData(message) {
    const data = message.data;
    if (!data) return;
    data.camera = { ...this.game.camera };
    data.selectedIds = this.game.selected.filter(entity => entity?.alive).map(entity => entity.id);
    data.controlGroups = this.game.controlGroups;
    try {
      const serialized205 = JSON.stringify(data);
      D.storageSet(D.SAVE_KEY, serialized205);
      window.dispatchEvent(new CustomEvent('fd:authoritative-save208', { detail: {
        requestId: Number(message.requestId) || 0,
        notify: Boolean(message.notify),
        data,
        raw: serialized205,
        tick: Number(data.authoritative172?.simTick ?? data.simTick ?? 0) || 0
      } }));
      const load = document.querySelector('#load-game');
      if (load) load.disabled = false;
      const pending = message.requestId ? this.pendingSaves.get(message.requestId) : null;
      if (message.requestId) this.pendingSaves.delete(message.requestId);
      if (message.notify || pending?.notify) this.game.alert?.('Игра сохранена из авторитетного Worker', 'info');
    } catch (error) {
      console.error(error);
      this.game.alert?.('Не удалось сохранить состояние Worker', 'danger');
    }
  }

  diagnostics() {
    return {
      version: VERSION, build: BUILD, authoritative: this.ready && !this.failed,
      initialized: this.initialized, ready: this.ready, failed: this.failed,
      workerTick: this.workerTick, workerTime: this.workerTime,
      stateHash: this.stateHash, subsystemHashes: this.subsystemHashes, networkHash: this.networkHash, networkHashTick: this.networkHashTick, appliedNetworkSeq: this.appliedNetworkSeq,
      lastSnapshotSequence: this.lastSnapshotSequence,
      snapshotAgeMs: this.lastSnapshotAt ? performance.now() - this.lastSnapshotAt : null,
      snapshotIntervalMs: this.snapshotInterval, snapshotBytes: this.snapshotBytes,
      commandsSent: this.seq, lastAck: this.lastAck, actionErrors: this.actionErrors,
      recovering201: this.recovering201, recoveryAttempts201: this.recoveryAttempts201,
      recoverySuccesses201: this.recoverySuccesses201, lastRecoveryReason201: this.lastRecoveryReason201,
      mainLegacyTicks: this.mainLegacyTicks,
      workerPerformance: this.workerPerformance,
      counts: { units: this.game.units.length, buildings: this.game.buildings.length, resources: this.game.resources.length, projectiles: this.game.projectiles.length }
    };
  }
}

function ensureBridge(game) {
  let bridge = bridges.get(game);
  if (!bridge && authoritativeAllowed(game)) {
    bridge = new AuthoritativeBridge172(game);
    bridges.set(game, bridge);
    game.authoritativeBridge172 = bridge;
  }
  return bridge || null;
}

function visibleMirrorUnits(game) {
  const bridge = bridges.get(game);
  if (!bridge?.renderUnitIds?.length) return game.units;
  return bridge.renderUnitIds.map(id => game.getEntity(id)).filter(unit => unit?.alive && !unit.embarkedIn);
}

/* Main thread performs presentation only. All authoritative mutation occurs in the Worker. */
Game.prototype.simulateFixed = function(dt = 1 / SIM_HZ) {
  if (!authoritativeAllowed(this)) {
    const bridge = bridges.get(this);
    if (bridge && !bridge.failed) bridge.shutdown();
    if (bridge) bridge.mainLegacyTicks += 1;
    return legacy.simulateFixed.call(this, dt);
  }
  const bridge = ensureBridge(this);
  if (!bridge || bridge.failed) {
    if (bridge) bridge.mainLegacyTicks += 1;
    return legacy.simulateFixed.call(this, dt);
  }
  bridge.presentationStep(Math.min(dt, 0.08));
  return bridge.workerPerformance?.averageTickMs || 0;
};
Game.prototype.update = function(dt) { return this.simulateFixed(dt); };

Game.prototype.save = function(notify = true) {
  const bridge = bridges.get(this) || (authoritativeAllowed(this) ? ensureBridge(this) : null);
  if (!bridge || bridge.failed) return legacy.save.call(this, notify);
  let ok = false;
  try {
    ok = legacy.save.call(this, false) !== false;
    const raw = D.storageGet(D.SAVE_KEY);
    const data = raw ? JSON.parse(raw) : null;
    if (data) {
      data.authoritative172 = {
        version: VERSION, build: BUILD, simTick: bridge.workerTick, rngSeed: bridge.latestRngSeed,
        projectiles: this.projectiles.filter(item => item.alive).map(serializeProjectile),
        paused: Boolean(this.paused), idCounter: this.idCounter,
        projectileCounter: this.projectileCounter, formationCounter: this.formationCounter,
        stateHash: bridge.stateHash, networkHash: bridge.networkHash
      };
      D.storageSet(D.SAVE_KEY, JSON.stringify(data));
    }
  } catch (error) { console.error('[v16.4] synchronous mirror save failed', error); }
  bridge.requestSave(notify);
  if (notify) this.alert?.('Сохранение зафиксировано; Worker записывает точное состояние', 'info');
  return ok;
};

/* Render directly from the Worker-provided detail set; no camera-dependent simulation or main-thread spatial rebuild. */
Game.prototype.buildRenderSnapshotV9 = function(alpha) {
  const bridge = bridges.get(this);
  if (!bridge || bridge.failed || !bridge.ready) return legacy.buildRenderSnapshotV9.call(this, alpha);
  const snapshot = this.renderSnapshot;
  snapshot.clear();
  snapshot.alpha = alpha;
  snapshot.frame += 1;
  snapshot.clusters94 ||= [];
  snapshot.clusters94.length = 0;
  for (const id of bridge.renderUnitIds) {
    const unit = this.getEntity(id);
    if (unit?.alive && !unit.embarkedIn) snapshot.units.push(unit);
  }
  for (const cluster of bridge.clusters) snapshot.clusters94.push(cluster);
  for (const building of this.buildings) {
    if (!building.alive || !this.isOnScreen(building.x, building.y, building.radius + 260)) continue;
    if (building.team === 'enemy' && !this.isVisibleAt(building.x, building.y)) continue;
    if (building.team === 'neutral' && !this.isExploredAt(building.x, building.y)) continue;
    snapshot.buildings.push(building);
  }
  for (const projectile of this.projectiles) if (projectile.alive && this.isOnScreen(projectile.x, projectile.y, 220)) snapshot.projectiles.push(projectile);
  for (const resource of this.resources) if (resource.alive && this.isOnScreen(resource.x, resource.y, resource.radius + 180) && this.isExploredAt(resource.x, resource.y)) snapshot.resources.push(resource);
  return snapshot;
};

Game.prototype.prepareInterpolationV9 = function(_alpha) {
  const bridge = bridges.get(this);
  if (!bridge || bridge.failed || !bridge.ready) return legacy.prepareInterpolationV9?.call(this, _alpha);
  const alpha = clamp((performance.now() - bridge.lastSnapshotAt) / Math.max(25, bridge.snapshotInterval), 0, 1);
  return legacy.prepareInterpolationV9?.call(this, alpha);
};

/* Screen selection queries only the current Worker detail set instead of scanning/stale spatial buckets. */
for (const name of ['hitTest', 'hitTestForContext', 'selectRect']) {
  const original = legacy[name];
  if (typeof original !== 'function') continue;
  Game.prototype[name] = function(...args) {
    const bridge = bridges.get(this);
    if (!bridge || bridge.failed || !bridge.ready) return original.apply(this, args);
    const all = this.units;
    this.units = visibleMirrorUnits(this);
    try { return original.apply(this, args); }
    finally { this.units = all; }
  };
}
if (typeof legacy.selectAt === 'function') Game.prototype.selectAt = function(...args) {
  const bridge = bridges.get(this);
  if (!bridge || bridge.failed || !bridge.ready) return legacy.selectAt.apply(this, args);
  const spatial = this.spatial;
  const query = spatial?.queryRadius;
  if (spatial) spatial.queryRadius = (layer, _x, _y, _r, out = null) => {
    if (layer !== 'units') return query.call(spatial, layer, _x, _y, _r, out);
    const result = out || [];
    result.length = 0;
    result.push(...visibleMirrorUnits(this));
    return result;
  };
  try { return legacy.selectAt.apply(this, args); }
  finally { if (spatial) spatial.queryRadius = query; }
};

/* Generic direct commands (mine laying and specialized service actions) are also Worker-routed. */
Unit.prototype.setCommand = function(command, append = false) {
  const bridge = bridges.get(this.game);
  if (!bridge || bridge.failed || bridge.applying || !authoritativeAllowed(this.game)) return legacy.unitSetCommand.call(this, command, append);
  if (window.__FD_MULTIPLAYER_ACTIVE__) return true;
  return bridge.sendAction('unitCommand', { unitId: this.id, command: clonePlain(command), append: Boolean(append) }, [this.id]);
};
if (typeof legacy.unitStop === 'function') Unit.prototype.stop = function() {
  const bridge = bridges.get(this.game);
  if (!bridge || bridge.failed || bridge.applying || !authoritativeAllowed(this.game)) return legacy.unitStop.call(this);
  if (window.__FD_MULTIPLAYER_ACTIVE__) return true;
  return bridge.sendAction('unitStop', { unitId: this.id }, [this.id]);
};

function wrapGameAction(name, action, encoder, options = {}) {
  const original = Game.prototype[name];
  if (typeof original !== 'function') return;
  legacy[`action:${name}`] = original;
  Game.prototype[name] = function(...args) {
    const bridge = bridges.get(this) || (authoritativeAllowed(this) ? ensureBridge(this) : null);
    if (!bridge || bridge.failed || bridge.applying || !authoritativeAllowed(this)) return original.apply(this, args);
    if (window.__FD_MULTIPLAYER_ACTIVE__) return original.apply(this, args);
    if (options.passThrough?.call(this, args)) return original.apply(this, args);
    const encoded = encoder.call(this, args);
    if (!encoded) return false;
    const selectedIds = encoded.selectedIds || this.selected.filter(entity => entity?.alive).map(entity => entity.id);
    const payload = { ...(encoded.payload || encoded) };
    delete payload.selectedIds;
    const sent = bridge.sendAction(action, payload, selectedIds);
    if (sent && options.present) options.present.call(this, payload);
    return sent;
  };
}

const marker = (color) => function(payload) {
  if (Number.isFinite(payload.x) && Number.isFinite(payload.y)) this.addEffect?.({ type: 'marker', x: payload.x, y: payload.y, color, duration: 0.9 });
  this.sound?.click?.();
};
wrapGameAction('issueMove', 'move', ([x,y,append]) => ({ x,y,append:Boolean(append), formationSettings: clonePlain(this.formationSettings) }), { present: marker('#8fe6b2') });
wrapGameAction('issueAttackMove', 'attackMove', ([x,y,append]) => ({ x,y,append:Boolean(append), formationSettings: clonePlain(this.formationSettings) }), { present: marker('#ffb06c') });
wrapGameAction('issuePatrol', 'patrol', ([x,y,append]) => ({ x,y,append:Boolean(append), formationSettings: clonePlain(this.formationSettings) }), { present: marker('#7ecbff') });
wrapGameAction('issueStop', 'stop', () => ({}));
wrapGameAction('issueHold', 'hold', () => ({}));
wrapGameAction('issueFireDiscipline177', 'fireDiscipline177', function([mode]) {
  const units = this.getSelectedUnits?.().filter(unit => unit?.stats?.weapon) || [];
  if (!units.length) return null;
  const resolved = mode === 'hold' || mode === 'free' ? mode : (units.every(unit => unit.fireDiscipline177 === 'hold') ? 'free' : 'hold');
  return { mode: resolved };
}, { present(payload) {
  const units = this.getSelectedUnits?.().filter(unit => unit?.stats?.weapon) || [];
  for (const unit of units) unit.fireDiscipline177 = payload.mode;
  this.uiDirty = true;
  if (this.uiCache) this.uiCache.commandKey = '';
  this.cancelModes?.();
  this.alert?.(payload.mode === 'hold' ? `Огонь запрещён · ${units.length} ед.` : `Огонь разрешён · ${units.length} ед.`, 'info');
} });
wrapGameAction('issueAttack', 'attack', ([target,append]) => target?.id ? ({ targetId: target.id, append:Boolean(append) }) : null);
wrapGameAction('issueContext', 'context', function([x,y,append]) {
  let engineerTarget208 = null;
  const selected208 = this.getSelectedUnits?.() || [];
  const hasEngineer208 = selected208.some(unit => unit?.alive !== false && (unit.typeId === 'worker' || unit.stats?.worker));
  if (hasEngineer208) {
    let bestDistance208 = Infinity;
    for (const building of this.buildings || []) {
      if (!building?.alive || building.team !== 'player' || building.completed || Number(building.construction) >= 1) continue;
      const distance208 = Math.hypot(Number(building.x) - Number(x), Number(building.y) - Number(y));
      const footprint208 = Math.max(28, Number(building.radius) || 40) + 18;
      if (distance208 <= footprint208 && distance208 < bestDistance208) {
        engineerTarget208 = building;
        bestDistance208 = distance208;
      }
    }
  }
  const target = engineerTarget208 || this.hitTestForContext?.(x,y) || this.hitTest?.(x,y,false);
  return { x,y,append:Boolean(append),targetId:target?.id||null,formationSettings:clonePlain(this.formationSettings) };
});
wrapGameAction('issueOrientedMove78', 'orientedMove', ([x,y,angle,append]) => ({ x,y,angle,append:Boolean(append),formationSettings:clonePlain(this.formationSettings) }), { present: marker('#a6edbd') });
wrapGameAction('issueCovertMission', 'covert', ([target,mission,append,units]) => target?.id ? ({ targetId:target.id,mission:mission||null,append:Boolean(append),unitIds:(units||[]).map(unit=>unit.id) }) : null);
wrapGameAction('placeBuilding', 'build', function([x,y,append,rotation]) {
  if (!this.buildMode?.typeId) return null;
  const workerIds = [...(this.buildMode.workerIds || [])];
  return { x,y,append:Boolean(append),rotation,typeId:this.buildMode.typeId,workerIds,selectedIds:workerIds };
}, { present(payload){ this.buildMode = null; this.commandMode = null; this.uiDirty = true; this.addEffect?.({type:'marker',x:payload.x,y:payload.y,color:'#a9d6b5',duration:.8}); } });
wrapGameAction('queueProduction', 'produce', ([building,itemId,kind='unit',silent=false]) => building?.id ? ({ buildingId:building.id,itemId,kind,silent }) : null, { passThrough: ([building,_item,_kind,silent]) => Boolean(silent && building?.team !== 'player') });
wrapGameAction('cancelQueueItem', 'cancelProduction', ([building,index]) => building?.id ? ({buildingId:building.id,index}) : null);
wrapGameAction('sellSelectedBuilding', 'sell', () => ({}));
wrapGameAction('executePower', 'power', function([power,x,y]) { return { power,x,y,powerState:this.commandPowerIntent202?.('player')||null }; }, { present: marker('#79d9ff') });
wrapGameAction('launchStrategicWeapon', 'strategic', ([weapon,x,y,team='player',launcherId=null]) => ({weapon,x,y,team,launcherId}), { passThrough: ([_w,_x,_y,team]) => team !== 'player', present: marker('#ff9b78') });
wrapGameAction('setRallyPoint91', 'rally', ([buildingOrId,x,y]) => ({buildingId:typeof buildingOrId==='string'?buildingOrId:buildingOrId?.id,x,y}));
wrapGameAction('applyUnitModification', 'modify', ([unit,variant,silent=false]) => unit?.id ? ({unitId:unit.id,variant,silent}) : null, { passThrough: ([_u,_v,silent]) => Boolean(silent) });
wrapGameAction('applyUnitModificationBatch132', 'modifyBatch', ([unitIds,variant,silent=false]) => ({unitIds:[...(unitIds||[])],variant,silent}), { passThrough: ([_u,_v,silent]) => Boolean(silent) });
wrapGameAction('issueLoadTransport95', 'loadTransport', ([transport,units,append]) => transport?.id ? ({transportId:transport.id,unitIds:(units||[]).map(unit=>unit.id),append:Boolean(append)}) : null);
wrapGameAction('unloadSelectedTransports78', 'unload', () => ({}));
wrapGameAction('issueAirReturn93', 'airReturn', () => ({}));
wrapGameAction('setLogisticsMission206', 'logisticsMission', ([payload]) => clonePlain(payload || {}));
wrapGameAction('setSupplyPriority206', 'logisticsPriority', ([payload]) => clonePlain(payload || {}));
wrapGameAction('setSupplyThreshold206', 'logisticsThreshold', ([payload]) => clonePlain(payload || {}));
wrapGameAction('configureTradeContract206', 'logisticsTrade', ([payload]) => clonePlain(payload || {}));
wrapGameAction('emergencyPurchase206', 'logisticsEmergencyImport', ([payload]) => clonePlain(payload || {}));
wrapGameAction('createSupplyTransport206', 'logisticsCreateTransport', ([payload]) => clonePlain(payload || {}));

Game.prototype.authoritativeWorkerDiagnostics172 = function() {
  const bridge = bridges.get(this);
  return bridge?.diagnostics() || { version: VERSION, build: BUILD, authoritative: false, reason: authoritativeAllowed(this) ? 'not-started' : 'multiplayer-legacy-path' };
};
Game.prototype.requestAuthoritativeSnapshot172 = function() { const bridge=bridges.get(this); if(!bridge?.worker)return false; bridge.worker.postMessage({type:'snapshotRequest'}); return true; };

window.addEventListener('message', event => {
  if (event.origin !== window.location.origin) return;
  const message = event.data || {};
  const handoff206 = window.__FD_MP_RESYNC_HANDOFF_206__;
  if (message.type === 'fd:mp-event' && message.event && handoff206?.active) {
    const networkSeq206 = Number(message.event.seq) || 0;
    const baseSeq206 = Number(handoff206.baseSeq) || 0;
    handoff206.events ||= [];
    if (networkSeq206 > baseSeq206 && !handoff206.events.some(item => String(item?.id || '') === String(message.event.id || '') || (Number(item?.seq) || 0) === networkSeq206)) {
      handoff206.events.push(clonePlain(message.event));
    }
    return;
  }
  const bridge = activeBridge || (D.game ? bridges.get(D.game) : null);
  if (!bridge || bridge.failed) return;
  if (message.type === 'fd:mp-event' && message.event) bridge.sendNetworkEvent(message.event);
  else if (message.type === 'fd:mp-host-tick') bridge.sendClock(message.tick);
  else if (message.type === 'fd:mp-start') bridge.worker?.postMessage({ type: 'multiplayer', multiplayer: bridge.multiplayerState() });
});

window.__FD_V172__ = {
  VERSION, BUILD,
  get bridge(){ return D.game ? bridges.get(D.game) || null : null; },
  diagnostics(){ return D.game?.authoritativeWorkerDiagnostics172?.() || null; },
  forceLegacy(enabled = true){ if (D.game) D.game._fdForceLegacySimulation172 = Boolean(enabled); }
};

const originalTitle = document.title;
void 0;
const eyebrow = document.querySelector('#start-screen .eyebrow');
if (eyebrow) void 0;
console.info('[Frontline Dominion] Authoritative Simulation Worker v16.4 build 174 loaded');
})();
