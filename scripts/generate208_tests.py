from pathlib import Path
import subprocess

subprocess.run(['python','scripts/generate207_tests.py'],check=True)
source=Path('tests/save-slots207.generated.mjs')
if not source.exists(): raise RuntimeError('build 208 inherited save gate missing')
text=source.read_text('utf-8')
for old,new in [
    ('?build=207','?build=208'),
    ('__FD_SAVE_SLOTS_207__','__FD_SAVE_SLOTS_208__'),
    ('__FD_RUNTIME_SHELL_207__','__FD_RUNTIME_SHELL_208__'),
    ('__FD_BOOT_207__','__FD_BOOT_208__'),
    ('menu.build !== 207','menu.build !== 208'),
    ('build 207','build 208'),
    ('build-207','build-208'),
]: text=text.replace(old,new)
Path('tests/save-slots208.generated.mjs').write_text(text,'utf-8')
print('generated save-slots208.generated.mjs')
