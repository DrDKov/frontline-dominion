#!/usr/bin/env python3
"""Generate a pinned manifest for a known-good Frontline Dominion file set.

Stage-1 source-of-truth tool: instead of replaying the historical patch chain,
dist/ is reproduced from either a local src/legacy/ snapshot or the published
artifact — and every file is pinned here by sha256 so drift and tampering are
detected, not silently inherited.

Usage:
    python scripts/legacy_manifest.py --dist dist --build 213 \
        --base-url https://drdkov.github.io/frontline-dominion \
        --out scripts/legacy-manifest.json

The generated JSON is deterministic (sorted keys, fixed separators) so diffs
between builds stay minimal and reviewable.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path


def file_entry(path: Path, root: Path) -> dict:
    data = path.read_bytes()
    return {
        'path': path.relative_to(root).as_posix(),
        'size': len(data),
        'sha256': hashlib.sha256(data).hexdigest(),
    }


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--dist', default='dist', help='assembled/published file set root')
    ap.add_argument('--build', required=True, type=int, help='canonical build number')
    ap.add_argument('--base-url', required=True, help='published base URL (no trailing slash)')
    ap.add_argument('--out', default='scripts/legacy-manifest.json')
    args = ap.parse_args()

    root = Path(args.dist)
    if not root.is_dir():
        raise SystemExit(f'manifest: dist root missing: {root}')
    html = root / 'frontline-dominion.html'
    if not html.exists():
        raise SystemExit(f'manifest: {html} missing — not a game file set')

    files = [file_entry(p, root) for p in sorted(root.rglob('*')) if p.is_file()]
    if len(files) < 50:
        raise SystemExit(f'manifest: only {len(files)} files — suspiciously incomplete set')

    manifest = {
        'build': args.build,
        'generatedAt': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
        'baseUrl': args.base_url.rstrip('/'),
        'fileCount': len(files),
        'files': files,
    }
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(manifest, ensure_ascii=False, indent=1, sort_keys=True) + '\n', 'utf-8')
    print(f'manifest: {len(files)} files pinned for build {args.build} -> {out}')


if __name__ == '__main__':
    main()
