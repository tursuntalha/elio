const test = require('node:test');
const assert = require('node:assert/strict');
const { readAuthStatus, parseAuthStatus } = require('../src/auth.cjs');
const { modeArguments, LOGIN_ARGUMENTS } = require('../src/terminal.cjs');

test('Claude and Codex sign-in states come from their own status commands', () => {
  assert.deepEqual(parseAuthStatus('claude', { code: 0, stdout: '{"loggedIn": true, "email": "a@b.c"}' }), { state: 'signed-in' });
  assert.deepEqual(parseAuthStatus('claude', { code: 1, stdout: '{"loggedIn": false}' }), { state: 'signed-out' });
  for (const stdout of ['', 'oops', '{"loggedIn": "yes"}']) assert.equal(parseAuthStatus('claude', { code: 0, stdout }).state, 'unknown');
  assert.deepEqual(parseAuthStatus('codex', { code: 0, stdout: 'Logged in using ChatGPT\n' }), { state: 'signed-in' });
  assert.deepEqual(parseAuthStatus('codex', { code: 1, stdout: 'Not logged in\n' }), { state: 'signed-out' });
  assert.equal(parseAuthStatus('codex', { code: 2, stdout: 'boom' }).state, 'unknown');
  // The e-mail address is never part of the result.
  assert.ok(!JSON.stringify(parseAuthStatus('claude', { code: 0, stdout: '{"loggedIn": true, "email": "a@b.c"}' })).includes('a@b.c'));
});

test('OpenCode lists connected providers by name only, ignoring terminal colors', () => {
  const stdout = '\x1b[0m\n\x1b[90m┌\x1b[39m  Credentials \x1b[90m~\\.local\\share\\opencode\\auth.json\n\x1b[90m│\x1b[39m\n\x1b[34m●\x1b[39m  Nvidia \x1b[90mapi\n\x1b[90m│\n\x1b[34m●\x1b[39m  OpenCode Go \x1b[90mapi\n\x1b[90m└\x1b[39m  2 credentials\n';
  assert.deepEqual(parseAuthStatus('opencode', { code: 0, stdout }), { state: 'signed-in', providers: ['Nvidia', 'OpenCode Go'] });
  assert.deepEqual(parseAuthStatus('opencode', { code: 0, stdout: '┌  Credentials\n└  0 credentials\n' }), { state: 'signed-out', providers: [] });
  assert.equal(parseAuthStatus('opencode', { code: 1, stdout: 'error' }).state, 'unknown');
});

test('a missing CLI and a failing status command are told apart and never throw', async () => {
  assert.deepEqual(await readAuthStatus('claude', undefined, { run: async () => { throw Object.assign(new Error('x'), { missing: true }); } }), { state: 'missing' });
  assert.deepEqual(await readAuthStatus('claude', undefined, { run: async () => { throw new Error('timeout'); } }), { state: 'unknown' });
  assert.deepEqual(await readAuthStatus('other'), { state: 'unknown' });
  let received;
  await readAuthStatus('codex', undefined, { run: async (agent, args) => { received = [agent, args]; return { code: 0, stdout: 'Logged in using ChatGPT' }; } });
  assert.deepEqual(received, ['codex', ['login', 'status']]);
});

test('login sessions run each tool\'s own sign-in command', () => {
  assert.deepEqual(modeArguments('claude', 'login'), ['auth', 'login']);
  assert.deepEqual(modeArguments('codex', 'login'), ['login']);
  assert.deepEqual(modeArguments('opencode', 'login'), ['auth', 'login']);
  assert.deepEqual(Object.keys(LOGIN_ARGUMENTS).sort(), ['claude', 'codex', 'opencode']);
  modeArguments('claude', 'login').push('x'); assert.deepEqual(modeArguments('claude', 'login'), ['auth', 'login']);
});
