const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { Terminal } = require('@xterm/headless');
const { TerminalUI } = require('../src/terminal-ui.cjs');
const { Frame, drawFrame } = require('../src/tui-screen.cjs');
const { InputDecoder } = require('../src/tui-input.cjs');

const write = (terminal, data) => new Promise(resolve => terminal.write(data, resolve));
const key = (ui, name, raw = name) => ui.input({ type: 'key', name, raw });
function setup() {
  const processes = [], saved = [];
  const ui = new TerminalUI({ readAuthStatus: async () => ({ state: 'unknown' }), cwd: process.cwd(), cols: 100, rows: 30,
    preferences: { read: () => ({}), write: value => saved.push({ ...value }) },
    startTerminal(agent, cwd, cols, rows, mode) {
      const events = new EventEmitter();
      const process = { agent, cwd, cols, rows, mode, inputs: [], killed: false,
        onData: callback => { events.on('data', callback); return { dispose: () => events.off('data', callback) }; },
        onExit: callback => { events.on('exit', callback); return { dispose: () => events.off('exit', callback) }; },
        write: value => process.inputs.push(value), resize: (cols, rows) => { process.cols = cols; process.rows = rows; },
        kill: () => { process.killed = true; }, events };
      processes.push(process); return process;
    }
  });
  return { ui, processes, saved };
}

test('streaming keys, mouse and bracketed paste stay intact across chunks', async () => {
  const events = [], decoder = new InputDecoder(event => events.push(event));
  decoder.feed('\x1b['); decoder.feed('12~'); decoder.feed('\x1b[<0;'); decoder.feed('15;7M');
  decoder.feed('\x1b[200~merhaba ğüş\x1b[12~'); decoder.feed('\x1b[20'); decoder.feed('1~');
  assert.equal(events[0].name, 'f2');
  assert.deepEqual(events[1], { type: 'mouse', button: 0, x: 14, y: 6, release: false });
  assert.deepEqual(events[2], { type: 'paste', text: 'merhaba ğüş\x1b[12~' });
  decoder.feed('\x1b'); await new Promise(resolve => setTimeout(resolve, 65));
  assert.equal(events[3].name, 'escape'); decoder.dispose();
});

test('session output, input, queries and closing remain independent in the terminal UI', async () => {
  const { ui, processes } = setup();
  try {
    ui.action('claude'); const first = ui.active;
    ui.action('home'); ui.action('launch:codex'); key(ui, 'down'); key(ui, 'enter'); ui.action('codex'); const second = ui.active;
    assert.equal(processes[0].mode, 'normal'); assert.equal(processes[1].mode, 'full');
    await write(first.terminal, 'CLAUDE_OUTPUT\r\n\x1b[31mRED\x1b[0m');
    await write(second.terminal, 'CODEX_OUTPUT\r\n\x1b[6n');
    assert.ok(processes[1].inputs.some(input => /^\x1b\[\d+;\d+R$/.test(input)));
    assert.ok(ui.render().plain().includes('CODEX_OUTPUT')); assert.ok(!ui.render().plain().includes('CLAUDE_OUTPUT'));
    key(ui, 'f6'); assert.equal(ui.active, first); assert.ok(ui.render().plain().includes('CLAUDE_OUTPUT'));
    await write(first.terminal, '\x1b]11;?\x07\x1b[?1h');
    assert.ok(processes[0].inputs.includes('\x1b]11;rgb:1f1f/2424/2727\x1b\\'));
    key(ui, 'up', '\x1b[A'); assert.equal(processes[0].inputs.at(-1), '\x1bOA');
    key(ui, 'ctrl-c', '\x03'); assert.equal(processes[0].inputs.at(-1), '\x03');
    assert.ok(!processes[1].inputs.includes('\x03'));
    await write(first.terminal, '\x1b[?2004h');
    ui.input({ type: 'paste', text: 'ğüş\x1b[21~' });
    assert.equal(processes[0].inputs.at(-1), '\x1b[200~ğüş[21~\x1b[201~');
    ui.action('close:' + second.id); assert.equal(ui.modal.type, 'confirm'); ui.action('confirm');
    assert.ok(processes[1].killed); assert.ok(!processes[0].killed); assert.equal(ui.active, first);
    ui.resize(80, 24); assert.deepEqual([processes[0].cols, processes[0].rows], [58, 23]);
    processes[0].events.emit('exit', { exitCode: 0 }); assert.ok(ui.render().plain().includes('Session ended'));
    ui.action('close:' + first.id); assert.equal(ui.sessions.length, 0); assert.equal(ui.home, true);
  } finally { ui.dispose(); }
});

test('local previews cancel cleanly and global colors apply only to later sessions', () => {
  const { ui, saved } = setup();
  try {
    ui.startSession('claude', 'normal'); const first = ui.active, original = { ...first.appearance };
    ui.showTheme('session'); key(ui, '1'); assert.equal(first.appearance.background, '#282a36');
    key(ui, 'escape'); assert.deepEqual(first.appearance, original); assert.equal(saved.length, 0);
    ui.showTheme('session'); key(ui, '2'); key(ui, 'enter'); assert.equal(first.appearance.background, '#2e3440');
    ui.showTheme('global'); key(ui, '5'); key(ui, 'enter');
    assert.equal(first.appearance.background, '#2e3440'); assert.equal(saved[0].background, '#1e1e2e');
    ui.startSession('codex', 'normal'); assert.equal(ui.active.appearance.background, '#1e1e2e');
    ui.showTheme('global'); key(ui, 'b'); key(ui, 'h'); key(ui, 'backspace'); key(ui, 'enter');
    assert.ok(ui.modal.error); assert.equal(saved.length, 1); key(ui, 'escape'); key(ui, 'escape');
    assert.equal(ui.general.background, '#1e1e2e');
    ui.render(); const count = ui.sessions.length; ui.showTheme('global'); ui.render();
    ui.input({ type: 'mouse', button: 0, x: 95, y: 10, release: false });
    assert.equal(ui.sessions.length, count); assert.equal(ui.modal.type, 'theme');
  } finally { ui.dispose(); }
});

test('numeric menu switches sessions without consuming digits typed to a CLI', () => {
  const { ui, processes } = setup();
  try {
    key(ui, '1'); const first = ui.active;
    ui.action('home'); key(ui, '2'); const second = ui.active;
    for (const digit of '0123456789') key(ui, digit);
    assert.equal(processes[1].inputs.join(''), '0123456789'); assert.equal(ui.active, second);
    key(ui, 'f9'); assert.equal(ui.modal.type, 'shortcuts'); key(ui, '6');
    assert.equal(ui.active, first); assert.equal(ui.modal, null); assert.deepEqual(processes[0].inputs, []);
    key(ui, 'f9'); key(ui, '7'); assert.equal(ui.active, second);
    key(ui, 'f9'); key(ui, '5'); assert.equal(ui.home, true);
    key(ui, '6'); assert.equal(ui.active, first); assert.equal(ui.home, false);
    key(ui, 'f9'); key(ui, '4'); key(ui, '/');
    for (const letter of 'Solarized Light') key(ui, letter);
    key(ui, 'enter'); assert.ok(ui.themeItems().some(pair => pair.id === 'solarized-light'));
    key(ui, ' '); assert.equal(ui.modal.draft.background, '#fdf6e3');
    key(ui, '9'); assert.equal(ui.active.appearance.background, '#fdf6e3');
  } finally { ui.dispose(); }
});

test('frame roundtrip preserves Turkish, CJK, color attributes and cursor positions', async () => {
  const frame = new Frame(80, 24, { fg: '#112233', bg: '#445566' });
  frame.text(2, 2, 'Türkçe ğüşiöç → ↗ 漢字', { bold: true }); frame.cursor = { x: 4, y: 5 };
  const terminal = new Terminal({ cols: 80, rows: 24, allowProposedApi: true });
  try {
    await write(terminal, drawFrame(frame).data);
    assert.equal(terminal.buffer.active.getLine(2).translateToString(true).trimEnd(), frame.cells[2].map(cell => cell.ch).join('').trimEnd());
    assert.equal(terminal.buffer.active.getLine(2).getCell(2).getFgColor(), 0x112233);
    assert.ok(terminal.buffer.active.getLine(2).getCell(2).isBold());
    assert.deepEqual([terminal.buffer.active.cursorX, terminal.buffer.active.cursorY], [4, 5]);
    for (let col = 2; col < 28; col++) { const cell = terminal.buffer.active.getLine(2).getCell(col); assert.equal(cell.getWidth() ? cell.getChars() || ' ' : '', frame.cells[2][col].ch); }
  } finally { terminal.dispose(); }
});

test('theme navigation and random selection visibly preview the selected pair and preserve cancellation', () => {
  const { ui } = setup();
  try {
    ui.startSession('claude', 'normal'); const other = ui.active;
    ui.startSession('codex', 'normal'); const current = ui.active, original = { ...current.appearance };
    ui.showTheme('session'); key(ui, 'down');
    assert.equal(current.appearance.background, '#2e3440');
    assert.deepEqual(other.appearance, original);
    let frame = ui.render();
    assert.ok(frame.cells.flat().filter(cell => cell.bg === '#2e3440').length > 300);
    ui.action('random');
    const pair = ui.themeItems()[ui.modal.index];
    assert.equal(pair.background, ui.modal.draft.background); assert.equal(pair.foreground, ui.modal.draft.foreground);
    frame = ui.render(); assert.ok(frame.plain().includes(pair.name.slice(0, 20)));
    assert.ok(frame.cells.flat().filter(cell => cell.bg === pair.background).length > 300);
    assert.equal(current.appearance.background, pair.background);
    key(ui, 'escape'); assert.deepEqual(current.appearance, original);
    ui.showTheme('session');
    const hit = ui.render().hits.find(hit => hit.action === 'palette:solarized-light');
    ui.input({ type: 'mouse', button: 0, x: hit.x + 1, y: hit.y, release: false });
    assert.equal(ui.modal.draft.background, '#fdf6e3');
    key(ui, 'f4'); assert.equal(ui.modal.scope, 'global'); assert.deepEqual(current.appearance, original);
  } finally { ui.dispose(); }
});

test('right rail preserves terminal height, clips controls and supports compact widths', () => {
  const { ui } = setup();
  try {
    ui.startSession('claude', 'normal');
    for (const [cols, rows] of [[54, 22], [80, 24], [110, 34]]) {
      ui.resize(cols, rows); const frame = ui.render();
      assert.equal(ui.active.terminal.rows, rows - 1);
      assert.equal(ui.active.terminal.cols, ui.contentCols - 2);
      assert.ok(frame.hits.every(hit => hit.x >= 0 && hit.x + hit.cols <= cols));
      if (cols >= 80) {
        assert.ok(frame.hits.every(hit => hit.x >= ui.contentCols));
        assert.ok(frame.plain().includes('F10 Exit'));
        const count = ui.active.process.inputs.length;
        ui.mouse({ button: 0, x: ui.contentCols + 1, y: 10, release: false });
        assert.equal(ui.active.process.inputs.length, count);
      } else assert.ok(frame.plain().split('\n')[0].includes('F9 Menu'));
      ui.showTheme('session'); const preview = ui.render();
      assert.ok(preview.cells.flat().filter(cell => cell.bg === ui.modal.draft.background).length > 100);
      key(ui, 'escape');
    }
  } finally { ui.dispose(); }
});

test('manual color entry replaces the old hex and previews valid input immediately', () => {
  const { ui } = setup();
  try {
    ui.startSession('claude', 'normal'); const original = { ...ui.active.appearance };
    ui.showTheme('session'); key(ui, 'b'); key(ui, 'h');
    for (const char of '#abcdef') key(ui, char);
    assert.equal(ui.modal.manual.value, '#abcdef'); assert.equal(ui.active.appearance.background, '#abcdef');
    key(ui, 'enter'); key(ui, 'enter'); assert.equal(ui.active.appearance.background, '#abcdef');
    assert.equal(ui.active.appearance.font, original.font); assert.equal(ui.active.appearance.fontSize, original.fontSize);
  } finally { ui.dispose(); }
});

test('color grid previews each field independently with mouse, arrows and saturation controls', () => {
  const { ui, saved } = setup();
  try {
    ui.startSession('claude', 'normal'); const other = ui.active;
    ui.startSession('codex', 'normal'); const current = ui.active, original = { ...current.appearance };
    ui.showTheme('session'); key(ui, 'm');
    assert.equal(ui.modal.editor, 'custom'); assert.equal(ui.modal.manual, null);
    let frame = ui.render(), cells = frame.hits.filter(hit => hit.action?.startsWith('color:'));
    assert.equal(cells.length, 156);
    const red = cells.find(hit => hit.action === 'color:72');
    ui.input({ type: 'mouse', button: 0, x: red.x, y: red.y, release: false });
    const background = current.appearance.background;
    assert.notEqual(background, original.background); assert.equal(current.appearance.foreground, original.foreground);
    key(ui, 'tab'); assert.equal(ui.modal.colorField, 'foreground'); assert.equal(current.appearance.background, background);
    key(ui, 'down'); key(ui, 'right');
    assert.notEqual(current.appearance.foreground, original.foreground); assert.equal(current.appearance.background, background);
    ui.action('color:84'); const first = current.appearance.foreground; key(ui, 's');
    assert.notEqual(current.appearance.foreground, first); assert.equal(current.appearance.background, background);
    frame = ui.render(); assert.ok(frame.plain().includes('Custom colors'));
    assert.ok(frame.cells.flat().filter(cell => cell.bg === background).length > 300);
    assert.deepEqual(other.appearance, original); assert.equal(saved.length, 0);
    key(ui, 'p'); assert.equal(ui.modal.editor, 'presets');
    key(ui, 'escape'); assert.deepEqual(current.appearance, original);
    ui.showTheme('global'); key(ui, 'm'); key(ui, 'right'); const future = ui.modal.draft.background; key(ui, 'enter');
    assert.equal(saved[0].background, future); assert.deepEqual(current.appearance, original);
    ui.startSession('claude', 'normal'); assert.equal(ui.active.appearance.background, future);
  } finally { ui.dispose(); }
});

test('color grid remains inside narrow screens and scrolls to every tone', () => {
  const { ui } = setup();
  try {
    ui.startSession('claude', 'normal');
    for (const [cols, rows] of [[54, 22], [80, 24], [110, 34]]) {
      ui.resize(cols, rows); ui.showTheme('session'); key(ui, 'm');
      for (let index = 0; index < 13; index++) key(ui, 'down');
      const frame = ui.render(), hit = frame.hits.find(hit => hit.action === 'color:' + ui.modal.colorIndex);
      assert.ok(hit); assert.ok(hit.y >= 9 && hit.y < rows - 3);
      assert.ok(frame.hits.every(hit => hit.x >= 0 && hit.x + hit.cols <= cols));
      assert.ok(frame.plain().includes('Sample text'));
      key(ui, 'escape');
    }
  } finally { ui.dispose(); }
});


test('optional names stay with their session, cancel cleanly and never reach the CLI', async () => {
  const { ui, processes } = setup();
  try {
    ui.startSession('claude', 'normal'); const first = ui.active;
    ui.startSession('codex', 'normal'); const second = ui.active;
    await write(second.terminal, 'RETAINED_OUTPUT');
    key(ui, 'f9'); key(ui, 'a'); assert.equal(ui.modal.type, 'rename');
    for (const char of 'Ödeme ekranı') key(ui, char);
    key(ui, 'enter');
    assert.equal(ui.sessionLabel(second), 'Ödeme ekranı');
    assert.ok(ui.render().plain().includes('Ödeme ekranı'));
    assert.ok(ui.render().plain().includes('RETAINED_OUTPUT'));
    assert.deepEqual(processes[1].inputs, []); assert.equal(processes.length, 2);
    ui.action('rename'); ui.input({ type: 'paste', text: 'Vazgeçilecek isim' }); key(ui, 'escape');
    assert.equal(ui.sessionLabel(second), 'Ödeme ekranı');
    key(ui, 'f6'); assert.equal(ui.active, first); assert.equal(ui.sessionLabel(first), 'Claude Code 1');
    key(ui, 'f7'); assert.equal(ui.sessionLabel(ui.active), 'Ödeme ekranı');
    ui.action('rename'); key(ui, 'backspace'); key(ui, 'enter');
    assert.equal(ui.sessionLabel(second), 'Codex 1');
    ui.action('rename'); ui.input({ type: 'paste', text: 'ğ'.repeat(60) + '\x1b[31m' }); key(ui, 'enter');
    assert.equal([...second.name].length, 40);
    assert.ok(!second.name.includes('\x1b')); assert.ok(!processes[1].killed);
    for (const [cols, rows] of [[54, 22], [80, 24], [110, 34]]) {
      ui.resize(cols, rows); ui.action('rename');
      const frame = ui.render();
      assert.ok(frame.cursor.x < cols && frame.cursor.y < rows);
      assert.ok(frame.hits.every(hit => hit.x >= 0 && hit.x + hit.cols <= cols));
      key(ui, 'escape');
    }
    ui.startSession('codex', 'normal'); assert.equal(ui.sessionLabel(ui.active), 'Codex 2');
  } finally { ui.dispose(); }
});
