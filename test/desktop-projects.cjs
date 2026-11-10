const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { _electron: electron } = require('playwright-core');

async function main() {
  const root = path.join(__dirname, '..'), output = path.join(root, '.test-output');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'elio-project-ui-'));
  const profile = path.join(directory, 'profile'), existing = path.join(directory, 'Ödeme projesi');
  fs.mkdirSync(existing); fs.mkdirSync(output, { recursive: true });
  const fixture = path.join(directory, 'agent.cjs');
  fs.writeFileSync(fixture, `
if(process.argv.includes('app-server')) {
 require('node:readline').createInterface({input:process.stdin}).on('line',line=>{const m=JSON.parse(line);if(m.id!==undefined)console.log(JSON.stringify({id:m.id,result:{}}));});
} else { console.log('PROJECT_CWD '+process.cwd()); process.stdin.setRawMode(true); process.stdin.on('data',data=>{if(data.includes(3))process.exit(0);}); }
`);
  for (const agent of ['claude', 'codex']) fs.writeFileSync(path.join(directory, agent + '.cmd'), `@"${process.execPath}" "${fixture}" %*\r\n`);
  const env = { ...process.env, ELIO_DATA_DIR: profile, CLAUDE_CONFIG_DIR: path.join(profile, 'no-claude-login') }; delete env.ELECTRON_RUN_AS_NODE;
  const pathKey = Object.keys(env).find(key => key.toLowerCase() === 'path'); env[pathKey] = directory + path.delimiter + env[pathKey];
  const launch = () => electron.launch({ executablePath: require('electron'), args: [path.join(root, 'desktop', 'main.cjs')], env });
  let app = await launch();
  try {
    let page = await app.firstWindow(); const errors = []; page.on('pageerror', error => errors.push(error.message));
    const picker = async folder => app.evaluate(({ dialog }, value) => { dialog.showOpenDialog = async () => value; }, folder ? { canceled: false, filePaths: [folder] } : { canceled: true, filePaths: [] });
    const observe = () => page.evaluate(() => { window.__events = []; window.elio.onMessage(value => window.__events.push(value)); });
    async function start(agent, cwd) {
      await page.click(`[data-agent="${agent}"]`);
      const id = await page.locator('.session-tab.active').getAttribute('data-session-id');
      await page.waitForFunction(({ id, cwd }) => window.__events.some(event => event.type === 'output' && event.sessionId === id && event.data.includes('PROJECT_CWD ' + cwd)), { id, cwd });
      return id;
    }
    await page.waitForFunction(() => !document.getElementById('project-open').disabled);
    assert.equal(await page.title(), 'Elio');
    assert.equal(await page.locator('.projects-brand h1').textContent(), 'Elio');
    assert.ok(await page.locator('#projects-view').isVisible()); assert.ok(await page.locator('#projects-empty').isVisible());
    assert.ok(await page.locator('#workspace').isHidden()); await observe();
    await page.screenshot({ path: path.join(output, 'projects-empty.png') });
    await picker(null); await page.click('#project-open');
    await page.waitForFunction(() => !document.getElementById('project-open').disabled);
    assert.ok(await page.locator('#projects-view').isVisible());
    await picker(existing); await page.click('#project-open'); await page.waitForFunction(() => !document.getElementById('home').hidden);
    assert.equal(await page.locator('#cwd').textContent(), existing);
    const first = await start('claude', existing);
    await page.click('#show-projects'); await page.click('#project-new');
    await picker(directory); await page.click('#project-location');
    await page.waitForFunction(expected => document.getElementById('project-parent').textContent === expected, directory);
    await page.fill('#project-name', '..\\escape'); await page.click('#project-create-submit');
    assert.ok(await page.locator('#project-create-error').isVisible()); assert.equal(fs.existsSync(path.join(directory, 'escape')), false);
    await page.fill('#project-name', 'Yeni Türkçe proje');
    await page.screenshot({ path: path.join(output, 'project-create.png') });
    await page.click('#project-create-submit'); await page.waitForFunction(() => !document.getElementById('home').hidden);
    const created = path.join(directory, 'Yeni Türkçe proje'); assert.ok(fs.statSync(created).isDirectory());
    assert.equal(await page.locator('#cwd').textContent(), created); const second = await start('codex', created);
    await page.locator('#tab-' + first).click(); assert.equal(await page.locator('#session-project').textContent(), 'Ödeme projesi');
    await page.locator('#tab-' + second).click(); assert.equal(await page.locator('#session-project').textContent(), 'Yeni Türkçe proje');
    assert.equal(await page.getByRole('tab').count(), 2);
    await page.click('#show-projects'); assert.equal(await page.locator('.recent-project').count(), 2);
    await page.screenshot({ path: path.join(output, 'projects-recent.png') });
    for (const width of [360, 560, 1100]) {
      await page.setViewportSize({ width, height: 820 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    }
    await page.locator('.recent-open').filter({ hasText: 'Ödeme projesi' }).click();
    await page.waitForFunction(() => !document.getElementById('home').hidden);
    assert.equal(await page.locator('#cwd').textContent(), existing); assert.equal(await page.getByRole('tab').count(), 2);
    await app.close(); app = await launch(); page = await app.firstWindow();
    await page.waitForFunction(() => !document.getElementById('project-open').disabled);
    assert.ok(await page.locator('#projects-view').isVisible()); assert.equal(await page.locator('.recent-project').count(), 2);
    assert.equal(await page.getByRole('tab').count(), 0);
    fs.renameSync(created, created + '-moved');
    await page.locator('.recent-open').filter({ hasText: 'Yeni Türkçe proje' }).click();
    assert.ok(await page.locator('#project-error').isVisible());
    await page.getByRole('button', { name: 'Remove Yeni Türkçe proje from recent projects' }).click();
    await page.waitForFunction(() => document.querySelectorAll('.recent-project').length === 1);
    assert.ok(fs.statSync(created + '-moved').isDirectory());
    assert.deepEqual(errors, []);
    console.log('Project UI passed: picker, recent projects, creation, retained sessions, working directories and restart.');
  } finally { await app.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
