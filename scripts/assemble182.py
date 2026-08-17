from pathlib import Path
import hashlib
import re
import runpy

runpy.run_path('scripts/assemble181.py', run_name='__main__')
OUT = Path('dist')
ROOT = Path('.')


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise RuntimeError(f'v16.6.2 assembly anchor missing: {label}')
    return text.replace(old, new, 1)


import base64
import zlib
deep_parts = sorted((ROOT / 'scripts').glob('deep182.zb64.*'))
if not deep_parts:
    raise RuntimeError('v16.6.2 deep operations package missing')
deep_module = zlib.decompress(base64.b64decode(''.join(part.read_text('ascii') for part in deep_parts)))
verify_parts = sorted((ROOT / 'tests').glob('verify182.zb64.*'))
if not verify_parts:
    raise RuntimeError('v16.6.2 verification package missing')
(ROOT / 'tests' / 'verify182.generated.js').write_bytes(
    zlib.decompress(base64.b64decode(''.join(part.read_text('ascii') for part in verify_parts)))
)
if hashlib.sha256(deep_module).hexdigest() != '8f6b6fa4ae072f71ed93709755ca244f9a8725e0300f9fbe423daadef8c6feef':
    raise RuntimeError('v16.6.2 deep operations module checksum mismatch')
(OUT / 'deep-operations-ai-v182.js').write_bytes(deep_module)

# Browser shell: install the operational AI after every legacy doctrine module,
# but before the F10 profiler and the final UI/minimap owners.
html_path = OUT / 'frontline-dominion.html'
html = html_path.read_text('utf-8')
html = re.sub(
    r'<title>.*?</title>',
    '<title>Frontline Dominion v16.6.2 — Operational Campaign AI</title>',
    html,
    count=1,
    flags=re.S,
)
html = re.sub(
    r'\s*<script[^>]+src=["\'][^"\']*deep-operations-ai-v182\.js[^"\']*["\'][^>]*></script>',
    '',
    html,
    flags=re.I,
)
profiler_tag_re = re.compile(r'<script src=["\']\./simulation-profiler-v166\.js\?build=\d+["\']></script>')
match = profiler_tag_re.search(html)
if not match:
    raise RuntimeError('v16.6.2 assembly: profiler tag not found')
replacement = (
    '<script src="./deep-operations-ai-v182.js?build=182"></script>\n'
    '<script src="./simulation-profiler-v166.js?build=182"></script>'
)
html = html[:match.start()] + replacement + html[match.end():]
html = re.sub(r'(authoritative-simulation-v174\.js)\?build=\d+', r'\1?build=182', html)
html_path.write_text(html, 'utf-8')

# Main-thread bridge version and Worker cache-bust.
bridge_path = OUT / 'authoritative-simulation-v174.js'
bridge = bridge_path.read_text('utf-8')
bridge = replace_once(bridge, "const BUILD = 180;\nconst VERSION = '16.6';", "const BUILD = 182;\nconst VERSION = '16.6.2';", 'bridge version')
bridge = re.sub(
    r"new Worker\('/frontline-dominion/authoritative-simulation-worker-v174\.js\?build=\d+'\)",
    "new Worker('/frontline-dominion/authoritative-simulation-worker-v174.js?build=182')",
    bridge,
    count=1,
)
bridge = bridge.replace(
    "window.__FD_STABLE_STATE165__ = { version: '16.5', build: 179, bridge: this, transport: this.transportMode165, counts: {} };",
    "window.__FD_STABLE_STATE165__ = { version: '16.6.2', build: 182, bridge: this, transport: this.transportMode165, counts: {} };",
)
bridge = bridge.replace(
    "this.game.alert?.(`Stable State Core · Worker 25 Гц · ${this.transportMode165 === 'shared-triple' ? 'SAB triple buffer' : 'transfer fallback'}`, 'info');",
    "this.game.alert?.(`Operational Campaign AI · Worker 25 Гц · ${this.transportMode165 === 'shared-triple' ? 'SAB triple buffer' : 'transfer fallback'}`, 'info');",
)
bridge_path.write_text(bridge, 'utf-8')

# Authoritative Worker owns the AI. The browser copy exists for diagnostics and
# fallback mode; this import is what makes the behavior authoritative.
worker_path = OUT / 'authoritative-simulation-worker-v174.js'
worker = worker_path.read_text('utf-8')
worker = replace_once(worker, "const BUILD = 180;\nconst VERSION = '16.6';", "const BUILD = 182;\nconst VERSION = '16.6.2';", 'worker version')
combat_import = "importScripts('/frontline-dominion/combat-scale-core-v166.js?build=180');\n"
worker = replace_once(
    worker,
    combat_import,
    combat_import + "importScripts('/frontline-dominion/deep-operations-ai-v182.js?build=182');\n",
    'worker operational AI import',
)
worker = replace_once(
    worker,
    "combat166: game.combatScaleDiagnostics166?.() || null\n",
    "combat166: game.combatScaleDiagnostics166?.() || null, deep182: game.deepOperationsDiagnostics182?.() || null\n",
    'worker diagnostics',
)
worker_path.write_text(worker, 'utf-8')

# Extend the existing F10 profiler instead of adding a competing key handler.
profiler_path = OUT / 'simulation-profiler-v166.js'
profiler = profiler_path.read_text('utf-8')
profiler = replace_once(profiler, "const VERSION = '16.6';\n  const BUILD = 180;", "const VERSION = '16.6.2';\n  const BUILD = 182;", 'profiler version')
profiler = replace_once(
    profiler,
    "state, bridge, perf, game, counts, combat: perf.combat166 || game?.combatScaleDiagnostics166?.() || {},",
    "state, bridge, perf, game, counts, combat: perf.combat166 || game?.combatScaleDiagnostics166?.() || {}, deep: perf.deep182 || game?.deepOperationsDiagnostics182?.() || {},",
    'profiler snapshot',
)
profiler = replace_once(
    profiler,
    "    const p = s.perf || {};\n    const lines = [",
    "    const p = s.perf || {};\n    const d = s.deep || {};\n    const dm = d.metrics || {};\n    const op = (d.operations || []).find(item => item.phase !== 'complete') || (d.operations || [])[0] || {};\n    const lines = [",
    'profiler render locals',
)
profiler = replace_once(
    profiler,
    """      `Combat ms last        cell ${fmt(s.combat?.lastIndexMs)} · target ${fmt(s.combat?.lastTargetingMs)} · batch ${fmt(s.combat?.lastBatchMs)}`,
      `Companies             ${int(s.companies)}`,
""",
    """      `Combat ms last        cell ${fmt(s.combat?.lastIndexMs)} · target ${fmt(s.combat?.lastTargetingMs)} · batch ${fmt(s.combat?.lastBatchMs)}`,
      `Operational AI        ${int(d.activeOperations)} op · ${op.phase || 'idle'} · ${op.purpose || '—'}`,
      `Recon / defense       ${fmt(op.reconScore)} / ${fmt(d.defenseScore)}`,
      `Shaping / breach      ${fmt(op.shapingReduction)} / ${fmt(op.breachProgress)} · losses ${fmt(op.breachCasualties)}`,
      `Defensive reserve     ${int(d.defensiveReserve)} / ${int(d.desiredReserve)} · built ${int(dm.defensiveBuildings)}`,
      `Operations            plan ${int(dm.operationsPlanned)} · done ${int(dm.operationsCompleted)} · abort ${int(dm.operationsAborted)}`,
      `Companies             ${int(s.companies)}`,
""",
    'profiler operational lines',
)
profiler_path.write_text(profiler, 'utf-8')

(OUT / 'index.html').write_text(
    '<!doctype html><html lang="ru"><head><meta charset="utf-8">'
    '<meta name="viewport" content="width=device-width,initial-scale=1">'
    '<title>Frontline Dominion v16.6.2</title>'
    '<meta http-equiv="refresh" content="0; url=./frontline-dominion.html?build=182"></head>'
    '<body><a href="./frontline-dominion.html?build=182">Запустить Frontline Dominion v16.6.2</a></body></html>',
    'utf-8',
)

print('Frontline Dominion v16.6.2 build 182 assembled')
