(() => {
  'use strict';

  const D = window.__FD_DEBUG__;
  if (!D?.Game || !window.__FD_V9__) return;

  const { Game, Unit, TacticalAI, WORLD } = D;
  const canvas = document.getElementById('game-canvas');
  const ctx = canvas?.getContext('2d', { alpha: false });
  const minimap = document.getElementById('minimap');
  const mctx = minimap?.getContext('2d');
  const SIM_DT = 1 / 25;
  const MASS_BUCKETS = 128;
  const CRITICAL_EFFECT_TYPES94 = new Set(['marker', 'text', 'interceptBeam', 'jamBeam', 'reveal']);
  const STRATEGIC_BANDS94 = [
    ['p', 'player', false], ['p', 'player', true],
    ['e', 'enemy', false], ['e', 'enemy', true],
    ['n', 'neutral', false], ['n', 'neutral', true],
  ];
  const MINI_CELL = 256;
  const clamp94 = (value, min, max) => Math.max(min, Math.min(max, value));
  const lerp94 = (a, b, t) => a + (b - a) * t;
  const angleLerp94 = (a, b, t) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;
  const now94 = () => performance.now();
  const numberFormat94 = new Intl.NumberFormat('ru-RU');
  const lightUi94 = {
    credits: document.getElementById('credits-value'),
    power: document.getElementById('power-value'),
    rank: document.getElementById('rank-value'),
    interception: document.getElementById('interception-cost-value'),
    clock: document.getElementById('clock-value'),
    objective: document.getElementById('objective-text'),
  };
  // Input hardware does not change during a match. Keeping one value also
  // avoids constructing a MediaQueryList in every simulation/render pass.
  const TOUCH94 = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
  const isTouch94 = () => TOUCH94;
  const LIMITS94 = Object.freeze({
    extremeFarTouch: Object.freeze({ detail: 64, hot: 18, clusters: 280, effects: 180 }),
    extremeFarDesktop: Object.freeze({ detail: 88, hot: 26, clusters: 420, effects: 280 }),
    extremeCloseTouch: Object.freeze({ detail: 110, hot: 32, clusters: 280, effects: 180 }),
    extremeCloseDesktop: Object.freeze({ detail: 160, hot: 48, clusters: 420, effects: 280 }),
    largeTouch: Object.freeze({ detail: 170, hot: 56, clusters: 380, effects: 230 }),
    largeDesktop: Object.freeze({ detail: 260, hot: 84, clusters: 580, effects: 360 }),
    mediumTouch: Object.freeze({ detail: 280, hot: 110, clusters: 560, effects: 300 }),
    mediumDesktop: Object.freeze({ detail: 440, hot: 170, clusters: 860, effects: 460 }),
    normalTouch: Object.freeze({ detail: 780, hot: 1050, clusters: 1500, effects: 600 }),
    normalDesktop: Object.freeze({ detail: 1350, hot: 1750, clusters: 2500, effects: 980 }),
  });
  const hash94 = (value) => {
    let h = 2166136261;
    const text = String(value || '0');
    for (let i = 0; i < text.length; i += 1) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  };
  const miniKey94 = (x, y) => {
    const cx = clamp94(Math.floor(x / MINI_CELL), 0, Math.ceil(WORLD.width / MINI_CELL) - 1);
    const cy = clamp94(Math.floor(y / MINI_CELL), 0, Math.ceil(WORLD.height / MINI_CELL) - 1);
    return cy * 256 + cx;
  };
  const teamSlot94 = (team) => team === 'player' ? 'p' : team === 'enemy' ? 'e' : 'n';
  const bandIndex94 = (unit) => (unit.team === 'player' ? 0 : unit.team === 'enemy' ? 2 : 4) + (unit.air ? 1 : 0);
  const makeMiniCell94 = () => ({
    p: 0,
    e: 0,
    n: 0,
    bands: Array.from({ length: 6 }, () => ({ count: 0, x: 0, y: 0, dirX: 0, dirY: 0, typeId: null })),
  });

  function limits94(game) {
    const count = game._v94AliveUnits || game.units.length;
    const touch = TOUCH94;
    // Twenty thousand fully autonomous JavaScript objects are affordable in
    // memory, but not if every visible object executes steering, targeting and
    // animation work 25 times per second.  The classic-RTS budget therefore
    // becomes formation-first well before 10k-v-10k: a bounded foreground is
    // exact, the remaining army advances through the 128 macro buckets below.
    if (count >= 16000) {
      const close = (game.camera?.zoom || 1) >= .66;
      return close
        ? (touch ? LIMITS94.extremeCloseTouch : LIMITS94.extremeCloseDesktop)
        : (touch ? LIMITS94.extremeFarTouch : LIMITS94.extremeFarDesktop);
    }
    if (count >= 8000) return touch ? LIMITS94.largeTouch : LIMITS94.largeDesktop;
    if (count >= 3000) return touch ? LIMITS94.mediumTouch : LIMITS94.mediumDesktop;
    return touch ? LIMITS94.normalTouch : LIMITS94.normalDesktop;
  }

  function miniAdjust94(game, unit, delta, key = unit._v94MiniKey ?? miniKey94(unit.x, unit.y), x = unit.x, y = unit.y, rotation = unit.rotation || 0) {
    const map = game._v94MiniCells;
    if (!map) return;
    let cell = map.get(key);
    if (!cell && delta > 0) {
      cell = makeMiniCell94();
      map.set(key, cell);
    }
    if (!cell) return;
    const slot = teamSlot94(unit.team);
    const band = cell.bands[bandIndex94(unit)];
    cell[slot] = Math.max(0, cell[slot] + delta);
    band.count = Math.max(0, band.count + delta);
    band.x += x * delta;
    band.y += y * delta;
    band.dirX += Math.cos(rotation) * delta;
    band.dirY += Math.sin(rotation) * delta;
    if (delta > 0 && !band.typeId) band.typeId = unit.typeId;
    if (!band.count) {
      band.x = 0;
      band.y = 0;
      band.dirX = 0;
      band.dirY = 0;
      band.typeId = null;
    }
    if (!cell.p && !cell.e && !cell.n) map.delete(key);
    game._v94FogDirty?.add(key);
  }

  function syncMini94(game, unit) {
    const next = miniKey94(unit.x, unit.y);
    const old = unit._v94MiniKey;
    const oldX = unit._v94MiniX ?? unit.x;
    const oldY = unit._v94MiniY ?? unit.y;
    const oldRotation = unit._v94MiniRotation ?? unit.rotation ?? 0;
    if (old === next) {
      const cell = game._v94MiniCells.get(next);
      if (cell) {
        const band = cell.bands[bandIndex94(unit)];
        band.x += unit.x - oldX;
        band.y += unit.y - oldY;
        band.dirX += Math.cos(unit.rotation || 0) - Math.cos(oldRotation);
        band.dirY += Math.sin(unit.rotation || 0) - Math.sin(oldRotation);
      }
      unit._v94MiniX = unit.x;
      unit._v94MiniY = unit.y;
      unit._v94MiniRotation = unit.rotation || 0;
      return;
    }
    if (old != null) miniAdjust94(game, unit, -1, old, oldX, oldY, oldRotation);
    unit._v94MiniKey = next;
    miniAdjust94(game, unit, 1, next);
    unit._v94MiniX = unit.x;
    unit._v94MiniY = unit.y;
    unit._v94MiniRotation = unit.rotation || 0;
    game._v94MiniDirty = true;
  }

  function registerUnit94(game, unit) {
    if (!unit || unit._v94Registered) return;
    unit._v94Registered = true;
    unit._v94Order = game._v94NextOrder++;
    unit._v94Bucket = hash94(unit.id) % MASS_BUCKETS;
    game._v94Buckets[unit._v94Bucket].push(unit);
    game._v94AliveUnits += unit.alive ? 1 : 0;
    unit._v94MiniKey = miniKey94(unit.x, unit.y);
    unit._v94MiniX = unit.x;
    unit._v94MiniY = unit.y;
    unit._v94MiniRotation = unit.rotation || 0;
    if (unit.alive) miniAdjust94(game, unit, 1, unit._v94MiniKey, unit._v94MiniX, unit._v94MiniY, unit._v94MiniRotation);
    if (unit.stats?.radarRelay || unit.detector > 0 || unit.stats?.counterIntel > 0) game._v94Sensors.add(unit);
    if (unit.stats?.interceptPower || unit.stats?.softKillPower) game._v94Interceptors.add(unit);
    if (unit.stats?.radarRelay || unit.detector > 0 || unit.stats?.counterIntel > 0 ||
        unit.stats?.interceptPower || unit.stats?.softKillPower ||
        unit.stats?.weapon?.targets?.includes('air') || unit.typeId === 'awacs') game._v94NetworkSensors.add(unit);
    if (unit.stats?.covertOps) game._v94Covert.add(unit);
    if (unit.stats?.strategicLauncher?.length) game._v94StrategicLaunchers.add(unit);
  }

  function installBudgetedScheduler94(game) {
    const scheduler = game.scheduler;
    if (!scheduler?.tasks || scheduler._v94Budgeted) return;
    scheduler._v94Budgeted = true;
    scheduler._v94BaseTick = scheduler.tick.bind(scheduler);
    scheduler._v94Cursor = 0;
    scheduler._v94TaskList = [];
    scheduler.tick = (dt) => {
      const alive = game._v94AliveUnits || 0;
      if (alive < 5000) return scheduler._v94BaseTick(dt);

      // A classic RTS does not execute every strategic subsystem on the same
      // simulation tick. Accumulate their real elapsed time, then advance a
      // small rotating slice. At 20k the configured demand is below 25 tasks
      // per second, so one task per 25 Hz tick keeps every cadence current and
      // prevents AI + fog + UI + cleanup from forming one long main-thread job.
      if (scheduler._v94TaskList.length !== scheduler.tasks.size) {
        scheduler._v94TaskList = [...scheduler.tasks.values()];
        scheduler._v94Cursor %= Math.max(1, scheduler._v94TaskList.length);
      }
      const tasks = scheduler._v94TaskList;
      for (const task of tasks) task.acc += dt;
      const budget = alive >= 16000 ? 1 : 2;
      let ran = 0;
      let checked = 0;
      while (checked < tasks.length && ran < budget) {
        const index = scheduler._v94Cursor++ % tasks.length;
        const task = tasks[index];
        checked += 1;
        if (task.acc + 1e-9 < task.interval) continue;
        const elapsed = task.acc;
        task.acc %= task.interval;
        task.fn(elapsed);
        ran += 1;
      }
      return undefined;
    };
  }

  function retuneScheduler94(game) {
    if (!game.scheduler?.tasks) return;
    const count = game._v94AliveUnits || 0;
    const high = count >= 5000;
    const extreme = count >= 16000;
    const intervals = {
      // Keep the same accumulated strategic time, but wake the AI often
      // enough that its intel/defense/micro timers cannot all expire inside
      // one large 1.25 s catch-up job.
      ai: extreme ? 0.40 : high ? 0.60 : 0.25,
      counterIntel: extreme ? 1.6 : high ? 0.85 : 0.30,
      spyCells: extreme ? 1.2 : high ? 0.62 : 0.35,
      enemyStrategic: extreme ? 1.0 : high ? 0.56 : 0.30,
      fog: extreme ? 0.32 : high ? 0.24 : 0.20,
      sensors: extreme ? 1.6 : high ? 0.9 : 0.55,
      ui: extreme ? 0.92 : high ? 0.34 : 0.18,
      // Dead-projectile compaction is linear in the live salvo size. Spread it
      // out in legion battles; dead entries are skipped by simulation in the
      // meantime, so this trades no gameplay accuracy for fewer periodic
      // main-thread spikes.
      cleanup: extreme ? 0.75 : high ? 0.50 : 0.25
    };
    for (const [name, interval] of Object.entries(intervals)) {
      const task = game.scheduler.tasks.get(name);
      if (task) task.interval = interval;
    }
    for (const [name, task] of game.scheduler.tasks) {
      if (task._v94Timed) continue;
      task._v94Timed = true;
      const run = task.fn;
      task.fn = (elapsed) => {
        const timing = game.perf?.wantsTiming?.();
        const started = timing ? now94() : 0;
        try {
          return run(elapsed);
        } finally {
          if (timing) game.perf.add(`schedulerTask:${name}`, now94() - started);
        }
      };
    }
    const autosave = game.scheduler.tasks.get('autosave');
    if (autosave && !autosave._v94Wrapped) {
      autosave._v94Wrapped = true;
      const save = autosave.fn;
      autosave.fn = () => {
        // Serialising tens of thousands of rich Unit instances is an
        // unavoidable main-thread pause.  Manual saves remain available, but
        // automatic saves are deferred during a mass battle.
        if ((game._v94AliveUnits || 0) <= 4500) save();
        else game._v94AutosaveSkipped = true;
      };
    }
  }

  function ensureMass94(game) {
    if (game._v94Installed) return game;
    window.__FD_V9__.ensure();
    if (!game.spatial || !game.units) return game;

    game._v94Installed = true;
    game._v94Buckets = Array.from({ length: MASS_BUCKETS }, () => []);
    game._v94NextOrder = 1;
    game._v94AliveUnits = 0;
    game._v94HotUnits = [];
    game._v94HotSet = new Set();
    game._v94Sensors = new Set();
    game._v94Interceptors = new Set();
    game._v94NetworkSensors = new Set();
    game._v94Covert = new Set();
    game._v94StrategicLaunchers = new Set();
    game._v94MiniCells = new Map();
    game._v94FogDirty = new Set();
    game._v94MiniDirty = true;
    game._v94BucketCursor = 0;
    game._v94CleanupAt = 0;
    game._v94StructureCleanupAt = 0;
    game._v94BucketCleanupCursor = 0;
    game._v94UnitCompaction = null;
    game._v94SchedulerTuneAt = 0;
    game._v94FullUiAt = game.time + 20;
    game._v94RenderAt = -Infinity;
    game._v94MiniRenderAt = -Infinity;
    game._v94FogHotIds = new Set();
    game._v94VisibleUnits = [];
    game._v94ImportantUnits = new Set();
    game._v94ClusterMap = new Map();
    game._v94ClusterPool = [];
    game._v94StrategicClusterPool = [];
    game._v94StrategicDetailCursor = 0;
    game._v94GoalScratch = { x: 0, y: 0 };
    game._v94ProjectileStats = { total: 0, updated: 0, phases: 1 };
    game._v9LodCounts ||= [0, 0, 0, 0];
    game._v94LastCounts = { detailed: 0, clusters: 0, bucket: 0 };
    game._v94PerfMax = Object.create(null);
    if (game.perf && !game.perf._v94MaxWrapped) {
      game.perf._v94MaxWrapped = true;
      const baseAdd94 = game.perf.add.bind(game.perf);
      game.perf.add = (name, milliseconds, count = 1) => {
        if (game.perf.benchmarking && Number.isFinite(milliseconds)) {
          game._v94PerfMax[name] = Math.max(game._v94PerfMax[name] || 0, milliseconds);
        }
        return baseAdd94(name, milliseconds, count);
      };
    }
    for (const unit of game.units) registerUnit94(game, unit);
    // v16.4 hook: hierarchical companies move many distant members as one
    // logical formation while keeping the classic mini/spatial indexes exact.
    game._v94SyncMini164 = (unit) => syncMini94(game, unit);
    retuneScheduler94(game);
    installBudgetedScheduler94(game);
    return game;
  }

  const baseAddEntity94 = Game.prototype.addEntity;
  Game.prototype.addEntity = function(entity) {
    const result = baseAddEntity94.call(this, entity);
    if (this._v94Installed && entity?.kind === 'unit') registerUnit94(this, entity);
    return result;
  };

  function removeMassUnit94(game, unit) {
    if (!unit || unit._v94Removed) return;
    unit._v94Removed = true;
    game._v94AliveUnits = Math.max(0, game._v94AliveUnits - 1);
    miniAdjust94(game, unit, -1, unit._v94MiniKey, unit._v94MiniX ?? unit.x, unit._v94MiniY ?? unit.y, unit._v94MiniRotation ?? unit.rotation ?? 0);
    game._v94Sensors?.delete(unit);
    game._v94Interceptors?.delete(unit);
    game._v94NetworkSensors?.delete(unit);
    game._v94Covert?.delete(unit);
    game._v94StrategicLaunchers?.delete(unit);
    game.spatial?.remove(unit, 'units');
    game.spatial?.remove(unit, 'sensors');
    const fog = game._v9FogEmitters?.get(unit.id);
    if (fog) {
      game._v9FogStamp(fog, -1);
      game._v9FogEmitters.delete(unit.id);
    }
    game._v94MiniDirty = true;
    if (game.entityMap?.get(unit.id) === unit) game.entityMap.delete(unit.id);
  }

  const baseHandleDeath94 = Game.prototype.handleDeath;
  Game.prototype.handleDeath = function(entity, source) {
    const massRemote = entity?.kind === 'unit' && (this._v94AliveUnits || 0) >= 12000 && !this.isOnScreen(entity.x, entity.y, 480);
    if (!massRemote) baseHandleDeath94.call(this, entity, source);
    else {
      const value = entity.stats?.cost || 100;
      if (source?.team && source.team !== entity.team) {
        this.addCommandXp(source.team, Math.max(20, value * 0.12));
        if (source instanceof Unit) {
          source.kills = (source.kills || 0) + 1;
          source.gainExperience(Math.max(45, value * 0.12));
        }
      }
      if (entity.team === 'player') this.stats.unitsLost += 1;
      else if (entity.team === 'enemy') this.stats.enemiesDestroyed += 1;
    }
    if (entity?.kind === 'unit' && this._v94Installed) removeMassUnit94(this, entity);
    if (this.scorchMarks.length > 2400) this.scorchMarks.splice(0, this.scorchMarks.length - 2400);
  };

  const baseGainExperience94 = Unit.prototype.gainExperience;
  Unit.prototype.gainExperience = function(amount) {
    const game = this.game;
    if (!game?._v94Installed || (game._v94AliveUnits || 0) < 5000 || this.selected) {
      return baseGainExperience94.call(this, amount);
    }
    if (!Number.isFinite(amount) || amount <= 0) return undefined;
    this.xp += amount;
    const oldRank = this.rank;
    if (this.xp >= 1900) this.rank = 3;
    else if (this.xp >= 620) this.rank = 2;
    if (this.rank > oldRank) {
      const ratio = this.maxHp > 0 ? this.hp / this.maxHp : 1;
      this.maxHp *= 1.12;
      this.hp = this.maxHp * ratio + this.maxHp * 0.12;
    }
    // Rank mechanics remain exact. In legion battles an unselected soldier
    // does not create an individual floating label, alert row and UI refresh;
    // thousands of simultaneous promotions were a major GC/DOM spike. The
    // selected unit still uses the complete presentation above.
    return undefined;
  };

  const baseFindStrategicLaunchers94 = Game.prototype.findStrategicLaunchers;
  Game.prototype.findStrategicLaunchers = function(teamKey, type, readyOnly = false) {
    if (!this._v94Installed || (this._v94AliveUnits || 0) < 3000 || !this._v94StrategicLaunchers) {
      return baseFindStrategicLaunchers94.call(this, teamKey, type, readyOnly);
    }
    const result = [];
    for (const unit of this._v94StrategicLaunchers) {
      if (!unit.alive || unit.team !== teamKey || !unit.stats?.strategicLauncher?.includes(type)) continue;
      if (readyOnly && (unit.munitionCooldowns?.[type] || 0) > 0) continue;
      result.push(unit);
    }
    return result;
  };

  // Keep the stress harness actionable: UI work is otherwise one opaque
  // scheduler entry. These timings are dormant outside F11/benchmark mode.
  for (const methodName of ['renderPowersUI', 'renderSelectionUI', 'renderActionUI']) {
    const renderSection = Game.prototype[methodName];
    if (typeof renderSection !== 'function') continue;
    Game.prototype[methodName] = function(...args) {
      const timing = this.perf?.wantsTiming?.();
      const started = timing ? now94() : 0;
      try {
        return renderSection.apply(this, args);
      } finally {
        if (timing) this.perf.add(`ui:${methodName}`, now94() - started);
      }
    };
  }

  const baseUpdateUi94 = Game.prototype.updateUI;
  Game.prototype.updateUI = function(force = false) {
    const alive = this._v94AliveUnits || 0;
    if (!this._v94Installed || alive < 5000 || force || this.selected.length || this.time >= (this._v94FullUiAt || 0)) {
      if (this._v94Installed && alive >= 5000) this._v94FullUiAt = this.time + 20;
      return baseUpdateUi94.call(this, force);
    }
    const team = this.teams.player;
    const write = (element, value) => {
      if (!element) return;
      const text = String(value);
      if (element.textContent !== text) element.textContent = text;
    };
    write(lightUi94.credits, numberFormat94.format(Math.round(team.credits || 0)));
    write(lightUi94.power, `${Math.round(team.powerUsed || 0)} / ${Math.round(team.powerProduced || 0)}`);
    const powerColor = team.powerFactor < 1 ? '#ffd66d' : '';
    if (lightUi94.power?.parentElement.style.color !== powerColor) lightUi94.power.parentElement.style.color = powerColor;
    write(lightUi94.rank, team.rank);
    write(lightUi94.interception, numberFormat94.format(Math.round(this.stats.interceptionSpend || 0)));
    const seconds = Math.max(0, Math.floor(this.time));
    write(lightUi94.clock, `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`);
    write(lightUi94.objective, this.objective);
    this.uiDirty = false;
    return undefined;
  };

  function capturePrev94(entity) {
    entity._v9PrevX = entity.x;
    entity._v9PrevY = entity.y;
    entity._v9PrevRot = entity.rotation;
  }

  function tickPassive94(unit, elapsed) {
    unit.weaponCooldown = Math.max(-12, (unit.weaponCooldown || 0) - elapsed);
    unit.healCooldown = Math.max(0, (unit.healCooldown || 0) - elapsed);
    unit.revealTimer = Math.max(0, (unit.revealTimer || 0) - elapsed);
    unit.navRepathTimer = Math.max(0, (unit.navRepathTimer || 0) - elapsed);
    unit.covertCooldown = Math.max(0, (unit.covertCooldown || 0) - elapsed);
    unit.interceptCooldown = Math.max(0, (unit.interceptCooldown || 0) - elapsed);
    unit.countermeasureCooldown92 = Math.max(0, (unit.countermeasureCooldown92 || 0) - elapsed);
    if (unit.munitionCooldowns) {
      for (const key in unit.munitionCooldowns) unit.munitionCooldowns[key] = Math.max(0, unit.munitionCooldowns[key] - elapsed);
    }
    if (unit.stats?.regeneration && unit.game.time - unit.lastDamagedAt > 4 && unit.hp < unit.maxHp) unit.heal(unit.stats.regeneration * elapsed);
    if (unit.stats?.covertOps && unit.game.time > (unit.compromisedUntil || 0)) {
      unit.coverIntegrity = Math.min(unit.stats.coverIntegrity || 0.85, (unit.coverIntegrity || 0) + elapsed * 0.012);
      unit.undercover = unit.coverIntegrity > 0.16;
    }
  }

  function finishRemoteCommand94(unit) {
    unit.commandQueue.shift();
    unit.invalidateNavigation?.();
    if (unit.selected) unit.game.uiDirty = true;
  }

  function finishRemoteAirFormation94(game, formation, formationId) {
    if (!formation || formation._v94AtomicFinishing) return false;
    const members = (formation.unitIds || [])
      .map((id) => game.getEntity(id))
      .filter((member) => member?.alive &&
        (member.currentCommand?.formationGroupId || member.currentCommand?.formationId) === formationId);
    if (!members.length) return false;
    formation._v94AtomicFinishing = true;
    for (const member of members) {
      const memberAnchor = game.getAircraftMissionAnchor134?.(member, member.currentCommand);
      if (memberAnchor) {
        const memberFsm = member._airFsm133 ||= {};
        memberFsm.anchorX = memberAnchor.x;
        memberFsm.anchorY = memberAnchor.y;
        memberFsm.missionId134 = null;
      }
      finishRemoteCommand94(member);
      member.airOrbitCenter = null;
    }
    formation._v94ReleasedAt = game.time;
    return true;
  }

  function moveRemote94(game, unit, x, y, elapsed, speedFactor = 1) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return true;
    const margin = (unit.radius || 10) + 5;
    const tx = clamp94(x, margin, WORLD.width - margin);
    const ty = clamp94(y, margin, WORLD.height - margin);
    const dx = tx - unit.x;
    const dy = ty - unit.y;
    const distance = Math.hypot(dx, dy);
    const arrival = Math.max(9, (unit.radius || 10) * 0.62);
    if (distance <= arrival) return true;
    // v13.3 keeps the allocation-free macro scheduler, but ground cohorts no
    // longer tunnel through rocks/buildings by moving in a straight line.
    // The late navigation layer returns undefined for aircraft and a boolean
    // for footprint-aware ground movement.
    const routed = game.moveRemoteGround133?.(unit, tx, ty, elapsed, speedFactor, arrival);
    if (routed !== undefined) {
      syncMini94(game, unit);
      return routed;
    }
    const hpFactor = unit.healthRatio < 0.25 ? 0.78 : 1;
    const step = Math.min(distance, Math.max(0, unit.stats.speed || 0) * elapsed * speedFactor * hpFactor);
    if (step <= 0) return false;
    unit.rotation = Math.atan2(dy, dx);
    unit.x += dx / distance * step;
    unit.y += dy / distance * step;
    unit.visualSpeed = step / Math.max(elapsed, 0.001);
    unit.renderX = unit.x;
    unit.renderY = unit.y;
    unit.renderRotation = unit.rotation;
    unit.lastPositionX = unit.x;
    unit.lastPositionY = unit.y;
    syncMini94(game, unit);
    return distance - step <= arrival;
  }

  const isFixedWing94 = (unit) => Boolean(
    unit?.alive && unit.air && unit.stats?.mobilityClass === 'fixedWing' &&
    !/helicopter|lightGunship/i.test(`${unit.typeId || ''} ${unit.stats?.visualRole || ''}`)
  );

  function moveRemoteAirOrbit94(game, unit, elapsed, center = null) {
    const radius = Math.max(230, (unit.radius || 24) * 5.6);
    if (center && Number.isFinite(center.x) && Number.isFinite(center.y)) {
      const cx = clamp94(center.x, radius + 20, WORLD.width - radius - 20);
      const cy = clamp94(center.y, radius + 20, WORLD.height - radius - 20);
      if (!unit.airOrbitCenter || Math.hypot(unit.airOrbitCenter.x - cx, unit.airOrbitCenter.y - cy) > radius * .38) {
        unit.airOrbitCenter = { x: cx, y: cy };
        unit.airOrbitAngle = Math.atan2(unit.y - cy, unit.x - cx);
      }
    }
    if (!unit.airOrbitCenter) {
      unit.airOrbitCenter = {
        x: clamp94(unit.x - Math.sin(unit.rotation || 0) * radius, radius + 20, WORLD.width - radius - 20),
        y: clamp94(unit.y + Math.cos(unit.rotation || 0) * radius, radius + 20, WORLD.height - radius - 20),
      };
      unit.airOrbitAngle = Math.atan2(unit.y - unit.airOrbitCenter.y, unit.x - unit.airOrbitCenter.x);
    }
    if (!Number.isFinite(unit.airOrbitAngle)) {
      unit.airOrbitAngle = Math.atan2(unit.y - unit.airOrbitCenter.y, unit.x - unit.airOrbitCenter.x);
    }
    const clockwise = (hash94(unit.id) & 1) ? 1 : -1;
    const angular = clockwise * clamp94((unit.stats.speed || 300) / radius * .56, .28, 1.05);
    unit.airOrbitAngle += angular * elapsed;
    const lead = angular * clamp94(elapsed * .18, .45, .95);
    return moveRemote94(
      game,
      unit,
      unit.airOrbitCenter.x + Math.cos(unit.airOrbitAngle + lead) * radius,
      unit.airOrbitCenter.y + Math.sin(unit.airOrbitAngle + lead) * radius,
      elapsed,
      .78,
    );
  }

  function moveRemoteAttackPass94(game, unit, target, elapsed) {
    const weapon = unit.stats?.weapon || {};
    const range = Math.max(260, Number(weapon.range) || 520);
    const headingX = Math.cos(unit.rotation || 0);
    const headingY = Math.sin(unit.rotation || 0);
    const toX = target.x - unit.x;
    const toY = target.y - unit.y;
    const distance = Math.max(1, Math.hypot(toX, toY));
    const ahead = toX * headingX + toY * headingY;
    if (ahead > 0 && distance < range * .92) {
      const passLength = Math.max(340, (unit.stats.speed || 260) * 1.9, (unit.radius || 24) * 9);
      return moveRemote94(game, unit, unit.x + headingX * passLength, unit.y + headingY * passLength, elapsed, 1);
    }
    const approach = Math.atan2(toY, toX);
    const side = (hash94(`${unit.id}:${target.id}`) & 1) ? 1 : -1;
    const standOff = Math.max((Number(weapon.minRange) || 0) + 90, range * .46);
    const lateral = Math.max(95, range * .20) * side;
    return moveRemote94(
      game,
      unit,
      target.x - Math.cos(approach) * standOff - Math.sin(approach) * lateral,
      target.y - Math.sin(approach) * standOff + Math.cos(approach) * lateral,
      elapsed,
      1,
    );
  }

  function macroDamage94(game, attacker, target) {
    const weapon = attacker.stats?.weapon;
    if (!weapon || !attacker.canAttack(target)) return false;
    const distance = Math.hypot(target.x - attacker.x, target.y - attacker.y) - attacker.radius - target.radius;
    const range = weapon.range * game.getJammingFactor(attacker);
    if (distance > range || (weapon.minRange && distance < weapon.minRange)) return false;
    const finiteMagazineResolution = game.resolveFiniteMagazineAttack139?.(attacker, target, { distance, range, weapon });
    if (finiteMagazineResolution !== undefined) return finiteMagazineResolution;
    const aircraftResolution = game.resolveMacroAircraftAttack133?.(attacker, target, { distance, range, weapon });
    if (aircraftResolution !== undefined) return aircraftResolution;
    if ((attacker.weaponCooldown || 0) > 0) return true;
    const reload = Math.max(0.08, weapon.reload / (1 + (attacker.rank - 1) * 0.06));
    const shots = clamp94(1 + Math.floor(Math.max(0, -(attacker.weaponCooldown || 0)) / reload), 1, 8);
    attacker.weaponCooldown = (attacker.weaponCooldown || 0) + shots * reload;
    // A distant fixed-wing cohort still performs a moving attack pass. Its
    // hull heading belongs to the flight path, not to the weapon solution.
    if (!isFixedWing94(attacker)) attacker.rotation = Math.atan2(target.y - attacker.y, target.x - attacker.x);
    attacker.lastShotAt = game.time;
    const veteran = 1 + (attacker.rank - 1) * 0.14;
    const damage = weapon.damage * shots * veteran;
    target.takeDamage(damage, attacker, weapon);
    return true;
  }

  function acquireMacroTarget94(game, unit) {
    if (!unit.stats?.weapon) return null;
    if (isFixedWing94(unit)) {
      if (game._v94AirTargetBudget <= 0) return null;
      game._v94AirTargetBudget -= 1;
      const aircraftTarget = game.findAircraftTarget133?.(unit, true);
      if (aircraftTarget) return aircraftTarget;
      return null;
    }
    if (game._v94TargetBudget <= 0) return null;
    game._v94TargetBudget -= 1;
    // Awareness follows sight, not only gun range. The strict per-tick target
    // budget below keeps this responsive even in 100K-unit battles.
    const range = Math.max(unit.stats.weapon.range * 1.25, Math.min(unit.vision || 0, 1400), 240);
    const direct = game.findNearestEnemy(unit.x, unit.y, unit.team, range, unit.stats.weapon.targets, unit);
    return direct || game.findSharedCombatTarget132?.(unit, unit, { maxRadius: Math.min(1780, range * 1.12) }) || null;
  }

  function commandGoal94(game, unit, command) {
    const goal = game._v94GoalScratch;
    if (command.formationGroupId) {
      const group = game.formations?.get(command.formationGroupId);
      if (group) {
        if (group._v94UpdatedTick !== game.simTick) {
          const last = group._v94UpdatedAt ?? (game.time - SIM_DT);
          const elapsed = clamp94(game.time - last, SIM_DT, 0.35);
          group._v94UpdatedAt = game.time;
          game.ensureFormationGroupUpdated(group, elapsed);
        }
        const slot = game.getFormationSlotWorld?.(group, unit);
        goal.x = slot?.x ?? command.x;
        goal.y = slot?.y ?? command.y;
        return goal;
      }
    }
    if (command.type === 'patrol') {
      goal.x = command.phase ? command.ax : command.bx;
      goal.y = command.phase ? command.ay : command.by;
      return goal;
    }
    goal.x = command.x;
    goal.y = command.y;
    return goal;
  }

  const detailedRemoteCommands94 = new Set([
    'harvest', 'build', 'repair', 'capture', 'infiltrate', 'infiltrateBuilding', 'guard',
    'airService', 'airHangar', 'airHangar93', 'rotaryService', 'returnToAirfield', 'loadTransport', 'unloadTransport'
  ]);

  function macroAircraftMission94(game, unit, command, elapsed, depth = 0) {
    const formationId = command?.formationGroupId || command?.formationId;
    let formation = formationId ? game.formations?.get(formationId) : null;
    if (formation) game.ensureFormationGroupUpdated?.(formation, elapsed);
    else if (formationId) {
      delete command.formationGroupId;
      delete command.formationId;
    }
    const fsm = unit.prepareAircraftMission134?.(command) || (unit._airFsm133 ||= { targetId: null, anchorX: unit.x, anchorY: unit.y });
    if (command?.type === 'attack') {
      const direct = game.getEntity(command.targetId);
      if (!direct?.alive || direct.team === unit.team) {
        finishRemoteCommand94(unit);
        fsm.targetId = null;
        fsm.missionId134 = null;
        return depth < 3
          ? macroAircraftMission94(game, unit, unit.currentCommand || null, elapsed, depth + 1)
          : moveRemoteAirOrbit94(game, unit, elapsed, { x: fsm.anchorX || unit.x, y: fsm.anchorY || unit.y });
      }
      if (game.isAircraftMissionTargetValid134?.(unit, direct, command, true)) fsm.targetId = direct.id;
    }
    if (command?.type === 'guard') {
      const guarded = game.getEntity(command.targetId);
      if (!guarded?.alive || guarded.team !== unit.team) {
        finishRemoteCommand94(unit);
        fsm.targetId = null;
        fsm.missionId134 = null;
        return depth < 3
          ? macroAircraftMission94(game, unit, unit.currentCommand || null, elapsed, depth + 1)
          : moveRemoteAirOrbit94(game, unit, elapsed, { x: fsm.anchorX || unit.x, y: fsm.anchorY || unit.y });
      }
    }

    let target = game.getEntity(fsm.targetId);
    const explicit = Boolean(command?.type === 'attack' && command.targetId === target?.id);
    if (!target?.alive || game.isAircraftMissionTargetValid134 && !game.isAircraftMissionTargetValid134(unit, target, command, explicit)) {
      target = null;
      fsm.targetId = null;
    }
    if (!target) {
      unit._activeAirCommand134 = command || null;
      target = acquireMacroTarget94(game, unit);
      unit._activeAirCommand134 = null;
      if (target) {
        fsm.targetId = target.id;
        fsm.engagedAt134 = game.time;
        fsm.engageOriginX134 = unit.x;
        fsm.engageOriginY134 = unit.y;
      }
    }
    if (target) {
      unit.airOrbitCenter = null;
      macroDamage94(game, unit, target, elapsed);
      moveRemoteAttackPass94(game, unit, target, elapsed);
      return;
    }

    let anchor = game.getAircraftMissionAnchor134?.(unit, command)
      || (command ? commandGoal94(game, unit, command) : { x: fsm.anchorX || unit.x, y: fsm.anchorY || unit.y });
    if (command?.type === 'patrol' && Math.hypot(anchor.x - unit.x, anchor.y - unit.y) <= 155) {
      command.phase = !command.phase;
      anchor = game.getAircraftMissionAnchor134?.(unit, command) || commandGoal94(game, unit, command);
    }
    const distance = Math.hypot(anchor.x - unit.x, anchor.y - unit.y);
    if (distance > 175) {
      unit.airOrbitCenter = null;
      moveRemote94(game, unit, anchor.x, anchor.y, elapsed, .96);
    } else if (command && ['move', 'attackMove', 'formation'].includes(command.type) && (!formation || formation.completed)) {
      fsm.anchorX = anchor.x;
      fsm.anchorY = anchor.y;
      if (!formation || !finishRemoteAirFormation94(game, formation, formationId)) finishRemoteCommand94(unit);
      fsm.missionId134 = null;
      unit.airOrbitCenter = null;
      if (depth < 3) macroAircraftMission94(game, unit, unit.currentCommand || null, elapsed, depth + 1);
    } else moveRemoteAirOrbit94(game, unit, elapsed, anchor);
  }

  function macroUpdateUnit94(game, unit, elapsed) {
    if (!unit.alive || unit.embarkedIn) return;
    capturePrev94(unit);
    tickPassive94(unit, elapsed);
    const command = unit.currentCommand;
    if (!command) {
      const fixedWing = isFixedWing94(unit);
      if (fixedWing && game.getAircraftMissionAnchor134) {
        macroAircraftMission94(game, unit, null, elapsed);
        syncMini94(game, unit);
        return;
      }
      const target = acquireMacroTarget94(game, unit);
      if (target) {
        unit.commandQueue = [{
          type: 'attack', targetId: target.id, autoEngage98: true,
          anchorX98: unit.x, anchorY98: unit.y, acquiredAt98: game.time,
          returnToPost132: true,
        }];
        unit.invalidateNavigation?.();
        const firing = macroDamage94(game, unit, target, elapsed);
        if (fixedWing) moveRemoteAttackPass94(game, unit, target, elapsed);
        else if (!firing) moveRemote94(game, unit, target.x, target.y, elapsed, .92);
      } else if (fixedWing) {
        moveRemoteAirOrbit94(game, unit, elapsed);
      }
      return;
    }

    // Hangar approach/service/launch is a compact deterministic state machine.
    // It must not compete for the tiny full-simulation budget: otherwise a
    // large air wing can wait forever off screen with empty ammunition. Each
    // aircraft still enters this branch only in its staggered macro bucket.
    if (command.type === 'airHangar93') {
      unit.processCommand(command, Math.min(elapsed, 1.25));
      syncMini94(game, unit);
      return;
    }

    if (isFixedWing94(unit) && (!command || ['move', 'attackMove', 'attack', 'patrol', 'guard', 'hold', 'formation'].includes(command.type))) {
      macroAircraftMission94(game, unit, command, elapsed);
      syncMini94(game, unit);
      return;
    }

    if ((unit.air || detailedRemoteCommands94.has(command.type)) && game._v94RemoteFullBudget > 0) {
      game._v94RemoteFullBudget -= 1;
      unit.update(Math.min(elapsed, 1.25));
      syncMini94(game, unit);
      return;
    }

    if (command.type === 'attack') {
      const target = game.getEntity(command.targetId);
      const autoInvalid = command.autoEngage98 && game.isCombatEngagementValid132 &&
        !game.isCombatEngagementValid132(unit, target, command);
      if (!target?.alive || target.team === unit.team || autoInvalid) {
        if (command.autoEngage98 && unit.beginReturnToPost132) unit.beginReturnToPost132(command);
        else finishRemoteCommand94(unit);
        return;
      }
      const firing = macroDamage94(game, unit, target, elapsed);
      if (isFixedWing94(unit)) moveRemoteAttackPass94(game, unit, target, elapsed);
      else if (!firing) moveRemote94(game, unit, target.x, target.y, elapsed, 0.92);
      return;
    }

    if (command.type === 'returnPost132') {
      if (moveRemote94(game, unit, command.x, command.y, elapsed, .96)) {
        if (unit.completeReturnToPost132) unit.completeReturnToPost132(command);
        else finishRemoteCommand94(unit);
      }
      return;
    }

    if (command.type === 'patrol') {
      let target = game.getEntity(command.engagedTargetId || command.combatTargetId);
      if (!target?.alive || !unit.canAttack(target)) target = acquireMacroTarget94(game, unit);
      if (target) {
        command.engagedTargetId = target.id;
        const firing = macroDamage94(game, unit, target, elapsed);
        if (isFixedWing94(unit)) moveRemoteAttackPass94(game, unit, target, elapsed);
        else if (!firing) moveRemote94(game, unit, target.x, target.y, elapsed, 0.9);
        return;
      }
      delete command.engagedTargetId;
      const goal = commandGoal94(game, unit, command);
      if (moveRemote94(game, unit, goal.x, goal.y, elapsed)) command.phase = !command.phase;
      return;
    }

    if (command.type === 'move' || command.type === 'attackMove') {
      const passingTarget = acquireMacroTarget94(game, unit);
      if (passingTarget) macroDamage94(game, unit, passingTarget, elapsed);
      const goal = commandGoal94(game, unit, command);
      const arrived = moveRemote94(game, unit, goal.x, goal.y, elapsed);
      if (arrived) {
        const group = command.formationGroupId ? game.formations?.get(command.formationGroupId) : null;
        if (!group || group.completed) finishRemoteCommand94(unit);
      }
      return;
    }

    if (game._v94RemoteFullBudget > 0) {
      game._v94RemoteFullBudget -= 1;
      unit.update(Math.min(elapsed, 1.0));
      syncMini94(game, unit);
    }
  }

  const baseEnsureFormation94 = Game.prototype.ensureFormationGroupUpdated;
  Game.prototype.ensureFormationGroupUpdated = function(group, dt) {
    if (!group || (group.unitIds?.length || 0) < 900 || !this._v94Installed) return baseEnsureFormation94.call(this, group, dt);
    if (group._v94UpdatedTick === this.simTick) return group;
    group._v94UpdatedTick = this.simTick;
    const objective = group.type === 'patrol'
      ? (group.phase ? { x: group.ax, y: group.ay } : { x: group.bx, y: group.by })
      : { x: group.targetX, y: group.targetY };
    const dx = objective.x - group.anchorX;
    const dy = objective.y - group.anchorY;
    const distance = Math.hypot(dx, dy);
    if (distance > 1) group.angle = angleLerp94(group.angle || 0, Math.atan2(dy, dx), clamp94(dt * 2.5, 0, 1));
    const step = Math.min(distance, Math.max(1, group.speed || 40) * dt);
    if (distance > 0) {
      group.anchorX += dx / distance * step;
      group.anchorY += dy / distance * step;
    }
    group.forming = false;
    group.compression = 1;
    if (distance - step <= Math.max(24, group.maxRadius || 20)) {
      if (group.type === 'patrol') group.phase = !group.phase;
      else group.completed = true;
    }
    return group;
  };

  if (Game.prototype.relaxFormationSlots78) {
    const baseRelaxSlots94 = Game.prototype.relaxFormationSlots78;
    Game.prototype.relaxFormationSlots78 = function(group, units) {
      if (units?.length > 450) return;
      return baseRelaxSlots94.call(this, group, units);
    };
  }

  if (Game.prototype.calculateFormationCompression) {
    const baseFormationCompression94 = Game.prototype.calculateFormationCompression;
    Game.prototype.calculateFormationCompression = function(group, units) {
      if (units?.length > 700) return 1;
      return baseFormationCompression94.call(this, group, units);
    };
  }

  function collectHot94(game) {
    const limit = limits94(game).hot;
    const out = game._v94HotUnits;
    const set = game._v94HotSet;
    out.length = 0;
    set.clear();
    const add = (unit) => {
      if (!unit?.alive || unit.embarkedIn || set.has(unit) || out.length >= limit) return;
      set.add(unit);
      out.push(unit);
    };
    for (let i = 0; i < game.selected.length && out.length < limit; i += 1) if (game.selected[i].kind === 'unit') add(game.selected[i]);
    for (const unit of game.renderSnapshot?.units || []) add(unit);
    return out;
  }

  function resolveHotOverlaps94(game) {
    const hot = game._v94HotUnits;
    const hotSet = game._v94HotSet;
    for (const unit of hot) {
      if (!unit.alive || unit.air || unit.embarkedIn) continue;
      const nearby = game.spatial.queryRadius('units', unit.x, unit.y, unit.radius + 82);
      for (const other of nearby) {
        if (!other.alive || other === unit || other.air || other.embarkedIn) continue;
        const otherHot = hotSet.has(other);
        if (otherHot && other._v94Order <= unit._v94Order) continue;
        let dx = unit.x - other.x;
        let dy = unit.y - other.y;
        let distance = Math.hypot(dx, dy);
        const required = unit.radius + other.radius + 3;
        if (distance >= required) continue;
        if (distance < 0.05) {
          const angle = (hash94(`${unit.id}:${other.id}`) % 628) / 100;
          dx = Math.cos(angle);
          dy = Math.sin(angle);
          distance = 1;
        }
        const overlap = required - distance + 0.2;
        const ux = dx / distance;
        const uy = dy / distance;
        const unitShare = otherHot ? 0.5 : 1;
        game.nudgeUnit(unit, ux * overlap * unitShare, uy * overlap * unitShare);
        syncMini94(game, unit);
        game.spatial.update(unit, 'units');
        if (otherHot) {
          game.nudgeUnit(other, -ux * overlap * 0.5, -uy * overlap * 0.5);
          syncMini94(game, other);
          game.spatial.update(other, 'units');
        }
      }
    }
  }

  function fullySimulateHot94(game, unit, alive) {
    if (alive < 3000 || unit.selected || unit.air || unit.embarkedIn) return true;
    const commandType = unit.currentCommand?.type;
    if (detailedRemoteCommands94.has(commandType)) return true;
    // Keep a small rotating visual-fire cohort exact.  Everyone else in the
    // foreground advances with the same smooth 25 Hz positions but uses the
    // allocation-free macro combat path.
    if (((unit._v94Order || 0) + game.simTick) % (alive >= 16000 ? 18 : 10) === 0) return true;
    // Engineering traffic close to a structure still receives the full
    // footprint-aware navigator.  The proximity result is staggered and
    // cached, so mass formations in open ground pay no building-query cost.
    if (!unit.air && ((game.simTick + (unit._v94Order || 0)) % 12) === 0) {
      const nearby = game.spatial.queryRadius('buildings', unit.x, unit.y, 320);
      unit._v94BuildingRisk = nearby.some((building) => building?.alive);
      unit._v94BuildingRiskUntil = game.time + .56;
    }
    return Boolean(unit._v94BuildingRisk && game.time <= (unit._v94BuildingRiskUntil || 0));
  }

  Game.prototype.simulateFixed = function(dt = SIM_DT) {
    if (this.paused || this.ended) return;
    ensureMass94(this);
    if (!this._v94Installed) return;
    const perf = this.perf;
    const timing = perf.wantsTiming();
    const started = timing ? now94() : 0;
    this.time += dt;
    this.simTick += 1;
    this.spatial.resetQueryBuffers();
    this.updatePowerCooldowns(dt);
    const alive94 = this._v94AliveUnits || 0;
    this._v94TargetBudget = alive94 >= 16000 ? 10 : alive94 >= 5000 ? 36 : 130;
    this._v94AirTargetBudget = alive94 >= 16000 ? 8 : alive94 >= 5000 ? 24 : 72;
    this._v94RemoteFullBudget = alive94 >= 16000 ? 12 : alive94 >= 5000 ? 72 : 180;
    let sectionStarted94 = timing ? now94() : 0;

    const hot = collectHot94(this);
    let updated = 0;
    for (const unit of hot) {
      // A v16.4 remote company owns its members authoritatively. The Worker
      // foreground sampler may still include a cold member for presentation,
      // but that must not create a second individual simulation update.
      if (!unit.alive || unit._v94FullTick === this.simTick || this._v164CompanyOwns?.(unit)) continue;
      unit._v94FullTick = this.simTick;
      capturePrev94(unit);
      if (fullySimulateHot94(this, unit, alive94)) unit.update(dt);
      else macroUpdateUnit94(this, unit, dt);
      syncMini94(this, unit);
      this.spatial.update(unit, 'units');
      if (unit.stats?.radarRelay || unit.detector > 0 || unit.stats?.counterIntel > 0) this.spatial.update(unit, 'sensors');
      updated += 1;
    }

    // v16.4 company-level simulation advances a deterministic slice of
    // distant formations before the legacy macro bucket. Members owned by a
    // company must not also receive an individual macro update this tick.
    const companyUpdated94 = this._v164CompanyStep?.(dt, hot) || 0;
    const bucketIndex = this._v94BucketCursor++ % MASS_BUCKETS;
    const bucket = this._v94Buckets[bucketIndex];
    const remoteElapsed = dt * MASS_BUCKETS;
    let remoteUpdated = 0;
    for (const unit of bucket) {
      if (!unit.alive || unit._v94FullTick === this.simTick || this._v94HotSet.has(unit) || this._v164CompanyOwns?.(unit)) continue;
      macroUpdateUnit94(this, unit, remoteElapsed);
      this.spatial.update(unit, 'units');
      remoteUpdated += 1;
    }
    if (timing) {
      perf.add('legionUnits', now94() - sectionStarted94);
      sectionStarted94 = now94();
    }

    for (const building of this.buildings) {
      if (!building.alive) continue;
      const interval = this.buildingIntervalTicksV9(building);
      building._v9SimAccum = (building._v9SimAccum || 0) + dt;
      const phase = building._v9Phase ?? (building._v9Phase = hash94(building.id) % Math.max(1, interval));
      if (interval > 1 && ((this.simTick + phase) % interval) !== 0) continue;
      const elapsed = building._v9SimAccum;
      building._v9SimAccum = 0;
      building.update(elapsed);
    }
    if (timing) {
      perf.add('legionBuildings', now94() - sectionStarted94);
      sectionStarted94 = now94();
    }

    if ((this.simTick % 3) === 0) resolveHotOverlaps94(this);

    const projectileCount94 = this.projectiles.length;
    const projectileBasePhases94 = alive94 >= 16000 && projectileCount94 >= 400
      ? 24
      : alive94 >= 3000 && projectileCount94 >= 128
        ? 2
        : 1;
    let projectileUpdates94 = 0;
    for (const projectile of this.projectiles) {
      if (!projectile.alive) continue;
      // Large guided salvos are advanced in deterministic phases. A missile
      // still receives the full elapsed time and therefore keeps identical
      // speed, fuel/TTL and damage semantics. Hypersonic/ballistic threats stay
      // at least 12.5 Hz so interception remains precise; ordinary guided
      // missiles share twenty-four staggered cohorts at the full 20k scale.
      // Their render follower remains continuous at the independent classic
      // presentation cadence.
      const criticalProjectile94 = projectile.ballistic ||
        projectile.defenseClass === 'hypersonic' ||
        projectile.trajectory === 'aeroballistic' ||
        projectile.trajectory === 'hypersonic';
      const phases94 = criticalProjectile94 ? Math.min(2, projectileBasePhases94) : projectileBasePhases94;
      projectile._v94ProjectilePhases = phases94;
      projectile._v94SimAccum = (projectile._v94SimAccum || 0) + dt;
      if (projectile._v94ProjectilePhaseMod !== phases94) {
        projectile._v94ProjectilePhase = hash94(projectile.id) % phases94;
        projectile._v94ProjectilePhaseMod = phases94;
      }
      const phase94 = projectile._v94ProjectilePhase;
      if (phases94 > 1 && ((this.simTick + phase94) % phases94) !== 0) continue;
      projectile._v9PrevX = projectile.x;
      projectile._v9PrevY = projectile.y;
      projectile._v9PrevAltitude = projectile.altitude || 0;
      projectile._v9PrevAngle = projectile.angle || 0;
      const elapsed94 = projectile._v94SimAccum;
      projectile._v94SimAccum = 0;
      projectile.update(elapsed94);
      this.spatial.update(projectile, 'projectiles');
      projectileUpdates94 += 1;
    }
    const projectileStats94 = this._v94ProjectileStats;
    projectileStats94.total = projectileCount94;
    projectileStats94.updated = projectileUpdates94;
    projectileStats94.phases = projectileBasePhases94;
    if (timing) {
      perf.add('legionProjectiles', now94() - sectionStarted94);
      sectionStarted94 = now94();
    }
    this.updateProjectileInterception(dt);
    if (timing) {
      perf.add('legionInterception', now94() - sectionStarted94);
      sectionStarted94 = now94();
    }
    for (const zone of this.abilityZones) if (zone.alive) zone.update(dt);
    this.updateEffects(dt);
    this.scheduler.tick(dt);
    if (timing) perf.add('legionScheduler', now94() - sectionStarted94);
    this.cameraShake = Math.max(0, this.cameraShake - dt * 24);

    if (this.time >= this._v94SchedulerTuneAt) {
      this._v94SchedulerTuneAt = this.time + 2;
      retuneScheduler94(this);
    }
    let combatHot94 = 0;
    for (const unit of hot) if (this.time - Math.max(unit.lastDamagedAt || -999, unit.lastShotAt || -999) < 2) combatHot94 += 1;
    const lodCounts94 = this._v9LodCounts;
    lodCounts94[0] = combatHot94;
    lodCounts94[1] = hot.length;
    lodCounts94[2] = remoteUpdated + companyUpdated94;
    lodCounts94[3] = Math.max(0, this._v94AliveUnits - hot.length - remoteUpdated - companyUpdated94);
    this._v94LastCounts.bucket = remoteUpdated + companyUpdated94;
    perf.activeUnits = this._v94AliveUnits;
    const simMs = timing ? now94() - started : 0;
    if (timing && perf.benchmarking) this._v94MaxSimMs = Math.max(this._v94MaxSimMs || 0, simMs);
    if (timing) perf.simTickDone(simMs, updated + remoteUpdated);
    return simMs;
  };
  Game.prototype.update = function(dt) { return this.simulateFixed(dt); };

  Game.prototype.snapshotPrevV9 = function() {};
  Game.prototype.prepareInterpolationV9 = function(alpha) {
    this.renderAlpha = alpha;
    const interpolationNow94 = now94();
    const interpolationElapsed94 = clamp94((interpolationNow94 - (this._v94InterpolationAt || interpolationNow94)) / 1000, 0, .08);
    this._v94InterpolationAt = interpolationNow94;
    const units = this.renderSnapshot?.units || [];
    for (const unit of units) {
      if (!unit.alive) continue;
      unit.renderX = lerp94(Number.isFinite(unit._v9PrevX) ? unit._v9PrevX : unit.x, unit.x, alpha);
      unit.renderY = lerp94(Number.isFinite(unit._v9PrevY) ? unit._v9PrevY : unit.y, unit.y, alpha);
      unit.renderRotation = angleLerp94(Number.isFinite(unit._v9PrevRot) ? unit._v9PrevRot : unit.rotation, unit.rotation, alpha);
    }
    for (const projectile of this.renderSnapshot?.projectiles || []) {
      if (!projectile.alive) continue;
      projectile._v94BackupX = projectile.x;
      projectile._v94BackupY = projectile.y;
      projectile._v94BackupAltitude = projectile.altitude;
      projectile._v94BackupAngle = projectile.angle;
      const phases94 = projectile._v94ProjectilePhases || 1;
      if (phases94 > 1) {
        // Visual motion is independent from the coarser gameplay cohort. The
        // exponential follower keeps rockets and aircraft munitions moving
        // continuously at monitor refresh rate, without changing simulation
        // positions or allocating intermediate trail points.
        if (!Number.isFinite(projectile._v94VisualX)) {
          projectile._v94VisualX = Number.isFinite(projectile._v9PrevX) ? projectile._v9PrevX : projectile.x;
          projectile._v94VisualY = Number.isFinite(projectile._v9PrevY) ? projectile._v9PrevY : projectile.y;
          projectile._v94VisualAltitude = Number.isFinite(projectile._v9PrevAltitude) ? projectile._v9PrevAltitude : (projectile.altitude || 0);
          projectile._v94VisualAngle = Number.isFinite(projectile._v9PrevAngle) ? projectile._v9PrevAngle : (projectile.angle || 0);
        }
        const response94 = 1 - Math.exp(-Math.max(12, 24 / phases94) * interpolationElapsed94);
        projectile._v94VisualX = lerp94(projectile._v94VisualX, projectile.x, response94);
        projectile._v94VisualY = lerp94(projectile._v94VisualY, projectile.y, response94);
        projectile._v94VisualAltitude = lerp94(projectile._v94VisualAltitude, projectile.altitude || 0, response94);
        projectile._v94VisualAngle = angleLerp94(projectile._v94VisualAngle, projectile.angle || 0, response94);
        projectile.x = projectile._v94VisualX;
        projectile.y = projectile._v94VisualY;
        projectile.altitude = projectile._v94VisualAltitude;
        projectile.angle = projectile._v94VisualAngle;
      } else {
        projectile.x = lerp94(Number.isFinite(projectile._v9PrevX) ? projectile._v9PrevX : projectile.x, projectile.x, alpha);
        projectile.y = lerp94(Number.isFinite(projectile._v9PrevY) ? projectile._v9PrevY : projectile.y, projectile.y, alpha);
        projectile.altitude = lerp94(Number.isFinite(projectile._v9PrevAltitude) ? projectile._v9PrevAltitude : (projectile.altitude || 0), projectile.altitude || 0, alpha);
        projectile.angle = angleLerp94(Number.isFinite(projectile._v9PrevAngle) ? projectile._v9PrevAngle : (projectile.angle || 0), projectile.angle || 0, alpha);
      }
    }
  };
  Game.prototype.restoreInterpolationV9 = function() {
    for (const projectile of this.renderSnapshot?.projectiles || []) {
      if (!Number.isFinite(projectile._v94BackupX)) continue;
      projectile.x = projectile._v94BackupX;
      projectile.y = projectile._v94BackupY;
      projectile.altitude = projectile._v94BackupAltitude;
      projectile.angle = projectile._v94BackupAngle;
      projectile._v94BackupX = undefined;
    }
  };

  function cameraChanged94(game) {
    const x = game.camera.x;
    const y = game.camera.y;
    const zoom = game.camera.zoom;
    const yaw = game.camera.yaw || 0;
    const pitch = game.camera.pitch || 0.58;
    const previous = game._v94RenderCamera;
    if (!previous) {
      game._v94RenderCamera = { x, y, zoom, yaw, pitch };
      return true;
    }
    const worldPixel = 30 / Math.max(0.2, zoom);
    const changed = Math.hypot(x - previous.x, y - previous.y) > worldPixel ||
      Math.abs(zoom - previous.zoom) > 0.018 ||
      Math.abs(yaw - previous.yaw) > 0.015 ||
      Math.abs(pitch - previous.pitch) > 0.015;
    previous.x = x;
    previous.y = y;
    previous.zoom = zoom;
    previous.yaw = yaw;
    previous.pitch = pitch;
    return changed;
  }

  function addStrategicDetail94(game, snapshot, seen, unit, bounds, limit) {
    if (snapshot.units.length >= limit || !unit?.alive || unit.embarkedIn || seen.has(unit)) return;
    const margin = unit.radius + 220;
    if (unit.x < bounds.left - margin || unit.x > bounds.right + margin || unit.y < bounds.top - margin || unit.y > bounds.bottom + margin) return;
    if (unit.team === 'enemy' && (!game.isVisibleAt(unit.x, unit.y) || (!game.isUndercoverTo(unit, 'player') && !game.isTargetableBy(unit, 'player')))) return;
    seen.add(unit);
    snapshot.units.push(unit);
  }

  function buildStrategicSnapshot94(game, snapshot, bounds, limit) {
    const seen = game._v94ImportantUnits;
    seen.clear();
    for (const entity of game.selected) if (entity.kind === 'unit') addStrategicDetail94(game, snapshot, seen, entity, bounds, limit.detail);
    for (const unit of game._v94HotUnits) addStrategicDetail94(game, snapshot, seen, unit, bounds, limit.detail);

    const start = game._v94StrategicDetailCursor % MASS_BUCKETS;
    for (let offset = 0; offset < MASS_BUCKETS && snapshot.units.length < limit.detail; offset += 1) {
      const bucket = game._v94Buckets[(start + offset) % MASS_BUCKETS];
      for (const unit of bucket) {
        addStrategicDetail94(game, snapshot, seen, unit, bounds, limit.detail);
        if (snapshot.units.length >= limit.detail) break;
      }
    }
    game._v94StrategicDetailCursor = (start + 1) % MASS_BUCKETS;

    let clusterIndex = 0;
    const pool = game._v94StrategicClusterPool;
    for (const [key, cell] of game._v94MiniCells) {
      const cx = key & 255;
      const cy = Math.floor(key / 256);
      const centerX = (cx + .5) * MINI_CELL;
      const centerY = (cy + .5) * MINI_CELL;
      if (centerX < bounds.left - MINI_CELL || centerX > bounds.right + MINI_CELL || centerY < bounds.top - MINI_CELL || centerY > bounds.bottom + MINI_CELL) continue;
      for (let bandIndex = 0; bandIndex < STRATEGIC_BANDS94.length; bandIndex += 1) {
        const [, team, air] = STRATEGIC_BANDS94[bandIndex];
        const band = cell.bands[bandIndex];
        const count = band.count;
        if (!count) continue;
        const x = (band.x || centerX * count) / count;
        const y = (band.y || centerY * count) / count;
        if (team === 'enemy' && !game.isVisibleAt(x, y)) continue;
        const cluster = pool[clusterIndex] || (pool[clusterIndex] = {});
        cluster.team = team;
        cluster.air = air;
        cluster.typeId = band.typeId;
        cluster.x = x;
        cluster.y = y;
        cluster.count = count;
        cluster.hp = 1;
        cluster.rotation = Math.atan2(band.dirY || 0, band.dirX || (team === 'enemy' ? -1 : 1));
        snapshot.clusters94.push(cluster);
        clusterIndex += 1;
      }
    }
  }

  Game.prototype.buildRenderSnapshotV9 = function(alpha) {
    ensureMass94(this);
    const snapshot = this.renderSnapshot;
    if (this._v94StressAdding) {
      snapshot.clear();
      if (snapshot.clusters94) snapshot.clusters94.length = 0;
      else snapshot.clusters94 = [];
      snapshot.alpha = alpha;
      return snapshot;
    }
    const current = now94();
    const alive94 = this._v94AliveUnits || 0;
    const refreshMs = alive94 >= 16000 ? (isTouch94() ? 175 : 125) : alive94 >= 8000 ? 108 : 90;
    const moved = cameraChanged94(this);
    if (!moved && current - this._v94RenderAt < refreshMs) {
      snapshot.alpha = alpha;
      return snapshot;
    }
    this._v94RenderAt = current;
    snapshot.clear();
    snapshot.alpha = alpha;
    snapshot.frame += 1;
    if (snapshot.clusters94) snapshot.clusters94.length = 0;
    else snapshot.clusters94 = [];

    const bounds = this.visibleWorldBounds(260);
    const radius = Math.hypot(bounds.right - bounds.left, bounds.bottom - bounds.top) * 0.58 + 320;
    const limit = limits94(this);
    const strategicGrid = alive94 >= 16000 && (this.camera?.zoom || 1) < .66;
    if (strategicGrid) {
      buildStrategicSnapshot94(this, snapshot, bounds, limit);
    } else {
    const candidates = this.spatial.queryRadius('units', this.camera.x, this.camera.y, radius);
    const visible = this._v94VisibleUnits;
    visible.length = 0;
    for (const unit of candidates) {
      if (!unit.alive || unit.embarkedIn) continue;
      const margin = unit.radius + 220;
      if (unit.x < bounds.left - margin || unit.x > bounds.right + margin || unit.y < bounds.top - margin || unit.y > bounds.bottom + margin) continue;
      if (unit.team === 'enemy' && (!this.isVisibleAt(unit.x, unit.y) || (!this.isUndercoverTo(unit, 'player') && !this.isTargetableBy(unit, 'player')))) continue;
      visible.push(unit);
    }

    const important = this._v94ImportantUnits;
    important.clear();
    for (const unit of visible) {
      if (unit.selected || this.time - Math.max(unit.lastDamagedAt || -999, unit.lastShotAt || -999) < 1.5) important.add(unit);
    }
    for (const unit of important) {
      if (snapshot.units.length >= limit.detail) break;
      snapshot.units.push(unit);
    }

    const available = Math.max(0, limit.detail - snapshot.units.length);
    const ordinaryCount = Math.max(1, visible.length - important.size);
    const stride = Math.max(1, Math.ceil(ordinaryCount / Math.max(1, available)));
    const clusterCell = Math.max(150, Math.ceil(Math.sqrt(Math.max(1, (bounds.right - bounds.left) * (bounds.bottom - bounds.top) / limit.clusters)) / 64) * 64);
    const clusters = this._v94ClusterMap;
    const clusterPool = this._v94ClusterPool;
    for (const oldCluster of clusters.values()) clusterPool.push(oldCluster);
    clusters.clear();
    let ordinal = 0;
    for (const unit of visible) {
      if (important.has(unit)) continue;
      if (snapshot.units.length < limit.detail && (ordinal++ % stride) === 0) {
        snapshot.units.push(unit);
        continue;
      }
      const cx = Math.floor(unit.x / clusterCell);
      const cy = Math.floor(unit.y / clusterCell);
      const teamCode = unit.team === 'player' ? 0 : unit.team === 'enemy' ? 1 : 2;
      const key = (((teamCode * 2 + (unit.air ? 1 : 0)) * 256 + cy) * 256 + cx);
      let cluster = clusters.get(key);
      if (!cluster) {
        cluster = clusterPool.pop() || {};
        cluster.team = unit.team;
        cluster.air = unit.air;
        cluster.typeId = unit.typeId;
        cluster.x = 0;
        cluster.y = 0;
        cluster.count = 0;
        cluster.hp = 0;
        cluster.dirX = 0;
        cluster.dirY = 0;
        clusters.set(key, cluster);
      }
      cluster.x += unit.x;
      cluster.y += unit.y;
      cluster.hp += unit.healthRatio;
      cluster.dirX += Math.cos(unit.rotation || 0);
      cluster.dirY += Math.sin(unit.rotation || 0);
      cluster.count += 1;
    }
    for (const cluster of clusters.values()) {
      cluster.x /= cluster.count;
      cluster.y /= cluster.count;
      cluster.hp /= cluster.count;
      cluster.rotation = Math.atan2(cluster.dirY, cluster.dirX);
      snapshot.clusters94.push(cluster);
    }
    }

    for (const building of this.spatial.queryRadius('buildings', this.camera.x, this.camera.y, radius + 260)) {
      if (building.alive && this.isOnScreen(building.x, building.y, building.radius + 220) && (building.team !== 'enemy' || this.isVisibleAt(building.x, building.y))) snapshot.buildings.push(building);
    }
    for (const resource of this.spatial.queryRadius('resources', this.camera.x, this.camera.y, radius + 200)) {
      if (resource.alive && this.isOnScreen(resource.x, resource.y, resource.radius + 160) && this.isExploredAt(resource.x, resource.y)) snapshot.resources.push(resource);
    }
    for (const projectile of this.spatial.queryRadius('projectiles', this.camera.x, this.camera.y, radius + 180)) {
      if (projectile.alive && this.isOnScreen(projectile.x, projectile.y, 180)) snapshot.projectiles.push(projectile);
    }
    this._v94LastCounts.detailed = snapshot.units.length;
    this._v94LastCounts.clusters = snapshot.clusters94.length;
    return snapshot;
  };

  const formationTiles94 = new Map();
  const formationTileOrder94 = [];

  function clusterSprite94(cluster) {
    const pilot = window.__FD_MODEL_PILOT__;
    const code = pilot?.modelForType?.(cluster.typeId, 'unit');
    const sprite = code ? pilot?.canvasSprites?.[code] : null;
    if (!sprite) return null;
    if (!sprite.image) {
      sprite.image = new Image();
      sprite.image.decoding = 'async';
      sprite.image.addEventListener('load', () => { sprite.ready = true; }, { once: true });
      sprite.image.src = sprite.uri;
    }
    sprite.ready = sprite.ready || (sprite.image.complete && sprite.image.naturalWidth > 0);
    return sprite.ready ? { code, sprite } : null;
  }

  function formationTile94(cluster) {
    const resolved = clusterSprite94(cluster);
    if (!resolved) return null;
    const { code, sprite } = resolved;
    const atlas = sprite.spec?.canvasSprite || {};
    const columns = Math.max(1, atlas.columns || 4);
    const rows = Math.max(1, atlas.rows || 2);
    const directions = Math.max(1, atlas.directions || columns * rows || 8);
    const heading = ((cluster.rotation || 0) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
    const frame = Math.round(heading / (Math.PI * 2 / directions)) % directions;
    const band = cluster.count <= 4 ? 0 : cluster.count <= 18 ? 1 : 2;
    const key = `${code}:${frame}:${band}`;
    const cached = formationTiles94.get(key);
    if (cached) return cached;

    const tile = document.createElement('canvas');
    tile.width = 160;
    tile.height = 112;
    const tileContext = tile.getContext('2d');
    tileContext.imageSmoothingEnabled = true;
    tileContext.imageSmoothingQuality = 'high';
    const sourceWidth = sprite.image.naturalWidth / columns;
    const sourceHeight = sprite.image.naturalHeight / rows;
    const sourceX = (frame % columns) * sourceWidth;
    const sourceY = Math.floor(frame / columns) * sourceHeight;
    const stamps = band === 0 ? 4 : band === 1 ? 7 : 10;
    const stampWidth = band === 0 ? 64 : 54;
    const stampHeight = stampWidth * sourceHeight / sourceWidth;
    // Back rows first: the composed tile is a single draw call at runtime but
    // still reads as a dense formation of the approved unit silhouette.
    for (let index = 0; index < stamps; index += 1) {
      const row = Math.floor(index / (band === 0 ? 2 : 3));
      const column = index % (band === 0 ? 2 : 3);
      const rowCount = band === 0 ? 2 : Math.min(3, stamps - row * 3);
      const x = 80 + (column - (rowCount - 1) / 2) * (band === 0 ? 42 : 38) + (row & 1 ? 9 : -5);
      const y = 45 + row * (band === 0 ? 25 : 20);
      tileContext.drawImage(sprite.image, sourceX, sourceY, sourceWidth, sourceHeight, x - stampWidth / 2, y - stampHeight * .72, stampWidth, stampHeight);
    }
    formationTiles94.set(key, tile);
    formationTileOrder94.push(key);
    if (formationTileOrder94.length > 180) formationTiles94.delete(formationTileOrder94.shift());
    return tile;
  }

  function drawClusters94(game) {
    if (!ctx) return;
    const clusters = game.renderSnapshot?.clusters94 || [];
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const cluster of clusters) {
      const point = game.worldToScreen(cluster.x, cluster.y, cluster.air ? Math.max(310, (game.getTallestBuildingHeight119?.() || 245) + 65) : 0);
      if (point.x < -30 || point.y < -30 || point.x > game.viewport.width + 30 || point.y > game.viewport.height + 30) continue;
      const size = clamp94(3.5 + Math.log2(cluster.count + 1) * 1.35, 5, 17);
      const color = game.teamColor(cluster.team);
      ctx.globalAlpha = 0.58 + cluster.hp * 0.36;
      const tile = formationTile94(cluster);
      if (tile) {
        const zoom = game.camera.zoom || 1;
        const width = clamp94((66 + Math.log2(cluster.count + 1) * 17) * Math.sqrt(zoom), 40, cluster.air ? 118 : 148);
        const height = width * tile.height / tile.width;
        ctx.drawImage(tile, point.x - width / 2, point.y - height * .64, width, height);
        ctx.globalAlpha = .72;
        ctx.strokeStyle = color;
        ctx.lineWidth = Math.max(1, zoom * 1.5);
        ctx.beginPath();
        ctx.moveTo(point.x - width * .32, point.y + 2);
        ctx.lineTo(point.x + width * .32, point.y + 2);
        ctx.stroke();
      } else {
        ctx.fillStyle = color;
        ctx.beginPath();
        if (cluster.air) {
          ctx.moveTo(point.x + size, point.y);
          ctx.lineTo(point.x - size * 0.75, point.y - size * 0.62);
          ctx.lineTo(point.x - size * 0.75, point.y + size * 0.62);
        } else {
          ctx.moveTo(point.x, point.y - size);
          ctx.lineTo(point.x + size, point.y);
          ctx.lineTo(point.x, point.y + size);
          ctx.lineTo(point.x - size, point.y);
        }
        ctx.closePath();
        ctx.fill();
      }
      if (cluster.count >= 12 && game.camera.zoom <= 0.72) {
        ctx.globalAlpha = 0.92;
        ctx.fillStyle = '#f1f6f2';
        ctx.font = `800 ${clamp94(9 + Math.log10(cluster.count + 1), 9, 12)}px system-ui`;
        const label = cluster.count >= 1000 ? `${(cluster.count / 1000).toFixed(cluster.count >= 10000 ? 0 : 1)}k` : String(cluster.count);
        ctx.fillText(label, point.x, point.y - size - 12);
      }
    }
    ctx.restore();
  }

  const baseDrawWorld94 = Game.prototype.drawWorldObjects3D;
  Game.prototype.drawWorldObjects3D = function() {
    if (!this._v94Installed || !this.renderSnapshot) return baseDrawWorld94.call(this);
    const allUnits = this.units;
    const allBuildings = this.buildings;
    const allResources = this.resources;
    this.units = this.renderSnapshot.units;
    this.buildings = this.renderSnapshot.buildings;
    this.resources = this.renderSnapshot.resources;
    try {
      baseDrawWorld94.call(this);
    } finally {
      this.units = allUnits;
      this.buildings = allBuildings;
      this.resources = allResources;
    }
    drawClusters94(this);
  };

  const baseDrawProjectiles94 = Game.prototype.drawProjectiles3D;
  Game.prototype.drawProjectiles3D = function() {
    if (!this._v94Installed || !this.renderSnapshot) return baseDrawProjectiles94.call(this);
    const all = this.projectiles;
    this.projectiles = this.renderSnapshot.projectiles;
    try { return baseDrawProjectiles94.call(this); }
    finally { this.projectiles = all; }
  };

  const baseDrawCommands94 = Game.prototype.drawSelectedCommands;
  Game.prototype.drawSelectedCommands = function() {
    if (!this._v94Installed || this.selected.length <= 220) return baseDrawCommands94.call(this);
    const all = this.selected;
    const visibleSelected = [];
    for (const entity of all) {
      if (visibleSelected.length >= 220) break;
      if (entity.kind === 'unit' && entity.alive && this.isOnScreen(entity.x, entity.y, 120)) visibleSelected.push(entity);
    }
    this.selected = visibleSelected;
    try { return baseDrawCommands94.call(this); }
    finally { this.selected = all; }
  };

  const baseEffect94 = Game.prototype.addEffect;
  Game.prototype.addEffect = function(effect) {
    if (!this._v94Installed) return baseEffect94.call(this, effect);
    const limit = limits94(this).effects;
    const critical = CRITICAL_EFFECT_TYPES94.has(effect?.type);
    if (this.effects.length >= limit && !critical && !this.isOnScreen(effect.x || 0, effect.y || 0, 260)) return;
    if (this.effects.length >= limit * 1.35 && !critical) return;
    return baseEffect94.call(this, effect);
  };

  Game.prototype.cleanupDeadObjectsV9 = function() {
    ensureMass94(this);
    const compactSmall = (array, keep) => {
      let write = 0;
      for (let i = 0; i < array.length; i += 1) if (keep(array[i])) array[write++] = array[i];
      array.length = write;
    };
    compactSmall(this.projectiles, (projectile) => {
      if (projectile.alive) return true;
      this.spatial.remove(projectile, 'projectiles');
      if (this._v9ProjectilePool.length < 4096) this._v9ProjectilePool.push(projectile);
      return false;
    });
    compactSmall(this.abilityZones, (zone) => zone.alive);
    compactSmall(this.spyCells, (cell) => !cell.expired && cell.expiresAt > this.time && this.getEntity(cell.hostBuildingId)?.alive);
    compactSmall(this.selected, (entity) => entity.alive);
    if (this.time < this._v94CleanupAt) return;
    const alive = this._v94AliveUnits || 0;

    if (alive >= 5000) {
      this._v94CleanupAt = this.time + .72;
      let compaction = this._v94UnitCompaction;
      if (!compaction || compaction.source !== this.units) {
        compaction = {
          source: this.units,
          result: new Array(this.units.length),
          index: 0,
          write: 0,
        };
        this._v94UnitCompaction = compaction;
      }
      const end = Math.min(compaction.source.length, compaction.index + (alive >= 16000 ? 1800 : 3200));
      for (let index = compaction.index; index < end; index += 1) {
        const unit = compaction.source[index];
        if (unit?.alive) compaction.result[compaction.write++] = unit;
      }
      compaction.index = end;
      if (compaction.index >= compaction.source.length) {
        compaction.result.length = compaction.write;
        this.units = compaction.result;
        this._v94UnitCompaction = null;
      }

      // Bucket cleanup is similarly amortised. Dead units are already absent
      // from spatial queries and entityMap; retaining a reference for a few
      // scheduler turns is harmless, whereas compacting all 96 buckets in one
      // frame caused the visible 80–120 ms hitch.
      const bucketsPerPass = alive >= 16000 ? 4 : 8;
      for (let offset = 0; offset < bucketsPerPass; offset += 1) {
        const index = (this._v94BucketCleanupCursor + offset) % MASS_BUCKETS;
        compactSmall(this._v94Buckets[index], (unit) => unit.alive);
      }
      this._v94BucketCleanupCursor = (this._v94BucketCleanupCursor + bucketsPerPass) % MASS_BUCKETS;
    } else {
      this._v94CleanupAt = this.time + 12;
      this._v94UnitCompaction = null;
      compactSmall(this.units, (unit) => unit.alive);
      for (let index = 0; index < MASS_BUCKETS; index += 1) compactSmall(this._v94Buckets[index], (unit) => unit.alive);
    }

    if (this.time < this._v94StructureCleanupAt) return;
    this._v94StructureCleanupAt = this.time + 12;
    compactSmall(this.buildings, (building) => {
      if (building.alive) return true;
      if (this.entityMap.get(building.id) === building) this.entityMap.delete(building.id);
      this.spatial.remove(building, 'buildings');
      this.spatial.remove(building, 'sensors');
      return false;
    });
    compactSmall(this.resources, (resource) => resource.alive);
  };
  Game.prototype.cleanupDeadObjects = function() { return this.cleanupDeadObjectsV9(); };

  const baseInterception94 = Game.prototype.updateProjectileInterception;
  Game.prototype.updateProjectileInterception = function(dt) {
    if (!this._v94Installed) return baseInterception94.call(this, dt);
    if (!this._v94InterceptorRefreshAt || this.time >= this._v94InterceptorRefreshAt) {
      const cache = this._v9InterceptorCache || (this._v9InterceptorCache = []);
      cache.length = 0;
      for (const unit of this._v94Interceptors) if (unit.alive) cache.push(unit);
      for (const building of this.buildings) if (building.alive && (building.stats?.interceptPower || building.stats?.softKillPower)) cache.push(building);
      this._v94InterceptorRefreshAt = this.time + 1.5;
    }
    this._v9InterceptorCacheAt = this.time;
    return baseInterception94.call(this, dt);
  };

  Game.prototype.refreshSensorCacheV9 = function() {
    ensureMass94(this);
    const player = this._v9SensorCache.player;
    const enemy = this._v9SensorCache.enemy;
    player.length = 0;
    enemy.length = 0;
    for (const unit of this._v94Sensors) {
      if (!unit.alive) continue;
      (unit.team === 'player' ? player : enemy).push(unit);
    }
    for (const building of this.buildings) {
      if (!building.alive || !(building.stats?.radarRelay || building.detector > 0 || building.stats?.counterIntel > 0)) continue;
      (building.team === 'player' ? player : enemy).push(building);
    }
    this._v9SensorCacheAt = this.time;
  };

  const baseCounterIntel94 = Game.prototype.updateCounterIntelligence;
  Game.prototype.updateCounterIntelligence = function(dt) {
    if (!this._v94Installed || (this._v94AliveUnits || 0) < 12000) return baseCounterIntel94.call(this, dt);
    const all = this.units;
    this.units = [...this._v94Covert].filter((unit) => unit.alive);
    try { return baseCounterIntel94.call(this, dt); }
    finally { this.units = all; }
  };

  if (TacticalAI?.prototype?.update) {
    const baseAIUpdate94 = TacticalAI.prototype.update;
    TacticalAI.prototype.update = function(dt) {
      const game = this.game;
      const alive = game?._v94AliveUnits || 0;
      if (!game?._v94Installed || alive < 12000) return baseAIUpdate94.call(this, dt);
      const all = game.units;
      const sample = game._v94AISample || (game._v94AISample = []);
      sample.length = 0;
      const token = (game._v94AIToken = (game._v94AIToken || 0) + 1);
      const add = (unit) => {
        if (!unit?.alive || unit._v94AIMark === token) return;
        unit._v94AIMark = token;
        sample.push(unit);
      };
      for (const unit of game._v94HotUnits) add(unit);
      // Strategic AI reasons about the exact foreground plus a rotating macro
      // cohort. It must never fall back to scanning all 19,999 objects after
      // the first casualty in a 20k battle.
      const bucketCount = alive >= 16000 ? 1 : 2;
      const start = game._v94AIBucketCursor || 0;
      for (let offset = 0; offset < bucketCount; offset += 1) {
        const bucket = game._v94Buckets[(start + offset) % MASS_BUCKETS];
        if (alive >= 50000 && bucket.length > 320) {
          const stride = Math.max(1, Math.floor(bucket.length / 280));
          const phase = (game.simTick + offset * 17) % stride;
          for (let i = phase; i < bucket.length; i += stride) add(bucket[i]);
        } else {
          for (const unit of bucket) add(unit);
        }
      }
      game._v94AIBucketCursor = (start + bucketCount) % MASS_BUCKETS;
      game.units = sample;
      try { return baseAIUpdate94.call(this, dt); }
      finally { game.units = all; }
    };
  }

  function setFogEmitter94(game, id, x, y, radius) {
    const prev = game._v9FogEmitters.get(id);
    const qx = Math.round(x / (WORLD.cell * 0.5));
    const qy = Math.round(y / (WORLD.cell * 0.5));
    const qr = Math.round(radius / WORLD.cell);
    if (prev && prev.qx === qx && prev.qy === qy && prev.qr === qr) return;
    if (prev) game._v9FogStamp(prev, -1);
    const stamp = { x, y, r: radius, qx, qy, qr };
    game._v9FogEmitters.set(id, stamp);
    game._v9FogStamp(stamp, 1);
  }

  function removeFogEmitter94(game, id) {
    const old = game._v9FogEmitters.get(id);
    if (!old) return;
    game._v9FogStamp(old, -1);
    game._v9FogEmitters.delete(id);
  }

  const baseVisibility94 = Game.prototype.updateVisibilityV9;
  Game.prototype.updateVisibilityV9 = function(force = false) {
    if (!this.units || !this.spatial) return baseVisibility94.call(this, force);
    ensureMass94(this);
    if (force && !this._v9FogInitialized) {
      this.visible.fill(0);
      this._v9FogCounts.fill(0);
      this._v9FogEmitters.clear();
      this._v9FogInitialized = true;
      for (const key of this._v94MiniCells.keys()) this._v94FogDirty.add(key);
    }

    // Fog stamps are progressively consumed. A single 900-cell reveal burst
    // was visually invisible but could block the main thread for 30 ms.
    const alive94 = this._v94AliveUnits || 0;
    let dirtyBudget = alive94 >= 16000 ? 120 : alive94 >= 8000 ? 280 : 900;
    for (const key of this._v94FogDirty) {
      this._v94FogDirty.delete(key);
      const cell = this._v94MiniCells.get(key);
      const id = `v94cell:${key}`;
      if (cell?.p) {
        const cx = key & 255;
        const cy = key >> 8;
        setFogEmitter94(this, id, cx * MINI_CELL + MINI_CELL * 0.5, cy * MINI_CELL + MINI_CELL * 0.5, 300);
      } else removeFogEmitter94(this, id);
      if (--dirtyBudget <= 0) break;
    }

    const nextHot = new Set();
    for (const unit of this._v94HotUnits) {
      if (!unit.alive || unit.team !== 'player' || unit.embarkedIn) continue;
      nextHot.add(unit.id);
      setFogEmitter94(this, unit.id, unit.x, unit.y, (unit.vision || 220) * this.getJammingFactor(unit));
    }
    for (const id of this._v94FogHotIds) if (!nextHot.has(id)) removeFogEmitter94(this, id);
    this._v94FogHotIds = nextHot;

    for (const building of this.buildings) {
      if (!building.alive || building.team !== 'player' || !building.completed) continue;
      setFogEmitter94(this, building.id, building.x, building.y, (building.vision || 220) * this.getJammingFactor(building));
    }
    let zoneIndex = 0;
    for (const zone of this.abilityZones) {
      if (zone.alive && zone.team === 'player' && zone.type === 'scan') setFogEmitter94(this, `v94zone:${zoneIndex++}`, zone.x, zone.y, zone.radius);
    }
    if (force) this.uiDirty = true;
  };
  Game.prototype.updateVisibility = function(force = false) { return this.updateVisibilityV9(force); };

  const baseHitTest94 = Game.prototype.hitTest;
  Game.prototype.hitTest = function(worldX, worldY, selectableOnly = true) {
    if (!this._v94Installed) return baseHitTest94.call(this, worldX, worldY, selectableOnly);
    const radius = Math.max(120, 90 / Math.max(0.2, this.camera.zoom));
    const units = this.spatial.queryRadius('units', worldX, worldY, radius);
    const buildings = this.spatial.queryRadius('buildings', worldX, worldY, radius + 140);
    const resources = this.spatial.queryRadius('resources', worldX, worldY, radius + 100);
    const allUnits = this.units;
    const allBuildings = this.buildings;
    const allResources = this.resources;
    this.units = units;
    this.buildings = buildings;
    this.resources = resources;
    try { return baseHitTest94.call(this, worldX, worldY, selectableOnly); }
    finally {
      this.units = allUnits;
      this.buildings = allBuildings;
      this.resources = allResources;
    }
  };

  const baseContextHit94 = Game.prototype.hitTestForContext;
  if (baseContextHit94) Game.prototype.hitTestForContext = function(worldX, worldY) {
    if (!this._v94Installed) return baseContextHit94.call(this, worldX, worldY);
    const radius = Math.max(140, 105 / Math.max(0.2, this.camera.zoom));
    const allUnits = this.units;
    const allBuildings = this.buildings;
    const allResources = this.resources;
    this.units = this.spatial.queryRadius('units', worldX, worldY, radius);
    this.buildings = this.spatial.queryRadius('buildings', worldX, worldY, radius + 160);
    this.resources = this.spatial.queryRadius('resources', worldX, worldY, radius + 120);
    try { return baseContextHit94.call(this, worldX, worldY); }
    finally {
      this.units = allUnits;
      this.buildings = allBuildings;
      this.resources = allResources;
    }
  };

  const baseSelectRect94 = Game.prototype.selectRect;
  Game.prototype.selectRect = function(screenRect, additive = false) {
    if (!this._v94Installed) return baseSelectRect94.call(this, screenRect, additive);
    const x1 = Math.min(screenRect.x1, screenRect.x2);
    const y1 = Math.min(screenRect.y1, screenRect.y2);
    const x2 = Math.max(screenRect.x1, screenRect.x2);
    const y2 = Math.max(screenRect.y1, screenRect.y2);
    const a = this.screenToWorld(x1, y1);
    const b = this.screenToWorld(x2, y1);
    const c = this.screenToWorld(x2, y2);
    const d = this.screenToWorld(x1, y2);
    const cx = (a.x + b.x + c.x + d.x) * 0.25;
    const cy = (a.y + b.y + c.y + d.y) * 0.25;
    const radius = Math.max(Math.hypot(a.x - cx, a.y - cy), Math.hypot(b.x - cx, b.y - cy), Math.hypot(c.x - cx, c.y - cy), Math.hypot(d.x - cx, d.y - cy)) + 120;
    const all = this.units;
    this.units = this.spatial.queryRadius('units', cx, cy, radius);
    try { return baseSelectRect94.call(this, screenRect, additive); }
    finally { this.units = all; }
  };

  const baseSelectAt94 = Game.prototype.selectAt;
  Game.prototype.selectAt = function(worldX, worldY, additive = false) {
    if (!this._v94Installed) return baseSelectAt94.call(this, worldX, worldY, additive);
    const radius = Math.hypot(this.viewport.width, this.viewport.height) / Math.max(0.2, this.camera.zoom);
    const all = this.units;
    this.units = this.spatial.queryRadius('units', this.camera.x, this.camera.y, radius * 0.62 + 200);
    try { return baseSelectAt94.call(this, worldX, worldY, additive); }
    finally { this.units = all; }
  };

  Game.prototype.renderMinimap = function() {
    if (!mctx || !minimap) return;
    ensureMass94(this);
    const current = now94();
    const interval = (this._v94AliveUnits || 0) >= 70000 ? 240 : 140;
    if (current - this._v94MiniRenderAt < interval) return;
    this._v94MiniRenderAt = current;
    this._v94MiniDirty = false;
    const width = minimap.width;
    const height = minimap.height;
    const sx = width / WORLD.width;
    const sy = height / WORLD.height;
    mctx.setTransform(1, 0, 0, 1, 0, 0);
    mctx.fillStyle = '#142019';
    mctx.fillRect(0, 0, width, height);
    mctx.strokeStyle = 'rgba(151,143,108,.20)';
    mctx.lineCap = 'round';
    for (const road of this.roads) {
      if (!road.length) continue;
      mctx.lineWidth = clamp94((road.width || 110) * Math.max(sx, sy), 1.2, 5.4);
      mctx.beginPath();
      mctx.moveTo(road[0].x * sx, road[0].y * sy);
      for (let i = 1; i < road.length; i += 1) mctx.lineTo(road[i].x * sx, road[i].y * sy);
      mctx.stroke();
    }
    mctx.fillStyle = 'rgba(25,27,23,.86)';
    for (const obstacle of this.terrainObstacles || []) {
      mctx.beginPath();
      mctx.ellipse(obstacle.x * sx, obstacle.y * sy, Math.max(1, obstacle.radius * sx), Math.max(1, obstacle.radius * sy), obstacle.rotation || 0, 0, Math.PI * 2);
      mctx.fill();
    }
    for (const resource of this.resources) {
      if (!resource.alive || !this.isExploredAt(resource.x, resource.y)) continue;
      mctx.fillStyle = '#e5d17c';
      mctx.fillRect(resource.x * sx - 2, resource.y * sy - 2, 4, 4);
    }
    for (const building of this.buildings) {
      if (!building.alive || !this.isExploredAt(building.x, building.y) || (building.team === 'enemy' && !this.isVisibleAt(building.x, building.y))) continue;
      mctx.fillStyle = this.teamColor(building.team);
      const size = building.typeId === 'hq' ? 7 : 4;
      mctx.fillRect(building.x * sx - size / 2, building.y * sy - size / 2, size, size);
    }
    for (const [key, cell] of this._v94MiniCells) {
      const cx = key & 255;
      const cy = key >> 8;
      const x = (cx + 0.5) * MINI_CELL * sx;
      const y = (cy + 0.5) * MINI_CELL * sy;
      if (cell.p) {
        mctx.globalAlpha = clamp94(0.34 + Math.log2(cell.p + 1) * 0.10, 0.42, 0.95);
        mctx.fillStyle = this.teamColor('player');
        const size = clamp94(1.4 + Math.log2(cell.p + 1) * 0.36, 2, 6);
        mctx.fillRect(x - size / 2, y - size / 2, size, size);
      }
      if (cell.e && this.isVisibleAt((cx + 0.5) * MINI_CELL, (cy + 0.5) * MINI_CELL)) {
        mctx.globalAlpha = clamp94(0.34 + Math.log2(cell.e + 1) * 0.10, 0.42, 0.95);
        mctx.fillStyle = this.teamColor('enemy');
        const size = clamp94(1.4 + Math.log2(cell.e + 1) * 0.36, 2, 6);
        mctx.fillRect(x - size / 2, y - size / 2, size, size);
      }
    }
    mctx.globalAlpha = 1;
    const corners = [this.screenToWorld(0, 0), this.screenToWorld(this.viewport.width, 0), this.screenToWorld(this.viewport.width, this.viewport.height), this.screenToWorld(0, this.viewport.height)];
    mctx.strokeStyle = '#f1fff7';
    mctx.lineWidth = 1;
    mctx.beginPath();
    mctx.moveTo(corners[0].x * sx, corners[0].y * sy);
    for (let i = 1; i < corners.length; i += 1) mctx.lineTo(corners[i].x * sx, corners[i].y * sy);
    mctx.closePath();
    mctx.stroke();
    mctx.strokeStyle = 'rgba(220,240,229,.25)';
    mctx.strokeRect(0.5, 0.5, width - 1, height - 1);
  };

  async function spawnStressUnits94(total = 100000, options = {}) {
    const game = D.game;
    if (!game) throw new Error('Сначала запустите матч');
    ensureMass94(game);
    const requested = clamp94(Math.floor(total), 1, 100000);
    const ids = Object.entries(D.UNIT_TYPES).filter(([, stats]) => !stats.air && stats.speed > 0).map(([id]) => id);
    const typeId = options.typeId && D.UNIT_TYPES[options.typeId] ? options.typeId : (ids[0] || 'rifle');
    const cols = Math.ceil(Math.sqrt(requested * WORLD.width / WORLD.height));
    const rows = Math.ceil(requested / cols);
    const stepX = WORLD.width / Math.max(1, cols);
    const stepY = WORLD.height / Math.max(1, rows);
    const started = now94();
    const wasPaused = game.paused;
    game.paused = true;
    game._v94StressAdding = true;
    try {
      for (let start = 0; start < requested; start += 4000) {
        const end = Math.min(requested, start + 4000);
        for (let i = start; i < end; i += 1) {
          const col = i % cols;
          const row = Math.floor(i / cols);
          const unit = new Unit(game, {
            typeId,
            team: options.team === 'enemy' ? 'enemy' : 'player',
            x: clamp94((col + 0.5) * stepX, 30, WORLD.width - 30),
            y: clamp94((row + 0.5) * stepY, 30, WORLD.height - 30)
          });
          unit._v94Stress = true;
          game.addEntity(unit);
        }
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
    } finally {
      game._v94StressAdding = false;
      game.paused = wasPaused;
    }
    game._v94MiniDirty = true;
    return { added: requested, total: game._v94AliveUnits, createMs: now94() - started };
  }

  window.__FD_MASS_SCALE__ = {
    version: '9.4',
    targetUnits: 100000,
    ensure: () => D.game ? ensureMass94(D.game) : null,
    metrics: () => {
      const game = D.game;
      if (!game) return null;
      ensureMass94(game);
      return {
        units: game._v94AliveUnits,
        detailedUnits: game._v94LastCounts.detailed,
        armyClusters: game._v94LastCounts.clusters,
        backgroundUnitsPerTick: game._v94LastCounts.bucket,
        buckets: MASS_BUCKETS,
        profiler: game.perf?.summary?.() || null,
        autosaveSkippedForMassBattle: Boolean(game._v94AutosaveSkipped)
      };
    },
    spawnStressUnits: spawnStressUnits94
  };

  const stressCount94 = clamp94(Number(new URLSearchParams(location.search).get('fdMassStress')) || 0, 0, 100000);
  if (stressCount94 > 0) {
    const panel = document.createElement('div');
    panel.id = 'fd-mass-stress-status';
    panel.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:100000;max-width:520px;padding:10px 12px;border:1px solid rgba(126,238,181,.65);border-radius:8px;background:rgba(4,12,9,.94);color:#d9f6e5;font:12px/1.4 ui-monospace,SFMono-Regular,Consolas,monospace;pointer-events:none';
    panel.dataset.state = 'waiting';
    panel.textContent = `MASS-STRESS: ожидается запуск матча · цель ${stressCount94.toLocaleString('ru-RU')}`;
    document.body.appendChild(panel);
    document.getElementById('start-game')?.addEventListener('click', () => {
      setTimeout(async () => {
        try {
          panel.dataset.state = 'adding';
          panel.textContent = `MASS-STRESS: создаются ${stressCount94.toLocaleString('ru-RU')} юнитов…`;
          const result = await spawnStressUnits94(stressCount94);
          panel.dataset.state = 'sampling';
          panel.textContent = `MASS-STRESS: ${result.total.toLocaleString('ru-RU')} юнитов · замер FPS…`;
          let frames = 0;
          const started = now94();
          await new Promise((resolve) => {
            const sample = () => {
              frames += 1;
              if (now94() - started >= 4000) resolve();
              else requestAnimationFrame(sample);
            };
            requestAnimationFrame(sample);
          });
          const seconds = Math.max(0.001, (now94() - started) / 1000);
          const fps = frames / seconds;
          const metrics = window.__FD_MASS_SCALE__.metrics();
          panel.dataset.state = 'complete';
          panel.dataset.fps = fps.toFixed(1);
          panel.textContent = `MASS-STRESS ГОТОВ · юниты ${metrics.units.toLocaleString('ru-RU')} · FPS ${fps.toFixed(1)} · подробно ${metrics.detailedUnits} · кластеры ${metrics.armyClusters} · фон/тик ${metrics.backgroundUnitsPerTick} · создание ${(result.createMs / 1000).toFixed(1)} с`;
        } catch (error) {
          panel.dataset.state = 'failed';
          panel.textContent = `MASS-STRESS ОШИБКА: ${error?.message || error}`;
        }
      }, 120);
    }, { once: true });
  }

  void 0;
  const eyebrow = document.querySelector('#start-screen .eyebrow');
  if (eyebrow) void 0;
  const lead = document.querySelector('#start-screen .lead');
  if (lead) void 0;
  const strip = document.querySelector('#start-screen .feature-strip');
  if (strip) void 0;
})();
