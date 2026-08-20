from pathlib import Path
import re

ROOT = Path('.')
OUT = ROOT / 'dist'
BUILD = 200
VERSION = '16.8.16'

html_path = OUT / 'frontline-dominion.html'
bridge_path = OUT / 'authoritative-simulation-v174.js'
worker_path = OUT / 'authoritative-simulation-worker-v174.js'
command_input_path = OUT / 'command-input-v190.js'
ui199_path = OUT / 'runtime-ui-v199.js'
shell199_path = OUT / 'runtime-shell-v199.js'
profiler_path = OUT / 'simulation-profiler-v166.js'
sources = [
    ROOT / 'src' / 'v200' / 'simulation-resilience-v200.js',
    ROOT / 'src' / 'v200' / 'building-selection-contour-v200.js',
]

for path in [
    html_path, bridge_path, worker_path, command_input_path, ui199_path,
    shell199_path, profiler_path, *sources,
]:
    if not path.exists():
        raise RuntimeError(f'build 200 required file missing: {path}')

for source in sources:
    (OUT / source.name).write_text(source.read_text('utf-8'), 'utf-8')

# Build 190 owned all physical right-click routes.  Modern target cursors live
# in commandMode, so make that field authoritative for cancellation as well.
command_input = command_input_path.read_text('utf-8')
old_guard = 'if (current.buildMode || current.powerMode || current.strategicMode) {'
new_guard = 'if (current.commandMode || current.buildMode || current.powerMode || current.strategicMode) {'
if old_guard in command_input:
    command_input = command_input.replace(old_guard, new_guard, 1)
elif command_input.count(new_guard) != 1:
    raise RuntimeError('build 200 command-mode cancellation guard missing')
command_input_path.write_text(command_input, 'utf-8')

# Load the resilience owner after every simulation extension has wrapped the
# engine, both in the authoritative Worker and on the main thread.
worker = worker_path.read_text('utf-8')
worker_import = f"importScripts('/frontline-dominion/simulation-resilience-v200.js?build={BUILD}');"
worker = re.sub(
    r"\nimportScripts\('/frontline-dominion/simulation-resilience-v200\.js\?build=\d+'\);",
    '',
    worker,
)
worker_owner = '\n\nconst D = self.__FD_DEBUG__;'
if worker_owner not in worker:
    raise RuntimeError('build 200 Worker owner anchor missing')
worker = worker.replace(worker_owner, f'\n{worker_import}{worker_owner}', 1)

# A runtime tick failure used to escape the timer callback and silently stop
# the Worker.  Surface it to the bridge so the game can continue in the safe
# main-thread fallback rather than becoming inert and later returning to menu.
pump_anchor = """      runTick();
      nextTickAt += 1000 / SIM_HZ;
      steps += 1;
"""
pump_replacement = """      try {
        runTick();
      } catch (error) {
        running = false;
        postMessage({
          type: 'fatal',
          stage: 'tick',
          message: String(error?.message || error || 'unknown tick failure'),
          stack: String(error?.stack || ''),
          tick: Number(game?.simTick || 0),
        });
        return;
      }
      nextTickAt += 1000 / SIM_HZ;
      steps += 1;
"""
if worker.count(pump_anchor) != 1:
    raise RuntimeError(f'build 200 Worker pump anchor count invalid: {worker.count(pump_anchor)}')
worker = worker.replace(pump_anchor, pump_replacement, 1)
worker_path.write_text(worker, 'utf-8')

bridge = bridge_path.read_text('utf-8')
constructor_anchor = '    this.actionErrors = 0;\n'
if bridge.count(constructor_anchor) != 1:
    raise RuntimeError('build 200 bridge error-state anchor missing')
bridge = bridge.replace(constructor_anchor, constructor_anchor + '    this.lastError = null;\n', 1)
fail_anchor = """  fail(reason) {
    if (this.failed) return;
    this.failed = true;
"""
fail_replacement = """  fail(reason) {
    if (this.failed) return;
    this.lastError = String(reason || 'authoritative-worker-failed');
    this.failed = true;
"""
if bridge.count(fail_anchor) != 1:
    raise RuntimeError('build 200 bridge fail anchor missing')
bridge = bridge.replace(fail_anchor, fail_replacement, 1)
bridge_path.write_text(bridge, 'utf-8')

ui = ui199_path.read_text('utf-8')
ui = re.sub(r"const VERSION = '16\.8\.[0-9]+';", f"const VERSION = '{VERSION}';", ui, count=1)
ui = re.sub(r'const BUILD = \d+;', f'const BUILD = {BUILD};', ui, count=1)
ui = ui.replace('__FD_RUNTIME_UI_199__', '__FD_RUNTIME_UI_200__').replace('[FD199]', '[FD200]')
(OUT / 'runtime-ui-v200.js').write_text(ui, 'utf-8')

shell = shell199_path.read_text('utf-8')
shell = re.sub(r"const VERSION = '16\.8\.[0-9]+';", f"const VERSION = '{VERSION}';", shell, count=1)
shell = re.sub(r'const BUILD = \d+;', f'const BUILD = {BUILD};', shell, count=1)
shell = shell.replace('__FD_RUNTIME_SHELL_199__', '__FD_RUNTIME_SHELL_200__')
shell = shell.replace('__FD_BOOT_199__', '__FD_BOOT_200__').replace('[FD199]', '[FD200]')
shell = shell.replace('fd-loading199', 'fd-loading200').replace('fd-ready199', 'fd-ready200').replace('fd-running199', 'fd-running200')
state_anchor = """    invalidSaveKeys: [],
  };
"""
state_replacement = """    invalidSaveKeys: [],
    fallbackBridgeId: null,
    fallbackStartTick: null,
    fallbackObservedAt: null,
  };
"""
if shell.count(state_anchor) != 1:
    raise RuntimeError('build 200 runtime fallback state anchor missing')
shell = shell.replace(state_anchor, state_replacement, 1)
failed_anchor = """    if (bridge?.failed) {
      return { ready: false, failed: true, reason: bridge.lastError || 'authoritative-worker-failed' };
    }
"""
failed_replacement = """    if (bridge?.failed) {
      const tick = Number(game.simTick || 0);
      if (state.fallbackBridgeId !== bridge.id) {
        state.fallbackBridgeId = bridge.id;
        state.fallbackStartTick = tick;
        state.fallbackObservedAt = performance.now();
        return { ready: false, failed: false, reason: 'main-thread-fallback-starting' };
      }
      if (tick > Number(state.fallbackStartTick ?? tick)) {
        return { ready: true, failed: false, reason: 'main-thread-fallback' };
      }
      const stalled = performance.now() - Number(state.fallbackObservedAt || performance.now()) > 2500;
      return {
        ready: false,
        failed: stalled,
        reason: stalled ? (bridge.lastError || 'main-thread-fallback-stalled') : 'main-thread-fallback-starting',
      };
    }
"""
if shell.count(failed_anchor) != 1:
    raise RuntimeError('build 200 runtime failed-bridge anchor missing')
shell = shell.replace(failed_anchor, failed_replacement, 1)
launch_reset_anchor = """    state.lastError = null;
    boot?.setLaunching?.(true);
"""
launch_reset_replacement = """    state.lastError = null;
    state.fallbackBridgeId = null;
    state.fallbackStartTick = null;
    state.fallbackObservedAt = null;
    boot?.setLaunching?.(true);
"""
if shell.count(launch_reset_anchor) != 1:
    raise RuntimeError('build 200 runtime launch reset anchor missing')
shell = shell.replace(launch_reset_anchor, launch_reset_replacement, 1)
(OUT / 'runtime-shell-v200.js').write_text(shell, 'utf-8')

for path in (bridge_path, worker_path):
    text = path.read_text('utf-8')
    text = re.sub(r'const BUILD = \d+;', f'const BUILD = {BUILD};', text, count=1)
    text = re.sub(r"const VERSION = '16\.8\.[0-9]+';", f"const VERSION = '{VERSION}';", text, count=1)
    text = re.sub(r'authoritative-simulation-worker-v174\.js\?build=\d+', f'authoritative-simulation-worker-v174.js?build={BUILD}', text)
    text = re.sub(r"version: '16\.8\.[0-9]+', build: \d+", f"version: '{VERSION}', build: {BUILD}", text)
    path.write_text(text, 'utf-8')

profiler = profiler_path.read_text('utf-8')
profiler = re.sub(r"const VERSION = '16\.8\.[0-9]+';", f"const VERSION = '{VERSION}';", profiler, count=1)
profiler = re.sub(r'const BUILD = \d+;', f'const BUILD = {BUILD};', profiler, count=1)
profiler_path.write_text(profiler, 'utf-8')

asset_pattern = re.compile(r"(/frontline-dominion/[^\s\'\"`)]+\.(?:js|json|webp))\?build=\d+")
for path in sorted(OUT.glob('*.js')):
    text = path.read_text('utf-8')
    text = asset_pattern.sub(rf'\1?build={BUILD}', text)
    path.write_text(text, 'utf-8')

html = html_path.read_text('utf-8')
html = re.sub(
    r'\s*<script\b[^>]*src=["\'](?:\./|/frontline-dominion/)(?:runtime-ui-v(?:199|200)|runtime-shell-v(?:199|200)|simulation-resilience-v200|building-selection-contour-v200)\.js(?:\?build=\d+)?["\'][^>]*></script>',
    '', html, flags=re.I,
)
html = html.replace('fd-boot199-script', 'fd-boot200-script').replace('fd-boot199-style', 'fd-boot200-style')
html = html.replace('__FD_BOOT_199__', '__FD_BOOT_200__')
html = html.replace('fd-loading199', 'fd-loading200').replace('fd-ready199', 'fd-ready200').replace('fd-running199', 'fd-running200')
html = re.sub(r"const VERSION = '16\.8\.[0-9]+', BUILD = \d+;", f"const VERSION = '{VERSION}', BUILD = {BUILD};", html, count=1)
html = re.sub(r'data-fd-canonical-build="\d+"', f'data-fd-canonical-build="{BUILD}"', html, count=1)
html = re.sub(r'<title>.*?</title>', f'<title>Frontline Dominion v{VERSION} — Save & Recon Reliability</title>', html, count=1, flags=re.S)
html = re.sub(
    r'ОПЕРАТИВНО-ТАКТИЧЕСКАЯ RTS · v16\.8\.\d+ BUILD \d+',
    f'ОПЕРАТИВНО-ТАКТИЧЕСКАЯ RTS · v{VERSION} BUILD {BUILD}', html, count=1,
)
html = re.sub(
    r'<p class=["\']lead["\']>.*?</p>',
    '<p class="lead">Надёжная загрузка сохранений, точный контур выбранного здания и корректный 12-секундный разведывательный импульс.</p>',
    html, count=1, flags=re.S,
)

def cache_bust(match):
    return f'{match.group(1)}?build={BUILD}{match.group(2)}'

html = re.sub(
    r'(<script\b[^>]*\bsrc=["\'](?:\./|/frontline-dominion/)[^"\']+\.js)(?:\?build=\d+)?(["\'][^>]*></script>)',
    cache_bust, html, flags=re.I,
)

authority_tag = f'<script src="./building-render-authority-v199.js?build={BUILD}"></script>'
if authority_tag not in html:
    raise RuntimeError('build 200 building render authority tag missing')
html = html.replace(
    authority_tag,
    authority_tag + f'\n<script src="./building-selection-contour-v200.js?build={BUILD}"></script>',
    1,
)

profiler_tag = re.search(
    rf'<script\b[^>]*src=["\'](?:\./|/frontline-dominion/)simulation-profiler-v166\.js\?build={BUILD}["\'][^>]*></script>',
    html, flags=re.I,
)
if not profiler_tag:
    raise RuntimeError('build 200 profiler HTML anchor missing')
runtime_tags = (
    f'<script src="./simulation-resilience-v200.js?build={BUILD}"></script>\n'
    f'<script src="./runtime-ui-v200.js?build={BUILD}"></script>\n'
)
html = html[:profiler_tag.start()] + runtime_tags + html[profiler_tag.start():]
html = html.replace('</body>', f'<script src="./runtime-shell-v200.js?build={BUILD}"></script>\n</body>', 1)
html_path.write_text(html, 'utf-8')

for path in sorted(OUT.glob('*.js')):
    text = path.read_text('utf-8')
    text = asset_pattern.sub(rf'\1?build={BUILD}', text)
    path.write_text(text, 'utf-8')

launcher = f'''<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="color-scheme" content="dark"><title>Frontline Dominion v{VERSION}</title><style>*{{box-sizing:border-box}}html,body{{margin:0;min-height:100%;background:#050b10;color:#dcecf4;font-family:system-ui,sans-serif}}body{{display:grid;place-items:center;min-height:100vh;padding:24px;background:#071019}}main{{width:min(720px,100%);padding:36px;border:1px solid #365363;border-radius:18px;background:#0a151d}}a{{display:inline-flex;min-height:54px;align-items:center;padding:0 24px;border-radius:10px;background:#d9edf7;color:#071019;text-decoration:none;font-weight:900}}</style></head><body><main><div>ЕДИНСТВЕННАЯ АКТУАЛЬНАЯ СБОРКА · BUILD {BUILD}</div><h1>Frontline Dominion</h1><p>Исправлены загрузка старых сохранений, производство после загрузки, точный контур зданий, таймер разведки и отмена правой кнопкой.</p><a id="launch" href="./frontline-dominion.html?build={BUILD}">Запустить игру</a><p>v{VERSION} · build {BUILD} · GitHub Pages</p></main></body></html>'''
(OUT / 'index.html').write_text(launcher, 'utf-8')

final_html = html_path.read_text('utf-8')
required = [
    f'building-selection-contour-v200.js?build={BUILD}',
    f'simulation-resilience-v200.js?build={BUILD}',
    f'runtime-ui-v200.js?build={BUILD}',
    f'runtime-shell-v200.js?build={BUILD}',
]
for item in required:
    if final_html.count(item) != 1:
        raise RuntimeError(f'build 200 owner count invalid: {item}')
if 'runtime-shell-v199.js?build=200' in final_html or 'runtime-ui-v199.js?build=200' in final_html:
    raise RuntimeError('build 200 still loads obsolete runtime owner')
if worker_path.read_text('utf-8').count(worker_import) != 1:
    raise RuntimeError('build 200 Worker resilience owner count invalid')
if new_guard not in command_input_path.read_text('utf-8'):
    raise RuntimeError('build 200 physical right-click cancellation patch missing')
if "stage: 'tick'" not in worker_path.read_text('utf-8'):
    raise RuntimeError('build 200 Worker tick failure reporting missing')
if 'this.lastError = String(reason' not in bridge_path.read_text('utf-8'):
    raise RuntimeError('build 200 bridge failure state missing')
if 'drawBracketOverlay(this, building);' in (OUT / 'building-selection-invariance-v197.js').read_text('utf-8'):
    raise RuntimeError('build 200 square building brackets are active')
for marker, path in [
    ('__FD_SIMULATION_RESILIENCE_200__', OUT / 'simulation-resilience-v200.js'),
    ('__FD_BUILDING_SELECTION_CONTOUR_200__', OUT / 'building-selection-contour-v200.js'),
    ('__FD_RUNTIME_SHELL_200__', OUT / 'runtime-shell-v200.js'),
]:
    if marker not in path.read_text('utf-8'):
        raise RuntimeError(f'build 200 marker missing: {marker}')

print(f'Frontline Dominion v{VERSION} build {BUILD} save, selection and recon fixes assembled')
