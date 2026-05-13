/**
 * Auto Heading — Heading Analyzer
 *
 * Parses headings from Obsidian's metadata cache and computes the complete
 * numbering analysis for a document, including skip logic, manual number
 * detection, and per-heading computed numbers.
 */

import { HeadingCache } from 'obsidian'
import { detectManualNumber, DetectedNumber } from './manualNumberDetector'
import {
  firstToken,
  makeNumberingString,
  nextToken,
  NumberingToken,
  startAtToken,
} from './numberingTokens'
import { AutoHeadingSettings } from '../settings/settingsTypes'

// ─── Types ────────────────────────────────────────────────────────────

export interface AnalyzedHeading {
  /** Line number in the document (0-based) */
  line: number
  /** Heading level (1–6) */
  level: number
  /** Raw heading text as it appears in the file (without # prefix) */
  rawText: string
  /** The `## ` prefix string */
  hashPrefix: string
  /** Any detected manual number prefix */
  detectedNumber: DetectedNumber | null
  /** The heading text without any number prefix */
  cleanTitle: string
  /** The computed number string for this heading (e.g., "1.2.3") */
  computedNumber: string
  /** The full formatted display string (e.g., "1.2.3.") including separator */
  formattedNumber: string
  /** Whether this heading is skipped from numbering */
  isSkipped: boolean
  /** Reason for skipping, if applicable */
  skipReason: 'below-first-level' | 'above-max-level' | 'skip-h1' | 'skip-marker' | 'html-comment' | null
  /** Block ID if present (e.g., "^myBlockId") */
  blockId: string | null
}

export interface HeadingAnalysis {
  /** All analyzed headings in document order */
  headings: AnalyzedHeading[]
  /** Total number of headings in the document */
  totalCount: number
  /** Number of headings that receive numbers */
  numberedCount: number
  /** Number of headings that are skipped */
  skippedCount: number
}

// ─── Comment Skip Detection ───────────────────────────────────────────

/** Check if a heading line contains an HTML comment marker to skip numbering */
function hasSkipComment(rawLine: string): boolean {
  return /<!--\s*(?:skip|no-number|ah-skip|skip-number)\s*-->/.test(rawLine)
}

/** Check if a heading ends with a skip marker block ID */
function hasSkipMarker(headingText: string, marker: string): boolean {
  if (!marker || marker.length === 0) return false
  // Support both ^marker and plain marker text at end
  const trimmed = headingText.trimEnd()
  return trimmed.endsWith(`^${marker}`) || trimmed.endsWith(marker)
}

/** Extract block ID from heading text */
function extractBlockId(headingText: string): string | null {
  const match = headingText.match(/\^([a-zA-Z0-9_-]+)\s*$/)
  return match ? match[1] : null
}

/** Strip the heading text of block IDs and trailing markers */
function cleanHeadingText(
  headingText: string,
  detectedNumber: DetectedNumber | null,
): string {
  let text = headingText

  // Remove block ID
  text = text.replace(/\s*\^[a-zA-Z0-9_-]+\s*$/, '')

  // Remove HTML comment skip markers
  text = text.replace(/\s*<!--\s*(?:skip|no-number|ah-skip|skip-number)\s*-->\s*/, '')

  // Remove detected manual number prefix
  if (detectedNumber) {
    text = text.substring(detectedNumber.fullMatch.length)
  }

  return text.trim()
}

// ─── Main Analyzer ────────────────────────────────────────────────────

/**
 * Analyze all headings in a document and compute numbering.
 *
 * @param headings - Array of HeadingCache from Obsidian's metadata
 * @param getLine - Function to get a line's text by line number
 * @param settings - Current effective settings (global merged with per-note)
 * @returns Complete heading analysis
 */
export function analyzeHeadings(
  headings: HeadingCache[],
  getLine: (line: number) => string,
  settings: AutoHeadingSettings,
): HeadingAnalysis {
  if (!headings || headings.length === 0) {
    return { headings: [], totalCount: 0, numberedCount: 0, skippedCount: 0 }
  }

  const effectiveFirstLevel = settings.skipH1
    ? Math.max(settings.firstLevel, 2)
    : settings.firstLevel

  // Phase 1: Gather raw info and determine skip status
  const rawAnalysis: AnalyzedHeading[] = []

  for (const heading of headings) {
    const lineNumber = heading.position.start.line
    const lineText = getLine(lineNumber)
    if (!lineText) continue

    // Parse the hash prefix (## , ### , etc.)
    const hashMatch = lineText.match(/^(\s{0,3}#{1,6})\s+/)
    if (!hashMatch) continue

    const hashPrefix = hashMatch[1].trimStart()
    const rawText = lineText.substring(hashMatch[0].length)
    const level = heading.level

    // Detect manual numbers
    const detectedNumber = settings.detectManualNumbers
      ? detectManualNumber(rawText)
      : null

    // Clean title (without numbers, block IDs, or skip markers)
    const cleanTitle = cleanHeadingText(rawText, detectedNumber)

    // Determine skip status
    let isSkipped = false
    let skipReason: AnalyzedHeading['skipReason'] = null

    if (settings.skipH1 && level === 1) {
      isSkipped = true
      skipReason = 'skip-h1'
    } else if (level < effectiveFirstLevel) {
      isSkipped = true
      skipReason = 'below-first-level'
    } else if (level > settings.maxLevel) {
      isSkipped = true
      skipReason = 'above-max-level'
    } else if (hasSkipComment(lineText)) {
      isSkipped = true
      skipReason = 'html-comment'
    } else if (hasSkipMarker(rawText, settings.skipMarker)) {
      isSkipped = true
      skipReason = 'skip-marker'
    }

    const blockId = extractBlockId(rawText)

    rawAnalysis.push({
      line: lineNumber,
      level,
      rawText,
      hashPrefix,
      detectedNumber,
      cleanTitle,
      computedNumber: '', // will be filled in phase 2
      formattedNumber: '', // will be filled in phase 2
      isSkipped,
      skipReason,
      blockId,
    })
  }

  // Phase 2: Compute numbering sequence
  computeNumbers(rawAnalysis, settings, effectiveFirstLevel)

  // Stats
  const numberedCount = rawAnalysis.filter(h => !h.isSkipped).length
  const skippedCount = rawAnalysis.filter(h => h.isSkipped).length

  return {
    headings: rawAnalysis,
    totalCount: rawAnalysis.length,
    numberedCount,
    skippedCount,
  }
}

/**
 * Compute the number string for each heading in the analysis.
 * Mutates the headings array in place.
 */
function computeNumbers(
  headings: AnalyzedHeading[],
  settings: AutoHeadingSettings,
  effectiveFirstLevel: number,
): void {
  // Initialize numbering stack
  // The stack tracks the current counter for each level depth
  // Index 0 = the first numbered level, index 1 = next deeper level, etc.
  let numberingStack: NumberingToken[] = []
  let previousLevel = effectiveFirstLevel

  // Get the style for a given absolute heading level (1-based)
  const getStyleForLevel = (level: number): import('../core/numberingTokens').NumberingStyle => {
    const index = Math.max(0, Math.min(5, level - 1))
    return settings.levelStyles[index]
  }

  for (const heading of headings) {
    if (heading.isSkipped) {
      // Skipped headings don't affect the counter
      // But if it's a level skip (below first or above max), we might need
      // to reset the stack when we encounter a skipped-then-resumed situation
      if (heading.skipReason === 'below-first-level' || heading.skipReason === 'skip-h1') {
        // Reset the stack so numbering restarts after a top-level heading
        numberingStack = []
        previousLevel = effectiveFirstLevel
      }
      continue
    }

    const level = heading.level
    const depth = level - effectiveFirstLevel // 0-based depth from first numbered level

    if (numberingStack.length === 0) {
      // First numbered heading: initialize stack
      const style = getStyleForLevel(level)
      const initial = startAtToken(settings.startAt, style)
      numberingStack.push(nextToken(initial))
    } else if (level === previousLevel) {
      // Same level: increment current counter
      const current = numberingStack[numberingStack.length - 1]
      numberingStack[numberingStack.length - 1] = nextToken(current)
    } else if (level > previousLevel) {
      // Deeper level: push new counters for each level gap
      for (let l = previousLevel + 1; l <= level; l++) {
        const style = getStyleForLevel(l)
        numberingStack.push(firstToken(style))
      }
    } else if (level < previousLevel) {
      // Shallower level: pop back to this level's depth
      const targetDepth = depth + 1
      while (numberingStack.length > targetDepth) {
        numberingStack.pop()
      }
      // Increment the counter at this level
      if (numberingStack.length > 0) {
        const current = numberingStack[numberingStack.length - 1]
        numberingStack[numberingStack.length - 1] = nextToken(current)
      } else {
        // Edge case: we've popped everything (shouldn't happen but be safe)
        const style = getStyleForLevel(level)
        numberingStack.push(firstToken(style))
      }
    }

    previousLevel = level

    // Build the number string from the stack
    const numberStr = makeNumberingString(numberingStack, settings.levelSeparator)
    heading.computedNumber = numberStr

    // Build the formatted display string
    const formatted = settings.numberFormat.replace('{n}', numberStr)
    heading.formattedNumber = formatted
  }
}

/**
 * Convenience function: get the heading at a given line number from an analysis.
 */
export function getHeadingAtLine(analysis: HeadingAnalysis, line: number): AnalyzedHeading | null {
  return analysis.headings.find(h => h.line === line) || null
}
