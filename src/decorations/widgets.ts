/**
 * Auto Heading — Decoration Widgets
 *
 * Widget definitions for rendering heading numbers in the editor.
 */

import { EditorView, WidgetType } from '@codemirror/view'

/**
 * A widget that renders a heading number as a styled <span>.
 * The displayText already includes the separator — widget renders it as-is.
 */
export class HeadingNumberWidget extends WidgetType {
  constructor(
    readonly displayText: string,
    readonly level: number,
    readonly opacity: number,
  ) {
    super()
  }

  toDOM(_view: EditorView): HTMLElement {
    const span = document.createElement('span')
    span.className = `ah-number ah-number-level-${this.level}`
    span.textContent = this.displayText
    span.style.opacity = String(this.opacity)
    span.setAttribute('aria-hidden', 'true')
    span.setAttribute('contenteditable', 'false')
    return span
  }

  eq(other: HeadingNumberWidget): boolean {
    return this.displayText === other.displayText &&
           this.level === other.level &&
           this.opacity === other.opacity
  }

  get estimatedHeight(): number {
    return -1
  }

  ignoreEvent(): boolean {
    return true
  }
}
