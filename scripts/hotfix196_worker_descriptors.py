from pathlib import Path

OUT = Path('dist')
formation = OUT / 'formation-obstacle-recovery-v196.js'
postload = OUT / 'post-load-command-recovery-v196.js'

for path in (formation, postload):
    if not path.exists():
        raise RuntimeError(f'missing build 196 output: {path}')

text = formation.read_text('utf-8')
old = "  Unit.prototype.processFormationCommand = function obstacleRecoveringFormation196(command, dt) {"
new = "  const processFormationCommand196 = function obstacleRecoveringFormation196(command, dt) {"
if text.count(old) != 1:
    raise RuntimeError('formation wrapper assignment anchor mismatch')
text = text.replace(old, new, 1)
marker = "  Object.defineProperty(Unit.prototype.processFormationCommand, '__fdObstacleRecovery196', { value: true });"
install = """  let formationInstalled196 = false;
  let formationInstallError196 = null;
  try {
    Object.defineProperty(Unit.prototype, 'processFormationCommand', {
      configurable: true,
      writable: true,
      value: processFormationCommand196,
    });
    Object.defineProperty(processFormationCommand196, '__fdObstacleRecovery196', { value: true });
    formationInstalled196 = Unit.prototype.processFormationCommand === processFormationCommand196;
  } catch (error) {
    formationInstallError196 = String(error?.message || error);
  }
  if (!formationInstalled196) {
    root.__FD_FORMATION_OBSTACLE_RECOVERY_196__ = {
      version: VERSION,
      build: BUILD,
      installed: false,
      installError: formationInstallError196 || 'prototype-install-refused',
      diagnostics,
    };
    return;
  }"""
if text.count(marker) != 1:
    raise RuntimeError('formation marker anchor mismatch')
text = text.replace(marker, install, 1)
text = text.replace("    diagnostics,\n  };\n})();", "    installed: true,\n    installError: null,\n    diagnostics,\n  };\n})();", 1)
formation.write_text(text, 'utf-8')

text = postload.read_text('utf-8')
# Hydration repair is a main-thread concern. In the authoritative Worker the
# engine may intentionally expose a non-writable hydrate method; attempting to
# monkey-patch it aborts importScripts in strict mode before tick zero.
old = "  if (typeof baseHydrate === 'function') {\n    Game.prototype.hydrate = function repairedHydrate196(data, ...rest) {"
new = "  if (hasDocument && typeof baseHydrate === 'function') {\n    const repairedHydrate196 = function repairedHydrate196(data, ...rest) {"
if text.count(old) != 1:
    raise RuntimeError('post-load hydrate assignment anchor mismatch')
text = text.replace(old, new, 1)
old_tail = """    };
    Object.defineProperty(Game.prototype.hydrate, '__fdPostLoadRepair196', { value: true });
  }"""
new_tail = """    };
    try {
      Object.defineProperty(Game.prototype, 'hydrate', {
        configurable: true,
        writable: true,
        value: repairedHydrate196,
      });
      Object.defineProperty(repairedHydrate196, '__fdPostLoadRepair196', { value: true });
    } catch (_) {
      // Runtime load-button repair still rebinds the newly exported Game even
      // when a historical layer made hydrate non-configurable.
    }
  }"""
if text.count(old_tail) != 1:
    raise RuntimeError('post-load hydrate tail anchor mismatch')
text = text.replace(old_tail, new_tail, 1)
postload.write_text(text, 'utf-8')

print('build 196 Worker descriptor hotfix applied')
