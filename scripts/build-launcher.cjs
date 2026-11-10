const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
function buildLauncher() {
  if (process.platform !== 'win32') return null;
  const root = path.resolve(__dirname, '..');
  const compiler = ['Framework64', 'Framework'].map(folder => path.join(process.env.WINDIR || 'C:\\Windows', 'Microsoft.NET', folder, 'v4.0.30319', 'csc.exe')).find(file => fs.existsSync(file));
  if (!compiler) throw new Error('Could not build the Windows launcher. C# compiler not found.');
  const filename = path.join(root, 'desktop', 'Elio.exe');
  // Stamp the executable with the version from package.json (for example 0.20.0 becomes 0.20.0.0).
  const version = require('../package.json').version.split(/[-+]/)[0] + '.0';
  const source = fs.readFileSync(path.join(root, 'desktop', 'launcher.cs'), 'utf8').replace(/(Assembly(?:File)?Version\(")[\d.]+("\))/g, '$1' + version + '$2');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'elio-launcher-'));
  try {
    const stamped = path.join(directory, 'launcher.cs');
    fs.writeFileSync(stamped, '\uFEFF' + source, 'utf8');
    const result = spawnSync(compiler, ['/nologo', '/target:winexe', '/platform:anycpu', '/optimize+', '/utf8output', '/reference:System.Windows.Forms.dll', '/win32icon:' + path.join(root, 'assets', 'elio-mascot.ico'), '/out:' + filename, stamped], { encoding: 'utf8', windowsHide: true });
    if (result.status !== 0) throw new Error(result.error?.message || result.stdout || result.stderr || 'Could not build the Elio launcher.');
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
  return filename;
}
if (require.main === module) console.log(buildLauncher() || 'The Windows launcher can only be built on Windows.');
module.exports = { buildLauncher };
