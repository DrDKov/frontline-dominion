from pathlib import Path
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

# Re-own the start-menu assertion without depending on the exact numeric text
# left by earlier generated versions. The boundaries are semantic markers that
# have been stable since the original save-slot browser gate.
menu_start = save_text.find('if (menu.build !==')
menu_end_marker = "\n\nawait page.locator('#start-game').click();"
menu_end = save_text.find(menu_end_marker, menu_start)
if menu_start < 0 or menu_end < 0 or menu_end <= menu_start:
    raise RuntimeError(
        f'build 210 save menu markers missing: start={menu_start} end={menu_end}'
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
save_text = save_text[:menu_start] + menu_replacement + save_text[menu_end:]

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
