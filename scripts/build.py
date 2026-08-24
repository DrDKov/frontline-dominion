#!/usr/bin/env python3
"""Patch-free build for Frontline Dominion (Stage 1).

Reproduces dist/ from a pinned base instead of replaying the historical
assemble chain:

    python scripts/build.py --from-src                 # copy src/legacy/ -> dist/
    python scripts/build.py --from-published           # download pinned published set
    python scripts/build.py --check                    # verify dist/ against manifest

The base is pinned by scripts/legacy-manifest.json (see legacy_manifest.py):
every file must match its recorded sha256. --check additionally verifies that
all script/import targets resolve and the requires/provides graph is closed
(via checkdeps.py).
"""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / 'scripts' / 'legacy-manifest.json'
SRC_LEGACY = ROOT / 'src' / 'legacy'
DIST = ROOT / 'dist'
UA = 'Mozilla/5.0 FrontlineDominion-build/1.0'


def load_manifest() -> dict:
    if not MANIFEST.exists():
        raise SystemExit(f'build: manifest missing: {MANIFEST} — run legacy_manifest.py first')
    return json.loads(MANIFEST.read_text('utf-8'))


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def reset_dist() -> None:
    if DIST.is_symlink() or DIST.is_file():
        DIST.unlink()
    elif DIST.exists():
        shutil.rmtree(DIST)


def from_src() -> None:
    if not SRC_LEGACY.is_dir():
        raise SystemExit(f'build: source snapshot missing: {SRC_LEGACY}')
    reset_dist()
    shutil.copytree(SRC_LEGACY, DIST)
    print(f'build: copied {SRC_LEGACY} -> {DIST}')


def fetch(url: str, dst: Path) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)
    last = None
    for _ in range(4):
        try:
            with urlopen(Request(url, headers={'User-Agent': UA, 'Cache-Control': 'no-cache'}), timeout=120) as r:
                dst.write_bytes(r.read())
            return
        except Exception as exc:  # noqa: BLE001 — retried below
            last = exc
    raise RuntimeError(f'{url}: {last}')


def from_published(manifest: dict) -> None:
    base = manifest['baseUrl']
    files = manifest['files']
    reset_dist()
    DIST.mkdir(parents=True)
    with ThreadPoolExecutor(max_workers=16) as pool:
        # Consume the iterator so fetch failures raise instead of passing silently.
        list(pool.map(lambda e: fetch(f"{base}/{e['path']}", DIST / e['path']), files))
    print(f'build: downloaded {len(files)} files from {base}')


def check(manifest: dict) -> int:
    errors = 0
    for entry in manifest['files']:
        p = DIST / entry['path']
        if not p.exists():
            print(f"build check: missing: {entry['path']}")
            errors += 1
            continue
        if entry['sha256'] != sha256(p):
            print(f"build check: sha256 drift: {entry['path']}")
            errors += 1
    print(f"build check: {len(manifest['files'])} pinned files, {errors} hash errors")
    if errors:
        return 1
    return subprocess.run([sys.executable, str(ROOT / 'scripts' / 'checkdeps.py'), '--dist', str(DIST)]).returncode


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument('--from-src', action='store_true')
    g.add_argument('--from-published', action='store_true')
    g.add_argument('--check', action='store_true')
    args = ap.parse_args()

    manifest = load_manifest()
    if args.from_src:
        from_src()
        return check(manifest)
    if args.from_published:
        from_published(manifest)
        return check(manifest)
    return check(manifest)


if __name__ == '__main__':
    sys.exit(main())
