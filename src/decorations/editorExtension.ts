/**
 * Auto Heading — CM6 Editor Extension
 *
 * Non-destructive heading number decorations in Live Preview.
 * Uses direct document text parsing for maximum reliability.
 *
 * When manual numbers are detected, uses Decoration.replace to visually
 * swap them with the computed number. When no manual number exists,
 * uses Decoration.widget to prepend the number.
 */

import {
  Decoration,
  DecorationSet,
  EditorView,
} from '@codemirror/view'
import { EditorState, StateField, Transaction, RangeSetBuilder } from '@codemirror/state'
import {
  firstToken,
  makeNumberingString,
  nextToken,
  NumberingToken,
  startAtToken,
  NumberingStyle,
} from '../core/numberingTokens'
import { AutoHeadingSettings, DEFAULT_SETTINGS } from '../settings/settingsTypes'
import { HeadingNumberWidget } from './widgets'
import { detectManualNumber, DetectedNumber } from '../core/manualNumberDetector'

// ─── Settings State ───────────────────────────────────────────────────

let currentSettings: AutoHeadingSettings = { ...DEFAULT_SETTINGS }
let noteEnabled = false
let settingsVersion = 0
let lastBuiltNumberVersion = -1
let lastBuiltIndentVersion = -1

// Track previous values to detect actual changes
let prevSettingsJSON = ''
let prevNoteEnabled = false

/**
 * Update the decoration settings. Returns true if settings actually changed.
 * Only increments settingsVersion when a real change is detected,
 * preventing unnecessary decoration rebuilds that cause cursor jumps.
 */
export function updateDecorationSettings(settings: AutoHeadingSettings, enabled: boolean): boolean {
  const newJSON = JSON.stringify(settings)
  if (newJSON === prevSettingsJSON && enabled === prevNoteEnabled) {
    return false
  }
  currentSettings = settings
  noteEnabled = enabled
  prevSettingsJSON = newJSON
  prevNoteEnabled = enabled
  settingsVersion++
  return true
}

// ─── Heading Info ─────────────────────────────────────────────────────

interface DocHeading {
  level: number
  lineNumber: number
  textFrom: number        // position: start of heading text (after ## )
  headingText: string
  detected: DetectedNumber | null
}

/**
 * Extract headings by scanning document text line by line.
 */
function extractHeadingsFromDoc(state: EditorState): DocHeading[] {
  const headings: DocHeading[] = []
  const doc = state.doc
  const codeLines = getCodeBlockLines(state)

  for (let i = 1; i <= doc.lines; i++) {
    if (codeLines.has(i - 1)) continue // skip code block lines

    const line = doc.line(i)
    const text = line.text

    const match = text.match(/^(\s{0,3})(#{1,6})\s+(.+)/)
    if (!match) continue

    const hashes = match[2]
    const content = match[3]
    const level = hashes.length
    const prefixLen = match[1].length + hashes.length + 1
    const textFrom = line.from + prefixLen

    // Detect manual numbers in the content
    const detected = currentSettings.detectManualNumbers
      ? detectManualNumber(content)
      : null

    headings.push({
      level,
      lineNumber: i - 1,
      textFrom,
      headingText: content,
      detected,
    })
  }

  return headings
}

function getCodeBlockLines(state: EditorState): Set<number> {
  const codeLines = new Set<number>()
  const doc = state.doc
  let insideCodeBlock = false
  for (let i = 1; i <= doc.lines; i++) {
    const text = doc.line(i).text.trimStart()
    if (text.startsWith('```') || text.startsWith('~~~')) {
      codeLines.add(i - 1)
      insideCodeBlock = !insideCodeBlock
      continue
    }
    if (insideCodeBlock) codeLines.add(i - 1)
  }
  return codeLines
}

// ─── Decoration Builder ───────────────────────────────────────────────

interface DecoInfo {
  from: number
  to: number
  displayText: string
  level: number
  type: 'widget' | 'replace'
}

interface LineDecoInfo {
  lineFrom: number
  level: number
}

function buildDecorations(state: EditorState, cursorLine?: number): DecorationSet {
  lastBuiltNumberVersion = settingsVersion

  if (!noteEnabled || !currentSettings.enabled) {
    return Decoration.none
  }

  const headings = extractHeadingsFromDoc(state)
  if (headings.length === 0) return Decoration.none

  const effectiveFirstLevel = currentSettings.skipH1
    ? Math.max(currentSettings.firstLevel, 2)
    : currentSettings.firstLevel

  let numberingStack: NumberingToken[] = []
  let previousLevel = effectiveFirstLevel

  const getStyleForLevel = (level: number): NumberingStyle => {
    const index = Math.max(0, Math.min(5, level - 1))
    return currentSettings.levelStyles[index]
  }

  const decorationInfo: DecoInfo[] = []

  for (const heading of headings) {
    const { level, headingText, textFrom, detected } = heading

    // Skip decorations on the line the cursor is on to prevent cursor jumps
    if (cursorLine != null && heading.lineNumber === cursorLine) continue

    const isSkippedH1 = currentSettings.skipH1 && level === 1
    const isBelowFirst = level < effectiveFirstLevel
    const isAboveMax = level > currentSettings.maxLevel
    const hasSkipComment = /<!--\s*(?:skip|no-number|ah-skip|skip-number)\s*-->/.test(headingText)
    const hasSkipMarkerText = currentSettings.skipMarker &&
      currentSettings.skipMarker.length > 0 &&
      (headingText.trimEnd().endsWith(`^${currentSettings.skipMarker}`) ||
       headingText.trimEnd().endsWith(currentSettings.skipMarker))

    if (isSkippedH1 || isBelowFirst) {
      numberingStack = []
      previousLevel = effectiveFirstLevel
      continue
    }

    if (isAboveMax || hasSkipComment || hasSkipMarkerText) {
      continue
    }

    // Compute number
    if (numberingStack.length === 0) {
      const style = getStyleForLevel(level)
      const initial = startAtToken(currentSettings.startAt, style)
      numberingStack.push(nextToken(initial))
    } else if (level === previousLevel) {
      const current = numberingStack[numberingStack.length - 1]
      numberingStack[numberingStack.length - 1] = nextToken(current)
    } else if (level > previousLevel) {
      for (let l = previousLevel + 1; l <= level; l++) {
        const style = getStyleForLevel(l)
        numberingStack.push(firstToken(style))
      }
    } else if (level < previousLevel) {
      const targetDepth = (level - effectiveFirstLevel) + 1
      while (numberingStack.length > targetDepth) {
        numberingStack.pop()
      }
      if (numberingStack.length > 0) {
        const current = numberingStack[numberingStack.length - 1]
        numberingStack[numberingStack.length - 1] = nextToken(current)
      } else {
        const style = getStyleForLevel(level)
        numberingStack.push(firstToken(style))
      }
    }

    previousLevel = level

    const numberStr = makeNumberingString(numberingStack, currentSettings.levelSeparator)
    const formatted = currentSettings.numberFormat.replace('{n}', numberStr)
    const displayText = formatted + currentSettings.separator + ' '

    if (detected) {
      // Manual number found → visually REPLACE it with the computed number
      // This handles both correct and incorrect manual numbers
      decorationInfo.push({
        from: textFrom,
        to: textFrom + detected.fullMatch.length,
        displayText,
        level,
        type: 'replace',
      })
    } else {
      // No manual number → add widget before heading text
      decorationInfo.push({
        from: textFrom,
        to: textFrom,
        displayText,
        level,
        type: 'widget',
      })
    }
  }

  if (decorationInfo.length === 0) return Decoration.none

  // Sort by position (required by RangeSetBuilder)
  decorationInfo.sort((a, b) => a.from - b.from)

  const builder = new RangeSetBuilder<Decoration>()
  for (const info of decorationInfo) {
    const widget = new HeadingNumberWidget(
      info.displayText,
      info.level,
      currentSettings.numberOpacity,
    )
    if (info.type === 'replace') {
      builder.add(info.from, info.to, Decoration.replace({ widget }))
    } else {
      builder.add(info.from, info.from, Decoration.widget({ widget, side: -1 }))
    }
  }

  return builder.finish()
}

/**
 * Build line-level decorations for heading indentation.
 * Applies CSS classes like 'ah-indent-2', 'ah-indent-guide' to heading lines.
 */
function buildLineDecorations(state: EditorState): DecorationSet {
  lastBuiltIndentVersion = settingsVersion
  if (!noteEnabled || !currentSettings.enabled || !currentSettings.headingIndent) {
    return Decoration.none
  }

  const headings = extractHeadingsFromDoc(state)
  if (headings.length === 0) return Decoration.none

  const lineDecos: LineDecoInfo[] = []

  for (const heading of headings) {
    const line = state.doc.line(heading.lineNumber + 1)
    lineDecos.push({ lineFrom: line.from, level: heading.level })
  }

  if (lineDecos.length === 0) return Decoration.none

  // Sort by position (required by RangeSetBuilder)
  lineDecos.sort((a, b) => a.lineFrom - b.lineFrom)

  const builder = new RangeSetBuilder<Decoration>()
  for (const info of lineDecos) {
    const classes = [`ah-indent-${info.level}`]
    if (currentSettings.headingIndentGuides && info.level > 1) {
      classes.push('ah-indent-guide')
    }
    builder.add(
      info.lineFrom,
      info.lineFrom,
      Decoration.line({ attributes: { class: classes.join(' ') } }),
    )
  }

  return builder.finish()
}

// ─── StateField Definition ────────────────────────────────────────────

function getCursorLine(state: EditorState): number {
  return state.doc.lineAt(state.selection.main.head).number - 1
}

export const headingNumberField = StateField.define<DecorationSet>({
  create(state: EditorState): DecorationSet {
    return buildDecorations(state, getCursorLine(state))
  },

  update(value: DecorationSet, tr: Transaction): DecorationSet {
    if (tr.docChanged || tr.selection) return buildDecorations(tr.state, getCursorLine(tr.state))
    if (lastBuiltNumberVersion !== settingsVersion) return buildDecorations(tr.state, getCursorLine(tr.state))
    return value
  },

  provide(field: StateField<DecorationSet>) {
    return EditorView.decorations.from(field)
  },
})

export const headingIndentField = StateField.define<DecorationSet>({
  create(state: EditorState): DecorationSet {
    return buildLineDecorations(state)
  },

  update(value: DecorationSet, tr: Transaction): DecorationSet {
    if (tr.docChanged) return buildLineDecorations(tr.state)
    if (lastBuiltIndentVersion !== settingsVersion) return buildLineDecorations(tr.state)
    return value
  },

  provide(field: StateField<DecorationSet>) {
    return EditorView.decorations.from(field)
  },
})

export function getEditorExtensions() {
  return [
    headingNumberField,
    headingIndentField,
    // Treat replace decoration ranges as atomic units for cursor movement.
    // This prevents the cursor from entering replaced number ranges,
    // eliminating cursor confusion during decoration rebuilds.
    EditorView.atomicRanges.of(view => view.state.field(headingNumberField)),
  ]
}

/** Expose gutter settings state for use by headingGutter.ts */
export function getGutterSettings(): { enabled: boolean; noteEnabled: boolean; settings: typeof currentSettings } {
  return { enabled: currentSettings.enabled, noteEnabled: noteEnabled, settings: currentSettings }
}
