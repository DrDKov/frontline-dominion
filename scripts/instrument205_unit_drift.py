from pathlib import Path

BUILD = 205
path = Path('dist/authoritative-simulation-worker-v174.js')
if not path.exists():
    raise RuntimeError(f'build {BUILD} authoritative Worker missing: {path}')

text = path.read_text('utf-8')
if 'unitDriftHistory205' in text:
    print('Build 205 unit drift diagnostics already instrumented')
    raise SystemExit(0)

state_anchor = """let networkHashInputHistory205 = [];
"""
state_replacement = """let networkHashInputHistory205 = [];
let unitDriftHistory205 = [];

function traceUnitDrift205(unit) {
  const record = {
    id: String(unit?.id || ''),
    team: unit?.team || null,
    typeId: unit?.typeId || null,
    x: Number(unit?.x), y: Number(unit?.y),
    rotation: Number(unit?.rotation),
    lod: game?.unitSimLodV9 ? Number(game.unitSimLodV9(unit)) : null,
    command: plainClone(unit?.currentCommand || null),
  };
  const relevant = /(^(?:v[xy]|d[xy]|speed|currentSpeed|moveSpeed|accel|decel|pathIndex|pathCursor|waypointIndex|targetX|targetY|moveTargetX|moveTargetY|stuckTime|stuckTicks|lastMoveTick|lastPathTick|simTick|lastSimTick)$|path|waypoint|avoid|collision|stuck|velocity|steer|moveTarget|pathTarget|nav)/i;
  for (const [key, value] of Object.entries(unit || {})) {
    if (key in record || !relevant.test(key)) continue;
    if (value == null || typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') {
      record[key] = typeof value === 'number' && !Number.isFinite(value) ? null : value;
    } else if (Array.isArray(value) && value.length <= 32) {
      record[key] = plainClone(value);
    }
  }
  return record;
}

function recordUnitDrift205() {
  if (!multiplayer.active || !game || game.simTick > 48) return;
  const watched = game.units
    .filter(unit => unit?.alive && unit.team === 'enemy' && (unit.currentCommand || /^e1[4-8]$/.test(String(unit.id || ''))))
    .slice(0, 12)
    .map(traceUnitDrift205);
  unitDriftHistory205.push({ tick: Number(game.simTick || 0), time: Number(game.time || 0), units: watched });
  if (unitDriftHistory205.length > 56) unitDriftHistory205.splice(0, unitDriftHistory205.length - 56);
}
"""
if text.count(state_anchor) != 1:
    raise RuntimeError('build 205 unit drift diagnostic state anchor missing')
text = text.replace(state_anchor, state_replacement, 1)

run_anchor = """    } else core.update(SIM_DT);
  }
  ticksExecuted += 1;
"""
run_replacement = """    } else core.update(SIM_DT);
  }
  recordUnitDrift205();
  ticksExecuted += 1;
"""
if text.count(run_anchor) != 1:
    raise RuntimeError('build 205 unit drift runTick anchor missing')
text = text.replace(run_anchor, run_replacement, 1)

reset_anchor = """  lastHashTick = -1; lastNetworkHashTick = -1; lastNetworkHash = '00000000'; networkHashInputHistory205 = [];
"""
reset_replacement = """  lastHashTick = -1; lastNetworkHashTick = -1; lastNetworkHash = '00000000'; networkHashInputHistory205 = []; unitDriftHistory205 = [];
"""
if text.count(reset_anchor) != 1:
    raise RuntimeError('build 205 unit drift reset anchor missing')
text = text.replace(reset_anchor, reset_replacement, 1)

diag_anchor = """        networkHashInputHistory205: networkHashInputHistory205.map(entry => ({
          ...entry,
          entities: entry.entities.map(tuple => [...tuple]),
          projectiles: entry.projectiles.map(tuple => [...tuple]),
        })),
"""
diag_replacement = diag_anchor + """        unitDriftHistory205: unitDriftHistory205.map(entry => ({
          tick: entry.tick, time: entry.time,
          units: entry.units.map(unit => plainClone(unit)),
        })),
"""
if text.count(diag_anchor) != 1:
    raise RuntimeError('build 205 unit drift diagnostics response anchor missing')
text = text.replace(diag_anchor, diag_replacement, 1)

path.write_text(text, 'utf-8')
print('Build 205 per-tick enemy worker movement drift instrumented')
