/**
 * Auto Heading — Manual Number Detector
 *
 * Intelligently detects manually-typed heading numbers in various formats.
 * Used by the Heading Analyzer to decide whether to adopt, replace, or ignore
 * existing numbers.
 */

export interface DetectedNumber {
  /** The full matched prefix (e.g., "1.2.3. " or "A) ") */
  fullMatch: string
  /** The numeric/hierarchical part without separator (e.g., "1.2.3" or "A") */
  numberPart: string
  /** The detected style */
  style: DetectedNumberStyle
  /** Confidence: how sure we are this is an intentional number vs. heading text */
  confidence: 'high' | 'medium' | 'low'
}

export type DetectedNumberStyle =
  | 'arabic'           // "1", "2", "42"
  | 'hierarchical'     // "1.2", "1.2.3"
  | 'letter-upper'     // "A", "B", "Z"
  | 'letter-lower'     // "a", "b", "z"
  | 'roman-upper'      // "I", "II", "IV", "XIV"
  | 'roman-lower'      // "i", "ii", "iv"
  | 'unknown'

// ─── Pattern Definitions ──────────────────────────────────────────────

// Order matters: more specific patterns first to avoid false matches

const PATTERNS: { regex: RegExp; style: DetectedNumberStyle; confidence: 'high' | 'medium' | 'low' }[] = [
  // Hierarchical: 1.2.3, 1.2.3., 1.2, etc. (high confidence due to structure)
  {
    regex: /^(\d+(?:\.\d+)+)\.?\s*[):—-]?\s*/,
    style: 'hierarchical',
    confidence: 'high',
  },
  // Arabic with separator: "1. ", "1: ", "1) ", "1 - "
  {
    regex: /^(\d+)\s*[.):—-]\s+/,
    style: 'arabic',
    confidence: 'high',
  },
  // Arabic bare: "1 Heading" (only 1-3 digits to avoid matching years like "2024 Heading")
  {
    regex: /^(\d{1,3})\s+(?=[A-Z])/,
    style: 'arabic',
    confidence: 'medium',
  },
  // Uppercase letter with separator: "A. ", "B) ", "C: "
  {
    regex: /^([A-Z])\.?\s*[):—-]?\s+/,
    style: 'letter-upper',
    confidence: 'medium',
  },
  // Lowercase letter with dot: "a. ", "b. "
  {
    regex: /^([a-z])\.\s+/,
    style: 'letter-lower',
    confidence: 'medium',
  },
  // Roman numeral (upper): "I. ", "IV. ", "XIV) "
  // Must be ≥2 chars or single "I" followed by a separator to distinguish from words
  {
    regex: /^([IVXLCDM]{2,}|I)\s*[.):\-—]\s+/,
    style: 'roman-upper',
    confidence: 'medium',
  },
  // Roman numeral (lower): "i. ", "iv. ", "xiv) "
  {
    regex: /^([ivxlcdm]{2,})\s*[.):\-—]\s+/,
    style: 'roman-lower',
    confidence: 'low', // easily confused with words
  },

  // ── Catch-all: simple number(s) + space ──────────────────
  // Catches burn-in output like "1 heading" or "1.2 heading" where
  // the number is followed by just a space (no dot/colon/paren).
  // Limited to 1-4 digits to avoid matching years like "2024 Report".
  {
    regex: /^(\d{1,4}(?:\.\d+)*)\s+/,
    style: 'arabic',
    confidence: 'low',
  },
  // Mixed hierarchical with non-digit segments: "1.a heading", "iv.2.A heading"
  // Each segment: digits, 1-2 letters, or roman numerals (up to 8 chars for XVIII etc.)
  // Requires at least one dot separator — prevents matching single English words.
  {
    regex: /^((?:\d+|[A-Z]{1,2}|[a-z]{1,2}|[IVXLCDM]+|[ivxlcdm]+)(?:\.(?:\d+|[A-Z]{1,2}|[a-z]{1,2}|[IVXLCDM]+|[ivxlcdm]+))+)\s+/,
    style: 'hierarchical',
    confidence: 'low',
  },
]

// Words that look like Roman numerals but aren't
const ROMAN_FALSE_POSITIVES = new Set([
  'I', 'In', 'Is', 'It', 'If', 'Im',
  'Dim', 'Did', 'Mix', 'Mid', 'Mild',
  'Civil', 'Civic', 'Livid', 'Vivid',
])

/**
 * Attempt to detect a manual number prefix in heading text.
 * @param headingText The heading text WITHOUT the `# ` prefix (just the content after `## `)
 * @returns DetectedNumber or null if no number is detected
 */
export function detectManualNumber(headingText: string): DetectedNumber | null {
  const trimmed = headingText.trimStart()
  if (trimmed.length === 0) return null

  // PRIMARY: Check for plugin marker (U+2060) — instant, 100% accurate
  if (trimmed.startsWith('\u2060')) {
    const withoutMarker = trimmed.substring(1)
    // Find where the number ends (first space)
    const spaceIdx = withoutMarker.indexOf(' ')
    if (spaceIdx > 0) {
      return {
        fullMatch: trimmed.substring(0, 1 + spaceIdx + 1), // marker + number + space
        numberPart: withoutMarker.substring(0, spaceIdx),
        style: 'arabic', // style doesn't matter for replacement
        confidence: 'high',
      }
    }
    // Handle partial marker (e.g., during deletion of heading number text):
    // Marker without trailing space, or marker + space but no number between.
    // Always detect to prevent duplicate number display (raw marker text + widget).
    return {
      fullMatch: spaceIdx === 0
        ? trimmed.substring(0, 2)   // marker + space only (no number between)
        : trimmed,                  // marker + partial number (no trailing space)
      numberPart: spaceIdx === 0 ? '' : withoutMarker,
      style: 'arabic',
      confidence: 'high',
    }
  }

  for (const pattern of PATTERNS) {
    const match = trimmed.match(pattern.regex)
    if (match) {
      const fullMatch = match[0]
      const numberPart = match[1]

      // Extra validation for Roman numerals — reject common English words
      if (pattern.style === 'roman-upper' || pattern.style === 'roman-lower') {
        // Check if what follows looks like it's part of a word
        const afterMatch = trimmed.substring(fullMatch.length)
        if (afterMatch.length > 0 && /^[a-z]/.test(afterMatch)) {
          // Lowercase continuation means this is probably a word, not a numeral
          continue
        }
        // Check false positives
        if (ROMAN_FALSE_POSITIVES.has(numberPart)) {
          // "I" followed by certain words is likely the pronoun, not Roman numeral I
          // But "I. " or "I) " with a separator IS likely a numeral
          if (numberPart === 'I' && !(/^I\s*[.):\-—]\s+/.test(trimmed))) {
            continue
          }
        }
      }

      // Extra validation for single uppercase letters
      if (pattern.style === 'letter-upper' && numberPart.length === 1) {
        // "A Heading" is ambiguous (could be the article "A")
        // Only match if followed by a separator
        if (!/^[A-Z]\s*[.):\-—]\s+/.test(trimmed)) {
          continue
        }
      }

      return {
        fullMatch,
        numberPart,
        style: pattern.style,
        confidence: pattern.confidence,
      }
    }
  }

  return null
}

/**
 * Check if the majority of headings at a given level have consistent manual numbers.
 * Used to decide whether to adopt existing numbering.
 */
export function areNumbersConsistent(
  detections: (DetectedNumber | null)[],
): { consistent: boolean; dominantStyle: DetectedNumberStyle | null } {
  const validDetections = detections.filter((d): d is DetectedNumber => d !== null)

  if (validDetections.length === 0) {
    return { consistent: false, dominantStyle: null }
  }

  // Count styles
  const styleCounts = new Map<DetectedNumberStyle, number>()
  for (const d of validDetections) {
    styleCounts.set(d.style, (styleCounts.get(d.style) || 0) + 1)
  }

  // Find dominant style
  let maxCount = 0
  let dominantStyle: DetectedNumberStyle | null = null
  for (const [style, count] of styleCounts) {
    if (count > maxCount) {
      maxCount = count
      dominantStyle = style
    }
  }

  // Consider consistent if ≥50% of headings have the same style
  const total = detections.length // total includes nulls
  const consistent = maxCount >= Math.ceil(total * 0.5)

  return { consistent, dominantStyle }
}
