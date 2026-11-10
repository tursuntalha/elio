# Elio

Elio is a customizable Windows terminal workspace for Claude Code, Codex, and OpenCode. Run multiple sessions in tabs, name them, and save your favorite themes.

![Elio home screen](assets/screenshot.png)

## Installation

You need Windows 10 or 11, Git, and Node.js 22.12 or later. The agent you want to use must already be available in your terminal.

```powershell
git clone https://github.com/tursuntalha/elio.git
cd elio
npm ci
npm link
```

## Usage

- `elio` opens in the current terminal and folder.
- `elio --window` opens a desktop window with your recent projects.
- `elio --setup-shortcut` creates desktop and Start menu shortcuts.

Session appearance changes apply immediately. Global appearance applies to new sessions. In the desktop window, you can also choose a font.

[MIT](LICENSE) · [Palettes](data/Gogh-LICENSE-MIT.txt) · [Fonts](assets/fonts) · [Agent icons](assets/brands/LICENSE.txt)
