const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const gradient = (gid, x2, y2) => `<defs><linearGradient id="${gid}" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${x2}" y2="${y2}"><stop stop-color="#d7efe3"/><stop offset="1" stop-color="#8fbba8"/></linearGradient></defs>`;
const strokes = 'stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"';
// Elio wordmark: capital letters E L I O (the ᴱᴸᴵᴼ style) drawn from strokes, so it does not depend on an installed font. No background tile.
const wordmark = `<g fill="none" stroke="url(#elio-wordmark)" ${strokes}><path d="M24 8H9v30h15M9 23h12"/><path d="M38 8v30h15"/><path d="M66 8v30"/><circle cx="95" cy="23" r="15"/></g>`;
const logoSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 118 46"><title>ELIO</title>${gradient('elio-wordmark', 118, 46)}${wordmark}</svg>`;
// Use broad facets and a short silhouette so Obelisk reads at taskbar sizes.
const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
  <title>Elio · Obelisk</title>
  <defs>
    <linearGradient id="stone" x2=".75" y2="1"><stop stop-color="#a1bcb0"/><stop offset="1" stop-color="#68867a"/></linearGradient>
    <linearGradient id="leaf" x2=".8" y2="1"><stop stop-color="#d5e9ad"/><stop offset="1" stop-color="#9db77c"/></linearGradient>
  </defs>
  <g transform="translate(-31 -27) scale(1.3)">
    <g transform="translate(0 -33.92) scale(1 1.16)">
      <path d="M42 93 90 64l67 1 47 30 9 60-37 51-76 6-51-27-17-47Z" fill="url(#stone)" stroke="#b7cdc1" stroke-width="5" stroke-linejoin="round"/>
      <path d="M42 93 90 64l67 1 47 30-78 17Z" fill="#b4c9bd"/>
      <path d="m204 95 9 60-37 51-18-38 2-41Z" fill="#577268"/>
      <path d="m32 138 17 47 51 27 76-6-18-38-49-8-38 3Z" fill="#789287"/>
      <path d="m43 93 83 19-12 17 7 13m5-30 77-17m-45 73 17 36" fill="none" stroke="#516d62" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
      <g fill="#e3ffea"><rect x="60" y="128" width="40" height="15" rx="7.5"/><rect x="134" y="128" width="40" height="15" rx="7.5"/></g>
      <path d="M108 171h27" stroke="#425c51" stroke-width="7" stroke-linecap="round"/>
    </g>
    <path d="M155 60c-1-17 14-34 40-36 1 17-15 33-40 36Z" fill="url(#leaf)" stroke="#536b48" stroke-width="4"/>
    <path d="m156 60 21-20" stroke="#789960" stroke-width="4" stroke-linecap="round"/>
  </g>
</svg>`;
fs.writeFileSync(path.join(root, 'assets', 'elio-logo.svg'), logoSvg + '\n');
fs.writeFileSync(path.join(root, 'assets', 'app-icon.svg'), iconSvg + '\n');
console.log('Application icon: Obelisk head, drawn for small sizes.');
