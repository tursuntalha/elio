const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { parse, modify, applyEdits } = require('jsonc-parser');
const bindings = require('../data/vscode-keybindings.json');

function vscodeKeybindingsFile() {
  const base = process.platform === 'win32' ? process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming')
    : process.platform === 'darwin' ? path.join(os.homedir(), 'Library', 'Application Support') : process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  return path.join(base, 'Code', 'User', 'keybindings.json');
}
function installVSCodeKeys(filename = vscodeKeybindingsFile()) {
  const exists = fs.existsSync(filename);
  let text = exists ? fs.readFileSync(filename, 'utf8') : '[\n]\n';
  const errors = [], entries = parse(text, errors, { allowTrailingComma: true });
  if (errors.length || !Array.isArray(entries)) throw new Error('VS Code keybindings must be a valid list. The file was left unchanged.');
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  let added = 0;
  for (const binding of bindings) {
    // Keep existing user shortcuts and comments; append only missing exact mappings.
    if (entries.some(entry => entry.key === binding.key && entry.command === binding.command && entry.when === binding.when && entry.args?.text === binding.args.text)) continue;
    text = applyEdits(text, modify(text, [entries.length], binding, { isArrayInsertion: true, formattingOptions: { insertSpaces: true, tabSize: 4, eol } }));
    entries.push(binding); added++;
  }
  if (!added) return { filename, added: 0, backup: null };
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  const backup = exists ? filename + '.elio-' + new Date().toISOString().replace(/[:.]/g, '-') + '-' + process.pid + '.bak' : null;
  if (backup) fs.copyFileSync(filename, backup, fs.constants.COPYFILE_EXCL);
  const temporary = filename + '.' + process.pid + '.tmp';
  try { fs.writeFileSync(temporary, text); fs.renameSync(temporary, filename); }
  finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
  return { filename, added, backup };
}
module.exports = { installVSCodeKeys, vscodeKeybindingsFile };
