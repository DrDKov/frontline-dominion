from pathlib import Path
import re
import runpy

# Rebuild the verified v16.6/build 180 first, then apply the two isolated UI fixes.
runpy.run_path('scripts/assemble166.py', run_name='__main__')
OUT = Path('dist')
ROOT = Path('.')

for name in ('minefield-defense-catalog-v181.js', 'minimap-atomic-v181.js'):
    (OUT / name).write_bytes((ROOT / 'overrides' / name).read_bytes())

html_path = OUT / 'frontline-dominion.html'
html = html_path.read_text('utf-8')
html = re.sub(
    r'<title>.*?</title>',
    '<title>Frontline Dominion v16.6.1 — Stable Minimap & Defense</title>',
    html,
    count=1,
    flags=re.S,
)

# Remove every older/future duplicate before installing one deterministic final owner.
html = re.sub(
    r'\s*<script[^>]+src=["\'][^"\']*(?:minimap-stability-v176|minimap-atomic-v181|minefield-defense-catalog-v181)\.js[^"\']*["\'][^>]*></script>',
    '',
    html,
    flags=re.I,
)

final_tags = (
    '\n<script src="./minefield-defense-catalog-v181.js?build=181"></script>'
    '\n<script src="./minimap-atomic-v181.js?build=181"></script>\n'
)
if '</body>' not in html:
    raise RuntimeError('v16.6.1 assembly: closing body tag not found')
html = html.replace('</body>', final_tags + '</body>', 1)
html_path.write_text(html, 'utf-8')

(OUT / 'index.html').write_text(
    '<!doctype html><html lang="ru"><head><meta charset="utf-8">'
    '<meta name="viewport" content="width=device-width,initial-scale=1">'
    '<title>Frontline Dominion v16.6.1</title>'
    '<meta http-equiv="refresh" content="0; url=./frontline-dominion.html?build=181"></head>'
    '<body><a href="./frontline-dominion.html?build=181">Запустить Frontline Dominion v16.6.1</a></body></html>',
    'utf-8',
)

print('Frontline Dominion v16.6.1 build 181 assembled')
