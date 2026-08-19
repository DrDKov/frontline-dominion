from pathlib import Path

path = Path('tests/reliability199.mjs')
text = path.read_text('utf-8')
anchor = """const waitGame = async () => waitFor(() => page.evaluate(() => {
  const game = globalThis.__FD_DEBUG__?.game;
  const bridge = globalThis.__FD_STABLE_STATE165__?.bridge;
  return Boolean(game && bridge?.ready && !bridge.failed && Number(bridge.workerTick || 0) >= 10);
}), 45000);
"""
replacement = """const waitGame = async () => {
  const started = Date.now();
  let snapshot = null;
  while (Date.now() - started < 45000) {
    snapshot = await page.evaluate(() => {
      const game = globalThis.__FD_DEBUG__?.game;
      const bridge = globalThis.__FD_STABLE_STATE165__?.bridge;
      const shell = globalThis.__FD_RUNTIME_SHELL_199__;
      return {
        game: Boolean(game),
        ready: Boolean(bridge?.ready),
        failed: Boolean(bridge?.failed),
        workerTick: Number(bridge?.workerTick || 0),
        lastAck: Number(bridge?.lastAck || 0),
        actionErrors: Number(bridge?.actionErrors || 0),
        bridgeError: bridge?.lastError ? String(bridge.lastError) : null,
        shellError: shell?.state?.lastError ? String(shell.state.lastError) : null,
        launching: Boolean(shell?.state?.launching),
        launchMode: shell?.state?.launchMode || null,
      };
    });
    if (snapshot.game && snapshot.ready && !snapshot.failed && snapshot.workerTick >= 10) return snapshot;
    if (snapshot.failed || snapshot.shellError) throw new Error(`Worker launch failed: ${JSON.stringify(snapshot)}`);
    await page.waitForTimeout(100);
  }
  throw new Error(`Worker launch timed out: ${JSON.stringify(snapshot)}`);
};
"""
if text.count(anchor) != 1:
    raise RuntimeError('build 199 waitGame diagnostic anchor count invalid')
path.write_text(text.replace(anchor, replacement, 1), 'utf-8')
print('Build 199 Worker launch diagnostics installed')
