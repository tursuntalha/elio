const fs = require('node:fs');
const path = require('node:path');
const { app, shell } = require('electron');
app.setName('Elio');
app.whenReady().then(() => {
  const root = path.resolve(__dirname, '..');
  const target = path.join(root, 'desktop', 'Elio.exe');
  if (!fs.existsSync(target)) throw new Error('Elio launcher not found.');
  const details = { target, args: '', cwd: root, icon: path.join(root, 'assets', 'app-icon.ico'), iconIndex: 0, appUserModelId: 'Elio.Desktop', description: 'Elio - Projects' };
  const equal = (a, b) => path.resolve(a || '.').toLowerCase() === path.resolve(b).toLowerCase();
  function owned(previous) {
    return equal(previous.cwd, root) && (equal(previous.target, target) || (equal(previous.target, require('electron').app.getPath('exe')) && previous.args.includes(path.join(root, 'desktop', 'main.cjs'))));
  }
  function install(filename, updatePinned = false) {
    if (fs.existsSync(filename)) {
      const previous = shell.readShortcutLink(filename);
      if (!owned(previous)) { if (updatePinned) return false; throw new Error('An existing Elio shortcut was left unchanged: ' + filename); }
    }
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    if (!shell.writeShortcutLink(filename, fs.existsSync(filename) ? 'replace' : 'create', details)) throw new Error('Could not save shortcut: ' + filename);
    return true;
  }
  const desktop = path.join(app.getPath('desktop'), 'Elio.lnk');
  const startMenu = path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Elio.lnk');
  install(desktop); install(startMenu);
  const pinnedDirectory = path.join(app.getPath('appData'), 'Microsoft', 'Internet Explorer', 'Quick Launch', 'User Pinned', 'TaskBar');
  let refreshedPins = 0;
  if (fs.existsSync(pinnedDirectory)) for (const entry of fs.readdirSync(pinnedDirectory)) {
    if (!entry.toLowerCase().endsWith('.lnk')) continue;
    const filename = path.join(pinnedDirectory, entry);
    try { if (owned(shell.readShortcutLink(filename)) && install(filename, true)) refreshedPins++; } catch { /* Other applications' pinned links are left alone. */ }
  }
  console.log(JSON.stringify({ desktop, startMenu, target, icon: details.icon, appUserModelId: details.appUserModelId, refreshedPins }));
  app.quit();
}).catch(error => { console.error(error.message); app.exit(1); });
