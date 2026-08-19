from pathlib import Path

OUT = Path('dist')
shell_path = OUT / 'runtime-shell-v199.js'
html_path = OUT / 'frontline-dominion.html'

if not shell_path.exists() or not html_path.exists():
    raise RuntimeError('build 199 runtime output is missing')

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
    // The boot controller captured the historical button nodes. The canonical
    // owner has replaced them, so apply readiness to the live nodes directly.
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

print('Frontline Dominion build 199 canonical saved-game runtime hotfix installed')
