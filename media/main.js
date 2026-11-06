/* global Terminal, FitAddon, PaletteCatalog */
(() => {
  const host = window.agentTerminal;
  const byId = id => document.getElementById(id);
  const names = { claude: 'Claude Code', codex: 'Codex', opencode: 'OpenCode' };
  const tabLetters = { claude: 'C', codex: 'X', opencode: 'O' };
  const commands = { claude: 'claude --dangerously-skip-permissions', codex: 'codex --yolo' };
  const sessions = new Map();
  const counters = { claude: 0, codex: 0, opencode: 0 };
  let defaults = { background: '#1f2427', foreground: '#e8eeeb', font: 'cascadia', fontSize: 14 };
  let catalog = { palettes: [], featured: [] };
  let fonts = {}, ready = false, activeId, view = 'projects', selectedAgent = 'claude';
  let fontOptions = [];
  let launchModes = { claude: 'normal', codex: 'normal', opencode: 'normal' }, savingLaunchMode = false;
  let defaultAgent = null;
  const authState = {};
  // The default agent is what "Yeni oturum" opens directly; without one, the picker is shown.
  function renderDefault() {
    for (const button of document.querySelectorAll('[data-default-agent]')) {
      const agent = button.dataset.defaultAgent, chosen = agent === defaultAgent;
      button.setAttribute('aria-pressed', String(chosen));
      button.title = chosen ? 'Varsayılan araç (kaldırmak için tıkla)' : 'Varsayılan araç yap';
      button.setAttribute('aria-label', chosen ? names[agent] + ' varsayılan araç, kaldırmak için tıkla' : names[agent] + ' aracını varsayılan yap');
      button.closest('.agent-card').classList.toggle('is-default', chosen);
    }
    const hint = byId('new-session-agent'), button = byId('new-session');
    hint.hidden = !defaultAgent; hint.textContent = defaultAgent ? names[defaultAgent] : '';
    button.title = button.ariaLabel = defaultAgent ? 'Yeni oturum · ' + names[defaultAgent] : 'Yeni oturum';
    byId('default-hint').textContent = defaultAgent
      ? '★ Varsayılan: ' + names[defaultAgent] + '. “Yeni oturum” bunu doğrudan açar; farklı bir araç için aşağıdan seç. Yıldıza tıklayarak değiştirebilir veya kaldırabilirsin.'
      : 'Her yeni oturumda aynı aracı açmak için bir kartın yıldızına tıkla.';
  }
  function renderAuth(agent) {
    const value = authState[agent];
    if (!value) return;
    const missing = value.state === 'missing';
    if (agent === 'opencode') {
      const box = byId('opencode-providers'); box.replaceChildren();
      if (value.state === 'signed-in' && value.providers?.length) {
        for (const name of value.providers) { const chip = document.createElement('span'); chip.className = 'provider-chip'; chip.textContent = name; box.append(chip); }
      } else {
        const note = document.createElement('p'); note.className = 'account-note';
        note.textContent = missing ? 'OpenCode kurulu değil.' : value.state === 'unknown' ? 'Sağlayıcılar okunamadı.' : 'Bağlı sağlayıcı yok.';
        box.append(note);
      }
      document.querySelector('[data-login="opencode"]').hidden = missing;
      return;
    }
    const box = byId(`${agent}-account`); box.replaceChildren();
    const status = document.createElement('div'); status.className = 'account-status' + (value.state === 'signed-in' ? ' ok' : '');
    const text = document.createElement('span');
    if (value.state === 'signed-in') { const dot = document.createElement('span'); dot.className = 'status-dot'; dot.setAttribute('aria-hidden', 'true'); text.append(dot, 'Giriş yapıldı'); }
    else text.textContent = missing ? names[agent] + ' kurulu değil' : value.state === 'signed-out' ? 'Giriş yapılmamış' : 'Giriş durumu okunamadı';
    status.append(text);
    if (value.state === 'signed-out') {
      const button = document.createElement('button'); button.className = 'auth-button'; button.dataset.login = agent; button.textContent = 'Giriş yap'; status.append(button);
    }
    box.append(status);
  }
  function newSession() {
    if (ready && currentProject && defaultAgent) { selectedAgent = defaultAgent; launch(launchModes[selectedAgent] || 'normal'); }
    else showHome();
  }
  function renderLaunchModes() {
    for (const agent of Object.keys(names)) {
      const full = launchModes[agent] === 'full';
      const button = document.querySelector(`[data-launch-settings="${agent}"]`);
      if (button) {
        button.classList.toggle('full', full);
        document.querySelector(`[data-launch-label="${agent}"]`).textContent = full ? 'Tüm izinler açık' : 'Normal';
      }
      document.querySelector(`[data-agent="${agent}"]`).title = names[agent] + ' · ' + (full ? 'Tüm izinler açık' : 'Normal');
    }
  }
  let currentProject = null, recentProjects = [], projectParent = '', projectBusy = false, previousView = 'home';
  const createProjectDialog = byId('project-create-dialog');
  const projectName = folder => folder?.replace(/[\\/]+$/, '').split(/[\\/]/).at(-1) || folder || '';
  function projectError(message, creating = false) {
    const element = byId(creating ? 'project-create-error' : 'project-error');
    element.textContent = message || ''; element.hidden = !message;
  }
  function projectPending(value) {
    projectBusy = value;
    for (const id of ['project-open', 'project-new', 'project-location', 'project-create-submit']) byId(id).disabled = value || !ready;
    for (const button of byId('recent-projects').querySelectorAll('button')) button.disabled = value || button.dataset.unavailable === 'true';
  }
  function renderProjects() {
    const list = byId('recent-projects'); list.replaceChildren();
    byId('projects-empty').hidden = recentProjects.length > 0;
    byId('project-count').textContent = recentProjects.length;
    byId('project-return').hidden = !currentProject;
    for (const project of recentProjects) {
      const row = document.createElement('div'); row.className = 'recent-project';
      const open = document.createElement('button'); open.className = 'recent-open';
      open.title = project.path; open.dataset.projectPath = project.path;
      const mark = document.createElement('span'); mark.className = 'recent-mark'; mark.textContent = project.name.slice(0, 2).toLocaleUpperCase('tr-TR'); mark.setAttribute('aria-hidden', 'true');
      const text = document.createElement('span'); text.className = 'recent-copy';
      const name = document.createElement('strong'); name.textContent = project.name;
      const location = document.createElement('span'); location.textContent = project.path;
      text.append(name, location);
      if (!project.available) { const missing = document.createElement('span'); missing.className = 'recent-missing'; missing.textContent = 'Klasör bulunamadı'; text.append(missing); open.dataset.unavailable = 'true'; }
      open.append(mark, text);
      open.addEventListener('click', () => { if (!projectBusy) { projectError(''); projectPending(true); host.postMessage({ type: 'projectRecent', path: project.path }); } });
      const remove = document.createElement('button'); remove.className = 'icon-button recent-remove'; remove.title = 'Son projelerden kaldır'; remove.setAttribute('aria-label', project.name + ' projesini listeden kaldır');
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); const use = document.createElementNS('http://www.w3.org/2000/svg', 'use'); use.setAttribute('href', '#i-close'); svg.append(use); remove.append(svg);
      remove.addEventListener('click', () => { if (!projectBusy) { projectError(''); projectPending(true); host.postMessage({ type: 'projectRemove', path: project.path }); } });
      row.append(open, remove); list.append(row);
    }
    projectPending(projectBusy);
  }
  function showProjects() {
    if (view !== 'projects') previousView = view;
    view = 'projects'; byId('projects-view').hidden = false; byId('workspace').hidden = true;
    byId('home').hidden = true; byId('terminal-view').hidden = true;
    projectError(''); renderProjects(); byId('project-open').focus();
  }
  function useProject(folder) {
    currentProject = folder;
    byId('cwd').textContent = folder; byId('cwd').title = folder;
    byId('current-project').textContent = projectName(folder);
    byId('show-projects').title = 'Projeler · ' + folder;
  }
  function updateDestination() {
    byId('project-parent').textContent = projectParent;
    byId('project-destination').textContent = byId('project-name').value.trim() ? projectParent.replace(/[\\/]+$/, '') + (projectParent.includes('\\') ? '\\' : '/') + byId('project-name').value.trim() : 'Proje bu konumda yeni bir klasör oluşturur.';
  }
  const fontLoads = new Map();
  let appearanceScope = 'global', appearanceTarget, saveTimer, frame;
  let paletteQuery = '', paletteFilter = 'all', palettePage = 0;
  let favorites = [], favoriteSaving = false;
  const palettePageSize = 9;
  const modeDialog = byId('mode-dialog');
  const appearanceDialog = byId('appearance-dialog');
  const renameDialog = byId('rename-dialog');
  let renameTarget;
  function showRename(id = activeId) {
    const session = sessions.get(id); if (!session) return;
    renameTarget = id;
    byId('session-label').value = session.customName || '';
    byId('session-label').placeholder = session.defaultLabel;
    renameDialog.showModal(); byId('session-label').focus(); byId('session-label').select();
  }

  function resize() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const session = sessions.get(activeId);
      if (view === 'terminal' && session && byId('surface').clientWidth > 0 && byId('surface').clientHeight > 0) session.fit.fit();
    });
  }
  function loadFont(id) {
    const option = fontOptions.find(option => option.id === id);
    if (!option?.bundled) return Promise.resolve();
    if (!fontLoads.has(id)) {
      const sample = 'Aa ğüşiöç İı 0123456789 ─│';
      const loading = Promise.all(['400', '700', 'italic 400'].map(style => document.fonts.load(`${style} 16px "${option.family}"`, sample))).then(results => {
        if (!results.flat().length) throw new Error('Yazı tipi yüklenemedi: ' + option.name);
      }).catch(error => { fontLoads.delete(id); throw error; });
      fontLoads.set(id, loading);
    }
    return fontLoads.get(id);
  }
  function buildFontControls(options) {
    fontOptions = options; byId('font').replaceChildren();
    document.querySelector('.bundled-font-count').textContent = options.filter(option => option.bundled).length + ' hazır';
    for (const bundled of [true, false]) {
      const group = document.createElement('optgroup');
      group.label = bundled ? 'Uygulamayla gelen yazı tipleri' : 'Bilgisayarındaki yazı tipleri';
      for (const item of options.filter(option => option.bundled === bundled)) {
        const option = new Option(item.name, item.id); option.style.fontFamily = fonts[item.id]; group.append(option);
      }
      byId('font').append(group);
    }
  }
  function applySessionAppearance(session) {
    const value = session.appearance;
    session.terminal.options.theme = { background: value.background, foreground: value.foreground, cursor: value.foreground, selectionBackground: value.foreground + '40' };
    session.pane.style.backgroundColor = value.background;
    session.pane.style.color = value.foreground;
    session.pane.style.fontFamily = fonts[value.font] || 'monospace';
    session.pane.style.fontSize = value.fontSize + 'px';
    if (session.id === activeId) {
      byId('terminal-view').style.setProperty('--terminal-bg', value.background);
      byId('terminal-view').style.setProperty('--terminal-fg', value.foreground);
      resize();
    }
    const revision = session.fontRevision = (session.fontRevision || 0) + 1;
    loadFont(value.font).then(() => {
      if (!sessions.has(session.id) || session.fontRevision !== revision) return;
      session.terminal.options.fontFamily = fonts[value.font] || 'monospace'; session.terminal.options.fontSize = value.fontSize;
      session.terminal.clearTextureAtlas(); session.terminal.refresh(0, session.terminal.rows - 1); resize();
    }).catch(error => feedback(error.message));
  }
  function updateSessionBar() {
    const session = sessions.get(activeId);
    if (!session) return;
    byId('session-name').textContent = session.label;
    byId('session-project').textContent = projectName(session.cwd); byId('session-project').title = session.cwd;
    byId('session-mode').textContent = session.mode === 'full' ? 'Tüm izinler açık' : session.mode === 'login' ? 'Giriş' : 'Normal';
    byId('session-mode').classList.toggle('full', session.mode === 'full');
    byId('status').textContent = session.state === 'launching' ? 'Açılıyor…' : session.state === 'running' ? 'Çalışıyor' : session.state === 'failed' ? 'Açılamadı' : 'Oturum kapandı';
  }
  function renderTabs() {
    const tabs = byId('tabs');
    tabs.replaceChildren();
    byId('rename-session').disabled = !sessions.has(activeId);
    byId('close-active-session').disabled = !sessions.has(activeId);
    document.querySelector('[data-settings="session"]').disabled = !sessions.has(activeId);
    document.querySelector('.session-summary').hidden = !sessions.has(activeId);
    byId('session-tabs').hidden = sessions.size === 0;
    byId('session-banner').hidden = sessions.size === 0;
    byId('active-session').textContent = `${sessions.size} oturum açık`;
    for (const session of sessions.values()) {
      const group = document.createElement('div');
      const selected = session.id === activeId && view === 'terminal';
      group.className = 'session-tab' + (selected ? ' active' : '');
      group.dataset.sessionId = session.id;
      group.setAttribute('role', 'presentation');
      const button = document.createElement('button');
      button.id = 'tab-' + session.id;
      button.className = 'tab-button'; button.setAttribute('role', 'tab');
      button.setAttribute('aria-selected', String(selected));
      button.setAttribute('aria-controls', 'pane-' + session.id);
      button.tabIndex = session.id === activeId ? 0 : -1;
      const dot = document.createElement('span');
      dot.className = 'tab-dot' + (session.state === 'launching' ? ' launching' : session.state !== 'running' ? ' ended' : '');
      dot.setAttribute('aria-hidden', 'true');
      const label = document.createElement('span'); label.className = 'tab-label'; label.textContent = session.label;
      const short = document.createElement('span'); short.className = 'tab-short'; short.textContent = (tabLetters[session.agent] || '?') + (session.mode === 'login' ? 'G' : session.defaultLabel.split(' ').at(-1)); short.setAttribute('aria-hidden', 'true');
      button.title = session.label + ' · ' + session.cwd; button.setAttribute('aria-label', session.label);
      button.append(dot, label, short);
      button.addEventListener('click', () => selectSession(session.id));
      button.addEventListener('dblclick', () => showRename(session.id));
      button.addEventListener('keydown', event => {
        const ids = [...sessions.keys()]; const index = ids.indexOf(session.id);
        let next;
        if (['ArrowRight', 'ArrowDown'].includes(event.key)) next = ids[(index + 1) % ids.length];
        if (['ArrowLeft', 'ArrowUp'].includes(event.key)) next = ids[(index - 1 + ids.length) % ids.length];
        if (event.key === 'Home') next = ids[0];
        if (event.key === 'End') next = ids.at(-1);
        if (next) { event.preventDefault(); selectSession(next); byId('tab-' + next).focus(); }
      });
      const close = document.createElement('button');
      close.className = 'tab-close';
      close.setAttribute('aria-label', session.label + ' oturumunu kapat');
      close.title = 'Oturumu kapat';
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      const use = document.createElementNS('http://www.w3.org/2000/svg', 'use'); use.setAttribute('href', '#i-close'); svg.append(use); close.append(svg);
      close.addEventListener('click', () => host.postMessage({ type: 'close', sessionId: session.id }));
      group.append(button, close); tabs.append(group);
    }
  }
  function showHome() {
    if (!currentProject) { showProjects(); return; }
    byId('projects-view').hidden = true; byId('workspace').hidden = false;
    view = 'home'; byId('home').hidden = false; byId('terminal-view').hidden = true;
    renderTabs();
    document.querySelector('[data-agent="claude"]').focus();
    host.postMessage({ type: 'refreshAuth' });
  }
  function selectSession(sessionId) {
    const session = sessions.get(sessionId);
    if (!session) return;
    activeId = sessionId; view = 'terminal';
    byId('projects-view').hidden = true; byId('workspace').hidden = false;
    byId('home').hidden = true; byId('terminal-view').hidden = false;
    for (const item of sessions.values()) item.pane.hidden = item.id !== activeId;
    applySessionAppearance(session); updateSessionBar(); renderTabs();
    session.fit.fit(); session.terminal.focus();
    byId('tab-' + sessionId)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  function removeSession(sessionId) {
    const session = sessions.get(sessionId);
    if (!session) return;
    const ids = [...sessions.keys()], index = ids.indexOf(sessionId);
    sessions.delete(sessionId);
    if (renameDialog.open && renameTarget === sessionId) renameDialog.close();
    session.terminal.dispose(); session.pane.remove();
    if (appearanceDialog.open && appearanceScope === 'session' && appearanceTarget === sessionId) appearanceDialog.close();
    if (activeId === sessionId) {
      activeId = ids[index + 1] || ids[index - 1];
      if (view === 'terminal' && activeId) selectSession(activeId);
      else if (!activeId) showHome();
    }
    renderTabs();
  }
  function launch(mode) {
    if (!currentProject) return;
    modeDialog.close(); feedback('');
    const id = crypto.randomUUID();
    const pane = document.createElement('div');
    pane.id = 'pane-' + id; pane.className = 'terminal-pane'; pane.dataset.sessionId = id;
    pane.setAttribute('role', 'tabpanel'); pane.setAttribute('aria-labelledby', 'tab-' + id);
    byId('surface').append(pane);
    const terminal = new Terminal({ cursorBlink: true, fontSize: 14, scrollback: 5000 });
    const fit = new FitAddon.FitAddon(); terminal.loadAddon(fit);
    const label = mode === 'login' ? `${names[selectedAgent]} · giriş` : `${names[selectedAgent]} ${++counters[selectedAgent]}`;
    const session = { id, cwd: currentProject, agent: selectedAgent, mode, label, state: 'launching', appearance: { ...defaults }, terminal, fit, pane };
    session.defaultLabel = session.label;
    sessions.set(id, session);
    terminal.onData(data => {
      if (session.state === 'running' || session.state === 'launching') host.postMessage({ type: 'input', sessionId: id, data });
    });
    terminal.onResize(({ cols, rows }) => host.postMessage({ type: 'resize', sessionId: id, cols, rows }));
    terminal.attachCustomKeyEventHandler(event => {
      if (event.type !== 'keydown') return true;
      const modifier = /Mac/.test(navigator.platform) ? event.metaKey : event.ctrlKey && event.shiftKey;
      if (modifier && event.code === 'KeyC' && terminal.hasSelection()) { host.postMessage({ type: 'copy', text: terminal.getSelection() }); return false; }
      if (modifier && event.code === 'KeyV') { host.postMessage({ type: 'paste', sessionId: id }); return false; }
      return true;
    });
    terminal.open(pane); selectSession(id);
    host.postMessage({ type: 'start', sessionId: id, agent: selectedAgent, mode, cols: terminal.cols, rows: terminal.rows });
  }
  function flushDefaultSave() {
    if (!saveTimer) return;
    clearTimeout(saveTimer); saveTimer = undefined;
    host.postMessage({ type: 'appearance', value: { ...defaults } });
  }
  function previewAppearance(value) {
    byId('type-preview').style.backgroundColor = value.background;
    byId('type-preview').style.color = value.foreground;
    byId('type-preview').style.fontFamily = fonts[value.font] || 'monospace';
    byId('type-preview').style.fontSize = value.fontSize + 'px';
    byId('palette-grid').style.setProperty('--palette-font', fonts[value.font] || 'monospace');
    byId('font-size-value').textContent = value.fontSize + ' px';
    byId('font-note').textContent = fontOptions.find(option => option.id === value.font)?.bundled ? 'Uygulamayla birlikte gelir; internetsiz ve kurulum gerektirmeden kullanılır.' : 'Bu seçenek bilgisayarındaki yazı tipini kullanır.';
    void loadFont(value.font).catch(error => { byId('font-note').textContent = error.message; });
    byId('background-value').textContent = value.background.toUpperCase();
    byId('foreground-value').textContent = value.foreground.toUpperCase();
    const selected = PaletteCatalog.matching(catalog, value) || PaletteCatalog.matching({ palettes: favorites }, value);
    const favorite = PaletteCatalog.matching({ palettes: favorites }, value);
    byId('favorite-toggle').textContent = favorite ? '★ Favorilerden çıkar' : '☆ Favorilere ekle';
    byId('favorite-toggle').setAttribute('aria-pressed', String(!!favorite));
    byId('favorite-toggle').disabled = favoriteSaving;
    byId('selected-palette').textContent = selected?.name || 'Özel renkler';
    for (const button of document.querySelectorAll('[data-palette]')) button.setAttribute('aria-pressed', String(button.dataset.palette === selected?.id));
    for (const button of document.querySelectorAll('[data-library-palette]')) {
      const pair = [...catalog.palettes, ...favorites].find(pair => pair.id === button.dataset.libraryPalette);
      button.setAttribute('aria-pressed', String(pair?.background === value.background && pair?.foreground === value.foreground));
    }
  }
  function choosePalette(pair) {
    if (!pair) return;
    byId('background').value = pair.background; byId('foreground').value = pair.foreground;
    editAppearance();
    let items = filteredPalettes(), index = items.findIndex(item => item.id === pair.id);
    if (index === -1) {
      paletteQuery = ''; paletteFilter = 'all'; byId('palette-search').value = '';
      items = filteredPalettes(); index = items.findIndex(item => item.id === pair.id);
    }
    palettePage = Math.max(0, Math.floor(index / palettePageSize)); renderPaletteLibrary();
  }
  function buildPaletteControls(value) {
    catalog = value || { palettes: [], featured: [] };
    byId('palette-presets').replaceChildren();
    byId('palette-total').textContent = catalog.palettes.length.toLocaleString('tr-TR') + ' renk çifti';
    for (const id of catalog.featured) {
      const pair = catalog.palettes.find(item => item.id === id);
      if (!pair) continue;
      const button = document.createElement('button'); button.className = 'palette-preset'; button.dataset.palette = pair.id;
      button.setAttribute('aria-label', pair.name + ' paletini uygula'); button.setAttribute('aria-pressed', 'false');
      const swatch = document.createElement('span'); swatch.className = 'palette-swatch'; swatch.textContent = 'Aa'; swatch.style.backgroundColor = pair.background; swatch.style.color = pair.foreground;
      const name = document.createElement('span'); name.className = 'palette-name'; name.textContent = pair.name;
      button.append(swatch, name); button.addEventListener('click', () => choosePalette(pair)); byId('palette-presets').append(button);
    }
    byId('palette-error').textContent = catalog.error || ''; byId('palette-error').hidden = !catalog.error;
    renderPaletteLibrary();
  }
  function filteredPalettes() { return PaletteCatalog.filterPalettes(paletteFilter === 'favorites' ? { palettes: favorites } : catalog, paletteQuery, paletteFilter === 'favorites' ? 'all' : paletteFilter).sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true })); }
  function renderPaletteLibrary() {
    const items = filteredPalettes(), pages = Math.max(1, Math.ceil(items.length / palettePageSize));
    palettePage = Math.min(pages - 1, Math.max(0, palettePage));
    const grid = byId('palette-grid'); grid.replaceChildren();
    for (const pair of items.slice(palettePage * palettePageSize, (palettePage + 1) * palettePageSize)) {
      const button = document.createElement('button'); button.className = 'library-palette'; button.dataset.libraryPalette = pair.id;
      button.setAttribute('aria-label', pair.name + ' paletini uygula'); button.setAttribute('aria-pressed', String(pair.background === byId('background').value && pair.foreground === byId('foreground').value));
      const sample = document.createElement('span'); sample.className = 'library-sample'; sample.style.backgroundColor = pair.background; sample.style.color = pair.foreground;
      const letters = document.createElement('span'); letters.textContent = 'Aa';
      const example = document.createElement('span'); example.textContent = '› Merhaba, dünya.'; sample.append(letters, example);
      const name = document.createElement('span'); name.className = 'library-name'; name.textContent = pair.name;
      const colors = document.createElement('span'); colors.className = 'library-colors'; colors.textContent = pair.background + ' / ' + pair.foreground;
      button.title = pair.name + '\n' + colors.textContent;
      button.append(sample, name, colors); button.addEventListener('click', () => choosePalette(pair)); grid.append(button);
    }
    if (!items.length) { const empty = document.createElement('p'); empty.className = 'palette-empty'; empty.textContent = paletteFilter === 'favorites' ? 'Henüz favorin yok. Beğendiğin renkleri önizlemeden favorilere ekleyebilirsin.' : 'Aramana uygun palet yok. Başka bir ad deneyebilirsin.'; grid.append(empty); }
    byId('palette-results').textContent = items.length.toLocaleString('tr-TR') + ' sonuç';
    byId('palette-page').textContent = items.length ? `${palettePage + 1} / ${pages}` : '0 / 0';
    byId('palette-previous').disabled = palettePage === 0;
    byId('palette-next').disabled = palettePage >= pages - 1;
    byId('random-palette').disabled = !items.some(pair => pair.background !== byId('background').value || pair.foreground !== byId('foreground').value);
    for (const button of document.querySelectorAll('[data-palette-filter]')) button.setAttribute('aria-pressed', String(button.dataset.paletteFilter === paletteFilter));
  }
  function openAppearance(scope) {
    if (scope === 'session' && !sessions.has(activeId)) return;
    appearanceScope = scope; appearanceTarget = scope === 'session' ? activeId : undefined;
    const value = scope === 'global' ? defaults : sessions.get(appearanceTarget).appearance;
    byId('appearance-title').textContent = scope === 'global' ? 'Genel görünüm' : 'Oturum görünümü';
    byId('appearance-scope').textContent = scope === 'global' ? 'YENİ OTURUMLAR' : sessions.get(appearanceTarget).label.toLocaleUpperCase('tr-TR');
    byId('appearance-note').textContent = scope === 'global' ? 'Bundan sonra açılan oturumlara uygulanır. Açık oturumlar değişmez.' : 'Yalnızca bu oturumda geçerlidir. Diğer oturumlar ve genel ayarlar değişmez.';
    for (const key of ['background', 'foreground', 'font']) byId(key).value = value[key];
    byId('font-size').value = value.fontSize;
    paletteQuery = ''; paletteFilter = 'all'; palettePage = 0; byId('palette-search').value = '';
    renderPaletteLibrary(); previewAppearance(value); appearanceDialog.showModal();
    host.postMessage({ type: 'getFavorites' });
  }
  function editAppearance() {
    const value = { background: byId('background').value, foreground: byId('foreground').value, font: byId('font').value, fontSize: Number(byId('font-size').value) };
    previewAppearance(value);
    if (appearanceScope === 'global') {
      defaults = value; clearTimeout(saveTimer); saveTimer = setTimeout(flushDefaultSave, 150);
    } else {
      const session = sessions.get(appearanceTarget);
      if (session) { session.appearance = value; applySessionAppearance(session); }
    }
  }
  function feedback(message) { byId('feedback').textContent = message; byId('feedback').hidden = !message; }

  for (const button of document.querySelectorAll('[data-agent]')) {
    button.disabled = true;
    button.addEventListener('click', () => {
      if (!ready) return;
      selectedAgent = button.dataset.agent; launch(launchModes[selectedAgent]);
    });
  }
  for (const button of document.querySelectorAll('[data-launch-settings]')) {
    button.disabled = true;
    button.addEventListener('click', () => {
      if (!ready) return;
      selectedAgent = button.dataset.launchSettings;
      byId('mode-agent').textContent = names[selectedAgent]; byId('mode-mark').className = `agent-mark ${selectedAgent}-mark`;
      byId('mode-mark').replaceChildren(document.querySelector(`[data-agent="${selectedAgent}"] .agent-mark svg`).cloneNode(true));
      byId('command-normal').textContent = selectedAgent; byId('command-full').textContent = commands[selectedAgent];
      byId('launch-error').hidden = true;
      for (const option of document.querySelectorAll('[data-mode]')) option.setAttribute('aria-pressed', String(option.dataset.mode === launchModes[selectedAgent]));
      modeDialog.showModal();
    });
  }
  for (const button of document.querySelectorAll('[data-mode]')) button.addEventListener('click', () => {
    if (savingLaunchMode) return;
    savingLaunchMode = true;
    for (const option of document.querySelectorAll('[data-mode]')) option.disabled = true;
    host.postMessage({ type: 'launchMode', agent: selectedAgent, mode: button.dataset.mode });
  });
  byId('close-mode').addEventListener('click', () => modeDialog.close());
  for (const button of document.querySelectorAll('[data-settings]')) {
    button.disabled = true;
    button.addEventListener('click', () => openAppearance(button.dataset.settings));
  }
  byId('close-appearance').addEventListener('click', () => appearanceDialog.close());
  byId('done-appearance').addEventListener('click', () => appearanceDialog.close());
  byId('favorite-toggle').addEventListener('click', () => {
    if (favoriteSaving) return;
    const value = { background: byId('background').value, foreground: byId('foreground').value };
    favoriteSaving = true; byId('favorite-toggle').disabled = true;
    host.postMessage({ type: 'favoriteToggle', value, name: PaletteCatalog.matching(catalog, value)?.name });
  });
  appearanceDialog.addEventListener('close', () => {
    flushDefaultSave();
    if (view === 'terminal') sessions.get(activeId)?.terminal.focus();
  });
  for (const dialog of [modeDialog, appearanceDialog, renameDialog, createProjectDialog]) dialog.addEventListener('click', event => {
    const rect = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) dialog.close();
  });
  for (const id of ['background', 'foreground', 'font', 'font-size']) byId(id).addEventListener('input', editAppearance);
  byId('palette-search').addEventListener('input', () => { paletteQuery = byId('palette-search').value; palettePage = 0; renderPaletteLibrary(); });
  for (const button of document.querySelectorAll('[data-palette-filter]')) button.addEventListener('click', () => { paletteFilter = button.dataset.paletteFilter; palettePage = 0; renderPaletteLibrary(); });
  byId('palette-previous').addEventListener('click', () => { palettePage--; renderPaletteLibrary(); });
  byId('palette-next').addEventListener('click', () => { palettePage++; renderPaletteLibrary(); });
  byId('random-palette').addEventListener('click', () => choosePalette(PaletteCatalog.randomPair({ palettes: filteredPalettes() }, { background: byId('background').value, foreground: byId('foreground').value })));
  byId('show-projects').addEventListener('click', showProjects);
  byId('project-return').addEventListener('click', () => { if (previousView === 'terminal' && sessions.has(activeId)) selectSession(activeId); else showHome(); });
  byId('project-open').addEventListener('click', () => { if (!projectBusy) { projectError(''); projectPending(true); host.postMessage({ type: 'projectChoose' }); } });
  byId('project-new').addEventListener('click', () => { if (!projectBusy) { byId('project-name').value = ''; projectError('', true); updateDestination(); createProjectDialog.showModal(); byId('project-name').focus(); } });
  byId('project-create-cancel').addEventListener('click', () => createProjectDialog.close());
  byId('project-create-back').addEventListener('click', () => createProjectDialog.close());
  byId('project-name').addEventListener('input', () => { projectError('', true); updateDestination(); });
  byId('project-location').addEventListener('click', () => { if (!projectBusy) { projectPending(true); host.postMessage({ type: 'projectParent' }); } });
  byId('project-create-form').addEventListener('submit', event => {
    event.preventDefault(); if (projectBusy) return;
    projectError('', true); projectPending(true);
    host.postMessage({ type: 'projectCreate', name: byId('project-name').value, parent: projectParent });
  });
  byId('rename-session').addEventListener('click', () => showRename());
  byId('cancel-rename').addEventListener('click', () => renameDialog.close());
  byId('reset-rename').addEventListener('click', () => { byId('session-label').value = ''; byId('session-label').focus(); });
  byId('rename-form').addEventListener('submit', event => {
    event.preventDefault(); const session = sessions.get(renameTarget);
    if (session) {
      session.customName = [...byId('session-label').value.replace(/[\x00-\x1f\x7f-\x9f]/g, '').trim().replace(/\s+/g, ' ')].slice(0, 40).join('');
      session.label = session.customName || session.defaultLabel;
      renderTabs(); updateSessionBar();
    }
    renameDialog.close();
  });
  renameDialog.addEventListener('close', () => { if (view === 'terminal') sessions.get(activeId)?.terminal.focus(); });
  byId('close-active-session').addEventListener('click', () => { if (sessions.has(activeId)) host.postMessage({ type: 'close', sessionId: activeId }); });
  byId('home-button').addEventListener('click', showHome);
  byId('new-session').addEventListener('click', newSession);
  // Sign-in buttons are created when the account state arrives, so clicks are handled for the whole page.
  document.addEventListener('click', event => {
    const button = event.target.closest?.('[data-login]');
    if (!button || !ready) return;
    selectedAgent = button.dataset.login; launch('login');
  });
  for (const button of document.querySelectorAll('[data-default-agent]')) button.addEventListener('click', () => {
    if (!ready) return;
    host.postMessage({ type: 'defaultAgent', agent: defaultAgent === button.dataset.defaultAgent ? null : button.dataset.defaultAgent });
  });
  byId('resume').addEventListener('click', () => selectSession(sessions.has(activeId) ? activeId : [...sessions.keys()].at(-1)));
  for (const button of document.querySelectorAll('[data-refresh-auth]')) button.addEventListener('click', () => host.postMessage({ type: 'refreshAuth', agent: button.dataset.refreshAuth }));

  host.onMessage(message => {
    const session = sessions.get(message.sessionId);
    switch (message.type) {
      case 'favorites':
        favorites = message.value; favoriteSaving = false;
        renderPaletteLibrary();
        if (appearanceDialog.open) previewAppearance({ background: byId('background').value, foreground: byId('foreground').value, font: byId('font').value, fontSize: Number(byId('font-size').value) });
        break;
      case 'launchModes':
        launchModes = message.value; savingLaunchMode = false; renderLaunchModes();
        for (const option of document.querySelectorAll('[data-mode]')) option.disabled = false;
        modeDialog.close(); break;
      case 'project':
        recentProjects = message.projects; useProject(message.cwd); projectPending(false); renderProjects();
        createProjectDialog.close(); showHome(); break;
      case 'projects': recentProjects = message.value; projectPending(false); renderProjects(); break;
      case 'projectCancelled': projectPending(false); break;
      case 'projectParent': if (message.value) projectParent = message.value; projectPending(false); updateDestination(); break;
      case 'settings':
        launchModes = message.launchModes || { claude: 'normal', codex: 'normal', opencode: 'normal' }; renderLaunchModes();
        defaultAgent = message.defaultAgent ?? null; renderDefault();
        defaults = { ...message.value }; fonts = message.fonts; ready = true;
        buildFontControls(message.fontOptions);
        buildPaletteControls(message.catalog);
        recentProjects = message.projects || []; projectParent = message.projectParent || '';
        if (message.cwd) { useProject(message.cwd); showHome(); } else showProjects();
        projectPending(false);
        for (const button of document.querySelectorAll('[data-agent], [data-settings], [data-launch-settings], [data-login], [data-default-agent]')) button.disabled = false;
        renderTabs();
        break;
      case 'auth': authState[message.agent] = message.value; renderAuth(message.agent); break;
      case 'defaultAgent': defaultAgent = message.value ?? null; renderDefault(); break;
      case 'started':
        if (session) { session.state = 'running'; renderTabs(); if (session.id === activeId) { updateSessionBar(); session.terminal.focus(); } }
        break;
      case 'output': session?.terminal.write(message.data); break;
      case 'paste': if (session?.state === 'running') session.terminal.paste(message.text); break;
      case 'exit':
        if (session) { session.state = 'ended'; renderTabs(); if (session.id === activeId) updateSessionBar(); }
        break;
      case 'closed': removeSession(message.sessionId); break;
      case 'error':
        if (message.operation?.startsWith('project')) {
          projectPending(false); projectError(message.message, createProjectDialog.open); break;
        }
        if (message.operation === 'launchMode') {
          savingLaunchMode = false;
          for (const option of document.querySelectorAll('[data-mode]')) option.disabled = false;
          byId('launch-error').textContent = 'Başlatma modu kaydedilemedi. ' + message.message; byId('launch-error').hidden = false;
          break;
        }
        if (message.operation === 'favoriteToggle') { favoriteSaving = false; byId('favorite-toggle').disabled = false; }
        if (session && message.operation === 'start') {
          session.state = 'failed'; session.terminal.write('\r\n' + message.message + '\r\n'); renderTabs(); if (session.id === activeId) updateSessionBar();
        } else {
          feedback(message.message); if (appearanceDialog.open) byId('appearance-note').textContent = message.message;
        }
        break;
    }
  });
  new ResizeObserver(resize).observe(byId('surface'));
  document.fonts.ready.then(resize);
  projectPending(true);
  host.postMessage({ type: 'ready' });
})();
