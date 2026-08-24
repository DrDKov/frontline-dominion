'use strict';
(() => {
  const root = globalThis;
  if (root.__FD_SAVE_SLOTS_213__) return;

  const VERSION = '16.9.7';
  const BUILD = 213;
  const DB_NAME = 'frontline-dominion-saves-v205';
  const STORE_NAME = 'saves';
  const DB_VERSION = 1;
  const CURRENT_KEY = 'frontline-dominion-save-v5';
  const FALLBACK_KEY = 'fd205-save-slots-fallback-v1';
  const ACTIVE_SLOT_KEY = 'fd205-active-slot-v1';
  const SESSION_KEY = 'fd205-session-v1';
  const MAX_AUTOSAVES = 3;

  const state = {
    installed: false,
    ready: false,
    dbMode: 'indexeddb',
    slots: [],
    selectedId: null,
    activeManualId: null,
    sessionId: null,
    modalMode: null,
    pendingRequests: new Map(),
    saveRequests: 0,
    exactWorkerSaves: 0,
    fallbackSaves: 0,
    manualSaves: 0,
    autosaves: 0,
    loads: 0,
    migrations: 0,
    deletes: 0,
    lastSavedId: null,
    lastLoadedId: null,
    lastError: null,
  };

  let databasePromise = null;
  let autosaveTimer = 0;
  let pendingAutosaveRaw = null;

  const now = () => Date.now();
  const randomId = prefix => `${prefix}-${now().toString(36)}-${crypto.getRandomValues(new Uint32Array(1))[0].toString(36)}`;
  const safeParse = raw => {
    if (!raw || typeof raw !== 'string') return null;
    try {
      const data = JSON.parse(raw);
      const collections = Array.isArray(data?.entities) || (Array.isArray(data?.units) && Array.isArray(data?.buildings));
      return data?.teams && collections ? data : null;
    } catch (_) {
      return null;
    }
  };
  const hashRaw = raw => {
    let hash = 2166136261;
    for (let index = 0; index < raw.length; index += 1) {
      hash ^= raw.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  };
  const storageGet = key => {
    try { return localStorage.getItem(key); } catch (_) { return null; }
  };
  const storageSet = (key, value) => {
    try { localStorage.setItem(key, value); return true; } catch (_) { return false; }
  };
  const multiplayerActive = () => Boolean(root.__FD_MULTIPLAYER_ACTIVE__ && root.__FD_MULTIPLAYER__?.active);

  function openDatabase() {
    if (databasePromise) return databasePromise;
    databasePromise = new Promise((resolve, reject) => {
      if (!root.indexedDB) {
        reject(new Error('IndexedDB недоступна'));
        return;
      }
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('updatedAt', 'updatedAt');
          store.createIndex('kind', 'kind');
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Не удалось открыть базу сохранений'));
      request.onblocked = () => reject(new Error('База сохранений заблокирована другой вкладкой'));
    }).catch(error => {
      state.dbMode = 'localstorage-fallback';
      state.lastError = String(error?.message || error);
      return null;
    });
    return databasePromise;
  }

  const fallbackRead = () => {
    try {
      const records = JSON.parse(storageGet(FALLBACK_KEY) || '[]');
      return Array.isArray(records) ? records : [];
    } catch (_) {
      return [];
    }
  };
  const fallbackWrite = records => {
    if (!storageSet(FALLBACK_KEY, JSON.stringify(records))) throw new Error('Недостаточно места для сохранения');
  };

  async function recordsGetAll() {
    const db = await openDatabase();
    if (!db) return fallbackRead();
    return new Promise((resolve, reject) => {
      const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error || new Error('Не удалось прочитать сохранения'));
    });
  }

  async function recordGet(id) {
    const db = await openDatabase();
    if (!db) return fallbackRead().find(record => record.id === id) || null;
    return new Promise((resolve, reject) => {
      const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new Error('Не удалось открыть сохранение'));
    });
  }

  async function recordPut(record) {
    const db = await openDatabase();
    if (!db) {
      const records = fallbackRead().filter(item => item.id !== record.id);
      records.push(record);
      fallbackWrite(records);
      return record;
    }
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).put(record);
      transaction.oncomplete = () => resolve(record);
      transaction.onerror = () => reject(transaction.error || new Error('Не удалось записать сохранение'));
      transaction.onabort = () => reject(transaction.error || new Error('Запись сохранения отменена'));
    });
  }

  async function recordDelete(id) {
    const db = await openDatabase();
    if (!db) {
      fallbackWrite(fallbackRead().filter(record => record.id !== id));
      return true;
    }
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).delete(id);
      transaction.oncomplete = () => resolve(true);
      transaction.onerror = () => reject(transaction.error || new Error('Не удалось удалить сохранение'));
    });
  }

  const formatDuration = seconds => {
    const total = Math.max(0, Math.floor(Number(seconds) || 0));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const rest = total % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
  };
  const formatDate = timestamp => new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).format(new Date(timestamp));
  const labelFaction = value => ({ vanguard: 'Авангард', dominion: 'Доминион', specter: 'Спектр' }[value] || value || '—');
  const labelDifficulty = value => ({ easy: 'Легко', normal: 'Нормально', hard: 'Сложно' }[value] || value || '—');

  function summarize(data) {
    const entities = Array.isArray(data.entities)
      ? data.entities
      : [...(data.units || []), ...(data.buildings || []), ...(data.resources || [])];
    const alive = entities.filter(entity => entity?.alive !== false);
    const player = alive.filter(entity => entity.team === 'player');
    const enemy = alive.filter(entity => entity.team === 'enemy');
    return {
      gameTime: Number(data.time) || 0,
      simTick: Number(data.authoritative172?.simTick ?? data.simTick ?? Math.round((Number(data.time) || 0) * 25)) || 0,
      faction: data.teams?.player?.faction || 'vanguard',
      enemyFaction: data.teams?.enemy?.faction || 'dominion',
      difficulty: data.difficultyKey || 'normal',
      credits: Math.round(Number(data.teams?.player?.credits) || 0),
      playerUnits: player.filter(entity => entity.kind === 'unit').length,
      playerBuildings: player.filter(entity => entity.kind === 'building').length,
      enemyUnits: enemy.filter(entity => entity.kind === 'unit').length,
      enemyBuildings: enemy.filter(entity => entity.kind === 'building').length,
      totalEntities: alive.length,
    };
  }

  function recordFromRaw({ id, name, kind, raw, createdAt = now(), updatedAt = now(), sourceHash = null }) {
    const data = safeParse(raw);
    if (!data) throw new Error('Игровой снимок повреждён');
    return {
      id,
      name: String(name || 'Сохранение').trim().slice(0, 80) || 'Сохранение',
      kind,
      createdAt,
      updatedAt,
      build: BUILD,
      version: VERSION,
      sourceHash: sourceHash || hashRaw(raw),
      summary: summarize(data),
      payload: raw,
    };
  }

  async function refreshSlots() {
    state.slots = (await recordsGetAll()).filter(record => safeParse(record?.payload)).sort((left, right) =>
      Number(right.updatedAt || 0) - Number(left.updatedAt || 0) || String(left.name).localeCompare(String(right.name), 'ru')
    );
    if (state.selectedId && !state.slots.some(record => record.id === state.selectedId)) state.selectedId = null;
    updateLoadAvailability();
    renderSlotList();
    return state.slots;
  }

  function updateLoadAvailability() {
    const button = document.getElementById('load-game');
    const available = state.slots.length > 0;
    if (button) {
      button.disabled = !available;
      button.setAttribute('aria-disabled', available ? 'false' : 'true');
    }
    root.__FD_BOOT_213__?.setLoadAvailable?.(available);
  }

  async function migrateLegacy() {
    const shell = root.__FD_RUNTIME_SHELL_213__;
    const candidate = shell?.findSavedGame?.();
    if (!candidate?.raw || !safeParse(candidate.raw)) return false;
    const sourceHash = hashRaw(candidate.raw);
    const records = await recordsGetAll();
    // Import the pre-205 singleton exactly once.  After the archive exists,
    // the compatibility key is merely a mirror and must not manufacture a
    // new, potentially older "previous save" on every reload.
    if (records.length || records.some(record => record.sourceHash === sourceHash)) return false;
    const timestamp = Number(candidate.data?.savedAt) || now();
    await recordPut(recordFromRaw({
      id: randomId('legacy'),
      name: 'Предыдущее сохранение',
      kind: 'legacy',
      raw: candidate.raw,
      createdAt: timestamp,
      updatedAt: timestamp,
      sourceHash,
    }));
    state.migrations += 1;
    return true;
  }

  function exactSaveFromEvent(event) {
    const detail = event?.detail || {};
    const raw = typeof detail.raw === 'string' ? detail.raw : detail.data ? JSON.stringify(detail.data) : null;
    if (!safeParse(raw)) return;
    const requestId = Number(detail.requestId) || 0;
    const pending = requestId ? state.pendingRequests.get(requestId) : null;
    if (pending) {
      state.pendingRequests.delete(requestId);
      clearTimeout(pending.timer);
      state.exactWorkerSaves += 1;
      pending.resolve(raw);
      return;
    }
    scheduleAutosave(raw);
  }

  function captureExactSave() {
    state.saveRequests += 1;
    const game = root.__FD_DEBUG__?.game;
    if (!game || game.ended) return Promise.reject(new Error('Нет активной игры для сохранения'));
    const bridge = root.__FD_STABLE_STATE165__?.bridge;
    if (bridge?.ready && !bridge.failed && typeof bridge.requestSave === 'function') {
      const requestId = bridge.requestSave(false);
      if (Number.isInteger(requestId) && requestId > 0) {
        return new Promise((resolve, reject) => {
          const timer = setTimeout(() => {
            state.pendingRequests.delete(requestId);
            // A stale main-thread mirror is exactly what made the old one-slot
            // save appear to load an earlier game.  Once an authoritative
            // Worker exists, never silently substitute that mirror: keep the
            // current slots intact and tell the player that this capture was
            // not confirmed.
            reject(new Error('Simulation Worker не подтвердил снимок сохранения вовремя'));
          }, 6000);
          state.pendingRequests.set(requestId, { resolve, reject, timer });
        });
      }
    }
    const ok = game.save(false) !== false;
    const raw = storageGet(root.__FD_DEBUG__?.SAVE_KEY || CURRENT_KEY);
    if (!ok || !safeParse(raw)) return Promise.reject(new Error('Не удалось получить игровой снимок'));
    state.fallbackSaves += 1;
    return Promise.resolve(raw);
  }

  async function saveNamed(name, overwriteId = null) {
    if (multiplayerActive()) throw new Error('Индивидуальные сохранения недоступны во время сетевого матча');
    const raw = await captureExactSave();
    const existing = overwriteId ? await recordGet(overwriteId) : null;
    const id = existing?.kind === 'manual' || existing?.kind === 'legacy' ? existing.id : randomId('save');
    const record = recordFromRaw({
      id,
      name,
      kind: 'manual',
      raw,
      createdAt: existing?.createdAt || now(),
      updatedAt: now(),
    });
    await recordPut(record);
    state.activeManualId = id;
    state.lastSavedId = id;
    state.manualSaves += 1;
    storageSet(ACTIVE_SLOT_KEY, id);
    await refreshSlots();
    root.__FD_DEBUG__?.game?.alert?.(`Сохранено: ${record.name}`, 'info');
    return record;
  }

  async function writeAutosave(raw) {
    const data = safeParse(raw);
    if (!data || !root.__FD_DEBUG__?.game || root.__FD_MULTIPLAYER_ACTIVE__) return null;
    state.sessionId ||= storageGet(SESSION_KEY) || randomId('session');
    storageSet(SESSION_KEY, state.sessionId);
    const id = `autosave-${state.sessionId}`;
    const existing = await recordGet(id);
    const active = state.activeManualId ? await recordGet(state.activeManualId) : null;
    const record = recordFromRaw({
      id,
      name: active ? `Автосохранение — ${active.name}` : 'Автосохранение',
      kind: 'autosave',
      raw,
      createdAt: existing?.createdAt || now(),
      updatedAt: now(),
    });
    if (existing?.sourceHash === record.sourceHash) return existing;
    await recordPut(record);
    const all = (await recordsGetAll()).filter(item => item.kind === 'autosave').sort((a, b) => Number(b.updatedAt) - Number(a.updatedAt));
    for (const stale of all.slice(MAX_AUTOSAVES)) await recordDelete(stale.id);
    state.autosaves += 1;
    state.lastSavedId = id;
    await refreshSlots();
    return record;
  }

  function scheduleAutosave(raw) {
    if (!safeParse(raw) || root.__FD_MULTIPLAYER_ACTIVE__) return;
    pendingAutosaveRaw = raw;
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => {
      const next = pendingAutosaveRaw;
      pendingAutosaveRaw = null;
      writeAutosave(next).catch(error => { state.lastError = String(error?.message || error); });
    }, 180);
  }

  async function loadSlot(id) {
    const record = await recordGet(id);
    if (!record || !safeParse(record.payload)) throw new Error('Выбранное сохранение не найдено или повреждено');
    state.activeManualId = record.kind === 'autosave' ? null : record.id;
    state.sessionId = `loaded-${record.id}`;
    state.lastLoadedId = record.id;
    state.loads += 1;
    storageSet(ACTIVE_SLOT_KEY, state.activeManualId || '');
    storageSet(SESSION_KEY, state.sessionId);
    closeModal();
    const shell = root.__FD_RUNTIME_SHELL_213__;
    if (typeof shell?.launchSavedPayload === 'function') {
      const launched = shell.launchSavedPayload(record.payload, { preventDefault() {}, stopImmediatePropagation() {} });
      if (launched === false) throw new Error('Не удалось запустить выбранное сохранение');
      return record;
    }
    // Compatibility fallback only. Build 212 does not require this localStorage
    // mirror when the canonical runtime shell is present.
    const currentKey = root.__FD_DEBUG__?.SAVE_KEY || CURRENT_KEY;
    if (!storageSet(currentKey, record.payload)) throw new Error('Не удалось подготовить сохранение к загрузке');
    if (typeof shell?.launchSavedGame !== 'function') throw new Error('Модуль загрузки ещё не готов');
    shell.launchSavedGame({ preventDefault() {}, stopImmediatePropagation() {} });
    return record;
  }

  async function deleteSlot(id) {
    await recordDelete(id);
    if (state.activeManualId === id) {
      state.activeManualId = null;
      storageSet(ACTIVE_SLOT_KEY, '');
    }
    state.deletes += 1;
    state.selectedId = null;
    await refreshSlots();
    return true;
  }

  function ensureModal() {
    if (document.getElementById('fd-save-center205')) return;
    const style = document.createElement('style');
    style.id = 'fd-save-center205-style';
    style.textContent = `
      #fd-save-center205{position:fixed;inset:0;z-index:140;display:grid;place-items:center;padding:24px;background:rgba(2,7,10,.84);backdrop-filter:blur(12px)}
      #fd-save-center205.hidden{display:none!important}#fd-save-center205 *{box-sizing:border-box}
      .fd-save-card205{width:min(940px,96vw);max-height:min(760px,92vh);display:grid;grid-template-rows:auto minmax(0,1fr) auto;gap:16px;padding:24px;border:1px solid rgba(139,201,173,.3);border-radius:10px;background:#08120f;box-shadow:0 28px 90px rgba(0,0,0,.58);color:#deebe3}
      .fd-save-head205{display:flex;align-items:flex-start;justify-content:space-between;gap:20px}.fd-save-head205 h2{margin:4px 0 0;font-size:25px}.fd-save-head205 small{color:#789787;font:800 10px/1.4 system-ui;letter-spacing:.12em}
      .fd-save-close205{width:38px;height:38px;border:1px solid #385146;border-radius:5px;background:#0d1b16;color:#dbe9e1;font-size:23px;cursor:pointer}
      .fd-save-list205{min-height:210px;overflow:auto;display:grid;align-content:start;gap:8px;padding-right:4px}
      .fd-save-empty205{padding:44px 18px;border:1px dashed #30473d;border-radius:7px;text-align:center;color:#829a8e}
      .fd-save-row205{display:grid;grid-template-columns:minmax(180px,1fr) auto;gap:14px;align-items:center;width:100%;padding:13px 15px;border:1px solid #273c33;border-radius:7px;background:#0b1712;color:#dce9e1;text-align:left;cursor:pointer}
      .fd-save-row205:hover,.fd-save-row205.selected{border-color:#70c798;background:#10231a}.fd-save-row205 strong{display:block;font-size:14px}.fd-save-row205 .meta{display:flex;flex-wrap:wrap;gap:7px 14px;margin-top:6px;color:#829d8e;font:700 10px/1.35 system-ui}.fd-save-row205 .tag{padding:4px 7px;border:1px solid #355247;border-radius:4px;color:#9fc8b1;font:900 9px/1 system-ui;letter-spacing:.08em}
      .fd-save-actions205{display:grid;grid-template-columns:minmax(180px,1fr) repeat(3,auto);gap:9px}.fd-save-actions205 input{min-height:44px;padding:0 13px;border:1px solid #314a3f;border-radius:5px;background:#07100c;color:#e2eee7;font:700 13px system-ui;outline:none}.fd-save-actions205 input:focus{border-color:#70c798}
      .fd-save-actions205 button{min-height:44px;padding:0 15px;border:1px solid #3b5d4d;border-radius:5px;background:#11251b;color:#dfece5;font:900 10px system-ui;letter-spacing:.07em;cursor:pointer}.fd-save-actions205 button.primary{background:#bde6cb;color:#07100b;border-color:#bde6cb}.fd-save-actions205 button.danger{color:#e7aaa0;border-color:#70443d}.fd-save-actions205 button:disabled{opacity:.38;cursor:not-allowed}
      #start-screen .lead{max-width:560px}#start-screen .feature-strip{display:none!important}
      @media(max-width:700px){.fd-save-card205{padding:16px}.fd-save-actions205{grid-template-columns:1fr 1fr}.fd-save-actions205 input{grid-column:1/-1}.fd-save-row205{grid-template-columns:1fr}.fd-save-row205 .tag{justify-self:start}}
    `;
    document.head.appendChild(style);
    const modal = document.createElement('div');
    modal.id = 'fd-save-center205';
    modal.className = 'hidden';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.innerHTML = `
      <div class="fd-save-card205">
        <div class="fd-save-head205"><div><small id="fd-save-eyebrow205">СОХРАНЁННЫЕ ОПЕРАЦИИ</small><h2 id="fd-save-title205">Загрузить игру</h2></div><button class="fd-save-close205" id="fd-save-close205" type="button" aria-label="Закрыть">×</button></div>
        <div class="fd-save-list205" id="fd-save-list205"></div>
        <div class="fd-save-actions205"><input id="fd-save-name205" maxlength="80" autocomplete="off" placeholder="Название сохранения"><button id="fd-save-delete205" class="danger" type="button">УДАЛИТЬ</button><button id="fd-save-new205" type="button">НОВОЕ</button><button id="fd-save-confirm205" class="primary" type="button">ЗАГРУЗИТЬ</button></div>
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('keydown', event => {
      event.stopPropagation();
      if (event.key === 'Escape') closeModal();
    }, true);
    document.getElementById('fd-save-close205').addEventListener('click', closeModal);
    document.getElementById('fd-save-new205').addEventListener('click', () => {
      state.selectedId = null;
      const input = document.getElementById('fd-save-name205');
      input.value = `Сохранение ${state.slots.filter(slot => slot.kind !== 'autosave').length + 1}`;
      renderSlotList();
      input.focus();
      input.select();
    });
    document.getElementById('fd-save-delete205').addEventListener('click', async () => {
      const selected = state.slots.find(slot => slot.id === state.selectedId);
      if (!selected || !confirm(`Удалить «${selected.name}»?`)) return;
      await deleteSlot(selected.id);
    });
    document.getElementById('fd-save-confirm205').addEventListener('click', async () => {
      const button = document.getElementById('fd-save-confirm205');
      button.disabled = true;
      try {
        if (state.modalMode === 'load') {
          if (!state.selectedId) return;
          await loadSlot(state.selectedId);
        } else {
          const input = document.getElementById('fd-save-name205');
          const selected = state.slots.find(slot => slot.id === state.selectedId);
          const overwrite = selected && selected.kind !== 'autosave' ? selected.id : null;
          await saveNamed(input.value || `Сохранение ${state.slots.length + 1}`, overwrite);
          closeModal();
        }
      } catch (error) {
        state.lastError = String(error?.message || error);
        root.__FD_DEBUG__?.game?.alert?.(state.lastError, 'danger');
        if (!root.__FD_DEBUG__?.game) alert(state.lastError);
      } finally {
        button.disabled = false;
      }
    });
  }

  function renderSlotList() {
    const list = document.getElementById('fd-save-list205');
    if (!list) return;
    list.replaceChildren();
    if (!state.slots.length) {
      const empty = document.createElement('div');
      empty.className = 'fd-save-empty205';
      empty.textContent = state.modalMode === 'save' ? 'Создайте первое сохранение этой операции.' : 'Сохранённых игр пока нет.';
      list.appendChild(empty);
    }
    for (const record of state.slots) {
      const summary = record.summary || {};
      const row = document.createElement('button');
      row.type = 'button';
      row.className = `fd-save-row205${record.id === state.selectedId ? ' selected' : ''}`;
      row.dataset.saveId = record.id;
      const kind = record.kind === 'autosave' ? 'АВТО' : record.kind === 'legacy' ? 'ИМПОРТ' : 'РУЧНОЕ';
      row.innerHTML = `<span><strong></strong><span class="meta"><span>${formatDate(record.updatedAt)}</span><span>${formatDuration(summary.gameTime)}</span><span>${labelFaction(summary.faction)}</span><span>${labelDifficulty(summary.difficulty)}</span><span>${summary.playerUnits || 0} юн. · ${summary.playerBuildings || 0} зд.</span><span>${Number(summary.credits || 0).toLocaleString('ru-RU')} кр.</span></span></span><span class="tag">${kind}</span>`;
      row.querySelector('strong').textContent = record.name;
      row.addEventListener('click', () => {
        state.selectedId = record.id;
        const input = document.getElementById('fd-save-name205');
        if (input && state.modalMode === 'save' && record.kind !== 'autosave') input.value = record.name;
        renderSlotList();
      });
      list.appendChild(row);
    }
    const selected = state.slots.find(slot => slot.id === state.selectedId);
    const confirmButton = document.getElementById('fd-save-confirm205');
    const deleteButton = document.getElementById('fd-save-delete205');
    if (confirmButton) {
      confirmButton.textContent = state.modalMode === 'load' ? 'ЗАГРУЗИТЬ' : selected && selected.kind !== 'autosave' ? 'ПЕРЕЗАПИСАТЬ' : 'СОХРАНИТЬ';
      confirmButton.disabled = state.modalMode === 'load' && !selected;
    }
    if (deleteButton) deleteButton.disabled = !selected;
  }

  function openModal(mode) {
    if (mode === 'save' && multiplayerActive()) {
      root.__FD_DEBUG__?.game?.alert?.('Индивидуальные сохранения недоступны во время сетевого матча', 'info');
      return;
    }
    ensureModal();
    state.modalMode = mode;
    state.selectedId = mode === 'save' ? state.activeManualId : state.slots[0]?.id || null;
    const title = document.getElementById('fd-save-title205');
    const eyebrow = document.getElementById('fd-save-eyebrow205');
    const input = document.getElementById('fd-save-name205');
    const newButton = document.getElementById('fd-save-new205');
    title.textContent = mode === 'save' ? 'Сохранить игру' : 'Загрузить игру';
    eyebrow.textContent = mode === 'save' ? 'ТОЧНЫЙ СНИМОК SIMULATION WORKER' : 'СОХРАНЁННЫЕ ОПЕРАЦИИ';
    input.hidden = mode !== 'save';
    newButton.hidden = mode !== 'save';
    if (mode === 'save') {
      const selected = state.slots.find(slot => slot.id === state.selectedId);
      input.value = selected?.name || `Сохранение ${state.slots.filter(slot => slot.kind !== 'autosave').length + 1}`;
    }
    document.getElementById('fd-save-center205').classList.remove('hidden');
    renderSlotList();
  }

  function closeModal() {
    document.getElementById('fd-save-center205')?.classList.add('hidden');
    state.modalMode = null;
  }

  function cleanStartScreen() {
    document.querySelector('#start-screen .feature-strip')?.remove();
    const lead = document.querySelector('#start-screen .lead');
    if (lead) lead.textContent = 'Выберите сторону и сложность операции.';
    const eyebrow = document.querySelector('#start-screen .eyebrow');
    if (eyebrow) eyebrow.textContent = `ОПЕРАТИВНО-ТАКТИЧЕСКАЯ RTS · BUILD ${BUILD}`;
    document.getElementById('start-screen')?.setAttribute('data-fd-canonical-build', String(BUILD));
  }

  function installMenuOwnership() {
    if (state.installed) return true;
    const shell = root.__FD_RUNTIME_SHELL_213__;
    let startButton = document.getElementById('start-game');
    let loadButton = document.getElementById('load-game');
    let saveButton = document.getElementById('save-game');
    if (!shell?.state?.installed || !startButton || !loadButton || !saveButton) return false;

    const cleanStart = startButton.cloneNode(true);
    const cleanLoad = loadButton.cloneNode(true);
    const cleanSave = saveButton.cloneNode(true);
    startButton.replaceWith(cleanStart);
    loadButton.replaceWith(cleanLoad);
    saveButton.replaceWith(cleanSave);
    startButton = cleanStart;
    loadButton = cleanLoad;
    saveButton = cleanSave;
    startButton.addEventListener('click', event => {
      state.activeManualId = null;
      state.sessionId = randomId('session');
      storageSet(ACTIVE_SLOT_KEY, '');
      storageSet(SESSION_KEY, state.sessionId);
      shell.launchNewGame(event);
    }, { capture: true });
    loadButton.addEventListener('click', event => {
      event.preventDefault();
      event.stopImmediatePropagation();
      openModal('load');
    }, { capture: true });

    let multiplayerButton = document.getElementById('multiplayer-game');
    if (!multiplayerButton) {
      multiplayerButton = document.createElement('button');
      multiplayerButton.id = 'multiplayer-game';
      multiplayerButton.className = 'secondary-button';
      multiplayerButton.type = 'button';
      multiplayerButton.textContent = 'СЕТЕВАЯ ИГРА';
      loadButton.insertAdjacentElement('afterend', multiplayerButton);
    }
    multiplayerButton.addEventListener('click', () => {
      location.href = `./multiplayer.html?build=${BUILD}`;
    });

    saveButton.addEventListener('click', event => {
      event.preventDefault();
      event.stopImmediatePropagation();
      openModal('save');
    }, { capture: true });
    saveButton.textContent = 'СОХРАНИТЬ ИГРУ';
    cleanStartScreen();
    ensureModal();
    state.installed = true;
    return true;
  }

  root.addEventListener('fd:authoritative-save208', exactSaveFromEvent);

  async function initialize() {
    state.activeManualId = storageGet(ACTIVE_SLOT_KEY) || null;
    state.sessionId = storageGet(SESSION_KEY) || randomId('session');
    storageSet(SESSION_KEY, state.sessionId);
    await openDatabase();
    await migrateLegacy();
    await refreshSlots();
    state.ready = true;
    return true;
  }

  let attempts = 0;
  const installTimer = setInterval(() => {
    attempts += 1;
    if (installMenuOwnership() || attempts > 600) clearInterval(installTimer);
  }, 25);

  const ready = initialize().catch(error => {
    state.lastError = String(error?.message || error);
    state.ready = true;
    return false;
  });

  root.__FD_SAVE_SLOTS_213__ = {
    version: VERSION,
    build: BUILD,
    state,
    ready,
    refresh: refreshSlots,
    list: async () => (await refreshSlots()).map(record => ({ ...record, payload: undefined })),
    get: recordGet,
    saveNamed,
    loadSlot,
    deleteSlot,
    captureExactSave,
    openLoad: () => openModal('load'),
    openSave: () => openModal('save'),
    close: closeModal,
    diagnostics: () => ({
      ...state,
      slots: state.slots.map(record => ({ id: record.id, name: record.name, kind: record.kind, updatedAt: record.updatedAt, summary: { ...record.summary } })),
      pendingRequests: state.pendingRequests.size,
    }),
  };
})();

globalThis.__FD_SAVE_SLOTS_205__ ||= globalThis.__FD_SAVE_SLOTS_213__;

globalThis.__FD_SAVE_SLOTS_206__ ||= globalThis.__FD_SAVE_SLOTS_213__;

globalThis.__FD_SAVE_SLOTS_207__ ||= globalThis.__FD_SAVE_SLOTS_213__; globalThis.__FD_SAVE_SLOTS_206__ ||= globalThis.__FD_SAVE_SLOTS_213__;

globalThis.__FD_SAVE_SLOTS_208__ ||= globalThis.__FD_SAVE_SLOTS_213__; globalThis.__FD_SAVE_SLOTS_207__ ||= globalThis.__FD_SAVE_SLOTS_213__; globalThis.__FD_SAVE_SLOTS_206__ ||= globalThis.__FD_SAVE_SLOTS_213__;

globalThis.__FD_SAVE_SLOTS_209__ ||= globalThis.__FD_SAVE_SLOTS_213__; globalThis.__FD_SAVE_SLOTS_208__ ||= globalThis.__FD_SAVE_SLOTS_213__; globalThis.__FD_SAVE_SLOTS_207__ ||= globalThis.__FD_SAVE_SLOTS_213__;

globalThis.__FD_SAVE_SLOTS_210__ ||= globalThis.__FD_SAVE_SLOTS_213__; globalThis.__FD_SAVE_SLOTS_209__ ||= globalThis.__FD_SAVE_SLOTS_213__; globalThis.__FD_SAVE_SLOTS_208__ ||= globalThis.__FD_SAVE_SLOTS_213__;

globalThis.__FD_SAVE_SLOTS_211__ ||= globalThis.__FD_SAVE_SLOTS_213__; globalThis.__FD_SAVE_SLOTS_210__ ||= globalThis.__FD_SAVE_SLOTS_213__;

globalThis.__FD_SAVE_SLOTS_212__ ||= globalThis.__FD_SAVE_SLOTS_213__; globalThis.__FD_SAVE_SLOTS_211__ ||= globalThis.__FD_SAVE_SLOTS_213__; globalThis.__FD_SAVE_SLOTS_210__ ||= globalThis.__FD_SAVE_SLOTS_213__;
