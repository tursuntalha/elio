const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { dataDirectory } = require('../src/data-directory.cjs');

test('Elio reuses existing preferences and supports both environment variable names', () => {
  const appData = path.join(process.cwd(), '.test-output', 'roaming');
  assert.equal(dataDirectory(appData, {}), path.join(appData, 'agent-terminal'));
  assert.equal(dataDirectory(undefined, { APPDATA: appData }), path.join(appData, 'agent-terminal'));
  assert.equal(dataDirectory(appData, { AGENT_TERMINAL_DATA_DIR: 'legacy-profile' }), 'legacy-profile');
  assert.equal(dataDirectory(appData, { ELIO_DATA_DIR: 'elio-profile', AGENT_TERMINAL_DATA_DIR: 'legacy-profile' }), 'elio-profile');
});
