/**
 * Auto Heading — Interactive Heading Gutter
 *
 * Shows fold chevrons (▶/▼) and level badges (H2, H3) in the editor gutter.
 * Click chevron to fold/unfold sections.
 */

import { gutter, GutterMarker, EditorView } from '@codemirror/view'
import { foldEffect, unfoldEffect, foldedRanges, syntaxTree } from '@codemirror/language'
import type { Extension } from '@codemirror/state'
import type { AutoHeadingSettings } from '../settings/settingsTypes'

interface GutterSettingsProvider {
  enabled: boolean
  noteEnabled: boolean
  settings: AutoHeadingSettings
}

class HeadingGutterMarker extends GutterMarker {
  constructor(
    readonly level: number,
    readonly isFolded: boolean,
    readonly showChevron: boolean,
    readonly showBadge: boolean,
    readonly wordCount: number,
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

    if (this.showChevron) {
      const chevron = activeDocument.createElement('span')
      chevron.className = 'ah-gutter-chevron'
      chevron.textContent = this.isFolded ? '▶' : '▼'
      chevron.addEventListener('mousedown', (e) => {
        e.preventDefault()
        e.stopPropagation()
        const pos = view.posAtDOM(container)
        const line = view.state.doc.lineAt(pos)
        const endLine = findSectionEnd(view, line.number, this.level)
        const foldFrom = line.to
        const foldTo = view.state.doc.line(endLine).to

        if (foldFrom >= foldTo) return

        if (this.isFolded) {
          const folded = foldedRanges(view.state)
          let found = false
          folded.between(line.from, line.to + 1, (from, to) => {
            if (!found) {
              view.dispatch({ effects: unfoldEffect.of({ from, to }) })
              found = true
            }
          })
        } else {
          view.dispatch({ effects: foldEffect.of({ from: foldFrom, to: foldTo }) })
        }
      })
      container.appendChild(chevron)
    }

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

export function createHeadingGutter(getSettings: () => GutterSettingsProvider): Extension {
  return gutter({
    class: 'ah-heading-gutter',
    lineMarker(view, line) {
      const s = getSettings()
      if (!s.enabled || !s.noteEnabled) return null
      if (!s.settings.gutterEnabled) return null

      const text = view.state.doc.lineAt(line.from).text
      const m = text.match(/^\s{0,3}(#{1,6})\s/)
      if (!m) return null

      const node = syntaxTree(view.state).resolveInner(line.from, 1)
      if (!node.name.includes("header") && !node.name.includes("Heading")) return null

      const level = m[1].length
      const showBadge = s.settings.gutterShowBadge
      const showChevron = s.settings.gutterShowChevron
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
      const wc = s.settings.gutterShowWordCount ? countWords(sectionText) : 0

      return new HeadingGutterMarker(level, isFolded, showChevron, showBadge, wc)
    },
    lineMarkerChange(update) {
      return update.docChanged || update.selectionSet || update.viewportChanged
    },
  })
}
