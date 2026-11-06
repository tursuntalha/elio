const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { Terminal } = require('@xterm/headless');
const { spawnTerminal } = require('../src/terminal.cjs');
const { LEAVE } = require('../src/terminal-ui.cjs');
const { colorGrid, nearestColor, COLUMNS } = require('../src/color-grid.cjs');

async function main() {
  const root = path.resolve(__dirname, '..'), output = path.join(root, '.test-output');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-terminal-test-'));
  const workspace = path.join(directory, 'masaüstü proje'); fs.mkdirSync(workspace);
  const fixture = path.join(directory, 'fixture.cjs');
  fs.writeFileSync(fixture, `
const agent=process.argv[2], args=process.argv.slice(3);
if(agent==='claude'&&args[0]==='auth'&&args[1]==='status'){console.log('{"loggedIn": false}');}
else if(agent==='codex'&&args[0]==='login'&&args[1]==='status'){console.log('Logged in using ChatGPT');}
else if(agent==='opencode'&&args[0]==='auth'&&args[1]==='list'){console.log('\\u25cf  OpenAI api');console.log('\\u25cf  Nvidia api');}
else {
  process.stdin.setRawMode(true); process.stdin.setEncoding('utf8');
  console.log('READY '+agent+' '+(args.join(' ')||'normal'));
  console.log('CWD '+process.cwd());
  process.stdout.write('\\x1b[32mANSI_GREEN\\x1b[0m\\r\\n');
  let line=''; process.stdin.on('data',data=>{for(const char of data){
    if(char==='\\x03')process.exit(0);
    else if(char==='\\r'){console.log('REPLY '+line);line='';}
    else if(char!=='\\n')line+=char;
  }});
  process.stdout.on('resize',()=>console.log('SIZE '+process.stdout.columns+'x'+process.stdout.rows));
}
`);
  for (const agent of ['claude', 'codex', 'opencode']) {
    const filename = path.join(directory, agent + (process.platform === 'win32' ? '.cmd' : ''));
    fs.writeFileSync(filename, process.platform === 'win32' ? `@"${process.execPath}" "${fixture}" ${agent} %*\r\n` : `#!/bin/sh\nexec '${process.execPath}' '${fixture}' ${agent} "$@"\n`, { mode: 0o755 });
  }
  const pathKey = Object.keys(process.env).find(key => key.toLowerCase() === 'path');
  const originalPath = process.env[pathKey], originalData = process.env.ELIO_DATA_DIR, originalClaude = process.env.CLAUDE_CONFIG_DIR;
  process.env[pathKey] = directory + path.delimiter + originalPath;
  process.env.ELIO_DATA_DIR = path.join(directory, 'profile');
  process.env.CLAUDE_CONFIG_DIR = path.join(directory, 'no-claude-login');
  const terminal = new Terminal({ cols: 110, rows: 34, allowProposedApi: true, scrollback: 100 });
  let child;
  try { child = spawnTerminal(process.execPath, [path.join(root, 'bin', 'elio.cjs')], workspace, 110, 34); }
  finally { process.env[pathKey] = originalPath; if (originalData === undefined) delete process.env.ELIO_DATA_DIR; else process.env.ELIO_DATA_DIR = originalData; if (originalClaude === undefined) delete process.env.CLAUDE_CONFIG_DIR; else process.env.CLAUDE_CONFIG_DIR = originalClaude; }
  let raw = '', exited = false;
  const exit = new Promise(resolve => child.onExit(value => { exited = true; resolve(value); }));
  child.onData(data => { raw += data; terminal.write(data); });
  terminal.onData(data => { if (!exited) child.write(data); });
  const screen = () => Array.from({length:terminal.rows},(_,i)=>terminal.buffer.active.getLine(i + terminal.buffer.active.baseY)?.translateToString(true) || '').join('\n');
  const wait = async (predicate, description, timeout = 15000) => {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) { if (predicate()) return; if (exited) throw new Error('Exited before ' + description + ': ' + raw.slice(-400)); await new Promise(resolve => setTimeout(resolve, 30)); }
    throw new Error('Timeout: ' + description + '\n' + screen());
  };
  const snapshots = [];
  const snapshot = name => snapshots.push({ name, cols: terminal.cols, rows: terminal.rows, ansi: raw });
  const send = data => child.write(data);
  const moveColor = (from, to) => {
    const row = Math.floor(to / COLUMNS) - Math.floor(from / COLUMNS), col = to % COLUMNS - from % COLUMNS;
    send((row >= 0 ? '\x1b[B' : '\x1b[A').repeat(Math.abs(row)) + (col >= 0 ? '\x1b[C' : '\x1b[D').repeat(Math.abs(col)));
  };
  const command = async number => send({ 0: '\x1b[21~', 3: '\x1bOS', 4: '\x1bOR', 5: '\x1bOQ', 6: '\x1b[17~', 7: '\x1b[18~' }[number]);
  const background = () => terminal.buffer.active.getLine(1).getCell(1).getBgColor();
  try {
    await wait(() => screen().includes('Yeni oturum') && screen().includes('Giriş yapıldı') && screen().includes('OpenCode') && screen().includes('Giriş yapılmamış') && screen().includes('Sağlayıcı: 2 bağlı'), 'home and sign-in states'); snapshot('home');
    const mascotPosition = () => screen().split('\n').find(line => line.includes('╱──────╲'))?.indexOf('╱──────╲');
    const firstPosition = mascotPosition(); await wait(() => mascotPosition() !== firstPosition, 'walking mascot'); snapshot('home-walk');
    assert.ok(raw.includes('\x1b[?1049h')); assert.ok(!raw.includes('Elio açılıyor.'));
    send('1'); await wait(() => screen().includes('READY claude normal'), 'Claude starts directly in normal mode');
    assert.ok(screen().includes('ANSI_GREEN')); assert.ok(screen().includes('masaüstü proje'));
    send('\x1b[20~'); await wait(() => screen().includes('Kısayollar'), 'rename shortcut menu'); send('a');
    await wait(() => screen().includes('Boş bırakırsan'), 'rename editor');
    send('Ödeme ekranı'); await wait(() => screen().includes('Ödeme ekranı'), 'Unicode session name'); snapshot('rename'); send('\r');
    await wait(() => !screen().includes('Boş bırakırsan') && screen().includes('Ödeme ekranı'), 'saved session name');
    assert.ok(screen().includes('READY claude normal'));
    send('\x1b[20~'); await wait(() => screen().includes('Kısayollar'), 'reset name shortcut menu'); send('a');
    await wait(() => screen().includes('Boş bırakırsan'), 'reset name editor'); send('\x15\r');
    await wait(() => !screen().includes('Boş bırakırsan') && screen().includes('Claude 1'), 'default session name restored');

    send('\x1b[200~merhaba ğüşiöç\x1b[201~0123456789\r'); await wait(() => screen().includes('REPLY merhaba ğüşiöç0123456789'), 'Unicode paste and literal digits');
    await command(5); await wait(() => screen().includes('Yeni oturum'), 'new session home');
    send('\x1b[20~'); await wait(() => screen().includes('Kısayollar'), 'launch mode menu'); send('c');
    await wait(() => screen().includes('Başlat düğmesinin'), 'Codex saved mode'); snapshot('mode'); send('2');
    await wait(() => !screen().includes('Başlat düğmesinin'), 'mode saved without starting');
    assert.equal(JSON.parse(fs.readFileSync(path.join(directory, 'profile', 'launch.json'))).agents.codex, 'full');
    send('2');
    await wait(() => screen().includes('READY codex --yolo'), 'Codex full permissions');
    await command(6); await wait(() => screen().includes('READY claude normal'), 'numeric previous session');
    await command(7); await wait(() => screen().includes('READY codex --yolo'), 'numeric next session');
    await command(6); await wait(() => screen().includes('READY claude normal'), 'return to existing Claude');
    await command(4); await wait(() => screen().includes('Bu oturumun görünümü'), 'local theme');
    send('/Tokyo Night\r'); await wait(() => screen().includes('Tokyo Night'), 'catalog search'); send(' ');
    await wait(() => screen().includes('#1a1b26'), 'choose filtered theme');
    send('/\x15\r'); await wait(() => !screen().includes('/ Ara: Tokyo'), 'clear search');
    send('1'); await wait(() => screen().includes('#282a36'), 'local preview'); snapshot('theme');
    send('r'); await wait(() => { const pair = screen().match(/(#[a-f0-9]{6})\s+\/\s+(#[a-f0-9]{6})/); return pair && (pair[1] !== '#282a36' || pair[2] !== '#f8f8f2'); }, 'random preview changes visibly');
    const randomColors = screen().match(/(#[a-f0-9]{6})\s+\/\s+(#[a-f0-9]{6})/);
    const randomPair = require('../data/palettes.json').palettes.find(pair => pair.background === randomColors[1] && pair.foreground === randomColors[2]);
    assert.ok(randomPair); assert.ok(screen().includes(randomPair.name.slice(0, 20))); snapshot('theme-random');
    send('1m'); await wait(() => screen().includes('Kendi renklerin'), 'visual custom color picker');
    const colors = colorGrid(), backgroundIndex = 3 * COLUMNS + 7, foregroundIndex = 11 * COLUMNS + 5;
    moveColor(nearestColor(colors, '#282a36'), backgroundIndex);
    await wait(() => screen().includes(colors[backgroundIndex].hex), 'background selected with arrows');
    send('\t'); moveColor(nearestColor(colors, '#f8f8f2'), foregroundIndex);
    await wait(() => screen().includes(colors[backgroundIndex].hex + '  /  ' + colors[foregroundIndex].hex), 'independent live text color');
    snapshot('custom-colors'); send('s');
    await wait(() => screen().includes(colors[backgroundIndex].hex + '  /  ' + colorGrid(2)[foregroundIndex].hex), 'pastel tone preview');
    snapshot('custom-pastel'); send('k'); await wait(() => screen().includes('Favoriden çıkar'), 'favorite custom pair');
    send('v'); await wait(() => screen().includes('Özel tema 1') && screen().includes('1 favori'), 'custom favorite list');
    send('k'); await wait(() => screen().includes('Favori yok.'), 'remove favorite');
    send('p'); await wait(() => screen().includes('/ Ara:'), 'return to ready themes'); send('1k');
    await wait(() => screen().includes('Favoriden çıkar'), 'favorite preset'); send('v');
    await wait(() => screen().includes('Dracula') && screen().includes('1 favori'), 'favorite preset list'); snapshot('favorites');
    assert.equal(JSON.parse(fs.readFileSync(path.join(directory, 'profile', 'favorites.json'))).favorites[0].name, 'Dracula');
    send('\r');
    await wait(() => !screen().includes('/ Ara:') && background() === 0x282a36, 'local theme applied');
    assert.ok(!fs.existsSync(path.join(directory, 'profile', 'appearance.json')));
    await command(3); await wait(() => screen().includes('Genel görünüm') && screen().includes('/ Ara:'), 'global theme'); send('5\r');
    await wait(() => !screen().includes('/ Ara:'), 'global theme saved');
    assert.equal(background(), 0x282a36);
    assert.equal(JSON.parse(fs.readFileSync(path.join(directory, 'profile', 'appearance.json'))).background, '#1e1e2e');
    await command(5); await wait(() => screen().includes('Yeni oturum'), 'home for later session'); send('1');
    await wait(() => screen().includes('READY claude normal') && screen().includes('Claude 2'), 'second Claude');
    assert.equal(background(), 0x1e1e2e); snapshot('session');
    await command(6); await wait(() => screen().includes('READY codex --yolo'), 'Codex preserved');
    assert.equal(background(), 0x1f2427);
    terminal.resize(80, 25); child.resize(80, 25);
    await wait(() => screen().includes('SIZE 58x24'), 'nested PTY resize'); snapshot('compact-session');
    send('\x1bOR'); await wait(() => screen().includes('Bu oturumun görünümü'), 'compact theme preview'); snapshot('compact-theme');
    send('m'); await wait(() => screen().includes('Kendi renklerin'), 'compact color picker'); snapshot('compact-colors'); send('\x1b');
    await wait(() => !screen().includes('GÖRÜNÜM') && screen().includes('SIZE 58x24'), 'close compact theme preview');
    send('\x03'); await wait(() => screen().includes('Oturum bitti'), 'Ctrl+C only ends selected CLI');
    await command(6); await wait(() => screen().includes('REPLY merhaba ğüşiöç'), 'surviving CLI retains output');
    await command(5); await wait(() => screen().includes('Yeni oturum') && screen().includes('OpenCode'), 'home before OpenCode');
    send('o'); await wait(() => screen().includes('READY opencode normal'), 'OpenCode starts from its shortcut in normal mode');
    // Sign-in action and default agent from the home screen.
    await command(5); await wait(() => screen().includes('Yeni oturum') && screen().includes('Giriş yapılmamış') && screen().includes('L Giriş yap'), 'signed-out Claude card'); snapshot('home-login');
    send('l'); await wait(() => screen().includes('READY claude auth login'), 'L runs the tool\'s own login command in a session');
    await command(5); await wait(() => screen().includes('Giriş yapılmamış'), 'home after login session');
    send('d'); await wait(() => screen().includes('Claude Code ★'), 'D sets the default agent'); snapshot('home-default');
    await command(5); await wait(() => screen().includes('READY claude normal') && screen().includes('Claude 3'), 'F2 opens the default agent directly');
    await command(0); await wait(() => screen().includes('Tüm oturumlar'), 'exit confirmation'); send('\x1b');
    await wait(() => !screen().includes('Tüm oturumlar'), 'cancel exit');
    await command(0); await wait(() => screen().includes('Tüm oturumlar'), 'confirm exit again'); send('1');
    const result = await Promise.race([exit, new Promise((_, reject) => setTimeout(() => reject(new Error('Exit timeout')), 8000))]);
    assert.equal(result.exitCode, 0); assert.ok(raw.includes(LEAVE));
    fs.mkdirSync(output, { recursive: true }); fs.writeFileSync(path.join(output, 'tui-snapshots.json'), JSON.stringify(snapshots));
    fs.writeFileSync(path.join(output, 'tui-live.json'), JSON.stringify({ passed: true, checks: ['Default command stays in its parent terminal', 'Normal and full CLI modes', 'Unicode input and paste', 'Independent sessions and retained output', 'Local theme and future-only persisted defaults', 'Nested PTY resize', 'Ctrl+C routes only to active CLI', 'Exit confirmation and terminal restoration'] }, null, 2));
    console.log('Terminal UI passed: inline launch, sessions, input, themes, resize and clean exit.');
  } finally { if (!exited) child.kill(); terminal.dispose(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
