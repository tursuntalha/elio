const { randomUUID } = require('node:crypto');
const { Terminal } = require('@xterm/headless');
const { AGENTS, FULL_ACCESS_FLAGS, appearance, startTerminal } = require('./terminal.cjs');
const { loadCatalog } = require('./palettes.cjs');
const { randomPair, matching, filterPalettes } = require('../media/palettes.js');
const { readAuthStatus } = require('./auth.cjs');
const { createPreferences } = require('../desktop/preferences.cjs');
const { Frame, drawFrame, clipped, textWidth } = require('./tui-screen.cjs');
const { InputDecoder } = require('./tui-input.cjs');
const { COLUMNS: COLOR_COLUMNS, SATURATIONS, colorGrid, nearestColor } = require('./color-grid.cjs');
const { createFavorites } = require('./favorites.cjs');
const { mascotFrame } = require('./mascot.cjs');
const { dataDirectory } = require('./data-directory.cjs');
const { launchModes, defaultAgent, createLaunchPreferences } = require('./launch-preferences.cjs');

const UI = { bg: '#22272a', fg: '#eef2f0', muted: '#a8b3b0', border: '#4b5659', panel: '#2b3134', accent: '#a4c4bb', claude: '#e58f70', codex: '#a3a8ff', opencode: '#d4d4d8', danger: '#f1b580' };
const VIEW_TOP = 1;
const ENTER = '\x1b[?1049h\x1b[?25l\x1b[?7l\x1b[?1000h\x1b[?1002h\x1b[?1006h\x1b[?2004h';
const LEAVE = '\x1b[?2026l\x1b[0m\x1b[?1000l\x1b[?1002l\x1b[?1003l\x1b[?1006l\x1b[?2004l\x1b[?7h\x1b[?25h\x1b[?1049l';

class TerminalUI {
  constructor(options) {
    this.cwd = options.cwd;
    this.cols = options.cols || 100; this.rows = options.rows || 30;
    this.preferences = options.preferences;
    this.general = appearance(this.preferences.read());
    this.launchPreferences = options.launchPreferences || { read: () => this.launchModes || launchModes(), set: (agent, mode) => ({ ...this.launchModes, [agent]: mode }) };
    this.launchModes = launchModes(this.launchPreferences.read());
    this.defaultAgent = defaultAgent(this.launchPreferences.readDefault?.());
    this.readAuth = options.readAuthStatus || readAuthStatus;
    this.auth = { claude: { state: 'unknown' }, codex: { state: 'unknown' }, opencode: { state: 'unknown' } }; this.authRequests = new Map();
    this.start = options.startTerminal || startTerminal;
    this.invalidate = options.invalidate || (() => {});
    this.onExit = options.onExit || (() => {});
    this.catalog = loadCatalog(); this.sessions = []; this.selected = null;
    this.favoriteStore = options.favorites || { read: () => [], toggle: () => { throw new Error('Favorites are unavailable.'); } };
    this.favorites = []; this.favoriteError = '';
    this.home = true; this.focus = 0; this.modal = null; this.notice = '';
    this.frame = null; this.closed = false;
    this.now = options.now || Date.now; this.mascotStartedAt = this.now(); this.motion = options.motion !== false;
  }
  sessionLabel(session, compact = false) { return session.name || (session.mode === 'login' ? `${AGENTS[session.agent]} sign-in` : `${compact && session.agent === 'claude' ? 'Claude' : AGENTS[session.agent]} ${session.number}`); }
  get active() { return this.sessions.find(session => session.id === this.selected); }
  get contentCols() { return this.cols - (this.cols >= 110 ? 24 : this.cols >= 80 ? 20 : 0); }
  get viewport() { return { cols: Math.max(2, this.contentCols - 2), rows: Math.max(2, this.rows - VIEW_TOP) }; }
  refreshAuth(force = false) {
    if (this.closed) return;
    for (const agent of Object.keys(this.auth)) {
      const current = this.auth[agent];
      if (this.authRequests.has(agent) || !force && current.updatedAt && Date.now() - current.updatedAt < 60000) continue;
      const controller = new AbortController(); this.authRequests.set(agent, controller);
      Promise.resolve().then(() => this.readAuth(agent, controller.signal)).then(value => {
        if (!this.closed && !controller.signal.aborted) this.auth[agent] = { ...value, updatedAt: Date.now() };
      }).catch(() => { if (!this.closed) this.auth[agent] = { state: 'unknown', updatedAt: Date.now() }; }).finally(() => {
        if (this.authRequests.get(agent) === controller) this.authRequests.delete(agent);
        if (!this.closed) this.invalidate();
      });
    }
  }
  resize(cols, rows) {
    this.cols = Math.max(1, Math.min(500, cols)); this.rows = Math.max(1, Math.min(200, rows));
    const size = this.viewport;
    for (const session of this.sessions) {
      session.terminal.resize(size.cols, size.rows);
      try { if (session.running) session.process.resize(size.cols, size.rows); } catch { /* PTY may be exiting. */ }
      session.scroll = Math.min(session.scroll, session.terminal.buffer.active.baseY);
    }
    this.invalidate();
  }
  startSession(agent, mode) {
    let terminal, process;
    try {
      const size = this.viewport;
      terminal = new Terminal({ ...size, allowProposedApi: true, scrollback: 4000, theme: this.general });
      process = this.start(agent, this.cwd, size.cols, size.rows, mode);
      const number = mode === 'login' ? 0 : this.sessions.filter(item => item.agent === agent).reduce((max, item) => Math.max(max, item.number), 0) + 1;
      const session = { id: randomUUID(), agent, number, mode, appearance: { ...this.general }, terminal, process, running: true, cursorVisible: true, sgrMouse: false, scroll: 0, disposables: [] };
      this.sessions.push(session); this.selected = session.id; this.home = false; this.modal = null;
      session.disposables.push(
        process.onData(data => terminal.write(data)),
        process.onExit(event => {
          session.running = false; session.exitCode = event.exitCode; this.invalidate();
          // Signing in changes the account: read the sign-in state again.
          if (mode === 'login') this.refreshAuth(true);
        }),
        terminal.onWriteParsed(() => { session.scroll = Math.min(session.scroll, terminal.buffer.active.baseY); this.invalidate(); }),
        terminal.onData(data => { if (session.running) process.write(data); })
      );
      // Observe the child's terminal modes; its escape sequences never reach the host directly.
      for (const final of ['h', 'l']) session.disposables.push(terminal.parser.registerCsiHandler({ prefix: '?', final }, params => {
        if (params.includes(25)) session.cursorVisible = final === 'h';
        if (params.includes(1006)) session.sgrMouse = final === 'h';
        return false;
      }));
      for (const [code, field] of [[10, 'foreground'], [11, 'background']]) session.disposables.push(terminal.parser.registerOscHandler(code, data => {
        if (data !== '?') return false;
        const hex = session.appearance[field].slice(1);
        const rgb = [0, 2, 4].map(index => hex.slice(index, index + 2).repeat(2)).join('/');
        if (session.running) process.write(`\x1b]${code};rgb:${rgb}\x1b\\`);
        return true;
      }));
      this.notice = ''; this.invalidate();
    } catch (error) {
      try { process?.kill(); terminal?.dispose(); } catch { /* Failed startup. */ }
      this.modal = { type: 'error', message: error.message }; this.invalidate();
    }
  }
  closeSession(id) {
    const index = this.sessions.findIndex(session => session.id === id);
    if (index === -1) return;
    const session = this.sessions[index];
    for (const disposable of session.disposables) disposable.dispose();
    try { session.process.kill(); } catch { /* Already exited. */ }
    session.terminal.dispose(); this.sessions.splice(index, 1);
    if (this.selected === id) this.selected = this.sessions[Math.min(index, this.sessions.length - 1)]?.id || null;
    if (!this.sessions.length) this.home = true;
    this.modal = null; this.invalidate();
  }
  showTheme(scope) {
    const session = this.active;
    if (scope === 'session' && !session) return;
    const draft = { ...(scope === 'global' ? this.general : session.appearance) };
    const selected = matching(this.catalog, draft);
    try { this.favorites = this.favoriteStore.read(); this.favoriteError = ''; }
    catch (error) { this.favoriteError = error.message; }
    this.modal = { type: 'theme', scope, sessionId: session?.id, draft, original: { ...draft }, index: Math.max(0, this.catalog.palettes.findIndex(pair => pair.id === selected?.id)), manual: null, error: this.favoriteError, query: '', filter: 'all', searching: false,
      editor: 'presets', colorField: 'background', saturation: 1, colorIndex: 0 }; this.invalidate();
  }
  previewTheme() {
    const modal = this.modal;
    if (modal.scope === 'session') {
      const session = this.sessions.find(item => item.id === modal.sessionId);
      if (session) session.appearance = { ...modal.draft };
    }
    this.invalidate();
  }
  dismissModal(save = false) {
    const modal = this.modal;
    if (modal?.type === 'theme') {
      if (save && modal.scope === 'global') {
        try { this.preferences.write(modal.draft); this.general = { ...modal.draft }; }
        catch { modal.error = 'Could not save settings. Try again.'; this.invalidate(); return; }
      }
      if (!save && modal.scope === 'session') {
        const session = this.sessions.find(item => item.id === modal.sessionId);
        if (session) session.appearance = { ...modal.original };
      }
    }
    this.modal = null; this.invalidate();
  }
  action(action) {
    if (!action) return;
    if (this.modal?.type === 'theme' && (['rename', 'home', 'help', 'menu', 'previous', 'next', 'global', 'session', 'exit'].includes(action) || action.startsWith('tab:') || action.startsWith('close:'))) this.dismissModal();
    if (action === 'menu') { this.modal = this.modal?.type === 'shortcuts' ? null : { type: 'shortcuts' }; this.invalidate(); return; }
    if (action.startsWith('shortcut:')) { this.shortcut(action.slice(9)); return; }
    if (action === 'rename') { if (this.active) this.modal = { type: 'rename', sessionId: this.active.id, value: this.active.name || '', replace: true }; }
    else if (action === 'rename-save') {
      const session = this.sessions.find(item => item.id === this.modal?.sessionId);
      if (session) session.name = [...this.modal.value.replace(/[\x00-\x1f\x7f-\x9f]/g, '').trim().replace(/\s+/g, ' ')].slice(0, 40).join('');
      this.modal = null;
    }
    else if (action === 'home') { this.home = true; this.modal = null; this.refreshAuth(); }
    else if (action === 'return') { if (this.active) this.home = false; }
    else if (action === 'new') this.action(this.defaultAgent || 'home');
    else if (action.startsWith('login:') && Object.hasOwn(AGENTS, action.slice(6))) {
      try { this.startSession(action.slice(6), 'login'); }
      catch (error) { this.modal = { type: 'error', message: error.message }; }
    }
    else if (action.startsWith('default:') && Object.hasOwn(AGENTS, action.slice(8))) {
      const agent = action.slice(8), next = this.defaultAgent === agent ? null : agent;
      try { this.defaultAgent = defaultAgent(this.launchPreferences.setDefault ? this.launchPreferences.setDefault(next) : next); }
      catch { this.notice = 'Could not save default agent.'; }
    }
    else if (Object.hasOwn(AGENTS, action)) {
      try { this.startSession(action, this.launchModes[action]); }
      catch (error) { this.modal = { type: 'error', message: error.message }; }
    }
    else if (action === 'launch:claude' || action === 'launch:codex') {
      const agent = action.slice(7); this.modal = { type: 'mode', agent, index: this.launchModes[agent] === 'full' ? 1 : 0 };
    }
    else if (action === 'normal' || action === 'full') {
      if (this.modal?.type === 'mode') {
        try { this.launchModes = launchModes(this.launchPreferences.set(this.modal.agent, action)); this.modal = null; }
        catch { this.modal.error = 'Could not save launch mode. Try again.'; }
      }
    }
    else if (action === 'global' || action === 'session') this.showTheme(action);
    else if (action.startsWith('tab:')) { this.selected = action.slice(4); this.home = false; this.modal = null; }
    else if (action.startsWith('close:')) {
      const id = action.slice(6); const session = this.sessions.find(item => item.id === id);
      if (session?.running) this.modal = { type: 'confirm', id, message: `Close ${this.sessionLabel(session)}?` };
      else this.closeSession(id);
    }
    else if (action === 'exit') {
      if (this.sessions.some(session => session.running)) this.modal = { type: 'confirm', message: 'Close all sessions and exit?' };
      else this.onExit();
    }
    else if (action === 'confirm') { if (this.modal?.id) this.closeSession(this.modal.id); else this.onExit(); }
    else if (action === 'cancel') this.dismissModal();
    else if (action === 'save') this.dismissModal(true);
    else if (action === 'help') this.modal = { type: 'help' };
    else if (action === 'refresh') this.refreshAuth(true);
    else if (action === 'previous') { this.cycle(-1); this.modal = null; }
    else if (action === 'next') { this.cycle(1); this.modal = null; }
    else if (this.modal?.type === 'theme') {
      const modal = this.modal;
      if (action === 'random') {
        const pair = randomPair({ palettes: this.themeItems() }, modal.draft);
        if (pair && (pair.background !== modal.draft.background || pair.foreground !== modal.draft.foreground)) this.selectTheme(pair);
        else modal.error = 'No other themes match. Broaden your search.';
      }
      else if (action === 'search') { modal.searching = true; modal.manual = null; modal.error = ''; if (modal.editor === 'custom') modal.editor = 'presets'; }
      else if (action === 'filter') { modal.filter = ['all', 'dark', 'light'][(['all', 'dark', 'light'].indexOf(modal.filter) + 1) % 3]; modal.index = 0; modal.error = ''; }
      else if (action.startsWith('palette:')) {
        const pair = [...this.catalog.palettes, ...this.favorites].find(pair => pair.id === action.slice(8));
        if (pair) this.selectTheme(pair);
      }
      else if (action === 'background' || action === 'foreground') this.showColorGrid(action);
      else if (action === 'custom') this.showColorGrid(modal.colorField);
      else if (action === 'presets') { modal.editor = 'presets'; modal.manual = null; modal.searching = false; modal.error = ''; }
      else if (action === 'favorite-list') {
        try { this.favorites = this.favoriteStore.read(); modal.error = ''; } catch (error) { modal.error = error.message; }
        modal.editor = 'favorites'; modal.query = ''; modal.filter = 'all'; modal.manual = null; modal.searching = false;
        modal.index = Math.max(0, this.favorites.findIndex(item => item.background === modal.draft.background && item.foreground === modal.draft.foreground));
      }
      else if (action === 'favorite-toggle') {
        try {
          const result = this.favoriteStore.toggle(modal.draft, matching(this.catalog, modal.draft)?.name);
          this.favorites = result.favorites; modal.error = '';
          modal.index = Math.max(0, Math.min(modal.index, this.themeItems().length - 1));
        } catch (error) { modal.error = error.message; }
      }
      else if (action === 'hex') { modal.manual = { field: modal.colorField, value: modal.draft[modal.colorField], replace: true }; modal.error = ''; }
      else if (action.startsWith('color:')) this.selectColor(Number(action.slice(6)));
      else if (action.startsWith('saturation:')) {
        const index = Number(action.slice(11));
        if (Number.isInteger(index) && index >= 0 && index < SATURATIONS.length) { modal.saturation = index; this.selectColor(modal.colorIndex); }
      }
      this.previewTheme();
    }
    this.invalidate();
  }
  cycle(direction) {
    if (!this.sessions.length) return;
    const index = this.sessions.findIndex(session => session.id === this.selected);
    this.selected = this.sessions[(index + direction + this.sessions.length) % this.sessions.length].id;
    this.home = false; this.invalidate();
  }
  themeItems() { return filterPalettes(this.modal?.editor === 'favorites' ? { palettes: this.favorites } : this.catalog, this.modal?.query || '', this.modal?.filter || 'all'); }
  selectTheme(pair) {
    const modal = this.modal;
    Object.assign(modal.draft, { background: pair.background, foreground: pair.foreground });
    const items = this.themeItems(), index = items.findIndex(item => item.id === pair.id);
    if (index >= 0) modal.index = index;
    else { modal.query = ''; modal.filter = 'all'; modal.index = this.themeItems().findIndex(item => item.id === pair.id); }
    modal.error = ''; this.previewTheme();
  }
  moveTheme(index) {
    const items = this.themeItems();
    if (!items.length) return;
    this.selectTheme(items[(index + items.length) % items.length]);
  }
  showColorGrid(field) {
    const modal = this.modal;
    modal.editor = 'custom'; modal.colorField = field; modal.manual = null; modal.searching = false; modal.error = '';
    modal.colorIndex = nearestColor(colorGrid(modal.saturation), modal.draft[field]);
  }
  selectColor(index) {
    const modal = this.modal, colors = colorGrid(modal.saturation);
    if (!Number.isInteger(index) || !colors[index]) return;
    modal.colorIndex = index; modal.draft[modal.colorField] = colors[index].hex; modal.error = '';
    this.previewTheme();
  }
  colorInput(key) {
    const modal = this.modal, row = Math.floor(modal.colorIndex / COLOR_COLUMNS), col = modal.colorIndex % COLOR_COLUMNS;
    const rowCount = colorGrid(modal.saturation).length / COLOR_COLUMNS;
    if (key === 'left' || key === 'right') this.selectColor(row * COLOR_COLUMNS + (col + (key === 'left' ? -1 : 1) + COLOR_COLUMNS) % COLOR_COLUMNS);
    else if (key === 'up' || key === 'down') this.selectColor(Math.max(0, Math.min(rowCount - 1, row + (key === 'up' ? -1 : 1))) * COLOR_COLUMNS + col);
    else if (key === 'pageup' || key === 'pagedown') this.selectColor(Math.max(0, Math.min(rowCount - 1, row + (key === 'pageup' ? -4 : 4))) * COLOR_COLUMNS + col);
    else if (key === 'tab' || key === 'shift-tab') this.showColorGrid(modal.colorField === 'background' ? 'foreground' : 'background');
    else if (key.toLowerCase() === 'b') this.showColorGrid('background');
    else if (key.toLowerCase() === 'y') this.showColorGrid('foreground');
    else if (key.toLowerCase() === 's' || key === ' ') this.action('saturation:' + (modal.saturation + 1) % SATURATIONS.length);
    else if (key.toLowerCase() === 'h') this.action('hex');
    else if (key.toLowerCase() === 'p') this.action('presets');
    else if (key === 'enter') this.dismissModal(true);
  }
  shortcut(key) {
    const actions = { 'b': 'launch:claude', 'B': 'launch:claude', 'c': 'launch:codex', 'C': 'launch:codex', 'o': 'opencode', 'O': 'opencode', 'a': 'rename', 'A': 'rename', '0': 'exit', '1': 'claude', '2': 'codex', '3': 'global', '4': 'session', '5': 'home', '6': 'previous', '7': 'next', '8': this.active ? 'close:' + this.active.id : null, '9': 'help' };
    if (!Object.hasOwn(actions, key)) return;
    this.modal = null; this.action(actions[key]);
  }
  input(event) {
    if (this.closed) return;
    if (event.type === 'mouse') { this.mouse(event); return; }
    if (event.type === 'paste') {
      if (this.modal?.type === 'rename') {
        const text = event.text.replace(/[\x00-\x1f\x7f-\x9f]/g, '');
        this.modal.value = [...(this.modal.replace ? '' : this.modal.value) + text].slice(0, 40).join('');
        this.modal.replace = false; this.invalidate();
      } else if (this.modal?.type === 'theme' && this.modal.manual) {
        const value = event.text.replace(/[\r\n]/g, '').slice(0, 7);
        this.modal.manual.value = value.startsWith('#') ? value : '#' + value; this.modal.manual.replace = false;
        if (/^#[0-9a-f]{6}$/i.test(this.modal.manual.value)) { this.modal.draft[this.modal.manual.field] = this.modal.manual.value.toLowerCase(); this.previewTheme(); }
        this.invalidate();
      } else if (this.modal?.type === 'theme' && this.modal.searching) {
        this.modal.query += event.text.replace(/[\x00-\x1f\x7f-\x9f]/g, '').slice(0, 80 - this.modal.query.length); this.modal.index = 0; this.invalidate();
      } else if (!this.modal && !this.home && this.active?.running) {
        const text = event.text.replace(/\x1b/g, '');
        this.active.process.write(this.active.terminal.modes.bracketedPasteMode ? '\x1b[200~' + text + '\x1b[201~' : text);
      }
      return;
    }
    const key = event.name;
    if (this.modal?.type === 'theme' && /^f(?:1|2|3|4|6|7|8|9|10)$/.test(key)) this.dismissModal();
    if (key === 'f9' && (!this.modal || this.modal.type === 'shortcuts')) { this.action('menu'); return; }
    if (this.modal) { this.modalInput(key, event.raw); return; }
    if (key === 'f10') { this.action('exit'); return; }
    if (key === 'f1') { this.action('help'); return; }
    if (key === 'f2') { this.action('new'); return; }
    if (key === 'f3') { this.action('session'); return; }
    if (key === 'f4') { this.action('global'); return; }
    if (key === 'f6' || key === 'f7') { this.cycle(key === 'f6' ? -1 : 1); return; }
    if (key === 'f8') { if (this.active) this.action('close:' + this.active.id); return; }
    if (this.cols < 54 || this.rows < 22) return;
    if (this.home) {
      if (/^[0-9]$/.test(key)) { this.shortcut(key); return; }
      const actions = ['claude', 'codex', 'opencode', 'global', ...(this.active ? ['return'] : []), 'exit'];
      if (['tab', 'right', 'down'].includes(key)) this.focus = (this.focus + 1) % actions.length;
      else if (['shift-tab', 'left', 'up'].includes(key)) this.focus = (this.focus + actions.length - 1) % actions.length;
      else if (key === 'enter' || key === ' ') this.action(actions[this.focus] || 'claude');
      else if (key.toLowerCase() === 'g') this.action('global');
      else if (key.toLowerCase() === 'd' && this.focus < 3) this.action('default:' + Object.keys(AGENTS)[this.focus]);
      else if (key.toLowerCase() === 'l' && this.focus < 3) { const agent = Object.keys(AGENTS)[this.focus]; if (agent === 'opencode' || this.auth[agent].state !== 'signed-in') this.action('login:' + agent); }
      else if (key.toLowerCase() === 'o') this.action('opencode');
      else if (key.toLowerCase() === 'r') this.action('refresh');
      else if (key === 'escape') this.action('return');
      else if (key === 'ctrl-c') this.action('exit');
      this.invalidate(); return;
    }
    const session = this.active;
    if (!session) return;
    if (key === 'shift-pageup' || key === 'shift-pagedown') { this.scroll(key === 'shift-pageup' ? this.viewport.rows - 1 : 1 - this.viewport.rows); return; }
    if (session.running) {
      session.scroll = 0;
      const data = session.terminal.modes.applicationCursorKeysMode && /^\x1b\[[ABCDHF]$/.test(event.raw) ? event.raw.replace('[', 'O') : event.raw;
      session.process.write(data); this.invalidate();
    }
  }
  modalInput(key, raw) {
    const modal = this.modal;
    if (key === 'escape' || key === 'ctrl-c') {
      if (modal.manual) { modal.manual = null; modal.error = ''; this.invalidate(); }
      else if (modal.searching) { modal.searching = false; this.invalidate(); }
      else this.dismissModal();
      return;
    }
    if (modal.type === 'rename') {
      if (key === 'enter') this.action('rename-save');
      else if (key === 'backspace') { modal.value = modal.replace ? '' : [...modal.value].slice(0, -1).join(''); modal.replace = false; }
      else if (raw === '\x15') { modal.value = ''; modal.replace = false; }
      else if (raw && !/[\x00-\x1f\x7f-\x9f]/.test(raw) && [...raw].length === 1) {
        modal.value = [...(modal.replace ? '' : modal.value) + raw].slice(0, 40).join(''); modal.replace = false;
      }
    } else if (modal.type === 'shortcuts') { this.shortcut(key); }
    else if (modal.type === 'theme') {
      if (!modal.manual && !modal.searching && key.toLowerCase() === 'k') { this.action('favorite-toggle'); return; }
      if (!modal.manual && !modal.searching && key.toLowerCase() === 'v') { this.action('favorite-list'); return; }
      if (modal.searching) {
        if (key === 'enter') { modal.searching = false; this.moveTheme(0); }
        else if (key === 'backspace') { modal.query = [...modal.query].slice(0, -1).join(''); modal.index = 0; }
        else if (raw === '\x15') { modal.query = ''; modal.index = 0; }
        else if (raw.length === 1 && raw >= ' ' && modal.query.length < 80) { modal.query += raw; modal.index = 0; }
      } else if (modal.manual) {
        if (key === 'enter') {
          if (/^#[0-9a-f]{6}$/i.test(modal.manual.value)) { modal.draft[modal.manual.field] = modal.manual.value.toLowerCase(); modal.manual = null; modal.error = ''; this.previewTheme(); }
          else modal.error = 'Enter a color like #112233.';
        } else if (key === 'backspace') { modal.manual.value = modal.manual.value.slice(0, -1); modal.manual.replace = false; }
        else if (raw === '\x15') { modal.manual.value = '#'; modal.manual.replace = false; }
        else if (/^[#0-9a-f]$/i.test(raw)) {
          if (modal.manual.replace) { modal.manual.value = raw === '#' ? '' : '#'; modal.manual.replace = false; }
          if (modal.manual.value.length < 7) modal.manual.value += raw;
          if (/^#[0-9a-f]{6}$/i.test(modal.manual.value)) { modal.draft[modal.manual.field] = modal.manual.value.toLowerCase(); this.previewTheme(); }
        }
      } else if (modal.editor === 'custom') {
        this.colorInput(key);
      } else {
        const items = this.themeItems();
        if (key === '/') this.action('search');
        else if (key.toLowerCase() === 'p') this.action('presets');
        else if (key.toLowerCase() === 'm') this.action('custom');
        else if (key.toLowerCase() === 'f') this.action('filter');
        else if (key === 'pageup' || key === 'pagedown') this.moveTheme(Math.max(0, Math.min(items.length - 1, modal.index + (key === 'pageup' ? -10 : 10))));
        else if (['down', 'tab', 'right'].includes(key)) this.moveTheme(modal.index + 1);
        else if (['up', 'shift-tab', 'left'].includes(key)) this.moveTheme(modal.index - 1);
        else if (key === ' ') { const pair = items[modal.index]; if (pair) this.action('palette:' + pair.id); }
        else if (key === 'enter' || key === '9') this.dismissModal(true);
        else if (key === '0') this.dismissModal();
        else if (key.toLowerCase() === 'r' || key === '8') this.action('random');
        else if (key.toLowerCase() === 'b' || key === '6') this.action('background');
        else if (key.toLowerCase() === 'y' || key === '7') this.action('foreground');
        else if (/^[1-5]$/.test(key)) { const id = this.catalog.featured[Number(key) - 1]; if (id) this.action('palette:' + id); }
      }
    } else if (modal.type === 'mode') {
      if (['up', 'down', 'left', 'right', 'tab', 'shift-tab'].includes(key)) modal.index = 1 - modal.index;
      else if (key === '1') this.action('normal');
      else if (key === '2') this.action('full');
      else if (key === '0') this.dismissModal();
      else if (key === 'enter') this.action(modal.index ? 'full' : 'normal');
    } else if (modal.type === 'confirm') {
      if (key === 'enter' || key === '1' || key.toLowerCase() === 'e') this.action('confirm');
      else if (key === '0' || key.toLowerCase() === 'h') this.dismissModal();
    } else if (key === 'enter' || key === '0') this.dismissModal();
    this.invalidate();
  }
  scroll(amount) {
    const session = this.active;
    if (!session) return;
    session.scroll = Math.max(0, Math.min(session.terminal.buffer.active.baseY, session.scroll + amount)); this.invalidate();
  }
  mouse(event) {
    if (!this.frame) return;
    if ((event.button & 64) && this.modal?.type === 'theme') {
      if (event.x >= this.contentCols) return;
      if (this.modal.editor === 'custom' && !this.modal.manual) this.colorInput(event.button & 1 ? 'down' : 'up');
      else if (!this.modal.manual) this.moveTheme(Math.max(0, Math.min(this.themeItems().length - 1, this.modal.index + (event.button & 1 ? 1 : -1))));
      this.invalidate(); return;
    }
    const action = this.frame.hit(event.x, event.y);
    if (action) { if (!event.release && event.button === 0) this.action(action); return; }
    if (this.modal || this.home) return;
    const session = this.active;
    if (!session || event.x < 1 || event.x >= this.contentCols - 1 || event.y < VIEW_TOP || event.y >= VIEW_TOP + this.viewport.rows) return;
    if (session.terminal.modes.mouseTrackingMode === 'none') {
      if (event.button & 64) this.scroll(event.button & 1 ? -3 : 3);
      return;
    }
    if (!session.running) return;
    const x = event.x, y = event.y - VIEW_TOP + 1;
    if (session.sgrMouse) session.process.write(`\x1b[<${event.button};${x};${y}${event.release ? 'm' : 'M'}`);
    else if (x <= 223 && y <= 223) session.process.write('\x1b[M' + String.fromCharCode((event.release ? 3 : event.button) + 32, x + 32, y + 32));
  }
  render() {
    const frame = new Frame(this.cols, this.rows, UI);
    this.frame = frame;
    if (this.cols < 54 || this.rows < 22) {
      frame.text(1, 1, 'ᴱᴸᴵᴼ', { fg: UI.accent, bold: true });
      frame.text(1, 3, 'Resize the terminal to at least 54 × 22.');
      frame.text(1, 5, 'F10: exit', { fg: UI.muted });
      if (this.modal?.type === 'confirm') frame.text(1, 7, 'Enter: close sessions · Esc: cancel', { fg: UI.danger });
      return frame;
    }
    const width = this.contentCols;
    frame.text(2, 0, '▱ ᴱᴸᴵᴼ', { fg: UI.accent, bold: true });
    const label = this.modal?.type === 'theme' ? 'Theme' : this.active && !this.home ? this.sessionLabel(this.active) : '';
    frame.text(11, 0, label, { fg: UI.muted }, width - 24);
    if (width === this.cols) frame.button(width - 10, 0, 'F9 Menu', 'menu', { fg: UI.accent });
    else this.renderSidebar(frame);
    if (this.modal?.type === 'theme') {
      const editor = new Frame(width, this.rows + 3, UI);
      this.renderTheme(editor); frame.blit(editor, 0, VIEW_TOP, 4, this.rows - VIEW_TOP);
      return frame;
    }
    if (this.home || !this.active) {
      const home = new Frame(width, this.rows - VIEW_TOP, UI);
      this.renderHome(home); frame.blit(home, 0, VIEW_TOP);
    } else this.renderSession(frame);
    if (this.modal) this.renderModal(frame);
    return frame;
  }
  renderSidebar(frame) {
    const x = this.contentCols, width = this.cols - x;
    frame.fill(x, 0, width, this.rows, { bg: UI.panel });
    for (let y = 0; y < this.rows; y++) frame.text(x, y, '│', { fg: UI.border, bg: UI.panel });
    frame.text(x + 2, 0, 'WORKSPACE', { fg: UI.muted, bg: UI.panel, bold: true });
    const button = (y, label, action, enabled = true) => frame.button(x + 2, y, label, enabled ? action : null, { fg: enabled ? UI.fg : UI.border, bg: UI.panel });
    button(2, 'F2  New session', 'new');
    button(3, 'F3  Session theme', 'session', !!this.active);
    button(4, 'F4  Global theme', 'global');
    button(5, 'F9→A Rename', 'rename', !!this.active);
    frame.text(x + 2, 6, 'SESSIONS', { fg: UI.muted, bg: UI.panel });
    button(7, this.home ? '› Home' : '  Home', 'home');
    const capacity = Math.max(1, this.rows - 18);
    const selected = Math.max(0, this.sessions.findIndex(session => session.id === this.selected));
    const start = Math.max(0, selected - capacity + 1);
    this.sessions.slice(start, start + capacity).forEach((session, index) => {
      const active = !this.home && session.id === this.selected, y = 8 + index;
      const bg = active ? '#2c4536' : UI.panel;
      frame.fill(x + 1, y, width - 1, 1, { bg });
      const label = `${active ? '›' : ' '} ${this.sessionLabel(session, true)}${session.running ? '' : ' ·'}`;
      frame.button(x + 2, y, clipped(label, width - 5), 'tab:' + session.id, { fg: active ? UI.accent : UI.muted, bg, bold: active });
      frame.button(this.cols - 2, y, '×', 'close:' + session.id, { fg: UI.muted, bg });
    });
    const y = this.rows - 8;
    button(y, 'F6  Previous tab', 'previous', !!this.active);
    button(y + 1, 'F7  Next tab', 'next', !!this.active);
    button(y + 2, 'F8  Close session', this.active ? 'close:' + this.active.id : null, !!this.active);
    button(y + 4, 'F9  Menu', 'menu');
    button(y + 5, 'F1  Help', 'help');
    button(y + 6, 'F10 Exit', 'exit');
  }
  renderHome(frame) {
    const compact = frame.cols < 76;
    frame.text(3, 0, 'New session', { fg: UI.muted });
    // Three stacked cards need the room the mascot uses when the terminal is both narrow and short.
    const top = compact && frame.rows < 22 ? 2 : 8;
    if (top === 8) {
      const mascot = mascotFrame(frame.cols, this.now() - this.mascotStartedAt, this.motion);
      mascot.lines.forEach((line, index) => frame.text(mascot.x, 1 + index, line, { fg: index === 2 ? '#c3edcd' : index === 4 ? '#a4c4bb' : '#91aca1' }));
    }
    const agents = Object.keys(AGENTS);
    const cardWidth = compact ? frame.cols - 6 : Math.floor((frame.cols - 10) / 3);
    const cardHeight = compact ? 4 : 7;
    agents.forEach((agent, index) => {
      const x = compact ? 3 : 3 + index * (cardWidth + 2), y = compact ? top + index * cardHeight : 8;
      const accent = UI[agent], selected = this.focus === index, key = agent === 'opencode' ? 'O' : String(index + 1);
      frame.box(x, y, cardWidth, cardHeight, { fg: selected ? accent : UI.border, bg: UI.panel });
      frame.text(x + 2, y + 1, `${key}  ${AGENTS[agent]}${agent === this.defaultAgent ? ' ★' : ''}`, { fg: accent, bg: UI.panel, bold: true });
      const info = this.cardInfo(agent);
      if (!compact) {
        info.lines.forEach((line, row) => frame.text(x + 2, y + 2 + row, line, { fg: UI.muted, bg: UI.panel }, cardWidth - 4));
        frame.text(x + 2, y + 5, `${selected ? '›' : ' '} Launch  →`, { fg: accent, bg: UI.panel });
      } else frame.text(x + 2, y + 2, info.lines[0], { fg: UI.muted, bg: UI.panel }, cardWidth - 4);
      frame.hits.push({ x, y, cols: cardWidth, rows: cardHeight, action: agent });
      // The sign-in button is registered after the card, so it wins over the card's own click target.
      if (info.button) frame.button(compact ? x + 2 + textWidth(info.lines[0]) + 2 : x + 2, compact ? y + 2 : y + 3, info.button.label, info.button.action, { fg: accent, bg: UI.panel });
      const bx = compact ? x + cardWidth - 21 : x + 2, by = compact ? y + 1 : y + 4;
      if (Object.hasOwn(FULL_ACCESS_FLAGS, agent)) {
        const full = this.launchModes[agent] === 'full';
        frame.button(bx, by, full ? 'Full access ▾' : 'Normal ▾', 'launch:' + agent, { fg: full ? UI.danger : UI.muted, bg: UI.panel });
      } else frame.text(bx, by, 'Normal', { fg: UI.muted, bg: UI.panel });
    });
    const y = compact ? top + 13 : 16;
    frame.button(3, y, `${this.focus === 3 ? '›' : '◇'} Global appearance`, 'global', { fg: this.focus === 3 ? UI.accent : UI.fg });
    if (this.active) frame.button(Math.min(31, frame.cols - 24), y, `${this.focus === 4 ? '›' : '↗'} Resume last session`, 'return', { fg: UI.accent });
    frame.text(3, compact ? top + 12 : 18, clipped(this.cwd, frame.cols - 6), { fg: UI.muted });
    if (!compact) frame.text(3, 19, clipped(this.defaultAgent ? `★ Default: ${AGENTS[this.defaultAgent]} · F2 opens it · D: change or clear` : 'D: set the selected agent as default for F2', frame.cols - 6), { fg: UI.muted });
  }
  // Card text for an agent: its sign-in state with the action that fixes it.
  // OpenCode works with several providers, so its card lists the connected ones instead.
  cardInfo(agent) {
    const auth = this.auth[agent] || { state: 'unknown' };
    if (auth.state === 'missing') return { lines: ['Not installed'] };
    if (agent === 'opencode') {
      const count = auth.providers?.length || 0;
      const text = auth.state === 'signed-in' ? `Providers: ${count}` : auth.state === 'unknown' ? (auth.updatedAt ? 'Providers unknown' : 'Loading providers…') : 'No providers';
      return { lines: [text], button: { label: 'L Add provider', action: 'login:opencode' } };
    }
    if (auth.state === 'signed-out') return { lines: ['Signed out'], button: { label: 'L Sign in', action: 'login:' + agent } };
    if (auth.state === 'signed-in') return { lines: ['Signed in'] };
    return { lines: [auth.updatedAt ? 'Sign-in unknown' : 'Checking sign-in…'] };
  }
  renderSession(frame) {
    const session = this.active, size = this.viewport;
    frame.fill(0, VIEW_TOP, this.contentCols, size.rows, { bg: session.appearance.background });
    frame.terminal(session.terminal, 1, VIEW_TOP, session.appearance, session.scroll);
    if (this.modal || !session.cursorVisible || !session.running) frame.cursor = null;
    const status = session.scroll ? `History · ${session.scroll} lines up` : session.running ? `${this.sessionLabel(session)} · ${session.mode === 'full' ? 'Full access' : session.mode === 'login' ? 'Sign-in' : 'Normal'}` : `Session ended · Exit code: ${session.exitCode}`;
    frame.text(11, 0, status, { fg: session.mode === 'full' ? UI.danger : UI.muted }, this.contentCols - 13);
  }
  renderTheme(frame) {
    const modal = this.modal, pair = matching(this.catalog, modal.draft) || matching({ palettes: this.favorites }, modal.draft);
    const sideBySide = frame.cols >= 80 && frame.rows >= 26;
    const listWidth = sideBySide ? Math.min(39, Math.floor(frame.cols * .36)) : frame.cols - 4;
    frame.cursor = null;
    frame.text(2, 4, 'THEME', { fg: UI.accent, bold: true });
    frame.button(12, 4, ' Session ', this.active ? 'session' : null, { fg: modal.scope === 'session' ? UI.bg : this.active ? UI.fg : UI.border, bg: modal.scope === 'session' ? UI.accent : UI.panel });
    frame.button(25, 4, ' New sessions ', 'global', { fg: modal.scope === 'global' ? UI.bg : UI.fg, bg: modal.scope === 'global' ? UI.accent : UI.panel });
    frame.text(2, 5, modal.scope === 'session' ? 'Session appearance · Preview colors as you select them.' : 'Global appearance · Applies to new sessions.', { fg: UI.muted }, frame.cols - 4);
    const custom = modal.editor === 'custom';
    frame.button(2, 6, ' P Preset ', 'presets', { fg: modal.editor === 'presets' ? UI.accent : UI.muted, bg: modal.editor === 'presets' ? UI.panel : UI.bg });
    frame.button(12, 6, ' M Custom ', 'custom', { fg: custom ? UI.accent : UI.muted, bg: custom ? UI.panel : UI.bg });
    frame.button(23, 6, ' V Favorites ', 'favorite-list', { fg: modal.editor === 'favorites' ? UI.accent : UI.muted, bg: modal.editor === 'favorites' ? UI.panel : UI.bg });
    const favorite = matching({ palettes: this.favorites }, modal.draft);
    frame.button(frame.cols - (frame.cols >= 78 ? 24 : 12), 6, frame.cols >= 78 ? (favorite ? '[K] ★ Remove favorite' : '[K] ☆ Add favorite') : (favorite ? '[K] ★ Remove' : '[K] ☆ Add'), 'favorite-toggle', { fg: favorite ? UI.accent : UI.fg });
    const listRows = sideBySide ? Math.min(custom ? 13 : Infinity, frame.rows - 12) : Math.max(3, Math.floor((frame.rows - 13) * (custom ? .5 : .4)));
    if (custom) this.renderColorGrid(frame, listWidth, listRows);
    else {
    frame.button(2, 7, clipped(`/ Search: ${modal.query || 'theme name…'}${modal.searching ? '_' : ''}`, listWidth), 'search', { fg: modal.searching ? UI.accent : UI.fg });
    frame.button(2, 8, `[F] ${ {all:'All',dark:'Dark',light:'Light'}[modal.filter] }`, 'filter', { fg: UI.muted });
    const items = this.themeItems();
    frame.text(15, 8, `${items.length} ${modal.editor === 'favorites' ? 'favorite' : 'theme'}${items.length === 1 ? '' : 's'}`, { fg: UI.muted }, listWidth - 13);
    const start = Math.max(0, Math.min(modal.index - Math.floor(listRows / 2), items.length - listRows));
    for (let index = 0; index < listRows; index++) {
      const item = items[start + index]; if (!item) break;
      const y = 9 + index, selected = item.background === modal.draft.background && item.foreground === modal.draft.foreground;
      frame.fill(2, y, listWidth, 1, { bg: selected ? '#2c4536' : UI.bg });
      frame.text(2, y, selected ? '›' : ' ', { fg: UI.accent, bg: selected ? '#2c4536' : UI.bg });
      frame.text(4, y, ' Aa ', { bg: item.background, fg: item.foreground });
      frame.text(9, y, clipped(item.name, listWidth - 9), { fg: selected ? UI.accent : UI.fg, bg: selected ? '#2c4536' : UI.bg, bold: selected });
      frame.hits.push({ x: 2, y, cols: listWidth, rows: 1, action: 'palette:' + item.id });
    }
    if (!items.length) frame.text(2, 10, modal.editor === 'favorites' ? 'No favorites. Press K to add one.' : 'No matches. Try another search.', { fg: UI.muted }, listWidth);
    }
    const x = sideBySide ? listWidth + 4 : 2, y = sideBySide ? 7 : 10 + listRows;
    const cols = frame.cols - x - 2, rows = frame.rows - y - 3;
    const style = { fg: modal.draft.foreground, bg: modal.draft.background };
    frame.box(x, y, cols, rows, style);
    frame.text(x + 2, y + 1, clipped('✓ ' + (custom ? 'Custom colors' : pair?.name || 'Custom colors'), cols - 4), { ...style, bold: true });
    frame.text(x + 2, y + 2, `${modal.draft.background}  /  ${modal.draft.foreground}`, style, cols - 4);
    if (rows >= 5) frame.text(x + 2, y + Math.min(4, rows - 2), '› Sample text', style, cols - 4);
    if (rows >= 7) frame.text(x + 2, y + 5, 'Aa Bb Cc 0123456789 · Terminal output', style, cols - 4);
    const session = this.sessions.find(item => item.id === modal.sessionId);
    if (rows >= 12 && modal.scope === 'session' && session) {
      frame.text(x + 2, y + 7, '─ LIVE SESSION PREVIEW ─', { ...style, dim: true }, cols - 4);
      frame.terminal(session.terminal, x + 2, y + 8, modal.draft, session.scroll, { cols: cols - 4, rows: rows - 10, cursor: false });
    } else if (rows >= 10) {
      frame.text(x + 2, y + 7, 'const value = 42;', style, cols - 4);
      frame.text(x + 2, y + 8, 'New session preview', style, cols - 4);
    }
    if (rows >= 15) frame.text(x + 2, y + rows - 2, 'Agent output can use its own colors.', { ...style, dim: true }, cols - 4);
    const controlsY = frame.rows - 2;
    if (modal.manual) {
      const label = (modal.manual.field === 'background' ? 'Background: ' : 'Text: ') + modal.manual.value;
      frame.text(2, controlsY, label + '_', { fg: UI.accent });
      frame.text(2, controlsY + 1, modal.error || 'Enter a hex color · Enter done · Esc back', { fg: modal.error ? UI.danger : UI.muted }, frame.cols - 4);
      frame.cursor = { x: 2 + textWidth(label), y: controlsY };
    } else {
      if (custom) {
        frame.button(2, controlsY, '[Tab] BG / text', modal.colorField === 'background' ? 'foreground' : 'background', { fg: UI.accent });
        frame.button(23, controlsY, '[S] Tone', 'saturation:' + (modal.saturation + 1) % SATURATIONS.length, { fg: UI.muted });
        frame.button(34, controlsY, '[H] Hex', 'hex', { fg: UI.muted });
      } else {
        frame.button(2, controlsY, '[R] Random', 'random', { fg: UI.accent });
        frame.button(17, controlsY, '[B] Background', 'background', { fg: UI.muted });
        frame.button(33, controlsY, '[Y] Text', 'foreground', { fg: UI.muted });
      }
      frame.button(2, controlsY + 1, 'Enter Apply', 'save', { fg: UI.accent, bold: true });
      frame.button(frame.cols - 13, controlsY + 1, 'Esc Cancel', 'cancel', { fg: UI.muted });
      if (frame.cols >= 78) frame.text(18, controlsY + 1, modal.error || (custom ? '←→ hue · ↑↓ tone · click to preview' : '↑↓ preview · / search · 1–5 presets'), { fg: modal.error ? UI.danger : UI.muted }, frame.cols - 34);
      else if (modal.error) frame.text(2, 5, modal.error, { fg: UI.danger }, frame.cols - 4);
    }
    if (modal.searching) frame.cursor = { x: Math.min(listWidth, 2 + textWidth('/ Search: ' + modal.query)), y: 7 };
  }
  renderColorGrid(frame, width, visibleRows) {
    const modal = this.modal, colors = colorGrid(modal.saturation);
    const target = modal.colorField, selected = colors[modal.colorIndex];
    frame.button(2, 7, '[B] Background', 'background', { fg: target === 'background' ? UI.bg : UI.fg, bg: target === 'background' ? UI.accent : UI.panel });
    frame.button(18, 7, '[Y] Text', 'foreground', { fg: target === 'foreground' ? UI.bg : UI.fg, bg: target === 'foreground' ? UI.accent : UI.panel });
    if (width >= 36) frame.text(29, 7, modal.draft[target], { fg: UI.muted }, width - 27);
    let x = 2;
    SATURATIONS.forEach((mode, index) => {
      const label = ' ' + (width < 32 ? ['Vivid', 'Mid', 'Pastel'][index] : mode.name) + ' ';
      frame.button(x, 8, label, 'saturation:' + index, { fg: modal.saturation === index ? UI.accent : UI.muted, bg: modal.saturation === index ? UI.panel : UI.bg }); x += textWidth(label) + 1;
    });
    const stride = Math.max(2, Math.floor(width / COLOR_COLUMNS)), cellWidth = Math.max(2, stride - 1);
    const totalRows = colors.length / COLOR_COLUMNS, row = Math.floor(modal.colorIndex / COLOR_COLUMNS);
    const start = Math.max(0, Math.min(row - Math.floor(visibleRows / 2), totalRows - visibleRows));
    for (let y = 0; y < visibleRows; y++) for (let col = 0; col < COLOR_COLUMNS; col++) {
      const index = (start + y) * COLOR_COLUMNS + col, color = colors[index]; if (!color) continue;
      const brightness = [1, 3, 5].map(offset => parseInt(color.hex.slice(offset, offset + 2), 16));
      const fg = brightness[0] * .299 + brightness[1] * .587 + brightness[2] * .114 > 145 ? '#10161e' : '#ffffff';
      const marker = index === modal.colorIndex ? modal.draft[target] === color.hex ? '●' : '◇' : ' ';
      frame.button(2 + col * stride, 9 + y, marker + ' '.repeat(cellWidth - 1), 'color:' + index, { fg, bg: color.hex, bold: true });
    }
    const infoRow = 10 + visibleRows;
    if (infoRow < frame.rows - 2) frame.text(2, infoRow, `${selected.name} · ${selected.tone} · ${start + 1}–${Math.min(totalRows, start + visibleRows)}/${totalRows}`, { fg: UI.muted }, width);
  }
  renderModal(frame) {
    const modal = this.modal;
    for (const row of frame.cells) for (const cell of row) { cell.fg = '#607768'; cell.bg = '#0b140f'; cell.bold = false; }
    // Modal hit targets replace all underlying targets; no accidental background actions.
    frame.hits = []; frame.cursor = null;
    const cols = Math.min(68, this.cols - 6);
    const rows = modal.type === 'shortcuts' ? 20 : modal.type === 'help' ? 21 : modal.type === 'mode' ? 15 : 9;
    const x = Math.floor((this.cols - cols) / 2), y = Math.floor((this.rows - rows) / 2);
    frame.box(x, y, cols, rows, { fg: UI.border, bg: UI.panel });
    const write = (row, text, fg = UI.fg, bold = false) => frame.text(x + 3, y + row, text, { bg: UI.panel, fg, bold }, cols - 6);
    const button = (offset, row, text, action, fg = UI.accent) => frame.button(x + offset, y + row, text, action, { bg: UI.panel, fg });
    if (modal.type === 'rename') {
      const session = this.sessions.find(item => item.id === modal.sessionId);
      write(1, 'Session name', UI.accent, true);
      write(2, 'Leave blank to use the default name.', UI.muted);
      frame.fill(x + 3, y + 4, cols - 6, 1, { bg: UI.bg });
      const visible = clipped(modal.value, cols - 8);
      frame.text(x + 4, y + 4, visible || clipped(session ? `${AGENTS[session.agent]} ${session.number}` : '', cols - 8), { fg: modal.value ? UI.fg : UI.muted, bg: UI.bg });
      frame.cursor = { x: x + 4 + textWidth(visible), y: y + 4 };
      button(3, 6, 'Enter Save', 'rename-save');
      button(cols - 15, 6, 'Esc Cancel', 'cancel', UI.muted);
    } else if (modal.type === 'mode') {
      write(2, AGENTS[modal.agent], UI[modal.agent], true);
      write(3, 'Launch mode', UI.muted);
      for (const [index, mode] of ['normal', 'full'].entries()) {
        const row = 5 + index * 3;
        button(3, row, `${modal.index === index ? '›' : ' '} ${index + 1}  ${index ? 'Full access' : 'Normal'}`, mode, index ? UI.danger : UI.accent);
        write(row + 1, index ? `${modal.agent} ${modal.agent === 'claude' ? '--dangerously-skip-permissions' : '--yolo'}` : modal.agent, UI.muted);
      }
      write(11, modal.error || 'Your selection is saved for future launches.', modal.error ? UI.danger : UI.muted);
      write(12, '1 Normal · 2 Full access · 0 Back', UI.muted);
      button(cols - 10, 2, 'Close ×', 'cancel', UI.muted);
    } else if (modal.type === 'shortcuts') {
      write(2, 'Shortcuts', UI.accent, true);
      ['1  Launch Claude Code', '2  Launch Codex', '3  Global appearance', '4  Session appearance', '5  Home / new session', '6  Previous session', '7  Next session', '8  Close selected session', '9  Help', '0  Exit Elio'].forEach((text, index) => button(3, 4 + index, text, 'shortcut:' + text[0], index === 9 ? UI.danger : UI.fg));
      button(3, 14, 'A  Rename session', 'rename', this.active ? UI.fg : UI.border);
      button(3, 15, 'B  Claude launch mode', 'launch:claude', UI.fg);
      button(3, 16, 'C  Codex launch mode', 'launch:codex', UI.fg);
      button(3, 17, 'O  Launch OpenCode', 'opencode', UI.fg);
      button(3, 18, 'F9 / Esc Back', 'cancel', UI.muted);
    } else if (modal.type === 'help') {
      write(2, 'Shortcuts', UI.accent, true);
      ['F2        New session (default agent or picker)', 'D / L     On home: set default / sign in', 'F3 / F4   Session / global appearance', 'F6 / F7   Previous / next tab', 'F8        Close selected session', 'F9        Open shortcut menu', 'F10       Exit Elio', 'Shift+PgUp/PgDn  Scroll history', 'Ctrl+C    Send to the active CLI', 'F9 → A    Rename session', 'Shift     Hold to select terminal text'].forEach((text, index) => write(4 + index, text, UI.muted));
      write(16, 'Use function keys while the terminal has focus.', UI.muted);
      button(3, 18, '0 / Enter / Esc Close', 'cancel');
    } else {
      write(2, modal.type === 'confirm' ? 'Confirm action' : 'Could not start session', modal.type === 'confirm' ? UI.danger : UI.claude, true);
      const message = modal.message || '';
      write(3, clipped(message, cols - 6));
      if (textWidth(message) > cols - 6) write(4, clipped(charactersAfter(message, cols - 6), cols - 6), UI.muted);
      if (modal.type === 'confirm') { button(3, 6, '1 / Enter Yes', 'confirm', UI.danger); button(cols - 20, 6, '0 / Esc Cancel', 'cancel', UI.muted); }
      else button(3, 6, '0 / Enter / Esc Close', 'cancel');
    }
  }
  dispose() {
    if (this.closed) return;
    this.closed = true; for (const request of this.authRequests.values()) request.abort();
    for (const session of [...this.sessions]) this.closeSession(session.id);
  }
}

function charactersAfter(text, columns) { return [...text].slice([...clipped(text, columns)].length).join(''); }

async function runTerminalUI(cwd) {
  const input = process.stdin, output = process.stdout;
  if (!input.isTTY || !output.isTTY || typeof input.setRawMode !== 'function') throw new Error('Elio needs an interactive terminal. To open a desktop window, run elio --window.');
  const directory = dataDirectory();
  const preferences = createPreferences(directory), favorites = createFavorites(directory), launchPreferences = createLaunchPreferences(directory);
  return new Promise((resolve, reject) => {
    let timer, mascotTimer, previous = [], stopped = false, blocked = false;
    const wasRaw = input.isRaw;
    let ui;
    const schedule = () => {
      if (stopped || timer || blocked) return;
      timer = setTimeout(() => {
        timer = null;
        try {
          const result = drawFrame(ui.render(), previous); previous = result.lines;
          if (!output.write(result.data)) { blocked = true; output.once('drain', drain); }
        } catch (error) { finish(error); }
      }, 24);
    };
    const drain = () => { blocked = false; schedule(); };
    const resize = () => { previous = []; ui.resize(output.columns || 80, output.rows || 24); };
    const data = chunk => decoder.feed(chunk);
    const signal = () => finish();
    const crash = error => finish(error);
    const cleanup = () => {
      if (stopped) return;
      stopped = true; clearTimeout(timer); clearInterval(mascotTimer); decoder.dispose(); ui?.dispose();
      input.off('data', data); input.off('end', signal); input.off('error', crash); input.pause();
      output.off('resize', resize); output.off('drain', drain); output.off('error', crash);
      process.off('SIGINT', signal); process.off('SIGTERM', signal); process.off('exit', cleanup);
      if (input.isTTY) input.setRawMode(!!wasRaw);
      output.write(LEAVE);
    };
    const finish = error => { if (stopped) return; cleanup(); if (error) reject(error); else resolve(); };
    const decoder = new InputDecoder(event => { try { ui.input(event); } catch (error) { finish(error); } });
    try {
      const motion = (process.env.ELIO_REDUCED_MOTION || process.env.AGENT_TERMINAL_REDUCED_MOTION) !== '1';
      ui = new TerminalUI({ cwd, preferences, favorites, launchPreferences, motion, cols: output.columns || 80, rows: output.rows || 24, invalidate: schedule, onExit: () => finish() });
      input.setRawMode(true); input.setEncoding('utf8'); input.resume(); output.write(ENTER);
      input.on('data', data); input.on('end', signal); input.on('error', crash); output.on('resize', resize); output.on('error', crash);
      process.on('SIGINT', signal); process.on('SIGTERM', signal); process.on('exit', cleanup);
      ui.refreshAuth(); schedule();
      if (motion) mascotTimer = setInterval(() => { if (ui.home && !ui.modal) schedule(); }, 120);
    } catch (error) { finish(error); }
  });
}
module.exports = { TerminalUI, runTerminalUI, ENTER, LEAVE, VIEW_TOP };
