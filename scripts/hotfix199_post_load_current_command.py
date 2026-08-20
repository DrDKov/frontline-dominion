from pathlib import Path

path = Path('dist/post-load-command-recovery-v196.js')
html_path = Path('dist/frontline-dominion.html')
if not path.exists() or not html_path.exists():
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

# Build 199 had already been published once before this load fix. GitHub Pages
# and the browser can therefore retain the old response under ?build=199 even
# after gh-pages is force-updated. Give only this repaired asset a new immutable
# cache key so public verification cannot execute the stale getter assignment.
html = html_path.read_text('utf-8')
old_asset = 'post-load-command-recovery-v196.js?build=199'
new_asset = 'post-load-command-recovery-v196.js?rev=199-loadfix1'
if html.count(old_asset) != 1:
    raise RuntimeError(f'build 199 post-load asset reference count invalid: {html.count(old_asset)}')
html = html.replace(old_asset, new_asset, 1)
html_path.write_text(html, 'utf-8')

final = path.read_text('utf-8')
final_html = html_path.read_text('utf-8')
if 'unit.currentCommand =' in final:
    raise RuntimeError('build 199 readonly currentCommand assignment remains in post-load recovery')
if 'const currentCommand = unit.currentCommand;' not in final:
    raise RuntimeError('build 199 post-load derived command marker is missing')
if final_html.count(new_asset) != 1 or old_asset in final_html:
    raise RuntimeError('build 199 getter-safe post-load asset cache key is missing')

print('Build 199 post-load command recovery made getter-safe and cache-busted')
