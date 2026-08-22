from pathlib import Path
import re
import subprocess

subprocess.run(['python', 'scripts/generate209_tests.py'], check=True)

save_source = Path('tests/save-slots209.generated.mjs')
if not save_source.exists():
    raise RuntimeError('build 210 inherited save gate missing')
save_text = save_source.read_text('utf-8')
for old, new in [
    ('?build=209', '?build=210'),
    ('__FD_SAVE_SLOTS_209__', '__FD_SAVE_SLOTS_210__'),
    ('__FD_RUNTIME_SHELL_209__', '__FD_RUNTIME_SHELL_210__'),
    ('__FD_BOOT_209__', '__FD_BOOT_210__'),
    ('menu.build !== 209', 'menu.build !== 210'),
    ('build 209', 'build 210'),
    ('build-209', 'build-210'),
]:
    save_text = save_text.replace(old, new)

# Do not rely on another generation of chained textual version substitutions for
# the start-menu assertion. Re-own this one gate explicitly for build 210 so a
# stale numeric comparison cannot masquerade as a save/load regression.
menu_pattern = re.compile(
    r"if \(menu\.build !== \d+ \|\| menu\.featureStrip \|\| menu\.lead !== 'Выберите сторону и сложность операции\.' \|\|\s*"
    r"menu\.loadIndex < 0 \|\| menu\.multiplayerIndex !== menu\.loadIndex \+ 1\) \{\s*"
    r"throw new Error\(`Start menu is not the clean build-\d+ owner: \$\{JSON\.stringify\(menu\)\}`\);\s*\}",
    re.S,
)
menu_replacement = """const menuGate210 = {
  build: Number(menu.build) === 210,
  noFeatureStrip: menu.featureStrip === false,
  lead: menu.lead === 'Выберите сторону и сложность операции.',
  loadPresent: Number(menu.loadIndex) >= 0,
  multiplayerOrder: Number(menu.multiplayerIndex) === Number(menu.loadIndex) + 1,
};
if (!Object.values(menuGate210).every(Boolean)) {
  throw new Error(`Start menu is not the clean build-210 owner: ${JSON.stringify({ menu, menuGate210 })}`);
}"""
save_text, menu_count = menu_pattern.subn(menu_replacement, save_text, count=1)
if menu_count != 1:
    raise RuntimeError(f'build 210 save menu gate anchor count={menu_count}')

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
