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

# Record the exact per-fixed-tick Money path without changing gameplay. The
# mismatch after an authoritative resync is sub-unit Money only, while RNG,
# positions and physical logistics are identical. Splitting TacticalAI's
# direct credit delta from the remainder tells us whether the divergence is in
# legacy enemy AI cadence or in another economy/support system.
trace_anchor = "function networkBaseComponents206() {\n"
if text.count(trace_anchor) != 1:
    raise RuntimeError(f'build 206 credit trace insertion anchor count={text.count(trace_anchor)}')
credit_trace = r"""
const baseAIUpdateCreditTrace206 = D.TacticalAI?.prototype?.update;
if (typeof baseAIUpdateCreditTrace206 === 'function' && !baseAIUpdateCreditTrace206.__fdCreditTrace206) {
  const wrappedAIUpdateCreditTrace206 = function(dt) {
    const game206 = this.game;
    const before206 = Number(game206?.teams?.enemy?.credits) || 0;
    const result206 = baseAIUpdateCreditTrace206.call(this, dt);
    const after206 = Number(game206?.teams?.enemy?.credits) || 0;
    const current206 = game206?.creditTraceCurrent206;
    if (current206) current206.enemyAIDelta = after206 - before206;
    return result206;
  };
  Object.defineProperty(wrappedAIUpdateCreditTrace206, '__fdCreditTrace206', { value: true });
  D.TacticalAI.prototype.update = wrappedAIUpdateCreditTrace206;
}

const baseSimulateCreditTrace206 = D.Game.prototype.simulateFixed;
if (typeof baseSimulateCreditTrace206 === 'function' && !baseSimulateCreditTrace206.__fdCreditTrace206) {
  const wrappedSimulateCreditTrace206 = function(dt) {
    const logistics206 = this.logistics206 || null;
    const beforePlayer206 = Number(this.teams?.player?.credits) || 0;
    const beforeEnemy206 = Number(this.teams?.enemy?.credits) || 0;
    const record206 = {
      tick: (Number(this.simTick) || 0) + 1,
      dt1e6: Math.round((Number(dt) || 0) * 1000000),
      playerBefore1e3: Math.round(beforePlayer206 * 1000),
      enemyBefore1e3: Math.round(beforeEnemy206 * 1000),
      enemyAIDelta: 0,
      incomeAccBefore1e6: Math.round((Number(logistics206?._incomeAccumulator206) || 0) * 1000000),
      importAccBefore1e6: Math.round((Number(logistics206?._importAccumulator206) || 0) * 1000000),
      supportSpentEnemyBefore1e3: Math.round((Number(logistics206?.team?.enemy?.supportSpent) || 0) * 1000),
      importSpentEnemyBefore1e3: Math.round((Number(logistics206?.team?.enemy?.importSpent) || 0) * 1000),
    };
    this.creditTraceCurrent206 = record206;
    try {
      return baseSimulateCreditTrace206.call(this, dt);
    } finally {
      const afterLogistics206 = this.logistics206 || null;
      const afterPlayer206 = Number(this.teams?.player?.credits) || 0;
      const afterEnemy206 = Number(this.teams?.enemy?.credits) || 0;
      record206.tick = Number(this.simTick) || record206.tick;
      record206.playerAfter1e3 = Math.round(afterPlayer206 * 1000);
      record206.enemyAfter1e3 = Math.round(afterEnemy206 * 1000);
      record206.playerDelta1e3 = Math.round((afterPlayer206 - beforePlayer206) * 1000);
      record206.enemyDelta1e3 = Math.round((afterEnemy206 - beforeEnemy206) * 1000);
      record206.enemyAIDelta1e3 = Math.round((Number(record206.enemyAIDelta) || 0) * 1000);
      record206.enemyOtherDelta1e3 = Math.round(((afterEnemy206 - beforeEnemy206) - (Number(record206.enemyAIDelta) || 0)) * 1000);
      record206.incomeAccAfter1e6 = Math.round((Number(afterLogistics206?._incomeAccumulator206) || 0) * 1000000);
      record206.importAccAfter1e6 = Math.round((Number(afterLogistics206?._importAccumulator206) || 0) * 1000000);
      record206.supportSpentEnemyAfter1e3 = Math.round((Number(afterLogistics206?.team?.enemy?.supportSpent) || 0) * 1000);
      record206.importSpentEnemyAfter1e3 = Math.round((Number(afterLogistics206?.team?.enemy?.importSpent) || 0) * 1000);
      delete this.creditTraceCurrent206;
      this.creditTrace206 ||= [];
      this.creditTrace206.push(record206);
      if (this.creditTrace206.length > 20) this.creditTrace206.splice(0, this.creditTrace206.length - 20);
    }
  };
  Object.defineProperty(wrappedSimulateCreditTrace206, '__fdCreditTrace206', { value: true });
  D.Game.prototype.simulateFixed = wrappedSimulateCreditTrace206;
}

"""
text = text.replace(trace_anchor, credit_trace + trace_anchor, 1)

old = "    units: byId(aliveUnits).map(fp), buildings: byId(aliveBuildings).map(fp),\n"
new = (
    "    units: byId(aliveUnits).map(fp), buildings: byId(aliveBuildings).map(fp),\n"
    "    aiLogisticsTrace206: game.__aiLogisticsTrace206 || null,\n"
    "    creditTrace206: Array.isArray(game.creditTrace206) ? game.creditTrace206.slice(-20) : [],\n"
    "    logisticsPrivate206: game.logistics206 ? {\n"
    "      incomeAccumulator1e6: Math.round((Number(game.logistics206._incomeAccumulator206) || 0) * 1000000),\n"
    "      importAccumulator1e6: Math.round((Number(game.logistics206._importAccumulator206) || 0) * 1000000),\n"
    "      enemySupportSpent1e3: Math.round((Number(game.logistics206.team?.enemy?.supportSpent) || 0) * 1000),\n"
    "      enemyImportSpent1e3: Math.round((Number(game.logistics206.team?.enemy?.importSpent) || 0) * 1000),\n"
    "    } : null,\n"
)
count = text.count(old)
if count != 1:
    raise RuntimeError(f'build 206 AI trace diagnostic anchor count={count}')
WORKER.write_text(text.replace(old, new, 1), 'utf-8')
print('Build 206 AI, command, movement and per-tick Money traces exposed in matched-tick diagnostics')
