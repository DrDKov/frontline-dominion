from pathlib import Path

worker = Path('dist/authoritative-simulation-worker-v174.js')
if not worker.exists():
    raise RuntimeError('missing build 196 Worker output')

text = worker.read_text('utf-8')
line = "importScripts('/frontline-dominion/post-load-command-recovery-v196.js?build=196');\n"
if text.count(line) != 1:
    raise RuntimeError(f'post-load Worker import count mismatch: {text.count(line)}')
text = text.replace(line, '', 1)
worker.write_text(text, 'utf-8')

# Post-load recovery is a browser/UI authority repair. It intentionally stays
# on the main thread; importing it into the authoritative Worker provides no
# useful routeAction/hydrate behavior (document is absent) and can trip engine
# read-only descriptors during Worker initialization on WebKit.
print('build 196 post-load recovery restricted to main thread')
