#!/usr/bin/env python3
# Publication trigger: canonical build 214 with adaptive AI and engineer control.
from pathlib import Path

ROOT = Path('.')
OUT = ROOT / 'dist'
HTML = OUT / 'frontline-dominion.html'
WORKER = OUT / 'authoritative-simulation-worker-v174.js'
AI_STRATEGY = OUT / 'ai-logistics-strategy.js'
ENGINEER = OUT / 'engineer-command-control.js'

for path in (HTML, WORKER, AI_STRATEGY, ENGINEER):
    if not path.exists():
        raise RuntimeError(f'build 214 adaptive module input missing: {path}')

html = HTML.read_text('utf-8')
ai_anchor = '<script src="./ai-economy-logistics-v214.js?build=214"></script>'
ai_tag = '<script src="./ai-logistics-strategy.js?build=214"></script>'
engineer_tag = '<script src="./engineer-command-control.js?build=214"></script>'
if html.count(ai_anchor) != 1:
    raise RuntimeError(f'build 214 HTML AI anchor count={html.count(ai_anchor)}')
if ai_tag not in html:
    html = html.replace(ai_anchor, ai_anchor + '\n' + ai_tag, 1)
if engineer_tag not in html:
    html = html.replace(ai_tag, ai_tag + '\n' + engineer_tag, 1)
if html.count(ai_tag) != 1 or html.count(engineer_tag) != 1:
    raise RuntimeError('build 214 adaptive HTML owner duplication')
HTML.write_text(html, 'utf-8')

worker = WORKER.read_text('utf-8')
worker_anchor = "importScripts('/frontline-dominion/ai-economy-logistics-v214.js?build=214');"
ai_import = "importScripts('/frontline-dominion/ai-logistics-strategy.js?build=214');"
engineer_import = "importScripts('/frontline-dominion/engineer-command-control.js?build=214');"
if worker.count(worker_anchor) != 1:
    raise RuntimeError(f'build 214 Worker AI anchor count={worker.count(worker_anchor)}')
if ai_import not in worker:
    worker = worker.replace(worker_anchor, worker_anchor + '\n' + ai_import, 1)
if engineer_import not in worker:
    worker = worker.replace(ai_import, ai_import + '\n' + engineer_import, 1)
if worker.count(ai_import) != 1 or worker.count(engineer_import) != 1:
    raise RuntimeError('build 214 adaptive Worker owner duplication')
WORKER.write_text(worker, 'utf-8')

manifest = OUT / 'build214-manifest.json'
if manifest.exists():
    text = manifest.read_text('utf-8')
    if 'adaptive-ai-logistics-strategy' not in text:
        text = text.replace('"ai-logistics-recovery"', '"ai-logistics-recovery", "adaptive-ai-logistics-strategy", "manual-engineer-construction"')
        manifest.write_text(text, 'utf-8')

print('Build 214 adaptive AI logistics and engineer command-control owners injected into page and Worker')
