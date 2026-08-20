from pathlib import Path

reliability_source = Path('tests/reliability199.mjs')
movement_source = Path('tests/movement198.mjs')
save_source = Path('tests/save-load200.mjs')

for path in (reliability_source, movement_source, save_source):
    if not path.exists():
        raise RuntimeError(f'build 201 test source missing: {path}')

reliability = reliability_source.read_text('utf-8')
reliability = reliability.replace('?build=199', '?build=201')
reliability = reliability.replace('__FD_RUNTIME_SHELL_199__', '__FD_RUNTIME_SHELL_201__')
reliability = reliability.replace(
    'globalThis.__FD_RUNTIME_SHELL_201__?.build === 199',
    'globalThis.__FD_RUNTIME_SHELL_201__?.build === 201',
)
reliability = reliability.replace("gate: 'save-load199'", "gate: 'save-load201'")
if 'globalThis.__FD_RUNTIME_SHELL_201__?.build === 201' not in reliability:
    raise RuntimeError('build 201 reliability runtime marker missing')
Path('tests/reliability201.generated.mjs').write_text(reliability, 'utf-8')

movement = movement_source.read_text('utf-8').replace('198', '201')
if '__FD_RUNTIME_SHELL_201__?.build === 201' not in movement:
    raise RuntimeError('build 201 movement runtime marker missing')
Path('tests/movement201.generated.mjs').write_text(movement, 'utf-8')

save_load = save_source.read_text('utf-8')
save_load = save_load.replace('?build=200', '?build=201')
save_load = save_load.replace('__FD_RUNTIME_SHELL_200__', '__FD_RUNTIME_SHELL_201__')
save_load = save_load.replace('save-load200', 'save-load201')
if '__FD_RUNTIME_SHELL_201__' not in save_load or '__FD_SIMULATION_RESILIENCE_200__' not in save_load:
    raise RuntimeError('build 201 save/load markers missing')
Path('tests/save-load201.generated.mjs').write_text(save_load, 'utf-8')

print('Build 201 reliability, movement and save/load browser gates generated')
