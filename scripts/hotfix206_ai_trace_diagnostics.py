from pathlib import Path

WORKER = Path('dist/authoritative-simulation-worker-v174.js')
if not WORKER.exists():
    raise RuntimeError(f'build 206 AI trace target missing: {WORKER}')

text = WORKER.read_text('utf-8')
old = "    units: byId(aliveUnits).map(fp), buildings: byId(aliveBuildings).map(fp),\n"
new = (
    "    units: byId(aliveUnits).map(fp), buildings: byId(aliveBuildings).map(fp),\n"
    "    aiLogisticsTrace206: game.__aiLogisticsTrace206 || null,\n"
)
count = text.count(old)
if count != 1:
    raise RuntimeError(f'build 206 AI trace diagnostic anchor count={count}')
WORKER.write_text(text.replace(old, new, 1), 'utf-8')
print('Build 206 AI logistics stage trace exposed in matched-tick diagnostics')
