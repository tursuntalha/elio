# Palette catalog attribution

Additional background/foreground pairs in `data/palettes.json` are derived from
[Gogh](https://github.com/Gogh-Co/Gogh), using its MIT license option.
The complete license notice is included in [data/Gogh-LICENSE-MIT.txt](data/Gogh-LICENSE-MIT.txt).
Upstream authors are retained in the imported entries where supplied.

The catalog records the exact upstream commit and raw JSON URL in `upstream`.
Contact e-mail addresses that upstream author fields may contain are dropped on import; names and profile links are kept.
Imported colors are reduced to two-color pairs, converted to lowercase hex and
deduplicated by background/foreground. These pairs are not full ANSI themes.

The original ten curated entries retain their own source links. The featured
list is an editorial selection and is not a measured popularity ranking.

# Bundled typefaces

The 24 font families listed in `data/fonts.json` are distributed through
[Fontsource](https://fontsource.org/) using pinned npm development dependencies.
Original WOFF2 files are copied without modification to `assets/fonts`.
Each family retains its complete original `LICENSE.txt` in its own directory.
`assets/fonts/manifest.json` records the exact package version, license, source
URL and file hashes. All families use SIL OFL 1.1 except Ubuntu Mono, which
uses Ubuntu Font License 1.0. The application's MIT license does not replace
these font licenses. CSS-only `AT` family aliases avoid conflicts with locally
installed versions; font binaries and their internal names are unchanged.

# Product marks

`assets/brands/` and the agent cards use the Claude Code, Codex and OpenCode glyphs from
[Lobe Icons](https://github.com/lobehub/lobe-icons) (`@lobehub/icons-static-svg` 1.102.0, MIT License,
Copyright (c) LobeHub). The paths are copied unmodified into single-color SVG symbols.
Claude and Claude Code are trademarks of Anthropic, Codex and OpenAI of OpenAI, and OpenCode of its
authors. They are used only to identify the corresponding tools; Elio is independent and is not
affiliated with or endorsed by them.
