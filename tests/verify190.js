'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = process.argv[2] || 'dist';
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const html = read('frontline-dominion.html');
const stabilitySource = read('runtime-stability-v190.js');
const shellSource = read('runtime-shell-v190.js');
const modelPilot = read('model-pilot-v101.js');
const workerSource = read('authoritative-simulation-worker-v174.js');
const formationSource = read('formation-march-core-v183.js');

if (!html.includes('fd-boot190-script') || !html.includes('data-fd-canonical-build="190"')) throw new Error('build 190 canonical boot missing');
if (!html.includes('runtime-stability-v190.js?build=190')) throw new Error('build 190 stability module missing from browser');
if (!html.includes('runtime-ui-v190.js?build=190') || !html.includes('runtime-shell-v190.js?build=190')) throw new Error('build 190 runtime UI/shell missing');
if (/engineer-infantry-parity-v189\.js/.test(html)) throw new Error('build 189 rifle-copy module still loaded in browser');
if (/runtime-(?:ui|shell)-v189\.js/.test(html)) throw new Error('build 189 runtime shell still loaded');
const scriptSources = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+\.js(?:\?build=\d+)?)["']/gi)].map(match => match[1]);
const mixed = scriptSources.filter(source => !source.endsWith('?build=190'));
if (mixed.length) throw new Error(`mixed browser cache generations: ${mixed.join(', ')}`);
if (!scriptSources.at(-1)?.includes('runtime-shell-v190.js?build=190')) throw new Error(`build 190 shell is not last: ${scriptSources.slice(-5).join(', ')}`);

if (!stabilitySource.includes('__FD_RUNTIME_STABILITY_190__')) throw new Error('runtime stability API missing');
if (!stabilitySource.includes("referenceType: 'rocket'")) throw new Error('engineer is not tied to rocket reference');
if (/copyEngineerGeometry189|referenceType:\s*'rifle'/.test(stabilitySource)) throw new Error('legacy rifle geometry copy survived');
if (!stabilitySource.includes('getInfantryRenderGeometry190')) throw new Error('rocket-equivalent presentation owner missing');
if (!stabilitySource.includes('repairIntegrity190')) throw new Error('resource build integrity guard missing');

if (/if \(unit\.typeId === 'worker'\) return ENGINEER_DISPLAY_SCALE/.test(modelPilot)) throw new Error('legacy 2.85 engineer renderer branch survived');
if (/ENGINEER_DISPLAY_SCALE\s*=\s*2\.85/.test(modelPilot)) throw new Error('legacy engineer display scale survived');
if (/\?build=158/.test(modelPilot)) throw new Error('stale build 158 model cache survived');
if (!modelPilot.includes('drawCatalogBuildingPlaceholder190')) throw new Error('catalog building full-footprint fallback missing');
if (!modelPilot.includes("['B-11', 'B-12', 'B-50', 'B-51', 'B-52', 'B-53']")) throw new Error('extractor atlas preload missing');
if (!modelPilot.includes('0.82 + progress * 0.18')) throw new Error('construction sprite visibility fix missing');

if (!shellSource.includes('backup-build190')) throw new Error('save backup key missing');
if (!shellSource.includes('launch-checkpoint') || !shellSource.includes('periodic')) throw new Error('automatic checkpoints missing');
if (/storageRemove|removeItem/.test(shellSource)) throw new Error('build 190 shell may delete a save');
if (!shellSource.includes('restorePreservedSave190')) throw new Error('load failure save restoration missing');

if (!workerSource.includes("runtime-stability-v190.js?build=190")) throw new Error('runtime stability module missing from Worker');
if (/engineer-infantry-parity-v189\.js/.test(workerSource)) throw new Error('legacy engineer parity module still loaded in Worker');
const workerImports = [...workerSource.matchAll(/importScripts\('\/frontline-dominion\/([^'?]+\.js)\?build=190'\)/g)].map(match => match[1]);
if (workerImports.length < 11) throw new Error(`Worker import list incomplete: ${workerImports.join(', ')}`);
for (const file of workerImports) {
  const source = read(file);
  try {
    new vm.Script(source, { filename: file });
  } catch (error) {
    throw new Error(`Worker import does not parse: ${file}\n${error.stack || error}`);
  }
}
if (!formationSource.includes("const VERSION = '16.8.6';\n  const BUILD = 190;")) throw new Error('formation runtime version is not build 190');

class Unit {}
class Game {
  constructor() {
    this.units = [];
    this.buildings = [];
    this.entities = new Map();
    this.teams = { player: { faction: 'vanguard' }, enemy: { faction: 'dominion' } };
    this.camera = { zoom: 1 };
    this.simTick = 1;
    this.time = 0;
    this.spatial = { update() {} };
    this.unitSpatial = { update() {} };
    this.buildingSpatial = { update() {} };
  }
  addEntity(entity) {
    entity.game = this;
    this.entities.set(entity.id, entity);
    if (entity.kind === 'building') this.buildings.push(entity);
    else this.units.push(entity);
    return entity;
  }
  getEntity(id) { return this.entities.get(id) || null; }
  getUnitPresentationScale138() { return 2; }
  getInfantryScreenBounds138(unit) {
    return { x1: 0, y1: 0, x2: unit.typeId === 'rocket' ? 118 : 82, y2: unit.typeId === 'rocket' ? 125 : 105 };
  }
  getUnitFootprint(unitOrType, radius = null) {
    const resolvedRadius = Number(radius || unitOrType?.radius || unitOrType?.stats?.radius || 6);
    return { halfLength: resolvedRadius, halfWidth: resolvedRadius * 0.8, height: resolvedRadius * 1.5 };
  }
  getUnitFootprintAt(unit) { return this.getUnitFootprint(unit, unit.radius); }
  worldToScreen(x, y) { return { x, y }; }
  rebuildSpatialIndexes() {}
  buildExtractorFromResource83() {
    const worker = this.units.find(unit => unit.typeId === 'worker');
    const building = this.buildings[0];
    worker.alive = false;
    worker.embarkedIn = 'deleted-by-regression';
    this.units = this.units.filter(unit => unit !== worker);
    building.alive = false;
    this.buildings = this.buildings.filter(candidate => candidate !== building);
    const oreMine = { id: 'mine1', kind: 'building', typeId: 'oreMine', alive: true, health: 100, team: 'player' };
    this.addEntity(oreMine);
    return true;
  }
  update() { this.simTick += 1; this.time += 0.04; }
}

const rocketStats = {
  radius: 6,
  collisionRadius: 6,
  footprintRadius: 6,
  selectionRadius: 6,
  profileRadius: 6,
  displayRadius: 6,
  bodyRadius: 6,
  navRadius: 6,
  avoidanceRadius: 6,
  separationRadius: 6,
  visualScale: 0.82,
  infantry: true,
};
globalThis.__FD_DEBUG__ = {
  Game,
  Unit,
  UNIT_TYPES: { rocket: rocketStats },
  getUnitStats: typeId => typeId === 'rocket' ? { ...rocketStats } : null,
  game: null,
};
new Function(stabilitySource)();

const game = new Game();
globalThis.__FD_DEBUG__.game = game;
const weapon = { damage: 12, range: 105 };
const worker = {
  id: 'worker1', kind: 'unit', typeId: 'worker', alive: true, team: 'player', infantry: true,
  radius: 17, health: 300, embarkedIn: null,
  stats: { radius: 17, visualScale: 0.9, role: 'engineering', cost: 500, modelCode: 'C-U01', weapon },
  x: 100, y: 100, renderX: 100, renderY: 100, rotation: 0,
};
const rocket = {
  id: 'rocket1', kind: 'unit', typeId: 'rocket', alive: true, team: 'player', infantry: true,
  radius: 6, health: 205, embarkedIn: null,
  stats: { ...rocketStats, modelCode: 'C-U03' },
  x: 140, y: 100, renderX: 140, renderY: 100, rotation: 0,
};
const barracks = { id: 'barracks1', kind: 'building', typeId: 'barracks', alive: true, health: 1700, team: 'player' };
game.addEntity(worker);
game.addEntity(rocket);
game.addEntity(barracks);

if (worker.radius !== rocket.radius || worker.stats.radius !== rocket.stats.radius) throw new Error(`engineer physical radius mismatch: ${worker.radius}/${rocket.radius}`);
if (worker.stats.visualScale !== rocket.stats.visualScale) throw new Error(`engineer visualScale mismatch: ${worker.stats.visualScale}/${rocket.stats.visualScale}`);
if (worker.stats.weapon !== weapon || worker.stats.role !== 'engineering' || worker.stats.cost !== 500 || worker.stats.modelCode !== 'C-U01') {
  throw new Error('engineer gameplay/model identity was overwritten');
}
if (worker._fdEngineerRocketSize190?.referenceType !== 'rocket') throw new Error('engineer reference marker missing');

const workerFootprint = game.getUnitFootprintAt(worker);
const workerWorldWidth = Math.max(workerFootprint.halfLength * 2, workerFootprint.halfWidth * 2);
const geometry = game.getInfantryRenderGeometry190(worker, workerWorldWidth, 0.75, 2);
const workerVisibleWidth = geometry.targetWidth * 82 / 192;
const workerVisibleHeight = geometry.targetHeight * 105 / 144;
const rocketTargetWidth = 12 * 1.34 * 2;
const rocketTargetHeight = rocketTargetWidth * 0.75;
const rocketVisibleWidth = rocketTargetWidth * 118 / 192;
const rocketVisibleHeight = rocketTargetHeight * 125 / 144;
const widthRatio = workerVisibleWidth / rocketVisibleWidth;
const heightRatio = workerVisibleHeight / rocketVisibleHeight;
if (Math.abs(widthRatio - 1) > 0.001 || Math.abs(heightRatio - 1) > 0.001) {
  throw new Error(`engineer visible envelope is not rocket-equivalent: ${widthRatio}/${heightRatio}`);
}
const bounds = game.getInfantryScreenBounds138(worker);
if (bounds.source !== 'rocket-equivalent-engineer-190' || bounds.visibleWidth <= 0 || bounds.visibleHeight <= 0) throw new Error('engineer screen/indicator bounds missing');

const built = game.buildExtractorFromResource83({ id: 'node1', kind: 'resource', alive: true, variant: 'alloy' });
if (!built) throw new Error('resource build wrapper did not return success');
if (!worker.alive || worker.embarkedIn || !game.units.includes(worker)) throw new Error('resource build removed engineer');
if (!barracks.alive || !game.buildings.includes(barracks)) throw new Error('resource build removed existing building');
if (!game.buildings.some(building => building.typeId === 'oreMine' && building.alive)) throw new Error('resource build did not preserve new ore mine');
game.update();
if (!worker.alive || !game.units.includes(worker) || !barracks.alive || !game.buildings.includes(barracks)) throw new Error('next-tick resource guard failed');

const diagnostics = globalThis.__FD_RUNTIME_STABILITY_190__.diagnostics();
if (diagnostics.repairedUnits < 1 || diagnostics.repairedBuildings < 1 || diagnostics.extractorBuilds !== 1) {
  throw new Error(`integrity diagnostics invalid: ${JSON.stringify(diagnostics)}`);
}

console.log(JSON.stringify({
  ok: true,
  build: 190,
  workerImportsParsed: workerImports.length,
  engineer: {
    radius: worker.radius,
    visualScale: worker.stats.visualScale,
    widthRatio,
    heightRatio,
    boundsSource: bounds.source,
  },
  integrity: diagnostics.lastIntegrityReport,
  scripts: scriptSources.length,
}));
