#!/usr/bin/env python3
"""One-time materialization of the src/legacy snapshot (Stage 1b).

Downloads the pinned build-213 file set described by scripts/legacy-manifest.json
from the published site, verifies sha256+size of every file against the
manifest, writes the tree to src/legacy/, and pushes it as a single commit on
top of the current HEAD to refs/heads/stage1-legacy-snapshot.

Safety properties:
  - Guarded: does nothing if the remote snapshot branch already exists
    (override with --force).
  - Fail-safe: NEVER exits non-zero when invoked from the release chain;
    it only pushes a fully verified tree (all 836 hashes must match).
  - Does not touch dist/ or any other part of the working tree.

Usage:
  python scripts/materialize_legacy.py            # full run (download+verify+push)
  python scripts/materialize_legacy.py --no-git   # download+verify only
  python scripts/materialize_legacy.py --force    # overwrite existing snapshot branch
"""
import concurrent.futures
import hashlib
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MANIFEST_PATH = ROOT / 'scripts' / 'legacy-manifest.json'
LEGACY_DIR = ROOT / 'src' / 'legacy'
BRANCH = 'stage1-legacy-snapshot'
INFO_NAME = '.snapshot-info.json'
WORKERS = 8
ATTEMPTS = 5


def log(msg):
    print(f'[materialize-legacy] {msg}', flush=True)


def run(cmd, check=False):
    return subprocess.run(cmd, cwd=str(ROOT), capture_output=True, text=True, check=check)


def remote_branch_exists():
    res = run(['git', 'ls-remote', '--heads', 'origin', BRANCH])
    return res.returncode == 0 and BRANCH in res.stdout


def load_manifest():
    data = json.loads(MANIFEST_PATH.read_text('utf-8'))
    return data['baseUrl'].rstrip('/'), data['files']


def fetch_one(entry):
    path = entry['path']
    url_path = '/'.join(urllib.request.quote(p) for p in path.split('/'))
    url = f'{fetch_one.base}/{url_path}'
    delay = 1.0
    for attempt in range(1, ATTEMPTS + 1):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'fd-legacy-materialize/1.0'})
            with urllib.request.urlopen(req, timeout=120) as resp:
                data = resp.read()
            if len(data) == entry['size'] and hashlib.sha256(data).hexdigest() == entry['sha256']:
                return path, data, None
            err = f'hash/size mismatch (got {len(data)} bytes)'
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, OSError) as exc:
            err = str(exc)
        if attempt < ATTEMPTS:
            time.sleep(delay)
            delay = min(delay * 2, 30)
    return path, None, err


def download_all(base, entries):
    fetch_one.base = base
    ok, failed = 0, []
    with concurrent.futures.ThreadPoolExecutor(max_workers=WORKERS) as pool:
        futures = [pool.submit(fetch_one, e) for e in entries]
        for i, fut in enumerate(concurrent.futures.as_completed(futures), 1):
            path, data, err = fut.result()
            if data is None:
                failed.append((path, err))
                log(f'FAIL {path}: {err}')
            else:
                target = LEGACY_DIR / path
                target.parent.mkdir(parents=True, exist_ok=True)
                tmp = target.with_suffix(target.suffix + '.tmp')
                tmp.write_bytes(data)
                os.replace(tmp, target)
                ok += 1
            if i % 100 == 0 or i == len(entries):
                log(f'progress {i}/{len(entries)} (ok={ok}, failed={len(failed)})')
    return ok, failed


def verify_tree(entries):
    bad = []
    for e in entries:
        p = LEGACY_DIR / e['path']
        try:
            data = p.read_bytes()
        except OSError:
            bad.append((e['path'], 'missing'))
            continue
        if len(data) != e['size'] or hashlib.sha256(data).hexdigest() != e['sha256']:
            bad.append((e['path'], 'hash mismatch'))
    return bad


def git_push(manifest, force):
    run(['git', 'config', 'user.name', 'github-actions[bot]'])
    run(['git', 'config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com'])
    res = run(['git', 'add', 'src/legacy'])
    if res.returncode != 0:
        log(f'git add failed: {res.stderr.strip()}')
        return False
    msg = (f"stage1b: materialize src/legacy snapshot of build {manifest.get('build')} "
           f"({manifest.get('fileCount')} pinned files, sha256-verified)")
    res = run(['git', 'commit', '-m', msg])
    if res.returncode != 0:
        log(f'git commit failed: {res.stderr.strip()}')
        return False
    refspec = f'HEAD:refs/heads/{BRANCH}'
    if force:
        refspec = '+' + refspec
    res = run(['git', 'push', 'origin', refspec])
    if res.returncode != 0:
        log(f'git push failed: {res.stderr.strip()}')
        return False
    log(f'pushed {BRANCH}')
    return True


def main():
    no_git = '--no-git' in sys.argv
    force = '--force' in sys.argv
    try:
        if not no_git and not force and remote_branch_exists():
            log(f'remote branch {BRANCH} already exists; nothing to do')
            return 0
        base, entries = load_manifest()
        log(f'manifest: {len(entries)} pinned files from {base}')
        if LEGACY_DIR.exists():
            import shutil
            shutil.rmtree(LEGACY_DIR, ignore_errors=True)
        ok, failed = download_all(base, entries)
        if failed:
            log(f'download incomplete: {len(failed)} failures; aborting (no push)')
            return 0
        bad = verify_tree(entries)
        if bad:
            log(f'on-disk verification failed for {len(bad)} files; aborting (no push)')
            return 0
        info = {
            'build': json.loads(MANIFEST_PATH.read_text('utf-8')).get('build'),
            'fileCount': len(entries),
            'source': base,
            'manifest': 'scripts/legacy-manifest.json',
            'manifestSha256': hashlib.sha256(MANIFEST_PATH.read_bytes()).hexdigest(),
            'generatedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
            'note': 'Byte-exact snapshot of the published build; verified against the pinned manifest.',
        }
        (LEGACY_DIR / INFO_NAME).write_text(json.dumps(info, indent=1, sort_keys=True) + '\n', 'utf-8')
        log(f'verified {ok}/{len(entries)} files in src/legacy')
        if no_git:
            log('--no-git: skipping commit/push')
            return 0
        git_push(info, force)
        return 0
    except Exception as exc:  # fail-safe: never break the release chain
        log(f'unexpected error (ignored): {exc!r}')
        return 0


if __name__ == '__main__':
    sys.exit(main())
