const pty = require('node-pty');

let terminal;
let exiting = false;
function send(message) { if (process.connected) process.send(message, () => {}); }
function finish(exitCode) {
  if (exiting) return;
  exiting = true;
  const timeout = setTimeout(() => process.exit(0), 500);
  if (process.connected) process.send({ type: 'exit', exitCode }, () => { clearTimeout(timeout); process.exit(0); });
  else process.exit(0);
}

process.on('message', message => {
  try {
    if (message.type === 'start' && !terminal) {
      const env = Object.fromEntries(Object.entries(process.env).filter(([, value]) => typeof value === 'string'));
      delete env.ELECTRON_RUN_AS_NODE;
      terminal = pty.spawn(message.command, message.args, {
        name: 'xterm-256color', cwd: message.cwd, cols: message.cols, rows: message.rows,
        useConptyDll: process.platform === 'win32',
        env: { ...env, TERM: 'xterm-256color', COLORTERM: 'truecolor' }
      });
      terminal.onData(data => send({ type: 'output', data }));
      terminal.onExit(event => finish(event.exitCode));
    }
    if (message.type === 'input' && terminal) terminal.write(message.data);
    if (message.type === 'resize' && terminal) terminal.resize(message.cols, message.rows);
    if (message.type === 'stop') {
      terminal?.kill();
      setTimeout(() => finish(0), 300);
    }
  } catch (error) {
    send({ type: 'output', data: '\r\n' + error.message + '\r\n' });
    finish(1);
  }
});
process.on('disconnect', () => {
  try { terminal?.kill(); } finally { setTimeout(() => process.exit(0), 300); }
});
