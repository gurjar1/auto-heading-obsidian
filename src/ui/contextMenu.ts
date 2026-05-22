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

      // Promote heading (H3→H2)
      const hashMatch2 = lineText.match(/^\s{0,3}(#{2,6})\s/)
      if (hashMatch2) {
        menu.addItem((item) => {
          item.setTitle(`Promote heading (H${hashMatch2[1].length} → H${hashMatch2[1].length - 1})`)
            .setIcon('arrow-up')
            .onClick(() => {
              const newLine = lineText.replace(/^(\s{0,3})#{1}(#{1,5}\s)/, '$1$2')
              editor.setLine(cursor.line, newLine)
              plugin.refreshDecorations()
            })
        })
      }

      // Demote heading (H2→H3)
      const hashMatch3 = lineText.match(/^\s{0,3}(#{1,5})\s/)
      if (hashMatch3) {
        menu.addItem((item) => {
          item.setTitle(`Demote heading (H${hashMatch3[1].length} → H${hashMatch3[1].length + 1})`)
            .setIcon('arrow-down')
            .onClick(() => {
              const newLine = lineText.replace(/^(\s{0,3})(#{1,5}\s)/, '$1#$2')
              editor.setLine(cursor.line, newLine)
              plugin.refreshDecorations()
            })
        })
      }

      // Copy link to this section
      menu.addItem((item) => {
        item.setTitle('Copy link to this section')
          .setIcon('link')
          .onClick(() => {
            const hm = lineText.match(/^\s{0,3}#{1,6}\s+(.+)/)
            if (hm) {
              let text = hm[1]
                .replace(/\s*<!--\s*(?:skip|no-number|ah-skip|skip-number)\s*-->\s*/g, '')
                .replace(/\s*\^[a-zA-Z0-9_-]+\s*$/, '')
                .replace(/^[\u2060\d.A-Za-z()]+[\s.:\-—)]+\s*/, '')
                .trim()
              const fileName = view.file?.basename || ''
              void navigator.clipboard.writeText(`[[${fileName}#${text}]]`)
              new (require('obsidian').Notice)(`Copied: [[${fileName}#${text}]]`)
            }
          })
      })
    }),
  )
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
