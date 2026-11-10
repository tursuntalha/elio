const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { TerminalUI } = require('../src/terminal-ui.cjs');
const { createLaunchPreferences } = require('../src/launch-preferences.cjs');

const key = (ui, name) => ui.input({ type: 'key', name, raw: name });
const settle = () => new Promise(resolve => setTimeout(resolve, 15));

function setup(options = {}) {
  const processes = [];
  const ui = new TerminalUI({
    cwd: process.cwd(), cols: 100, rows: 30, preferences: { read: () => ({}), write() {} },
    readAuthStatus: async () => ({ state: 'signed-in' }), ...options,
    startTerminal(agent, cwd, cols, rows, mode) {
      const events = new EventEmitter();
      const child = { agent, mode, events, inputs: [],
        onData: callback => { events.on('data', callback); return { dispose: () => events.off('data', callback) }; },
        onExit: callback => { events.on('exit', callback); return { dispose: () => events.off('exit', callback) }; },
        write: value => child.inputs.push(value), resize() {}, kill() {} };
      processes.push(child); return child;
    }
  });
  return { ui, processes };
}

test('default agent: F2 opens it directly, D sets and clears it on the focused card', () => {
  const { ui, processes } = setup();
  try {
    assert.equal(ui.defaultAgent, null);
    key(ui, 'f2'); assert.equal(processes.length, 0); assert.equal(ui.home, true); // no default: the picker stays
    key(ui, 'tab'); key(ui, 'd');
    assert.equal(ui.defaultAgent, 'codex');
    const screen = ui.render().plain();
    assert.ok(screen.includes('Codex ★')); assert.ok(screen.includes('Default: Codex')); assert.ok(!screen.includes('Claude Code ★'));
    key(ui, 'f2');
    assert.deepEqual(processes.map(item => [item.agent, item.mode]), [['codex', 'normal']]);
    assert.equal(ui.home, false);
    ui.action('home'); key(ui, 'd'); // focus is still on Codex: the same key clears it
    assert.equal(ui.defaultAgent, null);
    key(ui, 'f2'); assert.equal(processes.length, 1); assert.equal(ui.home, true);
    // The default opens with that agent's saved mode.
    ui.launchModes = { ...ui.launchModes, claude: 'full' }; ui.defaultAgent = 'claude'; ui.action('new');
    assert.deepEqual(processes.at(-1) && [processes.at(-1).agent, processes.at(-1).mode], ['claude', 'full']);
  } finally { ui.dispose(); }
});

test('default agent is remembered between runs and failing to save is reported, not fatal', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-terminal-default-ui-'));
  const store = createLaunchPreferences(directory);
  const first = setup({ launchPreferences: store });
  try { first.ui.action('default:opencode'); assert.equal(first.ui.defaultAgent, 'opencode'); } finally { first.ui.dispose(); }
  const second = setup({ launchPreferences: createLaunchPreferences(directory) });
  try {
    assert.equal(second.ui.defaultAgent, 'opencode');
    key(second.ui, 'f2'); assert.equal(second.processes[0].agent, 'opencode');
    second.ui.launchPreferences = { read: () => ({}), readDefault: () => 'opencode', setDefault() { throw new Error('Disk full'); } };
    second.ui.action('home'); second.ui.action('default:claude');
    assert.equal(second.ui.defaultAgent, 'opencode'); assert.match(second.ui.notice, /Could not save default agent/);
  } finally { second.ui.dispose(); }
});

test('signed-out tools show a sign-in action that runs the login session, then re-reads sign-in state', async () => {
  const reads = [];
  let claude = 'signed-out';
  const { ui, processes } = setup({ readAuthStatus: async agent => { reads.push(agent); return agent === 'claude' ? { state: claude } : { state: 'signed-in', providers: agent === 'opencode' ? ['OpenAI', 'Nvidia'] : undefined }; } });
  try {
    ui.refreshAuth(true); await settle();
    const frame = ui.render(), screen = frame.plain();
    assert.ok(screen.includes('Signed out')); assert.ok(screen.includes('L Sign in'));
    assert.ok(screen.includes('Providers: 2')); assert.ok(screen.includes('L Add provider'));
    const login = frame.hits.find(hit => hit.action === 'login:claude');
    assert.ok(login); assert.ok(frame.hits.some(hit => hit.action === 'login:opencode'));
    // The button sits on top of the card's own start target.
    assert.ok(frame.hits.lastIndexOf(login) > frame.hits.findIndex(hit => hit.action === 'claude'));
    key(ui, 'l');
    assert.deepEqual([processes[0].agent, processes[0].mode], ['claude', 'login']);
    assert.equal(ui.sessionLabel(ui.active), 'Claude Code sign-in');
    assert.ok(ui.render().plain().includes('Sign-in'));
    const before = reads.length; claude = 'signed-in';
    processes[0].events.emit('exit', { exitCode: 0 }); await settle();
    assert.ok(reads.length >= before + 3, 'all sign-in states are read again after the login session ends');
    assert.equal(ui.auth.claude.state, 'signed-in');
    ui.action('home');
    assert.ok(!ui.render().plain().includes('L Sign in'));
    // Signed-in Claude/Codex ignore L; OpenCode can always add a provider.
    ui.focus = 0; key(ui, 'l'); assert.equal(processes.length, 1);
    ui.focus = 2; key(ui, 'l'); assert.deepEqual([processes[1].agent, processes[1].mode], ['opencode', 'login']);
  } finally { ui.dispose(); }
});

test('a missing CLI is reported on its card instead of offering sign-in', async () => {
  const { ui } = setup({ readAuthStatus: async agent => agent === 'codex' ? { state: 'missing' } : { state: 'signed-in' } });
  try {
    ui.refreshAuth(true); await settle();
    const frame = ui.render(), screen = frame.plain();
    assert.ok(screen.includes('Not installed')); assert.ok(!frame.hits.some(hit => hit.action === 'login:codex'));
  } finally { ui.dispose(); }
});

test('default marker and sign-in button fit the narrow and the tight layouts', async () => {
  const { ui } = setup({ readAuthStatus: async agent => agent === 'claude' ? { state: 'signed-out' } : { state: 'signed-in', providers: ['OpenAI'] } });
  try {
    ui.defaultAgent = 'opencode'; ui.refreshAuth(true); await settle();
    for (const [cols, rows] of [[54, 22], [80, 24], [110, 34]]) {
      ui.resize(cols, rows);
      const frame = ui.render(), screen = frame.plain();
      assert.ok(screen.includes('L Sign in'), `${cols}x${rows} sign-in button`);
      assert.ok(screen.includes('OpenCode ★'), `${cols}x${rows} default marker`);
      for (const hit of frame.hits.filter(item => item.action?.startsWith('login:'))) assert.ok(hit.x + hit.cols <= cols && hit.y < rows - 1);
    }
  } finally { ui.dispose(); }
});
