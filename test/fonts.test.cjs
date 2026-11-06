const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { FONT_OPTIONS, FONTS } = require('../src/fonts.cjs');
const { appearance } = require('../src/terminal.cjs');

test('at least twenty real font families are bundled with Turkish subsets and original licenses', () => {
  const root = path.resolve(__dirname, '..', 'assets', 'fonts');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json')));
  assert.ok(manifest.length >= 20);
  assert.equal(new Set(manifest.map(font => font.family)).size, manifest.length);
  const css = fs.readFileSync(path.join(root, 'fonts.css'), 'utf8');
  assert.ok(!/https?:|local\(/.test(css));
  for (const font of manifest) {
    assert.ok(font.files.some(file => file.path.includes('-latin-ext-400-normal.woff2')));
    assert.ok(fs.readFileSync(path.join(root, font.package.replace('@fontsource/', ''), 'LICENSE.txt'), 'utf8').length > 500);
    assert.ok(css.includes(JSON.stringify(font.family)));
    assert.equal(appearance({ font: font.id }).font, font.id);
    assert.ok(FONT_OPTIONS.find(option => option.id === font.id)?.bundled);
    assert.ok(FONTS[font.id].includes(font.family));
    for (const file of font.files) {
      const data = fs.readFileSync(path.join(root, file.path));
      assert.equal(data.subarray(0, 4).toString(), 'wOF2');
      assert.equal(createHash('sha256').update(data).digest('hex'), file.sha256);
    }
  }
});
