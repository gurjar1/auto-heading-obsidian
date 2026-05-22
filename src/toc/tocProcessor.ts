/**
 * Auto Heading — TOC Code Block Processor
 *
 * Renders a live table of contents from ```toc or ```ah-toc code blocks.
 * Auto-refreshes when headings change.
 */

import { TFile, MarkdownPostProcessorContext, MarkdownView } from 'obsidian'
import type AutoHeadingPlugin from '../main'
import { analyzeHeadings } from '../core/headingAnalyzer'

interface TocOptions {
  minLevel: number
  maxLevel: number
  style: 'numbered' | 'bulleted' | 'plain'
  title: string
  indent: boolean
}

function parseOptions(source: string): TocOptions {
  const opts: TocOptions = { minLevel: 1, maxLevel: 6, style: 'numbered', title: '', indent: true }
  for (const line of source.split('\n')) {
    const m = line.match(/^\s*(\w+)\s*:\s*(.+)\s*$/)
    if (!m) continue
    const [, key, val] = m
    switch (key.toLowerCase()) {
      case 'level': {
        const lm = val.match(/(\d)-(\d)/)
        if (lm) { opts.minLevel = +lm[1]; opts.maxLevel = +lm[2] }
        break
      }
      case 'style': opts.style = val.trim() as TocOptions['style']; break
      case 'title': opts.title = val.trim(); break
      case 'indent': opts.indent = val.trim().toLowerCase() !== 'false'; break
    }
  }
  return opts
}

/** Renders the TOC content into an element */
async function renderToc(plugin: AutoHeadingPlugin, source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext): Promise<void> {
  const opts = parseOptions(source)
  const file = plugin.app.vault.getAbstractFileByPath(ctx.sourcePath)
  if (!(file instanceof TFile)) return

  const metadata = plugin.app.metadataCache.getFileCache(file)
  if (!metadata?.headings || metadata.headings.length === 0) {
    el.createEl('p', { text: 'No headings found.', cls: 'ah-toc-empty' })
    return
  }

  const content = await plugin.app.vault.cachedRead(file)
  const lines = content.split('\n')
  const getLine = (line: number) => lines[line] || ''
  const settings = plugin.getEffectiveSettings(file)
  const analysis = analyzeHeadings(metadata.headings, getLine, settings)

  const container = el.createDiv({ cls: 'ah-toc' })
  if (opts.title) container.createDiv({ cls: 'ah-toc-title', text: opts.title })

  const filtered = analysis.headings.filter(h =>
    h.level >= opts.minLevel && h.level <= opts.maxLevel
  )
  if (filtered.length === 0) {
    container.createEl('p', { text: 'No headings in selected range.' })
    return
  }

  const baseLevel = Math.min(...filtered.map(h => h.level))
  const list = container.createEl(opts.style === 'bulleted' ? 'ul' : opts.style === 'numbered' ? 'ol' : 'ul', { cls: 'ah-toc-list' })

  for (const h of filtered) {
    let parent: HTMLElement = list
    if (opts.indent) {
      const depth = h.level - baseLevel
      for (let d = 0; d < depth; d++) {
        let sub = parent.querySelector(':scope > li:last-child > ul, :scope > li:last-child > ol') as HTMLElement | null
        if (!sub) {
          const lastLi = parent.querySelector(':scope > li:last-child') as HTMLElement
          if (lastLi) {
            sub = lastLi.createEl(opts.style === 'bulleted' ? 'ul' : 'ol', { cls: 'ah-toc-list' })
          } else break
        }
        parent = sub
      }
    }

    const li = parent.createEl('li', { cls: 'ah-toc-item' })
    const a = li.createEl('a', { cls: 'ah-toc-link' })
    a.setAttribute('href', `#${h.cleanTitle}`)
    if (!h.isSkipped && h.formattedNumber) {
      a.createSpan({ cls: 'ah-toc-number', text: h.formattedNumber + settings.separator + ' ' })
    }
    a.createSpan({ text: h.cleanTitle })
    a.addEventListener('click', (e) => {
      e.preventDefault()
      const view = plugin.app.workspace.getActiveViewOfType(MarkdownView)
      if (view) {
        view.editor.setCursor({ line: h.line, ch: 0 })
        view.editor.scrollIntoView({ from: { line: h.line, ch: 0 }, to: { line: h.line, ch: 0 } }, true)
      }
    })
  }
}

export function registerTocProcessor(plugin: AutoHeadingPlugin): void {
  // Track active TOC elements for live refresh
  const activeTocEntries: { el: HTMLElement; source: string; ctx: MarkdownPostProcessorContext }[] = []

  const processor = async (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
    await renderToc(plugin, source, el, ctx)

    // Track this TOC element for live refresh
    const entry = { el, source, ctx }
    activeTocEntries.push(entry)

    // Clean up when element is removed from DOM
    const observer = new MutationObserver(() => {
      if (!el.isConnected) {
        const idx = activeTocEntries.indexOf(entry)
        if (idx >= 0) activeTocEntries.splice(idx, 1)
        observer.disconnect()
      }
    })
    observer.observe(el.parentElement || activeDocument.body, { childList: true, subtree: true })
  }

  plugin.registerMarkdownCodeBlockProcessor('toc', processor)
  plugin.registerMarkdownCodeBlockProcessor('ah-toc', processor)

  // Live refresh: re-render all visible TOC blocks when metadata changes
  plugin.registerEvent(
    plugin.app.metadataCache.on('changed', (file: TFile) => {
      const activeFile = plugin.app.workspace.getActiveFile()
      if (!activeFile || file.path !== activeFile.path) return

      // Re-render all active TOC elements for this file
      for (const entry of activeTocEntries) {
        if (entry.ctx.sourcePath === file.path && entry.el.isConnected) {
          entry.el.empty()
          renderToc(plugin, entry.source, entry.el, entry.ctx)
        }
      }
    })
  )
}
