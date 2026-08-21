from pathlib import Path

path = Path('tests/worker-recovery205.generated.mjs')
if not path.exists():
    raise RuntimeError(f'build 205 generated Worker recovery gate missing: {path}')

text = path.read_text('utf-8')
old = """await page.goto(url, { waitUntil: 'load', timeout: 60000 });
await waitFor(() => page.evaluate(() => Boolean(globalThis.__FD_RUNTIME_SHELL_205__?.findSavedGame?.() && !document.getElementById('load-game')?.disabled)), 30000);
await page.locator('#load-game').click();
const loaded = await waitFor(() => page.evaluate(() => {
"""
new = """await page.goto(url, { waitUntil: 'load', timeout: 60000 });
const recoverySlot205 = await waitFor(() => page.evaluate(async () => {
  const api = globalThis.__FD_SAVE_SLOTS_205__;
  if (!api?.state?.ready || !api?.state?.installed) return null;
  const summaries = await api.list();
  const record = summaries.length ? await api.get(summaries[0].id) : null;
  if (!record?.payload) return null;
  return {
    id: record.id,
    name: record.name,
    kind: record.kind,
    migrations: Number(api.state.migrations || 0),
  };
}), 30000);
if (recoverySlot205.name !== 'Предыдущее сохранение' || recoverySlot205.kind !== 'legacy' || recoverySlot205.migrations !== 1) {
  throw new Error(`Worker recovery fixture was not imported through build-205 slots: ${JSON.stringify(recoverySlot205)}`);
}
await page.evaluate(async (slotId) => {
  await globalThis.__FD_SAVE_SLOTS_205__.loadSlot(slotId);
}, recoverySlot205.id);
const loaded = await waitFor(() => page.evaluate(() => {
"""
if text.count(old) != 1:
    raise RuntimeError(f'build 205 Worker recovery load anchor invalid: {text.count(old)}')
text = text.replace(old, new, 1)

result_old = "console.log(JSON.stringify({ ok: true, loaded, forced, recovered, moved }));"
result_new = "console.log(JSON.stringify({ ok: true, recoverySlot205, loaded, forced, recovered, moved }));"
if text.count(result_old) != 1:
    raise RuntimeError(f'build 205 Worker recovery result anchor invalid: {text.count(result_old)}')
text = text.replace(result_old, result_new, 1)

path.write_text(text, 'utf-8')
print('Build 205 Worker recovery gate now loads the imported slot through save-slot authority')
