(() => {
  'use strict';

  const root = globalThis;
  const D = root.__FD_DEBUG__;
  const Game = D?.Game;
  if (typeof document === 'undefined' || !Game) return;
  if (root.__FD_RESOURCE_AUTHORITY_192__) return;

  const VERSION = '16.8.8';
  const BUILD = 192;
  const legacyBuildExtractor = Game.prototype.buildExtractorFromResource83;
  if (typeof legacyBuildExtractor !== 'function') return;

  const state = {
    handlerCalls: 0,
    commandsSent: 0,
    rejected: 0,
    legacyFallbacks: 0,
    lastReason: null,
    lastResourceId: null,
    lastWorkerIds: [],
    lastSeq: 0,
  };

  const bridgeFor = game => {
    const bridge = root.__FD_STABLE_STATE165__?.bridge || game?.authoritativeBridge172 || null;
    return bridge?.ready && !bridge.failed && typeof bridge.sendAction === 'function' ? bridge : null;
  };

  const availableWorkers = game => (game?.units || [])
    .filter(unit => unit?.alive && unit.team === 'player' && unit.typeId === 'worker' && !unit.embarkedIn)
    .slice(0, 3);

  const authoritativeBuildExtractor192 = function(node) {
    state.handlerCalls += 1;
    state.lastReason = null;
    const bridge = bridgeFor(this);
    if (!bridge) {
      state.legacyFallbacks += 1;
      state.lastReason = 'bridge-unavailable';
      return legacyBuildExtractor.call(this, node);
    }
    if (!node?.alive || node.kind !== 'resource') {
      state.rejected += 1;
      state.lastReason = 'resource-invalid';
      return false;
    }

    // Resource visibility is represented asynchronously by the authoritative
    // mirror, so a second isExploredAt() query here can disagree with the
    // resource panel that the player is actively using. Treat an explicit click
    // on the currently selected live resource card as the trusted discovery
    // intent. Hidden resources cannot create this card or become the primary
    // selection through normal input. Worker-side placement remains authoritative
    // and receives only this one selected node as a scoped known-resource grant.
    const primary = this.getPrimarySelection?.();
    const resourceKnown = Boolean(
      primary &&
      (primary === node || primary.id === node.id) &&
      primary.alive &&
      primary.kind === 'resource'
    );
    if (!resourceKnown) {
      this.alert?.('Сначала выберите разведанное месторождение.', 'warning', node.x, node.y);
      state.rejected += 1;
      state.lastReason = 'resource-not-selected';
      return false;
    }

    const existing = node.extractorBuildingId ? this.getEntity?.(node.extractorBuildingId) : null;
    if (existing?.alive) {
      this.alert?.('На этом месторождении уже есть добывающее предприятие.', 'warning', node.x, node.y);
      state.rejected += 1;
      state.lastReason = 'extractor-exists';
      return false;
    }
    const workers = availableWorkers(this);
    if (!workers.length) {
      this.alert?.('Нужен хотя бы один свободный инженер для строительства добывающего предприятия.', 'warning', node.x, node.y);
      state.rejected += 1;
      state.lastReason = 'workers-missing';
      return false;
    }

    const workerIds = workers.map(worker => worker.id);
    const beforeSeq = Number(bridge.seq || 0);
    const sent = bridge.sendAction(
      'buildResourceExtractor',
      { resourceId: node.id, workerIds, resourceKnown: true },
      workerIds,
    );
    if (!sent) {
      state.rejected += 1;
      state.lastReason = 'send-failed';
      return false;
    }

    // Presentation never places the extractor itself. One Worker command owns
    // validation, payment, resource linking and all engineer construction orders.
    this.buildMode = null;
    this.commandMode = null;
    this.uiDirty = true;
    this.addEffect?.({ type: 'marker', x: node.x, y: node.y, color: '#a9d6b5', duration: 0.8 });
    this.sound?.click?.();
    this.alert?.('Инженеры получили приказ развернуть добывающий комплекс.', 'info', node.x, node.y);

    state.commandsSent += 1;
    state.lastReason = 'sent';
    state.lastResourceId = node.id;
    state.lastWorkerIds = [...workerIds];
    state.lastSeq = Number(bridge.seq || beforeSeq + 1);
    return true;
  };

  Object.defineProperty(authoritativeBuildExtractor192, '__fdResourceAuthority192', { value: true });
  Game.prototype.buildExtractorFromResource83 = authoritativeBuildExtractor192;

  root.__FD_RESOURCE_AUTHORITY_192__ = {
    version: VERSION,
    build: BUILD,
    state,
    handler: authoritativeBuildExtractor192,
    legacyBuildExtractor,
    bridgeFor,
  };
})();
