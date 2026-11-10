const fs = require('node:fs');
const path = require('node:path');
const { validateCatalog } = require('../media/palettes.js');

function loadCatalog(filename = path.join(__dirname, '..', 'data', 'palettes.json')) {
  try { return validateCatalog(JSON.parse(fs.readFileSync(filename, 'utf8'))); }
  catch { return { schemaVersion: 1, palettes: [], featured: [], error: 'Could not read the palette catalog. You can still choose colors manually.' }; }
}
module.exports = { loadCatalog };
