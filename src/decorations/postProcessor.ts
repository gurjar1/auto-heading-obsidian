/**
 * Auto Heading — Reading View Post-Processor
 *
 * Adds heading numbers to Reading View (and PDF exports) via
 * Obsidian's MarkdownPostProcessor API.
 *
 * This works by injecting styled <span> elements into the rendered HTML
 * WITHOUT modifying the underlying Markdown file.
 */

import { MarkdownPostProcessorContext } from 'obsidian'
import { AutoHeadingSettings } from '../settings/settingsTypes'
import {
  firstToken,
  makeNumberingString,
  nextToken,
  NumberingToken,
  startAtToken,
  NumberingStyle,
} from '../core/numberingTokens'

// ─── Shared State ─────────────────────────────────────────────────────

// The post-processor is called per-section, not per-document.
// We need to track numbering state across sections for a given file.
// We use a Map keyed by the section context's sourcePath.

interface FileNumberingState {
  stack: NumberingToken[]
  previousLevel: number
  effectiveFirstLevel: number
  lastUpdateTime: number
}

const fileStates = new Map<string, FileNumberingState>()

let currentSettings: AutoHeadingSettings | null = null
let isEnabled = true

export function updatePostProcessorSettings(settings: AutoHeadingSettings, enabled: boolean): void {
  currentSettings = settings
  isEnabled = enabled
  // Clear cached states when settings change so they get recomputed
  fileStates.clear()
}

/**
 * Reset the state for a specific file.
 * Call this when a file is opened or when settings change.
 */
export function resetFileState(sourcePath: string): void {
  fileStates.delete(sourcePath)
}

/**
 * Reset all file states. Called when settings change globally.
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
    if (!isEnabled || !currentSettings) return

    const settings = currentSettings
    const sourcePath = context.sourcePath

    // Find all heading elements in this section
    const headingElements = element.querySelectorAll('h1, h2, h3, h4, h5, h6')
    if (headingElements.length === 0) return

    const effectiveFirstLevel = settings.skipH1
      ? Math.max(settings.firstLevel, 2)
      : settings.firstLevel

    // Get or create state for this file
    let state = fileStates.get(sourcePath)
    if (!state) {
      state = {
        stack: [],
        previousLevel: effectiveFirstLevel,
        effectiveFirstLevel,
        lastUpdateTime: Date.now(),
      }
      fileStates.set(sourcePath, state)
    }

    const getStyleForLevel = (level: number): NumberingStyle => {
      const index = Math.max(0, Math.min(5, level - 1))
      return settings.levelStyles[index]
    }

    for (const headingEl of Array.from(headingElements)) {
      const tagName = headingEl.tagName.toLowerCase()
      const level = parseInt(tagName.charAt(1), 10)

      // Check skip conditions
      const isSkippedH1 = settings.skipH1 && level === 1
      const isBelowFirst = level < effectiveFirstLevel
      const isAboveMax = level > settings.maxLevel

      // Check for skip markers in the heading text
      const headingText = headingEl.textContent || ''
      const hasSkipComment = /<!--\s*(?:skip|no-number|ah-skip|skip-number)\s*-->/.test(headingText)
      const hasSkipMarkerText = settings.skipMarker &&
        settings.skipMarker.length > 0 &&
        headingText.trimEnd().endsWith(settings.skipMarker)

      // Skip if already decorated (prevent duplicates)
      if (headingEl.querySelector('.ah-number, .ah-reading-number')) continue

      if (isSkippedH1 || isBelowFirst) {
        state.stack = []
        state.previousLevel = effectiveFirstLevel
        continue
      }

      if (isAboveMax || hasSkipComment || hasSkipMarkerText) {
        continue
      }

      // Compute number
      if (state.stack.length === 0) {
        const style = getStyleForLevel(level)
        const initial = startAtToken(settings.startAt, style)
        state.stack.push(nextToken(initial))
      } else if (level === state.previousLevel) {
        const current = state.stack[state.stack.length - 1]
        state.stack[state.stack.length - 1] = nextToken(current)
      } else if (level > state.previousLevel) {
        for (let l = state.previousLevel + 1; l <= level; l++) {
          const style = getStyleForLevel(l)
          state.stack.push(firstToken(style))
        }
      } else if (level < state.previousLevel) {
        const targetDepth = (level - effectiveFirstLevel) + 1
        while (state.stack.length > targetDepth) {
          state.stack.pop()
        }
        if (state.stack.length > 0) {
          const current = state.stack[state.stack.length - 1]
          state.stack[state.stack.length - 1] = nextToken(current)
        } else {
          const style = getStyleForLevel(level)
          state.stack.push(firstToken(style))
        }
      }

      state.previousLevel = level

      // Build display string
      const numberStr = makeNumberingString(state.stack, settings.levelSeparator)
      const formatted = settings.numberFormat.replace('{n}', numberStr)

      // Create the number element and prepend it to the heading
      const numberSpan = document.createElement('span')
      numberSpan.className = `ah-reading-number ah-reading-number-level-${level}`
      numberSpan.textContent = formatted + settings.separator + ' '
      numberSpan.style.opacity = String(settings.numberOpacity)
      numberSpan.setAttribute('aria-hidden', 'true')

      // Insert as the first child of the heading element
      headingEl.insertBefore(numberSpan, headingEl.firstChild)
    }
  }
}
