const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { parseArguments } = require('../src/cli-options.cjs');

test('command preserves the calling folder and accepts paths with spaces', () => {
  const root = path.resolve(__dirname, '..', '.test-output');
  const directory = path.join(root, 'masaüstü proje');
  fs.mkdirSync(directory, { recursive: true });
  assert.deepEqual(parseArguments([], directory), { action: 'terminal', cwd: directory });
  assert.deepEqual(parseArguments(['--window'], directory), { action: 'window', cwd: directory });
  assert.deepEqual(parseArguments(['--setup-shortcut']), { action: 'setup-shortcut' });
  assert.equal(parseArguments(['masaüstü proje'], root).cwd, directory);
  assert.throws(() => parseArguments(['--yolo'], root));
  assert.throws(() => parseArguments(['a', 'b'], root));
  assert.throws(() => parseArguments(['missing-folder'], root));
});

test('help and version do not start the desktop application', () => {
  const bin = path.join(__dirname, '..', 'bin', 'elio.cjs');
  const result = spawnSync(process.execPath, [bin, '--version'], { encoding: 'utf8' });
  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), require('../package.json').version);
  const compatibility = spawnSync(process.execPath, [path.join(__dirname, '..', 'bin', 'agent-terminal.cjs'), '--version'], { encoding: 'utf8' });
  assert.equal(compatibility.status, 0); assert.equal(compatibility.stdout.trim(), result.stdout.trim());
  const help = spawnSync(process.execPath, [bin, '--help'], { encoding: 'utf8' });
  assert.equal(help.status, 0);
  assert.match(help.stdout, /elio \[folder\]/);
});
