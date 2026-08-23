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

// Context input is accepted on the main thread and becomes authoritative only
// after the Worker has processed the command and replicated state back.  A
// synchronous bridge.seq increment is not part of the contract (and may differ
// between local and GitHub Pages timing), so validate the replicated gameplay
// state after several Worker ticks instead.
const assignmentPattern = /const assigned = await page\.evaluate\(I => \{[\s\S]*?\}, I\);\nif\(!assigned\.issued\|\|assigned\.mission!==\'EXTRACT_RESOURCE\'\|\|assigned\.source!==assigned\.extractorId\|\|assigned\.sentSeq<=assigned\.beforeSeq\) throw new Error\(`context extraction assignment failed \$\{JSON\.stringify\(assigned\)\}`\);/;
if (!assignmentPattern.test(source)) throw new Error('build 213 context assignment assertion missing');
source = source.replace(assignmentPattern, `const assignmentIssued = await page.evaluate(I => {
  const g=globalThis.__FD_DEBUG__.game,f=globalThis.__FD213_FIXTURE__,truck=g.getEntity(I.truck),extractor=g.getEntity(f.ids[0]),bridge=globalThis.__FD_STABLE_STATE165__.bridge;
  g.setSelection([truck],false);
  const beforeSeq=Number(bridge?.seq||0),beforeAck=Number(bridge?.lastAck||0),beforeTick=Number(bridge?.workerTick||0);
  const issued=g.issueContext(extractor.x,extractor.y,false);
  return {issued,beforeSeq,beforeAck,beforeTick,extractorId:extractor.id};
}, I);
if(!assignmentIssued.issued) throw new Error(\`context extraction command was rejected \${JSON.stringify(assignmentIssued)}\`);
const assigned = await waitFor(({I,issued}) => {
  const g=globalThis.__FD_DEBUG__.game,L=globalThis.__FD_LOGISTICS206__,bridge=globalThis.__FD_STABLE_STATE165__.bridge,truck=g.getEntity(I.truck),s=L.ensureUnit(truck,false);
  const out={issued:true,beforeSeq:issued.beforeSeq,sentSeq:Number(bridge?.seq||0),beforeAck:issued.beforeAck,lastAck:Number(bridge?.lastAck||0),beforeTick:issued.beforeTick,workerTick:Number(bridge?.workerTick||0),mission:s?.missionType,source:s?.sourceNodeId,destination:s?.destinationNodeId||null,extractorId:issued.extractorId};
  const workerAdvanced=out.workerTick>=issued.beforeTick+3;
  const authoritativeState=out.mission==='EXTRACT_RESOURCE'&&out.source===issued.extractorId;
  return workerAdvanced&&authoritativeState?out:{__pending:true,...out};
}, {I,issued:assignmentIssued}, 20000);`);

await writeFile(generatedUrl, source, 'utf8');
await import(generatedUrl.href);
