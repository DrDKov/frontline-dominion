from pathlib import Path

path = Path('dist/logistics-core-v206.js')
if not path.exists():
    raise RuntimeError('build 206 logistics core missing')

text = path.read_text('utf-8')

def once(old: str, new: str, label: str) -> None:
    global text
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'build 206 {label} anchor count={count}')
    text = text.replace(old, new, 1)

# ensureUnit/ensureNode/ensureGame are called recursively from demand, hashing,
# AI and service code. Replacing `entity.logistics206` on every ensure call
# invalidates references already held by the caller. Mutate the persistent
# object in-place instead so every subsystem observes one authoritative state
# object for the whole entity lifetime.
once(
    "    unit.logistics206 = state;\n    if (truck) unit.cargo = round(manifestTotal(state.cargo));\n    return state;\n",
    "    Object.assign(existing, state);\n    unit.logistics206 = existing;\n    if (truck) unit.cargo = round(manifestTotal(existing.cargo));\n    return existing;\n",
    'ensureUnit identity',
)
once(
    "    building.logistics206 = state;\n    return state;\n",
    "    Object.assign(existing, state);\n    building.logistics206 = existing;\n    return existing;\n",
    'ensureNode identity',
)

# Keep the root logistics object and per-team ledgers stable as well. This is
# required for interval accumulators, truck-loss watches and AI references to
# survive nested ensureGame calls.
once(
    "    const state = game.logistics206 = {\n      version: BUILD,\n",
    "    const state = {\n      ...existing,\n      version: BUILD,\n",
    'ensureGame state construction',
)
once(
    "      const old = state.team[team] || {};\n      state.team[team] = {\n        supportSpent: Math.max(0, finite(old.supportSpent)),\n        importSpent: Math.max(0, finite(old.importSpent)),\n        importDependency: clamp(old.importDependency, 0, 1),\n        contracts: old.contracts && typeof old.contracts === 'object' ? old.contracts : {},\n        aggregates: old.aggregates && typeof old.aggregates === 'object' ? old.aggregates : {},\n      };\n",
    "      const old = state.team[team] && typeof state.team[team] === 'object' ? state.team[team] : {};\n      Object.assign(old, {\n        supportSpent: Math.max(0, finite(old.supportSpent)),\n        importSpent: Math.max(0, finite(old.importSpent)),\n        importDependency: clamp(old.importDependency, 0, 1),\n        contracts: old.contracts && typeof old.contracts === 'object' ? old.contracts : {},\n        aggregates: old.aggregates && typeof old.aggregates === 'object' ? old.aggregates : {},\n      });\n      state.team[team] = old;\n",
    'ensureGame team identity',
)
once(
    "    const t = state.telemetry;\n",
    "    Object.assign(existing, state);\n    game.logistics206 = existing;\n    const t = existing.telemetry;\n",
    'ensureGame root identity',
)
once(
    "    return state;\n  }\n\n  function logEvent(game, type, detail = {}) {\n",
    "    return existing;\n  }\n\n  function logEvent(game, type, detail = {}) {\n",
    'ensureGame return identity',
)

path.write_text(text, 'utf-8')
print('Build 206 logistics unit/node/game state identity preserved across nested ensure calls')
