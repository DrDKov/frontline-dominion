(() => {
  'use strict';

  const D = window.__FD_DEBUG__;
  const Game = D?.Game;
  const Unit = D?.Unit;
  if (!Game || !Unit) return;

  const HOLD = 'hold';
  const FREE = 'free';
  const armed = unit => Boolean(unit?.alive && unit.kind === 'unit' && unit.stats?.weapon);
  const holding = unit => unit?.fireDiscipline177 === HOLD;

  // Default state lives on the prototype so old saves and newly produced units
  // remain fully compatible without touching every constructor call site.
  if (!Object.prototype.hasOwnProperty.call(Unit.prototype, 'fireDiscipline177')) {
    Unit.prototype.fireDiscipline177 = FREE;
  }

  // Low-level combat gate. Every ordinary and mass-simulation weapon path
  // consults canAttack before committing damage or a physical projectile.
  if (typeof Unit.prototype.canAttack === 'function' && !Unit.prototype.canAttack._fdFireDiscipline177) {
    const baseCanAttack = Unit.prototype.canAttack;
    const wrappedCanAttack = function(target) {
      if (holding(this)) return false;
      return baseCanAttack.call(this, target);
    };
    wrappedCanAttack._fdFireDiscipline177 = true;
    wrappedCanAttack._fdBase = baseCanAttack;
    Unit.prototype.canAttack = wrappedCanAttack;
  }

  // Fixed-wing target acquisition has a separate mission scanner. Suppress it
  // as well, otherwise aircraft could keep making empty attack passes.
  if (typeof Game.prototype.findAircraftTarget133 === 'function' && !Game.prototype.findAircraftTarget133._fdFireDiscipline177) {
    const baseFindAircraftTarget = Game.prototype.findAircraftTarget133;
    const wrappedFindAircraftTarget = function(unit, ...args) {
      if (holding(unit)) return null;
      return baseFindAircraftTarget.call(this, unit, ...args);
    };
    wrappedFindAircraftTarget._fdFireDiscipline177 = true;
    Game.prototype.findAircraftTarget133 = wrappedFindAircraftTarget;
  }
  if (typeof Game.prototype.isAircraftMissionTargetValid134 === 'function' && !Game.prototype.isAircraftMissionTargetValid134._fdFireDiscipline177) {
    const baseAirTargetValid = Game.prototype.isAircraftMissionTargetValid134;
    const wrappedAirTargetValid = function(unit, target, command, explicit) {
      if (holding(unit)) return false;
      return baseAirTargetValid.call(this, unit, target, command, explicit);
    };
    wrappedAirTargetValid._fdFireDiscipline177 = true;
    Game.prototype.isAircraftMissionTargetValid134 = wrappedAirTargetValid;
  }

  function clearCombatTracking(unit) {
    unit.awarenessTargetId98 = null;
    unit.movingFireTargetId91 = null;
    unit.sharedCombatTargetId132 = null;
    unit._finiteSalvo139 = null;
    if (unit.currentCommand && 'combatTargetId' in unit.currentCommand) unit.currentCommand.combatTargetId = null;
    const fsm = unit._airFsm133 || unit.airFsm133;
    if (fsm && holding(unit)) {
      fsm.targetId = null;
      if (!['release', 'egress', 'evade'].includes(fsm.state)) {
        fsm.state = unit.currentCommand ? 'transit' : 'hold';
        fsm.enteredAt = unit.game?.time || 0;
      }
    }
  }

  // This method is intentionally defined only if absent. The script is loaded
  // twice in the browser: once before multiplayer wrapping and once after the
  // later combat modules. The multiplayer wrapper must remain intact.
  if (typeof Game.prototype.issueFireDiscipline177 !== 'function') {
    Game.prototype.issueFireDiscipline177 = function(mode = null) {
      const units = this.getSelectedUnits?.().filter(armed) || [];
      if (!units.length) return false;
      const resolved = mode === HOLD || mode === FREE
        ? mode
        : (units.every(holding) ? FREE : HOLD);
      for (const unit of units) {
        unit.fireDiscipline177 = resolved;
        clearCombatTracking(unit);
      }
      this.uiDirty = true;
      if (this.uiCache) this.uiCache.commandKey = '';
      this.cancelModes?.();
      if (typeof document !== 'undefined' && document?.body) {
        this.alert?.(resolved === HOLD ? `Огонь запрещён · ${units.length} ед.` : `Огонь разрешён · ${units.length} ед.`, 'info');
      }
      return true;
    };
  }

  // Persist the toggle through local saves, authoritative Worker snapshots and
  // multiplayer state restoration. Re-wrap if a later module replaced serialize.
  if (typeof Unit.prototype.serialize === 'function' && !Unit.prototype.serialize._fdFireDiscipline177) {
    const baseSerialize = Unit.prototype.serialize;
    const wrappedSerialize = function() {
      const data = baseSerialize.call(this);
      data.fireDiscipline177 = holding(this) ? HOLD : FREE;
      return data;
    };
    wrappedSerialize._fdFireDiscipline177 = true;
    Unit.prototype.serialize = wrappedSerialize;
  }
  if (typeof Game.prototype.hydrate === 'function' && !Game.prototype.hydrate._fdFireDiscipline177) {
    const baseHydrate = Game.prototype.hydrate;
    const wrappedHydrate = function(data) {
      const result = baseHydrate.call(this, data);
      const saved = new Map((data?.entities || []).filter(item => item?.kind === 'unit').map(item => [item.id, item]));
      for (const unit of this.units || []) {
        const state = saved.get(unit.id)?.fireDiscipline177;
        unit.fireDiscipline177 = state === HOLD ? HOLD : FREE;
        if (holding(unit)) clearCombatTracking(unit);
      }
      return result;
    };
    wrappedHydrate._fdFireDiscipline177 = true;
    Game.prototype.hydrate = wrappedHydrate;
  }

  // Add the command to the standard unit command panel after whatever version
  // of renderUnitCommandButtons is currently active.
  if (typeof Game.prototype.renderUnitCommandButtons === 'function' && !Game.prototype.renderUnitCommandButtons._fdFireDiscipline177) {
    const baseRenderCommands = Game.prototype.renderUnitCommandButtons;
    const wrappedRenderCommands = function(units) {
      const result = baseRenderCommands.call(this, units);
      const combat = (units || []).filter(armed);
      if (!combat.length || typeof document === 'undefined') return result;
      const root = document.getElementById('command-buttons');
      if (!root || root.querySelector?.('[data-fire-discipline177]')) return result;
      const allHold = combat.every(holding);
      const someHold = combat.some(holding);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'action-button command-button';
      button.dataset.fireDiscipline177 = '1';
      button.dataset.active = allHold ? 'true' : 'false';
      button.textContent = allHold ? 'J · Огонь разрешить' : 'J · Не стрелять';
      button.title = allHold
        ? 'Снять запрет огня у выбранных боевых юнитов (J)'
        : someHold
          ? 'У части группы огонь уже запрещён. Нажмите, чтобы запретить огонь всей выбранной группе (J)'
          : 'Запретить выбранным боевым юнитам автоматически и вручную открывать огонь (J)';
      if (allHold) {
        button.style.outline = '1px solid rgba(255,190,92,.9)';
        button.style.boxShadow = 'inset 0 0 0 1px rgba(255,190,92,.22)';
      }
      button.addEventListener('click', () => this.issueFireDiscipline177(allHold ? FREE : HOLD));
      root.appendChild(button);
      return result;
    };
    wrappedRenderCommands._fdFireDiscipline177 = true;
    Game.prototype.renderUnitCommandButtons = wrappedRenderCommands;
  }

  if (typeof document !== 'undefined' && document?.body && !window.__FD_FIRE_DISCIPLINE_KEY177__) {
    window.__FD_FIRE_DISCIPLINE_KEY177__ = true;
    window.addEventListener('keydown', event => {
      if (event.code !== 'KeyJ' || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
      const tag = event.target?.tagName?.toLowerCase?.();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || event.target?.isContentEditable) return;
      const game = D.game;
      if (!game?.getSelectedUnits?.().some(armed)) return;
      event.preventDefault();
      game.issueFireDiscipline177?.();
    });
  }

  window.__FD_FIRE_DISCIPLINE_177__ = {
    version: '16.4.2', build: 177, hold: HOLD, free: FREE,
    active(unit) { return holding(unit); }
  };
})();
