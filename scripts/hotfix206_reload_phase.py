from pathlib import Path

PATH = Path('dist/unit-sustainment-v206.js')
if not PATH.exists():
    raise RuntimeError('build 206 unit sustainment module missing')
text = PATH.read_text('utf-8')

old_wrapper = """  const baseUpdate206 = Unit.prototype.update;
  Unit.prototype.update = function(dt) {
    const state = L.ensureUnit(this, false);
    if (state && !L.isAir(this) && state.ammoReadyMax > 0) {
      // v139 may have started its old field reload through an aggregated attack.
      // Convert that event into the reserve-backed v206 reload before v139 runs.
      if (Number.isFinite(this.magazineReloadRemaining139) && this.magazineReloadRemaining139 > 0 &&
          !(state.reloadRemaining206 > EPS) && state.ammoReady <= EPS) {
        startReload206(this, state);
      }
      if (this.magazineReloadRemaining139 > 0 && state.reloadRemaining206 > EPS) this.magazineReloadRemaining139 = Infinity;
      syncReadyToLegacy206(this, state);
    }
    const result = baseUpdate206.call(this, dt);
    if (state && !L.isAir(this) && state.ammoReadyMax > 0) {
      syncReadyFromLegacy206(this, state);
      if (state.ammoReady <= EPS && !(state.reloadRemaining206 > EPS)) startReload206(this, state);
      processReload206(this, state, dt);
    }
    return result;
  };
"""
new_wrapper = """  const baseUpdate206 = Unit.prototype.update;
  // Do not mutate logistics/ammunition state around every individual legacy
  // Unit.update(). Navigation, collision separation and action-group code all
  // execute inside that call and must see the same object state/order as the
  // deterministic pre-206 engine. Finite ammunition is reconciled once after
  // the whole world step in reloadPhase206 below.
  Unit.prototype.update = function(dt) {
    return baseUpdate206.call(this, dt);
  };
"""
if text.count(old_wrapper) != 1:
    raise RuntimeError(f'build 206 Unit.update wrapper anchor count={text.count(old_wrapper)}')
text = text.replace(old_wrapper, new_wrapper, 1)

old_post = """  function sustainmentPost206(dt) {
    groundMovementFuel206.call(this);
    supportAndReadiness206.call(this, dt);
  }
"""
new_post = """  function reloadPhase206(dt) {
    const units = (this.units || []).filter(unit => unit?.alive && !L.isAir(unit))
      .sort((a, b) => String(a.id).localeCompare(String(b.id), 'en'));
    for (const unit of units) {
      const state = L.ensureUnit(unit, false);
      if (!state || state.ammoReadyMax <= 0) continue;

      if (state.reloadRemaining206 > EPS) {
        // v139 must never be allowed to finish its free field reload while the
        // physical reserve-backed timer owns this unit.
        unit.magazineReloadRemaining139 = Infinity;
        syncReadyToLegacy206(unit, state);
        processReload206(unit, state, dt);
        continue;
      }

      if (state.ammoReady <= EPS) {
        // Undo any legacy free refill before observing the old timer, then
        // convert the reload request into a physical reserve-backed reload.
        const legacyRequestedReload = Number.isFinite(unit.magazineReloadRemaining139) && unit.magazineReloadRemaining139 > 0;
        syncReadyToLegacy206(unit, state);
        if (legacyRequestedReload || state.ammoReserve > EPS) startReload206(unit, state);
        continue;
      }

      // Aggregated/legacy firing paths may have consumed the ready magazine
      // without going through Unit.fire. Downward synchronization is physical;
      // never accept an unexplained upward refill.
      const field = readyField206(unit);
      if (field) {
        const legacyReady = Math.max(0, Number(unit[field[0]]) || 0);
        if (legacyReady < state.ammoReady - EPS) {
          state.ammoReady = L.round(legacyReady);
          if (state.ammoReady <= EPS) startReload206(unit, state);
        } else {
          syncReadyToLegacy206(unit, state);
        }
      }
    }
  }

  function sustainmentPost206(dt) {
    reloadPhase206.call(this, dt);
    groundMovementFuel206.call(this);
    supportAndReadiness206.call(this, dt);
  }
"""
if text.count(old_post) != 1:
    raise RuntimeError(f'build 206 sustainment post anchor count={text.count(old_post)}')
text = text.replace(old_post, new_post, 1)
PATH.write_text(text, 'utf-8')
print('Build 206 finite reload reconciled after world step instead of inside Unit.update')
