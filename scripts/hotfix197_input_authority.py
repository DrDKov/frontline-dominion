from pathlib import Path

ROOT = Path('.')
OUT = ROOT / 'dist'
BUILD = 197

source_path = ROOT / 'src' / 'v197' / 'right-click-authority-v197.js'
target_path = OUT / source_path.name
html_path = OUT / 'frontline-dominion.html'

for path in (source_path, html_path):
    if not path.exists():
        raise RuntimeError(f'build 197 input authority required file missing: {path}')

target_path.write_text(source_path.read_text('utf-8'), 'utf-8')

html = html_path.read_text('utf-8')
input_tag = f'<script src="./command-input-v190.js?build={BUILD}"></script>'
authority_tag = f'<script src="./right-click-authority-v197.js?build={BUILD}"></script>'

html = html.replace(authority_tag + '\n', '').replace(authority_tag, '')
if html.count(input_tag) != 1:
    raise RuntimeError(f'build 197 command input owner count invalid: {html.count(input_tag)}')
html = html.replace(input_tag, input_tag + '\n' + authority_tag, 1)
if html.count(authority_tag) != 1:
    raise RuntimeError(f'build 197 right-click authority count invalid: {html.count(authority_tag)}')
html_path.write_text(html, 'utf-8')

module = target_path.read_text('utf-8')
for marker in (
    '__FD_RIGHT_CLICK_AUTHORITY_197__',
    "root.addEventListener('pointerdown'",
    "root.addEventListener('mousedown'",
    "root.addEventListener('contextmenu'",
    'stopImmediatePropagation',
    'authority197-pointer-right',
):
    if marker not in module:
        raise RuntimeError(f'build 197 input authority marker missing: {marker}')

print('build 197 authoritative right-click owner installed')
