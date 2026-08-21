from pathlib import Path

BUILD = 205
path = Path('tests/multiplayer205.mjs')
if not path.exists():
    raise RuntimeError(f'build {BUILD} multiplayer test missing: {path}')

text = path.read_text('utf-8')
if 'hostBrowser = await chromium.launch' in text:
    print('Build 205 dual-process WebRTC gate already installed')
    raise SystemExit(0)

launch_anchor = "const browser = await chromium.launch({ headless: true });\n"
if text.count(launch_anchor) != 1:
    raise RuntimeError('build 205 shared Chromium launch anchor missing')
text = text.replace(launch_anchor, '', 1)

pair_anchor = """async function createPair(mode) {
  const hostContext = await browser.newContext({ viewport: { width: 1360, height: 820 }, deviceScaleFactor: 1 });
  const guestContext = await browser.newContext({ viewport: { width: 1360, height: 820 }, deviceScaleFactor: 1 });
"""
pair_replacement = """async function createPair(mode) {
  // Use independent Chromium processes, not merely isolated contexts in one
  // process. This is closer to two physical computers and proves that no
  // browser-process-local state is required for WebRTC synchronization.
  const [hostBrowser, guestBrowser] = await Promise.all([
    chromium.launch({ headless: true }),
    chromium.launch({ headless: true }),
  ]);
  const hostContext = await hostBrowser.newContext({ viewport: { width: 1360, height: 820 }, deviceScaleFactor: 1 });
  const guestContext = await guestBrowser.newContext({ viewport: { width: 1360, height: 820 }, deviceScaleFactor: 1 });
"""
if text.count(pair_anchor) != 1:
    raise RuntimeError('build 205 createPair browser-context anchor missing')
text = text.replace(pair_anchor, pair_replacement, 1)

return_anchor = """  return { hostContext, guestContext, host, guest, errors, connected, playing };
}
"""
return_replacement = """  return { hostBrowser, guestBrowser, hostContext, guestContext, host, guest, errors, connected, playing };
}
"""
if text.count(return_anchor) != 1:
    raise RuntimeError('build 205 createPair return anchor missing')
text = text.replace(return_anchor, return_replacement, 1)

coop_close = "await Promise.all([coop.hostContext.close(), coop.guestContext.close()]);\n"
coop_replacement = """await Promise.all([coop.hostContext.close(), coop.guestContext.close()]);
await Promise.all([coop.hostBrowser.close(), coop.guestBrowser.close()]);
"""
if text.count(coop_close) != 1:
    raise RuntimeError('build 205 co-op close anchor missing')
text = text.replace(coop_close, coop_replacement, 1)

versus_close = """await Promise.all([versus.hostContext.close(), versus.guestContext.close()]);
await browser.close();
"""
versus_replacement = """await Promise.all([versus.hostContext.close(), versus.guestContext.close()]);
await Promise.all([versus.hostBrowser.close(), versus.guestBrowser.close()]);
"""
if text.count(versus_close) != 1:
    raise RuntimeError('build 205 versus close/shared browser anchor missing')
text = text.replace(versus_close, versus_replacement, 1)

path.write_text(text, 'utf-8')
print('Build 205 WebRTC gate now uses two independent Chromium processes')
