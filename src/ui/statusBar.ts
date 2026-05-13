/**
 * Auto Heading — Status Bar
 *
 * Shows heading numbering status in the Obsidian status bar.
 */

import { MarkdownView } from 'obsidian'
import type AutoHeadingPlugin from '../main'

/**
 * Create and manage the status bar item.
 */
export class StatusBarManager {
  private statusBarEl: HTMLElement | null = null
  private plugin: AutoHeadingPlugin

  constructor(plugin: AutoHeadingPlugin) {
    this.plugin = plugin
  }

  /**
   * Initialize the status bar element.
   */
  init(): void {
    this.statusBarEl = this.plugin.addStatusBarItem()
    this.statusBarEl.addClass('ah-status-bar')
    this.update()
  }

  /**
   * Update the status bar text.
   */
  update(): void {
    if (!this.statusBarEl) return

    if (!this.plugin.settings.showStatusBar) {
      this.statusBarEl.style.display = 'none'
      return
    }

    this.statusBarEl.style.display = ''

    const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView)

    if (!view || !view.file) {
      this.statusBarEl.setText('')
      return
    }

    const isEnabled = this.plugin.getPerNoteEnabled(view.file.path) &&
                      this.plugin.settings.enabled
    const metadata = this.plugin.app.metadataCache.getFileCache(view.file)
    const headingCount = metadata?.headings?.length || 0

    if (headingCount === 0) {
      this.statusBarEl.setText('')
      return
    }

    const icon = isEnabled ? '🔢' : '—'
    const status = isEnabled ? 'ON' : 'OFF'
    this.statusBarEl.setText(`${icon} ${headingCount}h`)
    this.statusBarEl.setAttr('title', `Auto Heading: ${status} | ${headingCount} heading(s)`)
  }

  /**
   * Clean up the status bar element.
   */
  destroy(): void {
    if (this.statusBarEl) {
      this.statusBarEl.remove()
      this.statusBarEl = null
    }
  }
}
