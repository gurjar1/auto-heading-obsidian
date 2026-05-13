/**
 * Auto Heading — Settings Tab
 * SVG icons, toggle-based scope, no scroll jump, cleaner commands.
 */
import { App, FuzzySuggestModal, MarkdownView, Notice, PluginSettingTab, Setting, TFile } from 'obsidian'
import type AutoHeadingPlugin from '../main'
import { NumberingStyle, isValidNumberingStyle } from '../core/numberingTokens'
import { VALID_SEPARATORS, NumberingMode } from './settingsTypes'
import { burnInNumbers } from '../burnIn/burnInEngine'
import { removeBurnedInNumbers } from '../burnIn/burnInRemover'

class FolderSuggestModal extends FuzzySuggestModal<string> {
  private onSelect: (p: string) => void; private items: string[]
  constructor(app: App, items: string[], onSelect: (p: string) => void) {
    super(app); this.items = items; this.onSelect = onSelect
    this.setPlaceholder('Type to search folders...')
  }
  getItems() { return this.items }
  getItemText(item: string) { return item || '/' }
  onChooseItem(item: string) { this.onSelect(item) }
}
class FileSuggestModal extends FuzzySuggestModal<string> {
  private onSelect: (p: string) => void; private items: string[]
  constructor(app: App, items: string[], onSelect: (p: string) => void) {
    super(app); this.items = items; this.onSelect = onSelect
    this.setPlaceholder('Type to search notes...')
  }
  getItems() { return this.items }
  getItemText(item: string) { return item }
  onChooseItem(item: string) { this.onSelect(item) }
}

// ─── SVG Icons ────────────────────────────────────────────────
const ICONS: Record<string, string> = {
  mode: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
  scope: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>',
  numbering: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/><path d="M4 6h1v4"/><path d="M4 10h2"/><path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"/></svg>',
  appearance: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r="2.5"/><path d="M17.08 3.22a2.5 2.5 0 0 1 3.54 3.54L7.04 20.34a2.5 2.5 0 0 1-1.17.68l-3.54.89.89-3.54c.13-.43.37-.82.68-1.17z"/></svg>',
  actions: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
  advanced: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>',
  keyboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M6 8h.001M10 8h.001M14 8h.001M18 8h.001M8 12h.001M12 12h.001M16 12h.001M7 16h10"/></svg>',
  commands: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>',
  note: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
}

function sectionHeader(c: HTMLElement, key: string, title: string): void {
  const h = c.createEl('div', { cls: 'ah-settings-section-header' })
  if (ICONS[key]) { const s = h.createEl('span'); s.innerHTML = ICONS[key] }
  h.createEl('span', { text: title })
}

export class AutoHeadingSettingTab extends PluginSettingTab {
  plugin: AutoHeadingPlugin
  constructor(app: App, plugin: AutoHeadingPlugin) { super(app, plugin); this.plugin = plugin }

  display(): void {
    const { containerEl } = this
    const scrollEl = containerEl.parentElement
    const scrollPos = scrollEl?.scrollTop ?? 0
    containerEl.empty()
    containerEl.createEl('h2', { text: 'Auto Heading' })

    // ═══ MODE ═══
    sectionHeader(containerEl, 'mode', 'Mode')
    new Setting(containerEl).setName('Numbering mode').setDesc('How heading numbers are applied.')
      .addDropdown(dd => {
        dd.addOption('burn-in', 'Auto-number (writes to file)')
        dd.addOption('decoration', 'Visual only (files stay clean)')
        dd.addOption('off', 'Off')
        dd.setValue(this.plugin.settings.mode)
        dd.onChange(async v => { this.plugin.settings.mode = v as NumberingMode; await this.plugin.saveSettings(); this.rebuild(scrollEl) })
      })

    if (this.plugin.settings.mode === 'burn-in') {
      const info = containerEl.createEl('div', { cls: 'ah-settings-info-box' })
      info.innerHTML = `<strong>Auto-number</strong> writes numbers into your file. Numbers appear in TOC, PDF, Publish.<br>
        Numbers auto-update after edits (configurable delay). <strong>Undo:</strong> <code>Ctrl+Z</code>`
      new Setting(containerEl).setName('Auto-number delay').setDesc('Wait time after editing before numbers update.')
        .addDropdown(dd => {
          for (const v of [0.5, 1, 1.5, 2, 2.5, 3, 4, 5])
            dd.addOption(String(v * 1000), `${v} second${v !== 1 ? 's' : ''}`)
          dd.setValue(String(this.plugin.settings.autoBurnInDelay))
          dd.onChange(async v => { this.plugin.settings.autoBurnInDelay = parseInt(v); await this.plugin.saveSettings() })
        })
      new Setting(containerEl).setName('Show live preview').setDesc('Also show decoration numbers while typing (for instant feedback).')
        .addToggle(t => t.setValue(this.plugin.settings.showDecorationsInBurnInMode)
          .onChange(async v => { this.plugin.settings.showDecorationsInBurnInMode = v; await this.plugin.saveSettings() }))
    }

    // ═══ SCOPE ═══
    sectionHeader(containerEl, 'scope', 'Which Notes to Number')
    containerEl.createEl('p', { text: 'Enable one or more. A note is numbered if ANY enabled condition matches.', cls: 'ah-settings-description' })

    new Setting(containerEl).setName('All notes in vault').setDesc('Number every note automatically.')
      .addToggle(t => t.setValue(this.plugin.settings.scopeAll)
        .onChange(async v => { this.plugin.settings.scopeAll = v; await this.plugin.saveSettings(); this.rebuild(scrollEl) }))

    new Setting(containerEl).setName('Notes with front matter').setDesc('Notes containing auto-heading: auto')
      .addToggle(t => t.setValue(this.plugin.settings.scopeFrontmatter)
        .onChange(async v => { this.plugin.settings.scopeFrontmatter = v; await this.plugin.saveSettings() }))

    new Setting(containerEl).setName('Selected folders / notes').setDesc('Only notes in the list below.')
      .addToggle(t => t.setValue(this.plugin.settings.scopeSelected)
        .onChange(async v => { this.plugin.settings.scopeSelected = v; await this.plugin.saveSettings(); this.rebuild(scrollEl) }))

    if (this.plugin.settings.scopeSelected) this.renderScopeCard(containerEl)

    // ═══ NUMBERING OPTIONS ═══
    sectionHeader(containerEl, 'numbering', 'Numbering Options')
    new Setting(containerEl).setName('Skip H1 headings').setDesc('Do not number # headings (use when H1 is the note title).')
      .addToggle(t => t.setValue(this.plugin.settings.skipH1).onChange(async v => {
        this.plugin.settings.skipH1 = v
        if (v && this.plugin.settings.firstLevel < 2) this.plugin.settings.firstLevel = 2
        await this.plugin.saveSettings(); this.rebuild(scrollEl)
      }))

    new Setting(containerEl).setName('First heading level').setDesc('Start numbering from this level.')
      .addDropdown(dd => {
        const min = this.plugin.settings.skipH1 ? 2 : 1
        for (let i = min; i <= 6; i++) dd.addOption(String(i), `H${i} (${'#'.repeat(i)})`)
        dd.setValue(String(Math.max(this.plugin.settings.firstLevel, min)))
        dd.onChange(async v => { this.plugin.settings.firstLevel = parseInt(v); await this.plugin.saveSettings() })
      })

    new Setting(containerEl).setName('Maximum heading level').setDesc('Stop numbering at this level.')
      .addDropdown(dd => {
        for (let i = 1; i <= 6; i++) dd.addOption(String(i), `H${i} (${'#'.repeat(i)})`)
        dd.setValue(String(this.plugin.settings.maxLevel))
        dd.onChange(async v => { this.plugin.settings.maxLevel = parseInt(v); await this.plugin.saveSettings() })
      })

    new Setting(containerEl).setName('Start numbering at').setDesc('Starting value. 1 for Arabic, A for letters, I for Roman.')
      .addText(t => t.setPlaceholder('1').setValue(this.plugin.settings.startAt)
        .onChange(async v => { this.plugin.settings.startAt = v; await this.plugin.saveSettings() }))

    const styleOpts: Record<NumberingStyle, string> = {
      '1': 'Arabic (1, 2, 3)', 'A': 'Upper (A, B, C)', 'a': 'Lower (a, b, c)',
      'I': 'Roman (I, II, III)', 'i': 'Roman (i, ii, iii)',
    }
    for (let level = 1; level <= 6; level++) {
      const i = level - 1
      new Setting(containerEl).setName(`H${level} style`).setDesc(`${'#'.repeat(level)} numbering style.`)
        .addDropdown(dd => {
          for (const [k, v] of Object.entries(styleOpts)) dd.addOption(k, v)
          dd.setValue(this.plugin.settings.levelStyles[i])
          dd.onChange(async v => {
            if (isValidNumberingStyle(v)) {
              this.plugin.settings.levelStyles[i] = v
              await this.plugin.saveSettings()
              // Force TOC refresh after style change
              this.plugin.triggerBurnIn()
            }
          })
        })
    }

    // ═══ APPEARANCE ═══
    sectionHeader(containerEl, 'appearance', 'Appearance')
    new Setting(containerEl).setName('Separator').setDesc('Character between number and heading text. Default: dot (.)')
      .addDropdown(dd => {
        const labels: Record<string, string> = { '': 'None', ' ': 'Space', '.': 'Dot (default)', ':': 'Colon', '-': 'Dash', '—': 'Em-dash', ')': 'Paren', ' .': 'Space+Dot', ' :': 'Space+Colon', ' -': 'Space+Dash', ' —': 'Space+Em-dash', ' )': 'Space+Paren' }
        for (const sep of VALID_SEPARATORS) dd.addOption(sep, labels[sep] || sep)
        dd.setValue(this.plugin.settings.separator)
        dd.onChange(async v => { this.plugin.settings.separator = v as any; await this.plugin.saveSettings() })
      })
    new Setting(containerEl).setName('Level separator').setDesc('Between level numbers (the "." in 1.2.3).')
      .addText(t => t.setPlaceholder('.').setValue(this.plugin.settings.levelSeparator)
        .onChange(async v => { this.plugin.settings.levelSeparator = v; await this.plugin.saveSettings() }))
    new Setting(containerEl).setName('Number format').setDesc('Template: {n} = number. E.g. "{n}", "§{n}", "Ch.{n}:"')
      .addText(t => t.setPlaceholder('{n}').setValue(this.plugin.settings.numberFormat)
        .onChange(async v => { if (v.includes('{n}') || !v) { this.plugin.settings.numberFormat = v || '{n}'; await this.plugin.saveSettings() } }))
    new Setting(containerEl).setName('Number opacity (decoration)').setDesc('Opacity for visual-only numbers.')
      .addDropdown(dd => {
        for (const v of [0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]) dd.addOption(String(v), `${Math.round(v * 100)}%`)
        dd.setValue(String(this.plugin.settings.numberOpacity)); dd.onChange(async v => { this.plugin.settings.numberOpacity = parseFloat(v); await this.plugin.saveSettings() })
      })

    // ═══ QUICK ACTIONS ═══
    sectionHeader(containerEl, 'actions', 'Quick Actions — This Note Only')
    containerEl.createEl('p', { text: 'These buttons apply to the currently open note only. Use Ctrl+Z to undo.', cls: 'ah-settings-description' })
    new Setting(containerEl).setName('Apply heading numbers').setDesc('Write computed numbers into headings right now. Appears in TOC and exports.')
      .addButton(b => b.setButtonText('Write Numbers to File').setCta().onClick(() => this.doBurnIn()))
    new Setting(containerEl).setName('Remove heading numbers').setDesc('Strip all numbers from headings and pause auto-numbering for this note.')
      .addButton(b => b.setButtonText('Remove & Stop').setWarning().onClick(() => this.doRemoveNumbers()))

    // ═══ ADVANCED ═══
    sectionHeader(containerEl, 'advanced', 'Advanced')
    new Setting(containerEl).setName('Detect existing numbers').setDesc('Replace manually-typed numbers like "1. Intro" with computed values.')
      .addToggle(t => t.setValue(this.plugin.settings.detectManualNumbers).onChange(async v => { this.plugin.settings.detectManualNumbers = v; await this.plugin.saveSettings() }))
    new Setting(containerEl).setName('Skip marker').setDesc('HTML comment keyword to skip a heading. Right-click heading → "Skip numbering".')
      .addText(t => t.setPlaceholder('skip').setValue(this.plugin.settings.skipMarker).onChange(async v => { this.plugin.settings.skipMarker = v; await this.plugin.saveSettings() }))
    new Setting(containerEl).setName('Show in status bar').addToggle(t => t.setValue(this.plugin.settings.showStatusBar)
      .onChange(async v => { this.plugin.settings.showStatusBar = v; await this.plugin.saveSettings(); this.plugin.updateStatusBar() }))

    // ═══ HOTKEYS ═══
    sectionHeader(containerEl, 'keyboard', 'Keyboard Shortcuts')
    new Setting(containerEl).setName('Manage hotkeys').setDesc('Opens Obsidian\'s hotkey settings pre-filtered to Auto Heading commands.')
      .addButton(b => b.setButtonText('Open Hotkeys').onClick(() => {
        const s = (this.app as any).setting; if (!s) return; s.open(); s.openTabById('hotkeys')
        setTimeout(() => {
          const t = s.activeTab
          if (t?.searchInputEl) {
            t.searchInputEl.value = 'Auto Heading'
            t.searchInputEl.dispatchEvent(new Event('input'))
            t.searchInputEl.focus()
          }
        }, 200)
      }))

    // ═══ COMMANDS ═══
    sectionHeader(containerEl, 'commands', 'Available Commands')
    containerEl.createEl('p', { text: 'Access these via Ctrl+P (Command Palette) or assign hotkeys above.', cls: 'ah-settings-description' })
    const cmdBox = containerEl.createEl('div', { cls: 'ah-settings-cmd-box' })
    const cmds: [string, string][] = [
      ['Toggle heading numbers', 'Turn numbering on/off for the current note. If turning on in burn-in mode, numbers are written immediately.'],
      ['Enable numbering for this note', 'Explicitly enable numbering for the current note, overriding scope rules.'],
      ['Disable numbering for this note', 'Explicitly disable numbering. Numbers stay in file but stop auto-updating.'],
      ['Burn in heading numbers', 'Write computed numbers into file text now. Same as the "Write Numbers to File" button.'],
      ['Remove burned-in heading numbers', 'Strip all numbers and disable auto-numbering. Same as "Remove & Stop" button.'],
      ['Force renumber all headings', 'Recalculate all numbers from scratch. Use after bulk edits or style changes.'],
      ['Toggle skip for heading at cursor', 'Add/remove <!-- skip --> marker for the heading at cursor position.'],
      ['Copy headings as numbered outline', 'Copy a numbered outline of all headings to clipboard.'],
      ['Save settings to front matter', 'Write current numbering settings into the note\'s front matter for per-note persistence.'],
      ['Quick configure numbering', 'Open a quick dialog to change numbering options for the current note.'],
    ]
    for (const [name, desc] of cmds) {
      const row = cmdBox.createEl('div', { cls: 'ah-cmd-row' })
      row.createEl('div', { text: name, cls: 'ah-cmd-name' })
      row.createEl('div', { text: desc, cls: 'ah-cmd-desc' })
    }

    // ═══ PER-NOTE ═══
    sectionHeader(containerEl, 'note', 'Per-Note Configuration')
    containerEl.createEl('p', { text: 'Override global settings for individual notes using front matter or comments.', cls: 'ah-settings-description' })
    const pn = containerEl.createEl('div', { cls: 'ah-settings-pernote-box' })
    pn.innerHTML = `
      <div class="ah-pernote-row"><code class="ah-pernote-code">auto-heading: auto</code><span class="ah-pernote-label">Enable numbering for this note</span></div>
      <div class="ah-pernote-row"><code class="ah-pernote-code">auto-heading: off</code><span class="ah-pernote-label">Disable numbering for this note</span></div>
      <div class="ah-pernote-row"><code class="ah-pernote-code">auto-heading: auto, skip-h1</code><span class="ah-pernote-label">Enable + skip H1 headings</span></div>
      <div class="ah-pernote-row"><code class="ah-pernote-code">auto-heading: auto, first-level 2, max 4</code><span class="ah-pernote-label">Custom level range</span></div>
      <div class="ah-pernote-row"><code class="ah-pernote-code">auto-heading: auto, start-at 3</code><span class="ah-pernote-label">Start numbering from 3</span></div>
      <div class="ah-pernote-divider"></div>
      <div class="ah-pernote-row"><strong>Skip a heading:</strong> <span class="ah-pernote-label">Right-click heading → "Skip numbering" — or add <code>&lt;!-- skip --&gt;</code> after it</span></div>
    `

    // Restore scroll
    if (scrollEl) requestAnimationFrame(() => { scrollEl.scrollTop = scrollPos })
  }

  private rebuild(scrollEl: Element | null | undefined): void {
    const pos = scrollEl?.scrollTop ?? 0
    this.display()
    if (scrollEl) requestAnimationFrame(() => { scrollEl.scrollTop = pos })
  }

  private renderScopeCard(container: HTMLElement): void {
    const card = container.createEl('div', { cls: 'ah-scope-card' })
    const paths = this.plugin.settings.scopePaths
    if (paths.length === 0) {
      card.createEl('div', { text: 'No folders or notes selected yet.', cls: 'ah-scope-card-empty' })
    } else {
      const list = card.createEl('div', { cls: 'ah-scope-card-list' })
      for (let i = 0; i < paths.length; i++) {
        const row = list.createEl('div', { cls: 'ah-scope-card-item' })
        const icon = paths[i].endsWith('.md') ? '📄' : '📁'
        row.createEl('span', { text: `${icon} ${paths[i]}`, cls: 'ah-scope-card-path' })
        const rm = row.createEl('button', { text: '✕', cls: 'ah-scope-card-remove' })
        rm.addEventListener('click', async () => { this.plugin.settings.scopePaths.splice(i, 1); await this.plugin.saveSettings(); this.rebuild(container.parentElement) })
      }
    }
    const acts = card.createEl('div', { cls: 'ah-scope-card-actions' })
    const af = acts.createEl('button', { text: '+ Add Folder', cls: 'ah-scope-btn-add' })
    af.addEventListener('click', () => {
      new FolderSuggestModal(this.app, this.plugin.getAllFolderPaths(), async f => {
        if (!this.plugin.settings.scopePaths.includes(f)) { this.plugin.settings.scopePaths.push(f); await this.plugin.saveSettings(); this.rebuild(container.parentElement) }
        else new Notice('Already in list.')
      }).open()
    })
    const an = acts.createEl('button', { text: '+ Add Note', cls: 'ah-scope-btn-add' })
    an.addEventListener('click', () => {
      new FileSuggestModal(this.app, this.app.vault.getMarkdownFiles().map(f => f.path).sort(), async f => {
        if (!this.plugin.settings.scopePaths.includes(f)) { this.plugin.settings.scopePaths.push(f); await this.plugin.saveSettings(); this.rebuild(container.parentElement) }
        else new Notice('Already in list.')
      }).open()
    })
    const cl = acts.createEl('button', { text: 'Clear All', cls: 'ah-scope-btn-clear' })
    cl.addEventListener('click', async () => { this.plugin.settings.scopePaths = []; await this.plugin.saveSettings(); this.rebuild(container.parentElement) })
  }

  private doBurnIn(): void {
    const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView)
    if (!view?.file) { new Notice('Open a note first.'); return }
    const md = this.plugin.app.metadataCache.getFileCache(view.file)
    if (!md?.headings) { new Notice('No headings found.'); return }
    const r = burnInNumbers(view.editor, md.headings, this.plugin.getEffectiveSettings(view.file))
    new Notice(`Auto Heading: ${r.message}`)
  }

  private doRemoveNumbers(): void {
    const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView)
    if (!view?.file) { new Notice('Open a note first.'); return }
    const md = this.plugin.app.metadataCache.getFileCache(view.file)
    if (!md?.headings) { new Notice('No headings found.'); return }
    const r = removeBurnedInNumbers(view.editor, md.headings)
    this.plugin.setPerNoteEnabled(view.file.path, false)
    this.plugin.refreshDecorations()
    new Notice(`Auto Heading: ${r.message}\nAuto-numbering disabled for this note.`)
  }
}
