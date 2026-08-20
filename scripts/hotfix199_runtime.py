from pathlib import Path

OUT = Path('dist')
shell_path = OUT / 'runtime-shell-v199.js'
html_path = OUT / 'frontline-dominion.html'
gameplay_path = OUT / 'gameplay-reliability-v199.js'

if not shell_path.exists() or not html_path.exists() or not gameplay_path.exists():
    raise RuntimeError('build 199 runtime output is missing')

gameplay = gameplay_path.read_text('utf-8')
readonly_assignment = '    unit.currentCommand = null;\n'
if gameplay.count(readonly_assignment) != 1:
    raise RuntimeError('build 199 readonly currentCommand assignment count invalid')
gameplay = gameplay.replace(readonly_assignment, '', 1)
gameplay_path.write_text(gameplay, 'utf-8')

shell = shell_path.read_text('utf-8')
readiness_anchor = """    if (bridge) {
      const tick = Number(bridge.workerTick || 0);
      return { ready: tick > 0, failed: false, reason: tick > 0 ? null : 'worker-not-ticking' };
    }
"""
readiness_replacement = """    if (bridge) {
      const tick = Number(bridge.workerTick || 0);
      const ready = Boolean(bridge.ready && tick > 0);
      return {
        ready,
        failed: false,
        reason: ready ? null : (bridge.ready ? 'worker-not-ticking' : 'worker-not-ready'),
      };
    }
"""
if shell.count(readiness_anchor) != 1:
    raise RuntimeError('build 199 launch-readiness anchor count invalid')
shell = shell.replace(readiness_anchor, readiness_replacement, 1)

listener_anchor = """    const cleanStart = startButton.cloneNode(true);
    const cleanLoad = loadButton.cloneNode(true);
    startButton.replaceWith(cleanStart);
    loadButton.replaceWith(cleanLoad);
    startButton = cleanStart;
    loadButton = cleanLoad;
    startButton.addEventListener('click', launchNewGame, { capture: true });
    loadButton.addEventListener('click', launchSavedGame, { capture: true });
"""
listener_replacement = """    const cleanStart = startButton.cloneNode(true);
    const cleanLoad = loadButton.cloneNode(true);
    cleanStart.removeAttribute('onclick');
    cleanLoad.removeAttribute('onclick');
    startButton.replaceWith(cleanStart);
    loadButton.replaceWith(cleanLoad);
    startButton = cleanStart;
    loadButton = cleanLoad;
    startButton.addEventListener('click', launchNewGame, { capture: true });
    loadButton.addEventListener('click', launchSavedGame, { capture: true });
"""
if shell.count(listener_anchor) != 1:
    raise RuntimeError('build 199 canonical button-owner anchor count invalid')
shell = shell.replace(listener_anchor, listener_replacement, 1)

ready_anchor = """    state.installed = true;
    state.installedAt = performance.now();
    boot?.setReady?.(true);
    console.info('[FD199] Canonical launch/save owner ready', {
"""
ready_replacement = """    state.installed = true;
    state.installedAt = performance.now();
    boot?.setReady?.(true);
    startButton.disabled = false;
    loadButton.disabled = !candidate;
    startButton.setAttribute('aria-disabled', 'false');
    loadButton.setAttribute('aria-disabled', candidate ? 'false' : 'true');
    console.info('[FD199] Canonical launch/save owner ready', {
"""
if shell.count(ready_anchor) != 1:
    raise RuntimeError('build 199 live-button readiness anchor count invalid')
shell = shell.replace(ready_anchor, ready_replacement, 1)
shell_path.write_text(shell, 'utf-8')

html = html_path.read_text('utf-8')
if html.count('runtime-shell-v199.js?build=199') != 1:
    raise RuntimeError('build 199 runtime shell HTML owner count invalid after hotfix')
if 'building-single-render-v198.js?build=199' in html:
    raise RuntimeError('obsolete build 198 render owner remains connected')

checks = {
    'bridge.ready && tick > 0': 'authoritative load readiness',
    'startButton.disabled = false': 'live start button readiness',
    'loadButton.disabled = !candidate': 'live load button readiness',
    "cleanLoad.removeAttribute('onclick')": 'canonical load handler ownership',
}
final_shell = shell_path.read_text('utf-8')
for marker, label in checks.items():
    if marker not in final_shell:
        raise RuntimeError(f'build 199 runtime hotfix missing: {label}')
if 'unit.currentCommand = null' in gameplay_path.read_text('utf-8'):
    raise RuntimeError('build 199 readonly currentCommand assignment remains')

for patch_script in (
    'scripts/hotfix199_post_load_current_command.py',
    'scripts/hotfix199_tests.py',
    'scripts/diagnose199_waitgame.py',
    'scripts/hotfix199_reliability_saveload.py',
):
    patch = Path(patch_script)
    if not patch.exists():
        raise RuntimeError(f'build 199 patch script missing: {patch_script}')
    exec(compile(patch.read_text('utf-8'), str(patch), 'exec'), {'__name__': '__main__'})

print('Frontline Dominion build 199 canonical saved-game, transport and physical-click hotfixes installed')