const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { parse } = require('jsonc-parser');
const { installVSCodeKeys } = require('../src/vscode-keys.cjs');
const { InputDecoder } = require('../src/tui-input.cjs');
const { TerminalUI } = require('../src/terminal-ui.cjs');
const bindings = require('../data/vscode-keybindings.json');

test('VS Code mappings preserve JSONC, existing shortcuts, backup and repeated setup', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-terminal-keys-'));
  const filename = path.join(directory, 'keybindings.json');
  const original = '[\r\n // Keep my shortcut\r\n {"key":"shift+enter","command":"workbench.action.terminal.sendSequence","args":{"text":"\\u001b\\r"},"when":"terminalFocus"},\r\n]\r\n';
  fs.writeFileSync(filename, original);
  const result = installVSCodeKeys(filename), text = fs.readFileSync(filename, 'utf8'), entries = parse(text);
  assert.equal(result.added, 9); assert.equal(fs.readFileSync(result.backup, 'utf8'), original);
  assert.ok(text.includes('// Keep my shortcut')); assert.deepEqual(entries[0], parse(original)[0]);
  assert.ok(entries.slice(1).every(entry => entry.when === 'terminalFocus && terminalAltBufferActive'));
  assert.deepEqual(installVSCodeKeys(filename), { filename, added: 0, backup: null });
  assert.equal(fs.readFileSync(filename, 'utf8'), text);
  fs.writeFileSync(filename, '[ broken');
  assert.throws(() => installVSCodeKeys(filename)); assert.equal(fs.readFileSync(filename, 'utf8'), '[ broken');
});

test('every mapped physical F key decodes and F6/F7 select independent sessions directly', () => {
  const events = [], decoder = new InputDecoder(event => events.push(event));
  for (const binding of bindings) decoder.feed(binding.args.text);
  assert.deepEqual(events.map(event => event.name), bindings.map(binding => binding.key)); decoder.dispose();
  const processes = [];
  const ui = new TerminalUI({ readAuthStatus: async () => ({ state: 'unknown' }), cwd: process.cwd(), preferences: { read: () => ({}), write: () => {} }, startTerminal: () => {
    const process = { onData: () => ({ dispose() {} }), onExit: () => ({ dispose() {} }), write: value => process.inputs.push(value), inputs: [], resize() {}, kill() {} }; processes.push(process); return process;
  } });
  const key = name => ui.input({ type: 'key', name, raw: bindings.find(binding => binding.key === name)?.args.text || name });
  try {
    ui.startSession('claude', 'normal'); const first = ui.active;
    ui.startSession('codex', 'normal'); const second = ui.active;
    key('f6'); assert.equal(ui.active, first); key('f7'); assert.equal(ui.active, second);
    key('\x07'); assert.equal(processes[1].inputs.at(-1), '\x07'); assert.equal(ui.modal, null);
    key('f3'); assert.equal(ui.modal.scope, 'session'); key('escape');
    key('f4'); assert.equal(ui.modal.scope, 'global'); key('escape');
    key('f9'); assert.equal(ui.modal.type, 'shortcuts'); key('f9'); assert.equal(ui.modal, null);
    key('f2'); assert.equal(ui.home, true); key('f6'); assert.equal(ui.active, first); assert.equal(ui.home, false);
    key('f10'); assert.equal(ui.modal.type, 'confirm');
    assert.ok(processes.every(process => !process.inputs.some(input => /\x1b/.test(input))));
  } finally { ui.dispose(); }
});
