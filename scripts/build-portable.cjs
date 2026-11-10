// Builds a portable Windows package: release/Elio-<version>-win-x64.zip
// The archive keeps the repository layout, so no Node.js, Git or npm is needed to run it.
// Requires: `npm ci` has been run and desktop/Elio.exe exists (built automatically on Windows).
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const pkg = require('../package.json');
const name = `Elio-${pkg.version}-win-x64`;
const out = path.join(root, 'release');
const stage = path.join(out, name);
const archive = path.join(out, name + '.zip');
const modules = path.join(root, 'node_modules');

function fail(message) { console.error(message); process.exit(1); }
function copy(from, to, filter) {
  fs.cpSync(path.join(root, from), path.join(stage, to || from), { recursive: true, filter });
}
function crlf(text) { return text.replace(/\r?\n/g, '\r\n'); }

// Production dependency closure, except electron (only its dist folder is shipped).
function closure() {
  const seen = new Set();
  const visit = dependency => {
    if (seen.has(dependency)) return;
    const file = path.join(modules, dependency, 'package.json');
    if (!fs.existsSync(file)) return;
    seen.add(dependency);
    const meta = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const child of Object.keys({ ...meta.dependencies, ...meta.optionalDependencies })) visit(child);
  };
  for (const dependency of Object.keys(pkg.dependencies)) if (dependency !== 'electron') visit(dependency);
  return [...seen];
}

if (!fs.existsSync(path.join(modules, 'electron', 'dist', 'electron.exe'))) fail('Windows Electron not found. Run "npm ci" on Windows first.');
if (process.platform === 'win32') require('./build-launcher.cjs').buildLauncher();
if (!fs.existsSync(path.join(root, 'desktop', 'Elio.exe'))) fail('desktop/Elio.exe is missing. Build it on Windows with "npm run launcher:build".');

fs.rmSync(stage, { recursive: true, force: true });
fs.rmSync(archive, { force: true });
fs.mkdirSync(stage, { recursive: true });

copy('desktop', 'desktop', source => !source.endsWith('launcher.cs'));
for (const folder of ['src', 'media', 'data']) copy(folder);
copy('assets', 'assets', source => !/assets[\\/](screenshot[^\\/]*\.png|demo\.gif)$/.test(source));
copy('LICENSE');
copy('THIRD_PARTY_NOTICES.md');
fs.writeFileSync(path.join(stage, 'package.json'), JSON.stringify({
  name: pkg.name, productName: pkg.productName, version: pkg.version, description: pkg.description,
  license: pkg.license, author: pkg.author, homepage: pkg.homepage, main: pkg.main
}, null, 2) + '\n');

for (const dependency of closure()) {
  if (dependency === 'node-pty') continue;
  copy(path.join('node_modules', dependency));
}
// node-pty: JavaScript plus the x64 Windows prebuilt binaries only (no debug symbols).
copy(path.join('node_modules', 'node-pty', 'package.json'));
copy(path.join('node_modules', 'node-pty', 'lib'), undefined, source => !source.endsWith('.test.js') && !source.endsWith('.map'));
copy(path.join('node_modules', 'node-pty', 'prebuilds', 'win32-x64'), undefined, source => !source.endsWith('.pdb'));
// Electron: the launcher starts node_modules/electron/dist/electron.exe.
copy(path.join('node_modules', 'electron', 'package.json'));
copy(path.join('node_modules', 'electron', 'dist'));

fs.writeFileSync(path.join(stage, 'Elio.cmd'), crlf('@echo off\nstart "" "%~dp0desktop\\Elio.exe" %*\n'));
fs.writeFileSync(path.join(stage, 'Create-Shortcuts.cmd'), crlf([
  '@echo off',
  'powershell -NoProfile -ExecutionPolicy Bypass -Command "$w=New-Object -ComObject WScript.Shell; foreach($p in @(\'Desktop\',\'Programs\')){ $s=$w.CreateShortcut((Join-Path ([Environment]::GetFolderPath($p)) \'Elio.lnk\')); $s.TargetPath=\'%~dp0desktop\\Elio.exe\'; $s.WorkingDirectory=\'%~dp0\'; $s.IconLocation=\'%~dp0assets\\app-icon.ico\'; $s.Save() }"',
  'if errorlevel 1 (echo Could not create the shortcuts.) else (echo Elio shortcuts were added to your Desktop and Start menu.)',
  'pause', ''
].join('\n')));
fs.writeFileSync(path.join(stage, 'README.txt'), crlf([
  'Elio (portable)', '',
  '1. Extract this folder anywhere you like (for example C:\\Elio).',
  '2. Double-click Elio.cmd to start Elio.',
  '3. Optional: double-click Create-Shortcuts.cmd to add Desktop and Start menu shortcuts.', '',
  'Claude Code, Codex or OpenCode must be installed separately and available on your PATH.',
  'Credits and third-party licenses: THIRD_PARTY_NOTICES.md',
  'Project page: ' + pkg.homepage.replace(/#.*$/, ''), ''
].join('\n')));

const zip = process.platform === 'win32'
  ? spawnSync(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe'), ['-a', '-c', '-f', archive, '-C', out, name], { stdio: 'inherit' })
  : spawnSync('zip', ['-qr', archive, name], { cwd: out, stdio: 'inherit' });
if (zip.status !== 0) fail('Could not create the archive.');
console.log(`${path.relative(root, archive)}  ${(fs.statSync(archive).size / 1048576).toFixed(1)} MB`);
