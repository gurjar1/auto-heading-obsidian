/**
 * Auto Heading — Quick Configuration Modal
 *
 * A compact dialog for rapid configuration without opening the full settings.
 * Activated via command palette or hotkey.
 */

import { App, Modal, Setting } from 'obsidian'
import type AutoHeadingPlugin from '../main'
import { NumberingStyle } from '../core/numberingTokens'
import { VALID_SEPARATORS } from './settingsTypes'

export class QuickConfigModal extends Modal {
  plugin: AutoHeadingPlugin

  constructor(app: App, plugin: AutoHeadingPlugin) {
    super(app)
    this.plugin = plugin
  }

  onOpen(): void {
    const { contentEl, titleEl } = this

    titleEl.setText('Auto Heading — Quick Configure')

    contentEl.createEl('p', {
      text: 'Adjust numbering settings for all documents. Per-note overrides via front matter take priority.',
      cls: 'ah-modal-description',
    })

    // Enabled
    new Setting(contentEl)
      .setName('Enabled')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.enabled)
        .onChange(async (value) => {
          this.plugin.settings.enabled = value
          await this.plugin.saveSettings()
          this.plugin.refreshDecorations()
        }))

    // Skip H1
    new Setting(contentEl)
      .setName('Skip H1')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.skipH1)
        .onChange(async (value) => {
          this.plugin.settings.skipH1 = value
          await this.plugin.saveSettings()
          this.plugin.refreshDecorations()
        }))

    // Level range
    new Setting(contentEl)
      .setName('Level range')
      .setDesc('First → Max')
      .addSlider(slider => slider
        .setLimits(1, 6, 1)
        .setValue(this.plugin.settings.firstLevel)
        .setDynamicTooltip()
        .onChange(async (value) => {
          this.plugin.settings.firstLevel = value
          await this.plugin.saveSettings()
          this.plugin.refreshDecorations()
        }))
      .addSlider(slider => slider
        .setLimits(1, 6, 1)
        .setValue(this.plugin.settings.maxLevel)
        .setDynamicTooltip()
        .onChange(async (value) => {
          this.plugin.settings.maxLevel = value
          await this.plugin.saveSettings()
          this.plugin.refreshDecorations()
        }))

    // Start at
    new Setting(contentEl)
      .setName('Start at')
      .addText(text => text
        .setPlaceholder('1')
        .setValue(this.plugin.settings.startAt)
        .onChange(async (value) => {
          this.plugin.settings.startAt = value
          await this.plugin.saveSettings()
          this.plugin.refreshDecorations()
        }))

    // Per-level style picker
    const styleSection = contentEl.createEl('div')
    styleSection.createEl('div', { text: 'Style per level', cls: 'setting-item-name' })

    const previewEl = styleSection.createEl('div', {
      cls: 'ah-style-grid-preview',
      text: this.getStylePreview(),
    })

    const styleLabels: Record<string, string> = {
      '1': '1 (Arabic)', 'A': 'A (Upper)', 'a': 'a (Lower)',
      'I': 'I (Roman)', 'i': 'i (roman)',
    }
    const styleOptions = ['1', 'A', 'a', 'I', 'i']

    for (let lvl = 0; lvl < 6; lvl++) {
      new Setting(styleSection)
        .setName(`H${lvl + 1}`)
        .addDropdown(dd => {
          for (const s of styleOptions) dd.addOption(s, styleLabels[s])
          dd.setValue(this.plugin.settings.levelStyles[lvl])
          dd.onChange(async (v) => {
            this.plugin.settings.levelStyles[lvl] = v as NumberingStyle
            await this.plugin.saveSettings()
            this.plugin.refreshDecorations()
            previewEl.textContent = this.getStylePreview()
          })
        })
    }

    // Separator
    new Setting(contentEl)
      .setName('Separator')
      .addDropdown(dropdown => {
        const labels: Record<string, string> = {
          '': '(none)', ' ': 'Space', '.': 'Dot', ':': 'Colon',
          '-': 'Dash', '—': 'Em-dash', ')': 'Paren',
        }
        for (const sep of VALID_SEPARATORS) {
          dropdown.addOption(sep, labels[sep] || sep)
        }
        dropdown.setValue(this.plugin.settings.separator)
        dropdown.onChange(async (value) => {
          this.plugin.settings.separator = value as typeof VALID_SEPARATORS[number]
          await this.plugin.saveSettings()
          this.plugin.refreshDecorations()
        })
      })

    // Opacity
    new Setting(contentEl)
      .setName('Opacity')
      .addSlider(slider => slider
        .setLimits(0.1, 1.0, 0.05)
        .setValue(this.plugin.settings.numberOpacity)
        .setDynamicTooltip()
        .onChange(async (value) => {
          this.plugin.settings.numberOpacity = value
          await this.plugin.saveSettings()
          this.plugin.refreshDecorations()
        }))

    // Heading Indentation
    new Setting(contentEl)
      .setName('Visual indentation')
      .setDesc('Indent heading lines by level')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.headingIndent)
        .onChange(async (value) => {
          this.plugin.settings.headingIndent = value
          await this.plugin.saveSettings()
          this.plugin.refreshDecorations()
        }))

    // Close button
    const buttonContainer = contentEl.createEl('div', { cls: 'ah-modal-buttons' })
    const closeBtn = buttonContainer.createEl('button', { text: 'Done', cls: 'mod-cta' })
    closeBtn.addEventListener('click', () => this.close())
  }

  onClose(): void {
    const { contentEl, titleEl } = this
    contentEl.empty()
    titleEl.empty()
  }

  private getStylePreview(): string {
    const styles = this.plugin.settings.levelStyles
    const sep = this.plugin.settings.levelSeparator || '.'
    const samples: Record<string, string> = { '1': '1', 'A': 'A', 'a': 'a', 'I': 'I', 'i': 'i' }
    return `Preview: ${styles.slice(0, 4).map(s => samples[s] || '1').join(sep)}`
  }
}
