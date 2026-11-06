const test = require('node:test');
const assert = require('node:assert/strict');
const { createController } = require('../src/controller.cjs');

function fixture(clipboardRead = async () => 'pasted') {
  const events = [], processes = [];
  const controller = createController({
    cwd: process.cwd(), post: message => events.push(message), getAppearance: () => ({}), saveAppearance() {},
    clipboard: { readText: clipboardRead, writeText() {} }
  }, {
    readAuthStatus: async () => ({ state: 'unknown' }),
    startTerminal() {
      const data = new Set(), exits = new Set();
      const fake = { writes: [], resizes: [], killed: 0,
        onData: fn => { data.add(fn); return { dispose: () => data.delete(fn) }; },
        onExit: fn => { exits.add(fn); return { dispose: () => exits.delete(fn) }; },
        write(value) { fake.writes.push(value); }, resize(...value) { fake.resizes.push(value); },
        kill() { fake.killed++; }, output(value) { for (const fn of [...data]) fn(value); },
        exit() { for (const fn of [...exits]) fn({ exitCode: 0 }); }
      };
      processes.push(fake); return fake;
    }
  });
  const start = sessionId => controller.receive({ type: 'start', sessionId, agent: 'claude', mode: 'normal', cols: 80, rows: 24 });
  return { controller, events, processes, start };
}

test('parallel sessions route input, output and resize independently; close targets one process', async () => {
  const { controller, events, processes, start } = fixture();
  await start('one'); await start('two'); await start('one');
  assert.equal(processes.length, 2);
  await controller.receive({ type: 'input', sessionId: 'one', data: 'only one' });
  await controller.receive({ type: 'resize', sessionId: 'two', cols: 110, rows: 32 });
  assert.deepEqual(processes[0].writes, ['only one']);
  assert.deepEqual(processes[1].writes, []);
  assert.deepEqual(processes[1].resizes, [[110, 32]]);
  processes[0].output('A'); processes[1].output('B');
  assert.deepEqual(events.filter(event => event.type === 'output'), [
    { type: 'output', sessionId: 'one', data: 'A' }, { type: 'output', sessionId: 'two', data: 'B' }
  ]);
  await controller.receive({ type: 'close', sessionId: 'one' });
  assert.equal(processes[0].killed, 1); assert.equal(processes[1].killed, 0);
  const count = events.length;
  processes[0].output('late'); assert.equal(events.length, count);
  processes[1].output('still active'); assert.equal(events.at(-1).sessionId, 'two');
  controller.dispose(); controller.dispose();
  assert.equal(processes[1].killed, 1);
});

test('exited sessions ignore input and do not stop a surviving session', async () => {
  const { controller, events, processes, start } = fixture();
  await start('one'); await start('two'); processes[0].exit();
  assert.deepEqual(events.at(-1), { type: 'exit', sessionId: 'one', exitCode: 0 });
  await controller.receive({ type: 'input', sessionId: 'one', data: 'ignored' });
  await controller.receive({ type: 'input', sessionId: 'two', data: 'accepted' });
  assert.deepEqual(processes[0].writes, []); assert.deepEqual(processes[1].writes, ['accepted']);
  controller.dispose(); assert.equal(processes[0].killed, 0); assert.equal(processes[1].killed, 1);
});

test('delayed clipboard data cannot reach a closed or replacement session', async () => {
  let release;
  const { controller, events, start } = fixture(() => new Promise(resolve => { release = resolve; }));
  await start('one');
  const paste = controller.receive({ type: 'paste', sessionId: 'one' });
  await controller.receive({ type: 'close', sessionId: 'one' }); await start('one');
  release('private clipboard'); await paste;
  assert.equal(events.filter(event => event.type === 'paste').length, 0);
  controller.dispose();
});
