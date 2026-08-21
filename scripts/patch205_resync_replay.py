from pathlib import Path

path = Path('dist/multiplayer-lobby-v205.js')
text = path.read_text('utf-8')

if 'pendingReplayBaseSeq205' in text:
    print('Build 205 resync replay journal already patched')
    raise SystemExit(0)

state_anchor = "  const fragments = new Map();\n  const hostStatuses = new Map();\n"
state_replacement = state_anchor + "  const eventHistory205 = new Map();\n  let pendingReplayBaseSeq205 = 0;\n  let pendingReplayRequestId205 = null;\n\n  function rememberEvent205(event) {\n    const seq = Number(event?.seq) || 0;\n    if (!seq || !event?.action) return false;\n    const copy = typeof structuredClone === 'function' ? structuredClone(event) : JSON.parse(JSON.stringify(event));\n    eventHistory205.set(seq, copy);\n    while (eventHistory205.size > 512) eventHistory205.delete(eventHistory205.keys().next().value);\n    return true;\n  }\n\n  function replayPendingEvents205() {\n    if (!pendingReplayRequestId205) return 0;\n    const baseSeq = pendingReplayBaseSeq205;\n    const pending = [...eventHistory205.values()]\n      .filter(event => (Number(event?.seq) || 0) > baseSeq)\n      .sort((a, b) => (Number(a.seq) || 0) - (Number(b.seq) || 0));\n    let replayed = 0;\n    for (const event of pending) if (dispatchNetworkEvent(event)) replayed += 1;\n    pendingReplayBaseSeq205 = 0;\n    pendingReplayRequestId205 = null;\n    return replayed;\n  }\n"
if text.count(state_anchor) != 1:
    raise RuntimeError('build 205 lobby state anchor missing')
text = text.replace(state_anchor, state_replacement, 1)

reset_anchor = "    state.eventSequence = 0;\n    state.mismatchStreak = 0;\n    hostStatuses.clear();\n"
reset_replacement = "    state.eventSequence = 0;\n    state.mismatchStreak = 0;\n    hostStatuses.clear();\n    eventHistory205.clear();\n    pendingReplayBaseSeq205 = 0;\n    pendingReplayRequestId205 = null;\n"
if text.count(reset_anchor) != 1:
    raise RuntimeError('build 205 lobby peer reset anchor missing')
text = text.replace(reset_anchor, reset_replacement, 1)

authorize_anchor = "    state.eventsSent += 1;\n    state.lastEvent = { action: event.action, seq: event.seq, atTick: event.atTick, team: event.team };\n    dispatchNetworkEvent(event);\n"
authorize_replacement = "    state.eventsSent += 1;\n    state.lastEvent = { action: event.action, seq: event.seq, atTick: event.atTick, team: event.team };\n    rememberEvent205(event);\n    dispatchNetworkEvent(event);\n"
if text.count(authorize_anchor) != 1:
    raise RuntimeError('build 205 host event journal anchor missing; run command tick patch first')
text = text.replace(authorize_anchor, authorize_replacement, 1)

guest_event_anchor = "          state.eventsReceived += 1;\n          state.lastEvent = { action: packet.event.action, seq: packet.event.seq, atTick: packet.event.atTick, team: packet.event.team };\n          dispatchNetworkEvent(packet.event);\n"
guest_event_replacement = "          state.eventsReceived += 1;\n          state.lastEvent = { action: packet.event.action, seq: packet.event.seq, atTick: packet.event.atTick, team: packet.event.team };\n          rememberEvent205(packet.event);\n          dispatchNetworkEvent(packet.event);\n"
if text.count(guest_event_anchor) != 1:
    raise RuntimeError('build 205 guest event journal anchor missing')
text = text.replace(guest_event_anchor, guest_event_replacement, 1)

snapshot_receive_anchor = "      case 'snapshot':\n        if (state.role === 'guest' && packet.snapshot) {\n          state.snapshotsReceived += 1;\n          postGame('fd:mp-snapshot', { snapshot: packet.snapshot, requestId: packet.requestId });\n        }\n        break;\n"
snapshot_receive_replacement = "      case 'snapshot':\n        if (state.role === 'guest' && packet.snapshot) {\n          state.snapshotsReceived += 1;\n          pendingReplayBaseSeq205 = Number(packet.baseSeq ?? packet.snapshot?.__mp?.appliedSeq ?? 0) || 0;\n          pendingReplayRequestId205 = packet.requestId || `snapshot-${Date.now().toString(36)}`;\n          postGame('fd:mp-snapshot', { snapshot: packet.snapshot, requestId: packet.requestId, baseSeq: pendingReplayBaseSeq205 });\n        }\n        break;\n"
if text.count(snapshot_receive_anchor) != 1:
    raise RuntimeError('build 205 snapshot receive anchor missing')
text = text.replace(snapshot_receive_anchor, snapshot_receive_replacement, 1)

snapshot_send_anchor = "      case 'fd:mp-snapshot':\n        if (state.role === 'host' && message.snapshot) {\n          state.snapshotsSent += 1;\n          sendPacket({ kind: 'snapshot', snapshot: message.snapshot, requestId: message.requestId });\n        }\n        break;\n"
snapshot_send_replacement = "      case 'fd:mp-snapshot':\n        if (state.role === 'host' && message.snapshot) {\n          state.snapshotsSent += 1;\n          sendPacket({\n            kind: 'snapshot', snapshot: message.snapshot, requestId: message.requestId,\n            baseSeq: Number(message.baseSeq ?? message.snapshot?.__mp?.appliedSeq ?? 0) || 0,\n          });\n        }\n        break;\n"
if text.count(snapshot_send_anchor) != 1:
    raise RuntimeError('build 205 snapshot send anchor missing')
text = text.replace(snapshot_send_anchor, snapshot_send_replacement, 1)

resynced_anchor = "      case 'fd:mp-resynced':\n        if (state.role === 'guest') sendPacket({ kind: 'resynced', tick: message.tick });\n        break;\n"
resynced_replacement = "      case 'fd:mp-resynced':\n        if (state.role === 'guest') {\n          const replayed205 = replayPendingEvents205();\n          sendPacket({ kind: 'resynced', tick: message.tick, replayed: replayed205 });\n        }\n        break;\n"
if text.count(resynced_anchor) != 1:
    raise RuntimeError('build 205 resynced replay anchor missing')
text = text.replace(resynced_anchor, resynced_replacement, 1)

diag_anchor = "      fragments: fragments.size,\n"
if diag_anchor in text:
    text = text.replace(diag_anchor, "      fragments: fragments.size, eventHistory: eventHistory205.size, pendingReplayBaseSeq: pendingReplayBaseSeq205,\n", 1)

path.write_text(text, 'utf-8')
print('Build 205 resync command journal and replay patched')
