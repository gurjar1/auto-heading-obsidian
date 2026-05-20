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

    // Quick style preset
    new Setting(contentEl)
      .setName('Style preset')
      .addDropdown(dropdown => {
        dropdown.addOption('numeric', '1.1.1 (Numeric)')
        dropdown.addOption('letter-numeric', 'A.1.a (Mixed)')
        dropdown.addOption('roman-letter', 'I.A.1 (Formal)')
        dropdown.addOption('letter', 'A.A.A (All Letters)')
        dropdown.addOption('roman', 'I.I.I (All Roman)')

        // Determine current preset
        const styles = this.plugin.settings.levelStyles
        let currentPreset = 'numeric'
        if (styles[0] === 'A' && styles[1] === '1' && styles[2] === 'a') currentPreset = 'letter-numeric'
        else if (styles[0] === 'I' && styles[1] === 'A' && styles[2] === '1') currentPreset = 'roman-letter'
        else if (styles.every(s => s === 'A')) currentPreset = 'letter'
        else if (styles.every(s => s === 'I')) currentPreset = 'roman'

        dropdown.setValue(currentPreset)
        dropdown.onChange(async (value) => {
          const presets: Record<string, [NumberingStyle, NumberingStyle, NumberingStyle, NumberingStyle, NumberingStyle, NumberingStyle]> = {
            'numeric': ['1', '1', '1', '1', '1', '1'],
            'letter-numeric': ['A', '1', 'a', '1', 'a', '1'],
            'roman-letter': ['I', 'A', '1', 'a', '1', '1'],
            'letter': ['A', 'A', 'A', 'A', 'A', 'A'],
            'roman': ['I', 'I', 'I', 'I', 'I', 'I'],
          }
          if (presets[value]) {
            this.plugin.settings.levelStyles = [...presets[value]]
            await this.plugin.saveSettings()
            this.plugin.refreshDecorations()
          }
        })
      })

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
}
