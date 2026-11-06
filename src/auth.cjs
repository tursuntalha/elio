const os = require('node:os');
const { spawn } = require('node:child_process');
const { commandFor } = require('./terminal.cjs');

// Sign-in state from each tool's own read-only status command. No tokens are read, no model requests are made.
//   signed-in  - the account is signed in (for OpenCode: at least one provider credential)
//   signed-out - the tool reports no account/credentials
//   missing    - the tool is not installed
//   unknown    - the answer could not be read
const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]/g;

function runCli(agent, args, signal, timeout = 10000) {
  return new Promise((resolve, reject) => {
    let command;
    try { command = commandFor(agent, args); } catch (error) { error.missing = true; reject(error); return; }
    const child = spawn(command.command, command.args, { cwd: os.homedir(), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' } });
    let stdout = '';
    const finish = (error, value) => { clearTimeout(timer); signal?.removeEventListener('abort', abort); if (error) reject(error); else resolve(value); };
    const abort = () => { child.kill(); finish(new Error('Giriş sorgusu iptal edildi.')); };
    const timer = setTimeout(() => { child.kill(); finish(new Error('Giriş bilgisi şu an alınamıyor.')); }, timeout);
    if (signal?.aborted) { abort(); return; }
    signal?.addEventListener('abort', abort, { once: true });
    const collect = chunk => { if (stdout.length < 131072) stdout += chunk; };
    child.stdout.setEncoding('utf8'); child.stdout.on('data', collect);
    child.stderr.setEncoding('utf8'); child.stderr.on('data', collect);
    child.on('error', error => finish(error));
    child.on('close', code => finish(null, { code, stdout }));
  });
}

function parseAuthStatus(agent, { code, stdout }) {
  const text = String(stdout || '').replace(ANSI, '');
  if (agent === 'claude') {
    try {
      const status = JSON.parse(text.slice(text.indexOf('{')));
      if (typeof status.loggedIn === 'boolean') return { state: status.loggedIn ? 'signed-in' : 'signed-out' };
    } catch { /* Fall through to unknown. */ }
    return { state: 'unknown' };
  }
  if (agent === 'codex') {
    if (/not logged in/i.test(text)) return { state: 'signed-out' };
    return code === 0 && /logged in/i.test(text) ? { state: 'signed-in' } : { state: 'unknown' };
  }
  if (agent === 'opencode') {
    // Only provider names are listed. Keys are never printed by the command and are not read here.
    const providers = [...text.matchAll(/^\s*[●•]\s+(.+?)\s+(?:api|oauth|wellknown)\s*$/gim)].map(match => match[1].trim()).slice(0, 12);
    if (providers.length) return { state: 'signed-in', providers };
    return code === 0 ? { state: 'signed-out', providers: [] } : { state: 'unknown' };
  }
  return { state: 'unknown' };
}

const STATUS_ARGUMENTS = Object.freeze({ claude: ['auth', 'status'], codex: ['login', 'status'], opencode: ['auth', 'list'] });

async function readAuthStatus(agent, signal, options = {}) {
  if (!Object.hasOwn(STATUS_ARGUMENTS, agent)) return { state: 'unknown' };
  try { return parseAuthStatus(agent, await (options.run || runCli)(agent, STATUS_ARGUMENTS[agent], signal)); }
  catch (error) { return error.missing ? { state: 'missing' } : { state: 'unknown' }; }
}

module.exports = { readAuthStatus, parseAuthStatus };
