// requires: __FD_DEBUG__, __FD_LOGISTICS206__
// provides: __FD_LOGISTICS_SERVICE_REPLAN__
(() => {
  'use strict';
  const root = typeof window !== 'undefined' ? window : self;
  const D = root.__FD_DEBUG__, L = root.__FD_LOGISTICS206__;
  if (!D?.Unit || !L || root.__FD_LOGISTICS_SERVICE_REPLAN__) return;
  const Unit = D.Unit, EPS = 1e-6;
  const baseProcessCommand = Unit.prototype.processCommand;

  Unit.prototype.processCommand = function(command, dt) {
    const isLogisticsTruck = command?.type === 'logistics206' && L.isTruck?.(this);
    const s = isLogisticsTruck ? L.ensureUnit(this, false) : null;
    const beforePhase = s?.phase206;
    const beforeCargo = s ? Number(L.manifestTotal(s.cargo)) || 0 : 0;
    const result = baseProcessCommand.call(this, command, dt);
    if (!s) return result;

    const afterCargo = Number(L.manifestTotal(s.cargo)) || 0;
    const progressed = afterCargo < beforeCargo - EPS;
    if (s.phase206 !== 'SERVICE') {
      s._serviceNoProgress206 = 0;
      return result;
    }
    if (progressed || beforePhase !== 'SERVICE') {
      s._serviceNoProgress206 = 0;
      return result;
    }

    const threshold = Math.min(300, Math.max(1, (Number(s.cargoCapacity) || 0) * .08));
    if (afterCargo <= threshold + EPS) {
      s._serviceNoProgress206 = 0;
      return result;
    }

    s._serviceNoProgress206 = Math.max(0, Number(s._serviceNoProgress206) || 0) + Math.max(0, Number(dt) || 0);
    if (s._serviceNoProgress206 < .8) return result;

    s._serviceNoProgress206 = 0;
    s.phase206 = 'PLAN';
    s.status = 'REPLAN_SERVICE';
    s.waitUntil206 = 0;
    s.plannedDemand206 = null;
    s._serviceReplans206 = (Number(s._serviceReplans206) || 0) + 1;
    this.invalidateNavigation?.();
    this.game?.logisticsEvent206?.('service-replan', {
      truckId: this.id,
      mission: s.missionType,
      cargo: L.copyManifest?.(s.cargo) || { ...s.cargo },
      reason: 'NO_DELIVERABLE_PROGRESS',
    });
    return result;
  };

  root.__FD_LOGISTICS_SERVICE_REPLAN__ = Object.freeze({
    serviceReplanOnUndeliverable:true,
    preservesMission:true,
    preservesCargo:true,
    deterministicNoProgressWindow:.8,
  });
})();
