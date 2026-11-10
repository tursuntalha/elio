# Third-party notices

Elio is released under the [MIT License](LICENSE). It builds on the open-source work below. Thank you to everyone who made it.

## Color palettes

- **[Gogh](https://github.com/Gogh-Co/Gogh)** (MIT): 1,102 of the 1,112 color pairs come from Gogh's theme collection, imported from revision `3277da1a2951`. The original author and source of each theme are kept in [`data/palettes.json`](data/palettes.json) where Gogh provides them. License text: [`data/Gogh-LICENSE-MIT.txt`](data/Gogh-LICENSE-MIT.txt). To refresh the catalog, run `npm run palettes:import`.
- The featured pairs use the published colors of these projects:
  - [Dracula](https://draculatheme.com/spec)
  - [Nord](https://www.nordtheme.com/docs/colors-and-palettes/)
  - [Gruvbox](https://github.com/morhetz/gruvbox) by morhetz
  - [Tokyo Night](https://github.com/folke/tokyonight.nvim) by folke
  - [Catppuccin](https://catppuccin.com/palette/)
  - [Solarized](https://ethanschoonover.com/solarized/) by Ethan Schoonover

## Fonts

Elio bundles 24 monospace fonts through [Fontsource](https://fontsource.org): Cascadia Mono, Cascadia Code, JetBrains Mono, Fira Code, Source Code Pro, IBM Plex Mono, Roboto Mono, Inconsolata, Ubuntu Mono, Space Mono, Cousine, DM Mono, Red Hat Mono, Overpass Mono, PT Mono, Noto Sans Mono, Anonymous Pro, Cutive Mono, Oxygen Mono, Spline Sans Mono, Sometype Mono, Azeret Mono, Martian Mono, Victor Mono. Each font keeps its own license: the SIL Open Font License 1.1 for most, and the Ubuntu Font Licence 1.0 for Ubuntu Mono. The license text for every font is in [`assets/fonts`](assets/fonts), next to the font files.

## Agent icons

The Claude Code, Codex, and OpenCode icons come from [Lobe Icons](https://github.com/lobehub/lobe-icons) by LobeHub (MIT). License text: [`assets/brands/LICENSE.txt`](assets/brands/LICENSE.txt).

Claude Code is a product of Anthropic and Codex is a product of OpenAI. OpenCode is an independent open-source project ([opencode.ai](https://opencode.ai)). Their names and logos belong to their respective owners. **Elio is an independent project. It is not affiliated with, sponsored by, or endorsed by any of them.**

## Runtime libraries

All MIT licensed. Their license files ship inside each package folder under `node_modules`, including in the portable download.

- [Electron](https://github.com/electron/electron): desktop window (the portable download also includes `LICENSES.chromium.html`)
- [xterm.js](https://github.com/xtermjs/xterm.js): terminal rendering (`@xterm/xterm`, `@xterm/headless`, `@xterm/addon-fit`)
- [node-pty](https://github.com/microsoft/node-pty): pseudo-terminal sessions
- [jsonc-parser](https://github.com/microsoft/node-jsonc-parser): reads VS Code keybinding files

Build and test only: [Playwright](https://github.com/microsoft/playwright) (`playwright-core`).
