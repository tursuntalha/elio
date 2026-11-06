const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

function renderView(resource, cspSource) {
  const brand = prefix => fs.readFileSync(path.join(__dirname, '..', 'assets', 'elio-logo.svg'), 'utf8').replaceAll('elio-wordmark', prefix).replace('<svg ', '<svg class="brand-logo" role="img" aria-label="Elio" ');
  const values = {
    brandLogoProject: brand('elio-project-logo'), brandLogoSidebar: brand('elio-sidebar-logo'),
    mascot: fs.readFileSync(path.join(__dirname, '..', 'assets', 'elio-mascot.svg'), 'utf8').replace('viewBox="0 0 240 240"', 'viewBox="35 24 170 202"').replace('<svg ', '<svg class="terminal-mascot" aria-hidden="true" '),
    nonce: crypto.randomBytes(24).toString('hex'), csp: cspSource,
    xtermCss: resource('node_modules', '@xterm', 'xterm', 'css', 'xterm.css'), css: resource('media', 'style.css'),
    fontsCss: resource('assets', 'fonts', 'fonts.css'),
    xterm: resource('node_modules', '@xterm', 'xterm', 'lib', 'xterm.js'),
    fit: resource('node_modules', '@xterm', 'addon-fit', 'lib', 'addon-fit.js'), palettes: resource('media', 'palettes.js'), main: resource('media', 'main.js')
  };
  return fs.readFileSync(path.join(__dirname, '..', 'media', 'view.html'), 'utf8')
    .replace(/\{\{(\w+)\}\}/g, (_, name) => String(values[name]));
}
module.exports = { renderView };
