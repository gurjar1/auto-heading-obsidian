/**
 * Auto Heading — Heading Gutter
 *
 * Shows level badges (H1, H2, H3) in the editor gutter.
 * Display-only — no fold interaction.
 *
 * Uses a Compartment to dynamically add/remove the gutter extension.
 * When the gutter is not needed (gutterEnabled=false or note not in scope),
 * the Compartment is reconfigured to [] removing the gutter DOM column entirely.
 * This prevents the empty 28px column that CodeMirror's gutter() always creates.
 */

import { gutter, GutterMarker, EditorView } from '@codemirror/view'
import { syntaxTree } from '@codemirror/language'
import { Compartment } from '@codemirror/state'
import type { Extension } from '@codemirror/state'
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

/** Compartment for dynamically enabling/disabling the gutter column */
export const gutterCompartment = new Compartment()

/** Cached gutter extension (the actual gutter, without compartment wrapper) */
let _gutterExt: Extension | null = null

/** Get the cached gutter extension for compartment reconfiguration */
export function getGutterExtension(): Extension | null {
  return _gutterExt
}

/**
 * Create the heading gutter system.
 *
 * Returns a Compartment initially set to [] (no gutter column).
 * The plugin's refreshDecorations() reconfigures the compartment
 * to include the gutter extension only when gutterEnabled=true
 * AND the note is in scope.
 */
export function createHeadingGutter(getPlugin: () => AutoHeadingPlugin | null): Extension {
  _gutterExt = gutter({
    class: 'ah-heading-gutter',
    lineMarker(view, line) {
      const plugin = getPlugin()
      if (!plugin) return null

      // No gutterEnabled / scope checks here — the gutter extension
      // is only present when the Compartment is configured to include it,
      // which only happens when gutterEnabled=true AND note is in scope.

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

  // Initially empty — no gutter column at all.
  // refreshDecorations() will reconfigure when appropriate.
  return gutterCompartment.of([])
}
