from pathlib import Path
import base64
import hashlib
import json
import re
import runpy
import zlib

runpy.run_path('scripts/assemble182.py', run_name='__main__')
OUT = Path('dist')
ROOT = Path('.')
VERSION = '16.7'
BUILD = 183


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise RuntimeError(f'v16.7 assembly anchor missing: {label}')
    return text.replace(old, new, 1)


module_parts = sorted((ROOT / 'scripts').glob('v183-modules.zb64.*'))
if not module_parts:
    raise RuntimeError('v16.7 module package missing')
module_payload = zlib.decompress(base64.b64decode(''.join(part.read_text('ascii') for part in module_parts)))
if hashlib.sha256(module_payload).hexdigest() != '538a64d36d7925cccee154a11a7910628dc96cf7c12b42bc08582ce788ffe43d':
    raise RuntimeError('v16.7 module package checksum mismatch')
modules = json.loads(module_payload.decode('utf-8'))
expected_modules = {
    'formation-march-core-v183.js',
    'fortress-defense-ai-v183.js',
    'start-screen-stable-v183.js',
}
if set(modules) != expected_modules:
    raise RuntimeError(f'v16.7 module set mismatch: {sorted(modules)}')
for name, content in modules.items():
    (OUT / name).write_text(content, 'utf-8')

test_parts = sorted((ROOT / 'tests').glob('verify183.zb64.*'))
if not test_parts:
    raise RuntimeError('v16.7 verification package missing')
test_payload = zlib.decompress(base64.b64decode(''.join(part.read_text('ascii') for part in test_parts)))
if hashlib.sha256(test_payload).hexdigest() != 'd2a502c25006ef26f1ac796e938402d773cf2e6f806f4bd0cbcd09c4c00c1bb8':
    raise RuntimeError('v16.7 verification package checksum mismatch')
(ROOT / 'tests' / 'verify183.generated.js').write_bytes(test_payload)

# Browser shell. Hide the start screen before legacy modules can successively
# rewrite it; reveal it only after one final build-183 owner has populated it.
html_path = OUT / 'frontline-dominion.html'
html = html_path.read_text('utf-8')
html = re.sub(
    r'<title>.*?</title>',
    '<title>Frontline Dominion v16.7 — Formation & Fortress Core</title>',
    html,
    count=1,
    flags=re.S,
)
html = re.sub(
    r'\s*<script[^>]+src=["\'][^"\']*(?:formation-march-core-v183|fortress-defense-ai-v183|start-screen-stable-v183)\.js[^"\']*["\'][^>]*></script>',
    '',
    html,
    flags=re.I,
)
html = re.sub(r'\s*<style[^>]+id=["\']fd-boot183-style["\'][^>]*>.*?</style>', '', html, flags=re.I | re.S)
html = re.sub(r'\s*<script[^>]+id=["\']fd-boot183-script["\'][^>]*>.*?</script>', '', html, flags=re.I | re.S)
boot_head = (
    '<script id="fd-boot183-script">document.documentElement.classList.add("fd-boot183");</script>'
    '<style id="fd-boot183-style">'
    '.fd-boot183 #start-screen{visibility:hidden!important;opacity:0!important;pointer-events:none!important}'
    '.fd-ready183 #start-screen{visibility:visible;opacity:1;transition:opacity .16s ease}'
    '</style>'
)
if '</head>' not in html:
    raise RuntimeError('v16.7 assembly: closing head tag not found')
html = html.replace('</head>', boot_head + '</head>', 1)

profiler_re = re.compile(r'<script src=["\']\./simulation-profiler-v166\.js\?build=\d+["\']></script>')
match = profiler_re.search(html)
if not match:
    raise RuntimeError('v16.7 assembly: profiler tag not found')
replacement = (
    '<script src="./formation-march-core-v183.js?build=183"></script>\n'
    '<script src="./fortress-defense-ai-v183.js?build=183"></script>\n'
    '<script src="./simulation-profiler-v166.js?build=183"></script>'
)
html = html[:match.start()] + replacement + html[match.end():]

# The canonical start-screen owner must run after every gameplay/doctrine UI
# writer, but the minimap owner remains the last canvas patch.
mini_tag = '<script src="./minimap-atomic-v181.js?build=181"></script>'
if mini_tag not in html:
    raise RuntimeError('v16.7 assembly: final minimap tag not found')
html = html.replace(
    mini_tag,
    '<script src="./start-screen-stable-v183.js?build=183"></script>\n' + mini_tag,
    1,
)
html = re.sub(r'(authoritative-simulation-v174\.js)\?build=\d+', r'\1?build=183', html)
html_path.write_text(html, 'utf-8')

# Main-thread bridge version and Worker cache-bust.
bridge_path = OUT / 'authoritative-simulation-v174.js'
bridge = bridge_path.read_text('utf-8')
bridge, count = re.subn(
    r"const BUILD = 182;\nconst VERSION = '16\.6\.2';",
    "const BUILD = 183;\nconst VERSION = '16.7';",
    bridge,
    count=1,
)
if count != 1:
    raise RuntimeError('v16.7 assembly: bridge version anchor missing')
bridge = re.sub(
    r"new Worker\('/frontline-dominion/authoritative-simulation-worker-v174\.js\?build=\d+'\)",
    "new Worker('/frontline-dominion/authoritative-simulation-worker-v174.js?build=183')",
    bridge,
    count=1,
)
bridge = bridge.replace(
    "window.__FD_STABLE_STATE165__ = { version: '16.6.2', build: 182, bridge: this, transport: this.transportMode165, counts: {} };",
    "window.__FD_STABLE_STATE165__ = { version: '16.7', build: 183, bridge: this, transport: this.transportMode165, counts: {} };",
)
bridge = bridge.replace(
    "this.game.alert?.(`Operational Campaign AI · Worker 25 Гц · ${this.transportMode165 === 'shared-triple' ? 'SAB triple buffer' : 'transfer fallback'}`, 'info');",
    "this.game.alert?.(`Formation & Fortress Core · Worker 25 Гц · ${this.transportMode165 === 'shared-triple' ? 'SAB triple buffer' : 'transfer fallback'}`, 'info');",
)
bridge_path.write_text(bridge, 'utf-8')

# Authoritative Worker owns both the aggregate formation march and fortress AI.
worker_path = OUT / 'authoritative-simulation-worker-v174.js'
worker = worker_path.read_text('utf-8')
worker, count = re.subn(
    r"const BUILD = 182;\nconst VERSION = '16\.6\.2';",
    "const BUILD = 183;\nconst VERSION = '16.7';",
    worker,
    count=1,
)
if count != 1:
    raise RuntimeError('v16.7 assembly: worker version anchor missing')
deep_import = "importScripts('/frontline-dominion/deep-operations-ai-v182.js?build=182');\n"
worker = replace_once(
    worker,
    deep_import,
    deep_import +
    "importScripts('/frontline-dominion/formation-march-core-v183.js?build=183');\n" +
    "importScripts('/frontline-dominion/fortress-defense-ai-v183.js?build=183');\n",
    'worker v183 imports',
)
worker, count = re.subn(
    r"combat166: game\.combatScaleDiagnostics166\?\.\(\) \|\| null, deep182: game\.deepOperationsDiagnostics182\?\.\(\) \|\| null",
    "combat166: game.combatScaleDiagnostics166?.() || null, deep182: game.deepOperationsDiagnostics182?.() || null, formation183: game.formationMarchDiagnostics183?.() || null, fortress183: game.fortressDefenseDiagnostics183?.() || null",
    worker,
    count=1,
)
if count != 1:
    raise RuntimeError('v16.7 assembly: worker diagnostics anchor missing')
worker_path.write_text(worker, 'utf-8')

# Extend the existing F10 profiler; do not install a competing key handler.
profiler_path = OUT / 'simulation-profiler-v166.js'
profiler = profiler_path.read_text('utf-8')
profiler = replace_once(
    profiler,
    "const VERSION = '16.6.2';\n  const BUILD = 182;",
    "const VERSION = '16.7';\n  const BUILD = 183;",
    'profiler version',
)
profiler = replace_once(
    profiler,
    "state, bridge, perf, game, counts, combat: perf.combat166 || game?.combatScaleDiagnostics166?.() || {}, deep: perf.deep182 || game?.deepOperationsDiagnostics182?.() || {},",
    "state, bridge, perf, game, counts, combat: perf.combat166 || game?.combatScaleDiagnostics166?.() || {}, deep: perf.deep182 || game?.deepOperationsDiagnostics182?.() || {}, formation: perf.formation183 || game?.formationMarchDiagnostics183?.() || {}, fortress: perf.fortress183 || game?.fortressDefenseDiagnostics183?.() || {},",
    'profiler snapshot extensions',
)
profiler = replace_once(
    profiler,
    "    const dm = d.metrics || {};\n    const op = (d.operations || []).find(item => item.phase !== 'complete') || (d.operations || [])[0] || {};\n    const lines = [",
    "    const dm = d.metrics || {};\n    const op = (d.operations || []).find(item => item.phase !== 'complete') || (d.operations || [])[0] || {};\n    const fm = s.formation || {};\n    const ft = s.fortress || {};\n    const ftm = ft.metrics || {};\n    const lines = [",
    'profiler v183 locals',
)
profiler = replace_once(
    profiler,
    """      `Operations            plan ${int(dm.operationsPlanned)} · done ${int(dm.operationsCompleted)} · abort ${int(dm.operationsAborted)}`,
      `Companies             ${int(s.companies)}`,
""",
    """      `Operations            plan ${int(dm.operationsPlanned)} · done ${int(dm.operationsCompleted)} · abort ${int(dm.operationsAborted)}`,
      `Formation march       ${int(fm.activeGroups)} groups · ${int(fm.activeMembers)} units · ${fmt(fm.lastSharedSpeed, 1)} speed`,
      `Formation batches     ${int(fm.sharedSteps)} · individual avoided ${int(fm.individualMovementAvoided)}`,
      `Formation cohesion    max ${fmt(fm.maxCohesionError, 1)} · regroup ${int(fm.regroupFrames)} · blocked ${int(fm.blockedFrames)}`,
      `Fortress readiness    ${fmt(ft.score)} · threat ${int(ft.threatLevel)} · protected ${int(ft.protectedAssets)}/${int(ft.criticalAssets)}`,
      `Fortress reserve/CAP  ${int(ft.reserve)}/${int(ft.desiredReserve)} · ${int(ft.cap)}/${int(ft.desiredCap)}`,
      `Fortifications        ${int(ftm.fortificationsBuilt)} · missile ${int(ftm.missileComplexesBuilt)} · AA ${int(ftm.aaBuilt)} · air queued ${int(ftm.aircraftQueued)}`,
      `Companies             ${int(s.companies)}`,
""",
    'profiler formation and fortress lines',
)
profiler_path.write_text(profiler, 'utf-8')

# One clean canonical launcher. There is no meta-refresh and no historical build
# list, so the first page cannot cycle through previous variants.
launcher = f'''<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="color-scheme" content="dark">
  <title>Frontline Dominion v{VERSION}</title>
  <link rel="canonical" href="./">
  <style>
    *{{box-sizing:border-box}}
    html,body{{margin:0;min-height:100%;background:#050b10;color:#dcecf4;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}}
    body{{display:grid;place-items:center;min-height:100vh;padding:24px;background:radial-gradient(circle at 50% 25%,#163044 0,#09131c 40%,#050b10 78%)}}
    main{{width:min(720px,100%);padding:36px;border:1px solid rgba(139,190,218,.28);border-radius:18px;background:rgba(5,13,20,.88);box-shadow:0 24px 80px rgba(0,0,0,.48)}}
    .eyebrow{{font-size:12px;letter-spacing:.14em;color:#8ec4dd;font-weight:800}}
    h1{{margin:12px 0 10px;font-size:clamp(32px,7vw,62px);line-height:.95;letter-spacing:-.045em}}
    p{{max-width:620px;margin:0 0 26px;color:#abc2cf;font-size:16px;line-height:1.6}}
    a{{display:inline-flex;align-items:center;justify-content:center;min-height:54px;padding:0 24px;border-radius:10px;background:#d9edf7;color:#071019;text-decoration:none;font-weight:900;letter-spacing:.015em}}
    .status{{margin-top:18px;font:700 12px/1.4 ui-monospace,SFMono-Regular,Consolas,monospace;color:#718f9f}}
  </style>
</head>
<body>
  <main>
    <div class="eyebrow">ЕДИНСТВЕННАЯ АКТУАЛЬНАЯ СБОРКА · BUILD {BUILD}</div>
    <h1>Frontline<br>Dominion</h1>
    <p>Formation &amp; Fortress Core: синхронное движение строем, эшелонированная оборона базы ИИ, мобильный резерв, дежурная авиация, турели, ПВО и ракетные комплексы.</p>
    <a id="launch" href="./frontline-dominion.html?build={BUILD}">Запустить игру</a>
    <div class="status">v{VERSION} · build {BUILD} · GitHub Pages</div>
  </main>
</body>
</html>
'''
(OUT / 'index.html').write_text(launcher, 'utf-8')

print('Frontline Dominion v16.7 build 183 assembled')
