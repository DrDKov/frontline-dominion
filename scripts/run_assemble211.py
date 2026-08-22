from pathlib import Path

path = Path('scripts/assemble211.py')
source = path.read_text('utf-8')
old = """close = '\\n})();\\n'
if supply.count(close) != 1:
    raise RuntimeError(f'build 211 supply close anchor count={supply.count(close)}')
supply = supply.replace(close, marker + close, 1)
SUPPLY.write_text(supply, 'utf-8')
"""
new = """# The assembled transport file is a composition of more than one IIFE. Keep
# the build-211 identity marker independent from internal wrapper counts.
supply += \"\\n;(() => { const root = typeof window !== 'undefined' ? window : self; root.__FD_LOGISTICS_INTEGRITY_211__ = Object.freeze({ build:211, version:'16.9.5', truckToTruckTankService:true, missionRadiusAuthoritative:true, groupRearFollow:true, autoNodeSustainment:true, receiverCargoIsolation:true }); })();\\n\"
SUPPLY.write_text(supply, 'utf-8')
"""
if source.count(old) != 1:
    raise RuntimeError(f'assemble211 runner anchor count={source.count(old)}')
patched = source.replace(old, new, 1)
exec(compile(patched, str(path), 'exec'), {'__name__': '__main__', '__file__': str(path)})
