const { app, BrowserWindow, clipboard, dialog, ipcMain, protocol } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { createController } = require('../src/controller.cjs');
const { renderView } = require('../src/view.cjs');
const { createPreferences } = require('./preferences.cjs');
const { createFavorites } = require('../src/favorites.cjs');
const { createLaunchPreferences } = require('../src/launch-preferences.cjs');
const { createProjects } = require('../src/projects.cjs');
const { dataDirectory } = require('../src/data-directory.cjs');

const root = path.join(__dirname, '..');
const origin = 'elio://app';
app.setName('Elio');
if (process.platform === 'win32') app.setAppUserModelId('Elio.Desktop');
app.setPath('userData', dataDirectory(app.getPath('appData')));
protocol.registerSchemesAsPrivileged([{ scheme: 'elio', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
let controller;

app.whenReady().then(async () => {
  const index = process.argv.indexOf('--cwd');
  const projects = createProjects(app.getPath('userData'));
  const cwd = index === -1 ? null : projects.remember(path.resolve(process.argv[index + 1] || process.cwd())).path;
  const assets = new Map([
    ['/assets/fonts/fonts.css', 'text/css'],
    ['/media/style.css', 'text/css'], ['/media/main.js', 'text/javascript'], ['/media/palettes.js', 'text/javascript'],
    ['/node_modules/@xterm/xterm/css/xterm.css', 'text/css'],
    ['/node_modules/@xterm/xterm/lib/xterm.js', 'text/javascript'],
    ['/node_modules/@xterm/addon-fit/lib/addon-fit.js', 'text/javascript']
  ]);
  const bundledFonts = JSON.parse(fs.readFileSync(path.join(root, 'assets', 'fonts', 'manifest.json'), 'utf8'));
  for (const font of bundledFonts) for (const file of font.files) {
    if (!/^[a-z0-9-]+\/[a-z0-9-]+\.woff2$/.test(file.path)) throw new Error('Invalid font file.');
    assets.set('/assets/fonts/' + file.path, 'font/woff2');
  }
  protocol.handle('elio', request => {
    const url = new URL(request.url);
    if (url.hostname !== 'app' || request.method !== 'GET') return new Response('', { status: 404 });
    if (url.pathname === '/') {
      const html = renderView((...parts) => `${origin}/${parts.join('/')}`, 'elio:');
      return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }
    const mime = assets.get(url.pathname);
    if (!mime) return new Response('', { status: 404 });
    return new Response(fs.readFileSync(path.join(root, url.pathname.slice(1))), { headers: { 'Content-Type': mime.startsWith('font/') ? mime : mime + '; charset=utf-8' } });
  });
  const window = new BrowserWindow({
    title: 'Elio', width: 1120, height: 880, minWidth: 360, minHeight: 460,
    backgroundColor: '#22272a', icon: path.join(root, 'assets', 'app-icon.png'), show: false, autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  if (process.platform === 'win32') {
    const launcher = path.join(root, 'desktop', 'Elio.exe');
    window.setAppDetails({ appId: 'Elio.Desktop', appIconPath: path.join(root, 'assets', 'app-icon.ico'), appIconIndex: 0,
      relaunchCommand: fs.existsSync(launcher) ? '"' + launcher + '"' : '"' + process.execPath + '" "' + __filename + '"',
      relaunchDisplayName: 'Elio' });
  }
  window.removeMenu();
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => { if (url !== origin + '/') event.preventDefault(); });
  window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  const preferences = createPreferences(app.getPath('userData'));
  const favorites = createFavorites(app.getPath('userData'));
  const launchPreferences = createLaunchPreferences(app.getPath('userData'));
  controller = createController({
    cwd, projects, projectParent: app.getPath('documents'),
    pickProject: async current => {
      const result = await dialog.showOpenDialog(window, { title: 'Open project folder', defaultPath: current || app.getPath('documents'), properties: ['openDirectory'] });
      return result.canceled ? null : result.filePaths[0];
    },
    pickProjectParent: async () => {
      const result = await dialog.showOpenDialog(window, { title: 'Choose a location for the new project', defaultPath: app.getPath('documents'), properties: ['openDirectory', 'createDirectory'] });
      return result.canceled ? null : result.filePaths[0];
    },
    post: message => { if (!window.isDestroyed()) window.webContents.send('elio:event', message); },
    getAppearance: () => preferences.read(), saveAppearance: value => preferences.write(value), clipboard,
    getFavorites: () => favorites.read(), toggleFavorite: (value, name) => favorites.toggle(value, name),
    getLaunchModes: () => launchPreferences.read(), saveLaunchMode: (agent, mode) => launchPreferences.set(agent, mode),
    getDefaultAgent: () => launchPreferences.readDefault(), saveDefaultAgent: agent => launchPreferences.setDefault(agent)
  });
  ipcMain.on('elio:message', (event, message) => {
    if (event.sender === window.webContents && event.senderFrame === window.webContents.mainFrame) void controller.receive(message);
  });
  window.on('closed', () => { controller.dispose(); ipcMain.removeAllListeners('elio:message'); });
  window.once('ready-to-show', () => window.show());
  await window.loadURL(origin + '/');
}).catch(error => { console.error(error); app.exit(1); });

app.on('before-quit', () => controller?.dispose());
app.on('window-all-closed', () => app.quit());
