from pathlib import Path

BUILD = 205
path = Path('dist/authoritative-simulation-worker-v174.js')
if not path.exists():
    raise RuntimeError(f'build {BUILD} authoritative Worker missing: {path}')

text = path.read_text('utf-8')
marker = 'networkHashTick: lastNetworkHashTick, diagnosticReadOnly205: true'
if marker in text:
    print('Build 205 read-only Worker diagnostics already patched')
    raise SystemExit(0)

old = """        paused, running, manualMode, stateHash: stateHash(true), subsystemHashes: subsystemHashes(true), networkHash: networkStateHash(true), multiplayer: { ...multiplayer },
"""
new = """        paused, running, manualMode,
        stateHash: lastStateHash >>> 0,
        subsystemHashes: lastSubsystemHashes ? { ...lastSubsystemHashes } : null,
        networkHash: lastNetworkHash,
        networkHashTick: lastNetworkHashTick, diagnosticReadOnly205: true,
        multiplayer: { ...multiplayer },
"""
if text.count(old) != 1:
    raise RuntimeError('build 205 diagnostics mutation anchor missing')
text = text.replace(old, new, 1)
path.write_text(text, 'utf-8')
print('Build 205 Worker diagnostics no longer mutate hash cadence')
