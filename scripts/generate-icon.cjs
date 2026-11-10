const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
if (!process.versions.electron) {
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const args = ['--disable-gpu', '--disable-gpu-compositing', '--disable-features=VizDisplayCompositor', '--force-device-scale-factor=1', path.relative(root, __filename)];
  const result = require('node:child_process').spawnSync(require('electron'), args, { cwd: root, env, windowsHide: true, stdio: 'inherit' });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} else {
  const { app, BrowserWindow } = require('electron');
  app.disableHardwareAcceleration();
  app.whenReady().then(async () => {
    const window = new BrowserWindow({ width: 256, height: 256, useContentSize: true, frame: false, show: false, transparent: true, webPreferences: { offscreen: true, sandbox: true, contextIsolation: true, nodeIntegration: false } });
    const svg = fs.readFileSync(path.join(root, 'assets', 'app-icon.svg'), 'utf8');
    await window.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent('<style>html,body{margin:0;background:transparent;overflow:hidden}</style>' + svg));
    const capture = await window.webContents.capturePage(); const png = capture.resize({ width: 256, height: 256 }).toPNG();
    fs.writeFileSync(path.join(root, 'assets', 'app-icon.png'), png);
    const sizes = [16, 20, 24, 32, 40, 48, 64, 128, 256];
    const images = sizes.map(size => capture.resize({ width: size, height: size }).toPNG());
    const header = Buffer.alloc(6 + sizes.length * 16);
    header.writeUInt16LE(1, 2); header.writeUInt16LE(sizes.length, 4);
    let offset = header.length;
    sizes.forEach((size, index) => {
      const entry = 6 + index * 16;
      header[entry] = size === 256 ? 0 : size; header[entry + 1] = header[entry];
      header.writeUInt16LE(1, entry + 4); header.writeUInt16LE(32, entry + 6);
      header.writeUInt32LE(images[index].length, entry + 8); header.writeUInt32LE(offset, entry + 12);
      offset += images[index].length;
    });
    const ico = Buffer.concat([header, ...images]);
    for (const filename of ['app-icon.ico', 'elio.ico', 'elio-mascot.ico']) fs.writeFileSync(path.join(root, 'assets', filename), ico);
    window.destroy(); app.quit();
  }).catch(error => { console.error(error.message); app.exit(1); });
}
