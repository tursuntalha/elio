const ESC = '\x1b[';
const segments = new Intl.Segmenter('tr', { granularity: 'grapheme' });

function width(character) {
  const code = character.codePointAt(0);
  if (/^[\p{Mark}\u200d\ufe0f]+$/u.test(character)) return 0;
  return /\p{Emoji_Presentation}|\ufe0f/u.test(character) || code >= 0x1100 && (
    code <= 0x115f || code >= 0x2329 && code <= 0x232a || code >= 0x2e80 && code <= 0xa4cf ||
    code >= 0xac00 && code <= 0xd7a3 || code >= 0xf900 && code <= 0xfaff ||
    code >= 0xfe10 && code <= 0xfe6f || code >= 0xff00 && code <= 0xff60 || code >= 0x20000
  ) ? 2 : 1;
}
function characters(text) {
  return [...segments.segment(String(text).replace(/[\x00-\x1f\x7f-\x9f]/g, ' '))].map(item => item.segment);
}
function textWidth(text) { return characters(text).reduce((sum, char) => sum + width(char), 0); }
function clipped(text, limit) {
  let result = '', used = 0;
  for (const char of characters(text)) { const size = width(char); if (used + size > limit) break; result += char; used += size; }
  return result;
}
function rgb(hex) { const value = parseInt(hex.slice(1), 16); return `${value >> 16};${value >> 8 & 255};${value & 255}`; }
function color(value, background = false) {
  if (typeof value === 'number') return `${background ? 48 : 38};5;${value}`;
  return `${background ? 48 : 38};2;${rgb(value)}`;
}
function styleCode(cell) {
  return ESC + [0, color(cell.fg), color(cell.bg, true), ...(cell.bold ? [1] : []), ...(cell.dim ? [2] : []),
    ...(cell.italic ? [3] : []), ...(cell.underline ? [4] : []), ...(cell.inverse ? [7] : []), ...(cell.strike ? [9] : [])].join(';') + 'm';
}

class Frame {
  constructor(cols, rows, theme) {
    this.cols = cols; this.rows = rows; this.theme = theme; this.hits = []; this.cursor = null;
    this.cells = Array.from({ length: rows }, () => Array.from({ length: cols }, () => ({ ch: ' ', fg: theme.fg, bg: theme.bg })));
  }
  text(x, y, text, style = {}, max = this.cols - x) {
    if (y < 0 || y >= this.rows) return;
    let used = 0;
    for (const ch of characters(text)) {
      const size = width(ch);
      if (used + size > max || x + used + size > this.cols) break;
      if (x + used >= 0 && size) {
        this.cells[y][x + used] = { ch, fg: this.theme.fg, bg: this.theme.bg, ...style };
        if (size === 2) this.cells[y][x + used + 1] = { ...this.cells[y][x + used], ch: '' };
      }
      used += size;
    }
  }
  fill(x, y, cols, rows, style) { for (let row = y; row < y + rows; row++) this.text(x, row, ' '.repeat(Math.max(0, cols)), style, cols); }
  box(x, y, cols, rows, style = {}) {
    if (cols < 2 || rows < 2) return;
    this.fill(x, y, cols, rows, style);
    this.text(x, y, '╭' + '─'.repeat(cols - 2) + '╮', style);
    this.text(x, y + rows - 1, '╰' + '─'.repeat(cols - 2) + '╯', style);
    for (let row = y + 1; row < y + rows - 1; row++) { this.text(x, row, '│', style); this.text(x + cols - 1, row, '│', style); }
  }
  button(x, y, label, action, style = {}) {
    this.text(x, y, label, style);
    this.hits.push({ x, y, cols: textWidth(label), rows: 1, action });
  }
  hit(x, y) { return [...this.hits].reverse().find(hit => x >= hit.x && y >= hit.y && x < hit.x + hit.cols && y < hit.y + hit.rows)?.action; }
  blit(source, x, y, sourceY = 0, rows = source.rows - sourceY) {
    for (let row = 0; row < rows && y + row < this.rows; row++) {
      for (let col = 0; col < source.cols && x + col < this.cols; col++) {
        if (y + row >= 0 && x + col >= 0) this.cells[y + row][x + col] = { ...source.cells[sourceY + row][col] };
      }
    }
    for (const hit of source.hits) {
      const top = Math.max(sourceY, hit.y), bottom = Math.min(sourceY + rows, hit.y + hit.rows);
      if (bottom > top) this.hits.push({ ...hit, x: x + hit.x, y: y + top - sourceY, rows: bottom - top, cols: Math.min(hit.cols, source.cols - hit.x) });
    }
    if (source.cursor && source.cursor.y >= sourceY && source.cursor.y < sourceY + rows) this.cursor = { x: x + source.cursor.x, y: y + source.cursor.y - sourceY };
  }
  terminal(terminal, x, y, theme, scrollOffset = 0, size = {}) {
    const buffer = terminal.buffer.active;
    const top = Math.max(0, buffer.baseY - scrollOffset);
    const reusable = buffer.getNullCell();
    const rows = Math.min(terminal.rows, size.rows ?? terminal.rows), cols = Math.min(terminal.cols, size.cols ?? terminal.cols);
    for (let row = 0; row < rows && y + row < this.rows; row++) {
      const line = buffer.getLine(top + row);
      for (let col = 0; col < cols && x + col < this.cols; col++) {
        const cell = line?.getCell(col, reusable);
        if (!cell) continue;
        const fg = cell.isFgDefault() ? theme.foreground : cell.isFgPalette() ? cell.getFgColor() : '#' + cell.getFgColor().toString(16).padStart(6, '0');
        const bg = cell.isBgDefault() ? theme.background : cell.isBgPalette() ? cell.getBgColor() : '#' + cell.getBgColor().toString(16).padStart(6, '0');
        this.cells[y + row][x + col] = { ch: cell.getWidth() === 2 && col + 1 >= cols ? ' ' : cell.getWidth() ? cell.isInvisible() ? ' ' : cell.getChars() || ' ' : '', fg, bg,
          bold: !!cell.isBold(), dim: !!cell.isDim(), italic: !!cell.isItalic(), underline: !!cell.isUnderline(), inverse: !!cell.isInverse(), strike: !!cell.isStrikethrough() };
      }
    }
    if (!scrollOffset && size.cursor !== false && buffer.cursorY < rows) this.cursor = { x: x + Math.min(buffer.cursorX, cols - 1), y: y + buffer.cursorY };
  }
  lines() {
    return this.cells.map(row => {
      let line = '', previous = '';
      for (const cell of row) { if (cell.ch === '') continue; const style = styleCode(cell); if (style !== previous) { line += style; previous = style; } line += cell.ch; }
      return line;
    });
  }
  plain() { return this.cells.map(row => row.map(cell => cell.ch).join('')).join('\n'); }
}

function drawFrame(frame, previous = []) {
  const lines = frame.lines();
  let data = ESC + '?2026h' + ESC + '?25l';
  for (let row = 0; row < lines.length; row++) if (lines[row] !== previous[row]) data += `${ESC}${row + 1};1H${lines[row]}`;
  data += ESC + '0m';
  if (frame.cursor) data += `${ESC}${frame.cursor.y + 1};${frame.cursor.x + 1}H${ESC}?25h`;
  data += ESC + '?2026l';
  return { data, lines };
}
module.exports = { Frame, drawFrame, clipped, textWidth };
