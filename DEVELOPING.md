# Development Guide

## Setup

```bash
npm install
```

## Development

```bash
npm run dev    # watch mode with source maps
npm run build  # production build (minified, no source maps)
```

## Testing

```bash
node tests/test-core.mjs       # 110 core tests
node tests/layer23-check.mjs   # 61 detection layer tests
```

## Architecture

- `src/main.ts` — Plugin entry point, lifecycle, scope checking
- `src/burnIn/` — Burn-in engine (writes numbers to file) and remover
- `src/core/` — Heading analyzer, manual number detector, numbering tokens
- `src/decorations/` — CodeMirror editor extension and reading-view post-processor
- `src/settings/` — Settings tab, per-note front matter parsing, quick config modal
- `src/commands/` — Command palette commands
- `src/ui/` — Status bar, context menu

## Release

1. Update version in `manifest.json` and `package.json`
2. Run `npm run build`
3. Create a GitHub release with tag matching the version (e.g., `1.0.0`)
4. Attach `main.js`, `manifest.json`, and `styles.css` as release assets
