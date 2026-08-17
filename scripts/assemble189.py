from pathlib import Path
import re
import runpy

ROOT = Path('.')
OUT = ROOT / 'dist'
VERSION = '16.8.5'
BUILD = 189

runpy.run_path('scripts/assemble188.py', run_name='__main__')


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise RuntimeError(f'build 189 patch anchor missing: {label}')
    return text.replace(old, new, 1)


# ---------------------------------------------------------------------------
# Canonical runtime UI and the only launch owner.
# ---------------------------------------------------------------------------
shell_source = ROOT / 'src' / 'v189' / 'runtime-shell-v189.js'
if not shell_source.exists():
    raise RuntimeError('build 189 runtime shell source missing')
(OUT / 'runtime-shell-v189.js').write_text(shell_source.read_text('utf-8'), 'utf-8')

ui188 = (ROOT / 'src' / 'v188' / 'runtime-ui-v188.js').read_text('utf-8')
ui189 = ui188.replace("const VERSION = '16.8.4';", "const VERSION = '16.8.5';", 1)
ui189 = ui189.replace('const BUILD = 188;', 'const BUILD = 189;', 1)
ui189 = ui189.replace('__FD_RUNTIME_UI_188__', '__FD_RUNTIME_UI_189__')
(OUT / 'runtime-ui-v189.js').write_text(ui189, 'utf-8')

# ---------------------------------------------------------------------------
# Engineers: same physical radius, visible human height, selection envelope,
# health bars and indicators as the rest of the infantry.
# ---------------------------------------------------------------------------
p = OUT / 'unit-footprints-v115.js'
s = p.read_text('utf-8')
s = replace_once(s, 'const ENGINEER_DISPLAY_SCALE = 2.85;', 'const ENGINEER_DISPLAY_SCALE = 1;', 'footprint engineer scale')
s = replace_once(
    s,
    "    if (unit.typeId === 'worker') return ENGINEER_DISPLAY_SCALE;\n    const authoritative = game?.getUnitPresentationScale138?.(unit, worldWidth, cellAspect);",
    "    const authoritative = game?.getUnitPresentationScale138?.(unit, worldWidth, cellAspect);",
    'footprint worker scale branch',
)
s = replace_once(
    s,
    "    const targetWidth = worldWidth * (game.camera?.zoom || 1) * 1.34 * ENGINEER_DISPLAY_SCALE;",
    "    const displayScale = game.getUnitPresentationScale138?.(unit, worldWidth, .75) || ENGINEER_DISPLAY_SCALE;\n    const targetWidth = worldWidth * (game.camera?.zoom || 1) * 1.34 * displayScale;",
    'worker screen width',
)
s = replace_once(
    s,
    "  Game.prototype.getWorkerScreenBounds115 = function(unit) {\n    return unit?.typeId === 'worker' ? workerScreenBounds(this, unit) : null;\n  };",
    "  Game.prototype.getWorkerScreenBounds115 = function(unit) {\n    if (unit?.typeId !== 'worker') return null;\n    return this.getInfantryScreenBounds138?.(unit) || workerScreenBounds(this, unit);\n  };",
    'worker screen bounds API',
)
p.write_text(s, 'utf-8')

p = OUT / 'unit-formation-refinement-v138.js'
s = p.read_text('utf-8')
s = replace_once(s, 'const ENGINEER_DISPLAY_SCALE = 2.85;', 'const ENGINEER_DISPLAY_SCALE = 1;', 'formation engineer scale')
s = replace_once(s, "    if (unit.typeId === 'worker') return ENGINEER_DISPLAY_SCALE;\n", '', 'formation worker scale branch')
s = replace_once(s, "    if (unit.typeId === 'worker') return this.getWorkerScreenBounds115?.(unit) || null;\n", '', 'formation worker bounds branch')
p.write_text(s, 'utf-8')

worker_radius_pattern = re.compile(r"(worker\s*:\s*\{\s*name\s*:\s*'Инженер'.{0,420}?\bradius\s*:\s*)15\b", re.S)
for relative in ('frontline-dominion.html', 'authoritative-simulation-bundle-v172.js'):
    p = OUT / relative
    s = p.read_text('utf-8')
    s, count = worker_radius_pattern.subn(r'\g<1>14', s, count=1)
    if count != 1:
        raise RuntimeError(f'build 189 worker radius patch failed: {relative}')
    p.write_text(s, 'utf-8')

# ---------------------------------------------------------------------------
# Fast, natural formation assembly.
# ---------------------------------------------------------------------------
p = OUT / 'formation-march-core-v183.js'
s = p.read_text('utf-8')
s = replace_once(
    s,
    "  const VERSION = '16.8.4';\n  const BUILD = 188;",
    "  const VERSION = '16.8.5';\n  const BUILD = 189;",
    'formation version',
)
for old, new in (
    ('formingTicks188', 'formingTicks189'),
    ('memberTurnRate188', 'memberTurnRate189'),
    ('errorPercentile188', 'errorPercentile189'),
    ('approachMemberSlot188', 'approachMemberSlot189'),
    ('cohesionErrors188', 'cohesionErrors189'),
    ('p85Error188', 'p70Error189'),
    ('outliers188', 'outliers189'),
    ('tooManyOutliers188', 'tooManyOutliers189'),
    ('cohesionBroken188', 'cohesionBroken189'),
):
    s = s.replace(old, new)

s = replace_once(
    s,
    "  const memberTurnRate189 = member => {\n    if (member?.infantry) return 9.0;\n    if (member?.vehicle) return 6.0;\n    return 7.0;\n  };",
    "  const memberTurnRate189 = member => {\n    if (member?.infantry) return 12.0;\n    if (member?.vehicle) return 8.5;\n    return 9.5;\n  };",
    'formation turn rate',
)
s = replace_once(
    s,
    '      const assemblyFactor = regroup ? 1.30 : 1.62;',
    '      const assemblyFactor = regroup ? 1.60 : 2.25;',
    'formation assembly speed',
)
old_ready = """    const ready = settled === members.length ||
      (nearRatio >= .88 && p88 <= practicalTolerance) ||
      (state.formingTicks189 >= 18 && nearRatio >= .78 && p80 <= Math.max(24, spacing * .92));"""
new_ready = """    const ready = settled === members.length ||
      (state.formingTicks189 >= 5 && nearRatio >= .72 && p80 <= Math.max(24, spacing * .92)) ||
      (state.formingTicks189 >= 12 && nearRatio >= .58) ||
      state.formingTicks189 >= 24;"""
s = replace_once(s, old_ready, new_ready, 'formation release threshold')
s = replace_once(
    s,
    '    const p70Error189 = errorPercentile189(cohesionErrors189, .85);',
    '    const p70Error189 = errorPercentile189(cohesionErrors189, .70);',
    'formation cohesion percentile',
)
s = replace_once(
    s,
    '    const tooManyOutliers189 = outliers189 > Math.max(2, Math.floor(members.length * .18));',
    '    const tooManyOutliers189 = outliers189 > Math.max(3, Math.floor(members.length * .34));',
    'formation outlier tolerance',
)
s = replace_once(
    s,
    '    const cohesionBroken189 = state.phase === \'marching\' && p70Error189 > spacing * 1.02 && tooManyOutliers189;',
    '    const cohesionBroken189 = state.phase === \'marching\' && p70Error189 > spacing * 1.18 && tooManyOutliers189;',
    'formation regroup threshold',
)
s = replace_once(
    s,
    '        const catchupSpeed = Math.max(speed * 1.08, effectiveSpeed183(member) * 1.36);',
    '        const catchupSpeed = Math.max(speed * 1.15, effectiveSpeed183(member) * 1.58);',
    'formation catchup speed',
)

assignment_code = r'''  const optimizeFormationSlots189 = (game, group, units) => {
    if (!group || group.air) return group;
    const members = (units || [])
      .filter(unit => unit?.alive && unit.kind === 'unit' && !unit.air && !unit.embarkedIn);
    if (members.length < 2) return group;
    const available = members.map(unit => {
      const slot = group.slots?.[unit.id] || group.slots?.get?.(unit.id);
      return slot ? { ...slot } : localSlot183(group, unit);
    });
    if (available.length !== members.length) return group;

    const center = groupCenter183(members, finite183(group.anchorX ?? group.ax), finite183(group.anchorY ?? group.ay));
    const angle = finite183(group.angle, finite183(group.finalAngle138, finite183(group.finalAngle, 0)));
    const c = Math.cos(angle);
    const sin = Math.sin(angle);
    const localUnits = members.map(unit => {
      const dx = finite183(unit.x) - center.x;
      const dy = finite183(unit.y) - center.y;
      return {
        unit,
        forward: dx * c + dy * sin,
        lateral: -dx * sin + dy * c,
        radial: dx * dx + dy * dy,
      };
    }).sort((left, right) => right.radial - left.radial || String(left.unit.id).localeCompare(String(right.unit.id)));

    const assigned = {};
    for (const entry of localUnits) {
      let bestIndex = 0;
      let bestCost = Infinity;
      for (let index = 0; index < available.length; index += 1) {
        const slot = available[index];
        const df = finite183(slot.forward ?? slot.x) - entry.forward;
        const dl = finite183(slot.lateral ?? slot.y) - entry.lateral;
        const cost = df * df + dl * dl;
        if (cost < bestCost) { bestCost = cost; bestIndex = index; }
      }
      assigned[entry.unit.id] = available.splice(bestIndex, 1)[0];
    }
    group.slots = assigned;
    group._v138FinalSignature = '';
    group.slotAssignment189 = true;
    try { game.syncFormationFinalSlots138?.(group, true); } catch (_) {}
    return group;
  };

'''
anchor = '  const baseCreateFormation183 = GameClass.prototype.createFormationGroup;\n'
if anchor not in s:
    raise RuntimeError('build 189 formation creation anchor missing')
s = s.replace(anchor, assignment_code + anchor, 1)
old_create = """    GameClass.prototype.createFormationGroup = function(units, type, targetX, targetY, options = {}) {
      const group = baseCreateFormation183.call(this, units, type, targetX, targetY, options);
      if (group && !group.air && (group.unitIds?.length || units?.length || 0) >= 2) ensureState183(this, group);
      return group;
    };"""
new_create = """    GameClass.prototype.createFormationGroup = function(units, type, targetX, targetY, options = {}) {
      const group = baseCreateFormation183.call(this, units, type, targetX, targetY, options);
      if (group && !group.air && (group.unitIds?.length || units?.length || 0) >= 2) {
        optimizeFormationSlots189(this, group, units || []);
        ensureState183(this, group);
      }
      return group;
    };"""
s = replace_once(s, old_create, new_create, 'formation nearest-slot assignment')
p.write_text(s, 'utf-8')

# The v14.0 final-position wrapper waited for every survivor and snapped units
# into exact posts. Build 189 owns assembly and completion, so bypass that old
# path for formation groups carrying the new march state.
p = OUT / 'screen-selection-formation-v140.js'
s = p.read_text('utf-8')
s = replace_once(
    s,
    "    const group = this.game.formations?.get(command?.formationGroupId);\n    if (!group || group.air || this.air || !isFinalGroundMove140(command)) {",
    "    const group = this.game.formations?.get(command?.formationGroupId);\n    if (Number(group?.march183?.build || 0) >= 189) {\n      return baseFormationCommand140.call(this, command, dt);\n    }\n    if (!group || group.air || this.air || !isFinalGroundMove140(command)) {",
    'v140 process bypass',
)
s = replace_once(
    s,
    "    const group = command?.formationGroupId ? this.game.formations?.get(command.formationGroupId) : null;\n    if (group && !group.air && !this.air && isFinalGroundMove140(command) && (group.arrived || group.completed)) {",
    "    const group = command?.formationGroupId ? this.game.formations?.get(command.formationGroupId) : null;\n    if (Number(group?.march183?.build || 0) >= 189) {\n      return baseFinishCommand140.apply(this, args);\n    }\n    if (group && !group.air && !this.air && isFinalGroundMove140(command) && (group.arrived || group.completed)) {",
    'v140 finish bypass',
)
p.write_text(s, 'utf-8')

# ---------------------------------------------------------------------------
# Version ownership, Worker cache isolation, and canonical first paint.
# ---------------------------------------------------------------------------
p = OUT / 'authoritative-simulation-v174.js'
s = p.read_text('utf-8')
s = replace_once(s, "const BUILD = 188;\nconst VERSION = '16.8.4';", "const BUILD = 189;\nconst VERSION = '16.8.5';", 'bridge version')
s, count = re.subn(
    r"new Worker\('/frontline-dominion/authoritative-simulation-worker-v174\.js\?build=\d+'\)",
    "new Worker('/frontline-dominion/authoritative-simulation-worker-v174.js?build=189')",
    s,
    count=1,
)
if count != 1:
    raise RuntimeError('build 189 bridge Worker URL patch failed')
s = s.replace("version: '16.8.4', build: 188", "version: '16.8.5', build: 189")
p.write_text(s, 'utf-8')

p = OUT / 'authoritative-simulation-worker-v174.js'
s = p.read_text('utf-8')
s = replace_once(s, "const BUILD = 188;\nconst VERSION = '16.8.4';", "const BUILD = 189;\nconst VERSION = '16.8.5';", 'worker version')
s = re.sub(
    r"(importScripts\('/frontline-dominion/[^']+\.js)\?build=\d+('\);)",
    rf"\1?build={BUILD}\2",
    s,
)
p.write_text(s, 'utf-8')

p = OUT / 'simulation-profiler-v166.js'
s = p.read_text('utf-8')
s = s.replace("const VERSION = '16.8.4';\n  const BUILD = 188;", "const VERSION = '16.8.5';\n  const BUILD = 189;", 1)
p.write_text(s, 'utf-8')

# Remove historical start-screen writers from every generated module. The head
# guard below also enforces the canonical DOM before paint.
for path in sorted(OUT.glob('*.js')):
    if path.name == 'runtime-shell-v189.js':
        continue
    text = path.read_text('utf-8')
    text = re.sub(r'document\.title\s*=\s*[^;]+;', 'void 0;', text)
    text = re.sub(r'\beyebrow\.textContent\s*=\s*[^;]+;', 'void 0;', text)
    text = re.sub(r'\blead\.textContent\s*=\s*[^;]+;', 'void 0;', text)
    text = re.sub(r'\bstrip\.insertAdjacentHTML\([^;]*?\);', 'void 0;', text, flags=re.S)
    path.write_text(text, 'utf-8')

html_path = OUT / 'frontline-dominion.html'
html = html_path.read_text('utf-8')
html = re.sub(r'\s*<script[^>]+src=["\'](?:\./|/frontline-dominion/)runtime-ui-v18[5-9]\.js(?:\?build=\d+)?["\'][^>]*></script>', '', html, flags=re.I)
html = re.sub(r'\s*<script[^>]+src=["\'](?:\./|/frontline-dominion/)runtime-shell-v18[7-9]\.js(?:\?build=\d+)?["\'][^>]*></script>', '', html, flags=re.I)
html = re.sub(r'<title>.*?</title>', f'<title>Frontline Dominion v{VERSION} — Stable Launch & Formation</title>', html, count=1, flags=re.S)
html = re.sub(r"document\.querySelector\('#start-screen \.eyebrow'\)\.textContent\s*=\s*[^;]+;", 'void 0;', html)

canonical_eyebrow = f'ОПЕРАТИВНО-ТАКТИЧЕСКАЯ RTS · v{VERSION} BUILD {BUILD}'
canonical_lead = 'Стабильный запуск, единый масштаб пехоты и быстрое естественное построение подразделений перед маршем.'
feature_labels = [
    'Единственный актуальный экран',
    'Проверенный запуск WebKit',
    'Authoritative Worker 25 Гц',
    'Единый масштаб пехоты',
    'Быстрое построение',
    'Поворот по траектории',
    'Марш без ожидания отставших',
    'Оборона и оперативный ИИ',
    'Захват командного центра',
]
feature_html = ''.join(f'<span>{label}</span>' for label in feature_labels)

html, count = re.subn(
    r'(<div id=["\']start-screen["\'][^>]*>.*?<div class=["\']eyebrow["\']>).*?(</div>)',
    rf'\1{canonical_eyebrow}\2',
    html,
    count=1,
    flags=re.S,
)
if count != 1:
    raise RuntimeError('build 189 start eyebrow patch failed')
html, count = re.subn(r'(<p class=["\']lead["\']>).*?(</p>)', rf'\1{canonical_lead}\2', html, count=1, flags=re.S)
if count != 1:
    raise RuntimeError('build 189 start lead patch failed')
html, count = re.subn(r'<div class=["\']feature-strip["\']>.*?</div>', f'<div class="feature-strip" data-fd-canonical-build="189">{feature_html}</div>', html, count=1, flags=re.S)
if count != 1:
    raise RuntimeError('build 189 feature strip patch failed')
html, count = re.subn(r'(<button id=["\']start-game["\'][^>]*)(>).*?(</button>)', r'\1 disabled aria-disabled="true"\2ЗАГРУЗКА…\3', html, count=1, flags=re.S)
if count != 1:
    raise RuntimeError('build 189 start button patch failed')

boot_script = f'''<script id="fd-boot189-script">
(() => {{
  const VERSION = '{VERSION}', BUILD = {BUILD};
  const FEATURES = {feature_labels!r};
  const state = {{ ready: false, launching: false, loadAvailable: false, stopped: false }};
  const config = {{ childList: true, subtree: true, characterData: true, attributes: true }};
  let observer;
  const sameFeatures = strip => strip && strip.children.length === FEATURES.length &&
    FEATURES.every((label, index) => strip.children[index]?.textContent === label);
  const apply = () => {{
    if (state.stopped) return;
    const start = document.getElementById('start-screen');
    if (!start) return;
    observer?.disconnect();
    const eyebrow = start.querySelector('.eyebrow');
    const lead = start.querySelector('.lead');
    const strip = start.querySelector('.feature-strip');
    const startButton = document.getElementById('start-game');
    const loadButton = document.getElementById('load-game');
    if (eyebrow && eyebrow.textContent !== '{canonical_eyebrow}') eyebrow.textContent = '{canonical_eyebrow}';
    if (lead && lead.textContent !== '{canonical_lead}') lead.textContent = '{canonical_lead}';
    if (strip && !sameFeatures(strip)) {{
      strip.replaceChildren(...FEATURES.map(label => {{ const span = document.createElement('span'); span.textContent = label; return span; }}));
    }}
    if (strip) strip.dataset.fdCanonicalBuild = String(BUILD);
    if (startButton) {{
      startButton.textContent = state.launching ? 'ЗАПУСК…' : state.ready ? 'НАЧАТЬ СРАЖЕНИЕ' : 'ЗАГРУЗКА…';
      startButton.disabled = !state.ready || state.launching;
      startButton.setAttribute('aria-disabled', String(startButton.disabled));
    }}
    if (loadButton) {{
      loadButton.disabled = !state.ready || state.launching || !state.loadAvailable;
      loadButton.setAttribute('aria-disabled', String(loadButton.disabled));
    }}
    document.documentElement.classList.toggle('fd-loading189', !state.ready);
    document.documentElement.classList.toggle('fd-ready189', state.ready);
    observer?.observe(document.documentElement, config);
  }};
  observer = new MutationObserver(apply);
  observer.observe(document.documentElement, config);
  document.addEventListener('DOMContentLoaded', apply, {{ once: true }});
  globalThis.__FD_BOOT_189__ = {{
    version: VERSION, build: BUILD, state, apply,
    setReady(value) {{ state.ready = Boolean(value); apply(); }},
    setLaunching(value) {{ state.launching = Boolean(value); apply(); }},
    setLoadAvailable(value) {{ state.loadAvailable = Boolean(value); apply(); }},
    stop() {{ state.stopped = true; observer.disconnect(); }},
  }};
}})();
</script>
<style id="fd-boot189-style">
html.fd-loading189 #start-screen button{{pointer-events:none!important}}
html.fd-loading189 #start-game,html.fd-loading189 #load-game{{opacity:.58!important;filter:saturate(.6)}}
</style>'''
if '</head>' not in html:
    raise RuntimeError('build 189 closing head missing')
html = html.replace('</head>', boot_script + '</head>', 1)

# One build generation for every main-thread script.
def cache_bust(match):
    return f'{match.group(1)}?build={BUILD}{match.group(2)}'

html = re.sub(
    r'(<script\b[^>]*\bsrc=["\'](?:\./|/frontline-dominion/)[^"\']+\.js)(?:\?build=\d+)?(["\'][^>]*></script>)',
    cache_bust,
    html,
    flags=re.I,
)
prof = re.search(r'<script\b[^>]*src=["\'](?:\./|/frontline-dominion/)simulation-profiler-v166\.js\?build=189["\'][^>]*></script>', html, flags=re.I)
if not prof:
    raise RuntimeError('build 189 profiler tag missing')
html = html[:prof.start()] + '<script src="./runtime-ui-v189.js?build=189"></script>\n' + html[prof.start():]
if '</body>' not in html:
    raise RuntimeError('build 189 closing body missing')
html = html.replace('</body>', '<script src="./runtime-shell-v189.js?build=189"></script>\n</body>', 1)
html_path.write_text(html, 'utf-8')

launcher = f'''<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="color-scheme" content="dark"><title>Frontline Dominion v{VERSION}</title><style>
*{{box-sizing:border-box}}html,body{{margin:0;min-height:100%;background:#050b10;color:#dcecf4;font-family:system-ui,sans-serif}}
body{{display:grid;place-items:center;min-height:100vh;padding:24px;background:#071019}}
main{{width:min(720px,100%);padding:36px;border:1px solid #365363;border-radius:18px;background:#0a151d}}
a{{display:inline-flex;min-height:54px;align-items:center;padding:0 24px;border-radius:10px;background:#d9edf7;color:#071019;text-decoration:none;font-weight:900}}
</style></head><body><main>
<div>ЕДИНСТВЕННАЯ АКТУАЛЬНАЯ СБОРКА · BUILD {BUILD}</div><h1>Frontline Dominion</h1>
<p>Stable Launch &amp; Formation: канонический стартовый экран, гарантированный запуск после готовности ядра, единый размер инженеров и быстрое естественное построение групп.</p>
<a id="launch" href="./frontline-dominion.html?build={BUILD}">Запустить игру</a><p>v{VERSION} · build {BUILD} · GitHub Pages</p>
</main></body></html>'''
(OUT / 'index.html').write_text(launcher, 'utf-8')

print(f'Frontline Dominion v{VERSION} build {BUILD} assembled')
