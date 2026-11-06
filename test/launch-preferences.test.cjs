const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createLaunchPreferences } = require('../src/launch-preferences.cjs');
const { createController } = require('../src/controller.cjs');
const { TerminalUI } = require('../src/terminal-ui.cjs');

test('saved launch modes persist independently and reach later terminal instances', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-terminal-launch-'));
  const store = createLaunchPreferences(directory);
  assert.deepEqual(store.read(), { claude: 'normal', codex: 'normal', opencode: 'normal' });
  store.set('codex', 'full');
  const second = createLaunchPreferences(directory);
  assert.deepEqual(second.read(), { claude: 'normal', codex: 'full', opencode: 'normal' });
  second.set('claude', 'full'); store.set('codex', 'normal');
  assert.deepEqual(second.read(), { claude: 'full', codex: 'normal', opencode: 'normal' });
  assert.throws(() => store.set('claude', 'yolo')); assert.throws(() => store.set('other', 'full'));
  assert.throws(() => store.set('opencode', 'full'), /Geçersiz/); // OpenCode has no permission-bypass flag
  store.set('opencode', 'normal');
  const ui = new TerminalUI({ readAuthStatus: async () => ({ state: 'unknown' }), readAuthStatus: async () => ({ state: 'unknown' }), cwd: directory, preferences: { read: () => ({}) }, launchPreferences: second });
  try {
    const starts = []; ui.startSession = (agent, mode) => starts.push([agent, mode]);
    ui.action('claude'); ui.action('codex');
    assert.deepEqual(starts, [['claude', 'full'], ['codex', 'normal']]);
    ui.action('launch:claude'); ui.action('normal');
    assert.equal(starts.length, 2); assert.equal(store.read().claude, 'normal');
    ui.action('claude'); assert.deepEqual(starts.at(-1), ['claude', 'normal']);
    ui.action('launch:claude'); ui.action('cancel'); assert.equal(store.read().claude, 'normal');
    ui.launchPreferences = { set() { throw new Error('Disk full'); } };
    ui.action('launch:claude'); ui.action('full');
    assert.ok(ui.modal.error); assert.equal(ui.launchModes.claude, 'normal');
  } finally { ui.dispose(); }
});

test('desktop acknowledges persisted modes without starting a process and rejects invalid modes', async () => {
  const events = []; let saved = { claude: 'normal', codex: 'normal', opencode: 'normal' }, started = 0, fail = false;
  const controller = createController({
    cwd: process.cwd(), post: value => events.push(value), getAppearance: () => ({}), getLaunchModes: () => saved,
    saveLaunchMode(agent, mode) { if (fail) throw new Error('Disk full'); return saved = { ...saved, [agent]: mode }; }
  }, { readAuthStatus: async () => ({ state: 'unknown' }), readAuthStatus: async () => ({ state: 'unknown' }), startTerminal() { started++; } });
  try {
    await controller.receive({ type: 'ready' });
    assert.deepEqual(events.find(event => event.type === 'settings').launchModes, saved);
    await controller.receive({ type: 'launchMode', agent: 'codex', mode: 'full' });
    assert.deepEqual(events.at(-1), { type: 'launchModes', value: { claude: 'normal', codex: 'full', opencode: 'normal' } });
    await controller.receive({ type: 'launchMode', agent: 'codex', mode: 'invalid' });
    assert.equal(events.at(-1).type, 'error'); assert.equal(saved.codex, 'full');
    fail = true; await controller.receive({ type: 'launchMode', agent: 'codex', mode: 'normal' });
    assert.equal(events.at(-1).operation, 'launchMode'); assert.equal(saved.codex, 'full');
    await controller.receive({ type: 'launchMode', agent: 'opencode', mode: 'full' });
    assert.equal(events.at(-1).type, 'error'); assert.equal(saved.opencode, 'normal');
    assert.equal(started, 0);
  } finally { controller.dispose(); }
});

test('default agent persists next to the launch modes, survives mode changes and can be cleared', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-terminal-default-'));
  const store = createLaunchPreferences(directory);
  assert.equal(store.readDefault(), null);
  assert.equal(store.setDefault('opencode'), 'opencode');
  assert.equal(createLaunchPreferences(directory).readDefault(), 'opencode');
  store.set('codex', 'full'); // writing a mode must not drop the default
  assert.equal(store.readDefault(), 'opencode'); assert.equal(store.read().codex, 'full');
  store.setDefault('claude'); assert.equal(store.readDefault(), 'claude'); assert.equal(store.read().codex, 'full');
  assert.throws(() => store.setDefault('gemini'), /Geçersiz/); assert.throws(() => store.setDefault(undefined), /Geçersiz/);
  assert.equal(store.setDefault(null), null); assert.equal(store.readDefault(), null);
  fs.writeFileSync(path.join(directory, 'launch.json'), JSON.stringify({ schemaVersion: 1, agents: {}, defaultAgent: 'nope' }));
  assert.equal(store.readDefault(), null);
});

test('desktop controller reports auth, saves the default agent and re-reads auth after a login session', async () => {
  const events = []; let saved = null, authCalls = 0, signedIn = false, exits = [];
  const controller = createController({
    cwd: process.cwd(), post: value => events.push(value), getAppearance: () => ({}), getLaunchModes: () => ({}),
    getDefaultAgent: () => saved, saveDefaultAgent: agent => { saved = agent; return agent; }
  }, {
    readAuthStatus: async agent => { authCalls++; return { state: agent === 'claude' && !signedIn ? 'signed-out' : 'signed-in' }; },
    startTerminal(agent, cwd, cols, rows, mode) {
      const fake = { agent, mode, onData: () => ({ dispose() {} }), onExit: fn => { exits.push(fn); return { dispose() {} }; }, write() {}, resize() {}, kill() {} };
      return fake;
    }
  });
  const settle = () => new Promise(resolve => setTimeout(resolve, 20));
  try {
    saved = 'codex';
    await controller.receive({ type: 'ready' }); await settle();
    assert.equal(events.find(event => event.type === 'settings').defaultAgent, 'codex');
    assert.deepEqual(events.filter(event => event.type === 'auth').map(event => [event.agent, event.value.state]).sort(), [['claude', 'signed-out'], ['codex', 'signed-in'], ['opencode', 'signed-in']]);
    await controller.receive({ type: 'defaultAgent', agent: 'opencode' });
    assert.deepEqual(events.at(-1), { type: 'defaultAgent', value: 'opencode' });
    await controller.receive({ type: 'defaultAgent', agent: null });
    assert.deepEqual(events.at(-1), { type: 'defaultAgent', value: null });
    await controller.receive({ type: 'defaultAgent', agent: 'gemini' });
    assert.equal(events.at(-1).type, 'error'); assert.equal(saved, null);
    const before = authCalls; events.length = 0;
    await controller.receive({ type: 'start', sessionId: 'login-1', agent: 'claude', mode: 'login', cols: 80, rows: 24 });
    assert.equal(events.find(event => event.type === 'started').mode, 'login');
    signedIn = true; exits[0]({ exitCode: 0 }); await settle();
    assert.equal(authCalls, before + 1);
    assert.deepEqual(events.find(event => event.type === 'auth'), { type: 'auth', agent: 'claude', value: { state: 'signed-in' } });
    assert.ok(!events.some(event => event.type === 'limits'), 'usage limits are gone');
    // A normal session ending does not trigger an auth read.
    await controller.receive({ type: 'start', sessionId: 'normal-1', agent: 'claude', mode: 'normal', cols: 80, rows: 24 });
    const calls = authCalls; exits[1]({ exitCode: 0 }); await settle(); assert.equal(authCalls, calls);
  } finally { controller.dispose(); }
});
