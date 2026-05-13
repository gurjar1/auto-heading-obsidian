/**
 * Auto Heading — Settings Types & Defaults
 */

import { NumberingStyle } from '../core/numberingTokens'

// ─── Separator Types ──────────────────────────────────────────────────

export const VALID_SEPARATORS = ['', ' ', '.', ':', '-', '—', ')', ' .', ' :', ' -', ' —', ' )'] as const
export type SeparatorStyle = typeof VALID_SEPARATORS[number]

export function isValidSeparator(s: string): s is SeparatorStyle {
  return (VALID_SEPARATORS as readonly string[]).includes(s)
}

// ─── Mode ─────────────────────────────────────────────────────────────

/** How heading numbers are applied */
export type NumberingMode = 'burn-in' | 'decoration' | 'off'

// ─── Plugin Settings Interface ────────────────────────────────────────

export interface AutoHeadingSettings {
  /** Numbering mode: burn-in (writes to file), decoration (visual only), or off */
  mode: NumberingMode

  // ── Scope toggles (OR logic: any enabled condition matches) ──
  /** Number all notes in vault */
  scopeAll: boolean
  /** Number notes with auto-heading: auto in front matter */
  scopeFrontmatter: boolean
  /** Number notes in the selected folders/files */
  scopeSelected: boolean
  /** Folders/files to include when scopeSelected is true */
  scopePaths: string[]

  /** Delay before auto burn-in triggers (ms) */
  autoBurnInDelay: number

  /** Also show decorations in burn-in mode (for immediate feedback) */
  showDecorationsInBurnInMode: boolean

  // ── Numbering Options ────────────────────────────────────────
  skipH1: boolean
  firstLevel: number
  maxLevel: number
  levelStyles: [NumberingStyle, NumberingStyle, NumberingStyle, NumberingStyle, NumberingStyle, NumberingStyle]
  separator: SeparatorStyle
  levelSeparator: string
  startAt: string
  detectManualNumbers: boolean
  skipMarker: string
  numberOpacity: number
  showStatusBar: boolean
  numberFormat: string

  /** Legacy — kept for mergeSettings compatibility */
  enabled: boolean
}

// ─── Defaults ─────────────────────────────────────────────────────────

export const DEFAULT_SETTINGS: Readonly<AutoHeadingSettings> = {
  mode: 'burn-in',
  scopeAll: false,
  scopeFrontmatter: true,
  scopeSelected: false,
  scopePaths: [],
  autoBurnInDelay: 2000,
  showDecorationsInBurnInMode: true,

  skipH1: true,
  firstLevel: 2, // Consistent with skipH1: true
  maxLevel: 6,
  levelStyles: ['1', '1', '1', '1', '1', '1'],
  separator: '.',
  levelSeparator: '.',
  startAt: '1',
  detectManualNumbers: true,
  skipMarker: 'skip',
  numberOpacity: 0.7,
  showStatusBar: true,
  numberFormat: '{n}',

  enabled: false,
}

// ─── Per-Note Overrides ───────────────────────────────────────────────

export interface PerNoteOverrides {
  enabled?: boolean
  disabled?: boolean
  skipH1?: boolean
  firstLevel?: number
  maxLevel?: number
  levelStyles?: [NumberingStyle, NumberingStyle, NumberingStyle, NumberingStyle, NumberingStyle, NumberingStyle]
  separator?: SeparatorStyle
  levelSeparator?: string
  startAt?: string
  skipMarker?: string
  numberFormat?: string
}

export function mergeSettings(
  global: AutoHeadingSettings,
  overrides: PerNoteOverrides | null,
): AutoHeadingSettings {
  if (!overrides) return { ...global }

  const merged = { ...global }
  if (overrides.disabled === true) { merged.enabled = false; return merged }
  if (overrides.enabled !== undefined) merged.enabled = overrides.enabled
  if (overrides.skipH1 !== undefined) merged.skipH1 = overrides.skipH1
  if (overrides.firstLevel !== undefined) merged.firstLevel = overrides.firstLevel
  if (overrides.maxLevel !== undefined) merged.maxLevel = overrides.maxLevel
  if (overrides.levelStyles !== undefined) merged.levelStyles = [...overrides.levelStyles]
  if (overrides.separator !== undefined) merged.separator = overrides.separator
  if (overrides.levelSeparator !== undefined) merged.levelSeparator = overrides.levelSeparator
  if (overrides.startAt !== undefined) merged.startAt = overrides.startAt
  if (overrides.skipMarker !== undefined) merged.skipMarker = overrides.skipMarker
  if (overrides.numberFormat !== undefined) merged.numberFormat = overrides.numberFormat
  return merged
}
