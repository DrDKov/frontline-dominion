from pathlib import Path

path = Path('dist/authoritative-simulation-worker-v174.js')
text = path.read_text('utf-8')

if 'deterministicRandomCalls205' in text:
    print('Build 205 deterministic multiplayer AI already patched')
    raise SystemExit(0)

state_anchor = "let multiplayer = { active: false, role: null, mode: 'coop', perspectiveSwapped: false, hostTick: null, hostTickReceivedAt: 0, appliedSeq: 0 };\n"
state_replacement = state_anchor + "let nativeMathRandom205 = Math.random;\nlet deterministicRandomCalls205 = 0;\n\nfunction installDeterministicRandom205() {\n  if (!multiplayer.active || !game?.rng) {\n    Math.random = nativeMathRandom205;\n    deterministicRandomCalls205 = 0;\n    return;\n  }\n  deterministicRandomCalls205 = 0;\n  Math.random = () => {\n    // Legacy AI modules historically called Math.random() outside the seeded\n    // Game RNG. Fold those calls into the authoritative RNG state so two\n    // Workers with the same save/seed make the same decision and resync can\n    // restore the exact stream through authoritative172.rngSeed.\n    let x = Number(game.rng.seed) >>> 0;\n    if (!x) x = (Number(game.seed) >>> 0) || 0x6d2b79f5;\n    x ^= (x << 13) >>> 0;\n    x ^= x >>> 17;\n    x ^= (x << 5) >>> 0;\n    x >>>= 0;\n    game.rng.seed = x || 0x6d2b79f5;\n    deterministicRandomCalls205 += 1;\n    return (game.rng.seed >>> 0) / 4294967296;\n  };\n}\n"
if text.count(state_anchor) != 1:
    raise RuntimeError('build 205 multiplayer state anchor missing')
text = text.replace(state_anchor, state_replacement, 1)

install_anchor = "  if (Number.isFinite(extension.rngSeed) && game.rng) game.rng.seed = extension.rngSeed >>> 0;\n  game.simTick = Number.isFinite(extension.simTick) ? extension.simTick : Math.round(game.time * SIM_HZ);\n"
install_replacement = "  if (Number.isFinite(extension.rngSeed) && game.rng) game.rng.seed = extension.rngSeed >>> 0;\n  installDeterministicRandom205();\n  game.simTick = Number.isFinite(extension.simTick) ? extension.simTick : Math.round(game.time * SIM_HZ);\n"
if text.count(install_anchor) != 1:
    raise RuntimeError('build 205 RNG restore anchor missing')
text = text.replace(install_anchor, install_replacement, 1)

diag_anchor = "        aiEnabled: !(multiplayer.active && multiplayer.mode === 'versus'),\n        counts: game ? { units: game.units.length, buildings: game.buildings.length, resources: game.resources.length, projectiles: game.projectiles.length } : null,\n"
diag_replacement = "        aiEnabled: !(multiplayer.active && multiplayer.mode === 'versus'), deterministicRandomCalls205, rngSeed205: Number(game?.rng?.seed || 0) >>> 0,\n        counts: game ? { units: game.units.length, buildings: game.buildings.length, resources: game.resources.length, projectiles: game.projectiles.length } : null,\n"
if text.count(diag_anchor) != 1:
    raise RuntimeError('build 205 deterministic RNG diagnostics anchor missing')
text = text.replace(diag_anchor, diag_replacement, 1)

shutdown_anchor = "      case 'shutdown': running = false; if (timer) clearTimeout(timer); timer = 0; close(); break;\n"
shutdown_replacement = "      case 'shutdown': running = false; if (timer) clearTimeout(timer); timer = 0; Math.random = nativeMathRandom205; close(); break;\n"
if text.count(shutdown_anchor) != 1:
    raise RuntimeError('build 205 Worker shutdown anchor missing')
text = text.replace(shutdown_anchor, shutdown_replacement, 1)

path.write_text(text, 'utf-8')
print('Build 205 deterministic multiplayer AI random stream patched')
