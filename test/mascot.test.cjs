const test = require('node:test');
const assert = require('node:assert/strict');
const { mascotFrame, WIDTH } = require('../src/mascot.cjs');
const { TerminalUI } = require('../src/terminal-ui.cjs');
const { textWidth } = require('../src/tui-screen.cjs');

test('terminal mascot walks, reverses direction and stays above both selection cards', () => {
  for (const cols of [54, 80, 110]) {
    assert.notEqual(mascotFrame(cols, 0).x, mascotFrame(cols, 4000).x);
    assert.notDeepEqual(mascotFrame(cols, 0).lines, mascotFrame(cols, 180).lines);
    assert.ok(mascotFrame(cols, 12000).facing === 'left');
    for (let time = 0; time <= 32000; time += 120) {
      const pose = mascotFrame(cols, time);
      assert.ok(pose.x >= 3 && pose.x + WIDTH <= cols - 3);
      assert.ok(pose.lines.every(line => textWidth(line) === WIDTH));
    }
    assert.deepEqual(mascotFrame(cols, 0, false), mascotFrame(cols, 5000, false));
  }
});

test('animated home preserves card targets and the terminal copy is plain', () => {
  let time = 100;
  const ui = new TerminalUI({ readAuthStatus: async () => ({ state: 'unknown' }), cwd: process.cwd(), now: () => time, preferences: { read: () => ({}), write() {} } });
  try {
    const agents = ['claude', 'codex', 'opencode'];
    for (const [cols, rows] of [[54, 22], [80, 24], [110, 34]]) {
      ui.resize(cols, rows); const first = ui.render(), hits = first.hits.filter(hit => agents.includes(hit.action));
      time += 2000; const second = ui.render();
      // A narrow and short terminal drops the mascot so that three stacked cards still fit.
      const tight = cols < 76 && rows < 23;
      if (tight) assert.equal(first.plain(), second.plain()); else assert.notEqual(first.plain(), second.plain());
      assert.deepEqual(second.hits.filter(hit => agents.includes(hit.action)), hits);
      assert.deepEqual(hits.map(hit => hit.action), agents); assert.ok(hits.every(hit => hit.y >= (tight ? 2 : 8)));
      assert.ok(!/Fikirden|akış|odaklan|Renklerini seç|çalışıyoruz/.test(second.plain()));
      assert.ok(hits.every(hit => hit.x + hit.cols <= cols && hit.y + hit.rows <= rows));
      assert.ok(second.hits.some(hit => hit.action === 'global' && hit.y < rows - 1), 'footer buttons stay visible');
      assert.ok(second.plain().includes('OpenCode'));
    }
  } finally { ui.dispose(); }
});
