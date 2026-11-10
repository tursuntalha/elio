const fs = require('node:fs');
const path = require('node:path');

function projectDirectory(value) {
  if (typeof value !== 'string' || !value.trim() || !path.isAbsolute(value)) throw new Error('Choose a valid project folder.');
  let directory;
  try {
    directory = fs.realpathSync.native(value);
    if (!fs.statSync(directory).isDirectory()) throw new Error();
  } catch { throw new Error('Project folder is missing or inaccessible.'); }
  return directory;
}
function createProjects(directory) {
  const filename = path.join(directory, 'projects.json');
  const key = value => process.platform === 'win32' ? path.normalize(value).toLowerCase() : path.normalize(value);
  function read() {
    try {
      const value = JSON.parse(fs.readFileSync(filename, 'utf8'));
      const seen = new Set();
      return (Array.isArray(value?.projects) ? value.projects : []).filter(item => {
        if (typeof item?.path !== 'string' || !path.isAbsolute(item.path) || seen.has(key(item.path))) return false;
        seen.add(key(item.path)); return true;
      }).slice(0, 20).map(item => ({ path: item.path, name: path.basename(item.path) || item.path, lastOpenedAt: Number(item.lastOpenedAt) || 0 }));
    } catch (error) {
      if (error.code === 'ENOENT' || error instanceof SyntaxError) return [];
      throw error;
    }
  }
  function write(projects) {
    fs.mkdirSync(directory, { recursive: true });
    const temporary = filename + '.' + process.pid + '.tmp';
    try {
      fs.writeFileSync(temporary, JSON.stringify({ schemaVersion: 1, projects }, null, 2) + '\n', { mode: 0o600 });
      fs.renameSync(temporary, filename);
    } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
  }
  const list = () => read().map(item => {
    let available = false;
    try { available = fs.statSync(item.path).isDirectory(); } catch { /* Keep missing projects removable. */ }
    return { ...item, available };
  });
  function remember(value) {
    const folder = projectDirectory(value);
    const project = { path: folder, name: path.basename(folder) || folder, lastOpenedAt: Date.now() };
    write([project, ...read().filter(item => key(item.path) !== key(folder))].slice(0, 20));
    return project;
  }
  return {
    list, remember,
    remove(value) {
      if (typeof value !== 'string' || !path.isAbsolute(value)) throw new Error('Invalid project.');
      write(read().filter(item => key(item.path) !== key(value)));
      return list();
    },
    create(name, parent) {
      if (typeof name !== 'string' || !name.trim() || name.length > 100 || /[<>:"/\\|?*\x00-\x1f]/.test(name) || /[. ]$/.test(name) || /^\.{1,2}$/.test(name) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name.trim())) throw new Error('Enter a valid folder name.');
      const folder = path.join(projectDirectory(parent), name.trim());
      try { fs.mkdirSync(folder); }
      catch (error) {
        if (error.code === 'EEXIST') throw new Error('A file or folder with this name already exists. Use Open project to open an existing folder.');
        throw new Error('Could not create the project folder. Choose another location.');
      }
      try { return remember(folder); }
      catch { throw new Error('The folder was created but could not be added to recent projects. Use Open project to open it.'); }
    }
  };
}
module.exports = { createProjects, projectDirectory };
