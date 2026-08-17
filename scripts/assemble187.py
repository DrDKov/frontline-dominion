from pathlib import Path
import re, runpy

ROOT = Path('.')
OUT = ROOT / 'dist'
VERSION = '16.8.3'
BUILD = 187

if not (OUT / 'frontline-dominion.html').exists():
    runpy.run_path('scripts/assemble186.py', run_name='__main__')


def replace_once(text, old, new, label):
    if old not in text:
        raise RuntimeError(f'build 187 patch anchor missing: {label}')
    return text.replace(old, new, 1)

# Canonical build-187 UI and final browser shell owner.
for source_name in ('runtime-ui-v187.js', 'runtime-shell-v187.js'):
    source = ROOT / 'src' / 'v187' / source_name
    if not source.exists():
        raise RuntimeError(f'build 187 source missing: {source_name}')
    (OUT / source_name).write_text(source.read_text('utf-8'), 'utf-8')

# Historical gameplay modules must never own current browser metadata. Keeping the
# mechanics is intentional; only their obsolete title/start-eyebrow writes become no-ops.
title_writers = []
eyebrow_writers = []
for path in sorted(OUT.glob('*.js')):
    if path.name == 'runtime-shell-v187.js':
        continue
    text = path.read_text('utf-8')
    title_count = len(re.findall(r'document\.title\s*=', text))
    eyebrow_count = len(re.findall(r'\beyebrow\.textContent\s*=', text))
    if title_count:
        title_writers.append((path.name, title_count))
        text = re.sub(r'document\.title\s*=\s*[^;]+;', 'void 0;', text)
    if eyebrow_count:
        eyebrow_writers.append((path.name, eyebrow_count))
        text = re.sub(r'\beyebrow\.textContent\s*=\s*[^;]+;', 'void 0;', text)
    path.write_text(text, 'utf-8')

# Browser shell: remove the orphaned build-183 boot gate before WebKit parses the page.
html_path = OUT / 'frontline-dominion.html'
html = html_path.read_text('utf-8')
html = re.sub(r'\s*<script[^>]+id=["\']fd-boot183-script["\'][^>]*>.*?</script>', '', html, flags=re.I | re.S)
html = re.sub(r'\s*<style[^>]+id=["\']fd-boot183-style["\'][^>]*>.*?</style>', '', html, flags=re.I | re.S)
html = re.sub(r'\s*<script[^>]+src=["\']\./runtime-ui-v18[5-7]\.js(?:\?build=\d+)?["\'][^>]*></script>', '', html, flags=re.I)
html = re.sub(r'\s*<script[^>]+src=["\']\./runtime-shell-v187\.js(?:\?build=\d+)?["\'][^>]*></script>', '', html, flags=re.I)
html = re.sub(r'<title>.*?</title>', f'<title>Frontline Dominion v{VERSION} — Safari Startup Recovery</title>', html, count=1, flags=re.S)
# Neutralize any obsolete inline metadata writer too.
html = re.sub(r'document\.title\s*=\s*[^;]+;', 'void 0;', html)

# One cache namespace for every main-thread JS resource. This prevents Safari from
# composing a page from multiple historical cache generations.
def cache_bust(match):
    return f'{match.group(1)}?build={BUILD}{match.group(2)}'

html = re.sub(
    r'(<script\b[^>]*\bsrc=["\']\./[^"\']+\.js)(?:\?build=\d+)?(["\'][^>]*></script>)',
    cache_bust,
    html,
    flags=re.I,
)

prof = re.search(r'<script\b[^>]*src=["\']\./simulation-profiler-v166\.js\?build=187["\'][^>]*></script>', html, flags=re.I)
if not prof:
    raise RuntimeError('build 187 profiler tag missing after cache normalization')
html = html[:prof.start()] + '<script src="./runtime-ui-v187.js?build=187"></script>\n' + html[prof.start():]
if '</body>' not in html:
    raise RuntimeError('build 187 closing body missing')
html = html.replace('</body>', '<script src="./runtime-shell-v187.js?build=187"></script>\n</body>', 1)

# No orphan boot gate may survive in the actual page shell.
if 'fd-boot183-script' in html or 'fd-boot183-style' in html:
    raise RuntimeError('build 187 orphan boot gate survived')
if 'runtime-ui-v186.js' in html or 'runtime-ui-v185.js' in html:
    raise RuntimeError('build 187 old runtime UI survived')
if len(re.findall(r'runtime-shell-v187\.js\?build=187', html)) != 1:
    raise RuntimeError('build 187 canonical runtime shell count invalid')
html_path.write_text(html, 'utf-8')

# Authoritative bridge build metadata and Worker cache key.
p = OUT / 'authoritative-simulation-v174.js'
s = p.read_text('utf-8')
s = replace_once(s, "const BUILD = 186;\nconst VERSION = '16.8.2';", "const BUILD = 187;\nconst VERSION = '16.8.3';", 'bridge version')
s, n = re.subn(
    r"new Worker\('/frontline-dominion/authoritative-simulation-worker-v174\.js\?build=\d+'\)",
    "new Worker('/frontline-dominion/authoritative-simulation-worker-v174.js?build=187')",
    s,
    count=1,
)
if n != 1:
    raise RuntimeError('build 187 bridge worker URL anchor missing')
s = s.replace(
    "window.__FD_STABLE_STATE165__ = { version: '16.8.2', build: 186, bridge: this, transport: this.transportMode165, counts: {} };",
    "window.__FD_STABLE_STATE165__ = { version: '16.8.3', build: 187, bridge: this, transport: this.transportMode165, counts: {} };",
)
p.write_text(s, 'utf-8')

# Worker build metadata. Command/pause recovery from build 186 remains unchanged.
p = OUT / 'authoritative-simulation-worker-v174.js'
s = p.read_text('utf-8')
s = replace_once(s, "const BUILD = 186;\nconst VERSION = '16.8.2';", "const BUILD = 187;\nconst VERSION = '16.8.3';", 'worker version')
p.write_text(s, 'utf-8')

# Profiler build metadata.
p = OUT / 'simulation-profiler-v166.js'
s = p.read_text('utf-8')
s = s.replace("const VERSION = '16.8.2';\n  const BUILD = 186;", "const VERSION = '16.8.3';\n  const BUILD = 187;", 1)
p.write_text(s, 'utf-8')

launcher = f'''<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="color-scheme" content="dark"><title>Frontline Dominion v{VERSION}</title><style>
*{{box-sizing:border-box}}html,body{{margin:0;min-height:100%;background:#050b10;color:#dcecf4;font-family:system-ui,sans-serif}}
body{{display:grid;place-items:center;min-height:100vh;padding:24px;background:#071019}}
main{{width:min(720px,100%);padding:36px;border:1px solid #365363;border-radius:18px;background:#0a151d}}
a{{display:inline-flex;min-height:54px;align-items:center;padding:0 24px;border-radius:10px;background:#d9edf7;color:#071019;text-decoration:none;font-weight:900}}
</style></head><body><main>
<div>ЕДИНСТВЕННАЯ АКТУАЛЬНАЯ СБОРКА · BUILD {BUILD}</div><h1>Frontline Dominion</h1>
<p>Safari Startup Recovery: удалён конфликт исторических загрузчиков и версий, стартовый экран WebKit больше не остаётся скрытым; сохранены Command Recovery и все механики build 186.</p>
<a id="launch" href="./frontline-dominion.html?build={BUILD}">Запустить игру</a><p>v{VERSION} · build {BUILD} · GitHub Pages</p>
</main></body></html>'''
(OUT / 'index.html').write_text(launcher, 'utf-8')

print('Historical title writers neutralized:', title_writers)
print('Historical eyebrow writers neutralized:', eyebrow_writers)
print(f'Frontline Dominion v{VERSION} build {BUILD} assembled')
