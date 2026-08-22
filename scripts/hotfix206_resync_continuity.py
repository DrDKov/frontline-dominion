from pathlib import Path

BUILD = 206
OUT = Path('dist')
worker_path = OUT / 'authoritative-simulation-worker-v174.js'
module_path = OUT / 'resync-continuity-v206.js'

if not worker_path.exists():
    raise RuntimeError('build 206 Worker missing before resync continuity hotfix')

module = r'''(() => {
  'use strict';
  const root = globalThis;
  const D = root.__FD_DEBUG__;
  const Game = D?.Game;
  if (!Game?.prototype || root.__FD_RESYNC_CONTINUITY_206__) return;

  const VERSION = '16.9.0';
  const BUILD = 206;
  const MAX_ARRAY = 768;
  const MAX_KEYS = 256;
  const UNIT_EXCLUDED = new Set(['game','stats','weapons','weapon','selected','logistics206']);
  const GAME_EXCLUDED = new Set([
    'units','buildings','resources','projectiles','formations','teams','ai','rng','stats','camera','canvas','ctx',
    'selectedUnits','selectedBuilding','effects','particles','spatialGrid','operationalCore160','logistics206',
    // mass-simulation-core-v163 owns these runtime objects. `_v163.hot` is a
    // HotState163 instance with typed-array storage and reset()/push() methods;
    // serializing the surrounding plain object drops that class instance and
    // produces a poisoned `{hot: undefined}` runtime after resync. Rebuild the
    // entire v163 runtime in the replacement Worker on its first fixed tick.
    '_v163','_v163Installed'
  ]);
  const AI_TRANSIENT_FIELD = /(?:^_|timer|cooldown|epoch|cycle|phase|next|last|expires|budget|clock|cursor|cadence|interval|metric|picture|plan|operation)/i;
  const GAME_TRANSIENT_FIELD = /(?:^_|timer|cooldown|epoch|cycle|phase|next|last|expires|budget|clock|cursor|cadence|interval|accumulator|counter)/i;

  const cloneValue = (value, depth = 0, seen = new WeakSet()) => {
    if (value == null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value === 'bigint') return Number(value);
    if (typeof value === 'function' || typeof value === 'symbol') return undefined;
    if (depth > 6 || typeof value !== 'object') return undefined;
    if (seen.has(value)) return undefined;
    seen.add(value);
    if (Array.isArray(value)) {
      const out = [];
      for (const item of value.slice(0, MAX_ARRAY)) {
        const copy = cloneValue(item, depth + 1, seen);
        if (copy !== undefined) out.push(copy);
      }
      seen.delete(value);
      return out;
    }
    if (value instanceof Map) {
      const entries = [];
      let count = 0;
      for (const [key, item] of value) {
        if (count++ >= MAX_ARRAY) break;
        const copy = cloneValue(item, depth + 1, seen);
        if (copy !== undefined) entries.push([String(key), copy]);
      }
      seen.delete(value);
      return { __map206: entries };
    }
    if (value instanceof Set) {
      const values = [];
      let count = 0;
      for (const item of value) {
        if (count++ >= MAX_ARRAY) break;
        const copy = cloneValue(item, depth + 1, seen);
        if (copy !== undefined) values.push(copy);
      }
      seen.delete(value);
      return { __set206: values };
    }
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) {
      if (value.id != null) {
        seen.delete(value);
        return { __entityRef206: String(value.id) };
      }
      seen.delete(value);
      return undefined;
    }
    const out = {};
    let count = 0;
    for (const key of Object.keys(value)) {
      if (count++ >= MAX_KEYS || key === 'game') continue;
      const copy = cloneValue(value[key], depth + 1, seen);
      if (copy !== undefined) out[key] = copy;
    }
    seen.delete(value);
    return out;
  };

  const materialize = (game, value) => {
    if (Array.isArray(value)) return value.map(item => materialize(game, item));
    if (!value || typeof value !== 'object') return value;
    if (value.__entityRef206 != null) return game.getEntity?.(value.__entityRef206) || null;
    if (Array.isArray(value.__map206)) return new Map(value.__map206.map(([key,item]) => [key, materialize(game, item)]));
    if (Array.isArray(value.__set206)) return new Set(value.__set206.map(item => materialize(game, item)));
    const out = {};
    for (const [key,item] of Object.entries(value)) out[key] = materialize(game, item);
    return out;
  };

  // A replacement Worker must resume from the exact deterministic object state,
  // not merely from fields whose names happen to look like navigation fields.
  // Persistent combat/logistics fields are already in the normal save; copying
  // them again from the same authoritative tick is harmless and catches legacy
  // prevX/lastX/steering caches that Unit.serialize historically omitted.
  const captureUnit = unit => {
    const fields = {};
    for (const key of Object.getOwnPropertyNames(unit || {})) {
      if (UNIT_EXCLUDED.has(key)) continue;
      const copy = cloneValue(unit[key]);
      if (copy !== undefined) fields[key] = copy;
    }
    return { id: String(unit?.id ?? ''), fields };
  };

  const formationEntries = game => {
    const source = game?.formations;
    if (source instanceof Map) return [...source.entries()];
    if (Array.isArray(source)) return source.map((group, index) => [group?.id ?? index, group]);
    if (source && typeof source === 'object') return Object.entries(source);
    return [];
  };

  const captureFormation = ([key, group]) => ({
    id: String(group?.id ?? key),
    state: cloneValue(group),
    path: cloneValue(group?.path),
    pathIndex: Number(group?.pathIndex) || 0,
    anchorX: Number(group?.anchorX),
    anchorY: Number(group?.anchorY),
    angle: Number(group?.angle),
    arrived: Boolean(group?.arrived),
    completed: Boolean(group?.completed),
    march183: cloneValue(group?.march183),
    obstacleRecovery196: cloneValue(group?._fdObstacleRecovery196),
  });

  const capturePrivateLogistics = game => {
    const source = game?.logistics206;
    const out = {};
    if (!source || typeof source !== 'object') return out;
    for (const key of Object.keys(source)) {
      if (!key.startsWith('_')) continue;
      const copy = cloneValue(source[key]);
      if (copy !== undefined) out[key] = copy;
    }
    return out;
  };

  const captureGameTransient = game => {
    const out = {};
    for (const key of Object.getOwnPropertyNames(game || {})) {
      if (GAME_EXCLUDED.has(key) || !GAME_TRANSIENT_FIELD.test(key)) continue;
      const copy = cloneValue(game[key]);
      if (copy !== undefined) out[key] = copy;
    }
    return out;
  };

  const captureAITransient = ai => {
    const out = {};
    for (const key of Object.getOwnPropertyNames(ai || {})) {
      if (key === 'game' || !AI_TRANSIENT_FIELD.test(key)) continue;
      const copy = cloneValue(ai[key]);
      if (copy !== undefined) out[key] = copy;
    }
    return out;
  };

  Game.prototype.exportWorkerTransient206 = function() {
    return {
      version: VERSION,
      build: BUILD,
      tick: Number(this.simTick) || 0,
      logisticsPrivate: capturePrivateLogistics(this),
      gameTransient: captureGameTransient(this),
      aiTransient: captureAITransient(this.ai),
      units: (this.units || []).filter(unit => unit?.alive).map(captureUnit),
      formations: formationEntries(this).map(captureFormation),
    };
  };

  const findFormation = (game, id) => {
    const source = game?.formations;
    if (source instanceof Map) return source.get(id) || source.get(String(id)) || [...source.values()].find(group => String(group?.id) === String(id)) || null;
    if (Array.isArray(source)) return source.find(group => String(group?.id) === String(id)) || null;
    return source?.[id] || source?.[String(id)] || null;
  };

  const restoreFields = (game, target, fields, excluded = null) => {
    if (!target || !fields || typeof fields !== 'object') return;
    for (const [key,value] of Object.entries(fields)) {
      if (excluded?.has(key)) continue;
      try { target[key] = materialize(game, value); } catch (_) {}
    }
  };

  Game.prototype.importWorkerTransient206 = function(snapshot) {
    if (!snapshot || Number(snapshot.build) !== BUILD) return false;

    // Restore sub-tick phases before the next simulation step. In particular,
    // resource-economy-v206 uses _incomeAccumulator206 and
    // _importAccumulator206; resetting either to zero changes Money/import
    // timing within a few ticks after multiplayer resync.
    if (this.logistics206 && snapshot.logisticsPrivate) {
      restoreFields(this, this.logistics206, snapshot.logisticsPrivate);
    }
    restoreFields(this, this, snapshot.gameTransient, GAME_EXCLUDED);
    if (this.ai) restoreFields(this, this.ai, snapshot.aiTransient, new Set(['game']));

    for (const record of snapshot.units || []) {
      const unit = this.getEntity?.(record.id);
      if (!unit?.alive || unit.kind !== 'unit') continue;
      restoreFields(this, unit, record.fields, UNIT_EXCLUDED);
      unit.game = this;
    }
    for (const record of snapshot.formations || []) {
      const group = findFormation(this, record.id);
      if (!group) continue;
      if (record.state && typeof record.state === 'object') restoreFields(this, group, record.state, new Set(['game']));
      if (record.path !== undefined) group.path = materialize(this, record.path);
      if (Number.isFinite(record.pathIndex)) group.pathIndex = record.pathIndex;
      if (Number.isFinite(record.anchorX)) group.anchorX = record.anchorX;
      if (Number.isFinite(record.anchorY)) group.anchorY = record.anchorY;
      if (Number.isFinite(record.angle)) group.angle = record.angle;
      group.arrived = Boolean(record.arrived);
      group.completed = Boolean(record.completed);
      if (record.march183 !== undefined) group.march183 = materialize(this, record.march183);
      if (record.obstacleRecovery196 !== undefined) {
        const restored = materialize(this, record.obstacleRecovery196);
        try {
          Object.defineProperty(group, '_fdObstacleRecovery196', { configurable: true, writable: true, enumerable: false, value: restored });
        } catch (_) { group._fdObstacleRecovery196 = restored; }
      }
    }
    return true;
  };

  const baseHydrate = Game.prototype.hydrate;
  if (typeof baseHydrate === 'function') {
    Game.prototype.hydrate = function hydrateWithWorkerContinuity206(data, ...rest) {
      const result = baseHydrate.call(this, data, ...rest);
      if (data?.workerTransient206) this.importWorkerTransient206(data.workerTransient206);
      return result;
    };
  }

  root.__FD_RESYNC_CONTINUITY_206__ = { version: VERSION, build: BUILD };
})();
'''
module_path.write_text(module, 'utf-8')

worker = worker_path.read_text('utf-8')
import_anchor = "importScripts('/frontline-dominion/ai-logistics-v206.js?build=206');"
import_line = "importScripts('/frontline-dominion/resync-continuity-v206.js?build=206');"
if import_line not in worker:
    if worker.count(import_anchor) != 1:
        raise RuntimeError(f'build 206 resync continuity import anchor count={worker.count(import_anchor)}')
    worker = worker.replace(import_anchor, import_anchor + '\n' + import_line, 1)

save_anchor = '  data.logistics206 = game.exportLogistics206?.() || null;\n'
save_line = '  data.workerTransient206 = game.exportWorkerTransient206?.() || null;\n'
if save_line not in worker:
    if worker.count(save_anchor) != 1:
        raise RuntimeError(f'build 206 resync continuity save anchor count={worker.count(save_anchor)}')
    worker = worker.replace(save_anchor, save_anchor + save_line, 1)

worker_path.write_text(worker, 'utf-8')
print('Build 206 authoritative resync preserves complete unit, formation, AI and economy transient state')
