from pathlib import Path

path = Path('dist/post-load-command-recovery-v196.js')
if not path.exists():
    raise RuntimeError('build 199 post-load recovery output is missing')

text = path.read_text('utf-8')
anchor = """      unit.currentCommand = normalizeFormationCommand(unit.currentCommand, validIds);
      if (!Array.isArray(unit.commandQueue)) unit.commandQueue = [];
      unit.commandQueue = unit.commandQueue
        .map(command => normalizeFormationCommand(command, validIds))
        .filter(Boolean);
      const ids = [
        unit.currentCommand?.formationGroupId,
        unit.currentCommand?.formationId,
        ...unit.commandQueue.flatMap(command => [command?.formationGroupId, command?.formationId]),
      ];
"""
replacement = """      // currentCommand is a getter derived from commandQueue in the canonical
      // Unit class. Restore and normalize the queue only; assigning the getter
      // aborts Game construction while loading a save.
      if (!Array.isArray(unit.commandQueue)) unit.commandQueue = [];
      unit.commandQueue = unit.commandQueue
        .map(command => normalizeFormationCommand(command, validIds))
        .filter(Boolean);
      const currentCommand = unit.currentCommand;
      const ids = [
        currentCommand?.formationGroupId,
        currentCommand?.formationId,
        ...unit.commandQueue.flatMap(command => [command?.formationGroupId, command?.formationId]),
      ];
"""
if text.count(anchor) != 1:
    raise RuntimeError(f'build 199 post-load currentCommand anchor count invalid: {text.count(anchor)}')
text = text.replace(anchor, replacement, 1)
path.write_text(text, 'utf-8')

final = path.read_text('utf-8')
if 'unit.currentCommand =' in final:
    raise RuntimeError('build 199 readonly currentCommand assignment remains in post-load recovery')
if 'const currentCommand = unit.currentCommand;' not in final:
    raise RuntimeError('build 199 post-load derived command marker is missing')

print('Build 199 post-load command recovery made getter-safe')
