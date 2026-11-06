const { AGENTS, FONTS, appearance, dimension, startTerminal } = require('./terminal.cjs');
const { readAuthStatus } = require('./auth.cjs');
const { defaultAgent } = require('./launch-preferences.cjs');
const { loadCatalog } = require('./palettes.cjs');
const { FONT_OPTIONS } = require('./fonts.cjs');
const { launchModes } = require('./launch-preferences.cjs');

// Owns the desktop window's terminal session, appearance and account messages.
function createController(host, dependencies = {}) {
  const start = dependencies.startTerminal || startTerminal;
  const sessions = new Map();
  let cwd = host.cwd || null;
  let disposed = false;
  const readAuth = dependencies.readAuthStatus || readAuthStatus;
  const authControllers = new Map();
  const post = message => { if (!disposed) host.post(message); };
  const close = sessionId => {
    const previous = sessions.get(sessionId);
    sessions.delete(sessionId);
    if (!previous?.process) return;
    previous.data.dispose();
    previous.exit.dispose();
    previous.process.kill();
  };
  async function refreshAuth(agent) {
    if (disposed || authControllers.has(agent)) return;
    const controller = new AbortController();
    authControllers.set(agent, controller);
    try {
      const value = await readAuth(agent, controller.signal);
      if (!controller.signal.aborted) post({ type: 'auth', agent, value });
    } catch {
      if (!controller.signal.aborted) post({ type: 'auth', agent, value: { state: 'unknown' } });
    } finally {
      if (authControllers.get(agent) === controller) authControllers.delete(agent);
    }
  }
  async function refreshAllAuth(agent) {
    if (disposed) return;
    const agents = Object.hasOwn(AGENTS, agent) ? [agent] : Object.keys(AGENTS);
    await Promise.all(agents.map(item => refreshAuth(item)));
  }
  function abortBackground() {
    for (const controller of authControllers.values()) controller.abort();
    authControllers.clear();
  }
  function selectProject(project) {
    abortBackground();
    cwd = project.path;
    post({ type: 'project', cwd, projects: host.projects.list() });
    void refreshAllAuth();
  }
  async function receive(message) {
    if (disposed || !message || typeof message.type !== 'string') return;
    try {
      switch (message.type) {
        case 'ready':
          post({ type: 'settings', value: appearance(await host.getAppearance()), launchModes: launchModes(await host.getLaunchModes?.()), defaultAgent: defaultAgent(await host.getDefaultAgent?.()), fonts: FONTS, fontOptions: FONT_OPTIONS, cwd, projects: host.projects?.list() || [], projectParent: host.projectParent, catalog: loadCatalog() });
          try { post({ type: 'favorites', value: await host.getFavorites?.() || [] }); }
          catch (error) { post({ type: 'error', operation: 'getFavorites', message: error.message }); }
          void refreshAllAuth();
          break;
        case 'refreshAuth': void refreshAllAuth(message.agent); break;
        case 'defaultAgent':
          if (message.agent !== null && !Object.hasOwn(AGENTS, message.agent)) throw new Error('Geçersiz varsayılan araç.');
          post({ type: 'defaultAgent', value: defaultAgent(await host.saveDefaultAgent(message.agent)) });
          break;
        case 'projectChoose': {
          const folder = await host.pickProject(cwd);
          if (folder && !disposed) selectProject(host.projects.remember(folder));
          else post({ type: 'projectCancelled' });
          break;
        }
        case 'projectRecent': selectProject(host.projects.remember(message.path)); break;
        case 'projectRemove': post({ type: 'projects', value: host.projects.remove(message.path) }); break;
        case 'projectParent': {
          const folder = await host.pickProjectParent();
          post({ type: 'projectParent', value: folder || null }); break;
        }
        case 'projectCreate': selectProject(host.projects.create(message.name, message.parent)); break;
        case 'appearance': await host.saveAppearance(appearance(message.value)); break;
        case 'launchMode':
          if (!Object.hasOwn(AGENTS, message.agent) || !['normal', 'full'].includes(message.mode)) throw new Error('Geçersiz başlatma modu.');
          post({ type: 'launchModes', value: await host.saveLaunchMode(message.agent, message.mode) });
          break;
        case 'getFavorites': post({ type: 'favorites', value: await host.getFavorites?.() || [] }); break;
        case 'favoriteToggle': {
          const result = await host.toggleFavorite(message.value, message.name);
          post({ type: 'favorites', value: result.favorites }); break;
        }
        case 'start': {
          if (!cwd) throw new Error('Önce bir proje seç.');
          const sessionId = message.sessionId;
          if (typeof sessionId !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(sessionId) || sessions.has(sessionId)) return;
          if (!Object.hasOwn(AGENTS, message.agent)) return;
          const mode = message.mode ?? 'normal';
          const terminal = start(message.agent, cwd, message.cols, message.rows, mode);
          const active = { process: terminal, cwd };
          sessions.set(sessionId, active);
          active.data = terminal.onData(data => { if (sessions.get(sessionId) === active) post({ type: 'output', sessionId, data }); });
          active.exit = terminal.onExit(({ exitCode }) => {
            if (sessions.get(sessionId) !== active) return;
            active.data.dispose();
            active.exit.dispose();
            active.process = undefined;
            post({ type: 'exit', sessionId, exitCode });
            // Signing in changes the account, so the card state is read again.
            if (mode === 'login') void refreshAllAuth(message.agent);
          });
          post({ type: 'started', sessionId, agent: message.agent, mode, cwd });
          break;
        }
        case 'close':
          if (typeof message.sessionId === 'string') {
            close(message.sessionId);
            post({ type: 'closed', sessionId: message.sessionId });
          }
          break;
        case 'input': {
          const session = sessions.get(message.sessionId);
          if (session?.process && typeof message.data === 'string') session.process.write(message.data);
          break;
        }
        case 'resize': {
          const session = sessions.get(message.sessionId);
          if (session?.process) {
            try { session.process.resize(dimension(message.cols, 80), dimension(message.rows, 24)); } catch { /* Session may be exiting. */ }
          }
          break;
        }
        case 'copy':
          if (typeof message.text === 'string') await host.clipboard.writeText(message.text);
          break;
        case 'paste': {
          const sessionId = message.sessionId;
          const target = sessions.get(sessionId);
          if (!target?.process) break;
          const text = await host.clipboard.readText();
          if (sessions.get(sessionId) === target && target.process) post({ type: 'paste', sessionId, text });
          break;
        }
      }
    } catch (error) { post({ type: 'error', sessionId: message.sessionId, operation: message.type, message: error instanceof Error ? error.message : String(error) }); }
  }
  return {
    receive,
    dispose() {
      if (disposed) return;
      disposed = true;
      abortBackground();
      for (const sessionId of sessions.keys()) {
        try { close(sessionId); } catch { /* Process may have exited during shutdown. */ }
      }
    }
  };
}

module.exports = { createController };
