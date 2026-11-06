const HUES = ['Kırmızı', 'Turuncu', 'Sarı', 'Limon', 'Yeşil', 'Nane', 'Turkuaz', 'Mavi', 'Lacivert', 'Mor', 'Fuşya', 'Pembe'];
const LIGHTNESS = [6, 12, 20, 28, 36, 44, 52, 60, 68, 78, 88, 96];
const SATURATIONS = [{ name: 'Canlı', value: 95 }, { name: 'Dengeli', value: 70 }, { name: 'Pastel', value: 35 }];
const COLUMNS = HUES.length;

function hslToHex(hue, saturation, lightness) {
  const s = saturation / 100, l = lightness / 100, a = s * Math.min(l, 1 - l);
  const channel = n => {
    const k = (n + hue / 30) % 12;
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))).toString(16).padStart(2, '0');
  };
  return '#' + channel(0) + channel(8) + channel(4);
}
function colorGrid(saturation = 1) {
  const mode = SATURATIONS[saturation] || SATURATIONS[1];
  const colors = [];
  for (let index = 0; index < COLUMNS; index++) {
    const channel = Math.round(index * 255 / (COLUMNS - 1)).toString(16).padStart(2, '0');
    colors.push({ hex: '#' + channel.repeat(3), name: 'Gri', tone: Math.round(index * 100 / (COLUMNS - 1)) + '%', gray: true });
  }
  return colors.concat(LIGHTNESS.flatMap(lightness => HUES.map((name, index) => ({ hex: hslToHex(index * 30, mode.value, lightness), name, tone: lightness + '%', gray: false }))));
}
function nearestColor(colors, hex) {
  const channels = value => [1, 3, 5].map(index => parseInt(value.slice(index, index + 2), 16));
  const current = channels(hex);
  let best = 0, distance = Infinity;
  colors.forEach((color, index) => {
    const next = channels(color.hex).reduce((sum, channel, offset) => sum + (channel - current[offset]) ** 2, 0);
    if (next < distance) { distance = next; best = index; }
  });
  return best;
}
module.exports = { COLUMNS, SATURATIONS, colorGrid, nearestColor };
