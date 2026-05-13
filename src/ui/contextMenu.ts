/**
 * Auto Heading — Context Menu (Right-Click)
 *
 * Adds heading-related actions to the editor context menu.
 * Uses shorter <!-- skip --> marker and removes computed numbers.
 */

import { MarkdownView, Menu, Editor } from 'obsidian'
import type AutoHeadingPlugin from '../main'
import { detectManualNumber } from '../core/manualNumberDetector'

export function registerContextMenu(plugin: AutoHeadingPlugin): void {
  plugin.registerEvent(
    plugin.app.workspace.on('editor-menu', (menu: Menu, editor: Editor, view: MarkdownView) => {
      const cursor = editor.getCursor()
      const lineText = editor.getLine(cursor.line)

      // Only show on heading lines
      if (!lineText.match(/^\s{0,3}#{1,6}\s/)) return

      const skipMarker = plugin.settings.skipMarker || 'skip'
      const blockRef = ` ^${skipMarker}`
      const isSkipped =
        lineText.endsWith(blockRef) ||
        lineText.includes('<!-- skip -->') ||
        lineText.includes('<!-- no-number -->') ||
        lineText.includes('<!-- ah-skip -->')

      menu.addItem((item) => {
        item
          .setTitle(isSkipped ? 'Enable numbering for this heading' : 'Skip numbering for this heading')
          .setIcon(isSkipped ? 'check-circle' : 'skip-forward')
          .onClick(() => {
            if (isSkipped) {
              // Remove skip markers
              let newLine = lineText
                .replace(/\s*<!--\s*(?:skip|no-number|ah-skip)\s*-->\s*/g, '')
                .replace(new RegExp(`\\s*\\^${escapeRegex(skipMarker)}\\s*$`), '')
              editor.setLine(cursor.line, newLine)
            } else {
              // Add skip + remove computed number
              const hashMatch = lineText.match(/^(\s{0,3}#{1,6})\s+/)
              if (hashMatch) {
                const afterHash = lineText.substring(hashMatch[0].length)
                const detected = detectManualNumber(afterHash)
                if (detected) {
                  const cleanText = afterHash.substring(detected.fullMatch.length)
                  editor.setLine(cursor.line, hashMatch[1] + ' ' + cleanText.trimStart() + ' <!-- skip -->')
                } else {
                  editor.setLine(cursor.line, lineText + ' <!-- skip -->')
                }
              } else {
                editor.setLine(cursor.line, lineText + ' <!-- skip -->')
              }
            }
            plugin.refreshDecorations()
          })
      })

      // Quick burn-in for this note
      if (plugin.settings.mode === 'burn-in') {
        menu.addItem((item) => {
          item
            .setTitle('Renumber headings in this note')
            .setIcon('refresh-cw')
            .onClick(() => plugin.triggerBurnIn())
        })
      }
    }),
  )
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
