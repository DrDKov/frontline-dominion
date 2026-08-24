// requires: __FD_DEBUG__
// provides: __FD_TRANSPORT_FIRE__
(() => {
  'use strict';
  const root = typeof window !== 'undefined' ? window : self;
  const D = root.__FD_DEBUG__;
  if (!D?.Unit || !D?.Game || root.__FD_TRANSPORT_FIRE__) return;
  const Unit = D.Unit;
  const EPS = 1e-6;
  const distance = (a, b) => Math.hypot((Number(a?.x) || 0) - (Number(b?.x) || 0), (Number(a?.y) || 0) - (Number(b?.y) || 0));
  const hash = value => {
    let h = 2166136261;
    for (const c of String(value || '')) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  };
  const ammoValue = unit => Number(unit?.magazineAmmo139 ?? unit?.ammo ?? unit?.weaponAmmo ?? NaN);

  function isGroundTransport(transport) {
    if (!transport?.alive || transport.kind !== 'unit') return false;
    if ((Number(transport.stats?.transportCapacity) || 0) <= 0) return false;
    if (transport.air || transport.stats?.air) return false;
    const mobility = String(transport.stats?.mobilityClass || '').toLowerCase();
    return !/fixed\s*wing|fixedwing|rotary|helicopter|aircraft|\bair\b/.test(mobility);
  }

  function isEmbarkedPassenger(unit, transport) {
    if (!unit?.alive || !transport?.alive || !unit.embarkedIn || String(unit.embarkedIn) !== String(transport.id)) return false;
    // embarkedIn is the authoritative passenger->carrier relation and is present
    // in every canonical save/snapshot. Older/compact Worker states may omit the
    // reciprocal transportCargoIds array, so only use that list as an additional
    // consistency check when it is actually populated.
    const ids = Array.isArray(transport.transportCargoIds) && transport.transportCargoIds.length
      ? transport.transportCargoIds
      : (Array.isArray(transport.cargoUnits) && transport.cargoUnits.length
        ? transport.cargoUnits.map(value => typeof value === 'object' ? value?.id : value)
        : null);
    return !ids || ids.some(id => String(id) === String(unit.id));
  }

  function withCarrierCombatState(unit, transport, callback) {
    const saved = {
      embarkedIn: unit.embarkedIn,
      air: unit.air,
      vision: unit.vision,
      x: unit.x, y: unit.y,
      renderX: unit.renderX, renderY: unit.renderY,
      rotation: unit.rotation, renderRotation: unit.renderRotation,
    };
    unit.embarkedIn = null;
    unit.air = Boolean(unit._v78OriginalAir ?? unit.stats?.air);
    unit.vision = Math.max(0, Number(unit.stats?.vision) || 0);
    unit.x = transport.x; unit.y = transport.y;
    unit.renderX = transport.renderX ?? transport.x;
    unit.renderY = transport.renderY ?? transport.y;
    try { return callback(); }
    finally {
      unit.embarkedIn = saved.embarkedIn;
      unit.air = saved.air;
      unit.vision = saved.vision;
      unit.x = transport.x; unit.y = transport.y;
      unit.renderX = transport.renderX ?? transport.x;
      unit.renderY = transport.renderY ?? transport.y;
      if (!Number.isFinite(unit.rotation)) unit.rotation = saved.rotation;
      if (!Number.isFinite(unit.renderRotation)) unit.renderRotation = saved.renderRotation;
    }
  }

  function targetValidCombatState(unit, transport, target, range) {
    if (!target?.alive || target.team === unit.team || target.team === 'neutral' || target.embarkedIn) return false;
    if (!unit.canAttack?.(target)) return false;
    if (distance(transport, target) - (Number(transport.radius) || 0) - (Number(target.radius) || 0) > range + EPS) return false;
    if (typeof unit.game?.isTargetableBy === 'function' && !unit.game.isTargetableBy(target, unit.team, unit)) return false;
    return true;
  }

  function targetValid(unit, transport, target, range) {
    return withCarrierCombatState(unit, transport, () => targetValidCombatState(unit, transport, target, range));
  }

  function deterministicFallbackTarget(unit, transport, range) {
    const candidates = [];
    const push = target => {
      if (!targetValidCombatState(unit, transport, target, range)) return;
      candidates.push({ target, distance: distance(transport, target) });
    };
    for (const target of unit.game?.units || []) push(target);
    for (const target of unit.game?.buildings || []) push(target);
    candidates.sort((a, b) => a.distance - b.distance || String(a.target.id).localeCompare(String(b.target.id), 'en'));
    return candidates[0]?.target || null;
  }

  function acquireTarget(unit, transport, range) {
    const game = unit.game;
    let target = game?.getEntity?.(unit._embarkedFireTarget);
    if (targetValid(unit, transport, target, range * 1.08)) return target;
    const now = Number(game?.time) || 0;
    if (now + EPS < (Number(unit._embarkedFireScanAt) || 0)) return null;
    unit._embarkedFireScanAt = now + .16 + (hash(unit.id) % 7) * .011;
    target = withCarrierCombatState(unit, transport, () => {
      let candidate = null;
      if (typeof game?.findNearestEnemy === 'function') {
        candidate = game.findNearestEnemy(
          transport.x, transport.y, unit.team,
          range + (Number(transport.radius) || 0), unit.stats?.weapon?.targets, unit,
        );
      }
      if (!targetValidCombatState(unit, transport, candidate, range)) candidate = deterministicFallbackTarget(unit, transport, range);
      return candidate;
    });
    if (!targetValid(unit, transport, target, range)) target = null;
    unit._embarkedFireTarget = target?.id || null;
    return target;
  }

  function fireFromGroundTransport(unit, transport, dt, cooldownAlreadyAdvanced) {
    const weapon = unit.stats?.weapon;
    if (!weapon || !(Number(weapon.damage) > 0) || !Array.isArray(weapon.targets) || !weapon.targets.length) return false;
    if (!cooldownAlreadyAdvanced) unit.weaponCooldown = Math.max(0, (Number(unit.weaponCooldown) || 0) - Math.max(0, Number(dt) || 0));
    if (Number(unit.magazineReloadRemaining139) > 0 || unit.airServiceState) return false;

    const effectiveRange = Math.max(1, Number(weapon.range) || 0) * (Number(unit.game?.getJammingFactor?.(unit)) || 1);
    const target = acquireTarget(unit, transport, effectiveRange);
    if (!target || (Number(unit.weaponCooldown) || 0) > EPS) return false;

    unit.x = transport.x; unit.y = transport.y;
    unit.renderX = transport.renderX ?? transport.x;
    unit.renderY = transport.renderY ?? transport.y;
    unit.rotation = Math.atan2(target.y - transport.y, target.x - transport.x);
    unit.renderRotation = unit.rotation;

    const beforeShot = Number(unit.lastShotAt) || -1;
    const beforeProjectiles = unit.game?.projectiles?.length || 0;
    const beforeAmmo = ammoValue(unit);
    withCarrierCombatState(unit, transport, () => unit.fire?.(target));
    const afterAmmo = ammoValue(unit);
    const committed = (unit.game?.projectiles?.length || 0) > beforeProjectiles ||
      (Number(unit.lastShotAt) || -1) !== beforeShot ||
      (Number.isFinite(beforeAmmo) && Number.isFinite(afterAmmo) && afterAmmo < beforeAmmo);
    if (!committed) return false;
    unit._embarkedShots = (Number(unit._embarkedShots) || 0) + 1;
    unit._embarkedLastShotAt = Number(unit.game?.time) || 0;
    transport._passengerShots = (Number(transport._passengerShots) || 0) + 1;
    return true;
  }

  const baseUpdate = Unit.prototype.update;
  Unit.prototype.update = function(dt) {
    const transportId = this.embarkedIn;
    const transport = transportId ? this.game?.getEntity?.(transportId) : null;
    const beforeShot = Number(this.lastShotAt) || -1;
    const beforeProjectiles = this.game?.projectiles?.length || 0;
    const beforeCooldown = Number(this.weaponCooldown) || 0;
    const result = baseUpdate.call(this, dt);
    if (!transportId || !isGroundTransport(transport) || !isEmbarkedPassenger(this, transport)) return result;

    const baseAlreadyFired = (this.game?.projectiles?.length || 0) > beforeProjectiles || (Number(this.lastShotAt) || -1) !== beforeShot;
    if (baseAlreadyFired) return result;
    const cooldownAlreadyAdvanced = (Number(this.weaponCooldown) || 0) < beforeCooldown - EPS;
    fireFromGroundTransport(this, transport, dt, cooldownAlreadyAdvanced);
    return result;
  };

  const baseSerialize = Unit.prototype.serialize;
  Unit.prototype.serialize = function() {
    const data = baseSerialize.call(this);
    if (this._embarkedFireTarget) data.embarkedFireTarget = this._embarkedFireTarget;
    if (Number(this._embarkedFireScanAt) > 0) data.embarkedFireScanAt = this._embarkedFireScanAt;
    if (Number(this._embarkedShots) > 0) data.embarkedShots = this._embarkedShots;
    return data;
  };

  const baseHydrate = D.Game.prototype.hydrate;
  D.Game.prototype.hydrate = function(data) {
    const result = baseHydrate.call(this, data);
    const rawById = new Map((data?.entities || []).filter(e => e?.kind === 'unit').map(e => [String(e.id), e]));
    for (const unit of this.units || []) {
      const raw = rawById.get(String(unit.id));
      if (!raw) continue;
      unit._embarkedFireTarget = raw.embarkedFireTarget || null;
      unit._embarkedFireScanAt = Number(raw.embarkedFireScanAt) || 0;
      unit._embarkedShots = Number(raw.embarkedShots) || 0;
    }
    return result;
  };

  root.__FD_TRANSPORT_FIRE__ = Object.freeze({
    groundPassengersFire: true,
    aviationExcluded: true,
    movingCarrierFire: true,
    ownFiniteAmmo: true,
    carrierAmmoIsolation: true,
    noDoubleFire: true,
    saveLoadPreserved: true,
    combatStateBridge: true,
    authoritativeEmbarkRelation: true,
    isGroundTransport,
  });
})();
