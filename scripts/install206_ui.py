from pathlib import Path
import shutil

ROOT = Path('.')
OUT = ROOT / 'dist'
BUILD = 206
source = ROOT / 'src' / 'v206' / 'logistics-ui-v206.js'
target = OUT / 'logistics-ui-v206.js'
html_path = OUT / 'frontline-dominion.html'

if not source.exists() or not html_path.exists():
    raise RuntimeError('build 206 UI installer prerequisites missing')
shutil.copy2(source, target)
html = html_path.read_text('utf-8')
tag = f'<script src="./logistics-ui-v206.js?build={BUILD}"></script>'
if tag not in html:
    anchor = f'<script src="./runtime-ui-v206.js?build={BUILD}"></script>'
    if anchor not in html:
        raise RuntimeError('build 206 runtime-ui anchor missing')
    html = html.replace(anchor, tag + '\n' + anchor, 1)
if html.count(tag) != 1:
    raise RuntimeError('build 206 logistics UI ownership is not unique')
html_path.write_text(html, 'utf-8')
print('Build 206 logistics UI installed')
