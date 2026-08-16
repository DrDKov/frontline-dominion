# Frontline Dominion

Browser RTS — **v16.4.2, build 177**.

Live target: `https://drdkov.github.io/frontline-dominion/`

Build 177 adds persistent fire discipline for selected armed units (`J · Не стрелять / Огонь разрешить`) and keeps the build 176 minimap stability fix.

## Deployment

The repository stores only the small code delta for builds 176/177. GitHub Actions mirrors the unchanged build 174 runtime assets from the existing public Frontline Dominion site, applies the version patches, rewrites root-absolute asset URLs for the GitHub Pages project path, and deploys the assembled static site.

This avoids duplicating roughly 144 MB of model/sprite assets through the GitHub Contents API while preserving the full game runtime.
