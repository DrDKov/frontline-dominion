from pathlib import Path

path = Path('dist/authoritative-simulation-worker-v174.js')
if not path.exists():
    raise RuntimeError('build 206 authoritative Worker missing')

text = path.read_text('utf-8')
anchor = "function initGame(message) {\n  const saveData = message.saveData || null;\n"
if text.count(anchor) != 1:
    raise RuntimeError(f'build 206 Worker init anchor count={text.count(anchor)}')

replacement = r"""function canonicalFreshNetworkLogistics206(saveData, multiplayerState) {
  if (!saveData || !multiplayerState?.active || saveData.__mp) return saveData;

  // The lobby creates host and guest games independently before their
  // authoritative Workers launch.  Build-206 modules may have had a few local
  // presentation/startup ticks in that interval.  Persisting those locally
  // accumulated logistics fields would make otherwise identical Workers start
  // with different Fuel/Ammo/Support, sampling coordinates or support costs.
  // A fresh network match therefore derives logistics from canonical entity
  // definitions inside the Worker.  Resync snapshots carry __mp and are never
  // normalized here: their physical stocks/cargo are already authoritative.
  const rootLogistics = saveData.logistics206;
  if (rootLogistics?.team && saveData.teams) {
    // Reverse only build-206 pre-Worker expenditures.  Scheduled imports cannot
    // occur during normal lobby startup, but including them makes the reset
    // mathematically complete.  Financial income is second-gated and does not
    // execute before the initial Worker handoff.
    for (const teamKey of ['player', 'enemy']) {
      const team = saveData.teams?.[teamKey];
      const ledger = rootLogistics.team?.[teamKey];
      if (!team || !ledger) continue;
      const spent = Math.max(0, Number(ledger.supportSpent) || 0) + Math.max(0, Number(ledger.importSpent) || 0);
      if (spent > 0) team.credits = (Number(team.credits) || 0) + spent;
    }
  }
  delete saveData.logistics206;

  const visited = new Set();
  for (const collection of [saveData.entities, saveData.units, saveData.buildings]) {
    if (!Array.isArray(collection)) continue;
    for (const raw of collection) {
      if (!raw || typeof raw !== 'object' || visited.has(raw)) continue;
      visited.add(raw);
      delete raw.logistics206;
      delete raw.resourceType206;
      delete raw.resourceBufferMax206;
      // resourceBuffer83 is a physical extractor output buffer.  A fresh
      // network match starts it from the canonical empty state; production
      // after Worker tick zero remains fully physical and deterministic.
      if (Number.isFinite(raw.resourceBuffer83)) raw.resourceBuffer83 = 0;
    }
  }
  return saveData;
}

function initGame(message) {
  const saveData = canonicalFreshNetworkLogistics206(message.saveData || null, message.multiplayer || {});
"""

text = text.replace(anchor, replacement, 1)
path.write_text(text, 'utf-8')
print('Build 206 fresh multiplayer logistics canonicalized before Worker hydrate')
