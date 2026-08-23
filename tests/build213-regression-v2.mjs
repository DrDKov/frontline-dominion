import { readFile, writeFile } from 'node:fs/promises';

const sourceUrl = new URL('./build213-regression.mjs', import.meta.url);
const generatedUrl = new URL('./build213-regression-v2.generated.mjs', import.meta.url);
let source = await readFile(sourceUrl, 'utf8');
const oldMeasure = "  const distance=Math.hypot(truck.x-ex.x,truck.y-ex.y),minimum=(Number(truck.radius)||20)+(Number(ex.radius)||38)+10;\n  const out={distance,minimum,buffer:Number(ex.resourceBuffer83||0),cargoFuel:Number(s?.cargo?.fuel||0),cargoAmmo:Number(s?.cargo?.ammo||0),phase:s?.phase206,status:s?.status,source:s?.sourceNodeId,destination:s?.destinationNodeId||null};";
const newMeasure = "  const distance=Math.hypot(truck.x-ex.x,truck.y-ex.y),surfaceDistance=Number(g.getBuildingSurfaceDistance117?.(truck,ex));\n  const overlap=Boolean(g.unitCollidesWithBuilding115?.(truck,truck.x,truck.y,truck.rotation||0));\n  const out={distance,surfaceDistance,overlap,buffer:Number(ex.resourceBuffer83||0),cargoFuel:Number(s?.cargo?.fuel||0),cargoAmmo:Number(s?.cargo?.ammo||0),phase:s?.phase206,status:s?.status,source:s?.sourceNodeId,destination:s?.destinationNodeId||null};";
if (!source.includes(oldMeasure)) throw new Error('build 213 overlap measurement anchor missing');
source = source.replace(oldMeasure, newMeasure);
const oldAssert = "if(loading.distance<loading.minimum)throw new Error(`truck overlapped extractor while loading ${JSON.stringify(loading)}`);";
const newAssert = "if(loading.overlap)throw new Error(`truck physically overlapped extractor footprint while loading ${JSON.stringify(loading)}`);";
if (!source.includes(oldAssert)) throw new Error('build 213 overlap assertion anchor missing');
source = source.replace(oldAssert, newAssert);
await writeFile(generatedUrl, source, 'utf8');
await import(generatedUrl.href);
