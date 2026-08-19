from pathlib import Path

path = Path('tests/reliability199.mjs')
if not path.exists():
    raise RuntimeError('build 199 reliability test is missing')

text = path.read_text('utf-8')
anchor = """      if (game.hitTest?.(world.x, world.y, true)) continue;
      return {
        before,
        world,
        cssX: rect.left + sx * rect.width / canvas.width,
        cssY: rect.top + sy * rect.height / canvas.height,
      };
"""
replacement = """      if (game.hitTest?.(world.x, world.y, true)) continue;
      const cssX = rect.left + sx * rect.width / canvas.width;
      const cssY = rect.top + sy * rect.height / canvas.height;
      // The canvas is partially covered by HUD panels. A coordinate can be
      // empty in world space yet physically click an overlay instead of the
      // battlefield; require the real browser hit target to be the canvas.
      if (document.elementFromPoint(cssX, cssY) !== canvas) continue;
      return { before, world, cssX, cssY };
"""
if text.count(anchor) != 1:
    raise RuntimeError('build 199 physical empty-click fixture anchor count invalid')
text = text.replace(anchor, replacement, 1)
path.write_text(text, 'utf-8')

final = path.read_text('utf-8')
for marker in ('document.elementFromPoint(cssX, cssY) !== canvas', 'return { before, world, cssX, cssY }'):
    if marker not in final:
        raise RuntimeError(f'build 199 physical click gate marker missing: {marker}')
print('Build 199 physical empty-click browser fixture constrained to the game canvas')
