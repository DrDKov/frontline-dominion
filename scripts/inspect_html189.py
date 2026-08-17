from pathlib import Path
import re
import runpy

html_path = Path('dist/frontline-dominion.html')
if not html_path.exists():
    runpy.run_path('scripts/assemble188.py', run_name='__main__')
html = html_path.read_text('utf-8')
patterns = [
    r"start-game",
    r"load-game",
    r"new Game\(options\)",
    r"addEventListener\(['\"]click['\"]",
    r"startGame",
    r"function start",
]
for pattern in patterns:
    print(f'===== {pattern} =====')
    matches = list(re.finditer(pattern, html, flags=re.I))
    print('matches', len(matches))
    for index, match in enumerate(matches[:12]):
        start = max(0, match.start() - 1200)
        end = min(len(html), match.end() + 2400)
        snippet = html[start:end].replace('\n', '\\n')
        print(f'--- {index} at {match.start()} ---')
        print(snippet)
