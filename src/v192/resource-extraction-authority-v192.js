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
    commandsSent: 0,
    rejected: 0,
    lastResourceId: null,
    lastWorkerIds: [],
    lastSeq: 0,
  };

  const bridgeFor = game => {
    const bridge = root.__FD_STABLE_STATE165__?.bridge || game?.authoritativeBridge172 || null;
    return bridge?.ready && !bridge.failed && bridge.worker ? bridge : null;
  };

  const availableWorkers = game => (game?.units || [])
    .filter(unit => unit?.alive && unit.team === 'player' && unit.typeId === 'worker' && !unit.embarkedIn)
    .slice(0, 3);

  Game.prototype.buildExtractorFromResource83 = function(node) {
    const bridge = bridgeFor(this);
    if (!bridge) return legacyBuildExtractor.call(this, node);
    if (!node?.alive || node.kind !== 'resource') {
      state.rejected += 1;
      return false;
    }
    const resourceKnown = this.isExploredAt ? Boolean(this.isExploredAt(node.x, node.y)) : true;
    if (!resourceKnown) {
      this.alert?.('Сначала разведайте месторождение.', 'warning', node.x, node.y);
      state.rejected += 1;
      return false;
    }
    const existing = node.extractorBuildingId ? this.getEntity?.(node.extractorBuildingId) : null;
    if (existing?.alive) {
      this.alert?.('На этом месторождении уже есть добывающее предприятие.', 'warning', node.x, node.y);
      state.rejected += 1;
      return false;
    }
    const workers = availableWorkers(this);
    if (!workers.length) {
      this.alert?.('Нужен хотя бы один свободный инженер для строительства добывающего предприятия.', 'warning', node.x, node.y);
      state.rejected += 1;
      return false;
    }

    const workerIds = workers.map(worker => worker.id);
    const beforeSeq = Number(bridge.seq || 0);
    const sent = bridge.sendAction(
      'buildResourceExtractor',
      { resourceId: node.id, workerIds, resourceKnown },
      workerIds,
    );
    if (!sent) {
      state.rejected += 1;
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
    state.lastResourceId = node.id;
    state.lastWorkerIds = [...workerIds];
    state.lastSeq = Number(bridge.seq || beforeSeq + 1);
    return true;
  };

  root.__FD_RESOURCE_AUTHORITY_192__ = {
    version: VERSION,
    build: BUILD,
    state,
    legacyBuildExtractor,
  };
})();
