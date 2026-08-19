from pathlib import Path

path = Path('tests/reliability199.mjs')
if not path.exists():
    raise RuntimeError('build 199 reliability test is missing')

text = path.read_text('utf-8')

empty_anchor = """      if (game.hitTest?.(world.x, world.y, true)) continue;
      return {
        before,
        world,
        cssX: rect.left + sx * rect.width / canvas.width,
        cssY: rect.top + sy * rect.height / canvas.height,
      };
"""
empty_replacement = """      if (game.hitTest?.(world.x, world.y, true)) continue;
      const cssX = rect.left + sx * rect.width / canvas.width;
      const cssY = rect.top + sy * rect.height / canvas.height;
      // The canvas is partially covered by HUD panels. A coordinate can be
      // empty in world space yet physically click an overlay instead of the
      // battlefield; require the real browser hit target to be the canvas.
      if (document.elementFromPoint(cssX, cssY) !== canvas) continue;
      return { before, world, cssX, cssY };
"""
if text.count(empty_anchor) != 1:
    raise RuntimeError('build 199 physical empty-click fixture anchor count invalid')
text = text.replace(empty_anchor, empty_replacement, 1)

live_anchor = """const liveRefit = await page.evaluate(() => {
  const game = globalThis.__FD_DEBUG__?.game;
  const bridge = globalThis.__FD_STABLE_STATE165__?.bridge;
  if (!game || !bridge) return { error: 'live-refit-game-missing' };
  for (const unit of game.units || []) {
    if (!unit?.alive || unit.team !== 'player' || unit.embarkedIn) continue;
    const group = game.getUnitModificationGroup?.(unit);
    if (!group) continue;
    for (const [variant, targetId] of Object.entries(group)) {
      if (!targetId || targetId === unit.typeId) continue;
      const targetStats = globalThis.__FD_DEBUG__?.getUnitStats?.(targetId, game.teams.player) || globalThis.__FD_DEBUG__?.UNIT_TYPES?.[targetId];
      if (!targetStats || !game.requirementsMet?.('player', targetStats.requires || [], targetStats.rank || 1)) continue;
      const cost = game.getUnitModificationCost?.(unit, variant) || 0;
      if (game.teams.player.credits < cost) continue;
      game.setSelection?.([unit], false);
      const beforeSeq = Number(bridge.seq || 0);
      const beforeErrors = Number(bridge.actionErrors || 0);
      const issued = game.applyUnitModification?.(unit, variant, false) !== false;
      return { id: unit.id, beforeType: unit.typeId, targetId, variant, issued, beforeSeq, beforeErrors, expectedRadius: Number(targetStats.radius) };
    }
  }
  return { error: 'live-refit-candidate-missing' };
});
if (liveRefit.error || !liveRefit.issued) throw new Error(`live refit fixture failed: ${JSON.stringify(liveRefit)}`);
const liveRefitResult = await waitFor(() => page.evaluate(expected => {
  const game = globalThis.__FD_DEBUG__?.game;
  const bridge = globalThis.__FD_STABLE_STATE165__?.bridge;
  const unit = game?.getEntity?.(expected.id);
  if (!game || !bridge || !unit || Number(bridge.lastAck || 0) <= expected.beforeSeq || unit.typeId !== expected.targetId) return null;
  return {
    typeId: unit.typeId,
    radius: Number(unit.radius),
    expectedRadius: expected.expectedRadius,
    ack: Number(bridge.lastAck || 0),
    errorDelta: Number(bridge.actionErrors || 0) - expected.beforeErrors,
    bridgeFailed: Boolean(bridge.failed),
  };
}, liveRefit), 12000);
if (liveRefitResult.bridgeFailed || liveRefitResult.errorDelta || liveRefitResult.radius !== liveRefitResult.expectedRadius) {
  throw new Error(`authoritative Worker refit failed: ${JSON.stringify({ liveRefit, liveRefitResult })}`);
}
"""

live_replacement = """const locateRefitTarget = unit => {
  const D = globalThis.__FD_DEBUG__;
  const game = D?.game;
  const group = game?.getUnitModificationGroup?.(unit);
  if (!group) return null;
  for (const [variant, targetId] of Object.entries(group)) {
    if (!targetId || targetId === unit.typeId) continue;
    const targetStats = D.getUnitStats?.(targetId, game.teams.player) || D.UNIT_TYPES?.[targetId];
    if (!targetStats || !game.requirementsMet?.('player', targetStats.requires || [], targetStats.rank || 1)) continue;
    const cost = game.getUnitModificationCost?.(unit, variant) || 0;
    if (game.teams.player.credits < cost) continue;
    return { variant, targetId, targetStats, cost };
  }
  return null;
};

const liveRefitPreparation = await page.evaluate(() => {
  const D = globalThis.__FD_DEBUG__;
  const game = D?.game;
  const bridge = globalThis.__FD_STABLE_STATE165__?.bridge;
  if (!game || !bridge) return { error: 'live-refit-game-missing' };

  const targetFor = unit => {
    const group = game.getUnitModificationGroup?.(unit);
    if (!group) return null;
    for (const [variant, targetId] of Object.entries(group)) {
      if (!targetId || targetId === unit.typeId) continue;
      const targetStats = D.getUnitStats?.(targetId, game.teams.player) || D.UNIT_TYPES?.[targetId];
      if (!targetStats || !game.requirementsMet?.('player', targetStats.requires || [], targetStats.rank || 1)) continue;
      const cost = game.getUnitModificationCost?.(unit, variant) || 0;
      if (game.teams.player.credits < cost) continue;
      return { variant, targetId, expectedRadius: Number(targetStats.radius), cost };
    }
    return null;
  };

  const issue = (unit, target, source = 'existing') => {
    game.setSelection?.([unit], false);
    const beforeType = unit.typeId;
    const beforeSeq = Number(bridge.seq || 0);
    const beforeErrors = Number(bridge.actionErrors || 0);
    const issued = game.applyUnitModification?.(unit, target.variant, false) !== false;
    return {
      mode: 'issued', source, id: unit.id, beforeType,
      targetId: target.targetId, variant: target.variant,
      issued, beforeSeq, beforeErrors,
      expectedRadius: target.expectedRadius,
    };
  };

  for (const unit of game.units || []) {
    if (!unit?.alive || unit.team !== 'player' || unit.embarkedIn) continue;
    const target = targetFor(unit);
    if (target) return issue(unit, target);
  }

  // The default starting garrison does not necessarily contain a modifiable
  // archetype. In that case, produce the cheapest currently available standard
  // unit with a legal target variant through the authoritative Worker, then
  // refit that real unit in the next phase.
  const beforeIds = (game.units || []).map(unit => unit.id);
  const candidates = [];
  for (const building of game.buildings || []) {
    if (!building?.alive || building.team !== 'player' || building.completed === false || building.buildProgress < 1) continue;
    if (building.queue?.length) continue;
    for (const sourceId of building.stats?.produces || []) {
      const sourceStats = D.getUnitStats?.(sourceId, game.teams.player) || D.UNIT_TYPES?.[sourceId];
      if (!sourceStats || !game.requirementsMet?.('player', sourceStats.requires || [], sourceStats.rank || 1)) continue;
      const probe = {
        alive: true, kind: 'unit', team: 'player', typeId: sourceId,
        stats: sourceStats, rank: 1, game,
      };
      const target = targetFor(probe);
      if (!target) continue;
      const totalCost = Number(sourceStats.cost || 0) + Number(target.cost || 0);
      if (game.teams.player.credits < totalCost) continue;
      candidates.push({ building, sourceId, sourceStats, target, totalCost });
    }
  }
  candidates.sort((left, right) => left.totalCost - right.totalCost || Number(left.sourceStats.time || 0) - Number(right.sourceStats.time || 0));
  const candidate = candidates[0];
  if (!candidate) {
    return {
      error: 'live-refit-production-candidate-missing',
      rank: game.teams.player.rank,
      credits: game.teams.player.credits,
      production: (game.buildings || []).filter(item => item?.alive && item.team === 'player').map(item => ({
        id: item.id, typeId: item.typeId, completed: item.completed,
        produces: [...(item.stats?.produces || [])], queue: item.queue?.length || 0,
      })),
    };
  }

  game.setSelection?.([candidate.building], false);
  const beforeSeq = Number(bridge.seq || 0);
  const beforeErrors = Number(bridge.actionErrors || 0);
  const issued = game.queueProduction?.(candidate.building, candidate.sourceId, 'unit', false) !== false;
  return {
    mode: 'produce', issued,
    buildingId: candidate.building.id,
    sourceId: candidate.sourceId,
    targetId: candidate.target.targetId,
    variant: candidate.target.variant,
    expectedRadius: candidate.target.expectedRadius,
    beforeIds, beforeSeq, beforeErrors,
    productionTime: Number(candidate.sourceStats.time || 0),
    totalCost: candidate.totalCost,
  };
});
if (liveRefitPreparation.error || !liveRefitPreparation.issued) {
  throw new Error(`live refit preparation failed: ${JSON.stringify(liveRefitPreparation)}`);
}

let liveRefit = liveRefitPreparation;
if (liveRefitPreparation.mode === 'produce') {
  const producedUnit = await waitFor(() => page.evaluate(expected => {
    const game = globalThis.__FD_DEBUG__?.game;
    const bridge = globalThis.__FD_STABLE_STATE165__?.bridge;
    if (!game || !bridge || bridge.failed || Number(bridge.lastAck || 0) <= expected.beforeSeq) return null;
    const previous = new Set(expected.beforeIds || []);
    const unit = (game.units || []).find(item =>
      item?.alive && item.team === 'player' && item.typeId === expected.sourceId && !previous.has(item.id),
    );
    if (!unit) return null;
    return { id: unit.id, typeId: unit.typeId, x: unit.x, y: unit.y };
  }, liveRefitPreparation), Math.max(30000, (liveRefitPreparation.productionTime + 12) * 1800), 120);

  liveRefit = await page.evaluate(({ preparation, producedUnit }) => {
    const D = globalThis.__FD_DEBUG__;
    const game = D?.game;
    const bridge = globalThis.__FD_STABLE_STATE165__?.bridge;
    const unit = game?.getEntity?.(producedUnit.id);
    if (!game || !bridge || !unit) return { error: 'produced-refit-unit-missing' };
    const targetStats = D.getUnitStats?.(preparation.targetId, game.teams.player) || D.UNIT_TYPES?.[preparation.targetId];
    if (!targetStats) return { error: 'produced-refit-target-missing' };
    game.setSelection?.([unit], false);
    const beforeType = unit.typeId;
    const beforeSeq = Number(bridge.seq || 0);
    const beforeErrors = Number(bridge.actionErrors || 0);
    const issued = game.applyUnitModification?.(unit, preparation.variant, false) !== false;
    return {
      mode: 'issued', source: 'production', id: unit.id, beforeType,
      targetId: preparation.targetId, variant: preparation.variant,
      issued, beforeSeq, beforeErrors,
      expectedRadius: Number(targetStats.radius),
      production: preparation,
    };
  }, { preparation: liveRefitPreparation, producedUnit });
}

if (liveRefit.error || liveRefit.mode !== 'issued' || !liveRefit.issued) {
  throw new Error(`live refit fixture failed: ${JSON.stringify(liveRefit)}`);
}
const liveRefitResult = await waitFor(() => page.evaluate(expected => {
  const game = globalThis.__FD_DEBUG__?.game;
  const bridge = globalThis.__FD_STABLE_STATE165__?.bridge;
  const unit = game?.getEntity?.(expected.id);
  if (!game || !bridge || !unit || Number(bridge.lastAck || 0) <= expected.beforeSeq || unit.typeId !== expected.targetId) return null;
  return {
    typeId: unit.typeId,
    radius: Number(unit.radius),
    expectedRadius: expected.expectedRadius,
    ack: Number(bridge.lastAck || 0),
    errorDelta: Number(bridge.actionErrors || 0) - expected.beforeErrors,
    bridgeFailed: Boolean(bridge.failed),
  };
}, liveRefit), 15000, 100);
if (liveRefitResult.bridgeFailed || liveRefitResult.errorDelta || liveRefitResult.radius !== liveRefitResult.expectedRadius) {
  throw new Error(`authoritative Worker refit failed: ${JSON.stringify({ liveRefit, liveRefitResult })}`);
}
"""

if text.count(live_anchor) != 1:
    raise RuntimeError('build 199 live Worker refit fixture anchor count invalid')
text = text.replace(live_anchor, live_replacement, 1)
path.write_text(text, 'utf-8')

final = path.read_text('utf-8')
markers = (
    'document.elementFromPoint(cssX, cssY) !== canvas',
    'return { before, world, cssX, cssY }',
    'live-refit-production-candidate-missing',
    "game.queueProduction?.(candidate.building, candidate.sourceId, 'unit', false)",
    "source: 'production'",
)
for marker in markers:
    if marker not in final:
        raise RuntimeError(f'build 199 browser gate marker missing: {marker}')
print('Build 199 physical click and authoritative production/refit browser fixtures installed')
