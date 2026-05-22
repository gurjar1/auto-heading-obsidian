/**
 * Auto Heading — Rich Status Bar
 *
 * Shows heading count, word count, reading time. Click to open document overview popover.
 */

import { MarkdownView } from 'obsidian'
import type AutoHeadingPlugin from '../main'
import { analyzeHeadings } from '../core/headingAnalyzer'

export class StatusBarManager {
  private statusBarEl: HTMLElement | null = null
  private plugin: AutoHeadingPlugin
  private popoverEl: HTMLElement | null = null

  private onOutsideClick = (e: MouseEvent) => {
    if (this.popoverEl && !this.popoverEl.contains(e.target as Node) &&
        !this.statusBarEl?.contains(e.target as Node)) {
      this.closePopover()
    }
  }

  constructor(plugin: AutoHeadingPlugin) {
    this.plugin = plugin
  }

  init(): void {
    this.statusBarEl = this.plugin.addStatusBarItem()
    this.statusBarEl.addClass('ah-status-bar')
    this.statusBarEl.addEventListener('click', () => this.togglePopover())
    this.update()
    // Close popover on outside click
    activeDocument.addEventListener('click', this.onOutsideClick)
  }

  update(): void {
    if (!this.statusBarEl) return
    if (!this.plugin.settings.showStatusBar) {
      this.statusBarEl.addClass('ah-status-bar-hidden')
      return
    }
    this.statusBarEl.removeClass('ah-status-bar-hidden')

    const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView)
    if (!view?.file) { this.statusBarEl.setText(''); return }

    const isEnabled = this.plugin.getPerNoteEnabled(view.file.path) && this.plugin.settings.enabled
    const metadata = this.plugin.app.metadataCache.getFileCache(view.file)
    const headingCount = metadata?.headings?.length || 0

    if (headingCount === 0) { this.statusBarEl.setText(''); return }

    // Word count from editor
    const content = view.editor.getValue()
    const wordCount = content.trim().split(/\s+/).length
    const readTime = Math.max(1, Math.ceil(wordCount / 238))

    const icon = isEnabled ? '🔢' : '—'
    this.statusBarEl.setText(`${icon} ${headingCount}h · ${wordCount.toLocaleString()}w · ~${readTime}min`)
    this.statusBarEl.setAttr('title', `Click for document overview`)
  }

  private togglePopover(): void {
    if (this.popoverEl) { this.closePopover(); return }
    this.openPopover()
  }

  private closePopover(): void {
    if (this.popoverEl) { this.popoverEl.remove(); this.popoverEl = null }
  }

  private openPopover(): void {
    this.closePopover()
    const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView)
    if (!view?.file) return

    const metadata = this.plugin.app.metadataCache.getFileCache(view.file)
    if (!metadata?.headings || metadata.headings.length === 0) return

    const settings = this.plugin.getEffectiveSettings(view.file)
    const getLine = (line: number) => view.editor.getLine(line)
    const analysis = analyzeHeadings(metadata.headings, getLine, settings)

    const content = view.editor.getValue()
    const totalWords = content.trim().split(/\s+/).length
    const totalTime = Math.max(1, Math.ceil(totalWords / 238))

    const popover = activeDocument.createElement('div')
    popover.className = 'ah-status-popover'
    this.popoverEl = popover

    // Header
    const header = popover.createDiv({ cls: 'ah-status-popover-header' })
    header.textContent = '📄 Document Overview'

    // Summary
    const summary = popover.createDiv({ cls: 'ah-status-popover-summary' })
    summary.textContent = `${analysis.headings.length} headings · ${totalWords.toLocaleString()} words · ~${totalTime}min`

    // Section rows
    const lines = content.split('\n')
    for (let idx = 0; idx < analysis.headings.length; idx++) {
      const h = analysis.headings[idx]
      const startLine = h.line + 1
      const endLine = idx + 1 < analysis.headings.length
        ? analysis.headings[idx + 1].line
        : lines.length
      const sectionText = lines.slice(startLine, endLine).join('\n')
      const sectionWords = sectionText.trim().length === 0 ? 0 : sectionText.trim().split(/\s+/).length
      const sectionTime = Math.max(1, Math.ceil(sectionWords / 238))

      const row = popover.createDiv({ cls: 'ah-status-popover-row' })
      const indent = '  '.repeat(Math.max(0, h.level - 1))
      row.createSpan({ cls: 'ah-status-popover-num', text: h.isSkipped ? '' : h.formattedNumber })
      row.createSpan({ cls: 'ah-status-popover-title', text: indent + h.cleanTitle })
      row.createSpan({ cls: 'ah-status-popover-words', text: `${sectionWords}w ${sectionTime}min` })
      row.addEventListener('click', () => {
        view.editor.setCursor({ line: h.line, ch: 0 })
        view.editor.scrollIntoView({ from: { line: h.line, ch: 0 }, to: { line: h.line, ch: 0 } }, true)
        this.closePopover()
      })
    }

    // Position above status bar
    const rect = this.statusBarEl!.getBoundingClientRect()
    popover.style.bottom = `${activeDocument.documentElement.clientHeight - rect.top + 4}px`
    popover.style.right = `${activeDocument.documentElement.clientWidth - rect.right}px`
    activeDocument.body.appendChild(popover)
  }

  destroy(): void {
    activeDocument.removeEventListener('click', this.onOutsideClick)
    this.closePopover()
    if (this.statusBarEl) { this.statusBarEl.remove(); this.statusBarEl = null }
  }
}
