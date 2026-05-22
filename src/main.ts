/**
 * Auto Heading — Main Plugin Entry Point
 *
 * Architecture:
 * - Burn-in mode (default): Auto-writes numbers into file text on heading changes
 * - Decoration mode: Visual-only overlays (no file modification)
 * - Scope toggles (OR logic): scopeAll / scopeFrontmatter / scopeSelected
 * - Debounced auto burn-in prevents mid-typing disruption
 */

import { MarkdownView, Plugin, TFile, TFolder, debounce } from 'obsidian'
import type { EditorView } from '@codemirror/view'
import { AutoHeadingSettings, DEFAULT_SETTINGS, mergeSettings } from './settings/settingsTypes'
import { AutoHeadingSettingTab } from './settings/settingsTab'
import { parsePerNoteSettings } from './settings/perNoteSettings'
import { getEditorExtensions, updateDecorationSettings, getGutterSettings } from './decorations/editorExtension'
import {
  createHeadingPostProcessor,
  updatePostProcessorSettings,
  resetFileState,
} from './decorations/postProcessor'
import { registerCommands } from './commands/commandRegistry'
import { registerContextMenu } from './ui/contextMenu'
import { StatusBarManager } from './ui/statusBar'
import { burnInNumbers } from './burnIn/burnInEngine'
import { registerTocProcessor } from './toc/tocProcessor'
import { createHeadingGutter } from './decorations/headingGutter'
import { createHeadingToolbar } from './decorations/headingToolbar'
import { createSectionStrip } from './ui/sectionStrip'

export default class AutoHeadingPlugin extends Plugin {
  settings!: AutoHeadingSettings
  private statusBar!: StatusBarManager
  private perNoteEnabledMap: Map<string, boolean> = new Map()
  private recentBurnIns: Set<string> = new Set()

  // Debounced auto burn-in
  private debouncedBurnIn = debounce(
    (filePath: string) => this.autoBurnIn(filePath),
    2000,
    true,
  )

  async onload(): Promise<void> {
    console.info('Auto Heading: Loading plugin v' + this.manifest.version)
    await this.loadSettings()

    // Core editor extensions
    this.registerEditorExtension(getEditorExtensions())
    this.registerMarkdownPostProcessor(createHeadingPostProcessor())

    // Feature extensions: Gutter, Toolbar, Section Strip
    this.registerEditorExtension([
      createHeadingGutter(() => getGutterSettings()),
      createHeadingToolbar(() => this as AutoHeadingPlugin),
      createSectionStrip(() => this as AutoHeadingPlugin),
    ])

    this.refreshDecorations()

    registerCommands(this)
    registerContextMenu(this)
    registerTocProcessor(this)
    this.addSettingTab(new AutoHeadingSettingTab(this.app, this))

    this.statusBar = new StatusBarManager(this)
    this.statusBar.init()

    // Fold control buttons in view actions
    this.registerFoldButtons()

    // Active leaf change → refresh decorations
    this.registerEvent(
      this.app.workspace.on('active-leaf-change', () => this.onActiveFileChange()),
    )

    // Metadata changed → auto burn-in + refresh
    this.registerEvent(
      this.app.metadataCache.on('changed', (file: TFile) => {
        resetFileState(file.path)

        // Check if this change was caused by our own burn-in
        if (this.recentBurnIns.has(file.path)) {
          this.recentBurnIns.delete(file.path)
          this.onActiveFileChange()
          return
        }

        // Auto burn-in if applicable
        if (this.shouldAutoBurnIn(file)) {
          this.debouncedBurnIn(file.path)
        }

        this.onActiveFileChange()
      }),
    )

    // File open → reset state
    this.registerEvent(
      this.app.workspace.on('file-open', (file: TFile | null) => {
        if (file) resetFileState(file.path)
        this.refreshDecorations()
      }),
    )

    console.info('Auto Heading: Loaded')
  }

  onunload(): void {
    this.statusBar?.destroy()
  }

  // ─── Settings ──────────────────────────────────────────────

  async loadSettings(): Promise<void> {
    const data: Record<string, unknown> | null = await this.loadData()
    this.settings = Object.assign({}, DEFAULT_SETTINGS, data)

    // Migrate old scope enum to new toggle model
    if (data && 'scope' in data && !('scopeAll' in data)) {
      const oldScope = String(data.scope)
      this.settings.scopeAll = (oldScope === 'all')
      this.settings.scopeFrontmatter = (oldScope === 'frontmatter')
      this.settings.scopeSelected = (oldScope === 'include' || oldScope === 'exclude')
      // Migrate old paths
      if ('includePaths' in data && Array.isArray(data.includePaths)) this.settings.scopePaths = data.includePaths as string[]
      if ('excludePaths' in data && Array.isArray(data.excludePaths)) this.settings.scopePaths = data.excludePaths as string[]
    }

    // Ensure firstLevel is consistent with skipH1
    if (this.settings.skipH1 && this.settings.firstLevel < 2) {
      this.settings.firstLevel = 2
    }
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings)
    this.refreshDecorations()
  }

  // ─── Scope Checking (OR logic) ─────────────────────────────

  /**
   * Check if a file is in scope for heading numbering.
   * Uses OR logic: file matches if ANY enabled scope condition is true.
   */
  isFileInScope(filePath: string): boolean {
    // Per-note manual toggle overrides everything
    if (this.perNoteEnabledMap.has(filePath)) {
      return this.perNoteEnabledMap.get(filePath)!
    }

    // Check front matter for explicit enable/disable
    const file = this.app.vault.getAbstractFileByPath(filePath)
    if (file instanceof TFile) {
      const metadata = this.app.metadataCache.getFileCache(file)
      if (metadata) {
        const overrides = parsePerNoteSettings(metadata)
        if (overrides) {
          if (overrides.disabled) return false
          if (overrides.enabled !== undefined && overrides.enabled) return true
        }
      }
    }

    // OR logic: file is in scope if ANY enabled scope condition matches
    if (this.settings.scopeAll) return true

    if (this.settings.scopeFrontmatter) {
      // Front matter was already checked above — if we got here, it didn't match
      // (no auto-heading: auto in front matter)
    }

    if (this.settings.scopeSelected && this.settings.scopePaths.length > 0) {
      const inList = this.settings.scopePaths.some(p =>
        filePath === p || filePath.startsWith(p.endsWith('/') ? p : p + '/'),
      )
      if (inList) return true
    }

    return false
  }

  /** Legacy compatibility */
  getPerNoteEnabled(filePath: string): boolean {
    return this.isFileInScope(filePath)
  }

  setPerNoteEnabled(filePath: string, enabled: boolean): void {
    this.perNoteEnabledMap.set(filePath, enabled)
  }

  getEffectiveSettings(file: TFile): AutoHeadingSettings {
    const metadata = this.app.metadataCache.getFileCache(file)
    if (!metadata) return { ...this.settings }
    const overrides = parsePerNoteSettings(metadata)
    const merged = mergeSettings(this.settings, overrides)
    merged.enabled = this.isFileInScope(file.path)

    // Enforce consistency: if skipH1, firstLevel is at least 2
    if (merged.skipH1 && merged.firstLevel < 2) {
      merged.firstLevel = 2
    }

    return merged
  }

  // ─── Auto Burn-In ──────────────────────────────────────────

  private shouldAutoBurnIn(file: TFile): boolean {
    if (this.settings.mode !== 'burn-in') return false
    if (this.settings.autoBurnInDelay <= 0) return false
    return this.isFileInScope(file.path)
  }

  private async autoBurnIn(filePath: string): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(filePath)
    if (!(file instanceof TFile)) return

    const view = this.app.workspace.getActiveViewOfType(MarkdownView)
    if (!view || view.file?.path !== filePath) return

    const metadata = this.app.metadataCache.getFileCache(file)
    if (!metadata?.headings || metadata.headings.length === 0) return

    const settings = this.getEffectiveSettings(file)
    const result = burnInNumbers(view.editor, metadata.headings, settings)

    if (result.changesApplied > 0) {
      this.recentBurnIns.add(filePath)
    }
  }

  /** Public: manually trigger burn-in for current note */
  triggerBurnIn(): void {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView)
    if (!view?.file) return
    const metadata = this.app.metadataCache.getFileCache(view.file)
    if (!metadata?.headings) return
    const settings = this.getEffectiveSettings(view.file)
    const result = burnInNumbers(view.editor, metadata.headings, settings)
    if (result.changesApplied > 0) {
      this.recentBurnIns.add(view.file.path)
    }
  }

  // ─── Decoration Refresh ────────────────────────────────────

  refreshDecorations(): void {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView)
    let effectiveSettings = this.settings
    let isEnabled = false

    if (view?.file) {
      effectiveSettings = this.getEffectiveSettings(view.file)
      isEnabled = this.isFileInScope(view.file.path)

      // In burn-in mode, also show decorations for immediate feedback
      if (this.settings.mode === 'burn-in' && isEnabled) {
        isEnabled = this.settings.showDecorationsInBurnInMode
      }

      // In decoration mode, always show decorations if in scope
      if (this.settings.mode === 'decoration' && this.isFileInScope(view.file.path)) {
        isEnabled = true
      }
    }

    const settingsChanged = updateDecorationSettings(effectiveSettings, isEnabled)
    updatePostProcessorSettings(effectiveSettings, isEnabled)

    // Only force editor rebuilds when settings/scope actually changed.
    // The StateField already handles doc-change rebuilds automatically.
    // Unnecessary async dispatches during typing were the primary cause
    // of cursor jumping to the start of the line.
    if (settingsChanged) {
      this.app.workspace.iterateAllLeaves((leaf) => {
        if (leaf.view instanceof MarkdownView) {
          const cmView = (leaf.view.editor as unknown as { cm: EditorView }).cm
          if (cmView) cmView.dispatch({})
        }
      })
    }

    // Set indent size CSS custom property on root for all views
    if (effectiveSettings.headingIndent) {
      activeDocument.documentElement.style.setProperty(
        '--ah-indent-size',
        `${effectiveSettings.headingIndentSize}px`,
      )
    }

    this.updateStatusBar()
  }

  private onActiveFileChange(): void {
    this.refreshDecorations()
  }

  updateStatusBar(): void {
    this.statusBar?.update()
  }

  /**
   * Get all folder paths in the vault (for the folder picker).
   */
  getAllFolderPaths(): string[] {
    const folders: string[] = ['/']
    this.app.vault.getAllLoadedFiles().forEach(f => {
      if (f instanceof TFolder && f.path !== '/') {
        folders.push(f.path)
      }
    })
    return folders.sort()
  }

  /**
   * Register fold/unfold buttons in the editor view header actions.
   */
  private registerFoldButtons(): void {
    if (!this.settings.foldButtonsEnabled) return

    // "Fold All" button
    this.addCommand({
      id: 'view-action-fold-all',
      name: 'Fold all sections (view action)',
      icon: 'chevrons-down-up',
      checkCallback: (checking) => {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView)
        if (!view) return false
        if (checking) return true
        const editor = view.editor
        for (let i = 0; i < editor.lineCount(); i++) {
          if (editor.getLine(i).match(/^\s{0,3}#{1,6}\s/)) editor.fold(i)
        }
        return true
      },
    })

    // "Unfold All" button
    this.addCommand({
      id: 'view-action-unfold-all',
      name: 'Unfold all sections (view action)',
      icon: 'chevrons-up-down',
      checkCallback: (checking) => {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView)
        if (!view) return false
        if (checking) return true
        const editor = view.editor
        for (let i = editor.lineCount() - 1; i >= 0; i--) {
          if (editor.getLine(i).match(/^\s{0,3}#{1,6}\s/)) editor.unfold(i)
        }
        return true
      },
    })
  }
}
