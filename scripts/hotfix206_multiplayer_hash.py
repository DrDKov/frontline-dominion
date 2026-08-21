from pathlib import Path

path = Path('dist/multiplayer-game-v96.js')
if not path.exists():
    raise RuntimeError('build 206 multiplayer runtime missing')
text = path.read_text('utf-8')
needle = "    mix(game.networkLogisticsHash206?.(state.localPerspectiveSwapped) || 0);\n"
count = text.count(needle)
if count != 1:
    raise RuntimeError(f'build 206 presentation logistics hash anchor count={count}')
text = text.replace(needle, '', 1)
path.write_text(text, 'utf-8')
print('Build 206 multiplayer presentation checksum restored; authoritative Worker network hash remains logistics-aware')
