const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createProjects } = require('../src/projects.cjs');
const { createController } = require('../src/controller.cjs');

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'elio-projects-'));
  const a = path.join(root, 'Türkçe proje'), b = path.join(root, 'ikinci proje');
  fs.mkdirSync(a); fs.mkdirSync(b);
  return { root, a: fs.realpathSync.native(a), b: fs.realpathSync.native(b), store: createProjects(path.join(root, 'profile')) };
}
test('project history deduplicates, persists, keeps missing entries removable and never deletes folders', () => {
  const { root, a, b, store } = fixture();
  assert.deepEqual(store.list(), []);
  store.remember(a); store.remember(b); store.remember(path.join(a, '.'));
  assert.deepEqual(store.list().map(item => item.path), [a, b]);
  const reopened = createProjects(path.join(root, 'profile'));
  assert.deepEqual(reopened.list().map(item => item.path), [a, b]);
  assert.equal(reopened.list()[0].available, true);
  fs.renameSync(b, b + '-moved');
  assert.equal(store.list()[1].available, false);
  assert.throws(() => store.remember(b), /missing or inaccessible/);
  store.remove(b); assert.equal(store.list().length, 1);
  store.remove(a); assert.equal(store.list().length, 0); assert.ok(fs.statSync(a).isDirectory());
});
test('new projects create only a fresh child folder and reject traversal, reserved names and existing content', () => {
  const { root, a, store } = fixture();
  const project = store.create('Yeni çalışma', root);
  assert.equal(project.path, fs.realpathSync.native(path.join(root, 'Yeni çalışma')));
  assert.deepEqual(fs.readdirSync(project.path), []);
  fs.writeFileSync(path.join(a, 'existing.txt'), 'keep');
  assert.throws(() => store.create(path.basename(a), root), /already exists/);
  assert.equal(fs.readFileSync(path.join(a, 'existing.txt'), 'utf8'), 'keep');
  for (const name of ['..', '../escape', '..\\escape', 'CON', 'nul.txt', 'test.', 'test ', '', 'a/b']) assert.throws(() => store.create(name, root));
  assert.throws(() => store.create('valid', path.join(root, 'missing')));
  assert.throws(() => store.remember(path.join(a, 'existing.txt')));
});
test('project changes affect future sessions and keep existing processes attached to their original folder', async () => {
  const { a, b, store } = fixture(); const events = [], starts = [];
  const controller = createController({ cwd: null, projects: store, getAppearance: () => ({}), post: value => events.push(value), pickProject: async () => a }, {
    readAuthStatus: async () => ({ state: 'unknown' }),
    startTerminal(agent, cwd) {
      const process = { agent, cwd, writes: [], onData: () => ({ dispose() {} }), onExit: () => ({ dispose() {} }), write(value) { this.writes.push(value); }, kill() {} };
      starts.push(process); return process;
    }
  });
  try {
    await controller.receive({ type: 'ready' }); assert.equal(events[0].cwd, null);
    await controller.receive({ type: 'start', sessionId: 'before-project', agent: 'claude' });
    assert.equal(starts.length, 0); assert.equal(events.at(-1).type, 'error');
    await controller.receive({ type: 'projectChoose' });
    await controller.receive({ type: 'start', sessionId: 'first', agent: 'claude' });
    await controller.receive({ type: 'projectRecent', path: b });
    await controller.receive({ type: 'start', sessionId: 'second', agent: 'codex' });
    assert.deepEqual(starts.map(item => item.cwd), [a, b]);
    await controller.receive({ type: 'projectRecent', path: path.join(b, 'missing') });
    assert.equal(events.at(-1).type, 'error');
    await controller.receive({ type: 'start', sessionId: 'third', agent: 'claude' });
    assert.equal(starts[2].cwd, b);
    await controller.receive({ type: 'input', sessionId: 'first', data: 'first-project' });
    assert.deepEqual(starts[0].writes, ['first-project']); assert.deepEqual(starts[1].writes, []);
  } finally { controller.dispose(); }
});
