(() => {
  'use strict';

  const root = globalThis;
  const D = root.__FD_DEBUG__;
  const Game = D?.Game;
  if (!Game?.prototype || root.__FD_COMMAND_POWER_AUTHORITY_202__) return;

  const VERSION = '16.8.18';
  const BUILD = 202;
  const EPSILON = 0.001;
  const state = {
    checks: 0,
    activations: 0,
    executions: 0,
    blocks: 0,
    reconciliations: 0,
    commandIntents: 0,
    receivedIntents: 0,
    intentAllows: 0,
    lastIntent: null,
    lastStatus: null,
  };

  const finite = (value, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const round = value => Math.round(finite(value) * 10) / 10;
  const plain = value => value == null ? null : JSON.parse(JSON.stringify(value));

  const cachedTotals = (game, teamKey) => {
    const team = game?.teams?.[teamKey];
    if (!team) return { produced: 0, used: 0, count: 0, source: 'missing-team' };
    return {
      produced: Math.max(0, finite(team.powerProduced)),
      used: Math.max(0, finite(team.powerUsed)),
      count: 1,
      source: 'team-snapshot',
    };
  };

  const liveTotals = (game, teamKey) => {
    let produced = 0;
    let used = 0;
    let count = 0;
    for (const building of game?.buildings || []) {
      if (!building?.alive || !building.completed || building.team !== teamKey) continue;
      if (finite(building.sabotagedUntil) > finite(game.time)) continue;
      produced += Math.max(0, finite(building.stats?.power));
      used += Math.max(0, finite(building.stats?.powerUse));
      count += 1;
    }
    return { produced, used, count, source: 'live-buildings' };
  };

  const normalizedIntent = (game, teamKey) => {
    const raw = game?._fdCommandPowerIntent202;
    if (!raw || raw.team !== teamKey) return null;
    const produced = Math.max(0, finite(raw.produced));
    const used = Math.max(0, finite(raw.used));
    const online = raw.online === true && produced > 0 && produced + EPSILON >= used;
    state.receivedIntents += 1;
    return {
      team: teamKey,
      produced,
      used,
      online,
      reserve: Math.max(0, produced - used),
      build: finite(raw.build, BUILD),
      atTime: finite(raw.atTime),
      source: 'command-intent',
    };
  };

  Game.prototype.commandPowerStatus202 = function(teamKey = 'player', options = {}) {
    state.checks += 1;
    const cached = cachedTotals(this, teamKey);
    const live = liveTotals(this, teamKey);
    const bridge = root.__FD_STABLE_STATE165__?.bridge;
    const authoritativeMirror = typeof document !== 'undefined' && bridge?.game === this && bridge.ready && !bridge.failed;
    let selected = authoritativeMirror || !live.count ? cached : live;
    const selectedOnline = selected.produced > 0 && selected.produced + EPSILON >= selected.used;
    const intent = options.allowIntent === false ? null : normalizedIntent(this, teamKey);

    if (!selectedOnline && intent?.online) {
      selected = intent;
      state.intentAllows += 1;
    } else if (intent) {
      state.lastIntent = { ...intent };
    }

    const online = selected.produced > 0 && selected.produced + EPSILON >= selected.used;
    const status = {
      team: teamKey,
      produced: selected.produced,
      used: selected.used,
      reserve: Math.max(0, selected.produced - selected.used),
      deficit: Math.max(0, selected.used - selected.produced),
      online,
      source: selected.source,
      cached: { produced: cached.produced, used: cached.used },
      live: { produced: live.produced, used: live.used, count: live.count },
      intent: intent ? { ...intent } : null,
    };

    if (intent) state.lastIntent = { ...intent };
    state.lastStatus = plain(status);

    const shouldReconcile = options.reconcile !== false && selected.source === 'live-buildings' && this.teams?.[teamKey];
    if (shouldReconcile && (
      Math.abs(cached.produced - live.produced) > EPSILON ||
      Math.abs(cached.used - live.used) > EPSILON
    )) {
      const team = this.teams[teamKey];
      team.powerProduced = live.produced;
      team.powerUsed = live.used;
      team.powerFactor = live.used <= live.produced || live.used === 0
        ? 1
        : Math.max(0.22, Math.min(1, live.produced / live.used));
      state.reconciliations += 1;
    }
    return status;
  };

  Game.prototype.commandPowerIntent202 = function(teamKey = 'player') {
    const status = this.commandPowerStatus202(teamKey, { allowIntent: false });
    const intent = {
      team: teamKey,
      produced: status.produced,
      used: status.used,
      online: status.online,
      reserve: status.reserve,
      atTime: finite(this.time),
      build: BUILD,
    };
    state.commandIntents += 1;
    state.lastIntent = { ...intent, source: 'bridge' };
    return intent;
  };

  const baseIsPowerGridOnline = Game.prototype.isPowerGridOnline126;
  Game.prototype.isPowerGridOnline126 = function canonicalCommandPower202(teamKey) {
    const validated = this._fdCommandPowerValidation202;
    if (validated?.team === teamKey) return validated.online === true;
    if (typeof baseIsPowerGridOnline === 'function') return Boolean(baseIsPowerGridOnline.call(this, teamKey));
    const cached = cachedTotals(this, teamKey);
    return cached.produced > 0 && cached.produced + EPSILON >= cached.used;
  };
  Object.defineProperty(Game.prototype.isPowerGridOnline126, '__fdCommandPowerAuthority202', { value: true });

  const withValidation = (game, status, operation) => {
    const previous = game._fdCommandPowerValidation202;
    game._fdCommandPowerValidation202 = status;
    try { return operation(); }
    finally {
      if (previous === undefined) delete game._fdCommandPowerValidation202;
      else game._fdCommandPowerValidation202 = previous;
    }
  };

  const alertOffline = (game, status) => {
    state.blocks += 1;
    game.commandMode = null;
    game.uiDirty = true;
    game.alert?.(
      `Недостаток энергии: потребление ${round(status.used)}, генерация ${round(status.produced)}.`,
      'warning',
    );
  };

  const baseActivatePower = Game.prototype.activatePower;
  if (typeof baseActivatePower === 'function') {
    Game.prototype.activatePower = function activateWithCanonicalPower202(type, ...args) {
      const config = D.POWER_TYPES?.[type];
      let status = null;
      if (config && !config.strategic) {
        state.activations += 1;
        status = this.commandPowerStatus202('player', { allowIntent: false });
        if (!status.online) {
          alertOffline(this, status);
          return false;
        }
      }
      return status
        ? withValidation(this, status, () => baseActivatePower.call(this, type, ...args))
        : baseActivatePower.call(this, type, ...args);
    };
    Object.defineProperty(Game.prototype.activatePower, '__fdCommandPowerAuthority202', { value: true });
  }

  const baseExecutePower = Game.prototype.executePower;
  if (typeof baseExecutePower === 'function') {
    Game.prototype.executePower = function executeWithCanonicalPower202(type, ...args) {
      const config = D.POWER_TYPES?.[type];
      let status = null;
      if (config && !config.strategic) {
        state.executions += 1;
        status = this.commandPowerStatus202('player', { allowIntent: true });
        if (!status.online) {
          alertOffline(this, status);
          return false;
        }
      }
      return status
        ? withValidation(this, status, () => baseExecutePower.call(this, type, ...args))
        : baseExecutePower.call(this, type, ...args);
    };
    Object.defineProperty(Game.prototype.executePower, '__fdCommandPowerAuthority202', { value: true });
  }

  const baseRenderPowersUI = Game.prototype.renderPowersUI;
  if (typeof baseRenderPowersUI === 'function' && typeof document !== 'undefined') {
    Game.prototype.renderPowersUI = function renderCanonicalPower202(...args) {
      const result = baseRenderPowersUI.apply(this, args);
      const status = this.commandPowerStatus202('player', { allowIntent: false, reconcile: false });
      const summary = `Энергосеть: потребление ${round(status.used)}, генерация ${round(status.produced)}, резерв ${round(status.reserve)}`;
      const powerValue = document.getElementById('power-value');
      const powerWrap = powerValue?.parentElement;
      powerWrap?.setAttribute('title', summary);
      powerWrap?.setAttribute('aria-label', summary);
      for (const button of document.querySelectorAll('#powers-panel [data-power-type]')) {
        const type = button.dataset.powerType;
        const config = D.POWER_TYPES?.[type];
        if (!config || config.strategic) continue;
        button.dataset.powerOnline202 = status.online ? 'true' : 'false';
        button.title = `${button.title || config.name}\n${summary}`;
        if (!status.online) {
          button.disabled = true;
          button.setAttribute('aria-label', `${config.name}. Нет питания: ${round(status.used)} / ${round(status.produced)}`);
        }
      }
      return result;
    };
    Object.defineProperty(Game.prototype.renderPowersUI, '__fdCommandPowerAuthority202', { value: true });
  }

  root.__FD_COMMAND_POWER_AUTHORITY_202__ = {
    version: VERSION,
    build: BUILD,
    state,
    diagnostics: () => plain(state),
  };
})();
