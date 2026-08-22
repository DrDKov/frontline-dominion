from pathlib import Path

WORKER = Path('dist/authoritative-simulation-worker-v174.js')
BRIDGE = Path('dist/authoritative-simulation-v174.js')
LOBBY = Path('dist/multiplayer-lobby-v206.js')
for path in [WORKER, BRIDGE, LOBBY]:
    if not path.exists():
        raise RuntimeError(f'build 206 initial signature target missing: {path}')


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'build 206 {label} anchor count={count}')
    return text.replace(old, new, 1)

worker = WORKER.read_text('utf-8')
worker = replace_once(
    worker,
    "let lastNetworkBaseComponents206 = null;\n",
    "let lastNetworkBaseComponents206 = null;\n"
    "let initialNetworkHash206 = '00000000';\n"
    "let initialNetworkLogisticsHash206 = 0;\n"
    "let initialNetworkLogisticsComponents206 = null;\n"
    "let initialNetworkBaseComponents206 = null;\n",
    'Worker initial diagnostic declarations',
)
worker = replace_once(
    worker,
    "lastHashTick = -1; lastNetworkHashTick = -1; lastNetworkHash = '00000000'; lastNetworkLogisticsHash206 = 0; lastNetworkLogisticsComponents206 = null; lastNetworkBaseComponents206 = null;\n",
    "lastHashTick = -1; lastNetworkHashTick = -1; lastNetworkHash = '00000000'; lastNetworkLogisticsHash206 = 0; lastNetworkLogisticsComponents206 = null; lastNetworkBaseComponents206 = null; initialNetworkHash206 = '00000000'; initialNetworkLogisticsHash206 = 0; initialNetworkLogisticsComponents206 = null; initialNetworkBaseComponents206 = null;\n",
    'Worker initial diagnostic reset',
)
worker = replace_once(
    worker,
    "  running = true;\n  workerStartedAt = performance.now();\n  makeSnapshot(true);\n",
    "  initialNetworkHash206 = networkStateHash(true);\n"
    "  initialNetworkLogisticsHash206 = lastNetworkLogisticsHash206;\n"
    "  initialNetworkLogisticsComponents206 = lastNetworkLogisticsComponents206 ? plainClone(lastNetworkLogisticsComponents206) : null;\n"
    "  initialNetworkBaseComponents206 = lastNetworkBaseComponents206 ? plainClone(lastNetworkBaseComponents206) : null;\n"
    "  running = true;\n  workerStartedAt = performance.now();\n  makeSnapshot(true);\n",
    'Worker initial signature capture',
)
worker = replace_once(
    worker,
    "networkHash, networkHashTick: lastNetworkHashTick, networkLogisticsHash206: lastNetworkLogisticsHash206, networkLogisticsComponents206: lastNetworkLogisticsComponents206, networkBaseComponents206: lastNetworkBaseComponents206, appliedSeq:",
    "networkHash, networkHashTick: lastNetworkHashTick, networkLogisticsHash206: lastNetworkLogisticsHash206, networkLogisticsComponents206: lastNetworkLogisticsComponents206, networkBaseComponents206: lastNetworkBaseComponents206, initialNetworkHash206, initialNetworkLogisticsHash206, initialNetworkLogisticsComponents206, initialNetworkBaseComponents206, appliedSeq:",
    'Worker snapshot initial signature',
)
WORKER.write_text(worker, 'utf-8')

bridge = BRIDGE.read_text('utf-8')
bridge = replace_once(
    bridge,
    "      networkBaseComponents206: message.networkBaseComponents206 || null,\n",
    "      networkBaseComponents206: message.networkBaseComponents206 || null,\n"
    "      initialNetworkHash206: message.initialNetworkHash206 || '00000000',\n"
    "      initialNetworkLogisticsHash206: Number(message.initialNetworkLogisticsHash206 || 0) >>> 0,\n"
    "      initialNetworkLogisticsComponents206: message.initialNetworkLogisticsComponents206 || null,\n"
    "      initialNetworkBaseComponents206: message.initialNetworkBaseComponents206 || null,\n",
    'bridge initial signature pass-through',
)
BRIDGE.write_text(bridge, 'utf-8')

lobby = LOBBY.read_text('utf-8')
lobby = replace_once(
    lobby,
    "        local: { hash: local.hash, stateHash: local.networkStateHash206, rngSeed: local.networkRngSeed206, appliedSeq: local.networkAppliedSeq206, logisticsHash: local.networkLogisticsHash206, components: local.networkLogisticsComponents206, base: local.networkBaseComponents206, subsystems: local.networkSubsystemHashes206 },\n",
    "        local: { hash: local.hash, stateHash: local.networkStateHash206, rngSeed: local.networkRngSeed206, appliedSeq: local.networkAppliedSeq206, logisticsHash: local.networkLogisticsHash206, components: local.networkLogisticsComponents206, base: local.networkBaseComponents206, initialHash: local.initialNetworkHash206, initialLogisticsHash: local.initialNetworkLogisticsHash206, initialComponents: local.initialNetworkLogisticsComponents206, initialBase: local.initialNetworkBaseComponents206, subsystems: local.networkSubsystemHashes206 },\n",
    'lobby local initial signature',
)
lobby = replace_once(
    lobby,
    "        remote: { hash: status.hash, stateHash: status.networkStateHash206, rngSeed: status.networkRngSeed206, appliedSeq: status.networkAppliedSeq206, logisticsHash: status.networkLogisticsHash206, components: status.networkLogisticsComponents206, base: status.networkBaseComponents206, subsystems: status.networkSubsystemHashes206 },\n",
    "        remote: { hash: status.hash, stateHash: status.networkStateHash206, rngSeed: status.networkRngSeed206, appliedSeq: status.networkAppliedSeq206, logisticsHash: status.networkLogisticsHash206, components: status.networkLogisticsComponents206, base: status.networkBaseComponents206, initialHash: status.initialNetworkHash206, initialLogisticsHash: status.initialNetworkLogisticsHash206, initialComponents: status.initialNetworkLogisticsComponents206, initialBase: status.initialNetworkBaseComponents206, subsystems: status.networkSubsystemHashes206 },\n",
    'lobby remote initial signature',
)
LOBBY.write_text(lobby, 'utf-8')
print('Build 206 initial Worker canonical signature exposed in multiplayer mismatch diagnostics')
