/**
 * Auto Heading — Heading Gutter
 *
 * Shows level badges (H1, H2, H3) in the editor gutter.
 * Display-only — no fold interaction.
 *
 * The gutter column is only visible when BOTH conditions are met:
 *   1. gutterEnabled is true in plugin settings
 *   2. The current note is in scope (enabled via settings or front matter)
 *
 * When either condition is false, the gutter column collapses to zero width
 * via a CSS class toggle so it doesn't consume horizontal space.
 */

import { gutter, GutterMarker, EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view'
import { syntaxTree } from '@codemirror/language'
import type { Extension } from '@codemirror/state'
import { MarkdownView } from 'obsidian'
import type AutoHeadingPlugin from '../main'

class HeadingGutterMarker extends GutterMarker {
  constructor(
    readonly level: number,
    readonly showBadge: boolean,
    readonly wordCount: number,
  ) { super() }

  eq(other: HeadingGutterMarker): boolean {
    return this.level === other.level &&
      this.showBadge === other.showBadge &&
      this.wordCount === other.wordCount
  }

  toDOM(_view: EditorView): Node {
    const container = activeDocument.createElement('div')
    container.className = 'ah-gutter-marker'
    const readTime = Math.max(1, Math.ceil(this.wordCount / 238))
    container.title = `H${this.level} · ${this.wordCount}w · ~${readTime}min`

    if (this.showBadge) {
      const badge = activeDocument.createElement('span')
      badge.className = `ah-gutter-badge ah-gutter-badge-${this.level}`
      badge.textContent = `H${this.level}`
      container.appendChild(badge)
    }

    return container
  }
}

function countWords(text: string): number {
  const t = text.trim()
  return t.length === 0 ? 0 : t.split(/\s+/).length
}

/** Check if the gutter should be visible for the current note */
function isGutterActive(getPlugin: () => AutoHeadingPlugin | null): boolean {
  const plugin = getPlugin()
  if (!plugin) return false
  if (!plugin.settings.gutterEnabled) return false

  // Check if the current note is in scope
  const view = plugin.app.workspace.getActiveViewOfType(MarkdownView)
  if (!view?.file) return false
  return plugin.isFileInScope(view.file.path)
}

/** Toggle the 'ah-gutter-hidden' class on the gutter element based on settings */
function syncGutterVisibility(view: EditorView, getPlugin: () => AutoHeadingPlugin | null): void {
  const active = isGutterActive(getPlugin)
  const gutterEl = view.dom.querySelector('.ah-heading-gutter')
  if (gutterEl) {
    gutterEl.classList.toggle('ah-gutter-hidden', !active)
  }
}

export function createHeadingGutter(getPlugin: () => AutoHeadingPlugin | null): Extension {
  const gutterExt = gutter({
    class: 'ah-heading-gutter',
    lineMarker(view, line) {
      const plugin = getPlugin()
      if (!plugin) return null
      if (!plugin.settings.gutterEnabled) return null

      // Also check if the current note is in scope
      const mdView = plugin.app.workspace.getActiveViewOfType(MarkdownView)
      if (!mdView?.file) return null
      if (!plugin.isFileInScope(mdView.file.path)) return null

      const text = view.state.doc.lineAt(line.from).text
      const m = text.match(/^\s{0,3}(#{1,6})\s/)
      if (!m) return null

      const node = syntaxTree(view.state).resolveInner(line.from, 1)
      if (!node.name.includes("header") && !node.name.includes("Heading")) return null

      const level = m[1].length
      const showBadge = plugin.settings.gutterShowBadge
      const doc = view.state.doc
      const lineObj = view.state.doc.lineAt(line.from)

      const lineNum = lineObj.number
      let nextHeadingFrom = doc.length
      for (let i = lineNum + 1; i <= doc.lines; i++) {
        if (doc.line(i).text.match(/^\s{0,3}#{1,6}\s/)) {
          const nNode = syntaxTree(view.state).resolveInner(doc.line(i).from, 1)
          if (nNode.name.includes("header") || nNode.name.includes("Heading")) {
            nextHeadingFrom = doc.line(i).from - 1
            break
          }
        }
      }
      const sectionText = nextHeadingFrom > lineObj.to ? doc.sliceString(lineObj.to + 1, nextHeadingFrom) : ''
      const wc = plugin.settings.gutterShowWordCount ? countWords(sectionText) : 0

      return new HeadingGutterMarker(level, showBadge, wc)
    },
    lineMarkerChange(update) {
      return update.docChanged || update.selectionSet || update.viewportChanged
    },
  })

  // ViewPlugin to toggle the gutter column visibility based on settings.
  // Without this, CodeMirror always reserves 28px for the gutter column
  // even when gutterEnabled is false and no markers are shown.
  const visibilityPlugin = ViewPlugin.define(
    (view) => {
      syncGutterVisibility(view, getPlugin)
      return {
        update(update: ViewUpdate) {
          syncGutterVisibility(update.view, getPlugin)
        },
      }
    },
  )

  return [gutterExt, visibilityPlugin]
}
