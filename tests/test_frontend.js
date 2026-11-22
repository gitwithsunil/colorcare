const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('static/js/app.js', 'utf8');
const start = source.indexOf('function colorFromRgb(rgb) {');
const end = source.indexOf('\n  function fillResult', start);
assert.notEqual(start, -1, 'color helpers must exist');
assert.notEqual(end, -1, 'color helper boundary must exist');
const helpers = new Function(`${source.slice(start, end)}; return { colorFromRgb, mapCoverPoint, mapImagePixel, averageRgba };`)();

assert.deepEqual(helpers.colorFromRgb([36, 91, 219]), {
  rgb: [36, 91, 219], hex: '#245BDB', name: 'Blue', hsl: [222, 72, 50],
});
assert.deepEqual(helpers.colorFromRgb([255, 0, 0]), {
  rgb: [255, 0, 0], hex: '#FF0000', name: 'Red', hsl: [0, 100, 50],
});
assert.deepEqual(helpers.colorFromRgb([128, 128, 128]), {
  rgb: [128, 128, 128], hex: '#808080', name: 'Gray', hsl: [0, 0, 50],
});

const videoRect = { left: 10, top: 20, width: 200, height: 200 };
assert.deepEqual(helpers.mapCoverPoint(110, 120, videoRect, 400, 300), {
  x: 200, y: 150, xCss: 100, yCss: 100,
});
assert.equal(helpers.mapCoverPoint(10, 120, videoRect, 400, 300).x, 50);
assert.equal(helpers.mapCoverPoint(210, 120, videoRect, 400, 300).x, 350);
assert.deepEqual(helpers.mapImagePixel(60, 45, { left: 10, top: 20, right: 110, bottom: 70, width: 100, height: 50 }, 200, 100), { x: 100, y: 50 });
assert.equal(helpers.mapImagePixel(5, 45, { left: 10, top: 20, right: 110, bottom: 70, width: 100, height: 50 }, 200, 100), null);
assert.deepEqual(helpers.averageRgba(new Uint8ClampedArray([0, 10, 20, 255, 10, 20, 30, 255])), [5, 15, 25]);

console.log('Frontend color, webcam coordinate, image coordinate, and pixel average checks passed.');
