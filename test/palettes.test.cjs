const test = require('node:test');
const assert = require('node:assert/strict');
const { loadCatalog } = require('../src/palettes.cjs');
const { validateCatalog, randomPair, filterPalettes, paletteMode, contrastRatio } = require('../media/palettes.js');

test('catalog has five featured pairs and random selects from the catalog without immediate repetition', () => {
  const catalog = loadCatalog();
  assert.equal(catalog.featured.length, 5); assert.ok(catalog.palettes.length > 100);
  assert.equal(new Set(catalog.palettes.map(pair => pair.background + pair.foreground)).size, catalog.palettes.length);
  const original = catalog.palettes[0];
  for (const random of [0, .2, .5, .999]) {
    const selected = randomPair(catalog, original, () => random);
    assert.ok(catalog.palettes.includes(selected)); assert.notEqual(selected.id, original.id);
    assert.ok(contrastRatio(selected) >= 4.5);
  }
  assert.deepEqual(randomPair({ palettes: [original] }, original), original);
  const subtle = { ...original, id: 'subtle', background: '#282a37' };
  const distinct = { ...original, id: 'distinct', background: '#ffffff', foreground: '#000000' };
  assert.equal(randomPair({ palettes: [original, subtle, distinct] }, original, () => 0).id, 'distinct');
  assert.equal(randomPair({ palettes: [original, subtle] }, original, () => 0).id, 'subtle');
  const faint = { ...original, id: 'faint', background: '#000000', foreground: '#101010' };
  assert.equal(randomPair({ palettes: [faint, distinct] }, original, () => 0).id, 'distinct');
});

test('large catalog supports name search and disjoint dark/light filters', () => {
  const catalog = loadCatalog(), light = filterPalettes(catalog, '', 'light'), dark = filterPalettes(catalog, '', 'dark');
  assert.equal(light.length + dark.length, catalog.palettes.length);
  assert.ok(light.length > 20); assert.ok(dark.length > 100);
  assert.ok(light.every(pair => paletteMode(pair) === 'light'));
  assert.ok(filterPalettes(catalog, 'SOLARIZED light', 'light').some(pair => pair.id === 'solarized-light'));
  assert.equal(filterPalettes(catalog, 'not-a-palette-123456789').length, 0);
  for (const pair of filterPalettes(catalog, 'Gogh', 'light')) assert.equal(pair.collection, 'Gogh');
});
test('invalid catalog cannot inject invalid colors or duplicate palette identifiers', () => {
  const catalog = loadCatalog();
  assert.throws(() => validateCatalog({ ...catalog, palettes: [...catalog.palettes, catalog.palettes[0]] }));
  assert.throws(() => validateCatalog({ ...catalog, featured: ['missing'] }));
  assert.throws(() => validateCatalog({ ...catalog, palettes: [{ ...catalog.palettes[0], background: 'red;script' }] }));
  assert.equal(loadCatalog('missing-palette-file').palettes.length, 0);
});
