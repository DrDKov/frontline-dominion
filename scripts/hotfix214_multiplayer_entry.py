from pathlib import Path

PATH = Path('dist/multiplayer.html')
if not PATH.exists():
    raise RuntimeError('build 214 multiplayer entry missing')
text = PATH.read_text('utf-8')
replacements = [
    ('data-fd-canonical-build="206"', 'data-fd-canonical-build="214"'),
    ('BUILD 205', 'BUILD 214'),
    ('frontline-dominion.html?build=206&amp;multiplayer=1', 'frontline-dominion.html?build=214&amp;multiplayer=1'),
    ('multiplayer-lobby-v206.js?build=206', 'multiplayer-lobby-v206.js?build=214'),
]
for old, new in replacements:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'multiplayer 214 anchor {old!r} count={count}')
    text = text.replace(old, new, 1)
PATH.write_text(text, 'utf-8')
print('Build 214 multiplayer entry now loads canonical build 214 game runtime while retaining lobby protocol v206')
