/**
 * Auto Heading — Section Navigation Strip
 *
 * A slim bar at the top of the editor showing breadcrumb, progress dots,
 * navigation arrows, and word count / reading time.
 */

import { EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view'
import type { Extension } from '@codemirror/state'
import { syntaxTree } from '@codemirror/language'
import { Notice } from 'obsidian'
import type AutoHeadingPlugin from '../main'

interface SimpleHeading {
  level: number
  lineNum: number
  from: number
  text: string
}

function extractHeadings(view: EditorView): SimpleHeading[] {
  const doc = view.state.doc
  const result: SimpleHeading[] = []
  syntaxTree(view.state).iterate({
    enter: (node) => {
      if (node.name.includes('header') || node.name.includes('Heading')) {
        const line = doc.lineAt(node.from)
        const m = line.text.match(/^\s{0,3}(#{1,6})\s+(.+)/)
        if (m && !result.some(h => h.lineNum === line.number)) {
          result.push({ level: m[1].length, lineNum: line.number, from: line.from, text: m[2] })
        }
      }
    }
  })
  return result
}


export function createSectionStrip(getPlugin: () => AutoHeadingPlugin | null): Extension {
  return ViewPlugin.define(
    (view) => {
      const strip = new SectionStripView(view, getPlugin)
      return strip
    },
    {}
  )
}

class SectionStripView {
  private el: HTMLElement
  private breadcrumbEl: HTMLElement
  private navEl: HTMLElement
  private tocEl: HTMLElement
  private prevBtn: HTMLButtonElement
  private nextBtn: HTMLButtonElement
  private tocBtn: HTMLButtonElement
  private scrollHandler: () => void

  constructor(private view: EditorView, private getPlugin: () => AutoHeadingPlugin | null) {
    this.el = activeDocument.createElement('div')
    this.el.className = 'ah-section-strip'

    this.breadcrumbEl = this.el.createDiv({ cls: 'ah-strip-breadcrumb' })
    this.navEl = this.el.createDiv({ cls: 'ah-strip-nav' })
    this.tocEl = this.el.createDiv({ cls: 'ah-strip-nav' })

    this.prevBtn = activeDocument.createElement('button')
    this.prevBtn.className = 'ah-strip-btn'
    this.prevBtn.textContent = '◀'
    this.prevBtn.title = 'Previous heading'
    this.prevBtn.addEventListener('click', () => this.navigatePrev())
    this.navEl.appendChild(this.prevBtn)

    this.nextBtn = activeDocument.createElement('button')
    this.nextBtn.className = 'ah-strip-btn'
    this.nextBtn.textContent = '▶'
    this.nextBtn.title = 'Next heading'
    this.nextBtn.addEventListener('click', () => this.navigateNext())
    this.navEl.appendChild(this.nextBtn)

    // TOC toggle button (separate container for independent toggle)
    this.tocBtn = activeDocument.createElement('button')
    this.tocBtn.className = 'ah-strip-btn ah-strip-toc-btn'
    this.tocBtn.textContent = '☰'
    this.tocBtn.title = 'Toggle Table of Contents'
    this.tocBtn.addEventListener('click', () => this.toggleToc())
    this.tocEl.appendChild(this.tocBtn)

    // Remove any existing strips to prevent duplicates on plugin recreation
    view.dom.querySelectorAll('.ah-section-strip').forEach(el => el.remove())
    view.dom.insertBefore(this.el, view.dom.firstChild)

    this.scrollHandler = () => {
      if (this.getPlugin()?.settings.stripUpdateMode === 'scroll') {
        this.refresh()
      }
    }
    this.view.scrollDOM.addEventListener('scroll', this.scrollHandler, { passive: true })

    window.requestAnimationFrame(() => this.refresh())
  }

  update(update: ViewUpdate): void {
    if (update.selectionSet || update.docChanged || update.geometryChanged) {
      this.refresh()
    } else if (this.getPlugin()?.settings.stripUpdateMode === 'scroll') {
      this.refresh()
    }
  }

  destroy(): void {
    this.view.scrollDOM.removeEventListener('scroll', this.scrollHandler)
    this.el.remove()
  }

  private refresh(): void {
    const plugin = this.getPlugin()
    if (!plugin || plugin.settings.stripEnabled === false) {
      this.el.classList.add('ah-strip-hidden')
      return
    }

    const headings = extractHeadings(this.view)
    if (headings.length === 0) {
      this.el.classList.add('ah-strip-hidden')
      return
    }
    this.el.classList.remove('ah-strip-hidden')

    const mode = plugin.settings.stripUpdateMode || 'cursor'
    let targetPos = this.view.state.selection.main.head
    if (mode === 'scroll') {
      try {
        const rect = this.view.scrollDOM.getBoundingClientRect()
        const pos = this.view.posAtCoords({ x: rect.left + 50, y: rect.top + 40 }, false)
        if (pos != null) {
          targetPos = pos
        } else {
          const block = this.view.lineBlockAtHeight(this.view.scrollDOM.scrollTop)
          targetPos = block ? block.from : this.view.viewport.from
        }
      } catch {
        // posAtCoords can throw during an update cycle; fall back to cursor
      }
    }
    const cursorLine = this.view.state.doc.lineAt(targetPos).number

    let currentIdx = -1
    for (let i = headings.length - 1; i >= 0; i--) {
      if (headings[i].lineNum <= cursorLine) { currentIdx = i; break }
    }

    const showBreadcrumb = plugin.settings.stripShowBreadcrumb !== false
    const showNav = plugin.settings.stripShowNavArrows !== false
    const showToc = plugin.settings.stripShowTocButton !== false

    // Breadcrumb
    this.breadcrumbEl.empty()
    this.breadcrumbEl.toggleClass('ah-strip-hidden', !showBreadcrumb)
    if (showBreadcrumb && currentIdx >= 0) {
      const chain = this.buildBreadcrumbChain(headings, currentIdx)
      chain.forEach((h, i) => {
        if (i > 0) this.breadcrumbEl.createSpan({ cls: 'ah-strip-separator', text: ' / ' })
        const crumb = this.breadcrumbEl.createSpan({
          cls: `ah-strip-crumb${i === chain.length - 1 ? ' ah-strip-crumb-active' : ''}`,
          text: h.text,
        })
        crumb.addEventListener('click', () => this.jumpTo(h.from))
      })
    }

    // Nav arrows
    this.navEl.toggleClass('ah-strip-hidden', !showNav)
    this.prevBtn.disabled = currentIdx <= 0
    this.nextBtn.disabled = currentIdx >= headings.length - 1

    // TOC button
    this.tocEl.toggleClass('ah-strip-hidden', !showToc)
  }

  private buildBreadcrumbChain(headings: SimpleHeading[], idx: number): SimpleHeading[] {
    const chain: SimpleHeading[] = [headings[idx]]
    let targetLevel = headings[idx].level
    for (let i = idx - 1; i >= 0 && targetLevel > 1; i--) {
      if (headings[i].level < targetLevel) {
        chain.unshift(headings[i])
        targetLevel = headings[i].level
      }
    }
    return chain
  }

  private navigatePrev(): void {
    const headings = extractHeadings(this.view)
    const cursorLine = this.view.state.doc.lineAt(this.view.state.selection.main.head).number
    for (let i = headings.length - 1; i >= 0; i--) {
      if (headings[i].lineNum < cursorLine) { this.jumpTo(headings[i].from); return }
    }
  }

  private navigateNext(): void {
    const headings = extractHeadings(this.view)
    const cursorLine = this.view.state.doc.lineAt(this.view.state.selection.main.head).number
    for (const h of headings) {
      if (h.lineNum > cursorLine) { this.jumpTo(h.from); return }
    }
  }

  private jumpTo(pos: number): void {
    this.view.dispatch({ selection: { anchor: pos }, scrollIntoView: true })
    this.view.focus()
  }

  private toggleToc(): void {
    const plugin = this.getPlugin()
    if (!plugin) return
    const file = plugin.app.workspace.getActiveFile()
    if (!file) { new Notice('No active note.'); return }

    void plugin.app.vault.process(file, (content) => {
      const tocRegex = /```(?:toc|ah-toc)\s*\n[\s\S]*?```\s*\n?\n?/m
      const match = content.match(tocRegex)
      if (match && match.index != null) {
        new Notice('Auto Heading: TOC removed.')
        return content.substring(0, match.index) + content.substring(match.index + match[0].length)
      } else {
        const tocBlock = '```toc\ntitle: Table of Contents\nstyle: numbered\nlevel: 1-6\n```\n\n'
        let idx = 0
        if (content.startsWith('---')) {
          const fmEnd = content.indexOf('\n---', 3)
          if (fmEnd >= 0) { idx = fmEnd + 4; if (content[idx] === '\n') idx++ }
        }
        new Notice('Auto Heading: TOC inserted.')
        return content.substring(0, idx) + tocBlock + content.substring(idx)
      }
    })
  }
}
