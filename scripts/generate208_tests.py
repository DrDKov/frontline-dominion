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
    if old in text:
        logistics.write_text(text.replace(old,new,1),'utf-8')
    elif new not in text:
        raise RuntimeError('build 208 logistics power-reserve fixture anchor missing')

# Keep construction failures actionable. The committed gate intentionally covers
# every build-menu structure, but its original wait returned only null on timeout.
# During CI, make the wait helper understand __pending and attach each building's
# live construction/engineer command state so a stalled type is named explicitly.
construction=Path('tests/construction208-all-buildings-v2.mjs')
if construction.exists():
    text=construction.read_text('utf-8')
    old="last=await page.evaluate(fn,arg);if(last)return last;await page.waitForTimeout(interval);"
    new="last=await page.evaluate(fn,arg);if(last&&!last.__pending)return last;await page.waitForTimeout(interval);"
    if old in text:
        text=text.replace(old,new,1)
    elif new not in text:
        raise RuntimeError('build 208 construction wait diagnostic anchor missing')
    old="return r.every(x=>x.completed||x.construction>x.initial+.002)?r:null;"
    new="return r.every(x=>x.completed||x.construction>x.initial+.002)?r:{__pending:true,rows:r,stalled:r.filter(x=>!x.completed&&!(x.construction>x.initial+.002))};"
    if old in text:
        text=text.replace(old,new,1)
    elif new not in text:
        raise RuntimeError('build 208 construction stalled-row diagnostic anchor missing')
    construction.write_text(text,'utf-8')

subprocess.run(['python','scripts/generate207_tests.py'],check=True)
source=Path('tests/save-slots207.generated.mjs')
if not source.exists(): raise RuntimeError('build 208 inherited save gate missing')
text=source.read_text('utf-8')
for old,new in [
    ('?build=207','?build=208'),
    ('__FD_SAVE_SLOTS_207__','__FD_SAVE_SLOTS_208__'),
    ('__FD_RUNTIME_SHELL_207__','__FD_RUNTIME_SHELL_208__'),
    ('__FD_BOOT_207__','__FD_BOOT_208__'),
    # Build 209 intentionally retains the build-208 save/storage namespace for
    # backwards compatibility. Accept either top-level runtime while testing the
    # same save protocol; older builds remain rejected.
    ('menu.build !== 207','![208,209].includes(menu.build)'),
    ('build 207','build 208'),
    ('build-207','build-208'),
]: text=text.replace(old,new)
Path('tests/save-slots208.generated.mjs').write_text(text,'utf-8')
print('generated build 208 physical tests with deterministic power reserve and construction diagnostics')
