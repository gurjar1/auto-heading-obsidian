# Auto Heading

Automatic heading numbering for Obsidian. Numbers your headings in real time and writes them into the file so they appear in the table of contents, PDF exports, and Obsidian Publish.

## Features

- Auto-number headings in real time and write numbers directly into your Markdown files
- Numbers appear in the sidebar TOC, PDF exports, and Obsidian Publish
- Support for Arabic digits, uppercase and lowercase letters, and Roman numerals at every heading level
- Mix numbering styles freely across levels (e.g., `1.A.a.I.i.1`)
- Visual heading indentation that creates a tree-like outline in your editor
- Visual-only mode that overlays numbers without modifying files
- Per-note control via front matter or folder/file selection
- Smart detection of existing manually-typed numbers
- Full undo support with Ctrl+Z

## Getting started

1. Install the plugin (see below).
2. Open the plugin settings (Settings > Auto Heading).
3. Under "Which Notes to Number", enable at least one scope option. The simplest is "Notes with front matter", which requires you to add `auto-heading: auto` to a note's front matter before it gets numbered.
4. Open a note, add the front matter key, and your headings will be numbered within a couple of seconds.

If you want every note in your vault numbered automatically, enable "All notes in vault" instead.

## Installation

### From Obsidian Community Plugins (when available)

1. Open Obsidian Settings > Community Plugins > Browse.
2. Search for "Auto Heading".
3. Click Install, then Enable.

### Manual installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/gurjar1/auto-heading-obsidian/releases/latest).
2. In your vault, navigate to `.obsidian/plugins/` and create a folder called `auto-heading`.
3. Copy the three downloaded files into that folder.
4. Open Obsidian, go to Settings, then Community Plugins, and enable "Auto Heading".

To update later, repeat the same steps with the newer release files.

## Modes

**Auto-number (burn-in)** is the default. Numbers are written into the file text. They appear in the TOC, in PDF exports, and on Obsidian Publish. The plugin updates them after each edit with a short delay. You can undo any change with Ctrl+Z.

**Visual only (decoration)** overlays numbers in the editor without modifying your files. Useful if you want numbering while writing but do not want it in the final output.

**Off** disables the plugin entirely.

## Numbering styles

Each heading level can use a different style:

| Style | Example output |
|-------|---------------|
| Arabic | 1, 2, 3 |
| Upper letter | A, B, C |
| Lower letter | a, b, c |
| Upper Roman | I, II, III |
| Lower Roman | i, ii, iii |

With six heading levels, you can create schemes like `1.A.a.I.i.1` or keep everything as `1.1.1`.

## Visual heading indentation

Heading indentation shifts heading lines to the right based on their depth, creating a visual tree structure that makes document hierarchy immediately obvious. This is a purely visual effect and does not modify your files.

To enable it, open plugin settings, scroll to the Appearance section, and turn on "Visual heading indentation". You can also adjust the indent size (pixels per level) and optionally enable subtle vertical guide lines that connect related heading levels.

The indentation works in both Live Preview and Reading View. A small preview in the settings panel shows how the current indent size will look.

You can control indentation on individual notes through front matter:

```yaml
---
auto-heading: auto, indent
---
```

Or with a custom indent size:

```yaml
---
auto-heading: auto, indent, indent-size 24, indent-guides
---
```

To disable indentation for a specific note when it is enabled globally, use `no-indent`:

```yaml
---
auto-heading: auto, no-indent
---
```

## Per-note configuration

Add an `auto-heading` key to a note's front matter to control its behavior:

```yaml
---
auto-heading: auto
---
```

You can also pass options inline:

```yaml
---
auto-heading: auto, skip-h1, first-level 2, max 4
---
```

Available options: `auto`, `off`, `skip-h1`, `no-skip-h1`, `first-level N`, `max N`, `start-at N`, `style 1.A.a`, `sep "."`, `format "{n}"`, `skip-marker text`, `indent`, `no-indent`, `indent-size N`, `indent-guides`, `no-indent-guides`.

To exclude a single heading from numbering, add `<!-- skip -->` after it or right-click the heading and choose "Skip numbering".

## Scope

The plugin decides which notes to number using three toggles that work with OR logic. A note is numbered if any enabled condition matches:

- **All notes in vault** numbers everything.
- **Notes with front matter** numbers notes that have `auto-heading: auto` in their front matter.
- **Selected folders / notes** numbers notes in specific folders or individual files you pick from a list.

You can enable more than one toggle at the same time.

## Commands

All commands operate on the current note. Access them through the command palette (Ctrl+P) or assign hotkeys in settings.

| Command | What it does |
|---------|-------------|
| Toggle heading numbers | Turns numbering on or off for the current note |
| Enable numbering for this note | Explicitly enables numbering, overriding scope rules |
| Disable numbering for this note | Stops numbering; existing numbers stay but stop updating |
| Burn in heading numbers | Writes numbers into the file immediately |
| Remove burned-in heading numbers | Strips all numbers and disables auto-numbering |
| Force renumber all headings | Recalculates all numbers from scratch |
| Toggle skip for heading at cursor | Adds or removes a skip marker on the heading at your cursor |
| Copy headings as numbered outline | Copies a numbered outline to your clipboard |
| Save settings to front matter | Writes current settings into the note's front matter |
| Quick configure numbering | Opens a dialog to change numbering options for the current note |

## How it detects existing numbers

If your headings already have manually typed numbers like "1. Introduction" or "A) Methods", the plugin detects them and replaces them with computed values. This detection uses confidence levels to avoid stripping content that looks like a number but is actually part of the heading, such as "6 ways to identify a problem".

Numbers written by the plugin are tagged with an invisible Unicode marker (U+2060, the Word Joiner character) so they can be identified with certainty on subsequent edits. This marker is invisible in all renderers and has no effect on text layout, exports, or copy-paste.

## Development

```bash
npm install
npm run dev    # watch mode
npm run build  # production build
```

Tests:

```bash
node tests/test-core.mjs
node tests/layer23-check.mjs
```

## License

MIT
