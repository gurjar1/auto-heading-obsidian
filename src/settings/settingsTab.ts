/**
 * Auto Heading — Settings Tab
 * SVG icons, toggle-based scope, no scroll jump, cleaner commands.
 */
import { App, FuzzySuggestModal, MarkdownView, Notice, PluginSettingTab, Setting } from 'obsidian'
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

// ─── SVG Icons (inserted via createSvg, not innerHTML) ──────────
function addSvgIcon(parent: HTMLElement, pathData: string[]): void {
  const svg = parent.createSvg('svg', { attr: { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' } })
  for (const d of pathData) {
    svg.createSvg('path', { attr: { d } })
  }
}

const ICON_PATHS: Record<string, string[]> = {
  mode: ['M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', 'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z'],
  scope: ['M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z'],
  numbering: ['M10 6h11M10 12h11M10 18h11M4 6h1v4M4 10h2M6 18H4c0-1 2-2 2-3s-1-1.5-2-1'],
  appearance: ['M13.5 9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z', 'M17.08 3.22a2.5 2.5 0 0 1 3.54 3.54L7.04 20.34a2.5 2.5 0 0 1-1.17.68l-3.54.89.89-3.54c.13-.43.37-.82.68-1.17z'],
  actions: ['M13 2 3 14h9l-1 8 10-12h-9l1-8'],
  advanced: ['M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z'],
  keyboard: ['M2 6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6zM6 8h.001M10 8h.001M14 8h.001M18 8h.001M8 12h.001M12 12h.001M16 12h.001M7 16h10'],
  commands: ['M4 17l6-6-6-6M12 19h8'],
  note: ['M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8'],
}

function sectionHeader(c: HTMLElement, key: string, title: string): void {
  const h = c.createEl('div', { cls: 'ah-settings-section-header' })
  if (ICON_PATHS[key]) addSvgIcon(h, ICON_PATHS[key])
  h.createEl('span', { text: title })
}

/** Toggle the disabled styling on a Setting element */
function setDisabled(setting: Setting, disabled: boolean): void {
  setting.settingEl.toggleClass('ah-settings-disabled', disabled)
}

export class AutoHeadingSettingTab extends PluginSettingTab {
  plugin: AutoHeadingPlugin
  /** Scroll position to restore after a rebuild; null means fresh open */
  private _pendingScrollRestore: number | null = null

  constructor(app: App, plugin: AutoHeadingPlugin) { super(app, plugin); this.plugin = plugin }

  display(): void {
    const { containerEl } = this
    const scrollEl = containerEl.parentElement
    const restorePos = this._pendingScrollRestore
    this._pendingScrollRestore = null
    containerEl.empty()

    // Use Setting heading API instead of createEl('h2')
    new Setting(containerEl).setName('Auto Heading').setHeading()

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
      // Build info box using DOM API instead of innerHTML
      const info = containerEl.createEl('div', { cls: 'ah-settings-info-box' })
      const strong1 = info.createEl('strong', { text: 'Auto-number' })
      info.appendText(' writes numbers into your file. Numbers appear in TOC, PDF, Publish.')
      info.createEl('br')
      info.appendText('Numbers auto-update after edits (configurable delay). ')
      info.createEl('strong', { text: 'Undo:' })
      info.appendText(' ')
      info.createEl('code', { text: 'Ctrl+Z' })

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
        await this.plugin.saveSettings()
        // Force renumber so skip changes take effect immediately
        this.plugin.triggerBurnIn()
        this.rebuild(scrollEl)
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
        dd.onChange(async v => { this.plugin.settings.separator = v as typeof VALID_SEPARATORS[number]; await this.plugin.saveSettings() })
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

    // ── Heading Indentation ──
    new Setting(containerEl).setName('Visual heading indentation').setDesc('Indent heading lines based on their level to create a visual tree.')
      .addToggle(t => t.setValue(this.plugin.settings.headingIndent)
        .onChange(async v => { this.plugin.settings.headingIndent = v; await this.plugin.saveSettings(); this.rebuild(scrollEl) }))

    if (this.plugin.settings.headingIndent) {
      new Setting(containerEl).setName('Indent size').setDesc('Pixels of indentation per heading level.')
        .addDropdown(dd => {
          for (const v of [8, 12, 16, 20, 24, 28, 32, 40]) dd.addOption(String(v), `${v}px`)
          dd.setValue(String(this.plugin.settings.headingIndentSize))
          dd.onChange(async v => { this.plugin.settings.headingIndentSize = parseInt(v); await this.plugin.saveSettings(); this.rebuild(scrollEl) })
        })

      new Setting(containerEl).setName('Show indent guides').setDesc('Draw subtle vertical lines alongside indented headings.')
        .addToggle(t => t.setValue(this.plugin.settings.headingIndentGuides)
          .onChange(async v => { this.plugin.settings.headingIndentGuides = v; await this.plugin.saveSettings() }))

      // Live preview
      const previewBox = containerEl.createEl('div', { cls: 'ah-indent-preview' })
      const indentPx = this.plugin.settings.headingIndentSize
      const previewLines = [
        { label: '# Title', level: 1 },
        { label: '## Section', level: 2 },
        { label: '### Subsection', level: 3 },
        { label: '#### Detail', level: 4 },
      ]
      for (const pl of previewLines) {
        const indent = pl.level === 1 ? 0 : (pl.level - 1) * indentPx
        const line = previewBox.createEl('div', {
          text: pl.label,
          cls: 'ah-indent-preview-line',
        })
        line.style.paddingLeft = `${indent}px`
      }
    }

    // ═══ HEADING GUTTER ═══
    sectionHeader(containerEl, 'appearance', 'Heading Gutter')
    containerEl.createEl('p', { text: 'Shows heading level badges (H1, H2, etc.) in the editor gutter.', cls: 'ah-settings-description' })

    // Collect child settings so the parent toggle can update their disabled state live
    const gutterChildren: Setting[] = []

    new Setting(containerEl).setName('Enable heading gutter').addToggle(t => t.setValue(this.plugin.settings.gutterEnabled)
      .onChange(async v => {
        this.plugin.settings.gutterEnabled = v; await this.plugin.saveSettings()
        for (const s of gutterChildren) setDisabled(s, !v)
      }))

    const gutBadge = new Setting(containerEl).setName('Show level badges').setDesc('Display H1, H2, H3 etc. in the gutter.')
      .addToggle(t => t.setValue(this.plugin.settings.gutterShowBadge).onChange(async v => { this.plugin.settings.gutterShowBadge = v; await this.plugin.saveSettings() }))
    setDisabled(gutBadge, !this.plugin.settings.gutterEnabled)
    gutterChildren.push(gutBadge)

    const gutWc = new Setting(containerEl).setName('Show word count on hover').setDesc('Tooltip with section word count and reading time.')
      .addToggle(t => t.setValue(this.plugin.settings.gutterShowWordCount).onChange(async v => { this.plugin.settings.gutterShowWordCount = v; await this.plugin.saveSettings() }))
    setDisabled(gutWc, !this.plugin.settings.gutterEnabled)
    gutterChildren.push(gutWc)

    // ═══ BREADCRUMB ═══
    sectionHeader(containerEl, 'appearance', 'Breadcrumb')
    containerEl.createEl('p', { text: 'A navigation bar at the top of the editor showing the current heading hierarchy.', cls: 'ah-settings-description' })

    const stripChildren: Setting[] = []

    new Setting(containerEl).setName('Enable breadcrumb bar').addToggle(t => t.setValue(this.plugin.settings.stripEnabled)
      .onChange(async v => {
        this.plugin.settings.stripEnabled = v; await this.plugin.saveSettings()
        for (const s of stripChildren) setDisabled(s, !v)
      }))

    const stripBc = new Setting(containerEl).setName('Show heading trail').setDesc('Heading hierarchy trail (e.g. Methods / Analysis).')
      .addToggle(t => t.setValue(this.plugin.settings.stripShowBreadcrumb).onChange(async v => { this.plugin.settings.stripShowBreadcrumb = v; await this.plugin.saveSettings() }))
    setDisabled(stripBc, !this.plugin.settings.stripEnabled)
    stripChildren.push(stripBc)

    const stripMode = new Setting(containerEl).setName('Breadcrumb update mode').setDesc('Track the cursor position or the scroll position.')
      .addDropdown(d => d
        .addOption('cursor', 'Text Cursor')
        .addOption('scroll', 'Scroll Position')
        .setValue(this.plugin.settings.stripUpdateMode)
        .onChange(async (v: 'cursor' | 'scroll') => { this.plugin.settings.stripUpdateMode = v; await this.plugin.saveSettings() }))
    setDisabled(stripMode, !this.plugin.settings.stripEnabled)
    stripChildren.push(stripMode)

    const stripNav = new Setting(containerEl).setName('Show navigation arrows').setDesc('Previous/next heading buttons.')
      .addToggle(t => t.setValue(this.plugin.settings.stripShowNavArrows).onChange(async v => { this.plugin.settings.stripShowNavArrows = v; await this.plugin.saveSettings() }))
    setDisabled(stripNav, !this.plugin.settings.stripEnabled)
    stripChildren.push(stripNav)

    // ═══ HEADING TOOLBAR ═══
    sectionHeader(containerEl, 'actions', 'Heading Inline Toolbar')
    containerEl.createEl('p', { text: 'Action buttons that appear when cursor is on a heading line.', cls: 'ah-settings-description' })

    const toolbarChildren: Setting[] = []

    new Setting(containerEl).setName('Enable heading toolbar').addToggle(t => t.setValue(this.plugin.settings.toolbarEnabled)
      .onChange(async v => {
        this.plugin.settings.toolbarEnabled = v; await this.plugin.saveSettings()
        for (const s of toolbarChildren) setDisabled(s, !v)
      }))

    const tbPromote = new Setting(containerEl).setName('Show promote/demote buttons').setDesc('Change heading level with a click.')
      .addToggle(t => t.setValue(this.plugin.settings.toolbarShowPromote).onChange(async v => { this.plugin.settings.toolbarShowPromote = v; await this.plugin.saveSettings() }))
    setDisabled(tbPromote, !this.plugin.settings.toolbarEnabled)
    toolbarChildren.push(tbPromote)

    const tbCopy = new Setting(containerEl).setName('Show copy link button').setDesc('Copy [[Note#Section]] link to clipboard.')
      .addToggle(t => t.setValue(this.plugin.settings.toolbarShowCopyLink).onChange(async v => { this.plugin.settings.toolbarShowCopyLink = v; await this.plugin.saveSettings() }))
    setDisabled(tbCopy, !this.plugin.settings.toolbarEnabled)
    toolbarChildren.push(tbCopy)

    const tbFormat = new Setting(containerEl).setName('Show format button').setDesc('Convert heading text to Title Case.')
      .addToggle(t => t.setValue(this.plugin.settings.toolbarShowFormat).onChange(async v => { this.plugin.settings.toolbarShowFormat = v; await this.plugin.saveSettings() }))
    setDisabled(tbFormat, !this.plugin.settings.toolbarEnabled)
    toolbarChildren.push(tbFormat)

    const tbSkip = new Setting(containerEl).setName('Show skip toggle').setDesc('Add/remove skip marker on heading.')
      .addToggle(t => t.setValue(this.plugin.settings.toolbarShowSkip).onChange(async v => { this.plugin.settings.toolbarShowSkip = v; await this.plugin.saveSettings() }))
    setDisabled(tbSkip, !this.plugin.settings.toolbarEnabled)
    toolbarChildren.push(tbSkip)

    // ═══ FOLD CONTROLS ═══
    sectionHeader(containerEl, 'actions', 'Enable Fold All Commands')
    new Setting(containerEl).setName('Enable commands').setDesc('Adds Fold/Unfold All commands to the command palette.')
      .addToggle(t => t.setValue(this.plugin.settings.foldButtonsEnabled).onChange(async v => { this.plugin.settings.foldButtonsEnabled = v; await this.plugin.saveSettings() }))
    sectionHeader(containerEl, 'actions', 'Quick Actions — This Note Only')
    containerEl.createEl('p', { text: 'These buttons apply to the currently open note only. Use Ctrl+Z to undo.', cls: 'ah-settings-description' })
    new Setting(containerEl).setName('Apply heading numbers').setDesc('Write computed numbers into headings right now. Appears in TOC and exports.')
      .addButton(b => b.setButtonText('Write Numbers to File').setCta().onClick(() => this.doBurnIn()))
    new Setting(containerEl).setName('Remove heading numbers').setDesc('Strip all numbers from headings and pause auto-numbering for this note.')
      .addButton(b => b.setButtonText('Remove & Stop').setWarning().onClick(() => this.doRemoveNumbers()))
    new Setting(containerEl).setName('Insert / Remove Table of Contents').setDesc('Toggle a ```toc block at the top of the current note.')
      .addButton(b => b.setButtonText('Toggle TOC').onClick(() => this.doToggleToc()))

    // ═══ ADVANCED ═══
    sectionHeader(containerEl, 'advanced', 'Advanced')
    new Setting(containerEl).setName('Detect existing numbers').setDesc('Replace manually-typed numbers like "1. Intro" with computed values.')
      .addToggle(t => t.setValue(this.plugin.settings.detectManualNumbers).onChange(async v => { this.plugin.settings.detectManualNumbers = v; await this.plugin.saveSettings() }))
    new Setting(containerEl).setName('Skip marker').setDesc('HTML comment keyword to skip a heading. Right-click heading → "Skip numbering".')
      .addText(t => t.setPlaceholder('skip').setValue(this.plugin.settings.skipMarker).onChange(async v => { this.plugin.settings.skipMarker = v; await this.plugin.saveSettings() }))
    new Setting(containerEl).setName('Show document stats in status bar').setDesc('Display heading count, word count, and reading time at the bottom of the window. Click to see a full document outline.')
      .addToggle(t => t.setValue(this.plugin.settings.showStatusBar)
      .onChange(async v => { this.plugin.settings.showStatusBar = v; await this.plugin.saveSettings(); this.plugin.updateStatusBar() }))

    // ═══ HOTKEYS ═══
    sectionHeader(containerEl, 'keyboard', 'Keyboard Shortcuts')
    new Setting(containerEl).setName('Manage hotkeys').setDesc('Opens Obsidian\'s hotkey settings pre-filtered to Auto Heading commands.')
      .addButton(b => b.setButtonText('Open Hotkeys').onClick(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const appSetting = (this.app as any).setting as { open: () => void; openTabById: (id: string) => void; activeTab: { searchInputEl: HTMLInputElement } } | undefined
        if (!appSetting) return
        appSetting.open()
        appSetting.openTabById('hotkeys')
        window.setTimeout(() => {
          const tab = appSetting.activeTab
          if (tab?.searchInputEl) {
            tab.searchInputEl.value = 'Auto Heading'
            tab.searchInputEl.dispatchEvent(new Event('input'))
            tab.searchInputEl.focus()
          }
        }, 200)
      }))

    // ═══ COMMANDS ═══
    sectionHeader(containerEl, 'commands', 'Available Commands')
    containerEl.createEl('p', { text: 'Access these via Ctrl+P (Command Palette) or assign hotkeys above.', cls: 'ah-settings-description' })
    const cmdBox = containerEl.createEl('div', { cls: 'ah-settings-cmd-box' })
    const cmds: [string, string][] = [
      ['Toggle heading numbers', 'Turn numbering on/off for the current note.'],
      ['Enable/Disable numbering for this note', 'Override scope rules for the current note.'],
      ['Burn in heading numbers', 'Write computed numbers into file text now.'],
      ['Remove burned-in heading numbers', 'Strip all numbers and disable auto-numbering.'],
      ['Force renumber all headings', 'Recalculate all numbers from scratch.'],
      ['Toggle skip for heading at cursor', 'Add/remove <!-- skip --> marker.'],
      ['Copy headings as numbered outline', 'Copy numbered outline to clipboard.'],
      ['Navigate: next/previous heading', 'Jump to the next or previous heading.'],
      ['Navigate: go to heading…', 'Fuzzy search picker to jump to any heading.'],
      ['Copy link to current section', 'Copy [[Note#Section]] link to clipboard.'],
      ['Fold/Unfold all headings', 'Fold or unfold all heading sections at once.'],
      ['Promote/Demote heading', 'Change heading level (e.g. H3→H2 or H2→H3).'],
      ['Format heading: Title Case', 'Convert heading text to Title Case.'],
      ['Format heading: Sentence case', 'Convert heading text to Sentence case.'],
      ['Quick configure numbering', 'Open a quick dialog to change numbering options.'],
      ['Save settings to front matter', 'Write settings into the note\'s front matter.'],
      ['Toggle Outline panel', 'Show or hide the Outline sidebar.'],
      ['Insert / Remove TOC block', 'Insert or remove a Table of Contents in the current note.'],
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
    const pnEntries: [string, string][] = [
      ['auto-heading: auto', 'Enable numbering for this note'],
      ['auto-heading: off', 'Disable numbering for this note'],
      ['auto-heading: auto, skip-h1', 'Enable + skip H1 headings'],
      ['auto-heading: auto, first-level 2, max 4', 'Custom level range'],
      ['auto-heading: auto, start-at 3', 'Start numbering from 3'],
      ['auto-heading: auto, indent', 'Enable visual heading indentation'],
      ['auto-heading: auto, indent, indent-size 24', 'Indent with custom size'],
      ['<!-- skip --> after a heading', 'Skip numbering for that heading'],
    ]
    for (const [code, label] of pnEntries) {
      const row = pn.createEl('div', { cls: 'ah-pernote-row' })
      row.createEl('code', { text: code, cls: 'ah-pernote-code' })
      row.createEl('span', { text: label, cls: 'ah-pernote-label' })
    }

    // Restore scroll position if this was a rebuild (not a fresh open)
    if (restorePos != null && scrollEl) {
      const el = scrollEl
      const pos = restorePos
      requestAnimationFrame(() => { el.scrollTop = pos })
    }
  }

  private rebuild(scrollEl: Element | null | undefined): void {
    this._pendingScrollRestore = scrollEl?.scrollTop ?? 0
    this.display()
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
        const icon = paths[i].endsWith('.md') ? '\uD83D\uDCC4' : '\uD83D\uDCC1'
        row.createEl('span', { text: `${icon} ${paths[i]}`, cls: 'ah-scope-card-path' })
        const rm = row.createEl('button', { text: '\u2715', cls: 'ah-scope-card-remove' })
        const idx = i
        rm.addEventListener('click', () => { void this.removeScopePath(idx, container) })
      }
    }
    const acts = card.createEl('div', { cls: 'ah-scope-card-actions' })
    const af = acts.createEl('button', { text: '+ Add Folder', cls: 'ah-scope-btn-add' })
    af.addEventListener('click', () => {
      new FolderSuggestModal(this.app, this.plugin.getAllFolderPaths(), (f: string) => { void this.addScopePath(f, container) }).open()
    })
    const an = acts.createEl('button', { text: '+ Add Note', cls: 'ah-scope-btn-add' })
    an.addEventListener('click', () => {
      new FileSuggestModal(this.app, this.app.vault.getMarkdownFiles().map(f => f.path).sort(), (f: string) => { void this.addScopePath(f, container) }).open()
    })
    const cl = acts.createEl('button', { text: 'Clear All', cls: 'ah-scope-btn-clear' })
    cl.addEventListener('click', () => { void this.clearScopePaths(container) })
  }

  private async removeScopePath(idx: number, _container: HTMLElement): Promise<void> {
    this.plugin.settings.scopePaths.splice(idx, 1)
    await this.plugin.saveSettings()
    this.rebuild(this.containerEl.parentElement)
  }

  private async addScopePath(path: string, _container: HTMLElement): Promise<void> {
    if (!this.plugin.settings.scopePaths.includes(path)) {
      this.plugin.settings.scopePaths.push(path)
      await this.plugin.saveSettings()
      this.rebuild(this.containerEl.parentElement)
    } else {
      new Notice('Already in list.')
    }
  }

  private async clearScopePaths(_container: HTMLElement): Promise<void> {
    this.plugin.settings.scopePaths = []
    await this.plugin.saveSettings()
    this.rebuild(this.containerEl.parentElement)
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

  private async doToggleToc(): Promise<void> {
    // Find the active markdown file even when settings panel is focused
    const file = this.plugin.app.workspace.getActiveFile()
    if (!file) { new Notice('Open a note first.'); return }

    await this.plugin.app.vault.process(file, (content) => {
      const tocRegex = /```(?:toc|ah-toc)\s*\n[\s\S]*?```\s*\n?\n?/m
      const match = content.match(tocRegex)

      if (match && match.index != null) {
        // Remove existing TOC block
        const result = content.substring(0, match.index) + content.substring(match.index + match[0].length)
        new Notice('Auto Heading: TOC block removed.')
        return result
      } else {
        // Insert TOC after front matter or at the top
        const tocBlock = '```toc\ntitle: Table of Contents\nstyle: numbered\nlevel: 1-6\n```\n\n'
        let insertIdx = 0
        if (content.startsWith('---')) {
          const fmEnd = content.indexOf('\n---', 3)
          if (fmEnd >= 0) {
            insertIdx = fmEnd + 4 // after closing ---
            if (content[insertIdx] === '\n') insertIdx++
          }
        }
        new Notice('Auto Heading: TOC block inserted.')
        return content.substring(0, insertIdx) + tocBlock + content.substring(insertIdx)
      }
    })
  }
}
