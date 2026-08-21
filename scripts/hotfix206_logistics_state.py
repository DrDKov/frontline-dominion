from pathlib import Path

path = Path('dist/logistics-core-v206.js')
if not path.exists():
    raise RuntimeError('build 206 logistics core missing')

text = path.read_text('utf-8')
anchor = "    const state = game.logistics206 = {\n      version: BUILD,\n"
replacement = "    const state = game.logistics206 = {\n      ...existing,\n      version: BUILD,\n"
count = text.count(anchor)
if count != 1:
    raise RuntimeError(f'build 206 logistics ensureGame anchor count={count}')
text = text.replace(anchor, replacement, 1)
path.write_text(text, 'utf-8')
print('Build 206 logistics transient accumulators preserved across ensureGame calls')
