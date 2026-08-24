#!/usr/bin/env python3
"""Stage 1b: vendor the pinned legacy tree into src/legacy/.

Takes a reference tree that matches scripts/legacy-manifest.json exactly
(by sha256) and copies it into src/legacy/, so that
`python scripts/build.py --from-src` can reproduce dist/ offline,
without access to the published site.

Usage:
    python scripts/vendor_src_legacy.py --dist dist          # vendor a local tree
    python scripts/vendor_src_legacy.py --from-published     # download first, then vendor

The script is idempotent: src/legacy/ is rebuilt from scratch on every run,
and every copied file is re-hashed after writing (a copy that fails
verification aborts the run).
"""
from __future__ import annotations

import argparse
import datetime
import hashlib
import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / 'scripts' / 'legacy-manifest.json'
SRC_LEGACY = ROOT / 'src' / 'legacy'
BUILD = ROOT / 'scripts' / 'build.py'


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def verify_source(src: Path, manifest: dict, allow_extra: bool) -> int:
    errors = 0
    expected = {e['path'] for e in manifest['files']}
    for e in manifest['files']:
        p = src / e['path']
        if not p.is_file():
            print(f"vendor: missing in source: {e['path']}")
            errors += 1
            continue
        if sha256(p) != e['sha256']:
            print(f"vendor: sha256 mismatch in source: {e['path']}")
            errors += 1
    extra = sorted(
        p.relative_to(src).as_posix()
        for p in src.rglob('*')
        if p.is_file() and p.relative_to(src).as_posix() not in expected
    )
    if extra:
        msg = f'vendor: {len(extra)} file(s) not in manifest: {extra[:5]}'
        if allow_extra:
            print(f'{msg} (ignored, --allow-extra)')
        else:
            print(msg)
            errors += len(extra)
    print(f'vendor: source {src}: {len(manifest["files"])} pinned files, {errors} error(s)')
    return errors


def rmtree_retry(path: Path, attempts: int = 6) -> None:
    """shutil.rmtree with retries — some filesystems report ENOTEMPTY
    transiently when many files were just unlinked."""
    for i in range(attempts):
        try:
            shutil.rmtree(path)
            return
        except OSError:
            if i == attempts - 1 or not path.exists():
                if not path.exists():
                    return
                raise
            time.sleep(0.5 * (i + 1))


def copy_verified(src: Path, manifest: dict) -> int:
    if SRC_LEGACY.exists():
        rmtree_retry(SRC_LEGACY)
    SRC_LEGACY.mkdir(parents=True)
    errors = 0
    for e in manifest['files']:
        s = src / e['path']
        d = SRC_LEGACY / e['path']
        data = s.read_bytes()
        ok = False
        for attempt in range(6):
            try:
                d.parent.mkdir(parents=True, exist_ok=True)
                with open(d, 'wb') as fh:
                    fh.write(data)
                    fh.flush()
                    os.fsync(fh.fileno())
                if sha256(d) == e['sha256']:
                    ok = True
                    break
            except OSError:
                pass
            time.sleep(0.3 * (attempt + 1))
        if not ok:
            print(f"vendor: copied file failed verification: {e['path']}")
            errors += 1
    return errors


def write_provenance(manifest: dict, source_desc: str) -> None:
    now = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    text = (
        '# src/legacy — pinned legacy snapshot\n\n'
        f"- build: {manifest['build']}\n"
        f"- files: {len(manifest['files'])}\n"
        f"- manifest: scripts/legacy-manifest.json (generatedAt {manifest['generatedAt']})\n"
        f"- source: {source_desc}\n"
        f"- vendored at: {now}\n"
        '- vendored by: scripts/vendor_src_legacy.py\n\n'
        'Do not edit by hand — regenerate with scripts/vendor_src_legacy.py.\n'
    )
    (SRC_LEGACY / 'PROVENANCE.md').write_text(text, 'utf-8')


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--dist', type=Path, default=None,
                    help='reference tree to vendor (default: <repo>/dist)')
    ap.add_argument('--from-published', action='store_true',
                    help='materialize dist/ via build.py --from-published first')
    ap.add_argument('--allow-extra', action='store_true',
                    help='tolerate source files that are not in the manifest')
    args = ap.parse_args()

    if not MANIFEST.exists():
        raise SystemExit(f'vendor: manifest missing: {MANIFEST}')
    manifest = json.loads(MANIFEST.read_text('utf-8'))

    if args.from_published:
        rc = subprocess.run([sys.executable, str(BUILD), '--from-published']).returncode
        if rc:
            raise SystemExit(f'vendor: build.py --from-published failed (rc={rc})')

    src = (args.dist or ROOT / 'dist').resolve()
    if not src.is_dir():
        raise SystemExit(f'vendor: source tree missing: {src} '
                         f'(use --from-published to download it first)')

    errors = verify_source(src, manifest, args.allow_extra)
    if errors:
        raise SystemExit(f'vendor: source tree failed verification: {errors} error(s)')

    errors = copy_verified(src, manifest)
    write_provenance(manifest, f'{src} (sha256-verified against legacy-manifest.json)')
    if errors:
        raise SystemExit(f'vendor: copy verification failed: {errors} error(s)')
    print(f'vendor: {len(manifest["files"])} files vendored into {SRC_LEGACY}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
