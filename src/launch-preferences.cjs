const fs = require('node:fs');
const path = require('node:path');
const { AGENTS, FULL_ACCESS_FLAGS } = require('./terminal.cjs');

function launchModes(value) {
  return Object.fromEntries(Object.keys(AGENTS).map(agent => [agent, Object.hasOwn(FULL_ACCESS_FLAGS, agent) && value?.[agent] === 'full' ? 'full' : 'normal']));
}
function defaultAgent(value) { return typeof value === 'string' && Object.hasOwn(AGENTS, value) ? value : null; }
function createLaunchPreferences(directory) {
  const filename = path.join(directory, 'launch.json');
  function load() {
    try { return JSON.parse(fs.readFileSync(filename, 'utf8')) || {}; }
    catch (error) {
      if (error.code === 'ENOENT' || error instanceof SyntaxError) return {};
      throw error;
    }
  }
  function save(agents, chosen) {
    fs.mkdirSync(directory, { recursive: true });
    const temporary = filename + '.' + process.pid + '.tmp';
    try {
      fs.writeFileSync(temporary, JSON.stringify({ schemaVersion: 1, agents, ...(chosen ? { defaultAgent: chosen } : {}) }, null, 2) + '\n', { mode: 0o600 });
      fs.renameSync(temporary, filename);
    } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
  }
  const read = () => launchModes(load()?.agents);
  const readDefault = () => defaultAgent(load()?.defaultAgent);
  return {
    read,
    readDefault,
    set(agent, mode) {
      if (!Object.hasOwn(AGENTS, agent) || !['normal', 'full'].includes(mode) || (mode === 'full' && !Object.hasOwn(FULL_ACCESS_FLAGS, agent))) throw new Error('Geçersiz başlatma modu.');
      const agents = { ...read(), [agent]: mode };
      save(agents, readDefault());
      return agents;
    },
    // The agent that "Yeni oturum" opens directly. null means: show the picker every time.
    setDefault(agent) {
      if (agent !== null && !Object.hasOwn(AGENTS, agent)) throw new Error('Geçersiz varsayılan araç.');
      save(read(), agent);
      return agent;
    }
  };
}
module.exports = { launchModes, defaultAgent, createLaunchPreferences };
