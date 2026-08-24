#!/usr/bin/env python3
"""Static requires/provides audit for the Frontline Dominion module set.

Every legacy module communicates through versioned globals (`__FD_X__`). This
scanner extracts, per file:
  provides — globals the module assigns (`root.__FD_X__ = ...`) or installs as
             an alias fallback (`globalThis.__FD_X__ ||= ...`)
  requires — globals the module hard-reads (not optional-chained, not an alias
             fallback source, not a string literal, not typeof-guarded)
  loads    — files referenced via <script src> / importScripts patterns

The graph is then validated: every hard-required global must have at least one
provider in the set. Exits non-zero on structural errors so CI can gate on it.

Usage:
    python scripts/checkdeps.py --dist dist [--json deps-report.json]
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

PROVIDE_RE = re.compile(r'''(?:globalThis|window|self|root)\s*\.\s*(__FD_[A-Z0-9_]+__)\s*=(?!=)''')
ALIAS_PROVIDE_RE = re.compile(r'''(?:globalThis|window|self|root)\s*\.\s*(__FD_[A-Z0-9_]+__)\s*\|\|=''')
MENTION_RE = re.compile(r'''(__FD_[A-Z0-9_]+__)''')
QUOTED_FD_RE = re.compile(r'''(["'])[^"'\n]*__FD_[A-Z0-9_]+__[^"'\n]*\1''')
LOAD_RE = re.compile(r'''(?:src|href)=["'](?:/frontline-dominion/|\./|/)([^"']+?)["']|'''
                     r'''importScripts\(([^)]*)\)''')
LOAD_URL_RE = re.compile(r'''["'](?:/frontline-dominion/|\./|/)([^"']+?)["']''')

# Globals provided by the host page/test harness rather than a module file.
# The __FD_DEBUG* prefix covers console-enabled diagnostic flags that are
# intentionally never provided by any module.
HOST_PROVIDED = {'__FD_DEBUG__'}
HOST_PROVIDED_PREFIXES = ('__FD_DEBUG',)
# Aggregate bundles legitimately shadow individual modules (alias chains decide
# at runtime which copy wins); duplicate providers involving them are not
# structural problems.
KNOWN_AGGREGATES = {'authoritative-simulation-bundle-v172.js', 'authoritative-simulation-shim-v172.js'}


def optional_context(line: str, start: int, end: int) -> bool:
    """True if the mention at line[start:end] is an optional/alias read."""
    after = line[end:end + 2]
    if after == '?.':
        return True
    before = line[max(0, start - 8):start]
    if re.search(r'(typeof\s*|\|\|\s*|\?\?\s*)$', before):
        return True
    if '||=' in line:
        return True
    return False


def scan_file(path: Path, root: Path) -> dict:
    text = path.read_text('utf-8', errors='replace')
    provides = set(PROVIDE_RE.findall(text)) | set(ALIAS_PROVIDE_RE.findall(text))
    # Mask string literals that merely name globals (badges, greps, selectors).
    masked = QUOTED_FD_RE.sub(lambda m: ' ' * (m.end() - m.start()), text)
    requires = set()
    for line in masked.splitlines():
        for m in MENTION_RE.finditer(line):
            g = m.group(1)
            if g in provides or g in HOST_PROVIDED or g.startswith(HOST_PROVIDED_PREFIXES):
                continue
            if optional_context(line, m.start(), m.end()):
                continue
            requires.add(g)
    loads = set()
    for m in LOAD_RE.finditer(text):
        chunk = m.group(1) or m.group(2) or ''
        for u in LOAD_URL_RE.findall(chunk):
            u = u.split('?', 1)[0]
            if re.search(r'\.(?:js|json|css)$', u):
                loads.add(u)
    return {
        'file': path.relative_to(root).as_posix(),
        'provides': sorted(provides),
        'requires': sorted(requires),
        'loads': sorted(loads),
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--dist', default='dist')
    ap.add_argument('--json', help='optional report output path')
    args = ap.parse_args()

    root = Path(args.dist)
    if not root.is_dir():
        print(f'checkdeps: dist root missing: {root}', file=sys.stderr)
        return 2

    modules = [scan_file(p, root) for p in sorted(root.rglob('*')) if p.suffix in ('.js', '.html')]
    providers: dict[str, list[str]] = {}
    for mod in modules:
        for g in mod['provides']:
            providers.setdefault(g, []).append(mod['file'])

    errors = []
    for mod in modules:
        for g in mod['requires']:
            if g not in providers:
                errors.append(f"unresolved: {mod['file']} requires {g}, no provider in set")
    for g, owners in sorted(providers.items()):
        if len(owners) > 1 and not (set(owners) & KNOWN_AGGREGATES):
            print(f"checkdeps: warning: {g} provided by {len(owners)} files: {', '.join(owners)}")

    present = {p.relative_to(root).as_posix() for p in root.rglob('*') if p.is_file()}
    for mod in modules:
        for ref in mod['loads']:
            if ref not in present and not ref.startswith('cdn-cgi'):
                errors.append(f"missing load target: {mod['file']} -> {ref}")

    report = {'modules': modules, 'providers': providers, 'errors': errors}
    if args.json:
        Path(args.json).write_text(json.dumps(report, ensure_ascii=False, indent=1) + '\n', 'utf-8')

    print(f'checkdeps: {len(modules)} modules scanned, {len(providers)} globals provided, {len(errors)} errors')
    for e in errors[:40]:
        print(f'checkdeps: error: {e}')
    return 1 if errors else 0


if __name__ == '__main__':
    sys.exit(main())
