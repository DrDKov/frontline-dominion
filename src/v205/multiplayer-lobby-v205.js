'use strict';
(() => {
  const root = globalThis;
  if (root.__FD_MULTIPLAYER_LOBBY_205__) return;

  const VERSION = '16.8.21';
  const BUILD = 205;
  const CHUNK_SIZE = 48 * 1024;
  const MAX_BUFFERED = 512 * 1024;
  const STATUS_HISTORY = 240;

  const state = {
    role: null,
    mode: 'coop',
    connected: false,
    connectionState: 'new',
    dataState: 'closed',
    frameReady: false,
    remoteReady: false,
    started: false,
    roomCode: null,
    clientId: crypto.randomUUID?.() || `client-${Date.now().toString(36)}`,
    hostTick: 0,
    remoteTick: 0,
    tickDrift: 0,
    rtt: null,
    eventSequence: 0,
    eventsSent: 0,
    eventsReceived: 0,
    packetsSent: 0,
    packetsReceived: 0,
    bytesSent: 0,
    bytesReceived: 0,
    hashChecks: 0,
    hashMismatches: 0,
    mismatchStreak: 0,
    resyncsRequested: 0,
    lastResyncAt: 0,
    snapshotsSent: 0,
    snapshotsReceived: 0,
    lastError: null,
    lastEvent: null,
    lastStatus: null,
    remoteStatus: null,
  };

  let peer = null;
  let channel = null;
  let pingTimer = 0;
  let statusTimer = 0;
  let lastResyncAt = 0;
  let pendingStart = null;
  let outbound = [];
  const fragments = new Map();
  const hostStatuses = new Map();

  const byId = id => document.getElementById(id);
  const frame = () => byId('mp-game-frame205');
  const gameWindow = () => frame()?.contentWindow || null;
  const setText = (id, value) => { const node = byId(id); if (node) node.textContent = String(value); };
  const setHidden = (id, hidden) => byId(id)?.classList.toggle('hidden', Boolean(hidden));
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  function setError(error) {
    state.lastError = String(error?.message || error || 'Неизвестная сетевая ошибка');
    setText('mp-error205', state.lastError);
    setHidden('mp-error205', false);
    console.error('[FD205 multiplayer]', error);
  }

  function clearError() {
    state.lastError = null;
    setText('mp-error205', '');
    setHidden('mp-error205', true);
  }

  function updateUI() {
    if (!state.frameReady) {
      try {
        const ready = gameWindow()?.document?.body?.dataset?.fdMultiplayerReady;
        if (ready === '10.1') {
          state.frameReady = true;
          if (channel?.readyState === 'open') sendPacket({ kind: 'game-ready', ready: true });
        }
      } catch (_) {}
    }
    state.connectionState = peer?.connectionState || state.connectionState;
    state.dataState = channel?.readyState || 'closed';
    state.connected = state.dataState === 'open';
    state.tickDrift = Number(state.hostTick || 0) - Number(state.remoteTick || 0);
    setText('mp-connection-state205', state.connected ? 'СОЕДИНЕНИЕ УСТАНОВЛЕНО' : state.connectionState.toUpperCase());
    setText('mp-latency205', state.rtt == null ? '—' : `${Math.round(state.rtt)} мс`);
    setText('mp-hud-latency205', state.rtt == null ? '—' : `${Math.round(state.rtt)} мс`);
    setText('mp-ticks205', state.started ? `${state.hostTick} / ${state.remoteTick || '—'}` : '—');
    setText('mp-sync205', state.mismatchStreak ? `ПЕРЕСИНХРОНИЗАЦИЯ · ${state.mismatchStreak}` : state.started ? 'СИНХРОННО' : 'ОЖИДАНИЕ');
    setText('mp-hud-sync205', state.mismatchStreak ? 'ПЕРЕСИНХРОНИЗАЦИЯ' : state.started ? 'СИНХРОННО' : 'ОЖИДАНИЕ');
    const start = byId('mp-start205');
    if (start) start.disabled = !(state.role === 'host' && state.connected && state.frameReady && state.remoteReady && !state.started);
    document.body.dataset.mpRole = state.role || '';
    document.body.dataset.mpConnected = state.connected ? 'true' : 'false';
    document.body.dataset.mpStarted = state.started ? 'true' : 'false';
  }

  function iceServers() {
    const servers = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
    const prefix = state.role === 'guest' ? 'mp-guest-turn-' : 'mp-host-turn-';
    const turnUrl = byId(`${prefix}url205`)?.value?.trim();
    if (turnUrl) {
      servers.push({
        urls: turnUrl.split(',').map(value => value.trim()).filter(Boolean),
        username: byId(`${prefix}user205`)?.value || '',
        credential: byId(`${prefix}password205`)?.value || '',
      });
    }
    return servers;
  }

  function closePeer() {
    clearInterval(pingTimer);
    clearInterval(statusTimer);
    pingTimer = 0;
    statusTimer = 0;
    try { channel?.close(); } catch (_) {}
    try { peer?.close(); } catch (_) {}
    channel = null;
    peer = null;
    outbound = [];
    fragments.clear();
    state.connected = false;
    state.connectionState = 'closed';
    state.dataState = 'closed';
    updateUI();
  }

  function makePeer(role) {
    closePeer();
    state.role = role;
    state.started = false;
    state.remoteReady = false;
    state.hostTick = 0;
    state.remoteTick = 0;
    state.eventSequence = 0;
    state.mismatchStreak = 0;
    hostStatuses.clear();
    peer = new RTCPeerConnection({ iceServers: iceServers(), iceCandidatePoolSize: 2 });
    peer.onconnectionstatechange = () => {
      state.connectionState = peer.connectionState;
      if (['failed', 'disconnected'].includes(peer.connectionState)) setError('Связь с другим игроком потеряна. Создайте соединение повторно.');
      updateUI();
    };
    peer.oniceconnectionstatechange = updateUI;
    if (role === 'guest') peer.ondatachannel = event => attachChannel(event.channel);
    updateUI();
    return peer;
  }

  function waitForIceComplete(connection, timeout = 12000) {
    if (connection.iceGatheringState === 'complete') return Promise.resolve();
    return new Promise(resolve => {
      const timer = setTimeout(done, timeout);
      function done() {
        clearTimeout(timer);
        connection.removeEventListener('icegatheringstatechange', changed);
        resolve();
      }
      function changed() { if (connection.iceGatheringState === 'complete') done(); }
      connection.addEventListener('icegatheringstatechange', changed);
    });
  }

  const encodeSignal = description => {
    const bytes = new TextEncoder().encode(JSON.stringify({ v: BUILD, type: description.type, sdp: description.sdp }));
    let binary = '';
    for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
    return btoa(binary);
  };
  const decodeSignal = code => {
    const compact = String(code || '').replace(/\s+/g, '');
    if (!compact) throw new Error('Код соединения пуст');
    const binary = atob(compact);
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    const value = JSON.parse(new TextDecoder().decode(bytes));
    if (value?.v !== BUILD || !['offer', 'answer'].includes(value?.type) || typeof value.sdp !== 'string') throw new Error('Код создан другой или несовместимой сборкой');
    return { type: value.type, sdp: value.sdp };
  };
  const signalRoom = code => {
    let hash = 2166136261;
    for (const char of String(code).slice(0, 1024)) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619); }
    return (hash >>> 0).toString(36).toUpperCase().padStart(7, '0').slice(0, 7);
  };

  function pumpOutbound() {
    if (channel?.readyState !== 'open') return;
    while (outbound.length && channel.bufferedAmount < MAX_BUFFERED) {
      const text = outbound.shift();
      try {
        channel.send(text);
        state.packetsSent += 1;
        state.bytesSent += text.length;
      } catch (error) {
        outbound.unshift(text);
        setError(error);
        break;
      }
    }
  }

  function queueText(text) {
    outbound.push(text);
    pumpOutbound();
  }

  function sendPacket(packet) {
    if (channel?.readyState !== 'open') return false;
    const serialized = JSON.stringify(packet);
    if (serialized.length <= CHUNK_SIZE) queueText(serialized);
    else {
      const id = `chunk-${state.clientId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
      const total = Math.ceil(serialized.length / CHUNK_SIZE);
      for (let index = 0; index < total; index += 1) {
        queueText(JSON.stringify({ kind: 'chunk', id, index, total, payload: serialized.slice(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE) }));
      }
    }
    return true;
  }

  function receiveText(text) {
    state.packetsReceived += 1;
    state.bytesReceived += text.length;
    let packet;
    try { packet = JSON.parse(text); } catch (_) { return; }
    if (packet.kind !== 'chunk') {
      handlePacket(packet);
      return;
    }
    if (!packet.id || !Number.isInteger(packet.index) || !Number.isInteger(packet.total) || packet.total < 1 || packet.total > 256) return;
    let entry = fragments.get(packet.id);
    if (!entry) {
      entry = { parts: new Array(packet.total), received: 0, createdAt: Date.now() };
      fragments.set(packet.id, entry);
    }
    if (entry.parts[packet.index] == null) {
      entry.parts[packet.index] = String(packet.payload || '');
      entry.received += 1;
    }
    if (entry.received === entry.parts.length) {
      fragments.delete(packet.id);
      receiveText(entry.parts.join(''));
    }
    for (const [id, stale] of fragments) if (Date.now() - stale.createdAt > 30000) fragments.delete(id);
  }

  function attachChannel(nextChannel) {
    channel = nextChannel;
    channel.binaryType = 'arraybuffer';
    channel.bufferedAmountLowThreshold = 128 * 1024;
    channel.onbufferedamountlow = pumpOutbound;
    channel.onopen = () => {
      clearError();
      state.connected = true;
      state.dataState = 'open';
      sendPacket({ kind: 'hello', clientId: state.clientId, role: state.role, frameReady: state.frameReady, build: BUILD });
      clearInterval(pingTimer);
      pingTimer = setInterval(() => sendPacket({ kind: 'ping', sentAt: performance.timeOrigin + performance.now() }), 1000);
      updateUI();
    };
    channel.onclose = () => {
      state.connected = false;
      state.dataState = 'closed';
      updateUI();
    };
    channel.onerror = event => setError(event?.error || 'Ошибка канала данных WebRTC');
    channel.onmessage = event => receiveText(String(event.data || ''));
    updateUI();
  }

  async function createOffer() {
    clearError();
    const connection = makePeer('host');
    attachChannel(connection.createDataChannel('frontline-dominion-commands', { ordered: true }));
    await connection.setLocalDescription(await connection.createOffer());
    await waitForIceComplete(connection);
    const code = encodeSignal(connection.localDescription);
    state.roomCode = signalRoom(code);
    byId('mp-offer-output205').value = code;
    setText('mp-room-code205', state.roomCode);
    setHidden('mp-host-step2205', false);
    updateUI();
    return code;
  }

  async function acceptOffer(code) {
    clearError();
    const offer = decodeSignal(code);
    if (offer.type !== 'offer') throw new Error('Ожидался код ведущего');
    const connection = makePeer('guest');
    state.roomCode = signalRoom(String(code).replace(/\s+/g, ''));
    setText('mp-room-code205', state.roomCode);
    await connection.setRemoteDescription(offer);
    await connection.setLocalDescription(await connection.createAnswer());
    await waitForIceComplete(connection);
    const answer = encodeSignal(connection.localDescription);
    byId('mp-answer-output205').value = answer;
    setHidden('mp-guest-step2205', false);
    updateUI();
    return answer;
  }

  async function acceptAnswer(code) {
    clearError();
    if (!peer || state.role !== 'host') throw new Error('Сначала создайте игру');
    const answer = decodeSignal(code);
    if (answer.type !== 'answer') throw new Error('Ожидался ответ второго игрока');
    await peer.setRemoteDescription(answer);
    updateUI();
    return true;
  }

  function postGame(type, detail = {}) {
    const target = gameWindow();
    if (!target) return false;
    target.postMessage({ type, ...detail }, location.origin);
    return true;
  }

  function leadTicks() {
    const rtt = Number(state.rtt) || 40;
    return clamp(4 + Math.ceil(rtt / 80), 4, 10);
  }

  function authorizeIntent(intent) {
    if (state.role !== 'host' || !intent?.action || !state.started) return false;
    const event = {
      ...intent,
      id: `net-${state.roomCode || 'room'}-${++state.eventSequence}`,
      seq: state.eventSequence,
      atTick: Math.max(Number(state.hostTick || 0) + leadTicks(), Number(intent.tick || 0) + 1),
    };
    state.eventsSent += 1;
    state.lastEvent = { action: event.action, seq: event.seq, atTick: event.atTick, team: event.team };
    postGame('fd:mp-event', { event });
    sendPacket({ kind: 'event', event });
    return true;
  }

  function trimStatusHistory() {
    while (hostStatuses.size > STATUS_HISTORY) hostStatuses.delete(hostStatuses.keys().next().value);
  }

  function compareRemoteStatus(status) {
    if (state.role !== 'host' || !status || !Number.isFinite(Number(status.tick))) return;
    state.remoteStatus = status;
    state.remoteTick = Number(status.tick) || 0;
    const local = hostStatuses.get(state.remoteTick);
    if (!local || !local.hash || !status.hash) return;
    state.hashChecks += 1;
    if (local.hash === status.hash) state.mismatchStreak = 0;
    else {
      state.hashMismatches += 1;
      state.mismatchStreak += 1;
      if (state.mismatchStreak >= 2) requestResync('контрольная сумма симуляции различается');
    }
    updateUI();
  }

  function requestResync(reason) {
    if (state.role !== 'host' || Date.now() - lastResyncAt < 8000) return false;
    lastResyncAt = Date.now();
    state.lastResyncAt = lastResyncAt;
    state.resyncsRequested += 1;
    const requestId = `resync-${Date.now().toString(36)}`;
    postGame('fd:mp-snapshot-request', { target: 'guest', requestId, reason });
    return true;
  }

  function showGame() {
    state.started = true;
    byId('mp-lobby205')?.classList.add('hidden');
    byId('mp-game-shell205')?.classList.remove('hidden');
    byId('mp-network-hud205')?.classList.remove('hidden');
    updateUI();
  }

  function applyStart(config, delayMs = 1600) {
    const localConfig = { ...config, startAt: Date.now() + Math.max(400, Number(delayMs) || 1600) };
    if (!state.frameReady) {
      pendingStart = { config: localConfig, delayMs };
      return;
    }
    postGame('fd:mp-start', { role: state.role, roomCode: state.roomCode, clientId: state.clientId, config: localConfig });
    showGame();
  }

  function startMatch() {
    if (state.role !== 'host' || !state.connected || !state.frameReady || !state.remoteReady) return false;
    state.mode = byId('mp-mode205')?.value === 'versus' ? 'versus' : 'coop';
    const delayMs = 1800;
    const config = {
      mode: state.mode,
      seed: crypto.getRandomValues(new Uint32Array(1))[0] || 921731,
      hostFaction: byId('mp-host-faction205')?.value || 'vanguard',
      guestFaction: byId('mp-enemy-faction205')?.value || 'dominion',
      difficulty: byId('mp-difficulty205')?.value || 'normal',
    };
    sendPacket({ kind: 'start', config, delayMs });
    applyStart(config, delayMs);
    return true;
  }

  function handlePacket(packet) {
    if (!packet || typeof packet.kind !== 'string') return;
    switch (packet.kind) {
      case 'hello':
        if (Number(packet.build) !== BUILD) { setError('У второго игрока открыта другая сборка'); return; }
        state.remoteReady = Boolean(packet.frameReady);
        if (!state.remoteReady) sendPacket({ kind: 'ready-query' });
        updateUI();
        break;
      case 'ready-query':
        sendPacket({ kind: 'game-ready', ready: state.frameReady });
        break;
      case 'game-ready':
        state.remoteReady = Boolean(packet.ready);
        updateUI();
        break;
      case 'ping':
        sendPacket({ kind: 'pong', sentAt: packet.sentAt });
        break;
      case 'pong':
        state.rtt = Math.max(0, performance.timeOrigin + performance.now() - Number(packet.sentAt || 0));
        updateUI();
        break;
      case 'intent':
        if (state.role === 'host') authorizeIntent(packet.intent);
        break;
      case 'event':
        if (state.role === 'guest' && packet.event) {
          state.eventsReceived += 1;
          state.lastEvent = { action: packet.event.action, seq: packet.event.seq, atTick: packet.event.atTick, team: packet.event.team };
          postGame('fd:mp-event', { event: packet.event });
        }
        break;
      case 'clock':
        if (state.role === 'guest') {
          state.hostTick = Number(packet.tick) || 0;
          postGame('fd:mp-host-tick', { tick: state.hostTick });
          updateUI();
        }
        break;
      case 'status':
        if (state.role === 'host') compareRemoteStatus(packet.status);
        break;
      case 'start':
        if (state.role === 'guest') {
          state.mode = packet.config?.mode === 'versus' ? 'versus' : 'coop';
          applyStart(packet.config || {}, packet.delayMs);
        }
        break;
      case 'resync-request':
        if (state.role === 'host') requestResync(packet.reason || 'запрос второго игрока');
        break;
      case 'snapshot':
        if (state.role === 'guest' && packet.snapshot) {
          state.snapshotsReceived += 1;
          postGame('fd:mp-snapshot', { snapshot: packet.snapshot, requestId: packet.requestId });
        }
        break;
      case 'resynced':
        if (state.role === 'host') state.mismatchStreak = 0;
        updateUI();
        break;
      default:
        break;
    }
  }

  function handleFrameMessage(event) {
    if (event.origin !== location.origin || event.source !== gameWindow()) return;
    const message = event.data || {};
    switch (message.type) {
      case 'fd:mp-ready':
        state.frameReady = true;
        if (state.connected) sendPacket({ kind: 'game-ready', ready: true });
        if (pendingStart) {
          const next = pendingStart;
          pendingStart = null;
          applyStart(next.config, next.delayMs);
        }
        updateUI();
        break;
      case 'fd:mp-intent':
        if (state.role === 'host') authorizeIntent(message.intent);
        else sendPacket({ kind: 'intent', intent: message.intent });
        break;
      case 'fd:mp-status': {
        const status = message.status || {};
        state.lastStatus = status;
        if (state.role === 'host') {
          state.hostTick = Number(status.tick) || 0;
          state.remoteTick = Number(state.remoteStatus?.tick) || 0;
          hostStatuses.set(state.hostTick, status);
          trimStatusHistory();
          sendPacket({ kind: 'clock', tick: state.hostTick });
        } else {
          state.remoteTick = Number(status.tick) || 0;
          sendPacket({ kind: 'status', status });
        }
        updateUI();
        break;
      }
      case 'fd:mp-resync-request':
        if (state.role === 'guest') sendPacket({ kind: 'resync-request', reason: message.reason || 'ошибка применения команды' });
        break;
      case 'fd:mp-snapshot':
        if (state.role === 'host' && message.snapshot) {
          state.snapshotsSent += 1;
          sendPacket({ kind: 'snapshot', snapshot: message.snapshot, requestId: message.requestId });
        }
        break;
      case 'fd:mp-resynced':
        if (state.role === 'guest') sendPacket({ kind: 'resynced', tick: message.tick });
        break;
      default:
        break;
    }
  }

  async function copyFrom(id) {
    const value = byId(id)?.value || '';
    if (!value) return false;
    try { await navigator.clipboard.writeText(value); }
    catch (_) {
      const input = byId(id);
      input.focus();
      input.select();
      document.execCommand('copy');
    }
    return true;
  }

  function selectRole(role) {
    clearError();
    state.role = role;
    setHidden('mp-role-choice205', true);
    setHidden('mp-live-status205', false);
    setHidden('mp-host-panel205', role !== 'host');
    setHidden('mp-guest-panel205', role !== 'guest');
    setText('mp-role-label205', role === 'host' ? 'ВЕДУЩИЙ' : 'ВТОРОЙ ИГРОК');
    updateUI();
  }

  function bindUI() {
    byId('mp-host-role205')?.addEventListener('click', () => selectRole('host'));
    byId('mp-guest-role205')?.addEventListener('click', () => selectRole('guest'));
    byId('mp-create-offer205')?.addEventListener('click', () => createOffer().catch(setError));
    byId('mp-accept-offer205')?.addEventListener('click', () => acceptOffer(byId('mp-offer-input205').value).catch(setError));
    byId('mp-accept-answer205')?.addEventListener('click', () => acceptAnswer(byId('mp-answer-input205').value).catch(setError));
    byId('mp-copy-offer205')?.addEventListener('click', () => copyFrom('mp-offer-output205'));
    byId('mp-copy-answer205')?.addEventListener('click', () => copyFrom('mp-answer-output205'));
    byId('mp-start205')?.addEventListener('click', startMatch);
    byId('mp-reset205')?.addEventListener('click', () => location.reload());
    byId('mp-back205')?.addEventListener('click', () => { location.href = `./frontline-dominion.html?build=${BUILD}`; });
    byId('mp-mode205')?.addEventListener('change', event => {
      const versus = event.target.value === 'versus';
      setText('mp-mode-help205', versus ? 'Две живые армии. ИИ отключён.' : 'Два игрока командуют общей армией против ИИ.');
    });
    addEventListener('message', handleFrameMessage);
    addEventListener('beforeunload', closePeer);
    updateUI();
  }

  bindUI();
  statusTimer = setInterval(updateUI, 500);

  root.__FD_MULTIPLAYER_LOBBY_205__ = {
    version: VERSION,
    build: BUILD,
    state,
    createOffer,
    acceptOffer,
    acceptAnswer,
    startMatch,
    closePeer,
    diagnostics: () => ({
      ...state,
      outboundPackets: outbound.length,
      fragments: fragments.size,
      channelBufferedAmount: channel?.bufferedAmount || 0,
      peerConnectionState: peer?.connectionState || null,
      iceConnectionState: peer?.iceConnectionState || null,
    }),
  };
})();
