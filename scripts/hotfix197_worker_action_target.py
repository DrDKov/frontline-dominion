from pathlib import Path

OUT = Path('dist')
module_path = OUT / 'formation-target-fidelity-v197.js'
worker_path = OUT / 'authoritative-simulation-worker-v174.js'

for path in (module_path, worker_path):
    if not path.exists():
        raise RuntimeError(f'missing build 197 output: {path}')

module = module_path.read_text('utf-8')
anchor = """    processInstalled,
    state,
    repairGroup(group, target) {"""
replacement = """    processInstalled,
    state,
    tagIssuedOrder(game, unitIds, target, append = false) {
      const exact = targetOf(target);
      if (!game || !exact) return 0;
      state.ordersCaptured += 1;
      state.lastTargetX = exact.x;
      state.lastTargetY = exact.y;
      return tagIssuedOrder(game, unitIds || [], exact, Boolean(append));
    },
    repairGroup(group, target) {"""
if module.count(anchor) != 1:
    raise RuntimeError(f'v197 public order bridge anchor mismatch: {module.count(anchor)}')
module = module.replace(anchor, replacement, 1)
module_path.write_text(module, 'utf-8')

worker = worker_path.read_text('utf-8')
move_anchor = "      case 'move': result = game.issueMove(payload.x, payload.y, payload.append); break;"
move_replacement = """      case 'move': {
        result = game.issueMove(payload.x, payload.y, payload.append);
        if (result !== false) {
          const tagged197 = self.__FD_FORMATION_TARGET_FIDELITY_197__?.tagIssuedOrder?.(
            game,
            event.selectedIds || [],
            { x: payload.x, y: payload.y },
            payload.append
          ) || 0;
          if (!tagged197) throw new Error('Build 197 move target was not attached to authoritative commands');
        }
        break;
      }"""
if worker.count(move_anchor) != 1:
    raise RuntimeError(f'v197 Worker move action anchor mismatch: {worker.count(move_anchor)}')
worker = worker.replace(move_anchor, move_replacement, 1)

attack_anchor = "      case 'attackMove': result = game.issueAttackMove(payload.x, payload.y, payload.append); break;"
attack_replacement = """      case 'attackMove': {
        result = game.issueAttackMove(payload.x, payload.y, payload.append);
        if (result !== false) {
          const tagged197 = self.__FD_FORMATION_TARGET_FIDELITY_197__?.tagIssuedOrder?.(
            game,
            event.selectedIds || [],
            { x: payload.x, y: payload.y },
            payload.append
          ) || 0;
          if (!tagged197) throw new Error('Build 197 attack-move target was not attached to authoritative commands');
        }
        break;
      }"""
if worker.count(attack_anchor) != 1:
    raise RuntimeError(f'v197 Worker attack-move action anchor mismatch: {worker.count(attack_anchor)}')
worker = worker.replace(attack_anchor, attack_replacement, 1)

# The presentation thread has already resolved whether the physical right-click hit
# an entity. Re-running issueContext in the Worker for a target-less click performs a
# second hit-test against a different authoritative snapshot. That allowed perceived
# open terrain to be reclassified as guard/repair/etc. Preserve the user's intent:
# targetId present => context command; no targetId => an explicit move to the exact
# world coordinate that the presentation thread sent.
context_anchor = """      case 'context': {
        if (!target) result = game.issueContext(payload.x, payload.y, payload.append);
        else {
          const previousContext = game.hitTestForContext;
          const previousHit = game.hitTest;
          game.hitTestForContext = () => target;
          game.hitTest = (_x, _y, selectableOnly = true) => selectableOnly ? previousHit.call(game, _x, _y, selectableOnly) : target;
          try { result = game.issueContext(payload.x, payload.y, payload.append); }
          finally { game.hitTestForContext = previousContext; game.hitTest = previousHit; }
        }
        break;
      }"""
context_replacement = """      case 'context': {
        if (!target) {
          result = game.issueMove(payload.x, payload.y, payload.append);
          if (result !== false) {
            const tagged197 = self.__FD_FORMATION_TARGET_FIDELITY_197__?.tagIssuedOrder?.(
              game,
              event.selectedIds || [],
              { x: payload.x, y: payload.y },
              payload.append
            ) || 0;
            if (!tagged197) throw new Error('Build 197 context move target was not attached to authoritative commands');
          }
        } else {
          const previousContext = game.hitTestForContext;
          const previousHit = game.hitTest;
          game.hitTestForContext = () => target;
          game.hitTest = (_x, _y, selectableOnly = true) => selectableOnly ? previousHit.call(game, _x, _y, selectableOnly) : target;
          try { result = game.issueContext(payload.x, payload.y, payload.append); }
          finally { game.hitTestForContext = previousContext; game.hitTest = previousHit; }
        }
        break;
      }"""
if worker.count(context_anchor) != 1:
    raise RuntimeError(f'v197 Worker context action anchor mismatch: {worker.count(context_anchor)}')
worker = worker.replace(context_anchor, context_replacement, 1)
worker_path.write_text(worker, 'utf-8')

print('build 197 authoritative action target bridge installed')
