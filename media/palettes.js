/* Shared by the local renderer and the command-line menu. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PaletteCatalog = factory();
})(globalThis, function () {
  function validateCatalog(value) {
    if (value?.schemaVersion !== 1 || !Array.isArray(value.palettes) || !Array.isArray(value.featured)) throw new Error('Invalid palette catalog.');
    const ids = new Set();
    const palettes = value.palettes.map(item => {
      if (!item || typeof item.id !== 'string' || !/^[a-z0-9-]+$/.test(item.id) || ids.has(item.id)
        || typeof item.name !== 'string' || !item.name.trim() || item.name.length > 80
        || !/^#[0-9a-f]{6}$/i.test(item.background) || !/^#[0-9a-f]{6}$/i.test(item.foreground)) throw new Error('Invalid or duplicate palette.');
      ids.add(item.id);
      return { id: item.id, name: item.name, background: item.background.toLowerCase(), foreground: item.foreground.toLowerCase(), source: typeof item.source === 'string' ? item.source : '', collection: typeof item.collection === 'string' ? item.collection : '', author: typeof item.author === 'string' ? item.author : '' };
    });
    if (value.featured.some(id => !ids.has(id)) || new Set(value.featured).size !== value.featured.length) throw new Error('Invalid preset palette list.');
    return { schemaVersion: 1, palettes, featured: [...value.featured] };
  }
  function matching(catalog, value) {
    return catalog.palettes.find(item => item.background === value.background.toLowerCase() && item.foreground === value.foreground.toLowerCase());
  }
  function randomPair(catalog, current, random = Math.random) {
    const choices = catalog.palettes.filter(item => item.background !== current.background.toLowerCase() || item.foreground !== current.foreground.toLowerCase());
    const readable = choices.filter(pair => contrastRatio(pair) >= 4.5);
    const candidates = readable.length ? readable : choices;
    const distance = (a, b) => Math.hypot(...[1, 3, 5].map(index => parseInt(a.slice(index, index + 2), 16) - parseInt(b.slice(index, index + 2), 16)));
    const distinct = candidates.filter(pair => distance(pair.background, current.background) >= 70 || distance(pair.foreground, current.foreground) >= 110);
    const pool = distinct.length ? distinct : candidates.length ? candidates : catalog.palettes;
    return pool[Math.floor(random() * pool.length)];
  }
  function luminance(hex) {
    const channels = [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16) / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
    return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
  }
  function contrastRatio(pair) { const a = luminance(pair.background), b = luminance(pair.foreground); return (Math.max(a, b) + .05) / (Math.min(a, b) + .05); }
  function paletteMode(pair) { return luminance(pair.background) < .4 ? 'dark' : 'light'; }
  function filterPalettes(catalog, query = '', mode = 'all') {
    const normalize = text => text.normalize('NFKD').replace(/\p{Mark}/gu, '').toLowerCase();
    const terms = normalize(query).trim().split(/\s+/).filter(Boolean);
    return catalog.palettes.filter(pair => (mode === 'all' || paletteMode(pair) === mode) && terms.every(term => normalize(pair.name + ' ' + (pair.collection || '')).includes(term)));
  }
  return { validateCatalog, matching, randomPair, paletteMode, filterPalettes, contrastRatio };
});
