const os = require('node:os');
const path = require('node:path');

function dataDirectory(fallback, environment = process.env) {
  // Keep the original on-disk location so rebranding preserves all user settings.
  return environment.ELIO_DATA_DIR || environment.AGENT_TERMINAL_DATA_DIR || path.join(fallback || environment.APPDATA || path.join(os.homedir(), '.config'), 'agent-terminal');
}
module.exports = { dataDirectory };
