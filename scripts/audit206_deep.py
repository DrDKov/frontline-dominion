from pathlib import Path

OUT = Path('dist')
TARGETS = {
    'bundle': ('authoritative-simulation-bundle-v172.js', [
        'resourceTruck','dropoff128','logisticsExtractor128','supply160','resources[','this.resources',
        'resourceNodes','resourceType','cargoCapacity','cargo','warehouse','oil','gas','crystal','alloy',
        'relic','core','ammo','fuel','support','extract','deposit','productionQueue'
    ]),
    'ammo': ('finite-ammunition-network-v139.js', [
        'magazine','reserve','reload','ammo','missile','fire','consume','resupply','aircraft','helicopter','sam','abm'
    ]),
    'airbase': ('airbase-v93.js', [
        'fuel','ammo','service','sortie','hangar','airfield','airbase','aircraft','helicopter','rearm','refuel','stock'
    ]),
    'airwar': ('air-war-navigation-v133.js', [
        'fuel','ammo','service','sortie','airfield','aircraft','helicopter','support','return','base'
    ]),
    'economyai': ('war-economy-ai-v126.js', [
        'resourceTruck','dropoff','extractor','gas','oil','resources','income','airfield','power','build','supply'
    ]),
    'operational': ('operational-core-v160.js', [
        'supply160','supply','resourceTruck','resources','airfield','artillery','stateHash','update','serialize'
    ]),
    'worker': ('authoritative-simulation-worker-v174.js', [
        'applyAction','actionAck','buildResourceExtractor','stateHash','networkStateHash','getSaveData','resources',
        'supply160','snapshot','serialize','save','load'
    ]),
    'bridge': ('authoritative-simulation-v174.js', [
        'sendAction','actionAck','stateHash','resources','supply160','snapshot','save','load'
    ]),
}


def clip(text: str, start: int, end: int) -> str:
    a = max(0, start)
    b = min(len(text), end)
    return text[a:b].replace('\x00','')


def context_for(text: str, pos: int, radius: int = 1800) -> str:
    # Prefer complete nearby lines where source is formatted, otherwise character context handles minified bundle.
    line_start = text.rfind('\n', 0, max(0, pos - radius))
    line_end = text.find('\n', min(len(text), pos + radius))
    if line_start >= 0 and line_end >= 0 and line_end - line_start <= radius * 3:
        return text[line_start + 1:line_end]
    return clip(text, pos - radius, pos + radius)

for label, (name, needles) in TARGETS.items():
    path = OUT / name
    report = [f'BUILD206 DEEP AUDIT {label}: {name}']
    if not path.exists():
        report.append('FILE MISSING')
        Path(f'audit206-deep-{label}.txt').write_text('\n'.join(report), 'utf-8')
        continue
    text = path.read_text('utf-8', errors='replace')
    low = text.lower()
    report.append(f'bytes={len(text)} lines={text.count(chr(10))+1}')
    emitted_ranges = []
    for needle in needles:
        nl = needle.lower()
        positions = []
        cursor = 0
        while len(positions) < 10:
            pos = low.find(nl, cursor)
            if pos < 0:
                break
            positions.append(pos)
            cursor = pos + len(nl)
        report.append(f'\n### NEEDLE {needle} count_sample={len(positions)}')
        for ordinal, pos in enumerate(positions, 1):
            # Avoid printing near-identical regions hit by related terms.
            rng = (max(0, pos - 1800), min(len(text), pos + 1800))
            if any(abs(rng[0] - old[0]) < 350 for old in emitted_ranges):
                continue
            emitted_ranges.append(rng)
            line = text.count('\n', 0, pos) + 1
            report.append(f'--- {needle} #{ordinal} offset={pos} line={line} ---')
            report.append(context_for(text, pos))
    target = Path(f'audit206-deep-{label}.txt')
    target.write_text('\n'.join(report) + '\n', 'utf-8')
    print(f'{target} bytes={target.stat().st_size}')
