(() => {
  'use strict';

  const root = globalThis;
  const D = root.__FD_DEBUG__;
  const Game = D?.Game;
  const Unit = D?.Unit;
  const WORLD = D?.WORLD || { width: 32000, height: 22000 };
  if (!Game || !Unit) return;
  if (Game.prototype.__fdActionGroup184Installed) return;
  Object.defineProperty(Game.prototype, '__fdActionGroup184Installed', { value: true, configurable: true });

  const VERSION = '16.8';
  const BUILD = 184;
  const MIN_GROUP = 6;
  const MAX_GROUP = 180;
  const REBUILD_INTERVAL = 0.34;
  const COMBAT_SCAN_INTERVAL = 0.22;
  const COMBAT_HOLD = 2.8;
  const ROUTE_TTL = 3.5;
  const CELL = 1200;
  const GOAL_Q = 160;
  const SPATIAL_PHASES = 4;
  const GROUP_COMMANDS = new Set(['move', 'attackMove', 'patrol']);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const finite = (v, fallback = 0) => Number.isFinite(Number(v)) ? Number(v) : fallback;
  const dist = (a, b) => Math.hypot(finite(a?.x) - finite(b?.x), finite(a?.y) - finite(b?.y));
  const hash = value => {
    let h = 2166136261 >>> 0;
    for (const c of String(value ?? '')) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  };
  const angleApproach = (from, to, amount) => from + Math.atan2(Math.sin(to - from), Math.cos(to - from)) * clamp(amount, 0, 1);
  const q = (v, step = GOAL_Q) => Math.round(finite(v) / step);

  const metrics = {
    groups: 0, members: 0, patrolGroups: 0, sharedSteps: 0, offscreenSteps: 0,
    exactCombatSteps: 0, combatActivations: 0, routeBuilds: 0, routeHits: 0,
    individualUpdatesAvoided: 0, individualPathfindAvoided: 0, spatialUpdates: 0,
    renderMembersAvoided: 0, lastGroupSize: 0, maxGroupSize: 0, averageGroupSize: 0,
    lastStepMs: 0,
  };

  const commandPoint = (game, unit, command) => {
    if (!command) return null;
    if (command.type === 'patrol') {
      return command.phase
        ? { x: finite(command.ax, unit.x), y: finite(command.ay, unit.y) }
        : { x: finite(command.bx ?? command.x, unit.x), y: finite(command.by ?? command.y, unit.y) };
    }
    if (Number.isFinite(command.x) && Number.isFinite(command.y)) return { x: command.x, y: command.y };
    return null;
  };

  const formationReady = (game, command) => {
    const id = command?.formationGroupId || command?.formationId;
    if (!id) return true;
    const group = game.formations?.get?.(id);
    if (!group || group.air) return false;
    const march = group.march183;
    if (march && march.phase && march.phase !== 'marching') return false;
    return !group.forming;
  };

  const eligible = (game, unit) => {
    if (!unit?.alive || unit.kind !== 'unit' || unit.air || unit.embarkedIn) return false;
    const command = unit.currentCommand;
    if (!command || !GROUP_COMMANDS.has(command.type)) return false;
    if (!formationReady(game, command)) return false;
    if (unit._v160Retreating || unit.currentCommand?.v160Retreat) return false;
    if (unit.typeId === 'worker' || unit.stats?.engineering || unit.stats?.healer || unit.stats?.repairRate) return false;
    return Boolean(commandPoint(game, unit, command));
  };

  const keyFor = (game, unit) => {
    const c = unit.currentCommand;
    const formationId = c?.formationGroupId || c?.formationId;
    if (formationId) return `${unit.team}|formation|${formationId}|${c.type}`;
    const cx = Math.floor(unit.x / CELL), cy = Math.floor(unit.y / CELL);
    if (c.type === 'patrol') {
      return `${unit.team}|patrol|${q(c.ax)}:${q(c.ay)}|${q(c.bx ?? c.x)}:${q(c.by ?? c.y)}`;
    }
    return `${unit.team}|${c.type}|${q(c.x)}:${q(c.y)}|${cx}:${cy}`;
  };

  const effectiveSpeed = unit => {
    const base = Math.max(1, finite(unit.stats?.speed, finite(unit.maxSpeed, 1)));
    const hp = clamp(finite(unit.healthRatio, 1), .35, 1);
    const supply = clamp(finite(unit.supply160, 1), .4, 1);
    const cohesion = clamp(finite(unit.cohesion160, 1), .5, 1);
    return base * (.74 + hp * .26) * (.82 + supply * .18) * (.88 + cohesion * .12);
  };

  class ActionGroupManager184 {
    constructor(game) {
      this.game = game;
      this.groups = new Map();
      this.memberToGroup = new Map();
      this.nextRebuildAt = -Infinity;
      this.serial = 1;
      this.routeCache = new Map();
      this.patchedCompany = false;
      this.baseOwn = null;
      this.baseStep = null;
      this.lastPreparedTick = -1;
    }

    installCompanyBridge() {
      if (this.patchedCompany) return;
      try { root.__FD_HIERARCHICAL_164__?.ensure?.(this.game); } catch (_) {}
      this.baseOwn = typeof this.game._v164CompanyOwns === 'function' ? this.game._v164CompanyOwns.bind(this.game) : null;
      this.baseStep = typeof this.game._v164CompanyStep === 'function' ? this.game._v164CompanyStep.bind(this.game) : null;
      const manager = this;
      this.game._v164CompanyOwns = unit => manager.owns(unit) || Boolean(manager.baseOwn?.(unit));
      this.game._v164CompanyStep = (dt, hot) => {
        const base = Number(manager.baseStep?.(dt, hot)) || 0;
        return base + manager.step(dt);
      };
      this.patchedCompany = true;
    }

    prepare() {
      this.installCompanyBridge();
      if (this.lastPreparedTick === this.game.simTick) return;
      this.lastPreparedTick = this.game.simTick;
      if (this.game.time >= this.nextRebuildAt || !this.groups.size) this.rebuild();
    }

    owns(unit) {
      const group = unit ? this.memberToGroup.get(unit.id) : null;
      return Boolean(group && group.members.includes(unit) && eligible(this.game, unit));
    }

    rebuild() {
      this.nextRebuildAt = finite(this.game.time) + REBUILD_INTERVAL;
      const staging = new Map();
      for (const unit of this.game.units || []) {
        if (!eligible(this.game, unit)) continue;
        const key = keyFor(this.game, unit);
        let list = staging.get(key);
        if (!list) staging.set(key, list = []);
        list.push(unit);
      }
      const next = new Map();
      const memberTo = new Map();
      for (const [key, source] of staging) {
        if (source.length < MIN_GROUP) continue;
        source.sort((a, b) => String(a.id).localeCompare(String(b.id)));
        for (let start = 0; start < source.length; start += MAX_GROUP) {
          const members = source.slice(start, start + MAX_GROUP);
          if (members.length < MIN_GROUP) break;
          const stable = `${key}#${Math.floor(start / MAX_GROUP)}`;
          let group = this.groups.get(stable);
          if (!group) group = this.createGroup(stable, members);
          else this.refreshGroup(group, members);
          next.set(stable, group);
          for (const member of members) {
            memberTo.set(member.id, group);
            member._v184ActionGroupId = group.id;
            member._v164ExactUntil = Math.max(finite(member._v164ExactUntil), finite(this.game.time) + 1.0);
          }
        }
      }
      for (const old of this.groups.values()) {
        if (next.has(old.stable)) continue;
        for (const member of old.members || []) if (member?._v184ActionGroupId === old.id) delete member._v184ActionGroupId;
      }
      this.groups = next;
      this.memberToGroup = memberTo;
      metrics.groups = next.size;
      metrics.members = memberTo.size;
      metrics.patrolGroups = [...next.values()].filter(group => group.commandType === 'patrol').length;
      metrics.maxGroupSize = Math.max(0, ...[...next.values()].map(group => group.members.length));
      metrics.averageGroupSize = next.size ? memberTo.size / next.size : 0;
    }

    createGroup(stable, members) {
      const command = members[0].currentCommand;
      const center = members.reduce((sum, u) => ({ x: sum.x + u.x, y: sum.y + u.y }), { x: 0, y: 0 });
      center.x /= members.length; center.y /= members.length;
      const target = commandPoint(this.game, members[0], command) || center;
      const angle = Math.atan2(target.y - center.y, target.x - center.x);
      const group = {
        id: `action184-${this.serial++}`, stable, members: [], commandType: command.type,
        x: center.x, y: center.y, angle, referenceAngle: angle, offsets: new Map(),
        targetX: target.x, targetY: target.y, phase: Boolean(command.phase),
        sharedSpeed: 0, route: [], routeIndex: 0, routeKey: '', routeAt: -Infinity,
        nextCombatScanAt: -Infinity, combatUntil: -Infinity, lastCombatTargetId: null,
        exact: false, stepSeq: 0, formationId: command.formationGroupId || command.formationId || null,
      };
      this.refreshGroup(group, members, true);
      return group;
    }

    refreshGroup(group, members, forceOffsets = false) {
      group.members = members;
      group.commandType = members[0]?.currentCommand?.type || group.commandType;
      group.sharedSpeed = Math.min(...members.map(effectiveSpeed));
      if (!Number.isFinite(group.sharedSpeed)) group.sharedSpeed = 1;
      const command = members[0]?.currentCommand;
      group.formationId = command?.formationGroupId || command?.formationId || null;
      if (forceOffsets || group.offsets.size !== members.length || members.some(member => !group.offsets.has(member.id))) {
        const center = members.reduce((sum, u) => ({ x: sum.x + u.x, y: sum.y + u.y }), { x: 0, y: 0 });
        center.x /= members.length; center.y /= members.length;
        group.x = center.x; group.y = center.y;
        const target = commandPoint(this.game, members[0], command) || center;
        group.angle = Math.atan2(target.y - center.y, target.x - center.x);
        group.referenceAngle = group.angle;
        group.offsets = new Map();
        const c = Math.cos(-group.referenceAngle), s = Math.sin(-group.referenceAngle);
        for (const unit of members) {
          const dx = unit.x - center.x, dy = unit.y - center.y;
          group.offsets.set(unit.id, { forward: dx * c - dy * s, lateral: dx * s + dy * c });
        }
      }
      metrics.lastGroupSize = members.length;
    }

    currentGoal(group) {
      const command = group.members[0]?.currentCommand;
      if (!command) return null;
      if (command.type === 'patrol') {
        const phase = Boolean(group.phase);
        return phase
          ? { x: finite(command.ax, group.x), y: finite(command.ay, group.y) }
          : { x: finite(command.bx ?? command.x, group.x), y: finite(command.by ?? command.y, group.y) };
      }
      let x = 0, y = 0, n = 0;
      for (const member of group.members) {
        const c = member.currentCommand;
        if (!c || !Number.isFinite(c.x) || !Number.isFinite(c.y)) continue;
        x += c.x; y += c.y; n += 1;
      }
      return n ? { x: x / n, y: y / n } : commandPoint(this.game, group.members[0], command);
    }

    routeFor(group, goal) {
      const navRevision = this.game.navRevision || 0;
      const key = `${navRevision}|${Math.floor(group.x / 600)}:${Math.floor(group.y / 600)}|${q(goal.x, 240)}:${q(goal.y, 240)}`;
      if (group.routeKey === key && group.route.length && this.game.time - group.routeAt < ROUTE_TTL) {
        metrics.routeHits += 1;
        return group.route;
      }
      const cached = this.routeCache.get(key);
      if (cached && this.game.time - cached.at < ROUTE_TTL) {
        group.route = cached.route; group.routeKey = key; group.routeAt = this.game.time; group.routeIndex = 0;
        metrics.routeHits += 1;
        return group.route;
      }
      const sample = group.members[0];
      let route = [];
      try {
        const virtual = {
          id: `action-route-${group.id}`, x: group.x, y: group.y,
          radius: Math.max(16, Math.min(72, Math.sqrt(group.members.length) * 7)),
          stats: sample.stats, vehicle: sample.vehicle, infantry: sample.infantry,
          currentCommand: sample.currentCommand,
        };
        route = (this.game.planGroundPath?.(virtual, goal.x, goal.y, null, { wide: true, movementClass: this.game.movementClassV9?.(sample) }) || [])
          .map(point => ({ x: point.x, y: point.y }));
      } catch (_) {}
      if (!route.length) route = [{ x: goal.x, y: goal.y }];
      group.route = route; group.routeKey = key; group.routeAt = this.game.time; group.routeIndex = 0;
      this.routeCache.set(key, { at: this.game.time, route });
      if (this.routeCache.size > 512) {
        let removed = 0;
        for (const k of this.routeCache.keys()) { this.routeCache.delete(k); if (++removed >= 64) break; }
      }
      metrics.routeBuilds += 1;
      return route;
    }

    nearestEnemy(group) {
      const team = group.members[0]?.team;
      const radius = 1450;
      let best = null, bestDistance = Infinity;
      const consider = target => {
        if (!target?.alive || target.team === team || target.team === 'neutral') return;
        const d = dist(group, target);
        if (d < bestDistance) { bestDistance = d; best = target; }
      };
      try {
        for (const target of this.game.spatial?.queryRadius?.('units', group.x, group.y, radius) || []) consider(target);
        for (const target of this.game.spatial?.queryRadius?.('buildings', group.x, group.y, radius) || []) {
          if (target.stats?.weapon || target.typeId === 'hq' || target.typeId === 'commandCenter') consider(target);
        }
      } catch (_) {}
      return best;
    }

    updateCombatState(group) {
      if (this.game.time < group.nextCombatScanAt) return;
      group.nextCombatScanAt = this.game.time + COMBAT_SCAN_INTERVAL + (hash(group.id) % 7) * .01;
      const enemy = this.nearestEnemy(group);
      if (enemy) {
        if (this.game.time > group.combatUntil) metrics.combatActivations += 1;
        group.combatUntil = this.game.time + COMBAT_HOLD;
        group.lastCombatTargetId = enemy.id;
      }
    }

    exactCombat(group, dt) {
      group.exact = true;
      metrics.exactCombatSteps += 1;
      for (const member of group.members) {
        if (!member?.alive) continue;
        member._v164ExactUntil = Math.max(finite(member._v164ExactUntil), this.game.time + 1);
        member.update?.(dt);
        this.game.spatial?.update?.(member, 'units');
        this.game._v94SyncMini164?.(member);
      }
      const alive = group.members.filter(member => member?.alive);
      if (alive.length) {
        group.x = alive.reduce((sum, member) => sum + member.x, 0) / alive.length;
        group.y = alive.reduce((sum, member) => sum + member.y, 0) / alive.length;
      }
      return alive.length;
    }

    memberPoint(group, member, x, y, angle) {
      const local = group.offsets.get(member.id) || { forward: 0, lateral: 0 };
      const c = Math.cos(angle), s = Math.sin(angle);
      const radius = finite(member.radius, 6) + 4;
      return {
        x: clamp(x + c * local.forward - s * local.lateral, radius, WORLD.width - radius),
        y: clamp(y + s * local.forward + c * local.lateral, radius, WORLD.height - radius),
      };
    }

    moveMacro(group, dt) {
      group.exact = false;
      const goal = this.currentGoal(group);
      if (!goal) return 0;
      const route = this.routeFor(group, goal);
      let waypoint = route[Math.min(group.routeIndex, route.length - 1)] || goal;
      let dx = waypoint.x - group.x, dy = waypoint.y - group.y, distance = Math.hypot(dx, dy);
      if (distance < 85 && group.routeIndex < route.length - 1) {
        group.routeIndex += 1;
        waypoint = route[group.routeIndex];
        dx = waypoint.x - group.x; dy = waypoint.y - group.y; distance = Math.hypot(dx, dy);
      }
      const finalDistance = Math.hypot(goal.x - group.x, goal.y - group.y);
      if (finalDistance < 75) {
        if (group.commandType === 'patrol') {
          group.phase = !group.phase;
          for (const member of group.members) if (member.currentCommand?.type === 'patrol') member.currentCommand.phase = group.phase;
          group.routeKey = '';
          return group.members.length;
        }
        for (const member of group.members) {
          if (!member?.alive) continue;
          try { member.finishCommand?.(); }
          catch (_) { member.commandQueue?.shift?.(); }
        }
        return group.members.length;
      }
      if (distance < .001) return 0;
      const desiredAngle = Math.atan2(dy, dx);
      group.angle = angleApproach(group.angle, desiredAngle, dt * 4.2);
      const speed = Math.max(1, group.sharedSpeed);
      const step = Math.min(distance, speed * dt);
      const nx = group.x + dx / distance * step;
      const ny = group.y + dy / distance * step;

      // Sample only a small deterministic perimeter subset against static geometry.
      let blocked = false;
      const sampleCount = Math.min(8, group.members.length);
      for (let i = 0; i < sampleCount; i += 1) {
        const member = group.members[(i * Math.max(1, Math.floor(group.members.length / sampleCount))) % group.members.length];
        const point = this.memberPoint(group, member, nx, ny, group.angle);
        try {
          const ok = this.game.isNavigableUnitPoint133?.(member, point.x, point.y, group.angle, false);
          if (ok === false) { blocked = true; break; }
        } catch (_) {}
      }
      if (blocked) {
        group.routeKey = '';
        group.routeAt = -Infinity;
        return 0;
      }

      group.x = nx; group.y = ny; group.stepSeq += 1;
      const onScreen = this.game.isOnScreen?.(group.x, group.y, 700) !== false;
      if (!onScreen) metrics.offscreenSteps += 1;
      for (const member of group.members) {
        if (!member?.alive) continue;
        const point = this.memberPoint(group, member, group.x, group.y, group.angle);
        member._v9PrevX = member.x; member._v9PrevY = member.y; member._v9PrevRot = member.rotation;
        member.x = point.x; member.y = point.y; member.rotation = group.angle;
        member.renderX = point.x; member.renderY = point.y; member.renderRotation = group.angle;
        member.visualSpeed = speed; member.motionSpeed = speed; member.attemptedMove = true;
        member.lastPositionX = point.x; member.lastPositionY = point.y;
        member.weaponCooldown = Math.max(-12, finite(member.weaponCooldown) - dt);
        member._v164ExactUntil = Math.max(finite(member._v164ExactUntil), this.game.time + 1);
        if (((hash(member.id) + group.stepSeq) % SPATIAL_PHASES) === 0) {
          this.game.spatial?.update?.(member, 'units');
          this.game._v94SyncMini164?.(member);
          metrics.spatialUpdates += 1;
        }
      }
      metrics.sharedSteps += 1;
      metrics.individualUpdatesAvoided += group.members.length;
      metrics.individualPathfindAvoided += Math.max(0, group.members.length - 1);
      metrics.lastSharedSpeed = speed;
      return group.members.length;
    }

    step(dt) {
      const started = typeof performance !== 'undefined' ? performance.now() : 0;
      this.prepare();
      let updated = 0;
      for (const group of [...this.groups.values()]) {
        group.members = group.members.filter(member => eligible(this.game, member));
        if (group.members.length < MIN_GROUP) continue;
        group.sharedSpeed = Math.min(...group.members.map(effectiveSpeed));
        this.updateCombatState(group);
        if (this.game.time < group.combatUntil) updated += this.exactCombat(group, dt);
        else updated += this.moveMacro(group, dt);
      }
      metrics.groups = this.groups.size;
      metrics.members = this.memberToGroup.size;
      metrics.lastStepMs = started ? performance.now() - started : 0;
      return updated;
    }

    diagnostics() {
      return { version: VERSION, build: BUILD, ...metrics };
    }
  }

  function ensure184(game) {
    if (game._actionGroupManager184) return game._actionGroupManager184;
    const manager = new ActionGroupManager184(game);
    game._actionGroupManager184 = manager;
    manager.installCompanyBridge();
    return manager;
  }

  const baseSimulate184 = Game.prototype.simulateFixed;
  Game.prototype.simulateFixed = function(dt) {
    ensure184(this).prepare();
    return baseSimulate184.call(this, dt);
  };

  // Rendering is also group-aware: very large synchronized groups keep enough
  // individual silhouettes for readability, while excess members become one
  // existing strategic cluster draw instead of dozens of repeated sprite/UI draws.
  const baseSnapshot184 = Game.prototype.buildRenderSnapshotV9;
  if (typeof baseSnapshot184 === 'function') {
    Game.prototype.buildRenderSnapshotV9 = function(alpha) {
      const snapshot = baseSnapshot184.call(this, alpha);
      const manager = this._actionGroupManager184;
      if (!manager || !snapshot?.units?.length) return snapshot;
      const zoom = finite(this.camera?.zoom, 1);
      const detailedPerGroup = zoom >= 1.05 ? 36 : zoom >= .72 ? 26 : 18;
      const keep = [];
      const seenByGroup = new Map();
      const omitted = new Map();
      for (const unit of snapshot.units) {
        const group = manager.memberToGroup.get(unit.id);
        if (!group || group.members.length < 40) { keep.push(unit); continue; }
        const count = seenByGroup.get(group.id) || 0;
        if (count < detailedPerGroup || unit.selected || this.time - Math.max(unit.lastShotAt || -999, unit.lastDamagedAt || -999) < 1.2) {
          keep.push(unit); seenByGroup.set(group.id, count + 1);
        } else omitted.set(group.id, (omitted.get(group.id) || 0) + 1);
      }
      if (omitted.size) {
        snapshot.units.length = 0;
        snapshot.units.push(...keep);
        snapshot.clusters94 ||= [];
        for (const [id, count] of omitted) {
          const group = [...manager.groups.values()].find(item => item.id === id);
          if (!group || count <= 0) continue;
          const sample = group.members[0];
          snapshot.clusters94.push({
            team: sample.team, air: false, typeId: sample.typeId,
            x: group.x, y: group.y, count, hp: 1, rotation: group.angle,
          });
          metrics.renderMembersAvoided += count;
        }
      }
      return snapshot;
    };
  }

  Game.prototype.actionGroupDiagnostics184 = function() { return ensure184(this).diagnostics(); };
  root.__FD_ACTION_GROUP_184__ = { version: VERSION, build: BUILD, ensure: ensure184 };
})();
