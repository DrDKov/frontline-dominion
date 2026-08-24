#!/usr/bin/env node
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';

const root = resolve(process.argv.includes('--root') ? process.argv[process.argv.indexOf('--root') + 1] : 'src/legacy');
const jsonOut = process.argv.includes('--json') ? process.argv[process.argv.indexOf('--json') + 1] : null;

async function walk(dir) {
  const out = [];
  for (const ent of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) out.push(...await walk(p)); else out.push(p);
  }
  return out;
}

const paths = await walk(root);
const rels = paths.map(p => relative(root, p).replaceAll('\\', '/'));
const versioned = rels.filter(p => /-v\d+(?=\.(?:js|mjs|css|json)$)/i.test(p));
const proposals = versioned.map(from => ({ from, to: from.replace(/-v\d+(?=\.(?:js|mjs|css|json)$)/i, '') }));
const targets = new Map();
for (const p of proposals) {
  if (!targets.has(p.to)) targets.set(p.to, []);
  targets.get(p.to).push(p.from);
}
const collisions = [...targets.entries()].filter(([, owners]) => owners.length > 1).map(([to, from]) => ({ to, from }));
const existingConflicts = proposals.filter(p => rels.includes(p.to) && p.to !== p.from);

const textFiles = paths.filter(p => ['.js', '.mjs', '.html', '.css', '.json'].includes(extname(p).toLowerCase()));
const referenceCounts = new Map(versioned.map(v => [v, 0]));
for (const path of textFiles) {
  const text = await readFile(path, 'utf8').catch(() => '');
  for (const old of versioned) {
    const base = basename(old);
    if (text.includes(base)) referenceCounts.set(old, referenceCounts.get(old) + 1);
  }
}
for (const p of proposals) p.referenceFiles = referenceCounts.get(p.from) || 0;

const report = {
  root,
  versionedFiles: proposals.length,
  collisionCount: collisions.length,
  existingConflictCount: existingConflicts.length,
  safeRenameCount: proposals.length - new Set([...collisions.flatMap(c => c.from), ...existingConflicts.map(c => c.from)]).size,
  collisions,
  existingConflicts,
  proposals,
};
if (jsonOut) await writeFile(resolve(jsonOut), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(`unversioned plan: versioned=${report.versionedFiles} safe=${report.safeRenameCount} collisions=${report.collisionCount} existingConflicts=${report.existingConflictCount}`);
for (const c of collisions) console.log(`collision: ${c.to} <= ${c.from.join(', ')}`);
for (const c of existingConflicts) console.log(`existing target: ${c.from} -> ${c.to}`);
process.exitCode = collisions.length || existingConflicts.length ? 2 : 0;
