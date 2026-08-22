from pathlib import Path
import subprocess

subprocess.run(['python','scripts/generate206_tests.py'],check=True)
source=Path('tests/save-slots206.generated.mjs')
if not source.exists(): raise RuntimeError('build 207 inherited save gate missing')
text=source.read_text('utf-8')
for old,new in [
    ('?build=206','?build=207'),
    ('__FD_SAVE_SLOTS_206__','__FD_SAVE_SLOTS_207__'),
    ('__FD_RUNTIME_SHELL_206__','__FD_RUNTIME_SHELL_207__'),
    ('__FD_BOOT_206__','__FD_BOOT_207__'),
    ('menu.build !== 206','menu.build !== 207'),
    ('build 206','build 207'),
    ('build-206','build-207'),
]: text=text.replace(old,new)
Path('tests/save-slots207.generated.mjs').write_text(text,'utf-8')
print('generated save-slots207.generated.mjs')
