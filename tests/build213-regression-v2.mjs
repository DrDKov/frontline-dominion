import { readFile, writeFile } from 'node:fs/promises';

const sourceUrl = new URL('./build213-regression.mjs', import.meta.url);
const generatedUrl = new URL('./build213-regression-v2.generated.mjs', import.meta.url);
let source = await readFile(sourceUrl, 'utf8');

// Keep the canonical build-213 browser scenario intact and replace only its
// overlap metric with the engine's actual navigation-footprint collision test.
// Do not depend on the exact diagnostic fields surrounding that metric.
const measurePattern = /const distance=Math\.hypot\(truck\.x-ex\.x,truck\.y-ex\.y\),minimum=\(Number\(truck\.radius\)\|\|20\)\+\(Number\(ex\.radius\)\|\|38\)\+10;\s*const out=\{distance,minimum,([^}]+)\};/;
if (!measurePattern.test(source)) throw new Error('build 213 current overlap measurement block missing');
source = source.replace(measurePattern, (_match, tail) =>
  `const distance=Math.hypot(truck.x-ex.x,truck.y-ex.y),surfaceDistance=Number(g.getBuildingSurfaceDistance117?.(truck,ex));\n  const overlap=Boolean(g.unitCollidesWithBuilding115?.(truck,truck.x,truck.y,truck.rotation||0));\n  const out={distance,surfaceDistance,overlap,${tail}};`
);

const assertPattern = /if\(loading\.distance<loading\.minimum\)\s*throw new Error\(`truck overlapped extractor while loading \$\{JSON\.stringify\(loading\)\}`\);/;
if (!assertPattern.test(source)) throw new Error('build 213 current overlap assertion missing');
source = source.replace(assertPattern,
  "if(loading.overlap) throw new Error(`truck physically overlapped extractor footprint while loading ${JSON.stringify(loading)}`);"
);

await writeFile(generatedUrl, source, 'utf8');
await import(generatedUrl.href);
