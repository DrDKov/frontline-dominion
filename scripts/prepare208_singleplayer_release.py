from pathlib import Path

BUILD=208
VERSION='16.9.2'
OUT=Path('dist')
INDEX=OUT/'index.html'
GAME=OUT/'frontline-dominion.html'
MP=OUT/'multiplayer.html'
for path in (INDEX,GAME,MP):
    if not path.exists(): raise RuntimeError(f'build 208 release target missing: {path}')

INDEX.write_text(f'''<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="color-scheme" content="dark"><title>Frontline Dominion v{VERSION}</title><style>*{{box-sizing:border-box}}html,body{{margin:0;min-height:100%;background:#050b10;color:#dcecf4;font-family:system-ui,sans-serif}}body{{display:grid;place-items:center;min-height:100vh;padding:24px;background:#071019}}main{{width:min(680px,100%);padding:36px;border:1px solid #365363;border-radius:18px;background:#0a151d}}a{{display:inline-flex;min-height:52px;align-items:center;padding:0 22px;border-radius:8px;background:#d9edf7;color:#071019;text-decoration:none;font-weight:900}}.note{{margin-top:18px;color:#9fb5c1;line-height:1.45}}</style></head><body><main data-fd-canonical-build="{BUILD}" data-fd-release-mode="singleplayer"><h1>Frontline Dominion</h1><p>Рабочая однопользовательская версия build {BUILD}.</p><a id="launch" href="./frontline-dominion.html?build={BUILD}">Одиночная игра</a><p class="note">Build 208: привязанные ресурсные грузовики производственных зданий, ручная логистика инженеров, Supply Building/Area/Group, денежный доход добычи и исправленное строительство инженерами.</p><p>v{VERSION} · build {BUILD}</p></main></body></html>''','utf-8')

MP.write_text(f'''<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="color-scheme" content="dark"><title>Frontline Dominion · мультиплеер в разработке</title><style>*{{box-sizing:border-box}}html,body{{margin:0;min-height:100%;background:#071019;color:#dcecf4;font-family:system-ui,sans-serif}}body{{display:grid;place-items:center;min-height:100vh;padding:24px}}main{{width:min(680px,100%);padding:36px;border:1px solid #365363;border-radius:18px;background:#0a151d}}a{{display:inline-flex;min-height:48px;align-items:center;padding:0 20px;border-radius:8px;background:#d9edf7;color:#071019;text-decoration:none;font-weight:900}}</style></head><body><main data-fd-canonical-build="{BUILD}" data-fd-multiplayer-status="deferred"><h1>Сетевая игра пока недоступна</h1><p>Build {BUILD} публикуется как проверенная однопользовательская версия. Сетевой режим остаётся на отдельном цикле детерминированной синхронизации.</p><a href="./frontline-dominion.html?build={BUILD}">Перейти в одиночную игру</a></main></body></html>''','utf-8')

game=GAME.read_text('utf-8')
marker='fd-singleplayer-release-208'
if marker not in game:
    if '</head>' not in game or '</body>' not in game: raise RuntimeError('build 208 release HTML anchors missing')
    game=game.replace('</head>',f'<style id="{marker}">[data-action="multiplayer-game"]{{display:none!important}}</style></head>',1)
    guard='''<script id="fd-singleplayer-release-208-guard">(()=>{const disable=()=>{for(const el of document.querySelectorAll('[data-action="multiplayer-game"]')){el.hidden=true;el.setAttribute('aria-disabled','true');el.style.display='none';}};disable();document.addEventListener('DOMContentLoaded',disable,{once:true});new MutationObserver(disable).observe(document.documentElement,{subtree:true,childList:true});document.addEventListener('click',event=>{const target=event.target?.closest?.('[data-action="multiplayer-game"]');if(target){event.preventDefault();event.stopImmediatePropagation();}},true);})();</script>'''
    game=game.replace('</body>',guard+'</body>',1)
GAME.write_text(game,'utf-8')

required = {
    'gameplay-v208.js?build=208': GAME,
    'logistics-ui-v208.js?build=208': GAME,
    'runtime-ui-v208.js?build=208': GAME,
    'runtime-shell-v208.js?build=208': GAME,
    'save-slots-v208.js?build=208': GAME,
}
final=GAME.read_text('utf-8')
for marker_text in required:
    if marker_text not in final: raise RuntimeError(f'build 208 release owner missing: {marker_text}')
if 'data-fd-canonical-build="208"' not in final: raise RuntimeError('build 208 canonical marker missing')
print('Build 208 public package prepared in single-player mode')
