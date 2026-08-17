(() => {
  'use strict';

  const root = globalThis;
  const D = root.__FD_DEBUG__;
  const Game = D?.Game;
  if (typeof document === 'undefined' || !Game?.prototype || Game.prototype.__fdResourceUiStability192Installed) return;

  const VERSION = '16.8.8';
  const BUILD = 192;
  const previousRenderActionUI = Game.prototype.renderActionUI;
  if (typeof previousRenderActionUI !== 'function') return;

  const state = {
    rendered: 0,
    reused: 0,
    lastNodeId: null,
    lastSignature: null,
  };

  const extractorType = node => {
    try { return root.__FD_RESOURCE_EXTRACTION_V114__?.typeForVariant?.(node?.variant) || null; } catch (_) { return null; }
  };

  const getStats = (game, typeId) => {
    if (!typeId) return null;
    try { return D?.getBuildingStats?.(typeId, game?.teams?.player) || D?.BUILDING_TYPES?.[typeId] || null; } catch (_) { return D?.BUILDING_TYPES?.[typeId] || null; }
  };

  const signatureFor = (game, node) => {
    const typeId = extractorType(node);
    const stats = getStats(game, typeId);
    const existing = node?.extractorBuildingId ? game.getEntity?.(node.extractorBuildingId) : null;
    const workerCount = (game?.units || []).reduce((count, unit) => count + Number(Boolean(
      unit?.alive && unit.team === 'player' && unit.typeId === 'worker' && !unit.embarkedIn
    )), 0);
    let unlocked = false;
    try { unlocked = Boolean(stats && game.requirementsMet?.('player', stats.requires || [], stats.rank || 1)); } catch (_) {}
    const affordable = Boolean(stats && Number(game?.teams?.player?.credits || 0) >= Number(stats.cost || 0));
    const constructionPct = existing?.alive ? Math.round(Number(existing.construction || 0) * 100) : -1;
    const amountBucket = Math.round(Number(node?.amount || 0));
    return [
      node?.id || '', typeId || '', existing?.alive ? existing.id : '', existing?.completed ? 1 : 0,
      constructionPct, amountBucket, workerCount, unlocked ? 1 : 0, affordable ? 1 : 0,
    ].join('|');
  };

  const controlsConnected = () => {
    const panel = document.getElementById('action-buttons');
    const queue = document.getElementById('queue-panel');
    const button = panel?.querySelector?.('.resource-build-button');
    const card = panel?.querySelector?.('.resource-site-card');
    return Boolean(panel?.isConnected && queue?.isConnected && button?.isConnected && card?.isConnected);
  };

  Game.prototype.renderActionUI = function stableResourceActionUI192(force = false) {
    const node = this.getPrimarySelection?.();
    if (node?.kind !== 'resource') {
      this._fdResourceUiSignature192 = null;
      state.lastNodeId = null;
      state.lastSignature = null;
      return previousRenderActionUI.call(this, force);
    }

    const signature = signatureFor(this, node);
    if (this._fdResourceUiSignature192 === signature && controlsConnected()) {
      state.reused += 1;
      state.lastNodeId = node.id || null;
      state.lastSignature = signature;
      return true;
    }

    const result = previousRenderActionUI.call(this, force);
    this._fdResourceUiSignature192 = signature;
    state.rendered += 1;
    state.lastNodeId = node.id || null;
    state.lastSignature = signature;
    const button = document.querySelector('#action-buttons .resource-build-button');
    if (button) {
      button.dataset.fdResourceUiStable = '192';
      button.dataset.fdResourceNodeId = String(node.id || '');
    }
    return result;
  };

  Object.defineProperty(Game.prototype, '__fdResourceUiStability192Installed', { value: true, configurable: true });
  root.__FD_RESOURCE_UI_STABILITY_192__ = {
    version: VERSION,
    build: BUILD,
    state,
    signatureFor,
  };
})();
