from pathlib import Path
import subprocess

# Preserve the build-208 fixture hardening side effects used by the logistics and
# construction browser gates. Build 209 generation invokes that chain.
subprocess.run(['python', 'scripts/generate209_tests.py'], check=True)

# The save-slot browser scenario itself has remained semantically stable since
# build 205. Generate build 210 directly from that committed source rather than
# recursively editing an already-generated test, which accumulated stale owner
# assertions across 206→209.
save_source = Path('tests/save-slots205.mjs')
if not save_source.exists():
    raise RuntimeError('build 210 stable save gate source missing')
save_text = save_source.read_text('utf-8')
for old, new in [
    ('?build=205', '?build=210'),
    ('__FD_SAVE_SLOTS_205__', '__FD_SAVE_SLOTS_210__'),
    ('__FD_RUNTIME_SHELL_205__', '__FD_RUNTIME_SHELL_210__'),
    ('menu.build !== 205', 'menu.build !== 210'),
    ('build 205', 'build 210'),
    ('build-205', 'build-210'),
]:
    save_text = save_text.replace(old, new)

# Fail generation if any build-205 ownership marker survived. This keeps the
# generated test auditable and avoids another false red caused by a hidden pin.
for stale in ('?build=205', '__FD_SAVE_SLOTS_205__', '__FD_RUNTIME_SHELL_205__', 'menu.build !== 205', 'build-205'):
    if stale in save_text:
        raise RuntimeError(f'build 210 save gate retained stale marker: {stale}')
Path('tests/save-slots210.generated.mjs').write_text(save_text, 'utf-8')

movement_source = Path('tests/free-group-direction209.mjs')
if not movement_source.exists():
    raise RuntimeError('build 210 inherited movement gate missing')
movement_text = movement_source.read_text('utf-8')
movement_text = movement_text.replace('?build=209', '?build=210')
movement_text = movement_text.replace('__FD_RUNTIME_SHELL_209__?.build === 209', '__FD_RUNTIME_SHELL_210__?.build === 210')
# The movement subsystem itself remains the build-209 owner and is intentionally
# inherited by build 210, so __FD_MOVEMENT_TARGET_FIDELITY_209__ is not renamed.
movement_text = movement_text.replace('"build":209', '"build":210').replace('build: 209', 'build: 210')
Path('tests/free-group-direction210.generated.mjs').write_text(movement_text, 'utf-8')

print('generated build 210 save and inherited group-movement gates')
