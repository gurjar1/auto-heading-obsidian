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
  private navEl: HTMLElement
  private prevBtn: HTMLButtonElement
  private nextBtn: HTMLButtonElement

  constructor(private view: EditorView, private getPlugin: () => AutoHeadingPlugin | null) {
    this.el = activeDocument.createElement('div')
    this.el.className = 'ah-section-strip'

    this.breadcrumbEl = this.el.createDiv({ cls: 'ah-strip-breadcrumb' })
    this.navEl = this.el.createDiv({ cls: 'ah-strip-nav' })

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
    } else if ((this.getPlugin()?.settings as any).stripUpdateMode === 'scroll') {
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

    const mode = (plugin.settings as any).stripUpdateMode || 'cursor'
    let targetPos = this.view.state.selection.main.head
    if (mode === 'scroll') {
      // Find the line at the top of the viewport
      targetPos = this.view.viewport.from
    }
    const cursorLine = this.view.state.doc.lineAt(targetPos).number

    let currentIdx = -1
    for (let i = headings.length - 1; i >= 0; i--) {
      if (headings[i].lineNum <= cursorLine) { currentIdx = i; break }
    }

    const showBreadcrumb = (plugin.settings as any).stripShowBreadcrumb !== false
    const showNav = (plugin.settings as any).stripShowNavArrows !== false

    // Breadcrumb
    this.breadcrumbEl.empty()
    this.breadcrumbEl.style.display = showBreadcrumb ? '' : 'none'
    if (showBreadcrumb && currentIdx >= 0) {
      const chain = this.buildBreadcrumbChain(headings, currentIdx)
      chain.forEach((h, i) => {
        if (i > 0) this.breadcrumbEl.createSpan({ cls: 'ah-strip-separator', text: ' › ' })
        const crumb = this.breadcrumbEl.createSpan({
          cls: `ah-strip-crumb${i === chain.length - 1 ? ' ah-strip-crumb-active' : ''}`,
          text: h.text,
        })
        crumb.addEventListener('click', () => this.jumpTo(h.from))
      })
    }

    // Nav arrows
    this.navEl.style.display = showNav ? '' : 'none'
    this.prevBtn.disabled = currentIdx <= 0
    this.nextBtn.disabled = currentIdx >= headings.length - 1
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
