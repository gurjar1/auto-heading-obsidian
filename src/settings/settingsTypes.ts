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

  // ── Visual Heading Indentation ───────────────────────────────
  /** Indent headings visually based on their level */
  headingIndent: boolean
  /** Pixels of indent per heading level */
  headingIndentSize: number
  /** Show subtle vertical guide lines alongside indented headings */
  headingIndentGuides: boolean

  // ── Heading Gutter (Cluster A) ──────────────────────────────
  /** Show interactive heading gutter with badges and fold chevrons */
  gutterEnabled: boolean
  /** Show H2/H3 level badge in gutter */
  gutterShowBadge: boolean
  /** Show word count in gutter hover tooltip */
  gutterShowWordCount: boolean

  // ── Section Navigation Strip (Cluster B) ─────────────────────
  /** Show section navigation strip at top of editor */
  stripEnabled: boolean
  /** Show heading breadcrumb trail */
  stripShowBreadcrumb: boolean
  /** How breadcrumbs update (cursor position or scroll position) */
  stripUpdateMode: 'cursor' | 'scroll'
  /** Show previous/next navigation arrows */
  stripShowNavArrows: boolean

  // ── Heading Inline Toolbar (Cluster C) ───────────────────────
  /** Show inline action toolbar on heading lines */
  toolbarEnabled: boolean
  /** Show promote/demote buttons in toolbar */
  toolbarShowPromote: boolean
  /** Show copy link button in toolbar */
  toolbarShowCopyLink: boolean
  /** Show format button in toolbar */
  toolbarShowFormat: boolean
  /** Show skip toggle button in toolbar */
  toolbarShowSkip: boolean

  // ── Fold Controls (Cluster F) ────────────────────────────────
  /** Show fold control buttons in editor view actions */
  foldButtonsEnabled: boolean

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

  headingIndent: false,
  headingIndentSize: 20,
  headingIndentGuides: false,

  // Heading Gutter defaults
  gutterEnabled: false,
  gutterShowBadge: true,
  gutterShowWordCount: true,

  // Section Strip defaults
  stripEnabled: false,
  stripShowBreadcrumb: true,
  stripUpdateMode: 'scroll',
  stripShowNavArrows: true,

  // Heading Toolbar defaults
  toolbarEnabled: true,
  toolbarShowPromote: true,
  toolbarShowCopyLink: true,
  toolbarShowFormat: true,
  toolbarShowSkip: true,

  // Fold Controls defaults
  foldButtonsEnabled: true,

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
  headingIndent?: boolean
  headingIndentSize?: number
  headingIndentGuides?: boolean
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
  if (overrides.headingIndent !== undefined) merged.headingIndent = overrides.headingIndent
  if (overrides.headingIndentSize !== undefined) merged.headingIndentSize = overrides.headingIndentSize
  if (overrides.headingIndentGuides !== undefined) merged.headingIndentGuides = overrides.headingIndentGuides
  return merged
}
