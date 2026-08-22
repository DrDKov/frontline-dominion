from pathlib import Path
import re
import shutil

ROOT = Path('.')
OUT = ROOT / 'dist'
BUILD = 206
VERSION = '16.9.0'

MODULES = [
    'logistics-core-v206.js',
    'economic-buildings-v206.js',
    'resource-economy-v206.js',
    'supply-transport-v206.js',
    'unit-sustainment-v206.js',
    'air-logistics-v206.js',
    'production-logistics-v206.js',
    'authoritative-logistics-v206.js',
    'ai-logistics-v206.js',
]

HTML = OUT / 'frontline-dominion.html'
WORKER = OUT / 'authoritative-simulation-worker-v174.js'
BRIDGE = OUT / 'authoritative-simulation-v174.js'
MP_GAME = OUT / 'multiplayer-game-v96.js'
INDEX = OUT / 'index.html'
MP_HTML = OUT / 'multiplayer.html'

for path in [HTML, WORKER, BRIDGE, MP_GAME, INDEX, MP_HTML]:
    if not path.exists():
        raise RuntimeError(f'build {BUILD}: inherited output missing: {path}')
for name in MODULES:
    source = ROOT / 'src' / 'v206' / name
    if not source.exists():
        raise RuntimeError(f'build {BUILD}: source module missing: {source}')
    shutil.copy2(source, OUT / name)


def once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'build {BUILD}: {label}: expected one anchor, got {count}')
    return text.replace(old, new, 1)


def sub_once(text, pattern, replacement, label, flags=0):
    updated, count = re.subn(pattern, replacement, text, count=1, flags=flags)
    if count != 1:
        raise RuntimeError(f'build {BUILD}: {label}: regex anchor count={count}')
    return updated


def bump_queries(text):
    text = re.sub(r'([.](?:js|json|webp|html))\?build=\d+', rf'\1?build={BUILD}', text)
    return text.replace('build=205', f'build={BUILD}')


# ---------- Worker authority ----------
worker = WORKER.read_text('utf-8')
worker = sub_once(worker, r'const BUILD = \d+;', f'const BUILD = {BUILD};', 'worker BUILD')
worker = sub_once(worker, r"const VERSION = '[^']+';", f"const VERSION = '{VERSION}';", 'worker VERSION')
worker = bump_queries(worker)

last_import = f"importScripts('/frontline-dominion/recon-memory-production-v203.js?build={BUILD}');"
if last_import not in worker:
    raise RuntimeError(f'build {BUILD}: final Worker inherited import missing')
imports = '\n'.join(f"importScripts('/frontline-dominion/{name}?build={BUILD}');" for name in MODULES)
worker = worker.replace(last_import, last_import + '\n' + imports, 1)

worker = once(
    worker,
    "  loadTransport: 18, unloadTransport: 19, mineField: 20, returnPost132: 21\n});",
    "  loadTransport: 18, unloadTransport: 19, mineField: 20, returnPost132: 21, logistics206: 22\n});",
    'worker command code',
)

# The exact 205 authoritative extension has changed during previous hotfixes.
# `data.savedAt` is the stable end of captureSaveData across those revisions.
worker = once(
    worker,
    '  data.savedAt = Date.now();\n  return data;\n}',
    '  data.logistics206 = game.exportLogistics206?.() || null;\n'
    '  if (data.authoritative172) data.authoritative172.networkAppliedSeq206 = Number(multiplayer.appliedSeq || 0);\n'
    '  data.savedAt = Date.now();\n  return data;\n}',
    'worker save logistics root',
)

worker = once(
    worker,
    "for (const key of ['units','buildings','projectiles','economy','operations','sectors']) {",
    "for (const key of ['units','buildings','projectiles','economy','operations','sectors','logistics206']) {",
    'worker subsystem hash',
)

worker = once(
    worker,
    "  mix(Math.round((canonicalEnemy?.credits || 0) * 10));\n",
    "  mix(Math.round((canonicalEnemy?.credits || 0) * 10));\n"
    "  mix(game.networkLogisticsHash206?.(multiplayer.perspectiveSwapped) || 0);\n",
    'worker network logistics hash',
)

worker = sub_once(
    worker,
    r"function buildingDetailSignature165\(building\) \{.*?\n\}",
    """function buildingDetailSignature165(building) {
  const authority203 = self.__FD_RECON_MEMORY_QUEUE_203__;
  if (!authority203?.queueSignature) throw new Error('Build 203 production queue authority is unavailable');
  const logistics = building.logistics206 || null;
  const stock = logistics?.stock || null;
  const imported = logistics?.importBuffer || null;
  return [
    authority203.queueSignature(building), logistics?.priority || '', logistics?.nodeType || '',
    Math.round((stock?.fuel || 0) * 10), Math.round((stock?.ammo || 0) * 10), Math.round((stock?.support || 0) * 10),
    Math.round((imported?.fuel || 0) * 10), Math.round((imported?.ammo || 0) * 10),
    Math.round((building.resourceBuffer83 || 0) * 10), building.resourceType206 || ''
  ].join('|');
}""",
    'worker building logistics signature', flags=re.S,
)

op_line = "    operationalCore160: (force || tick % 25 === 0) ? (() => { const data = game.operationalCore160?.serialize?.() || null; if (data) { data.commandLog = (data.commandLog || []).slice(-128); data.hashHistory = (data.hashHistory || []).slice(-32); } return data; })() : null,\n"
if op_line not in worker:
    raise RuntimeError(f'build {BUILD}: Worker operational snapshot anchor missing')
worker = worker.replace(
    op_line,
    op_line + "    logistics206: (force || tick % 25 === 0) ? (game.exportLogistics206?.() || null) : null,\n",
    1,
)

worker = once(
    worker,
    "      case 'airReturn': result = game.issueAirReturn93?.(); break;\n      case 'unitCommand': {\n",
    "      case 'airReturn': result = game.issueAirReturn93?.(); break;\n"
    "      case 'logisticsMission': result = game.setLogisticsMission206?.(plainClone(payload)) ?? false; break;\n"
    "      case 'logisticsPriority': result = game.setSupplyPriority206?.(plainClone(payload)) ?? false; break;\n"
    "      case 'logisticsThreshold': result = game.setSupplyThreshold206?.(plainClone(payload)) ?? false; break;\n"
    "      case 'logisticsTrade': result = game.configureTradeContract206?.(plainClone(payload)) ?? false; break;\n"
    "      case 'logisticsEmergencyImport': result = game.emergencyPurchase206?.(plainClone(payload)) ?? false; break;\n"
    "      case 'logisticsCreateTransport': result = game.createSupplyTransport206?.(plainClone(payload)) ?? false; break;\n"
    "      case 'unitCommand': {\n",
    'worker logistics action cases',
)
WORKER.write_text(worker, 'utf-8')


# ---------- Main authoritative bridge ----------
bridge = BRIDGE.read_text('utf-8')
bridge = sub_once(bridge, r'const BUILD = \d+;', f'const BUILD = {BUILD};', 'bridge BUILD')
bridge = sub_once(bridge, r"const VERSION = '[^']+';", f"const VERSION = '{VERSION}';", 'bridge VERSION')
bridge = bump_queries(bridge).replace('fd:authoritative-save205', 'fd:authoritative-save206')

bridge = once(
    bridge,
    '  data.authoritative172 = authoritative;\n  data.camera = { ...game.camera };\n',
    '  data.authoritative172 = authoritative;\n'
    '  data.logistics206 = game.exportLogistics206?.() || data.logistics206 || null;\n'
    '  data.camera = { ...game.camera };\n',
    'bridge initial logistics state',
)
bridge = once(
    bridge,
    '      updateTeam(game.teams.enemy, message.teams?.enemy);\n\n      for (const record of message.createdEntities || []) createMirrorEntity(game, record);\n',
    '      updateTeam(game.teams.enemy, message.teams?.enemy);\n'
    '      if (message.logistics206) game.importLogistics206?.(message.logistics206);\n\n'
    '      for (const record of message.createdEntities || []) createMirrorEntity(game, record);\n',
    'bridge logistics snapshot apply',
)
bridge = once(
    bridge,
    "wrapGameAction('issueAirReturn93', 'airReturn', () => ({}));\n\nGame.prototype.authoritativeWorkerDiagnostics172 = function() {\n",
    "wrapGameAction('issueAirReturn93', 'airReturn', () => ({}));\n"
    "wrapGameAction('setLogisticsMission206', 'logisticsMission', ([payload]) => clonePlain(payload || {}));\n"
    "wrapGameAction('setSupplyPriority206', 'logisticsPriority', ([payload]) => clonePlain(payload || {}));\n"
    "wrapGameAction('setSupplyThreshold206', 'logisticsThreshold', ([payload]) => clonePlain(payload || {}));\n"
    "wrapGameAction('configureTradeContract206', 'logisticsTrade', ([payload]) => clonePlain(payload || {}));\n"
    "wrapGameAction('emergencyPurchase206', 'logisticsEmergencyImport', ([payload]) => clonePlain(payload || {}));\n"
    "wrapGameAction('createSupplyTransport206', 'logisticsCreateTransport', ([payload]) => clonePlain(payload || {}));\n\n"
    "Game.prototype.authoritativeWorkerDiagnostics172 = function() {\n",
    'bridge logistics command wrappers',
)
BRIDGE.write_text(bridge, 'utf-8')


# ---------- Multiplayer intent/replay ----------
mp = bump_queries(MP_GAME.read_text('utf-8')).replace('fd:authoritative-save205', 'fd:authoritative-save206')
mp = once(
    mp,
    "  selectionCommand('sellSelectedBuilding', 'sell', () => ({}));\n\n  wrap('issueAttack', function([target, append]) {\n",
    "  selectionCommand('sellSelectedBuilding', 'sell', () => ({}));\n\n"
    "  const logisticsOwned206 = (game, payload = {}) => {\n"
    "    const id = payload.buildingId || payload.entityId || payload.homeNodeId || payload.truckId || payload.truckIds?.[0] || payload.unitIds?.[0];\n"
    "    const item = id ? game.getEntity?.(id) : null;\n"
    "    return !item || item.team === state.controlTeam;\n"
    "  };\n"
    "  for (const [method, action] of [\n"
    "    ['setLogisticsMission206','logisticsMission'], ['setSupplyPriority206','logisticsPriority'],\n"
    "    ['setSupplyThreshold206','logisticsThreshold'], ['configureTradeContract206','logisticsTrade'],\n"
    "    ['emergencyPurchase206','logisticsEmergencyImport'], ['createSupplyTransport206','logisticsCreateTransport']\n"
    "  ]) wrap(method, function([payload = {}], original) {\n"
    "    if (!logisticsOwned206(this, payload)) return original.call(this, payload);\n"
    "    emitIntent(action, JSON.parse(JSON.stringify(payload || {})), selectedIds(this));\n"
    "    return true;\n"
    "  });\n\n"
    "  wrap('issueAttack', function([target, append]) {\n",
    'multiplayer logistics wrappers',
)
mp = once(
    mp,
    "          case 'airReturn': return originals.issueAirReturn93?.call(game);\n          case 'ping':\n",
    "          case 'airReturn': return originals.issueAirReturn93?.call(game);\n"
    "          case 'logisticsMission': return originals.setLogisticsMission206?.call(game, p);\n"
    "          case 'logisticsPriority': return originals.setSupplyPriority206?.call(game, p);\n"
    "          case 'logisticsThreshold': return originals.setSupplyThreshold206?.call(game, p);\n"
    "          case 'logisticsTrade': return originals.configureTradeContract206?.call(game, p);\n"
    "          case 'logisticsEmergencyImport': return originals.emergencyPurchase206?.call(game, p);\n"
    "          case 'logisticsCreateTransport': return originals.createSupplyTransport206?.call(game, p);\n"
    "          case 'ping':\n",
    'multiplayer logistics replay',
)
mp = once(
    mp,
    '    mix(Math.round(canonicalEnemy?.credits || 0));\n    mix(game.rng?.seed || 0);\n',
    '    mix(Math.round(canonicalEnemy?.credits || 0));\n'
    '    mix(game.networkLogisticsHash206?.(state.localPerspectiveSwapped) || 0);\n'
    '    mix(game.rng?.seed || 0);\n',
    'multiplayer logistics checksum',
)
MP_GAME.write_text(mp, 'utf-8')


# ---------- Versioned UI/runtime owners ----------
def owner(source_name, target_name, replacements, aliases=''):
    source = OUT / source_name
    if not source.exists():
        raise RuntimeError(f'build {BUILD}: presentation owner missing: {source_name}')
    text = source.read_text('utf-8')
    text = re.sub(r"const VERSION = '[^']+';", f"const VERSION = '{VERSION}';", text, count=1)
    text = re.sub(r'const BUILD = \d+;', f'const BUILD = {BUILD};', text, count=1)
    for old, new in replacements:
        text = text.replace(old, new)
    text = bump_queries(text)
    if aliases:
        text += '\n' + aliases + '\n'
    (OUT / target_name).write_text(text, 'utf-8')

owner('runtime-ui-v205.js', 'runtime-ui-v206.js', [
    ('__FD_RUNTIME_UI_205__', '__FD_RUNTIME_UI_206__'), ('[FD205]', '[FD206]')
], "globalThis.__FD_RUNTIME_UI_205__ ||= globalThis.__FD_RUNTIME_UI_206__;" )
owner('runtime-shell-v205.js', 'runtime-shell-v206.js', [
    ('__FD_RUNTIME_SHELL_205__', '__FD_RUNTIME_SHELL_206__'), ('__FD_BOOT_205__', '__FD_BOOT_206__'),
    ('fd-loading205', 'fd-loading206'), ('fd-ready205', 'fd-ready206'), ('fd-running205', 'fd-running206'), ('[FD205]', '[FD206]')
], "globalThis.__FD_RUNTIME_SHELL_205__ ||= globalThis.__FD_RUNTIME_SHELL_206__; globalThis.__FD_BOOT_205__ ||= globalThis.__FD_BOOT_206__;" )
owner('save-slots-v205.js', 'save-slots-v206.js', [
    ('__FD_SAVE_SLOTS_205__', '__FD_SAVE_SLOTS_206__'), ('__FD_RUNTIME_SHELL_205__', '__FD_RUNTIME_SHELL_206__'),
    ('__FD_BOOT_205__', '__FD_BOOT_206__'), ('fd:authoritative-save205', 'fd:authoritative-save206')
], "globalThis.__FD_SAVE_SLOTS_205__ ||= globalThis.__FD_SAVE_SLOTS_206__;" )
owner('multiplayer-lobby-v205.js', 'multiplayer-lobby-v206.js', [
    ('__FD_MULTIPLAYER_LOBBY_205__', '__FD_MULTIPLAYER_LOBBY_206__')
], "globalThis.__FD_MULTIPLAYER_LOBBY_205__ ||= globalThis.__FD_MULTIPLAYER_LOBBY_206__;" )


# ---------- HTML load order ----------
html = bump_queries(HTML.read_text('utf-8'))
html = re.sub(r'data-fd-canonical-build="\d+"', f'data-fd-canonical-build="{BUILD}"', html)
html = re.sub(r'<title>.*?</title>', f'<title>Frontline Dominion v{VERSION} — Physical Logistics</title>', html, count=1, flags=re.S)
html = re.sub(r'ОПЕРАТИВНО-ТАКТИЧЕСКАЯ RTS · BUILD \d+', f'ОПЕРАТИВНО-ТАКТИЧЕСКАЯ RTS · BUILD {BUILD}', html)
html = html.replace('__FD_BOOT_205__', '__FD_BOOT_206__')
html = html.replace('fd-loading205', 'fd-loading206').replace('fd-ready205', 'fd-ready206').replace('fd-running205', 'fd-running206')
for old in ['runtime-ui-v205.js', 'runtime-shell-v205.js', 'save-slots-v205.js']:
    html = re.sub(rf'\s*<script[^>]+{re.escape(old)}\?build={BUILD}[^>]*></script>', '', html, flags=re.I)

module_tags = '\n'.join(f'<script src="./{name}?build={BUILD}"></script>' for name in MODULES)
positions = [html.find(name) for name in ['multiplayer-game-v96.js', 'authoritative-simulation-v174.js'] if html.find(name) >= 0]
if not positions:
    raise RuntimeError(f'build {BUILD}: authority script tag missing')
script_start = html.rfind('<script', 0, min(positions))
if script_start < 0:
    raise RuntimeError(f'build {BUILD}: authority script opening tag missing')
html = html[:script_start] + module_tags + '\n' + html[script_start:]
html = html.replace('</body>',
    f'<script src="./runtime-ui-v206.js?build={BUILD}"></script>\n'
    f'<script src="./runtime-shell-v206.js?build={BUILD}"></script>\n'
    f'<script src="./save-slots-v206.js?build={BUILD}"></script>\n</body>', 1)
HTML.write_text(html, 'utf-8')

index = bump_queries(INDEX.read_text('utf-8'))
index = re.sub(r'data-fd-canonical-build="\d+"', f'data-fd-canonical-build="{BUILD}"', index)
index = index.replace('build=205', f'build={BUILD}').replace('v16.8.21', f'v{VERSION}')
INDEX.write_text(index, 'utf-8')

mp_html = bump_queries(MP_HTML.read_text('utf-8'))
mp_html = re.sub(r'data-fd-canonical-build="\d+"', f'data-fd-canonical-build="{BUILD}"', mp_html)
mp_html = mp_html.replace('multiplayer-lobby-v205.js', 'multiplayer-lobby-v206.js').replace('build=205', f'build={BUILD}')
MP_HTML.write_text(mp_html, 'utf-8')

# Cache-bust inherited JS references consistently.
for path in OUT.glob('*.js'):
    path.write_text(bump_queries(path.read_text('utf-8')), 'utf-8')


# ---------- Assembly gates ----------
final_html = HTML.read_text('utf-8')
for name in MODULES:
    if final_html.count(f'{name}?build={BUILD}') != 1:
        raise RuntimeError(f'build {BUILD}: HTML module ownership invalid: {name}')
for name in ['runtime-ui-v206.js', 'runtime-shell-v206.js', 'save-slots-v206.js']:
    if final_html.count(f'{name}?build={BUILD}') != 1:
        raise RuntimeError(f'build {BUILD}: presentation owner invalid: {name}')
if 'runtime-shell-v205.js?build=206' in final_html or 'save-slots-v205.js?build=206' in final_html:
    raise RuntimeError(f'build {BUILD}: obsolete owner still loaded')

final_worker = WORKER.read_text('utf-8')
for name in MODULES:
    if final_worker.count(f'/frontline-dominion/{name}?build={BUILD}') != 1:
        raise RuntimeError(f'build {BUILD}: Worker module ownership invalid: {name}')
for needle in ["case 'logisticsMission'", "case 'logisticsTrade'", 'networkLogisticsHash206',
               'data.logistics206 = game.exportLogistics206', 'logistics206: (force || tick % 25 === 0)']:
    if needle not in final_worker:
        raise RuntimeError(f'build {BUILD}: Worker invariant missing: {needle}')

print(f'Frontline Dominion v{VERSION} build {BUILD} assembled')
