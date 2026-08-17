from pathlib import Path
import base64
import hashlib
import json
import re
import runpy
import zlib

runpy.run_path('scripts/assemble183.py', run_name='__main__')
OUT = Path('dist')
ROOT = Path('.')
VERSION = '16.8'
BUILD = 184


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise RuntimeError(f'v16.8 assembly anchor missing: {label}')
    return text.replace(old, new, 1)


package_parts = sorted((ROOT / 'scripts').glob('v184.zb64.*'))
if not package_parts:
    raise RuntimeError('v16.8 package missing')
payload = zlib.decompress(base64.b64decode(''.join(part.read_text('ascii') for part in package_parts)))
if hashlib.sha256(payload).hexdigest() != '32bed1363e56edfb93bd3de92c9023700e1b99c0d9b42c19073352b3e2045371':
    raise RuntimeError('v16.8 package checksum mismatch')
package = json.loads(payload.decode('utf-8'))
modules = package.get('modules') or {}
expected = {'action-group-core-v184.js', 'construction-victory-v184.js'}
if set(modules) != expected:
    raise RuntimeError(f'v16.8 module set mismatch: {sorted(modules)}')
for name, content in modules.items():
    (OUT / name).write_text(content, 'utf-8')
(ROOT / 'tests' / 'verify184.js').write_text(package.get('test') or '', 'utf-8')

# Keep v16.7 behavioral regression tests, but advance only their launcher/UI
# assertions to the current build. The v183 formation/fortress modules remain
# unchanged and are still tested by the same harness.
legacy_test_path = ROOT / 'tests' / 'verify183.generated.js'
if legacy_test_path.exists():
    legacy_test = legacy_test_path.read_text('utf-8')
    legacy_test = legacy_test.replace(r'frontline-dominion\.html\?build=183', r'frontline-dominion\.html\?build=184')
    legacy_test = legacy_test.replace(r'build=18[0-2]', r'build=18[0-3]')
    legacy_test = legacy_test.replace(r'start-screen-stable-v183\.js\?build=183', r'start-screen-stable-v184\.js\?build=184')
    legacy_test = legacy_test.replace('start-screen-stable-v183.js?build=183', 'start-screen-stable-v184.js?build=184')
    legacy_test = legacy_test.replace('simulation-profiler-v166.js?build=183', 'simulation-profiler-v166.js?build=184')
    legacy_test_path.write_text(legacy_test, 'utf-8')

# Make the old deep/fortress builders acknowledge a rejected construction and
# treat an already placed sensor scaffold as planned capacity. This prevents a
# retry loop from lying to the new construction guard's metrics.
deep_path = OUT / 'deep-operations-ai-v182.js'
deep = deep_path.read_text('utf-8')
deep = deep.replace(
    "const sensors = buildings.filter(building => building.completed && (",
    "const sensors = buildings.filter(building => (building.completed || (building.buildProgress ?? building.construction ?? 0) > 0) && (",
    1,
)
deep = deep.replace(
    "    ai.game.addEntity(building);\n    ai.game.recalculatePower?.();",
    "    const added184 = ai.game.addEntity(building);\n    if (added184 === false) return false;\n    ai.game.recalculatePower?.();",
    1,
)
deep_path.write_text(deep, 'utf-8')

fortress_path = OUT / 'fortress-defense-ai-v183.js'
fortress = fortress_path.read_text('utf-8')
fortress = replace_once(
    fortress,
    "    ai.game.addEntity?.(building);\n    ai.game.recalculatePower?.();",
    "    const added184 = ai.game.addEntity?.(building);\n    if (added184 === false) return false;\n    ai.game.recalculatePower?.();",
    'fortress addEntity acknowledgement',
)
fortress_path.write_text(fortress, 'utf-8')

# Canonical start-screen owner, cache-busted to build 184.
old_start_path = OUT / 'start-screen-stable-v183.js'
start = old_start_path.read_text('utf-8')
start = replace_once(start, "const VERSION = '16.7';\n  const BUILD = 183;", "const VERSION = '16.8';\n  const BUILD = 184;", 'start version')
start = replace_once(start, "const TITLE = 'Frontline Dominion v16.7 — Formation & Fortress Core';", "const TITLE = 'Frontline Dominion v16.8 — Action Group & Command Center Core';", 'start title')
start = replace_once(start, "const EYEBROW = 'ОПЕРАТИВНО-ТАКТИЧЕСКАЯ RTS · v16.7 BUILD 183';", "const EYEBROW = 'ОПЕРАТИВНО-ТАКТИЧЕСКАЯ RTS · v16.8 BUILD 184';", 'start eyebrow')
start = re.sub(
    r"const LEAD = '.*?';",
    "const LEAD = 'Большие группы одинаковых приказов считаются как единый action-group независимо от камеры. Дальний марш и патруль продолжаются вне экрана, строительство ИИ ограничено реальными мощностями, а победа достигается захватом командного центра пехотой.';",
    start,
    count=1,
)
(OUT / 'start-screen-stable-v184.js').write_text(start, 'utf-8')

html_path = OUT / 'frontline-dominion.html'
html = html_path.read_text('utf-8')
html = re.sub(r'<title>.*?</title>', '<title>Frontline Dominion v16.8 — Action Group & Command Center Core</title>', html, count=1, flags=re.S)
html = re.sub(
    r'\s*<script[^>]+src=["\'][^"\']*(?:action-group-core-v184|construction-victory-v184|start-screen-stable-v184)\.js[^"\']*["\'][^>]*></script>',
    '', html, flags=re.I,
)
# Remove the old canonical start owner; v184 replaces it.
html = re.sub(r'\s*<script[^>]+src=["\']\./start-screen-stable-v183\.js\?build=\d+["\'][^>]*></script>', '', html, flags=re.I)
profiler_re = re.compile(r'<script src=["\']\./simulation-profiler-v166\.js\?build=\d+["\']></script>')
match = profiler_re.search(html)
if not match:
    raise RuntimeError('v16.8 assembly: profiler tag not found')
replacement = (
    '<script src="./action-group-core-v184.js?build=184"></script>\n'
    '<script src="./construction-victory-v184.js?build=184"></script>\n'
    '<script src="./simulation-profiler-v166.js?build=184"></script>'
)
html = html[:match.start()] + replacement + html[match.end():]
mini_tag = '<script src="./minimap-atomic-v181.js?build=181"></script>'
if mini_tag not in html:
    raise RuntimeError('v16.8 assembly: final minimap tag not found')
html = html.replace(mini_tag, '<script src="./start-screen-stable-v184.js?build=184"></script>\n' + mini_tag, 1)
html = re.sub(r'(authoritative-simulation-v174\.js)\?build=\d+', r'\1?build=184', html)
html = html.replace('Уничтожьте все здания противника!', 'Захватите командный центр противника пехотой')
html = html.replace('Уничтожьте все здания противника', 'Захватите командный центр противника пехотой')
html_path.write_text(html, 'utf-8')

bridge_path = OUT / 'authoritative-simulation-v174.js'
bridge = bridge_path.read_text('utf-8')
bridge = replace_once(bridge, "const BUILD = 183;\nconst VERSION = '16.7';", "const BUILD = 184;\nconst VERSION = '16.8';", 'bridge version')
bridge = re.sub(
    r"new Worker\('/frontline-dominion/authoritative-simulation-worker-v174\.js\?build=\d+'\)",
    "new Worker('/frontline-dominion/authoritative-simulation-worker-v174.js?build=184')",
    bridge, count=1,
)
bridge = bridge.replace(
    "window.__FD_STABLE_STATE165__ = { version: '16.7', build: 183, bridge: this, transport: this.transportMode165, counts: {} };",
    "window.__FD_STABLE_STATE165__ = { version: '16.8', build: 184, bridge: this, transport: this.transportMode165, counts: {} };",
)
bridge = bridge.replace(
    "this.game.alert?.(`Formation & Fortress Core · Worker 25 Гц · ${this.transportMode165 === 'shared-triple' ? 'SAB triple buffer' : 'transfer fallback'}`, 'info');",
    "this.game.alert?.(`Action Group & Command Center Core · Worker 25 Гц · ${this.transportMode165 === 'shared-triple' ? 'SAB triple buffer' : 'transfer fallback'}`, 'info');",
)
bridge_path.write_text(bridge, 'utf-8')

worker_path = OUT / 'authoritative-simulation-worker-v174.js'
worker = worker_path.read_text('utf-8')
worker = replace_once(worker, "const BUILD = 183;\nconst VERSION = '16.7';", "const BUILD = 184;\nconst VERSION = '16.8';", 'worker version')
fortress_import = "importScripts('/frontline-dominion/fortress-defense-ai-v183.js?build=183');\n"
worker = replace_once(
    worker,
    fortress_import,
    fortress_import +
    "importScripts('/frontline-dominion/action-group-core-v184.js?build=184');\n" +
    "importScripts('/frontline-dominion/construction-victory-v184.js?build=184');\n",
    'worker v184 imports',
)
worker = replace_once(
    worker,
    "combat166: game.combatScaleDiagnostics166?.() || null, deep182: game.deepOperationsDiagnostics182?.() || null, formation183: game.formationMarchDiagnostics183?.() || null, fortress183: game.fortressDefenseDiagnostics183?.() || null",
    "combat166: game.combatScaleDiagnostics166?.() || null, deep182: game.deepOperationsDiagnostics182?.() || null, formation183: game.formationMarchDiagnostics183?.() || null, fortress183: game.fortressDefenseDiagnostics183?.() || null, action184: game.actionGroupDiagnostics184?.() || null, objective184: game.constructionVictoryDiagnostics184?.() || null",
    'worker v184 diagnostics',
)
worker_path.write_text(worker, 'utf-8')

profiler_path = OUT / 'simulation-profiler-v166.js'
profiler = profiler_path.read_text('utf-8')
profiler = replace_once(profiler, "const VERSION = '16.7';\n  const BUILD = 183;", "const VERSION = '16.8';\n  const BUILD = 184;", 'profiler version')
profiler = replace_once(
    profiler,
    "state, bridge, perf, game, counts, combat: perf.combat166 || game?.combatScaleDiagnostics166?.() || {}, deep: perf.deep182 || game?.deepOperationsDiagnostics182?.() || {}, formation: perf.formation183 || game?.formationMarchDiagnostics183?.() || {}, fortress: perf.fortress183 || game?.fortressDefenseDiagnostics183?.() || {},",
    "state, bridge, perf, game, counts, combat: perf.combat166 || game?.combatScaleDiagnostics166?.() || {}, deep: perf.deep182 || game?.deepOperationsDiagnostics182?.() || {}, formation: perf.formation183 || game?.formationMarchDiagnostics183?.() || {}, fortress: perf.fortress183 || game?.fortressDefenseDiagnostics183?.() || {}, action: perf.action184 || game?.actionGroupDiagnostics184?.() || {}, objective: perf.objective184 || game?.constructionVictoryDiagnostics184?.() || {},",
    'profiler snapshot v184',
)
profiler = replace_once(
    profiler,
    "    const ftm = ft.metrics || {};\n    const lines = [",
    "    const ftm = ft.metrics || {};\n    const ag = s.action || {};\n    const ob = s.objective || {};\n    const lines = [",
    'profiler locals v184',
)
profiler = replace_once(
    profiler,
    """      `Fortifications        ${int(ftm.fortificationsBuilt)} · missile ${int(ftm.missileComplexesBuilt)} · AA ${int(ftm.aaBuilt)} · air queued ${int(ftm.aircraftQueued)}`,
      `Companies             ${int(s.companies)}`,
""",
    """      `Fortifications        ${int(ftm.fortificationsBuilt)} · missile ${int(ftm.missileComplexesBuilt)} · AA ${int(ftm.aaBuilt)} · air queued ${int(ftm.aircraftQueued)}`,
      `Action groups         ${int(ag.groups)} groups · ${int(ag.members)} units · patrol ${int(ag.patrolGroups)}`,
      `Group work avoided    update ${int(ag.individualUpdatesAvoided)} · path ${int(ag.individualPathfindAvoided)} · render ${int(ag.renderMembersAvoided)}`,
      `Offscreen / combat    ${int(ag.offscreenSteps)} macro steps · ${int(ag.exactCombatSteps)} exact · ${fmt(ag.lastStepMs)} ms`,
      `Construction pending  ${int(ob.pending)}/${int(ob.caps?.global)} · sensors ${int(ob.pendingSensors)} · rejected ${int(ob.constructionRejected)}`,
      `Victory objective     capture-command-center · winner ${ob.winner || '—'}`,
      `Companies             ${int(s.companies)}`,
""",
    'profiler action/objective lines',
)
profiler_path.write_text(profiler, 'utf-8')

launcher = f'''<!doctype html>
<html lang="ru"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="color-scheme" content="dark">
<title>Frontline Dominion v{VERSION}</title><link rel="canonical" href="./">
<style>*{{box-sizing:border-box}}html,body{{margin:0;min-height:100%;background:#050b10;color:#dcecf4;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}}body{{display:grid;place-items:center;min-height:100vh;padding:24px;background:radial-gradient(circle at 50% 25%,#163044 0,#09131c 40%,#050b10 78%)}}main{{width:min(720px,100%);padding:36px;border:1px solid rgba(139,190,218,.28);border-radius:18px;background:rgba(5,13,20,.88);box-shadow:0 24px 80px rgba(0,0,0,.48)}}.eyebrow{{font-size:12px;letter-spacing:.14em;color:#8ec4dd;font-weight:800}}h1{{margin:12px 0 10px;font-size:clamp(32px,7vw,62px);line-height:.95;letter-spacing:-.045em}}p{{max-width:620px;margin:0 0 26px;color:#abc2cf;font-size:16px;line-height:1.6}}a{{display:inline-flex;align-items:center;justify-content:center;min-height:54px;padding:0 24px;border-radius:10px;background:#d9edf7;color:#071019;text-decoration:none;font-weight:900;letter-spacing:.015em}}.status{{margin-top:18px;font:700 12px/1.4 ui-monospace,SFMono-Regular,Consolas,monospace;color:#718f9f}}</style>
</head><body><main>
<div class="eyebrow">ЕДИНСТВЕННАЯ АКТУАЛЬНАЯ СБОРКА · BUILD {BUILD}</div>
<h1>Frontline<br>Dominion</h1>
<p>Action Group Core: дешёвый марш и патруль больших групп на экране и вне его. Незавершённые стройки ИИ ограничены, а единственное условие победы — захват командного центра противника пехотой.</p>
<a id="launch" href="./frontline-dominion.html?build={BUILD}">Запустить игру</a><div class="status">v{VERSION} · build {BUILD} · GitHub Pages</div>
</main></body></html>'''
(OUT / 'index.html').write_text(launcher, 'utf-8')

print('Frontline Dominion v16.8 build 184 assembled')