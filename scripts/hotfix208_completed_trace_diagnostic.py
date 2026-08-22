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
                    type: 'completedTrace208', id: String(traceBuilding208.id), tick: Number(game.simTick) || 0,
                    time: Number(game.time) || 0, from: completedValue208, to: next208,
                    construction: Number(traceBuilding208.construction),
                    queue: (traceBuilding208.queue || []).map(item => ({ id:item.id, kind:item.kind, remaining:Number(item.remaining), total:Number(item.total) })),
                    stack: String(new Error('completed mutation 208').stack || '')
                  };
                  (self.__FD_COMPLETED_TRACE208__ ||= []).push(trace208);
                  postMessage(trace208);
                }
                completedValue208 = next208;
              }
            });
            Object.defineProperty(traceBuilding208, '__fdCompletedTrace208', { value:true, configurable:true });
          }
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
      if (this.completedTrace208.length > 32) this.completedTrace208.splice(0, this.completedTrace208.length - 32);
      return;
    }
    if (message.type === 'actionAck') {
"""
if bridge.count(old_ack) != 1:
    raise RuntimeError(f'build 208 completed trace bridge anchor count={bridge.count(old_ack)}')
bridge = bridge.replace(old_ack, new_ack, 1)
BRIDGE.write_text(bridge, 'utf-8')

print('Build 208 completed-state mutation trace installed')
