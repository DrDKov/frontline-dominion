from pathlib import Path

WORKER = Path('dist/authoritative-simulation-worker-v174.js')
BRIDGE = Path('dist/authoritative-simulation-v174.js')
for path in (WORKER, BRIDGE):
    if not path.exists():
        raise RuntimeError(f'build 208 completed trace input missing: {path}')

worker = WORKER.read_text('utf-8')
old_case = "      case 'logisticsCreateTransport': result = game.createSupplyTransport206?.(plainClone(payload)) ?? false; break;"
new_case = """      case 'logisticsCreateTransport': {
        const traceBuilding208 = game.getEntity?.(payload.buildingId || payload.homeNodeId);
        if (traceBuilding208 && !traceBuilding208.__fdCompletedTrace208) {
          const descriptor208 = Object.getOwnPropertyDescriptor(traceBuilding208, 'completed');
          if (!descriptor208 || descriptor208.configurable) {
            let completedValue208 = traceBuilding208.completed;
            Object.defineProperty(traceBuilding208, 'completed', {
              configurable: true,
              enumerable: descriptor208?.enumerable ?? true,
              get() { return completedValue208; },
              set(next208) {
                if (next208 !== completedValue208) {
                  const trace208 = {
                    type: 'completedTrace208', subtype: 'completed-mutation', id: String(traceBuilding208.id),
                    tick: Number(game.simTick) || 0, time: Number(game.time) || 0,
                    from: completedValue208, to: next208, construction: Number(traceBuilding208.construction),
                    queue: (traceBuilding208.queue || []).map(item => ({ id:item.id, kind:item.kind, remaining:Number(item.remaining), total:Number(item.total) })),
                    stack: String(new Error('completed mutation 208').stack || '')
                  };
                  (self.__FD_COMPLETED_TRACE208__ ||= []).push(trace208);
                  postMessage(trace208);
                }
                completedValue208 = next208;
              }
            });
          }

          const previousUpdateQueue208 = traceBuilding208.updateQueue;
          if (typeof previousUpdateQueue208 === 'function') {
            let queueTraceCount208 = 0;
            traceBuilding208.updateQueue = function(dt208) {
              const beforeHead208 = this.queue?.[0];
              const beforeRemaining208 = Number(beforeHead208?.remaining);
              const beforeSnapshot208 = beforeHead208 ? {
                id: beforeHead208.id, kind: beforeHead208.kind,
                remaining: beforeRemaining208, total: Number(beforeHead208.total)
              } : null;
              let result208;
              let error208 = null;
              try { result208 = previousUpdateQueue208.call(this, dt208); }
              catch (error) { error208 = String(error?.stack || error); throw error; }
              finally {
                const afterHead208 = this.queue?.[0];
                const afterRemaining208 = Number(afterHead208?.remaining);
                const changed208 = Number.isFinite(beforeRemaining208) && Number.isFinite(afterRemaining208) && Math.abs(afterRemaining208 - beforeRemaining208) > 1e-9;
                if (queueTraceCount208 < 16 || changed208 || error208) {
                  queueTraceCount208 += 1;
                  const node208 = self.__FD_LOGISTICS206__?.ensureNode?.(this);
                  const trace208 = {
                    type: 'completedTrace208', subtype: 'queue-update', id: String(this.id),
                    tick: Number(game.simTick) || 0, time: Number(game.time) || 0,
                    dt: Number(dt208), completed: Boolean(this.completed), construction: Number(this.construction),
                    powered: this.powered !== false, powerFactor: Number(game.powerFactor),
                    before: beforeSnapshot208,
                    after: afterHead208 ? { id:afterHead208.id, kind:afterHead208.kind, remaining:afterRemaining208, total:Number(afterHead208.total) } : null,
                    stock: node208?.stock ? { fuel:Number(node208.stock.fuel), ammo:Number(node208.stock.ammo), support:Number(node208.stock.support) } : null,
                    blocked: Boolean(this.logistics206?.productionBlocked206),
                    demand: this.logistics206?.productionDemand206 ? { ...this.logistics206.productionDemand206 } : null,
                    error: error208
                  };
                  (self.__FD_COMPLETED_TRACE208__ ||= []).push(trace208);
                  postMessage(trace208);
                }
              }
              return result208;
            };
          }
          Object.defineProperty(traceBuilding208, '__fdCompletedTrace208', { value:true, configurable:true });
        }
        result = game.createSupplyTransport206?.(plainClone(payload)) ?? false;
        break;
      }"""
if worker.count(old_case) != 1:
    raise RuntimeError(f'build 208 completed trace Worker action anchor count={worker.count(old_case)}')
worker = worker.replace(old_case, new_case, 1)
WORKER.write_text(worker, 'utf-8')

bridge = BRIDGE.read_text('utf-8')
old_ack = "    if (message.type === 'actionAck') {\n"
new_ack = """    if (message.type === 'completedTrace208') {
      this.completedTrace208 ||= [];
      this.completedTrace208.push(clonePlain(message));
      if (this.completedTrace208.length > 64) this.completedTrace208.splice(0, this.completedTrace208.length - 64);
      return;
    }
    if (message.type === 'actionAck') {
"""
if bridge.count(old_ack) != 1:
    raise RuntimeError(f'build 208 completed trace bridge anchor count={bridge.count(old_ack)}')
bridge = bridge.replace(old_ack, new_ack, 1)
BRIDGE.write_text(bridge, 'utf-8')

print('Build 208 completed-state and production-queue trace installed')
