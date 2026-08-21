from pathlib import Path
import re

AUTH = Path('dist/authoritative-logistics-v206.js')
WORKER = Path('dist/authoritative-simulation-worker-v174.js')
BRIDGE = Path('dist/authoritative-simulation-v174.js')
LOBBY = Path('dist/multiplayer-lobby-v206.js')
for path in [AUTH, WORKER, BRIDGE, LOBBY]:
    if not path.exists():
        raise RuntimeError(f'build 206 diagnostic target missing: {path}')


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'build 206 {label} anchor count={count}')
    return text.replace(old, new, 1)

# Compact deterministic component hashes. Diagnostic only; authoritative
# network checksum semantics remain unchanged.
auth = AUTH.read_text('utf-8')
anchor = "  function conservationLedger206(game, team = null) {\n"
components = r"""  function canonicalLogisticsComponents206(game, perspectiveSwapped = false) {
    L.scanEntities(game);
    const state = L.ensureGame(game);
    let teams = 2166136261 >>> 0, nodes = 2166136261 >>> 0, units = 2166136261 >>> 0, missions = 2166136261 >>> 0;
    for (const canonical of ['player', 'enemy']) {
      const local = localTeam(canonical, perspectiveSwapped);
      teams = fnvText(teams, canonical); teams = fnvNumber(teams, game.teams?.[local]?.credits, 100);
      const teamState = state.team?.[local] || {};
      teams = fnvNumber(teams, teamState.supportSpent, 100); teams = fnvNumber(teams, teamState.importSpent, 100);
      const contracts = teamState.contracts || {};
      for (const id of Object.keys(contracts).sort()) {
        teams = fnvText(teams, id); const byResource = contracts[id] || {};
        for (const resource of ['fuel', 'ammo']) {
          const contract = byResource[resource] || {}; teams = fnvText(teams, resource);
          for (const key of ['mode', 'destinationNodeId']) teams = fnvText(teams, contract[key]);
          for (const key of ['targetAmount', 'fixedAmount', 'interval', 'nextExecution', 'currentPrice']) teams = fnvNumber(teams, contract[key]);
        }
      }
    }
    for (const entity of stableEntities(game)) {
      const s = entity.logistics206; if (!s && !Number.isFinite(entity.resourceBuffer83)) continue;
      const canonicalTeam = perspectiveSwapped ? (entity.team === 'player' ? 'enemy' : entity.team === 'enemy' ? 'player' : entity.team) : entity.team;
      if (entity.kind === 'building') {
        nodes = fnvText(nodes, entity.id); nodes = fnvText(nodes, canonicalTeam);
        if (s?.stock) nodes = mixManifest(nodes, s.stock); if (s?.importBuffer) nodes = mixManifest(nodes, s.importBuffer);
        for (const key of ['weaponReady206','weaponReadyMax206','weaponReloadRemaining206']) if (Number.isFinite(s?.[key])) nodes = fnvNumber(nodes, s[key]);
        if (Number.isFinite(entity.resourceBuffer83)) nodes = fnvNumber(nodes, entity.resourceBuffer83); if (entity.resourceType206) nodes = fnvText(nodes, entity.resourceType206);
      } else {
        units = fnvText(units, entity.id); units = fnvText(units, canonicalTeam); if (s?.cargo) units = mixManifest(units, s.cargo);
        for (const key of ['fuel','fuelMax','ammoReady','ammoReadyMax','ammoReserve','ammoReserveMax','support','supportMax','routeRisk','reloadRemaining206']) if (Number.isFinite(s?.[key])) units = fnvNumber(units, s[key]);
        missions = fnvText(missions, entity.id);
        for (const key of ['missionType','status','phase206','sourceNodeId','destinationNodeId','homeNodeId','targetGroupId']) if (s?.[key] != null) missions = fnvText(missions, s[key]);
      }
    }
    return { tick: Number(game.simTick) || 0, teams: teams >>> 0, nodes: nodes >>> 0, units: units >>> 0, missions: missions >>> 0 };
  }

"""
auth = replace_once(auth, anchor, components + anchor, 'component hash function')
auth = replace_once(auth, "  Game.prototype.logisticsConservationLedger206 = function(team = null) {\n", "  Game.prototype.networkLogisticsComponents206 = function(perspectiveSwapped = false) {\n    return canonicalLogisticsComponents206(this, Boolean(perspectiveSwapped));\n  };\n  Game.prototype.logisticsConservationLedger206 = function(team = null) {\n", 'component hash prototype')
auth = replace_once(auth, "    version: '20.6', canonicalLogisticsHash206, conservationLedger206, EPS,\n", "    version: '20.6', canonicalLogisticsHash206, canonicalLogisticsComponents206, conservationLedger206, EPS,\n", 'component hash export')
AUTH.write_text(auth, 'utf-8')

worker = WORKER.read_text('utf-8')
# Hash epochs must depend only on authoritative simulation tick, never on the
# wall-clock phase at which each browser happened to compute its first hash.
worker = replace_once(
    worker,
    "  if (!force && lastNetworkHashTick >= 0 && tick - lastNetworkHashTick < interval) return lastNetworkHash;\n",
    "  if (!force && tick % interval !== 0) return lastNetworkHash;\n"
    "  if (!force && lastNetworkHashTick === tick) return lastNetworkHash;\n",
    'Worker canonical network hash epochs',
)
worker = replace_once(worker, "let lastNetworkHash = '00000000';\n", "let lastNetworkHash = '00000000';\nlet lastNetworkLogisticsHash206 = 0;\nlet lastNetworkLogisticsComponents206 = null;\n", 'Worker logistics diagnostic declarations')
worker = replace_once(worker, "  mix(game.networkLogisticsHash206?.(multiplayer.perspectiveSwapped) || 0);\n", "  lastNetworkLogisticsHash206 = Number(game.networkLogisticsHash206?.(multiplayer.perspectiveSwapped) || 0) >>> 0;\n  lastNetworkLogisticsComponents206 = game.networkLogisticsComponents206?.(multiplayer.perspectiveSwapped) || null;\n  mix(lastNetworkLogisticsHash206);\n", 'Worker logistics hash capture')
worker = replace_once(worker, "lastHashTick = -1; lastNetworkHashTick = -1; lastNetworkHash = '00000000';\n", "lastHashTick = -1; lastNetworkHashTick = -1; lastNetworkHash = '00000000'; lastNetworkLogisticsHash206 = 0; lastNetworkLogisticsComponents206 = null;\n", 'Worker logistics diagnostic reset')
worker = replace_once(worker, "networkHash, networkHashTick: lastNetworkHashTick, appliedSeq:", "networkHash, networkHashTick: lastNetworkHashTick, networkLogisticsHash206: lastNetworkLogisticsHash206, networkLogisticsComponents206: lastNetworkLogisticsComponents206, appliedSeq:", 'Worker snapshot diagnostics')
WORKER.write_text(worker, 'utf-8')

bridge = BRIDGE.read_text('utf-8')
pattern = r"(postMultiplayerStatus\(message\)\s*\{[\s\S]{0,600}?\bconst tick\s*=\s*)([^;\n]+);"
def fix_tick(match):
    return match.group(1) + "Number(message.networkHashTick || message.tick || 0) || 0;"
bridge, count = re.subn(pattern, fix_tick, bridge, count=1)
if count != 1:
    raise RuntimeError(f'build 206 multiplayer status tick anchor count={count}')
bridge = replace_once(
    bridge,
    "      tick, hash: message.networkHash || this.networkHash,\n",
    "      tick, hash: message.networkHash || this.networkHash,\n"
    "      networkLogisticsHash206: Number(message.networkLogisticsHash206 || 0) >>> 0,\n"
    "      networkLogisticsComponents206: message.networkLogisticsComponents206 || null,\n",
    'bridge multiplayer status pass-through',
)
BRIDGE.write_text(bridge, 'utf-8')

lobby = LOBBY.read_text('utf-8')
lobby = replace_once(
    lobby,
    "    else {\n      state.hashMismatches += 1;\n      state.mismatchStreak += 1;\n",
    "    else {\n"
    "      state.lastHashMismatch206 = {\n"
    "        tick: state.remoteTick,\n"
    "        local: { hash: local.hash, stateHash: local.stateHash, rngSeed: local.rngSeed, logisticsHash: local.networkLogisticsHash206, components: local.networkLogisticsComponents206, subsystems: local.subsystemHashes },\n"
    "        remote: { hash: status.hash, stateHash: status.stateHash, rngSeed: status.rngSeed, logisticsHash: status.networkLogisticsHash206, components: status.networkLogisticsComponents206, subsystems: status.subsystemHashes },\n"
    "      };\n"
    "      state.firstHashMismatch206 ||= state.lastHashMismatch206;\n"
    "      state.hashMismatches += 1;\n      state.mismatchStreak += 1;\n",
    'lobby mismatch diagnostic',
)
LOBBY.write_text(lobby, 'utf-8')
print('Build 206 network checksums aligned to canonical simulation epochs; first matched-tick divergence preserved')
