// Exercise VS Code's keybinding dispatcher, not just terminal escape-sequence input.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const { spawn, execFileSync } = require('node:child_process');
const { chromium } = require('playwright-core');
const assert = require('node:assert/strict');
const { installVSCodeKeys } = require('../src/vscode-keys.cjs');

async function main() {
  if (process.platform !== 'win32') throw new Error('This integration check targets the Windows VS Code installation.');
  const root = path.resolve(__dirname, '..');
  const code = path.join(process.env.LOCALAPPDATA, 'Programs', 'Microsoft VS Code', 'Code.exe');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-terminal-vscode-'));
  const profile = path.join(directory, 'profile'), extension = path.join(directory, 'extension');
  const workspace = path.join(directory, 'workspace'), log = path.join(directory, 'events.jsonl');
  for (const folder of [path.join(profile, 'User'), extension, workspace]) fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(log, '');
  fs.writeFileSync(path.join(profile, 'User', 'settings.json'), JSON.stringify({
    'workbench.startupEditor': 'none', 'security.workspace.trust.enabled': false,
    'terminal.integrated.gpuAcceleration': 'off', 'editor.accessibilitySupport': 'on',
    'telemetry.telemetryLevel': 'off', 'update.mode': 'none'
  }));
  installVSCodeKeys(path.join(profile, 'User', 'keybindings.json'));
  const fixture = path.join(directory, 'fixture.cjs');
  fs.writeFileSync(fixture, `const fs=require('node:fs');const log=value=>fs.appendFileSync(${JSON.stringify(log)},JSON.stringify(value)+'\\n');const agent=process.argv[2];
if(process.argv.includes('status')||process.argv.includes('list')){log({type:'status-started'});console.log('{"loggedIn": true}');}
else{process.stdin.setRawMode(true);process.stdin.setEncoding('utf8');console.log('READY '+agent);log({type:'ready',agent});let text='';process.stdin.on('data',data=>{for(const char of data){if(char==='\\r'){log({type:'input',agent,text});text='';}else text+=char;}});}`);
  for (const agent of ['claude', 'codex']) fs.writeFileSync(path.join(directory, agent + '.cmd'), `@"${process.execPath}" "${fixture}" ${agent} %*\r\n`);
  fs.writeFileSync(path.join(extension, 'package.json'), JSON.stringify({ name: 'agent-terminal-key-test', publisher: 'local', version: '0.0.1', engines: { vscode: '^1.90.0' }, activationEvents: ['onStartupFinished'], main: './extension.cjs' }));
  const pathKey = Object.keys(process.env).find(key => key.toLowerCase() === 'path');
  const terminalEnv = { [pathKey]: directory + path.delimiter + process.env[pathKey], ELIO_DATA_DIR: path.join(directory, 'appearance') };
  fs.writeFileSync(path.join(extension, 'extension.cjs'), `const vscode=require('vscode'),fs=require('node:fs');exports.activate=()=>{const terminal=vscode.window.createTerminal({name:'Elio F-key check',shellPath:${JSON.stringify(process.execPath)},shellArgs:[${JSON.stringify(path.join(root, 'bin/elio.cjs'))}],cwd:${JSON.stringify(workspace)},env:${JSON.stringify(terminalEnv)}});vscode.window.onDidCloseTerminal(value=>{if(value===terminal)fs.appendFileSync(${JSON.stringify(log)},JSON.stringify({type:'closed'})+'\\n');});terminal.show();};`);
  const port = await new Promise(resolve => { const server = net.createServer(); server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(() => resolve(port)); }); });
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(code, ['--new-window', '--skip-welcome', '--skip-release-notes', '--disable-workspace-trust', '--user-data-dir', profile,
    '--extensions-dir', path.join(directory, 'extensions'), '--extensionDevelopmentPath=' + extension, '--remote-debugging-port=' + port, workspace], { env, cwd: path.dirname(code), stdio: ['ignore', 'pipe', 'pipe'], windowsHide: false });
  let diagnostics = '';
  child.stdout.on('data', data => { diagnostics = (diagnostics + data).slice(-12000); });
  child.stderr.on('data', data => { diagnostics = (diagnostics + data).slice(-12000); });
  let browser;
  const records = () => fs.readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
  const wait = async (predicate, description, timeout = 30000) => {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) { if (await predicate()) return; await new Promise(resolve => setTimeout(resolve, 100)); }
    throw new Error('VS Code timeout: ' + description + '\n' + JSON.stringify(records()));
  };
  try {
    await wait(async () => { try { return (await fetch(`http://127.0.0.1:${port}/json/version`)).ok; } catch { return false; } }, 'debug connection');
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
    let page;
    try { await wait(() => { page = browser.contexts().flatMap(context => context.pages()).find(page => page.url().includes('workbench')); return !!page; }, 'workbench', 60000); }
    catch (error) {
      let targets = [];
      try { targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); } catch { /* VS Code may exit while waiting for its updater. */ }
      const blocked = diagnostics.includes('vscode-updating is held');
      fs.mkdirSync(path.join(root, '.test-output'), { recursive: true });
      fs.writeFileSync(path.join(root, '.test-output', 'vscode-function-keys.json'), JSON.stringify({ passed: false, blocked, reason: blocked ? 'VS Code updater mutex prevents the isolated test window from opening.' : error.message }, null, 2));
      throw new Error((blocked ? 'VS Code is waiting for its updater; the live keyboard check could not run.' : error.message) + '\nTargets: ' + JSON.stringify(targets) + '\nDiagnostics: ' + diagnostics);
    }
    await wait(() => records().some(event => event.type === 'status-started'), 'inline app ready');
    await page.bringToFront(); await page.locator('.xterm-helper-textarea').last().focus();
    await page.keyboard.press('1'); await page.waitForTimeout(100); await page.keyboard.press('1');
    await wait(() => records().some(event => event.type === 'ready' && event.agent === 'claude'), 'Claude session');
    await page.keyboard.press('F2'); await page.waitForTimeout(150); await page.keyboard.press('2'); await page.waitForTimeout(100); await page.keyboard.press('1');
    await wait(() => records().some(event => event.type === 'ready' && event.agent === 'codex'), 'F2 creates another session');
    await page.keyboard.press('F6'); await page.waitForTimeout(100); await page.keyboard.type('previous-session'); await page.keyboard.press('Enter');
    await wait(() => records().some(event => event.type === 'input' && event.text === 'previous-session'), 'F6 routed input');
    assert.equal(records().find(event => event.text === 'previous-session').agent, 'claude');
    await page.keyboard.press('F7'); await page.waitForTimeout(100); await page.keyboard.type('next-session'); await page.keyboard.press('Enter');
    await wait(() => records().some(event => event.type === 'input' && event.text === 'next-session'), 'F7 routed input');
    assert.equal(records().find(event => event.text === 'next-session').agent, 'codex');
    await page.keyboard.press('F3'); await page.waitForTimeout(150);
    fs.mkdirSync(path.join(root, '.test-output'), { recursive: true });
    await page.screenshot({ path: path.join(root, '.test-output', 'vscode-function-keys.png') });
    await page.keyboard.press('Escape'); await page.waitForTimeout(100);
    await page.keyboard.press('F10'); await page.waitForTimeout(100); await page.keyboard.press('Enter');
    await wait(() => records().some(event => event.type === 'closed'), 'F10 restores and exits terminal');
    fs.writeFileSync(path.join(root, '.test-output', 'vscode-function-keys.json'), JSON.stringify({ passed: true, checks: ['Actual VS Code F2 opens a new inline session', 'Actual VS Code F6 routes input to the previous session', 'Actual VS Code F7 routes input to the next session', 'Actual VS Code F10 exits the inline terminal'], events: records() }, null, 2));
    console.log('VS Code keyboard dispatch passed: F2, F6, F7 and F10.');
  } finally {
    await browser?.close().catch(() => {});
    if (child.exitCode === null) { try { execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }); } catch { /* Already closed. */ } }
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
