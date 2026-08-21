from pathlib import Path
import re

ROOT = Path('.')
SKIP_PARTS = {'.git', 'node_modules', '__pycache__', '.venv', 'audit-publish'}
CATEGORIES = {
    'economy': [
        'resourceTruck','resources','money','fuel','ammo','gas','crystal','alloy','relic','core',
        'warehouse','dropoff','resourceType','deposit','extractor','buildResourceExtractor','oil','iron',
        'productionQueue','power','income','trade','import'
    ],
    'ground': [
        'resourceTruck','supplyTruck','supply160','finiteAmmo','magazine','reserveAmmo','reload',
        'fuel','ammo','support','warehouse','dropoff','supplyRadius','formation','group','artillery',
        'missile','airDefense','abm','sam','resupply'
    ],
    'air': [
        'airbase','airfield','aircraft','plane','helicopter','sortie','fuel','ammo','support',
        'service','rearm','refuel','reload','missile','hangar','capacity'
    ],
    'state': [
        'save','load','getSaveData','serialize','deserialize','stateHash','networkStateHash',
        'applyAction','sendAction','actionAck','authoritative','snapshot','resources','supply160',
        'multiplayer','reconnect'
    ],
}


def eligible(path: Path) -> bool:
    if not path.is_file() or any(part in SKIP_PARTS for part in path.parts):
        return False
    name = path.name.lower()
    if name == 'frontline-dominion.html':
        return True
    if name.startswith('authoritative-simulation') and path.suffix == '.js':
        return True
    if path.suffix not in {'.js', '.html'}:
        return False
    try:
        if path.stat().st_size < 20_000:
            return False
    except OSError:
        return False
    return True


candidates = []
for path in ROOT.rglob('*'):
    if not eligible(path):
        continue
    try:
        text = path.read_text('utf-8', errors='replace')
    except OSError:
        continue
    low = text.lower()
    all_terms = {t.lower() for ts in CATEGORIES.values() for t in ts}
    hits = sorted(t for t in all_terms if t in low)
    if hits:
        candidates.append((path, text, hits))

index = ['BUILD 206 RUNTIME AUDIT INDEX']
for path, text, hits in sorted(candidates, key=lambda x: str(x[0])):
    index.append(f'{path} bytes={len(text)} hits={",".join(hits[:80])}')
Path('audit206-files.txt').write_text('\n'.join(index) + '\n', 'utf-8')


def emit_category(category: str, terms: list[str]) -> None:
    out = [f'BUILD 206 AUDIT CATEGORY: {category}']
    total_contexts = 0
    for path, text, _ in sorted(candidates, key=lambda x: str(x[0])):
        lines = text.splitlines()
        low_lines = [line.lower() for line in lines]
        file_hits = [t for t in terms if t.lower() in text.lower()]
        if not file_hits:
            continue
        out.append(f'\n===== FILE {path} bytes={len(text)} hits={",".join(file_hits)} =====')
        emitted = set()
        for term in file_hits:
            needle = term.lower()
            match_count = 0
            for idx, low_line in enumerate(low_lines):
                if needle not in low_line:
                    continue
                start = max(0, idx - 5)
                end = min(len(lines), idx + 7)
                key = (start, end)
                if key in emitted:
                    continue
                emitted.add(key)
                match_count += 1
                total_contexts += 1
                out.append(f'--- {term} @ L{idx+1} ---')
                out.extend(f'{j+1:06d}: {lines[j]}' for j in range(start, end))
                # Per-term and total caps keep the report connector-friendly.
                if match_count >= 18 or total_contexts >= 360:
                    break
            if total_contexts >= 360:
                break
        if total_contexts >= 360:
            out.append('... category context cap reached ...')
            break

    # Structural probes are useful even when minified legacy bundle has few lines.
    if category == 'state':
        for path, text, _ in candidates:
            if 'authoritative-simulation-worker' not in path.name:
                continue
            out.append(f'\n===== STRUCTURAL PROBES {path} =====')
            probes = [
                r'case\s+[\'\"][^\'\"]+[\'\"]\s*:',
                r'function\s+stateHash', r'function\s+networkStateHash',
                r'getSaveData', r'actionAck', r'applyAction', r'sendAction'
            ]
            for probe in probes:
                matches = list(re.finditer(probe, text))
                out.append(f'PROBE {probe} count={len(matches)}')
                for match in matches[:80]:
                    line_no = text.count('\n', 0, match.start()) + 1
                    snippet = text[max(0, match.start()-100):match.start()+260].replace('\n', ' ')
                    out.append(f'L{line_no}: {snippet}')

    target = Path(f'audit206-{category}.txt')
    target.write_text('\n'.join(out) + '\n', 'utf-8')
    print(f'{target}: contexts={total_contexts} bytes={target.stat().st_size}')


for category, terms in CATEGORIES.items():
    emit_category(category, terms)

# Backward-compatible compact summary.
summary = [
    f'candidates={len(candidates)}',
    *[f'{p.name} {len(text)}' for p, text, _ in candidates[:80]],
]
Path('audit206.txt').write_text('\n'.join(summary) + '\n', 'utf-8')
print(f'AUDIT206 candidates={len(candidates)}')
print('\n'.join(index[:200]))
