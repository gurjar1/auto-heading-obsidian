/**
 * Auto Heading — Per-Note Settings (Front Matter)
 *
 * Parses the `auto-heading:` front matter key to extract per-note overrides.
 *
 * Format examples:
 *   auto-heading: auto
 *   auto-heading: off
 *   auto-heading: first-level 2, max 4, style 1.A.a.1.1.1, sep ".", start-at 3
 *   auto-heading: skip-h1, style 1.1.a
 */

import { CachedMetadata, parseFrontMatterEntry } from 'obsidian'
import { isValidNumberingStyle, NumberingStyle } from '../core/numberingTokens'
import { isValidSeparator, PerNoteOverrides } from './settingsTypes'

const FRONT_MATTER_KEY = 'auto-heading'

/**
 * Parse per-note overrides from the document's front matter.
 * Returns null if no auto-heading key is found.
 */
export function parsePerNoteSettings(metadata: CachedMetadata): PerNoteOverrides | null {
  if (!metadata.frontmatter) return null

  const entry: unknown = parseFrontMatterEntry(metadata.frontmatter, FRONT_MATTER_KEY)
  if (entry === undefined || entry === null) return null

  const entryString = String(entry).trim()
  if (entryString === '') return null

  const overrides: PerNoteOverrides = {}

  // Handle simple flags
  if (entryString === 'off' || entryString === 'disabled' || entryString === 'false') {
    overrides.disabled = true
    return overrides
  }

  if (entryString === 'auto' || entryString === 'on' || entryString === 'true') {
    overrides.enabled = true
    return overrides
  }

  // Parse comma-separated parts
  const parts = entryString.split(',')

  for (const part of parts) {
    const trimmed = part.trim()
    if (trimmed.length === 0) continue

    if (trimmed === 'auto' || trimmed === 'on') {
      overrides.enabled = true
    } else if (trimmed === 'off' || trimmed === 'disabled') {
      overrides.disabled = true
    } else if (trimmed === 'skip-h1') {
      overrides.skipH1 = true
    } else if (trimmed === 'no-skip-h1') {
      overrides.skipH1 = false
    } else if (trimmed.startsWith('first-level')) {
      const val = parseInt(trimmed.replace('first-level', '').trim(), 10)
      if (!isNaN(val) && val >= 1 && val <= 6) {
        overrides.firstLevel = val
      }
    } else if (trimmed.startsWith('max')) {
      const val = parseInt(trimmed.replace('max', '').trim(), 10)
      if (!isNaN(val) && val >= 1 && val <= 6) {
        overrides.maxLevel = val
      }
    } else if (trimmed.startsWith('start-at')) {
      const val = trimmed.replace('start-at', '').trim()
      if (val.length > 0) {
        overrides.startAt = val
      }
    } else if (trimmed.startsWith('style')) {
      const styleStr = trimmed.replace('style', '').trim()
      const parsed = parseStyleString(styleStr)
      if (parsed) {
        overrides.levelStyles = parsed
      }
    } else if (trimmed.startsWith('sep')) {
      // sep "." or sep :  or sep " —"
      let sepVal = trimmed.replace('sep', '').trim()
      // Remove surrounding quotes if present
      if ((sepVal.startsWith('"') && sepVal.endsWith('"')) ||
          (sepVal.startsWith("'") && sepVal.endsWith("'"))) {
        sepVal = sepVal.slice(1, -1)
      }
      if (isValidSeparator(sepVal)) {
        overrides.separator = sepVal
      }
    } else if (trimmed.startsWith('format')) {
      let fmtVal = trimmed.replace('format', '').trim()
      if ((fmtVal.startsWith('"') && fmtVal.endsWith('"')) ||
          (fmtVal.startsWith("'") && fmtVal.endsWith("'"))) {
        fmtVal = fmtVal.slice(1, -1)
      }
      if (fmtVal.includes('{n}')) {
        overrides.numberFormat = fmtVal
      }
    } else if (trimmed.startsWith('skip-marker')) {
      const val = trimmed.replace('skip-marker', '').trim()
      if (val.length > 0) {
        overrides.skipMarker = val
      }
    } else if (trimmed === 'indent') {
      overrides.headingIndent = true
    } else if (trimmed === 'no-indent') {
      overrides.headingIndent = false
    } else if (trimmed.startsWith('indent-size')) {
      const val = parseInt(trimmed.replace('indent-size', '').trim(), 10)
      if (!isNaN(val) && val >= 0 && val <= 60) {
        overrides.headingIndentSize = val
      }
    } else if (trimmed === 'indent-guides') {
      overrides.headingIndentGuides = true
    } else if (trimmed === 'no-indent-guides') {
      overrides.headingIndentGuides = false
    }
  }

  return Object.keys(overrides).length > 0 ? overrides : null
}

/**
 * Parse a style string like "1.A.a.1.1.1" into a 6-element array of styles.
 * Shorter strings are padded with the last specified style.
 */
function parseStyleString(
  styleStr: string,
): [NumberingStyle, NumberingStyle, NumberingStyle, NumberingStyle, NumberingStyle, NumberingStyle] | null {
  if (!styleStr || styleStr.length === 0) return null

  const parts = styleStr.split('.')
  const styles: NumberingStyle[] = []

  for (const p of parts) {
    const trimmed = p.trim()
    if (isValidNumberingStyle(trimmed)) {
      styles.push(trimmed)
    } else {
      // Invalid style character — abort
      return null
    }
  }

  if (styles.length === 0) return null

  // Pad to 6 levels using the last specified style
  const lastStyle = styles[styles.length - 1]
  while (styles.length < 6) {
    styles.push(lastStyle)
  }

  return styles.slice(0, 6) as [NumberingStyle, NumberingStyle, NumberingStyle, NumberingStyle, NumberingStyle, NumberingStyle]
}

/**
 * Serialize per-note settings to a front matter value string.
 */
export function settingsToFrontMatterValue(overrides: PerNoteOverrides): string {
  const parts: string[] = []

  if (overrides.disabled) return 'off'
  if (overrides.enabled) parts.push('auto')
  if (overrides.skipH1 === true) parts.push('skip-h1')
  if (overrides.skipH1 === false) parts.push('no-skip-h1')
  if (overrides.firstLevel !== undefined) parts.push(`first-level ${overrides.firstLevel}`)
  if (overrides.maxLevel !== undefined) parts.push(`max ${overrides.maxLevel}`)
  if (overrides.startAt !== undefined) parts.push(`start-at ${overrides.startAt}`)
  if (overrides.levelStyles) parts.push(`style ${overrides.levelStyles.join('.')}`)
  if (overrides.separator !== undefined) parts.push(`sep "${overrides.separator}"`)
  if (overrides.numberFormat !== undefined) parts.push(`format "${overrides.numberFormat}"`)
  if (overrides.skipMarker !== undefined) parts.push(`skip-marker ${overrides.skipMarker}`)
  if (overrides.headingIndent === true) parts.push('indent')
  if (overrides.headingIndent === false) parts.push('no-indent')
  if (overrides.headingIndentSize !== undefined) parts.push(`indent-size ${overrides.headingIndentSize}`)
  if (overrides.headingIndentGuides === true) parts.push('indent-guides')
  if (overrides.headingIndentGuides === false) parts.push('no-indent-guides')

  return parts.join(', ')
}
