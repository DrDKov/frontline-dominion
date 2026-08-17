from pathlib import Path
import re, runpy

ROOT = Path('.')
OUT = ROOT / 'dist'
VERSION = '16.8.4'
BUILD = 188

if not (OUT / 'frontline-dominion.html').exists():
    runpy.run_path('scripts/assemble187.py', run_name='__main__')


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise RuntimeError(f'build 188 patch anchor missing: {label}')
    return text.replace(old, new, 1)


# Canonical build-188 UI shell. Build 187 startup recovery remains the base;
# only version ownership moves forward.
for source_name in ('runtime-ui-v188.js', 'runtime-shell-v188.js'):
    source = ROOT / 'src' / 'v188' / source_name
    if not source.exists():
        raise RuntimeError(f'build 188 source missing: {source_name}')
    (OUT / source_name).write_text(source.read_text('utf-8'), 'utf-8')

# ---------------------------------------------------------------------------
# Rapid Formation Assembly
# ---------------------------------------------------------------------------
p = OUT / 'formation-march-core-v183.js'
s = p.read_text('utf-8')
s = replace_once(
    s,
    "  const VERSION = '16.7';\n  const BUILD = 183;",
    "  const VERSION = '16.8.4';\n  const BUILD = 188;",
    'formation module version',
)
s = replace_once(
    s,
    "        blockedTicks: 0,\n        lastMovedAt: finite183(game.time),",
    "        blockedTicks: 0,\n        formingTicks188: 0,\n        lastMovedAt: finite183(game.time),",
    'formation state forming counter',
)

new_form = r'''  const memberTurnRate188 = member => {
    if (member?.infantry) return 9.0;
    if (member?.vehicle) return 6.0;
    return 7.0;
  };

  const errorPercentile188 = (errors, ratio) => {
    if (!errors.length) return 0;
    const sorted = [...errors].sort((a, b) => a - b);
    const index = Math.max(0, Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * ratio)));
    return sorted[index];
  };

  const approachMemberSlot188 = (game, member, target, finalAngle, dt, speed, slotTolerance) => {
    const x = finite183(member.x);
    const y = finite183(member.y);
    const dx = target.x - x;
    const dy = target.y - y;
    const distance = Math.hypot(dx, dy);
    const desiredHeading = distance > slotTolerance * 1.25 ? Math.atan2(dy, dx) : finalAngle;
    const currentHeading = finite183(member.rotation, finite183(member.renderRotation, desiredHeading));
    const heading = approachAngle183(currentHeading, desiredHeading, memberTurnRate188(member) * Math.max(.001, dt));
    const maxStep = speed * Math.max(.001, dt);
    const step = Math.min(distance, maxStep);
    const point = distance > .001
      ? { x: x + dx / distance * step, y: y + dy / distance * step }
      : target;
    applyMemberPosition183(game, member, point, heading, step > .001 ? step / Math.max(.001, dt) : 0, dt, step > .001);
    return { distance, remaining: Math.max(0, distance - step), step };
  };

  function formAtAnchor183(game, group, state, members, dt, speed, anchorX, anchorY, angle, regroup = false) {
    const spacing = Math.max(24, finite183(group.lateralSpacing || group.depthSpacing, 32));
    const errors = [];
    let maxError = 0;
    let settled = 0;
    let near = 0;
    state.formingTicks188 = finite183(state.formingTicks188, 0) + 1;

    for (const member of members) {
      const target = worldSlot183(group, member, anchorX, anchorY, angle, 1);
      // Form-up is a rendezvous manoeuvre, not a march. Each unit may use its own
      // mobility instead of being throttled by the slowest vehicle in the group.
      const ownSpeed = effectiveSpeed183(member);
      const assemblyFactor = regroup ? 1.30 : 1.62;
      const assemblySpeed = Math.max(speed, ownSpeed * assemblyFactor);
      const slotTolerance = Math.max(9, finite183(member.radius, 6) * .78, spacing * .18);
      const motion = approachMemberSlot188(game, member, target, angle, dt, assemblySpeed, slotTolerance);
      const remaining = motion.remaining;
      errors.push(remaining);
      maxError = Math.max(maxError, remaining);
      if (remaining <= slotTolerance) settled += 1;
      if (remaining <= Math.max(18, spacing * .70)) near += 1;
    }

    diagnostics183.maxCohesionError = Math.max(diagnostics183.maxCohesionError, maxError);
    if (regroup) diagnostics183.regroupFrames += 1;
    else diagnostics183.formingFrames += 1;

    const nearRatio = near / Math.max(1, members.length);
    const p80 = errorPercentile188(errors, .80);
    const p88 = errorPercentile188(errors, .88);
    const practicalTolerance = Math.max(18, spacing * .70);
    // Do not wait for one truck at the edge of a large group. Once the body of
    // the formation is assembled, start the march and let stragglers merge while
    // moving. A short fallback prevents tiny residual slot corrections from
    // stalling the whole column indefinitely.
    const ready = settled === members.length ||
      (nearRatio >= .88 && p88 <= practicalTolerance) ||
      (state.formingTicks188 >= 18 && nearRatio >= .78 && p80 <= Math.max(24, spacing * .92));

    if (ready) {
      state.phase = 'marching';
      state.compression = 1;
      state.memberSignature = members.map(member => member.id).join('|');
      state.formingTicks188 = 0;
      // Intentionally no exact-slot snap here. Residual errors are consumed by
      // the moving-slot follower below, so figures never teleport into formation.
    }
    return ready;
  }
'''
s, count = re.subn(
    r"  function formAtAnchor183\(.*?\n  \}\n(?=\n  function sharedMarchBatch183)",
    new_form.rstrip(),
    s,
    count=1,
    flags=re.S,
)
if count != 1:
    raise RuntimeError('build 188 formAtAnchor183 patch failed')

old_signature = "    if (state.memberSignature && state.memberSignature !== memberSignature) state.phase = 'forming';"
new_signature = """    if (state.memberSignature && state.memberSignature !== memberSignature) {
      state.phase = 'forming';
      state.formingTicks188 = 0;
    }"""
s = replace_once(s, old_signature, new_signature, 'formation membership reset')

old_error_block = r'''    let maxError = 0;
    for (const member of members) {
      const expected = worldSlot183(group, member, previousAnchorX, previousAnchorY, previousAngle, state.compression || 1);
      maxError = Math.max(maxError, distance183(member, expected));
    }
    diagnostics183.maxCohesionError = Math.max(diagnostics183.maxCohesionError, maxError);

    if (state.phase !== 'marching' || maxError > spacing * .88) {
      state.phase = maxError > spacing * .88 ? 'regrouping' : 'forming';
      group.anchorX = previousAnchorX;
      group.anchorY = previousAnchorY;
      group.angle = previousAngle;
      formAtAnchor183(game, group, state, members, dt, speed, previousAnchorX, previousAnchorY, previousAngle, state.phase === 'regrouping');
      diagnostics183.individualMovementAvoided += members.length;
      return true;
    }'''
new_error_block = r'''    let maxError = 0;
    const cohesionErrors188 = [];
    for (const member of members) {
      const expected = worldSlot183(group, member, previousAnchorX, previousAnchorY, previousAngle, state.compression || 1);
      const error = distance183(member, expected);
      cohesionErrors188.push(error);
      maxError = Math.max(maxError, error);
    }
    diagnostics183.maxCohesionError = Math.max(diagnostics183.maxCohesionError, maxError);

    const p85Error188 = errorPercentile188(cohesionErrors188, .85);
    const outliers188 = cohesionErrors188.filter(error => error > spacing * 1.18).length;
    const tooManyOutliers188 = outliers188 > Math.max(2, Math.floor(members.length * .18));
    const cohesionBroken188 = state.phase === 'marching' && p85Error188 > spacing * 1.02 && tooManyOutliers188;

    if (state.phase !== 'marching' || cohesionBroken188) {
      if (cohesionBroken188) {
        state.phase = 'regrouping';
        state.formingTicks188 = 0;
      } else if (state.phase !== 'regrouping') {
        state.phase = 'forming';
      }
      group.anchorX = previousAnchorX;
      group.anchorY = previousAnchorY;
      group.angle = previousAngle;
      formAtAnchor183(game, group, state, members, dt, speed, previousAnchorX, previousAnchorY, previousAngle, state.phase === 'regrouping');
      diagnostics183.individualMovementAvoided += members.length;
      return true;
    }'''
s = replace_once(s, old_error_block, new_error_block, 'practical cohesion gate')

old_apply = r'''    selectedPoints.forEach((point, index) => {
      applyMemberPosition183(game, members[index], point, angle, speed, dt, rawDistance > .001);
    });'''
new_apply = r'''    selectedPoints.forEach((point, index) => {
      const member = members[index];
      const distance = Math.hypot(point.x - finite183(member.x), point.y - finite183(member.y));
      const snapTolerance = Math.max(7, finite183(member.radius, 6) * .58, spacing * .14);
      if (distance <= snapTolerance) {
        // Tiny residuals may be absorbed, but rotate into the march direction
        // progressively so tracked/wheeled sprites do not slide sideways.
        const currentHeading = finite183(member.rotation, finite183(member.renderRotation, angle));
        const heading = approachAngle183(currentHeading, angle, memberTurnRate188(member) * Math.max(.001, dt));
        applyMemberPosition183(game, member, point, heading, speed, dt, rawDistance > .001);
      } else {
        // A straggler follows its moving slot with its own catch-up speed. This
        // avoids the former one-frame teleport when the formation was released.
        const catchupSpeed = Math.max(speed * 1.08, effectiveSpeed183(member) * 1.36);
        approachMemberSlot188(game, member, point, angle, dt, catchupSpeed, snapTolerance);
      }
    });'''
s = replace_once(s, old_apply, new_apply, 'moving slot follower')

p.write_text(s, 'utf-8')

# ---------------------------------------------------------------------------
# Build metadata, cache isolation, and Worker formation cache key.
# ---------------------------------------------------------------------------
p = OUT / 'authoritative-simulation-v174.js'
s = p.read_text('utf-8')
s = replace_once(s, "const BUILD = 187;\nconst VERSION = '16.8.3';", "const BUILD = 188;\nconst VERSION = '16.8.4';", 'bridge version')
s, n = re.subn(
    r"new Worker\('/frontline-dominion/authoritative-simulation-worker-v174\.js\?build=\d+'\)",
    "new Worker('/frontline-dominion/authoritative-simulation-worker-v174.js?build=188')",
    s,
    count=1,
)
if n != 1:
    raise RuntimeError('build 188 bridge worker URL patch failed')
s = s.replace(
    "window.__FD_STABLE_STATE165__ = { version: '16.8.3', build: 187, bridge: this, transport: this.transportMode165, counts: {} };",
    "window.__FD_STABLE_STATE165__ = { version: '16.8.4', build: 188, bridge: this, transport: this.transportMode165, counts: {} };",
)
p.write_text(s, 'utf-8')

p = OUT / 'authoritative-simulation-worker-v174.js'
s = p.read_text('utf-8')
s = replace_once(s, "const BUILD = 187;\nconst VERSION = '16.8.3';", "const BUILD = 188;\nconst VERSION = '16.8.4';", 'worker version')
s = re.sub(
    r"(importScripts\('/frontline-dominion/[^']+\.js)\?build=\d+('\);)",
    rf"\1?build={BUILD}\2",
    s,
)
p.write_text(s, 'utf-8')

p = OUT / 'simulation-profiler-v166.js'
s = p.read_text('utf-8')
s = s.replace("const VERSION = '16.8.3';\n  const BUILD = 187;", "const VERSION = '16.8.4';\n  const BUILD = 188;", 1)
p.write_text(s, 'utf-8')

# Remove build-187 diagnostic logging now that Safari startup is proven stable.
html_path = OUT / 'frontline-dominion.html'
html = html_path.read_text('utf-8')
html, n = re.subn(
    r"      globalThis\.__FD_START_PHASE187__ = \{ phase: 'constructing'.*?console\.info\('\[FD187\] Sound ensure done', globalThis\.__FD_START_PHASE187__\.soundMs\);",
    "      game = new Game(options);\n      game.sound.ensure();",
    html,
    count=1,
    flags=re.S,
)
if n != 1:
    raise RuntimeError('build 188 startup instrumentation removal failed')

html = re.sub(r'\s*<script[^>]+src=["\'](?:\./|/frontline-dominion/)runtime-ui-v18[5-8]\.js(?:\?build=\d+)?["\'][^>]*></script>', '', html, flags=re.I)
html = re.sub(r'\s*<script[^>]+src=["\'](?:\./|/frontline-dominion/)runtime-shell-v18[7-8]\.js(?:\?build=\d+)?["\'][^>]*></script>', '', html, flags=re.I)
html = re.sub(r'<title>.*?</title>', f'<title>Frontline Dominion v{VERSION} — Rapid Formation Assembly</title>', html, count=1, flags=re.S)

# Historical shell files remain as static assets but may not own live metadata.
for path in sorted(OUT.glob('*.js')):
    if path.name == 'runtime-shell-v188.js':
        continue
    text = path.read_text('utf-8')
    text = re.sub(r'document\.title\s*=\s*[^;]+;', 'void 0;', text)
    text = re.sub(r'\beyebrow\.textContent\s*=\s*[^;]+;', 'void 0;', text)
    path.write_text(text, 'utf-8')

# One fresh namespace for every browser script, preserving build-187 Safari fix.
def cache_bust(match):
    return f'{match.group(1)}?build={BUILD}{match.group(2)}'

html = re.sub(
    r'(<script\b[^>]*\bsrc=["\'](?:\./|/frontline-dominion/)[^"\']+\.js)(?:\?build=\d+)?(["\'][^>]*></script>)',
    cache_bust,
    html,
    flags=re.I,
)
prof = re.search(r'<script\b[^>]*src=["\'](?:\./|/frontline-dominion/)simulation-profiler-v166\.js\?build=188["\'][^>]*></script>', html, flags=re.I)
if not prof:
    raise RuntimeError('build 188 profiler tag missing')
html = html[:prof.start()] + '<script src="./runtime-ui-v188.js?build=188"></script>\n' + html[prof.start():]
if '</body>' not in html:
    raise RuntimeError('build 188 closing body missing')
html = html.replace('</body>', '<script src="./runtime-shell-v188.js?build=188"></script>\n</body>', 1)
html_path.write_text(html, 'utf-8')

launcher = f'''<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="color-scheme" content="dark"><title>Frontline Dominion v{VERSION}</title><style>
*{{box-sizing:border-box}}html,body{{margin:0;min-height:100%;background:#050b10;color:#dcecf4;font-family:system-ui,sans-serif}}
body{{display:grid;place-items:center;min-height:100vh;padding:24px;background:#071019}}
main{{width:min(720px,100%);padding:36px;border:1px solid #365363;border-radius:18px;background:#0a151d}}
a{{display:inline-flex;min-height:54px;align-items:center;padding:0 24px;border-radius:10px;background:#d9edf7;color:#071019;text-decoration:none;font-weight:900}}
</style></head><body><main>
<div>ЕДИНСТВЕННАЯ АКТУАЛЬНАЯ СБОРКА · BUILD {BUILD}</div><h1>Frontline Dominion</h1>
<p>Rapid Formation Assembly: крупные группы быстрее занимают места перед маршем, каждый юнит поворачивается по фактическому вектору движения, а единичные отставшие догоняют строй уже на ходу без телепортации.</p>
<a id="launch" href="./frontline-dominion.html?build={BUILD}">Запустить игру</a><p>v{VERSION} · build {BUILD} · GitHub Pages</p>
</main></body></html>'''
(OUT / 'index.html').write_text(launcher, 'utf-8')

print(f'Frontline Dominion v{VERSION} build {BUILD} assembled')
