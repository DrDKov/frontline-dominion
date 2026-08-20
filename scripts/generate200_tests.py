from pathlib import Path

reliability_source = Path('tests/reliability199.mjs')
reliability_target = Path('tests/reliability200.generated.mjs')
movement_source = Path('tests/movement198.mjs')
movement_target = Path('tests/movement200.generated.mjs')

for path in (reliability_source, movement_source):
    if not path.exists():
        raise RuntimeError(f'build 200 test source missing: {path}')

reliability = reliability_source.read_text('utf-8')
reliability = reliability.replace('?build=199', '?build=200')
reliability = reliability.replace('__FD_RUNTIME_SHELL_199__', '__FD_RUNTIME_SHELL_200__')
reliability = reliability.replace(
    'globalThis.__FD_RUNTIME_SHELL_200__?.build === 199',
    'globalThis.__FD_RUNTIME_SHELL_200__?.build === 200',
)
reliability = reliability.replace("gate: 'save-load199'", "gate: 'save-load200'")
if 'globalThis.__FD_RUNTIME_SHELL_200__?.build === 200' not in reliability:
    raise RuntimeError('build 200 reliability runtime marker missing')
reliability_target.write_text(reliability, 'utf-8')

movement = movement_source.read_text('utf-8').replace('198', '200')
if '__FD_RUNTIME_SHELL_200__?.build === 200' not in movement:
    raise RuntimeError('build 200 movement runtime marker missing')
movement_target.write_text(movement, 'utf-8')

print('Build 200 reliability and movement browser gates generated')
