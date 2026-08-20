from pathlib import Path

source = Path('tests/save-load191.mjs')
target = Path('tests/save-load199.generated.mjs')
text = source.read_text('utf-8')
text = text.replace('?build=191', '?build=199')
text = text.replace('__FD_RUNTIME_SHELL_191__', '__FD_RUNTIME_SHELL_199__')
text = text.replace('newGame.build !== 191', 'newGame.build !== 199')
text = text.replace('save-load191', 'save-load199')
text = text.replace('SaveLoad191', 'SaveLoad199')

# Build 199 exposes the canonical authoritative simulation counter as
# bridge.workerTick. The historical global tick can legitimately be zero after
# restoring a save even while the Worker is already running, so it must not
# shadow the live bridge counter through nullish coalescing.
legacy_tick = "Number(globalThis.__FD_STABLE_STATE165__?.tick ?? bridge?.lastWorkerTick ?? game?.simTick ?? 0)"
authoritative_tick = "Number(bridge?.workerTick ?? globalThis.__FD_STABLE_STATE165__?.tick ?? bridge?.lastWorkerTick ?? game?.simTick ?? 0)"
if text.count(legacy_tick) != 2:
    raise RuntimeError(f'build 199 save/load tick anchor count invalid: {text.count(legacy_tick)}')
text = text.replace(legacy_tick, authoritative_tick)

target.write_text(text, 'utf-8')
print('Build 199 isolated save/load regression generated with authoritative Worker tick')
