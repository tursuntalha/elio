const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createFavorites } = require('../src/favorites.cjs');
const { createPreferences } = require('../desktop/preferences.cjs');
const { TerminalUI } = require('../src/terminal-ui.cjs');
const { createController } = require('../src/controller.cjs');
const temporary = () => fs.mkdtempSync(path.join(os.tmpdir(), 'agent-terminal-favorites-'));

test('favorites persist ready and custom pairs, normalize duplicates and read changes from another instance', () => {
  const directory = temporary(), store = createFavorites(directory);
  assert.deepEqual(store.read(), []);
  const pair = { background: '#282A36', foreground: '#F8F8F2' };
  const result = store.toggle(pair, 'Dracula');
  assert.equal(result.added, true); assert.equal(result.favorites[0].background, '#282a36');
  const second = createFavorites(directory); assert.deepEqual(second.read(), result.favorites);
  assert.equal(second.toggle({ background: '#123456', foreground: '#abcdef' }).favorites[1].name, 'Custom theme 1');
  const filename = path.join(directory, 'favorites.json');
  const original = fs.readFileSync(filename, 'utf8');
  fs.writeFileSync(filename, original.replace('Custom theme 1', 'Özel tema 1'));
  assert.equal(store.read()[1].name, 'Custom theme 1');
  assert.equal(fs.readFileSync(filename, 'utf8'), original.replace('Custom theme 1', 'Özel tema 1'));
  const nextPair = { background: '#111111', foreground: '#eeeeee' };
  assert.equal(second.toggle(nextPair).favorites[2].name, 'Custom theme 2');
  assert.equal(second.toggle(nextPair).added, false);
  assert.equal(store.toggle({ background: '#282a36', foreground: '#f8f8f2' }).added, false);
  assert.equal(second.read().length, 1);
  const before = fs.readFileSync(path.join(directory, 'favorites.json'), 'utf8');
  assert.throws(() => store.toggle({ background: 'red', foreground: '#ffffff' }));
  assert.equal(fs.readFileSync(path.join(directory, 'favorites.json'), 'utf8'), before);
  fs.writeFileSync(path.join(directory, 'favorites.json'), 'broken');
  assert.throws(() => store.toggle(pair));
  assert.equal(fs.readFileSync(path.join(directory, 'favorites.json'), 'utf8'), 'broken');
});

test('terminal favorites survive a new UI and apply colors without changing font settings', () => {
  const directory = temporary(), preferences = createPreferences(directory);
  preferences.write({ background: '#101010', foreground: '#efefef', font: 'jetbrains', fontSize: 20 });
  const ui = new TerminalUI({ readAuthStatus: async () => ({ state: 'unknown' }), readAuthStatus: async () => ({ state: 'unknown' }), cwd: process.cwd(), preferences, favorites: createFavorites(directory) });
  try {
    ui.showTheme('global'); ui.action('palette:dracula'); ui.action('favorite-toggle');
    assert.equal(ui.favorites.length, 1); assert.equal(preferences.read().background, '#101010');
    ui.action('custom'); ui.selectColor(43); ui.action('foreground'); ui.selectColor(145); ui.action('favorite-toggle');
    assert.equal(ui.favorites.length, 2); assert.equal(ui.favorites[1].name, 'Custom theme 1');
    ui.dismissModal();
  } finally { ui.dispose(); }
  const reopened = new TerminalUI({ readAuthStatus: async () => ({ state: 'unknown' }), readAuthStatus: async () => ({ state: 'unknown' }), cwd: process.cwd(), preferences, favorites: createFavorites(directory) });
  try {
    reopened.showTheme('global'); reopened.action('favorite-list');
    assert.equal(reopened.themeItems().length, 2);
    reopened.input({ type: 'key', name: 'p', raw: 'p' }); assert.equal(reopened.modal.editor, 'presets'); reopened.action('favorite-list');
    const custom = reopened.themeItems()[1]; reopened.action('palette:' + custom.id);
    assert.equal(reopened.modal.draft.background, custom.background); assert.equal(reopened.modal.draft.font, 'jetbrains');
    assert.equal(reopened.modal.draft.fontSize, 20); reopened.dismissModal(true);
    assert.equal(preferences.read().foreground, custom.foreground);
    reopened.showTheme('global'); reopened.action('favorite-list'); reopened.action('palette:' + custom.id); reopened.action('favorite-toggle');
    assert.equal(reopened.themeItems().length, 1);
    for (const [cols, rows] of [[54, 22], [80, 24], [110, 34]]) { reopened.resize(cols, rows); assert.ok(reopened.render().hits.every(hit => hit.x + hit.cols <= cols)); }
  } finally { reopened.dispose(); }
});

test('desktop messages share persistent favorites and report invalid saves without changing appearance', async () => {
  const store = createFavorites(temporary()), events = [];
  const controller = createController({ cwd: process.cwd(), getAppearance: () => ({}), post: message => events.push(message),
    getFavorites: () => store.read(), toggleFavorite: (value, name) => store.toggle(value, name), saveAppearance: () => { throw new Error('Favorites must not change appearance'); }
  }, { readAuthStatus: async () => ({ state: 'unknown' }), readAuthStatus: async () => ({ state: 'unknown' }) });
  try {
    await controller.receive({ type: 'ready' }); assert.ok(events.some(event => event.type === 'settings'));
    await controller.receive({ type: 'favoriteToggle', value: { background: '#123456', foreground: '#abcdef' } });
    assert.equal(events.filter(event => event.type === 'favorites').at(-1).value.length, 1);
    await controller.receive({ type: 'favoriteToggle', value: { background: 'invalid', foreground: '#abcdef' } });
    assert.equal(events.at(-1).type, 'error'); assert.equal(store.read().length, 1);
  } finally { controller.dispose(); }
});
