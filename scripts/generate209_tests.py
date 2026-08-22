from pathlib import Path
import subprocess

subprocess.run(['python', 'scripts/generate208_tests.py'], check=True)
source = Path('tests/save-slots208.generated.mjs')
if not source.exists():
    raise RuntimeError('build 209 inherited save gate missing')
text = source.read_text('utf-8')
for old, new in [
    ('?build=208', '?build=209'),
    ('__FD_SAVE_SLOTS_208__', '__FD_SAVE_SLOTS_209__'),
    ('__FD_RUNTIME_SHELL_208__', '__FD_RUNTIME_SHELL_209__'),
    ('__FD_BOOT_208__', '__FD_BOOT_209__'),
    ('menu.build !== 208', 'menu.build !== 209'),
    ('build 208', 'build 209'),
    ('build-208', 'build-209'),
]:
    text = text.replace(old, new)
Path('tests/save-slots209.generated.mjs').write_text(text, 'utf-8')
print('generated save-slots209.generated.mjs')
