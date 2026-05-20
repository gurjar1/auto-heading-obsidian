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
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
