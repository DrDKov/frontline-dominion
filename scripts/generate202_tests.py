from pathlib import Path

reliability_source = Path('tests/reliability199.mjs')
movement_source = Path('tests/movement198.mjs')
save_source = Path('tests/save-load200.mjs')
user201_source = Path('tests/user-fixes201.mjs')
user200_source = Path('tests/user-fixes200.mjs')
worker_source = Path('tests/worker-recovery201.mjs')

for path in (reliability_source, movement_source, save_source, user201_source, user200_source, worker_source):
    if not path.exists():
        raise RuntimeError(f'build 202 test source missing: {path}')

reliability = reliability_source.read_text('utf-8')
reliability = reliability.replace('?build=199', '?build=202')
reliability = reliability.replace('__FD_RUNTIME_SHELL_199__', '__FD_RUNTIME_SHELL_202__')
reliability = reliability.replace(
    'globalThis.__FD_RUNTIME_SHELL_202__?.build === 199',
    'globalThis.__FD_RUNTIME_SHELL_202__?.build === 202',
)
reliability = reliability.replace("gate: 'save-load199'", "gate: 'save-load202'")
if 'globalThis.__FD_RUNTIME_SHELL_202__?.build === 202' not in reliability:
    raise RuntimeError('build 202 reliability runtime marker missing')
Path('tests/reliability202.generated.mjs').write_text(reliability, 'utf-8')

movement = movement_source.read_text('utf-8').replace('198', '202')
if '__FD_RUNTIME_SHELL_202__?.build === 202' not in movement:
    raise RuntimeError('build 202 movement runtime marker missing')
Path('tests/movement202.generated.mjs').write_text(movement, 'utf-8')

save_load = save_source.read_text('utf-8')
save_load = save_load.replace('?build=200', '?build=202')
save_load = save_load.replace('__FD_RUNTIME_SHELL_200__', '__FD_RUNTIME_SHELL_202__')
save_load = save_load.replace(
    'globalThis.__FD_RUNTIME_SHELL_202__?.build === 200',
    'globalThis.__FD_RUNTIME_SHELL_202__?.build === 202',
)
save_load = save_load.replace('save-load200', 'save-load202')
if 'globalThis.__FD_RUNTIME_SHELL_202__?.build === 202' not in save_load or '__FD_SIMULATION_RESILIENCE_200__' not in save_load:
    raise RuntimeError('build 202 save/load markers missing')
Path('tests/save-load202.generated.mjs').write_text(save_load, 'utf-8')

user201 = user201_source.read_text('utf-8')
user201 = user201.replace('?build=201', '?build=202')
user201 = user201.replace('__FD_RUNTIME_SHELL_201__', '__FD_RUNTIME_SHELL_202__')
user201 = user201.replace(
    'globalThis.__FD_RUNTIME_SHELL_202__?.build === 201',
    'globalThis.__FD_RUNTIME_SHELL_202__?.build === 202',
)
if 'globalThis.__FD_RUNTIME_SHELL_202__?.build === 202' not in user201 or '__FD_GROUP_MOVEMENT_201__' not in user201:
    raise RuntimeError('build 202 selection/group gate markers missing')
Path('tests/user-fixes202.generated.mjs').write_text(user201, 'utf-8')

user200 = user200_source.read_text('utf-8')
user200 = user200.replace('?build=200', '?build=202')
user200 = user200.replace('__FD_RUNTIME_SHELL_200__', '__FD_RUNTIME_SHELL_202__')
user200 = user200.replace(
    'globalThis.__FD_RUNTIME_SHELL_202__?.build === 200',
    'globalThis.__FD_RUNTIME_SHELL_202__?.build === 202',
)
if 'globalThis.__FD_RUNTIME_SHELL_202__?.build === 202' not in user200 or '__FD_SIMULATION_RESILIENCE_200__' not in user200:
    raise RuntimeError('build 202 finite recon gate markers missing')
Path('tests/user-fixes202-recon.generated.mjs').write_text(user200, 'utf-8')

worker = worker_source.read_text('utf-8')
worker = worker.replace('?build=201', '?build=202')
worker = worker.replace('__FD_RUNTIME_SHELL_201__', '__FD_RUNTIME_SHELL_202__')
worker = worker.replace(
    'globalThis.__FD_RUNTIME_SHELL_202__?.build === 201',
    'globalThis.__FD_RUNTIME_SHELL_202__?.build === 202',
)
if 'globalThis.__FD_RUNTIME_SHELL_202__?.build === 202' not in worker or 'recoveryAttempts201' not in worker:
    raise RuntimeError('build 202 Worker recovery gate markers missing')
Path('tests/worker-recovery202.generated.mjs').write_text(worker, 'utf-8')

print('Build 202 reliability, movement and save/load browser gates generated')
