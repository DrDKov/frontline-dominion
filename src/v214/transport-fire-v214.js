(() => {
  'use strict';
  const root = typeof window !== 'undefined' ? window : self;
  const D = root.__FD_DEBUG__;
  if (!D?.Unit || !D?.Game) return;
  const Unit = D.Unit;
  if (Unit.prototype.__fdEmbarkedFire214Installed) return;
  Object.defineProperty(Unit.prototype, '__fdEmbarkedFire214Installed', { value: true, configurable: true });

  const BUILD = 214;
  const VERSION = '16.9.8';
  const EPS = 1e-6;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, Number(v) || 0));
  const distance = (a, b) => Math.hypot((Number(a?.x)||0)-(Number(b?.x)||0),(Number(a?.y)||0)-(Number(b?.y)||0));
  const hash = value => { let h=2166136261; for(const c of String(value||'')){h^=c.charCodeAt(0);h=Math.imul(h,16777619)>>>0;} return h>>>0; };

  function isGroundTransport214(transport) {
    if (!transport?.alive || transport.kind !== 'unit') return false;
    const capacity = Number(transport.stats?.transportCapacity) || 0;
    if (capacity <= 0) return false;
    if (transport.air || transport.stats?.air) return false;
    const mobility = String(transport.stats?.mobilityClass || '').toLowerCase();
    if (/fixedwing|rotary|helicopter|air/.test(mobility)) return false;
    return true;
  }

  function isEmbarkedPassenger214(unit, transport) {
    if (!unit?.alive || !transport?.alive || !unit.embarkedIn || String(unit.embarkedIn) !== String(transport.id)) return false;
    if (!Array.isArray(transport.transportCargoIds) || !transport.transportCargoIds.some(id => String(id) === String(unit.id))) return false;
    return true;
  }

  function targetValid214(unit, transport, target, range) {
    if (!target?.alive || target.team === unit.team || target.team === 'neutral') return false;
    if (!unit.canAttack?.(target)) return false;
    if (target.embarkedIn) return false;
    if (distance(transport, target) - (Number(transport.radius)||0) - (Number(target.radius)||0) > range + EPS) return false;
    if (typeof unit.game?.isTargetableBy === 'function' && !unit.game.isTargetableBy(target, unit.team, unit)) return false;
    return true;
  }

  function acquireTarget214(unit, transport, range) {
    const game = unit.game;
    let target = game.getEntity?.(unit._embarkedFireTarget214);
    if (targetValid214(unit, transport, target, range * 1.08)) return target;
    target = null;
    const now = Number(game.time) || 0;
    if (now + EPS < (Number(unit._embarkedFireScanAt214)||0)) return null;
    const stagger = (hash(unit.id) % 7) * .011;
    unit._embarkedFireScanAt214 = now + .16 + stagger;
    if (typeof game.findNearestEnemy === 'function') {
      target = game.findNearestEnemy(transport.x, transport.y, unit.team, range + (Number(transport.radius)||0), unit.stats.weapon.targets, unit);
    }
    if (!targetValid214(unit, transport, target, range)) target = null;
    unit._embarkedFireTarget214 = target?.id || null;
    return target;
  }

  function fireFromTransport214(unit, transport, dt) {
    const weapon = unit.stats?.weapon;
    if (!weapon || !(Number(weapon.damage) > 0) || !Array.isArray(weapon.targets) || !weapon.targets.length) return false;

    // Embarked units are deliberately removed from normal Unit.update by the
    // transport owner, so their ordinary weapon timer does not advance.
    unit.weaponCooldown = Math.max(0, (Number(unit.weaponCooldown)||0) - Math.max(0, Number(dt)||0));
    if (unit.magazineReloadRemaining139 > 0 || unit.airServiceState) return false;

    const effectiveRange = Math.max(1, Number(weapon.range)||0) * (Number(unit.game?.getJammingFactor?.(unit)) || 1);
    const target = acquireTarget214(unit, transport, effectiveRange);
    if (!target) return false;

    unit.x = transport.x;
    unit.y = transport.y;
    unit.renderX = transport.renderX ?? transport.x;
    unit.renderY = transport.renderY ?? transport.y;
    unit.rotation = Math.atan2(target.y - transport.y, target.x - transport.x);
    unit.renderRotation = unit.rotation;
    if ((Number(unit.weaponCooldown)||0) > EPS) return false;

    const beforeShot = Number(unit.lastShotAt)||-1;
    const beforeProjectiles = unit.game?.projectiles?.length || 0;
    // transport-v78/v95 uses air=true only as a collision-layer sentinel.
    // Temporarily restore the passenger's real layer so all existing finite
    // ammunition and weapon wrappers execute as a ground weapon, then restore
    // the collision sentinel without ever disembarking the unit.
    const collisionAir = unit.air;
    unit.air = Boolean(unit._v78OriginalAir ?? unit.stats?.air);
    try { unit.fire?.(target); }
    finally { unit.air = collisionAir; }
    const committed = (unit.game?.projectiles?.length || 0) > beforeProjectiles || (Number(unit.lastShotAt)||-1) !== beforeShot;
    if (committed) {
      unit._embarkedShots214 = (Number(unit._embarkedShots214)||0) + 1;
      unit._embarkedLastShotAt214 = Number(unit.game?.time)||0;
      transport._passengerShots214 = (Number(transport._passengerShots214)||0) + 1;
      return true;
    }
    return false;
  }

  const baseUpdate214 = Unit.prototype.update;
  Unit.prototype.update = function(dt) {
    const transportId = this.embarkedIn;
    const transportBefore = transportId ? this.game?.getEntity?.(transportId) : null;
    const result = baseUpdate214.call(this, dt);
    if (!transportId || !isGroundTransport214(transportBefore) || !isEmbarkedPassenger214(this, transportBefore)) return result;
    fireFromTransport214(this, transportBefore, dt);
    return result;
  };

  const baseSerialize214 = Unit.prototype.serialize;
  Unit.prototype.serialize = function() {
    const data = baseSerialize214.call(this);
    if (this._embarkedFireTarget214) data.embarkedFireTarget214 = this._embarkedFireTarget214;
    if (Number(this._embarkedFireScanAt214) > 0) data.embarkedFireScanAt214 = this._embarkedFireScanAt214;
    if (Number(this._embarkedShots214) > 0) data.embarkedShots214 = this._embarkedShots214;
    return data;
  };

  const baseHydrate214 = D.Game.prototype.hydrate;
  D.Game.prototype.hydrate = function(data) {
    const result = baseHydrate214.call(this, data);
    const rawById = new Map((data?.entities || []).filter(e => e?.kind === 'unit').map(e => [String(e.id), e]));
    for (const unit of this.units || []) {
      const raw = rawById.get(String(unit.id));
      if (!raw) continue;
      unit._embarkedFireTarget214 = raw.embarkedFireTarget214 || null;
      unit._embarkedFireScanAt214 = Number(raw.embarkedFireScanAt214)||0;
      unit._embarkedShots214 = Number(raw.embarkedShots214)||0;
    }
    return result;
  };

  root.__FD_TRANSPORT_FIRE_214__ = Object.freeze({
    build: BUILD, version: VERSION,
    groundPassengersFire: true,
    aviationExcluded: true,
    finiteAmmoPreserved: true,
    saveLoadPreserved: true,
    isGroundTransport214,
  });
})();
