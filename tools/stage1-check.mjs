#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { extname, join, relative, resolve } from 'node:path';
import version from '../src/version.js';

const ROOT = resolve('.');
const SRC = join(ROOT, 'src');
const LEGACY = join(SRC, 'legacy');
const DIST = join(ROOT, 'dist');
const strictSource = process.argv.includes('--strict-source');
const strictModules = process.argv.includes('--strict-modules');
const errors = [];
const warnings = [];

function run(command, args, { allow = [0] } = {}) {
  const r = spawnSync(command, args, { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  if (!allow.includes(r.status)) errors.push(`${command} ${args.join(' ')} exited ${r.status}`);
  return r;
}

async function walk(dir) {
  const out = [];
  for (const ent of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) out.push(...await walk(p)); else out.push(p);
  }
  return out;
}

const sha256 = async path => createHash('sha256').update(await readFile(path)).digest('hex');

const pkg = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8'));
if (pkg.scripts?.build !== 'node tools/build.mjs') errors.push('package.json build must be exactly: node tools/build.mjs');
if (/assemble\d+|hotfix\d+|replace_once/i.test(pkg.scripts?.build || '')) errors.push('patch/assemble chain leaked into npm build');

run('node', ['tools/build.mjs']);
run('node', ['tools/checkdeps.mjs', '--root', 'dist', '--entry', 'frontline-dominion.html', '--json', '.stage1-deps.json', ...(strictModules ? ['--strict-declarations', '--strict-iife'] : [])]);
run('node', ['tools/plan-unversioned.mjs', '--root', 'src/legacy', '--json', '.stage1-unversioned.json'], { allow: [0, 2] });

const meta = JSON.parse(await readFile(join(DIST, 'build-meta.json'), 'utf8'));
if (meta.build !== version.BUILD || meta.version !== version.VERSION) errors.push(`build metadata mismatch: ${JSON.stringify(meta)}`);

const manifest = JSON.parse(await readFile(join(ROOT, 'scripts/legacy-manifest.json'), 'utf8'));
if (manifest.files.length !== 836) warnings.push(`legacy manifest expected historical 836 files, got ${manifest.files.length}`);
const sourceFiles = await walk(LEGACY);
const sourceRuntime = sourceFiles.filter(p => relative(LEGACY, p).replaceAll('\\', '/') !== 'PROVENANCE.md');
if (sourceRuntime.length !== manifest.files.length) errors.push(`src/legacy runtime file count ${sourceRuntime.length} != manifest ${manifest.files.length}`);

let hashDrift = 0;
for (const entry of manifest.files) {
  const built = join(DIST, entry.path);
  try {
    if (await sha256(built) !== entry.sha256) hashDrift += 1;
  } catch { errors.push(`missing built file ${entry.path}`); }
}
if (version.BUILD === manifest.build && meta.cacheBustMode === 'replace-existing' && hashDrift) errors.push(`baseline build must be byte-equivalent: ${hashDrift} pinned files drifted`);
if (version.BUILD !== manifest.build && !hashDrift) warnings.push('new build produced zero byte drift from pinned baseline');

const allSrc = await walk(SRC);
let legacyVersionedNames = 0;
let legacyBuildQueries = 0;
let illegalOutsideLegacy = 0;
for (const path of allSrc) {
  const rel = relative(SRC, path).replaceAll('\\', '/');
  if (rel === 'version.js' || !['.js', '.mjs', '.html', '.css', '.json'].includes(extname(path).toLowerCase())) continue;
  const text = await readFile(path, 'utf8').catch(() => '');
  const inLegacy = rel.startsWith('legacy/');
  const buildRefs = (text.match(/\?build=\d+/g) || []).length;
  if (inLegacy) {
    legacyBuildQueries += buildRefs;
    if (/-v\d+\.(?:js|mjs|css|json)$/i.test(rel)) legacyVersionedNames += 1;
  } else if (buildRefs || /\bBUILD\s*[=:]\s*\d+/.test(text) || /-v\d+\.(?:js|mjs)/i.test(text)) {
    illegalOutsideLegacy += 1;
    errors.push(`${rel}: build coupling outside grandfathered legacy source`);
  }
}
if (strictSource && (legacyVersionedNames || legacyBuildQueries)) errors.push(`strict source policy: legacy still has ${legacyVersionedNames} versioned filenames and ${legacyBuildQueries} ?build references`);
else if (legacyVersionedNames || legacyBuildQueries) warnings.push(`migration debt: legacy has ${legacyVersionedNames} versioned filenames and ${legacyBuildQueries} ?build references`);

const provenance = await readFile(join(LEGACY, 'PROVENANCE.md'), 'utf8').catch(() => '');
if (!/files:\s*836/.test(provenance) || !/build:\s*213/.test(provenance)) errors.push('src/legacy/PROVENANCE.md does not describe the pinned snapshot');

console.log(`stage1 check: build=${version.BUILD} hashDrift=${hashDrift} versionedNames=${legacyVersionedNames} buildQueries=${legacyBuildQueries} errors=${errors.length} warnings=${warnings.length}`);
for (const w of warnings) console.log(`stage1 warning: ${w}`);
for (const e of errors) console.error(`stage1 error: ${e}`);
process.exitCode = errors.length ? 1 : 0;
