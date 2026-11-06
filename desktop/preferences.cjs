const fs = require('node:fs');
const path = require('node:path');
const { appearance } = require('../src/terminal.cjs');

function createPreferences(directory) {
  const filename = path.join(directory, 'appearance.json');
  return {
    read() {
      try { return appearance(JSON.parse(fs.readFileSync(filename, 'utf8'))); }
      catch (error) {
        if (error.code === 'ENOENT' || error instanceof SyntaxError) return appearance();
        throw error;
      }
    },
    write(value) {
      fs.mkdirSync(directory, { recursive: true });
      const temporary = filename + '.' + process.pid + '.tmp';
      try {
        fs.writeFileSync(temporary, JSON.stringify(appearance(value), null, 2) + '\n', { mode: 0o600 });
        fs.renameSync(temporary, filename);
      } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
    }
  };
}
module.exports = { createPreferences };
