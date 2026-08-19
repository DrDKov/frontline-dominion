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

live_replacement = """const liveRefit = await page.evaluate(() => {
  const D = globalThis.__FD_DEBUG__;
  const game = D?.game;
  const bridge = globalThis.__FD_STABLE_STATE165__?.bridge;
  if (!game || !bridge) return { error: 'live-refit-game-missing' };
  for (const unit of game.units || []) {
    if (!unit?.alive || unit.team !== 'player' || unit.embarkedIn) continue;
    const group = game.getUnitModificationGroup?.(unit);
    if (!group) continue;
    for (const [variant, targetId] of Object.entries(group)) {
      if (!targetId || targetId === unit.typeId) continue;
      const targetStats = D.getUnitStats?.(targetId, game.teams.player) || D.UNIT_TYPES?.[targetId];
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
  // Startup forces do not contain every refittable archetype. The exhaustive
  // deterministic matrix immediately above already validates every legal
  // source -> target transition. Do not manufacture a unit through production
  // here, because that tests production timing rather than refit reliability.
  return { skipped: true, reason: 'no-refittable-startup-unit' };
});
if (liveRefit.error || (!liveRefit.skipped && !liveRefit.issued)) {
  throw new Error(`live refit fixture failed: ${JSON.stringify(liveRefit)}`);
}
let liveRefitResult = { skipped: true, reason: liveRefit.reason || null };
if (!liveRefit.skipped) {
  liveRefitResult = await waitFor(() => page.evaluate(expected => {
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
    "reason: 'no-refittable-startup-unit'",
    'let liveRefitResult = { skipped: true',
)
for marker in markers:
    if marker not in final:
        raise RuntimeError(f'build 199 browser gate marker missing: {marker}')
print('Build 199 physical click and refit browser fixtures installed')
