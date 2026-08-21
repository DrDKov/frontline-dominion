import assert from 'node:assert/strict';

let createdCanvases = 0;

class FakeContext {
  constructor(canvas) {
    this.canvas = canvas;
    this.globalAlpha = 1;
    this.globalCompositeOperation = 'source-over';
    this.imageSmoothingEnabled = true;
    this.imageSmoothingQuality = 'high';
    this.fillStyle = '#000';
    this.lastIdColor = null;
  }
  save() {}
  restore() {}
  setTransform() {}
  getTransform() {
    return { transformPoint: point => ({ ...point }) };
  }
  clearRect() { if (this.canvas.role === 'pick') this.lastIdColor = null; }
  fillRect() { if (this.canvas.role === 'scratch') this.lastIdColor = this.fillStyle; }
  drawImage(image) {
    if (this.canvas.role === 'pick' && image?.role === 'scratch') this.lastIdColor = image.context.lastIdColor;
  }
  getImageData(x) {
    if (x >= 50 || !this.lastIdColor) return { data: new Uint8ClampedArray([0, 0, 0, 0]) };
    const channels = this.lastIdColor.match(/\d+/g).map(Number);
    return { data: new Uint8ClampedArray([...channels, 255]) };
  }
}

globalThis.CanvasRenderingContext2D = FakeContext;

class FakeCanvas {
  constructor(role) {
    this.role = role;
    this.width = 200;
    this.height = 120;
    this.context = new FakeContext(this);
  }
  getContext() { return this.context; }
}

const mainCanvas = new FakeCanvas('main');
globalThis.document = {
  baseURI: 'https://example.test/frontline-dominion/',
  getElementById(id) { return id === 'game-canvas' ? mainCanvas : null; },
  createElement(tag) {
    assert.equal(tag, 'canvas');
    const role = createdCanvases++ === 0 ? 'pick' : 'scratch';
    return new FakeCanvas(role);
  },
};

class MockGame {
  constructor() {
    this.canvas = mainCanvas;
    this.ctx = mainCanvas.context;
    this.building = {
      id: 'b1', kind: 'building', typeId: 'barracks', team: 'player', alive: true,
      x: 20, y: 20, radius: 20,
    };
    this.buildings = [this.building];
  }
  render() { this.drawBuilding3D(this.building); }
  drawBuilding3D() {
    this.ctx.drawImage({ src: 'https://example.test/frontline-dominion/models/canvas/b-barracks-views.webp' }, 0, 0, 40, 40);
  }
  getSelectionPointerScreen193(x, y) { return { x, y }; }
  getBuildingFigureScreenBounds193() { return { x1: 0, y1: 0, x2: 100, y2: 100, width: 100, height: 100, source: 'broad' }; }
  getBuildingFigureHits193() { return [{ building: this.building, bounds: this.getBuildingFigureScreenBounds193(), score: 0 }]; }
  hitTest() { return this.building; }
  hitTestForContext() { return this.building; }
  worldToScreen(x, y) { return { x, y }; }
}

const game = new MockGame();
globalThis.__FD_DEBUG__ = { Game: MockGame, game };

await import('../src/v204/building-visible-hit-v204.js');
game.render();

const api = globalThis.__FD_BUILDING_VISIBLE_HIT_204__;
assert.equal(api?.build, 204);
assert.equal(api.diagnostics().frameReady, true);
assert.equal(api.pickAtCanvas(20, 20), game.building);
assert.equal(game.getBuildingFigureHits193(20, 20)[0].building, game.building);
assert.equal(game.hitTest(20, 20), game.building);

assert.equal(api.pickAtCanvas(80, 20), null);
assert.deepEqual(game.getBuildingFigureHits193(80, 20), [], 'transparent sprite area remained selectable');
assert.equal(game.hitTest(80, 20), null, 'broad legacy building hit survived a transparent pixel');
assert.equal(game.hitTestForContext(80, 20), null, 'context hit survived a transparent pixel');

const diagnostics = api.diagnostics();
assert.ok(diagnostics.capturedSprites >= 1);
assert.ok(diagnostics.broadHitsFiltered >= 3);
assert.ok(diagnostics.transparentMisses >= 3);

console.log(JSON.stringify({ ok: true, diagnostics }));
