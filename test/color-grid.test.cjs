const test = require('node:test');
const assert = require('node:assert/strict');
const { COLUMNS, SATURATIONS, colorGrid, nearestColor } = require('../src/color-grid.cjs');

test('color grid supplies distinct hues, tones, pure black/white and three saturation ranges', () => {
  const all = [];
  for (let mode = 0; mode < SATURATIONS.length; mode++) {
    const colors = colorGrid(mode); all.push(...colors.map(color => color.hex));
    assert.equal(colors.length, COLUMNS * 13);
    assert.equal(new Set(colors.map(color => color.hex)).size, colors.length);
    assert.ok(colors.every(color => /^#[0-9a-f]{6}$/.test(color.hex)));
    assert.equal(colors[0].hex, '#000000'); assert.equal(colors[11].hex, '#ffffff');
    for (const index of [0, 11, 12, 77, 155]) assert.equal(nearestColor(colors, colors[index].hex), index);
  }
  assert.ok(new Set(all).size > 400);
  assert.notEqual(colorGrid(0)[84].hex, colorGrid(2)[84].hex);
  assert.equal(colorGrid(0)[4].hex, colorGrid(2)[4].hex);
});
