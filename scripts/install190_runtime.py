from pathlib import Path

root = Path('.')
out = root / 'dist'
modules = ['engineer-rocket-visual-v190.js', 'command-input-v190.js']
for name in modules:
    source = root / 'src' / 'v190' / name
    if not source.exists():
        raise RuntimeError(f'missing source module: {source}')
    (out / name).write_text(source.read_text('utf-8'), 'utf-8')

page_path = out / 'frontline-dominion.html'
page = page_path.read_text('utf-8')
visual_tag = '<script src="./engineer-rocket-visual-v190.js?build=190"></script>'
input_tag = '<script src="./command-input-v190.js?build=190"></script>'
stability_tag = '<script src="./runtime-stability-v190.js?build=190"></script>'
shell_tag = '<script src="./runtime-shell-v190.js?build=190"></script>'
for tag in (visual_tag, input_tag):
    page = page.replace(tag, '')
if stability_tag not in page or shell_tag not in page:
    raise RuntimeError('build 190 runtime anchors missing')
page = page.replace(stability_tag, stability_tag + '\n' + visual_tag, 1)
page = page.replace(shell_tag, input_tag + '\n' + shell_tag, 1)
if page.count(visual_tag) != 1 or page.count(input_tag) != 1:
    raise RuntimeError('runtime module ownership is not unique')
page_path.write_text(page, 'utf-8')
print('Build 190 runtime input and engineer visual owners installed')
