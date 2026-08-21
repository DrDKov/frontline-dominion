from pathlib import Path
import runpy

BUILD = 205

# Keep the established 199–204 behavioral regression corpus and only advance
# its launcher/runtime ownership to the new canonical build.
runpy.run_path('scripts/generate204_tests.py', run_name='__main__')

# Network commands must be delivered to the authoritative Worker immediately,
# while their canonical atTick is still in the future. Otherwise presentation
# timing becomes part of the simulation and two browsers can execute the same
# command on adjacent ticks.
runpy.run_path('scripts/patch205_command_tick.py', run_name='__main__')

# Legacy AI modules must not use browser-local ambient randomness. Fold every
# Math.random() call inside an active multiplayer Worker into the persisted
# authoritative RNG seed so equal simulation ticks stay deterministic.
runpy.run_path('scripts/patch205_deterministic_ai.py', run_name='__main__')

# Simulation LOD must never depend on a local camera in multiplayer. The
# inherited mass scheduler used isOnScreen() to choose unit update intervals,
# so two computers viewing different map areas could produce different unit
# positions at the same simulation tick. Active network commands now run at
# 25 Hz and inactive LOD depends only on deterministic simulation state.
runpy.run_path('scripts/patch205_deterministic_sim_lod.py', run_name='__main__')

# Network checksums describe authoritative state, not the incidental insertion
# order of JS arrays. Hash entities/projectiles in canonical identity order so
# two equivalent Workers cannot manufacture a desync from container ordering.
runpy.run_path('scripts/patch205_canonical_network_hash.py', run_name='__main__')

# A recovery snapshot may arrive while already-authorized future commands are
# waiting for their atTick. Keep a bounded event journal and replay every event
# newer than the snapshot's baseSeq after the replacement Worker is ready.
runpy.run_path('scripts/patch205_resync_replay.py', run_name='__main__')

# A Worker network hash has its own authoritative computation tick. A later
# presentation snapshot may carry that older hash, so never label it with the
# snapshot tick or the lobby can manufacture a false desync.
runpy.run_path('scripts/patch205_hash_tick_identity.py', run_name='__main__')

# The lobby receives host and guest status callbacks asynchronously. Apply the
# deterministic hash-tick matcher while keeping the live simulation clock
# separate for guest pacing.
runpy.run_path('scripts/patch205_hash_sync.py', run_name='__main__')

# Clock transport is independent of expensive hash checkpoints. The host sends
# its current authoritative Worker tick at 8 Hz so the guest can continuously
# advance at the intended fixed lag rather than stalling between hash reports.
runpy.run_path('scripts/patch205_clock_pacing.py', run_name='__main__')

# Diagnostics must be observational. A forced network hash used to advance
# lastNetworkHashTick independently on host and guest, which changed future
# checkpoint cadence merely by opening diagnostics/profiling.
runpy.run_path('scripts/patch205_readonly_diagnostics.py', run_name='__main__')

# The physical save test must cover the complete user-facing slot lifecycle,
# including overwrite-in-place and deletion, not only creation and loading.
runpy.run_path('scripts/patch205_save_slot_gate.py', run_name='__main__')

# Exercise WebRTC in two distinct browser processes rather than two contexts
# sharing one Chromium process. This catches accidental process-local coupling.
runpy.run_path('scripts/patch205_dual_process_test.py', run_name='__main__')

# Keep one permanent no-input determinism gate: co-op must produce six clean
# authoritative checkpoints before either player sends the first command.
runpy.run_path('scripts/patch205_multiplayer_gate.py', run_name='__main__')

# Recovery must not erase commands that were already authorized for a future
# simulation tick. Force a resync while such an event is pending and require
# both replacement Workers to apply the original sequence afterwards.
runpy.run_path('scripts/patch205_resync_future_command_gate.py', run_name='__main__')

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
