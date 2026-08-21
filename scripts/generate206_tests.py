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
# This is diagnostic-only and never relaxes an inherited deterministic gate.
mp_path = TESTS / 'multiplayer206.generated.mjs'
mp = mp_path.read_text('utf-8')
anchor = "        lastEvent: diag.lastEvent || null,\n"
if mp.count(anchor) != 1:
    raise RuntimeError(f'build 206 multiplayer diagnostic anchor count={mp.count(anchor)}')
mp = mp.replace(anchor, anchor + "        lastHashMismatch206: diag.lastHashMismatch206 || null,\n", 1)

# Do not spend the full synchronization timeout once a real matched-tick
# mismatch is already known. Fail immediately with the component/subsystem
# hashes captured by the host lobby at that exact tick.
sync_anchor = "    const host = globalThis.__FD_MULTIPLAYER_LOBBY_206__?.diagnostics?.();\n    const win = document.getElementById('mp-game-frame205')?.contentWindow;\n"
if mp.count(sync_anchor) != 1:
    raise RuntimeError(f'build 206 synchronization diagnostic anchor count={mp.count(sync_anchor)}')
sync_diag = (
    "    const host = globalThis.__FD_MULTIPLAYER_LOBBY_206__?.diagnostics?.();\n"
    "    if (Number(host?.hashMismatches || 0) > 0) {\n"
    "      throw new Error(`Build 206 matched-tick divergence: ${JSON.stringify({\n"
    "        hashChecks: host.hashChecks, hashMismatches: host.hashMismatches, mismatchStreak: host.mismatchStreak,\n"
    "        lastHashMismatch206: host.lastHashMismatch206 || null, lastEvent: host.lastEvent || null,\n"
    "      })}`);\n"
    "    }\n"
    "    const win = document.getElementById('mp-game-frame205')?.contentWindow;\n"
)
mp = mp.replace(sync_anchor, sync_diag, 1)
mp_path.write_text(mp, 'utf-8')
print('instrumented multiplayer206.generated.mjs matched-tick component diagnostics')
