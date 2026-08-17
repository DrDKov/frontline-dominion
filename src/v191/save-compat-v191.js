(() => {
  'use strict';

  const root = globalThis;
  if (root.__FD_SAVE_COMPAT_191__) return;

  const VERSION = '16.8.7';
  const BUILD = 191;
  const DEFAULT_KEY = 'frontline-dominion-save-v5';
  const KEY_PREFIX = 'frontline-dominion-save';
  const WRAPPER_KEYS = Object.freeze([
    'data', 'save', 'state', 'snapshot', 'game', 'saveData', 'payload', 'value',
  ]);
  const COLLECTION_KEYS = Object.freeze([
    'entities', 'units', 'buildings', 'resources', 'projectiles', 'effects',
  ]);

  const state = {
    attempts: 0,
    migrated: false,
    currentKey: null,
    sourceKey: null,
    backupKey: null,
    candidateCount: 0,
    invalidKeys: [],
    lastError: null,
    lastMigrationAt: null,
  };

  const isObject = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));
  const asArray = value => {
    if (Array.isArray(value)) return value;
    if (isObject(value)) return Object.values(value);
    return null;
  };
  const parseMaybeJson = value => {
    if (isObject(value) || Array.isArray(value)) return value;
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!trimmed || (!trimmed.startsWith('{') && !trimmed.startsWith('['))) return null;
    try { return JSON.parse(trimmed); } catch (_) { return null; }
  };
  const storageGet = key => {
    try {
      const api = root.__FD_DEBUG__;
      if (typeof api?.storageGet === 'function') return api.storageGet(key);
      return localStorage.getItem(key);
    } catch (_) {
      return null;
    }
  };
  const storageSet = (key, value) => {
    try {
      const api = root.__FD_DEBUG__;
      if (typeof api?.storageSet === 'function') return api.storageSet(key, value) !== false;
      localStorage.setItem(key, value);
      return true;
    } catch (error) {
      state.lastError = String(error?.message || error);
      return false;
    }
  };
  const currentKey = () => root.__FD_DEBUG__?.SAVE_KEY || DEFAULT_KEY;

  const allSaveKeys = () => {
    const current = currentKey();
    const known = [
      current,
      `${current}-backup-build${BUILD}`,
      `${current}-backup-build190`,
      `${current}-backup-build189`,
      'frontline-dominion-save-v5',
      'frontline-dominion-save-v4',
      'frontline-dominion-save-v3',
      'frontline-dominion-save-v2',
      'frontline-dominion-save-v1',
      'frontline-dominion-save',
    ];
    try {
      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index);
        if (key && key.startsWith(KEY_PREFIX)) known.push(key);
      }
    } catch (_) {}
    return [...new Set(known.filter(Boolean))];
  };

  const hasTeams = value => isObject(value?.teams) || isObject(value?.teamState) ||
    isObject(value?.sides) || isObject(value?.playerTeam) || isObject(value?.player);
  const hasWorldState = value => COLLECTION_KEYS.some(key => {
    const collection = value?.[key];
    return Array.isArray(collection) || isObject(collection);
  }) || isObject(value?.world) || isObject(value?.authoritative172) ||
    isObject(value?.authoritative174) || isObject(value?.simulation);
  const plausibleSave = value => isObject(value) && hasTeams(value) && hasWorldState(value);

  const unwrapSave = raw => {
    const parsed = parseMaybeJson(raw);
    if (!parsed) return null;
    const queue = [{ value: parsed, depth: 0 }];
    const visited = new Set();
    while (queue.length) {
      const entry = queue.shift();
      const candidate = parseMaybeJson(entry.value);
      if (!candidate || typeof candidate !== 'object' || visited.has(candidate)) continue;
      visited.add(candidate);
      if (plausibleSave(candidate)) return candidate;
      if (entry.depth >= 5 || !isObject(candidate)) continue;
      for (const key of WRAPPER_KEYS) {
        if (candidate[key] !== undefined) queue.push({ value: candidate[key], depth: entry.depth + 1 });
      }
      if (candidate.world !== undefined) queue.push({ value: candidate.world, depth: entry.depth + 1 });
    }
    return null;
  };

  const normalizeSave = source => {
    if (!isObject(source)) return null;
    const data = { ...source };
    const world = isObject(source.world) ? source.world : null;

    if (!isObject(data.teams)) {
      if (isObject(data.teamState)) data.teams = { ...data.teamState };
      else if (isObject(data.sides)) data.teams = { ...data.sides };
      else if (isObject(data.playerTeam) || isObject(data.enemyTeam)) {
        data.teams = {
          player: isObject(data.playerTeam) ? { ...data.playerTeam } : {},
          enemy: isObject(data.enemyTeam) ? { ...data.enemyTeam } : {},
        };
      } else if (isObject(data.player)) {
        data.teams = { player: { ...data.player }, enemy: isObject(data.enemy) ? { ...data.enemy } : {} };
      }
    }

    for (const key of COLLECTION_KEYS) {
      let collection = data[key];
      if (collection == null && world) collection = world[key];
      const normalized = asArray(collection);
      if (normalized) data[key] = normalized;
    }

    if (!Array.isArray(data.entities) && !(Array.isArray(data.units) && Array.isArray(data.buildings))) {
      const combined = [];
      if (Array.isArray(data.units)) combined.push(...data.units);
      if (Array.isArray(data.buildings)) combined.push(...data.buildings);
      if (Array.isArray(data.resources)) combined.push(...data.resources);
      if (combined.length) data.entities = combined;
    }

    if (!isObject(data.teams)) return null;
    const validCollections = Array.isArray(data.entities) ||
      (Array.isArray(data.units) && Array.isArray(data.buildings));
    if (!validCollections) return null;
    data._fdSaveCompat191 = {
      build: BUILD,
      version: VERSION,
      migratedAt: Date.now(),
    };
    return data;
  };

  const saveTimestamp = data => {
    const values = [
      data?.savedAt, data?.timestamp, data?.updatedAt, data?.createdAt,
      data?.meta?.savedAt, data?.metadata?.savedAt,
      data?.authoritative172?.savedAt, data?.authoritative174?.savedAt,
    ];
    for (const value of values) {
      const numeric = Number(value);
      if (Number.isFinite(numeric) && numeric > 0) return numeric;
      const parsed = Date.parse(String(value || ''));
      if (Number.isFinite(parsed)) return parsed;
    }
    return 0;
  };

  const findCandidates = () => {
    const current = currentKey();
    const candidates = [];
    state.invalidKeys = [];
    for (const key of allSaveKeys()) {
      const raw = storageGet(key);
      if (!raw || typeof raw !== 'string') continue;
      const unwrapped = unwrapSave(raw);
      const normalized = normalizeSave(unwrapped);
      if (!normalized) {
        state.invalidKeys.push(key);
        continue;
      }
      candidates.push({
        key,
        raw,
        data: normalized,
        normalizedRaw: JSON.stringify(normalized),
        timestamp: saveTimestamp(normalized),
        priority: key === current ? 3 : key.includes('-backup-build') ? 2 : 1,
      });
    }
    candidates.sort((left, right) =>
      right.priority - left.priority || right.timestamp - left.timestamp || left.key.localeCompare(right.key)
    );
    state.candidateCount = candidates.length;
    return candidates;
  };

  const migrate = () => {
    state.attempts += 1;
    state.lastError = null;
    const current = currentKey();
    const backup = `${current}-backup-build${BUILD}`;
    state.currentKey = current;
    state.backupKey = backup;
    const candidates = findCandidates();
    const selected = candidates[0] || null;
    if (!selected) {
      state.migrated = false;
      state.sourceKey = null;
      return false;
    }

    const existingCurrent = storageGet(current);
    if (existingCurrent && existingCurrent !== selected.normalizedRaw) {
      const existing = normalizeSave(unwrapSave(existingCurrent));
      if (existing) storageSet(backup, JSON.stringify(existing));
    }
    if (selected.key !== current) {
      storageSet(`${current}-legacy-source-build${BUILD}`, selected.raw);
    }
    const written = storageSet(current, selected.normalizedRaw);
    state.migrated = written;
    state.sourceKey = selected.key;
    state.lastMigrationAt = written ? Date.now() : null;
    if (written) {
      root.__FD_BOOT_191__?.setLoadAvailable?.(true);
      console.info('[FD191] Save compatibility checkpoint ready', {
        sourceKey: selected.key,
        currentKey: current,
        candidates: candidates.length,
        invalidKeys: [...state.invalidKeys],
      });
    }
    return written;
  };

  root.__FD_SAVE_COMPAT_191__ = {
    version: VERSION,
    build: BUILD,
    state,
    migrate,
    findCandidates,
    normalizeSave,
    unwrapSave,
  };

  migrate();
  queueMicrotask(migrate);
  document.addEventListener('DOMContentLoaded', migrate, { once: true });
  setTimeout(migrate, 120);
  setTimeout(migrate, 800);
})();
