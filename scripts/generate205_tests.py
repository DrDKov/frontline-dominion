from pathlib import Path
import runpy

BUILD = 205

# Keep the established 199–204 behavioral regression corpus and only advance
# its launcher/runtime ownership to the new canonical build.
runpy.run_path('scripts/generate204_tests.py', run_name='__main__')

# Network commands must be delivered to the authoritative Worker immediately,
# while their canonical atTick is still in the future.  Otherwise presentation
# timing becomes part of the simulation and two browsers can execute the same
# command on adjacent ticks.
runpy.run_path('scripts/patch205_command_tick.py', run_name='__main__')

# The lobby receives host and guest status callbacks asynchronously. Apply the
# deterministic tick-pair matcher before any physical multiplayer gate runs;
# release205 publishes the same patched dist after these gates pass.
runpy.run_path('scripts/patch205_hash_sync.py', run_name='__main__')

# While the two-player determinism gate is being hardened, emit one exact
# checkpoint from both isolated clients and the status-publication source so a
# failed run identifies the protocol fault rather than only reporting timeout.
runpy.run_path('scripts/instrument205_multiplayer.py', run_name='__main__')

generated = [
    'reliability204.generated.mjs',
    'movement204.generated.mjs',
    'save-load204.generated.mjs',
    'user-fixes204.generated.mjs',
    'user-fixes204-recon.generated.mjs',
    'worker-recovery204.generated.mjs',
    'recon-energy204.generated.mjs',
    'recon-memory-queue204.generated.mjs',
]

for source_name in generated:
    source = Path('tests') / source_name
    if not source.exists():
        raise RuntimeError(f'build {BUILD} inherited test missing: {source}')
    text = source.read_text('utf-8')
    text = text.replace('?build=204', '?build=205')
    text = text.replace('__FD_RUNTIME_SHELL_204__', '__FD_RUNTIME_SHELL_205__')
    text = text.replace('__FD_BOOT_204__', '__FD_BOOT_205__')
    text = text.replace('__FD_RUNTIME_SHELL_205__?.build === 204', '__FD_RUNTIME_SHELL_205__?.build === 205')
    text = text.replace('save-load204', 'save-load205')
    target_name = source_name.replace('204.generated', '205.generated')
    target = Path('tests') / target_name
    target.write_text(text, 'utf-8')

input_source = Path('tests/input-authority204.mjs')
if not input_source.exists():
    raise RuntimeError(f'build {BUILD} input-authority source missing: {input_source}')
input_text = input_source.read_text('utf-8')
input_text = input_text.replace('?build=204', '?build=205')
input_text = input_text.replace('__FD_RUNTIME_SHELL_204__', '__FD_RUNTIME_SHELL_205__')
input_text = input_text.replace('?.build === 204', '?.build === 205', 1)
Path('tests/input-authority205.generated.mjs').write_text(input_text, 'utf-8')

print(f'Build {BUILD} inherited browser gates generated')