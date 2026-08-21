(() => {
  'use strict';
  const root = typeof window !== 'undefined' ? window : self;
  const L = root.__FD_LOGISTICS206__;
  const D = root.__FD_DEBUG__;
  if (!L || !D?.Building || !D?.Game) return;
  const { Building, Game } = D;
  if (Game.prototype.__fdProductionLogistics206Installed) return;
  Object.defineProperty(Game.prototype, '__fdProductionLogistics206Installed', { value: true, configurable: true });

  function statsFor206(building, typeId) {
    try { return D.getUnitStats?.(typeId, building.game.teams?.[building.team]) || D.UNIT_TYPES?.[typeId] || null; }
    catch (_) { return D.UNIT_TYPES?.[typeId] || null; }
  }

  function readyLoad206(stats, text) {
    if (!stats.weapon) return 0;
    const declared = Number(stats.magazineCapacity);
    if (Number.isFinite(declared) && declared > 0) return Math.max(1, Math.floor(declared));
    if (stats.infantry || /infantry|пехот/.test(text)) return 30;
    if (/artillery|howitzer|mlrs|артилл|рсзо/.test(text)) return 6;
    if (/missile|sam|abm|rocket|пво|про/.test(text)) return 4;
    return 12;
  }

  function packageFor206(building, typeId) {
    const stats = statsFor206(building, typeId) || {};
    const cost = Math.max(0, Number(stats.cost) || 0);
    const text = `${typeId || ''} ${stats.role || ''} ${stats.visualRole || ''}`.toLowerCase();
    const air = Boolean(stats.air);
    const helicopter = air && /helicopter|gunship|rotary/.test(text);
    const truck = typeId === 'resourceTruck' || Boolean(stats.resourceHauler);
    const vehicle = truck || Boolean(stats.vehicle) || /tank|vehicle|armor|apc|ifv|mobile|самоход|танк|броне/.test(text);

    let fuel = 0;
    if (truck) fuel = 720;
    else if (air) fuel = helicopter ? 420 : 320;
    else if (vehicle) fuel = Math.max(600, Math.min(1800, cost * .55));

    const ready = readyLoad206(stats, text);
    const ammo = air ? ready : ready * (
      /artillery|howitzer|mlrs|артилл|рсзо/.test(text) ? 5 :
      /missile|sam|abm|rocket|пво|про/.test(text) ? 4 : 6
    );
    const support = air ? 120 : vehicle ? 180 : (stats.infantry || /infantry|пехот/.test(text)) ? 95 : 45;
    return { fuel: L.round(fuel), ammo: L.round(ammo), support: L.round(support) };
  }

  function hasPackage206(node, pkg) {
    return Boolean(node?.stock && L.STOCK_KEYS.every(key =>
      (Number(node.stock[key]) || 0) + 1e-6 >= (Number(pkg[key]) || 0)));
  }

  function deductPackage206(node, pkg) {
    if (!hasPackage206(node, pkg)) return false;
    for (const key of L.STOCK_KEYS) node.stock[key] = L.round(Number(node.stock[key]) - Number(pkg[key] || 0));
    return true;
  }

  const previousQueueUpdate206 = Building.prototype.updateQueue;
  if (typeof previousQueueUpdate206 === 'function') Building.prototype.updateQueue = function(dt) {
    const head = this.queue?.[0];
    if (this.completed && head?.kind === 'unit') {
      const node = L.ensureNode(this);
      if (node) {
        const pkg = packageFor206(this, head.id);
        this.logistics206.productionDemand206 = pkg;
        if (!hasPackage206(node, pkg)) {
          this.logistics206.productionBlocked206 = true;
          if (this.logistics206.priority === 'LOW') this.logistics206.priority = 'NORMAL';
          return;
        }
        this.logistics206.productionBlocked206 = false;
      }
    }
    return previousQueueUpdate206.call(this, dt);
  };

  const previousSpawn206 = Building.prototype.spawnUnit;
  if (typeof previousSpawn206 === 'function') Building.prototype.spawnUnit = function(typeId) {
    const node = L.ensureNode(this);
    const pkg = packageFor206(this, typeId);
    if (node && !hasPackage206(node, pkg)) {
      this.logistics206.productionBlocked206 = true;
      return false;
    }

    const before = new Set((this.game.units || []).map(unit => unit.id));
    const result = previousSpawn206.call(this, typeId);
    const spawned = (this.game.units || [])
      .filter(unit => unit?.alive && !before.has(unit.id))
      .sort((a, b) => String(a.id).localeCompare(String(b.id), 'en'))[0];
    if (!spawned) return result;

    const sustainment = L.ensureUnit(spawned, true);
    if (L.isTruck(spawned) && sustainment.fuelMax <= 0) {
      sustainment.fuelMax = 720;
      sustainment.fuel = 720;
    }
    const actual = {
      fuel: sustainment.fuel,
      ammo: sustainment.ammoReady + sustainment.ammoReserve,
      support: sustainment.support,
    };
    const paid = {
      fuel: Math.max(pkg.fuel, actual.fuel),
      ammo: Math.max(pkg.ammo, actual.ammo),
      support: Math.max(pkg.support, actual.support),
    };

    if (node && !deductPackage206(node, paid)) {
      // A modded unit can exceed the preflight estimate. Never let that create
      // free physical stores: remove the just-created unit instead.
      spawned.alive = false;
      this.game.removeEntity?.(spawned);
      this.logistics206.productionBlocked206 = true;
      return false;
    }

    this.logistics206.productionBlocked206 = false;
    this.game.logisticsEvent206?.('unit-equipped', { buildingId: this.id, unitId: spawned.id, typeId, package: paid });
    return result;
  };

  Game.prototype.productionMaterialPackage206 = function(building, typeId) {
    return packageFor206(building, typeId);
  };
  root.__FD_PRODUCTION_LOGISTICS206__ = { version: '20.6', packageFor206 };
})();
