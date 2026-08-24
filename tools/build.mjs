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
  const clean = stripBuildParam(url);
  const [beforeHash, hash = ''] = clean.split('#', 2);
  const sep = beforeHash.includes('?') ? '&' : '?';
  return `${beforeHash}${sep}build=${version.BUILD}${hash ? `#${hash}` : ''}`;
}

function rewriteHtml(text) {
  if (!config.cacheBust?.html) return text;
  return text.replace(/\b(src|href)=(['"])([^'"]+\.(?:js|mjs|css|json)(?:\?[^'"]*)?(?:#[^'"]*)?)\2/g,
    (_m, attr, quote, url) => `${attr}=${quote}${withBuild(url)}${quote}`);
}

function rewriteImportScripts(text) {
  if (!config.cacheBust?.workerImportScripts || !text.includes('importScripts')) return text;
  return text.replace(/importScripts\s*\(([^;]*?)\)/gs, (whole, args) => {
    const next = args.replace(/(['"])([^'"]+\.js(?:\?[^'"]*)?(?:#[^'"]*)?)\1/g,
      (_m, quote, url) => `${quote}${withBuild(url)}${quote}`);
    return `importScripts(${next})`;
  });
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
  if (relPath === config.entry) text = rewriteHtml(text);
  if (ext === '.js' || ext === '.mjs') text = rewriteImportScripts(text);
  await writeFile(to, text, 'utf8');
}

const legacyFiles = legacyManifest.files.map(f => f.path);
const extraFiles = Array.isArray(config.extraFiles) ? config.extraFiles : [];
const allFiles = [...new Set([...legacyFiles, ...extraFiles])].sort();

await rm(DIST, { recursive: true, force: true });
await mkdir(DIST, { recursive: true });
for (const relPath of allFiles) await copySource(relPath);

const metadata = {
  build: version.BUILD,
  version: version.VERSION,
  protocolVersion: version.PROTOCOL_VERSION,
  source: 'src/legacy',
  sourceManifestSchema: config.schemaVersion,
  files: allFiles.length,
};
await writeFile(join(DIST, 'build-meta.json'), `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');
console.log(`stage1 build: ${allFiles.length} source files -> dist; build=${version.BUILD} version=${version.VERSION}`);
