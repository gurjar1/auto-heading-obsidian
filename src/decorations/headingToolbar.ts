/**
 * Auto Heading — Heading Inline Toolbar
 *
 * Floating action buttons (promote/demote/copy/format/skip) on heading lines.
 */

import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate, WidgetType } from '@codemirror/view'
import { RangeSetBuilder } from '@codemirror/state'
import { syntaxTree } from '@codemirror/language'
import type { Extension } from '@codemirror/state'
import type AutoHeadingPlugin from '../main'

const SMALL_WORDS = new Set([
  'a','an','the','and','but','or','nor','for','yet','so',
  'in','on','at','to','of','with','by','as','vs','via',
])

function toTitleCase(text: string): string {
  const words = text.split(/(\s+)/)
  return words.map((w, i) => {
    if (/^\s+$/.test(w)) return w
    if (i === 0 || i === words.length - 1 || !SMALL_WORDS.has(w.toLowerCase())) {
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
    }
    return w.toLowerCase()
  }).join('')
}

class HeadingToolbarWidget extends WidgetType {
  constructor(
    readonly lineFrom: number,
    readonly lineTo: number,
    readonly lineText: string,
    readonly getPlugin: () => AutoHeadingPlugin | null,
  ) { super() }

  eq(other: HeadingToolbarWidget): boolean {
    return this.lineFrom === other.lineFrom && this.lineText === other.lineText
  }

  ignoreEvent(): boolean { return false }

  toDOM(view: EditorView): HTMLElement {
    const div = activeDocument.createElement('div')
    div.className = 'ah-heading-toolbar'

    const match = this.lineText.match(/^\s{0,3}(#{1,6})\s/)
    if (!match) return div

    const hashes = match[1]
    const plugin = this.getPlugin()
    const settings = plugin?.settings
    const showPromote = !settings || (settings as any).toolbarShowPromote !== false
    const showCopy = !settings || (settings as any).toolbarShowCopyLink !== false
    const showFormat = !settings || (settings as any).toolbarShowFormat !== false
    const showSkip = !settings || (settings as any).toolbarShowSkip !== false

    const makeBtn = (text: string, title: string, cls: string, handler: () => void) => {
      const btn = activeDocument.createElement('button')
      btn.className = `ah-toolbar-btn ${cls}`
      btn.textContent = text
      btn.title = title
      btn.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation() })
      btn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); handler() })
      return btn
    }

    if (showPromote) {
      if (hashes.length < 6) {
        div.appendChild(makeBtn('−', 'Demote heading', '', () => {
          const newText = this.lineText.replace(/^(\s{0,3})(#{1,6})/, '$1$2#')
          view.dispatch({ changes: { from: this.lineFrom, to: this.lineTo, insert: newText } })
        }))
      }
      if (hashes.length > 1) {
        div.appendChild(makeBtn('+', 'Promote heading', '', () => {
          const newText = this.lineText.replace(/^(\s{0,3})#{1}(#{1,5})/, '$1$2')
          view.dispatch({ changes: { from: this.lineFrom, to: this.lineTo, insert: newText } })
        }))
      }
    }

    if (showCopy) {
      const copyBtn = makeBtn('🔗', 'Copy link to section', '', () => {
        let headingText = this.lineText.replace(/^\s{0,3}#{1,6}\s+/, '')
          .replace(/\s*<!--\s*(?:skip|no-number|ah-skip|skip-number)\s*-->\s*/g, '')
          .replace(/\s*\^[a-zA-Z0-9_-]+\s*$/, '')
          .replace(/^[\u2060\d.A-Za-z()]+[\s.:\-—)]+\s*/, '')
          .trim()
        const fileName = plugin?.app.workspace.getActiveFile()?.basename || ''
        void navigator.clipboard.writeText(`[[${fileName}#${headingText}]]`)
        copyBtn.textContent = '✓'
        copyBtn.classList.add('ah-toolbar-btn-success')
        setTimeout(() => { copyBtn.textContent = '🔗'; copyBtn.classList.remove('ah-toolbar-btn-success') }, 1500)
      })
      div.appendChild(copyBtn)
    }

    if (showFormat) {
      div.appendChild(makeBtn('Aa', 'Format: Title Case', '', () => {
        const m = this.lineText.match(/^(\s{0,3}#{1,6}\s+)(.+)$/)
        if (m) {
          const formatted = toTitleCase(m[2])
          view.dispatch({ changes: { from: this.lineFrom, to: this.lineTo, insert: m[1] + formatted } })
        }
      }))
    }

    if (showSkip) {
      const hasSkip = /<!--\s*(?:skip|no-number|ah-skip)\s*-->/.test(this.lineText)
      const skipBtn = makeBtn('⊘', hasSkip ? 'Remove skip' : 'Skip this heading',
        hasSkip ? 'ah-toolbar-skip-active' : '', () => {
          let newText: string
          if (hasSkip) {
            newText = this.lineText.replace(/\s*<!--\s*(?:skip|no-number|ah-skip)\s*-->\s*/g, '')
          } else {
            newText = this.lineText + ' <!-- skip -->'
          }
          view.dispatch({ changes: { from: this.lineFrom, to: this.lineTo, insert: newText } })
        })
      div.appendChild(skipBtn)
    }

    return div
  }
}

export function createHeadingToolbar(getPlugin: () => AutoHeadingPlugin | null): Extension {
  return ViewPlugin.define(
    (view) => ({
      decorations: buildToolbarDecos(view, getPlugin),
      update(update: ViewUpdate) {
        if (update.selectionSet || update.docChanged) {
          this.decorations = buildToolbarDecos(update.view, getPlugin)
        }
      },
    }),
    { decorations: (v) => v.decorations }
  )
}

function buildToolbarDecos(view: EditorView, getPlugin: () => AutoHeadingPlugin | null): DecorationSet {
  const plugin = getPlugin()
  if (plugin && (plugin.settings as any).toolbarEnabled === false) return Decoration.none

  const sel = view.state.selection.main
  const line = view.state.doc.lineAt(sel.head)
  if (!line.text.match(/^\s{0,3}#{1,6}\s/)) return Decoration.none

  const node = syntaxTree(view.state).resolveInner(line.from, 1)
  if (!node.name.includes("header") && !node.name.includes("Heading")) return Decoration.none

  const builder = new RangeSetBuilder<Decoration>()
  const widget = new HeadingToolbarWidget(line.from, line.to, line.text, getPlugin)
  builder.add(line.to, line.to, Decoration.widget({ widget, side: 1 }))
  return builder.finish()
}
