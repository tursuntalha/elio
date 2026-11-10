const bundled = require('../data/fonts.json').map(font => ({ ...font, family: 'AT ' + font.name, bundled: true }));
const system = [
  { id: 'consolas', name: 'Consolas', family: 'Consolas', bundled: false },
  { id: 'lucida', name: 'Lucida Console', family: 'Lucida Console', bundled: false },
  { id: 'courier', name: 'Courier New', family: 'Courier New', bundled: false },
  { id: 'system', name: 'System', family: 'monospace', bundled: false }
];
const FONT_OPTIONS = Object.freeze([...bundled, ...system]);
const FONTS = Object.freeze(Object.fromEntries(FONT_OPTIONS.map(font => [font.id, font.id === 'system' ? 'monospace' : JSON.stringify(font.family) + ', "AT Noto Sans Mono", monospace'])));
module.exports = { FONT_OPTIONS, FONTS };
