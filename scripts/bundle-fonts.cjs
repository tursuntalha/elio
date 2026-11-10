const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const fonts = require('../data/fonts.json');
const root = path.join(__dirname, '..'), output = path.join(root, 'assets', 'fonts');
const css = [], manifest = [];
fs.mkdirSync(output, { recursive: true });
for (const font of fonts) {
  if (!/^[a-z0-9-]+$/.test(font.package)) throw new Error('Invalid font package');
  const folder = path.join(root, 'node_modules', '@fontsource', font.package);
  const metadata = JSON.parse(fs.readFileSync(path.join(folder, 'metadata.json')));
  const pkg = JSON.parse(fs.readFileSync(path.join(folder, 'package.json')));
  const family = 'AT ' + font.name, files = [];
  const subsets = new Set(['latin', 'latin-ext', 'symbols2']);
  if (!metadata.subsets.includes('latin-ext')) throw new Error(font.name + ': Latin Extended subset is required');
  const target = path.join(output, font.package); fs.mkdirSync(target, { recursive: true });
  const weights = [...new Set([400, metadata.weights.includes(700) ? 700 : Math.max(...metadata.weights)])];
  for (const style of metadata.styles) for (const weight of weights) {
    const source = fs.readFileSync(path.join(folder, weight + (style === 'normal' ? '' : '-' + style) + '.css'), 'utf8');
    for (const match of source.matchAll(/@font-face\s*\{([^}]+)\}/g)) {
      const body = match[1];
      const filename = /url\(\.\/files\/([a-z0-9-]+\.woff2)\)/.exec(body)?.[1];
      if (!filename || ![...subsets].some(subset => filename === `${font.package}-${subset}-${weight}-${style}.woff2`)) continue;
      const range = /unicode-range:\s*([^;]+);/.exec(body)?.[1];
      const data = fs.readFileSync(path.join(folder, 'files', filename));
      if (data.subarray(0, 4).toString() !== 'wOF2') throw new Error('Invalid font: ' + filename);
      fs.writeFileSync(path.join(target, filename), data);
      files.push({ path: font.package + '/' + filename, sha256: createHash('sha256').update(data).digest('hex') });
      css.push(`@font-face { font-family: ${JSON.stringify(family)}; font-style: ${style}; font-weight: ${weight}; font-display: swap; src: url("./${font.package}/${filename}") format("woff2");${range ? ' unicode-range: ' + range + ';' : ''} }`);
    }
  }
  if (!files.length) throw new Error('Missing font faces: ' + font.name);
  fs.copyFileSync(path.join(folder, 'LICENSE'), path.join(target, 'LICENSE.txt'));
  manifest.push({ ...font, family, package: '@fontsource/' + font.package, version: pkg.version, license: pkg.license, source: 'https://fontsource.org/fonts/' + font.package, files });
}
fs.writeFileSync(path.join(output, 'fonts.css'), '/* Local bundled fonts. See each family LICENSE.txt and manifest.json. */\n' + css.join('\n') + '\n');
fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
const bytes = manifest.flatMap(font => font.files).reduce((total, file) => total + fs.statSync(path.join(output, file.path)).size, 0);
console.log(`${manifest.length} bundled font families, ${css.length} faces, ${(bytes / 1024 / 1024).toFixed(2)} MB.`);
