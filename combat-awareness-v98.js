(() => {
  'use strict';

  const debug = window.__FD_DEBUG__;
  const UnitClass = debug?.Unit;
  if (!UnitClass) return;

  const hash98 = (value) => {
    let hash = 2166136261;
    for (const char of String(value || 'unit')) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
    return hash >>> 0;
  };

  const targetDistance98 = (unit, target) => Math.hypot(target.x - unit.x, target.y - unit.y) - unit.radius - target.radius;

  UnitClass.prototype.awarenessRadius98 = function() {
    if (!this.stats?.weapon) return 0;
    // Keep the query below the engine's broad all-entity fallback while still
    // covering the full practical sight radius of ordinary combat units.
    return Math.max(this.stats.weapon.range * 1.25, Math.min(this.vision || 0, 1600), 240);
  };

  UnitClass.prototype.acquireVisibleTarget98 = function(center = this) {
    if (!this.alive || !this.stats?.weapon || this.embarkedIn || this.airServiceState === 'servicing') return null;
    const radius = this.awarenessRadius98();
    let target = this.game.getEntity(this.awarenessTargetId98);
    if (target && (!this.canAttack(target) || Math.hypot(target.x - center.x, target.y - center.y) > radius * 1.12)) target = null;

    const now = this.game.time;
    if (!target && now >= (this.awarenessScanAt98 || 0)) {
      const stagger = (hash98(this.id) % 9) * .027;
      this.awarenessScanAt98 = now + .32 + stagger;
      target = this.findTarget(radius, center);
    }
    this.awarenessTargetId98 = target?.id || null;
    return target;
  };

  const baseIdleBehavior98 = UnitClass.prototype.idleBehavior;
  UnitClass.prototype.idleBehavior = function(dt) {
    const fixedWing = this.air && this.stats?.mobilityClass === 'fixedWing';
    if (!this.stats?.weapon || fixedWing || this.embarkedIn || this.airServiceState) {
      return baseIdleBehavior98.call(this, dt);
    }
    const target = this.acquireVisibleTarget98();
    if (!target) return;
    this.setCommand({
      type: 'attack',
      targetId: target.id,
      autoEngage98: true,
      anchorX98: this.x,
      anchorY98: this.y,
      acquiredAt98: this.game.time
    });
    this.engageTarget(target, dt, true);
  };

  // Mobile units retain the player's route, but their fire-control system now
  // tracks every visible valid enemy and fires the moment it enters range.
  if (UnitClass.prototype.findMovingFireTarget91) {
    UnitClass.prototype.findMovingFireTarget91 = function(profile) {
      const weapon = this.stats.weapon;
      const effectiveRange = weapon.range * this.game.getJammingFactor(this);
      const awareness = Math.max(effectiveRange * profile.acquisitionScale, Math.min(this.vision || 0, 1600));
      let target = this.game.getEntity(this.movingFireTargetId91);
      if (target && (!this.canAttack(target) || targetDistance98(this, target) > awareness * 1.12)) target = null;
      const now = this.game.time;
      if (!target && now >= (this.movingFireScanAt91 || 0)) {
        const stagger = (hash98(this.id) % 7) * .024;
        this.movingFireScanAt91 = now + .26 + stagger;
        target = this.findTarget(awareness);
      }
      this.movingFireTargetId91 = target?.id || null;
      return target;
    };
  }

  const baseProcessCommand98 = UnitClass.prototype.processCommand;
  UnitClass.prototype.processCommand = function(command, dt) {
    if (!command) return baseProcessCommand98.call(this, command, dt);

    // An automatically acquired target may be pursued, but never drags the
    // unit indefinitely across the map. A direct player attack remains exact.
    if (command.type === 'attack' && command.autoEngage98) {
      const target = this.game.getEntity(command.targetId);
      const anchorDistance = target ? Math.hypot(target.x - command.anchorX98, target.y - command.anchorY98) : Infinity;
      const leash = Math.max(520, this.awarenessRadius98() * 1.55);
      if (!target?.alive || !this.canAttack(target) || anchorDistance > leash) {
        this.finishCommand();
        return;
      }
      this.engageTarget(target, dt, true);
      return;
    }

    // Patrol explicitly stops and fights. Seed its existing combat branch with
    // a full-vision target instead of waiting for an enemy to enter gun range.
    if (command.type === 'patrol' && this.stats?.weapon) {
      let target = this.game.getEntity(command.combatTargetId);
      if (!target?.alive || !this.canAttack(target)) target = this.acquireVisibleTarget98();
      if (target) {
        command.combatTargetId = target.id;
        command.combatStartedAt ||= this.game.time;
      }
    }

    // Non-mobile batteries on attack-move stop and engage visible threats;
    // mobile weapons use the parallel fire-control path above and keep moving.
    if (command.type === 'attackMove' && this.stats?.weapon && !this.canFireWhileMoving91?.()) {
      const target = this.acquireVisibleTarget98();
      if (target) {
        this.engageTarget(target, dt, true);
        return;
      }
    }

    // Guards respond throughout the guarded unit's sight bubble and return to
    // their normal escort behavior once no threat remains.
    if (command.type === 'guard' && this.stats?.weapon) {
      const guarded = this.game.getEntity(command.targetId);
      let target = this.game.getEntity(command.combatTargetId);
      if (!target?.alive || !this.canAttack(target)) target = guarded?.alive ? this.acquireVisibleTarget98(guarded) : null;
      if (target && guarded && Math.hypot(target.x - guarded.x, target.y - guarded.y) <= this.awarenessRadius98() * 1.2) {
        command.combatTargetId = target.id;
        this.engageTarget(target, dt, true);
        return;
      }
      command.combatTargetId = null;
    }

    return baseProcessCommand98.call(this, command, dt);
  };

  void 0;
  window.__FD_COMBAT_AWARENESS__ = {
    version: '9.8',
    fullVisionEngagement: true,
    holdPositionRespected: true,
    movingOrdersPreserved: true
  };
})();
