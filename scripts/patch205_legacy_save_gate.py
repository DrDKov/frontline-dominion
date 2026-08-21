from pathlib import Path

path = Path('tests/save-load205.generated.mjs')
if not path.exists():
    raise RuntimeError(f'build 205 generated save/load gate missing: {path}')

text = path.read_text('utf-8')
old = """await page.goto(url, { waitUntil: 'load', timeout: 60000 });
await waitFor(() => page.evaluate((creditSentinel) => {
  const shell = globalThis.__FD_RUNTIME_SHELL_205__;
  const candidate = shell?.findSavedGame?.();
  return Boolean(shell?.state?.installed && !document.getElementById('load-game')?.disabled && Number(candidate?.data?.teams?.player?.credits) === creditSentinel);
}, CREDIT_SENTINEL), 30000);
await page.locator('#load-game').click();
"""
new = """await page.goto(url, { waitUntil: 'load', timeout: 60000 });
const importedLegacy205 = await waitFor(() => page.evaluate(async (creditSentinel) => {
  const api = globalThis.__FD_SAVE_SLOTS_205__;
  if (!api?.state?.ready || !api?.state?.installed) return null;
  const summaries = await api.list();
  for (const summary of summaries) {
    const record = await api.get(summary.id);
    let data = null;
    try { data = JSON.parse(record?.payload || ''); } catch (_) {}
    if (Number(data?.teams?.player?.credits) === creditSentinel) {
      return {
        id: record.id,
        name: record.name,
        kind: record.kind,
        migrations: Number(api.state.migrations || 0),
      };
    }
  }
  return null;
}, CREDIT_SENTINEL), 30000);
if (importedLegacy205.name !== 'Предыдущее сохранение' || importedLegacy205.kind !== 'legacy' || importedLegacy205.migrations !== 1) {
  throw new Error(`Legacy singleton was not imported exactly once into build-205 slots: ${JSON.stringify(importedLegacy205)}`);
}
await page.evaluate(async (slotId) => {
  const api = globalThis.__FD_SAVE_SLOTS_205__;
  await api.loadSlot(slotId);
}, importedLegacy205.id);
"""

if text.count(old) != 1:
    raise RuntimeError(f'build 205 legacy load gate anchor invalid: {text.count(old)}')
text = text.replace(old, new, 1)

result_anchor = """console.log(JSON.stringify({
  ok: true,
  fixture: { ...fixture, wrapped: undefined },
"""
result_replacement = """console.log(JSON.stringify({
  ok: true,
  importedLegacy205,
  fixture: { ...fixture, wrapped: undefined },
"""
if text.count(result_anchor) != 1:
    raise RuntimeError(f'build 205 legacy result anchor invalid: {text.count(result_anchor)}')
text = text.replace(result_anchor, result_replacement, 1)

path.write_text(text, 'utf-8')
print('Build 205 legacy singleton save/load gate now uses the save-slot authority')
