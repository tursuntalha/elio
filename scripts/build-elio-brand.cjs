const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'design', 'brand-extra.js'), 'utf8');
const { extraMascots } = vm.runInNewContext(source + '\n;({extraMascots});', { names: [], concepts: [] });
const a = '#a4c4bb', d = '#50685f', id = 'elio-obelisk';
const definitions = `<defs><linearGradient id="${id}-g" x1="0" y1="0" x2=".8" y2="1"><stop stop-color="${a}"/><stop offset="1" stop-color="${d}"/></linearGradient><linearGradient id="${id}-m" x1="0" y1="0" x2=".7" y2="1"><stop stop-color="#e8f3ff"/><stop offset=".48" stop-color="#a6bcd2"/><stop offset="1" stop-color="${d}"/></linearGradient><linearGradient id="${id}-p" x2=".7" y2="1"><stop stop-color="${d}"/><stop offset="1" stop-color="#0a1421"/></linearGradient></defs>`;
let mascot = extraMascots({ a, d, G: `url(#${id}-g)`, M: `url(#${id}-m)`, P: `url(#${id}-p)`, R: '', eye: () => '' })[39];
mascot = mascot.replace('class="breathe"', 'class="mascot-body"').replace('class="blink"', 'class="mascot-eyes"');
mascot = mascot.replace('<path d="m92 172-5 29h25l4-28m15 0 4 28h25l-6-29" fill="'+d+'" stroke="#879c8c" stroke-width="2"/>', `<g class="mascot-leg mascot-leg-left"><path d="m92 172-5 29h25l4-28" fill="${d}" stroke="#879c8c" stroke-width="2"/></g><g class="mascot-leg mascot-leg-right"><path d="m131 173 4 28h25l-6-29" fill="${d}" stroke="#879c8c" stroke-width="2"/></g>`);
mascot = mascot.replace('<path d="m83 129-16 7-5 32 21 8m74-47 16 7 5 32-21 8"', '<path class="mascot-arms" d="m83 129-16 7-5 32 21 8m74-47 16 7 5 32-21 8"');
const mascotSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240"><title>Elio — Obelisk maskotu M39</title>${definitions}<ellipse class="mascot-shadow" cx="120" cy="211" rx="47" ry="6" fill="#0005"/>${mascot}</svg>`;
const gradient = (gid, x2, y2) => `<defs><linearGradient id="${gid}" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${x2}" y2="${y2}"><stop stop-color="#d7efe3"/><stop offset="1" stop-color="#8fbba8"/></linearGradient></defs>`;
const strokes = 'stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"';
// Elio wordmark: capital letters E L I O (the ᴱᴸᴵᴼ style) drawn from strokes, so it does not depend on an installed font. No background tile.
const wordmark = `<g fill="none" stroke="url(#elio-wordmark)" ${strokes}><path d="M24 8H9v30h15M9 23h12"/><path d="M38 8v30h15"/><path d="M66 8v30"/><circle cx="95" cy="23" r="15"/></g>`;
const logoSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 118 46"><title>ELIO</title>${gradient('elio-wordmark', 118, 46)}${wordmark}</svg>`;
// Application icon: the Obelisk mascot itself, transparent (no tile, no shadow), filling the square canvas.
const iconMark = `<svg x="23" y="3" width="210" height="250" viewBox="35 24 170 202">${definitions}${mascot}</svg>`;
fs.writeFileSync(path.join(root, 'assets', 'elio-logo.svg'), logoSvg + '\n');
fs.writeFileSync(path.join(root, 'assets', 'elio-mascot.svg'), mascotSvg + '\n');
fs.writeFileSync(path.join(root, 'assets', 'app-icon.svg'), `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><title>Elio</title>${iconMark}</svg>\n`);
fs.writeFileSync(path.join(root, 'assets', 'app-icon.svg'), `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><title>Elio</title>${iconMark}</svg>\n`);
console.log('In-app logo: "Elio" wordmark. Application icon: the M39 Obelisk mascot on a transparent background.');
