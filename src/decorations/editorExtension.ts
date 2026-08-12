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
import { EditorState, StateEffect, StateField, Transaction, RangeSetBuilder } from '@codemirror/state'
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
import { findFrontMatterEndLine } from '../core/frontMatter'

// ─── Per-editor Settings State ────────────────────────────────────────

interface DecorationConfig {
  settings: AutoHeadingSettings
  enabled: boolean
  signature: string
}

function cloneSettings(settings: AutoHeadingSettings): AutoHeadingSettings {
  return {
    ...settings,
    levelStyles: [...settings.levelStyles],
    scopePaths: [...settings.scopePaths],
  }
}

function createDecorationConfig(
  settings: AutoHeadingSettings,
  enabled: boolean,
  signature = `${JSON.stringify(settings)}:${enabled}`,
): DecorationConfig {
  return {
    settings: cloneSettings(settings),
    enabled,
    signature,
  }
}

const setDecorationConfig = StateEffect.define<DecorationConfig>()

const decorationConfigField = StateField.define<DecorationConfig>({
  create(): DecorationConfig {
    return createDecorationConfig(DEFAULT_SETTINGS, false)
  },

  update(value: DecorationConfig, tr: Transaction): DecorationConfig {
    for (const effect of tr.effects) {
      if (effect.is(setDecorationConfig)) return effect.value
    }
    return value
  },
})

/** Return a view-local settings effect only when that editor's config changed. */
export function getDecorationSettingsEffect(
  state: EditorState,
  settings: AutoHeadingSettings,
  enabled: boolean,
): StateEffect<DecorationConfig> | null {
  const config = state.field(decorationConfigField, false)
  const signature = `${JSON.stringify(settings)}:${enabled}`
  if (config?.signature === signature) return null
  return setDecorationConfig.of(
    createDecorationConfig(settings, enabled, signature),
  )
}

function getConfigFromTransaction(tr: Transaction): DecorationConfig {
  for (const effect of tr.effects) {
    if (effect.is(setDecorationConfig)) return effect.value
  }
  return tr.startState.field(decorationConfigField)
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
 * Extract headings in a single pass (merged code-block detection).
 */
function extractHeadingsFromDoc(
  state: EditorState,
  settings: AutoHeadingSettings,
): DocHeading[] {
  const headings: DocHeading[] = []
  const doc = state.doc
  let insideCodeBlock = false
  let fenceChar = ''    // '`' or '~'
  let fenceLen = 0      // number of fence chars in the opening fence
  const frontMatterEndLine = findFrontMatterEndLine(
    line => line < doc.lines ? doc.line(line + 1).text : '',
    doc.lines - 1,
  )

  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i)
    const text = line.text
    const trimmed = text.trimStart()

    if (frontMatterEndLine >= 0 && i - 1 <= frontMatterEndLine) continue

    // Track code fences (CommonMark spec compliant):
    // - Opening fence: ≥3 backticks or tildes, optionally followed by info string
    // - Closing fence: same char as opening, ≥ opening count, ONLY whitespace after
    if (insideCodeBlock) {
      // Check for closing fence: same char, at least fenceLen, nothing else
      const closeMatch = trimmed.match(/^(`{3,}|~{3,})\s*$/)
      if (closeMatch && closeMatch[1][0] === fenceChar && closeMatch[1].length >= fenceLen) {
        insideCodeBlock = false
        fenceChar = ''
        fenceLen = 0
      }
      continue
    }
    // Check for opening fence: ≥3 backticks or tildes (may have info string after)
    const openMatch = trimmed.match(/^(`{3,}|~{3,})/)
    if (openMatch) {
      insideCodeBlock = true
      fenceChar = openMatch[1][0]
      fenceLen = openMatch[1].length
      continue
    }

    const match = text.match(/^(\s{0,3})(#{1,6})\s+(.+)/)
    if (!match) {
      // Check for setext heading: current line is text, next line is === or ---
      if (i < doc.lines && trimmed.length > 0) {
        const nextLine = doc.line(i + 1)
        const nextText = nextLine.text
        const isSetextH1 = /^\s{0,3}=+\s*$/.test(nextText)
        const isSetextH2 = /^\s{0,3}-{2,}\s*$/.test(nextText)
        if (isSetextH1 || isSetextH2) {
          const setextLevel = isSetextH1 ? 1 : 2
          const content = text.trimStart()
          const leadingSpaces = text.length - content.length
          const textFrom = line.from + leadingSpaces

          const detected = settings.detectManualNumbers
            ? detectManualNumber(content)
            : null

          headings.push({
            level: setextLevel,
            lineNumber: i - 1,
            textFrom,
            headingText: content,
            detected,
          })
          // Skip the underline line so it's not processed as a heading
          i++
        }
      }
      continue
    }

    const hashes = match[2]
    const content = match[3]
    const level = hashes.length
    const prefixLen = match[1].length + hashes.length + 1
    const textFrom = line.from + prefixLen

    const detected = settings.detectManualNumbers
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

// ─── Heading Cache (shared between number and indent fields) ──────────

const headingCache = new WeakMap<object, Map<boolean, DocHeading[]>>()

function getHeadingsCached(
  state: EditorState,
  settings: AutoHeadingSettings,
): DocHeading[] {
  let cachedByDetection = headingCache.get(state.doc)
  if (!cachedByDetection) {
    cachedByDetection = new Map<boolean, DocHeading[]>()
    headingCache.set(state.doc, cachedByDetection)
  }

  const cached = cachedByDetection.get(settings.detectManualNumbers)
  if (cached) return cached

  const headings = extractHeadingsFromDoc(state, settings)
  cachedByDetection.set(settings.detectManualNumbers, headings)
  return headings
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

function buildDecorations(
  state: EditorState,
  config: DecorationConfig,
  cursorLine?: number,
): DecorationSet {
  if (!config.enabled) {
    return Decoration.none
  }

  const currentSettings = config.settings
  const headings = getHeadingsCached(state, currentSettings)
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

    // Compute number (always, even for cursor line, so downstream numbers stay correct)
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

    // Skip DECORATION (not numbering) on the cursor line to prevent cursor jumps
    if (cursorLine != null && heading.lineNumber === cursorLine) continue

    const numberStr = makeNumberingString(numberingStack, currentSettings.levelSeparator)
    const formatted = currentSettings.numberFormat.replace('{n}', numberStr)
    const displayText = formatted + currentSettings.separator + ' '

    if (detected) {
      decorationInfo.push({
        from: textFrom,
        to: textFrom + detected.fullMatch.length,
        displayText,
        level,
        type: 'replace',
      })
    } else {
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
 */
function buildLineDecorations(
  state: EditorState,
  config: DecorationConfig,
): DecorationSet {
  if (!config.enabled || !config.settings.headingIndent) {
    return Decoration.none
  }

  const currentSettings = config.settings
  const headings = getHeadingsCached(state, currentSettings)
  if (headings.length === 0) return Decoration.none

  const lineDecos: LineDecoInfo[] = []

  for (const heading of headings) {
    const line = state.doc.line(heading.lineNumber + 1)
    lineDecos.push({ lineFrom: line.from, level: heading.level })
  }

  if (lineDecos.length === 0) return Decoration.none

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

// ─── Structural Change Detection ──────────────────────────────────────

/** Extract heading level from a line of text (0 if not a heading) */
function getHeadingLevel(lineText: string): number {
  const m = lineText.match(/^\s{0,3}(#{1,6})\s/)
  return m ? m[1].length : 0
}

/**
 * Determine if a document change requires a full decoration rebuild.
 *
 * Returns true when heading structure changes (lines added/removed,
 * heading level changed, line became/stopped being a heading).
 * Returns false for simple inline edits (typing inside heading text)
 * where mapping existing decorations is sufficient.
 */
function needsFullRebuild(tr: Transaction): boolean {
  // Line count changed → heading may have been added or removed
  if (tr.state.doc.lines !== tr.startState.doc.lines) return true

  // Check if any edited line's heading status or level changed,
  // or if the burn-in marker (⁠ U+2060) was added/removed on a heading line.
  // The marker changes the decoration type from widget to replace, so
  // mapped decorations would be stale without a full rebuild.
  let rebuild = false
  let changedRangeCount = 0
  tr.changes.iterChangedRanges((fromA, _toA, fromB, _toB) => {
    if (rebuild) return
    changedRangeCount++
    const oldLine = tr.startState.doc.lineAt(fromA)
    const newLine = tr.state.doc.lineAt(fromB)
    const oldLevel = getHeadingLevel(oldLine.text)
    const newLevel = getHeadingLevel(newLine.text)
    if (oldLevel !== newLevel) { rebuild = true; return }

    // If the heading text had a burn-in marker added or removed, rebuild
    if (oldLevel > 0) {
      const oldHasMarker = oldLine.text.includes('\u2060')
      const newHasMarker = newLine.text.includes('\u2060')
      if (oldHasMarker !== newHasMarker) { rebuild = true; return }
    }
  })

  // Multi-range transaction on heading lines (typical of burn-in which
  // modifies several headings in one transaction) → always rebuild
  if (changedRangeCount > 1) rebuild = true

  return rebuild
}

// ─── StateField Definition ────────────────────────────────────────────

function getCursorLine(state: EditorState): number {
  return state.doc.lineAt(state.selection.main.head).number - 1
}

interface HeadingNumberFieldValue {
  decorations: DecorationSet
  cursorLine: number
}

export const headingNumberField = StateField.define<HeadingNumberFieldValue>({
  create(state: EditorState): HeadingNumberFieldValue {
    const cursorLine = getCursorLine(state)
    return {
      decorations: buildDecorations(
        state,
        state.field(decorationConfigField),
        cursorLine,
      ),
      cursorLine,
    }
  },

  update(value: HeadingNumberFieldValue, tr: Transaction): HeadingNumberFieldValue {
    const newCursorLine = getCursorLine(tr.state)
    const config = getConfigFromTransaction(tr)
    const configChanged = tr.effects.some(effect => effect.is(setDecorationConfig))

    if (configChanged) {
      return {
        decorations: buildDecorations(tr.state, config, newCursorLine),
        cursorLine: newCursorLine,
      }
    }

    if (tr.docChanged) {
      // ── Fast path: map instead of rebuild ──
      // When cursor stays on the same line and the heading structure hasn't
      // changed (no headings added/removed, no level changes), we map existing
      // decorations through the change instead of rebuilding from scratch.
      // This adjusts positions with zero DOM churn, preventing cursor jumps
      // that occur when CM6 reconciles a fully-rebuilt DecorationSet.
      if (newCursorLine === value.cursorLine && !needsFullRebuild(tr)) {
        return {
          decorations: value.decorations.map(tr.changes),
          cursorLine: value.cursorLine,
        }
      }

      return {
        decorations: buildDecorations(tr.state, config, newCursorLine),
        cursorLine: newCursorLine,
      }
    }

    if (tr.selection && newCursorLine !== value.cursorLine) {
      return {
        decorations: buildDecorations(tr.state, config, newCursorLine),
        cursorLine: newCursorLine,
      }
    }

    return value
  },

  provide(field: StateField<HeadingNumberFieldValue>) {
    return EditorView.decorations.from(field, value => value.decorations)
  },
})

export const headingIndentField = StateField.define<DecorationSet>({
  create(state: EditorState): DecorationSet {
    return buildLineDecorations(state, state.field(decorationConfigField))
  },

  update(value: DecorationSet, tr: Transaction): DecorationSet {
    const config = getConfigFromTransaction(tr)
    if (tr.effects.some(effect => effect.is(setDecorationConfig))) {
      return buildLineDecorations(tr.state, config)
    }
    if (tr.docChanged) {
      // Same fast path: map for non-structural edits
      if (!needsFullRebuild(tr)) return value.map(tr.changes)
      return buildLineDecorations(tr.state, config)
    }
    return value
  },

  provide(field: StateField<DecorationSet>) {
    return EditorView.decorations.from(field)
  },
})

export function getEditorExtensions() {
  return [
    decorationConfigField,
    headingNumberField,
    headingIndentField,
    EditorView.atomicRanges.of(view => view.state.field(headingNumberField).decorations),
  ]
}
