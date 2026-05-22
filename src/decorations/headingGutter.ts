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
    readonly showChevron: boolean,
    readonly showBadge: boolean,
    readonly wordCount: number,
    readonly getPlugin: () => AutoHeadingPlugin | null,
  ) { super() }

  eq(other: HeadingGutterMarker): boolean {
    return this.level === other.level && this.isFolded === other.isFolded &&
      this.showChevron === other.showChevron && this.showBadge === other.showBadge &&
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
      
      // Merge fold interaction into the badge
      badge.addEventListener('mousedown', (e) => {
        e.preventDefault()
        e.stopPropagation()
        const plugin = this.getPlugin()
        if (!plugin) return
        const mdView = plugin.app.workspace.getActiveViewOfType(MarkdownView)
        if (!mdView) return

        const pos = view.posAtDOM(container)
        const line = view.state.doc.lineAt(pos)
        const lineNo = line.number - 1

        if (this.isFolded) {
          mdView.editor.unfold(lineNo)
        } else {
          mdView.editor.fold(lineNo)
        }
      })
      
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
    lineMarker(view, line) {
      const plugin = getPlugin()
      if (!plugin || !plugin.settings.enabled) return null
      const fileName = plugin.app.workspace.getActiveFile()?.path
      if (fileName && !plugin.getPerNoteEnabled(fileName)) return null
      if (!plugin.settings.gutterEnabled) return null

      const text = view.state.doc.lineAt(line.from).text
      const m = text.match(/^\s{0,3}(#{1,6})\s/)
      if (!m) return null

      const node = syntaxTree(view.state).resolveInner(line.from, 1)
      if (!node.name.includes("header") && !node.name.includes("Heading")) return null

      const level = m[1].length
      const showBadge = plugin.settings.gutterShowBadge
      const showChevron = plugin.settings.gutterShowChevron
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

      return new HeadingGutterMarker(level, isFolded, showChevron, showBadge, wc, getPlugin)
    },
    lineMarkerChange(update) {
      return update.docChanged || update.selectionSet || update.viewportChanged
    },
  })
}
