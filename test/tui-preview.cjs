const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { _electron } = require('playwright-core');

async function main() {
  const root = path.resolve(__dirname, '..'), output = path.join(root, '.test-output');
  const snapshots = JSON.parse(fs.readFileSync(path.join(output, 'tui-snapshots.json'), 'utf8'));
  const css = pathToFileURL(path.join(root, 'node_modules/@xterm/xterm/css/xterm.css')).href;
  const js = pathToFileURL(path.join(root, 'node_modules/@xterm/xterm/lib/xterm.js')).href;
  const html = path.join(output, 'tui-preview.html'), launcher = path.join(output, 'tui-preview-main.cjs');
  fs.writeFileSync(html, `<!doctype html><meta charset="UTF-8"><link rel="stylesheet" href="${css}"><style>body{margin:0;padding:18px;background:#10161e}#terminal{display:inline-block}.xterm-viewport{overflow:hidden!important}</style><div id="terminal"></div><script src="${js}"></script><script>let term;window.show=async snapshot=>{term?.dispose();term=new Terminal({cols:snapshot.cols,rows:snapshot.rows,fontSize:16,fontFamily:'Cascadia Mono,Consolas,monospace',lineHeight:1.2,theme:{background:'#10161e',foreground:'#e3eaf2'}});term.open(document.querySelector('#terminal'));await new Promise(resolve=>term.write(snapshot.ansi,resolve));};</script>`);
  fs.writeFileSync(launcher, `const {app,BrowserWindow}=require('electron');app.whenReady().then(()=>{const window=new BrowserWindow({show:true,focusable:false,skipTaskbar:true,width:1200,height:820,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});window.loadFile(${JSON.stringify(html)});});`);
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const app = await _electron.launch({ executablePath: require('electron'), args: [launcher], env });
  try {
    const page = await app.firstWindow(); await page.waitForFunction(() => typeof window.show === 'function');
    await page.setViewportSize({ width: 1250, height: 1000 });
    for (const snapshot of snapshots) {
      await Promise.race([page.evaluate(snapshot => window.show(snapshot), snapshot), new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error('Preview rendering timed out')), 10000); timer.unref(); })]);
      const clip = await page.locator('#terminal').boundingBox();
      await page.screenshot({ path: path.join(output, `tui-${snapshot.name}.png`), clip, timeout: 8000 });
    }
    console.log('Saved actual terminal screen previews.');
  } finally { await app.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

