#!/usr/bin/env node
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { extname, join, relative, resolve } from 'node:path';

const args = process.argv.slice(2);
const value = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const has = name => args.includes(name);
const root = resolve(value('--root') || 'src/legacy');
const entry = value('--entry') || 'frontline-dominion.html';
const jsonOut = value('--json');
const strictDeclarations = has('--strict-declarations');
const strictIife = has('--strict-iife');
const writeDeclarations = has('--write-declarations');

const PROVIDE_RE = /(?:globalThis|window|self|root)\s*\.\s*(__FD_[A-Z0-9_]+__)\s*(?:=|\|\|=)(?!=)/g;
const MENTION_RE = /(__FD_[A-Z0-9_]+__)/g;
const HEADER_RE = /^\s*\/\/\s*(requires|provides)\s*:\s*(.*?)\s*$/gmi;
const HOST = new Set(['__FD_DEBUG__']);
const HOST_PREFIX = ['__FD_DEBUG'];
const AGGREGATE_HINTS = ['authoritative-simulation-bundle', 'authoritative-simulation-shim'];

async function walk(dir) {
  const out = [];
  for (const ent of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) out.push(...await walk(p));
    else out.push(p);
  }
  return out;
}

function cleanStringLiterals(text) {
  return text
    .replace(/`(?:\\.|[^`])*`/gs, m => ' '.repeat(m.length))
    .replace(/"(?:\\.|[^"\\])*"/gs, m => ' '.repeat(m.length))
    .replace(/'(?:\\.|[^'\\])*'/gs, m => ' '.repeat(m.length));
}

function parseHeaders(text) {
  const declared = { requires: [], provides: [] };
  let m;
  HEADER_RE.lastIndex = 0;
  while ((m = HEADER_RE.exec(text))) {
    const key = m[1].toLowerCase();
    declared[key].push(...m[2].split(',').map(x => x.trim()).filter(Boolean));
  }
  declared.requires = [...new Set(declared.requires)].sort();
  declared.provides = [...new Set(declared.provides)].sort();
  return declared;
}

function inferProvides(text) {
  return [...new Set([...text.matchAll(PROVIDE_RE)].map(m => m[1]))].sort();
}

function inferRequires(text, provides) {
  const masked = cleanStringLiterals(text);
  const required = new Set();
  for (const line of masked.split('\n')) {
    for (const m of line.matchAll(MENTION_RE)) {
      const g = m[1];
      if (provides.includes(g) || HOST.has(g) || HOST_PREFIX.some(p => g.startsWith(p))) continue;
      const before = line.slice(Math.max(0, m.index - 12), m.index);
      const after = line.slice(m.index + g.length, m.index + g.length + 2);
      if (after === '?.' || /(typeof\s*|\|\|\s*|\?\?\s*)$/.test(before) || line.includes('||=')) continue;
      required.add(g);
    }
  }
  return [...required].sort();
}

function isIife(text) {
  const stripped = text.replace(/^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*/, '');
  return /^(?:['"]use strict['"];?\s*)?(?:\(\(\)\s*=>\s*\{|\(function\s*\(|!function\s*\()/m.test(stripped);
}

function localUrl(url) {
  if (!url || /^(?:https?:|data:|blob:|javascript:|#)/i.test(url)) return null;
  return url.replace(/^\/frontline-dominion\//, '').replace(/^\.\//, '').split(/[?#]/, 1)[0];
}

function parseLoads(text, file) {
  const loads = [];
  if (extname(file) === '.html') {
    for (const m of text.matchAll(/\b(?:src|href)=(['"])([^'"]+)\1/g)) {
      const u = localUrl(m[2]);
      if (u && /\.(?:js|mjs|css|json)$/i.test(u)) loads.push(u);
    }
  }
  for (const block of text.matchAll(/importScripts\s*\(([^;]*?)\)/gs)) {
    for (const m of block[1].matchAll(/(['"])([^'"]+)\1/g)) {
      const u = localUrl(m[2]);
      if (u) loads.push(u);
    }
  }
  return loads;
}

function cycleList(graph) {
  const state = new Map();
  const stack = [];
  const cycles = [];
  const visit = node => {
    const s = state.get(node) || 0;
    if (s === 1) {
      const i = stack.indexOf(node);
      cycles.push([...stack.slice(i), node]);
      return;
    }
    if (s === 2) return;
    state.set(node, 1); stack.push(node);
    for (const next of graph.get(node) || []) visit(next);
    stack.pop(); state.set(node, 2);
  };
  for (const node of graph.keys()) visit(node);
  return cycles;
}

const files = (await walk(root)).filter(p => ['.js', '.mjs', '.html'].includes(extname(p)));
const modules = [];
const errors = [];
const warnings = [];

for (const path of files.sort()) {
  const file = relative(root, path).replaceAll('\\', '/');
  let text = await readFile(path, 'utf8');
  const declared = parseHeaders(text);
  const inferredProvides = inferProvides(text);
  const inferredRequires = inferRequires(text, inferredProvides);
  const hasHeaders = declared.requires.length > 0 || declared.provides.length > 0;
  if (writeDeclarations && extname(file) !== '.html' && !hasHeaders) {
    const header = `// requires: ${inferredRequires.join(', ')}\n// provides: ${inferredProvides.join(', ')}\n`;
    await writeFile(path, header + text, 'utf8');
    text = header + text;
  }
  const finalDeclared = writeDeclarations ? parseHeaders(text) : declared;
  const provides = finalDeclared.provides.length ? finalDeclared.provides : inferredProvides;
  const requires = finalDeclared.requires.length ? finalDeclared.requires : inferredRequires;
  const isDeclared = Boolean(finalDeclared.requires.length || finalDeclared.provides.length);
  if (strictDeclarations && extname(file) !== '.html' && !isDeclared)
    errors.push(`${file}: missing // requires and // provides declaration block`);
  if (strictIife && extname(file) !== '.html' && !isIife(text)) errors.push(`${file}: module is not a single top-level IIFE`);
  if (finalDeclared.provides.length && JSON.stringify(finalDeclared.provides) !== JSON.stringify(inferredProvides))
    warnings.push(`${file}: declared provides differs from inferred provides`);
  if (finalDeclared.requires.length) {
    const undeclared = inferredRequires.filter(x => !finalDeclared.requires.includes(x));
    if (undeclared.length) errors.push(`${file}: undeclared hard requires: ${undeclared.join(', ')}`);
  }
  modules.push({ file, requires, orderRequires: finalDeclared.requires, provides, inferredRequires, inferredProvides, loads: parseLoads(text, file), iife: extname(file) === '.html' ? null : isIife(text), declared: isDeclared });
}

const byFile = new Map(modules.map(m => [m.file, m]));
const providers = new Map();
for (const mod of modules) for (const g of mod.provides) {
  if (!providers.has(g)) providers.set(g, []);
  providers.get(g).push(mod.file);
}

for (const mod of modules) for (const g of mod.requires) {
  const owners = providers.get(g) || [];
  if (!owners.length && !HOST.has(g) && !HOST_PREFIX.some(p => g.startsWith(p))) errors.push(`${mod.file}: unresolved ${g}`);
}
for (const [g, owners] of providers) {
  if (owners.length > 1 && !owners.some(f => AGGREGATE_HINTS.some(h => f.includes(h)))) warnings.push(`${g}: multiple providers: ${owners.join(', ')}`);
}

const graph = new Map(modules.map(m => [m.file, new Set()]));
for (const mod of modules) for (const g of mod.requires) {
  const owners = providers.get(g) || [];
  const preferred = owners.find(f => !AGGREGATE_HINTS.some(h => f.includes(h))) || owners[0];
  if (preferred && preferred !== mod.file) graph.get(mod.file).add(preferred);
}
const cycles = cycleList(graph);
for (const cycle of cycles) errors.push(`dependency cycle: ${cycle.join(' -> ')}`);

// Load-order is authoritative only for explicit declarations. Legacy inferred
// references can be lazy (inside functions invoked after all scripts loaded),
// so treating every inferred mention as an eager dependency creates false
// positives. --strict-declarations makes this exact after Stage 1d migration.
for (const loader of modules.filter(m => m.loads.length)) {
  const order = new Map(loader.loads.map((f, i) => [f, i]));
  for (const consumerName of loader.loads) {
    const consumer = byFile.get(consumerName);
    if (!consumer?.declared) continue;
    for (const g of consumer.orderRequires) {
      const owner = (providers.get(g) || []).find(f => order.has(f));
      if (!owner) continue;
      if (order.get(owner) > order.get(consumerName)) errors.push(`${loader.file}: load order invalid; ${consumerName} requires ${g} from later ${owner}`);
    }
  }
}

for (const mod of modules) for (const target of mod.loads) {
  if (!byFile.has(target) && !/^\/?cdn-cgi\//.test(target) && /\.(?:js|mjs)$/i.test(target)) errors.push(`${mod.file}: missing load target ${target}`);
}

const report = {
  root,
  entry,
  moduleCount: modules.length,
  providerCount: providers.size,
  declaredModules: modules.filter(m => m.declared).length,
  iifeModules: modules.filter(m => m.iife).length,
  cycles,
  warnings,
  errors,
  modules,
};
if (jsonOut) await writeFile(resolve(jsonOut), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(`checkdeps: modules=${report.moduleCount} providers=${report.providerCount} declared=${report.declaredModules} cycles=${cycles.length} errors=${errors.length} warnings=${warnings.length}`);
for (const w of warnings.slice(0, 30)) console.log(`checkdeps warning: ${w}`);
for (const e of errors.slice(0, 60)) console.error(`checkdeps error: ${e}`);
process.exitCode = errors.length ? 1 : 0;
