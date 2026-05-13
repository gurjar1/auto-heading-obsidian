/**
 * Auto Heading — Burn-In Remover
 *
 * Strips burned-in heading numbers from the document text.
 *
 * PRIMARY: Detects the U+2060 marker → instant, 100% safe removal.
 * FALLBACK: Uses manual number detection for legacy/unmarked numbers
 * with confidence-based safety checks.
 */

import { Editor, EditorChange, HeadingCache } from 'obsidian'
import { detectManualNumber } from '../core/manualNumberDetector'
import { AH_MARKER, hasPluginNumber, stripPluginNumber } from './burnInEngine'

// ─── Types ────────────────────────────────────────────────────────────

export interface RemovalResult {
  success: boolean
  changesApplied: number
  message: string
}

// ─── Remove Burned-In Numbers ─────────────────────────────────────────

export function removeBurnedInNumbers(
  editor: Editor,
  headings: HeadingCache[],
): RemovalResult {
  if (!headings || headings.length === 0) {
    return { success: true, changesApplied: 0, message: 'No headings found in the document.' }
  }

  const changes: EditorChange[] = []

  for (const heading of headings) {
    const lineNumber = heading.position.start.line
    const lineText = editor.getLine(lineNumber)
    if (!lineText) continue

    const hashMatch = lineText.match(/^(\s{0,3}#{1,6})\s+/)
    if (!hashMatch) continue

    const hashPrefix = hashMatch[1]
    const afterHash = lineText.substring(hashMatch[0].length)

    let cleanedText: string | null = null

    // PRIMARY: Check for plugin marker (U+2060) — instant, 100% safe
    if (hasPluginNumber(afterHash)) {
      cleanedText = stripPluginNumber(afterHash)
    }
    // FALLBACK: Manual number detection for legacy/unmarked headings
    else {
      const detected = detectManualNumber(afterHash)
      if (!detected) continue

      // Safety checks for fallback (no marker = we're less sure)
      if (detected.confidence === 'low') {
        if (detected.numberPart.includes('.')) {
          // Mixed hierarchical (has dots) → safe to remove
        } else if (/^\d+$/.test(detected.numberPart)) {
          // Pure digit: only strip if remaining text starts uppercase
          // "6 Heading" (burn-in) vs "6 ways to identify" (content)
          const remaining = afterHash.substring(detected.fullMatch.length)
          if (remaining.length > 0 && /^[a-z]/.test(remaining)) continue
        } else {
          continue // Non-digit, non-dotted low-confidence → skip
        }
      }

      cleanedText = afterHash.substring(detected.fullMatch.length)
    }

    if (cleanedText === null) continue

    const newLine = hashPrefix + ' ' + cleanedText
    if (newLine !== lineText) {
      changes.push({
        text: newLine,
        from: { line: lineNumber, ch: 0 },
        to: { line: lineNumber, ch: lineText.length },
      })
    }
  }

  if (changes.length > 0) editor.transaction({ changes })

  return {
    success: true,
    changesApplied: changes.length,
    message: changes.length > 0
      ? `Removed numbers from ${changes.length} heading(s). Press Ctrl+Z to undo.`
      : 'No numbered headings found to clean.',
  }
}

/**
 * Preview what removal would change without modifying the document.
 */
export function previewRemoval(
  editor: Editor,
  headings: HeadingCache[],
): Array<{ line: number; oldText: string; newText: string }> {
  const previews: Array<{ line: number; oldText: string; newText: string }> = []
  if (!headings) return previews

  for (const heading of headings) {
    const lineNumber = heading.position.start.line
    const lineText = editor.getLine(lineNumber)
    if (!lineText) continue

    const hashMatch = lineText.match(/^(\s{0,3}#{1,6})\s+/)
    if (!hashMatch) continue

    const hashPrefix = hashMatch[1]
    const afterHash = lineText.substring(hashMatch[0].length)

    let cleanedText: string | null = null

    if (hasPluginNumber(afterHash)) {
      cleanedText = stripPluginNumber(afterHash)
    } else {
      const detected = detectManualNumber(afterHash)
      if (!detected) continue
      if (detected.confidence === 'low') {
        if (detected.numberPart.includes('.')) { /* ok */ }
        else if (/^\d+$/.test(detected.numberPart)) {
          const remaining = afterHash.substring(detected.fullMatch.length)
          if (remaining.length > 0 && /^[a-z]/.test(remaining)) continue
        } else continue
      }
      cleanedText = afterHash.substring(detected.fullMatch.length)
    }

    if (cleanedText === null) continue
    const newLine = hashPrefix + ' ' + cleanedText
    if (newLine !== lineText) {
      previews.push({ line: lineNumber, oldText: lineText, newText: newLine })
    }
  }

  return previews
}
