#!/usr/bin/env node
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import version from '../src/version.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');
const DIST = join(ROOT, 'dist');
const config = JSON.parse(await readFile(join(SRC, 'manifest.json'), 'utf8'));
const legacyManifest = JSON.parse(await readFile(resolve(SRC, config.legacySnapshotManifest), 'utf8'));
const sourceRoot = resolve(SRC, config.sourceRoot);
const TEXT_EXT = new Set(['.js', '.html', '.css', '.json', '.mjs']);
const cacheMode = config.cacheBust?.mode || 'inject';
const pageModules = Array.isArray(config.pageModules) ? [...new Set(config.pageModules)] : [];
const workerModules = Array.isArray(config.workerModules) ? [...new Set(config.workerModules)] : [];

function hasBuildParam(url) {
  return /(?:[?&])build=\d+(?:&|#|$)/.test(String(url));
}

function stripBuildParam(url) {
  const [beforeHash, hash = ''] = String(url).split('#', 2);
  const q = beforeHash.indexOf('?');
  if (q < 0) return beforeHash + (hash ? `#${hash}` : '');
  const base = beforeHash.slice(0, q);
  const params = beforeHash.slice(q + 1).split('&').filter(Boolean).filter(p => !/^build=\d+$/.test(p));
  return base + (params.length ? `?${params.join('&')}` : '') + (hash ? `#${hash}` : '');
}

function withBuild(url) {
  if (!url || /^(?:https?:|data:|blob:|#|javascript:)/i.test(url)) return url;
  if (cacheMode === 'replace-existing' && !hasBuildParam(url)) return url;
  const clean = stripBuildParam(url);
  const [beforeHash, hash = ''] = clean.split('#', 2);
  const sep = beforeHash.includes('?') ? '&' : '?';
  return `${beforeHash}${sep}build=${version.BUILD}${hash ? `#${hash}` : ''}`;
}

function rewriteHtml(text) {
  if (!config.cacheBust?.html) return text;
  return text.replace(/\b(src|href)=(['"])([^'"]+\.(?:html|js|mjs|css|json)(?:\?[^'"]*)?(?:#[^'"]*)?)\2/g,
    (_m, attr, quote, url) => `${attr}=${quote}${withBuild(url)}${quote}`);
}

function rewriteImportScripts(text) {
  if (!config.cacheBust?.workerImportScripts || !text.includes('importScripts')) return text;
  return text.replace(/importScripts\s*\(([^;]*?)\)/gs, (_whole, args) => {
    const next = args.replace(/(['"])([^'"]+\.js(?:\?[^'"]*)?(?:#[^'"]*)?)\1/g,
      (_m, quote, url) => `${quote}${withBuild(url)}${quote}`);
    return `importScripts(${next})`;
  });
}

function injectPageModules(text) {
  if (!pageModules.length) return text;
  const tags = pageModules.map(rel => `  <script src="./${withBuild(rel)}"></script>`).join('\n');
  const marker = '<!-- FD_MANIFEST_PAGE_MODULES -->';
  const block = `${marker}\n${tags}\n`;
  if (text.includes(marker)) return text;
  const bodyClose = text.lastIndexOf('</body>');
  return bodyClose >= 0 ? `${text.slice(0, bodyClose)}${block}${text.slice(bodyClose)}` : `${text}\n${block}`;
}

function injectWorkerModules(text) {
  if (!workerModules.length) return text;
  const marker = '// FD_MANIFEST_WORKER_MODULES';
  if (text.includes(marker)) return text;
  const args = workerModules.map(rel => `'./${withBuild(rel)}'`).join(', ');
  return `${text.replace(/\s*$/, '')}\n\n${marker}\nimportScripts(${args});\n`;
}

async function copySource(relPath) {
  const from = join(sourceRoot, relPath);
  const to = join(DIST, relPath);
  await mkdir(dirname(to), { recursive: true });
  const ext = extname(relPath).toLowerCase();
  if (!TEXT_EXT.has(ext)) {
    await cp(from, to);
    return;
  }
  let text = await readFile(from, 'utf8');
  if (ext === '.html') text = rewriteHtml(text);
  if (ext === '.js' || ext === '.mjs') text = rewriteImportScripts(text);
  if (relPath === config.entry) text = injectPageModules(text);
  if (relPath === config.worker) text = injectWorkerModules(text);
  await writeFile(to, text, 'utf8');
}

const legacyFiles = legacyManifest.files.map(f => f.path);
const extraFiles = Array.isArray(config.extraFiles) ? config.extraFiles : [];
const declaredModules = [...new Set([...pageModules, ...workerModules])];
const allFiles = [...new Set([...legacyFiles, ...extraFiles, ...declaredModules])].sort();

await rm(DIST, { recursive: true, force: true });
await mkdir(DIST, { recursive: true });
for (const relPath of allFiles) await copySource(relPath);

const metadata = {
  build: version.BUILD,
  version: version.VERSION,
  protocolVersion: version.PROTOCOL_VERSION,
  source: 'src/legacy',
  sourceManifestSchema: config.schemaVersion,
  cacheBustMode: cacheMode,
  pinnedFiles: legacyFiles.length,
  extraFiles: extraFiles.length,
  pageModules,
  workerModules,
  files: allFiles.length,
};
await writeFile(join(DIST, 'build-meta.json'), `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');
console.log(`stage1 build: ${allFiles.length} source files -> dist; pinned=${legacyFiles.length} extra=${extraFiles.length} modules=${declaredModules.length} build=${version.BUILD} version=${version.VERSION} cache=${cacheMode}`);
