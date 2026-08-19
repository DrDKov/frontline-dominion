from pathlib import Path

path = Path('tests/reliability199.mjs')
text = path.read_text('utf-8')
start_marker = "const saveRequested = await page.evaluate(() => {"
end_marker = "if (errors.length) throw new Error(`browser errors: ${JSON.stringify(errors)}`);"
start = text.find(start_marker)
end = text.find(end_marker, start)
if start < 0 or end < 0:
    raise RuntimeError('build 199 same-context save/load gate markers missing')
replacement = """// Save/load has its own isolated returning-user browser-context gate. Keeping
// it out of this active-page reliability pass avoids pagehide autosave racing
// the reload that creates the load fixture.
const saved = { delegated: true, gate: 'save-load199' };
const loaded = { delegated: true, gate: 'save-load199' };

"""
text = text[:start] + replacement + text[end:]
path.write_text(text, 'utf-8')
print('Build 199 reliability save/load phase delegated to isolated gate')
