from pathlib import Path
import runpy

BRIDGE = Path('dist/authoritative-simulation-v174.js')
MP_GAME = Path('dist/multiplayer-game-v96.js')
for path in [BRIDGE, MP_GAME]:
    if not path.exists():
        raise RuntimeError(f'build 206 resync target missing: {path}')

text = BRIDGE.read_text('utf-8')

def once(old: str, new: str, label: str) -> None:
    global text
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'build 206 {label} anchor count={count}')
    text = text.replace(old, new, 1)

# A multiplayer resync is already an authoritative Worker save. The old bridge
# hydrated that snapshot into a presentation Game and immediately serialized
# the presentation Game again before starting its replacement Worker. Preserve
# the exact incoming authoritative snapshot bytes instead.
once(
    "Game.prototype.hydrate = function(data) {\n  this._fdLoadedAuthoritative172 = data?.authoritative172 || null;\n  return legacy.hydrate.call(this, data);\n};\n",
    "Game.prototype.hydrate = function(data) {\n"
    "  this._fdLoadedAuthoritative172 = data?.authoritative172 || null;\n"
    "  this._fdLoadedMultiplayerSnapshot206 = data?.__mp ? data : null;\n"
    "  return legacy.hydrate.call(this, data);\n"
    "};\n",
    'bridge hydrate multiplayer snapshot preservation',
)

# On replacement-Worker launch, bypass legacy.save entirely for a preserved
# resync snapshot. The source bytes came from the host authoritative Worker.
once(
    "function captureInitialState(game) {\n  const previous = D.storageGet(D.SAVE_KEY);\n",
    "function captureInitialState(game) {\n"
    "  const preservedResync206 = game?._fdLoadedMultiplayerSnapshot206;\n"
    "  if (preservedResync206?.__mp && preservedResync206?.authoritative172) {\n"
    "    const saveData = clonePlain(preservedResync206);\n"
    "    const authoritative = clonePlain(saveData.authoritative172);\n"
    "    const projectiles = Array.isArray(authoritative?.projectiles) ? clonePlain(authoritative.projectiles) : [];\n"
    "    return { saveData, authoritative, projectiles };\n"
    "  }\n"
    "  const previous = D.storageGet(D.SAVE_KEY);\n",
    'bridge exact resync handoff',
)

# During debug.startGame(loadData), the old bridge can remain alive for a few
# milliseconds while the replacement bridge is being constructed. A network
# event received in that window used to be sent into the old Worker and then
# lost when AuthoritativeBridge.launch() shut it down. Buffer events while an
# explicit resync handoff is active; only the replacement Worker's ready event
# may flush them.
once(
    "window.addEventListener('message', event => {\n"
    "  if (event.origin !== window.location.origin) return;\n"
    "  const message = event.data || {};\n"
    "  const bridge = activeBridge || (D.game ? bridges.get(D.game) : null);\n"
    "  if (!bridge || bridge.failed) return;\n"
    "  if (message.type === 'fd:mp-event' && message.event) bridge.sendNetworkEvent(message.event);\n",
    "window.addEventListener('message', event => {\n"
    "  if (event.origin !== window.location.origin) return;\n"
    "  const message = event.data || {};\n"
    "  const handoff206 = window.__FD_MP_RESYNC_HANDOFF_206__;\n"
    "  if (message.type === 'fd:mp-event' && message.event && handoff206?.active) {\n"
    "    const networkSeq206 = Number(message.event.seq) || 0;\n"
    "    const baseSeq206 = Number(handoff206.baseSeq) || 0;\n"
    "    handoff206.events ||= [];\n"
    "    if (networkSeq206 > baseSeq206 && !handoff206.events.some(item => String(item?.id || '') === String(message.event.id || '') || (Number(item?.seq) || 0) === networkSeq206)) {\n"
    "      handoff206.events.push(clonePlain(message.event));\n"
    "    }\n"
    "    return;\n"
    "  }\n"
    "  const bridge = activeBridge || (D.game ? bridges.get(D.game) : null);\n"
    "  if (!bridge || bridge.failed) return;\n"
    "  if (message.type === 'fd:mp-event' && message.event) bridge.sendNetworkEvent(message.event);\n",
    'bridge resync event buffering',
)

ready_anchor = (
    "      const hostTick = window.__FD_MULTIPLAYER__?.hostTick;\n"
    "      if (Number.isFinite(hostTick)) this.sendClock(hostTick);\n"
    "      if (window.__FD_STABLE_STATE165__) window.__FD_STABLE_STATE165__.transport = this.transportMode165;\n"
)
ready_new = (
    "      const hostTick = window.__FD_MULTIPLAYER__?.hostTick;\n"
    "      if (Number.isFinite(hostTick)) this.sendClock(hostTick);\n"
    "      const handoff206 = window.__FD_MP_RESYNC_HANDOFF_206__;\n"
    "      if (handoff206?.active && activeBridge === this && this.game === D.game) {\n"
    "        const baseSeq206 = Number(handoff206.baseSeq) || 0;\n"
    "        this.appliedNetworkSeq = Math.max(Number(this.appliedNetworkSeq || 0), baseSeq206);\n"
    "        window.__FD_MULTIPLAYER__?.markWorkerApplied?.(baseSeq206);\n"
    "        const buffered206 = [...(handoff206.events || [])]\n"
    "          .filter(item => (Number(item?.seq) || 0) > baseSeq206)\n"
    "          .sort((a, b) => (Number(a?.seq) || 0) - (Number(b?.seq) || 0));\n"
    "        handoff206.active = false;\n"
    "        handoff206.flushedByBridgeId = this.id;\n"
    "        handoff206.flushedAtTick = Number(this.workerTick || 0);\n"
    "        handoff206.flushedCount = buffered206.length;\n"
    "        handoff206.events = [];\n"
    "        for (const pending206 of buffered206) this.sendNetworkEvent(pending206);\n"
    "      }\n"
    "      if (window.__FD_STABLE_STATE165__) window.__FD_STABLE_STATE165__.transport = this.transportMode165;\n"
)
once(ready_anchor, ready_new, 'replacement Worker buffered event flush')

# Keep the Worker stack attached to the recovery reason. This is diagnostic
# metadata only, but it makes a post-resync fatal point to the exact historical
# module/line instead of collapsing to a generic TypeError message.
once(
    "    if (message.type === 'fatal') this.fail(`${message.stage || 'worker'}: ${message.message || 'фатальная ошибка'}`);\n",
    "    if (message.type === 'fatal') this.fail(`${message.stage || 'worker'}: ${message.message || 'фатальная ошибка'}${message.stack ? `\\n${message.stack}` : ''}`);\n",
    'bridge Worker fatal stack preservation',
)

BRIDGE.write_text(text, 'utf-8')

mp = MP_GAME.read_text('utf-8')
restore_anchor = (
    "  function restoreSnapshot(snapshot) {\n"
    "    if (!snapshot?.entities || !snapshot.__mp) return;\n"
    "    const localCamera = debug.game?.camera ? { ...debug.game.camera } : null;\n"
)
restore_new = (
    "  function restoreSnapshot(snapshot) {\n"
    "    if (!snapshot?.entities || !snapshot.__mp) return;\n"
    "    const baseSeq206 = Number(snapshot.__mp.appliedSeq) || 0;\n"
    "    window.__FD_MP_RESYNC_HANDOFF_206__ = {\n"
    "      active: true, baseSeq: baseSeq206, snapshotTick: Number(snapshot.__mp.simTick) || 0,\n"
    "      startedAt: performance.now(), events: [], flushedCount: 0\n"
    "    };\n"
    "    const localCamera = debug.game?.camera ? { ...debug.game.camera } : null;\n"
)
if mp.count(restore_anchor) != 1:
    raise RuntimeError(f'build 206 multiplayer restore handoff anchor count={mp.count(restore_anchor)}')
mp = mp.replace(restore_anchor, restore_new, 1)
MP_GAME.write_text(mp, 'utf-8')

print('Build 206 resync preserves exact snapshot and buffers network events until replacement Worker is ready')

# Keep Unit.update byte-for-byte on the deterministic legacy path. Finite
# ammunition reconciliation belongs to a world post-phase, not inside each
# unit's navigation/collision update.
runpy.run_path('scripts/hotfix206_reload_phase.py', run_name='__main__')
