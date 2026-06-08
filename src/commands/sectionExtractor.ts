/**
 * Auto Heading — Section Extraction
 *
 * Extracts a heading and its content to a new note.
 * Supports cut/copy modes with optional link replacement.
 */

import { App, Modal, Notice, Setting, TFile, MarkdownView } from 'obsidian'
import type { Editor } from 'obsidian'
import type AutoHeadingPlugin from '../main'

// ─── Section Boundary Detection ───────────────────────────────────────

interface SectionBounds {
  /** 0-based line index of the heading itself */
  headingLine: number
  /** Heading level (1–6) */
  level: number
  /** Raw heading text (after ## ) */
  headingText: string
  /** 0-based line index of the first line AFTER the section (exclusive).
   *  If section extends to end-of-file, equals editor.lineCount(). */
  endLine: number
}

/**
 * Find the section boundaries for the heading at or above the cursor.
 * Uses synchronous editor scan — no metadataCache dependency.
 */
export function findSectionBounds(editor: Editor, cursorLine: number): SectionBounds | null {
  // Walk upwards to find the nearest heading
  let headingLine = -1
  let level = 0
  let headingText = ''

  for (let i = cursorLine; i >= 0; i--) {
    const line = editor.getLine(i)
    const m = line.match(/^\s{0,3}(#{1,6})\s+(.*)/)
    if (m) {
      headingLine = i
      level = m[1].length
      headingText = m[2]
      break
    }
  }

  if (headingLine < 0) return null

  // Walk downwards to find the end of section.
  // Section ends at the next heading of SAME or HIGHER level (lower # count),
  // while respecting code blocks (``` / ~~~).
  const lineCount = editor.lineCount()
  let endLine = lineCount
  let insideCodeBlock = false
  let fenceChar = ''
  let fenceLen = 0

  for (let i = headingLine + 1; i < lineCount; i++) {
    const line = editor.getLine(i)
    const trimmed = line.trimStart()

    // Track code fences (CommonMark spec compliant)
    if (insideCodeBlock) {
      const closeMatch = trimmed.match(/^(`{3,}|~{3,})\s*$/)
      if (closeMatch && closeMatch[1][0] === fenceChar && closeMatch[1].length >= fenceLen) {
        insideCodeBlock = false
        fenceChar = ''
        fenceLen = 0
      }
      continue
    }
    const openMatch = trimmed.match(/^(`{3,}|~{3,})/)
    if (openMatch) {
      insideCodeBlock = true
      fenceChar = openMatch[1][0]
      fenceLen = openMatch[1].length
      continue
    }

    // Check for heading of same or higher level
    const hm = line.match(/^\s{0,3}(#{1,6})\s/)
    if (hm && hm[1].length <= level) {
      endLine = i
      break
    }
  }

  // Trim trailing blank lines from the section
  while (endLine > headingLine + 1 && editor.getLine(endLine - 1).trim() === '') {
    endLine--
  }

  return { headingLine, level, headingText, endLine }
}

// ─── Filename Sanitization ────────────────────────────────────────────

function sanitizeFilename(name: string): string {
  // Remove characters illegal in filenames and the invisible U+2060 marker
  return name
    .replace(/\u2060/g, '')
    .replace(/[\\/:*?"<>|#^[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Clean the heading text for use as a default filename.
 * Strips skip markers, block IDs, and auto-number prefixes.
 */
function headingToFilename(rawText: string): string {
  let text = rawText
  // Remove skip comments
  text = text.replace(/\s*<!--\s*(?:skip|no-number|ah-skip|skip-number)\s*-->\s*/g, '')
  // Remove block IDs
  text = text.replace(/\s*\^[a-zA-Z0-9_-]+\s*$/, '')
  // Remove U+2060 marker
  text = text.replace(/\u2060/g, '')
  return sanitizeFilename(text) || 'Extracted Section'
}

// ─── Modal ────────────────────────────────────────────────────────────

export class ExtractSectionModal extends Modal {
  private fileName: string
  private folder: string
  private readonly onSubmit: (fileName: string, folder: string) => void
  private readonly folders: string[]
  private readonly defaultFolder: string
  private submitBtn: HTMLButtonElement | null = null
  private errorEl: HTMLElement | null = null

  constructor(
    app: App,
    defaultName: string,
    defaultFolder: string,
    folders: string[],
    showFolderPicker: boolean,
    onSubmit: (fileName: string, folder: string) => void,
  ) {
    super(app)
    this.fileName = defaultName
    this.defaultFolder = defaultFolder
    this.folder = defaultFolder
    this.folders = folders
    this.onSubmit = onSubmit

    this.setTitle('Extract Section to New Note')

    const { contentEl } = this

    // Note name
    new Setting(contentEl)
      .setName('Note name')
      .addText(text => {
        text.setValue(this.fileName)
        text.inputEl.addClass('ah-extract-input')
        text.onChange(v => {
          this.fileName = v
          this.validateInput()
        })
        // Submit on Enter
        text.inputEl.addEventListener('keydown', (e: KeyboardEvent) => {
          if (e.key === 'Enter') { e.preventDefault(); this.doSubmit() }
        })
        // Auto-focus
        window.setTimeout(() => { text.inputEl.focus(); text.inputEl.select() }, 50)
      })

    // Folder picker (only when extractLocation === 'ask')
    if (showFolderPicker) {
      new Setting(contentEl)
        .setName('Save in folder')
        .addDropdown(dd => {
          for (const f of this.folders) {
            dd.addOption(f, f === '/' ? '/ (vault root)' : f)
          }
          dd.setValue(this.defaultFolder)
          dd.onChange(v => { this.folder = v })
        })
    }

    // Error display
    this.errorEl = contentEl.createEl('p', { cls: 'ah-extract-error ah-extract-error-text ah-extract-hidden' })

    // Submit button
    new Setting(contentEl)
      .addButton(btn => {
        btn.setButtonText('Extract').setCta()
        btn.onClick(() => this.doSubmit())
        this.submitBtn = btn.buttonEl
      })

    // Validate initial state (e.g. filename already exists)
    this.validateInput()
  }

  private validateInput(): boolean {
    const sanitized = sanitizeFilename(this.fileName)
    if (!sanitized) {
      this.showError('Note name cannot be empty.')
      return false
    }
    const folderPath = this.folder === '/' ? '' : this.folder + '/'
    const fullPath = folderPath + sanitized + '.md'
    if (this.app.vault.getAbstractFileByPath(fullPath)) {
      this.showError(`A note named "${sanitized}" already exists in that folder.`)
      return false
    }
    this.hideError()
    return true
  }

  private showError(msg: string): void {
    if (this.errorEl) { this.errorEl.textContent = msg; this.errorEl.removeClass('ah-extract-hidden') }
    if (this.submitBtn) this.submitBtn.disabled = true
  }

  private hideError(): void {
    if (this.errorEl) this.errorEl.addClass('ah-extract-hidden')
    if (this.submitBtn) this.submitBtn.disabled = false
  }

  private doSubmit(): void {
    if (!this.validateInput()) return
    this.close()
    this.onSubmit(sanitizeFilename(this.fileName), this.folder)
  }
}

// ─── Main Extraction Logic ────────────────────────────────────────────

export async function extractSection(plugin: AutoHeadingPlugin, targetLine?: number): Promise<void> {
  const view = plugin.app.workspace.getActiveViewOfType(MarkdownView)
  if (!view?.file) {
    new Notice('No active note.')
    return
  }

  const editor = view.editor
  const cursorLine = targetLine ?? editor.getCursor().line
  const bounds = findSectionBounds(editor, cursorLine)

  if (!bounds) {
    new Notice('No heading found at or above cursor.')
    return
  }

  // Gather text
  const lines: string[] = []
  for (let i = bounds.headingLine; i < bounds.endLine; i++) {
    lines.push(editor.getLine(i))
  }
  const sectionContent = lines.join('\n') + '\n'

  // Determine defaults
  const defaultName = headingToFilename(bounds.headingText)
  const currentFolder = view.file.parent?.path || '/'
  const showFolderPicker = plugin.settings.extractLocation === 'ask'
  const folders = plugin.getAllFolderPaths()

  // Show modal
  new ExtractSectionModal(
    plugin.app,
    defaultName,
    currentFolder,
    folders,
    showFolderPicker,
    (fileName: string, folder: string) => { void (async () => {
      const folderPath = folder === '/' ? '' : folder + '/'
      const fullPath = folderPath + fileName + '.md'

      try {
        await plugin.app.vault.create(fullPath, sectionContent)
      } catch (err) {
        new Notice(`Failed to create note: ${err}`)
        return
      }

      // If Cut mode, remove/replace text in source
      if (plugin.settings.extractMode === 'cut') {
        const from = { line: bounds.headingLine, ch: 0 }
        let to: { line: number, ch: number }
        if (bounds.endLine >= editor.lineCount()) {
          // End of file: select to the end of the last line
          const lastLine = editor.lastLine()
          to = { line: lastLine, ch: editor.getLine(lastLine).length }
        } else {
          to = { line: bounds.endLine, ch: 0 }
        }

        let replacement = ''
        if (plugin.settings.extractReplaceStyle === 'embed') {
          replacement = `![[${fileName}]]\n`
        } else if (plugin.settings.extractReplaceStyle === 'link') {
          replacement = `[[${fileName}]]\n`
        }
        // 'none' → replacement stays empty

        editor.replaceRange(replacement, from, to)
      }

      new Notice(`Extracted to ${fullPath}`)

      // Open the new note
      const newFile = plugin.app.vault.getAbstractFileByPath(fullPath)
      if (newFile instanceof TFile) {
        await plugin.app.workspace.getLeaf('tab').openFile(newFile)
      }
    })() },
  ).open()
}
