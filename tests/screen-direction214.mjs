import { readFile, writeFile } from 'node:fs/promises';

const sourceUrl = new URL('./screen-direction210.mjs', import.meta.url);
const generatedUrl = new URL('./screen-direction214.generated.mjs', import.meta.url);
let source = await readFile(sourceUrl, 'utf8');
source = source
  .replace('[210, 211].includes(Number(globalThis.__FD_RUNTIME_SHELL_210__?.build))', '[210, 211, 212, 213, 214].includes(Number(globalThis.__FD_RUNTIME_SHELL_210__?.build))')
  .replace("{ ok: true, build: 210, compatibleShellBuilds: [210, 211]", "{ ok: true, build: 214, compatibleShellBuilds: [210, 211, 212, 213, 214]");
if (!source.includes('[210, 211, 212, 213, 214].includes')) throw new Error('build 214 screen-direction compatibility patch did not apply');
await writeFile(generatedUrl, source, 'utf8');
await import(generatedUrl.href);
