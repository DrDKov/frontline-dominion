from pathlib import Path

BUILD = 205
path = Path('dist/authoritative-simulation-worker-v174.js')
if not path.exists():
    raise RuntimeError(f'build {BUILD} authoritative Worker missing: {path}')

text = path.read_text('utf-8')
if 'pendingNetworkActions205' in text:
    print('Build 205 recovery action-queue diagnostics already installed')
    raise SystemExit(0)

anchor = """        reconMemoryQueue203: self.__FD_RECON_MEMORY_QUEUE_203__?.diagnostics?.() || null,
        performance: { ticksExecuted, averageTickMs: ticksExecuted ? totalTickMs / ticksExecuted : 0, maxTickMs, actionQueue: actionQueue.length, combat166: game?.combatScaleDiagnostics166?.() || null }
"""
replacement = """        reconMemoryQueue203: self.__FD_RECON_MEMORY_QUEUE_203__?.diagnostics?.() || null,
        pendingNetworkActions205: actionQueue.map(event => ({
          seq: Number(event?.seq || 0), networkSeq: Number(event?.networkSeq || 0),
          atTick: Number(event?.atTick || 0), action: event?.action || null, team: event?.team || null,
        })),
        performance: { ticksExecuted, averageTickMs: ticksExecuted ? totalTickMs / ticksExecuted : 0, maxTickMs, actionQueue: actionQueue.length, combat166: game?.combatScaleDiagnostics166?.() || null }
"""
if text.count(anchor) != 1:
    raise RuntimeError('build 205 diagnostics action-queue anchor missing')
text = text.replace(anchor, replacement, 1)
path.write_text(text, 'utf-8')
print('Build 205 compact pending network action diagnostics installed')
