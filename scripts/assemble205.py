from pathlib import Path
import re

ROOT = Path('.')
OUT = ROOT / 'dist'
BUILD = 205
VERSION = '16.8.21'

html_path = OUT / 'frontline-dominion.html'
bridge_path = OUT / 'authoritative-simulation-v174.js'
worker_path = OUT / 'authoritative-simulation-worker-v174.js'
ui204_path = OUT / 'runtime-ui-v204.js'
shell204_path = OUT / 'runtime-shell-v204.js'
profiler_path = OUT / 'simulation-profiler-v166.js'
multiplayer_game_path = OUT / 'multiplayer-game-v96.js'
save_source = ROOT / 'src' / 'v205' / 'save-slots-v205.js'
lobby_source = ROOT / 'src' / 'v205' / 'multiplayer-lobby-v205.js'
save_path = OUT / save_source.name
lobby_path = OUT / lobby_source.name

for path in [
    html_path, bridge_path, worker_path, ui204_path, shell204_path,
    profiler_path, multiplayer_game_path, save_source, lobby_source,
]:
    if not path.exists():
        raise RuntimeError(f'build {BUILD} required file missing: {path}')

save_path.write_text(save_source.read_text('utf-8'), 'utf-8')
lobby_path.write_text(lobby_source.read_text('utf-8'), 'utf-8')

ui = ui204_path.read_text('utf-8')
ui = re.sub(r"const VERSION = '16\.8\.[0-9]+';", f"const VERSION = '{VERSION}';", ui, count=1)
ui = re.sub(r'const BUILD = \d+;', f'const BUILD = {BUILD};', ui, count=1)
ui = ui.replace('__FD_RUNTIME_UI_204__', '__FD_RUNTIME_UI_205__').replace('[FD204]', '[FD205]')
(OUT / 'runtime-ui-v205.js').write_text(ui, 'utf-8')

shell = shell204_path.read_text('utf-8')
shell = re.sub(r"const VERSION = '16\.8\.[0-9]+';", f"const VERSION = '{VERSION}';", shell, count=1)
shell = re.sub(r'const BUILD = \d+;', f'const BUILD = {BUILD};', shell, count=1)
shell = shell.replace('__FD_RUNTIME_SHELL_204__', '__FD_RUNTIME_SHELL_205__')
shell = shell.replace('__FD_BOOT_204__', '__FD_BOOT_205__').replace('[FD204]', '[FD205]')
shell = shell.replace('fd-loading204', 'fd-loading205').replace('fd-ready204', 'fd-ready205').replace('fd-running204', 'fd-running205')
(OUT / 'runtime-shell-v205.js').write_text(shell, 'utf-8')

bridge = bridge_path.read_text('utf-8')
bridge = re.sub(r'const BUILD = \d+;', f'const BUILD = {BUILD};', bridge, count=1)
bridge = re.sub(r"const VERSION = '16\.8\.[0-9]+';", f"const VERSION = '{VERSION}';", bridge, count=1)
bridge = re.sub(
    r"new Worker\('/frontline-dominion/authoritative-simulation-worker-v174\.js\?build=\d+'\)",
    f"new Worker('/frontline-dominion/authoritative-simulation-worker-v174.js?build={BUILD}')",
    bridge,
    count=1,
)
request_save_old = """  requestSave(notify = true) {
    if (!this.worker || this.failed) return false;
    const requestId = requestCounter++;
    this.pendingSaves.set(requestId, { notify, requestedAt: performance.now() });
    this.worker.postMessage({ type: 'saveRequest', requestId, notify });
    return true;
  }
"""
request_save_new = """  requestSave(notify = true) {
    if (!this.worker || this.failed) return false;
    const requestId = requestCounter++;
    this.pendingSaves.set(requestId, { notify, requestedAt: performance.now() });
    this.worker.postMessage({ type: 'saveRequest', requestId, notify });
    return requestId;
  }
"""
if bridge.count(request_save_old) != 1:
    raise RuntimeError('build 205 authoritative save request anchor missing')
bridge = bridge.replace(request_save_old, request_save_new, 1)

save_write_old = """      D.storageSet(D.SAVE_KEY, JSON.stringify(data));
      const load = document.querySelector('#load-game');
"""
save_write_new = """      const serialized205 = JSON.stringify(data);
      D.storageSet(D.SAVE_KEY, serialized205);
      window.dispatchEvent(new CustomEvent('fd:authoritative-save205', { detail: {
        requestId: Number(message.requestId) || 0,
        notify: Boolean(message.notify),
        data,
        raw: serialized205,
        tick: Number(data.authoritative172?.simTick ?? data.simTick ?? 0) || 0
      } }));
      const load = document.querySelector('#load-game');
"""
if bridge.count(save_write_old) != 1:
    raise RuntimeError('build 205 authoritative save publication anchor missing')
bridge = bridge.replace(save_write_old, save_write_new, 1)
bridge_path.write_text(bridge, 'utf-8')

for path in (worker_path, profiler_path):
    text = path.read_text('utf-8')
    text = re.sub(r'const BUILD = \d+;', f'const BUILD = {BUILD};', text, count=1)
    text = re.sub(r"const VERSION = '16\.8\.[0-9]+';", f"const VERSION = '{VERSION}';", text, count=1)
    text = re.sub(
        r'authoritative-simulation-worker-v174\.js\?build=\d+',
        f'authoritative-simulation-worker-v174.js?build={BUILD}',
        text,
    )
    text = re.sub(r"version: '16\.8\.[0-9]+', build: \d+", f"version: '{VERSION}', build: {BUILD}", text)
    path.write_text(text, 'utf-8')

worker = worker_path.read_text('utf-8')
worker_diag_old = """        paused, running, manualMode, stateHash: stateHash(true), subsystemHashes: subsystemHashes(true), networkHash: networkStateHash(true), multiplayer: { ...multiplayer },
        counts: game ? { units: game.units.length, buildings: game.buildings.length, resources: game.resources.length, projectiles: game.projectiles.length } : null,
"""
worker_diag_new = """        paused, running, manualMode, stateHash: stateHash(true), subsystemHashes: subsystemHashes(true), networkHash: networkStateHash(true), multiplayer: { ...multiplayer },
        aiEnabled: !(multiplayer.active && multiplayer.mode === 'versus'),
        counts: game ? { units: game.units.length, buildings: game.buildings.length, resources: game.resources.length, projectiles: game.projectiles.length } : null,
"""
if worker.count(worker_diag_old) != 1:
    raise RuntimeError('build 205 multiplayer Worker diagnostics anchor missing')
worker_path.write_text(worker.replace(worker_diag_old, worker_diag_new, 1), 'utf-8')

multiplayer_game = multiplayer_game_path.read_text('utf-8')
multiplayer_game = multiplayer_game.replace("version: '10.0'", "version: '10.1'")
multiplayer_game = multiplayer_game.replace("dataset.fdMultiplayerReady = '10.0'", "dataset.fdMultiplayerReady = '10.1'")
multiplayer_game = multiplayer_game.replace("send('fd:mp-ready', { version: '10.1' })", "send('fd:mp-ready', { version: '10.1', build: 205 })")

multiplayer_snapshot_old = """  function makeSnapshot(target, requestId) {
    const game = debug.game;
    if (!game || state.role !== 'host') return;
    game.save(false);
    const data = JSON.parse(debug.storageGet(debug.SAVE_KEY));
    data.__mp = {
      simTick: game.simTick || 0,
      rngSeed: game.rng?.seed || game.seed,
      mode: state.mode,
      hostFaction: state.config?.hostFaction || state.config?.faction,
      guestFaction: state.config?.guestFaction,
      appliedSeq: state.lastAppliedSeq,
      projectiles: game.projectiles.filter((item) => item.alive).map(projectileSnapshot)
    };
    send('fd:mp-snapshot', { target, requestId, baseSeq: state.lastAppliedSeq, snapshot: data });
  }
"""
multiplayer_snapshot_new = """  function makeSnapshot(target, requestId) {
    const game = debug.game;
    const bridge = window.__FD_STABLE_STATE165__?.bridge;
    if (!game || state.role !== 'host' || !bridge?.ready || bridge.failed) return;

    let workerRequestId = 0;
    let timeout = 0;
    const finish = (event) => {
      const detail = event?.detail || {};
      if (!workerRequestId || Number(detail.requestId) !== workerRequestId) return;
      clearTimeout(timeout);
      window.removeEventListener('fd:authoritative-save205', finish);
      const data = detail.data || (detail.raw ? JSON.parse(detail.raw) : null);
      if (!data) return;
      data.__mp = {
        simTick: Number(data.authoritative172?.simTick ?? detail.tick ?? 0) || 0,
        rngSeed: Number(data.authoritative172?.rngSeed ?? game.rng?.seed ?? game.seed) || 0,
        mode: state.mode,
        hostFaction: state.config?.hostFaction || state.config?.faction,
        guestFaction: state.config?.guestFaction,
        appliedSeq: state.lastAppliedSeq,
        projectiles: Array.isArray(data.authoritative172?.projectiles)
          ? data.authoritative172.projectiles
          : game.projectiles.filter((item) => item.alive).map(projectileSnapshot)
      };
      send('fd:mp-snapshot', { target, requestId, baseSeq: state.lastAppliedSeq, snapshot: data });
    };
    window.addEventListener('fd:authoritative-save205', finish);
    workerRequestId = bridge.requestSave(false);
    if (!Number.isInteger(workerRequestId) || workerRequestId < 1) {
      window.removeEventListener('fd:authoritative-save205', finish);
      requestResync('Simulation Worker не подготовил снимок');
      return;
    }
    timeout = window.setTimeout(() => {
      window.removeEventListener('fd:authoritative-save205', finish);
      console.error('[FD multiplayer] authoritative resync snapshot timed out');
    }, 7000);
  }
"""
if multiplayer_game.count(multiplayer_snapshot_old) != 1:
    raise RuntimeError('build 205 multiplayer snapshot anchor missing')
multiplayer_game = multiplayer_game.replace(multiplayer_snapshot_old, multiplayer_snapshot_new, 1)
multiplayer_game_path.write_text(multiplayer_game, 'utf-8')

asset_pattern = re.compile(r"(/frontline-dominion/[^\s\'\"`)]+\.(?:js|json|webp))\?build=\d+")
for path in sorted(OUT.glob('*.js')):
    text = path.read_text('utf-8')
    text = asset_pattern.sub(rf'\1?build={BUILD}', text)
    path.write_text(text, 'utf-8')

html = html_path.read_text('utf-8')
html = re.sub(
    r'\s*<script\b[^>]*src=["\'](?:\./|/frontline-dominion/)(?:runtime-ui-v(?:204|205)|runtime-shell-v(?:204|205)|save-slots-v205)\.js(?:\?build=\d+)?["\'][^>]*></script>',
    '',
    html,
    flags=re.I,
)
html = html.replace('fd-boot204-script', 'fd-boot205-script').replace('fd-boot204-style', 'fd-boot205-style')
html = html.replace('__FD_BOOT_204__', '__FD_BOOT_205__')
html = html.replace('fd-loading204', 'fd-loading205').replace('fd-ready204', 'fd-ready205').replace('fd-running204', 'fd-running205')
html = re.sub(r"const FEATURES = \[.*?\];", "const FEATURES = [];", html, count=1)
html = re.sub(
    r"if \(lead\) lead\.textContent = '.*?';",
    "if (lead) lead.textContent = 'Выберите сторону и сложность операции.';",
    html,
    count=1,
)
html = re.sub(r"const VERSION = '16\.8\.[0-9]+', BUILD = \d+;", f"const VERSION = '{VERSION}', BUILD = {BUILD};", html, count=1)
html = re.sub(r'data-fd-canonical-build="\d+"', f'data-fd-canonical-build="{BUILD}"', html)
html = re.sub(r'<title>.*?</title>', f'<title>Frontline Dominion v{VERSION} — Save Slots &amp; Multiplayer</title>', html, count=1, flags=re.S)
html = re.sub(
    r'ОПЕРАТИВНО-ТАКТИЧЕСКАЯ RTS · v16\.8\.\d+ BUILD \d+',
    f'ОПЕРАТИВНО-ТАКТИЧЕСКАЯ RTS · BUILD {BUILD}',
    html,
    count=1,
)
html = re.sub(
    r'<p class=["\']lead["\']>.*?</p>',
    '<p class="lead">Выберите сторону и сложность операции.</p>',
    html,
    count=1,
    flags=re.S,
)
html = re.sub(
    r'\s*<div class=["\']feature-strip["\'][^>]*>.*?</div>',
    '',
    html,
    count=1,
    flags=re.S,
)
html = re.sub(
    r'(<div id=["\']start-screen["\'][^>]*)(>)',
    rf'\1 data-fd-canonical-build="{BUILD}"\2',
    html,
    count=1,
)

load_button = '<button id="load-game" class="secondary-button" type="button">ЗАГРУЗИТЬ СОХРАНЕНИЕ</button>'
multiplayer_button = '<button id="multiplayer-game" class="secondary-button" type="button">СЕТЕВАЯ ИГРА</button>'
html = html.replace(multiplayer_button, '')
if html.count(load_button) != 1:
    raise RuntimeError(f'build 205 load button anchor invalid: {html.count(load_button)}')
html = html.replace(load_button, load_button + '\n              ' + multiplayer_button, 1)


def cache_bust(match):
    return f'{match.group(1)}?build={BUILD}{match.group(2)}'


html = re.sub(
    r'(<script\b[^>]*\bsrc=["\'](?:\./|/frontline-dominion/)[^"\']+\.js)(?:\?build=\d+)?(["\'][^>]*></script>)',
    cache_bust,
    html,
    flags=re.I,
)

recon_tag = f'<script src="./recon-memory-production-v203.js?build={BUILD}"></script>'
if html.count(recon_tag) != 1:
    raise RuntimeError(f'build 205 recon HTML anchor invalid: {html.count(recon_tag)}')
html = html.replace(recon_tag, recon_tag + f'\n<script src="./runtime-ui-v205.js?build={BUILD}"></script>', 1)

runtime_tags = (
    f'<script src="./runtime-shell-v205.js?build={BUILD}"></script>\n'
    f'<script src="./save-slots-v205.js?build={BUILD}"></script>'
)
html = html.replace('</body>', runtime_tags + '\n</body>', 1)
html_path.write_text(html, 'utf-8')

for path in sorted(OUT.glob('*.js')):
    text = path.read_text('utf-8')
    text = asset_pattern.sub(rf'\1?build={BUILD}', text)
    path.write_text(text, 'utf-8')

multiplayer_html = f'''<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="color-scheme" content="dark">
  <title>Frontline Dominion — Сетевая игра</title>
  <style>
    *{{box-sizing:border-box}}html,body{{margin:0;min-height:100%;background:#040a08;color:#dfece5;font-family:Inter,ui-sans-serif,system-ui,sans-serif}}button,input,select,textarea{{font:inherit}}
    body{{min-height:100vh;background:radial-gradient(circle at 50% 0,#163527 0,#08120e 42%,#030705 82%)}}
    .hidden{{display:none!important}}#mp-lobby205{{min-height:100vh;display:grid;place-items:center;padding:28px}}
    .lobby-card{{width:min(980px,100%);padding:30px;border:1px solid rgba(125,205,158,.28);border-radius:12px;background:rgba(6,15,11,.94);box-shadow:0 28px 100px rgba(0,0,0,.55)}}
    .top{{display:flex;justify-content:space-between;gap:20px;align-items:flex-start;margin-bottom:25px}}.eyebrow{{font:900 10px/1.3 system-ui;letter-spacing:.15em;color:#78b991}}h1{{margin:7px 0 5px;font-size:clamp(30px,5vw,54px);letter-spacing:-.045em}}.sub{{margin:0;color:#89a397;line-height:1.55}}
    .back{{min-height:40px;padding:0 13px;border:1px solid #324a3e;border-radius:5px;background:#0b1712;color:#cfe0d7;cursor:pointer}}
    .role-grid{{display:grid;grid-template-columns:1fr 1fr;gap:13px}}.role{{padding:23px;border:1px solid #2e463a;border-radius:8px;background:#0b1812;color:#dceae2;text-align:left;cursor:pointer}}.role:hover{{border-color:#72c898;background:#102219}}.role strong{{display:block;margin-bottom:7px;font-size:18px}}.role span{{color:#819c8d;line-height:1.5}}
    .panel{{display:grid;gap:17px}}.status-row{{display:flex;flex-wrap:wrap;gap:8px 18px;padding:12px;border:1px solid #263a31;border-radius:6px;background:#08120e;color:#799386;font:800 10px/1.3 system-ui;letter-spacing:.08em}}.status-row b{{color:#b9d9c7}}
    .settings{{display:grid;grid-template-columns:repeat(4,minmax(130px,1fr));gap:10px}}label{{display:grid;gap:6px;color:#799486;font:800 10px/1.3 system-ui;letter-spacing:.08em}}select,input,textarea{{border:1px solid #30483c;border-radius:5px;background:#07100c;color:#dfebe4;outline:none}}select,input{{min-height:42px;padding:0 11px}}textarea{{width:100%;min-height:102px;padding:10px;resize:vertical;font:600 10px/1.35 ui-monospace,monospace;word-break:break-all}}select:focus,input:focus,textarea:focus{{border-color:#72c898}}
    .step{{display:grid;gap:9px;padding:15px;border:1px solid #293e34;border-radius:7px;background:#091510}}.step h3{{margin:0;font-size:14px}}.step p{{margin:0;color:#819b8e;font-size:12px;line-height:1.5}}
    .actions{{display:flex;flex-wrap:wrap;gap:9px}}.actions button,#mp-start205{{min-height:43px;padding:0 15px;border:1px solid #3a5c4b;border-radius:5px;background:#11261b;color:#dfede5;font:900 10px system-ui;letter-spacing:.07em;cursor:pointer}}.actions button.primary,#mp-start205{{border-color:#bee7cc;background:#bee7cc;color:#07110b}}button:disabled{{opacity:.38;cursor:not-allowed}}
    details{{border:1px solid #24382f;border-radius:6px;padding:11px}}summary{{cursor:pointer;color:#829c8f;font-size:12px}}.turn{{display:grid;grid-template-columns:2fr 1fr 1fr;gap:9px;margin-top:10px}}#mp-error205{{padding:11px;border:1px solid #6b3935;border-radius:6px;background:#26110f;color:#edb4ad;font-size:12px}}
    #mp-game-shell205{{position:fixed;inset:0;background:#000}}#mp-game-frame205{{width:100%;height:100%;border:0;display:block}}#mp-network-hud205{{position:fixed;z-index:80;left:50%;top:10px;transform:translateX(-50%);display:flex;gap:10px;align-items:center;padding:7px 11px;border:1px solid rgba(104,198,144,.38);border-radius:5px;background:rgba(5,13,9,.84);backdrop-filter:blur(8px);color:#bddac9;font:800 9px/1.2 system-ui;letter-spacing:.08em;pointer-events:none}}#mp-network-hud205 i{{width:7px;height:7px;border-radius:50%;background:#6bd495;box-shadow:0 0 11px #6bd495}}
    @media(max-width:760px){{#mp-lobby205{{padding:12px}}.lobby-card{{padding:19px}}.role-grid,.settings{{grid-template-columns:1fr}}.turn{{grid-template-columns:1fr}}.top{{display:grid}}}}
  </style>
</head>
<body data-fd-canonical-build="{BUILD}">
  <main id="mp-lobby205">
    <section class="lobby-card">
      <div class="top"><div><div class="eyebrow">СЕТЕВАЯ ОПЕРАЦИЯ · BUILD {BUILD} · <span id="mp-role-label205">ВЫБОР РОЛИ</span></div><h1>FRONTLINE DOMINION</h1><p class="sub">Два компьютера выполняют одну детерминированную симуляцию 25 Гц. По сети передаются только приказы и контрольные суммы; полный снимок — только при пересинхронизации.</p></div><button class="back" id="mp-back205" type="button">В ОСНОВНОЕ МЕНЮ</button></div>
      <div id="mp-error205" class="hidden"></div>
      <div id="mp-role-choice205" class="role-grid">
        <button class="role" id="mp-host-role205" type="button"><strong>Создать игру</strong><span>Вы выбираете режим и отправляете код соединения второму игроку.</span></button>
        <button class="role" id="mp-guest-role205" type="button"><strong>Подключиться</strong><span>Вставьте код ведущего и верните ему ответный код.</span></button>
      </div>
      <div id="mp-live-status205" class="status-row hidden"><span>КОМНАТА <b id="mp-room-code205">—</b></span><span>СВЯЗЬ <b id="mp-connection-state205">NEW</b></span><span>ЗАДЕРЖКА <b id="mp-latency205">—</b></span><span>ТИКИ <b id="mp-ticks205">—</b></span><span>СОСТОЯНИЕ <b id="mp-sync205">ОЖИДАНИЕ</b></span></div>
      <section id="mp-host-panel205" class="panel hidden">
        <div class="settings"><label>РЕЖИМ<select id="mp-mode205"><option value="coop">Кооператив против ИИ</option><option value="versus">Противостояние 1×1</option></select></label><label>ВАША ФРАКЦИЯ<select id="mp-host-faction205"><option value="vanguard">Авангард</option><option value="dominion">Доминион</option><option value="specter">Спектр</option></select></label><label>ВТОРАЯ СТОРОНА<select id="mp-enemy-faction205"><option value="dominion">Доминион</option><option value="vanguard">Авангард</option><option value="specter">Спектр</option></select></label><label>СЛОЖНОСТЬ ИИ<select id="mp-difficulty205"><option value="easy">Легко</option><option value="normal" selected>Нормально</option><option value="hard">Сложно</option></select></label></div>
        <p class="sub" id="mp-mode-help205">Два игрока командуют общей армией против ИИ.</p>
        <div class="step"><h3>1. Создайте код ведущего</h3><p>Отправьте полученный код второму игроку любым мессенджером.</p><div class="actions"><button class="primary" id="mp-create-offer205" type="button">СОЗДАТЬ КОД</button><button id="mp-copy-offer205" type="button">КОПИРОВАТЬ</button></div><textarea id="mp-offer-output205" readonly aria-label="Код ведущего"></textarea></div>
        <div class="step hidden" id="mp-host-step2205"><h3>2. Вставьте ответ второго игрока</h3><textarea id="mp-answer-input205" aria-label="Ответ второго игрока"></textarea><div class="actions"><button class="primary" id="mp-accept-answer205" type="button">УСТАНОВИТЬ СОЕДИНЕНИЕ</button><button id="mp-start205" type="button" disabled>НАЧАТЬ СЕТЕВУЮ ИГРУ</button></div></div>
        <details><summary>Сложная корпоративная сеть: необязательный TURN‑сервер</summary><div class="turn"><input id="mp-host-turn-url205" placeholder="turn:server:3478"><input id="mp-host-turn-user205" placeholder="Логин"><input id="mp-host-turn-password205" type="password" placeholder="Пароль"></div></details>
      </section>
      <section id="mp-guest-panel205" class="panel hidden">
        <div class="step"><h3>1. Вставьте код ведущего</h3><textarea id="mp-offer-input205" aria-label="Код ведущего"></textarea><div class="actions"><button class="primary" id="mp-accept-offer205" type="button">СОЗДАТЬ ОТВЕТ</button></div></div>
        <div class="step hidden" id="mp-guest-step2205"><h3>2. Верните этот ответ ведущему</h3><textarea id="mp-answer-output205" readonly aria-label="Ответ ведущему"></textarea><div class="actions"><button id="mp-copy-answer205" type="button">КОПИРОВАТЬ ОТВЕТ</button></div><p>После подтверждения ведущий запускает матч одновременно на обоих компьютерах.</p></div>
        <details><summary>Сложная корпоративная сеть: необязательный TURN‑сервер</summary><div class="turn"><input id="mp-guest-turn-url205" placeholder="turn:server:3478"><input id="mp-guest-turn-user205" placeholder="Логин"><input id="mp-guest-turn-password205" type="password" placeholder="Пароль"></div></details>
      </section>
      <div class="actions" style="margin-top:16px"><button id="mp-reset205" type="button">СБРОСИТЬ СОЕДИНЕНИЕ</button></div>
    </section>
  </main>
  <section id="mp-game-shell205" class="hidden"><iframe id="mp-game-frame205" src="./frontline-dominion.html?build={BUILD}&amp;multiplayer=1" allow="fullscreen" title="Frontline Dominion multiplayer"></iframe></section>
  <div id="mp-network-hud205" class="hidden"><i></i><span>СЕТЕВАЯ ИГРА</span><span id="mp-hud-latency205">—</span><span id="mp-hud-sync205">ОЖИДАНИЕ</span></div>
  <script src="./multiplayer-lobby-v205.js?build={BUILD}"></script>
</body>
</html>'''
(OUT / 'multiplayer.html').write_text(multiplayer_html, 'utf-8')

launcher = f'''<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="color-scheme" content="dark"><title>Frontline Dominion v{VERSION}</title><style>*{{box-sizing:border-box}}html,body{{margin:0;min-height:100%;background:#050b10;color:#dcecf4;font-family:system-ui,sans-serif}}body{{display:grid;place-items:center;min-height:100vh;padding:24px;background:#071019}}main{{width:min(660px,100%);padding:36px;border:1px solid #365363;border-radius:18px;background:#0a151d}}a{{display:inline-flex;min-height:52px;align-items:center;padding:0 22px;margin:8px 8px 0 0;border-radius:8px;background:#d9edf7;color:#071019;text-decoration:none;font-weight:900}}a.secondary{{border:1px solid #466757;background:#102018;color:#d9eee2}}</style></head><body><main data-fd-canonical-build="{BUILD}"><h1>Frontline Dominion</h1><p>Выберите одиночную или сетевую операцию.</p><a id="launch" href="./frontline-dominion.html?build={BUILD}">Одиночная игра</a><a class="secondary" href="./multiplayer.html?build={BUILD}">Сетевая игра</a><p>v{VERSION} · build {BUILD}</p></main></body></html>'''
(OUT / 'index.html').write_text(launcher, 'utf-8')

final_html = html_path.read_text('utf-8')
required = [
    f'building-visible-hit-v204.js?build={BUILD}',
    f'rally-point-authority-v204.js?build={BUILD}',
    f'runtime-ui-v205.js?build={BUILD}',
    f'runtime-shell-v205.js?build={BUILD}',
    f'save-slots-v205.js?build={BUILD}',
]
for item in required:
    if final_html.count(item) != 1:
        raise RuntimeError(f'build 205 owner count invalid: {item}')
if 'runtime-shell-v204.js?build=205' in final_html or 'runtime-ui-v204.js?build=205' in final_html:
    raise RuntimeError('build 205 still loads obsolete runtime owner')
if 'feature-strip' in final_html[final_html.find('<div id="start-screen"'):final_html.find('<div id="pause-screen"')]:
    raise RuntimeError('build 205 start screen still contains feature strip')
if final_html.find('id="load-game"') > final_html.find('id="multiplayer-game"'):
    raise RuntimeError('build 205 multiplayer button is not below load')
bridge_final = bridge_path.read_text('utf-8')
if "dispatchEvent(new CustomEvent('fd:authoritative-save205'" not in bridge_final or 'return requestId;' not in bridge_final:
    raise RuntimeError('build 205 exact Worker save publication missing')

print(f'Frontline Dominion v{VERSION} build {BUILD} save slots and multiplayer assembled')
