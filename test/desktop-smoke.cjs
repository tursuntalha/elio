const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { _electron: electron } = require('playwright-core');

async function main() {
  const root = path.join(__dirname, '..'), output = path.join(root, '.test-output');
  const cwd = path.join(output, 'masaüstü proje'), profile = path.join(output, 'desktop-multi-profile');
  fs.mkdirSync(cwd, { recursive: true });
  fs.mkdirSync(profile, { recursive: true }); fs.writeFileSync(path.join(profile, 'launch.json'), JSON.stringify({ schemaVersion: 1, agents: { claude: 'normal', codex: 'normal' } })); fs.writeFileSync(path.join(profile, 'favorites.json'), JSON.stringify({ schemaVersion: 1, favorites: [] }));
  const env = { ...process.env, ELIO_DATA_DIR: profile, CLAUDE_CONFIG_DIR: path.join(profile, 'no-claude-login') }; delete env.ELECTRON_RUN_AS_NODE;
  const launch = () => electron.launch({ executablePath: require('electron'), args: [path.join(root, 'desktop', 'main.cjs'), '--cwd', cwd], env, timeout: 30000 });
  let application = await launch();
  try {
    let page = await application.firstWindow();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.waitForFunction(() => document.getElementById('cwd')?.textContent.length > 0);
    assert.equal(await page.title(), 'Elio');
    assert.equal(await page.locator('.sidebar-brand .brand-logo').getAttribute('aria-label'), 'Elio');
    assert.equal(await page.locator('.sidebar-brand .brand-logo').count(), 1);
    assert.equal(await page.locator('.sidebar-brand .mascot-body').count(), 0);
    assert.equal(await page.locator('.mascot-walker .mascot-body').count(), 1);
    assert.equal(await page.locator('#cwd').textContent(), cwd);
    assert.equal(await page.evaluate(() => typeof require), 'undefined');
    const rail = await page.locator('.workspace-sidebar').boundingBox();
    const main = await page.locator('.workspace-main').boundingBox();
    assert.ok(rail.x >= main.x + main.width - 1);
    assert.equal(main.y, 0);
    assert.ok(await page.locator('[data-settings="session"]').isDisabled());
    const homeText = await page.locator('#home').innerText();
    assert.ok(!/From idea to code|Focus on your code|The terminal you know|Choose your agent|Start working/.test(homeText));
    const firstMascot = await page.locator('.mascot-walker').boundingBox();
    await page.waitForTimeout(300); const nextMascot = await page.locator('.mascot-walker').boundingBox();
    assert.ok(Math.abs(firstMascot.x - nextMascot.x) > 1);
    const lane = await page.locator('.mascot-lane').boundingBox(), cards = await page.locator('.agent-grid').boundingBox();
    assert.ok(lane.y + lane.height <= cards.y + 1);
    await page.screenshot({ path: path.join(output, 'simple-home.png') });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    assert.equal(await page.locator('.mascot-walker').evaluate(element => getComputedStyle(element).animationName), 'none');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.evaluate(() => { window.__events = []; window.agentTerminal.onMessage(message => window.__events.push(message)); });
    const A = { background: '#182128', foreground: '#ddf0e2', font: 'consolas', fontSize: 16 };
    const B = { background: '#302033', foreground: '#f3d5f2', font: 'courier', fontSize: 20 };
    const C = { background: '#142d24', foreground: '#d6edff', font: 'jetbrains', fontSize: 18 };
    async function editTheme(scope, theme) {
      await page.click(`[data-settings="${scope}"]`);
      assert.equal(await page.locator('#appearance-title').textContent(), scope === 'global' ? 'Global appearance' : 'Session appearance');
      await page.locator('#background').fill(theme.background); await page.locator('#foreground').fill(theme.foreground);
      await page.selectOption('#font', theme.font); await page.locator('#font-size').fill(String(theme.fontSize)); await page.click('#close-appearance');
      await page.waitForTimeout(200);
    }
    async function assertTheme(id, theme) {
      await page.click(`#tab-${id}`);
      const style = await page.locator(`#pane-${id}`).evaluate(element => ({ background: element.style.backgroundColor, foreground: element.style.color, font: element.style.fontFamily, fontSize: element.style.fontSize }));
      const rgb = hex => `rgb(${[1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16)).join(', ')})`;
      assert.equal(style.background, rgb(theme.background)); assert.equal(style.foreground, rgb(theme.foreground));
      assert.match(style.font, theme.font === 'consolas' ? /Consolas/ : theme.font === 'courier' ? /Courier New/ : /monospace/);
      assert.equal(style.fontSize, theme.fontSize + 'px');
      const family = require('../src/fonts.cjs').FONT_OPTIONS.find(font => font.id === theme.font).family;
      await page.waitForFunction(({ id, family, size }) => {
        const element = document.querySelector(`#pane-${id} .xterm-char-measure-element`);
        if (!element) return false;
        const style = getComputedStyle(element); return style.fontFamily.includes(family) && style.fontSize === size + 'px';
      }, { id, family, size: theme.fontSize }, { timeout: 5000 });
      assert.equal(await page.locator('.terminal-pane:visible').count(), 1);
    }
    async function start(agent, mode) {
      if (await page.locator('#terminal-view').isVisible()) await page.click('#new-session');
      const modes = JSON.parse(fs.readFileSync(path.join(profile, 'launch.json'), 'utf8')).agents;
      if (agent !== 'opencode' && modes[agent] !== mode) { // OpenCode has no full-access mode, so no mode dialog
        const count = await page.getByRole('tab').count();
        await page.click(`[data-launch-settings="${agent}"]`); await page.click(`[data-mode="${mode}"]`);
        await page.waitForFunction(() => !document.getElementById('mode-dialog').open);
        assert.equal(await page.getByRole('tab').count(), count);
      }
      await page.click(`[data-agent="${agent}"]`);
      assert.equal(await page.locator('#mode-dialog').evaluate(element => element.open), false);
      const surface = await page.locator('#surface').boundingBox();
      assert.equal(surface.y, 0);
      assert.ok(surface.height >= (await page.locator('.workspace-main').boundingBox()).height - 1);
      const id = await page.locator('.session-tab.active').getAttribute('data-session-id');
      await page.waitForFunction(id => window.__events.some(event => event.type === 'output' && event.sessionId === id && event.data.length > 0), id, { timeout: 20000 });
      const started = await page.evaluate(id => window.__events.find(event => event.type === 'started' && event.sessionId === id), id);
      assert.equal(started.agent, agent); assert.equal(started.mode, mode);
      return id;
    }
    const saved = () => JSON.parse(fs.readFileSync(path.join(profile, 'appearance.json'), 'utf8'));
    await page.click('[data-settings="global"]');
    assert.equal(await page.locator('.mascot-walker').evaluate(element => getComputedStyle(element).animationPlayState), 'paused');
    assert.equal(await page.locator('[data-palette]').count(), 5);
    assert.equal(await page.locator('[data-library-palette]').count(), 9);
    assert.equal(await page.locator('#font option').count(), 28);
    assert.equal(await page.locator('#font optgroup').count(), 2);
    const remoteFontRequests = []; page.on('request', request => { if (request.resourceType() === 'font' && /^https?:/.test(request.url())) remoteFontRequests.push(request.url()); });
    const loadedFonts = await page.evaluate(async () => {
      const options = [...document.querySelectorAll('#font optgroup:first-child option')];
      const results = [];
      for (const option of options) {
        const family = option.style.fontFamily.split(',')[0], sample = 'Aa0O1lIğüşiöçİı {}[] != =>';
        const faces = await document.fonts.load('400 20px ' + family, sample);
        const canvas = document.createElement('canvas'); canvas.width = 650; canvas.height = 40;
        const ctx = canvas.getContext('2d'); ctx.font = '20px ' + family; ctx.fillText(sample, 0, 27);
        let hash = 2166136261; for (const byte of ctx.getImageData(0, 0, 650, 40).data) hash = Math.imul(hash ^ byte, 16777619);
        results.push({ id: option.value, faces: faces.length, loaded: faces.every(face => face.status === 'loaded'), mono: Math.abs(ctx.measureText('iiiiii').width - ctx.measureText('WWWWWW').width) < .1, hash });
      }
      return results;
    });
    assert.equal(loadedFonts.length, 24); assert.ok(loadedFonts.every(font => font.loaded && font.faces >= 2 && font.mono), JSON.stringify(loadedFonts));
    assert.ok(new Set(loadedFonts.map(font => font.hash)).size >= 20, 'Fonts must render different glyphs, not just different option names');
    assert.deepEqual(remoteFontRequests, []);
    assert.equal(await page.locator('#palette-total').textContent(), require('../data/palettes.json').palettes.length.toLocaleString('en-US') + ' color pairs');
    const firstPage = await page.locator('[data-library-palette]').first().getAttribute('data-library-palette');
    await page.click('#palette-next');
    assert.notEqual(await page.locator('[data-library-palette]').first().getAttribute('data-library-palette'), firstPage);
    await page.click('#palette-previous');
    const preservedFont = await page.locator('#font').inputValue();
    await page.click('[data-palette="dracula"]');
    assert.equal(await page.locator('#background').inputValue(), '#282a36');
    assert.equal(await page.locator('#foreground').inputValue(), '#f8f8f2');
    await page.click('#favorite-toggle'); await page.waitForFunction(() => document.getElementById('favorite-toggle').getAttribute('aria-pressed') === 'true');
    await page.click('[data-palette-filter="favorites"]'); assert.equal(await page.locator('[data-library-palette]').count(), 1);
    await page.locator('#background').fill('#112244'); await page.locator('#foreground').fill('#eef9d3');
    await page.click('#favorite-toggle'); await page.waitForFunction(() => document.getElementById('palette-grid').children.length === 2);
    assert.equal(JSON.parse(fs.readFileSync(path.join(profile, 'favorites.json'))).favorites.length, 2);
    await page.locator('[data-library-palette="fav-282a36-f8f8f2"]').click();
    assert.equal(await page.locator('#background').inputValue(), '#282a36');
    await page.click('#favorite-toggle'); await page.waitForFunction(() => document.querySelectorAll('[data-library-palette]').length === 1);
    await page.click('#favorite-toggle'); await page.waitForFunction(() => document.querySelectorAll('[data-library-palette]').length === 2);
    await page.screenshot({ path: path.join(output, 'favorites.png') });
    await page.click('[data-palette-filter="all"]');
    await page.click('#random-palette');
    const selectedPair = { background: await page.locator('#background').inputValue(), foreground: await page.locator('#foreground').inputValue() };
    assert.notEqual(selectedPair.background, '#282a36');
    assert.ok(require('../data/palettes.json').palettes.some(pair => pair.background === selectedPair.background && pair.foreground === selectedPair.foreground));
    const visibleSelected = page.locator('[data-library-palette][aria-pressed="true"]');
    assert.equal(await visibleSelected.count(), 1);
    assert.equal(await visibleSelected.locator('.library-name').textContent(), await page.locator('#selected-palette').textContent());
    assert.equal(await page.locator('#font').inputValue(), preservedFont);
    await page.locator('#palette-search').fill('Solarized Light'); await page.click('[data-palette-filter="light"]');
    await page.click('[data-library-palette="solarized-light"]');
    assert.equal(await page.locator('#type-preview').evaluate(element => element.style.backgroundColor), 'rgb(253, 246, 227)');
    await page.selectOption('#font', 'jetbrains'); await page.locator('#font-size').fill('18');
    assert.equal(await page.locator('#type-preview').evaluate(element => element.style.fontSize), '18px');
    assert.match(await page.locator('#type-preview').evaluate(element => element.style.fontFamily), /JetBrains Mono/);
    await page.locator('#palette-search').fill('no-palette-123456789'); assert.equal(await page.locator('[data-library-palette]').count(), 0);
    assert.ok(await page.locator('#random-palette').isDisabled());
    await page.locator('#palette-search').fill(''); await page.click('[data-palette-filter="all"]');
    await page.screenshot({ path: path.join(output, 'palette-picker.png') });
    for (const width of [360, 560, 1100]) {
      await page.setViewportSize({ width, height: 820 });
      assert.equal(await page.locator('#appearance-dialog').evaluate(element => element.scrollWidth > element.clientWidth), false);
    }
    await page.setViewportSize({ width: 1100, height: 880 });
    await page.click('#close-appearance');
    await editTheme('global', A); assert.deepEqual(saved(), A);
    const claude1 = await start('claude', 'normal'); await assertTheme(claude1, A);
    assert.equal(await page.locator('.mascot-walker').evaluate(element => getComputedStyle(element).animationPlayState), 'paused');
    assert.equal(await page.locator('[data-settings="session"] use').getAttribute('href'), '#i-palette');
    await page.locator('[data-settings="session"]').screenshot({ path: path.join(output, 'appearance-icon.png') });
    const codex1 = await start('codex', 'normal'); await assertTheme(codex1, A);
    assert.equal(await page.getByRole('tab').count(), 2);
    const beforeRename = await page.evaluate(() => window.__events.filter(event => event.type === 'started').length);
    await page.click('#rename-session'); await page.fill('#session-label', 'Ödeme ekranı');
    await page.screenshot({ path: path.join(output, 'rename-session.png') });
    await page.locator('#rename-form button[type="submit"]').click();
    assert.equal(await page.locator('#tab-' + codex1).getAttribute('aria-label'), 'Ödeme ekranı');
    assert.equal(await page.locator('#session-name').textContent(), 'Ödeme ekranı');
    await page.click('#rename-session'); await page.fill('#session-label', 'İptal'); await page.keyboard.press('Escape');
    assert.equal(await page.locator('#session-name').textContent(), 'Ödeme ekranı');
    await page.locator('#tab-' + claude1).click();
    assert.equal(await page.locator('#session-name').textContent(), 'Claude Code 1');
    await page.locator('#tab-' + codex1).dblclick();
    assert.equal(await page.locator('#session-label').inputValue(), 'Ödeme ekranı');
    await page.click('#reset-rename'); await page.locator('#rename-form button[type="submit"]').click();
    assert.equal(await page.locator('#session-name').textContent(), 'Codex 1');
    await page.setViewportSize({ width: 360, height: 820 }); await page.click('#rename-session');
    await page.fill('#session-label', 'ğ'.repeat(60)); await page.locator('#rename-form button[type="submit"]').click();
    assert.equal(await page.locator('#session-name').textContent(), 'ğ'.repeat(40));
    assert.equal(await page.locator('#tab-' + codex1 + ' .tab-short').textContent(), 'X1');
    await page.click('#rename-session'); await page.click('#reset-rename'); await page.locator('#rename-form button[type="submit"]').click();
    await page.setViewportSize({ width: 1100, height: 880 });
    assert.equal(await page.evaluate(() => window.__events.filter(event => event.type === 'started').length), beforeRename);
    await editTheme('session', B); await assertTheme(codex1, B); assert.deepEqual(saved(), A);
    await page.click('[data-settings="session"]'); await page.click('#random-palette'); await page.click('#close-appearance');
    assert.deepEqual(saved(), A);
    await editTheme('session', B);
    await assertTheme(claude1, A);
    await page.click('#new-session'); await editTheme('global', C); assert.deepEqual(saved(), C);
    await assertTheme(claude1, A); await assertTheme(codex1, B);
    const claude2 = await start('claude', 'full'); await assertTheme(claude2, C);
    const codex2 = await start('codex', 'full'); await assertTheme(codex2, C);
    assert.equal(await page.getByRole('tab').count(), 4);
    const startedCount = await page.evaluate(() => window.__events.filter(event => event.type === 'started').length);
    await assertTheme(claude1, A); await assertTheme(codex1, B);
    assert.equal(await page.evaluate(() => window.__events.filter(event => event.type === 'started').length), startedCount);
    await page.click('#new-session');
    await page.screenshot({ path: path.join(output, 'multi-session-home.png') });
    for (const width of [360, 560, 1100]) {
      await page.setViewportSize({ width, height: 820 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    }
    await assertTheme(claude2, C);
    await page.locator(`.session-tab[data-session-id="${codex1}"] .tab-close`).click();
    await page.waitForFunction(id => !document.getElementById('pane-' + id), codex1);
    assert.equal(await page.locator('.session-tab.active').getAttribute('data-session-id'), claude2);
    assert.equal(await page.getByRole('tab').count(), 3);
    await assertTheme(claude1, A); await assertTheme(codex2, C);
    for (const id of [codex2, claude2, claude1]) {
      await page.locator(`.session-tab[data-session-id="${id}"] .tab-close`).click();
      await page.waitForFunction(id => !document.getElementById('pane-' + id), id);
    }
    assert.equal(await page.locator('#home').isVisible(), true);
    assert.equal(await page.locator('#session-tabs').isVisible(), false);
    await start('claude', 'normal');
    const opencode1 = await start('opencode', 'normal');
    assert.equal(await page.locator('#tab-' + opencode1 + ' .tab-label').textContent(), 'OpenCode 1');
    assert.equal(await page.locator('#tab-' + opencode1 + ' .tab-short').textContent(), 'O1');
    assert.equal(await page.locator('[data-launch-settings="opencode"]').count(), 0);
    assert.equal(await page.locator('.agent-card').count(), 3);
    // Default agent: "Yeni oturum" opens it directly; clearing it brings the picker back.
    assert.equal(await page.locator('[data-default-agent][aria-pressed=true]').count(), 0);
    await page.click('#home-button'); await page.click('[data-default-agent="codex"]');
    await page.waitForSelector('[data-default-agent="codex"][aria-pressed=true]');
    assert.equal(await page.locator('#new-session-agent').textContent(), 'Codex');
    assert.equal(JSON.parse(fs.readFileSync(path.join(profile, 'launch.json'), 'utf8')).defaultAgent, 'codex');
    assert.equal(JSON.parse(fs.readFileSync(path.join(profile, 'launch.json'), 'utf8')).agents.codex, 'full'); // modes survive
    const tabsBeforeDefault = await page.getByRole('tab').count();
    await page.click('#new-session');
    await page.waitForFunction(count => document.querySelectorAll('[role=tab]').length === count + 1, tabsBeforeDefault);
    assert.match(await page.locator('.session-tab.active .tab-label').textContent(), /^Codex \d+$/);
    assert.equal(await page.locator('#home').isVisible(), false);
    await page.click('#home-button'); await page.click('[data-default-agent="codex"]');
    await page.waitForSelector('[data-default-agent="codex"][aria-pressed=false]');
    assert.equal(await page.locator('#new-session-agent').isHidden(), true);
    assert.equal(JSON.parse(fs.readFileSync(path.join(profile, 'launch.json'), 'utf8')).defaultAgent, undefined);
    const tabsAfterClear = await page.getByRole('tab').count();
    await page.click('#new-session'); await page.waitForSelector('#home', { state: 'visible' });
    assert.equal(await page.getByRole('tab').count(), tabsAfterClear);
    // Sign-in: OpenCode's provider button runs its own login command in a new tab.
    await page.waitForSelector('#opencode-providers .provider-chip, #opencode-providers .account-note:not(:has-text("okunuyor"))', { timeout: 20000 });
    await page.click('[data-login="opencode"]');
    await page.waitForFunction(count => document.querySelectorAll('[role=tab]').length === count + 1, tabsAfterClear);
    assert.equal(await page.locator('.session-tab.active .tab-label').textContent(), 'OpenCode · sign-in');
    assert.equal(await page.locator('.session-tab.active .tab-short').textContent(), 'OL');
    assert.equal(await page.locator('#session-mode').textContent(), 'Sign-in');
    assert.deepEqual(errors, []);
    await application.close(); application = await launch(); page = await application.firstWindow();
    await page.waitForFunction(() => document.getElementById('cwd')?.textContent.length > 0);
    assert.equal(await page.getByRole('tab').count(), 0);
    assert.equal(await page.locator('[data-launch-label="claude"]').textContent(), 'Normal');
    assert.equal(await page.locator('[data-launch-label="codex"]').textContent(), 'Full access');
    await page.click('[data-settings="global"]');
    assert.equal(await page.locator('#background').inputValue(), C.background);
    assert.equal(await page.locator('#foreground').inputValue(), C.foreground);
    assert.equal(await page.locator('#font').inputValue(), C.font);
    assert.equal(await page.locator('#font-size').inputValue(), String(C.fontSize));
    await page.click('[data-palette-filter="favorites"]');
    assert.equal(await page.locator('[data-library-palette]').count(), 2);
    assert.ok(await page.locator('[data-library-palette="fav-282a36-f8f8f2"]').isVisible());
    await page.click('#close-appearance');
    fs.writeFileSync(path.join(output, 'desktop-smoke.json'), JSON.stringify({ passed: true, checks: [
      'Four real CLI sessions run simultaneously across both agents and both modes',
      'Tab switches preserve the same processes and individual appearance',
      'Session appearance affects only its own terminal and never the preferences file',
      'Global appearance affects future sessions only and survives an application restart',
      'Closing a background tab preserves the selected tab and surviving processes',
      'Closing the last tab returns to the home screen', 'Narrow and desktop tab layouts have no page overflow', 'No renderer runtime errors'
    ] }, null, 2));
    console.log('Desktop smoke passed: simultaneous sessions, tabs, independent themes, prospective defaults, persistence.');
  } finally { await application.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
