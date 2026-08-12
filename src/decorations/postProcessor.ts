/**
 * Auto Heading — Reading View Post-Processor
 *
 * Adds heading numbers to Reading View (and PDF exports) via
 * Obsidian's MarkdownPostProcessor API.
 *
 * Uses a PRE-COMPUTED HeadingAnalysis (from the core headingAnalyzer)
 * to look up the correct number for each heading. This approach is
 * immune to section re-rendering order issues because numbers are
 * computed on the full document, not accumulated per-section.
 *
 * This works by injecting styled <span> elements into the rendered HTML
 * WITHOUT modifying the underlying Markdown file.
 */

import { MarkdownPostProcessorContext } from 'obsidian'
import { AutoHeadingSettings } from '../settings/settingsTypes'
import { AnalyzedHeading, HeadingAnalysis } from '../core/headingAnalyzer'

// ─── Shared State ─────────────────────────────────────────────────────

interface FileDecorationState {
  analysis: HeadingAnalysis
  settings: AutoHeadingSettings
  enabled: boolean
}

// Per-file state prevents one reading or pinned pane from inheriting another
// pane's settings when focus changes.
const fileStates = new Map<string, FileDecorationState>()

interface MutableTextNode {
  textContent: string | null
}

/** Remove a source prefix even when Obsidian inserts DOM nodes before it. */
export function stripLeadingManualNumber(
  textNodes: MutableTextNode[],
  sourcePrefix: string,
): boolean {
  const firstContentNode = textNodes.findIndex(
    node => (node.textContent || '').trim().length > 0,
  )
  if (firstContentNode < 0) return false

  const combinedText = textNodes
    .slice(firstContentNode)
    .map(node => node.textContent || '')
    .join('')
  const withoutMarker = sourcePrefix.replace(/^\u2060/, '')
  const prefix = [sourcePrefix, withoutMarker]
    .filter((candidate, index, all) => candidate.length > 0 && all.indexOf(candidate) === index)
    .find(candidate => combinedText.startsWith(candidate))
  if (!prefix) return false

  let remaining = prefix.length
  for (let index = firstContentNode; index < textNodes.length && remaining > 0; index++) {
    const node = textNodes[index]
    const text = node.textContent || ''
    const removed = Math.min(text.length, remaining)
    node.textContent = text.substring(removed)
    remaining -= removed
  }

  return remaining === 0
}

function getTextNodes(element: HTMLElement): Text[] {
  const nodes: Text[] = []
  const walker = activeDocument.createTreeWalker(element, NodeFilter.SHOW_TEXT)
  let node = walker.nextNode()
  while (node) {
    nodes.push(node as Text)
    node = walker.nextNode()
  }
  return nodes
}

/**
 * Update the pre-computed heading analysis for a file.
 * Called from main.ts when a file is opened or its metadata changes.
 */
export function updateFileAnalysis(
  sourcePath: string,
  analysis: HeadingAnalysis,
  settings: AutoHeadingSettings,
  enabled: boolean,
): void {
  fileStates.set(sourcePath, { analysis, settings, enabled })
}

/**
 * Reset the analysis for a specific file.
 * Call this when a file is opened or when settings change.
 */
export function resetFileState(sourcePath: string): void {
  fileStates.delete(sourcePath)
}

/**
 * Reset all file analyses. Called when settings change globally.
 */
export function resetAllFileStates(): void {
  fileStates.clear()
}

// ─── Post-Processor ──────────────────────────────────────────────────

/**
 * Create the MarkdownPostProcessor function.
 * Register it via `this.registerMarkdownPostProcessor()` in the plugin's onload.
 */
export function createHeadingPostProcessor() {
  return (element: HTMLElement, context: MarkdownPostProcessorContext): void => {
    const sourcePath = context.sourcePath
    const fileState = fileStates.get(sourcePath)
    if (!fileState?.enabled) return

    const { analysis, settings } = fileState

    // Find all heading elements in this section
    const headingElements = element.querySelectorAll('h1, h2, h3, h4, h5, h6')
    if (headingElements.length === 0) return

    // Get pre-computed analysis for this file
    if (analysis.headings.length === 0) return

    // Get section info for line-based heading matching
    const sectionInfo = context.getSectionInfo(element as HTMLElement)

    // Find analyzed headings that fall within this section's line range
    let sectionHeadings: AnalyzedHeading[]
    if (sectionInfo) {
      sectionHeadings = analysis.headings.filter(
        h => h.line >= sectionInfo.lineStart && h.line <= sectionInfo.lineEnd,
      )
    } else {
      // Fallback: can't determine section range, skip to avoid wrong numbers
      // (This is safer than guessing — the heading will be numbered when
      //  getSectionInfo becomes available on a re-render)
      return
    }

    if (sectionHeadings.length === 0) return

    // Match DOM heading elements to analyzed headings sequentially.
    // Both are in document order within the section.
    let analyzedIdx = 0

    for (const headingEl of Array.from(headingElements)) {
      if (analyzedIdx >= sectionHeadings.length) break

      const tagName = headingEl.tagName.toLowerCase()
      const level = parseInt(tagName.charAt(1), 10)

      // Skip if already decorated (prevent duplicates on re-render)
      if (headingEl.querySelector('.ah-number, .ah-reading-number')) {
        // Still advance the analyzedIdx to keep alignment
        if (analyzedIdx < sectionHeadings.length && sectionHeadings[analyzedIdx].level === level) {
          analyzedIdx++
        }
        continue
      }

      // Find the next analyzed heading that matches this DOM heading's level.
      // Skip over analyzed headings that don't match (could be misaligned
      // due to code blocks or other rendering differences).
      while (analyzedIdx < sectionHeadings.length && sectionHeadings[analyzedIdx].level !== level) {
        analyzedIdx++
      }
      if (analyzedIdx >= sectionHeadings.length) break

      const analyzed = sectionHeadings[analyzedIdx]
      analyzedIdx++

      // Skip headings that should not be numbered
      if (analyzed.isSkipped) continue

      // Build display string from pre-computed analysis
      const displayText = analyzed.formattedNumber + settings.separator + ' '

      // Create the number element and prepend it to the heading
      const numberSpan = activeDocument.createElement('span')
      numberSpan.className = `ah-reading-number ah-reading-number-level-${level}`
      numberSpan.textContent = displayText
      numberSpan.style.opacity = String(settings.numberOpacity)
      numberSpan.setAttribute('aria-hidden', 'true')

      // If there's a detected manual number in the text, try to hide it
      // to avoid duplication (e.g., "1. 1. Introduction")
      if (analyzed.detectedNumber) {
        stripLeadingManualNumber(
          getTextNodes(headingEl as HTMLElement),
          analyzed.detectedNumber.fullMatch,
        )
      }

      // Insert as the first child of the heading element
      headingEl.insertBefore(numberSpan, headingEl.firstChild)

      // ── Visual Heading Indentation ──
      if (settings.headingIndent) {
        headingEl.classList.add(`ah-indent-${level}`)
        if (settings.headingIndentGuides && level > 1) {
          headingEl.classList.add('ah-indent-guide')
        }
        // Set indent size as CSS custom property on the element
        ;(headingEl as HTMLElement).style.setProperty(
          '--ah-indent-size',
          `${settings.headingIndentSize}px`,
        )
      }
    }
  }
}
