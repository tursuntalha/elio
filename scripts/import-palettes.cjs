const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { validateCatalog } = require('../media/palettes.js');
const root = path.join(__dirname, '..');
const repository = 'https://github.com/Gogh-Co/Gogh';

// Upstream author fields may carry e-mail addresses; only the name is kept.
function publicAuthor(value) {
  return String(value || '').replace(/\s*[<(\[]?[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}[>)\]]?/g, '').replace(/\s{2,}/g, ' ').replace(/[\s,;]+$/, '').trim().slice(0, 200);
}

async function download(url, json = false) {
  const response = await fetch(url, { headers: { 'User-Agent': 'agent-terminal-palette-importer' }, signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`İndirme başarısız: ${response.status} ${url}`);
  return json ? response.json() : response.text();
}
async function main() {
  const filename = path.join(root, 'data', 'palettes.json');
  const previous = JSON.parse(fs.readFileSync(filename, 'utf8'));
  const revision = previous.upstream?.revision && !process.argv.includes('--update') ? previous.upstream.revision
    : (await download('https://api.github.com/repos/Gogh-Co/Gogh/commits/master', true)).sha;
  if (!/^[a-f0-9]{40}$/.test(revision)) throw new Error('Geçersiz kaynak sürümü.');
  const raw = `https://raw.githubusercontent.com/Gogh-Co/Gogh/${revision}/`;
  const [themes, license] = await Promise.all([download(raw + 'data/themes.json', true), download(raw + 'LICENSE-MIT')]);
  const palettes = previous.palettes.filter(pair => !pair.id.startsWith('gogh-'));
  const pairs = new Set(palettes.map(pair => (pair.background + pair.foreground).toLowerCase()));
  const ids = new Set(palettes.map(pair => pair.id));
  for (const theme of themes) {
    const background = theme.background?.toLowerCase(), foreground = theme.foreground?.toLowerCase();
    if (!/^#[a-f0-9]{6}$/.test(background) || !/^#[a-f0-9]{6}$/.test(foreground) || typeof theme.name !== 'string' || !theme.name.trim()) continue;
    const key = background + foreground;
    if (pairs.has(key)) continue;
    const slug = theme.name.normalize('NFKD').replace(/\p{Mark}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'palette';
    let id = 'gogh-' + slug;
    if (ids.has(id)) id += '-' + createHash('sha256').update(key + theme.name).digest('hex').slice(0, 8);
    palettes.push({ id, name: theme.name.slice(0, 80), background, foreground,
      source: `${repository}/blob/${revision}/data/themes.json`, author: publicAuthor(theme.author), collection: 'Gogh' });
    ids.add(id); pairs.add(key);
  }
  const value = { schemaVersion: 1, featured: previous.featured, upstream: { repository, revision, json: raw + 'data/themes.json', license: 'MIT', importedAt: new Date().toISOString() }, palettes };
  validateCatalog(value);
  if (palettes.length <= 100) throw new Error('Katalog 100’den fazla benzersiz çift içermeli.');
  fs.writeFileSync(path.join(root, 'data', 'Gogh-LICENSE-MIT.txt'), license);
  fs.writeFileSync(filename, JSON.stringify(value, null, 2) + '\n');
  console.log(`${palettes.length} benzersiz renk çifti kaydedildi. Kaynak: Gogh ${revision.slice(0, 8)}`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
