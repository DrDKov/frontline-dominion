from pathlib import Path
import re
import shutil

ROOT = Path('.')
OUT = ROOT / 'dist'
BUILD = 206
VERSION = '16.9.0'

html_path = OUT / 'frontline-dominion.html'
bridge_path = OUT / 'authoritative-simulation-v174.js'
worker_path = OUT / 'authoritative-simulation-worker-v174.js'
mp_game_path = OUT / 'multiplayer-game-v96.js'
index_path = OUT / 'index.html'
mp_html_path = OUT / 'multiplayer.html'

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

for path in [html_path, bridge_path, worker_path, mp_game_path, index_path, mp_html_path]:
    if not path.exists():
        raise RuntimeError(f'build {BUILD}: required build 205 output missing: {path}')
for name in MODULES:
    source = ROOT / 'src' / 'v206' / name
    if not source.exists():
        raise RuntimeError(f'build {BUILD}: module missing: {source}')
    shutil.copy2(source, OUT / name)


def require_once(text: str, anchor: str, label: str) -> None:
    count = text.count(anchor)
    if count != 1:
        raise RuntimeError(f'build {BUILD}: {label} anchor count={count}')


def replace_once(text: str, old: str, new: str, label: str) -> str:
    require_once(text, old, label)
    return text.replace(old, new, 1)


def bump_asset_queries(text: str) -> str:
    return re.sub(r'(\.(?:js|json|webp))\?build=\d+', rf'\1?build={BUILD}', text)


# ---------------------------------------------------------------------------
# Authoritative Worker: load the exact same logistics modules as the browser,
# serialize physical state, execute logistics commands, and hash it for sync.
# ---------------------------------------------------------------------------
worker = worker_path.read_text('utf-8')
worker = re.sub(r"const BUILD = \d+;", f'const BUILD = {BUILD};', worker, count=1)
worker = re.sub(r"const VERSION = '16\.8\.[0-9]+';", f"const VERSION = '{VERSION}';", worker, count=1)
worker = bump_asset_queries(worker)

import_anchor = f"importScripts('/frontline-dominion/recon-memory-production-v203.js?build={BUILD}');"
require_once(worker, import_anchor, 'Worker final inherited import')
worker_imports = '\n'.join(
    f"importScripts('/frontline-dominion/{name}?build={BUILD}');" for name in MODULES
)
worker = worker.replace(import_anchor, import_anchor + '\n' + worker_imports, 1)

command_anchor = "  loadTransport: 18, unloadTransport: 19, mineField: 20, returnPost132: 21\n});"
worker = replace_once(
    worker,
    command_anchor,
    "  loadTransport: 18, unloadTransport: 19, mineField: 20, returnPost132: 21, logistics206: 22\n});",
    'Worker command code',
)

save_anchor = """    networkAppliedSeq205: Number(multiplayer.appliedSeq || 0)
  };
  data.savedAt = Date.now();
"""
worker = replace_once(
    worker,
    save_anchor,
    """    networkAppliedSeq205: Number(multiplayer.appliedSeq || 0),
    networkAppliedSeq206: Number(multiplayer.appliedSeq || 0)
  };
  data.logistics206 = game.exportLogistics206?.() || null;
  data.savedAt = Date.now();
""",
    'Worker save logistics root',
)

subsystem_anchor = "for (const key of ['units','buildings','projectiles','economy','operations','sectors']) {"
worker = replace_once(
    worker,
    subsystem_anchor,
    "for (const key of ['units','buildings','projectiles','economy','operations','sectors','logistics206']) {",
    'Worker subsystem logistics hash',
)

network_anchor = """  mix(Math.round((canonicalPlayer?.credits || 0) * 10));
  mix(Math.round((canonicalEnemy?.credits || 0) * 10));
"""
worker = replace_once(
    worker,
    network_anchor,
    network_anchor + "  mix(game.networkLogisticsHash206?.(multiplayer.perspectiveSwapped) || 0);\n",
    'Worker canonical network logistics hash',
)

building_sig_anchor = """function buildingDetailSignature165(building) {
  const authority203 = self.__FD_RECON_MEMORY_QUEUE_203__;
  if (!authority203?.queueSignature) throw new Error('Build 203 production queue authority is unavailable');
  return authority203.queueSignature(building);
}
"""
worker = replace_once(
    worker,
    building_sig_anchor,
    """function buildingDetailSignature165(building) {
  const authority203 = self.__FD_RECON_MEMORY_QUEUE_203__;
  if (!authority203?.queueSignature) throw new Error('Build 203 production queue authority is unavailable');
  const logistics = building.logistics206 || null;
  const stock = logistics?.stock || null;
  const imported = logistics?.importBuffer || null;
  return [
    authority203.queueSignature(building),
    logistics?.priority || '', logistics?.nodeType || '',
    Math.round((stock?.fuel || 0) * 10), Math.round((stock?.ammo || 0) * 10), Math.round((stock?.support || 0) * 10),
    Math.round((imported?.fuel || 0) * 10), Math.round((imported?.ammo || 0) * 10),
    Math.round((building.resourceBuffer83 || 0) * 10), building.resourceType206 || ''
  ].join('|');
}
""",
    'Worker building logistics detail signature',
)

snapshot_anchor = """    operationalCore160: (force || tick % 25 === 0) ? (() => { const data = game.operationalCore160?.serialize?.() || null; if (data) { data.commandLog = (data.commandLog || []).slice(-128); data.hashHistory = (data.hashHistory || []).slice(-32); } return data; })() : null,
"""
worker = replace_once(
    worker,
    snapshot_anchor,
    snapshot_anchor + "    logistics206: (force || tick % 25 === 0) ? (game.exportLogistics206?.() || null) : null,\n",
    'Worker logistics snapshot',
)

worker_action_anchor = """      case 'airReturn': result = game.issueAirReturn93?.(); break;
      case 'unitCommand': {
"""
worker = replace_once(
    worker,
    worker_action_anchor,
    """      case 'airReturn': result = game.issueAirReturn93?.(); break;
      case 'logisticsMission': result = game.setLogisticsMission206?.(plainClone(payload)) ?? false; break;
      case 'logisticsPriority': result = game.setSupplyPriority206?.(plainClone(payload)) ?? false; break;
      case 'logisticsThreshold': result = game.setSupplyThreshold206?.(plainClone(payload)) ?? false; break;
      case 'logisticsTrade': result = game.configureTradeContract206?.(plainClone(payload)) ?? false; break;
      case 'logisticsEmergencyImport': result = game.emergencyPurchase206?.(plainClone(payload)) ?? false; break;
      case 'logisticsCreateTransport': result = game.createSupplyTransport206?.(plainClone(payload)) ?? false; break;
      case 'unitCommand': {
""",
    'Worker logistics action cases',
)
worker_path.write_text(worker, 'utf-8')


# ---------------------------------------------------------------------------
# Main-thread authoritative bridge. It only mirrors state; all economic writes
# go through sendAction -> Worker -> actionAck.
# ---------------------------------------------------------------------------
bridge = bridge_path.read_text('utf-8')
bridge = re.sub(r"const BUILD = \d+;", f'const BUILD = {BUILD};', bridge, count=1)
bridge = re.sub(r"const VERSION = '16\.8\.[0-9]+';", f"const VERSION = '{VERSION}';", bridge, count=1)
bridge = bump_asset_queries(bridge)
bridge = bridge.replace('fd:authoritative-save205', 'fd:authoritative-save206')
bridge = bridge.replace('serialized205', 'serialized206')

initial_anchor = """  data.authoritative172 = authoritative;
  data.camera = { ...game.camera };
"""
bridge = replace_once(
    bridge,
    initial_anchor,
    """  data.authoritative172 = authoritative;
  data.logistics206 = game.exportLogistics206?.() || data.logistics206 || null;
  data.camera = { ...game.camera };
""",
    'Bridge initial logistics state',
)

apply_anchor = """      updateTeam(game.teams.player, message.teams?.player);
      updateTeam(game.teams.enemy, message.teams?.enemy);

      for (const record of message.createdEntities || []) createMirrorEntity(game, record);
"""
bridge = replace_once(
    bridge,
    apply_anchor,
    """      updateTeam(game.teams.player, message.teams?.player);
      updateTeam(game.teams.enemy, message.teams?.enemy);
      if (message.logistics206) game.importLogistics206?.(message.logistics206);

      for (const record of message.createdEntities || []) createMirrorEntity(game, record);
""",
    'Bridge logistics snapshot apply',
)

bridge_action_anchor = """wrapGameAction('issueAirReturn93', 'airReturn', () => ({}));

Game.prototype.authoritativeWorkerDiagnostics172 = function() {
"""
bridge = replace_once(
    bridge,
    bridge_action_anchor,
    """wrapGameAction('issueAirReturn93', 'airReturn', () => ({}));
wrapGameAction('setLogisticsMission206', 'logisticsMission', ([payload]) => clonePlain(payload || {}));
wrapGameAction('setSupplyPriority206', 'logisticsPriority', ([payload]) => clonePlain(payload || {}));
wrapGameAction('setSupplyThreshold206', 'logisticsThreshold', ([payload]) => clonePlain(payload || {}));
wrapGameAction('configureTradeContract206', 'logisticsTrade', ([payload]) => clonePlain(payload || {}));
wrapGameAction('emergencyPurchase206', 'logisticsEmergencyImport', ([payload]) => clonePlain(payload || {}));
wrapGameAction('createSupplyTransport206', 'logisticsCreateTransport', ([payload]) => clonePlain(payload || {}));

Game.prototype.authoritativeWorkerDiagnostics172 = function() {
""",
    'Bridge logistics wrappers',
)
bridge_path.write_text(bridge, 'utf-8')


# ---------------------------------------------------------------------------
# Multiplayer action transport. The closure-private multiplayer dispatcher must
# know these actions explicitly; direct client-only logistics commands are not
# allowed.
# ---------------------------------------------------------------------------
mp = mp_game_path.read_text('utf-8')
mp = bump_asset_queries(mp)
mp = mp.replace('fd:authoritative-save205', 'fd:authoritative-save206')

mp_wrap_anchor = """  selectionCommand('sellSelectedBuilding', 'sell', () => ({}));

  wrap('issueAttack', function([target, append]) {
"""
mp = replace_once(
    mp,
    mp_wrap_anchor,
    """  selectionCommand('sellSelectedBuilding', 'sell', () => ({}));

  const logisticsOwned206 = (game, payload = {}) => {
    const id = payload.buildingId || payload.entityId || payload.homeNodeId || payload.truckId || payload.truckIds?.[0] || payload.unitIds?.[0];
    const item = id ? game.getEntity?.(id) : null;
    return !item || item.team === state.controlTeam;
  };
  for (const [method, action] of [
    ['setLogisticsMission206', 'logisticsMission'],
    ['setSupplyPriority206', 'logisticsPriority'],
    ['setSupplyThreshold206', 'logisticsThreshold'],
    ['configureTradeContract206', 'logisticsTrade'],
    ['emergencyPurchase206', 'logisticsEmergencyImport'],
    ['createSupplyTransport206', 'logisticsCreateTransport'],
  ]) wrap(method, function([payload = {}], original) {
    if (!logisticsOwned206(this, payload)) return original.call(this, payload);
    emitIntent(action, JSON.parse(JSON.stringify(payload || {})), selectedIds(this));
    return true;
  });

  wrap('issueAttack', function([target, append]) {
""",
    'Multiplayer logistics command wrappers',
)

mp_replay_anchor = """          case 'airReturn': return originals.issueAirReturn93?.call(game);
          case 'ping':
"""
mp = replace_once(
    mp,
    mp_replay_anchor,
    """          case 'airReturn': return originals.issueAirReturn93?.call(game);
          case 'logisticsMission': return originals.setLogisticsMission206?.call(game, p);
          case 'logisticsPriority': return originals.setSupplyPriority206?.call(game, p);
          case 'logisticsThreshold': return originals.setSupplyThreshold206?.call(game, p);
          case 'logisticsTrade': return originals.configureTradeContract206?.call(game, p);
          case 'logisticsEmergencyImport': return originals.emergencyPurchase206?.call(game, p);
          case 'logisticsCreateTransport': return originals.createSupplyTransport206?.call(game, p);
          case 'ping':
""",
    'Multiplayer logistics replay cases',
)

mp_checksum_anchor = """    mix(Math.round(canonicalPlayer?.credits || 0));
    mix(Math.round(canonicalEnemy?.credits || 0));
    mix(game.rng?.seed || 0);
"""
mp = replace_once(
    mp,
    mp_checksum_anchor,
    """    mix(Math.round(canonicalPlayer?.credits || 0));
    mix(Math.round(canonicalEnemy?.credits || 0));
    mix(game.networkLogisticsHash206?.(state.localPerspectiveSwapped) || 0);
    mix(game.rng?.seed || 0);
""",
    'Multiplayer logistics checksum',
)
mp_game_path.write_text(mp, 'utf-8')


# ---------------------------------------------------------------------------
# Versioned presentation owners. Keep the v205 IndexedDB namespace deliberately
# so existing save slots remain visible and are migrated rather than abandoned.
# ---------------------------------------------------------------------------
def transform_owner(source_name, target_name, replacements):
    source = OUT / source_name
    if not source.exists():
        raise RuntimeError(f'build {BUILD}: owner missing: {source}')
    text = source.read_text('utf-8')
    text = re.sub(r"const VERSION = '16\.8\.[0-9]+';", f"const VERSION = '{VERSION}';", text, count=1)
    text = re.sub(r'const BUILD = \d+;', f'const BUILD = {BUILD};', text, count=1)
    for old, new in replacements:
        text = text.replace(old, new)
    text = bump_asset_queries(text)
    (OUT / target_name).write_text(text, 'utf-8')

transform_owner('runtime-ui-v205.js', 'runtime-ui-v206.js', [
    ('__FD_RUNTIME_UI_205__', '__FD_RUNTIME_UI_206__'), ('[FD205]', '[FD206]')
])
transform_owner('runtime-shell-v205.js', 'runtime-shell-v206.js', [
    ('__FD_RUNTIME_SHELL_205__', '__FD_RUNTIME_SHELL_206__'), ('__FD_BOOT_205__', '__FD_BOOT_206__'),
    ('fd-loading205', 'fd-loading206'), ('fd-ready205', 'fd-ready206'), ('fd-running205', 'fd-running206'), ('[FD205]', '[FD206]')
])
transform_owner('save-slots-v205.js', 'save-slots-v206.js', [
    ('__FD_SAVE_SLOTS_205__', '__FD_SAVE_SLOTS_206__'), ('__FD_RUNTIME_SHELL_205__', '__FD_RUNTIME_SHELL_206__'),
    ('__FD_BOOT_205__', '__FD_BOOT_206__'), ('fd:authoritative-save205', 'fd:authoritative-save206')
])
transform_owner('multiplayer-lobby-v205.js', 'multiplayer-lobby-v206.js', [
    ('__FD_MULTIPLAYER_LOBBY_205__', '__FD_MULTIPLAYER_LOBBY_206__')
])


# ---------------------------------------------------------------------------
# HTML owner/load order. v206 simulation modules must run before multiplayer and
# the authoritative bridge so both wrappers discover the new methods.
# ---------------------------------------------------------------------------
html = html_path.read_text('utf-8')
html = bump_asset_queries(html)
html = re.sub(r'data-fd-canonical-build="\d+"', f'data-fd-canonical-build="{BUILD}"', html)
html = re.sub(r'<title>.*?</title>', f'<title>Frontline Dominion v{VERSION} — Physical Logistics</title>', html, count=1, flags=re.S)
html = re.sub(r'ОПЕРАТИВНО-ТАКТИЧЕСКАЯ RTS · BUILD \d+', f'ОПЕРАТИВНО-ТАКТИЧЕСКАЯ RTS · BUILD {BUILD}', html)
html = html.replace('__FD_BOOT_205__', '__FD_BOOT_206__')
html = html.replace('fd-loading205', 'fd-loading206').replace('fd-ready205', 'fd-ready206').replace('fd-running205', 'fd-running206')

# Remove inherited 205 presentation owners; v206 owners are appended once.
for pattern in [
    r'\s*<script[^>]+runtime-ui-v205\.js\?build=206[^>]*></script>',
    r'\s*<script[^>]+runtime-shell-v205\.js\?build=206[^>]*></script>',
    r'\s*<script[^>]+save-slots-v205\.js\?build=206[^>]*></script>',
]:
    html = re.sub(pattern, '', html, flags=re.I)

module_tags = '\n'.join(f'<script src="./{name}?build={BUILD}"></script>' for name in MODULES)
positions = [pos for needle in ['multiplayer-game-v96.js', 'authoritative-simulation-v174.js'] if (pos := html.find(needle)) >= 0]
if not positions:
    raise RuntimeError(f'build {BUILD}: multiplayer/authoritative HTML anchor missing')
insert_at = min(positions)
tag_start = html.rfind('<script', 0, insert_at)
if tag_start < 0:
    raise RuntimeError(f'build {BUILD}: script start before authority anchor missing')
html = html[:tag_start] + module_tags + '\n' + html[tag_start:]

runtime_tags = (
    f'<script src="./runtime-ui-v206.js?build={BUILD}"></script>\n'
    f'<script src="./runtime-shell-v206.js?build={BUILD}"></script>\n'
    f'<script src="./save-slots-v206.js?build={BUILD}"></script>'
)
html = html.replace('</body>', runtime_tags + '\n</body>', 1)
html_path.write_text(html, 'utf-8')

index = index_path.read_text('utf-8')
index = bump_asset_queries(index)
index = re.sub(r'data-fd-canonical-build="\d+"', f'data-fd-canonical-build="{BUILD}"', index)
index = re.sub(r'v16\.8\.21', f'v{VERSION}', index)
index = re.sub(r'build 205', f'build {BUILD}', index, flags=re.I)
index = re.sub(r'build=205', f'build={BUILD}', index)
index_path.write_text(index, 'utf-8')

mp_html = mp_html_path.read_text('utf-8')
mp_html = bump_asset_queries(mp_html)
mp_html = re.sub(r'data-fd-canonical-build="\d+"', f'data-fd-canonical-build="{BUILD}"', mp_html)
mp_html = mp_html.replace('multiplayer-lobby-v205.js', 'multiplayer-lobby-v206.js')
mp_html = re.sub(r'BUILD 205', f'BUILD {BUILD}', mp_html)
mp_html = re.sub(r'build=205', f'build={BUILD}', mp_html)
mp_html_path.write_text(mp_html, 'utf-8')

# Every remaining build query in generated assets must identify the same runtime.
for path in sorted(OUT.glob('*.js')):
    path.write_text(bump_asset_queries(path.read_text('utf-8')), 'utf-8')


# ---------------------------------------------------------------------------
# Assembly invariants: fail before any browser test if an ownership or authority
# edge was missed.
# ---------------------------------------------------------------------------
final_html = html_path.read_text('utf-8')
for name in MODULES:
    if final_html.count(f'{name}?build={BUILD}') != 1:
        raise RuntimeError(f'build {BUILD}: module HTML ownership invalid: {name}')
for name in ['runtime-ui-v206.js', 'runtime-shell-v206.js', 'save-slots-v206.js']:
    if final_html.count(f'{name}?build={BUILD}') != 1:
        raise RuntimeError(f'build {BUILD}: presentation owner invalid: {name}')
if 'runtime-shell-v205.js?build=206' in final_html or 'save-slots-v205.js?build=206' in final_html:
    raise RuntimeError(f'build {BUILD}: obsolete presentation owner still loaded')

final_worker = worker_path.read_text('utf-8')
for name in MODULES:
    if final_worker.count(f'/frontline-dominion/{name}?build={BUILD}') != 1:
        raise RuntimeError(f'build {BUILD}: Worker module ownership invalid: {name}')
for needle in [
    "case 'logisticsMission'", "case 'logisticsTrade'", 'networkLogisticsHash206',
    'data.logistics206 = game.exportLogistics206', 'logistics206: (force || tick % 25 === 0)'
]:
    if needle not in final_worker:
        raise RuntimeError(f'build {BUILD}: Worker authority invariant missing: {needle}')

print(f'Frontline Dominion build {BUILD} assembled: {VERSION}')
