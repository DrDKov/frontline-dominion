from pathlib import Path
import re

ROOT = Path('.')
OUT = ROOT / 'dist'
VERSION = '16.8.6'
BUILD = 190


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise RuntimeError(f'build 190 patch anchor missing: {label}')
    return text.replace(old, new, 1)


for source_name in ('runtime-stability-v190.js', 'runtime-shell-v190.js'):
    source = ROOT / 'src' / 'v190' / source_name
    if not source.exists():
        raise RuntimeError(f'build 190 source missing: {source}')
    (OUT / source_name).write_text(source.read_text('utf-8'), 'utf-8')

ui189_path = OUT / 'runtime-ui-v189.js'
if not ui189_path.exists():
    raise RuntimeError('build 189 runtime UI missing before build 190 patch')
ui190 = ui189_path.read_text('utf-8')
ui190 = ui190.replace("const VERSION = '16.8.5';", "const VERSION = '16.8.6';", 1)
ui190 = ui190.replace('const BUILD = 189;', 'const BUILD = 190;', 1)
ui190 = ui190.replace('__FD_RUNTIME_UI_189__', '__FD_RUNTIME_UI_190__')
ui190 = ui190.replace('[FD189]', '[FD190]')
(OUT / 'runtime-ui-v190.js').write_text(ui190, 'utf-8')

# ---------------------------------------------------------------------------
# One engineer size owner: rocket-equivalent geometry and presentation.
# Remove the build 189 rifle-copy layer and the historical 2.85 renderer branch.
# ---------------------------------------------------------------------------
model_path = OUT / 'model-pilot-v101.js'
model = model_path.read_text('utf-8')
model = model.replace("const VERSION = '12.4';", "const VERSION = '12.5';", 1)
model = re.sub(
    r"const MANIFEST_URL = '/frontline-dominion/models/pilot/manifest\.json\?build=\d+';",
    f"const MANIFEST_URL = '/frontline-dominion/models/pilot/manifest.json?build={BUILD}';",
    model,
    count=1,
)
model = replace_once(model, '  const ENGINEER_DISPLAY_SCALE = 2.85;\n', '  const ENGINEER_DISPLAY_SCALE = 1;\n', 'model engineer legacy scale')
model = replace_once(model, "    if (unit.typeId === 'worker') return ENGINEER_DISPLAY_SCALE;\n", '', 'model engineer legacy branch')

old_unit_geometry = """    const displayScale = infantryDisplayScale(game, unit, worldWidth, cellAspect);
    // Pure world-space sizing: zoom is the only screen conversion and there
    // is deliberately no minimum pixel height.
    const targetWidth = worldWidth * (game.camera.zoom || 1) * 1.34 * displayScale;
    const targetHeight = targetWidth * cellAspect;"""
new_unit_geometry = """    const displayScale = infantryDisplayScale(game, unit, worldWidth, cellAspect);
    const renderGeometry190 = game.getInfantryRenderGeometry190?.(unit, worldWidth, cellAspect, displayScale) || null;
    // Build 190 has one presentation owner. Engineers use a deliberately
    // non-uniform atlas correction so their visible body envelope is the same
    // width and height as the rocket soldier without changing their model.
    const targetWidth = renderGeometry190?.targetWidth ?? worldWidth * (game.camera.zoom || 1) * 1.34 * displayScale;
    const targetHeight = renderGeometry190?.targetHeight ?? targetWidth * cellAspect;"""
model = replace_once(model, old_unit_geometry, new_unit_geometry, 'model unit render geometry')

old_unit_finish = """      flightAltitude + (exact?.height || radius * 1.5) * displayScale,
      displayScale,"""
new_unit_finish = """      flightAltitude + (exact?.height || radius * 1.5) * (renderGeometry190?.scaleY ?? displayScale),
      renderGeometry190?.footprintScale ?? displayScale,"""
model = replace_once(model, old_unit_finish, new_unit_finish, 'model unit finish geometry')
model = replace_once(
    model,
    "    ctx.globalAlpha = building.completed ? 1 : 0.46 + progress * 0.54;",
    "    ctx.globalAlpha = building.completed ? 1 : 0.82 + progress * 0.18;",
    'catalog construction visibility',
)

placeholder_code = r'''  const drawCatalogBuildingPlaceholder190 = (game, building, model) => {
    const radius = building.radius * (building.stats?.visualScale || 1);
    const rotation = Number.isFinite(building.rotation) ? building.rotation : 0;
    const progress = building.completed ? 1 : clamp(building.construction, 0.05, 1);
    const exact = game.getEntityBuildingFootprintAt?.(building, 0) || null;
    const length = Math.max(28, (exact?.halfLength || radius * 1.45) * 2);
    const depth = Math.max(24, (exact?.halfWidth || radius) * 2);
    const bounds = model?.spec?.boundsMeters || building.stats?.modelBoundsMeters || [1, 1, 1];
    const heightRatio = Math.max(0.45, Math.min(1.35, Number(bounds[2] || 1) / Math.max(1, Number(bounds[0] || 1)) * 1.75));
    const height = Math.max(radius * 0.55, radius * heightRatio * (0.72 + progress * 0.28));
    const palette = game.getVisualPalette?.(building.team) || { armor: '#65746d', light: '#91a59b', dark: '#26302c' };
    game.prism3D?.(
      building.x,
      building.y,
      0,
      length,
      depth,
      height,
      rotation,
      { base: palette.dark || '#26302c', top: palette.armor || '#65746d' },
    );
    if (exact?.corners?.length === 4) {
      game.screenPolygon?.(
        exact.corners.map(point => game.worldToScreen(point.x, point.y, 0.03)),
        'rgba(115,150,132,.16)',
        game.teamColor?.(building.team) || '#9ee6bb',
        2,
      );
    }
    const top = game.worldToScreen(building.x, building.y, height);
    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#dcebe4';
    ctx.font = `800 ${Math.max(9, 10 * (game.camera?.zoom || 1))}px system-ui`;
    ctx.fillText(`${model?.name || building.stats?.name || building.typeId} · ${Math.round(progress * 100)}%`, top.x, top.y - 7);
    ctx.restore();
    buildingFinish(game, building, radius, height, length, depth, rotation);
    return true;
  };

'''
base_building_anchor = '  const baseDrawBuilding = GameClass.prototype.drawBuilding3D;\n'
if base_building_anchor not in model:
    raise RuntimeError('build 190 model building hook missing')
model = model.replace(base_building_anchor, placeholder_code + base_building_anchor, 1)
old_building_hook = """  GameClass.prototype.drawBuilding3D = function(building) {
    const model = modelFor(building);
    if (!model) return baseDrawBuilding.call(this, building);
    const lod = Math.min(2, modelLod(this, building));
    if (drawHeroBuildingSprite(this, building, model.code)) return;
    if (model.code === 'B-02') return drawPowerStation(this, building, lod);
    if (model.code === 'B-19') return drawAirfield(this, building, lod);
    return baseDrawBuilding.call(this, building);
  };"""
new_building_hook = """  GameClass.prototype.drawBuilding3D = function(building) {
    const model = modelFor(building);
    if (!model) return baseDrawBuilding.call(this, building);
    const lod = Math.min(2, modelLod(this, building));
    if (drawHeroBuildingSprite(this, building, model.code)) return;
    if (model.code === 'B-02') return drawPowerStation(this, building, lod);
    if (model.code === 'B-19') return drawAirfield(this, building, lod);
    // Never substitute an unrelated generic building while a catalog atlas is
    // decoding or unavailable. The full measured footprint remains visible.
    return drawCatalogBuildingPlaceholder190(this, building, model);
  };"""
model = replace_once(model, old_building_hook, new_building_hook, 'catalog placeholder hook')

old_sprite_registration = """          canvasSprites[spec.code] = { image: null, uri: `${spec.canvasSprite.uri}?build=158`, ready: false, spec };"""
new_sprite_registration = f"""          canvasSprites[spec.code] = {{ image: null, uri: `${{spec.canvasSprite.uri}}?build={BUILD}`, ready: false, spec }};
          if (['B-11', 'B-12', 'B-50', 'B-51', 'B-52', 'B-53'].includes(spec.code)) {{
            queueMicrotask(() => {{
              const asset = ensureCanvasSprite(spec.code);
              asset?.image?.decode?.().catch(() => {{}});
            }});
          }}"""
model = replace_once(model, old_sprite_registration, new_sprite_registration, 'catalog sprite cache and preload')
model_path.write_text(model, 'utf-8')

# All model manifests and atlases must use the active build generation.
for relative in ('unit-footprints-v115.js', 'unit-formation-refinement-v138.js', 'sprite-scale-v123.js'):
    path = OUT / relative
    if not path.exists():
        continue
    text = path.read_text('utf-8')
    text = re.sub(r'(models/(?:pilot|canvas)/[^\s\'"`)]+)\?build=\d+', rf'\1?build={BUILD}', text)
    path.write_text(text, 'utf-8')

# ---------------------------------------------------------------------------
# Runtime versions and authoritative Worker cache isolation.
# ---------------------------------------------------------------------------
version_targets = {
    'formation-march-core-v183.js': [
        ("const VERSION = '16.8.5';\n  const BUILD = 189;", "const VERSION = '16.8.6';\n  const BUILD = 190;"),
    ],
    'authoritative-simulation-v174.js': [
        ("const BUILD = 189;\nconst VERSION = '16.8.5';", "const BUILD = 190;\nconst VERSION = '16.8.6';"),
        ("version: '16.8.5', build: 189", "version: '16.8.6', build: 190"),
    ],
    'authoritative-simulation-worker-v174.js': [
        ("const BUILD = 189;\nconst VERSION = '16.8.5';", "const BUILD = 190;\nconst VERSION = '16.8.6';"),
    ],
    'simulation-profiler-v166.js': [
        ("const VERSION = '16.8.5';\n  const BUILD = 189;", "const VERSION = '16.8.6';\n  const BUILD = 190;"),
    ],
}
for relative, replacements in version_targets.items():
    path = OUT / relative
    text = path.read_text('utf-8')
    for old, new in replacements:
        if old in text:
            text = text.replace(old, new, 1)
    path.write_text(text, 'utf-8')

bridge_path = OUT / 'authoritative-simulation-v174.js'
bridge = bridge_path.read_text('utf-8')
bridge, count = re.subn(
    r"new Worker\('/frontline-dominion/authoritative-simulation-worker-v174\.js\?build=\d+'\)",
    f"new Worker('/frontline-dominion/authoritative-simulation-worker-v174.js?build={BUILD}')",
    bridge,
    count=1,
)
if count != 1:
    raise RuntimeError('build 190 authoritative Worker URL patch failed')
bridge_path.write_text(bridge, 'utf-8')

worker_path = OUT / 'authoritative-simulation-worker-v174.js'
worker = worker_path.read_text('utf-8')
worker = re.sub(
    r"\s*importScripts\('/frontline-dominion/engineer-infantry-parity-v189\.js(?:\?build=\d+)?'\);",
    '',
    worker,
)
worker = re.sub(
    r"\s*importScripts\('/frontline-dominion/runtime-stability-v190\.js(?:\?build=\d+)?'\);",
    '',
    worker,
)
bundle_import_match = re.search(
    r"importScripts\('/frontline-dominion/authoritative-simulation-bundle-v172\.js\?build=\d+'\);",
    worker,
)
if not bundle_import_match:
    raise RuntimeError('build 190 Worker bundle import missing')
bundle_import = bundle_import_match.group(0)
worker = worker.replace(
    bundle_import,
    bundle_import + f"\nimportScripts('/frontline-dominion/runtime-stability-v190.js?build={BUILD}');",
    1,
)
worker = re.sub(
    r"(importScripts\('/frontline-dominion/[^']+\.js)\?build=\d+('\);)",
    rf"\1?build={BUILD}\2",
    worker,
)
worker_path.write_text(worker, 'utf-8')

# Cache-bust every internal JS/manifest/atlas URL, not only script tags.
asset_pattern = re.compile(r"(/frontline-dominion/[^\s\'\"`)]+\.(?:js|json|webp))\?build=\d+")
for path in sorted(OUT.glob('*.js')):
    text = path.read_text('utf-8')
    text = asset_pattern.sub(rf'\1?build={BUILD}', text)
    path.write_text(text, 'utf-8')

# ---------------------------------------------------------------------------
# Canonical build 190 HTML, boot controller, and only launch owner.
# ---------------------------------------------------------------------------
html_path = OUT / 'frontline-dominion.html'
html = html_path.read_text('utf-8')
html = re.sub(
    r'\s*<script[^>]+src=["\'](?:\./|/frontline-dominion/)engineer-infantry-parity-v189\.js(?:\?build=\d+)?["\'][^>]*></script>',
    '',
    html,
    flags=re.I,
)
html = re.sub(
    r'\s*<script[^>]+src=["\'](?:\./|/frontline-dominion/)runtime-stability-v190\.js(?:\?build=\d+)?["\'][^>]*></script>',
    '',
    html,
    flags=re.I,
)
html = re.sub(
    r'\s*<script[^>]+src=["\'](?:\./|/frontline-dominion/)runtime-ui-v(?:189|190)\.js(?:\?build=\d+)?["\'][^>]*></script>',
    '',
    html,
    flags=re.I,
)
html = re.sub(
    r'\s*<script[^>]+src=["\'](?:\./|/frontline-dominion/)runtime-shell-v(?:189|190)\.js(?:\?build=\d+)?["\'][^>]*></script>',
    '',
    html,
    flags=re.I,
)
html = re.sub(r'<title>.*?</title>', f'<title>Frontline Dominion v{VERSION} — Regression Recovery</title>', html, count=1, flags=re.S)

canonical_eyebrow = f'ОПЕРАТИВНО-ТАКТИЧЕСКАЯ RTS · v{VERSION} BUILD {BUILD}'
canonical_lead = 'Исправлены размеры инженеров, полный рендер добывающих зданий, сохранность юнитов и надёжная загрузка контрольных точек.'
feature_labels = [
    'Инженер размером с ракетчика',
    'Единая физика и индикация',
    'Полный рендер рудника',
    'Единый кэш моделей build 190',
    'Юниты не удаляются строительством',
    'Сохранения не удаляются при ошибке',
    'Автоматические контрольные точки',
    'Authoritative Worker 25 Гц',
    'Проверка WebKit и Chromium',
]
feature_html = ''.join(f'<span>{label}</span>' for label in feature_labels)
html, count = re.subn(
    r'(<div id=["\']start-screen["\'][^>]*>.*?<div class=["\']eyebrow["\']>).*?(</div>)',
    rf'\1{canonical_eyebrow}\2',
    html,
    count=1,
    flags=re.S,
)
if count != 1:
    raise RuntimeError('build 190 start eyebrow patch failed')
html, count = re.subn(r'(<p class=["\']lead["\']>).*?(</p>)', rf'\1{canonical_lead}\2', html, count=1, flags=re.S)
if count != 1:
    raise RuntimeError('build 190 start lead patch failed')
html, count = re.subn(
    r'<div class=["\']feature-strip["\'][^>]*>.*?</div>',
    f'<div class="feature-strip" data-fd-canonical-build="{BUILD}">{feature_html}</div>',
    html,
    count=1,
    flags=re.S,
)
if count != 1:
    raise RuntimeError('build 190 feature strip patch failed')

boot_script = f'''<script id="fd-boot190-script">
(() => {{
  const VERSION = '{VERSION}', BUILD = {BUILD};
  const FEATURES = {feature_labels!r};
  const state = {{ ready: false, launching: false, loadAvailable: false, stopped: false }};
  const config = {{ childList: true, subtree: true, characterData: true, attributes: true }};
  let observer;
  const sameFeatures = strip => strip && strip.children.length === FEATURES.length &&
    FEATURES.every((label, index) => strip.children[index]?.textContent === label);
  const apply = () => {{
    if (state.stopped) return;
    const start = document.getElementById('start-screen');
    if (!start) return;
    observer?.disconnect();
    const eyebrow = start.querySelector('.eyebrow');
    const lead = start.querySelector('.lead');
    const strip = start.querySelector('.feature-strip');
    const startButton = document.getElementById('start-game');
    const loadButton = document.getElementById('load-game');
    if (eyebrow && eyebrow.textContent !== '{canonical_eyebrow}') eyebrow.textContent = '{canonical_eyebrow}';
    if (lead && lead.textContent !== '{canonical_lead}') lead.textContent = '{canonical_lead}';
    if (strip && !sameFeatures(strip)) {{
      strip.replaceChildren(...FEATURES.map(label => {{ const span = document.createElement('span'); span.textContent = label; return span; }}));
    }}
    if (strip) strip.dataset.fdCanonicalBuild = String(BUILD);
    if (startButton) {{
      startButton.textContent = state.launching ? 'ЗАПУСК…' : state.ready ? 'НАЧАТЬ СРАЖЕНИЕ' : 'ЗАГРУЗКА…';
      startButton.disabled = !state.ready || state.launching;
      startButton.setAttribute('aria-disabled', String(startButton.disabled));
    }}
    if (loadButton) {{
      loadButton.disabled = !state.ready || state.launching || !state.loadAvailable;
      loadButton.setAttribute('aria-disabled', String(loadButton.disabled));
    }}
    document.documentElement.classList.toggle('fd-loading190', !state.ready);
    document.documentElement.classList.toggle('fd-ready190', state.ready);
    observer?.observe(document.documentElement, config);
  }};
  observer = new MutationObserver(apply);
  observer.observe(document.documentElement, config);
  document.addEventListener('DOMContentLoaded', apply, {{ once: true }});
  globalThis.__FD_BOOT_190__ = {{
    version: VERSION, build: BUILD, state, apply,
    setReady(value) {{ state.ready = Boolean(value); apply(); }},
    setLaunching(value) {{ state.launching = Boolean(value); apply(); }},
    setLoadAvailable(value) {{ state.loadAvailable = Boolean(value); apply(); }},
    stop() {{ state.stopped = true; observer.disconnect(); }},
  }};
}})();
</script>
<style id="fd-boot190-style">
html.fd-loading190 #start-screen button{{pointer-events:none!important}}
html.fd-loading190 #start-game,html.fd-loading190 #load-game{{opacity:.58!important;filter:saturate(.6)}}
</style>'''
html, count = re.subn(
    r'<script id=["\']fd-boot189-script["\']>.*?</script>\s*<style id=["\']fd-boot189-style["\']>.*?</style>',
    boot_script,
    html,
    count=1,
    flags=re.S,
)
if count != 1:
    raise RuntimeError('build 190 boot replacement failed')

bridge_match = re.search(
    r'<script\b[^>]*src=["\'](?:\./|/frontline-dominion/)authoritative-simulation-v174\.js\?build=\d+["\'][^>]*></script>',
    html,
    flags=re.I,
)
if not bridge_match:
    raise RuntimeError('build 190 authoritative bridge tag missing')
bridge_tag = bridge_match.group(0)
html = html.replace(
    bridge_tag,
    f'<script src="./runtime-stability-v190.js?build={BUILD}"></script>\n' + bridge_tag,
    1,
)
prof_match = re.search(
    r'<script\b[^>]*src=["\'](?:\./|/frontline-dominion/)simulation-profiler-v166\.js\?build=\d+["\'][^>]*></script>',
    html,
    flags=re.I,
)
if not prof_match:
    raise RuntimeError('build 190 profiler tag missing')
prof_tag = prof_match.group(0)
html = html.replace(prof_tag, f'<script src="./runtime-ui-v190.js?build={BUILD}"></script>\n' + prof_tag, 1)
if '</body>' not in html:
    raise RuntimeError('build 190 closing body missing')
html = html.replace('</body>', f'<script src="./runtime-shell-v190.js?build={BUILD}"></script>\n</body>', 1)

html = re.sub(
    r'(<script\b[^>]*\bsrc=["\'](?:\./|/frontline-dominion/)[^"\']+\.js)(?:\?build=\d+)?(["\'][^>]*></script>)',
    lambda match: f'{match.group(1)}?build={BUILD}{match.group(2)}',
    html,
    flags=re.I,
)
html_path.write_text(html, 'utf-8')

launcher = f'''<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="color-scheme" content="dark"><title>Frontline Dominion v{VERSION}</title><style>
*{{box-sizing:border-box}}html,body{{margin:0;min-height:100%;background:#050b10;color:#dcecf4;font-family:system-ui,sans-serif}}
body{{display:grid;place-items:center;min-height:100vh;padding:24px;background:#071019}}
main{{width:min(760px,100%);padding:36px;border:1px solid #365363;border-radius:18px;background:#0a151d}}
a{{display:inline-flex;min-height:54px;align-items:center;padding:0 24px;border-radius:10px;background:#d9edf7;color:#071019;text-decoration:none;font-weight:900}}
</style></head><body><main>
<div>ЕДИНСТВЕННАЯ АКТУАЛЬНАЯ СБОРКА · BUILD {BUILD}</div><h1>Frontline Dominion</h1>
<p>Regression Recovery: инженер размером с ракетчика, полный рендер рудообогатительного рудника, сохранность юнитов при строительстве и защищённая загрузка контрольных точек.</p>
<a id="launch" href="./frontline-dominion.html?build={BUILD}">Запустить игру</a><p>v{VERSION} · build {BUILD} · GitHub Pages</p>
</main></body></html>'''
(OUT / 'index.html').write_text(launcher, 'utf-8')

print(f'Frontline Dominion v{VERSION} build {BUILD} regression recovery assembled')
