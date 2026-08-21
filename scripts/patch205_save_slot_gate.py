from pathlib import Path

BUILD = 205
path = Path('tests/save-slots205.mjs')
if not path.exists():
    raise RuntimeError(f'build {BUILD} save-slot test missing: {path}')

text = path.read_text('utf-8')
if 'overwrittenBeta205' in text:
    print('Build 205 overwrite/delete save-slot gate already installed')
    raise SystemExit(0)

anchor = """if (!beta.id || beta.id === alpha.id || beta.hash === alpha.hash || beta.tick < alpha.tick || !beta.rallyPoint ||
    Math.hypot(beta.rallyPoint.x - fixture.pointB.x, beta.rallyPoint.y - fixture.pointB.y) >= 3 ||
    Number(beta.diagnostics.exactWorkerSaves || 0) < 2 || Number(beta.diagnostics.fallbackSaves || 0) !== 0) {
  throw new Error(`Independent authoritative slots were not created: ${JSON.stringify({ alpha, beta })}`);
}

await page.evaluate(() => globalThis.__FD_SAVE_SLOTS_205__.openLoad());
"""
replacement = """if (!beta.id || beta.id === alpha.id || beta.hash === alpha.hash || beta.tick < alpha.tick || !beta.rallyPoint ||
    Math.hypot(beta.rallyPoint.x - fixture.pointB.x, beta.rallyPoint.y - fixture.pointB.y) >= 3 ||
    Number(beta.diagnostics.exactWorkerSaves || 0) < 2 || Number(beta.diagnostics.fallbackSaves || 0) !== 0) {
  throw new Error(`Independent authoritative slots were not created: ${JSON.stringify({ alpha, beta })}`);
}

// Overwrite must preserve slot identity while replacing its authoritative
// payload. Mutate the live game first so a stale or append-only implementation
// cannot accidentally satisfy the test.
const overwriteMutation205 = await page.evaluate(expected => {
  const game = globalThis.__FD_DEBUG__.game;
  const bridge = globalThis.__FD_STABLE_STATE165__.bridge;
  const building = game.getEntity(expected.buildingId);
  const pointC = game.findReachablePoint?.(building.x + 520, building.y - 260, 22) || { x: building.x + 520, y: building.y - 260 };
  const beforeSeq = Number(bridge.seq || 0);
  const issued = game.setRallyPoint91(building, pointC.x, pointC.y);
  return { pointC, beforeSeq, sentSeq: Number(bridge.seq || 0), issued };
}, fixture);
if (!overwriteMutation205.issued || overwriteMutation205.sentSeq <= overwriteMutation205.beforeSeq) {
  throw new Error(`Overwrite fixture mutation was not sent: ${JSON.stringify(overwriteMutation205)}`);
}
await waitFor(() => page.evaluate(({ expected, command }) => {
  const game = globalThis.__FD_DEBUG__?.game;
  const bridge = globalThis.__FD_STABLE_STATE165__?.bridge;
  const point = game?.getEntity?.(expected.buildingId)?.rallyPoint;
  return Number(bridge?.lastAck || 0) >= command.sentSeq && point && Math.hypot(point.x - command.pointC.x, point.y - command.pointC.y) < 3;
}, { expected: fixture, command: overwriteMutation205 }), 10000);

const overwrittenBeta205 = await page.evaluate(async ({ betaId, buildingId, pointC }) => {
  const api = globalThis.__FD_SAVE_SLOTS_205__;
  const record = await api.saveNamed('Операция Бета — перезаписана', betaId);
  const data = JSON.parse(record.payload);
  const building = data.entities.find(item => item.id === buildingId);
  const records = await api.list();
  return {
    id: record.id,
    name: record.name,
    hash: record.sourceHash,
    rallyPoint: building?.rallyPoint || null,
    manualIds: records.filter(item => item.kind === 'manual').map(item => item.id),
    pointC,
  };
}, { betaId: beta.id, buildingId: fixture.buildingId, pointC: overwriteMutation205.pointC });
if (overwrittenBeta205.id !== beta.id || overwrittenBeta205.hash === beta.hash ||
    overwrittenBeta205.manualIds.length !== 2 || new Set(overwrittenBeta205.manualIds).size !== 2 ||
    !overwrittenBeta205.rallyPoint || Math.hypot(overwrittenBeta205.rallyPoint.x - overwrittenBeta205.pointC.x, overwrittenBeta205.rallyPoint.y - overwrittenBeta205.pointC.y) >= 3) {
  throw new Error(`Selected save slot was not overwritten in place: ${JSON.stringify({ beta, overwrittenBeta205 })}`);
}

// Deletion is tested on a temporary third manual slot so Alpha/Beta remain
// available for the subsequent persistence and exact-load checks.
const deletedSlot205 = await page.evaluate(async () => {
  const api = globalThis.__FD_SAVE_SLOTS_205__;
  const temporary = await api.saveNamed('Временный слот для удаления');
  const before = await api.list();
  await api.deleteSlot(temporary.id);
  const after = await api.list();
  return {
    id: temporary.id,
    beforeManualCount: before.filter(item => item.kind === 'manual').length,
    afterManualCount: after.filter(item => item.kind === 'manual').length,
    stillPresent: after.some(item => item.id === temporary.id),
    deletes: Number(api.diagnostics().deletes || 0),
  };
});
if (deletedSlot205.beforeManualCount !== 3 || deletedSlot205.afterManualCount !== 2 || deletedSlot205.stillPresent || deletedSlot205.deletes < 1) {
  throw new Error(`Save slot deletion failed: ${JSON.stringify(deletedSlot205)}`);
}

await page.evaluate(() => globalThis.__FD_SAVE_SLOTS_205__.openLoad());
"""
if text.count(anchor) != 1:
    raise RuntimeError('build 205 save overwrite/delete insertion anchor missing')
text = text.replace(anchor, replacement, 1)

name_anchor = """if (!modalBeforeReload.visible || !modalBeforeReload.names.includes('Операция Альфа') || !modalBeforeReload.names.includes('Операция Бета')) {
"""
name_replacement = """if (!modalBeforeReload.visible || !modalBeforeReload.names.includes('Операция Альфа') || !modalBeforeReload.names.includes('Операция Бета — перезаписана') || modalBeforeReload.names.includes('Временный слот для удаления')) {
"""
if text.count(name_anchor) != 1:
    raise RuntimeError('build 205 save center name assertion anchor missing')
text = text.replace(name_anchor, name_replacement, 1)

compare_anchor = """    Math.hypot(loaded.rallyPoint.x - beta.rallyPoint.x, loaded.rallyPoint.y - beta.rallyPoint.y) < 40 ||
"""
compare_replacement = """    Math.hypot(loaded.rallyPoint.x - overwrittenBeta205.rallyPoint.x, loaded.rallyPoint.y - overwrittenBeta205.rallyPoint.y) < 40 ||
"""
if text.count(compare_anchor) != 1:
    raise RuntimeError('build 205 loaded stale comparison anchor missing')
text = text.replace(compare_anchor, compare_replacement, 1)

output_anchor = """  beta: { ...beta, diagnostics: undefined },
  autosave,
"""
output_replacement = """  beta: { ...beta, diagnostics: undefined },
  overwrittenBeta205,
  deletedSlot205,
  autosave,
"""
if text.count(output_anchor) != 1:
    raise RuntimeError('build 205 save test output anchor missing')
text = text.replace(output_anchor, output_replacement, 1)

path.write_text(text, 'utf-8')
print('Build 205 physical save gate now covers overwrite-in-place and deletion')
