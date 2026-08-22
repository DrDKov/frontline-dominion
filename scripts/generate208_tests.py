from pathlib import Path
import subprocess

# The logistics fixture also validates autonomous engineer construction of a
# Financial Center. Once that structure completes it adds a real power load.
# The fixture previously stopped adding generators as soon as initial powerFactor
# reached .95, so later Financial Center completion could drop power below the
# inherited production threshold and falsely report the tied-truck button as
# broken. Keep all fixture generators to provide deterministic reserve capacity.
logistics=Path('tests/logistics208-controls-v2.mjs')
if logistics.exists():
    text=logistics.read_text('utf-8')
    old="this.recalculatePower?.();if(Number(this.teams.player.powerFactor||0)>=.95)break;if(!powerType)break;B(id,powerType,7600+(i%3)*180,5750+Math.floor(i/3)*180);"
    new="this.recalculatePower?.();if(!powerType)break;B(id,powerType,7600+(i%3)*180,5750+Math.floor(i/3)*180);"
    if old not in text:
        raise RuntimeError('build 208 logistics power-reserve fixture anchor missing')
    logistics.write_text(text.replace(old,new,1),'utf-8')

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
print('generated build 208 physical tests with deterministic power reserve')
