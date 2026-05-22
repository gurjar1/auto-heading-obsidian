/**
 * Auto Heading — Section Navigation Strip
 *
 * A slim bar at the top of the editor showing breadcrumb, progress dots,
 * navigation arrows, and word count / reading time.
 */

import { EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view'
import type { Extension } from '@codemirror/state'
import { syntaxTree } from '@codemirror/language'
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

function countWords(text: string): number {
  const t = text.trim()
  return t.length === 0 ? 0 : t.split(/\s+/).length
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
  private progressEl: HTMLElement
  private navEl: HTMLElement
  private statsEl: HTMLElement
  private prevBtn: HTMLButtonElement
  private nextBtn: HTMLButtonElement

  constructor(private view: EditorView, private getPlugin: () => AutoHeadingPlugin | null) {
    this.el = activeDocument.createElement('div')
    this.el.className = 'ah-section-strip'

    this.breadcrumbEl = this.el.createDiv({ cls: 'ah-strip-breadcrumb' })
    this.progressEl = this.el.createDiv({ cls: 'ah-strip-progress' })
    this.navEl = this.el.createDiv({ cls: 'ah-strip-nav' })
    this.statsEl = this.el.createDiv({ cls: 'ah-strip-stats' })

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

    view.dom.insertBefore(this.el, view.dom.firstChild)
    this.refresh()
  }

  update(update: ViewUpdate): void {
    if (update.selectionSet || update.docChanged || update.geometryChanged) {
      this.refresh()
    }
  }

  destroy(): void {
    this.el.remove()
  }

  private refresh(): void {
    const plugin = this.getPlugin()
    if (!plugin || (plugin.settings as any).stripEnabled === false) {
      this.el.classList.add('ah-strip-hidden')
      return
    }

    const headings = extractHeadings(this.view)
    if (headings.length === 0) {
      this.el.classList.add('ah-strip-hidden')
      return
    }
    this.el.classList.remove('ah-strip-hidden')

    const cursorPos = this.view.state.selection.main.head
    const cursorLine = this.view.state.doc.lineAt(cursorPos).number

    let currentIdx = -1
    for (let i = headings.length - 1; i >= 0; i--) {
      if (headings[i].lineNum <= cursorLine) { currentIdx = i; break }
    }

    const showBreadcrumb = (plugin.settings as any).stripShowBreadcrumb !== false
    const showProgress = (plugin.settings as any).stripShowProgress !== false
    const showWordCount = (plugin.settings as any).stripShowWordCount !== false
    const showNav = (plugin.settings as any).stripShowNavArrows !== false

    // Breadcrumb
    this.breadcrumbEl.empty()
    this.breadcrumbEl.style.display = showBreadcrumb ? '' : 'none'
    if (showBreadcrumb && currentIdx >= 0) {
      const chain = this.buildBreadcrumbChain(headings, currentIdx)
      chain.forEach((h, i) => {
        if (i > 0) this.breadcrumbEl.createSpan({ cls: 'ah-strip-sep', text: '›' })
        const crumb = this.breadcrumbEl.createSpan({
          cls: `ah-strip-crumb${i === chain.length - 1 ? ' ah-strip-crumb-active' : ''}`,
          text: h.text.substring(0, 30) + (h.text.length > 30 ? '…' : ''),
        })
        crumb.addEventListener('click', () => this.jumpTo(h.from))
      })
    }

    // Progress dots
    this.progressEl.empty()
    this.progressEl.style.display = showProgress ? '' : 'none'
    if (showProgress) {
      const minLevel = Math.min(...headings.map(h => h.level))
      const topLevel = headings.filter(h => h.level === minLevel)
      let activeTLIdx = -1
      for (let i = topLevel.length - 1; i >= 0; i--) {
        if (topLevel[i].lineNum <= cursorLine) { activeTLIdx = i; break }
      }
      topLevel.forEach((h, i) => {
        const dot = this.progressEl.createSpan({
          cls: `ah-strip-dot${i === activeTLIdx ? ' ah-strip-dot-active' : ''}`,
        })
        dot.addEventListener('click', () => this.jumpTo(h.from))
      })
    }

    // Nav arrows
    this.navEl.style.display = showNav ? '' : 'none'
    this.prevBtn.disabled = currentIdx <= 0
    this.nextBtn.disabled = currentIdx >= headings.length - 1

    // Stats
    this.statsEl.style.display = showWordCount ? '' : 'none'
    if (showWordCount) {
      const doc = this.view.state.doc
      const totalWords = countWords(doc.sliceString(0, doc.length))
      const totalTime = Math.max(1, Math.ceil(totalWords / 238))
      let sectionWords = 0
      if (currentIdx >= 0) {
        const start = doc.line(headings[currentIdx].lineNum).to + 1
        const end = currentIdx + 1 < headings.length
          ? doc.line(headings[currentIdx + 1].lineNum).from - 1
          : doc.length
        if (end > start) sectionWords = countWords(doc.sliceString(start, end))
      }
      this.statsEl.textContent = `${sectionWords}w / ${totalWords}w · ~${totalTime}min`
    }
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
}
