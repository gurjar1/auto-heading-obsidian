/**
 * Auto Heading — Heading Inline Toolbar
 *
 * Floating action buttons (promote/demote/copy/embed/format/skip/extract) on heading lines.
 * Uses Obsidian's native Lucide icons for a clean, premium look.
 */

import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate, WidgetType } from '@codemirror/view'
import { RangeSetBuilder } from '@codemirror/state'
import { syntaxTree } from '@codemirror/language'
import { setIcon } from 'obsidian'
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

/** Clean heading text for link/embed generation */
function cleanHeadingText(lineText: string): string {
  return lineText.replace(/^\s{0,3}#{1,6}\s+/, '')
    .replace(/\s*<!--\s*(?:skip|no-number|ah-skip|skip-number)\s*-->\s*/g, '')
    .replace(/\s*\^[a-zA-Z0-9_-]+\s*$/, '')
    .trim()
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
    const showPromote = !settings || settings.toolbarShowPromote !== false
    const showCopy = !settings || settings.toolbarShowCopyLink !== false
    const showCopyEmbed = !settings || settings.toolbarShowCopyEmbed !== false
    const showFormat = !settings || settings.toolbarShowFormat !== false
    const showSkip = !settings || settings.toolbarShowSkip !== false
    const showExtract = !settings || settings.toolbarShowExtract !== false

    // Read the CURRENT line from the view at action time.
    // The widget may have been mapped (not rebuilt) during typing, so
    // this.lineText / lineFrom / lineTo could be stale. Always use
    // fresh state from the editor when performing actions.
    const curLine = () => {
      const sel = view.state.selection.main
      const line = view.state.doc.lineAt(sel.head)
      return { text: line.text, from: line.from, to: line.to }
    }

    /**
     * Create a toolbar button with either a Lucide icon or text label.
     * @param iconOrText - Lucide icon ID (e.g. 'link') or text fallback (e.g. 'Aa')
     * @param title      - Tooltip text
     * @param cls        - Extra CSS class(es)
     * @param handler    - Click callback
     * @param useIcon    - If true, render Lucide SVG; if false, use textContent
     */
    const makeBtn = (iconOrText: string, title: string, cls: string, handler: () => void, useIcon = true) => {
      const btn = activeDocument.createElement('button')
      btn.className = `ah-toolbar-btn ${cls}`.trim()
      btn.title = title
      if (useIcon) {
        setIcon(btn, iconOrText)
      } else {
        btn.textContent = iconOrText
      }
      btn.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation() })
      btn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); handler() })
      return btn
    }

    // ── Promote / Demote ──────────────────────────────────────
    if (showPromote) {
      if (hashes.length < 6) {
        div.appendChild(makeBtn('chevron-down', 'Demote heading', '', () => {
          const ln = curLine()
          const newText = ln.text.replace(/^(\s{0,3})(#{1,6})/, '$1$2#')
          view.dispatch({ changes: { from: ln.from, to: ln.to, insert: newText } })
        }))
      }
      if (hashes.length > 1) {
        div.appendChild(makeBtn('chevron-up', 'Promote heading', '', () => {
          const ln = curLine()
          const newText = ln.text.replace(/^(\s{0,3})#{1}(#{1,5})/, '$1$2')
          view.dispatch({ changes: { from: ln.from, to: ln.to, insert: newText } })
        }))
      }
    }

    // ── Copy Link ─────────────────────────────────────────────
    if (showCopy) {
      const copyBtn = makeBtn('link', 'Copy link to section', '', () => {
        const headingText = cleanHeadingText(curLine().text)
        const fileName = plugin?.app.workspace.getActiveFile()?.basename || ''
        void navigator.clipboard.writeText(`[[${fileName}#${headingText}]]`)
        copyBtn.empty()
        copyBtn.textContent = '✓'
        copyBtn.classList.add('ah-toolbar-btn-success')
        window.setTimeout(() => { copyBtn.textContent = ''; setIcon(copyBtn, 'link'); copyBtn.classList.remove('ah-toolbar-btn-success') }, 1500)
      })
      div.appendChild(copyBtn)
    }

    // ── Copy Embed Link ───────────────────────────────────────
    if (showCopyEmbed) {
      const embedBtn = makeBtn('file-symlink', 'Copy embed link to section', '', () => {
        const headingText = cleanHeadingText(curLine().text)
        const fileName = plugin?.app.workspace.getActiveFile()?.basename || ''
        void navigator.clipboard.writeText(`![[${fileName}#${headingText}]]`)
        embedBtn.empty()
        embedBtn.textContent = '✓'
        embedBtn.classList.add('ah-toolbar-btn-success')
        window.setTimeout(() => { embedBtn.textContent = ''; setIcon(embedBtn, 'file-symlink'); embedBtn.classList.remove('ah-toolbar-btn-success') }, 1500)
      })
      div.appendChild(embedBtn)
    }

    // ── Format: Title Case ────────────────────────────────────
    if (showFormat) {
      div.appendChild(makeBtn('Aa', 'Format: Title Case', '', () => {
        const ln = curLine()
        const m = ln.text.match(/^(\s{0,3}#{1,6}\s+)(.+)$/)
        if (m) {
          const formatted = toTitleCase(m[2])
          view.dispatch({ changes: { from: ln.from, to: ln.to, insert: m[1] + formatted } })
        }
      }, false))
    }

    // ── Skip Toggle ───────────────────────────────────────────
    if (showSkip) {
      const hasSkip = /<!--\s*(?:skip|no-number|ah-skip)\s*-->/.test(this.lineText)
      const skipBtn = makeBtn('eye-off', hasSkip ? 'Remove skip' : 'Skip this heading',
        hasSkip ? 'ah-toolbar-skip-active' : '', () => {
          const ln = curLine()
          const lnHasSkip = /<!--\s*(?:skip|no-number|ah-skip)\s*-->/.test(ln.text)
          let newText: string
          if (lnHasSkip) {
            newText = ln.text.replace(/\s*<!--\s*(?:skip|no-number|ah-skip)\s*-->\s*/g, '')
          } else {
            newText = ln.text + ' <!-- skip -->'
          }
          view.dispatch({ changes: { from: ln.from, to: ln.to, insert: newText } })
        })
      div.appendChild(skipBtn)
    }

    // ── Extract Section ───────────────────────────────────────
    if (showExtract && plugin) {
      div.appendChild(makeBtn('file-output', 'Extract section to new note', '', () => {
        const ln = curLine()
        const lineNumber = view.state.doc.lineAt(ln.from).number - 1
        void import('../commands/sectionExtractor').then(mod => {
          void mod.extractSection(plugin, lineNumber)
        })
      }))
    }

    return div
  }
}

export function createHeadingToolbar(getPlugin: () => AutoHeadingPlugin | null): Extension {
  let lastToolbarLine = -1

  return ViewPlugin.define(
    (view) => {
      const pluginValue = {
        decorations: buildToolbarDecos(view, getPlugin),
        update(update: ViewUpdate) {
          const curLine = update.state.doc.lineAt(update.state.selection.main.head).number

          if (update.docChanged && curLine === lastToolbarLine) {
            // User is typing on the same line — map decorations instead of
            // rebuilding. This prevents the toolbar widget from being destroyed
            // and recreated on every keystroke, which caused DOM churn that
            // contributed to cursor jump issues in headings.
            pluginValue.decorations = pluginValue.decorations.map(update.changes)
            return
          }

          if (update.selectionSet || update.docChanged) {
            lastToolbarLine = curLine
            pluginValue.decorations = buildToolbarDecos(update.view, getPlugin)
          }
        },
      }
      lastToolbarLine = view.state.doc.lineAt(view.state.selection.main.head).number
      return pluginValue
    },
    { decorations: (v) => v.decorations }
  )
}

function buildToolbarDecos(view: EditorView, getPlugin: () => AutoHeadingPlugin | null): DecorationSet {
  const plugin = getPlugin()
  if (plugin && plugin.settings.toolbarEnabled === false) return Decoration.none

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
