from pathlib import Path
import re

ROOT = Path('.')
OUT = ROOT / 'dist'
BUILD = 201
VERSION = '16.8.17'

html_path = OUT / 'frontline-dominion.html'
bridge_path = OUT / 'authoritative-simulation-v174.js'
worker_path = OUT / 'authoritative-simulation-worker-v174.js'
watchdog_path = OUT / 'command-watchdog-v191.js'
ui200_path = OUT / 'runtime-ui-v200.js'
shell200_path = OUT / 'runtime-shell-v200.js'
profiler_path = OUT / 'simulation-profiler-v166.js'
sources = [
    ROOT / 'src' / 'v197' / 'formation-target-fidelity-v197.js',
    ROOT / 'src' / 'v200' / 'building-selection-contour-v200.js',
    ROOT / 'src' / 'v201' / 'building-model-hit-v201.js',
    ROOT / 'src' / 'v201' / 'group-movement-v201.js',
]

for path in [
    html_path, bridge_path, worker_path, watchdog_path, ui200_path,
    shell200_path, profiler_path, *sources,
]:
    if not path.exists():
        raise RuntimeError(f'build 201 required file missing: {path}')

for source in sources:
    (OUT / source.name).write_text(source.read_text('utf-8'), 'utf-8')

# Every right-click command must carry the optional-formation state. The main
# bridge already did this for explicit move/attack-move/patrol commands, but
# empty-terrain context commands were missing it.
bridge = bridge_path.read_text('utf-8')
context_anchor = "return { x,y,append:Boolean(append),targetId:target?.id||null };"
context_replacement = "return { x,y,append:Boolean(append),targetId:target?.id||null,formationSettings:clonePlain(this.formationSettings) };"
if bridge.count(context_anchor) != 1:
    raise RuntimeError(f'build 201 context formation anchor count invalid: {bridge.count(context_anchor)}')
bridge = bridge.replace(context_anchor, context_replacement, 1)

constructor_anchor = '    this.lastError = null;\n'
constructor_fields = """    this.lastError = null;
    this.recovering201 = false;
    this.recoveryTimer201 = null;
    this.recoveryAttempts201 = 0;
    this.recoverySuccesses201 = 0;
    this.recoveryWindowAt201 = 0;
    this.recoveryWindowAttempts201 = 0;
    this.lastRecoveryReason201 = null;
"""
if bridge.count(constructor_anchor) != 1:
    raise RuntimeError('build 201 bridge recovery constructor anchor missing')
bridge = bridge.replace(constructor_anchor, constructor_fields, 1)

ready_anchor = """    if (message.type === 'ready') {
      this.ready = true;
"""
ready_replacement = """    if (message.type === 'ready') {
      const recovered201 = this.recovering201;
      if (this.recoveryTimer201) clearTimeout(this.recoveryTimer201);
      this.recoveryTimer201 = null;
      this.recovering201 = false;
      this.failed = false;
      this.lastError = null;
      this.recoveryWindowAttempts201 = 0;
      if (recovered201) this.recoverySuccesses201 += 1;
      this.ready = true;
"""
if bridge.count(ready_anchor) != 1:
    raise RuntimeError('build 201 bridge ready anchor missing')
bridge = bridge.replace(ready_anchor, ready_replacement, 1)

fail_anchor = """  fail(reason) {
    if (this.failed) return;
    this.lastError = String(reason || 'authoritative-worker-failed');
    this.failed = true;
    this.ready = false;
    try { this.worker?.terminate?.(); } catch (_) {}
    this.worker = null;
    try {
      this.game.rebuildSpatialIndexes?.();
      window.__FD_V94__?.ensure?.();
    } catch (_) {}
    console.error('[Frontline Dominion v16.4] authoritative Worker fallback:', reason);
    this.game.alert?.(`Simulation Worker отключён: ${reason}. Включён совместимый основной поток.`, 'danger');
  }
"""
fail_replacement = """  fail(reason) {
    const message201 = String(reason || 'authoritative-worker-failed');
    this.lastError = message201;
    this.lastRecoveryReason201 = message201;
    if (this.recoveryTimer201) return;
    this.failed = true;
    this.ready = false;
    try { this.worker?.terminate?.(); } catch (_) {}
    this.worker = null;
    try {
      this.game.rebuildSpatialIndexes?.();
      window.__FD_V94__?.ensure?.();
    } catch (_) {}

    const now201 = performance.now();
    if (!this.recoveryWindowAt201 || now201 - this.recoveryWindowAt201 > 15000) {
      this.recoveryWindowAt201 = now201;
      this.recoveryWindowAttempts201 = 0;
    }
    if (this.recoveryWindowAttempts201 < 3) {
      const delays201 = [120, 320, 760];
      const attempt201 = this.recoveryWindowAttempts201++;
      this.recoveryAttempts201 += 1;
      this.recovering201 = true;
      console.warn(`[FD201] Simulation Worker recovery ${attempt201 + 1}/3:`, message201);
      this.recoveryTimer201 = setTimeout(() => {
        this.recoveryTimer201 = null;
        this.failed = false;
        try { this.launch(); }
        catch (error) { this.fail(error?.message || String(error)); }
      }, delays201[attempt201]);
      return;
    }

    this.recovering201 = false;
    console.error('[Frontline Dominion v16.8.17] authoritative Worker fallback:', message201);
    this.game.alert?.(`Simulation Worker отключён: ${message201}. Включён совместимый основной поток.`, 'danger');
  }
"""
if bridge.count(fail_anchor) != 1:
    raise RuntimeError('build 201 bridge fail method anchor missing')
bridge = bridge.replace(fail_anchor, fail_replacement, 1)

diagnostics_anchor = """      commandsSent: this.seq, lastAck: this.lastAck, actionErrors: this.actionErrors,
      mainLegacyTicks: this.mainLegacyTicks,
"""
diagnostics_replacement = """      commandsSent: this.seq, lastAck: this.lastAck, actionErrors: this.actionErrors,
      recovering201: this.recovering201, recoveryAttempts201: this.recoveryAttempts201,
      recoverySuccesses201: this.recoverySuccesses201, lastRecoveryReason201: this.lastRecoveryReason201,
      mainLegacyTicks: this.mainLegacyTicks,
"""
if bridge.count(diagnostics_anchor) != 1:
    raise RuntimeError('build 201 bridge diagnostics anchor missing')
bridge = bridge.replace(diagnostics_anchor, diagnostics_replacement, 1)
bridge_path.write_text(bridge, 'utf-8')

# Install the free/formation owner in the authoritative Worker after all older
# movement wrappers. This is what makes the setting and destinations canonical.
worker = worker_path.read_text('utf-8')
worker = re.sub(
    r"\nimportScripts\('/frontline-dominion/group-movement-v201\.js\?build=\d+'\);",
    '', worker,
)
worker_owner = '\n\nconst D = self.__FD_DEBUG__;'
if worker_owner not in worker:
    raise RuntimeError('build 201 Worker owner anchor missing')
worker_import = f"importScripts('/frontline-dominion/group-movement-v201.js?build={BUILD}');"
worker = worker.replace(worker_owner, f'\n{worker_import}{worker_owner}', 1)
worker_diagnostics_anchor = """        hierarchical164: game?.hierarchicalDiagnostics164?.() || null,
        mass163: game?.massDiagnostics163?.() || null,
"""
worker_diagnostics_replacement = """        hierarchical164: game?.hierarchicalDiagnostics164?.() || null,
        mass163: game?.massDiagnostics163?.() || null,
        groupMovement201: self.__FD_GROUP_MOVEMENT_201__?.diagnostics?.() || null,
"""
if worker.count(worker_diagnostics_anchor) != 1:
    raise RuntimeError('build 201 Worker group diagnostics anchor missing')
worker = worker.replace(worker_diagnostics_anchor, worker_diagnostics_replacement, 1)
worker_path.write_text(worker, 'utf-8')

# Do not let the interaction watchdog race the bridge's bounded automatic
# recovery by launching a second Worker on the same click.
watchdog = watchdog_path.read_text('utf-8')
watchdog_anchor = """    const currentBridge = bridge();
    if (!currentBridge) return false;
    state.wakeAttempts += 1;
"""
watchdog_replacement = """    const currentBridge = bridge();
    if (!currentBridge) return false;
    if (currentBridge.recovering201 || currentBridge.recoveryTimer201) return true;
    state.wakeAttempts += 1;
"""
if watchdog.count(watchdog_anchor) != 1:
    raise RuntimeError('build 201 watchdog recovery guard anchor missing')
watchdog = watchdog.replace(watchdog_anchor, watchdog_replacement, 1)
watchdog = re.sub(r"const VERSION = '16\.8\.[0-9]+';", f"const VERSION = '{VERSION}';", watchdog, count=1)
watchdog = re.sub(r'const BUILD = \d+;', f'const BUILD = {BUILD};', watchdog, count=1)
watchdog_path.write_text(watchdog, 'utf-8')

ui = ui200_path.read_text('utf-8')
ui = re.sub(r"const VERSION = '16\.8\.[0-9]+';", f"const VERSION = '{VERSION}';", ui, count=1)
ui = re.sub(r'const BUILD = \d+;', f'const BUILD = {BUILD};', ui, count=1)
ui = ui.replace('__FD_RUNTIME_UI_200__', '__FD_RUNTIME_UI_201__').replace('[FD200]', '[FD201]')
(OUT / 'runtime-ui-v201.js').write_text(ui, 'utf-8')

shell = shell200_path.read_text('utf-8')
shell = re.sub(r"const VERSION = '16\.8\.[0-9]+';", f"const VERSION = '{VERSION}';", shell, count=1)
shell = re.sub(r'const BUILD = \d+;', f'const BUILD = {BUILD};', shell, count=1)
shell = shell.replace('__FD_RUNTIME_SHELL_200__', '__FD_RUNTIME_SHELL_201__')
shell = shell.replace('__FD_BOOT_200__', '__FD_BOOT_201__').replace('[FD200]', '[FD201]')
shell = shell.replace('fd-loading200', 'fd-loading201').replace('fd-ready200', 'fd-ready201').replace('fd-running200', 'fd-running201')
(OUT / 'runtime-shell-v201.js').write_text(shell, 'utf-8')

for path in (bridge_path, worker_path, profiler_path):
    text = path.read_text('utf-8')
    text = re.sub(r'const BUILD = \d+;', f'const BUILD = {BUILD};', text, count=1)
    text = re.sub(r"const VERSION = '16\.8\.[0-9]+';", f"const VERSION = '{VERSION}';", text, count=1)
    text = re.sub(r'authoritative-simulation-worker-v174\.js\?build=\d+', f'authoritative-simulation-worker-v174.js?build={BUILD}', text)
    text = re.sub(r"version: '16\.8\.[0-9]+', build: \d+", f"version: '{VERSION}', build: {BUILD}", text)
    path.write_text(text, 'utf-8')

asset_pattern = re.compile(r"(/frontline-dominion/[^\s\'\"`)]+\.(?:js|json|webp))\?build=\d+")
for path in sorted(OUT.glob('*.js')):
    text = path.read_text('utf-8')
    text = asset_pattern.sub(rf'\1?build={BUILD}', text)
    path.write_text(text, 'utf-8')

html = html_path.read_text('utf-8')
html = re.sub(
    r'\s*<script\b[^>]*src=["\'](?:\./|/frontline-dominion/)(?:runtime-ui-v(?:200|201)|runtime-shell-v(?:200|201)|building-model-hit-v201|group-movement-v201)\.js(?:\?build=\d+)?["\'][^>]*></script>',
    '', html, flags=re.I,
)
html = html.replace('fd-boot200-script', 'fd-boot201-script').replace('fd-boot200-style', 'fd-boot201-style')
html = html.replace('__FD_BOOT_200__', '__FD_BOOT_201__')
html = html.replace('fd-loading200', 'fd-loading201').replace('fd-ready200', 'fd-ready201').replace('fd-running200', 'fd-running201')
html = re.sub(r"const VERSION = '16\.8\.[0-9]+', BUILD = \d+;", f"const VERSION = '{VERSION}', BUILD = {BUILD};", html, count=1)
html = re.sub(r'data-fd-canonical-build="\d+"', f'data-fd-canonical-build="{BUILD}"', html, count=1)
html = re.sub(r'<title>.*?</title>', f'<title>Frontline Dominion v{VERSION} — Selection, Groups & Worker Recovery</title>', html, count=1, flags=re.S)
html = re.sub(
    r'ОПЕРАТИВНО-ТАКТИЧЕСКАЯ RTS · v16\.8\.\d+ BUILD \d+',
    f'ОПЕРАТИВНО-ТАКТИЧЕСКАЯ RTS · v{VERSION} BUILD {BUILD}', html, count=1,
)
html = re.sub(
    r'<p class=["\']lead["\']>.*?</p>',
    '<p class="lead">Точное снятие выделения со зданий, свободное управление группой и автоматическое восстановление Simulation Worker.</p>',
    html, count=1, flags=re.S,
)

balanced_button = '<button type="button" class="formation-chip active" data-formation-mode="balanced" title="Боевой строй: броня впереди, поддержка и ПВО сзади">Боевой</button>'
balanced_plain = '<button type="button" class="formation-chip" data-formation-mode="balanced" title="Боевой строй: броня впереди, поддержка и ПВО сзади">Боевой</button>'
free_button = '<button type="button" class="formation-chip active" data-formation-free="true" aria-pressed="true" title="Независимые маршруты и свободные позиции без общего строя">Свободно</button>'
if 'data-formation-free="true"' not in html:
    if html.count(balanced_button) != 1:
        raise RuntimeError(f'build 201 balanced formation button anchor invalid: {html.count(balanced_button)}')
    html = html.replace(balanced_button, free_button + '\n          ' + balanced_plain, 1)
html = html.replace('<span id="formation-status">Боевой</span>', '<span id="formation-status">Свободное движение</span>', 1)
html = html.replace(
    'Назначьте роль и фланг отдельным подразделениям, затем выберите форму для всей группы.',
    'По умолчанию группа движется свободно. Выбор любой формы включает общий строй.',
    1,
)

def cache_bust(match):
    return f'{match.group(1)}?build={BUILD}{match.group(2)}'

html = re.sub(
    r'(<script\b[^>]*\bsrc=["\'](?:\./|/frontline-dominion/)[^"\']+\.js)(?:\?build=\d+)?(["\'][^>]*></script>)',
    cache_bust, html, flags=re.I,
)

contour_tag = f'<script src="./building-selection-contour-v200.js?build={BUILD}"></script>'
if contour_tag not in html:
    raise RuntimeError('build 201 contour HTML anchor missing')
html = html.replace(contour_tag, contour_tag + f'\n<script src="./building-model-hit-v201.js?build={BUILD}"></script>', 1)

resilience_tag = f'<script src="./simulation-resilience-v200.js?build={BUILD}"></script>'
if resilience_tag not in html:
    raise RuntimeError('build 201 simulation resilience HTML anchor missing')
html = html.replace(
    resilience_tag,
    resilience_tag + f'\n<script src="./group-movement-v201.js?build={BUILD}"></script>\n<script src="./runtime-ui-v201.js?build={BUILD}"></script>',
    1,
)
html = html.replace('</body>', f'<script src="./runtime-shell-v201.js?build={BUILD}"></script>\n</body>', 1)
html_path.write_text(html, 'utf-8')

for path in sorted(OUT.glob('*.js')):
    text = path.read_text('utf-8')
    text = asset_pattern.sub(rf'\1?build={BUILD}', text)
    path.write_text(text, 'utf-8')

launcher = f'''<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="color-scheme" content="dark"><title>Frontline Dominion v{VERSION}</title><style>*{{box-sizing:border-box}}html,body{{margin:0;min-height:100%;background:#050b10;color:#dcecf4;font-family:system-ui,sans-serif}}body{{display:grid;place-items:center;min-height:100vh;padding:24px;background:#071019}}main{{width:min(720px,100%);padding:36px;border:1px solid #365363;border-radius:18px;background:#0a151d}}a{{display:inline-flex;min-height:54px;align-items:center;padding:0 24px;border-radius:10px;background:#d9edf7;color:#071019;text-decoration:none;font-weight:900}}</style></head><body><main><div>ЕДИНСТВЕННАЯ АКТУАЛЬНАЯ СБОРКА · BUILD {BUILD}</div><h1>Frontline Dominion</h1><p>Исправлены точное снятие выделения со зданий, свободное и строевое движение групп, а также автоматическое восстановление Simulation Worker после загрузки.</p><a id="launch" href="./frontline-dominion.html?build={BUILD}">Запустить игру</a><p>v{VERSION} · build {BUILD} · GitHub Pages</p></main></body></html>'''
(OUT / 'index.html').write_text(launcher, 'utf-8')

final_html = html_path.read_text('utf-8')
required = [
    f'building-selection-contour-v200.js?build={BUILD}',
    f'building-model-hit-v201.js?build={BUILD}',
    f'group-movement-v201.js?build={BUILD}',
    f'runtime-ui-v201.js?build={BUILD}',
    f'runtime-shell-v201.js?build={BUILD}',
]
for item in required:
    if final_html.count(item) != 1:
        raise RuntimeError(f'build 201 owner count invalid: {item}')
if 'runtime-shell-v200.js?build=201' in final_html or 'runtime-ui-v200.js?build=201' in final_html:
    raise RuntimeError('build 201 still loads obsolete runtime owner')
if worker_path.read_text('utf-8').count(worker_import) != 1:
    raise RuntimeError('build 201 Worker group owner count invalid')
if context_replacement not in bridge_path.read_text('utf-8'):
    raise RuntimeError('build 201 context formation payload missing')
if 'recoveryAttempts201' not in bridge_path.read_text('utf-8'):
    raise RuntimeError('build 201 Worker recovery state missing')
if 'data-formation-free="true"' not in final_html:
    raise RuntimeError('build 201 free movement control missing')
if 'formation-chip active" data-formation-mode="balanced"' in final_html:
    raise RuntimeError('build 201 still enables formation by default')

print(f'Frontline Dominion v{VERSION} build {BUILD} selection, group movement and Worker recovery assembled')
