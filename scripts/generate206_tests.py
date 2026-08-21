from pathlib import Path

ROOT = Path('.')
TESTS = ROOT / 'tests'


def generate(source_name, target_name, replacements):
    source = TESTS / source_name
    if not source.exists():
        raise RuntimeError(f'missing inherited test: {source}')
    text = source.read_text('utf-8')
    for old, new in replacements:
        text = text.replace(old, new)
    (TESTS / target_name).write_text(text, 'utf-8')
    print(f'generated {target_name}')

common = [
    ('?build=205', '?build=206'),
    ('__FD_SAVE_SLOTS_205__', '__FD_SAVE_SLOTS_206__'),
    ('__FD_RUNTIME_SHELL_205__', '__FD_RUNTIME_SHELL_206__'),
    ('__FD_MULTIPLAYER_LOBBY_205__', '__FD_MULTIPLAYER_LOBBY_206__'),
    ('lobby?.build === 205', 'lobby?.build === 206'),
    ('menu.build !== 205', 'menu.build !== 206'),
    ('build-205 gate', 'build-206 gate'),
    ('build 205', 'build 206'),
    ('build-205', 'build-206'),
]

generate('save-slots205.mjs', 'save-slots206.generated.mjs', common)
generate('multiplayer205.mjs', 'multiplayer206.generated.mjs', common)
generate('multiplayer205-soak.mjs', 'multiplayer206-soak.generated.mjs', common)

# Surface the matched-tick component hashes recorded by the build-206 lobby.
# This is only diagnostic output on failure and does not relax any inherited
# deterministic assertion.
mp_path = TESTS / 'multiplayer206.generated.mjs'
mp = mp_path.read_text('utf-8')
anchor = "        lastEvent: diag.lastEvent || null,\n"
if mp.count(anchor) != 1:
    raise RuntimeError(f'build 206 multiplayer diagnostic anchor count={mp.count(anchor)}')
mp = mp.replace(anchor, anchor + "        lastHashMismatch206: diag.lastHashMismatch206 || null,\n", 1)
mp_path.write_text(mp, 'utf-8')
print('instrumented multiplayer206.generated.mjs matched-tick component diagnostics')
