const fs = require('node:fs');
const path = require('node:path');

function parseArguments(args, currentDirectory = process.cwd()) {
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) return { action: 'help' };
  if (args.length === 1 && ['--version', '-v'].includes(args[0])) return { action: 'version' };
  if (args.length === 1 && args[0] === '--setup-vscode') return { action: 'setup-vscode' };
  if (args.length === 1 && args[0] === '--setup-shortcut') return { action: 'setup-shortcut' };
  const window = args.includes('--window');
  const positional = args.filter(argument => argument !== '--window');
  if (args.filter(argument => argument === '--window').length > 1 || positional.length > 1 || positional[0]?.startsWith('-')) throw new Error('Usage: elio [--window] [folder]');
  const cwd = path.resolve(currentDirectory, positional[0] || '.');
  if (!fs.statSync(cwd, { throwIfNoEntry: false })?.isDirectory()) throw new Error('Working folder not found: ' + cwd);
  return { action: window ? 'window' : 'terminal', cwd };
}
module.exports = { parseArguments };
