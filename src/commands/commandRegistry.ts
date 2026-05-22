/**
 * Auto Heading — Command Registry
 *
 * All commands operate on the CURRENT NOTE only.
 * No default hotkeys — assign via Settings → Hotkeys → "Auto Heading".
 */

import { Editor, MarkdownView, Notice } from 'obsidian'
import type AutoHeadingPlugin from '../main'
import { burnInNumbers } from '../burnIn/burnInEngine'
import { removeBurnedInNumbers } from '../burnIn/burnInRemover'
import { QuickConfigModal } from '../settings/quickConfigModal'
import { settingsToFrontMatterValue } from '../settings/perNoteSettings'
import { analyzeHeadings } from '../core/headingAnalyzer'
import { detectManualNumber } from '../core/manualNumberDetector'

export function registerCommands(plugin: AutoHeadingPlugin): void {

  // ── Toggle (current note) ───────────────────────────────
  plugin.addCommand({
    id: 'toggle-numbering',
    name: 'Toggle heading numbers (current note)',
    checkCallback: (checking: boolean) => {
      const view = plugin.app.workspace.getActiveViewOfType(MarkdownView)
      if (!view?.file) return false
      if (checking) return true
      const current = plugin.getPerNoteEnabled(view.file.path)
      plugin.setPerNoteEnabled(view.file.path, !current)
      plugin.refreshDecorations()
      if (!current && plugin.settings.mode === 'burn-in') plugin.triggerBurnIn()
      new Notice(current ? 'Auto Heading: Numbering disabled for this note' : 'Auto Heading: Numbering enabled for this note')
      return true
    },
  })

  // ── Enable (current note) ──────────────────────────────
  plugin.addCommand({
    id: 'enable-for-note',
    name: 'Enable numbering for this note',
    checkCallback: (checking: boolean) => {
      const view = plugin.app.workspace.getActiveViewOfType(MarkdownView)
      if (!view?.file) return false
      if (checking) return true
      plugin.setPerNoteEnabled(view.file.path, true)
      plugin.refreshDecorations()
      if (plugin.settings.mode === 'burn-in') plugin.triggerBurnIn()
      new Notice('Auto Heading: Enabled for this note')
      return true
    },
  })

  // ── Disable (current note) ─────────────────────────────
  plugin.addCommand({
    id: 'disable-for-note',
    name: 'Disable numbering for this note',
    checkCallback: (checking: boolean) => {
      const view = plugin.app.workspace.getActiveViewOfType(MarkdownView)
      if (!view?.file) return false
      if (checking) return true
      plugin.setPerNoteEnabled(view.file.path, false)
      plugin.refreshDecorations()
      new Notice('Auto Heading: Disabled for this note')
      return true
    },
  })

  // ── Quick Configure ────────────────────────────────────
  plugin.addCommand({
    id: 'quick-configure',
    name: 'Quick configure numbering',
    callback: () => new QuickConfigModal(plugin.app, plugin).open(),
  })

  // ── Burn In (current note) ─────────────────────────────
  plugin.addCommand({
    id: 'burn-in-numbers',
    name: 'Burn in heading numbers (current note)',
    checkCallback: (checking: boolean) => {
      const view = plugin.app.workspace.getActiveViewOfType(MarkdownView)
      if (!view?.file) return false
      if (checking) return true
      const md = plugin.app.metadataCache.getFileCache(view.file)
      if (!md?.headings) { new Notice('No headings found.'); return true }
      const s = plugin.getEffectiveSettings(view.file)
      const r = burnInNumbers(view.editor, md.headings, s)
      new Notice(`Auto Heading: ${r.message}`)
      return true
    },
  })

  // ── Remove Burned-In (current note) ────────────────────
  plugin.addCommand({
    id: 'remove-burned-in',
    name: 'Remove burned-in heading numbers (current note)',
    checkCallback: (checking: boolean) => {
      const view = plugin.app.workspace.getActiveViewOfType(MarkdownView)
      if (!view?.file) return false
      if (checking) return true
      const md = plugin.app.metadataCache.getFileCache(view.file)
      if (!md?.headings) { new Notice('No headings found.'); return true }
      const r = removeBurnedInNumbers(view.editor, md.headings)
      // Also disable numbering for this note so auto burn-in doesn't re-add
      plugin.setPerNoteEnabled(view.file.path, false)
      plugin.refreshDecorations()
      new Notice(`Auto Heading: ${r.message}\nNumbering disabled for this note. Use "Enable numbering" to re-enable.`)
      return true
    },
  })

  // ── Toggle Skip at Cursor (current note) ───────────────
  plugin.addCommand({
    id: 'toggle-skip-heading',
    name: 'Toggle skip for heading at cursor',
    editorCheckCallback: (checking: boolean, editor: Editor, view: MarkdownView) => {
      const cursor = editor.getCursor()
      const lineText = editor.getLine(cursor.line)
      if (!lineText.match(/^\s{0,3}#{1,6}\s/)) return false
      if (checking) return true

      const skipMarker = plugin.settings.skipMarker || 'skip'
      const blockRef = ` ^${skipMarker}`
      const commentShort = ' <!-- skip -->'

      // Check if already marked
      const isMarked =
        lineText.endsWith(blockRef) ||
        lineText.includes('<!-- skip -->') ||
        lineText.includes('<!-- no-number -->') ||
        lineText.includes('<!-- ah-skip -->')

      if (isMarked) {
        // Remove marker
        let newLine = lineText
          .replace(/\s*<!--\s*(?:skip|no-number|ah-skip)\s*-->\s*/g, '')
          .replace(new RegExp(`\\s*\\^${escapeRegex(skipMarker)}\\s*$`), '')
        editor.setLine(cursor.line, newLine)
        new Notice('Auto Heading: Heading will be numbered')
      } else {
        // Remove existing number if it's a computed one, then add skip marker
        const hashMatch = lineText.match(/^(\s{0,3}#{1,6})\s+/)
        if (hashMatch) {
          const afterHash = lineText.substring(hashMatch[0].length)
          const detected = detectManualNumber(afterHash)
          if (detected) {
            // Remove the detected number and add skip marker
            const cleanText = afterHash.substring(detected.fullMatch.length)
            const newLine = hashMatch[1] + ' ' + cleanText.trimStart() + commentShort
            editor.setLine(cursor.line, newLine)
          } else {
            editor.setLine(cursor.line, lineText + commentShort)
          }
        } else {
          editor.setLine(cursor.line, lineText + commentShort)
        }
        new Notice('Auto Heading: Heading will be skipped')
      }

      plugin.refreshDecorations()
      return true
    },
  })

  // ── Save to Front Matter (current note) ────────────────
  plugin.addCommand({
    id: 'save-to-frontmatter',
    name: 'Save settings to front matter (current note)',
    checkCallback: (checking: boolean) => {
      const view = plugin.app.workspace.getActiveViewOfType(MarkdownView)
      if (!view?.file) return false
      if (checking) return true

      void plugin.app.fileManager.processFrontMatter(view.file, (fm: Record<string, unknown>) => {
        const value = settingsToFrontMatterValue({
          enabled: true,
          skipH1: plugin.settings.skipH1,
          firstLevel: plugin.settings.firstLevel,
          maxLevel: plugin.settings.maxLevel,
          levelStyles: [...plugin.settings.levelStyles],
          separator: plugin.settings.separator,
          levelSeparator: plugin.settings.levelSeparator,
          startAt: plugin.settings.startAt,
          skipMarker: plugin.settings.skipMarker,
          numberFormat: plugin.settings.numberFormat,
        })
        fm['auto-heading'] = value
      })
      new Notice('Auto Heading: Settings saved to front matter')
      return true
    },
  })

  // ── Copy Outline ───────────────────────────────────────
  plugin.addCommand({
    id: 'copy-numbered-outline',
    name: 'Copy headings as numbered outline',
    checkCallback: (checking: boolean) => {
      const view = plugin.app.workspace.getActiveViewOfType(MarkdownView)
      if (!view?.file) return false
      if (checking) return true
      const md = plugin.app.metadataCache.getFileCache(view.file)
      if (!md?.headings) { new Notice('No headings found.'); return true }
      const s = plugin.getEffectiveSettings(view.file)
      const getLine = (line: number) => view.editor.getLine(line)
      const analysis = analyzeHeadings(md.headings, getLine, s)
      const lines: string[] = []
      for (const h of analysis.headings) {
        const indent = '  '.repeat(h.level - 1)
        const num = h.isSkipped ? '' : h.formattedNumber + s.separator + ' '
        lines.push(`${indent}${num}${h.cleanTitle}`)
      }
      void navigator.clipboard.writeText(lines.join('\n'))
      new Notice(`Auto Heading: Copied ${analysis.totalCount} headings`)
      return true
    },
  })

  // ── Force Renumber (current note) ──────────────────────
  plugin.addCommand({
    id: 'renumber-all',
    name: 'Force renumber all headings (current note)',
    checkCallback: (checking: boolean) => {
      const view = plugin.app.workspace.getActiveViewOfType(MarkdownView)
      if (!view) return false
      if (checking) return true
      if (plugin.settings.mode === 'burn-in' && view.file) {
        plugin.triggerBurnIn()
      }
      plugin.refreshDecorations()
      new Notice('Auto Heading: Headings renumbered for this note')
      return true
    },
  })

  // ── Navigate: Next Heading ────────────────────────────────
  plugin.addCommand({
    id: 'navigate-next-heading',
    name: 'Navigate: next heading',
    editorCheckCallback: (checking: boolean, editor: Editor) => {
      const cursor = editor.getCursor()
      const lineCount = editor.lineCount()
      for (let i = cursor.line + 1; i < lineCount; i++) {
        if (editor.getLine(i).match(/^\s{0,3}#{1,6}\s/)) {
          if (checking) return true
          editor.setCursor({ line: i, ch: 0 })
          return true
        }
      }
      return false
    },
  })

  // ── Navigate: Previous Heading ────────────────────────────
  plugin.addCommand({
    id: 'navigate-prev-heading',
    name: 'Navigate: previous heading',
    editorCheckCallback: (checking: boolean, editor: Editor) => {
      const cursor = editor.getCursor()
      for (let i = cursor.line - 1; i >= 0; i--) {
        if (editor.getLine(i).match(/^\s{0,3}#{1,6}\s/)) {
          if (checking) return true
          editor.setCursor({ line: i, ch: 0 })
          return true
        }
      }
      return false
    },
  })

  // ── Navigate: Go to heading (fuzzy picker) ────────────────
  plugin.addCommand({
    id: 'navigate-go-to-heading',
    name: 'Navigate: go to heading…',
    checkCallback: (checking: boolean) => {
      const view = plugin.app.workspace.getActiveViewOfType(MarkdownView)
      if (!view?.file) return false
      const md = plugin.app.metadataCache.getFileCache(view.file)
      if (!md?.headings || md.headings.length === 0) return false
      if (checking) return true

      const s = plugin.getEffectiveSettings(view.file)
      const getLine = (line: number) => view.editor.getLine(line)
      const analysis = analyzeHeadings(md.headings, getLine, s)

      const { FuzzySuggestModal } = require('obsidian') as typeof import('obsidian')
      class HeadingPicker extends FuzzySuggestModal<{ line: number; text: string }> {
        getItems() {
          return analysis.headings.map(h => ({
            line: h.line,
            text: `${'  '.repeat(h.level - 1)}${h.isSkipped ? '' : h.formattedNumber + s.separator + ' '}${h.cleanTitle}`,
          }))
        }
        getItemText(item: { text: string }) { return item.text }
        onChooseItem(item: { line: number }) {
          view.editor.setCursor({ line: item.line, ch: 0 })
          view.editor.scrollIntoView({ from: { line: item.line, ch: 0 }, to: { line: item.line, ch: 0 } }, true)
        }
      }
      new HeadingPicker(plugin.app).open()
      return true
    },
  })

  // ── Copy link to current section ──────────────────────────
  plugin.addCommand({
    id: 'copy-heading-link',
    name: 'Copy link to current section',
    editorCheckCallback: (checking: boolean, editor: Editor, view: MarkdownView) => {
      const cursor = editor.getCursor()
      // Find nearest heading at or above cursor
      for (let i = cursor.line; i >= 0; i--) {
        const line = editor.getLine(i)
        const match = line.match(/^\s{0,3}#{1,6}\s+(.+)/)
        if (match) {
          if (checking) return true
          let headingText = match[1]
            .replace(/\s*<!--\s*(?:skip|no-number|ah-skip|skip-number)\s*-->\s*/g, '')
            .replace(/\s*\^[a-zA-Z0-9_-]+\s*$/, '')
            .trim()
          // Remove any auto-number prefix (contains U+2060 marker)
          headingText = headingText.replace(/^[\u2060\d.A-Za-z()]+[\s.:\-—)]+\s*/, '')
          const fileName = view.file?.basename || ''
          const link = `[[${fileName}#${headingText}]]`
          void navigator.clipboard.writeText(link)
          new Notice(`Copied: ${link}`)
          return true
        }
      }
      return false
    },
  })

  // ── Fold all headings ─────────────────────────────────────
  plugin.addCommand({
    id: 'fold-all-headings',
    name: 'Fold all headings',
    editorCheckCallback: (checking: boolean, editor: Editor) => {
      const lineCount = editor.lineCount()
      let hasHeading = false
      for (let i = 0; i < lineCount; i++) {
        if (editor.getLine(i).match(/^\s{0,3}#{1,6}\s/)) { hasHeading = true; break }
      }
      if (!hasHeading) return false
      if (checking) return true
      for (let i = 0; i < lineCount; i++) {
        if (editor.getLine(i).match(/^\s{0,3}#{1,6}\s/)) {
          editor.fold(i)
        }
      }
      new Notice('Auto Heading: All headings folded')
      return true
    },
  })

  // ── Unfold all headings ───────────────────────────────────
  plugin.addCommand({
    id: 'unfold-all-headings',
    name: 'Unfold all headings',
    editorCheckCallback: (checking: boolean, editor: Editor) => {
      const lineCount = editor.lineCount()
      let hasHeading = false
      for (let i = 0; i < lineCount; i++) {
        if (editor.getLine(i).match(/^\s{0,3}#{1,6}\s/)) { hasHeading = true; break }
      }
      if (!hasHeading) return false
      if (checking) return true
      for (let i = lineCount - 1; i >= 0; i--) {
        if (editor.getLine(i).match(/^\s{0,3}#{1,6}\s/)) {
          editor.unfold(i)
        }
      }
      new Notice('Auto Heading: All headings unfolded')
      return true
    },
  })

  // ── Promote heading (remove one #) ─────────────────────────
  plugin.addCommand({
    id: 'promote-heading',
    name: 'Promote heading (e.g. H3 → H2)',
    editorCheckCallback: (checking: boolean, editor: Editor) => {
      const cursor = editor.getCursor()
      const lineText = editor.getLine(cursor.line)
      const match = lineText.match(/^(\s{0,3})(#{2,6})(\s+.*)$/)
      if (!match) return false
      if (checking) return true
      const newLine = match[1] + match[2].slice(1) + match[3]
      editor.setLine(cursor.line, newLine)
      plugin.refreshDecorations()
      return true
    },
  })

  // ── Demote heading (add one #) ─────────────────────────────
  plugin.addCommand({
    id: 'demote-heading',
    name: 'Demote heading (e.g. H2 → H3)',
    editorCheckCallback: (checking: boolean, editor: Editor) => {
      const cursor = editor.getCursor()
      const lineText = editor.getLine(cursor.line)
      const match = lineText.match(/^(\s{0,3})(#{1,5})(\s+.*)$/)
      if (!match) return false
      if (checking) return true
      const newLine = match[1] + match[2] + '#' + match[3]
      editor.setLine(cursor.line, newLine)
      plugin.refreshDecorations()
      return true
    },
  })

  // ── Format heading: Title Case ─────────────────────────────
  plugin.addCommand({
    id: 'format-heading-title-case',
    name: 'Format heading: Title Case',
    editorCheckCallback: (checking: boolean, editor: Editor) => {
      const cursor = editor.getCursor()
      const lineText = editor.getLine(cursor.line)
      const match = lineText.match(/^(\s{0,3}#{1,6}\s+)(.+)$/)
      if (!match) return false
      if (checking) return true
      const titleCased = toTitleCase(match[2])
      editor.setLine(cursor.line, match[1] + titleCased)
      return true
    },
  })

  // ── Format heading: Sentence case ──────────────────────────
  plugin.addCommand({
    id: 'format-heading-sentence-case',
    name: 'Format heading: Sentence case',
    editorCheckCallback: (checking: boolean, editor: Editor) => {
      const cursor = editor.getCursor()
      const lineText = editor.getLine(cursor.line)
      const match = lineText.match(/^(\s{0,3}#{1,6}\s+)(.+)$/)
      if (!match) return false
      if (checking) return true
      const sentenceCased = toSentenceCase(match[2])
      editor.setLine(cursor.line, match[1] + sentenceCased)
      return true
    },
  })
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const SMALL_WORDS = new Set([
  'a', 'an', 'the', 'and', 'but', 'or', 'nor', 'for', 'yet', 'so',
  'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'as', 'vs', 'via',
])

function toTitleCase(text: string): string {
  return text.replace(/\S+/g, (word, index) => {
    if (index === 0 || !SMALL_WORDS.has(word.toLowerCase())) {
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    }
    return word.toLowerCase()
  })
}

function toSentenceCase(text: string): string {
  if (text.length === 0) return text
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase()
}
