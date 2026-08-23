from pathlib import Path
import re

HTML = Path('dist/frontline-dominion.html')
if not HTML.exists():
    raise RuntimeError('build 213 HTML missing')

text = HTML.read_text('utf-8')
pattern = re.compile(r'<script id="fd-boot-bridge212">.*?</script>', re.S)
replacement = (
    '<script id="fd-boot-bridge213">'
    'globalThis.__FD_BOOT_213__ ||= globalThis.__FD_BOOT_212__ || globalThis.__FD_BOOT_211__ || '
    'globalThis.__FD_BOOT_210__ || globalThis.__FD_BOOT_209__ || globalThis.__FD_BOOT_208__ || '
    'globalThis.__FD_BOOT_207__ || globalThis.__FD_BOOT_206__; '
    'globalThis.__FD_BOOT_212__ ||= globalThis.__FD_BOOT_213__; '
    'globalThis.__FD_BOOT_211__ ||= globalThis.__FD_BOOT_213__; '
    'globalThis.__FD_BOOT_210__ ||= globalThis.__FD_BOOT_213__;'
    '</script>'
)
text, count = pattern.subn(replacement, text, count=1)
if count != 1:
    raise RuntimeError(f'build 213 boot bridge anchor count={count}')

# The bridge must occur before the v213 runtime shell captures its boot owner.
bridge_at = text.find('id="fd-boot-bridge213"')
shell_at = text.find('runtime-shell-v213.js?build=213')
if bridge_at < 0 or shell_at < 0 or bridge_at > shell_at:
    raise RuntimeError('build 213 boot bridge ordering invalid')

HTML.write_text(text, 'utf-8')
print('Build 213 boot bridge now defines __FD_BOOT_213__ before runtime-shell-v213')
