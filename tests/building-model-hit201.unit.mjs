import fs from 'node:fs';
import vm from 'node:vm';

globalThis.document = {};

class Game {
  constructor() {
    this.building = { id: 'b1', kind: 'building', alive: true };
    this.selected = [this.building];
  }
  getBuildingFigureHits193() { return [{ building: this.building, score: 0 }]; }
  hitTest() { return this.building; }
}

globalThis.__FD_DEBUG__ = { Game };
globalThis.__FD_BUILDING_SELECTION_CONTOUR_200__ = {
  modelHitAtWorld() { return false; },
};

const source = fs.readFileSync(new URL('../src/v201/building-model-hit-v201.js', import.meta.url), 'utf8');
vm.runInThisContext(source, { filename: 'building-model-hit-v201.js' });

const game = new Game();
if (game.getBuildingFigureHits193(100, 100).length !== 0) throw new Error('transparent selected-building bounds were not filtered');
if (game.hitTest(100, 100, true) !== null) throw new Error('transparent selected building survived hitTest');

game.selected = [];
if (game.getBuildingFigureHits193(100, 100).length !== 1) throw new Error('first-selection forgiving bounds were removed');
if (game.hitTest(100, 100, true) !== game.building) throw new Error('unselected building became unselectable');

const api = globalThis.__FD_BUILDING_MODEL_HIT_201__;
if (!api || api.build !== 201 || api.state.figureMissesFiltered !== 1 || api.state.hitTestsFiltered !== 1) {
  throw new Error(`building model hit diagnostics invalid: ${JSON.stringify(api?.state)}`);
}

console.log(JSON.stringify({ ok: true, state: api.state }));
