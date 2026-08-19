from pathlib import Path

source = Path('tests/save-load191.mjs')
target = Path('tests/save-load199.generated.mjs')
text = source.read_text('utf-8')
text = text.replace('?build=191', '?build=199')
text = text.replace('__FD_RUNTIME_SHELL_191__', '__FD_RUNTIME_SHELL_199__')
text = text.replace('newGame.build !== 191', 'newGame.build !== 199')
text = text.replace('save-load191', 'save-load199')
text = text.replace('SaveLoad191', 'SaveLoad199')
target.write_text(text, 'utf-8')
print('Build 199 isolated save/load regression generated')
