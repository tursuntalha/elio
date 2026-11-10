#!/usr/bin/env node
if (process.platform !== 'win32') {
  console.error('Elio currently supports Windows 10/11 only.');
  process.exit(1);
}
const path = require('node:path');
const { spawn } = require('node:child_process');
const { parseArguments } = require('../src/cli-options.cjs');

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.action === 'help') {
    console.log('Elio\n\n  elio                  Open the workspace in this terminal\n  elio [folder]         Open a folder in this terminal\n  elio --window         Open the desktop project picker\n  elio --setup-shortcut Create desktop and Start menu shortcuts\n  elio --setup-vscode   Set up VS Code function keys (creates a backup)\n  elio --version        Show version\n\n  F1 Help · F2 New · F3 Session theme · F4 Global theme\n  F6/F7 Previous/next · F8 Close · F9 Menu · F10 Exit');
  } else if (options.action === 'version') {
    console.log(require('../package.json').version);
  } else if (options.action === 'setup-shortcut') {
    require('../scripts/install-shortcut.cjs');
  } else if (options.action === 'setup-vscode') {
    const result = require('../src/vscode-keys.cjs').installVSCodeKeys();
    console.log(result.added ? 'VS Code function keys are set up.' : 'VS Code function keys are already set up.');
    if (result.backup) console.log('Previous keybindings backed up to: ' + result.backup);
  } else if (options.action === 'terminal') {
    await require('../src/terminal-ui.cjs').runTerminalUI(options.cwd);
  } else {
    const electron = require('electron');
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    const hasFolder = process.argv.slice(2).some(value => !value.startsWith('--'));
    const child = spawn(electron, [path.join(__dirname, '..', 'desktop', 'main.cjs'), ...(hasFolder ? ['--cwd', options.cwd] : [])], {
      cwd: options.cwd, env, detached: true, stdio: 'ignore', windowsHide: false
    });
    child.once('error', error => { console.error('Could not open Elio: ' + error.message); process.exitCode = 1; });
    child.once('spawn', () => { child.unref(); console.log('Opening Elio.'); });
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
