const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const { appearance, DEFAULT_APPEARANCE, findExecutable, spawnTerminal, modeArguments } = require('../src/terminal.cjs');

test('appearance accepts only colors and known fonts', () => {
  assert.deepEqual(appearance({ background: '#FAFAFA', foreground: '#112233', font: 'consolas' }), {
    background: '#FAFAFA', foreground: '#112233', font: 'consolas', fontSize: 14
  });
  assert.deepEqual(appearance({ background: 'red', foreground: '<script>', font: 'constructor' }), DEFAULT_APPEARANCE);
  assert.deepEqual(appearance(null), DEFAULT_APPEARANCE);
  assert.equal(appearance({ font: 'jetbrains', fontSize: 22 }).fontSize, 22);
  assert.equal(appearance({ fontSize: 99 }).fontSize, 14);
  assert.equal(appearance({ fontSize: '18' }).fontSize, 14);
  assert.throws(() => findExecutable('unexpected-command'));
});

function waitFor(terminal, predicate, action) {
  return new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => { listener.dispose(); reject(new Error('Terminal timeout: ' + output)); }, 15000);
    const listener = terminal.onData(data => {
      output += data;
      if (predicate(output)) { clearTimeout(timer); listener.dispose(); resolve(output); }
    });
    action?.();
  });
}

test('real PTY forwards Unicode, resize and Ctrl+C', { timeout: 25000 }, async () => {
  const program = `process.stdin.setRawMode(true); process.stdin.setEncoding('utf8'); console.log('PTY_READY'); process.stdout.on('resize',()=>console.log('RESIZED:'+process.stdout.columns+'x'+process.stdout.rows)); process.stdin.on('data',d=>{if(d.includes('\\u0003'))process.exit(0);console.log('INPUT:'+d)});`;
  const terminal = spawnTerminal(process.execPath, ['-e', program], os.homedir(), 80, 24);
  let exited = false;
  terminal.onExit(() => { exited = true; });
  try {
    await waitFor(terminal, text => text.includes('PTY_READY'));
    await waitFor(terminal, text => text.includes('INPUT:merhaba ğüşiöç'), () => terminal.write('merhaba ğüşiöç'));
    await waitFor(terminal, text => text.includes('RESIZED:100x32'), () => terminal.resize(100, 32));
    const exit = new Promise(resolve => terminal.onExit(resolve));
    terminal.write('\u0003');
    assert.equal((await exit).exitCode, 0);
  } finally { if (!exited) { try { terminal.kill(); } catch {} } }
});

for (const agent of ['claude', 'codex', 'opencode']) for (const mode of agent === 'opencode' ? ['normal'] : ['normal', 'full']) {
  test(`${agent} ${mode} mode is accepted by the installed CLI`, { timeout: 25000 }, async t => {
    let executable;
    try { executable = findExecutable(agent); } catch { t.skip('CLI is not installed'); return; }
    // A version request does not create a conversation or send a model request.
    const terminal = spawnTerminal(executable, [...modeArguments(agent, mode), '--version'], os.homedir(), 100, 24);
    let exited = false;
    const exit = new Promise(resolve => terminal.onExit(event => { exited = true; resolve(event); }));
    try {
      await waitFor(terminal, text => /\d+\.\d+/.test(text));
      assert.equal((await exit).exitCode, 0);
    } finally { if (!exited) { try { terminal.kill(); } catch {} } }
  });
}

test('normal launch never adds permission bypass flags; invalid modes are rejected', () => {
  assert.deepEqual(modeArguments('claude', 'normal'), []);
  assert.deepEqual(modeArguments('codex', 'normal'), []);
  assert.deepEqual(modeArguments('claude', 'full'), ['--dangerously-skip-permissions']);
  assert.deepEqual(modeArguments('codex', 'full'), ['--yolo']);
  assert.deepEqual(modeArguments('opencode', 'normal'), []);
  assert.throws(() => modeArguments('opencode', 'full'), /tüm izinler/);
  assert.throws(() => modeArguments('claude', '--other-flag'));
  assert.throws(() => modeArguments('unknown', 'full'));
});
