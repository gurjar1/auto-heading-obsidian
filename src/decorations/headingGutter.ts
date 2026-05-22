/**
 * Auto Heading — Interactive Heading Gutter
 *
 * Shows fold chevrons (▶/▼) and level badges (H2, H3) in the editor gutter.
 * Click chevron to fold/unfold sections.
 */

import { gutter, GutterMarker, EditorView } from '@codemirror/view'
import { foldEffect, unfoldEffect, foldedRanges, syntaxTree } from '@codemirror/language'
import type { Extension } from '@codemirror/state'
import { MarkdownView } from 'obsidian'
import type AutoHeadingPlugin from '../main'

class HeadingGutterMarker extends GutterMarker {
  constructor(
    readonly level: number,
    readonly isFolded: boolean,
    readonly showBadge: boolean,
    readonly wordCount: number,
    readonly getPlugin: () => AutoHeadingPlugin | null,
  ) { super() }

  eq(other: HeadingGutterMarker): boolean {
    return this.level === other.level && this.isFolded === other.isFolded &&
      this.showBadge === other.showBadge &&
      this.wordCount === other.wordCount
  }

  toDOM(view: EditorView): Node {
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

function findSectionEnd(view: EditorView, lineNum: number, level: number): number {
  const doc = view.state.doc
  for (let i = lineNum + 1; i <= doc.lines; i++) {
    const m = doc.line(i).text.match(/^\s{0,3}(#{1,6})\s/)
    if (m && m[1].length <= level) {
      const node = syntaxTree(view.state).resolveInner(doc.line(i).from, 1)
      if (node.name.includes("header") || node.name.includes("Heading")) return i - 1
    }
  }
  return doc.lines
}

function countWords(text: string): number {
  const t = text.trim()
  return t.length === 0 ? 0 : t.split(/\s+/).length
}

export function createHeadingGutter(getPlugin: () => AutoHeadingPlugin | null): Extension {
  return gutter({
    class: 'ah-heading-gutter',
    domEventHandlers: {
      mousedown(view, line, event) {
        const target = event.target as HTMLElement
        if (target && target.classList.contains('ah-gutter-badge')) {
          event.preventDefault()
          event.stopPropagation()
          const plugin = getPlugin()
          if (!plugin) return true
          const mdView = plugin.app.workspace.getActiveViewOfType(MarkdownView)
          if (!mdView) return true

          let isFolded = false
          foldedRanges(view.state).between(line.from, line.to + 1, () => { isFolded = true })
          
          const lineNo = view.state.doc.lineAt(line.from).number - 1
          if (isFolded) {
            mdView.editor.unfold(lineNo)
          } else {
            mdView.editor.fold(lineNo)
          }
          return true
        }
        return false
      }
    },
    lineMarker(view, line) {
      const plugin = getPlugin()
      if (!plugin) return null
      if (!plugin.settings.gutterEnabled) return null

      const text = view.state.doc.lineAt(line.from).text
      const m = text.match(/^\s{0,3}(#{1,6})\s/)
      if (!m) return null

      const node = syntaxTree(view.state).resolveInner(line.from, 1)
      if (!node.name.includes("header") && !node.name.includes("Heading")) return null

      const level = m[1].length
      const showBadge = plugin.settings.gutterShowBadge
      const doc = view.state.doc
      const lineObj = view.state.doc.lineAt(line.from)

      let isFolded = false
      foldedRanges(view.state).between(lineObj.from, lineObj.to + 1, () => { isFolded = true })

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

      return new HeadingGutterMarker(level, isFolded, showBadge, wc, getPlugin)
    },
    lineMarkerChange(update) {
      return update.docChanged || update.selectionSet || update.viewportChanged
    },
  })
}
