(() => {
  'use strict';

  const root = globalThis;
  const debug = root.__FD_DEBUG__;
  const GameClass = debug?.Game;
  if (!GameClass || GameClass.prototype.__fdMinefieldDefense181) return;

  Object.defineProperty(GameClass.prototype, '__fdMinefieldDefense181', {
    value: true,
    configurable: true,
  });

  const VERSION = '16.6.1';
  const BUILD = 181;
  const CARD_SELECTOR = '[data-minefield-defense181]';
  const OLD_COMMAND_SELECTOR = '[data-command-minefield141]';
  const baseRenderUnitCommands181 = GameClass.prototype.renderUnitCommandButtons;
  const baseRenderActionUI181 = GameClass.prototype.renderActionUI;

  const isEngineer181 = unit => Boolean(
    unit?.alive !== false && unit?.kind === 'unit' && unit?.team === 'player' &&
    (unit.typeId === 'worker' || unit.stats?.engineering || unit.stats?.visualRole === 'engineer')
  );

  const selectedEngineers181 = game => {
    const source = typeof game?.getSelectedUnits === 'function' ? game.getSelectedUnits() : game?.selected || [];
    return (source || []).filter(isEngineer181);
  };

  function removeOldCommand181() {
    const commandButtons = document.getElementById('command-buttons');
    if (!commandButtons?.querySelectorAll) return;
    for (const node of commandButtons.querySelectorAll(OLD_COMMAND_SELECTOR)) node.remove?.();
  }

  function removeCatalogCard181() {
    const actionButtons = document.getElementById('action-buttons');
    if (!actionButtons?.querySelectorAll) return;
    for (const node of actionButtons.querySelectorAll(CARD_SELECTOR)) node.remove?.();
  }

  function ensureCatalogCard181(game) {
    const actionButtons = document.getElementById('action-buttons');
    const actionTitle = document.getElementById('action-title');
    if (!actionButtons || !actionTitle) return false;

    const engineers = selectedEngineers181(game);
    const inDefenseCatalog = engineers.length > 0 && game.buildCategory === 'defense' &&
      /^Строительство\s*·\s*Оборона/i.test(String(actionTitle.textContent || ''));

    if (!inDefenseCatalog) {
      removeCatalogCard181();
      return false;
    }

    const now = Number(game.time) || 0;
    const readyEngineers = engineers.filter(unit => (Number(unit.engineerMineReadyAt141) || 0) <= now);
    const remaining = readyEngineers.length
      ? 0
      : Math.max(0, Math.ceil(Math.min(...engineers.map(unit => (Number(unit.engineerMineReadyAt141) || 0) - now))));

    let button = actionButtons.querySelector?.(CARD_SELECTOR);
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.className = 'action-button minefield-defense181';
      button.dataset.minefieldDefense181 = 'true';
      button.dataset.actionKind = 'minefield';
      button.dataset.typeId = 'minefield141';
      button.addEventListener('click', () => {
        if (button.disabled) return;
        game.sound?.click?.();
        game.setMinefieldCommandMode141?.();
      });
      actionButtons.appendChild(button);
    }

    button.disabled = readyEngineers.length === 0 || typeof game.setMinefieldCommandMode141 !== 'function';
    button.innerHTML = [
      '<span class="hotkey">M</span>',
      '<strong>✹ Минное поле</strong>',
      '<span>18 скрытых мин · установка 3,2 с</span>',
      `<span class="price">${readyEngineers.length ? `Готово инженеров: ${readyEngineers.length}` : `Комплект будет готов через ${remaining} с`}</span>`,
    ].join('');
    button.title = readyEngineers.length
      ? 'Оборона: указать место установки скрытого минного поля'
      : `Инженерный комплект перезаряжается ещё ${remaining} с`;

    const defenseTab = document.querySelector?.('[data-category-id="defense"]');
    if (defenseTab) defenseTab.title = 'Оборона: сооружения и отдельная установка минного поля';
    return true;
  }

  if (typeof baseRenderUnitCommands181 === 'function') {
    GameClass.prototype.renderUnitCommandButtons = function(...args) {
      const result = baseRenderUnitCommands181.apply(this, args);
      removeOldCommand181();
      return result;
    };
  }

  if (typeof baseRenderActionUI181 === 'function') {
    GameClass.prototype.renderActionUI = function(...args) {
      const result = baseRenderActionUI181.apply(this, args);
      removeOldCommand181();
      ensureCatalogCard181(this);
      return result;
    };
  }

  root.__FD_MINEFIELD_DEFENSE_181__ = {
    version: VERSION,
    build: BUILD,
    refresh() {
      const game = debug.game;
      if (game) ensureCatalogCard181(game);
    },
  };

  removeOldCommand181();
  const refreshTimer181 = setInterval(() => {
    const game = debug.game;
    if (!game) return;
    removeOldCommand181();
    ensureCatalogCard181(game);
  }, 500);
  refreshTimer181?.unref?.();

  void 0;
  const eyebrow = document.querySelector?.('#start-screen .eyebrow');
  if (eyebrow) void 0;
})();
