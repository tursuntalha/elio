// Parses streaming input: escape sequences and pasted text may cross chunks.
class InputDecoder {
  constructor(emit) { this.emit = emit; this.buffer = ''; this.paste = null; this.timer = null; }
  feed(data) {
    clearTimeout(this.timer);
    this.buffer += data;
    while (this.buffer) {
      if (this.paste !== null) {
        const end = this.buffer.indexOf('\x1b[201~');
        if (end === -1) {
          const keep = Math.min(5, this.buffer.length);
          this.paste += this.buffer.slice(0, this.buffer.length - keep); this.buffer = this.buffer.slice(-keep);
          return;
        }
        const text = this.paste + this.buffer.slice(0, end);
        this.paste = null; this.buffer = this.buffer.slice(end + 6); this.emit({ type: 'paste', text }); continue;
      }
      if (this.buffer.startsWith('\x1b[200~')) { this.buffer = this.buffer.slice(6); this.paste = ''; continue; }
      if (this.buffer[0] !== '\x1b') {
        const char = String.fromCodePoint(this.buffer.codePointAt(0)); this.buffer = this.buffer.slice(char.length);
        this.emit({ type: 'key', raw: char, name: ({ '\r': 'enter', '\n': 'enter', '\t': 'tab', '\x7f': 'backspace', '\b': 'backspace', '\x03': 'ctrl-c' })[char] || char }); continue;
      }
      const sequence = /^(?:\x1b\[[0-?]*[ -/]*[@-~]|\x1bO[ -~])/.exec(this.buffer)?.[0];
      if (sequence) {
        this.buffer = this.buffer.slice(sequence.length);
        const mouse = /^\x1b\[<(\d+);(\d+);(\d+)([mM])$/.exec(sequence);
        if (mouse) this.emit({ type: 'mouse', button: +mouse[1], x: +mouse[2] - 1, y: +mouse[3] - 1, release: mouse[4] === 'm' });
        else this.emit({ type: 'key', raw: sequence, name: KEYS[sequence] || sequence });
        continue;
      }
      if (this.buffer.length > 1 && !['[', 'O'].includes(this.buffer[1])) {
        const char = String.fromCodePoint(this.buffer.codePointAt(1)); const raw = '\x1b' + char;
        this.buffer = this.buffer.slice(raw.length); this.emit({ type: 'key', raw, name: 'alt-' + char }); continue;
      }
      this.timer = setTimeout(() => { const raw = this.buffer; this.buffer = ''; this.emit({ type: 'key', raw, name: raw === '\x1b' ? 'escape' : raw }); }, 45);
      return;
    }
  }
  dispose() { clearTimeout(this.timer); this.buffer = ''; this.paste = null; }
}
const KEYS = {
  '\x1b[A': 'up', '\x1b[B': 'down', '\x1b[C': 'right', '\x1b[D': 'left',
  '\x1bOA': 'up', '\x1bOB': 'down', '\x1bOC': 'right', '\x1bOD': 'left', '\x1b[Z': 'shift-tab',
  '\x1bOP': 'f1', '\x1bOQ': 'f2', '\x1bOR': 'f3', '\x1bOS': 'f4',
  '\x1b[11~': 'f1', '\x1b[12~': 'f2', '\x1b[13~': 'f3', '\x1b[14~': 'f4',
  '\x1b[17~': 'f6', '\x1b[18~': 'f7', '\x1b[19~': 'f8', '\x1b[20~': 'f9', '\x1b[21~': 'f10',
  '\x1b[5~': 'pageup', '\x1b[6~': 'pagedown', '\x1b[5;2~': 'shift-pageup', '\x1b[6;2~': 'shift-pagedown'
};
module.exports = { InputDecoder };
