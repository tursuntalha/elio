const fs = require('node:fs');
const path = require('node:path');

function favoriteColors(value) {
  if (!/^#[a-f0-9]{6}$/i.test(value?.background) || !/^#[a-f0-9]{6}$/i.test(value?.foreground)) throw new Error('Favori için geçerli iki renk seçilmeli.');
  return { background: value.background.toLowerCase(), foreground: value.foreground.toLowerCase() };
}
function createFavorites(directory) {
  const filename = path.join(directory, 'favorites.json');
  function read() {
    let value;
    try { value = JSON.parse(fs.readFileSync(filename, 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') return []; throw new Error('Favoriler okunamadı. Kayıt dosyası değiştirilmedi.'); }
    if (value?.schemaVersion !== 1 || !Array.isArray(value.favorites)) throw new Error('Favori dosyası geçersiz.');
    const ids = new Set();
    return value.favorites.map(item => {
      const colors = favoriteColors(item), id = 'fav-' + colors.background.slice(1) + '-' + colors.foreground.slice(1);
      if (ids.has(id) || typeof item.name !== 'string' || !item.name.trim() || item.name.length > 80 || /[\x00-\x1f\x7f-\x9f]/.test(item.name)) throw new Error('Favori kaydı geçersiz.');
      ids.add(id); return { id, name: item.name, ...colors };
    });
  }
  return { read, toggle(value, name) {
    const colors = favoriteColors(value), favorites = read();
    const index = favorites.findIndex(item => item.background === colors.background && item.foreground === colors.foreground);
    const added = index === -1;
    if (added) {
      const number = favorites.reduce((max, item) => Math.max(max, Number(/^Özel tema (\d+)$/.exec(item.name)?.[1] || 0)), 0) + 1;
      const label = typeof name === 'string' ? name.replace(/[\x00-\x1f\x7f-\x9f]/g, '').trim().slice(0, 80) : '';
      favorites.push({ id: 'fav-' + colors.background.slice(1) + '-' + colors.foreground.slice(1), name: label || 'Özel tema ' + number, ...colors });
    } else favorites.splice(index, 1);
    fs.mkdirSync(directory, { recursive: true });
    const temporary = filename + '.' + process.pid + '.tmp';
    try { fs.writeFileSync(temporary, JSON.stringify({ schemaVersion: 1, favorites }, null, 2) + '\n', { mode: 0o600 }); fs.renameSync(temporary, filename); }
    finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
    return { favorites, added };
  } };
}
module.exports = { createFavorites };
