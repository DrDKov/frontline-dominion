from pathlib import Path
import re

ROOT = Path('.')
OUT = ROOT / 'dist'
BUILD = 191
VERSION = '16.8.7'

source = ROOT / 'src' / 'v191' / 'save-compat-v191.js'
html_path = OUT / 'frontline-dominion.html'
shell_path = OUT / 'runtime-shell-v191.js'

for path in (source, html_path, shell_path):
    if not path.exists():
        raise RuntimeError(f'build 191 finalizer required file missing: {path}')

(OUT / 'save-compat-v191.js').write_text(source.read_text('utf-8'), 'utf-8')

shell = shell_path.read_text('utf-8')
shell = shell.replace('`${current}-backup-build190`', '`${current}-backup-build${BUILD}`')
shell = shell.replace("'frontline-dominion-save-v5-backup-build190'", "'frontline-dominion-save-v5-backup-build191'")
shell_path.write_text(shell, 'utf-8')

html = html_path.read_text('utf-8')
html = re.sub(
    r'\s*<script\b[^>]*src=["\'](?:\./|/frontline-dominion/)save-compat-v191\.js(?:\?build=\d+)?["\'][^>]*></script>',
    '',
    html,
    flags=re.I,
)
shell_match = re.search(
    rf'<script\b[^>]*src=["\'](?:\./|/frontline-dominion/)runtime-shell-v191\.js\?build={BUILD}["\'][^>]*></script>',
    html,
    flags=re.I,
)
if not shell_match:
    raise RuntimeError('build 191 runtime shell tag missing')
compat_tag = f'<script src="./save-compat-v191.js?build={BUILD}"></script>\n'
html = html[:shell_match.start()] + compat_tag + html[shell_match.start():]
html_path.write_text(html, 'utf-8')

if html.count(f'save-compat-v191.js?build={BUILD}') != 1:
    raise RuntimeError('build 191 save compatibility owner count is not one')
if html.index(f'save-compat-v191.js?build={BUILD}') > html.index(f'runtime-shell-v191.js?build={BUILD}'):
    raise RuntimeError('build 191 save compatibility must load before runtime shell')
if not shell.rstrip().endswith('})();'):
    raise RuntimeError('build 191 runtime shell was truncated')

print(f'Frontline Dominion v{VERSION} build {BUILD} save/load finalizer installed')
