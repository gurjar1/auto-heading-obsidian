/**
 * Auto Heading — TOC Code Block Processor
 *
 * Renders a live table of contents from ```toc or ```ah-toc code blocks.
 * Auto-refreshes when headings change (debounced).
 */

import { TFile, MarkdownPostProcessorContext, MarkdownView, debounce } from 'obsidian'
import type AutoHeadingPlugin from '../main'
import { analyzeHeadings } from '../core/headingAnalyzer'

interface TocOptions {
  minLevel: number
  maxLevel: number
  style: 'numbered' | 'bulleted' | 'plain'
  title: string
  indent: boolean
  collapsed: boolean
}

function parseOptions(source: string): TocOptions {
  const opts: TocOptions = { minLevel: 1, maxLevel: 6, style: 'numbered', title: '', indent: true, collapsed: false }
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
      case 'collapsed': opts.collapsed = val.trim().toLowerCase() !== 'false'; break
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

  // Read the full file content to detect <!-- skip --> comments on heading lines
  const content = await plugin.app.vault.cachedRead(file)
  const lines = content.split('\n')
  const getLine = (line: number) => lines[line] || ''
  const settings = plugin.getEffectiveSettings(file)
  const analysis = analyzeHeadings(metadata.headings, getLine, settings)

  const wrapper = el.createDiv({ cls: 'ah-toc' })
  const title = opts.title || 'Table of Contents'

  // Use <details>/<summary> for collapse support
  const details = wrapper.createEl('details', { cls: 'ah-toc-details' })
  if (!opts.collapsed) details.setAttribute('open', '')
  details.createEl('summary', { cls: 'ah-toc-title', text: title })
  const container = details

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
        let sub = parent.querySelector<HTMLElement>(':scope > li:last-child > ul, :scope > li:last-child > ol')
        if (!sub) {
          const lastLi = parent.querySelector(':scope > li:last-child') as HTMLElement
          if (lastLi) {
            sub = lastLi.createEl(opts.style === 'bulleted' ? 'ul' : 'ol', { cls: 'ah-toc-list' })
          } else break
        }
        parent = sub
      }
    }

    const li = parent.createEl('li', { cls: `ah-toc-item ah-toc-level-${h.level}` })
    if (h.isSkipped) li.addClass('ah-toc-skipped')
    const a = li.createEl('a', { cls: 'ah-toc-link' })
    a.setAttribute('href', `#${h.cleanTitle}`)
    if (!h.isSkipped && h.formattedNumber) {
      a.createSpan({ cls: 'ah-toc-number', text: h.formattedNumber + settings.separator + ' ' })
    }
    a.createSpan({ cls: 'ah-toc-text', text: h.cleanTitle })
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
    activeTocEntries.push({ el, source, ctx })
  }

  plugin.registerMarkdownCodeBlockProcessor('toc', processor)
  plugin.registerMarkdownCodeBlockProcessor('ah-toc', processor)

  // Debounced refresh (300ms). Also prunes disconnected entries.
  const debouncedRefresh = debounce((filePath: string) => {
    // Prune stale entries first
    for (let i = activeTocEntries.length - 1; i >= 0; i--) {
      if (!activeTocEntries[i].el.isConnected) activeTocEntries.splice(i, 1)
    }
    for (const entry of activeTocEntries) {
      if (entry.ctx.sourcePath === filePath) {
        entry.el.empty()
        void renderToc(plugin, entry.source, entry.el, entry.ctx)
      }
    }
  }, 300, true)

  plugin.registerEvent(
    plugin.app.metadataCache.on('changed', (file: TFile) => {
      if (activeTocEntries.length === 0) return
      debouncedRefresh(file.path)
    })
  )
}
