#!/usr/bin/env python3
# Publication trigger: canonical build 214 with adaptive AI and engineer control.
from pathlib import Path

ROOT = Path('.')
OUT = ROOT / 'dist'
HTML = OUT / 'frontline-dominion.html'
WORKER = OUT / 'authoritative-simulation-worker-v174.js'
AI_RESERVE = OUT / 'ai-logistics-mobile-reserve.js'
AI_STRATEGY = OUT / 'ai-logistics-strategy.js'
AI_ADAPTIVE = OUT / 'ai-logistics-adaptive-controller.js'
ENGINEER = OUT / 'engineer-command-control.js'

for path in (HTML, WORKER, AI_RESERVE, AI_STRATEGY, AI_ADAPTIVE, ENGINEER):
    if not path.exists():
        raise RuntimeError(f'build 214 adaptive module input missing: {path}')

html = HTML.read_text('utf-8')
ai_anchor = '<script src="./ai-economy-logistics-v214.js?build=214"></script>'
reserve_tag = '<script src="./ai-logistics-mobile-reserve.js?build=214"></script>'
ai_tag = '<script src="./ai-logistics-strategy.js?build=214"></script>'
adaptive_tag = '<script src="./ai-logistics-adaptive-controller.js?build=214"></script>'
engineer_tag = '<script src="./engineer-command-control.js?build=214"></script>'
if html.count(ai_anchor) != 1:
    raise RuntimeError(f'build 214 HTML AI anchor count={html.count(ai_anchor)}')
if reserve_tag not in html:
    html = html.replace(ai_anchor, ai_anchor + '\n' + reserve_tag, 1)
if ai_tag not in html:
    html = html.replace(reserve_tag, reserve_tag + '\n' + ai_tag, 1)
if adaptive_tag not in html:
    html = html.replace(ai_tag, ai_tag + '\n' + adaptive_tag, 1)
if engineer_tag not in html:
    html = html.replace(adaptive_tag, adaptive_tag + '\n' + engineer_tag, 1)
if html.count(reserve_tag) != 1 or html.count(ai_tag) != 1 or html.count(adaptive_tag) != 1 or html.count(engineer_tag) != 1:
    raise RuntimeError('build 214 adaptive HTML owner duplication')
HTML.write_text(html, 'utf-8')

worker = WORKER.read_text('utf-8')
worker_anchor = "importScripts('/frontline-dominion/ai-economy-logistics-v214.js?build=214');"
reserve_import = "importScripts('/frontline-dominion/ai-logistics-mobile-reserve.js?build=214');"
ai_import = "importScripts('/frontline-dominion/ai-logistics-strategy.js?build=214');"
adaptive_import = "importScripts('/frontline-dominion/ai-logistics-adaptive-controller.js?build=214');"
engineer_import = "importScripts('/frontline-dominion/engineer-command-control.js?build=214');"
if worker.count(worker_anchor) != 1:
    raise RuntimeError(f'build 214 Worker AI anchor count={worker.count(worker_anchor)}')
if reserve_import not in worker:
    worker = worker.replace(worker_anchor, worker_anchor + '\n' + reserve_import, 1)
if ai_import not in worker:
    worker = worker.replace(reserve_import, reserve_import + '\n' + ai_import, 1)
if adaptive_import not in worker:
    worker = worker.replace(ai_import, ai_import + '\n' + adaptive_import, 1)
if engineer_import not in worker:
    worker = worker.replace(adaptive_import, adaptive_import + '\n' + engineer_import, 1)
if worker.count(reserve_import) != 1 or worker.count(ai_import) != 1 or worker.count(adaptive_import) != 1 or worker.count(engineer_import) != 1:
    raise RuntimeError('build 214 adaptive Worker owner duplication')
WORKER.write_text(worker, 'utf-8')

manifest = OUT / 'build214-manifest.json'
if manifest.exists():
    text = manifest.read_text('utf-8')
    if 'adaptive-ai-logistics-strategy' not in text:
        text = text.replace('"ai-logistics-recovery"', '"ai-logistics-recovery", "adaptive-ai-mobile-reserve", "adaptive-ai-logistics-strategy", "adaptive-ai-logistics-controller", "explicit-engineer-construction"')
    elif 'adaptive-ai-mobile-reserve' not in text:
        text = text.replace('"adaptive-ai-logistics-strategy"', '"adaptive-ai-mobile-reserve", "adaptive-ai-logistics-strategy"')
    if 'adaptive-ai-logistics-controller' not in text:
        text = text.replace('"adaptive-ai-logistics-strategy"', '"adaptive-ai-logistics-strategy", "adaptive-ai-logistics-controller"')
    if 'explicit-engineer-construction' not in text:
        text = text.replace('"adaptive-ai-logistics-controller"', '"adaptive-ai-logistics-controller", "explicit-engineer-construction"')
    manifest.write_text(text, 'utf-8')

print('Build 214 mobile logistics reserve, adaptive planner and explicit engineer construction authority injected into page and Worker')
