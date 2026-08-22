from pathlib import Path
import re

OUT = Path('dist')
REPORT = Path('audit206-determinism.txt')
TARGETS = [
    'authoritative-simulation-bundle-v172.js',
    'authoritative-simulation-worker-v174.js',
    'operational-core-v160.js',
    'war-economy-ai-v126.js',
    'campaign-offensive-ai-v129.js',
    'adaptive-doctrine-ai-v131.js',
    'deep-operations-ai-v182.js',
    'action-group-simulation-v184.js',
    'resource-economy-v206.js',
    'unit-sustainment-v206.js',
    'ai-logistics-v206.js',
]
PATTERNS = [
    ('Math.random', re.compile(r'\bMath\.random\s*\(')),
    ('Date.now', re.compile(r'\bDate\.now\s*\(')),
    ('performance.now', re.compile(r'\bperformance\.now\s*\(')),
    ('new Date', re.compile(r'\bnew\s+Date\s*\(')),
    ('crypto random', re.compile(r'\bcrypto\.(?:getRandomValues|randomUUID)\s*\(')),
    ('setTimeout', re.compile(r'\bsetTimeout\s*\(')),
    ('setInterval', re.compile(r'\bsetInterval\s*\(')),
]


def context(lines, index, radius=4):
    lo = max(0, index - radius)
    hi = min(len(lines), index + radius + 1)
    return '\n'.join(f'{i + 1:6d}: {lines[i]}' for i in range(lo, hi))


def enclosing_hint(lines, index):
    patterns = [
        re.compile(r'^\s*(?:async\s+)?function\s+([\w$]+)'),
        re.compile(r'^\s*(?:static\s+)?(?:async\s+)?([\w$]+)\s*\([^)]*\)\s*\{'),
        re.compile(r'^\s*([\w$.]+)\s*=\s*(?:async\s*)?function'),
    ]
    for pos in range(index, max(-1, index - 180), -1):
        text = lines[pos]
        for pattern in patterns:
            match = pattern.search(text)
            if match:
                return f'line {pos + 1}: {match.group(1)}'
    return 'unknown'


report = ['BUILD206 DETERMINISM AUDIT', 'Simulation-time code must not branch on wall-clock or unseeded randomness.']
for name in TARGETS:
    path = OUT / name
    report.append(f'\n===== {name} =====')
    if not path.exists():
        report.append('FILE MISSING')
        continue
    text = path.read_text('utf-8', errors='replace')
    lines = text.splitlines()
    report.append(f'bytes={len(text)} lines={len(lines)}')
    any_hits = False
    for label, pattern in PATTERNS:
        hits = []
        for index, line in enumerate(lines):
            if pattern.search(line):
                hits.append(index)
        report.append(f'\n### {label}: {len(hits)}')
        for ordinal, index in enumerate(hits, 1):
            any_hits = True
            report.append(f'--- {label} #{ordinal} @ line {index + 1} · enclosing {enclosing_hint(lines, index)} ---')
            report.append(context(lines, index))
    if not any_hits:
        report.append('No nondeterministic-source tokens found.')

# Also report explicit RNG call sites separately. Seeded game.rng calls are expected,
# but this lets us compare them against any global random calls above.
for name in ['authoritative-simulation-bundle-v172.js', 'operational-core-v160.js', 'war-economy-ai-v126.js']:
    path = OUT / name
    if not path.exists():
        continue
    lines = path.read_text('utf-8', errors='replace').splitlines()
    hits = [i for i, line in enumerate(lines) if re.search(r'\b(?:this\.)?(?:game\.)?rng\.(?:next|float|int|chance|pick|range)\s*\(', line)]
    report.append(f'\n===== SEEDED RNG SITES {name}: {len(hits)} =====')
    for index in hits[:80]:
        report.append(f'--- line {index + 1} · enclosing {enclosing_hint(lines, index)} ---')
        report.append(context(lines, index, 2))

REPORT.write_text('\n'.join(report) + '\n', 'utf-8')
print(f'{REPORT} bytes={REPORT.stat().st_size}')
