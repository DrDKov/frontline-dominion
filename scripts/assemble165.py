from pathlib import Path
import runpy, re

# Rebuild the known-good v16.4.3/build 178 first, then apply the v16.5 architecture delta.
runpy.run_path('scripts/assemble178.py', run_name='__main__')
OUT = Path('dist')


def replace_once(text, old, new, label):
    if old not in text:
        raise RuntimeError(f'v16.5 patch anchor missing: {label}')
    return text.replace(old, new, 1)

# ---------------------------------------------------------------------------
# Browser shell/version + F10 profiler.
# ---------------------------------------------------------------------------
p = OUT / 'frontline-dominion.html'
s = p.read_text('utf-8')
s = re.sub(r'<title>.*?</title>', '<title>Frontline Dominion v16.5 — Stable State Core</title>', s, count=1, flags=re.S)
s = re.sub(r'((?:/frontline-dominion/|/|\./)?authoritative-simulation-v174\.js)\?build=\d+', r'\1?build=179', s)
s = re.sub(r'((?:/frontline-dominion/|/|\./)?multiplayer-game-v96\.js)\?build=\d+', r'\1?build=179', s)
if 'stable-state-core-v165.js?build=179' not in s:
    tag = '<script src="./stable-state-core-v165.js?build=179"></script>\n'
    s = s.replace('</body>', tag + '</body>', 1) if '</body>' in s else s + '\n' + tag
p.write_text(s, 'utf-8')
(OUT / 'stable-state-core-v165.js').write_bytes((Path('overrides') / 'stable-state-core-v165.js').read_bytes())

# ---------------------------------------------------------------------------
# Main-thread authoritative bridge: optional SharedArrayBuffer triple buffer,
# separate building/minimap channels, immutable frame acquisition and metrics.
# ---------------------------------------------------------------------------
p = OUT / 'authoritative-simulation-v174.js'
s = p.read_text('utf-8')
s = replace_once(s, "const BUILD = 174;\nconst VERSION = '16.4';", "const BUILD = 179;\nconst VERSION = '16.5';", 'main version')
s = re.sub(r"new Worker\('/frontline-dominion/authoritative-simulation-worker-v174\.js\?build=\d+'\)", "new Worker('/frontline-dominion/authoritative-simulation-worker-v174.js?build=179')", s, count=1)

shared_defs = r'''
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
'''
anchor = "const authoritativeAllowed = game => typeof Worker !== 'undefined' && !game?._fdForceLegacySimulation172;\n"
s = replace_once(s, anchor, anchor + shared_defs, 'main shared definitions')

constructor_anchor = "    this.snapshotBytes = 0;\n"
constructor_add = """    this.transportMode165 = 'transfer-fallback';
    this.shared165 = null;
    this.sharedSequence165 = 0;
    this.sharedFallbacks165 = 0;
    this.buildingStateSequence165 = 0;
    this.minimapStateSequence165 = 0;
    this.buildingBytes165 = 0;
    this.minimapBytes165 = 0;
    this.lastApplyMs165 = 0;
    this.lastSnapshotLatency165 = 0;
"""
s = replace_once(s, constructor_anchor, constructor_anchor + constructor_add, 'main constructor metrics')

constructor_tail = "    this.installPauseProxy();\n    this.disableOldWorkerMirror();\n    this.launch();\n"
constructor_tail_new = """    this.installPauseProxy();
    this.disableOldWorkerMirror();
    window.__FD_STABLE_STATE165__ = { version: '16.5', build: 179, bridge: this, transport: this.transportMode165, counts: {} };
    this.launch();
"""
s = replace_once(s, constructor_tail, constructor_tail_new, 'main state exposure')

launch_anchor = """      const initial = captureInitialState(this.game);
      this.worker = new Worker('/frontline-dominion/authoritative-simulation-worker-v174.js?build=179');
"""
launch_new = """      const initial = captureInitialState(this.game);
      const stableTransport165 = createSharedTransport165();
      this.shared165 = stableTransport165?.local || null;
      this.transportMode165 = this.shared165 ? 'shared-triple' : 'transfer-fallback';
      if (window.__FD_STABLE_STATE165__) window.__FD_STABLE_STATE165__.transport = this.transportMode165;
      this.worker = new Worker('/frontline-dominion/authoritative-simulation-worker-v174.js?build=179');
"""
s = replace_once(s, launch_anchor, launch_new, 'main launch transport')

init_payload_old = """        type: 'init', saveData: initial.saveData, authoritative: initial.authoritative,
        projectiles: initial.projectiles, paused: this._paused, manual: false, multiplayer: this.multiplayerState()
"""
init_payload_new = """        type: 'init', saveData: initial.saveData, authoritative: initial.authoritative,
        projectiles: initial.projectiles, paused: this._paused, manual: false, multiplayer: this.multiplayerState(),
        shared165: stableTransport165?.descriptor || null
"""
s = replace_once(s, init_payload_old, init_payload_new, 'main init shared descriptor')

ready_alert = "      this.game.alert?.('Авторитетная симуляция перенесена в отдельный Worker · 25 Гц', 'info');\n"
ready_new = """      if (window.__FD_STABLE_STATE165__) window.__FD_STABLE_STATE165__.transport = this.transportMode165;
      this.game.alert?.(`Stable State Core · Worker 25 Гц · ${this.transportMode165 === 'shared-triple' ? 'SAB triple buffer' : 'transfer fallback'}`, 'info');
"""
s = replace_once(s, ready_alert, ready_new, 'main ready alert')

snapshot_dispatch = """    if (message.type === 'snapshot') {
      this.applySnapshot(message);
      return;
    }
"""
snapshot_dispatch_new = """    if (message.type === 'buildingState165') {
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
"""
s = replace_once(s, snapshot_dispatch, snapshot_dispatch_new, 'main state channel dispatch')

methods165 = r'''
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

'''
apply_anchor = "  applySnapshot(message) {\n"
s = replace_once(s, apply_anchor, methods165 + apply_anchor, 'main stable methods')

stale_old = """  applySnapshot(message) {
    if (message.sequence <= this.lastSnapshotSequence) return;
    this.lastSnapshotSequence = message.sequence;
    this.applying = true;
    const game = this.game;
    try {
"""
stale_new = """  applySnapshot(message) {
    if (message.sequence <= this.lastSnapshotSequence) { this.releaseSharedMessage165(message); return; }
    this.lastSnapshotSequence = message.sequence;
    this.applying = true;
    const game = this.game;
    const applyStarted165 = performance.now();
    let sharedFrame165 = null;
    try {
"""
s = replace_once(s, stale_old, stale_new, 'main snapshot acquire prelude')

apply_hot_old = """      this.applyUnits(message.unitIds, message.unitFloats, message.unitInts);
      this.applyBuildings(message.buildingIds, message.buildingFloats, message.buildingInts);
      this.applyResources(message.resourceIds, message.resourceFloats);
"""
apply_hot_new = """      sharedFrame165 = this.acquireSharedFrame165(message);
      if (sharedFrame165) this.applyUnits(sharedFrame165.unitIds, sharedFrame165.unitFloats, sharedFrame165.unitInts);
      else this.applyUnits(message.unitIds, message.unitFloats, message.unitInts);
      if (message.buildingIds) this.applyBuildings(message.buildingIds, message.buildingFloats, message.buildingInts);
      this.applyResources(message.resourceIds, message.resourceFloats);
"""
s = replace_once(s, apply_hot_old, apply_hot_new, 'main shared unit apply')

projectile_apply_old = "      this.applyProjectiles(message.projectileIds, message.projectileFloats, message.projectileInts);\n"
projectile_apply_new = """      if (sharedFrame165) this.applyProjectiles(sharedFrame165.projectileIds, sharedFrame165.projectileFloats, sharedFrame165.projectileInts);
      else this.applyProjectiles(message.projectileIds, message.projectileFloats, message.projectileInts);
"""
s = replace_once(s, projectile_apply_old, projectile_apply_new, 'main shared projectile apply')

render_ids_old = "      this.renderUnitIds = Array.from(message.renderUnitIds || [], entityId).filter(Boolean);\n"
render_ids_new = "      this.renderUnitIds = Array.from(sharedFrame165?.renderIds || message.renderUnitIds || [], entityId).filter(Boolean);\n"
s = replace_once(s, render_ids_old, render_ids_new, 'main shared render ids')

snapshot_metrics_anchor = "      this.appliedNetworkSeq = Math.max(this.appliedNetworkSeq, Number(message.appliedSeq) || 0);\n"
snapshot_metrics_new = snapshot_metrics_anchor + """      this.lastSnapshotLatency165 = Math.max(0, Date.now() - (Number(message.wallClock165) || Date.now()));
      this.sharedFallbacks165 = Number(message.sharedFallbacks165) || this.sharedFallbacks165;
      if (window.__FD_STABLE_STATE165__) window.__FD_STABLE_STATE165__.counts = { ...(message.counts || {}) };
"""
s = replace_once(s, snapshot_metrics_anchor, snapshot_metrics_new, 'main latency metrics')

finally_old = """    } finally {
      this.applying = false;
    }
  }
"""
finally_new = """    } finally {
      this.releaseSharedFrame165(sharedFrame165);
      this.lastApplyMs165 = performance.now() - applyStarted165;
      this.applying = false;
    }
  }
"""
s = replace_once(s, finally_old, finally_new, 'main shared release')
p.write_text(s, 'utf-8')

# ---------------------------------------------------------------------------
# Worker: hot-state SAB views, building deltas, independent atomic minimap/FOW.
# ---------------------------------------------------------------------------
p = OUT / 'authoritative-simulation-worker-v174.js'
s = p.read_text('utf-8')
s = replace_once(s, "const BUILD = 174;\nconst VERSION = '16.4';", "const BUILD = 179;\nconst VERSION = '16.5';", 'worker version')
s = s.replace('/authoritative-simulation-bundle-v172.js?build=178', '/authoritative-simulation-bundle-v172.js?build=179')

worker_vars_anchor = "let multiplayer = { active: false, role: null, mode: 'coop', perspectiveSwapped: false, hostTick: null, hostTickReceivedAt: 0, appliedSeq: 0 };\n"
worker_vars = r'''
let shared165 = null;
let sharedFallbacks165 = 0;
let buildingStateSequence165 = 0;
let minimapStateSequence165 = 0;
let lastBuildingStateTick165 = -1;
let lastMinimapStateTick165 = -1;
let buildingStateCache165 = new Map();
let buildingDetailCache165 = new Map();

function attachShared165(desc) {
  shared165 = null;
  if (!desc || typeof SharedArrayBuffer === 'undefined' || typeof Atomics === 'undefined') return;
  try {
    shared165 = {
      ...desc,
      header: new Int32Array(desc.headerBuffer), unitIds: new Uint32Array(desc.unitIdsBuffer),
      unitFloats: new Float32Array(desc.unitFloatsBuffer), unitInts: new Int32Array(desc.unitIntsBuffer),
      projectileIds: new Uint32Array(desc.projectileIdsBuffer), projectileFloats: new Float32Array(desc.projectileFloatsBuffer),
      projectileInts: new Int32Array(desc.projectileIntsBuffer), renderIds: new Uint32Array(desc.renderIdsBuffer)
    };
  } catch (error) {
    shared165 = null;
  }
}

function reserveSharedSlot165(unitCount, projectileCount, renderCount) {
  if (!shared165 || unitCount > shared165.maxUnits || projectileCount > shared165.maxProjectiles || renderCount > shared165.maxRenderIds) {
    if (shared165) sharedFallbacks165 += 1;
    return -1;
  }
  for (let slot = 0; slot < shared165.slots; slot += 1) {
    const base = slot * shared165.metaStride;
    if (Atomics.compareExchange(shared165.header, base + 5, 0, 1) === 0) return slot;
  }
  sharedFallbacks165 += 1;
  return -1;
}

function publishSharedSlot165(slot, sequence, tick, unitCount, projectileCount, renderCount) {
  if (slot < 0 || !shared165) return;
  const base = slot * shared165.metaStride;
  Atomics.store(shared165.header, base, sequence | 0);
  Atomics.store(shared165.header, base + 1, tick | 0);
  Atomics.store(shared165.header, base + 2, unitCount | 0);
  Atomics.store(shared165.header, base + 3, projectileCount | 0);
  Atomics.store(shared165.header, base + 4, renderCount | 0);
  Atomics.store(shared165.header, base + 5, 2);
}
'''
s = replace_once(s, worker_vars_anchor, worker_vars_anchor + worker_vars, 'worker stable globals')

init_anchor = """function initGame(message) {
  const saveData = message.saveData || null;
"""
init_new = """function initGame(message) {
  const saveData = message.saveData || null;
  attachShared165(message.shared165 || null);
"""
s = replace_once(s, init_anchor, init_new, 'worker attach shared')

reset_anchor = """  lastMiniTick = -1;
  lastDetailsTick = -1;
"""
reset_new = """  lastMiniTick = -1;
  lastDetailsTick = -1;
  lastBuildingStateTick165 = -1;
  lastMinimapStateTick165 = -1;
  buildingStateSequence165 = 0;
  minimapStateSequence165 = 0;
  buildingStateCache165 = new Map();
  buildingDetailCache165 = new Map();
  sharedFallbacks165 = 0;
"""
s = replace_once(s, reset_anchor, reset_new, 'worker stable reset')

# Buildings no longer ride the hot snapshot as rich details.
dynamic_buildings_old = "  for (const building of game.buildings) if (building.alive) records.push(serializeEntity(building));\n"
s = replace_once(s, dynamic_buildings_old, '', 'worker remove buildings from dynamic details')

channels165 = r'''
function buildingStateSignature165(building) {
  return [
    Math.round(finite(building.x) * 8), Math.round(finite(building.y) * 8), Math.round(finite(building.rotation) * 4096),
    Math.round(finite(building.hp) * 10), Math.round(finite(building.maxHp, 1) * 10), Math.round(finite(building.construction, 1) * 1000),
    Math.round(finite(building.weaponRotation) * 4096), Math.round(finite(building.desiredWeaponRotation) * 4096),
    Math.round(finite(building.weaponCooldown) * 100), Math.round(finite(building.recoil) * 100),
    Math.round(finite(building.captureProgress) * 1000), Math.round(finite(building.sabotagedUntil) * 10), Math.round(finite(building.compromisedUntil) * 10),
    TEAM_CODES[building.team] || 0, idNumber(building.weaponTargetId), building.queue?.length || 0, building.completed ? 1 : 0
  ].join(',');
}

function buildingDetailSignature165(building) {
  const q = (building.queue || []).slice(0, 8).map(item => [item.kind || '', item.itemId || item.typeId || '', Math.round(finite(item.progress) * 1000)]);
  const r = building.rallyPoint ? [Math.round(finite(building.rallyPoint.x)), Math.round(finite(building.rallyPoint.y))] : null;
  return JSON.stringify([q, r, building.completed ? 1 : 0, building.team, building.powered === false ? 0 : 1]);
}

function sendBuildingState165(force = false) {
  if (!game) return;
  const tick = game.simTick || 0;
  if (!force && tick - lastBuildingStateTick165 < 5) return;
  lastBuildingStateTick165 = tick;
  const alive = game.buildings.filter(building => building.alive);
  const changed = [];
  const details = [];
  const aliveIds = new Set();
  for (const building of alive) {
    aliveIds.add(building.id);
    const sig = buildingStateSignature165(building);
    if (force || buildingStateCache165.get(building.id) !== sig) {
      buildingStateCache165.set(building.id, sig);
      changed.push(building);
    }
    const detailSig = buildingDetailSignature165(building);
    if (force || buildingDetailCache165.get(building.id) !== detailSig) {
      buildingDetailCache165.set(building.id, detailSig);
      details.push(serializeEntity(building));
    }
  }
  for (const id of [...buildingStateCache165.keys()]) if (!aliveIds.has(id)) buildingStateCache165.delete(id);
  for (const id of [...buildingDetailCache165.keys()]) if (!aliveIds.has(id)) buildingDetailCache165.delete(id);
  if (!force && !changed.length && !details.length) return;
  const ids = new Uint32Array(changed.length);
  const floats = new Float32Array(changed.length * BUILDING_FLOAT_STRIDE);
  const ints = new Int32Array(changed.length * BUILDING_INT_STRIDE);
  for (let index = 0; index < changed.length; index += 1) {
    const building = changed[index], f = index * BUILDING_FLOAT_STRIDE, n = index * BUILDING_INT_STRIDE;
    ids[index] = idNumber(building.id);
    floats[f] = finite(building.x); floats[f+1] = finite(building.y); floats[f+2] = finite(building.rotation);
    floats[f+3] = finite(building.hp); floats[f+4] = finite(building.maxHp, 1); floats[f+5] = finite(building.construction, 1);
    floats[f+6] = finite(building.weaponRotation); floats[f+7] = finite(building.desiredWeaponRotation); floats[f+8] = finite(building.weaponCooldown);
    floats[f+9] = finite(building.recoil); floats[f+10] = finite(building.captureProgress); floats[f+11] = finite(building.sabotagedUntil); floats[f+12] = finite(building.compromisedUntil);
    ints[n] = TEAM_CODES[building.team] || 0; ints[n+1] = 1; ints[n+2] = idNumber(building.weaponTargetId);
    ints[n+3] = building.queue?.length || 0; ints[n+4] = building.completed ? 1 : 0;
  }
  const bytes165 = ids.byteLength + floats.byteLength + ints.byteLength;
  postMessage({ type: 'buildingState165', sequence: ++buildingStateSequence165, tick, buildingIds: ids, buildingFloats: floats, buildingInts: ints, details, bytes165 }, [ids.buffer, floats.buffer, ints.buffer]);
}

function sendMinimapState165(force = false) {
  if (!game) return;
  const tick = game.simTick || 0;
  if (!force && tick - lastMinimapStateTick165 < 5) return;
  lastMinimapStateTick165 = tick;
  const visible = game.visible.slice();
  const explored = game.explored.slice();
  const miniCells = makeMiniCells();
  const bytes165 = visible.byteLength + explored.byteLength + miniCells.length * 40;
  postMessage({ type: 'minimapState165', sequence: ++minimapStateSequence165, tick, visible, explored, miniCells, bytes165 }, [visible.buffer, explored.buffer]);
}

'''
make_snapshot_anchor = "function makeSnapshot(force = false, simMs = 0) {\n"
s = replace_once(s, make_snapshot_anchor, channels165 + make_snapshot_anchor, 'worker separate channels')

# Prepare projectile count before reserving the hot shared slot.
unit_alloc_old = """  const unitIds = new Uint32Array(units.length);
  const unitFloats = new Float32Array(units.length * UNIT_FLOAT_STRIDE);
  const unitInts = new Int32Array(units.length * UNIT_INT_STRIDE);
"""
unit_alloc_new = """  const aliveProjectiles165 = game.projectiles.filter(projectile => projectile.alive);
  const sharedSlot165 = reserveSharedSlot165(units.length, aliveProjectiles165.length, render.unitIds.length);
  const unitBase165 = sharedSlot165 >= 0 ? sharedSlot165 * shared165.maxUnits : 0;
  const unitIds = sharedSlot165 >= 0 ? shared165.unitIds.subarray(unitBase165, unitBase165 + units.length) : new Uint32Array(units.length);
  const unitFloats = sharedSlot165 >= 0 ? shared165.unitFloats.subarray(unitBase165 * UNIT_FLOAT_STRIDE, (unitBase165 + units.length) * UNIT_FLOAT_STRIDE) : new Float32Array(units.length * UNIT_FLOAT_STRIDE);
  const unitInts = sharedSlot165 >= 0 ? shared165.unitInts.subarray(unitBase165 * UNIT_INT_STRIDE, (unitBase165 + units.length) * UNIT_INT_STRIDE) : new Int32Array(units.length * UNIT_INT_STRIDE);
"""
s = replace_once(s, unit_alloc_old, unit_alloc_new, 'worker shared unit views')

# Strip per-frame building arrays; the separate delta channel owns them.
building_block_re = re.compile(r"\n  const buildings = game\.buildings\.filter\(building => building\.alive\);\n  const buildingIds = new Uint32Array\(buildings\.length\);.*?\n  }\n\n  const resources =", re.S)
m = building_block_re.search(s)
if not m:
    raise RuntimeError('v16.5 patch anchor missing: worker building block')
building_replacement = "\n  const buildings = game.buildings.filter(building => building.alive);\n\n  const resources ="
s = s[:m.start()] + building_replacement + s[m.end():]

projectile_alloc_old = """  const projectiles = game.projectiles.filter(projectile => projectile.alive);
  const projectileIds = new Uint32Array(projectiles.length);
  const projectileFloats = new Float32Array(projectiles.length * PROJECTILE_FLOAT_STRIDE);
  const projectileInts = new Int32Array(projectiles.length * PROJECTILE_INT_STRIDE);
"""
projectile_alloc_new = """  const projectiles = aliveProjectiles165;
  const projectileBase165 = sharedSlot165 >= 0 ? sharedSlot165 * shared165.maxProjectiles : 0;
  const projectileIds = sharedSlot165 >= 0 ? shared165.projectileIds.subarray(projectileBase165, projectileBase165 + projectiles.length) : new Uint32Array(projectiles.length);
  const projectileFloats = sharedSlot165 >= 0 ? shared165.projectileFloats.subarray(projectileBase165 * PROJECTILE_FLOAT_STRIDE, (projectileBase165 + projectiles.length) * PROJECTILE_FLOAT_STRIDE) : new Float32Array(projectiles.length * PROJECTILE_FLOAT_STRIDE);
  const projectileInts = sharedSlot165 >= 0 ? shared165.projectileInts.subarray(projectileBase165 * PROJECTILE_INT_STRIDE, (projectileBase165 + projectiles.length) * PROJECTILE_INT_STRIDE) : new Int32Array(projectiles.length * PROJECTILE_INT_STRIDE);
"""
s = replace_once(s, projectile_alloc_old, projectile_alloc_new, 'worker shared projectile views')

old_due = """  const fogDue = force || tick - lastFogTick >= 5;
  const miniDue = force || tick - lastMiniTick >= 8;
  const detailsDue = force || tick - lastDetailsTick >= (game.units.length >= 16000 ? 10 : 5);
  const structureDue = force || createdEntities.length || removedEntities.length || createdProjectiles.length || removedProjectiles.length || tick - lastStructureTick >= 25;
  const visible = fogDue ? game.visible.slice() : null;
  const explored = fogDue ? game.explored.slice() : null;
  if (fogDue) lastFogTick = tick;
  if (miniDue) lastMiniTick = tick;
  if (detailsDue) lastDetailsTick = tick;
  if (structureDue) lastStructureTick = tick;
"""
new_due = """  const detailsDue = force || tick - lastDetailsTick >= (game.units.length >= 16000 ? 10 : 5);
  const structureDue = force || createdEntities.length || removedEntities.length || createdProjectiles.length || removedProjectiles.length || tick - lastStructureTick >= 25;
  if (detailsDue) lastDetailsTick = tick;
  if (structureDue) lastStructureTick = tick;
"""
s = replace_once(s, old_due, new_due, 'worker remove minimap from hot snapshot')

message_start_old = """  const message = {
    type: 'snapshot', version: VERSION, build: BUILD, sequence: ++snapshotSequence,
"""
message_start_new = """  const sequence165 = ++snapshotSequence;
  if (sharedSlot165 >= 0) {
    const renderBase165 = sharedSlot165 * shared165.maxRenderIds;
    shared165.renderIds.subarray(renderBase165, renderBase165 + render.unitIds.length).set(render.unitIds);
    publishSharedSlot165(sharedSlot165, sequence165, tick, units.length, projectiles.length, render.unitIds.length);
  }
  const message = {
    type: 'snapshot', version: VERSION, build: BUILD, sequence: sequence165, wallClock165: Date.now(),
"""
s = replace_once(s, message_start_old, message_start_new, 'worker publish shared sequence')

message_arrays_old = """    unitIds, unitFloats, unitInts, buildingIds, buildingFloats, buildingInts, resourceIds, resourceFloats,
    projectileIds, projectileFloats, projectileInts,
    renderUnitIds: render.unitIds, clusters: render.clusters,
"""
message_arrays_new = """    unitIds: sharedSlot165 >= 0 ? null : unitIds, unitFloats: sharedSlot165 >= 0 ? null : unitFloats, unitInts: sharedSlot165 >= 0 ? null : unitInts,
    buildingIds: null, buildingFloats: null, buildingInts: null, resourceIds, resourceFloats,
    projectileIds: sharedSlot165 >= 0 ? null : projectileIds, projectileFloats: sharedSlot165 >= 0 ? null : projectileFloats, projectileInts: sharedSlot165 >= 0 ? null : projectileInts,
    renderUnitIds: sharedSlot165 >= 0 ? null : render.unitIds, sharedSlot165, sharedFallbacks165, clusters: render.clusters,
"""
s = replace_once(s, message_arrays_old, message_arrays_new, 'worker hot message arrays')

mini_fields_old = """    details: detailsDue ? dynamicDetails(force) : [],
    visible, explored, miniCells: miniDue ? makeMiniCells() : null,
"""
mini_fields_new = """    details: detailsDue ? dynamicDetails(force) : [],
    visible: null, explored: null, miniCells: null,
"""
s = replace_once(s, mini_fields_old, mini_fields_new, 'worker hot message minimap fields')

snapshot_bytes_old = "snapshotBytes: unitIds.byteLength + unitFloats.byteLength + unitInts.byteLength + buildingIds.byteLength + buildingFloats.byteLength + buildingInts.byteLength + resourceIds.byteLength + resourceFloats.byteLength + projectileIds.byteLength + projectileFloats.byteLength + projectileInts.byteLength + render.unitIds.byteLength"
snapshot_bytes_new = "snapshotBytes: (sharedSlot165 >= 0 ? 0 : unitIds.byteLength + unitFloats.byteLength + unitInts.byteLength + projectileIds.byteLength + projectileFloats.byteLength + projectileInts.byteLength + render.unitIds.byteLength) + resourceIds.byteLength + resourceFloats.byteLength, transport165: sharedSlot165 >= 0 ? 'shared-triple' : 'transfer-fallback'"
s = replace_once(s, snapshot_bytes_old, snapshot_bytes_new, 'worker snapshot byte metrics')

transfers_old = """  const transfers = [
    unitIds.buffer, unitFloats.buffer, unitInts.buffer,
    buildingIds.buffer, buildingFloats.buffer, buildingInts.buffer,
    resourceIds.buffer, resourceFloats.buffer,
    projectileIds.buffer, projectileFloats.buffer, projectileInts.buffer,
    render.unitIds.buffer
  ];
  if (visible) transfers.push(visible.buffer);
  if (explored) transfers.push(explored.buffer);
  postMessage(message, transfers);
  lastSnapshotTick = tick;
"""
transfers_new = """  const transfers = [resourceIds.buffer, resourceFloats.buffer];
  if (sharedSlot165 < 0) transfers.push(unitIds.buffer, unitFloats.buffer, unitInts.buffer, projectileIds.buffer, projectileFloats.buffer, projectileInts.buffer, render.unitIds.buffer);
  postMessage(message, transfers);
  sendBuildingState165(force);
  sendMinimapState165(force);
  lastSnapshotTick = tick;
"""
s = replace_once(s, transfers_old, transfers_new, 'worker transfer list and stable channels')
p.write_text(s, 'utf-8')

# ---------------------------------------------------------------------------
# Final version labels.
# ---------------------------------------------------------------------------
(OUT / 'index.html').write_text(
    '<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    '<title>Frontline Dominion v16.5</title><meta http-equiv="refresh" content="0; url=./frontline-dominion.html?build=179"></head>'
    '<body><a href="./frontline-dominion.html?build=179">Запустить Frontline Dominion v16.5</a></body></html>',
    'utf-8'
)
print('Stable State Core v16.5 build 179 assembled')