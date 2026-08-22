from pathlib import Path
import re
import shutil

ROOT = Path('.')
OUT = ROOT / 'dist'
BUILD = 209
VERSION = '16.9.3'
HTML = OUT / 'frontline-dominion.html'
WORKER = OUT / 'authoritative-simulation-worker-v174.js'
BRIDGE = OUT / 'authoritative-simulation-v174.js'
MODULE = 'movement-target-fidelity-v209.js'

# Build 209 keeps build-208 save storage identity so existing saves survive upgrade.
required = [
    HTML, WORKER, BRIDGE,
    OUT / 'runtime-ui-v208.js',
    OUT / 'runtime-shell-v208.js',
    OUT / 'save-slots-v208.js',
    OUT / 'gameplay-v208.js',
    OUT / 'logistics-ui-v208.js',
]
for path in required:
    if not path.exists():
        raise RuntimeError(f'build 209 inherited output missing: {path}')
source = ROOT / 'src' / 'v209' / MODULE
if not source.exists():
    raise RuntimeError(f'build 209 source missing: {source}')
shutil.copy2(source, OUT / MODULE)


def sub_once(text, pattern, repl, label, flags=0):
    updated, count = re.subn(pattern, repl, text, count=1, flags=flags)
    if count != 1:
        raise RuntimeError(f'build 209 {label}: expected one anchor, got {count}')
    return updated


def clone_owner(source_name, target_name, replacements, alias_line):
    text = (OUT / source_name).read_text('utf-8')
    text = sub_once(text, r'const BUILD = 208;', f'const BUILD = {BUILD};', f'{source_name} BUILD')
    text = re.sub(r"const VERSION = '[^']+';", f"const VERSION = '{VERSION}';", text, count=1)
    for old, new in replacements:
        text = text.replace(old, new)
    text = text.replace('?build=208', '?build=209')
    text += '\n' + alias_line + '\n'
    (OUT / target_name).write_text(text, 'utf-8')


clone_owner(
    'runtime-ui-v208.js', 'runtime-ui-v209.js',
    [('__FD_RUNTIME_UI_208__', '__FD_RUNTIME_UI_209__'), ('[FD208]', '[FD209]')],
    'globalThis.__FD_RUNTIME_UI_208__ ||= globalThis.__FD_RUNTIME_UI_209__; globalThis.__FD_RUNTIME_UI_207__ ||= globalThis.__FD_RUNTIME_UI_209__; globalThis.__FD_RUNTIME_UI_206__ ||= globalThis.__FD_RUNTIME_UI_209__;',
)
clone_owner(
    'runtime-shell-v208.js', 'runtime-shell-v209.js',
    [
        ('__FD_RUNTIME_SHELL_208__', '__FD_RUNTIME_SHELL_209__'),
        ('__FD_BOOT_208__', '__FD_BOOT_209__'),
        ('fd-loading208', 'fd-loading209'),
        ('fd-ready208', 'fd-ready209'),
        ('fd-running208', 'fd-running209'),
        ('[FD208]', '[FD209]'),
    ],
    'globalThis.__FD_RUNTIME_SHELL_208__ ||= globalThis.__FD_RUNTIME_SHELL_209__; globalThis.__FD_RUNTIME_SHELL_207__ ||= globalThis.__FD_RUNTIME_SHELL_209__; globalThis.__FD_RUNTIME_SHELL_206__ ||= globalThis.__FD_RUNTIME_SHELL_209__; globalThis.__FD_BOOT_208__ ||= globalThis.__FD_BOOT_209__; globalThis.__FD_BOOT_207__ ||= globalThis.__FD_BOOT_209__; globalThis.__FD_BOOT_206__ ||= globalThis.__FD_BOOT_209__;',
)
# Save format/storage remains the build-208 namespace intentionally: build 209 is
# wire/save compatible and must keep existing manual saves visible after upgrade.
clone_owner(
    'save-slots-v208.js', 'save-slots-v209.js',
    [
        ('__FD_SAVE_SLOTS_208__', '__FD_SAVE_SLOTS_209__'),
        ('__FD_RUNTIME_SHELL_208__', '__FD_RUNTIME_SHELL_209__'),
        ('__FD_BOOT_208__', '__FD_BOOT_209__'),
    ],
    'globalThis.__FD_SAVE_SLOTS_208__ ||= globalThis.__FD_SAVE_SLOTS_209__; globalThis.__FD_SAVE_SLOTS_207__ ||= globalThis.__FD_SAVE_SLOTS_209__; globalThis.__FD_SAVE_SLOTS_206__ ||= globalThis.__FD_SAVE_SLOTS_209__;',
)

worker = WORKER.read_text('utf-8')
worker = sub_once(worker, r'const BUILD = 208;', f'const BUILD = {BUILD};', 'Worker BUILD')
worker = re.sub(r"const VERSION = '[^']+';", f"const VERSION = '{VERSION}';", worker, count=1)
worker = worker.replace('?build=208', '?build=209')
anchor = "importScripts('/frontline-dominion/gameplay-v208.js?build=209');"
if worker.count(anchor) != 1:
    raise RuntimeError(f'build 209 Worker gameplay anchor count={worker.count(anchor)}')
worker = worker.replace(anchor, anchor + f"\nimportScripts('/frontline-dominion/{MODULE}?build=209');", 1)
WORKER.write_text(worker, 'utf-8')

bridge = BRIDGE.read_text('utf-8')
bridge = sub_once(bridge, r'const BUILD = 208;', f'const BUILD = {BUILD};', 'bridge BUILD')
bridge = re.sub(r"const VERSION = '[^']+';", f"const VERSION = '{VERSION}';", bridge, count=1)
bridge = bridge.replace('?build=208', '?build=209')
# Keep fd:authoritative-save208 storage identity for backwards-compatible saves.
BRIDGE.write_text(bridge, 'utf-8')

# Cache-bust inherited runtime references without rewriting their subsystem BUILD
# constants. Build 209 owns only the movement overlay and top-level runtime identity.
for path in sorted(OUT.glob('*.js')):
    text = path.read_text('utf-8')
    if '?build=208' in text:
        path.write_text(text.replace('?build=208', '?build=209'), 'utf-8')

html = HTML.read_text('utf-8')
html = html.replace('?build=208', '?build=209')
html = re.sub(r'data-fd-canonical-build="208"', 'data-fd-canonical-build="209"', html, count=1)
html = html.replace('Frontline Dominion v16.9.2', 'Frontline Dominion v16.9.3')
html = html.replace('v16.9.2', 'v16.9.3')
html = html.replace('BUILD 208', 'BUILD 209').replace('build 208', 'build 209')
html = html.replace('runtime-ui-v208.js?build=209', 'runtime-ui-v209.js?build=209')
html = html.replace('runtime-shell-v208.js?build=209', 'runtime-shell-v209.js?build=209')
html = html.replace('save-slots-v208.js?build=209', 'save-slots-v209.js?build=209')
script_anchor = '<script src="./gameplay-v208.js?build=209"></script>'
if html.count(script_anchor) != 1:
    raise RuntimeError(f'build 209 gameplay script anchor count={html.count(script_anchor)}')
html = html.replace(script_anchor, script_anchor + f'\n<script src="./{MODULE}?build=209"></script>', 1)
old_boot = '<script id="fd-boot-bridge208">globalThis.__FD_BOOT_208__ ||= globalThis.__FD_BOOT_207__ || globalThis.__FD_BOOT_206__;</script>'
new_boot = '<script id="fd-boot-bridge209">globalThis.__FD_BOOT_209__ ||= globalThis.__FD_BOOT_208__ || globalThis.__FD_BOOT_207__ || globalThis.__FD_BOOT_206__;</script>'
if html.count(old_boot) != 1:
    raise RuntimeError(f'build 209 boot bridge anchor count={html.count(old_boot)}')
html = html.replace(old_boot, new_boot, 1)
if html.count(f'{MODULE}?build=209') != 1:
    raise RuntimeError('build 209 main-thread movement owner not unique')
HTML.write_text(html, 'utf-8')

index = OUT / 'index.html'
if index.exists():
    text = index.read_text('utf-8')
    text = text.replace('?build=208', '?build=209')
    text = text.replace('build 208', 'build 209').replace('Build 208', 'Build 209')
    text = text.replace('v16.9.2', 'v16.9.3')
    text = re.sub(r'data-fd-canonical-build="208"', 'data-fd-canonical-build="209"', text, count=1)
    index.write_text(text, 'utf-8')

print('Frontline Dominion v16.9.3 build 209 movement target fidelity assembled')
