const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { fork } = require('node:child_process');
const { EventEmitter } = require('node:events');

const AGENTS = Object.freeze({ claude: 'Claude Code', codex: 'Codex', opencode: 'OpenCode' });
// Flags that skip permission prompts. OpenCode has no such flag, so it only offers the normal mode.
const FULL_ACCESS_FLAGS = Object.freeze({ claude: '--dangerously-skip-permissions', codex: '--yolo' });
// Each tool's own sign-in flow. It runs in a terminal session so the browser step and code prompts work as usual.
const LOGIN_ARGUMENTS = Object.freeze({ claude: ['auth', 'login'], codex: ['login'], opencode: ['auth', 'login'] });
const { FONTS } = require('./fonts.cjs');
const DEFAULT_APPEARANCE = Object.freeze({ background: '#1f2427', foreground: '#e8eeeb', font: 'cascadia', fontSize: 14 });

function appearance(value = {}) {
  const color = (input, fallback) => typeof input === 'string' && /^#[0-9a-f]{6}$/i.test(input) ? input : fallback;
  return {
    background: color(value?.background, DEFAULT_APPEARANCE.background),
    foreground: color(value?.foreground, DEFAULT_APPEARANCE.foreground),
    font: Object.hasOwn(FONTS, value?.font) ? value.font : DEFAULT_APPEARANCE.font,
    fontSize: Number.isInteger(value?.fontSize) && value.fontSize >= 10 && value.fontSize <= 28 ? value.fontSize : DEFAULT_APPEARANCE.fontSize
  };
}

function findExecutable(agent) {
  if (!Object.hasOwn(AGENTS, agent)) throw new Error('Invalid agent.');
  const pathKey = Object.keys(process.env).find(key => key.toLowerCase() === 'path');
  const directories = (process.env[pathKey] || '').split(path.delimiter);
  directories.push(path.join(os.homedir(), '.local', 'bin'), path.join(os.homedir(), '.opencode', 'bin'));
  if (process.platform === 'win32' && process.env.LOCALAPPDATA) {
    directories.push(path.join(process.env.LOCALAPPDATA, 'Programs', 'OpenAI', 'Codex', 'bin'));
  }
  const extensions = process.platform === 'win32' ? ['.exe', '.cmd', '.bat', ''] : [''];
  for (const directory of directories.filter(Boolean)) {
    for (const extension of extensions) {
      const candidate = path.join(directory.replace(/^"|"$/g, ''), agent + extension);
      try {
        if (fs.statSync(candidate).isFile()) {
          fs.accessSync(candidate, process.platform === 'win32' ? fs.constants.F_OK : fs.constants.X_OK);
          return candidate;
        }
      } catch { /* Continue looking through PATH. */ }
    }
  }
  throw new Error(`${AGENTS[agent]} was not found. Install it and reopen Elio.`);
}

function modeArguments(agent, mode = 'normal') {
  if (!Object.hasOwn(AGENTS, agent) || !['normal', 'full', 'login'].includes(mode)) throw new Error('Invalid session mode.');
  if (mode === 'normal') return [];
  if (mode === 'login') return [...LOGIN_ARGUMENTS[agent]];
  if (!Object.hasOwn(FULL_ACCESS_FLAGS, agent)) throw new Error(`${AGENTS[agent]} does not support full access mode.`);
  return [FULL_ACCESS_FLAGS[agent]];
}

function commandFor(agent, args = []) {
  const executable = findExecutable(agent);
  if (process.platform === 'win32' && /\.(cmd|bat)$/i.test(executable)) {
    const quote = value => `'${value.replace(/'/g, "''")}'`;
    return {
      command: path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
      args: ['-NoLogo', '-NoProfile', '-Command', `& ${[executable, ...args].map(quote).join(' ')}`]
    };
  }
  return { command: executable, args };
}

function startTerminal(agent, cwd, cols, rows, mode = 'normal') {
  const { command, args } = commandFor(agent, modeArguments(agent, mode));
  return spawnTerminal(command, args, cwd, cols, rows);
}

// Isolating the PTY keeps native handles and helper threads scoped to one session.
function spawnTerminal(command, args, cwd, cols, rows) {
  const events = new EventEmitter();
  const worker = fork(path.join(__dirname, 'pty-worker.cjs'), [], {
    execArgv: [],
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
    windowsHide: true
  });
  let ended = false;
  let exitCode;
  let killTimer;
  const send = message => { if (worker.connected) worker.send(message, () => {}); };
  worker.on('message', message => {
    if (message.type === 'output') events.emit('data', message.data);
    if (message.type === 'exit') exitCode = message.exitCode;
  });
  worker.stderr.on('data', data => events.emit('data', '\r\n' + data.toString()));
  worker.on('error', error => events.emit('data', '\r\n' + error.message + '\r\n'));
  worker.on('exit', code => {
    ended = true;
    clearTimeout(killTimer);
    events.emit('exit', { exitCode: exitCode ?? code ?? 1 });
  });
  const listen = (event, callback) => {
    events.on(event, callback);
    return { dispose: () => events.off(event, callback) };
  };
  send({ type: 'start', command, args, cwd, cols: dimension(cols, 80), rows: dimension(rows, 24) });
  return {
    onData: callback => listen('data', callback),
    onExit: callback => listen('exit', callback),
    write: data => send({ type: 'input', data }),
    resize: (cols, rows) => send({ type: 'resize', cols, rows }),
    kill() {
      if (ended || killTimer) return;
      send({ type: 'stop' });
      killTimer = setTimeout(() => { if (!ended) worker.kill(); }, 1500);
      killTimer.unref();
    }
  };
}

function dimension(value, fallback) {
  return Number.isInteger(value) && value >= 2 && value <= 1000 ? value : fallback;
}

module.exports = { AGENTS, FULL_ACCESS_FLAGS, LOGIN_ARGUMENTS, FONTS, DEFAULT_APPEARANCE, appearance, dimension, findExecutable, modeArguments, commandFor, startTerminal, spawnTerminal };
