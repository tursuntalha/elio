const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
function buildLauncher() {
  if (process.platform !== 'win32') return null;
  const root = path.resolve(__dirname, '..');
  const compiler = ['Framework64', 'Framework'].map(folder => path.join(process.env.WINDIR || 'C:\\Windows', 'Microsoft.NET', folder, 'v4.0.30319', 'csc.exe')).find(file => fs.existsSync(file));
  if (!compiler) throw new Error('Could not build the Windows launcher. C# compiler not found.');
  const filename = path.join(root, 'desktop', 'Elio.exe');
  const result = spawnSync(compiler, ['/nologo', '/target:winexe', '/platform:anycpu', '/optimize+', '/utf8output', '/reference:System.Windows.Forms.dll', '/win32icon:' + path.join(root, 'assets', 'elio-mascot.ico'), '/out:' + filename, path.join(root, 'desktop', 'launcher.cs')], { encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) throw new Error(result.error?.message || result.stdout || result.stderr || 'Could not build the Elio launcher.');
  return filename;
}
if (require.main === module) console.log(buildLauncher() || 'The Windows launcher can only be built on Windows.');
module.exports = { buildLauncher };
