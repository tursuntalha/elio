const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { dataDirectory } = require('../src/data-directory.cjs');

test('Elio keeps its preferences location and honours ELIO_DATA_DIR', () => {
  const appData = path.join(process.cwd(), '.test-output', 'roaming');
  assert.equal(dataDirectory(appData, {}), path.join(appData, 'agent-terminal'));
  assert.equal(dataDirectory(undefined, { APPDATA: appData }), path.join(appData, 'agent-terminal'));
  assert.equal(dataDirectory(appData, { ELIO_DATA_DIR: 'elio-profile' }), 'elio-profile');
});
