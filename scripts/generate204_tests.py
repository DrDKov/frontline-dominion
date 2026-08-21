from pathlib import Path

BUILD = 204
SHELL = '__FD_RUNTIME_SHELL_204__'

sources = {
    'reliability': Path('tests/reliability199.mjs'),
    'movement': Path('tests/movement198.mjs'),
    'save': Path('tests/save-load200.mjs'),
    'user201': Path('tests/user-fixes201.mjs'),
    'user200': Path('tests/user-fixes200.mjs'),
    'worker': Path('tests/worker-recovery201.mjs'),
    'power': Path('tests/recon-energy202.mjs'),
    'fog_queue': Path('tests/recon-memory-queue203.mjs'),
}
for name, path in sources.items():
    if not path.exists():
        raise RuntimeError(f'build {BUILD} test source missing ({name}): {path}')

reliability = sources['reliability'].read_text('utf-8')
reliability = reliability.replace('?build=199', f'?build={BUILD}')
reliability = reliability.replace('__FD_RUNTIME_SHELL_199__', SHELL)
reliability = reliability.replace(
    f'{SHELL}?.build === 199',
    f'{SHELL}?.build === {BUILD}',
)
reliability = reliability.replace("gate: 'save-load199'", f"gate: 'save-load{BUILD}'")
if f'{SHELL}?.build === {BUILD}' not in reliability:
    raise RuntimeError(f'build {BUILD} reliability runtime marker missing')
Path(f'tests/reliability{BUILD}.generated.mjs').write_text(reliability, 'utf-8')

movement = sources['movement'].read_text('utf-8').replace('198', str(BUILD))
if f'{SHELL}?.build === {BUILD}' not in movement:
    raise RuntimeError(f'build {BUILD} movement runtime marker missing')
Path(f'tests/movement{BUILD}.generated.mjs').write_text(movement, 'utf-8')

save_load = sources['save'].read_text('utf-8')
save_load = save_load.replace('?build=200', f'?build={BUILD}')
save_load = save_load.replace('__FD_RUNTIME_SHELL_200__', SHELL)
save_load = save_load.replace(f'{SHELL}?.build === 200', f'{SHELL}?.build === {BUILD}')
save_load = save_load.replace('save-load200', f'save-load{BUILD}')
if f'{SHELL}?.build === {BUILD}' not in save_load or '__FD_SIMULATION_RESILIENCE_200__' not in save_load:
    raise RuntimeError(f'build {BUILD} save/load markers missing')
Path(f'tests/save-load{BUILD}.generated.mjs').write_text(save_load, 'utf-8')

user201 = sources['user201'].read_text('utf-8')
user201 = user201.replace('?build=201', f'?build={BUILD}')
user201 = user201.replace('__FD_RUNTIME_SHELL_201__', SHELL)
user201 = user201.replace(f'{SHELL}?.build === 201', f'{SHELL}?.build === {BUILD}')
if f'{SHELL}?.build === {BUILD}' not in user201 or '__FD_GROUP_MOVEMENT_201__' not in user201:
    raise RuntimeError(f'build {BUILD} selection/group markers missing')
Path(f'tests/user-fixes{BUILD}.generated.mjs').write_text(user201, 'utf-8')

user200 = sources['user200'].read_text('utf-8')
user200 = user200.replace('?build=200', f'?build={BUILD}')
user200 = user200.replace('__FD_RUNTIME_SHELL_200__', SHELL)
user200 = user200.replace(f'{SHELL}?.build === 200', f'{SHELL}?.build === {BUILD}')
if f'{SHELL}?.build === {BUILD}' not in user200 or '__FD_SIMULATION_RESILIENCE_200__' not in user200:
    raise RuntimeError(f'build {BUILD} finite recon markers missing')
Path(f'tests/user-fixes{BUILD}-recon.generated.mjs').write_text(user200, 'utf-8')

worker = sources['worker'].read_text('utf-8')
worker = worker.replace('?build=201', f'?build={BUILD}')
worker = worker.replace('__FD_RUNTIME_SHELL_201__', SHELL)
worker = worker.replace(f'{SHELL}?.build === 201', f'{SHELL}?.build === {BUILD}')
if f'{SHELL}?.build === {BUILD}' not in worker or 'recoveryAttempts201' not in worker:
    raise RuntimeError(f'build {BUILD} Worker recovery markers missing')
Path(f'tests/worker-recovery{BUILD}.generated.mjs').write_text(worker, 'utf-8')

power = sources['power'].read_text('utf-8')
power = power.replace('?build=202', f'?build={BUILD}')
power = power.replace('__FD_RUNTIME_SHELL_202__', SHELL)
power = power.replace(f'{SHELL}?.build === 202', f'{SHELL}?.build === {BUILD}')
if f'{SHELL}?.build === {BUILD}' not in power or '__FD_COMMAND_POWER_AUTHORITY_202__?.build === 202' not in power:
    raise RuntimeError(f'build {BUILD} recon-energy markers missing')
Path(f'tests/recon-energy{BUILD}.generated.mjs').write_text(power, 'utf-8')

fog_queue = sources['fog_queue'].read_text('utf-8')
fog_queue = fog_queue.replace('?build=203', f'?build={BUILD}')
fog_queue = fog_queue.replace('__FD_RUNTIME_SHELL_203__', SHELL)
fog_queue = fog_queue.replace(f'{SHELL}?.build === 203', f'{SHELL}?.build === {BUILD}')
if f'{SHELL}?.build === {BUILD}' not in fog_queue or '__FD_RECON_MEMORY_QUEUE_203__?.build === 203' not in fog_queue:
    raise RuntimeError(f'build {BUILD} fog-memory/queue markers missing')
Path(f'tests/recon-memory-queue{BUILD}.generated.mjs').write_text(fog_queue, 'utf-8')

print(f'Build {BUILD} reliability, movement, save/load, power and Worker browser gates generated')
