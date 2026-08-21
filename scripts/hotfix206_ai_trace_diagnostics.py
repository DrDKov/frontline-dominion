from pathlib import Path

WORKER = Path('dist/authoritative-simulation-worker-v174.js')
if not WORKER.exists():
    raise RuntimeError(f'build 206 AI trace target missing: {WORKER}')

text = WORKER.read_text('utf-8')

fp_old = """  const fp = item => ({
    id: String(item.id), team: canonicalTeamCode(item.team),
    x: Math.round((Number(item.x) || 0) * 4), y: Math.round((Number(item.y) || 0) * 4),
    hp: Math.round((Number(item.hp) || 0) * 10), command: item.currentCommand?.type || ''
  });
"""
fp_new = """  const fp = item => {
    const c = item.currentCommand || {};
    const p = c.target || c.point || c.destination || c.position || {};
    const firstNumber = (...values) => {
      for (const value of values) if (Number.isFinite(Number(value))) return Number(value);
      return null;
    };
    const cx = firstNumber(c.x, c.targetX, c.buildX, c.destinationX, p.x);
    const cy = firstNumber(c.y, c.targetY, c.buildY, c.destinationY, p.y);
    const commandDetail = {
      type: c.type || '',
      x1000: cx == null ? null : Math.round(cx * 1000),
      y1000: cy == null ? null : Math.round(cy * 1000),
      targetId: String(c.targetId ?? c.entityId ?? c.target?.id ?? ''),
      buildType: String(c.buildingType ?? c.structureType ?? c.buildType ?? c.typeId ?? c.payload?.typeId ?? ''),
      phase: String(c.phase ?? c.state ?? ''),
    };
    return {
      id: String(item.id), team: canonicalTeamCode(item.team),
      x: Math.round((Number(item.x) || 0) * 4), y: Math.round((Number(item.y) || 0) * 4),
      hp: Math.round((Number(item.hp) || 0) * 10), command: c.type || '', commandDetail,
      supply160: Math.round((Number(item.supply160) || 0) * 1000000),
      speed1000: Math.round((Number(item.speedCurrent) || 0) * 1000),
      velocityX1000: Math.round((Number(item.velocityX) || 0) * 1000),
      velocityY1000: Math.round((Number(item.velocityY) || 0) * 1000),
    };
  };
"""
count = text.count(fp_old)
if count != 1:
    raise RuntimeError(f'build 206 command fingerprint anchor count={count}')
text = text.replace(fp_old, fp_new, 1)

old = "    units: byId(aliveUnits).map(fp), buildings: byId(aliveBuildings).map(fp),\n"
new = (
    "    units: byId(aliveUnits).map(fp), buildings: byId(aliveBuildings).map(fp),\n"
    "    aiLogisticsTrace206: game.__aiLogisticsTrace206 || null,\n"
)
count = text.count(old)
if count != 1:
    raise RuntimeError(f'build 206 AI trace diagnostic anchor count={count}')
WORKER.write_text(text.replace(old, new, 1), 'utf-8')
print('Build 206 AI trace, command targets and movement state exposed in matched-tick diagnostics')
