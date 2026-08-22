from pathlib import Path
import re

ROOT = Path('.')
OUT = ROOT / 'dist'
BUILD = 210
VERSION = '16.9.4'
HTML = OUT / 'frontline-dominion.html'
WORKER = OUT / 'authoritative-simulation-worker-v174.js'
BRIDGE = OUT / 'authoritative-simulation-v174.js'
INPUT = OUT / 'command-input-v190.js'

required = [
    HTML, WORKER, BRIDGE, INPUT,
    OUT / 'runtime-ui-v209.js',
    OUT / 'runtime-shell-v209.js',
    OUT / 'save-slots-v209.js',
    OUT / 'movement-target-fidelity-v209.js',
]
for path in required:
    if not path.exists():
        raise RuntimeError(f'build 210 inherited output missing: {path}')


def sub_once(text, pattern, repl, label, flags=0):
    updated, count = re.subn(pattern, repl, text, count=1, flags=flags)
    if count != 1:
        raise RuntimeError(f'build 210 {label}: expected one anchor, got {count}')
    return updated


def clone_owner(source_name, target_name, replacements, alias_line):
    text = (OUT / source_name).read_text('utf-8')
    text = sub_once(text, r'const BUILD = 209;', f'const BUILD = {BUILD};', f'{source_name} BUILD')
    text = re.sub(r"const VERSION = '[^']+';", f"const VERSION = '{VERSION}';", text, count=1)
    for old, new in replacements:
        text = text.replace(old, new)
    text = text.replace('?build=209', '?build=210')
    text += '\n' + alias_line + '\n'
    (OUT / target_name).write_text(text, 'utf-8')


# The actual bug: client coordinates are CSS pixels, while canvas.width/height are
# physical backing-store pixels on HiDPI/Retina devices. screenToWorld uses
# game.viewport coordinates, so scaling through canvas.width doubles the point at
# DPR=2 and rotates a visually upward command into a right/down world target.
input_text = INPUT.read_text('utf-8')
old = """    const sx = (clientX - rect.left) * (target.width || rect.width) / rect.width;
    const sy = (clientY - rect.top) * (target.height || rect.height) / rect.height;
"""
new = """    const viewportWidth = finite(current?.viewport?.width) && Number(current.viewport.width) > 0
      ? Number(current.viewport.width) : rect.width;
    const viewportHeight = finite(current?.viewport?.height) && Number(current.viewport.height) > 0
      ? Number(current.viewport.height) : rect.height;
    const sx = (clientX - rect.left) * viewportWidth / rect.width;
    const sy = (clientY - rect.top) * viewportHeight / rect.height;
"""
if input_text.count(old) != 1:
    raise RuntimeError(f'build 210 command-input coordinate anchor count={input_text.count(old)}')
input_text = input_text.replace(old, new, 1)
marker = "\n  root.__FD_SCREEN_INPUT_FIDELITY_210__ = { version: '16.9.4', build: 210, coordinateSpace: 'game-viewport-css' };\n"
close = "\n})();\n"
if input_text.count(close) != 1:
    raise RuntimeError('build 210 command-input close anchor not unique')
input_text = input_text.replace(close, marker + close, 1)
INPUT.write_text(input_text, 'utf-8')

clone_owner(
    'runtime-ui-v209.js', 'runtime-ui-v210.js',
    [('__FD_RUNTIME_UI_209__', '__FD_RUNTIME_UI_210__'), ('[FD209]', '[FD210]')],
    'globalThis.__FD_RUNTIME_UI_209__ ||= globalThis.__FD_RUNTIME_UI_210__; globalThis.__FD_RUNTIME_UI_208__ ||= globalThis.__FD_RUNTIME_UI_210__; globalThis.__FD_RUNTIME_UI_207__ ||= globalThis.__FD_RUNTIME_UI_210__; globalThis.__FD_RUNTIME_UI_206__ ||= globalThis.__FD_RUNTIME_UI_210__;',
)
clone_owner(
    'runtime-shell-v209.js', 'runtime-shell-v210.js',
    [
        ('__FD_RUNTIME_SHELL_209__', '__FD_RUNTIME_SHELL_210__'),
        ('__FD_BOOT_209__', '__FD_BOOT_210__'),
        ('fd-loading209', 'fd-loading210'),
        ('fd-ready209', 'fd-ready210'),
        ('fd-running209', 'fd-running210'),
        ('[FD209]', '[FD210]'),
    ],
    'globalThis.__FD_RUNTIME_SHELL_209__ ||= globalThis.__FD_RUNTIME_SHELL_210__; globalThis.__FD_RUNTIME_SHELL_208__ ||= globalThis.__FD_RUNTIME_SHELL_210__; globalThis.__FD_BOOT_209__ ||= globalThis.__FD_BOOT_210__; globalThis.__FD_BOOT_208__ ||= globalThis.__FD_BOOT_210__;',
)
# Save storage remains intentionally compatible with build 208/209.
clone_owner(
    'save-slots-v209.js', 'save-slots-v210.js',
    [
        ('__FD_SAVE_SLOTS_209__', '__FD_SAVE_SLOTS_210__'),
        ('__FD_RUNTIME_SHELL_209__', '__FD_RUNTIME_SHELL_210__'),
        ('__FD_BOOT_209__', '__FD_BOOT_210__'),
    ],
    'globalThis.__FD_SAVE_SLOTS_209__ ||= globalThis.__FD_SAVE_SLOTS_210__; globalThis.__FD_SAVE_SLOTS_208__ ||= globalThis.__FD_SAVE_SLOTS_210__; globalThis.__FD_SAVE_SLOTS_207__ ||= globalThis.__FD_SAVE_SLOTS_210__;',
)

worker = WORKER.read_text('utf-8')
worker = sub_once(worker, r'const BUILD = 209;', f'const BUILD = {BUILD};', 'Worker BUILD')
worker = re.sub(r"const VERSION = '[^']+';", f"const VERSION = '{VERSION}';", worker, count=1)
worker = worker.replace('?build=209', '?build=210')
WORKER.write_text(worker, 'utf-8')

bridge = BRIDGE.read_text('utf-8')
bridge = sub_once(bridge, r'const BUILD = 209;', f'const BUILD = {BUILD};', 'bridge BUILD')
bridge = re.sub(r"const VERSION = '[^']+';", f"const VERSION = '{VERSION}';", bridge, count=1)
bridge = bridge.replace('?build=209', '?build=210')
BRIDGE.write_text(bridge, 'utf-8')

for path in sorted(OUT.glob('*.js')):
    text = path.read_text('utf-8')
    if '?build=209' in text:
        path.write_text(text.replace('?build=209', '?build=210'), 'utf-8')

html = HTML.read_text('utf-8')
html = html.replace('?build=209', '?build=210')
html = re.sub(r'data-fd-canonical-build="209"', 'data-fd-canonical-build="210"', html, count=1)
html = html.replace('Frontline Dominion v16.9.3', 'Frontline Dominion v16.9.4')
html = html.replace('v16.9.3', 'v16.9.4')
html = html.replace('BUILD 209', 'BUILD 210').replace('build 209', 'build 210')
html = html.replace('runtime-ui-v209.js?build=210', 'runtime-ui-v210.js?build=210')
html = html.replace('runtime-shell-v209.js?build=210', 'runtime-shell-v210.js?build=210')
html = html.replace('save-slots-v209.js?build=210', 'save-slots-v210.js?build=210')
old_boot = '<script id="fd-boot-bridge209">globalThis.__FD_BOOT_209__ ||= globalThis.__FD_BOOT_208__ || globalThis.__FD_BOOT_207__ || globalThis.__FD_BOOT_206__;</script>'
new_boot = '<script id="fd-boot-bridge210">globalThis.__FD_BOOT_210__ ||= globalThis.__FD_BOOT_209__ || globalThis.__FD_BOOT_208__ || globalThis.__FD_BOOT_207__ || globalThis.__FD_BOOT_206__;</script>'
if html.count(old_boot) != 1:
    raise RuntimeError(f'build 210 boot bridge anchor count={html.count(old_boot)}')
html = html.replace(old_boot, new_boot, 1)
HTML.write_text(html, 'utf-8')

index = OUT / 'index.html'
if index.exists():
    text = index.read_text('utf-8')
    text = text.replace('?build=209', '?build=210')
    text = text.replace('build 209', 'build 210').replace('Build 209', 'Build 210')
    text = text.replace('v16.9.3', 'v16.9.4')
    text = re.sub(r'data-fd-canonical-build="209"', 'data-fd-canonical-build="210"', text, count=1)
    index.write_text(text, 'utf-8')

print('Frontline Dominion v16.9.4 build 210 HiDPI screen input fidelity assembled')
