from pathlib import Path

OUT = Path('dist')
MARKER = "const lead=document.querySelector('#start-screen .lead');if(lead)void 0;"
repairs = []

for path in sorted(OUT.glob('*.js')):
    text = path.read_text('utf-8')
    lines = text.splitlines(keepends=True)
    changed = False
    repaired_lines = []
    for line_number, line in enumerate(lines, 1):
        marker_at = line.find(MARKER)
        if marker_at < 0:
            repaired_lines.append(line)
            continue
        marker_end = marker_at + len(MARKER)
        tail = line[marker_end:]
        # assemble189's legacy regex could stop at a semicolon *inside* the
        # quoted Russian description. The remaining text then became raw JS.
        # Preserve the valid declaration and remove only that orphaned tail.
        if tail.strip():
            ending = '\n' if line.endswith('\n') else ''
            line = line[:marker_end] + ending
            changed = True
            repairs.append(f'{path.name}:{line_number}')
        repaired_lines.append(line)
    if changed:
        path.write_text(''.join(repaired_lines), 'utf-8')

if not repairs:
    raise RuntimeError('build 189 expected legacy lead repair was not applied')
print('build 189 repaired legacy lead writers:', ', '.join(repairs))
