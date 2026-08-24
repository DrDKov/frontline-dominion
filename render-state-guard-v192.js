(() => {
  'use strict';

  const root = globalThis;
  const D = root.__FD_DEBUG__;
  const Game = D?.Game;
  if (typeof document === 'undefined' || !Game?.prototype || root.__FD_RENDER_STATE_GUARD_192__) return;

  const VERSION = '16.8.8';
  const BUILD = 192;
  const baseDrawUnit = Game.prototype.drawUnit3D;
  if (typeof baseDrawUnit !== 'function') return;

  const state = {
    recoveredStats: 0,
    skippedUnknown: 0,
    lastRecoveredId: null,
    lastRecoveredType: null,
    lastUnknownId: null,
    lastUnknownType: null,
  };

  const resolveStats192 = (game, unit) => {
    if (unit?.stats) return unit.stats;
    if (!unit?.typeId) return null;
    const teamState = game?.teams?.[unit.team];
    if (teamState && typeof D?.getUnitStats === 'function') {
      try {
        const stats = D.getUnitStats(unit.typeId, teamState);
        if (stats) {
          unit.stats = stats;
          state.recoveredStats += 1;
          state.lastRecoveredId = unit.id || null;
          state.lastRecoveredType = unit.typeId;
          return stats;
        }
      } catch (_) {}
    }
    const base = D?.UNIT_TYPES?.[unit.typeId];
    if (base) {
      unit.stats = base;
      state.recoveredStats += 1;
      state.lastRecoveredId = unit.id || null;
      state.lastRecoveredType = unit.typeId;
      return base;
    }
    state.skippedUnknown += 1;
    state.lastUnknownId = unit.id || null;
    state.lastUnknownType = unit.typeId || null;
    return null;
  };

  Game.prototype.drawUnit3D = function guardedDrawUnit192(unit, ...rest) {
    if (!unit?.alive) return baseDrawUnit.call(this, unit, ...rest);
    if (!resolveStats192(this, unit)) return;
    return baseDrawUnit.call(this, unit, ...rest);
  };
  Object.defineProperty(Game.prototype.drawUnit3D, '__fdRenderStateGuard192', { value: true });

  root.__FD_RENDER_STATE_GUARD_192__ = {
    version: VERSION,
    build: BUILD,
    state,
    resolveStats: resolveStats192,
  };
})();
