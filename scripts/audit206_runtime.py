from pathlib import Path
import re

OUT = Path('dist')
TERMS = [
    'resourceTruck','supply160','finiteAmmo','ammo','fuel','gas','crystal','alloy','relic','core',
    'warehouse','dropoff','airbase','airfield','helicopter','missile','reload','support','power',
    'save','load','serialize','deserialize','stateHash','networkStateHash','applyAction','sendAction',
    'productionQueue','buildResourceExtractor','resourceType','deposit','extractor'
]

lines = []
for path in sorted(list(OUT.glob('*.js')) + [OUT / 'frontline-dominion.html']):
    if not path.exists():
        continue
    text = path.read_text('utf-8', errors='replace')
    low = text.lower()
    hits = [term for term in TERMS if term.lower() in low]
    if not hits:
        continue
    lines.append(f'\n===== FILE {path.name} size={len(text)} hits={",".join(hits)} =====')
    src_lines = text.splitlines()
    emitted = set()
    for term in hits:
        needle = term.lower()
        for idx, line in enumerate(src_lines):
            if needle not in line.lower():
                continue
            start = max(0, idx - 4)
            end = min(len(src_lines), idx + 5)
            key = (start, end)
            if key in emitted:
                continue
            emitted.add(key)
            lines.append(f'--- {term} @ {idx+1} ---')
            for j in range(start, end):
                lines.append(f'{j+1:06d}: {src_lines[j]}')
            if len(emitted) >= 120:
                lines.append('... context cap reached for file ...')
                break
        if len(emitted) >= 120:
            break

# Dedicated structural probes on the authoritative worker.
worker = OUT / 'authoritative-simulation-worker-v174.js'
if worker.exists():
    text = worker.read_text('utf-8', errors='replace')
    lines.append('\n===== AUTHORITATIVE WORKER STRUCTURAL PROBES =====')
    probes = [
        r'class\s+Game\b', r'class\s+Unit\b', r'class\s+Building\b', r'class\s+Resource',
        r'case\s+[\'\"][^\'\"]+[\'\"]\s*:', r'function\s+stateHash', r'function\s+networkStateHash',
        r'prototype\.[A-Za-z0-9_]+\s*=', r'update\w*\s*\([^)]*\)\s*\{', r'save\s*\([^)]*\)\s*\{'
    ]
    for probe in probes:
        matches = list(re.finditer(probe, text))
        lines.append(f'PROBE {probe} count={len(matches)}')
        for match in matches[:80]:
            line_no = text.count('\n', 0, match.start()) + 1
            snippet = text[match.start(): match.start()+180].replace('\n',' ')
            lines.append(f'  L{line_no}: {snippet}')

out = Path('audit206.txt')
out.write_text('\n'.join(lines), 'utf-8')
print(f'AUDIT206 lines={len(lines)} bytes={out.stat().st_size}')
# Print enough for Actions logs; artifact preserves the full audit.
print('\n'.join(lines[:9000]))
