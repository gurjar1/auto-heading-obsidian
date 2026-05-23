/**
 * Auto Heading — Burn-In Engine
 *
 * Writes computed heading numbers directly into file text.
 *
 * KEY INNOVATION: Uses U+2060 (Word Joiner) as an invisible marker before
 * every plugin-generated number prefix. This zero-width Unicode character:
 *   - Is invisible in all renderers (Obsidian, PDF, Publish, other apps)
 *   - Has no effect on text layout or line breaking in practice
 *   - Survives copy/paste, git, export — it's a valid UTF-8 character
 *   - Is NEVER used in natural heading text
 *   - Enables instant, 100% accurate detection with zero false positives
 *
 * Format: ## \u2060{number} {heading text}
 *         ^^ invisible marker
 */

import { Editor, EditorChange, HeadingCache } from 'obsidian'
import { analyzeHeadings } from '../core/headingAnalyzer'
import { AutoHeadingSettings } from '../settings/settingsTypes'

// ─── Types ────────────────────────────────────────────────────────────

export interface BurnInResult {
  success: boolean
  changesApplied: number
  headingsProcessed: number
  message: string
}

// ─── Marker ───────────────────────────────────────────────────────────

/**
 * Invisible marker prepended to every plugin-generated heading number.
 * U+2060 Word Joiner — zero-width, invisible, no layout effect.
 */
export const AH_MARKER = '\u2060'

/**
 * Check if heading text starts with a plugin-generated number.
 */
export function hasPluginNumber(afterHash: string): boolean {
  return afterHash.startsWith(AH_MARKER)
}

/**
 * Strip the plugin marker + number prefix from heading text.
 * Returns the clean heading text after the number, or null if no marker found.
 */
export function stripPluginNumber(afterHash: string): string | null {
  if (!afterHash.startsWith(AH_MARKER)) return null
  // Find the first space after the marker+number — that's where the title starts
  const withoutMarker = afterHash.substring(AH_MARKER.length)
  // The number prefix ends at the first space (our format is always "number ")
  const spaceIdx = withoutMarker.indexOf(' ')
  if (spaceIdx < 0) return '' // Edge case: number is the entire heading
  return withoutMarker.substring(spaceIdx + 1)
}

// ─── Structure-Aware Fallback (for legacy/manual numbers) ─────────────

// Strict Roman numeral patterns (reject "dim", "mild", "civil", etc.)
const ROMAN_UPPER = 'M{0,3}(?:CM|CD|D?C{0,3})(?:XC|XL|L?X{0,3})(?:IX|IV|V?I{0,3})'
const ROMAN_LOWER = 'm{0,3}(?:cm|cd|d?c{0,3})(?:xc|xl|l?x{0,3})(?:ix|iv|v?i{0,3})'
const SEG = `(?:[\\d٠-٩]+|[A-Z]{1,2}|(?:${ROMAN_UPPER})|(?:${ROMAN_LOWER})|[a-z]{1,2})`

function buildLegacyFallbackRegex(formattedNumber: string, levelSeparator: string): RegExp {
  const sep = escapeRegex(levelSeparator || '.')
  const segmentCount = formattedNumber.split(levelSeparator || '.').length
  const parts: string[] = []
  for (let i = 0; i < segmentCount; i++) parts.push(SEG)
  return new RegExp(`^(${parts.join(sep)})\\s*[.):—\\-]?\\s+`)
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// ─── Burn-In: Write Numbers Into Headings ─────────────────────────────

export function burnInNumbers(
  editor: Editor,
  headings: HeadingCache[],
  settings: AutoHeadingSettings,
): BurnInResult {
  const getLine = (line: number) => editor.getLine(line)
  const analysis = analyzeHeadings(headings, getLine, settings)

  if (analysis.headings.length === 0) {
    return { success: true, changesApplied: 0, headingsProcessed: 0, message: 'No headings found.' }
  }

  const changes: EditorChange[] = []

  for (const heading of analysis.headings) {
    const lineText = editor.getLine(heading.line)
    if (!lineText) continue

    const hashMatch = lineText.match(/^(\s{0,3}#{1,6})\s+/)
    if (!hashMatch) continue

    const hashPrefix = hashMatch[1]
    const afterHash = lineText.substring(hashMatch[0].length)

    if (heading.isSkipped) {
      // Strip any leftover plugin numbers from skipped headings
      if (hasPluginNumber(afterHash)) {
        const cleanText = stripPluginNumber(afterHash) || ''
        const newLine = hashPrefix + ' ' + cleanText
        if (newLine !== lineText) {
          changes.push({
            text: newLine,
            from: { line: heading.line, ch: 0 },
            to: { line: heading.line, ch: lineText.length },
          })
        }
      }
      continue
    }

    // Build the MARKED number prefix: \u2060{number} 
    const rawPrefix = heading.formattedNumber + settings.separator
    const numberPrefix = rawPrefix.trimEnd() + ' '
    const markedPrefix = AH_MARKER + numberPrefix

    // 1. Already correct (has marker + exact number) → skip
    if (afterHash.startsWith(markedPrefix)) continue

    let newAfterHash: string

    // 2. Has our marker → plugin-generated number, replace it
    if (hasPluginNumber(afterHash)) {
      const cleanText = stripPluginNumber(afterHash) || ''
      newAfterHash = markedPrefix + cleanText
    }
    // 3. Detector found a manual/legacy number → replace it
    else if (heading.detectedNumber) {
      const textAfterManual = afterHash.substring(heading.detectedNumber.fullMatch.length)
      newAfterHash = markedPrefix + textAfterManual
    }
    // 4. Legacy fallback: structure-aware regex for old burn-in output without marker
    else {
      const fallbackRe = buildLegacyFallbackRegex(heading.formattedNumber, settings.levelSeparator)
      const match = afterHash.match(fallbackRe)
      if (match) {
        newAfterHash = markedPrefix + afterHash.substring(match[0].length)
      } else {
        // 5. No existing number — insert new
        newAfterHash = markedPrefix + afterHash
      }
    }

    const newLine = hashPrefix + ' ' + newAfterHash
    if (newLine !== lineText) {
      changes.push({
        text: newLine,
        from: { line: heading.line, ch: 0 },
        to: { line: heading.line, ch: lineText.length },
      })
    }
  }

  if (changes.length > 0) editor.transaction({ changes })

  return {
    success: true,
    changesApplied: changes.length,
    headingsProcessed: analysis.numberedCount,
    message: changes.length > 0
      ? `Applied numbers to ${changes.length} heading(s).`
      : 'All headings are already numbered correctly.',
  }
}

// ─── Preview ──────────────────────────────────────────────────────────

export function previewBurnIn(
  editor: Editor,
  headings: HeadingCache[],
  settings: AutoHeadingSettings,
): Array<{ line: number; oldText: string; newText: string }> {
  const getLine = (line: number) => editor.getLine(line)
  const analysis = analyzeHeadings(headings, getLine, settings)
  const previews: Array<{ line: number; oldText: string; newText: string }> = []

  for (const heading of analysis.headings) {
    if (heading.isSkipped) continue

    const lineText = editor.getLine(heading.line)
    if (!lineText) continue

    const hashMatch = lineText.match(/^(\s{0,3}#{1,6})\s+/)
    if (!hashMatch) continue

    const hashPrefix = hashMatch[1]
    const afterHash = lineText.substring(hashMatch[0].length)
    const rawPrefix = heading.formattedNumber + settings.separator
    const numberPrefix = rawPrefix.trimEnd() + ' '
    const markedPrefix = AH_MARKER + numberPrefix

    if (afterHash.startsWith(markedPrefix)) continue

    let newAfterHash: string
    if (hasPluginNumber(afterHash)) {
      newAfterHash = markedPrefix + (stripPluginNumber(afterHash) || '')
    } else if (heading.detectedNumber) {
      newAfterHash = markedPrefix + afterHash.substring(heading.detectedNumber.fullMatch.length)
    } else {
      const fallbackRe = buildLegacyFallbackRegex(heading.formattedNumber, settings.levelSeparator)
      const match = afterHash.match(fallbackRe)
      if (match) {
        newAfterHash = markedPrefix + afterHash.substring(match[0].length)
      } else {
        newAfterHash = markedPrefix + afterHash
      }
    }

    const newLine = hashPrefix + ' ' + newAfterHash
    if (newLine !== lineText) {
      previews.push({ line: heading.line, oldText: lineText, newText: newLine })
    }
  }

  return previews
}
