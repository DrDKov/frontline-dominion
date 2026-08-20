from pathlib import Path
import re

ROOT = Path('.')
OUT = ROOT / 'dist'
BUILD = 202
VERSION = '16.8.18'

html_path = OUT / 'frontline-dominion.html'
bridge_path = OUT / 'authoritative-simulation-v174.js'
worker_path = OUT / 'authoritative-simulation-worker-v174.js'
ui201_path = OUT / 'runtime-ui-v201.js'
shell201_path = OUT / 'runtime-shell-v201.js'
profiler_path = OUT / 'simulation-profiler-v166.js'
power_source = ROOT / 'src' / 'v202' / 'command-power-authority-v202.js'
power_path = OUT / power_source.name

for path in [
    html_path, bridge_path, worker_path, ui201_path, shell201_path,
    profiler_path, power_source,
]:
    if not path.exists():
        raise RuntimeError(f'build 202 required file missing: {path}')

power_path.write_text(power_source.read_text('utf-8'), 'utf-8')

# The same energy snapshot that enabled the command in the visible HUD travels
# with the authoritative action. This closes the short post-load window in
# which the main thread and Worker could disagree and reject a valid pulse.
bridge = bridge_path.read_text('utf-8')
power_encoder = "wrapGameAction('executePower', 'power', ([power,x,y]) => ({power,x,y}), { present: marker('#79d9ff') });"
power_encoder_202 = "wrapGameAction('executePower', 'power', function([power,x,y]) { return { power,x,y,powerState:this.commandPowerIntent202?.('player')||null }; }, { present: marker('#79d9ff') });"
if power_encoder in bridge:
    if bridge.count(power_encoder) != 1:
        raise RuntimeError(f'build 202 power encoder anchor invalid: {bridge.count(power_encoder)}')
    bridge = bridge.replace(power_encoder, power_encoder_202, 1)
elif bridge.count(power_encoder_202) != 1:
    raise RuntimeError('build 202 canonical power encoder missing')
bridge_path.write_text(bridge, 'utf-8')

worker = worker_path.read_text('utf-8')
worker = re.sub(
    r"\nimportScripts\('/frontline-dominion/command-power-authority-v202\.js\?build=\d+'\);",
    '', worker,
)
group_import_pattern = re.compile(
    r"importScripts\('/frontline-dominion/group-movement-v201\.js\?build=\d+'\);"
)
group_import_match = group_import_pattern.search(worker)
if not group_import_match:
    raise RuntimeError('build 202 Worker group import anchor missing')
power_import = f"importScripts('/frontline-dominion/command-power-authority-v202.js?build={BUILD}');"
worker = worker[:group_import_match.end()] + '\n' + power_import + worker[group_import_match.end():]

worker_power_anchor = "      case 'power': result = game.executePower(payload.power, payload.x, payload.y); break;"
worker_power_replacement = """      case 'power': {
        const previousPowerIntent202 = game._fdCommandPowerIntent202;
        game._fdCommandPowerIntent202 = plainClone(payload.powerState);
        try { result = game.executePower(payload.power, payload.x, payload.y); }
        finally {
          if (previousPowerIntent202 === undefined) delete game._fdCommandPowerIntent202;
          else game._fdCommandPowerIntent202 = previousPowerIntent202;
        }
        break;
      }"""
if worker_power_anchor in worker:
    if worker.count(worker_power_anchor) != 1:
        raise RuntimeError(f'build 202 Worker power action anchor invalid: {worker.count(worker_power_anchor)}')
    worker = worker.replace(worker_power_anchor, worker_power_replacement, 1)
elif worker.count('const previousPowerIntent202 = game._fdCommandPowerIntent202;') != 1:
    raise RuntimeError('build 202 canonical Worker power action missing')

worker_diag_anchor = "        groupMovement201: self.__FD_GROUP_MOVEMENT_201__?.diagnostics?.() || null,\n"
worker_diag_replacement = worker_diag_anchor + "        commandPower202: self.__FD_COMMAND_POWER_AUTHORITY_202__?.diagnostics?.() || null,\n"
worker = worker.replace("        commandPower202: self.__FD_COMMAND_POWER_AUTHORITY_202__?.diagnostics?.() || null,\n", '')
if worker.count(worker_diag_anchor) != 1:
    raise RuntimeError('build 202 Worker diagnostics anchor missing')
worker = worker.replace(worker_diag_anchor, worker_diag_replacement, 1)
worker_path.write_text(worker, 'utf-8')

ui = ui201_path.read_text('utf-8')
ui = re.sub(r"const VERSION = '16\.8\.[0-9]+';", f"const VERSION = '{VERSION}';", ui, count=1)
ui = re.sub(r'const BUILD = \d+;', f'const BUILD = {BUILD};', ui, count=1)
ui = ui.replace('__FD_RUNTIME_UI_201__', '__FD_RUNTIME_UI_202__').replace('[FD201]', '[FD202]')
(OUT / 'runtime-ui-v202.js').write_text(ui, 'utf-8')

shell = shell201_path.read_text('utf-8')
shell = re.sub(r"const VERSION = '16\.8\.[0-9]+';", f"const VERSION = '{VERSION}';", shell, count=1)
shell = re.sub(r'const BUILD = \d+;', f'const BUILD = {BUILD};', shell, count=1)
shell = shell.replace('__FD_RUNTIME_SHELL_201__', '__FD_RUNTIME_SHELL_202__')
shell = shell.replace('__FD_BOOT_201__', '__FD_BOOT_202__').replace('[FD201]', '[FD202]')
shell = shell.replace('fd-loading201', 'fd-loading202').replace('fd-ready201', 'fd-ready202').replace('fd-running201', 'fd-running202')
(OUT / 'runtime-shell-v202.js').write_text(shell, 'utf-8')

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
    r'\s*<script\b[^>]*src=["\'](?:\./|/frontline-dominion/)(?:runtime-ui-v(?:201|202)|runtime-shell-v(?:201|202)|command-power-authority-v202)\.js(?:\?build=\d+)?["\'][^>]*></script>',
    '', html, flags=re.I,
)
html = html.replace('fd-boot201-script', 'fd-boot202-script').replace('fd-boot201-style', 'fd-boot202-style')
html = html.replace('__FD_BOOT_201__', '__FD_BOOT_202__')
html = html.replace('fd-loading201', 'fd-loading202').replace('fd-ready201', 'fd-ready202').replace('fd-running201', 'fd-running202')
html = re.sub(r"const VERSION = '16\.8\.[0-9]+', BUILD = \d+;", f"const VERSION = '{VERSION}', BUILD = {BUILD};", html, count=1)
html = re.sub(r'data-fd-canonical-build="\d+"', f'data-fd-canonical-build="{BUILD}"', html, count=1)
html = re.sub(r'<title>.*?</title>', f'<title>Frontline Dominion v{VERSION} — Recon Energy Sync</title>', html, count=1, flags=re.S)
html = re.sub(
    r'ОПЕРАТИВНО-ТАКТИЧЕСКАЯ RTS · v16\.8\.\d+ BUILD \d+',
    f'ОПЕРАТИВНО-ТАКТИЧЕСКАЯ RTS · v{VERSION} BUILD {BUILD}', html, count=1,
)
html = re.sub(
    r'<p class=["\']lead["\']>.*?</p>',
    '<p class="lead">Синхронная проверка энергосети: разведывательный импульс использует тот же запас, который показан игроку.</p>',
    html, count=1, flags=re.S,
)

def cache_bust(match):
    return f'{match.group(1)}?build={BUILD}{match.group(2)}'

html = re.sub(
    r'(<script\b[^>]*\bsrc=["\'](?:\./|/frontline-dominion/)[^"\']+\.js)(?:\?build=\d+)?(["\'][^>]*></script>)',
    cache_bust, html, flags=re.I,
)

group_tag = f'<script src="./group-movement-v201.js?build={BUILD}"></script>'
if group_tag not in html:
    raise RuntimeError('build 202 group HTML anchor missing')
html = html.replace(
    group_tag,
    group_tag + f'\n<script src="./command-power-authority-v202.js?build={BUILD}"></script>\n<script src="./runtime-ui-v202.js?build={BUILD}"></script>',
    1,
)
html = html.replace('</body>', f'<script src="./runtime-shell-v202.js?build={BUILD}"></script>\n</body>', 1)
html_path.write_text(html, 'utf-8')

for path in sorted(OUT.glob('*.js')):
    text = path.read_text('utf-8')
    text = asset_pattern.sub(rf'\1?build={BUILD}', text)
    path.write_text(text, 'utf-8')

launcher = f'''<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="color-scheme" content="dark"><title>Frontline Dominion v{VERSION}</title><style>*{{box-sizing:border-box}}html,body{{margin:0;min-height:100%;background:#050b10;color:#dcecf4;font-family:system-ui,sans-serif}}body{{display:grid;place-items:center;min-height:100vh;padding:24px;background:#071019}}main{{width:min(720px,100%);padding:36px;border:1px solid #365363;border-radius:18px;background:#0a151d}}a{{display:inline-flex;min-height:54px;align-items:center;padding:0 24px;border-radius:10px;background:#d9edf7;color:#071019;text-decoration:none;font-weight:900}}</style></head><body><main><div>ЕДИНСТВЕННАЯ АКТУАЛЬНАЯ СБОРКА · BUILD {BUILD}</div><h1>Frontline Dominion</h1><p>Разведывательный импульс больше не отклоняется из-за рассинхронизации энергии между интерфейсом и Simulation Worker.</p><a id="launch" href="./frontline-dominion.html?build={BUILD}">Запустить игру</a><p>v{VERSION} · build {BUILD} · GitHub Pages</p></main></body></html>'''
(OUT / 'index.html').write_text(launcher, 'utf-8')

final_html = html_path.read_text('utf-8')
required = [
    f'command-power-authority-v202.js?build={BUILD}',
    f'runtime-ui-v202.js?build={BUILD}',
    f'runtime-shell-v202.js?build={BUILD}',
]
for item in required:
    if final_html.count(item) != 1:
        raise RuntimeError(f'build 202 owner count invalid: {item}')
if 'runtime-shell-v201.js?build=202' in final_html or 'runtime-ui-v201.js?build=202' in final_html:
    raise RuntimeError('build 202 still loads obsolete runtime owner')
if worker_path.read_text('utf-8').count(power_import) != 1:
    raise RuntimeError('build 202 Worker power owner count invalid')
if power_encoder_202 not in bridge_path.read_text('utf-8'):
    raise RuntimeError('build 202 bridge power snapshot missing')
if 'previousPowerIntent202' not in worker_path.read_text('utf-8'):
    raise RuntimeError('build 202 Worker power intent scope missing')

print(f'Frontline Dominion v{VERSION} build {BUILD} recon energy synchronization assembled')
